import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getDataSourceToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { HealthService } from "./health.service";
import { HEALTH_REDIS_CLIENT } from "./health.constants";

const makeDataSource = (
  overrides: Partial<DataSource> = {},
): Partial<DataSource> => ({
  query: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
  isInitialized: true,
  ...overrides,
});

const makeRedis = (overrides: Record<string, any> = {}): any => ({
  ping: jest.fn().mockResolvedValue("PONG"),
  ...overrides,
});

const makeConfigService = (timeoutMs?: number): Partial<ConfigService> => ({
  get: jest.fn((key: string) =>
    key === "HEALTH_CHECK_TIMEOUT_MS" ? timeoutMs : undefined,
  ),
});

async function buildService(
  ds: Partial<DataSource>,
  redis: any,
  timeoutMs?: number,
): Promise<HealthService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      HealthService,
      { provide: getDataSourceToken(), useValue: ds },
      { provide: ConfigService, useValue: makeConfigService(timeoutMs) },
      { provide: HEALTH_REDIS_CLIENT, useValue: redis },
    ],
  }).compile();
  return module.get<HealthService>(HealthService);
}

describe("HealthService", () => {
  let service: HealthService;
  let mockDs: Partial<DataSource>;
  let mockRedis: any;

  beforeEach(async () => {
    mockDs = makeDataSource();
    mockRedis = makeRedis();
    service = await buildService(mockDs, mockRedis);
  });

  describe("getLiveness", () => {
    it("returns ok status with application component up", () => {
      const result = service.getLiveness();
      expect(result.status).toBe("ok");
      expect(result.components.application.status).toBe("up");
    });

    it("includes a valid ISO timestamp", () => {
      const result = service.getLiveness();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it("includes process uptime", () => {
      const result = service.getLiveness();
      expect(typeof result.uptime).toBe("number");
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getReadiness", () => {
    it("returns ok when database and redis are up", async () => {
      const result = await service.getReadiness();
      expect(result.status).toBe("ok");
      expect(result.components.database.status).toBe("up");
      expect(result.components.redis.status).toBe("up");
    });

    it("includes responseTime for database", async () => {
      const result = await service.getReadiness();
      expect(typeof result.components.database.responseTime).toBe("number");
    });

    it("includes responseTime for redis", async () => {
      const result = await service.getReadiness();
      expect(typeof result.components.redis.responseTime).toBe("number");
    });

    it("returns degraded when only redis is down", async () => {
      mockRedis.ping.mockRejectedValue(new Error("Connection refused"));
      const result = await service.getReadiness();
      expect(result.status).toBe("degraded");
      expect(result.components.database.status).toBe("up");
      expect(result.components.redis.status).toBe("down");
    });

    it("returns degraded when only database is down", async () => {
      (mockDs.query as jest.Mock).mockRejectedValue(new Error("DB offline"));
      const result = await service.getReadiness();
      expect(result.status).toBe("degraded");
      expect(result.components.database.status).toBe("down");
      expect(result.components.redis.status).toBe("up");
    });

    it("returns error when all components are down", async () => {
      (mockDs.query as jest.Mock).mockRejectedValue(new Error("DB offline"));
      mockRedis.ping.mockRejectedValue(new Error("Redis offline"));
      const result = await service.getReadiness();
      expect(result.status).toBe("error");
      expect(result.components.database.status).toBe("down");
      expect(result.components.redis.status).toBe("down");
    });

    it("reports down with error message on database failure", async () => {
      (mockDs.query as jest.Mock).mockRejectedValue(
        new Error("connection timeout"),
      );
      const result = await service.getReadiness();
      expect(result.components.database.message).toContain(
        "connection timeout",
      );
    });

    it("reports down with message when redis is not configured", async () => {
      const svc = await buildService(mockDs, null);
      const result = await svc.getReadiness();
      expect(result.components.redis.status).toBe("down");
      expect(result.components.redis.message).toContain("REDIS_URL missing");
    });

    it("returns degraded (not error) when one component is down and redis is unconfigured", async () => {
      // DB up, redis unconfigured → "down" for redis but db is up → degraded
      const svc = await buildService(mockDs, null);
      const result = await svc.getReadiness();
      expect(result.status).toBe("degraded");
    });

    it("returns down with timeout message when database times out", async () => {
      // 50ms timeout, query never resolves within that window
      (mockDs.query as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      );
      const shortSvc = await buildService(mockDs, null, 50);
      const result = await shortSvc.getReadiness();
      expect(result.components.database.status).toBe("down");
      expect(result.components.database.message).toContain("timed out");
    }, 10000);

    it("includes a valid ISO timestamp", async () => {
      const result = await service.getReadiness();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  describe("getStartup", () => {
    it("returns ok when database is up and ORM is initialized", async () => {
      const result = await service.getStartup();
      expect(result.status).toBe("ok");
      expect(result.components.database.status).toBe("up");
      expect(result.components.orm.status).toBe("up");
    });

    it("includes redis component when redis client is configured", async () => {
      const result = await service.getStartup();
      expect(result.components.redis).toBeDefined();
      expect(result.components.redis.status).toBe("up");
    });

    it("omits redis component when redis is not configured", async () => {
      const svc = await buildService(mockDs, null);
      const result = await svc.getStartup();
      expect(result.components.redis).toBeUndefined();
    });

    it("returns error when ORM is not initialized", async () => {
      const uninitDs = makeDataSource({ isInitialized: false });
      const svc = await buildService(uninitDs, null);
      const result = await svc.getStartup();
      expect(result.status).toBe("error");
      expect(result.components.orm.status).toBe("down");
      expect(result.components.orm.message).toContain("not initialized");
    });

    it("returns error when database is down", async () => {
      (mockDs.query as jest.Mock).mockRejectedValue(new Error("no connection"));
      const result = await service.getStartup();
      expect(result.status).toBe("error");
      expect(result.components.database.status).toBe("down");
    });

    it("returns error when redis is configured but down", async () => {
      mockRedis.ping.mockRejectedValue(new Error("Redis gone"));
      const result = await service.getStartup();
      expect(result.status).toBe("error");
      expect(result.components.redis.status).toBe("down");
    });

    it("includes a valid ISO timestamp", async () => {
      const result = await service.getStartup();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });
});



