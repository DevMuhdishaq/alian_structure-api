import { Test, TestingModule } from "@nestjs/testing";
import { EventBufferService } from "./event-buffer.service";
import { DashboardEvent } from "../interfaces/websocket.interfaces";

describe("EventBufferService", () => {
  let service: EventBufferService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventBufferService],
    }).compile();

    service = module.get<EventBufferService>(EventBufferService);
  });

  afterEach(() => {
    service.clearAllBuffers();
    jest.clearAllMocks();
  });

  describe("startBuffering / stopBuffering", () => {
    it("should start buffering for a user", () => {
      service.startBuffering("user-123", "client-456");

      expect(service.isBuffering("user-123")).toBe(true);
      expect(service.getBufferedEventCount("user-123")).toBe(0);
    });

    it("should stop buffering and clear buffer", () => {
      service.startBuffering("user-123", "client-456");
      service.bufferEvent("user-123", {
        event: DashboardEvent.PORTFOLIO_UPDATE,
        data: { test: true },
        timestamp: new Date(),
      });

      service.stopBuffering("user-123");

      expect(service.isBuffering("user-123")).toBe(false);
      expect(service.getBufferedEventCount("user-123")).toBe(0);
    });
  });

  describe("bufferEvent", () => {
    it("should buffer events for a user", () => {
      service.startBuffering("user-123", "client-456");

      service.bufferEvent("user-123", {
        event: DashboardEvent.PORTFOLIO_UPDATE,
        data: { portfolioId: "123", totalValue: 1000 },
        timestamp: new Date(),
      });

      expect(service.getBufferedEventCount("user-123")).toBe(1);
    });

    it("should auto-create buffer when buffering starts", () => {
      service.startBuffering("user-123", "client-456");

      service.bufferEvent("user-123", {
        event: DashboardEvent.PORTFOLIO_UPDATE,
        data: {},
        timestamp: new Date(),
      });

      expect(service.isBuffering("user-123")).toBe(true);
    });
  });

  describe("getBufferedEvents", () => {
    it("should return and clear buffered events", () => {
      service.startBuffering("user-123", "client-456");

      service.bufferEvent("user-123", {
        event: DashboardEvent.PORTFOLIO_UPDATE,
        data: { test: 1 },
        timestamp: new Date(),
      });

      service.bufferEvent("user-123", {
        event: DashboardEvent.RISK_UPDATE,
        data: { test: 2 },
        timestamp: new Date(),
      });

      const events = service.getBufferedEvents("user-123");

      expect(events).toHaveLength(2);
      expect(service.getBufferedEventCount("user-123")).toBe(0);
    });

    it("should return empty array for user with no buffer", () => {
      const events = service.getBufferedEvents("nonexistent-user");
      expect(events).toHaveLength(0);
    });
  });

  describe("getEventsSince", () => {
    it("should return events since a specific date", () => {
      service.startBuffering("user-123", "client-456");

      const oldDate = new Date("2024-01-01T00:00:00Z");
      const newDate = new Date("2024-01-02T00:00:00Z");

      service.bufferEvent("user-123", {
        event: DashboardEvent.PORTFOLIO_UPDATE,
        data: { old: true },
        timestamp: oldDate,
      });

      service.bufferEvent("user-123", {
        event: DashboardEvent.PORTFOLIO_UPDATE,
        data: { new: true },
        timestamp: newDate,
      });

      const events = service.getEventsSince(
        "user-123",
        new Date("2024-01-01T12:00:00Z"),
      );

      expect(events).toHaveLength(1);
      expect(events[0].data.new).toBe(true);
    });
  });

  describe("cleanupOldEvents", () => {
    it("should remove events older than threshold", () => {
      service.startBuffering("user-123", "client-456");

      const oldDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      service.bufferEvent("user-123", {
        event: DashboardEvent.PORTFOLIO_UPDATE,
        data: { old: true },
        timestamp: oldDate,
      });

      service.bufferEvent("user-123", {
        event: DashboardEvent.PORTFOLIO_UPDATE,
        data: { recent: true },
        timestamp: new Date(),
      });

      const cleaned = service.cleanupOldEvents(5 * 60 * 1000); // 5 minute threshold

      expect(cleaned).toBe(1);
      expect(service.getBufferedEventCount("user-123")).toBe(1);
    });

    it("should clean up user with all old events", () => {
      service.startBuffering("user-123", "client-456");

      const oldDate = new Date(Date.now() - 10 * 60 * 1000);

      service.bufferEvent("user-123", {
        event: DashboardEvent.PORTFOLIO_UPDATE,
        data: { old: true },
        timestamp: oldDate,
      });

      service.cleanupOldEvents(5 * 60 * 1000);

      expect(service.isBuffering("user-123")).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      service.startBuffering("user-1", "client-1");
      service.startBuffering("user-2", "client-2");

      service.bufferEvent("user-1", {
        event: DashboardEvent.PORTFOLIO_UPDATE,
        data: {},
        timestamp: new Date(),
      });
      service.bufferEvent("user-1", {
        event: DashboardEvent.RISK_UPDATE,
        data: {},
        timestamp: new Date(),
      });
      service.bufferEvent("user-2", {
        event: DashboardEvent.ALLOCATION_UPDATE,
        data: {},
        timestamp: new Date(),
      });

      const stats = service.getStats();

      expect(stats.totalUsers).toBe(2);
      expect(stats.totalEvents).toBe(3);
      expect(stats.averageEventsPerUser).toBe(1.5);
    });
  });

  describe("getDisconnectedClientId", () => {
    it("should return the client ID that disconnected", () => {
      service.startBuffering("user-123", "client-456");

      const clientId = service.getDisconnectedClientId("user-123");
      expect(clientId).toBe("client-456");
    });

    it("should return undefined for user not buffering", () => {
      const clientId = service.getDisconnectedClientId("nonexistent");
      expect(clientId).toBeUndefined();
    });
  });

  describe("buffer overflow", () => {
    it("should limit buffer size to maxEvents", () => {
      service.startBuffering("user-123", "client-456");

      // Default maxEvents is 1000, but we'll test with internal limit
      for (let i = 0; i < 1500; i++) {
        service.bufferEvent("user-123", {
          event: DashboardEvent.PORTFOLIO_UPDATE,
          data: { index: i },
          timestamp: new Date(),
        });
      }

      // Buffer should be trimmed to max size
      const count = service.getBufferedEventCount("user-123");
      expect(count).toBeLessThanOrEqual(1000);
    });
  });
});



