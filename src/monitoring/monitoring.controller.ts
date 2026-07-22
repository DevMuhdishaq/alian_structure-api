import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { Public } from "../common/decorators/public.decorator";
import { SkipKyc } from "../common/decorators/skip-kyc.decorator";
import { MonitoringMetricsService } from "./monitoring-metrics.service";
import { SystemMetricsService } from "./system-metrics.service";
import { AlertRule, AlertRulesService } from "./alert-rules.service";
import { MetricsHistoryService } from "./metrics-history.service";

/**
 * Public-facing monitoring surface.
 *
 * - `GET /metrics`               Prometheus text-exposition scrape endpoint.
 * - `GET /monitoring/health`     Composite health incl. resource pressure.
 * - `GET /monitoring/system`     Latest raw CPU/memory/disk snapshot.
 * - `GET /monitoring/alerts`     Active alerts + all rule states.
 * - CRUD `/monitoring/alerts/rules`  Manage threshold rules.
 * - `GET /monitoring/history`    Historical KPI time series.
 * - `GET /monitoring/dashboard`  Aggregated KPI summary for a dashboard UI.
 *
 * Marked `@Public()`/`@SkipKyc()` because scrapers and probes have no JWT. The
 * `/metrics` endpoint can additionally be gated with `METRICS_AUTH_TOKEN`.
 */
@ApiTags("Monitoring")
@Controller()
@Public()
@SkipKyc()
export class MonitoringController {
  constructor(
    private readonly metrics: MonitoringMetricsService,
    private readonly systemMetrics: SystemMetricsService,
    private readonly alerts: AlertRulesService,
    private readonly history: MetricsHistoryService,
  ) {}

  @Get("metrics")
  @ApiOperation({
    summary: "Prometheus metrics endpoint",
    description:
      "Returns all registered Prometheus metrics in text-exposition format for scraping.",
  })
  @ApiResponse({ status: 200, description: "Prometheus metrics" })
  async getMetrics(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    this.assertMetricsAuthorized(req);
    res.setHeader("Content-Type", this.metrics.contentType);
    return this.metrics.render();
  }

  @Get("monitoring/health")
  @ApiOperation({
    summary: "Monitoring health summary",
    description:
      "Reports overall system status derived from resource pressure and active alerts.",
  })
  @ApiResponse({ status: 200, description: "Monitoring health summary" })
  getHealth(@Res({ passthrough: true }) res: Response) {
    const snapshot = this.systemMetrics.getLatest();
    const activeAlerts = this.alerts.getActiveAlerts();
    const hasCritical = activeAlerts.some(
      (a) => a.rule.severity === "critical",
    );
    const status = hasCritical
      ? "critical"
      : activeAlerts.length > 0
        ? "degraded"
        : "ok";

    if (status === "critical") {
      res.status(503);
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      resources: snapshot
        ? {
            cpuUsagePercent: snapshot.cpu.usagePercent,
            memoryUsagePercent: snapshot.memory.usagePercent,
            diskUsagePercent: snapshot.disk?.usagePercent ?? null,
          }
        : null,
      activeAlerts: activeAlerts.length,
    };
  }

  @Get("monitoring/system")
  @ApiOperation({ summary: "Latest system resource snapshot" })
  @ApiResponse({ status: 200, description: "CPU/memory/disk snapshot" })
  async getSystem() {
    // Force a fresh sample so a manual call is never stale.
    return this.systemMetrics.collect();
  }

  @Get("monitoring/alerts")
  @ApiOperation({ summary: "Active alerts and all rule states" })
  @ApiResponse({ status: 200, description: "Alert states" })
  getAlerts() {
    // Evaluate synchronously so the response reflects the current instant.
    this.alerts.evaluate();
    return {
      active: this.alerts.getActiveAlerts(),
      states: this.alerts.getAllAlertStates(),
    };
  }

  @Get("monitoring/alerts/rules")
  @ApiOperation({ summary: "List configured alert rules" })
  @ApiResponse({ status: 200, description: "Alert rules" })
  listRules() {
    return this.alerts.listRules();
  }

  @Post("monitoring/alerts/rules")
  @ApiOperation({ summary: "Create or update an alert rule" })
  @ApiResponse({ status: 201, description: "Rule upserted" })
  upsertRule(@Body() rule: AlertRule) {
    return this.alerts.upsertRule(rule);
  }

  @Delete("monitoring/alerts/rules/:id")
  @ApiOperation({ summary: "Delete an alert rule" })
  @ApiResponse({ status: 200, description: "Rule deletion result" })
  removeRule(@Param("id") id: string) {
    return { removed: this.alerts.removeRule(id) };
  }

  @Get("monitoring/history")
  @ApiOperation({ summary: "Historical KPI time series" })
  @ApiResponse({ status: 200, description: "Historical metric points" })
  getHistory(
    @Query("since") since?: string,
    @Query("until") until?: string,
    @Query("limit") limit?: string,
  ) {
    const points = this.history.query({
      since: since ? Number(since) : undefined,
      until: until ? Number(until) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return {
      retention: this.history.getRetention(),
      count: points.length,
      points,
    };
  }

  @Get("monitoring/dashboard")
  @ApiOperation({
    summary: "Dashboard KPI summary",
    description:
      "Aggregated key performance indicators for a monitoring dashboard UI.",
  })
  @ApiResponse({ status: 200, description: "Dashboard KPIs" })
  async getDashboard() {
    const snapshot =
      this.systemMetrics.getLatest() ?? (await this.systemMetrics.collect());
    const activeAlerts = this.alerts.getActiveAlerts();
    const recent = this.history.query({ limit: 60 });

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      kpis: {
        cpuUsagePercent: snapshot.cpu.usagePercent,
        processCpuUsagePercent: snapshot.cpu.processUsagePercent,
        memoryUsagePercent: snapshot.memory.usagePercent,
        diskUsagePercent: snapshot.disk?.usagePercent ?? null,
        loadAverage: snapshot.cpu.loadAverage,
        heapUsedBytes: snapshot.memory.processHeapUsedBytes,
        rssBytes: snapshot.memory.processRssBytes,
      },
      alerts: {
        active: activeAlerts.length,
        critical: activeAlerts.filter((a) => a.rule.severity === "critical")
          .length,
        warning: activeAlerts.filter((a) => a.rule.severity === "warning")
          .length,
        items: activeAlerts,
      },
      trend: recent,
    };
  }

  // --- token gate (mirrors ObservabilityController) --------------------------

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
    if (bufA.length !== bufB.length) {
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
