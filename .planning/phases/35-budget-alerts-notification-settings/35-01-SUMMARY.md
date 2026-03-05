---
phase: 35-budget-alerts-notification-settings
plan: 01
subsystem: database
tags: [sqlite, notifications, budget, telegram, vitest, deduplication]

# Dependency graph
requires:
  - phase: 33-permission-prompt-notifications
    provides: NotificationDeduplicator, NotificationPoller, TelegramBotService
  - phase: 34-one-tap-approve
    provides: ApprovalStateTracker, ApprovalCallbackHandler

provides:
  - NotificationConfig shared type (permissionAlertsEnabled, budgetAlertsEnabled, permissionCooldownMs, budgetCooldownMs)
  - notification_config SQLite table with singleton-row pattern (id=1)
  - database.getNotificationConfig() returning defaults when no row exists
  - database.setNotificationConfig() upsert with ON CONFLICT pattern
  - BudgetAlertPoller service with amber/red threshold detection and deduplication
  - budgetAlertPoller singleton export
  - NotificationDeduplicator.recordAndCheck() with configurable cooldownMs parameter
  - 8 new BudgetAlertPoller unit tests
  - Updated NotificationDeduplicator tests with cooldownMs argument

affects:
  - 35-02 (notification settings UI will use getNotificationConfig/setNotificationConfig)
  - server/index.ts (needs to start budgetAlertPoller alongside notificationPoller)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - singleton-row table pattern (id INTEGER PRIMARY KEY CHECK (id = 1))
    - vi.hoisted() for mock functions referenced in vi.mock() factories
    - pollBudgets() reads config fresh on every poll cycle (no stale config risk)
    - level rank map for escalation detection (ok:0, warning:1, exceeded:2)

key-files:
  created:
    - src/server/services/BudgetAlertPoller.ts
    - tests/unit/BudgetAlertPoller.test.ts
  modified:
    - src/shared/types.ts
    - src/server/database/DatabaseConnection.ts
    - src/server/services/NotificationDeduplicator.ts
    - src/server/services/NotificationPoller.ts
    - tests/unit/NotificationDeduplicator.test.ts

key-decisions:
  - "vi.hoisted() used for mock functions in BudgetAlertPoller tests — vi.mock factories are hoisted before const declarations, so hoisted() is required"
  - "NotificationPoller reads permissionCooldownMs from database.getNotificationConfig() on each poll — picks up config changes without restart"
  - "BudgetAlertPoller level escalation uses rank map (ok:0, warning:1, exceeded:2) — clean O(1) comparison without if-chain"
  - "Record updated BEFORE async sendBudgetAlert call — prevents duplicate sends if poller re-enters during slow Telegram API calls"

patterns-established:
  - "Budget deduplication pattern: delete record on 'ok', fire on escalation OR cooldown expiry, suppress otherwise"
  - "Configurable cooldown parameter pattern: callers pass cooldownMs at call site, not hardcoded in service"

requirements-completed:
  - BUDG-01
  - BUDG-02
  - NSET-03

# Metrics
duration: 5min
completed: 2026-03-05
---

# Phase 35 Plan 01: Budget Alerts Foundation Summary

**BudgetAlertPoller with amber/red Telegram alerts, configurable cooldown deduplication, notification_config SQLite persistence, and NotificationDeduplicator refactored to accept cooldownMs parameter**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-05T00:07:22Z
- **Completed:** 2026-03-05T00:12:16Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `NotificationConfig` interface to shared types with four preference fields
- Added `notification_config` SQLite table using singleton-row pattern (same as `rotation_config`)
- Added `getNotificationConfig()` returning hardcoded defaults when no row exists, and `setNotificationConfig()` using upsert
- Created `BudgetAlertPoller` — polls every 10s, fires distinct amber/red Telegram alerts with deduplication
- Refactored `NotificationDeduplicator.recordAndCheck()` to accept `cooldownMs` parameter instead of hardcoded constant
- Updated `NotificationPoller` to read `permissionCooldownMs` from DB config on each poll cycle
- 90 tests pass (8 new BudgetAlertPoller + 9 updated NotificationDeduplicator)

## Task Commits

Each task was committed atomically:

1. **Task 1: NotificationConfig type, DB migration, and DB methods** - `18e2ca0` (feat)
2. **Task 2: BudgetAlertPoller, NotificationDeduplicator refactor, tests** - `4b4271b` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified
- `src/shared/types.ts` — Added `NotificationConfig` interface
- `src/server/database/DatabaseConnection.ts` — Added `notification_config` migration, `getNotificationConfig()`, `setNotificationConfig()`
- `src/server/services/BudgetAlertPoller.ts` — New service: budget threshold polling, deduplication, Telegram alerts
- `src/server/services/NotificationDeduplicator.ts` — Removed `PERMISSION_COOLDOWN_MS` constant, added `cooldownMs` parameter to `recordAndCheck()`
- `src/server/services/NotificationPoller.ts` — Updated to read `permissionCooldownMs` from `database.getNotificationConfig()`
- `tests/unit/BudgetAlertPoller.test.ts` — New: 8 test cases covering BUDG-01, BUDG-02, NSET-01
- `tests/unit/NotificationDeduplicator.test.ts` — Updated: all calls pass `120_000` cooldownMs, added custom cooldown test

## Decisions Made
- `vi.hoisted()` required for BudgetAlertPoller tests because `vi.mock` factories are hoisted to top of file before `const` declarations are initialized — `vi.hoisted()` runs the initialization at hoist time
- `NotificationPoller` updated to read `permissionCooldownMs` from DB on each poll — this was a Rule 3 auto-fix (breaking change from signature refactor)
- `BudgetAlertPoller` updates the record BEFORE the async `sendBudgetAlert` call — prevents duplicate fires on re-entry

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated NotificationPoller.recordAndCheck() call to pass cooldownMs**
- **Found during:** Task 2 (NotificationDeduplicator refactor)
- **Issue:** Changing `recordAndCheck()` signature to require `cooldownMs` broke `NotificationPoller.ts` which calls it without the parameter — TypeScript compile error
- **Fix:** Added `database` import to `NotificationPoller.ts`, read `config.permissionCooldownMs` from `getNotificationConfig()`, pass to `recordAndCheck()`
- **Files modified:** `src/server/services/NotificationPoller.ts`
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** `4b4271b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required fix — changing the `recordAndCheck()` signature naturally breaks callers. Fix is correct and desirable (NotificationPoller now uses configurable cooldown from DB).

## Issues Encountered
- Vitest mock hoisting: initial test file used top-level `const mockFn = vi.fn()` referenced inside `vi.mock()` factory — caused "Cannot access before initialization" error. Fixed by switching to `vi.hoisted()` pattern which creates mock functions before the hoisting boundary.

## User Setup Required
None — no external service configuration required. `budgetAlertPoller.startPolling()` still needs to be wired into `src/server/index.ts` (planned for a later task in phase 35).

## Next Phase Readiness
- `BudgetAlertPoller` is complete and fully tested — ready to wire into `src/server/index.ts`
- `notification_config` table and get/set API ready for settings UI in plan 35-02
- `NotificationDeduplicator` cooldown is now configurable from DB — notification settings will take effect without restart

---
*Phase: 35-budget-alerts-notification-settings*
*Completed: 2026-03-05*
