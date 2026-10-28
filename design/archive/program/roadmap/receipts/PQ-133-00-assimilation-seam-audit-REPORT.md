<!-- LIFETIME: DURABLE -->
# PQ-133.00 — assimilation + seam audit receipt

## Outcome

All four brief deliverables exist and verify:

1. **Plan moved:** `design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md` is the product owner; the former
   `docs/Spec/` location is a six-line move notice.
2. **Registry rows:** `design/PLAN_REGISTRY.md` (durable design source, admitted as PQ-133),
   `design/program/PROGRAM_MAP.md`, and `CANONICAL_BUILD_MAP.md` §12 all route Crucible.
3. **Queue admission:** `PQ-133.00`–`.13` all present in `program-queue.json` (14 rows).
4. **Seam map:** `design/program/roadmap/active/PQ-133_SEAM_AUDIT.md` (1,060 lines, 2026-08-21)
   covers sandbox/launch path, run lifecycle, weapon firing, contact/damage, physics authority,
   statuses, fields/Massline, enemies/materialization, grant/fit, contamination boundary, UI
   navigation, event bus, VFX adapter, performance budgets, checks to keep green, first-packet
   shapes (CRU-002 run-state contract, CRU-003 Lab setup schema), and risks — with 26 named MISSING
   seams that CRU-002/CRU-003 must supply.

## Claim-time re-verification (2026-09-01, zcode-main)

- Spot-checked the audit's pinned sandbox seams against live code: `SCENARIO_PRESETS`,
  `requestSandboxGame`, the `game:new` → `startNewGame` → `enterFlightMode` → `game:started` launch
  chain, and the grant/equip helpers all exist and are exported. The audit's exact line numbers have
  drifted (expected churn; the audit names this risk), its symbol-level claims hold.
- `node scripts/check-program-docs.mjs`: PASS (0 warnings).
- The audit is a source audit by design and ran no probe; per the packet, CRU-002/CRU-003 must
  re-verify any seam they consume with grep at claim time.

## Verdict

PASS — `.00` closes; `.01` (Combat Lab extension) is the strict next leaf.

## Next product unit

`PQ-133.01` — Combat Lab extension (depends only on this audit).
