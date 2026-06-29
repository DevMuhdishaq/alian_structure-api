import { Test, TestingModule } from "@nestjs/testing";
import { HttpStatus } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { HealthResponseDto } from "./dto/health-response.dto";

const livenessResult: HealthResponseDto = {
  status: "ok",
  timestamp: "2024-01-01T00:00:00.000Z",
  uptime: 100,
  components: { application: { status: "up" } },
};

const readyOkResult: HealthResponseDto = {
  status: "ok",
  timestamp: "2024-01-01T00:00:00.000Z",
  uptime: 100,
  components: {
    database: { status: "up", responseTime: 5 },
    redis: { status: "up", responseTime: 2 },
  },
};

const readyDegradedResult: HealthResponseDto = {
  status: "degraded",
  timestamp: "2024-01-01T00:00:00.000Z",
  uptime: 100,
  components: {
    database: { status: "up", responseTime: 5 },
    redis: { status: "down", message: "Connection refused" },
  },
};

const readyErrorResult: HealthResponseDto = {
  status: "error",
  timestamp: "2024-01-01T00:00:00.000Z",
  uptime: 100,
  components: {
    database: { status: "down", message: "DB offline" },
    redis: { status: "down", message: "Redis offline" },
  },
};

const startupOkResult: HealthResponseDto = {
  status: "ok",
  timestamp: "2024-01-01T00:00:00.000Z",
  uptime: 100,
  components: {
    database: { status: "up", responseTime: 5 },
    orm: { status: "up" },
  },
};

const startupErrorResult: HealthResponseDto = {
  status: "error",
  timestamp: "2024-01-01T00:00:00.000Z",
  uptime: 100,
  components: {
    database: { status: "down", message: "DB offline" },
    orm: { status: "down", message: "TypeORM DataSource not initialized" },
  },
};

const makeRes = () => ({ status: jest.fn().mockReturnThis() }) as any;

describe("HealthController", () => {
  let controller: HealthController;
  let service: jest.Mocked<HealthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            getLiveness: jest.fn().mockReturnValue(livenessResult),
            getReadiness: jest.fn().mockResolvedValue(readyOkResult),
            getStartup: jest.fn().mockResolvedValue(startupOkResult),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get(HealthService);
  });

  describe("getLiveness", () => {
    it("returns liveness result directly", () => {
      expect(controller.getLiveness()).toEqual(livenessResult);
    });

    it("delegates to HealthService.getLiveness", () => {
      controller.getLiveness();
      expect(service.getLiveness).toHaveBeenCalledTimes(1);
    });
  });

  describe("getReadiness", () => {
    it("returns readiness result when status is ok", async () => {
      const res = makeRes();
      const result = await controller.getReadiness(res);
      expect(result).toEqual(readyOkResult);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("does not set 503 when status is degraded", async () => {
      service.getReadiness.mockResolvedValue(readyDegradedResult);
      const res = makeRes();
      await controller.getReadiness(res);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("sets 503 when status is error", async () => {
      service.getReadiness.mockResolvedValue(readyErrorResult);
      const res = makeRes();
      await controller.getReadiness(res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it("still returns the body even when 503", async () => {
      service.getReadiness.mockResolvedValue(readyErrorResult);
      const res = makeRes();
      const result = await controller.getReadiness(res);
      expect(result).toEqual(readyErrorResult);
    });

    it("delegates to HealthService.getReadiness", async () => {
      await controller.getReadiness(makeRes());
      expect(service.getReadiness).toHaveBeenCalledTimes(1);
    });
  });

  describe("getStartup", () => {
    it("returns startup result when status is ok", async () => {
      const res = makeRes();
      const result = await controller.getStartup(res);
      expect(result).toEqual(startupOkResult);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("sets 503 when startup is incomplete", async () => {
      service.getStartup.mockResolvedValue(startupErrorResult);
      const res = makeRes();
      await controller.getStartup(res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it("still returns body even when 503", async () => {
      service.getStartup.mockResolvedValue(startupErrorResult);
      const res = makeRes();
      const result = await controller.getStartup(res);
      expect(result).toEqual(startupErrorResult);
    });

    it("delegates to HealthService.getStartup", async () => {
      await controller.getStartup(makeRes());
      expect(service.getStartup).toHaveBeenCalledTimes(1);
    });
  });
});



