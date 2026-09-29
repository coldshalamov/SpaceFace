# PB-MASS-A — SF-023 + SF-024 receipt

**Row:** build_map §103 — SF-023+024 cutter warning on the threatened segment + snag becomes a choice.
**Status:** DONE 2026-10-02. Claim was stale/adoptable (HAND lane, 302+ min quiet); seams clean.

## What changed

**SF-023 — a hostile tether-line cut now warns where it lands, before contact.**

- `tetherGameplay.js`: `computeSweepCommit` — a per-tick read over the same blades/lines rows the
  cutter pass already materializes. For each taut hostile blade vs each live player line it finds
  the closest approach point and the gap-closing speed (blade-point velocity minus line-point
  velocity along the gap). When the blade can reach the rope inside `SWEEP_COMMIT_WINDOW_S`
  (1.2 s) the bite is committed: cutter id, eta, severity, and the bite point on the player's
  rope publish on the same `hostileSweepReads` slot the crossing read already uses — one pass,
  no second map walk. Crossing or just-severed lines stay with the at-contact read.
- `readHostileSweepCommit(state, player, out)` exported beside `readTautHostileSweepCrossing`;
  reads the published slot and falls back to a direct compute when the cutter path did not run.
- `masslineThreats.js`: new threat kind `hostile-sweep-commit`. Emits `massline:threat` with the
  bite point in `record.position` once per cutter approach (held while committed; re-arms only
  after ~0.5 s clear — COMMIT_REARM_TICKS). Mirrors the commit at
  `state.player.masslineThreats.sweepCommit` for the HUD.
- `presentationOrchestrator.js`: `masslineThreatCueId` routes the kind to its own cue variant
  (`massline.threat.sweep_commit`), matching the `tether.break.*` variant convention.
- `cueRecipes.js` / `presentationAdapters.js`: the variant shares the authored threat lanes
  (camera composition, massline VFX, threat sting, warn pulse, directional accessibility) with a
  tighter dedupe window; the warn reads `LINE UNDER BLADE` (danger tier) and the caption names
  the marked bite point. `record.position` flows through `positionFrom`/`inferSpatial`, so the
  located read reaches VFX and the directional-warning lane without a second channel.
- `masslineHud.js`: world-anchored `ml2-threat-mark` — a bare hot X labelled CUT that rides the
  rope at the bite point (offscreen points pin to the cue ring). Shape grammar kept honest:
  acquisition = diamond, protected = ring, denied = X-in-diamond, committed bite = bare X.

**SF-024 — a tethered load pinned on geometry reads as a snag, not a silent stall.**

- `tetherGameplay.js`: `_updateSnag` runs on the active tether path after `_emitStrain`. A snag
  requires all of: taut rope (span − restLength > SNAG_STRETCH_MIN_WU), real pull intent
  (commanded reel-in or a hull hauling at ≥ 14 wu/s), impeded progress (|span rate| ≤ 1 wu/s and
  the load slower than 6 wu/s), and a collidable body fouling the load (contact pass) or the rope
  (segment-clip pass) — the `entityIndex.collidables` bucket, so sensors and pickups never count
  and a gate arm fouling the line legitimately does. 24 ticks (~0.4 s) of unbroken foul latches
  `tether:snagged` once with the foul point + a `toast` naming the three honest verbs (haul
  through, reposition, cut free); `state.player.tether.snag` mirrors it for the HUD. The latch
  clears through 6 ticks of forgiveness (`tether:snagCleared` reason `cleared`), on line end via
  `_mirror`'s inactive path (`ended`), and on attachment/target swap — the constraint solver is
  untouched, so all three verbs stay live while the mark is up.
- `masslineHud.js`: `ml2-snag-mark` — an open-edged square labelled SNAGGED pinned at the foul
  point in lamp amber; both marks join the HUD signature in `writeMasslineHudFields` and hide in
  `_hideAll`.

## Validation

- Review round (subagent): 1 CRITICAL caught and fixed — `_updateWorldMark` read an undeclared
  `w2s`; a first-mark ReferenceError inside `update()` would have closed the sim runner. Also
  landed: stale-mirror healing on save/sector/new-game (`_releaseSnagLatch` clears the mirror
  even latch-less; handlers emit `ended`), sweepCommit mirror cleared before every early return,
  simTime fallback for the re-arm latch, tick-finite guard on published reads, corrected the
  `closestPointOnSegment` docstring.
- `test/massline-sweep-commit-snag.test.mjs` (seed 30010, 7 tests): commit warns once at the bite
  point pre-contact and mirrors for the HUD; no commit when receding, slack, out of reach, or
  non-hostile; rearm fires a fresh warning after the cutter clears the window; reel-pinned load
  snags once with the located foul + toast, clears on obstacle removal; line cut / sector exit /
  game:new all release latch AND mirror (incl. save residue with no latch); no snag without pull
  intent, without geometry, or while the load moves; the DOM paint test mounts the real HUD and
  both marks show/hide/track.
- Adjacent battery: 349/349 massline/tether/monofilament suite post-fixes; earlier 130 across
  presentation-admission/runner/cue-recipes/census + massline-cadence (59/59) — all green.
- Determinism: all reads derive from this-tick rows and positions; no rng, no wall time.

## Notes for the next agent

- `SWEEP_COMMIT_MIN_CLOSING_WU_S` (8) keeps slow drift from arming the bite read; a blade parked
  inside the window but not closing stays quiet by construction.
- The snag predicate intentionally ignores strain — standard-Massline strain is ~1e-4 under real
  load; span-vs-restLength stretch is the honest tautness read.
