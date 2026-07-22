import { Injectable } from "@nestjs/common";
import client from "prom-client";
import { register } from "../config/metrics";
import {
  customOperationDuration,
  customOperationTotal,
} from "./monitoring.metrics";

/**
 * Options accepted when lazily creating a business metric.
 */
export interface BusinessMetricOptions {
  name: string;
  help: string;
  labelNames?: string[];
  /** Histogram bucket boundaries (seconds/units). Ignored for other types. */
  buckets?: number[];
}

/**
 * Thin, injectable facade over the shared prom-client registry.
 *
 * Application code should depend on this service rather than reaching into
 * `src/config/metrics.ts` directly: it owns metric lifecycle (idempotent
 * creation, so requesting the same metric twice returns the existing one),
 * exposes the raw text-exposition output for the `/metrics` endpoint, and gives
 * decorators a stable place to record custom operation timings.
 */
@Injectable()
export class MonitoringMetricsService {
  /** The shared registry every collector is registered against. */
  readonly registry = register;

  /** Prometheus content type used by the scrape endpoint. */
  get contentType(): string {
    return register.contentType;
  }

  /** Render every registered metric in Prometheus text-exposition format. */
  async render(): Promise<string> {
    return register.metrics();
  }

  /**
   * Return a counter, creating it on first use. Safe to call repeatedly — the
   * same collector instance is returned so callers never trigger prom-client's
   * "already registered" guard.
   */
  counter(options: BusinessMetricOptions): client.Counter {
    const existing = register.getSingleMetric(options.name);
    if (existing) return existing as client.Counter;
    return new client.Counter({
      name: options.name,
      help: options.help,
      labelNames: options.labelNames ?? [],
      registers: [register],
    });
  }

  /** Return a gauge, creating it on first use (idempotent). */
  gauge(options: BusinessMetricOptions): client.Gauge {
    const existing = register.getSingleMetric(options.name);
    if (existing) return existing as client.Gauge;
    return new client.Gauge({
      name: options.name,
      help: options.help,
      labelNames: options.labelNames ?? [],
      registers: [register],
    });
  }

  /** Return a histogram, creating it on first use (idempotent). */
  histogram(options: BusinessMetricOptions): client.Histogram {
    const existing = register.getSingleMetric(options.name);
    if (existing) return existing as client.Histogram;
    return new client.Histogram({
      name: options.name,
      help: options.help,
      labelNames: options.labelNames ?? [],
      // prom-client requires an explicit bucket array — fall back to its own
      // default boundaries when the caller doesn't supply any.
      buckets: options.buckets ?? client.linearBuckets(0.05, 0.1, 10),
      registers: [register],
    });
  }

  /**
   * Increment a named business counter by `value` (default 1). The counter is
   * created on demand. `labels` are applied when provided.
   */
  incrementCounter(
    options: BusinessMetricOptions,
    labels?: Record<string, string | number>,
    value = 1,
  ): void {
    const counter = this.counter(options);
    if (labels) {
      counter.inc(labels, value);
    } else {
      counter.inc(value);
    }
  }

  /** Set a named business gauge to `value`. The gauge is created on demand. */
  setGauge(
    options: BusinessMetricOptions,
    value: number,
    labels?: Record<string, string | number>,
  ): void {
    const gauge = this.gauge(options);
    if (labels) {
      gauge.set(labels, value);
    } else {
      gauge.set(value);
    }
  }

  /**
   * Record the outcome of an instrumented operation against the shared custom
   * operation metrics. Used by the {@link Monitor} decorator, but also callable
   * directly for operations that can't be wrapped by a decorator.
   */
  observeOperation(
    operation: string,
    durationSeconds: number,
    status: "success" | "error",
  ): void {
    customOperationDuration.labels(operation, status).observe(durationSeconds);
    customOperationTotal.labels(operation, status).inc();
  }

  /**
   * Return a plain-object snapshot of the current value of every metric.
   * Powers the historical store and dashboard KPI summary without re-parsing
   * the text-exposition format.
   */
  async snapshot(): Promise<
    client.MetricObjectWithValues<client.MetricValue<string>>[]
  > {
    return register.getMetricsAsJSON();
  }
}
