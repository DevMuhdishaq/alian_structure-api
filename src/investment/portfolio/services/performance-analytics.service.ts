import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PerformanceMetric } from "../entities/performance-metric.entity";
import { Portfolio } from "../entities/portfolio.entity";
import { AssetType } from "../entities/portfolio-asset.entity";
import { PerformanceCalculations } from "../algorithms/performance-calculations";
import {
  CalculatePerformanceDto,
  PortfolioPerformanceDto,
  PerformanceResponseDto,
  AllocationResponseDto,
  ComparisonResponseDto,
  TimeRange,
} from "../dto/performance.dto";

@Injectable()
export class PerformanceAnalyticsService {
  private readonly logger = new Logger(PerformanceAnalyticsService.name);

  constructor(
    @InjectRepository(PerformanceMetric)
    private metricRepository: Repository<PerformanceMetric>,
    @InjectRepository(Portfolio)
    private portfolioRepository: Repository<Portfolio>,
  ) {}

  /**
   * Get the current total value of a portfolio.
   */
  async getPortfolioValue(
    portfolioId: string,
  ): Promise<{ totalValue: number }> {
    const portfolio = await this.portfolioRepository.findOne({
      where: { id: portfolioId },
      relations: ["assets"],
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    const totalValue = PerformanceCalculations.sum(
      (portfolio.assets || []).map((a) => Number(a.value) || 0),
    );

    return { totalValue };
  }

  /**
   * Map a granular asset type onto a high-level allocation category.
   */
  private mapAssetTypeToCategory(type: AssetType): string {
    switch (type) {
      case AssetType.CRYPTOCURRENCY:
        return "crypto";
      case AssetType.STOCK:
      case AssetType.ETF:
      case AssetType.MUTUAL_FUND:
        return "stocks";
      case AssetType.COMMODITY:
        return "commodities";
      case AssetType.BOND:
        return "bonds";
      case AssetType.REAL_ESTATE:
        return "real_estate";
      default:
        return "other";
    }
  }

  /**
   * Compute a comprehensive set of portfolio performance metrics:
   * total value, ROI, allocation by asset and category, time-weighted return,
   * Sharpe ratio, max drawdown and (optionally) benchmark comparison.
   */
  async calculatePerformance(
    portfolioId: string,
    dto: CalculatePerformanceDto = {},
  ): Promise<PortfolioPerformanceDto> {
    const portfolio = await this.portfolioRepository.findOne({
      where: { id: portfolioId },
      relations: ["assets"],
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    const assets = portfolio.assets || [];
    const riskFreeRate = dto.riskFreeRate ?? 0.02;
    const periodsPerYear =
      dto.periodsPerYear ?? PerformanceCalculations.TRADING_DAYS_PER_YEAR;

    // Total value and cost basis (decimal columns deserialize as strings).
    const totalValue = PerformanceCalculations.sum(
      assets.map((a) => Number(a.value) || 0),
    );
    const totalCostBasis = PerformanceCalculations.sum(
      assets.map((a) => Number(a.costBasis) || 0),
    );
    const roi = PerformanceCalculations.roi(totalValue, totalCostBasis);

    // Allocation by asset.
    const assetAmounts: Record<string, number> = {};
    for (const a of assets) {
      assetAmounts[a.ticker] =
        (assetAmounts[a.ticker] || 0) + (Number(a.value) || 0);
    }
    const allocationByAsset =
      PerformanceCalculations.allocationPercentages(assetAmounts);

    // Allocation by category (crypto, stocks, commodities, ...).
    const categoryAmounts: Record<string, number> = {};
    for (const a of assets) {
      const category = this.mapAssetTypeToCategory(a.type);
      categoryAmounts[category] =
        (categoryAmounts[category] || 0) + (Number(a.value) || 0);
    }
    const allocationByCategory =
      PerformanceCalculations.allocationPercentages(categoryAmounts);

    // Historical value series for time-series metrics.
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "ASC" },
    });
    const values = metrics.map((m) => Number(m.portfolioValue));
    const returns = PerformanceCalculations.simpleReturns(values);

    const timeWeightedReturn =
      PerformanceCalculations.timeWeightedReturn(returns);
    const volatility = PerformanceCalculations.annualizedVolatility(
      returns,
      periodsPerYear,
    );
    const sharpeRatio = PerformanceCalculations.sharpeRatio(
      returns,
      riskFreeRate,
      periodsPerYear,
    );
    const maxDrawdown = PerformanceCalculations.maxDrawdown(values);

    let benchmark: PortfolioPerformanceDto["benchmark"];
    if (dto.benchmarkReturns && dto.benchmarkReturns.length >= 2) {
      benchmark = PerformanceCalculations.benchmarkComparison(
        returns,
        dto.benchmarkReturns,
        riskFreeRate,
        periodsPerYear,
      );
    }

    return {
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
      totalValue,
      totalCostBasis,
      roi,
      allocationByAsset,
      allocationByCategory,
      timeWeightedReturn,
      sharpeRatio,
      volatility,
      maxDrawdown,
      benchmark,
      dataPoints: values.length,
      calculatedAt: new Date(),
    };
  }

  /**
   * Append a performance snapshot for a portfolio, deriving the previous value
   * and daily return from the most recent recorded metric. Called whenever a
   * portfolio's value/allocation changes so history stays current.
   */
  async recordSnapshot(
    portfolioId: string,
    portfolioValue: number,
    allocation: Record<string, number>,
  ): Promise<PerformanceMetric> {
    const last = await this.metricRepository.findOne({
      where: { portfolioId },
      order: { dateTime: "DESC" },
    });

    const previousValue = last ? Number(last.portfolioValue) : undefined;

    return this.recordMetrics(
      portfolioId,
      portfolioValue,
      allocation,
      previousValue,
    );
  }

  /**
   * Record performance metrics for a portfolio
   */
  async recordMetrics(
    portfolioId: string,
    portfolioValue: number,
    allocation: Record<string, number>,
    previousValue?: number,
  ): Promise<PerformanceMetric> {
    const dailyReturn =
      previousValue && previousValue > 0
        ? (portfolioValue - previousValue) / previousValue
        : 0;

    const metric = this.metricRepository.create({
      portfolioId,
      dateTime: new Date(),
      portfolioValue,
      previousValue,
      dailyReturn,
      allocation,
    });

    return this.metricRepository.save(metric);
  }

  /**
   * Calculate cumulative return
   */
  async calculateCumulativeReturn(
    portfolioId: string,
    startDate?: Date,
  ): Promise<number> {
    let query = this.metricRepository.createQueryBuilder();

    query = query
      .where("metric.portfolioId = :portfolioId", {
        portfolioId,
      })
      .orderBy("metric.dateTime", "ASC");

    if (startDate) {
      query = query.andWhere("metric.dateTime >= :startDate", { startDate });
    }

    const metrics = await query.getMany();

    if (metrics.length < 2) return 0;

    const firstValue = metrics[0].portfolioValue;
    const lastValue = metrics[metrics.length - 1].portfolioValue;

    return (lastValue - firstValue) / firstValue;
  }

  /**
   * Calculate volatility (standard deviation of returns)
   */
  async calculateVolatility(
    portfolioId: string,
    days: number = 252,
  ): Promise<number> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "DESC" },
      take: days + 1,
    });

    if (metrics.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 0; i < metrics.length - 1; i++) {
      const ret =
        (metrics[i].portfolioValue - metrics[i + 1].portfolioValue) /
        metrics[i + 1].portfolioValue;
      returns.push(ret);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, ret) => sum + (ret - mean) ** 2, 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // Annualize
    return volatility * Math.sqrt(252);
  }

  /**
   * Calculate Sharpe ratio
   */
  async calculateSharpeRatio(
    portfolioId: string,
    riskFreeRate: number = 0.02,
  ): Promise<number> {
    const cumulativeReturn = await this.calculateCumulativeReturn(portfolioId);
    const volatility = await this.calculateVolatility(portfolioId);

    if (volatility === 0) return 0;

    return (cumulativeReturn - riskFreeRate) / volatility || 0;
  }

  /**
   * Calculate Sortino ratio (downside deviation)
   */
  async calculateSortinoRatio(
    portfolioId: string,
    targetReturn: number = 0,
    riskFreeRate: number = 0.02,
  ): Promise<number> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "ASC" },
      take: 252,
    });

    const downreturns: number[] = [];

    for (let i = 0; i < metrics.length - 1; i++) {
      const ret =
        (metrics[i + 1].portfolioValue - metrics[i].portfolioValue) /
        metrics[i].portfolioValue;

      if (ret < targetReturn) {
        downreturns.push(ret - targetReturn);
      }
    }

    if (downreturns.length === 0) return 0;

    const downsideDeviation = Math.sqrt(
      downreturns.reduce((sum, ret) => sum + ret ** 2, 0) / downreturns.length,
    );

    const cumulativeReturn = await this.calculateCumulativeReturn(portfolioId);

    if (downsideDeviation === 0) return 0;

    return (cumulativeReturn - riskFreeRate) / downsideDeviation;
  }

  /**
   * Calculate maximum drawdown
   */
  async calculateMaxDrawdown(portfolioId: string): Promise<number> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "ASC" },
    });

    if (metrics.length === 0) return 0;

    let maxValue = metrics[0].portfolioValue;
    let maxDrawdown = 0;

    for (const metric of metrics) {
      if (metric.portfolioValue > maxValue) {
        maxValue = metric.portfolioValue;
      }

      const drawdown = (maxValue - metric.portfolioValue) / maxValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Calculate Value at Risk (parametric)
   */
  async calculateVaR(
    portfolioId: string,
    confidence: number = 0.95,
  ): Promise<number> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "DESC" },
      take: 252,
    });

    const returns: number[] = [];
    for (let i = 0; i < metrics.length - 1; i++) {
      const ret =
        (metrics[i].portfolioValue - metrics[i + 1].portfolioValue) /
        metrics[i + 1].portfolioValue;
      returns.push(ret);
    }

    returns.sort((a, b) => a - b);
    const index = Math.floor(returns.length * (1 - confidence));

    return returns[index] || 0;
  }

  /**
   * Calculate Calmar ratio
   */
  async calculateCalmarRatio(portfolioId: string): Promise<number> {
    const cumulativeReturn = await this.calculateCumulativeReturn(portfolioId);
    const maxDrawdown = await this.calculateMaxDrawdown(portfolioId);

    if (maxDrawdown === 0) return 0;

    return cumulativeReturn / Math.abs(maxDrawdown);
  }

  /**
   * Get performance summary
   */
  async getPerformanceSummary(
    portfolioId: string,
    startDate?: Date,
  ): Promise<any> {
    const [
      cumulativeReturn,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      calmarRatio,
    ] = await Promise.all([
      this.calculateCumulativeReturn(portfolioId, startDate),
      this.calculateVolatility(portfolioId),
      this.calculateSharpeRatio(portfolioId),
      this.calculateSortinoRatio(portfolioId),
      this.calculateMaxDrawdown(portfolioId),
      this.calculateCalmarRatio(portfolioId),
    ]);

    return {
      cumulativeReturn,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      calmarRatio,
    };
  }

  /**
   * Get metrics for date range
   */
  async getMetricsForDateRange(
    portfolioId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PerformanceMetric[]> {
    return this.metricRepository.find({
      where: {
        portfolioId,
      },
      order: { dateTime: "ASC" },
    });
  }

  /**
   * Calculate attribution analysis
   */
  async getAttributionAnalysis(
    portfolioId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, number>> {
    const metrics = await this.metricRepository.find({
      where: { portfolioId },
      order: { dateTime: "ASC" },
    });

    const attribution: Record<string, number> = {};

    for (const metric of metrics) {
      if (metric.assetContribution) {
        for (const [asset, contribution] of Object.entries(
          metric.assetContribution,
        )) {
          attribution[asset] =
            (attribution[asset] || 0) + (contribution as number);
        }
      }
    }

    return attribution;
  }

  private getStartDateFromTimeRange(timeRange: TimeRange): Date {
    const now = new Date();
    switch (timeRange) {
      case TimeRange.ONE_MONTH:
        return new Date(now.setMonth(now.getMonth() - 1));
      case TimeRange.THREE_MONTHS:
        return new Date(now.setMonth(now.getMonth() - 3));
      case TimeRange.SIX_MONTHS:
        return new Date(now.setMonth(now.getMonth() - 6));
      case TimeRange.ONE_YEAR:
        return new Date(now.setFullYear(now.getFullYear() - 1));
      case TimeRange.ALL:
      default:
        return new Date(0);
    }
  }

  async getPortfolioPerformance(
    portfolioId: string,
    timeRange: TimeRange,
  ): Promise<PerformanceResponseDto> {
    const startDate = this.getStartDateFromTimeRange(timeRange);
    const [portfolio, returnPercentage, volatility, sharpeRatio, maxDrawdown] =
      await Promise.all([
        this.portfolioRepository.findOneBy({ id: portfolioId }),
        this.calculateCumulativeReturn(portfolioId, startDate),
        this.calculateVolatility(portfolioId),
        this.calculateSharpeRatio(portfolioId),
        this.calculateMaxDrawdown(portfolioId),
      ]);

    const totalValue =
      portfolio?.assets?.reduce(
        (sum, asset) => sum + asset.quantity * asset.currentPrice,
        0,
      ) || 0;
    const now = new Date();

    return {
      portfolioId,
      timeRange,
      totalValue,
      returnPercentage,
      volatility,
      sharpeRatio,
      maxDrawdown,
      timestamp: now,
      calculationDate: now,
    };
  }

  async getPortfolioAllocation(
    portfolioId: string,
  ): Promise<AllocationResponseDto> {
    const portfolio = await this.portfolioRepository.findOne({
      where: { id: portfolioId },
      relations: ["assets"],
    });

    const totalValue =
      portfolio?.assets?.reduce(
        (sum, asset) => sum + asset.quantity * asset.currentPrice,
        0,
      ) || 0;
    const assets =
      portfolio?.assets?.map((asset) => ({
        ticker: asset.ticker,
        name: asset.name,
        quantity: asset.quantity,
        currentPrice: asset.currentPrice,
        value: asset.quantity * asset.currentPrice,
        percentage:
          totalValue > 0
            ? (asset.quantity * asset.currentPrice) / totalValue
            : 0,
      })) || [];
    const now = new Date();

    return {
      portfolioId,
      assets,
      timestamp: now,
      calculationDate: now,
    };
  }

  async getPerformanceHistory(
    portfolioId: string,
    timeRange: TimeRange,
  ): Promise<Array<{ date: Date; value: number; return: number }>> {
    const startDate = this.getStartDateFromTimeRange(timeRange);
    const metrics = await this.metricRepository.find({
      where: {
        portfolioId,
        dateTime: startDate ? ({ $gte: startDate } as any) : undefined,
      },
      order: { dateTime: "ASC" },
    });

    if (metrics.length === 0) return [];

    const firstValue = metrics[0].portfolioValue;
    return metrics.map((metric) => ({
      date: metric.dateTime,
      value: metric.portfolioValue,
      return: (metric.portfolioValue - firstValue) / firstValue,
    }));
  }

  async getBenchmarkComparison(
    portfolioId: string,
    timeRange: TimeRange,
  ): Promise<ComparisonResponseDto> {
    const portfolioReturn = await this.calculateCumulativeReturn(
      portfolioId,
      this.getStartDateFromTimeRange(timeRange),
    );
    const benchmarkReturn = 0.08; // 8% annual benchmark return (placeholder)
    const now = new Date();

    return {
      portfolioId,
      timeRange,
      portfolioReturn,
      benchmarkReturn,
      outperformance: portfolioReturn - benchmarkReturn,
      timestamp: now,
      calculationDate: now,
    };
  }
}



