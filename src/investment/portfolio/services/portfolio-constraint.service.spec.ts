import { PortfolioConstraintService } from "./portfolio-constraint.service";
import { Portfolio, PortfolioType } from "../entities/portfolio.entity";
import {
  AssetType,
  Chain,
  PortfolioAsset,
} from "../entities/portfolio-asset.entity";

describe("PortfolioConstraintService", () => {
  let service: PortfolioConstraintService;

  beforeEach(() => {
    service = new PortfolioConstraintService();
  });

  const createPortfolio = (overrides: Partial<Portfolio> = {}): Portfolio =>
    ({
      id: "portfolio-1",
      name: "Growth Portfolio",
      type: PortfolioType.AUTOMATED,
      metadata: { strategy: "balanced" },
      ...overrides,
    }) as Portfolio;

  const createAsset = (
    overrides: Partial<PortfolioAsset> = {},
  ): PortfolioAsset =>
    ({
      id: crypto.randomUUID?.() ?? Math.random().toString(),
      ticker: "BTC",
      name: "Bitcoin",
      chain: Chain.BITCOIN,
      type: AssetType.CRYPTOCURRENCY,
      quantity: 1,
      currentPrice: 50000,
      value: 50000,
      ...overrides,
    }) as PortfolioAsset;

  it("should allow a diversified balanced portfolio within limits", () => {
    const portfolio = createPortfolio({
      metadata: {
        strategy: "balanced",
        constraintConfig: {
          maxAssetAllocation: 50,
          maxCategoryAllocation: 70,
          minDiversifiedAssets: 3,
          riskScoreLimit: 80,
        },
      },
    });

    const assets = [
      createAsset({
        ticker: "BTC",
        value: 30000,
        volatility: 0.2,
      }),
      createAsset({
        ticker: "ETH",
        value: 25000,
        volatility: 0.18,
      }),
      createAsset({
        ticker: "SPY",
        type: AssetType.ETF,
        chain: Chain.OTHER,
        value: 20000,
        volatility: 0.1,
      }),
    ];

    const result = service.evaluatePortfolio(portfolio, assets);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("should fail when a single asset exceeds max allocation", () => {
    const portfolio = createPortfolio({
      metadata: {
        strategy: "balanced",
        constraintConfig: {
          maxAssetAllocation: 40,
        },
      },
    });

    const assets = [
      createAsset({ ticker: "BTC", value: 80000 }),
      createAsset({
        ticker: "ETH",
        value: 10000,
        volatility: 0.2,
      }),
      createAsset({
        ticker: "SPY",
        type: AssetType.ETF,
        chain: Chain.OTHER,
        value: 10000,
        volatility: 0.1,
      }),
    ];

    const result = service.evaluatePortfolio(portfolio, assets);
    expect(result.valid).toBe(false);
    expect(
      result.violations.some((v) => v.code === "MAX_ASSET_ALLOCATION_EXCEEDED"),
    ).toBe(true);
  });

  it("should fail when category allocation exceeds limit", () => {
    const portfolio = createPortfolio({
      metadata: {
        strategy: "balanced",
        constraintConfig: {
          maxCategoryAllocation: 50,
          maxAssetAllocation: 80,
        },
      },
    });

    const assets = [
      createAsset({ ticker: "BTC", value: 30000 }),
      createAsset({
        ticker: "ETH",
        value: 30000,
        chain: Chain.ETHEREUM,
      }),
      createAsset({
        ticker: "SPY",
        type: AssetType.ETF,
        chain: Chain.OTHER,
        value: 10000,
      }),
    ];

    const result = service.evaluatePortfolio(portfolio, assets);
    expect(result.valid).toBe(false);
    expect(
      result.violations.some(
        (v) => v.code === "MAX_CATEGORY_ALLOCATION_EXCEEDED",
      ),
    ).toBe(true);
  });

  it("should fail when balanced portfolio has fewer than minimum holdings", () => {
    const portfolio = createPortfolio({
      metadata: {
        strategy: "balanced",
        constraintConfig: {
          minDiversifiedAssets: 3,
          maxAssetAllocation: 80,
          maxCategoryAllocation: 100,
        },
      },
    });

    const assets = [
      createAsset({ ticker: "BTC", value: 40000 }),
      createAsset({ ticker: "ETH", value: 30000 }),
    ];

    const result = service.evaluatePortfolio(portfolio, assets);
    expect(result.valid).toBe(false);
    expect(
      result.violations.some((v) => v.code === "MIN_DIVERSIFICATION_NOT_MET"),
    ).toBe(true);
  });

  it("should fail when risk score exceeds limit", () => {
    const portfolio = createPortfolio({
      metadata: {
        strategy: "balanced",
        constraintConfig: {
          maxAssetAllocation: 80,
          maxCategoryAllocation: 100,
          minDiversifiedAssets: 3,
          riskScoreLimit: 20,
        },
      },
    });

    const assets = [
      createAsset({
        ticker: "BTC",
        value: 30000,
        volatility: 0.5,
      }),
      createAsset({
        ticker: "ETH",
        value: 30000,
        volatility: 0.45,
      }),
      createAsset({
        ticker: "SOL",
        value: 30000,
        chain: Chain.SOLANA,
        volatility: 0.55,
      }),
    ];

    const result = service.evaluatePortfolio(portfolio, assets);
    expect(result.valid).toBe(false);
    expect(
      result.violations.some((v) => v.code === "RISK_SCORE_LIMIT_EXCEEDED"),
    ).toBe(true);
  });

  it("should warn when risk score approaches limit", () => {
    const portfolio = createPortfolio({
      metadata: {
        strategy: "balanced",
        constraintConfig: {
          maxAssetAllocation: 80,
          maxCategoryAllocation: 100,
          minDiversifiedAssets: 3,
          riskScoreLimit: 40,
          warningThresholdPercent: 90,
        },
      },
    });

    const assets = [
      createAsset({
        ticker: "BTC",
        value: 30000,
        volatility: 0.34,
      }),
      createAsset({
        ticker: "ETH",
        value: 30000,
        volatility: 0.36,
      }),
      createAsset({
        ticker: "SPY",
        type: AssetType.ETF,
        chain: Chain.OTHER,
        value: 20000,
        volatility: 0.1,
      }),
    ];

    const result = service.evaluatePortfolio(portfolio, assets);
    expect(
      result.warnings.some((v) => v.code === "RISK_SCORE_NEAR_LIMIT"),
    ).toBe(true);
  });
});



