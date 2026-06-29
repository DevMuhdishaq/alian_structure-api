/**
 * Pure, dependency-free portfolio performance calculations.
 *
 * Every method here is deterministic and side-effect free so that the
 * individual metrics can be unit-tested against known, hand-verified results.
 * Higher layers (PerformanceAnalyticsService) are responsible for loading data
 * and mapping it onto these primitives.
 */

export interface MaxDrawdownResult {
  /** Largest peak-to-trough decline as a positive fraction (0.2 === 20%). */
  maxDrawdown: number;
  peakIndex: number;
  troughIndex: number;
  peakValue: number;
  troughValue: number;
}

export interface BenchmarkComparisonResult {
  /** Cumulative portfolio return minus cumulative benchmark return. */
  excessReturn: number;
  /** Sensitivity of portfolio returns to benchmark returns. */
  beta: number;
  /** Annualised Jensen's alpha. */
  alpha: number;
  /** Correlation of portfolio and benchmark returns (-1..1). */
  correlation: number;
  /** Annualised standard deviation of the return differences. */
  trackingError: number;
  /** Annualised excess return divided by tracking error. */
  informationRatio: number;
}

export class PerformanceCalculations {
  /** Trading days in a year – default annualisation factor. */
  static readonly TRADING_DAYS_PER_YEAR = 252;

  /**
   * Sum of a list of values (e.g. total portfolio value from asset values).
   */
  static sum(values: number[]): number {
    return values.reduce((acc, v) => acc + (v || 0), 0);
  }

  /**
   * Return on Investment as a fraction. ROI = (current - cost) / cost.
   * Returns 0 when there is no cost basis to avoid division by zero.
   */
  static roi(currentValue: number, costBasis: number): number {
    if (!costBasis || costBasis === 0) return 0;
    return (currentValue - costBasis) / costBasis;
  }

  /**
   * Convert a map of amounts into percentage weights that sum to 100.
   * An empty or zero-total input yields an empty map.
   */
  static allocationPercentages(
    amounts: Record<string, number>,
  ): Record<string, number> {
    const total = this.sum(Object.values(amounts));
    const result: Record<string, number> = {};

    if (total <= 0) return result;

    for (const [key, amount] of Object.entries(amounts)) {
      result[key] = ((amount || 0) / total) * 100;
    }

    return result;
  }

