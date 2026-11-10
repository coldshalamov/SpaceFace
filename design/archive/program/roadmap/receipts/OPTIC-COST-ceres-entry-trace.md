# OPTIC-COST — the Ceres entry cost trace (§1C row 54, ACCEPT)

Date: 2026-09-29 · Lane: pb-ten-lanes acceptance · Seed: 4242 · Frame budget: one 60 Hz frame = 16.667 ms

## The row

`build_map.md` §1C row 54: *"The required Ceres-entry cost trace for 42 optic bodies was never
produced — scatter shipped live regardless; produce the artifact or retire the guard."* The guard it
names is §24 "Collider cost": *"A Ceres entry trace names the optic bodies' cost. Scatter stays off
until that cost fits the frame."* Preflight confirmed the state that row describes: the seeded
scatter runs ungated at `src/systems/world.js:1301-1304` (`_ensureOpticStructures` calls
`_opticScatterSpecs` at `:1302` for any field-bearing sector with no authored structure — there is
no flag), and
no Ceres entry cost artifact existed anywhere in the tree. This receipt produces the artifact. The
numbers are as measured; nothing was tuned to fit.

## Instrument

`scripts/probe-optic-cost-ceres-entry.mjs` (committed; reproducer for every number below):

```
node scripts/probe-optic-cost-ceres-entry.mjs --repeats=21
```

Headless fixed-seed sim (real `core` + real `world` system, the same boot idiom as
`test/optic-seeded-scatter.test.mjs`), tracing the three moments a player meets the 42-body Ceres
Prism Gallery (`optic_ceres_prism_gallery`, 15 diamond / 25 stone / 2 metal):

1. **Ceres entry** — `enterSector('sector_ceres_belt')` stamps the lattice through
   `_ensureOpticStructures` (42 `insertAsteroidFieldRock` calls) on the materialization frame.
2. **Quiet belt** — player parked at the sector entry point, lattice still field-resident; the
   per-tick cost of 42 extra compact records with the far-quiet latch at its production default ON.
3. **At the gallery** — player inside the authored decode disc (6 s × travel speed ≥ 960 WU,
   `TABLE_AUTHORED_DECODE_SECONDS`, `src/render/tabletopPolicy.js:45`); the promote-burst arrival
   tick and the promoted steady state.

Every moment is an **A/B against a sibling boot on the same seed with only the optic stamp
suppressed** (`world._ensureOpticStructures` stubbed — the same control
`optic-seeded-scatter.test.mjs` uses), so each delta is the optic bodies' share, not residency noise.
The probe throws if the suppressed arm leaks a single optic record. Entry-arm timing order
alternates per repeat so neither arm systematically pays the previous boot's GC.

Canonical artifact: `.devshots/optic-cost/2026-09-29T05-18-00.json` (`.devshots/` is gitignored;
the numbers live in this receipt and regenerate from the command above).

## The numbers (seed 4242, canonical run --repeats=21)

| Moment | With gallery | Stamp suppressed | Optic share | % of frame |
|---|---|---|---|---|
| Entry stamp `_ensureOpticStructures` (42 records) | — | — | **0.146 ms median** (n=21; 0.144–0.188 across runs) | ~0.9 % |
| Quiet belt per tick (lattice field-resident, latch ON) | 0.394 ms | 0.582 ms | **−0.19 ms/tick** (noise: −0.53…−0.02 across runs ≈ zero) | 0 % |
| Promote-burst arrival tick (42 spawns, n=21) | 1.463 ms | 0.224 ms | **+1.24 ms** (1.24–1.85 across runs) | ~9 % |
| Promoted steady state per tick (42 live colliders) | 0.865 ms | 0.315 ms | **+0.55 ms/tick** (band +0.27…+1.94 across 4 runs) | 3–12 % |

Census at entry: 42 stamped records, **0 live optic bodies at entry** (the lattice stays
field-resident — promotion is decode-disc-only, `src/world/asteroidField.js:399`), sector field
321 rocks vs 279 suppressed (+42 exactly), live asteroids 11 both arms.

**Verdict: the cost fits the frame at every measured moment.** Worst observed steady delta
(+1.94 ms/tick on one run) is 11.6 % of a 60 Hz frame; the typical run sits at 3–6 %; entry and
burst are 1–9 % of one frame, once.

## What pays the steady delta (attribution run)

