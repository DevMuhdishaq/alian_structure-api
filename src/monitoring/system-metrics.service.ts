import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import * as fs from "fs";
import { promisify } from "util";
import {
  systemCpuUsagePercent,
  processCpuUsagePercent,
  systemLoadAverage,
  systemMemoryUsageBytes,
  systemMemoryUsagePercent,
  systemDiskUsageBytes,
  systemDiskUsagePercent,
} from "./monitoring.metrics";

const statfs = (fs as any).statfs ? promisify((fs as any).statfs) : undefined;

/**
 * A point-in-time view of host and process resource usage. Returned by
 * {@link SystemMetricsService.collect} for the dashboard / history APIs and
 * mirrored into Prometheus gauges on every sample.
 */
export interface SystemMetricsSnapshot {
  timestamp: string;
  cpu: {
    /** System-wide CPU utilisation, 0-100. */
    usagePercent: number;
    /** This process's CPU utilisation, 0-100. */
    processUsagePercent: number;
    cores: number;
    loadAverage: { "1m": number; "5m": number; "15m": number };
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
    processRssBytes: number;
    processHeapUsedBytes: number;
    processHeapTotalBytes: number;
  };
  disk: {
    mount: string;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
  } | null;
}

/**
 * Periodically samples host CPU, memory and disk usage and publishes the
 * results both as a queryable snapshot and as Prometheus gauges.
 *
 * CPU utilisation is derived from deltas between successive samples of
 * `os.cpus()` times (system) and `process.cpuUsage()` (process), so the very
 * first sample after start reports 0 until a baseline exists.
 */
@Injectable()
export class SystemMetricsService implements OnModuleDestroy {
  private readonly logger = new Logger(SystemMetricsService.name);
  private readonly intervalMs: number;
  private readonly diskMount: string;
  private timer: NodeJS.Timeout | null = null;

  private lastCpuInfo: { idle: number; total: number } | null = null;
  private lastProcessCpu: NodeJS.CpuUsage | null = null;
  private lastProcessHrtime: bigint | null = null;

  private latest: SystemMetricsSnapshot | null = null;

  constructor(private readonly configService?: ConfigService) {
    this.intervalMs =
      Number(this.configService?.get("MONITORING_SYSTEM_INTERVAL_MS")) || 15000;
    this.diskMount =
      this.configService?.get<string>("MONITORING_DISK_MOUNT") ||
      (process.platform === "win32" ? "C:\\" : "/");
  }

  /**
   * Begin periodic collection. Called by the module on init. Safe to call more
   * than once — an existing timer is cleared first. `unref()` keeps the timer
   * from holding the event loop open during shutdown/tests.
   */
  start(): void {
    this.stop();
    // Prime the CPU baselines and take an initial synchronous-ish sample so
    // the first API read has data even before the interval fires.
    this.captureCpuBaseline();
    void this.collect();
    this.timer = setInterval(() => {
      void this.collect().catch((err) =>
        this.logger.warn(`System metrics collection failed: ${err.message}`),
      );
    }, this.intervalMs);
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

  /** Most recent snapshot, or null if collection hasn't run yet. */
  getLatest(): SystemMetricsSnapshot | null {
    return this.latest;
  }

  /**
   * Sample every resource, update the Prometheus gauges, cache the snapshot and
   * return it.
   */
  async collect(): Promise<SystemMetricsSnapshot> {
    const cpu = this.collectCpu();
    const memory = this.collectMemory();
    const disk = await this.collectDisk();

    // Publish to Prometheus gauges.
    systemCpuUsagePercent.set(cpu.usagePercent);
    processCpuUsagePercent.set(cpu.processUsagePercent);
    systemLoadAverage.labels("1m").set(cpu.loadAverage["1m"]);
    systemLoadAverage.labels("5m").set(cpu.loadAverage["5m"]);
    systemLoadAverage.labels("15m").set(cpu.loadAverage["15m"]);

    systemMemoryUsageBytes.labels("total").set(memory.totalBytes);
    systemMemoryUsageBytes.labels("used").set(memory.usedBytes);
    systemMemoryUsageBytes.labels("free").set(memory.freeBytes);
    systemMemoryUsageBytes.labels("process_rss").set(memory.processRssBytes);
    systemMemoryUsageBytes
      .labels("process_heap_used")
      .set(memory.processHeapUsedBytes);
    systemMemoryUsagePercent.set(memory.usagePercent);

    if (disk) {
      systemDiskUsageBytes.labels(disk.mount, "total").set(disk.totalBytes);
      systemDiskUsageBytes.labels(disk.mount, "used").set(disk.usedBytes);
      systemDiskUsageBytes.labels(disk.mount, "free").set(disk.freeBytes);
      systemDiskUsagePercent.labels(disk.mount).set(disk.usagePercent);
    }

    const snapshot: SystemMetricsSnapshot = {
      timestamp: new Date().toISOString(),
      cpu,
      memory,
      disk,
    };
    this.latest = snapshot;
    return snapshot;
  }

  private captureCpuBaseline(): void {
    this.lastCpuInfo = this.readCpuTimes();
    this.lastProcessCpu = process.cpuUsage();
    this.lastProcessHrtime = process.hrtime.bigint();
  }

  private readCpuTimes(): { idle: number; total: number } {
    const cpus = os.cpus() ?? [];
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      const t = cpu.times;
      idle += t.idle;
      total += t.user + t.nice + t.sys + t.idle + t.irq;
    }
    return { idle, total };
  }

