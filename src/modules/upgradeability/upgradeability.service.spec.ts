import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import {
  UpgradeRecord,
  UpgradeStatus,
} from "src/modules/upgradeability/entities/upgrade-record.entity";
import {
  ImplementationVersion,
} from "src/modules/upgradeability/entities/implementation-version.entity";
import { UpgradeabilityModule } from "src/modules/upgradeability/upgradeability.module";
import { UpgradeabilityService } from "src/modules/upgradeability/upgradeability.service";
import { MigrationHook } from "src/modules/upgradeability/interfaces/upgradeability.interface";

describe("UpgradeabilityService", () => {
  let testingModule: TestingModule;
  let service: UpgradeabilityService;

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "sqlite",
          database: ":memory:",
          dropSchema: true,
          synchronize: true,
          entities: [UpgradeRecord, ImplementationVersion],
        }),
        UpgradeabilityModule,
      ],
    }).compile();

    service = testingModule.get(UpgradeabilityService);
  });

  afterEach(async () => {
    await testingModule.get(DataSource).destroy();
    await testingModule.close();
  });

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  describe("configuration", () => {
    it("returns default config", () => {
      const config = service.getConfig();
      expect(config.authorisedRoles).toEqual(["ADMIN"]);
      expect(config.maxConcurrentUpgrades).toBe(1);
      expect(config.hookTimeoutMs).toBe(30_000);
    });

    it("updates config", () => {
      const updated = service.updateConfig({
        maxConcurrentUpgrades: 5,
        hookTimeoutMs: 60_000,
      });
      expect(updated.maxConcurrentUpgrades).toBe(5);
      expect(updated.hookTimeoutMs).toBe(60_000);
    });
  });

  // ---------------------------------------------------------------------------
  // Plan
  // ---------------------------------------------------------------------------

  describe("plan", () => {
    it("creates a PENDING upgrade record", async () => {
      const record = await service.plan({
        moduleKey: "test-module",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        description: "Test upgrade",
      });

      expect(record.id).toBeDefined();
      expect(record.moduleKey).toBe("test-module");
      expect(record.fromVersion).toBe("1.0.0");
      expect(record.toVersion).toBe("2.0.0");
      expect(record.status).toBe(UpgradeStatus.PENDING);
      expect(record.description).toBe("Test upgrade");
    });

    it("runs pre-flight checks and records results", async () => {
      service.registerPreFlightCheck("test-module", {
        name: "backup-exists",
        check: async () => true,
      });

      const record = await service.plan({
        moduleKey: "test-module",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
      });

      expect(record.preflightResults).toEqual({ "backup-exists": true });
    });

    it("records failed pre-flight checks", async () => {
      service.registerPreFlightCheck("test-module", {
        name: "disk-space",
        check: async () => {
          throw new Error("not enough disk space");
        },
      });

      const record = await service.plan({
        moduleKey: "test-module",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
      });

      expect(record.preflightResults).toEqual({ "disk-space": false });
    });

    it("includes hook names in checklist", async () => {
      service.registerMigrationHook("test-module", {
        name: "migrate-data",
        phase: "pre",
        execute: async () => {},
      });
      service.registerMigrationHook("test-module", {
        name: "verify-migration",
        phase: "post",
        execute: async () => {},
      });

      const record = await service.plan({
        moduleKey: "test-module",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
      });

      expect(record.checklist).toMatchObject({
        preHooks: ["migrate-data"],
        postHooks: ["verify-migration"],
      });
    });

    it("rejects same fromVersion and toVersion", async () => {
      await expect(
        service.plan({
          moduleKey: "test-module",
          fromVersion: "1.0.0",
          toVersion: "1.0.0",
        }),
      ).rejects.toThrow("fromVersion and toVersion must be different");
    });

    it("rejects duplicate plan for same upgrade path", async () => {
      await service.plan({
        moduleKey: "test-module",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
      });

      await expect(
        service.plan({
          moduleKey: "test-module",
          fromVersion: "1.0.0",
          toVersion: "2.0.0",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ---------------------------------------------------------------------------
  // Implementations
  // ---------------------------------------------------------------------------

  describe("implementations", () => {
    it("registers an implementation version", async () => {
      const impl = await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "1.0.0",
        checksum: "sha256:abc123",
        artifactUri: "s3://bucket/oracle/1.0.0.tar.gz",
        active: true,
      });

      expect(impl.id).toBeDefined();
      expect(impl.moduleKey).toBe("oracle-service");
      expect(impl.version).toBe("1.0.0");
      expect(impl.active).toBe(true);
    });

    it("deactivates previous active when new active registered", async () => {
      await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "1.0.0",
        checksum: "sha256:abc123",
        artifactUri: "s3://bucket/oracle/1.0.0.tar.gz",
        active: true,
      });

      await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "2.0.0",
        checksum: "sha256:def456",
        artifactUri: "s3://bucket/oracle/2.0.0.tar.gz",
        active: true,
      });

      const v1 = await service.findImplementation("oracle-service", "1.0.0");
      const v2 = await service.findImplementation("oracle-service", "2.0.0");
      expect(v1.active).toBe(false);
      expect(v2.active).toBe(true);
    });

    it("rejects duplicate version registration", async () => {
      await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "1.0.0",
        checksum: "sha256:abc123",
        artifactUri: "s3://bucket/oracle/1.0.0.tar.gz",
      });

      await expect(
        service.registerImplementation({
          moduleKey: "oracle-service",
          version: "1.0.0",
          checksum: "sha256:abc123",
          artifactUri: "s3://bucket/oracle/1.0.0.tar.gz",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("finds active implementation", async () => {
      await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "1.0.0",
        checksum: "sha256:abc123",
        artifactUri: "s3://bucket/oracle/1.0.0.tar.gz",
        active: true,
      });

      const active = await service.findActiveImplementation("oracle-service");
      expect(active).not.toBeNull();
      expect(active!.version).toBe("1.0.0");
    });

    it("returns null when no active implementation", async () => {
      const active = await service.findActiveImplementation("nonexistent");
      expect(active).toBeNull();
    });

    it("throws NotFoundException for unknown version", async () => {
      await expect(
        service.findImplementation("oracle-service", "9.0.0"),
      ).rejects.toThrow(NotFoundException);
    });

    it("lists all implementations for a module", async () => {
      await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "1.0.0",
        checksum: "sha256:a",
        artifactUri: "s3://a",
      });
      await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "2.0.0",
        checksum: "sha256:b",
        artifactUri: "s3://b",
      });

      const impls = await service.listImplementations("oracle-service");
      expect(impls).toHaveLength(2);
      const versions = impls.map((i) => i.version);
      expect(versions).toContain("1.0.0");
      expect(versions).toContain("2.0.0");
    });
  });

  // ---------------------------------------------------------------------------
  // Execute
  // ---------------------------------------------------------------------------

  describe("execute", () => {
    beforeEach(async () => {
      await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "1.0.0",
        checksum: "sha256:abc",
        artifactUri: "s3://a",
        active: true,
      });
      await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "2.0.0",
        checksum: "sha256:def",
        artifactUri: "s3://b",
      });
    });

    it("completes an upgrade with no hooks", async () => {
      const result = await service.execute({
        moduleKey: "oracle-service",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        authorisedBy: "admin@test.com",
      });

      expect(result.status).toBe(UpgradeStatus.COMPLETED);
      expect(result.upgradeId).toBeDefined();

      const active = await service.findActiveImplementation("oracle-service");
      expect(active!.version).toBe("2.0.0");
    });

    it("runs pre-hooks before switching implementation", async () => {
      const callOrder: string[] = [];
      service.registerMigrationHook("oracle-service", {
        name: "pre-migrate",
        phase: "pre",
        execute: async () => {
          callOrder.push("pre-hook");
        },
      });

      await service.execute({
        moduleKey: "oracle-service",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        authorisedBy: "admin@test.com",
      });

      expect(callOrder).toEqual(["pre-hook"]);
    });

    it("runs post-hooks after switching implementation", async () => {
      const callOrder: string[] = [];
      service.registerMigrationHook("oracle-service", {
        name: "post-verify",
        phase: "post",
        execute: async () => {
          const active = await service.findActiveImplementation(
            "oracle-service",
          );
          if (active?.version === "2.0.0") {
            callOrder.push("post-hook-after-switch");
          }
        },
      });

      await service.execute({
        moduleKey: "oracle-service",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        authorisedBy: "admin@test.com",
      });

      expect(callOrder).toEqual(["post-hook-after-switch"]);
    });

    it("auto-plans when no plan exists", async () => {
      const result = await service.execute({
        moduleKey: "oracle-service",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        authorisedBy: "admin@test.com",
      });

      expect(result.status).toBe(UpgradeStatus.COMPLETED);

      const record = await service.getUpgrade(result.upgradeId);
      expect(record.status).toBe(UpgradeStatus.COMPLETED);
      expect(record.authorisedBy).toBe("admin@test.com");
    });

    it("marks upgrade as FAILED when pre-hook throws", async () => {
      service.registerMigrationHook("oracle-service", {
        name: "failing-hook",
        phase: "pre",
        execute: async () => {
          throw new Error("migration table missing");
        },
      });

      const result = await service.execute({
        moduleKey: "oracle-service",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        authorisedBy: "admin@test.com",
      });

      expect(result.status).toBe(UpgradeStatus.FAILED);
      expect(result.error).toContain("migration table missing");

      const record = await service.getUpgrade(result.upgradeId);
      expect(record.status).toBe(UpgradeStatus.FAILED);
    });

    it("calls rollback on executed pre-hooks when a later hook fails", async () => {
      const rollbackCalls: string[] = [];

      service.registerMigrationHook("oracle-service", {
        name: "first-hook",
        phase: "pre",
        execute: async () => {
          rollbackCalls.push("execute:first");
        },
        rollback: async () => {
          rollbackCalls.push("rollback:first");
        },
      });

      service.registerMigrationHook("oracle-service", {
        name: "second-hook",
        phase: "pre",
        execute: async () => {
          throw new Error("second hook failed");
        },
      });

      const result = await service.execute({
        moduleKey: "oracle-service",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        authorisedBy: "admin@test.com",
      });

      expect(result.status).toBe(UpgradeStatus.FAILED);
      expect(rollbackCalls).toContain("execute:first");
      expect(rollbackCalls).toContain("rollback:first");
    });
  });

  // ---------------------------------------------------------------------------
  // Rollback
  // ---------------------------------------------------------------------------

  describe("rollback", () => {
    beforeEach(async () => {
      await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "1.0.0",
        checksum: "sha256:abc",
        artifactUri: "s3://a",
        active: true,
      });
      await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "2.0.0",
        checksum: "sha256:def",
        artifactUri: "s3://b",
      });
    });

    it("rolls back to a previous version", async () => {
      // First upgrade
      await service.execute({
        moduleKey: "oracle-service",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        authorisedBy: "admin@test.com",
      });

      const active = await service.findActiveImplementation("oracle-service");
      expect(active!.version).toBe("2.0.0");

      // Rollback
      const result = await service.rollback({
        moduleKey: "oracle-service",
        failedVersion: "2.0.0",
        targetVersion: "1.0.0",
        authorisedBy: "admin@test.com",
      });

      expect(result.status).toBe(UpgradeStatus.ROLLED_BACK);

      const activeAfter = await service.findActiveImplementation(
        "oracle-service",
      );
      expect(activeAfter!.version).toBe("1.0.0");
    });
  });

  // ---------------------------------------------------------------------------
  // Migration hooks registry
  // ---------------------------------------------------------------------------

  describe("migration hooks", () => {
    it("registers and retrieves hooks", async () => {
      service.registerMigrationHook("oracle-service", {
        name: "migrate-cache",
        phase: "pre",
        execute: async () => {},
      });

      const hooks = service.getRegisteredHooks("oracle-service");
      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe("migrate-cache");
      expect(hooks[0].phase).toBe("pre");
    });

    it("registers hook from DTO", async () => {
      service.registerMigrationHookFromDto({
        moduleKey: "oracle-service",
        name: "stub-hook",
        phase: "post",
      });

      const hooks = service.getRegisteredHooks("oracle-service");
      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe("stub-hook");
    });
  });

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  describe("simulation", () => {
    it("simulates an upgrade without persisting", async () => {
      service.registerMigrationHook("oracle-service", {
        name: "test-hook",
        phase: "pre",
        execute: async () => {},
      });

      const result = await service.simulateUpgrade({
        moduleKey: "oracle-service",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
      });

      expect(result.status).toBe(UpgradeStatus.COMPLETED);
      expect(result.upgradeId).toBe("simulated");
    });

    it("simulates with persistence when requested", async () => {
      const result = await service.simulateUpgrade({
        moduleKey: "oracle-service",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        persist: true,
      });

      expect(result.status).toBe(UpgradeStatus.COMPLETED);
      expect(result.upgradeId).not.toBe("simulated");

      const record = await service.getUpgrade(result.upgradeId);
      expect(record.description).toBe("[simulated upgrade]");
    });

    it("simulates a batch of upgrades", async () => {
      const results = await service.simulateBatch({
        upgrades: [
          {
            moduleKey: "oracle-service",
            fromVersion: "1.0.0",
            toVersion: "2.0.0",
          },
          {
            moduleKey: "cache-service",
            fromVersion: "1.0.0",
            toVersion: "3.0.0",
          },
        ],
      });

      expect(results).toHaveLength(2);
      expect(results[0].moduleKey).toBe("oracle-service");
      expect(results[1].moduleKey).toBe("cache-service");
    });
  });

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  describe("snapshot", () => {
    it("returns active implementation info", async () => {
      await service.registerImplementation({
        moduleKey: "oracle-service",
        version: "1.0.0",
        checksum: "sha256:abc",
        artifactUri: "s3://a",
        active: true,
      });

      const snap = await service.snapshot("oracle-service");
      expect(snap.moduleKey).toBe("oracle-service");
      expect(snap.previousVersion).toBe("1.0.0");
      expect(snap.checksum).toBe("sha256:abc");
    });

    it("returns defaults when no active implementation", async () => {
      const snap = await service.snapshot("nonexistent");
      expect(snap.previousVersion).toBe("0.0.0");
      expect(snap.checksum).toBe("");
    });
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  describe("queries", () => {
    it("queries upgrades by moduleKey", async () => {
      await service.plan({
        moduleKey: "oracle-service",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
      });
      await service.plan({
        moduleKey: "cache-service",
        fromVersion: "1.0.0",
        toVersion: "3.0.0",
      });

      const oracleUpgrades = await service.queryUpgrades({
        moduleKey: "oracle-service",
      });
      expect(oracleUpgrades).toHaveLength(1);
      expect(oracleUpgrades[0].moduleKey).toBe("oracle-service");
    });

    it("queries upgrades by status", async () => {
      await service.plan({
        moduleKey: "oracle-service",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
      });

      const pending = await service.queryUpgrades({ status: "pending" });
      expect(pending).toHaveLength(1);

      const completed = await service.queryUpgrades({ status: "completed" });
      expect(completed).toHaveLength(0);
    });

    it("throws NotFoundException for unknown upgrade id", async () => {
      await expect(
        service.getUpgrade("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
