import { AgentScoring, AgentMetrics, DEFAULT_WEIGHTS } from "./agent-scoring";

const agent = (id: string, m: Partial<AgentMetrics> = {}): AgentMetrics => ({
  agentId: id,
  successRate: 0.5,
  roi: 0,
  risk: 0.5,
  userRating: 2.5,
  executions: 10,
  ...m,
});

describe("AgentScoring", () => {
  describe("resolveWeights", () => {
    it("returns defaults when nothing supplied", () => {
      expect(AgentScoring.resolveWeights()).toEqual(DEFAULT_WEIGHTS);
    });
    it("renormalizes overrides to sum to 1", () => {
      const w = AgentScoring.resolveWeights({
        successRate: 1,
        roi: 1,
        risk: 1,
        userRating: 1,
      });
      const sum = w.successRate + w.roi + w.risk + w.userRating;
      expect(sum).toBeCloseTo(1, 10);
      expect(w.successRate).toBeCloseTo(0.25, 10);
    });
    it("falls back to defaults on non-positive total", () => {
      expect(
        AgentScoring.resolveWeights({
          successRate: 0,
          roi: 0,
          risk: 0,
          userRating: 0,
        }),
      ).toEqual(DEFAULT_WEIGHTS);
    });
  });

  describe("normalizeRoi", () => {
    it("maps 0 ROI to 0.5", () => {
      expect(AgentScoring.normalizeRoi(0)).toBeCloseTo(0.5, 10);
    });
    it("maps positive ROI above 0.5 and negative below", () => {
      expect(AgentScoring.normalizeRoi(0.5)).toBeGreaterThan(0.5);
      expect(AgentScoring.normalizeRoi(-0.5)).toBeLessThan(0.5);
    });
    it("is bounded in (0,1)", () => {
      expect(AgentScoring.normalizeRoi(1000)).toBeLessThanOrEqual(1);
      expect(AgentScoring.normalizeRoi(-1000)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("breakdown", () => {
    it("clamps and inverts risk (low risk -> high contribution)", () => {
      const b = AgentScoring.breakdown(agent("a", { risk: 0 }));
      expect(b.risk).toBe(1);
      const b2 = AgentScoring.breakdown(agent("a", { risk: 1 }));
      expect(b2.risk).toBe(0);
    });
    it("normalizes a 0..5 rating to 0..1", () => {
      expect(
        AgentScoring.breakdown(agent("a", { userRating: 5 })).userRating,
      ).toBe(1);
      expect(
        AgentScoring.breakdown(agent("a", { userRating: 0 })).userRating,
      ).toBe(0);
    });
    it("defends against missing / non-finite inputs", () => {
      const b = AgentScoring.breakdown({ agentId: "a" });
      expect(b.successRate).toBe(0);
      expect(b.roi).toBeCloseTo(0.5, 10);
      expect(b.risk).toBe(1); // missing risk -> 0 -> inverted to 1
      expect(b.userRating).toBe(0);
    });
  });

  describe("score", () => {
    it("gives a perfect agent ~100", () => {
      const s = AgentScoring.score(
        agent("perfect", { successRate: 1, roi: 5, risk: 0, userRating: 5 }),
      );
      expect(s.score).toBeGreaterThan(95);
    });
    it("gives a worst-case agent a low score", () => {
      const s = AgentScoring.score(
        agent("worst", { successRate: 0, roi: -5, risk: 1, userRating: 0 }),
      );
      expect(s.score).toBeLessThan(10);
    });
    it("respects the documented factor weighting (success 40% dominates rating 10%)", () => {
      const highSuccess = AgentScoring.score(
        agent("s", { successRate: 1, roi: 0, risk: 0.5, userRating: 0 }),
      ).score;
      const highRating = AgentScoring.score(
        agent("r", { successRate: 0, roi: 0, risk: 0.5, userRating: 5 }),
      ).score;
      expect(highSuccess).toBeGreaterThan(highRating);
    });
    it("is reproducible for known inputs", () => {
      // success .5*.4 + roi .5*.3 + risk(inv .5)*.2 + rating .5*.1 = .5 -> 50
      const s = AgentScoring.score(agent("k"));
      expect(s.score).toBe(50);
    });
  });

  describe("rank / leaderboard", () => {
    const agents = [
      agent("low", { successRate: 0.2 }),
      agent("high", { successRate: 0.9, roi: 0.5 }),
      agent("mid", { successRate: 0.6 }),
    ];
    it("orders by score descending with 1-based ranks", () => {
      const ranked = AgentScoring.rank(agents);
      expect(ranked.map((a) => a.agentId)).toEqual(["high", "mid", "low"]);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[2].rank).toBe(3);
    });
    it("breaks ties by execution count then id", () => {
      const tie = [
        agent("b", { executions: 5 }),
        agent("a", { executions: 50 }),
      ];
      const ranked = AgentScoring.rank(tie);
      expect(ranked[0].agentId).toBe("a"); // same score, more executions wins
    });
    it("leaderboard returns the top N", () => {
      const lb = AgentScoring.leaderboard(agents, 2);
      expect(lb).toHaveLength(2);
      expect(lb[0].agentId).toBe("high");
    });
    it("handles an empty roster", () => {
      expect(AgentScoring.rank([])).toEqual([]);
      expect(AgentScoring.leaderboard([], 5)).toEqual([]);
    });
  });

  describe("filterByMinScore", () => {
    it("keeps only agents at or above the threshold", () => {
      const agents = [
        agent("good", { successRate: 1, roi: 1, risk: 0, userRating: 5 }),
        agent("bad", { successRate: 0, roi: -1, risk: 1, userRating: 0 }),
      ];
      const filtered = AgentScoring.filterByMinScore(agents, 50);
      expect(filtered.map((a) => a.agentId)).toEqual(["good"]);
    });
  });

  describe("weightsFromEnv", () => {
    it("reads + renormalizes weights from env vars", () => {
      const w = AgentScoring.weightsFromEnv({
        AGENT_SCORE_WEIGHT_SUCCESS: "2",
        AGENT_SCORE_WEIGHT_ROI: "1",
        AGENT_SCORE_WEIGHT_RISK: "1",
        AGENT_SCORE_WEIGHT_RATING: "0",
      });
      expect(w.successRate).toBeCloseTo(0.5, 10);
      expect(w.userRating).toBe(0);
    });
    it("falls back to defaults when env is empty", () => {
      expect(AgentScoring.weightsFromEnv({})).toEqual(DEFAULT_WEIGHTS);
    });
  });
});



