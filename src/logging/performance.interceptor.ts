/**
 * PerformanceInterceptor
 *
 * NestJS interceptor that logs performance metrics for slow operations (route
 * handlers that take longer than a configurable threshold). Tracks execution
 * time and automatically tags slow operations with request context.
 *
 * Usage:
 * ```ts
 * @UseInterceptors(PerformanceInterceptor)
 * async mySlowMethod() { ... }
 * ```
 *
 * Or apply it globally:
 * ```ts
 * app.useGlobalInterceptors(new PerformanceInterceptor(loggerService));
 * ```
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Optional,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { LoggerService } from "./logger.service";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PerformanceInterceptorConfig {
  /**
   * Log operations that exceed this duration (ms).
   * Default: 1000 (1 second)
   */
  thresholdMs?: number;

  /**
   * When true, all operations are logged regardless of duration.
   * Useful for profiling. Default: false
   */
  logAll?: boolean;

  /**
   * Set to false to disable the interceptor entirely.
   * Default: true
   */
  enabled?: boolean;
}

const DEFAULT_CONFIG: Required<PerformanceInterceptorConfig> = {
  thresholdMs: 1000,
  logAll: false,
  enabled: true,
};

// ---------------------------------------------------------------------------
// Interceptor
// ---------------------------------------------------------------------------

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly cfg: Required<PerformanceInterceptorConfig>;

  constructor(
    private readonly logger: LoggerService,
    @Optional() config?: Partial<PerformanceInterceptorConfig>,
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.cfg.enabled) return next.handle();

    const className = context.getClass().name;
    const methodName = context.getHandler().name;
    const operation = `${className}.${methodName}`;

    const startNs = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.logIfSlow(operation, startNs, context),
        error: (err) => {
          // Always log errors with timing context, even if they are fast
          const durationMs = this.elapsed(startNs);
          this.logger.error({
            message: `Operation failed: ${operation} (${durationMs.toFixed(2)}ms)`,
            context: "Performance",
            operation,
            durationMs,
            requestId: this.extractRequestId(context),
            error: {
              type: err?.constructor?.name ?? "Error",
              message: err?.message ?? String(err),
            },
          });
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private logIfSlow(
    operation: string,
    startNs: bigint,
    context: ExecutionContext,
  ): void {
    const durationMs = this.elapsed(startNs);
    const isSlow = durationMs >= this.cfg.thresholdMs;

    if (this.cfg.logAll || isSlow) {
      this.logger.logPerformance({
        operation,
        durationMs,
        requestId: this.extractRequestId(context),
        slow: isSlow,
        threshold: this.cfg.thresholdMs,
        handler: {
          class: context.getClass().name,
          method: context.getHandler().name,
        },
      });
    }
  }

  private elapsed(startNs: bigint): number {
    return Number(process.hrtime.bigint() - startNs) / 1_000_000;
  }

  private extractRequestId(context: ExecutionContext): string | undefined {
    try {
      const request = context.switchToHttp().getRequest();
      return request?.requestId ?? request?.headers?.["x-request-id"];
    } catch {
      return undefined;
    }
  }
}
