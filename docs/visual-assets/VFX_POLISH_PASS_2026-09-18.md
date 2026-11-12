# VFX improvement pass — 2026-09-18

**What this is.** The implementation pass that follows
[`VFX_QUALITY_AUDIT_2026-09-16.md`](./VFX_QUALITY_AUDIT_2026-09-16.md). The audit's priority queue is the
work list; this document records what landed, what the audit got wrong, and what remains open. The
governing standards are [`VFX_TECHNIQUE_STANDARD.md`](./VFX_TECHNIQUE_STANDARD.md),
[`VFX_LIFECYCLE_STANDARD.md`](./VFX_LIFECYCLE_STANDARD.md),
[`VFX_FORCE_LANGUAGE_STANDARD_2026-09-16.md`](./VFX_FORCE_LANGUAGE_STANDARD_2026-09-16.md), and
[`SOFT_CARD_INVENTORY.json`](./SOFT_CARD_INVENTORY.json). Closure follows the owner's 2026-09-16
capture ruling (root `AGENTS.md` §13): a fixed-seed number or focused test closes work; headed stills
are optional and never a gate.

## Landed

| # | Audit item | What changed | Commit | Proof |
|---|---|---|---|---|
| 1 | Flipbook fallback (B1+B2+M4, the last banned surface) | `flipbookAtlases.js` + `flipbookPool.js` deleted. Every weapon recipe now ignites a swept source in `forceLanguage/weaponDischargePool.js` (launch, heavy launch, latched aperture and shaped deploy added to the five existing signatures), and shield/hull contact flashes are swept contact surfaces with family-shaped spall fans, crossed shield seams and an age-driven pressure ring. Recipes carry `muzzle/shield/hull.surface` instead of the atlas flags; the procedural 8-frame atlas is gone. | `0212af939` | `check:vfx-force-language` 87/87 (includes a new test asserting all 12 recipes emit geometry and that shield vs hull contacts differ by structure); `check:shader-compile` 0 broken |
| 2 | `vfx-sprite-puffs` acceptance cell | Cell remains `pending-visual-acceptance`; the owner's capture ruling makes it non-blocking for `implemented`, and no code in this pass claims it. | — | inventory unchanged |
| 3 | Player-thruster accessibility gap | `motionScroll` is consumed: the ribbon sheets' flow clock runs at 0.12 under reduced motion. `flashScale` now scales the resolved ribbon radiance, which also closes the contrail's missing reduced-flash damping, because jet, contrail and forge consume one shape. | `a6bdb254b` | `test/plasma-stream-thruster.test.mjs`; `check:vfx-force-language` |
| 4 | Flat-card family (B7) | Fleet drives and RCS impulses render through a world-anchored partial-shell cross-section with a real `1/\|N·V\|` grazing term (`uShellArc`, distortion encoder stays flat). NPC trail ribbons gained a per-station normal and a view-dependent grazing lift. | `b4beecae6` | `check:thruster:propulsion-family` 68/68; `check:shader-compile`; trail tests |
| 5 | Pop-in holdouts (B10) | Mining beam spools 0.07 s in / 0.10 s out on width plus a shared shader `power` radiance channel, with the authoritative `active` flag still flipping immediately. Continuous combat beams spool from filament to full cross-section over 0.08 s (width and vertex-colour radiance). | mining envelope swept into `dcb805e49`; beam spool `92e76639c` | `check:vfx-sleep` (mining wake/sleep); `test/persistent-combat-beam-pool.test.mjs` 4/4 |
| 6 | Dead weight | Force-hidden `snake` strip, `shockAmp`, `reel`, the forge aim vector and their helpers stripped from `plasmaStream.js` (−600 lines, one less per-frame hidden mesh and path copy); `momentBeat.js` and `starfield.js` retired. | `a6bdb254b` (plasma strip), `2820fcfcc` (forge aim) | `check:vfx-sleep`; `check:src-reachability` PASS (14 baselined orphans, no new ones) |
| 7 | Retro jets spool (B10) | Retro demand integrates through an asymmetric one-pole spool (rise τ 0.14 s, fall τ 0.24 s) owned by the volume; the live route retains the last held bow pose so release shrinks in place instead of popping off. | `70e752d90` | `check:vfx-force-language` 87/87 (120 held frames still light both jets) |
| 8 | Double casing ejection | The legacy particle-pool casing loop no longer runs beside the quarks ejection on the presenter route. | `0212af939` | weapon tests |
| 9 | Bolt cross-section frozen (B16) | Energy bolts carry `uBoltTime`: Mach shock diamonds, rail rings, plasma boil and EMP crackle now travel with the round. | `2820fcfcc` | `test/vfx-mach-tracers.test.mjs`; `check:shader-compile` |

