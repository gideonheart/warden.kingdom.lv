---
status: complete
phase: 18-fix-token-usage-jsonl-session-reader-and-database-population
source: 18-01-SUMMARY.md, 18-02-SUMMARY.md
started: 2026-02-23T16:00:00Z
updated: 2026-02-23T16:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Token Usage Data Populated
expected: Navigate to History view → Token Usage tab. Table should show token usage data (input tokens, output tokens, cost) aggregated from JSONL session files. At least one agent/date row should be visible.
result: pass

### 2. Scan Now Button
expected: In Token Usage view, a "Scan Now" button is visible. Clicking it shows a spinner on the button (not full-page), then data refreshes when scan completes. The button returns to normal state after.
result: pass

### 3. Cache Token Columns in Daily Breakdown
expected: The daily breakdown table includes "Cache Write" and "Cache Read" columns showing cache_creation_input_tokens and cache_read_input_tokens values.
result: pass

### 4. Cache Token Sub-lines in Agent Summary Cards
expected: Per-agent summary cards show cache write and cache read sub-lines when cache token values are greater than zero. If an agent has no cache usage, those sub-lines should not appear.
result: pass

### 5. Human-Readable Agent IDs
expected: Agent identifiers display as readable project slugs (e.g., "warden-kingdom-lv") rather than raw directory paths (e.g., "home-forge-warden-kingdom-lv"). The "home-forge-" prefix is stripped.
result: pass

### 6. Auto-Scan on Server Start
expected: After restarting the server, token usage data is populated automatically without clicking "Scan Now". The periodic scanner starts on boot and populates data within the first scan interval.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