A follow-up instrument (`.devshots/optic-cost/attr.mjs`, throwaway) split the promoted steady
delta: `tickOpticFieldRocks` solo is **0.024 ms/tick** with 42 live bodies (vs 0.001 suppressed) —
the optic tick itself is negligible. The rest of the delta is the sim-wide cost any 42 extra
resident colliders at the player's position cost (disc queries returning 42 more records, entity
bookkeeping) — the ordinary combat-asteroid path, not optic-specific code. The render/physics cost
of 42 rocks is the same class the belts already carry; this trace names the optic-attributable sim
share, which is what the §24 guard asks about.

Two sim-behavior findings pinned on the way (both correct-as-designed, now under test):

- **The dead-centre cell refuses admit.** A ship parked exactly on the (0,0) diamond does not get
  that collider materialized under it — `resolveAdmitOverlap`
  (`src/world/asteroidField.js:245`) refuses deep overlap (the D50 fling guard), so raw
  `tickOpticFieldRocks` promotes 41. The probe's dead-centre park still reached 42 because
  `_tickAsteroidFieldInteractions` (`src/systems/world.js:3771`) touch-promotes with
  `reason: 'ram'`, which is exempt. Same cost class; both paths are pinned in
  `test/optic-ceres-entry-cost.test.mjs`.
- **Field-resident lattices cost the save nothing.** Lattice bodies are recipe-spawned and never
  serialized; only the spent-cell ledger `opticSpent` rides the save
  (`src/systems/world.js:6032`).

## Guard decision

The §24 guard's condition — *scatter stays off until that cost fits the frame* — is now
**measured-met**: the 42-body anchor costs ≤ ~12 % of a frame in its worst measured moment and
~0 when nobody is looking (quiet latch). Seeded scatter adds *less* per belt than the anchor it
rode in on: the measured ordinary belt (Charon Expanse, seed 4242) grows 2 lattices / **16 cells**
vs the 42-cell Ceres anchor, through the same stamp/compile code path, on a dedicated RNG branch
that leaves the rock draw byte-identical (proven by `test/optic-seeded-scatter.test.mjs`).

So the honest close is **the artifact, with scatter's live status now evidence-backed** rather than
ungated-by-accident. No number was tuned; had any moment not fit, the close would have been this
same trace with the guard kept on. build_map.md itself is owned by the roadmap lane and was not
edited.

## Files

- `scripts/probe-optic-cost-ceres-entry.mjs` — new: the trace instrument (A/B, alternating entry
  order, burst control, scatter anchor, verdict block).
- `test/optic-ceres-entry-cost.test.mjs` — new: the counterexample test (below).
- `design/program/roadmap/receipts/OPTIC-COST-ceres-entry-trace.md` — this receipt.

## Checks (all run this session, real exit codes)

| Command | Exit | Result |
|---|---|---|
| `node scripts/probe-optic-cost-ceres-entry.mjs --repeats=21` | 0 | canonical artifact above; verdict `fitsFrame: {entryStampMs: true, promoteBurstTickMs: true, steadyPerTickDeltaMs: true}` |
| `node scripts/probe-optic-cost-ceres-entry.mjs --repeats=25` (earlier run) | 0 | cross-run band: stamp 0.144 ms, burst share 1.67 ms, steady +0.27 ms/tick |
| `node --test test/optic-ceres-entry-cost.test.mjs` | 0 | 5 pass / 0 fail |
| `node --test test/optic-seeded-scatter.test.mjs test/optic-stamps.test.mjs test/optic-far-quiet-latch.test.mjs` | 0 | 18 pass / 0 fail (adjacent optic family undisturbed) |

## The counterexample test (would fail under the old behavior)

`test/optic-ceres-entry-cost.test.mjs` pins the structure the measured numbers rest on — break any
of these and the trace stops describing the thing the guard named:

1. the anchor compiles to **exactly 42** bodies (15/25/2 diamond/stone/metal) — the "42 live
   bodies" the row names;
2. the **A/B control**: entry with vs without the stamp differs by exactly 42 field records, zero
   live-optic at entry, identical live census — the delta stays attributable;
3. the stamp is **seed-deterministic** (the trace is a fixed-seed close);
4. the **decode disc** promotes all 42 off-cell (the burst), and promotion is stable while parked
   (no churn) — the steady arm's premise;
5. the **dead-centre admit refusal** (D50 guard interacting with lattices) — 41 with one ship
   parked on the origin cell.

Timings are deliberately absent from the test: wall clocks do not belong in CI; the probe is the
timing instrument and the receipt is its record.

## Scope note

The instrument is sim-side and headless (per the row's fixed-seed-close standard); it does not
profile the GPU frame at the gallery. The optic-specific costs the guard names — stamp, latch,
promote/demote, steady tick — are fully covered; the shared cost of rendering 42 ordinary rocks is
the existing asteroid path and scales with the anchors already shipped.