  /**
   * Period-over-period simple returns from a series of values.
   * A series of length n produces n-1 returns.
   */
  static simpleReturns(values: number[]): number[] {
    const returns: number[] = [];

    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1];
      if (prev === 0) {
        returns.push(0);
        continue;
      }
      returns.push((values[i] - prev) / prev);
    }

    return returns;
  }

  /**
   * Single sub-period return adjusted for an external cash flow occurring at
   * the end of the period. Used to neutralise deposits/withdrawals so that
   * time-weighted return reflects manager performance only.
   */
  static subPeriodReturn(
    startValue: number,
    endValue: number,
    cashFlow = 0,
  ): number {
    if (!startValue || startValue === 0) return 0;
    return (endValue - cashFlow - startValue) / startValue;
  }

  /**
   * Time-Weighted Return: geometrically links sub-period returns and removes
   * the distorting effect of cash flow timing.
   *   TWR = Π(1 + r_i) - 1
   */
  static timeWeightedReturn(periodReturns: number[]): number {
    if (periodReturns.length === 0) return 0;

    const product = periodReturns.reduce((acc, r) => acc * (1 + r), 1);
    return product - 1;
  }

  /** Arithmetic mean of a list of numbers. */
  static mean(values: number[]): number {
    if (values.length === 0) return 0;
    return this.sum(values) / values.length;
  }

  /**
   * Variance. Uses the sample estimator (n-1) by default; pass sample=false
   * for the population estimator (n).
   */
  static variance(values: number[], sample = true): number {
    const n = values.length;
    const divisor = sample ? n - 1 : n;
    if (n === 0 || divisor <= 0) return 0;

    const avg = this.mean(values);
    const sumSq = values.reduce((acc, v) => acc + (v - avg) ** 2, 0);
    return sumSq / divisor;
  }

  /** Standard deviation (sample by default). */
  static standardDeviation(values: number[], sample = true): number {
    return Math.sqrt(this.variance(values, sample));
  }

  /**
   * Annualised volatility from periodic returns.
   * volatility_annual = stdDev(periodReturns) * sqrt(periodsPerYear)
   */
  static annualizedVolatility(
    returns: number[],
    periodsPerYear: number = this.TRADING_DAYS_PER_YEAR,
    sample = true,
  ): number {
    if (returns.length < 2) return 0;
    return this.standardDeviation(returns, sample) * Math.sqrt(periodsPerYear);
  }

  /**
   * Annualised Sharpe ratio from periodic returns and an annual risk-free rate.
   *
   *   excessPerPeriod = mean(returns) - riskFreeRate / periodsPerYear
   *   sharpe = excessPerPeriod / stdDev(returns) * sqrt(periodsPerYear)
   *
   * @param riskFreeRate annual risk-free rate as a fraction (configurable).
   */
  static sharpeRatio(
    returns: number[],
    riskFreeRate = 0.02,
    periodsPerYear: number = this.TRADING_DAYS_PER_YEAR,
    sample = true,
  ): number {
    if (returns.length < 2) return 0;

    const stdDev = this.standardDeviation(returns, sample);
    if (stdDev === 0) return 0;

    const riskFreePerPeriod = riskFreeRate / periodsPerYear;
    const excessPerPeriod = this.mean(returns) - riskFreePerPeriod;

    return (excessPerPeriod / stdDev) * Math.sqrt(periodsPerYear);
  }

  /**
   * Maximum drawdown: the largest peak-to-trough decline over a value series,
   * expressed as a positive fraction, along with the peak/trough locations.
   */
  static maxDrawdown(values: number[]): MaxDrawdownResult {
    const empty: MaxDrawdownResult = {
      maxDrawdown: 0,
      peakIndex: 0,
      troughIndex: 0,
      peakValue: values[0] ?? 0,
      troughValue: values[0] ?? 0,
    };

    if (values.length === 0) return empty;

    let peakValue = values[0];
    let peakIndex = 0;
    let maxDrawdown = 0;
    let resultPeakIndex = 0;
    let resultTroughIndex = 0;
    let resultPeakValue = values[0];
    let resultTroughValue = values[0];

    for (let i = 0; i < values.length; i++) {
      if (values[i] > peakValue) {
        peakValue = values[i];
        peakIndex = i;
      }

      const drawdown = peakValue > 0 ? (peakValue - values[i]) / peakValue : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        resultPeakIndex = peakIndex;
        resultTroughIndex = i;
        resultPeakValue = peakValue;
        resultTroughValue = values[i];
      }
    }

    return {
      maxDrawdown,
      peakIndex: resultPeakIndex,
      troughIndex: resultTroughIndex,
      peakValue: resultPeakValue,
      troughValue: resultTroughValue,
    };
  }

  /** Sample/population covariance of two equal-length series. */
  static covariance(a: number[], b: number[], sample = true): number {
    const n = Math.min(a.length, b.length);
    const divisor = sample ? n - 1 : n;
    if (n === 0 || divisor <= 0) return 0;

    const meanA = this.mean(a.slice(0, n));
    const meanB = this.mean(b.slice(0, n));

    let sumProd = 0;
    for (let i = 0; i < n; i++) {
      sumProd += (a[i] - meanA) * (b[i] - meanB);
    }

    return sumProd / divisor;
  }

  /**
   * Compare portfolio returns against a benchmark return series of equal length.
   * Returns alpha, beta, correlation, tracking error and information ratio.
   */
  static benchmarkComparison(
    portfolioReturns: number[],
    benchmarkReturns: number[],
    riskFreeRate = 0.02,
    periodsPerYear: number = this.TRADING_DAYS_PER_YEAR,
  ): BenchmarkComparisonResult {
    const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
    const p = portfolioReturns.slice(0, n);
    const b = benchmarkReturns.slice(0, n);

    const empty: BenchmarkComparisonResult = {
      excessReturn: 0,
      beta: 0,
      alpha: 0,
      correlation: 0,
      trackingError: 0,
      informationRatio: 0,
    };

    if (n < 2) return empty;

    const benchVariance = this.variance(b);
    const cov = this.covariance(p, b);
    const beta = benchVariance === 0 ? 0 : cov / benchVariance;

    const stdP = this.standardDeviation(p);
    const stdB = this.standardDeviation(b);
    const correlation = stdP === 0 || stdB === 0 ? 0 : cov / (stdP * stdB);

    // Annualised arithmetic returns.
    const annualPortfolio = this.mean(p) * periodsPerYear;
    const annualBenchmark = this.mean(b) * periodsPerYear;

    // Jensen's alpha: actual minus CAPM-expected return.
    const alpha =
      annualPortfolio -
      (riskFreeRate + beta * (annualBenchmark - riskFreeRate));

    // Tracking error: annualised stdDev of return differences.
    const diffs = p.map((r, i) => r - b[i]);
    const trackingError =
      this.standardDeviation(diffs) * Math.sqrt(periodsPerYear);

    const informationRatio =
      trackingError === 0
        ? 0
        : (annualPortfolio - annualBenchmark) / trackingError;

    // Cumulative (time-weighted) excess return over the full window.
    const excessReturn =
      this.timeWeightedReturn(p) - this.timeWeightedReturn(b);

    return {
      excessReturn,
      beta,
      alpha,
      correlation,
      trackingError,
      informationRatio,
    };
  }
}



