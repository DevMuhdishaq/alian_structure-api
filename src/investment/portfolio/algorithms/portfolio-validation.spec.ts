import {
  PortfolioValidation,
  ValidatableHolding,
  ViolationSeverity,
  DEFAULT_CONSTRAINTS,
} from "./portfolio-validation";

const h = (
  ticker: string,
  value: number,
  category?: string,
): ValidatableHolding => ({ ticker, value, category });

describe("PortfolioValidation", () => {
  describe("totalValue", () => {
    it("sums positive holding values", () => {
      expect(PortfolioValidation.totalValue([h("A", 100), h("B", 50)])).toBe(
        150,
      );
    });
    it("returns 0 for an empty portfolio", () => {
      expect(PortfolioValidation.totalValue([])).toBe(0);
    });
    it("ignores nullish and non-positive entries", () => {
      expect(
        PortfolioValidation.totalValue([
          h("A", 100),
          undefined as any,
          h("B", -20),
          h("C", 0),
        ]),
      ).toBe(100);
    });
  });

  describe("allocations", () => {
    it("computes per-asset percentages from value", () => {
      const a = PortfolioValidation.allocations([h("A", 75), h("B", 25)]);
      expect(a).toEqual({ A: 75, B: 25 });
    });
    it("returns {} for an empty / zero-value portfolio", () => {
      expect(PortfolioValidation.allocations([])).toEqual({});
      expect(PortfolioValidation.allocations([h("A", 0)])).toEqual({});
    });
  });

  describe("categoryAllocations", () => {
    it("aggregates by category", () => {
      const c = PortfolioValidation.categoryAllocations([
        h("A", 50, "crypto"),
        h("B", 30, "crypto"),
        h("C", 20, "bond"),
      ]);
      expect(c).toEqual({ crypto: 80, bond: 20 });
    });
    it("buckets missing categories under uncategorized", () => {
      const c = PortfolioValidation.categoryAllocations([h("A", 100)]);
      expect(c).toEqual({ uncategorized: 100 });
    });
  });

  describe("riskScore", () => {
    it("is 0 for an empty portfolio", () => {
      expect(PortfolioValidation.riskScore([])).toBe(0);
    });
    it("scores a single concentrated asset as maximally risky", () => {
      expect(PortfolioValidation.riskScore([h("A", 100)])).toBe(100);
    });
    it("scores an evenly diversified book lower than a concentrated one", () => {
      const diversified = PortfolioValidation.riskScore([
        h("A", 25, "x"),
        h("B", 25, "x"),
        h("C", 25, "x"),
        h("D", 25, "x"),
      ]);
      const concentrated = PortfolioValidation.riskScore([
        h("A", 70, "x"),
        h("B", 20, "x"),
        h("C", 10, "x"),
      ]);
      expect(diversified).toBeLessThan(concentrated);
    });
  });

  describe("validate — max allocation per asset", () => {
    it("flags an asset above the 40% default limit", () => {
      const r = PortfolioValidation.validate([
        h("A", 50, "x"),
        h("B", 25, "y"),
        h("C", 25, "z"),
      ]);
      const issue = r.issues.find((i) => i.rule === "maxAssetAllocation");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe(ViolationSeverity.VIOLATION);
      expect(r.valid).toBe(false);
    });
    it("passes when every asset is within the limit", () => {
      const r = PortfolioValidation.validate([
        h("A", 34, "x"),
        h("B", 33, "y"),
        h("C", 33, "z"),
      ]);
      expect(
        r.issues.find((i) => i.rule === "maxAssetAllocation"),
      ).toBeUndefined();
    });
    it("honors a configurable per-asset limit", () => {
      const r = PortfolioValidation.validate(
        [h("A", 34, "x"), h("B", 33, "y"), h("C", 33, "z")],
        { maxAssetAllocationPct: 30 },
      );
      expect(r.issues.some((i) => i.rule === "maxAssetAllocation")).toBe(true);
    });
  });

  describe("validate — max allocation per category", () => {
    it("flags a category above the 60% default limit", () => {
      const r = PortfolioValidation.validate([
        h("A", 40, "crypto"),
        h("B", 30, "crypto"),
        h("C", 30, "bond"),
      ]);
      const issue = r.issues.find((i) => i.rule === "maxCategoryAllocation");
      expect(issue).toBeDefined();
      expect(issue!.meta!.category).toBe("crypto");
    });
  });

  describe("validate — minimum diversification", () => {
    it("warns (not blocks) when below the minimum asset count", () => {
      const r = PortfolioValidation.validate([
        h("A", 60, "x"),
        h("B", 40, "y"),
      ]);
      const issue = r.issues.find((i) => i.rule === "minDiversification");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe(ViolationSeverity.WARNING);
    });
    it("does not warn at or above the minimum", () => {
      const r = PortfolioValidation.validate([
        h("A", 34, "x"),
        h("B", 33, "y"),
        h("C", 33, "z"),
      ]);
      expect(
        r.issues.find((i) => i.rule === "minDiversification"),
      ).toBeUndefined();
    });
  });

  describe("validate — risk score limit", () => {
    it("flags a portfolio whose risk score exceeds the limit", () => {
      const r = PortfolioValidation.validate(
        [h("A", 95, "x"), h("B", 5, "y")],
        {
          maxRiskScore: 50,
        },
      );
      expect(r.issues.some((i) => i.rule === "maxRiskScore")).toBe(true);
    });
  });

  describe("validateNewHolding", () => {
    it("blocks a prospective holding that breaches a constraint", () => {
      const current = [h("A", 30, "x"), h("B", 30, "y"), h("C", 30, "z")];
      const r = PortfolioValidation.validateNewHolding(
        current,
        h("D", 200, "w"),
      );
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.rule === "maxAssetAllocation")).toBe(true);
    });
    it("merges into an existing ticker rather than duplicating", () => {
      const current = [h("A", 30, "x"), h("B", 35, "y"), h("C", 35, "z")];
      const r = PortfolioValidation.validateNewHolding(
        current,
        h("A", 100, "x"),
      );
      expect(Object.keys(r.allocations)).toHaveLength(3);
      expect(r.allocations["A"]).toBeGreaterThan(30);
    });
    it("allows a well-sized new holding", () => {
      const current = [h("A", 30, "x"), h("B", 30, "y")];
      const r = PortfolioValidation.validateNewHolding(
        current,
        h("C", 30, "z"),
      );
      expect(r.valid).toBe(true);
    });
  });

  describe("applyOverride", () => {
    it("downgrades an acknowledged overridable violation to a warning and unblocks", () => {
      const r = PortfolioValidation.validate([
        h("A", 50, "x"),
        h("B", 25, "y"),
        h("C", 25, "z"),
      ]);
      expect(r.valid).toBe(false);
      const overridden = PortfolioValidation.applyOverride(r, [
        "maxAssetAllocation",
      ]);
      expect(overridden.valid).toBe(true);
      const issue = overridden.issues.find(
        (i) => i.rule === "maxAssetAllocation",
      );
      expect(issue!.severity).toBe(ViolationSeverity.WARNING);
    });
    it("leaves unacknowledged violations blocking", () => {
      const r = PortfolioValidation.validate([
        h("A", 50, "crypto"),
        h("B", 30, "crypto"),
        h("C", 20, "bond"),
      ]);
      const overridden = PortfolioValidation.applyOverride(r, []);
      expect(overridden.valid).toBe(false);
    });
  });

  describe("resolveConstraints", () => {
    it("falls back to the documented defaults", () => {
      expect(PortfolioValidation.resolveConstraints()).toEqual(
        DEFAULT_CONSTRAINTS,
      );
    });
    it("merges partial overrides over the defaults", () => {
      const c = PortfolioValidation.resolveConstraints({ minAssets: 5 });
      expect(c.minAssets).toBe(5);
      expect(c.maxAssetAllocationPct).toBe(40);
    });
  });
});



