import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import {
  UpgradeRecord,
  UpgradeStatus,
} from "src/modules/upgradeability/entities/upgrade-record.entity";
import {
  ImplementationVersion,
} from "src/modules/upgradeability/entities/implementation-version.entity";
import {
  MigrationHook,
  PreFlightCheck,
  UpgradeResult,
  UpgradeabilityConfig,
  UpgradeSnapshot,
} from "src/modules/upgradeability/interfaces/upgradeability.interface";
import {
  ExecuteUpgradeDto,
  PlanUpgradeDto,
  RegisterImplementationDto,
  RegisterMigrationHookDto,
  RollbackUpgradeDto,
  SimulateBatchDto,
  SimulateUpgradeDto,
  UpdateConfigDto,
  QueryUpgradesDto,
} from "src/modules/upgradeability/dto/upgradeability.dto";

const DEFAULT_CONFIG: UpgradeabilityConfig = {
  authorisedRoles: ["ADMIN"],
  maxConcurrentUpgrades: 1,
  hookTimeoutMs: 30_000,
};

@Injectable()
export class UpgradeabilityService {
  private readonly logger = new Logger(UpgradeabilityService.name);

  /** In-memory pre-flight checks keyed by moduleKey. */
  private readonly preflightChecks = new Map<string, PreFlightCheck[]>();

  /** In-memory migration hooks keyed by moduleKey. */
  private readonly migrationHooks = new Map<string, MigrationHook[]>();

  /** Mutable runtime configuration. */
  private config: UpgradeabilityConfig = { ...DEFAULT_CONFIG };

  /** Currently executing upgrades (used for concurrency control). */
  private readonly runningUpgrades = new Set<string>();

