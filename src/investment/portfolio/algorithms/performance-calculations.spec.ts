import { PerformanceCalculations } from "./performance-calculations";

describe("PerformanceCalculations", () => {
  describe("sum / total value", () => {
    it("sums asset values", () => {
      expect(PerformanceCalculations.sum([100, 200, 300])).toBe(600);
    });

    it("returns 0 for an empty portfolio", () => {
      expect(PerformanceCalculations.sum([])).toBe(0);
    });

    it("ignores nullish entries", () => {
      expect(
        PerformanceCalculations.sum([100, undefined as any, null as any, 50]),
      ).toBe(150);
    });
  });

  describe("roi", () => {
    it("computes a positive ROI", () => {
      expect(PerformanceCalculations.roi(150, 100)).toBeCloseTo(0.5, 10);
    });

    it("computes a negative ROI", () => {
      expect(PerformanceCalculations.roi(80, 100)).toBeCloseTo(-0.2, 10);
    });

    it("returns 0 when there is no cost basis", () => {
      expect(PerformanceCalculations.roi(100, 0)).toBe(0);
      expect(PerformanceCalculations.roi(100, undefined as any)).toBe(0);
    });
  });

  describe("allocationPercentages", () => {
    it("converts amounts to percentages summing to 100", () => {
      const result = PerformanceCalculations.allocationPercentages({
        A: 100,
        B: 300,
      });
      expect(result.A).toBeCloseTo(25, 10);
      expect(result.B).toBeCloseTo(75, 10);
      expect(result.A + result.B).toBeCloseTo(100, 10);
    });

    it("returns an empty map for an empty portfolio", () => {
      expect(PerformanceCalculations.allocationPercentages({})).toEqual({});
    });

    it("returns an empty map when the total is zero", () => {
      expect(
        PerformanceCalculations.allocationPercentages({ A: 0, B: 0 }),
      ).toEqual({});
    });

    it("handles a single asset (100%)", () => {
      expect(
        PerformanceCalculations.allocationPercentages({ ONLY: 42 }),
      ).toEqual({ ONLY: 100 });
    });
  });

  describe("simpleReturns", () => {
    it("computes period-over-period returns", () => {
      const returns = PerformanceCalculations.simpleReturns([100, 110, 121]);
      expect(returns).toHaveLength(2);
      expect(returns[0]).toBeCloseTo(0.1, 10);
      expect(returns[1]).toBeCloseTo(0.1, 10);
    });

    it("handles a drop to zero", () => {
      expect(PerformanceCalculations.simpleReturns([100, 0])).toEqual([-1]);
    });

    it("treats a zero starting value as a 0 return", () => {
      expect(PerformanceCalculations.simpleReturns([0, 100])).toEqual([0]);
    });

    it("returns an empty array for a single data point", () => {
      expect(PerformanceCalculations.simpleReturns([100])).toEqual([]);
    });
  });

  describe("subPeriodReturn", () => {
    it("computes a plain sub-period return", () => {
      expect(PerformanceCalculations.subPeriodReturn(100, 110)).toBeCloseTo(
        0.1,
        10,
      );
    });

    it("neutralises an end-of-period cash flow", () => {
      expect(PerformanceCalculations.subPeriodReturn(100, 120, 10)).toBeCloseTo(
        0.1,
        10,
      );
    });

    it("returns 0 when the start value is zero", () => {
      expect(PerformanceCalculations.subPeriodReturn(0, 100)).toBe(0);
    });
  });

  describe("timeWeightedReturn", () => {
    it("geometrically links sub-period returns", () => {
      // 1.1 * 1.1 - 1 = 0.21
      expect(
        PerformanceCalculations.timeWeightedReturn([0.1, 0.1]),
      ).toBeCloseTo(0.21, 10);
    });

    it("handles gains followed by losses", () => {
      // 1.5 * 0.5 - 1 = -0.25
      expect(
        PerformanceCalculations.timeWeightedReturn([0.5, -0.5]),
      ).toBeCloseTo(-0.25, 10);
    });

    it("returns 0 for an empty series", () => {
      expect(PerformanceCalculations.timeWeightedReturn([])).toBe(0);
    });
  });

  describe("mean / variance / standardDeviation", () => {
    it("computes the arithmetic mean", () => {
      expect(PerformanceCalculations.mean([1, 2, 3, 4])).toBe(2.5);
    });

    it("returns 0 mean for an empty list", () => {
      expect(PerformanceCalculations.mean([])).toBe(0);
    });

    it("computes population variance and std dev", () => {
      // [1,2,3,4,5] -> popVar 2, popStd sqrt(2)
      expect(
        PerformanceCalculations.variance([1, 2, 3, 4, 5], false),
      ).toBeCloseTo(2, 10);
      expect(
        PerformanceCalculations.standardDeviation([1, 2, 3, 4, 5], false),
      ).toBeCloseTo(Math.sqrt(2), 10);
    });

    it("computes sample variance and std dev by default", () => {
      // [1,2,3,4,5] -> sampleVar 2.5
      expect(PerformanceCalculations.variance([1, 2, 3, 4, 5])).toBeCloseTo(
        2.5,
        10,
      );
      expect(
        PerformanceCalculations.standardDeviation([1, 2, 3, 4, 5]),
      ).toBeCloseTo(Math.sqrt(2.5), 10);
    });

    it("returns 0 variance for fewer than two sample points", () => {
      expect(PerformanceCalculations.variance([5])).toBe(0);
    });
  });

  describe("annualizedVolatility", () => {
    it("equals the std dev when periodsPerYear is 1", () => {
      const returns = [0.1, -0.1, 0.1, -0.1];
      expect(
        PerformanceCalculations.annualizedVolatility(returns, 1),
      ).toBeCloseTo(PerformanceCalculations.standardDeviation(returns), 10);
    });

    it("scales by sqrt(periodsPerYear)", () => {
      const returns = [0.1, -0.1, 0.1, -0.1];
      const std = PerformanceCalculations.standardDeviation(returns);
      expect(
        PerformanceCalculations.annualizedVolatility(returns, 252),
      ).toBeCloseTo(std * Math.sqrt(252), 10);
    });

    it("returns 0 for fewer than two returns", () => {
      expect(PerformanceCalculations.annualizedVolatility([0.1])).toBe(0);
    });
  });

  describe("sharpeRatio", () => {
    it("computes an annualized Sharpe ratio with zero risk-free rate", () => {
      const returns = [0.01, 0.02, 0.01, 0.02];
      // mean 0.015, sampleStd sqrt(0.0001/3); ppy 1, rf 0 -> mean/std
      const expected =
        PerformanceCalculations.mean(returns) /
        PerformanceCalculations.standardDeviation(returns);
      expect(PerformanceCalculations.sharpeRatio(returns, 0, 1)).toBeCloseTo(
        expected,
        8,
      );
    });

    it("honours a configurable risk-free rate", () => {
      const returns = [0.01, 0.02, 0.01, 0.02];
      // rf per period == mean -> excess 0 -> sharpe 0
      expect(
        PerformanceCalculations.sharpeRatio(returns, 0.015, 1),
      ).toBeCloseTo(0, 10);
    });

    it("returns 0 when volatility is zero", () => {
      expect(PerformanceCalculations.sharpeRatio([0.01, 0.01], 0, 1)).toBe(0);
    });

    it("returns 0 for fewer than two returns", () => {
      expect(PerformanceCalculations.sharpeRatio([0.01])).toBe(0);
    });
  });

  describe("maxDrawdown", () => {
    it("identifies the largest peak-to-trough decline", () => {
      const result = PerformanceCalculations.maxDrawdown([
        100, 120, 90, 110, 80, 130,
      ]);
      expect(result.maxDrawdown).toBeCloseTo(1 / 3, 10);
      expect(result.peakIndex).toBe(1);
      expect(result.troughIndex).toBe(4);
      expect(result.peakValue).toBe(120);
      expect(result.troughValue).toBe(80);
    });

    it("returns 0 for a monotonically increasing series", () => {
      expect(
        PerformanceCalculations.maxDrawdown([100, 110, 120]).maxDrawdown,
      ).toBe(0);
    });

    it("returns 0 for a single data point", () => {
      expect(PerformanceCalculations.maxDrawdown([100]).maxDrawdown).toBe(0);
    });

    it("returns a safe zero result for an empty series", () => {
      const result = PerformanceCalculations.maxDrawdown([]);
      expect(result.maxDrawdown).toBe(0);
      expect(result.peakValue).toBe(0);
    });
  });

  describe("covariance", () => {
    it("computes positive sample covariance", () => {
      expect(
        PerformanceCalculations.covariance([1, 2, 3], [1, 2, 3]),
      ).toBeCloseTo(1, 10);
    });

    it("computes negative covariance for inverse series", () => {
      expect(
        PerformanceCalculations.covariance([1, 2, 3], [3, 2, 1]),
      ).toBeCloseTo(-1, 10);
    });

    it("returns 0 for fewer than two points", () => {
      expect(PerformanceCalculations.covariance([1], [1])).toBe(0);
    });
  });

  describe("benchmarkComparison", () => {
    it("returns beta 1 and zero alpha/tracking error for identical series", () => {
      const series = [0.01, 0.02, 0.03, 0.02];
      const result = PerformanceCalculations.benchmarkComparison(
        series,
        series,
        0.02,
        252,
      );
      expect(result.beta).toBeCloseTo(1, 10);
      expect(result.correlation).toBeCloseTo(1, 10);
      expect(result.alpha).toBeCloseTo(0, 10);
      expect(result.trackingError).toBeCloseTo(0, 10);
      expect(result.informationRatio).toBe(0);
      expect(result.excessReturn).toBeCloseTo(0, 10);
    });

    it("computes a beta of 2 for a doubled series", () => {
      const benchmark = [0.01, 0.02, 0.03];
      const portfolio = [0.02, 0.04, 0.06];
      const result = PerformanceCalculations.benchmarkComparison(
        portfolio,
        benchmark,
      );
      expect(result.beta).toBeCloseTo(2, 10);
      expect(result.correlation).toBeCloseTo(1, 10);
    });

    it("returns zeros when there is insufficient data", () => {
      const result = PerformanceCalculations.benchmarkComparison(
        [0.01],
        [0.01],
      );
      expect(result).toEqual({
        excessReturn: 0,
        beta: 0,
        alpha: 0,
        correlation: 0,
        trackingError: 0,
        informationRatio: 0,
      });
    });
  });
});



