import { Injectable, Logger } from "@nestjs/common";
import { ConnectionManagerService } from "./connection-manager.service";
import { ConnectionPoolService } from "./connection-pool.service";
import { EventBufferService } from "./event-buffer.service";
import { HealthCheckResult } from "../interfaces/websocket.interfaces";

@Injectable()
export class WebSocketHealthService {
  private readonly logger = new Logger(WebSocketHealthService.name);

  private readonly startTime = Date.now();

  constructor(
    private readonly connectionManager: ConnectionManagerService,
    private readonly connectionPool: ConnectionPoolService,
    private readonly eventBuffer: EventBufferService,
  ) {}

  /**
   * Perform health check on all WebSocket services
   */
  async checkHealth(): Promise<HealthCheckResult> {
    const stats = this.connectionManager.getStats();
    const poolStats = this.connectionPool.getAllStats();
    const bufferStats = this.eventBuffer.getStats();

    // Determine health status based on metrics
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    // Check for issues
    const stalePercent =
      stats.total > 0 ? (stats.stale / stats.total) * 100 : 0;
    const activePercent =
      stats.total > 0 ? (stats.active / stats.total) * 100 : 100;

    if (stalePercent > 50 || activePercent < 50) {
      status = "unhealthy";
    } else if (stalePercent > 20 || activePercent < 80) {
      status = "degraded";
    }

    // Check connection pool health
    for (const pool of poolStats) {
      if (pool.utilizationPercent > 95) {
        status = "unhealthy";
        this.logger.warn(
          `Pool ${pool.poolName} at ${pool.utilizationPercent}% utilization`,
        );
      } else if (pool.utilizationPercent > 80) {
        status = status === "unhealthy" ? status : "degraded";
      }
    }

    return {
      status,
      connections: {
        total: stats.total,
        active: stats.active,
        stale: stats.stale,
      },
      lastCheck: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Get detailed health report
   */
  async getDetailedReport(): Promise<{
    websocket: HealthCheckResult;
    connectionPools: any[];
    eventBuffer: any;
    timestamp: string;
  }> {
    const wsHealth = await this.checkHealth();
    const poolStats = this.connectionPool.getAllStats();
    const bufferStats = this.eventBuffer.getStats();

    return {
      websocket: wsHealth,
      connectionPools: poolStats,
      eventBuffer: bufferStats,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check if a specific connection is healthy
   */
  isConnectionHealthy(clientId: string): boolean {
    const connection = this.connectionManager.getConnectionInfo(clientId);
    if (!connection) return false;

    const timeSinceHeartbeat = Date.now() - connection.lastHeartbeat.getTime();
    return connection.isAlive && timeSinceHeartbeat < 30000; // 30 seconds threshold
  }

  /**
   * Perform cleanup of stale connections
   */
  async performCleanup(): Promise<{ cleaned: number; timestamp: string }> {
    const removed = this.connectionManager.cleanupInactiveConnections(
      5 * 60 * 1000,
    );
    const poolCleaned = this.connectionPool.cleanupStaleConnections();
    const bufferCleaned = this.eventBuffer.cleanupOldEvents(5 * 60 * 1000);

    const totalCleaned = removed.length + poolCleaned + bufferCleaned;

    this.logger.log(`Cleanup completed: ${totalCleaned} items removed`);

    return {
      cleaned: totalCleaned,
      timestamp: new Date().toISOString(),
    };
  }
}



