/**
 * AI compute provider failover — pure, dependency-free selection + circuit-breaker policy (issue #54).
 *
 * No network here: just the decision logic for choosing a healthy AI provider (OpenAI / Grok / Llama),
 * tripping a circuit breaker on repeated failures, and rotating to alternatives. Unit-testable and
 * reusable by the compute bridge service.
 *
 * Circuit breaker per provider: CLOSED -> (5 consecutive failures) -> OPEN -> (cooldown) -> HALF_OPEN
 * -> (success) CLOSED | (failure) OPEN. Selection prefers healthy providers and load-balances across
 * them (least-loaded), with deterministic priority tie-breaks.
 */

export enum CircuitState {
  CLOSED = "closed", // healthy, taking traffic
  OPEN = "open", // tripped, skipped until cooldown elapses
  HALF_OPEN = "half_open", // trial: one probe allowed
}

export interface BreakerConfig {
  failureThreshold: number; // consecutive failures to open, default 5
  cooldownMs: number; // OPEN -> HALF_OPEN after this, default 30_000
}

export const DEFAULT_BREAKER: BreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30_000,
};

interface ProviderState {
  name: string;
  priority: number; // lower = preferred on ties
  consecutiveFailures: number;
  state: CircuitState;
  openedAtMs: number;
  inFlight: number; // current load (for least-loaded balancing)
}

export interface ProviderInit {
  name: string;
  priority?: number;
}

export class ProviderFailover {
  private readonly providers = new Map<string, ProviderState>();
  private readonly cfg: BreakerConfig;

  constructor(init: ProviderInit[], cfg: Partial<BreakerConfig> = {}) {
    this.cfg = { ...DEFAULT_BREAKER, ...cfg };
    init.forEach((p, i) =>
      this.providers.set(p.name, {
        name: p.name,
        priority: p.priority ?? i,
        consecutiveFailures: 0,
        state: CircuitState.CLOSED,
        openedAtMs: 0,
        inFlight: 0,
      }),
    );
  }

  /** Effective circuit state at `nowMs` (lazily transitions OPEN -> HALF_OPEN after cooldown). */
  private effectiveState(p: ProviderState, nowMs: number): CircuitState {
    if (
      p.state === CircuitState.OPEN &&
      nowMs - p.openedAtMs >= this.cfg.cooldownMs
    ) {
      p.state = CircuitState.HALF_OPEN;
    }
    return p.state;
  }

  /** Is a provider available to take a request right now? */
  isAvailable(name: string, nowMs: number = Date.now()): boolean {
    const p = this.providers.get(name);
    if (!p) return false;
    return this.effectiveState(p, nowMs) !== CircuitState.OPEN;
  }

  /** All providers currently able to take traffic (CLOSED or HALF_OPEN). */
  healthy(nowMs: number = Date.now()): string[] {
    return [...this.providers.values()]
      .filter((p) => this.effectiveState(p, nowMs) !== CircuitState.OPEN)
      .map((p) => p.name);
  }

  /**
   * Pick the next provider: among healthy ones, the least-loaded (load balancing), breaking ties by
   * priority then name. Returns null if every provider's breaker is OPEN.
   */
  select(nowMs: number = Date.now()): string | null {
    const candidates = [...this.providers.values()].filter(
      (p) => this.effectiveState(p, nowMs) !== CircuitState.OPEN,
    );
    if (candidates.length === 0) return null;
    candidates.sort(
      (a, b) =>
        a.inFlight - b.inFlight ||
        a.priority - b.priority ||
        a.name.localeCompare(b.name),
    );
    return candidates[0].name;
  }

  /**
   * Failover order: every healthy provider except `exclude`, in selection order. Used to retry a
   * failed job on an alternative.
   */
  failoverOrder(exclude: string, nowMs: number = Date.now()): string[] {
    return [...this.providers.values()]
      .filter(
        (p) =>
          p.name !== exclude &&
          this.effectiveState(p, nowMs) !== CircuitState.OPEN,
      )
      .sort(
        (a, b) =>
          a.inFlight - b.inFlight ||
          a.priority - b.priority ||
          a.name.localeCompare(b.name),
      )
      .map((p) => p.name);
  }

  acquire(name: string): void {
    const p = this.providers.get(name);
    if (p) p.inFlight += 1;
  }

  release(name: string): void {
    const p = this.providers.get(name);
    if (p && p.inFlight > 0) p.inFlight -= 1;
  }

  /** Record a successful call: closes the breaker, resets the failure streak. */
  recordSuccess(name: string): void {
    const p = this.providers.get(name);
    if (!p) return;
    p.consecutiveFailures = 0;
    p.state = CircuitState.CLOSED;
    this.release(name);
  }

  /**
   * Record a failure: increments the streak; trips the breaker OPEN at the threshold, or immediately
   * if it failed while HALF_OPEN (the probe failed).
   */
  recordFailure(name: string, nowMs: number = Date.now()): void {
    const p = this.providers.get(name);
    if (!p) return;
    this.release(name);
    if (p.state === CircuitState.HALF_OPEN) {
      p.state = CircuitState.OPEN;
      p.openedAtMs = nowMs;
      return;
    }
    p.consecutiveFailures += 1;
    if (p.consecutiveFailures >= this.cfg.failureThreshold) {
      p.state = CircuitState.OPEN;
      p.openedAtMs = nowMs;
    }
  }

  /** Snapshot for metrics (availability + load + breaker state per provider). */
  metrics(nowMs: number = Date.now()): Record<
    string,
    {
      state: CircuitState;
      available: boolean;
      inFlight: number;
      consecutiveFailures: number;
    }
  > {
    const out: Record<string, any> = {};
    for (const p of this.providers.values()) {
      const st = this.effectiveState(p, nowMs);
      out[p.name] = {
        state: st,
        available: st !== CircuitState.OPEN,
        inFlight: p.inFlight,
        consecutiveFailures: p.consecutiveFailures,
      };
    }
    return out;
  }
}



