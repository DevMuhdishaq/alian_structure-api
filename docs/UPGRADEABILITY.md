# Upgradeability Module

The Upgradeability module provides a controlled, audited mechanism for upgrading
system components. It separates implementation artefacts from the upgrade
lifecycle, enforces role-based authorization, runs migration hooks, and records
every upgrade for compliance.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        REST API Layer                              │
│  POST /plan   POST /execute   POST /rollback   POST /simulate    │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   UpgradeabilityService │
              │  ─ plan / execute /     │
              │    rollback / simulate  │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────────┐
│ UpgradeRecord  │ │ Implementa-    │ │ MigrationHooks     │
│ (lifecycle     │ │ tionVersion    │ │ (pre/post hooks    │
│  tracking)     │ │ (artefacts)    │ │  per module)       │
└────────────────┘ └────────────────┘ └────────────────────┘
```

### Proxy + Implementation Separation

The module treats each logical component (`moduleKey`) as a proxy target.
Implementation versions are stored separately and activated during an upgrade:

- **ImplementationVersion** — stores the artefact URI, checksum, and
  compatibility metadata. Only one version per module is marked `active` at a
  time.
- **UpgradeRecord** — tracks the lifecycle of each upgrade (planned → migrating
  → completed/failed/rolled_back), including timing, authorization, and
  checklist results.

When `execute()` runs, the service deactivates the current implementation,
activates the target version, and records the transition.

## Upgrade Flow

### 1. Plan (`POST /api/v1/upgradeability/plan`)

Creates a `PENDING` upgrade record and runs pre-flight checks:

```bash
curl -X POST http://localhost:3001/api/v1/upgradeability/plan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "moduleKey": "oracle-service",
    "fromVersion": "1.0.0",
    "toVersion": "1.1.0",
    "description": "Adds price-feed caching"
  }'
```

Pre-flight checks registered via `registerPreFlightCheck()` are executed.
Results are stored in `preflightResults`.

### 2. Simulate (optional, `POST /api/v1/upgradeability/simulate`)

Dry-runs the upgrade pipeline without side effects:

```bash
curl -X POST http://localhost:3001/api/v1/upgradeability/simulate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "moduleKey": "oracle-service",
    "fromVersion": "1.0.0",
    "toVersion": "1.1.0"
  }'
```

Set `persist: true` to store the simulation result as a real upgrade record.

### 3. Execute (`POST /api/v1/upgradeability/execute`)

Runs the full upgrade pipeline:

1. Concurrency guard (max 1 upgrade at a time by default)
2. Runs pre-hooks in registration order
3. Deactivates previous implementation, activates target
4. Runs post-hooks in registration order
5. Records `COMPLETED` or `FAILED` status

```bash
curl -X POST http://localhost:3001/api/v1/upgradeability/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "moduleKey": "oracle-service",
    "fromVersion": "1.0.0",
    "toVersion": "1.1.0",
    "authorisedBy": "admin@company.com"
  }'
```

If a pre-hook fails, the service attempts to call any registered `rollback()`
hooks on previously executed hooks, then records the upgrade as `FAILED`.

### 4. Rollback (`POST /api/v1/upgradeability/rollback`)

Switches the active implementation back to a previous version:

```bash
curl -X POST http://localhost:3001/api/v1/upgradeability/rollback \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "moduleKey": "oracle-service",
    "failedVersion": "1.1.0",
    "targetVersion": "1.0.0",
    "authorisedBy": "admin@company.com"
  }'
```

The rollback creates a new upgrade record with status `ROLLED_BACK` and marks
the original upgrade as `ROLLED_BACK` as well.

## Migration Hooks

Hooks are registered per module and run in registration order. Each hook has a
`phase` ("pre" or "post") and an optional `rollback` function.

```typescript
service.registerMigrationHook("oracle-service", {
  name: "migrate-price-cache",
  phase: "pre",
  execute: async (moduleKey, fromVersion, toVersion) => {
    // Perform state migration (e.g., database schema changes)
  },
  rollback: async (moduleKey, fromVersion, toVersion) => {
    // Undo the migration if needed
  },
});
```

**Rules:**

- Pre-hooks execute before the implementation switch.
- Post-hooks execute after the implementation switch.
- Hooks are idempotent by design (they may be retried on partial failure).
- A thrown error marks the upgrade as `FAILED` and triggers rollback hooks
  on previously executed hooks (in reverse order).

## Pre-flight Checks

Pre-flight checks validate conditions before an upgrade is permitted:

```typescript
service.registerPreFlightCheck("oracle-service", {
  name: "disk-space",
  check: async (moduleKey, fromVersion, toVersion) => {
    const freeSpace = await getDiskSpace();
    return freeSpace > 1_000_000_000; // 1 GB minimum
  },
});
```

A failed check (returns `false` or throws) is recorded in the upgrade plan
but does **not** block execution — the operator decides whether to proceed.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/upgradeability/config` | Get current config |
| `POST` | `/upgradeability/config` | Update config |
| `POST` | `/upgradeability/implementations` | Register implementation version |
| `GET` | `/upgradeability/implementations/:moduleKey` | List implementations |
| `GET` | `/upgradeability/implementations/:moduleKey/active` | Get active implementation |
| `POST` | `/upgradeability/hooks` | Register migration hook |
| `GET` | `/upgradeability/hooks/:moduleKey` | List hooks for a module |
| `POST` | `/upgradeability/plan` | Plan an upgrade |
| `POST` | `/upgradeability/execute` | Execute a planned upgrade |
| `POST` | `/upgradeability/rollback` | Rollback to a previous version |
| `GET` | `/upgradeability/upgrades` | Query upgrade records |
| `GET` | `/upgradeability/upgrades/:id` | Get a single upgrade record |
| `GET` | `/upgradeability/snapshot/:moduleKey` | Snapshot current state |
| `POST` | `/upgradeability/simulate` | Simulate an upgrade (dry run) |
| `POST` | `/upgradeability/simulate/batch` | Simulate a batch of upgrades |

