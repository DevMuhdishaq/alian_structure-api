import { UpgradeSimulator } from "src/modules/upgradeability/testing/upgrade-simulator";

describe("UpgradeSimulator", () => {
  let simulator: UpgradeSimulator;

  beforeEach(() => {
    simulator = new UpgradeSimulator();
  });

  it("simulates a simple upgrade with no hooks", async () => {
    const result = await simulator.simulate({
      moduleKey: "test-module",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
    });

    expect(result.status).toBe("completed");
    expect(result.moduleKey).toBe("test-module");
    expect(result.upgradeId).toBe("sim-completed");
  });

  it("runs pre-flight checks", async () => {
    simulator.registerPreFlightCheck("test-module", {
      name: "disk-space",
      check: async () => true,
    });

    const result = await simulator.simulate({
      moduleKey: "test-module",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
    });

    expect(result.status).toBe("completed");
  });

  it("fails on pre-flight check error", async () => {
    simulator.registerPreFlightCheck("test-module", {
      name: "disk-space",
      check: async () => {
        throw new Error("insufficient disk space");
      },
    });

    const result = await simulator.simulate({
      moduleKey: "test-module",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("disk-space");
  });

  it("executes pre-hooks and post-hooks in order", async () => {
    const callOrder: string[] = [];

    simulator.registerMigrationHook("test-module", {
      name: "pre-migrate",
      phase: "pre",
      execute: async () => {
        callOrder.push("pre");
      },
    });

    simulator.registerMigrationHook("test-module", {
      name: "post-verify",
      phase: "post",
      execute: async () => {
        callOrder.push("post");
      },
    });

    const result = await simulator.simulate({
      moduleKey: "test-module",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
    });

    expect(result.status).toBe("completed");
    expect(callOrder).toEqual(["pre", "post"]);
  });

  it("tracks hook calls", async () => {
    simulator.registerMigrationHook("test-module", {
      name: "migrate-data",
      phase: "pre",
      execute: async () => {},
    });

    await simulator.simulate({
      moduleKey: "test-module",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
    });

    const calls = simulator.getHookCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      moduleKey: "test-module",
      hookName: "migrate-data",
      phase: "pre",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
    });
  });

  it("fails when pre-hook throws", async () => {
    simulator.registerMigrationHook("test-module", {
      name: "broken-hook",
      phase: "pre",
      execute: async () => {
        throw new Error("hook exploded");
      },
    });

    const result = await simulator.simulate({
      moduleKey: "test-module",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("hook exploded");
  });

  it("fails when post-hook throws", async () => {
    simulator.registerMigrationHook("test-module", {
      name: "ok-pre",
      phase: "pre",
      execute: async () => {},
    });
    simulator.registerMigrationHook("test-module", {
      name: "broken-post",
      phase: "post",
      execute: async () => {
        throw new Error("post-hook error");
      },
    });

    const result = await simulator.simulate({
      moduleKey: "test-module",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("post-hook error");
  });

  it("clears all state", async () => {
    simulator.registerPreFlightCheck("test-module", {
      name: "check1",
      check: async () => true,
    });
    simulator.registerMigrationHook("test-module", {
      name: "hook1",
      phase: "pre",
      execute: async () => {},
    });

    simulator.clear();

    expect(simulator.getHookCalls()).toHaveLength(0);

    // After clear, pre-flight check should not block
    const result = await simulator.simulate({
      moduleKey: "test-module",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
    });
    expect(result.status).toBe("completed");
  });

  it("isolates modules from each other", async () => {
    simulator.registerMigrationHook("module-a", {
      name: "hook-a",
      phase: "pre",
      execute: async () => {},
    });

    simulator.registerMigrationHook("module-b", {
      name: "hook-b",
      phase: "pre",
      execute: async () => {},
    });

    await simulator.simulate({
      moduleKey: "module-a",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
    });

    expect(simulator.getHookCalls()).toHaveLength(1);
    expect(simulator.getHookCalls()[0].moduleKey).toBe("module-a");
  });
});
