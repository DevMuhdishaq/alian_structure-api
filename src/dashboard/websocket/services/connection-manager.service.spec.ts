import { Test, TestingModule } from "@nestjs/testing";
import { ConnectionManagerService } from "./connection-manager.service";

describe("ConnectionManagerService", () => {
  let service: ConnectionManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConnectionManagerService],
    }).compile();

    service = module.get<ConnectionManagerService>(ConnectionManagerService);
  });

  afterEach(() => {
    // Clean up any remaining connections
    jest.clearAllMocks();
  });

  describe("registerConnection", () => {
    it("should register a new connection", async () => {
      const clientId = "client-123";
      const info = {
        userId: "user-456",
        clientId,
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection(clientId, info);

      const result = service.getConnectionInfo(clientId);
      expect(result).toBeTruthy();
      expect(result?.userId).toBe("user-456");
      expect(result?.isAlive).toBe(true);
    });

    it("should track multiple connections per user", async () => {
      const info1 = {
        userId: "user-1",
        clientId: "client-1",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      const info2 = {
        userId: "user-1",
        clientId: "client-2",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection("client-1", info1);
      await service.registerConnection("client-2", info2);

      const userConnections = service.getUserConnections("user-1");
      expect(userConnections).toHaveLength(2);
    });

    it("should detect active connections", async () => {
      const info = {
        userId: "user-1",
        clientId: "client-1",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection("client-1", info);

      expect(service.hasActiveConnection("user-1")).toBe(true);
      expect(service.hasActiveConnection("user-2")).toBe(false);
    });
  });

  describe("updateHeartbeat", () => {
    it("should update heartbeat timestamp", async () => {
      const originalTime = new Date("2024-01-01T00:00:00Z");
      const info = {
        userId: "user-1",
        clientId: "client-1",
        connectedAt: originalTime,
        lastHeartbeat: originalTime,
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection("client-1", info);

      // Wait a bit and update heartbeat
      service.updateHeartbeat("client-1");

      const result = service.getConnectionInfo("client-1");
      expect(result?.lastHeartbeat.getTime()).toBeGreaterThan(
        originalTime.getTime(),
      );
    });
  });

  describe("markDisconnected", () => {
    it("should mark connection as disconnected", async () => {
      const info = {
        userId: "user-1",
        clientId: "client-1",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection("client-1", info);
      service.markDisconnected("client-1");

      const result = service.getConnectionInfo("client-1");
      expect(result?.isAlive).toBe(false);
      expect(service.hasActiveConnection("user-1")).toBe(false);
    });
  });

  describe("getStaleConnections", () => {
    it("should identify stale connections", async () => {
      const oldTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const info = {
        userId: "user-1",
        clientId: "client-1",
        connectedAt: oldTime,
        lastHeartbeat: oldTime,
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection("client-1", info);

      // 5 minute threshold
      const stale = service.getStaleConnections(5 * 60 * 1000);

      expect(stale.has("client-1")).toBe(true);
    });

    it("should not identify recent connections as stale", async () => {
      const info = {
        userId: "user-1",
        clientId: "client-1",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection("client-1", info);

      const stale = service.getStaleConnections(5 * 60 * 1000);

      expect(stale.has("client-1")).toBe(false);
    });
  });

  describe("subscriptions", () => {
    it("should subscribe to portfolio", async () => {
      const info = {
        userId: "user-1",
        clientId: "client-1",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection("client-1", info);
      service.subscribeToPortfolio("client-1", "portfolio-123");

      const result = service.getConnectionInfo("client-1");
      expect(result?.subscriptions).toContain("portfolio-123");
    });

    it("should unsubscribe from portfolio", async () => {
      const info = {
        userId: "user-1",
        clientId: "client-1",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection("client-1", info);
      service.subscribeToPortfolio("client-1", "portfolio-123");
      service.unsubscribeFromPortfolio("client-1", "portfolio-123");

      const result = service.getConnectionInfo("client-1");
      expect(result?.subscriptions).not.toContain("portfolio-123");
    });

    it("should get portfolio subscribers", async () => {
      const info1 = {
        userId: "user-1",
        clientId: "client-1",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      const info2 = {
        userId: "user-2",
        clientId: "client-2",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection("client-1", info1);
      await service.registerConnection("client-2", info2);

      service.subscribeToPortfolio("client-1", "portfolio-123");
      service.subscribeToPortfolio("client-2", "portfolio-123");

      const subscribers = service.getPortfolioSubscribers("portfolio-123");
      expect(subscribers).toHaveLength(2);
      expect(subscribers).toContain("client-1");
      expect(subscribers).toContain("client-2");
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", async () => {
      const info1 = {
        userId: "user-1",
        clientId: "client-1",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      const info2 = {
        userId: "user-2",
        clientId: "client-2",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection("client-1", info1);
      await service.registerConnection("client-2", info2);

      // Mark one as disconnected
      service.markDisconnected("client-2");

      const stats = service.getStats();

      expect(stats.total).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.stale).toBe(1);
    });
  });

  describe("removeConnection", () => {
    it("should remove connection completely", async () => {
      const info = {
        userId: "user-1",
        clientId: "client-1",
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        isAlive: true,
        subscriptions: [],
      };

      await service.registerConnection("client-1", info);
      service.removeConnection("client-1");

      const result = service.getConnectionInfo("client-1");
      expect(result).toBeNull();
      expect(service.getConnectionCount()).toBe(0);
    });
  });
});



