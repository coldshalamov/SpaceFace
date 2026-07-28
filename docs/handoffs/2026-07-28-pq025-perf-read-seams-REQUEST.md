# Narrow owner read-seam request: five absent performance facts (PQ-025 → PERF lane)

Requesting lane: PQ-025 Gold Corridor acceptance (contracts prework integrated at `f7229962`,
receipt `design/program/roadmap/receipts/PQ-025-contracts-prework-REPORT.md`).
Requested owner: the performance harness program (PQ-034/PERF-00 and successors), which holds
`performance-evidence` and is the only sanctioned writer for measurement surfaces.

## What is missing

PQ-025's Phase-0 semantic map proved these owner facts do not exist anywhere in `src/` or
`scripts/` (file:line evidence in the receipt). Without them, no native qualification attempt can
record the performance rows its schema requires, so the performance half of Gold Corridor
qualification is structurally unsatisfiable today:

| ID | Fact | Current state |
|---|---|---|
| F1 | frame-time p50 (raw samples) | `reportStat` exposes only last/avg/min/max/p95; raw sample array is internal |
| F2 | frame-time p99 | zero occurrences repo-wide |
| F3 | missed-vsync count | zero occurrences repo-wide |
| F4 | memory/GPU residency as an owner fact | only harness-side Chrome-only `performance.memory` |
| F5 | draw/triangle counts as owner facts | not exposed on any owner surface |

## What is requested

Read-only, bounded seams — not new measurement systems: expose raw samples (or
p50/p99 computed at the owner), a missed-vsync counter, residency baseline/peak/end, and per-frame
draw/triangle counts on whatever surface the PERF-00 equivalence/attribution harness already
standardizes. PQ-025's observer consumes them read-only with `verified|unknown` confidence and
never emits gameplay events.

## Constraints from the requesting side

- PQ-025 may not build these itself (acceptance-only packet; gameplay/measurement source is
  read-only for it) and may not run anything under the leases PQ-034 holds.
- `unknown` never converts to pass in the PQ-025 contracts, so absent seams fail qualification
  closed rather than silently.
- No urgency coupling: this blocks PQ-025 Phase 3+ (qualification cells), not the currently
  running corridor packets.

Related known shared-change request, reconfirmed by the same audit (F6): `state.masslineAcquisition`
is permanently null (publisher has zero call sites). PQ-025's contracts already sidestep it via the
`tether:attached` physics authority (`src/combat/attachments.js:212`), so it is informational here.
