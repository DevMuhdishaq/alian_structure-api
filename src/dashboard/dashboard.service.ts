import { Injectable } from "@nestjs/common";
import { PerformanceAnalyticsService } from "src/investment/portfolio/services/performance-analytics.service";
import { PortfolioService } from "src/investment/portfolio/services/portfolio.service";
import { RiskManagementService } from "src/investment/risk-management/risk-management.service";
import { TimeRange as PortfolioTimeRange } from "src/investment/portfolio/dto/performance.dto";

@Injectable()
export class DashboardService {
  constructor(
    private readonly performanceService: PerformanceAnalyticsService,
    private readonly portfolioService: PortfolioService,
    private readonly riskService: RiskManagementService,
  ) {}

  async getSummary(
    portfolioId: string,
    timeRange: PortfolioTimeRange = PortfolioTimeRange.ONE_YEAR,
  ) {
    const [totalValue, performance, allocation] = await Promise.all([
      this.performanceService.getPortfolioValue(portfolioId),
      this.performanceService.getPortfolioPerformance(portfolioId, timeRange),
      this.performanceService.getPortfolioAllocation(portfolioId),
    ]);

    return {
      totalValue: totalValue.totalValue,
      change: performance.returnPercentage,
      changePercent: performance.returnPercentage,
      allocation,
    };
  }

  async getPerformanceHistory(
    portfolioId: string,
    timeRange: PortfolioTimeRange = PortfolioTimeRange.ONE_YEAR,
  ) {
    return this.performanceService.getPerformanceHistory(
      portfolioId,
      timeRange,
    );
  }

  async getAllocation(portfolioId: string) {
    return this.performanceService.getPortfolioAllocation(portfolioId);
  }

  async getHoldings(portfolioId: string) {
    const portfolio = await this.portfolioService.getPortfolio(portfolioId);
    return portfolio.assets;
  }

  async getMovers(portfolioId: string) {
    const portfolio = await this.portfolioService.getPortfolio(portfolioId);
    const assets = portfolio.assets || [];

    const withPerformance = assets.map((asset) => {
      const change = asset.currentPrice - asset.costBasis;
      const changePercent = (change / asset.costBasis) * 100;
      return { ...asset, change, changePercent };
    });

    const sorted = withPerformance.sort(
      (a, b) => b.changePercent - a.changePercent,
    );

    return {
      top: sorted.slice(0, 5),
      bottom: sorted.slice(-5).reverse(),
    };
  }

  async getHealth(portfolioId: string) {
    const [diversification, riskScore] = await Promise.all([
      this.performanceService.getPortfolioAllocation(portfolioId),
      this.riskService.calculateRiskScore(portfolioId),
    ]);

    return {
      diversification,
      riskScore,
    };
  }
}



