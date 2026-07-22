import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MonitoringController } from "./monitoring.controller";
import { MonitoringMetricsService } from "./monitoring-metrics.service";
import { SystemMetricsService } from "./system-metrics.service";
import { AlertRulesService } from "./alert-rules.service";
import { MetricsHistoryService } from "./metrics-history.service";

/**
 * Comprehensive monitoring & metrics module.
 *
 * Wires together:
 *  - {@link MonitoringMetricsService} — facade over the shared Prometheus registry
 *  - {@link SystemMetricsService}    — periodic CPU/memory/disk sampling
 *  - {@link AlertRulesService}       — configurable threshold alerting
 *  - {@link MetricsHistoryService}   — retained historical KPI time series
 *  - {@link MonitoringController}    — /metrics, health, alerts, history, dashboard
 *
 * The three timer-driven services are started in {@link onModuleInit} rather
 * than in their constructors so importing the module (e.g. in a unit test) does
 * not spawn background intervals.
 */
@Module({
  imports: [ConfigModule],
  controllers: [MonitoringController],
  providers: [
    MonitoringMetricsService,
    SystemMetricsService,
    AlertRulesService,
    MetricsHistoryService,
  ],
  exports: [
    MonitoringMetricsService,
    SystemMetricsService,
    AlertRulesService,
    MetricsHistoryService,
  ],
})
export class MonitoringModule implements OnModuleInit {
  constructor(
    private readonly systemMetrics: SystemMetricsService,
    private readonly alerts: AlertRulesService,
    private readonly history: MetricsHistoryService,
  ) {}

  onModuleInit(): void {
    this.systemMetrics.start();
    this.alerts.start();
    this.history.start();
  }
}
