import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { HealthCheckService } from "./health-check.service";
import { ConnectionMonitorService } from "./connection-monitor.service";

const mockDataSource = {
  query: jest.fn(),
};

const mockMonitor = {
  checkConnection: jest.fn(),
};

describe("HealthCheckService", () => {
  let service: HealthCheckService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthCheckService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConnectionMonitorService, useValue: mockMonitor },
      ],
    }).compile();
    service = module.get<HealthCheckService>(HealthCheckService);
  });

  describe("check", () => {
    it("returns ok when query succeeds", async () => {
      mockDataSource.query = jest.fn().mockResolvedValue([{ "?column?": 1 }]);
      const result = await service.check();
      expect(result.status).toBe("ok");
      expect(result.database.status).toBe("up");
    });

    it("returns error when query fails", async () => {
      mockDataSource.query = jest.fn().mockRejectedValue(new Error("timeout"));
      const result = await service.check();
      expect(result.status).toBe("error");
      expect(result.database.status).toBe("down");
    });
  });

  describe("getDetailedHealth", () => {
    it("returns detailed health information", async () => {
      mockDataSource.query = jest.fn().mockResolvedValue([{ "?column?": 1 }]);
      mockMonitor.checkConnection = jest.fn().mockResolvedValue({
        activeConnections: 5,
        idleConnections: 10,
        consecutiveFailures: 0,
      });
      const result = await service.getDetailedHealth();
      expect(result.status).toBe("ok");
      expect(result.connectionPool.activeConnections).toBe(5);
    });
  });
});
