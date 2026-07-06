import { Injectable, Logger } from "@nestjs/common";
import {
  BufferedEvent,
  DashboardEvent,
  EventBufferConfig,
} from "../interfaces/websocket.interfaces";

@Injectable()
export class EventBufferService {
  private readonly logger = new Logger(EventBufferService.name);

  // Map of userId -> BufferedEvent[]
  private eventBuffers: Map<string, BufferedEvent[]> = new Map();

  // Map of userId -> disconnected clientId
  private disconnectionTracker: Map<string, string> = new Map();

  // Configuration
  private readonly config: EventBufferConfig = {
    maxEvents: 1000, // Maximum 1000 events per user
    maxAge: 5 * 60 * 1000, // 5 minutes
    flushInterval: 60 * 1000, // Check every minute
  };

  /**
   * Start buffering events for a disconnected user
   */
  startBuffering(userId: string, clientId: string): void {
    if (!this.eventBuffers.has(userId)) {
      this.eventBuffers.set(userId, []);
    }
    this.disconnectionTracker.set(userId, clientId);
    this.logger.debug(
      `Started buffering events for user ${userId} (client: ${clientId})`,
    );
  }

  /**
   * Stop buffering and clear the buffer for a user
   */
  stopBuffering(userId: string): void {
    this.eventBuffers.delete(userId);
    this.disconnectionTracker.delete(userId);
    this.logger.debug(`Stopped buffering events for user ${userId}`);
  }

  /**
   * Buffer an event for a user
   */
  bufferEvent(userId: string, event: BufferedEvent): void {
    let buffer = this.eventBuffers.get(userId);

    if (!buffer) {
      buffer = [];
      this.eventBuffers.set(userId, buffer);
    }

    // Add event to buffer
    buffer.push({
      ...event,
      timestamp: event.timestamp || new Date(),
    });

    // Trim buffer if it exceeds max size
    if (buffer.length > this.config.maxEvents) {
      // Remove oldest events
      buffer.splice(0, buffer.length - this.config.maxEvents);
      this.logger.warn(
        `Buffer overflow for user ${userId}, trimmed to ${this.config.maxEvents} events`,
      );
    }
  }

  /**
   * Get all buffered events for a user
   */
  getBufferedEvents(userId: string): BufferedEvent[] {
    const buffer = this.eventBuffers.get(userId);
    if (!buffer) return [];

    // Clear buffer after retrieving
    const events = [...buffer];
    this.stopBuffering(userId);

    return events;
  }

  /**
   * Get events since a specific date
   */
  getEventsSince(userId: string, since: Date): BufferedEvent[] {
    const buffer = this.eventBuffers.get(userId);
    if (!buffer) return [];

    return buffer.filter((event) => event.timestamp >= since);
  }

  /**
   * Get the count of buffered events for a user
   */
  getBufferedEventCount(userId: string): number {
    const buffer = this.eventBuffers.get(userId);
    return buffer?.length || 0;
  }

  /**
   * Check if a user is being buffered
   */
  isBuffering(userId: string): boolean {
    return this.eventBuffers.has(userId);
  }

  /**
   * Clean up events older than the max age
   */
  cleanupOldEvents(maxAgeMs: number): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [userId, buffer] of this.eventBuffers.entries()) {
      const filteredBuffer = buffer.filter((event) => {
        const age = now - event.timestamp.getTime();
        return age <= maxAgeMs;
      });

      if (filteredBuffer.length === 0) {
        this.eventBuffers.delete(userId);
        this.disconnectionTracker.delete(userId);
      } else {
        this.eventBuffers.set(userId, filteredBuffer);
        cleaned += buffer.length - filteredBuffer.length;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} old buffered events`);
    }

    return cleaned;
  }

  /**
   * Clear all buffers (useful for testing)
   */
  clearAllBuffers(): void {
    this.eventBuffers.clear();
    this.disconnectionTracker.clear();
    this.logger.debug("Cleared all event buffers");
  }

  /**
   * Get buffer statistics
   */
  getStats(): {
    totalUsers: number;
    totalEvents: number;
    averageEventsPerUser: number;
    usersCurrentlyBuffering: number;
  } {
    let totalEvents = 0;

    for (const buffer of this.eventBuffers.values()) {
      totalEvents += buffer.length;
    }

    return {
      totalUsers: this.eventBuffers.size,
      totalEvents,
      averageEventsPerUser:
        this.eventBuffers.size > 0 ? totalEvents / this.eventBuffers.size : 0,
      usersCurrentlyBuffering: this.disconnectionTracker.size,
    };
  }

  /**
   * Get the disconnected client ID for a user
   */
  getDisconnectedClientId(userId: string): string | undefined {
    return this.disconnectionTracker.get(userId);
  }
}



