import { Injectable } from "@nestjs/common";
import { Portfolio, PortfolioType } from "../entities/portfolio.entity";
import { AssetType, PortfolioAsset } from "../entities/portfolio-asset.entity";

export interface PortfolioConstraintConfig {
  maxAssetAllocation: number;
  maxCategoryAllocation: number;
  minDiversifiedAssets: number;
  riskScoreLimit: number;
  warningThresholdPercent: number;
}

export interface ConstraintOverrideDto {
  overrideConstraints?: boolean;
  overrideReason?: string;
  acknowledgedBy?: string;
}

export interface ConstraintViolation {
  code: string;
  message: string;
  severity: "error" | "warning";
  details?: Record<string, any>;
}

export interface PortfolioConstraintEvaluation {
  valid: boolean;
  riskScore: number;
  violations: ConstraintViolation[];
  warnings: ConstraintViolation[];
  config: PortfolioConstraintConfig;
}

@Injectable()
export class PortfolioConstraintService {
  private readonly defaults: PortfolioConstraintConfig = {
    maxAssetAllocation: 40,
    maxCategoryAllocation: 60,
    minDiversifiedAssets: 3,
    riskScoreLimit: 70,
    warningThresholdPercent: 90,
  };

  evaluatePortfolio(
    portfolio: Portfolio,
    assets: PortfolioAsset[],
  ): PortfolioConstraintEvaluation {
    const config = this.getConfig(portfolio);
    const violations: ConstraintViolation[] = [];
    const warnings: ConstraintViolation[] = [];

    const normalizedAssets = assets.map((asset) => ({
      ...asset,
      value: Number(asset.value || 0),
    }));

    const totalValue = normalizedAssets.reduce(
      (sum, asset) => sum + Number(asset.value || 0),
      0,
    );

    // 1) Max allocation per asset
    if (totalValue > 0) {
      for (const asset of normalizedAssets) {
        const allocation = (Number(asset.value || 0) / totalValue) * 100;

        if (allocation > config.maxAssetAllocation) {
          violations.push({
            code: "MAX_ASSET_ALLOCATION_EXCEEDED",
            severity: "error",
            message: `${asset.ticker} allocation (${allocation.toFixed(
              2,
            )}%) exceeds the max asset allocation of ${
              config.maxAssetAllocation
            }%.`,
            details: {
              ticker: asset.ticker,
              allocation,
              limit: config.maxAssetAllocation,
            },
          });
        }
      }

      // 2) Max allocation per category/type
      const categoryAllocations = new Map<AssetType, number>();

      for (const asset of normalizedAssets) {
        const allocation = (Number(asset.value || 0) / totalValue) * 100;
        categoryAllocations.set(
          asset.type,
          (categoryAllocations.get(asset.type) || 0) + allocation,
        );
      }

      for (const [category, allocation] of categoryAllocations.entries()) {
        if (allocation > config.maxCategoryAllocation) {
          violations.push({
            code: "MAX_CATEGORY_ALLOCATION_EXCEEDED",
            severity: "error",
            message: `${category} allocation (${allocation.toFixed(
              2,
            )}%) exceeds the max category allocation of ${
              config.maxCategoryAllocation
            }%.`,
            details: {
              category,
              allocation,
              limit: config.maxCategoryAllocation,
            },
          });
        }
      }
    }

    // 3) Minimum diversification
    const requiresDiversification =
      [PortfolioType.AUTOMATED].includes(portfolio.type) ||
      portfolio.metadata?.strategy === "balanced";

    if (
      requiresDiversification &&
      normalizedAssets.length > 0 &&
      normalizedAssets.length < config.minDiversifiedAssets
    ) {
      violations.push({
        code: "MIN_DIVERSIFICATION_NOT_MET",
        severity: "error",
        message: `Portfolio requires at least ${config.minDiversifiedAssets} holdings for diversification; current holdings: ${normalizedAssets.length}.`,
        details: {
          currentAssets: normalizedAssets.length,
          minimum: config.minDiversifiedAssets,
        },
      });
    }

    // 4) Risk score
    const riskScore = this.calculateRiskScore(normalizedAssets);

    if (riskScore > config.riskScoreLimit) {
      violations.push({
        code: "RISK_SCORE_LIMIT_EXCEEDED",
        severity: "error",
        message: `Portfolio risk score ${riskScore.toFixed(
          2,
        )} exceeds the limit of ${config.riskScoreLimit}.`,
        details: {
          riskScore,
          limit: config.riskScoreLimit,
        },
      });
    } else if (
      riskScore >=
      config.riskScoreLimit * (config.warningThresholdPercent / 100)
    ) {
      warnings.push({
        code: "RISK_SCORE_NEAR_LIMIT",
        severity: "warning",
        message: `Portfolio risk score ${riskScore.toFixed(
          2,
        )} is approaching the configured limit of ${config.riskScoreLimit}.`,
        details: {
          riskScore,
          limit: config.riskScoreLimit,
        },
      });
    }

    return {
      valid: violations.length === 0,
      riskScore,
      violations,
      warnings,
      config,
    };
  }

  getConfig(portfolio: Portfolio): PortfolioConstraintConfig {
    return {
      ...this.defaults,
      ...(portfolio.metadata?.constraintConfig || {}),
    };
  }

  calculateRiskScore(assets: PortfolioAsset[]): number {
    const totalValue = assets.reduce(
      (sum, asset) => sum + Number(asset.value || 0),
      0,
    );

    if (totalValue <= 0 || assets.length === 0) {
      return 0;
    }

    const weightedRisk = assets.reduce((sum, asset) => {
      const weight = Number(asset.value || 0) / totalValue;
      const assetRisk =
        Number(asset.volatility ?? this.getDefaultVolatility(asset.type)) * 100;

      return sum + weight * assetRisk;
    }, 0);

    const concentrationPenalty = this.getConcentrationPenalty(
      assets,
      totalValue,
    );

    return Math.min(
      100,
      Number((weightedRisk + concentrationPenalty).toFixed(2)),
    );
  }

  private getDefaultVolatility(type: AssetType): number {
    switch (type) {
      case AssetType.BOND:
        return 0.05;
      case AssetType.STOCK:
      case AssetType.ETF:
      case AssetType.MUTUAL_FUND:
        return 0.15;
      case AssetType.REAL_ESTATE:
        return 0.12;
      case AssetType.COMMODITY:
        return 0.18;
      case AssetType.CRYPTOCURRENCY:
        return 0.35;
      default:
        return 0.2;
    }
  }

  private getConcentrationPenalty(
    assets: PortfolioAsset[],
    totalValue: number,
  ): number {
    const maxAllocation = Math.max(
      ...assets.map((asset) => Number(asset.value || 0) / totalValue),
    );

    return maxAllocation > 0.5 ? (maxAllocation - 0.5) * 40 : 0;
  }
}
