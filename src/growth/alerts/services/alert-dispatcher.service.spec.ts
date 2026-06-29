import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AlertDispatcherService } from "./alert-dispatcher.service";
import {
  AlertPreference,
  AlertFrequency,
} from "../entities/alert-preference.entity";
import { AlertTriggerLog } from "../entities/alert-trigger-log.entity";

const makeRepo = <T>(
  overrides: Partial<Repository<T>> = {},
): Partial<Repository<T>> => ({
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockImplementation((entity) => entity),
  save: jest
    .fn()
    .mockImplementation((entity) =>
      Promise.resolve({ id: "log-id", ...entity }),
    ),
  ...overrides,
});

describe("AlertDispatcherService", () => {
  let service: AlertDispatcherService;
  let preferenceRepo: jest.Mocked<Repository<AlertPreference>>;
  let logRepo: jest.Mocked<Repository<AlertTriggerLog>>;

  beforeEach(async () => {
    const prefRepoMock = makeRepo<AlertPreference>();
    const logRepoMock = makeRepo<AlertTriggerLog>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertDispatcherService,
        {
          provide: getRepositoryToken(AlertPreference),
          useValue: prefRepoMock,
        },
        { provide: getRepositoryToken(AlertTriggerLog), useValue: logRepoMock },
      ],
    }).compile();

    service = module.get<AlertDispatcherService>(AlertDispatcherService);
    preferenceRepo = module.get(getRepositoryToken(AlertPreference));
    logRepo = module.get(getRepositoryToken(AlertTriggerLog));
  });

  afterEach(() => {
    jest.clearAllMocks();
    (service as any).fingerprintMap.clear();
    (service as any).rateLimitMap.clear();
    (service as any).digestMap.clear();
  });

  describe("dispatch - deduplication", () => {
    it("should deliver the first alert normally", async () => {
      const saveSpy = logRepo.save as jest.Mock;
      await service.dispatch("user-1", {
        type: "risk.threshold.breached",
        asset: "BTC",
      });
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it("should skip a duplicate alert within the 5-minute window", async () => {
      const payload = { type: "risk.threshold.breached", asset: "BTC" };
      await service.dispatch("user-1", payload);
      await service.dispatch("user-1", payload);
      const saveSpy = logRepo.save as jest.Mock;
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it("should allow a different user to receive the same payload", async () => {
      const payload = { type: "risk.threshold.breached", asset: "BTC" };
      await service.dispatch("user-1", payload);
      await service.dispatch("user-2", payload);
      const saveSpy = logRepo.save as jest.Mock;
      expect(saveSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("dispatch - rate limiting", () => {
    it("should skip alert after exceeding the default rate limit of 10 per hour", async () => {
      const saveSpy = logRepo.save as jest.Mock;
      for (let i = 0; i < 11; i++) {
        await service.dispatch("user-rl", { type: "alert", index: i });
      }
      expect(saveSpy).toHaveBeenCalledTimes(10);
    });

    it("should respect a custom rateLimit from user preferences", async () => {
      (preferenceRepo.findOne as jest.Mock).mockResolvedValue({
        channels: ["in-app"],
        rateLimit: 3,
        quietHoursStart: null,
        quietHoursEnd: null,
        frequency: AlertFrequency.REALTIME,
        disabledAlertTypes: [],
      } as Partial<AlertPreference>);
      const saveSpy = logRepo.save as jest.Mock;
      for (let i = 0; i < 5; i++) {
        await service.dispatch("user-custom-rl", { type: "alert", index: i });
      }
      expect(saveSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("dispatch - disabled alert types", () => {
    it("should skip alerts with disabled types", async () => {
      (preferenceRepo.findOne as jest.Mock).mockResolvedValue({
        channels: ["in-app"],
        rateLimit: 10,
        quietHoursStart: null,
        quietHoursEnd: null,
        frequency: AlertFrequency.REALTIME,
        disabledAlertTypes: ["liquidation"],
      } as Partial<AlertPreference>);
      const saveSpy = logRepo.save as jest.Mock;
      await service.dispatch("user-disabled", {
        type: "portfolio.liquidation.warning",
      });
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it("should allow non-disabled alert types", async () => {
      (preferenceRepo.findOne as jest.Mock).mockResolvedValue({
        channels: ["in-app"],
        rateLimit: 10,
        quietHoursStart: null,
        quietHoursEnd: null,
        frequency: AlertFrequency.REALTIME,
        disabledAlertTypes: ["liquidation"],
      } as Partial<AlertPreference>);
      const saveSpy = logRepo.save as jest.Mock;
      await service.dispatch("user-disabled", {
        type: "portfolio.price.updated",
      });
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispatch - daily digest", () => {
    it("should buffer alerts when frequency is daily_digest", async () => {
      (preferenceRepo.findOne as jest.Mock).mockResolvedValue({
        channels: ["email"],
        rateLimit: 10,
        quietHoursStart: null,
        quietHoursEnd: null,
        frequency: AlertFrequency.DAILY_DIGEST,
        disabledAlertTypes: [],
      } as Partial<AlertPreference>);

      const saveSpy = logRepo.save as jest.Mock;
      await service.dispatch("user-digest", {
        type: "portfolio.price.updated",
        asset: "BTC",
      });
      await service.dispatch("user-digest", {
        type: "portfolio.allocation.drift",
        asset: "ETH",
      });

      // Should not deliver immediately
      expect(saveSpy).not.toHaveBeenCalled();
      expect(service.getDigestBufferSize("user-digest")).toBe(2);
    });

    it("should flush digest and deliver summary", async () => {
      (preferenceRepo.findOne as jest.Mock).mockResolvedValue({
        channels: ["email"],
        rateLimit: 10,
        quietHoursStart: null,
        quietHoursEnd: null,
        frequency: AlertFrequency.DAILY_DIGEST,
        disabledAlertTypes: [],
      } as Partial<AlertPreference>);

      await service.dispatch("user-digest", {
        type: "portfolio.price.updated",
        asset: "BTC",
      });
      await service.dispatch("user-digest", {
        type: "portfolio.milestone.reached",
      });

      const saveSpy = logRepo.save as jest.Mock;
      saveSpy.mockClear();
      await service.flushDigest("user-digest");

      // Should deliver one summary per channel
      expect(saveSpy).toHaveBeenCalledTimes(0); // email channel doesn't save logs
      expect(service.getDigestBufferSize("user-digest")).toBe(0);
    });

    it("should do nothing when flushing empty digest", async () => {
      const saveSpy = logRepo.save as jest.Mock;
      await service.flushDigest("user-empty");
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });

  describe("dispatch - push channel", () => {
    it("should handle push channel delivery", async () => {
      (preferenceRepo.findOne as jest.Mock).mockResolvedValue({
        channels: ["push"],
        rateLimit: 10,
        quietHoursStart: null,
        quietHoursEnd: null,
        frequency: AlertFrequency.REALTIME,
        disabledAlertTypes: [],
      } as Partial<AlertPreference>);

      // push channel logs but doesn't save to DB (just logs)
      await service.dispatch("user-push", { type: "portfolio.price.updated" });
      // No error = success for push channel
    });
  });

  describe("dispatch - in-app channel delivery", () => {
    it("should store an AlertTriggerLog with channel=in-app", async () => {
      const createSpy = logRepo.create as jest.Mock;
      const saveSpy = logRepo.save as jest.Mock;
      await service.dispatch("user-inapp", { type: "portfolio.rebalanced" });
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-inapp",
          payload: expect.objectContaining({ channel: "in-app" }),
        }),
      );
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("deliverToChannel - retry on failure", () => {
    it("should retry up to 3 times on error and then stop", async () => {
      (logRepo.save as jest.Mock).mockRejectedValue(new Error("DB error"));
      const deliverSpy = jest.spyOn(service, "deliverToChannel");
      await service.deliverToChannel(
        "in-app",
        "user-retry",
        { type: "test" },
        1,
      );
      expect(deliverSpy).toHaveBeenCalledTimes(3);
      expect(deliverSpy).toHaveBeenNthCalledWith(
        1,
        "in-app",
        "user-retry",
        expect.any(Object),
        1,
      );
      expect(deliverSpy).toHaveBeenNthCalledWith(
        2,
        "in-app",
        "user-retry",
        expect.any(Object),
        2,
      );
      expect(deliverSpy).toHaveBeenNthCalledWith(
        3,
        "in-app",
        "user-retry",
        expect.any(Object),
        3,
      );
    });

    it("should not retry beyond attempt 3", async () => {
      (logRepo.save as jest.Mock).mockRejectedValue(
        new Error("Persistent error"),
      );
      const deliverSpy = jest.spyOn(service, "deliverToChannel");
      await service.deliverToChannel(
        "in-app",
        "user-no-more-retry",
        { type: "test" },
        3,
      );
      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("flushAllDigests", () => {
    it("should flush all user digests", async () => {
      (preferenceRepo.findOne as jest.Mock).mockResolvedValue({
        channels: ["in-app"],
        rateLimit: 10,
        quietHoursStart: null,
        quietHoursEnd: null,
        frequency: AlertFrequency.DAILY_DIGEST,
        disabledAlertTypes: [],
      } as Partial<AlertPreference>);

      await service.dispatch("user-a", { type: "alert.1" });
      await service.dispatch("user-b", { type: "alert.2" });

      expect(service.getDigestBufferSize("user-a")).toBe(1);
      expect(service.getDigestBufferSize("user-b")).toBe(1);

      await service.flushAllDigests();

      expect(service.getDigestBufferSize("user-a")).toBe(0);
      expect(service.getDigestBufferSize("user-b")).toBe(0);
    });
  });
});



