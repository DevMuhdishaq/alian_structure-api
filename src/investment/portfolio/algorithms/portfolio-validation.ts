/**
 * PortfolioValidation — pure, dependency-free portfolio constraint & risk-limit engine.
 *
 * Implements the validation rules for issue #51 (Portfolio Validation & Constraints):
 *   - Max allocation per asset      (configurable, default 40%)
 *   - Max allocation per category   (configurable, default 60%)
 *   - Minimum diversification       (at least N assets, default 3)
 *   - Risk score calculation with a configurable limit
 *   - Validate a prospective new holding before it is added
 *   - Warn (non-blocking) vs violate (blocking), with override-by-acknowledgment
 *
 * Pure functions only (no DB / Nest DI) so the rules are unit-testable in isolation and reusable by
 * PortfolioService, controllers, or background jobs. Allocations are derived from each holding's
 * `value` so the engine is correct even when stored `allocationPercentage` is stale.
 */

/** A holding as seen by the validator. Maps onto a subset of PortfolioAsset. */
export interface ValidatableHolding {
  ticker: string;
  /** Asset class used as the "category" for category-level limits (e.g. AssetType). */
  category?: string;
  /** Current total value of the holding (base currency). */
  value: number;
}

export interface PortfolioConstraints {
  maxAssetAllocationPct: number; // default 40
  maxCategoryAllocationPct: number; // default 60
  minAssets: number; // default 3
  maxRiskScore: number; // 0..100, default 70
}

export const DEFAULT_CONSTRAINTS: PortfolioConstraints = {
  maxAssetAllocationPct: 40,
  maxCategoryAllocationPct: 60,
  minAssets: 3,
  maxRiskScore: 70,
};

export enum ViolationSeverity {
  WARNING = "warning", // non-blocking; can proceed
  VIOLATION = "violation", // blocking unless explicitly overridden
}

export interface ConstraintIssue {
  rule: string;
  severity: ViolationSeverity;
  message: string;
  /** Whether the user may proceed by acknowledging this issue. Always true for warnings. */
  overridable: boolean;
  meta?: Record<string, number | string>;
}

export interface ValidationResult {
  valid: boolean; // no blocking violations (after overrides)
  issues: ConstraintIssue[];
  riskScore: number; // 0..100
  allocations: Record<string, number>; // ticker -> pct
  categoryAllocations: Record<string, number>; // category -> pct
  totalValue: number;
}

export class PortfolioValidation {
  /** Merge partial overrides onto the defaults. */
  static resolveConstraints(
    partial?: Partial<PortfolioConstraints>,
  ): PortfolioConstraints {
    return { ...DEFAULT_CONSTRAINTS, ...(partial ?? {}) };
  }

