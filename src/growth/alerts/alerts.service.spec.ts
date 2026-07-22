import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { AlertsService } from "./alerts.service";
import { Alert, AlertType, AlertCondition } from "./entities/alert.entity";
import { AlertTriggerLog } from "./entities/alert-trigger-log.entity";
import {
  AlertPreference,
  AlertFrequency,
} from "./entities/alert-preference.entity";

const mockAlertRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockLogRepo = {
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockPreferenceRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
};

describe("AlertsService", () => {
  let service: AlertsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: getRepositoryToken(Alert), useValue: mockAlertRepo },
        { provide: getRepositoryToken(AlertTriggerLog), useValue: mockLogRepo },
        {
          provide: getRepositoryToken(AlertPreference),
          useValue: mockPreferenceRepo,
        },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
    jest.clearAllMocks();
    mockAlertRepo.create.mockImplementation((p) => ({ ...p }));
    mockAlertRepo.save.mockImplementation((p) =>
      Promise.resolve({ id: "a1", ...p }),
    );
    mockLogRepo.create.mockImplementation((p) => ({ ...p }));
    mockLogRepo.save.mockImplementation((p) =>
      Promise.resolve({ id: "l1", ...p }),
    );
    mockPreferenceRepo.create.mockImplementation((p) => ({ ...p }));
    mockPreferenceRepo.save.mockImplementation((p) =>
      Promise.resolve({ id: "p1", ...p }),
    );
  });

  describe("createPriceAlert", () => {
    it("creates a price alert", async () => {
      const alert = await service.createPriceAlert({
        userId: "u1",
        asset: "BTC",
        condition: AlertCondition.ABOVE,
        threshold: 50000,
      });
      expect(alert.type).toBe(AlertType.PRICE);
      expect(alert.asset).toBe("BTC");
    });
  });

  describe("createPortfolioAlert", () => {
    it("creates a portfolio alert", async () => {
      const alert = await service.createPortfolioAlert({
        userId: "u1",
        condition: AlertCondition.BELOW,
        threshold: 10000,
      });
      expect(alert.type).toBe(AlertType.PORTFOLIO);
    });
  });

  describe("createAllocationDriftAlert", () => {
    it("creates an allocation drift alert with DEVIATION condition", async () => {
      const alert = await service.createAllocationDriftAlert({
        userId: "u1",
        asset: "ETH",
        threshold: 10,
      });
      expect(alert.type).toBe(AlertType.ALLOCATION_DRIFT);
      expect(alert.condition).toBe(AlertCondition.DEVIATION);
      expect(alert.asset).toBe("ETH");
      expect(alert.cooldownSeconds).toBe(3600);
    });

    it("uses custom cooldown if provided", async () => {
      const alert = await service.createAllocationDriftAlert({
        userId: "u1",
        asset: "BTC",
        threshold: 5,
        cooldownSeconds: 7200,
      });
      expect(alert.cooldownSeconds).toBe(7200);
    });
  });

  describe("createMilestoneAlert", () => {
    it("creates a milestone alert", async () => {
      const alert = await service.createMilestoneAlert({
        userId: "u1",
        threshold: 100000,
        condition: AlertCondition.ABOVE,
      });
      expect(alert.type).toBe(AlertType.MILESTONE);
      expect(alert.threshold).toBe(100000);
      expect(alert.cooldownSeconds).toBe(86400);
    });
  });

  describe("createPerformanceAlert", () => {
    it("creates a performance alert", async () => {
      const alert = await service.createPerformanceAlert({
        userId: "u1",
        threshold: 5,
        condition: AlertCondition.BELOW,
      });
      expect(alert.type).toBe(AlertType.PERFORMANCE);
      expect(alert.threshold).toBe(5);
      expect(alert.cooldownSeconds).toBe(3600);
    });
  });

  describe("deleteAlert", () => {
    it("throws NotFoundException when deleting unknown alert", async () => {
      mockAlertRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteAlert("bad-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("deactivates an existing alert", async () => {
      mockAlertRepo.findOne.mockResolvedValue({ id: "a1", active: true });
      await service.deleteAlert("a1");
      expect(mockAlertRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "a1", active: false }),
      );
    });
  });

  describe("toggleAlert", () => {
    it("enables a disabled alert", async () => {
      mockAlertRepo.findOne.mockResolvedValue({ id: "a1", active: false });
      mockAlertRepo.save.mockImplementation((p) => Promise.resolve(p));
      const result = await service.toggleAlert("a1", true);
      expect(result.active).toBe(true);
    });

    it("disables an active alert", async () => {
      mockAlertRepo.findOne.mockResolvedValue({ id: "a1", active: true });
      mockAlertRepo.save.mockImplementation((p) => Promise.resolve(p));
      const result = await service.toggleAlert("a1", false);
      expect(result.active).toBe(false);
    });

    it("throws NotFoundException for unknown alert", async () => {
      mockAlertRepo.findOne.mockResolvedValue(null);
      await expect(service.toggleAlert("bad", true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getAlertHistory", () => {
    it("returns history without type filter", async () => {
      mockLogRepo.find.mockResolvedValue([{ id: "l1" }]);
      const result = await service.getAlertHistory("u1");
      expect(result).toHaveLength(1);
      expect(mockLogRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1" } }),
      );
    });

    it("returns history with type filter", async () => {
      mockLogRepo.find.mockResolvedValue([]);
      await service.getAlertHistory("u1", AlertType.PRICE);
      expect(mockLogRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u1", type: AlertType.PRICE },
        }),
      );
    });
  });

  describe("evaluatePriceAlerts", () => {
    it("triggers matching price alerts", async () => {
      const alert: Partial<Alert> = {
        id: "a1",
        userId: "u1",
        type: AlertType.PRICE,
        asset: "BTC",
        condition: AlertCondition.ABOVE,
        threshold: 50000,
        cooldownSeconds: 300,
        lastTriggeredAt: undefined,
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluatePriceAlerts("BTC", 55000);
      expect(logs).toHaveLength(1);
      expect(logs[0].alertId).toBe("a1");
      expect(logs[0].type).toBe(AlertType.PRICE);
    });

    it("respects cooldown and does not re-trigger", async () => {
      const alert: Partial<Alert> = {
        id: "a1",
        userId: "u1",
        type: AlertType.PRICE,
        asset: "BTC",
        condition: AlertCondition.ABOVE,
        threshold: 50000,
        cooldownSeconds: 3600,
        lastTriggeredAt: new Date(),
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluatePriceAlerts("BTC", 55000);
      expect(logs).toHaveLength(0);
    });

    it("does not trigger BELOW condition when price is above threshold", async () => {
      const alert: Partial<Alert> = {
        id: "a1",
        userId: "u1",
        type: AlertType.PRICE,
        asset: "BTC",
        condition: AlertCondition.BELOW,
        threshold: 50000,
        cooldownSeconds: 300,
        lastTriggeredAt: undefined,
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluatePriceAlerts("BTC", 55000);
      expect(logs).toHaveLength(0);
    });
  });

  describe("evaluateAllocationDriftAlerts", () => {
    it("triggers when deviation exceeds threshold", async () => {
      const alert: Partial<Alert> = {
        id: "a2",
        userId: "u1",
        type: AlertType.ALLOCATION_DRIFT,
        asset: "ETH",
        condition: AlertCondition.DEVIATION,
        threshold: 10,
        cooldownSeconds: 3600,
        lastTriggeredAt: undefined,
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluateAllocationDriftAlerts("u1", {
        ETH: 15,
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].type).toBe(AlertType.ALLOCATION_DRIFT);
    });

    it("does not trigger when deviation is below threshold", async () => {
      const alert: Partial<Alert> = {
        id: "a2",
        userId: "u1",
        type: AlertType.ALLOCATION_DRIFT,
        asset: "ETH",
        condition: AlertCondition.DEVIATION,
        threshold: 10,
        cooldownSeconds: 3600,
        lastTriggeredAt: undefined,
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluateAllocationDriftAlerts("u1", {
        ETH: 5,
      });
      expect(logs).toHaveLength(0);
    });

    it("handles negative deviation (absolute value check)", async () => {
      const alert: Partial<Alert> = {
        id: "a2",
        userId: "u1",
        type: AlertType.ALLOCATION_DRIFT,
        asset: "BTC",
        condition: AlertCondition.DEVIATION,
        threshold: 10,
        cooldownSeconds: 3600,
        lastTriggeredAt: undefined,
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluateAllocationDriftAlerts("u1", {
        BTC: -12,
      });
      expect(logs).toHaveLength(1);
    });

    it("skips assets not in deviations map", async () => {
      const alert: Partial<Alert> = {
        id: "a2",
        userId: "u1",
        type: AlertType.ALLOCATION_DRIFT,
        asset: "ETH",
        condition: AlertCondition.DEVIATION,
        threshold: 10,
        cooldownSeconds: 3600,
        lastTriggeredAt: undefined,
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluateAllocationDriftAlerts("u1", {
        BTC: 20,
      });
      expect(logs).toHaveLength(0);
    });
  });

  describe("evaluateMilestoneAlerts", () => {
    it("triggers when portfolio value exceeds target", async () => {
      const alert: Partial<Alert> = {
        id: "a3",
        userId: "u1",
        type: AlertType.MILESTONE,
        condition: AlertCondition.ABOVE,
        threshold: 100000,
        cooldownSeconds: 86400,
        lastTriggeredAt: undefined,
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluateMilestoneAlerts("u1", 105000);
      expect(logs).toHaveLength(1);
      expect(logs[0].type).toBe(AlertType.MILESTONE);
    });

    it("does not trigger when portfolio value is below target", async () => {
      const alert: Partial<Alert> = {
        id: "a3",
        userId: "u1",
        type: AlertType.MILESTONE,
        condition: AlertCondition.ABOVE,
        threshold: 100000,
        cooldownSeconds: 86400,
        lastTriggeredAt: undefined,
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluateMilestoneAlerts("u1", 95000);
      expect(logs).toHaveLength(0);
    });
  });

  describe("evaluatePerformanceAlerts", () => {
    it("triggers on significant loss", async () => {
      const alert: Partial<Alert> = {
        id: "a4",
        userId: "u1",
        type: AlertType.PERFORMANCE,
        condition: AlertCondition.BELOW,
        threshold: 5,
        cooldownSeconds: 3600,
        lastTriggeredAt: undefined,
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluatePerformanceAlerts("u1", -8);
      expect(logs).toHaveLength(1);
      expect(logs[0].type).toBe(AlertType.PERFORMANCE);
    });

    it("triggers on significant gain", async () => {
      const alert: Partial<Alert> = {
        id: "a4",
        userId: "u1",
        type: AlertType.PERFORMANCE,
        condition: AlertCondition.ABOVE,
        threshold: 5,
        cooldownSeconds: 3600,
        lastTriggeredAt: undefined,
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluatePerformanceAlerts("u1", 10);
      expect(logs).toHaveLength(1);
    });

    it("does not trigger when performance is within threshold", async () => {
      const alert: Partial<Alert> = {
        id: "a4",
        userId: "u1",
        type: AlertType.PERFORMANCE,
        condition: AlertCondition.BELOW,
        threshold: 5,
        cooldownSeconds: 3600,
        lastTriggeredAt: undefined,
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluatePerformanceAlerts("u1", -2);
      expect(logs).toHaveLength(0);
    });

    it("respects cooldown for performance alerts", async () => {
      const alert: Partial<Alert> = {
        id: "a4",
        userId: "u1",
        type: AlertType.PERFORMANCE,
        condition: AlertCondition.BELOW,
        threshold: 5,
        cooldownSeconds: 3600,
        lastTriggeredAt: new Date(),
        active: true,
      };
      mockAlertRepo.find.mockResolvedValue([alert]);

      const logs = await service.evaluatePerformanceAlerts("u1", -10);
      expect(logs).toHaveLength(0);
    });
  });

  describe("preferences", () => {
    it("creates new preference with frequency and disabledAlertTypes", async () => {
      mockPreferenceRepo.findOne.mockResolvedValue(null);
      const pref = await service.savePreference({
        userId: "u1",
        channels: ["in-app", "email"],
        frequency: AlertFrequency.DAILY_DIGEST,
        disabledAlertTypes: ["liquidation"],
      });
      expect(pref.frequency).toBe(AlertFrequency.DAILY_DIGEST);
      expect(pref.disabledAlertTypes).toContain("liquidation");
    });

    it("updates existing preference with frequency", async () => {
      const existing = {
        id: "p1",
        userId: "u1",
        channels: ["in-app"],
        quietHoursStart: null,
        quietHoursEnd: null,
        rateLimit: 10,
        frequency: AlertFrequency.REALTIME,
        disabledAlertTypes: [],
      };
      mockPreferenceRepo.findOne.mockResolvedValue(existing);
      mockPreferenceRepo.save.mockImplementation((p) => Promise.resolve(p));

      const pref = await service.savePreference({
        userId: "u1",
        channels: ["email", "push"],
        frequency: AlertFrequency.DAILY_DIGEST,
        disabledAlertTypes: ["price"],
      });
      expect(pref.channels).toEqual(["email", "push"]);
      expect(pref.frequency).toBe(AlertFrequency.DAILY_DIGEST);
      expect(pref.disabledAlertTypes).toEqual(["price"]);
    });

    it("returns null when preference not found", async () => {
      mockPreferenceRepo.findOne.mockResolvedValue(null);
      const result = await service.getPreference("u1");
      expect(result).toBeNull();
    });

    it("deletes preference", async () => {
      mockPreferenceRepo.findOne.mockResolvedValue({ id: "p1", userId: "u1" });
      mockPreferenceRepo.remove.mockResolvedValue(undefined);
      await service.deletePreference("u1");
      expect(mockPreferenceRepo.remove).toHaveBeenCalled();
    });

    it("throws NotFoundException when deleting non-existent preference", async () => {
      mockPreferenceRepo.findOne.mockResolvedValue(null);
      await expect(service.deletePreference("u1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