  private collectCpu(): SystemMetricsSnapshot["cpu"] {
    const cores = os.cpus()?.length ?? 1;

    // System CPU from idle/total deltas.
    const current = this.readCpuTimes();
    let usagePercent = 0;
    if (this.lastCpuInfo) {
      const idleDelta = current.idle - this.lastCpuInfo.idle;
      const totalDelta = current.total - this.lastCpuInfo.total;
      if (totalDelta > 0) {
        usagePercent = clampPercent((1 - idleDelta / totalDelta) * 100);
      }
    }
    this.lastCpuInfo = current;

    // Process CPU from cpuUsage delta over wall-clock delta.
    let processUsagePercent = 0;
    const nowHr = process.hrtime.bigint();
    const cpuNow = process.cpuUsage();
    if (this.lastProcessCpu && this.lastProcessHrtime) {
      const elapsedUs = Number(nowHr - this.lastProcessHrtime) / 1000;
      const cpuUs =
        cpuNow.user -
        this.lastProcessCpu.user +
        (cpuNow.system - this.lastProcessCpu.system);
      if (elapsedUs > 0) {
        // Divide by core count so a fully-busy single core on an 8-core box
        // reads ~12.5%, consistent with the system metric's scale.
        processUsagePercent = clampPercent((cpuUs / elapsedUs / cores) * 100);
      }
    }
    this.lastProcessCpu = cpuNow;
    this.lastProcessHrtime = nowHr;

    const [l1, l5, l15] = os.loadavg();
    return {
      usagePercent,
      processUsagePercent,
      cores,
      loadAverage: { "1m": l1, "5m": l5, "15m": l15 },
    };
  }

  private collectMemory(): SystemMetricsSnapshot["memory"] {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = totalBytes - freeBytes;
    const mem = process.memoryUsage();
    return {
      totalBytes,
      usedBytes,
      freeBytes,
      usagePercent:
        totalBytes > 0 ? clampPercent((usedBytes / totalBytes) * 100) : 0,
      processRssBytes: mem.rss,
      processHeapUsedBytes: mem.heapUsed,
      processHeapTotalBytes: mem.heapTotal,
    };
  }

  private async collectDisk(): Promise<SystemMetricsSnapshot["disk"]> {
    // `fs.statfs` landed in Node 18.15+. When unavailable we degrade
    // gracefully rather than shell out to `df`, which would be platform
    // specific and slow.
    if (!statfs) return null;
    try {
      const stats: any = await statfs(this.diskMount);
      const blockSize = stats.bsize;
      const totalBytes = stats.blocks * blockSize;
      const freeBytes = stats.bavail * blockSize;
      const usedBytes = totalBytes - freeBytes;
      return {
        mount: this.diskMount,
        totalBytes,
        usedBytes,
        freeBytes,
        usagePercent:
          totalBytes > 0 ? clampPercent((usedBytes / totalBytes) * 100) : 0,
      };
    } catch (err: any) {
      this.logger.debug(
        `Disk metrics unavailable for ${this.diskMount}: ${err.message}`,
      );
      return null;
    }
  }
}

/** Bound a computed percentage to [0, 100] to guard against clock skew jitter. */
function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Number(value.toFixed(2))));
}