## Where the audit was wrong or incomplete

1. **`starfield.js` deletion contradicted a higher authority.** `ARCHITECTURE.md` and
   `design/program/06_RETAINED_FUTURE_BACKLOG.md` both recorded the module as *deliberately retained*
   ("do not delete to tidy"). The audit's F-grade "deletion candidate" ignored that. A concurrent lane
   deleted it anyway and removed its reachability/inventory records, so this pass reconciled the two
   docs to the retirement (history keeps the technique quarry) rather than reverting live work.
2. **"NPC RCS constructed but never fires" is a deliberate gate, not a defect.**
   `scripts/check-rcs-jet-wiring.mjs` asserts `_actuatorsFor(npc) === null` — the renderer must not
   re-simulate NPC flight telemetry to manufacture actuator data — and
   `design/program/roadmap/active/MASSLINE_PRESENTATION_UVP.md` defers per-NPC RCS admission. The
   constructed-but-idle systems are family-switch staging, not dead weight.
3. **`momentBeat.js` was a brand-new orphan**, not just an old duplicate: it was absent from
   `test/src-reachability.baseline.json`, so the reachability ratchet was already red on it, and its
   live PQ-159.02 counterpart already exists in `feel.js`. (Retired during this pass.)
4. **The audit's "benched volumetric stack" is consumed.** `PLAYER_PLASMA_STREAM_RECIPE.volume` still
   feeds the startup precompile staging; it is not purely dead code.
5. **Pre-existing reds found while running the VFX gates** (none caused by this pass; verified against
   HEAD where noted):
   - `test/dynamic-buffer-ranges.test.mjs` "vane field geometry must register for ranged publication":
     stale test from the landed force-language migration (`vaneMesh` and `dynamicBufferOwners` no
     longer exist in `vfx.js`).
   - `test/rcs-jet-mapping.test.mjs` "assist-only lateral demand must light real jets": slip-assist
     lateral normalizes to exactly 0.06, the `RCS_DEADBAND` boundary, so no jet is emitted. A flight
     lane calibration issue.
   - `test/kestrel-production-thruster-bind.test.mjs` two failures ("visible production plume",
     "live nozzle head"): reproduced with the HEAD material, so foreign to this pass.
   - `scripts/check-trail-streak-instancing-webgl.mjs` aborts on a bare `three.quarks` specifier in
     the headless page before any render (harness module resolution).

## Open, with reasons

- **Shield idle shell static while visible (B16 near-miss).** Belongs to the shield presenter's
  contact timing; the audit rated the family B+ and no defect was demonstrated. Needs its own
  before/after number, not a blind edit.
- **Tether band flashes are plain additive cards.** Minor; the cable itself is the accepted owner.
- **Momentum-sink 12 Hz cadence.** The cadence is an accumulator with remainder carry, so it cannot
  flicker at a mismatched refresh; leaving it is the measured choice.
- **Contrail `copyWithin` per sample.** Allocation-free and bounded; a rewrite is a perf project, not a
  visual one.
- **`vfx-sprite-puffs` visual acceptance, integrated-GPU cost.** Open cells from
  `VFX_UPGRADE_2026-09-07.md`; the owner's capture ruling removes them as implementation gates.

## Verification run

```
npm run check:vfx-force-language   PASS 87/87
npm run check:vfx-techniques       PASS 9 entries, 9 files
npm run check:vfx-sleep            PASS (idle budget 0.029-0.039 ms vs 0.25 ms ceiling)
npm run check:thruster:propulsion-family  PASS 68/68
npm run check:shader-compile       PASS 68 programs, 0 broken, 0 page errors
node scripts/check-src-reachability.mjs   PASS 14 baselined orphans, no new ones
```

A still or a movie was not required for this pass (owner ruling, root `AGENTS.md` §13); the craft
claims above are code-level and gate-level. The families that changed should still be reviewed in
motion on the next normal-route session — that is a review note, not an open gate.
