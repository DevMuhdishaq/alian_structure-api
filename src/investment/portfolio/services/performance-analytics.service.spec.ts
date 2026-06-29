import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { PerformanceAnalyticsService } from "./performance-analytics.service";
import { PerformanceMetric } from "../entities/performance-metric.entity";
import { Portfolio } from "../entities/portfolio.entity";
import { AssetType } from "../entities/portfolio-asset.entity";

describe("PerformanceAnalyticsService", () => {
  let service: PerformanceAnalyticsService;
  let metricRepository: any;
  let portfolioRepository: any;

  const buildPortfolio = () => ({
    id: "pf-1",
    name: "Growth Portfolio",
    assets: [
      {
        ticker: "BTC",
        type: AssetType.CRYPTOCURRENCY,
        value: 5000,
        costBasis: 4000,
      },
      {
        ticker: "AAPL",
        type: AssetType.STOCK,
        value: 3000,
        costBasis: 3500,
      },
      {
        ticker: "GLD",
        type: AssetType.COMMODITY,
        value: 2000,
        costBasis: 1500,
      },
    ],
  });

  const historyMetrics = [
    { portfolioValue: 9000, dateTime: new Date("2026-01-01") },
    { portfolioValue: 9500, dateTime: new Date("2026-01-02") },
    { portfolioValue: 10000, dateTime: new Date("2026-01-03") },
  ];

  beforeEach(async () => {
    metricRepository = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: "m-1", ...data })),
      find: jest.fn().mockResolvedValue(historyMetrics),
      findOne: jest.fn().mockResolvedValue(null),
    };

    portfolioRepository = {
      findOne: jest.fn().mockResolvedValue(buildPortfolio()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceAnalyticsService,
        {
          provide: getRepositoryToken(PerformanceMetric),
          useValue: metricRepository,
        },
        {
          provide: getRepositoryToken(Portfolio),
          useValue: portfolioRepository,
        },
      ],
    }).compile();

    service = module.get<PerformanceAnalyticsService>(
      PerformanceAnalyticsService,
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("calculatePerformance", () => {
    it("computes total value, ROI and allocations", async () => {
      const result = await service.calculatePerformance("pf-1");

      expect(result.portfolioId).toBe("pf-1");
      expect(result.totalValue).toBe(10000);
      expect(result.totalCostBasis).toBe(9000);
      expect(result.roi).toBeCloseTo(1 / 9, 10);

      expect(result.allocationByAsset.BTC).toBeCloseTo(50, 10);
      expect(result.allocationByAsset.AAPL).toBeCloseTo(30, 10);
      expect(result.allocationByAsset.GLD).toBeCloseTo(20, 10);

      expect(result.allocationByCategory.crypto).toBeCloseTo(50, 10);
      expect(result.allocationByCategory.stocks).toBeCloseTo(30, 10);
      expect(result.allocationByCategory.commodities).toBeCloseTo(20, 10);
    });

    it("computes time-series metrics from recorded history", async () => {
      const result = await service.calculatePerformance("pf-1");

      expect(result.dataPoints).toBe(3);
      // Monotonic increase -> no drawdown.
      expect(result.maxDrawdown.maxDrawdown).toBe(0);
      expect(typeof result.sharpeRatio).toBe("number");
      expect(typeof result.volatility).toBe("number");
      expect(result.timeWeightedReturn).toBeCloseTo(10000 / 9000 - 1, 10);
    });

    it("uses a configurable risk-free rate for the Sharpe ratio", async () => {
      const low = await service.calculatePerformance("pf-1", {
        riskFreeRate: 0,
      });
      const high = await service.calculatePerformance("pf-1", {
        riskFreeRate: 0.9,
      });
      // A higher risk-free rate lowers the Sharpe ratio.
      expect(high.sharpeRatio).toBeLessThan(low.sharpeRatio);
    });

    it("includes benchmark comparison when benchmark returns are supplied", async () => {
      const result = await service.calculatePerformance("pf-1", {
        benchmarkReturns: [0.05, 0.05],
      });
      expect(result.benchmark).toBeDefined();
      expect(typeof result.benchmark!.beta).toBe("number");
    });

    it("omits benchmark comparison when none is supplied", async () => {
      const result = await service.calculatePerformance("pf-1");
      expect(result.benchmark).toBeUndefined();
    });

    it("maps every asset type onto an allocation category", async () => {
      portfolioRepository.findOne.mockResolvedValue({
        id: "pf-mixed",
        name: "Mixed",
        assets: [
          { ticker: "BTC", type: AssetType.CRYPTOCURRENCY, value: 100 },
          { ticker: "AAPL", type: AssetType.STOCK, value: 100 },
          { ticker: "SPY", type: AssetType.ETF, value: 100 },
          { ticker: "VFIAX", type: AssetType.MUTUAL_FUND, value: 100 },
          { ticker: "GLD", type: AssetType.COMMODITY, value: 100 },
          { ticker: "TLT", type: AssetType.BOND, value: 100 },
          { ticker: "VNQ", type: AssetType.REAL_ESTATE, value: 100 },
          { ticker: "MISC", type: AssetType.OTHER, value: 100 },
        ],
      });

      const result = await service.calculatePerformance("pf-mixed");

      // STOCK + ETF + MUTUAL_FUND collapse into "stocks".
      expect(result.allocationByCategory.stocks).toBeCloseTo(37.5, 10);
      expect(result.allocationByCategory.crypto).toBeCloseTo(12.5, 10);
      expect(result.allocationByCategory.commodities).toBeCloseTo(12.5, 10);
      expect(result.allocationByCategory.bonds).toBeCloseTo(12.5, 10);
      expect(result.allocationByCategory.real_estate).toBeCloseTo(12.5, 10);
      expect(result.allocationByCategory.other).toBeCloseTo(12.5, 10);
    });

    it("handles an empty portfolio with no history", async () => {
      portfolioRepository.findOne.mockResolvedValue({
        id: "pf-empty",
        name: "Empty",
        assets: [],
      });
      metricRepository.find.mockResolvedValue([]);

      const result = await service.calculatePerformance("pf-empty");

      expect(result.totalValue).toBe(0);
      expect(result.roi).toBe(0);
      expect(result.allocationByAsset).toEqual({});
      expect(result.allocationByCategory).toEqual({});
      expect(result.timeWeightedReturn).toBe(0);
      expect(result.maxDrawdown.maxDrawdown).toBe(0);
      expect(result.dataPoints).toBe(0);
    });

    it("throws when the portfolio does not exist", async () => {
      portfolioRepository.findOne.mockResolvedValue(null);
      await expect(
        service.calculatePerformance("missing"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("recordSnapshot", () => {
    it("records a snapshot using the previous value as baseline", async () => {
      metricRepository.findOne.mockResolvedValue({ portfolioValue: 9500 });

      await service.recordSnapshot("pf-1", 10000, { BTC: 100 });

      expect(metricRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          portfolioId: "pf-1",
          portfolioValue: 10000,
          previousValue: 9500,
          dailyReturn: (10000 - 9500) / 9500,
        }),
      );
      expect(metricRepository.save).toHaveBeenCalled();
    });

    it("records the first snapshot with no previous value", async () => {
      metricRepository.findOne.mockResolvedValue(null);

      await service.recordSnapshot("pf-1", 10000, { BTC: 100 });

      expect(metricRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          previousValue: undefined,
          dailyReturn: 0,
        }),
      );
    });
  });

  describe("recordMetrics", () => {
    it("computes the daily return from the previous value", async () => {
      await service.recordMetrics("pf-1", 1100, { BTC: 100 }, 1000);
      expect(metricRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ dailyReturn: 0.1 }),
      );
    });

    it("uses a 0 daily return when there is no previous value", async () => {
      await service.recordMetrics("pf-1", 1100, { BTC: 100 });
      expect(metricRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ dailyReturn: 0 }),
      );
    });
  });

  describe("legacy analytics methods", () => {
    const ascMetrics = [
      {
        portfolioValue: 1000,
        dateTime: new Date("2026-01-01"),
        assetContribution: { BTC: 0.5, ETH: 0.2 },
      },
      {
        portfolioValue: 1100,
        dateTime: new Date("2026-01-02"),
        assetContribution: { BTC: 0.3 },
      },
      { portfolioValue: 1050, dateTime: new Date("2026-01-03") },
      { portfolioValue: 1200, dateTime: new Date("2026-01-04") },
    ];

    beforeEach(() => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(ascMetrics),
      };
      metricRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
      metricRepository.find.mockResolvedValue(ascMetrics);
    });

    it("calculates cumulative return", async () => {
      expect(await service.calculateCumulativeReturn("pf-1")).toBeCloseTo(
        0.2,
        10,
      );
    });

    it("filters cumulative return by start date", async () => {
      const result = await service.calculateCumulativeReturn(
        "pf-1",
        new Date("2026-01-01"),
      );
      expect(typeof result).toBe("number");
    });

    it("returns 0 cumulative return with fewer than two metrics", async () => {
      metricRepository
        .createQueryBuilder()
        .getMany.mockResolvedValue([ascMetrics[0]]);
      expect(await service.calculateCumulativeReturn("pf-1")).toBe(0);
    });

    it("calculates annualized volatility", async () => {
      expect(await service.calculateVolatility("pf-1")).toBeGreaterThan(0);
    });

    it("calculates the (legacy) Sharpe ratio", async () => {
      expect(typeof (await service.calculateSharpeRatio("pf-1"))).toBe(
        "number",
      );
    });

    it("calculates the Sortino ratio", async () => {
      expect(typeof (await service.calculateSortinoRatio("pf-1"))).toBe(
        "number",
      );
    });

    it("calculates maximum drawdown", async () => {
      // peak 1100 -> trough 1050 => ~0.04545
      expect(await service.calculateMaxDrawdown("pf-1")).toBeCloseTo(
        (1100 - 1050) / 1100,
        10,
      );
    });

    it("returns 0 drawdown when there are no metrics", async () => {
      metricRepository.find.mockResolvedValue([]);
      expect(await service.calculateMaxDrawdown("pf-1")).toBe(0);
    });

    it("calculates Value at Risk", async () => {
      expect(typeof (await service.calculateVaR("pf-1"))).toBe("number");
    });

    it("calculates the Calmar ratio", async () => {
      expect(typeof (await service.calculateCalmarRatio("pf-1"))).toBe(
        "number",
      );
    });

    it("builds a performance summary", async () => {
      const summary = await service.getPerformanceSummary("pf-1");
      expect(summary).toEqual(
        expect.objectContaining({
          cumulativeReturn: expect.any(Number),
          volatility: expect.any(Number),
          sharpeRatio: expect.any(Number),
          maxDrawdown: expect.any(Number),
        }),
      );
    });

    it("returns metrics for a date range", async () => {
      const result = await service.getMetricsForDateRange(
        "pf-1",
        new Date("2026-01-01"),
        new Date("2026-01-04"),
      );
      expect(result).toHaveLength(ascMetrics.length);
    });

    it("aggregates attribution analysis across metrics", async () => {
      const attribution = await service.getAttributionAnalysis(
        "pf-1",
        new Date("2026-01-01"),
        new Date("2026-01-04"),
      );
      // BTC contributions 0.5 + 0.3, ETH 0.2
      expect(attribution.BTC).toBeCloseTo(0.8, 10);
      expect(attribution.ETH).toBeCloseTo(0.2, 10);
    });
  });
});



