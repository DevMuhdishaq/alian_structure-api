import { Controller, Get, Post, Res } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
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
   * and KYC is unrelated to operational metrics.
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
  async getMetrics(@Res({ passthrough: true }) res: Response): Promise<string> {
    // Make sure the response carries the Prometheus text-exposition content
    // type. Without this, NestJS's default handler would JSON-encode the
    // response body and scrapers would reject the payload as invalid.
    res.setHeader("Content-Type", register.contentType);
    return register.metrics();
  }
}



