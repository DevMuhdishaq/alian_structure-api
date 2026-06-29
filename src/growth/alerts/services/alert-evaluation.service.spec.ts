import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { AlertEvaluationService } from "./alert-evaluation.service";
import { AlertsService } from "../alerts.service";
import { AlertDispatcherService } from "./alert-dispatcher.service";
import { AlertType } from "../entities/alert.entity";

const mockAlertsService = {
  evaluatePriceAlerts: jest.fn(),
  evaluateAllocationDriftAlerts: jest.fn(),
  evaluateMilestoneAlerts: jest.fn(),
  evaluatePerformanceAlerts: jest.fn(),
};

const mockDispatcher = {
  dispatch: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

describe("AlertEvaluationService", () => {
  let service: AlertEvaluationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertEvaluationService,
        { provide: AlertsService, useValue: mockAlertsService },
        { provide: AlertDispatcherService, useValue: mockDispatcher },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<AlertEvaluationService>(AlertEvaluationService);
    jest.clearAllMocks();
  });

  describe("handlePriceUpdate", () => {
    it("evaluates price alerts and dispatches triggered ones", async () => {
      const triggered = [
        {
          id: "l1",
          alertId: "a1",
          userId: "u1",
          type: AlertType.PRICE,
          payload: { asset: "BTC", currentPrice: 55000, threshold: 50000 },
        },
      ];
      mockAlertsService.evaluatePriceAlerts.mockResolvedValue(triggered);

      await service.handlePriceUpdate({ asset: "BTC", price: 55000 });

      expect(mockAlertsService.evaluatePriceAlerts).toHaveBeenCalledWith(
        "BTC",
        55000,
      );
      expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({
          type: "portfolio.price.updated",
          alertId: "a1",
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        "alert.triggered.price",
        triggered[0],
      );
    });

    it("does not dispatch when no alerts are triggered", async () => {
      mockAlertsService.evaluatePriceAlerts.mockResolvedValue([]);

      await service.handlePriceUpdate({ asset: "ETH", price: 3000 });

      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });
  });

  describe("handleAllocationUpdate", () => {
    it("evaluates allocation drift alerts", async () => {
      const triggered = [
        {
          id: "l2",
          alertId: "a2",
          userId: "u1",
          type: AlertType.ALLOCATION_DRIFT,
          payload: { asset: "ETH", deviation: 15, threshold: 10 },
        },
      ];
      mockAlertsService.evaluateAllocationDriftAlerts.mockResolvedValue(
        triggered,
      );

      await service.handleAllocationUpdate({
        userId: "u1",
        deviations: { ETH: 15 },
      });

      expect(
        mockAlertsService.evaluateAllocationDriftAlerts,
      ).toHaveBeenCalledWith("u1", { ETH: 15 });
      expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({
          type: "portfolio.allocation.drift",
        }),
      );
    });
  });

  describe("handlePortfolioValueUpdate", () => {
    it("evaluates milestone alerts", async () => {
      const triggered = [
        {
          id: "l3",
          alertId: "a3",
          userId: "u1",
          type: AlertType.MILESTONE,
          payload: { portfolioValue: 105000, threshold: 100000 },
        },
      ];
      mockAlertsService.evaluateMilestoneAlerts.mockResolvedValue(triggered);

      await service.handlePortfolioValueUpdate({
        userId: "u1",
        portfolioValue: 105000,
      });

      expect(mockAlertsService.evaluateMilestoneAlerts).toHaveBeenCalledWith(
        "u1",
        105000,
      );
      expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({
          type: "portfolio.milestone.reached",
        }),
      );
    });
  });

  describe("handlePerformanceUpdate", () => {
    it("evaluates performance alerts on significant loss", async () => {
      const triggered = [
        {
          id: "l4",
          alertId: "a4",
          userId: "u1",
          type: AlertType.PERFORMANCE,
          payload: { performancePct: -8, threshold: 5 },
        },
      ];
      mockAlertsService.evaluatePerformanceAlerts.mockResolvedValue(triggered);

      await service.handlePerformanceUpdate({
        userId: "u1",
        performancePct: -8,
      });

      expect(mockAlertsService.evaluatePerformanceAlerts).toHaveBeenCalledWith(
        "u1",
        -8,
      );
      expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({
          type: "portfolio.performance.significant",
        }),
      );
    });

    it("does not dispatch when performance is within threshold", async () => {
      mockAlertsService.evaluatePerformanceAlerts.mockResolvedValue([]);

      await service.handlePerformanceUpdate({
        userId: "u1",
        performancePct: -1,
      });

      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
    });
  });
});