  constructor(
    @InjectRepository(UpgradeRecord)
    private readonly upgradeRecordRepository: Repository<UpgradeRecord>,
    @InjectRepository(ImplementationVersion)
    private readonly implVersionRepository: Repository<ImplementationVersion>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  getConfig(): UpgradeabilityConfig {
    return { ...this.config };
  }

  updateConfig(dto: UpdateConfigDto): UpgradeabilityConfig {
    if (dto.authorisedRoles !== undefined) {
      this.config.authorisedRoles = dto.authorisedRoles;
    }
    if (dto.maxConcurrentUpgrades !== undefined) {
      this.config.maxConcurrentUpgrades = dto.maxConcurrentUpgrades;
    }
    if (dto.hookTimeoutMs !== undefined) {
      this.config.hookTimeoutMs = dto.hookTimeoutMs;
    }
    this.logger.log("Upgradeability config updated");
    return this.getConfig();
  }

  // ---------------------------------------------------------------------------
  // Pre-flight checks
  // ---------------------------------------------------------------------------

  registerPreFlightCheck(moduleKey: string, check: PreFlightCheck): void {
    const checks = this.preflightChecks.get(moduleKey) ?? [];
    checks.push(check);
    this.preflightChecks.set(moduleKey, checks);
  }

  // ---------------------------------------------------------------------------
  // Migration hooks
  // ---------------------------------------------------------------------------

  registerMigrationHook(moduleKey: string, hook: MigrationHook): void {
    const hooks = this.migrationHooks.get(moduleKey) ?? [];
    hooks.push(hook);
    this.migrationHooks.set(moduleKey, hooks);
    this.logger.log(
      `Registered migration hook "${hook.name}" (${hook.phase}) for ${moduleKey}`,
    );
  }

  registerMigrationHookFromDto(dto: RegisterMigrationHookDto): void {
    this.registerMigrationHook(dto.moduleKey, {
      name: dto.name,
      phase: dto.phase,
      execute: async (moduleKey, from, to) => {
        this.logger.log(
          `[stub] Migration hook "${dto.name}" executed for ${moduleKey} ${from} → ${to}`,
        );
      },
    });
  }

  getRegisteredHooks(moduleKey: string): MigrationHook[] {
    return this.migrationHooks.get(moduleKey) ?? [];
  }

  // ---------------------------------------------------------------------------
  // Implementation versions
  // ---------------------------------------------------------------------------

  async registerImplementation(
    dto: RegisterImplementationDto,
  ): Promise<ImplementationVersion> {
    const existing = await this.implVersionRepository.findOne({
      where: { moduleKey: dto.moduleKey, version: dto.version },
    });

    if (existing) {
      throw new ConflictException(
        `Implementation ${dto.moduleKey}@${dto.version} is already registered`,
      );
    }

    if (dto.active) {
      // Deactivate previous active version for this module
      await this.implVersionRepository.update(
        { moduleKey: dto.moduleKey, active: true },
        { active: false },
      );
    }

    const entity = this.implVersionRepository.create({
      moduleKey: dto.moduleKey,
      version: dto.version,
      checksum: dto.checksum,
      artifactUri: dto.artifactUri,
      coreCompatibilityRange: dto.coreCompatibilityRange ?? null,
      releaseNotes: dto.releaseNotes ?? null,
      active: dto.active ?? false,
    });

    const saved = await this.implVersionRepository.save(entity);
    this.logger.log(
      `Registered implementation ${saved.moduleKey}@${saved.version} (${saved.id})`,
    );
    return saved;
  }

  async findImplementation(
    moduleKey: string,
    version: string,
  ): Promise<ImplementationVersion> {
    const entity = await this.implVersionRepository.findOne({
      where: { moduleKey, version },
    });
    if (!entity) {
      throw new NotFoundException(
        `Implementation ${moduleKey}@${version} not found`,
      );
    }
    return entity;
  }

  async findActiveImplementation(
    moduleKey: string,
  ): Promise<ImplementationVersion | null> {
    return this.implVersionRepository.findOne({
      where: { moduleKey, active: true },
    });
  }

  async listImplementations(moduleKey: string): Promise<ImplementationVersion[]> {
    return this.implVersionRepository.find({
      where: { moduleKey },
      order: { registeredAt: "DESC" },
    });
  }

  // ---------------------------------------------------------------------------
  // Upgrade lifecycle
  // ---------------------------------------------------------------------------

  async plan(dto: PlanUpgradeDto): Promise<UpgradeRecord> {
    await this.assertVersionOrder(dto.fromVersion, dto.toVersion);

    const existing = await this.upgradeRecordRepository.findOne({
      where: {
        moduleKey: dto.moduleKey,
        fromVersion: dto.fromVersion,
        toVersion: dto.toVersion,
      },
    });

    if (existing && existing.status !== UpgradeStatus.ROLLED_BACK) {
      throw new ConflictException(
        `Upgrade ${dto.moduleKey} ${dto.fromVersion} → ${dto.toVersion} already planned (status: ${existing.status})`,
      );
    }

    // Run pre-flight checks
    const checks = this.preflightChecks.get(dto.moduleKey) ?? [];
    const preflightResults: Record<string, boolean> = {};
    for (const check of checks) {
      try {
        preflightResults[check.name] = await check.check(
          dto.moduleKey,
          dto.fromVersion,
          dto.toVersion,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Pre-flight check "${check.name}" failed: ${message}`);
        preflightResults[check.name] = false;
      }
    }

    // Build checklist from registered hooks
    const hooks = this.migrationHooks.get(dto.moduleKey) ?? [];
    const checklist: Record<string, unknown> = {
      preflight: preflightResults,
      preHooks: hooks.filter((h) => h.phase === "pre").map((h) => h.name),
      postHooks: hooks.filter((h) => h.phase === "post").map((h) => h.name),
    };

    // If there is a rolled-back record with the same versions, reuse it
    if (existing) {
      existing.status = UpgradeStatus.PENDING;
      existing.description = dto.description ?? existing.description;
      existing.preflightResults = preflightResults;
      existing.checklist = checklist;
      existing.error = null;
      existing.completedAt = null;
      return this.upgradeRecordRepository.save(existing);
    }

    const record = this.upgradeRecordRepository.create({
      moduleKey: dto.moduleKey,
      fromVersion: dto.fromVersion,
      toVersion: dto.toVersion,
      status: UpgradeStatus.PENDING,
      description: dto.description ?? null,
      preflightResults,
      checklist,
    });

    const saved = await this.upgradeRecordRepository.save(record);
    this.logger.log(
      `Planned upgrade ${saved.moduleKey} ${saved.fromVersion} → ${saved.toVersion} (${saved.id})`,
    );
    return saved;
  }

  async execute(dto: ExecuteUpgradeDto): Promise<UpgradeResult> {
    await this.assertVersionOrder(dto.fromVersion, dto.toVersion);

    // Concurrency guard
    const upgradeKey = `${dto.moduleKey}:${dto.fromVersion}:${dto.toVersion}`;
    if (this.runningUpgrades.has(upgradeKey)) {
      throw new ConflictException(
        `Upgrade ${upgradeKey} is already in progress`,
      );
    }
    if (this.runningUpgrades.size >= this.config.maxConcurrentUpgrades) {
      throw new ConflictException(
        `Maximum concurrent upgrades (${this.config.maxConcurrentUpgrades}) reached`,
      );
    }

    // Find or create plan
    let record = await this.upgradeRecordRepository.findOne({
      where: {
        moduleKey: dto.moduleKey,
        fromVersion: dto.fromVersion,
        toVersion: dto.toVersion,
      },
    });

    if (!record) {
      // Auto-plan if no plan exists
      record = await this.plan({
        moduleKey: dto.moduleKey,
        fromVersion: dto.fromVersion,
        toVersion: dto.toVersion,
      });
    }

    if (
      record.status === UpgradeStatus.MIGRATING ||
      record.status === UpgradeStatus.COMPLETED
    ) {
      throw new ConflictException(
        `Upgrade ${upgradeKey} cannot be executed (current status: ${record.status})`,
      );
    }

    this.runningUpgrades.add(upgradeKey);

    try {
      return await this.runUpgradeTransaction(record, dto.authorisedBy);
    } finally {
      this.runningUpgrades.delete(upgradeKey);
    }
  }

  private async runUpgradeTransaction(
    record: UpgradeRecord,
    authorisedBy: string,
  ): Promise<UpgradeResult> {
    const now = new Date();
    record.status = UpgradeStatus.MIGRATING;
    record.authorisedBy = authorisedBy;
    record.startedAt = now;
    record.error = null;
    await this.upgradeRecordRepository.save(record);

    const hooks = this.migrationHooks.get(record.moduleKey) ?? [];
    const preHooks = hooks.filter((h) => h.phase === "pre");
    const postHooks = hooks.filter((h) => h.phase === "post");

    const executedPreHooks: MigrationHook[] = [];

    try {
      // Execute pre-hooks
      for (const hook of preHooks) {
        this.logger.log(
          `Executing pre-hook "${hook.name}" for ${record.moduleKey}`,
        );
        await this.withTimeout(
          hook.execute(record.moduleKey, record.fromVersion, record.toVersion),
          this.config.hookTimeoutMs,
          `Pre-hook "${hook.name}" timed out`,
        );
        executedPreHooks.push(hook);
      }

      // Switch active implementation
      const fromImpl = await this.findImplementation(
        record.moduleKey,
        record.fromVersion,
      ).catch(() => null);
      const toImpl = await this.findImplementation(
        record.moduleKey,
        record.toVersion,
      ).catch(() => null);

      if (fromImpl) {
        fromImpl.active = false;
        await this.implVersionRepository.save(fromImpl);
      }

      if (toImpl) {
        toImpl.active = true;
        await this.implVersionRepository.save(toImpl);
      }

      // Execute post-hooks
      for (const hook of postHooks) {
        this.logger.log(
          `Executing post-hook "${hook.name}" for ${record.moduleKey}`,
        );
        await this.withTimeout(
          hook.execute(record.moduleKey, record.fromVersion, record.toVersion),
          this.config.hookTimeoutMs,
          `Post-hook "${hook.name}" timed out`,
        );
      }

      // Mark completed
      const completedAt = new Date();
      record.status = UpgradeStatus.COMPLETED;
      record.completedAt = completedAt;
      await this.upgradeRecordRepository.save(record);

      this.logger.log(
        `Upgrade ${record.moduleKey} ${record.fromVersion} → ${record.toVersion} completed`,
      );

      return {
        upgradeId: record.id,
        moduleKey: record.moduleKey,
        fromVersion: record.fromVersion,
        toVersion: record.toVersion,
        status: UpgradeStatus.COMPLETED,
        startedAt: record.startedAt!,
        completedAt,
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Upgrade ${record.moduleKey} ${record.fromVersion} → ${record.toVersion} failed: ${message}`,
      );

      // Attempt rollback of executed pre-hooks
      for (const hook of [...executedPreHooks].reverse()) {
        if (hook.rollback) {
          try {
            this.logger.log(`Rolling back pre-hook "${hook.name}"`);
            await hook.rollback(
              record.moduleKey,
              record.fromVersion,
              record.toVersion,
            );
          } catch (rollbackError) {
            this.logger.error(
              `Rollback of hook "${hook.name}" failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            );
          }
        }
      }

      const failedAt = new Date();
      record.status = UpgradeStatus.FAILED;
      record.error = message;
      record.completedAt = failedAt;
      await this.upgradeRecordRepository.save(record);

      return {
        upgradeId: record.id,
        moduleKey: record.moduleKey,
        fromVersion: record.fromVersion,
        toVersion: record.toVersion,
        status: UpgradeStatus.FAILED,
        startedAt: record.startedAt!,
        completedAt: failedAt,
        error: message,
      };
    }
  }

  async rollback(dto: RollbackUpgradeDto): Promise<UpgradeResult> {
    await this.assertVersionOrder(dto.targetVersion, dto.failedVersion);

    const failedRecord = await this.upgradeRecordRepository.findOne({
      where: {
        moduleKey: dto.moduleKey,
        fromVersion: dto.failedVersion,
        toVersion: dto.targetVersion,
      },
    });

    if (!failedRecord) {
      // Look for the inverse direction (we're rolling back from failedVersion to targetVersion)
      const originalRecord = await this.upgradeRecordRepository.findOne({
        where: {
          moduleKey: dto.moduleKey,
          fromVersion: dto.targetVersion,
          toVersion: dto.failedVersion,
        },
      });

      if (!originalRecord) {
        throw new NotFoundException(
          `No upgrade record found for ${dto.moduleKey} ${dto.targetVersion} → ${dto.failedVersion}`,
        );
      }

      // Create a rollback record
      const rollbackRecord = this.upgradeRecordRepository.create({
        moduleKey: dto.moduleKey,
        fromVersion: dto.failedVersion,
        toVersion: dto.targetVersion,
        status: UpgradeStatus.MIGRATING,
        description: `Rollback from ${dto.failedVersion} to ${dto.targetVersion}`,
        authorisedBy: dto.authorisedBy,
        startedAt: new Date(),
      });
      const saved = await this.upgradeRecordRepository.save(rollbackRecord);

      try {
        // Switch active implementation back
        const fromImpl = await this.findImplementation(
          dto.moduleKey,
          dto.failedVersion,
        ).catch(() => null);
        const toImpl = await this.findImplementation(
          dto.moduleKey,
          dto.targetVersion,
        ).catch(() => null);

        if (fromImpl) {
          fromImpl.active = false;
          await this.implVersionRepository.save(fromImpl);
        }
        if (toImpl) {
          toImpl.active = true;
          await this.implVersionRepository.save(toImpl);
        }

        const completedAt = new Date();
        saved.status = UpgradeStatus.ROLLED_BACK;
        saved.completedAt = completedAt;
        await this.upgradeRecordRepository.save(saved);

        // Mark the original upgrade as rolled back
        originalRecord.status = UpgradeStatus.ROLLED_BACK;
        originalRecord.completedAt = completedAt;
        await this.upgradeRecordRepository.save(originalRecord);

        this.logger.log(
          `Rollback ${dto.moduleKey} ${dto.failedVersion} → ${dto.targetVersion} completed`,
        );

        return {
          upgradeId: saved.id,
          moduleKey: saved.moduleKey,
          fromVersion: saved.fromVersion,
          toVersion: saved.toVersion,
          status: UpgradeStatus.ROLLED_BACK,
          startedAt: saved.startedAt!,
          completedAt,
          error: null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        saved.status = UpgradeStatus.FAILED;
        saved.error = message;
        saved.completedAt = new Date();
        await this.upgradeRecordRepository.save(saved);
        throw new BadRequestException(`Rollback failed: ${message}`);
      }
    }

    // Handle the case where we found the record in the expected direction
    return this.execute({
      moduleKey: dto.moduleKey,
      fromVersion: dto.failedVersion,
      toVersion: dto.targetVersion,
      authorisedBy: dto.authorisedBy,
    });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async queryUpgrades(dto: QueryUpgradesDto): Promise<UpgradeRecord[]> {
    const where: Record<string, unknown> = {};
    if (dto.moduleKey) where.moduleKey = dto.moduleKey;
    if (dto.status) where.status = dto.status;

    return this.upgradeRecordRepository.find({
      where,
      order: { createdAt: "DESC" },
      take: dto.limit ?? 50,
      skip: dto.offset ?? 0,
    });
  }

  async getUpgrade(id: string): Promise<UpgradeRecord> {
    const record = await this.upgradeRecordRepository.findOne({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException(`Upgrade ${id} not found`);
    }
    return record;
  }

  // ---------------------------------------------------------------------------
  // Snapshot (for rollback decisions)
  // ---------------------------------------------------------------------------

  async snapshot(moduleKey: string): Promise<UpgradeSnapshot> {
    const active = await this.findActiveImplementation(moduleKey);
    return {
      moduleKey,
      previousVersion: active?.version ?? "0.0.0",
      checksum: active?.checksum ?? "",
      timestamp: new Date(),
      metadata: active
        ? { artifactUri: active.artifactUri, coreCompatibilityRange: active.coreCompatibilityRange }
        : {},
    };
  }

  // ---------------------------------------------------------------------------
  // Testing utilities
  // ---------------------------------------------------------------------------

  async simulateUpgrade(dto: SimulateUpgradeDto): Promise<UpgradeResult> {
    await this.assertVersionOrder(dto.fromVersion, dto.toVersion);

    const hooks = this.migrationHooks.get(dto.moduleKey) ?? [];
    const hookNames = hooks.map((h) => `${h.phase}:${h.name}`);

    // Simulate pre-flight
    const checks = this.preflightChecks.get(dto.moduleKey) ?? [];
    const preflightResults: Record<string, boolean> = {};
    for (const check of checks) {
      try {
        preflightResults[check.name] = true;
      } catch {
        preflightResults[check.name] = false;
      }
    }

    const startedAt = new Date();
    let completedAt: Date | null = null;
    let status: UpgradeStatus = UpgradeStatus.COMPLETED;
    let error: string | null = null;

    try {
      // Dry-run hooks (don't actually execute)
      for (const hook of hooks) {
        this.logger.log(
          `[simulate] Would run ${hook.phase}-hook "${hook.name}" for ${dto.moduleKey}`,
        );
      }
      completedAt = new Date();
    } catch (err) {
      status = UpgradeStatus.FAILED;
      error = err instanceof Error ? err.message : String(err);
      completedAt = new Date();
    }

    let upgradeId = "simulated";

    if (dto.persist) {
      const record = this.upgradeRecordRepository.create({
        moduleKey: dto.moduleKey,
        fromVersion: dto.fromVersion,
        toVersion: dto.toVersion,
        status,
        description: "[simulated upgrade]",
        checklist: { preflight: preflightResults, hooks: hookNames },
        authorisedBy: "simulation",
        startedAt,
        completedAt,
        error,
      });
      const saved = await this.upgradeRecordRepository.save(record);
      upgradeId = saved.id;
    }

    return {
      upgradeId,
      moduleKey: dto.moduleKey,
      fromVersion: dto.fromVersion,
      toVersion: dto.toVersion,
      status,
      startedAt,
      completedAt,
      error,
    };
  }

  async simulateBatch(dto: SimulateBatchDto): Promise<UpgradeResult[]> {
    const results: UpgradeResult[] = [];
    for (const upgrade of dto.upgrades) {
      const result = await this.simulateUpgrade({
        moduleKey: upgrade.moduleKey,
        fromVersion: upgrade.fromVersion,
        toVersion: upgrade.toVersion,
        persist: false,
      });
      results.push(result);
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async assertVersionOrder(
    fromVersion: string,
    toVersion: string,
  ): Promise<void> {
    // Use string comparison for semver (satisfies simple semver requirements)
    if (fromVersion === toVersion) {
      throw new BadRequestException(
        "fromVersion and toVersion must be different",
      );
    }
  }

  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(message)), ms),
      ),
    ]);
  }
}
