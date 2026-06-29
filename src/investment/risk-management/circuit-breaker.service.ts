import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  slowCallDurationMs?: number;
  slowCallRateThreshold?: number;
  recoveryTimeMs?: number;
}

interface ServiceCircuitState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  slowCallCount: number;
  totalCallCount: number;
  lastFailureTime?: Date;
  lastTransitionTime: Date;
  config: Required<CircuitBreakerConfig>;
}

const DEFAULT_CONFIG: Required<CircuitBreakerConfig> = {
  failureThreshold: 5,
  slowCallDurationMs: 5000,
  slowCallRateThreshold: 50,
  recoveryTimeMs: 60000,
};

const MIN_CALLS_FOR_SLOW_RATE = 10;

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly services = new Map<string, ServiceCircuitState>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  configure(serviceName: string, config: CircuitBreakerConfig): void {
    const merged = { ...DEFAULT_CONFIG, ...config };
    const existing = this.services.get(serviceName);
    if (existing) {
      existing.config = merged;
    } else {
      this.services.set(serviceName, this.createInitialState(merged));
    }
  }

  isOpen(serviceName = "default"): boolean {
    const service = this.getOrCreate(serviceName);
    if (
      service.state === "OPEN" &&
      service.lastFailureTime &&
      Date.now() - service.lastFailureTime.getTime() >
        service.config.recoveryTimeMs
    ) {
      this.transitionTo(serviceName, service, "HALF_OPEN");
    }
    return service.state === "OPEN";
  }

  isHalfOpen(serviceName = "default"): boolean {
    return this.getOrCreate(serviceName).state === "HALF_OPEN";
  }

  recordSuccess(serviceName = "default", durationMs?: number): void {
    const service = this.getOrCreate(serviceName);
    service.totalCallCount++;
    service.successCount++;

    if (
      durationMs !== undefined &&
      durationMs > service.config.slowCallDurationMs
    ) {
      service.slowCallCount++;
      this.checkSlowCallRate(serviceName, service);
    }

    if (service.state === "HALF_OPEN") {
      this.reset(serviceName);
    }
  }

  recordFailure(serviceName = "default"): void {
    const service = this.getOrCreate(serviceName);
    service.failureCount++;
    service.totalCallCount++;
    service.lastFailureTime = new Date();

    if (service.state === "HALF_OPEN") {
      this.transitionTo(serviceName, service, "OPEN");
    } else if (
      service.state === "CLOSED" &&
      service.failureCount >= service.config.failureThreshold
    ) {
      this.transitionTo(serviceName, service, "OPEN");
    }
  }

  reset(serviceName = "default"): void {
    const service = this.getOrCreate(serviceName);
    const wasOpen = service.state !== "CLOSED";
    service.state = "CLOSED";
    service.failureCount = 0;
    service.successCount = 0;
    service.slowCallCount = 0;
    service.totalCallCount = 0;
    service.lastFailureTime = undefined;
    service.lastTransitionTime = new Date();

    if (wasOpen) {
      this.eventEmitter.emit("circuit-breaker.closed", {
        serviceName,
        timestamp: service.lastTransitionTime,
      });
    }
    this.logger.log(`Circuit breaker [${serviceName}] reset to CLOSED`);
  }

  getStatus(serviceName = "default"): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    slowCallCount: number;
    totalCallCount: number;
    lastFailureTime?: Date;
    lastTransitionTime: Date;
  } {
    const s = this.getOrCreate(serviceName);
    return {
      state: s.state,
      failureCount: s.failureCount,
      successCount: s.successCount,
      slowCallCount: s.slowCallCount,
      totalCallCount: s.totalCallCount,
      lastFailureTime: s.lastFailureTime,
      lastTransitionTime: s.lastTransitionTime,
    };
  }

  getAllStatuses(): Record<
    string,
    ReturnType<CircuitBreakerService["getStatus"]>
  > {
    const result: Record<
      string,
      ReturnType<CircuitBreakerService["getStatus"]>
    > = {};
    for (const [name] of this.services) {
      result[name] = this.getStatus(name);
    }
    return result;
  }

  private getOrCreate(serviceName: string): ServiceCircuitState {
    if (!this.services.has(serviceName)) {
      this.services.set(serviceName, this.createInitialState(DEFAULT_CONFIG));
    }
    return this.services.get(serviceName)!;
  }

  private createInitialState(
    config: Required<CircuitBreakerConfig>,
  ): ServiceCircuitState {
    return {
      state: "CLOSED",
      failureCount: 0,
      successCount: 0,
      slowCallCount: 0,
      totalCallCount: 0,
      lastTransitionTime: new Date(),
      config,
    };
  }

  private transitionTo(
    serviceName: string,
    service: ServiceCircuitState,
    newState: CircuitState,
  ): void {
    const prev = service.state;
    service.state = newState;
    service.lastTransitionTime = new Date();
    this.logger.log(`Circuit breaker [${serviceName}]: ${prev} → ${newState}`);

    if (newState === "OPEN") {
      this.logger.warn(
        `Circuit breaker [${serviceName}] OPENED after ${service.failureCount} failures`,
      );
      this.eventEmitter.emit("circuit-breaker.opened", {
        serviceName,
        failureCount: service.failureCount,
        timestamp: service.lastTransitionTime,
      });
    } else if (newState === "CLOSED") {
      this.eventEmitter.emit("circuit-breaker.closed", {
        serviceName,
        timestamp: service.lastTransitionTime,
      });
    }
  }

  private checkSlowCallRate(
    serviceName: string,
    service: ServiceCircuitState,
  ): void {
    if (service.totalCallCount < MIN_CALLS_FOR_SLOW_RATE) return;
    const slowRate = (service.slowCallCount / service.totalCallCount) * 100;
    if (
      slowRate >= service.config.slowCallRateThreshold &&
      service.state === "CLOSED"
    ) {
      this.transitionTo(serviceName, service, "OPEN");
    }
  }
}



