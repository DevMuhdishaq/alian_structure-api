import {
  IsOptional,
  IsNumber,
  IsDateString,
  IsArray,
  IsEnum,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

export enum TimeRange {
  ONE_MONTH = "1m",
  THREE_MONTHS = "3m",
  SIX_MONTHS = "6m",
  ONE_YEAR = "1y",
  ALL = "all",
}

export class TimeRangeDto {
  @IsOptional()
  @IsEnum(TimeRange)
  timeRange?: TimeRange;
}

export class GetPerformanceMetricsDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;
}

export class PerformanceMetricResponseDto {
  id: string;
  dateTime: Date;
  portfolioValue: number;
  dailyReturn?: number;
  cumulativeReturn?: number;
  yearToDateReturn?: number;
  oneYearReturn?: number;
  volatility?: number;
  sharpeRatio?: number;
  sortinoRatio?: number;
  maxDrawdown?: number;
  currentDrawdown?: number;
  valueAtRisk95?: number;
  allocation?: Record<string, number>;
  assetContribution?: Record<string, number>;
  riskContribution?: Record<string, number>;
}

export class CalculatePerformanceDto {
  /** Annual risk-free rate (fraction, e.g. 0.02 for 2%) used by the Sharpe ratio. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  riskFreeRate?: number;

  /** Optional benchmark return series (fractions) for comparison metrics. */
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsNumber({}, { each: true })
  benchmarkReturns?: number[];

  /** Number of return periods per year for annualisation (default 252). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  periodsPerYear?: number;
}

export interface BenchmarkComparisonResultDto {
  excessReturn: number;
  beta: number;
  alpha: number;
  correlation: number;
  trackingError: number;
  informationRatio: number;
}

export interface MaxDrawdownResultDto {
  maxDrawdown: number;
  peakIndex: number;
  troughIndex: number;
  peakValue: number;
  troughValue: number;
}

export class PortfolioPerformanceDto {
  portfolioId: string;
  portfolioName: string;
  /** Total current portfolio value (sum of asset values). */
  totalValue: number;
  /** Total cost basis across assets. */
  totalCostBasis: number;
  /** Return on investment as a fraction (0.1 === 10%). */
  roi: number;
  /** Allocation percentage by asset ticker (sums to 100). */
  allocationByAsset: Record<string, number>;
  /** Allocation percentage by category: crypto, stocks, commodities, etc. */
  allocationByCategory: Record<string, number>;
  /** Time-weighted return over recorded history (fraction). */
  timeWeightedReturn: number;
  /** Annualised Sharpe ratio (using the supplied risk-free rate). */
  sharpeRatio: number;
  /** Annualised volatility of historical returns. */
  volatility: number;
  /** Maximum peak-to-trough drawdown over recorded history. */
  maxDrawdown: MaxDrawdownResultDto;
  /** Benchmark comparison, present only when benchmark data is supplied. */
  benchmark?: BenchmarkComparisonResultDto;
  /** Number of historical snapshots used for time-series metrics. */
  dataPoints: number;
  calculatedAt: Date;
}

export class PortfolioSummaryDto {
  portfolioId: string;
  portfolioName: string;
  totalValue: number;
  currentAllocation: Record<string, number>;
  targetAllocation?: Record<string, number>;
  assetCount: number;
  dayReturn?: number;
  yearToDateReturn?: number;
  oneYearReturn?: number;
  volatility?: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  lastRebalanceDate?: Date;
  nextRebalanceDate?: Date;
}

export class PerformanceResponseDto {
  portfolioId: string;
  timeRange: TimeRange;
  totalValue: number;
  returnPercentage: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  timestamp: Date;
  calculationDate: Date;
}

export class AllocationResponseDto {
  portfolioId: string;
  assets: Array<{
    ticker: string;
    name: string;
    quantity: number;
    currentPrice: number;
    value: number;
    percentage: number;
  }>;
  timestamp: Date;
  calculationDate: Date;
}

export class ComparisonResponseDto {
  portfolioId: string;
  timeRange: TimeRange;
  portfolioReturn: number;
  benchmarkReturn: number;
  outperformance: number;
  timestamp: Date;
  calculationDate: Date;
}



