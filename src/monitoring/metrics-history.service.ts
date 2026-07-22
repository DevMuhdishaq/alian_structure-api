import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SystemMetricsService } from "./system-metrics.service";

/**
 * A single time-series data point capturing the headline KPIs at one instant.
 * Kept intentionally flat and small so retaining thousands of points is cheap.
 */
export interface MetricHistoryPoint {
  timestamp: number; // epoch ms
  cpuUsagePercent: number;
  processCpuUsagePercent: number;
  memoryUsagePercent: number;
  diskUsagePercent: number | null;
  processHeapUsedBytes: number;
  processRssBytes: number;
}

export interface HistoryQuery {
  /** Only return points at or after this epoch-ms timestamp. */
  since?: number;
  /** Only return points at or before this epoch-ms timestamp. */
  until?: number;
  /** Cap the number of returned points (most recent first when limiting). */
  limit?: number;
}

/**
 * In-memory ring buffer of historical metric snapshots with configurable
 * retention. Retention is bounded two ways — by age
 * (`MONITORING_HISTORY_RETENTION_MS`) and by count
 * (`MONITORING_HISTORY_MAX_POINTS`) — so memory stays bounded regardless of the
 * sampling interval.
 *
 * This is deliberately process-local: durable long-term storage is Prometheus's
 * job. The store exists so the dashboard endpoint can render recent trends
 * without a round-trip to an external TSDB.
 */
@Injectable()
export class MetricsHistoryService implements OnModuleDestroy {
  private readonly logger = new Logger(MetricsHistoryService.name);
  private readonly retentionMs: number;
  private readonly maxPoints: number;
  private readonly intervalMs: number;
  private points: MetricHistoryPoint[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly systemMetrics: SystemMetricsService,
    private readonly configService?: ConfigService,
  ) {
    this.retentionMs =
      Number(this.configService?.get("MONITORING_HISTORY_RETENTION_MS")) ||
      24 * 60 * 60 * 1000; // 24h
    this.maxPoints =
      Number(this.configService?.get("MONITORING_HISTORY_MAX_POINTS")) || 5760;
    this.intervalMs =
      Number(this.configService?.get("MONITORING_HISTORY_INTERVAL_MS")) ||
      15000;
  }

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.capture(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /**
   * Record one point from the latest system snapshot, then prune. Public so
   * tests can drive it deterministically. No-op if no snapshot exists yet.
   */
  capture(now = Date.now()): MetricHistoryPoint | null {
    const snapshot = this.systemMetrics.getLatest();
    if (!snapshot) return null;

    const point: MetricHistoryPoint = {
      timestamp: now,
      cpuUsagePercent: snapshot.cpu.usagePercent,
      processCpuUsagePercent: snapshot.cpu.processUsagePercent,
      memoryUsagePercent: snapshot.memory.usagePercent,
      diskUsagePercent: snapshot.disk?.usagePercent ?? null,
      processHeapUsedBytes: snapshot.memory.processHeapUsedBytes,
      processRssBytes: snapshot.memory.processRssBytes,
    };

    this.points.push(point);
    this.prune(now);
    return point;
  }

  /** Drop points older than the retention window or beyond the count cap. */
  private prune(now: number): void {
    const cutoff = now - this.retentionMs;
    if (this.points.length && this.points[0].timestamp < cutoff) {
      this.points = this.points.filter((p) => p.timestamp >= cutoff);
    }
    if (this.points.length > this.maxPoints) {
      this.points = this.points.slice(this.points.length - this.maxPoints);
    }
  }

  /** Return retained points, optionally filtered by time range and count. */
  query(q: HistoryQuery = {}): MetricHistoryPoint[] {
    let result = this.points;
    if (q.since !== undefined) {
      result = result.filter((p) => p.timestamp >= q.since!);
    }
    if (q.until !== undefined) {
      result = result.filter((p) => p.timestamp <= q.until!);
    }
    if (q.limit !== undefined && result.length > q.limit) {
      result = result.slice(result.length - q.limit);
    }
    return [...result];
  }

  /** Number of retained points. */
  size(): number {
    return this.points.length;
  }

  /** Retention configuration, surfaced by the dashboard for transparency. */
  getRetention(): { retentionMs: number; maxPoints: number } {
    return { retentionMs: this.retentionMs, maxPoints: this.maxPoints };
  }

  /** Drop all retained points (testing / manual reset). */
  clear(): void {
    this.points = [];
  }
}
