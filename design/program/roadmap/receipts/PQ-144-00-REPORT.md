# PQ-144.00 — The three density layers as a budget table

- **State:** integrated
- **Date:** 2026-09-06
- **Kind:** implementation
- **Base commit:** 7826782c (entry tree carried foreign in-flight hunks: PQ-137.11, PQ-180.03, PQ-189.00 — none touched)
- **Integrated commit:** (filled at commit time)

## Outcome

`design/PERF_BUDGET.md` §8 now holds the three density layers as a budget table: foreground
(fully simulated, interruptible), midground (coherent at cheaper cadence), background (implied:
lights, silhouettes, crossings) — every row naming an existing system with a file:line anchor,
plus the honest-boundary findings (§8.4). Nothing fake is reachable; nothing reachable is faked.

## Done-when evidence

- **A table in `design/PERF_BUDGET.md`:** done — §8.1/§8.2/§8.3/§8.4 with 21 system rows across
  the three layers, each anchored to live code (`src/systems/*`, `src/render/*`, `src/ui/radar.js`).
- **Runtime witness before/after every §13C packet:** the guard rule is now written into §8's
  header (witness before and after every §13C packet, no new top frame-time bucket). The current
  "before" report is snapshotted at
  `design/program/roadmap/receipts/evidence/PQ-144-00-witness-before.md`
  (source `.devshots/runtime-witness/report.md`, run 2026-09-06 on the entry tree).

## Numbers

Witness (before snapshot, headed Electron, seed 47, ~2.5 min sample):

| Metric | Value |
|---|---|
| Verdict | hitching (4 of last 6 samples) |
| simFrame p95 / avg / max | 42.2 / 24.3 / 72.6 ms |
| admission max | 13106 ms (one-shot shader-compile stall) |
| tacticalAI p95 | 4.30 ms |
| physics p95 | 1.60 ms |
| Draw calls (live) | 75 |

The top bucket is `simFrame` — owned by the PQ-129 hitch campaign and the in-flight PQ-137.11 sim
work; this unit adds a documentation table and no runtime code, so no after-witness delta is
expected from it. The §13C-guard cadence (before/after each packet) is the standing rule this
table installs.

## Tradeoff deliberately spent

None — documentation only. The table constrains future §13C packets to the existing honest
boundary instead of permitting cheaper fake-presence shortcuts.

## Verification

- `npm run check:perf-budget` → PERF_BUDGET contract OK (10 required, 4 forbidden checks).
- Entry `check:baseline` red (47-A hash drift) — pre-existing on the shared dirty tree from
  foreign in-flight sim work (sg02DynamicBodyOwner.js et al.), recorded not chased
  (`docs/COMMON_BUGS.md` §8 procedure; not my unit's seam).
