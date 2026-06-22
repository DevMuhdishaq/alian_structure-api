import { Injectable } from "@nestjs/common";
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from "@nestjs/terminus";
import { CircuitBreakerService } from "./circuit-breaker.service";

@Injectable()
export class RiskManagementHealthIndicator extends HealthIndicator {
  constructor(private readonly circuitBreaker: CircuitBreakerService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const status = this.circuitBreaker.getStatus("default");
    const isHealthy = status.state !== "OPEN";

    const result = this.getStatus(key, isHealthy, {
      circuitBreakerState: status.state,
      failureCount: status.failureCount,
      lastFailureTime: status.lastFailureTime,
    });

    if (isHealthy) return result;
    throw new HealthCheckError(
      "Risk management circuit breaker is open",
      result,
    );
  }
}