  private static round(n: number, dp = 2): number {
    const f = Math.pow(10, dp);
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  /** Sum of holding values, ignoring nullish / negative entries. */
  static totalValue(holdings: ValidatableHolding[]): number {
    return (holdings ?? []).reduce(
      (acc, h) => acc + (h && h.value > 0 ? h.value : 0),
      0,
    );
  }

  /** Per-asset allocation percentages, derived from value. Empty portfolio -> {}. */
  static allocations(holdings: ValidatableHolding[]): Record<string, number> {
    const total = this.totalValue(holdings);
    const out: Record<string, number> = {};
    if (total <= 0) return out;
    for (const h of holdings) {
      if (!h || h.value <= 0) continue;
      out[h.ticker] = this.round((h.value / total) * 100);
    }
    return out;
  }

  /** Per-category allocation percentages. Holdings without a category fall under "uncategorized". */
  static categoryAllocations(
    holdings: ValidatableHolding[],
  ): Record<string, number> {
    const total = this.totalValue(holdings);
    const out: Record<string, number> = {};
    if (total <= 0) return out;
    for (const h of holdings) {
      if (!h || h.value <= 0) continue;
      const cat = h.category ?? "uncategorized";
      out[cat] = (out[cat] ?? 0) + h.value;
    }
    for (const cat of Object.keys(out)) {
      out[cat] = this.round((out[cat] / total) * 100);
    }
    return out;
  }

  /**
   * Concentration risk score in 0..100. Higher = riskier.
   * Blends the Herfindahl-Hirschman Index (concentration) with a diversification penalty so that a
   * single-asset book scores ~100 and an evenly-spread, well-diversified book scores low.
   */
  static riskScore(
    holdings: ValidatableHolding[],
    constraints: PortfolioConstraints = DEFAULT_CONSTRAINTS,
  ): number {
    const allocs = Object.values(this.allocations(holdings));
    if (allocs.length === 0) return 0;
    // HHI of fractional weights: 1 (one asset) .. ~1/n (evenly spread). Scaled to 0..100.
    const hhi = allocs.reduce((acc, pct) => acc + Math.pow(pct / 100, 2), 0);
    const concentration = hhi * 100;
    // Diversification penalty: short of minAssets adds risk, decaying as you approach the floor.
    const shortfall = Math.max(0, constraints.minAssets - allocs.length);
    const divPenalty = (shortfall / constraints.minAssets) * 25;
    return this.round(Math.min(100, concentration + divPenalty));
  }

  /** Full validation of an existing/prospective set of holdings against the constraints. */
  static validate(
    holdings: ValidatableHolding[],
    partial?: Partial<PortfolioConstraints>,
  ): ValidationResult {
    const constraints = this.resolveConstraints(partial);
    const issues: ConstraintIssue[] = [];
    const allocations = this.allocations(holdings);
    const categoryAllocations = this.categoryAllocations(holdings);
    const totalValue = this.totalValue(holdings);
    const assetCount = Object.keys(allocations).length;

    // Rule: max allocation per asset
    for (const [ticker, pct] of Object.entries(allocations)) {
      if (pct > constraints.maxAssetAllocationPct) {
        issues.push({
          rule: "maxAssetAllocation",
          severity: ViolationSeverity.VIOLATION,
          overridable: true,
          message: `${ticker} is ${pct}% of the portfolio, above the ${constraints.maxAssetAllocationPct}% per-asset limit`,
          meta: {
            ticker,
            allocation: pct,
            limit: constraints.maxAssetAllocationPct,
          },
        });
      }
    }

    // Rule: max allocation per category
    for (const [category, pct] of Object.entries(categoryAllocations)) {
      if (pct > constraints.maxCategoryAllocationPct) {
        issues.push({
          rule: "maxCategoryAllocation",
          severity: ViolationSeverity.VIOLATION,
          overridable: true,
          message: `Category "${category}" is ${pct}%, above the ${constraints.maxCategoryAllocationPct}% per-category limit`,
          meta: {
            category,
            allocation: pct,
            limit: constraints.maxCategoryAllocationPct,
          },
        });
      }
    }

    // Rule: minimum diversification (warning — encourages, does not hard-block)
    if (totalValue > 0 && assetCount < constraints.minAssets) {
      issues.push({
        rule: "minDiversification",
        severity: ViolationSeverity.WARNING,
        overridable: true,
        message: `Only ${assetCount} asset(s); at least ${constraints.minAssets} recommended for diversification`,
        meta: { assets: assetCount, minimum: constraints.minAssets },
      });
    }

    // Rule: risk score limit
    const riskScore = this.riskScore(holdings, constraints);
    if (riskScore > constraints.maxRiskScore) {
      issues.push({
        rule: "maxRiskScore",
        severity: ViolationSeverity.VIOLATION,
        overridable: true,
        message: `Risk score ${riskScore} exceeds the limit of ${constraints.maxRiskScore}`,
        meta: { riskScore, limit: constraints.maxRiskScore },
      });
    }

    const valid = !issues.some(
      (i) => i.severity === ViolationSeverity.VIOLATION,
    );

    return {
      valid,
      issues,
      riskScore,
      allocations,
      categoryAllocations,
      totalValue,
    };
  }

  /**
   * Validate adding a prospective holding to the current set, BEFORE persisting it.
   * Returns the post-addition validation result. Callers block on `!valid` unless the user
   * acknowledges the overridable violations (see `applyOverride`).
   */
  static validateNewHolding(
    current: ValidatableHolding[],
    incoming: ValidatableHolding,
    partial?: Partial<PortfolioConstraints>,
  ): ValidationResult {
    const merged = this.mergeHolding(current ?? [], incoming);
    return this.validate(merged, partial);
  }

  /** Merge an incoming holding into the set, combining value if the ticker already exists. */
  private static mergeHolding(
    current: ValidatableHolding[],
    incoming: ValidatableHolding,
  ): ValidatableHolding[] {
    const out = current.map((h) => ({ ...h }));
    const existing = out.find((h) => h.ticker === incoming.ticker);
    if (existing) {
      existing.value += incoming.value;
      existing.category = incoming.category ?? existing.category;
    } else {
      out.push({ ...incoming });
    }
    return out;
  }

  /**
   * Resolve a validation result against a set of acknowledged rule names. Any overridable violation
   * whose rule is acknowledged is downgraded to an (informational) warning, allowing the action to
   * proceed — the "allow override with acknowledgment" requirement.
   */
  static applyOverride(
    result: ValidationResult,
    acknowledgedRules: string[],
  ): ValidationResult {
    const ack = new Set(acknowledgedRules ?? []);
    const issues = result.issues.map((i) =>
      i.severity === ViolationSeverity.VIOLATION &&
      i.overridable &&
      ack.has(i.rule)
        ? { ...i, severity: ViolationSeverity.WARNING }
        : i,
    );
    const valid = !issues.some(
      (i) => i.severity === ViolationSeverity.VIOLATION,
    );
    return { ...result, issues, valid };
  }
}



