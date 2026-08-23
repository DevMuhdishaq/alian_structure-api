import { UpgradeStatus } from "src/modules/upgradeability/entities/upgrade-record.entity";

/**
 * Result of executing an upgrade operation.
 */
export interface UpgradeResult {
  upgradeId: string;
  moduleKey: string;
  fromVersion: string;
  toVersion: string;
  status: UpgradeStatus;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
}

/**
 * Pre-flight check that runs before an upgrade is permitted to execute.
 * Returns true when the check passes, or throws to block the upgrade with
 * a descriptive error message.
 */
export interface PreFlightCheck {
  /** Human-readable name shown in preflight results. */
  name: string;

  /** The check function itself. */
  check(moduleKey: string, fromVersion: string, toVersion: string): Promise<boolean>;
}

/**
 * A migration hook that runs during an upgrade.  Hooks execute in the
 * order they are registered.  A thrown error marks the upgrade as FAILED
 * and triggers any available rollback hooks.
 */
export interface MigrationHook {
  /** Stable name used in logging and audit trails. */
  name: string;

  /** Phase: "pre" hooks run before the implementation switch; "post" hooks run after. */
  phase: "pre" | "post";

  /** The hook function. */
  execute(
    moduleKey: string,
    fromVersion: string,
    toVersion: string,
  ): Promise<void>;

  /** Optional rollback for this specific hook.  Called only if the upgrade fails. */
  rollback?(
    moduleKey: string,
    fromVersion: string,
    toVersion: string,
  ): Promise<void>;
}

/**
 * Configuration for the upgradeability module.
 */
export interface UpgradeabilityConfig {
  /** Roles permitted to execute upgrades (defaults to [ADMIN]). */
  authorisedRoles: string[];

  /** Maximum number of concurrent upgrades (defaults to 1). */
  maxConcurrentUpgrades: number;

  /** Timeout in milliseconds for a single migration hook (defaults to 30_000). */
  hookTimeoutMs: number;
}

/**
 * Snapshot of the system before an upgrade starts, used for rollback decisions.
 */
export interface UpgradeSnapshot {
  moduleKey: string;
  previousVersion: string;
  checksum: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}
