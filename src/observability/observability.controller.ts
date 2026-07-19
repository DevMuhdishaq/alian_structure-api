import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { Public } from "../common/decorators/public.decorator";
import { SkipKyc } from "../common/decorators/skip-kyc.decorator";
import {
  PerformanceBaselineService,
  BaselineMetric,
  RegressionDetection,
} from "./performance-baseline.service";
import { RequestTimingMiddleware } from "./request-timing.middleware";
import { register } from "../config/metrics";

@ApiTags("Observability")
@Controller("observability")
@Public()
@SkipKyc()
export class ObservabilityController {
  constructor(
    private readonly performanceBaselineService: PerformanceBaselineService,
    private readonly requestTimingMiddleware: RequestTimingMiddleware,
  ) {}

  @Get("baselines")
  @ApiOperation({
    summary: "Get performance baselines",
    description: "Returns all established performance baselines for routes",
  })
  @ApiResponse({ status: 200, description: "List of performance baselines" })
  getBaselines(): BaselineMetric[] {
    return this.performanceBaselineService.getBaselines();
  }

  @Get("regressions")
  @ApiOperation({
    summary: "Get detected performance regressions",
    description: "Returns all detected performance regressions",
  })
  @ApiResponse({ status: 200, description: "List of performance regressions" })
  getRegressions(): RegressionDetection[] {
    return this.performanceBaselineService.getRegressions();
  }

  @Post("baselines/reset")
  @ApiOperation({
    summary: "Reset performance baselines",
    description: "Resets all performance baselines - useful after deployments",
  })
  @ApiResponse({ status: 200, description: "Baselines reset successfully" })
  resetBaselines() {
    this.performanceBaselineService.resetBaselines();
    return {
      success: true,
      message: "Performance baselines reset successfully",
    };
  }

  @Get("active-requests")
  @ApiOperation({
    summary: "Get currently active requests",
    description:
      "Returns all requests currently being processed with their timing data",
  })
  @ApiResponse({ status: 200, description: "List of active requests" })
  getActiveRequests() {
    return this.requestTimingMiddleware.getActiveRequests().map((timing) => ({
      requestId: timing.requestId,
      method: timing.method,
      path: timing.path,
      elapsedMs: Date.now() - timing.startTime,
      timings: timing.timings,
    }));
  }

  @Get("memory/current")
  @ApiOperation({
    summary: "Get current memory usage",
    description: "Returns detailed current memory usage statistics",
  })
  @ApiResponse({ status: 200, description: "Current memory usage" })
  getCurrentMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      memory: {
        rss: { bytes: memoryUsage.rss, mb: memoryUsage.rss / 1024 / 1024 },
        heapTotal: {
          bytes: memoryUsage.heapTotal,
          mb: memoryUsage.heapTotal / 1024 / 1024,
        },
        heapUsed: {
          bytes: memoryUsage.heapUsed,
          mb: memoryUsage.heapUsed / 1024 / 1024,
        },
        external: {
          bytes: memoryUsage.external,
          mb: memoryUsage.external / 1024 / 1024,
        },
        arrayBuffers: {
          bytes: memoryUsage.arrayBuffers,
          mb: memoryUsage.arrayBuffers / 1024 / 1024,
        },
      },
    };
  }

  /**
   * Prometheus scrape endpoint.
   *
   * Exposes every metric registered in `src/config/metrics.ts` in Prometheus
   * text-exposition format so that a Prometheus server can scrape it.
   * Marked `@Public()` / `@SkipKyc()` because the scraper does not have a JWT
   * and KYC is unrelated to operational metrics. In production, set
   * `METRICS_AUTH_TOKEN` so only an authorised scraper can read it (see
   * `assertMetricsAuthorized`).
   */
  @Get("metrics")
  @ApiOperation({
    summary: "Prometheus metrics endpoint",
    description:
      "Returns all registered Prometheus metrics in text exposition format. " +
      "This endpoint is intended for scraping by a Prometheus server.",
  })
  @ApiResponse({
    status: 200,
    description: "Prometheus metrics in text exposition format",
  })
  async getMetrics(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    this.assertMetricsAuthorized(req);

    // Make sure the response carries the Prometheus text-exposition content
    // type. Without this, NestJS's default handler would JSON-encode the
    // response body and scrapers would reject the payload as invalid.
    res.setHeader("Content-Type", register.contentType);
    return register.metrics();
  }

  /**
   * Optionally protect the metrics endpoint with a shared token.
   *
   * When `METRICS_AUTH_TOKEN` is unset the endpoint stays open — fine for a
   * private network or local dev. When it is set, the scraper must present
   * the token via `Authorization: Bearer <token>` or a `?token=` query
   * param. The comparison is constant-time to avoid leaking the token
   * through timing side-channels.
   */
  private assertMetricsAuthorized(req: Request): void {
    const expected = process.env.METRICS_AUTH_TOKEN;
    if (!expected) return;

    const header = req.headers["authorization"];
    const headerToken =
      typeof header === "string" && header.startsWith("Bearer ")
        ? header.slice("Bearer ".length)
        : undefined;
    const queryToken =
      typeof req.query?.token === "string" ? req.query.token : undefined;
    const provided = headerToken ?? queryToken;

    if (!provided || !this.constantTimeEquals(provided, expected)) {
      throw new UnauthorizedException("Invalid or missing metrics token");
    }
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    // timingSafeEqual throws on length mismatch; compare a self-equal buffer
    // of matching length first so the early return itself stays constant-time
    // for equal-length inputs.
    if (bufA.length !== bufB.length) {
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}



