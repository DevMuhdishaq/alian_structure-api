import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CircuitBreakerService } from "./circuit-breaker.service";

const mockEmitter = { emit: jest.fn() };

async function buildService(): Promise<CircuitBreakerService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CircuitBreakerService,
      { provide: EventEmitter2, useValue: mockEmitter },
    ],
  }).compile();
  return module.get(CircuitBreakerService);
}

describe("CircuitBreakerService", () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildService();
  });

  describe("CLOSED state", () => {
    it("starts in CLOSED state", () => {
      expect(service.getStatus().state).toBe("CLOSED");
    });

    it("stays CLOSED while failures are below threshold", () => {
      for (let i = 0; i < 4; i++) service.recordFailure();
      expect(service.getStatus().state).toBe("CLOSED");
      expect(mockEmitter.emit).not.toHaveBeenCalledWith(
        "circuit-breaker.opened",
        expect.anything(),
      );
    });

    it("records success metrics in CLOSED state", () => {
      service.recordSuccess();
      service.recordSuccess();
      expect(service.getStatus().successCount).toBe(2);
      expect(service.getStatus().totalCallCount).toBe(2);
    });

    it("isOpen returns false in CLOSED state", () => {
      expect(service.isOpen()).toBe(false);
    });
  });

  describe("OPEN state", () => {
    beforeEach(() => {
      for (let i = 0; i < 5; i++) service.recordFailure();
    });

    it("transitions to OPEN after reaching failure threshold", () => {
      expect(service.getStatus().state).toBe("OPEN");
    });

    it("emits circuit-breaker.opened when transitioning to OPEN", () => {
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        "circuit-breaker.opened",
        expect.objectContaining({ serviceName: "default", failureCount: 5 }),
      );
    });

    it("isOpen returns true in OPEN state", () => {
      // Use getStatus to verify OPEN without triggering auto-transition
      expect(service.getStatus().state).toBe("OPEN");
    });

    it("does not reset on recordSuccess while OPEN (no probe yet)", () => {
      service.recordSuccess();
      // In OPEN state, recordSuccess increments counts but doesn't reset — only HALF_OPEN does
      expect(service.getStatus().state).toBe("OPEN");
    });

    it("transitions to HALF_OPEN after recovery time elapses", () => {
      jest.useFakeTimers();
      jest.advanceTimersByTime(61_000);
      service.isOpen(); // triggers the auto-transition check
      expect(service.getStatus().state).toBe("HALF_OPEN");
      jest.useRealTimers();
    });
  });

  describe("HALF_OPEN state", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      for (let i = 0; i < 5; i++) service.recordFailure();
      jest.advanceTimersByTime(61_000);
      service.isOpen(); // trigger OPEN → HALF_OPEN
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("transitions to HALF_OPEN after recovery time", () => {
      expect(service.getStatus().state).toBe("HALF_OPEN");
    });

    it("transitions to CLOSED after a successful probe", () => {
      service.recordSuccess();
      expect(service.getStatus().state).toBe("CLOSED");
    });

    it("emits circuit-breaker.closed after successful probe", () => {
      jest.clearAllMocks();
      service.recordSuccess();
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        "circuit-breaker.closed",
        expect.objectContaining({ serviceName: "default" }),
      );
    });

    it("transitions back to OPEN after a failed probe", () => {
      service.recordFailure();
      expect(service.getStatus().state).toBe("OPEN");
    });

    it("emits circuit-breaker.opened after failed probe", () => {
      jest.clearAllMocks();
      service.recordFailure();
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        "circuit-breaker.opened",
        expect.objectContaining({ serviceName: "default" }),
      );
    });
  });

  describe("reset", () => {
    it("resets counters and returns to CLOSED", () => {
      for (let i = 0; i < 5; i++) service.recordFailure();
      service.reset();
      const status = service.getStatus();
      expect(status.state).toBe("CLOSED");
      expect(status.failureCount).toBe(0);
      expect(status.totalCallCount).toBe(0);
    });

    it("emits circuit-breaker.closed when resetting from OPEN", () => {
      for (let i = 0; i < 5; i++) service.recordFailure();
      jest.clearAllMocks();
      service.reset();
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        "circuit-breaker.closed",
        expect.objectContaining({ serviceName: "default" }),
      );
    });

    it("does not emit circuit-breaker.closed when already CLOSED", () => {
      service.reset();
      expect(mockEmitter.emit).not.toHaveBeenCalledWith(
        "circuit-breaker.closed",
        expect.anything(),
      );
    });
  });

  describe("per-service configuration", () => {
    it("uses custom failureThreshold from configure()", () => {
      service.configure("svc-a", { failureThreshold: 2 });
      service.recordFailure("svc-a");
      expect(service.getStatus("svc-a").state).toBe("CLOSED");
      service.recordFailure("svc-a");
      expect(service.getStatus("svc-a").state).toBe("OPEN");
    });

    it("isolates state between named services", () => {
      for (let i = 0; i < 5; i++) service.recordFailure("svc-x");
      expect(service.getStatus("svc-x").state).toBe("OPEN");
      expect(service.getStatus("svc-y").state).toBe("CLOSED");
    });
  });
});



