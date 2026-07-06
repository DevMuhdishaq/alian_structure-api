import * as fs from "fs";
import * as path from "path";

// Walk a Grafana dashboard JSON and collect every leaf string under
// `targets[*].expr` (PromQL expressions) so we can assert that every metric
// referenced in a panel is actually defined in the source code.
function collectPromqlExpressions(panel: any, out: string[] = []): string[] {
  if (panel && Array.isArray(panel.targets)) {
    for (const target of panel.targets) {
      if (typeof target?.expr === "string") {
        out.push(target.expr);
      }
    }
  }
  if (Array.isArray(panel?.panels)) {
    for (const child of panel.panels) collectPromqlExpressions(child, out);
  }
  return out;
}

describe("Grafana application-overview dashboard (issue #25)", () => {
  const dashboardPath = path.join(
    __dirname,
    "..",
    "..",
    "monitoring",
    "grafana",
    "dashboards",
    "application-overview.json",
  );
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dashboard = JSON.parse(fs.readFileSync(dashboardPath, "utf8"));

  // The Prometheus metrics that the source codebase registers.
  const registeredMetricNames = new Set([
    // src/config/metrics.ts
    "alian_structure_http_request_duration_seconds",
    "alian_structure_http_requests_total",
    "alian_structure_http_requests_in_progress",
    "alian_structure_database_query_duration_seconds",
    "alian_structure_active_connections",
    "alian_structure_errors_total",
    "alian_structure_user_signups_total",
    "alian_structure_active_users",
    "alian_structure_job_duration_seconds",
    "alian_structure_job_success_total",
    "alian_structure_job_failure_total",
    "alian_structure_queue_length",
    // src/observability/performance-baseline.service.ts
    "alian_structure_baseline_p50_seconds",
    "alian_structure_baseline_p95_seconds",
    "alian_structure_baseline_p99_seconds",
    "alian_structure_performance_regressions_total",
    "alian_structure_request_duration_baseline_seconds",
    // prom-client defaults (with our `alian_structure_` prefix)
    "alian_structure_process_cpu_user_seconds_total",
    "alian_structure_process_cpu_system_seconds_total",
    "alian_structure_process_resident_memory_bytes",
    "alian_structure_nodejs_heap_size_used_bytes",
    "alian_structure_nodejs_external_memory_bytes",
    "alian_structure_nodejs_eventloop_lag_seconds",
    "alian_structure_nodejs_active_handles_total",
    "alian_structure_nodejs_active_requests_total",
    "alian_structure_process_uptime_seconds",
  ]);

  it("is a valid Grafana 10+ dashboard JSON", () => {
    expect(dashboard).toBeDefined();
    expect(typeof dashboard.title).toBe("string");
    expect(dashboard.title).toContain("Alian Structure");
    expect(dashboard.schemaVersion).toBeGreaterThanOrEqual(38);
    expect(dashboard.refresh).toMatch(/^\d+s$/);
    expect(Array.isArray(dashboard.panels)).toBe(true);
    expect(dashboard.panels.length).toBeGreaterThan(15);
  });

  it("configures auto-refresh at 10s (acceptance criterion)", () => {
    expect(dashboard.refresh).toBe("10s");
  });

  it("exposes a Prometheus datasource variable for portability", () => {
    const vars = dashboard.templating?.list ?? [];
    const ds = vars.find((v: any) => v.name === "DS_PROMETHEUS");
    expect(ds).toBeDefined();
    expect(ds.type).toBe("datasource");
  });

  it("contains the required panels from the acceptance criteria", () => {
    const titles = new Set<string>();
    for (const panel of dashboard.panels) {
      if (typeof panel?.title === "string") titles.add(panel.title);
    }
    const required = [
      /Request Rate/i,
      /Error Rate/i,
      /Latency.*p50/i,
      /Latency.*p95/i,
      /Latency.*p99/i,
      /CPU Usage/i,
      /Memory Usage/i,
      /Active Connections/i,
      /User Signups/i,
      /Active Users/i,
      /Performance Regressions/i,
    ];
    for (const pattern of required) {
      const found = Array.from(titles).some((t) => pattern.test(t));
      expect(found).toBe(true);
    }
  });

  it("only references metric names that the codebase actually registers", () => {
    const exprs = dashboard.panels.flatMap((p: any) =>
      collectPromqlExpressions(p),
    );
    const referenced = new Set<string>();
    const metricRegex = /alian_structure_[a-zA-Z0-9_]+/g;
    for (const expr of exprs) {
      const matches = expr.match(metricRegex) ?? [];
      for (const m of matches) referenced.add(m);
    }

    expect(referenced.size).toBeGreaterThan(10);
    for (const name of referenced) {
      // Allow family names (counters/gauges with _total / _bucket suffixes)
      const base = name
        .replace(/_total$/, "")
        .replace(/_bucket$/, "")
        .replace(/_count$/, "")
        .replace(/_sum$/, "");
      expect(
        registeredMetricNames.has(name) || registeredMetricNames.has(base),
      ).toBe(true);
    }
  });

  it("references quantile aggregation for percentile panels", () => {
    const exprs = dashboard.panels.flatMap((p: any) =>
      collectPromqlExpressions(p),
    );
    const joined = exprs.join("\n");
    expect(joined).toContain("histogram_quantile(0.50");
    expect(joined).toContain("histogram_quantile(0.95");
    expect(joined).toContain("histogram_quantile(0.99");
  });
});



