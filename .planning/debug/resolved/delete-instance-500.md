---
status: resolved
trigger: "DELETE /api/instances/:id returns 500 Internal Server Error"
created: 2026-03-05T00:00:00Z
updated: 2026-03-05T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED — foreign key constraint violation when deleting instance that has child rows in session_lifecycle_events
test: ran sqlite3 with PRAGMA foreign_keys=ON and attempted DELETE — got "FOREIGN KEY constraint failed (19)"
expecting: fix by deleting child rows in a transaction before deleting the instance
next_action: fix deleteInstance() in DatabaseConnection.ts to cascade-delete lifecycle events

## Symptoms

expected: DELETE /api/instances/32 should dismiss/delete the stopped session from the DB, return 200/204, and the tab disappears
actual: Server returns 500 Internal Server Error. Console shows "Dismiss failed:" with no error details
errors: DELETE https://warden.kingdom.lv/api/instances/32 500 (Internal Server Error)
reproduction: Have a stopped session tab, click X/dismiss button → 500 error, tab stays
started: recent code change — not always broken

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-05T00:00:00Z
  checked: src/server/routes/instanceRoutes.ts DELETE handler (lines 334-362)
  found: The DELETE handler itself does NOT have a try/catch block. If database.deleteInstance() throws, Express catches the unhandled promise/sync exception and returns 500.
  implication: Root cause is likely an exception thrown inside database.deleteInstance()

- timestamp: 2026-03-05T00:01:00Z
  checked: DatabaseConnection.ts deleteInstance() (lines 100-105) and schema migrations
  found: instances table has two child tables with REFERENCES instances(id): session_logs (instance_id) and session_lifecycle_events (session_id). Both use NO ACTION. Production server runs PRAGMA foreign_keys = ON. Instance 32 has 2 rows in session_lifecycle_events. sqlite3 test confirms: "FOREIGN KEY constraint failed (19)" when attempting DELETE.
  implication: Any instance that has lifecycle events (all non-trivial sessions) will fail to delete. The fix is to wrap the delete in a transaction that first removes child rows.

## Resolution

root_cause: deleteInstance() calls DELETE on instances table without first removing child rows in session_lifecycle_events (and session_logs). The DatabaseConnection constructor sets PRAGMA foreign_keys = ON, so SQLite enforces the NO ACTION constraint and throws a FOREIGN KEY constraint error. The DELETE route handler has no try/catch, so Express returns 500.
fix: Wrap deleteInstance() in a transaction: first delete from session_lifecycle_events WHERE session_id = id, then delete from session_logs WHERE instance_id = id, then delete the instance row.
verification: sqlite3 test with PRAGMA foreign_keys=ON and transaction-based delete returned changes()=1 (success). Production build passed cleanly.
files_changed: [src/server/database/DatabaseConnection.ts]
