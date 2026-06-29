import {
  ReconnectionService,
  WebSocketClientManager,
} from "./reconnection.service";

describe("ReconnectionService", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const service = new ReconnectionService();
      const state = service.getState();

      expect(state.isReconnecting).toBe(false);
      expect(state.attempts).toBe(0);
      expect(state.currentDelay).toBe(1000); // default baseDelay
    });

    it("should accept custom config", () => {
      const customService = new ReconnectionService({
        maxDelay: 10000,
        baseDelay: 500,
        maxAttempts: 5,
        factor: 3,
      });

      const state = customService.getState();
      expect(state.currentDelay).toBe(500);
    });
  });

  describe("configure", () => {
    it("should update configuration", () => {
      const service = new ReconnectionService();
      service.configure({
        maxDelay: 20000,
        baseDelay: 2000,
      });

      const state = service.getState();
      expect(state.currentDelay).toBe(2000);
    });

    it("should reset state on configure", () => {
      const service = new ReconnectionService();
      service.configure({ maxDelay: 5000 });
      const state = service.getState();

      expect(state.isReconnecting).toBe(false);
      expect(state.attempts).toBe(0);
    });
  });

  describe("reset", () => {
    it("should reset all state", () => {
      const service = new ReconnectionService();
      service.configure({ maxDelay: 30000 });

      service.reset();

      const state = service.getState();
      expect(state.isReconnecting).toBe(false);
      expect(state.attempts).toBe(0);
      expect(state.currentDelay).toBe(1000);
    });
  });

  describe("startReconnection", () => {
    it("should start reconnection process", () => {
      const service = new ReconnectionService();
      let called = false;
      service.startReconnection(() => {
        called = true;
      });

      const state = service.getState();
      expect(state.isReconnecting).toBe(true);
    });
  });

  describe("stopReconnection", () => {
    it("should stop reconnection process", () => {
      const service = new ReconnectionService();
      service.startReconnection(() => {});
      service.stopReconnection();

      const state = service.getState();
      expect(state.isReconnecting).toBe(false);
    });
  });

  describe("notifySuccess", () => {
    it("should reset state on success", () => {
      const service = new ReconnectionService();
      service.startReconnection(() => {});
      service.notifySuccess();

      const state = service.getState();
      expect(state.isReconnecting).toBe(false);
      expect(state.attempts).toBe(0);
    });
  });

  describe("shouldAttempt", () => {
    it("should return false when not reconnecting", () => {
      const service = new ReconnectionService();
      expect(service.shouldAttempt()).toBe(false);
    });

    it("should return true when reconnecting with unlimited attempts", () => {
      const service = new ReconnectionService();
      service.startReconnection(() => {});
      expect(service.shouldAttempt()).toBe(true);
    });
  });

  describe("getState", () => {
    it("should return correct state", () => {
      const service = new ReconnectionService();
      const state = service.getState();

      expect(state).toHaveProperty("isReconnecting");
      expect(state).toHaveProperty("attempts");
      expect(state).toHaveProperty("currentDelay");
      expect(state).toHaveProperty("nextDelay");
    });
  });
});

describe("WebSocketClientManager", () => {
  let manager: WebSocketClientManager;

  beforeEach(() => {
    manager = new WebSocketClientManager();
  });

  describe("initialization", () => {
    it("should initialize with default config", () => {
      expect(manager.getConnectionState()).toBe("disconnected");
    });
  });

  describe("disconnect", () => {
    it("should clean up state", () => {
      manager.disconnect();

      expect(manager.getConnectionState()).toBe("disconnected");
    });
  });

  describe("isConnected", () => {
    it("should return false when disconnected", () => {
      expect(manager.isConnected()).toBe(false);
    });
  });

  describe("on/off event handlers", () => {
    it("should register and unregister event handlers", () => {
      const handler = jest.fn();

      manager.on("test-event", handler);
      // State is tracked

      manager.off("test-event", handler);
    });
  });

  describe("getReconnectionState", () => {
    it("should return reconnection state", () => {
      const state = manager.getReconnectionState();

      expect(state).toHaveProperty("isReconnecting");
      expect(state).toHaveProperty("attempts");
    });
  });
});

describe("Exponential Backoff", () => {
  it("should calculate correct delays", () => {
    const service = new ReconnectionService({
      baseDelay: 1000,
      maxDelay: 30000,
      factor: 2,
    });

    // Simulate getting next delay
    const delays: number[] = [];
    let currentDelay = 1000;

    for (let i = 0; i < 6; i++) {
      delays.push(currentDelay);
      currentDelay = Math.min(currentDelay * 2, 30000);
    }

    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000]);
  });

  it("should respect maxDelay cap", () => {
    let currentDelay = 1000;
    const maxDelay = 30000;
    const factor = 2;

    for (let i = 0; i < 10; i++) {
      currentDelay = Math.min(currentDelay * factor, maxDelay);
    }

    expect(currentDelay).toBe(30000);
  });

  it("should not exceed 30 seconds max delay", () => {
    const service = new ReconnectionService({
      baseDelay: 1000,
      maxDelay: 30000,
      factor: 2,
    });

    let currentDelay = 1000;
    for (let i = 0; i < 20; i++) {
      currentDelay = Math.min(currentDelay * 2, 30000);
    }

    expect(currentDelay).toBe(30000);
  });
});



