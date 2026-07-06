import { ProviderFailover, CircuitState } from "./provider-failover";

const providers = [
  { name: "openai", priority: 0 },
  { name: "grok", priority: 1 },
  { name: "llama", priority: 2 },
];

describe("ProviderFailover", () => {
  it("selects the highest-priority healthy provider when idle", () => {
    const f = new ProviderFailover(providers);
    expect(f.select(0)).toBe("openai");
  });

  it("trips the breaker OPEN after 5 consecutive failures", () => {
    const f = new ProviderFailover(providers);
    for (let i = 0; i < 4; i++) f.recordFailure("openai", 0);
    expect(f.isAvailable("openai", 0)).toBe(true); // 4 < threshold
    f.recordFailure("openai", 0); // 5th
    expect(f.isAvailable("openai", 0)).toBe(false);
    expect(f.metrics(0)["openai"].state).toBe(CircuitState.OPEN);
  });

  it("fails over to the next healthy provider when primary is open", () => {
    const f = new ProviderFailover(providers);
    for (let i = 0; i < 5; i++) f.recordFailure("openai", 0);
    expect(f.select(0)).toBe("grok");
    expect(f.failoverOrder("openai", 0)).toEqual(["grok", "llama"]);
  });

  it("returns null when every provider is open", () => {
    const f = new ProviderFailover(providers);
    for (const p of ["openai", "grok", "llama"]) {
      for (let i = 0; i < 5; i++) f.recordFailure(p, 0);
    }
    expect(f.select(0)).toBeNull();
    expect(f.healthy(0)).toEqual([]);
  });

  it("transitions OPEN -> HALF_OPEN after the cooldown", () => {
    const f = new ProviderFailover(providers, { cooldownMs: 30_000 });
    for (let i = 0; i < 5; i++) f.recordFailure("openai", 0);
    expect(f.isAvailable("openai", 29_999)).toBe(false);
    expect(f.isAvailable("openai", 30_000)).toBe(true); // half-open probe allowed
    expect(f.metrics(30_000)["openai"].state).toBe(CircuitState.HALF_OPEN);
  });

  it("a successful probe in HALF_OPEN closes the breaker", () => {
    const f = new ProviderFailover(providers, { cooldownMs: 1000 });
    for (let i = 0; i < 5; i++) f.recordFailure("openai", 0);
    f.isAvailable("openai", 1000); // -> HALF_OPEN
    f.recordSuccess("openai");
    expect(f.metrics(1000)["openai"].state).toBe(CircuitState.CLOSED);
    expect(f.isAvailable("openai", 1000)).toBe(true);
  });

  it("a failed probe in HALF_OPEN re-opens immediately", () => {
    const f = new ProviderFailover(providers, { cooldownMs: 1000 });
    for (let i = 0; i < 5; i++) f.recordFailure("openai", 0);
    f.isAvailable("openai", 1000); // -> HALF_OPEN
    f.recordFailure("openai", 1000);
    expect(f.metrics(1500)["openai"].state).toBe(CircuitState.OPEN);
  });

  it("load-balances to the least-loaded healthy provider", () => {
    const f = new ProviderFailover(providers);
    f.acquire("openai"); // openai now has load 1
    expect(f.select(0)).toBe("grok"); // least-loaded wins over priority
  });

  it("a success resets the consecutive-failure streak", () => {
    const f = new ProviderFailover(providers);
    f.recordFailure("openai", 0);
    f.recordFailure("openai", 0);
    f.recordSuccess("openai");
    expect(f.metrics(0)["openai"].consecutiveFailures).toBe(0);
  });

  it("exposes metrics for availability and load", () => {
    const f = new ProviderFailover(providers);
    f.acquire("grok");
    const m = f.metrics(0);
    expect(m["grok"].inFlight).toBe(1);
    expect(m["openai"].available).toBe(true);
    expect(Object.keys(m)).toHaveLength(3);
  });
});