All endpoints require `ADMIN` role.

## Testing Utilities

### UpgradeSimulator

A standalone class for testing upgrade flows without a database:

```typescript
import { UpgradeSimulator } from "src/modules/upgradeability/testing/upgrade-simulator";

const simulator = new UpgradeSimulator();

simulator.registerPreFlightCheck("oracle", {
  name: "backup-exists",
  check: async () => true,
});

simulator.registerMigrationHook("oracle", {
  name: "migrate-cache",
  phase: "pre",
  execute: async () => { /* ... */ },
});

const result = await simulator.simulate({
  moduleKey: "oracle",
  fromVersion: "1.0.0",
  toVersion: "2.0.0",
});

expect(result.status).toBe("completed");
expect(simulator.getHookCalls()).toHaveLength(1);
```

### Running Tests

```bash
# Run all upgradeability tests
npm test -- --testPathPattern=upgradeability

# Run specific test files
npx jest src/modules/upgradeability/upgradeability.service.spec.ts
npx jest src/modules/upgradeability/upgradeability.controller.spec.ts
npx jest src/modules/upgradeability/testing/upgrade-simulator.spec.ts
```

## Upgrade Checklist

Before performing a production upgrade:

### Pre-upgrade

- [ ] **Version compatibility verified** — new version satisfies the core
  compatibility range
- [ ] **Backups completed** — database backups and artefact snapshots exist
- [ ] **Pre-flight checks pass** — disk space, connectivity, resource limits
- [ ] **Migration hooks tested** — simulate the upgrade in staging first
- [ ] **Rollback plan documented** — known-good version identified and tested
- [ ] **Monitoring configured** — alerts for error rate, latency, and resource
  usage are active
- [ ] **Change notification sent** — stakeholders informed of the upgrade window

### During execution

- [ ] **Authorization confirmed** — admin principal recorded in the upgrade
- [ ] **Concurrency guard respected** — no other upgrade running simultaneously
- [ ] **Pre-hooks completed** — state migrations applied successfully
- [ ] **Implementation switched** — active version changed
- [ ] **Post-hooks completed** — verification hooks passed

### Post-upgrade

- [ ] **Health checks pass** — service endpoints responding correctly
- [ ] **Smoke tests green** — critical path tests in production
- [ ] **Metrics stable** — error rate, latency, and throughput within bounds
- [ ] **Upgrade record reviewed** — timing, hooks, and outcome documented
- [ ] **Rollback tested** — rollback procedure verified (if not already done
  in staging)

## Security Considerations

### Authorization

- All upgradeability endpoints require the `ADMIN` role.
- The `authorisedBy` field in execute and rollback records the JWT principal
  for audit purposes.
- The module bypasses KYC checks (registry-level operation, same as the
  module registry).

### Concurrency control

- Only one upgrade can execute at a time (configurable via
  `maxConcurrentUpgrades`).
- A second execute() call for the same upgrade path is rejected with 409
  Conflict.

### Hook safety

- Hooks run within a configurable timeout (default 30 seconds).
- A failing hook does **not** automatically rollback — the system records the
  failure and attempts rollback of previously executed hooks.
- Hooks are external to the database transaction. Implementors **must** make
  hooks idempotent and compensate for side effects.

### Audit trail

- Every upgrade attempt creates an `UpgradeRecord` with:
  - Module key, from/to versions
  - Status lifecycle (pending → migrating → completed/failed/rolled_back)
  - Authorizing principal
  - Pre-flight check results
  - Checklist metadata
  - Timing (startedAt, completedAt)
  - Error details

### Artefact integrity

- Implementation versions include a checksum that should be verified against
  the deployed artefact.
- The `artifactUri` should point to a versioned, immutable storage location.

### Rollback safety

- Rollback switches the active implementation and records a `ROLLED_BACK`
  status.
- The original upgrade is also marked as `ROLLED_BACK` for audit completeness.
- Rollback hooks are called for any hooks that executed during the failed
  upgrade.

### Recommendations

1. **Never skip simulation** — always run `POST /simulate` before executing
   in production.
2. **Test in staging** — run the full upgrade flow in a staging environment
   that mirrors production.
3. **Monitor post-upgrade** — watch error rates and performance for at least
   30 minutes after the upgrade.
4. **Rotate secrets** — if the upgrade involves key material or credentials,
   rotate them as part of the post-hook.
5. **Pin artefact hashes** — always register a checksum when uploading an
   implementation version.

## Deployment Script

A demonstration script is provided at `scripts/deploy-upgrade.sh` that
performs the full upgrade lifecycle through the REST API:

```bash
UPGRADE_API_URL=http://localhost:3001/api/v1 \
ADMIN_TOKEN=<admin-jwt> \
MODULE_KEY=oracle-service \
FROM_VERSION=1.0.0 \
TO_VERSION=1.1.0 \
bash scripts/deploy-upgrade.sh
```

The script:
1. Checks the current active implementation
2. Registers the new implementation version
3. Registers migration hooks (pre and post)
4. Plans the upgrade (runs pre-flight checks)
5. Simulates the upgrade (dry run)
6. Executes the upgrade
7. Verifies the post-upgrade state
8. Triggers rollback automatically if the upgrade failed
