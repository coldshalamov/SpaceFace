# SF-286 — First victory becomes the first useful wreck

**Board row:** build_map.md §row 76 (PB-SLICE-A)
**Status:** IMPLEMENTED — reviewed PASS
**Owner seam:** `src/systems/aftermathWrecks.js` (marker/pool authority) + `src/systems/salvageActions.js` (verb annotation) + `src/data/salvageLegality.js` (legality remap)

## Outcome

The ordinary-route loop already existed end to end; the equivalent-feature gate found one real
causality break and closed it. Killing a cargo hauler produced a bound wreck whose manifest residue
was silently replaced by a generic action-catalog pool — "recovered value traceable to the body"
was false in production because `salvageActions._annotate` overwrote `data.salvagePool` on every
wreck, including marker-bound ones where the field IS the durable marker's own pool object (shared
by reference so partial salvage writes through). The overwrite both detached live salvage from the
persistent record (a drain would write to a forked anonymous pool while the marker stayed full)
and discarded the victim's freight identity.

## Changes

- `src/systems/salvageActions.js` — `_annotate` gained a bound-pool branch: when `data.markerId`
  is present and the pool is non-empty, the legality remap lands **in place** (delete keys +
  assign) instead of replacing the field. Anonymous wrecks still get `poolForAction` pools;
  `authoredSalvagePool` precedence unchanged.
- `src/data/salvageLegality.js` — `salvagePoolForWreck` is now idempotent: the guaranteed +1
  classified yield on restricted wrecks fires only when the pool has not been remapped yet
  (`CLASSIFIED in out`), so a re-annotated bound wreck can no longer mint classified salvage into
  the durable marker on every materialization/scan.
- `test/sf286-first-victory-wreck.test.mjs` — new. The full player-route chain on real owners
  (aftermath → annotate → beam cut → custody → sale → shipyard purchase + fit), plus the refusal
  case and the idempotence regression.

## Verification

- `node --test test/sf286-first-victory-wreck.test.mjs` → 3/3.
- Adjacent: aftermath×*, salvage×*, wreck×*, depth-program (authored-salvage / r2-registry /
  unique-wrecks), unique-wreck-salvaged-husk, bp011-wreck-failure, docked-customs-post,
  cargo-kill-salvage-sale-opportunity → 116/116.
- Packet's named routes: `core-first-ten-minute-contract` 8/8; `pq195-09` subtests b/c/d pass;
  subtest (a) fails on a suite that never registers `salvageActions` or calls `salvagePoolForWreck`
  — foreign/pre-existing drift, attributed.
- Review: spawned reviewer → FAIL→PASS cycle. Found defects (classified mint, phantom
  provenance field in test finder, missing remap-ran pin) all fixed and verified.

## Design notes

- Value traceability is the victim's manifest residue (`wreckCargoResidueFor`: floor(30%) per
  line, capped) — a food hauler's wreck yields food, not generic electronics.
- The first fight lands in Ceres Belt (Helios `enemyDensity: 0`); the upgrade leg returns to
  Helios's shipyard — the loop routes back through a real service as the packet asks.
- Refusal stays playable: the marker outlives the choice to walk away; no heat, no forced chore.
