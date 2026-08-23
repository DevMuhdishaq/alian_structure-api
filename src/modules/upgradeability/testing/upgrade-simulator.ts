import {
  MigrationHook,
  PreFlightCheck,
  UpgradeResult,
} from "src/modules/upgradeability/interfaces/upgradeability.interface";
import { UpgradeStatus } from "src/modules/upgradeability/entities/upgrade-record.entity";

/**
 * Standalone upgrade simulator for integration and end-to-end tests.
 *
 * This utility runs outside the NestJS DI container and simulates the
 * upgrade pipeline: pre-flight checks → pre-hooks → implementation switch
 * → post-hooks → outcome recording.
 *
 * It is intentionally decoupled from the database so tests can verify
 * the upgrade flow without requiring a running TypeORM connection.
 *
 * @example
 * ```ts
 * const simulator = new UpgradeSimulator();
 *
 * simulator.registerPreFlightCheck("oracle", {
 *   name: "backup-exists",
 *   check: async () => true,
 * });
 *
 * simulator.registerMigrationHook("oracle", {
 *   name: "migrate-cache",
 *   phase: "pre",
 *   execute: async () => { /* perform migration * / },
 * });
 *
 * const result = await simulator.simulate({
 *   moduleKey: "oracle",
 *   fromVersion: "1.0.0",
 *   toVersion: "2.0.0",
 * });
 *
 * expect(result.status).toBe("completed");
 * ```
 */
export class UpgradeSimulator {
  private readonly preflightChecks = new Map<string, PreFlightCheck[]>();
  private readonly migrationHooks = new Map<string, MigrationHook[]>();
  private readonly hookCalls: Array<{
    moduleKey: string;
    hookName: string;
    phase: string;
    fromVersion: string;
    toVersion: string;
  }> = [];

  registerPreFlightCheck(moduleKey: string, check: PreFlightCheck): void {
    const checks = this.preflightChecks.get(moduleKey) ?? [];
    checks.push(check);
    this.preflightChecks.set(moduleKey, checks);
  }

  registerMigrationHook(moduleKey: string, hook: MigrationHook): void {
    const hooks = this.migrationHooks.get(moduleKey) ?? [];
    hooks.push(hook);
    this.migrationHooks.set(moduleKey, hooks);
  }

  getHookCalls(): typeof this.hookCalls {
    return [...this.hookCalls];
  }

  clear(): void {
    this.preflightChecks.clear();
    this.migrationHooks.clear();
    this.hookCalls.length = 0;
  }

  async simulate(params: {
    moduleKey: string;
    fromVersion: string;
    toVersion: string;
  }): Promise<UpgradeResult> {
    const { moduleKey, fromVersion, toVersion } = params;
    const startedAt = new Date();

    // Run pre-flight checks
    const checks = this.preflightChecks.get(moduleKey) ?? [];
    for (const check of checks) {
      let passed = false;
      try {
        passed = await check.check(moduleKey, fromVersion, toVersion);
      } catch (error) {
        passed = false;
      }
      if (!passed) {
        return {
          upgradeId: "sim-failed-preflight",
          moduleKey,
          fromVersion,
          toVersion,
          status: UpgradeStatus.FAILED,
          startedAt,
          completedAt: new Date(),
          error: `Pre-flight check "${check.name}" failed`,
        };
      }
    }

    const hooks = this.migrationHooks.get(moduleKey) ?? [];
    const preHooks = hooks.filter((h) => h.phase === "pre");
    const postHooks = hooks.filter((h) => h.phase === "post");

    // Execute pre-hooks
    try {
      for (const hook of preHooks) {
        this.hookCalls.push({
          moduleKey,
          hookName: hook.name,
          phase: "pre",
          fromVersion,
          toVersion,
        });
        await hook.execute(moduleKey, fromVersion, toVersion);
      }
    } catch (error) {
      return {
        upgradeId: "sim-failed-pre-hook",
        moduleKey,
        fromVersion,
        toVersion,
        status: UpgradeStatus.FAILED,
        startedAt,
        completedAt: new Date(),
        error: `Pre-hook failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Execute post-hooks
    try {
      for (const hook of postHooks) {
        this.hookCalls.push({
          moduleKey,
          hookName: hook.name,
          phase: "post",
          fromVersion,
          toVersion,
        });
        await hook.execute(moduleKey, fromVersion, toVersion);
      }
    } catch (error) {
      return {
        upgradeId: "sim-failed-post-hook",
        moduleKey,
        fromVersion,
        toVersion,
        status: UpgradeStatus.FAILED,
        startedAt,
        completedAt: new Date(),
        error: `Post-hook failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      upgradeId: "sim-completed",
      moduleKey,
      fromVersion,
      toVersion,
      status: UpgradeStatus.COMPLETED,
      startedAt,
      completedAt: new Date(),
      error: null,
    };
  }
}
