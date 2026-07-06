# SpaceFace Revamp — Wave 1.5 Status

Captured: 2026-07-05 (post Wave-2 combat closure + story/HUD minimum).

## Shipped (Wave 1.5)

### Combat ceiling (BP-02) — closed for play
- Shared lead solver exported from `src/systems/weapons.js` (`solveLeadAngle`); HUD façade in `src/ai/gunnery.js`
- Lead pip overlay in `src/ui/hud.js` + `.sf-leadpip` styles in `src/ui/uiRoot.js`
- Damage triangle (E/K/X) on `src/ui/targetPanel.js` against current shield/armor/hull layer
- Scan → weak-point reveal → bonus damage + callout (`src/data/weakPoints.js`, `scanner.js`, `combat.js`, `floatingText.js`)
- Missile LOS + fuel + coast (`combat.missileV2` flag); momentum inherit stub stays OFF
- Tier-B flags in `src/data/featureFlags.js` (OFF in node golden, ON in browser)
- Acceptance: `npm run check:combat-ceiling`

### Story wire minimum (BP-05)
- Helix Directorate paper faction in `src/data/factions.js` (`faction_helix`, zero ships)
- B8 beat registered in `src/data/narrative.js` (`BEAT_CONTENT[8]`, `story_b8_helix_audit`)
- B8 fires once on `salvage:communicatorFound` via `src/systems/story.js` `_onB8SalvageTrigger`
- Story comms route surfaced notifications through `ctx.helpers.voice.say` (one-voice arbiter)
- Acceptance: `npm run check:story-beats`

### Contact HUD identity (BP-10 subset)
- Target panel identity row: faction · role · state · threat tier · level (`sf-target__identity`)
- Extended `scripts/check-ui-identity.mjs` coverage

### Regression floor (unchanged baseline)
- `check:bundle`, `check:mining:2`, `check:ai` green
- `check:sim:compare` fails **only** on documented 47-A projectile-collision precondition (`design/revamp/_BASELINE.md`)

### Verification scripts (all green except documented sim precondition)
- `npm run check:combat-ceiling` — 9 checks
- `npm run check:story-beats` — 6 checks
- `node scripts/check-ui-identity.mjs` — 12/12
- `npm run check:wave15-flight-boot` — flight boot + lead pip + weak-point + identity screenshot
- `npm run check:wave15-regression` — bundle/mining/ai green; sim:compare fails only on 47-A projectile-collision precondition per `_BASELINE.md`

### Evidence (scratch)
- `wave15-regression.log`, `wave15-boot.log`, `wave15-combat-panel.png`

---

## Remaining (hard half of Wave 2)

### BP-07 Flight & traversal — **not started** (highest golden risk)
- Brake-to-stop (Space), mass-wired handling, leash-steering to GDD targets
- Ring-lane mechanic (traversal code; gate visuals remain Grok lane)
- Tether traversal extensions (yank, wreck tow, slingshot)
- Requires Fable advisor sign-off + fresh baseline diff before touching `flightV3.js`

### BP-05 Story — full corpus deferred
- Complete B8+ beat registry (only B8 minimum shipped)
- Wren artifact quest chain (cargo item, anomaly/salvage depth, quest markers)
- Manifest phases 2–3 *content* expansion (phase machinery exists; more beats needed)
- NPC-ecology graffiti web (Kessler↔Drift↔Voss↔… full wiring)
- Callum encounter, VALE registry sightings, faction bark corpus on all SG-06 transitions
- Endgame A–E re-wire (already built; no change needed)

### BP-10 Render code — gaps
- Standalone `src/render/ribbonTrails.js` extraction (ribbons exist inline in `vfx.js`)
- Dedicated contact badges on radar (overview strip has threat tier; radar row not extended)
- `check:perf` re-measure with all post toggles on (bloom/ACES/fog/lights pre-exist)

### BP-02 Combat — optional/deferred
- `beamWeapons.js` module (pipeline already in `weapons.js`→`combat.js`; document only)
- `momentumInherit` playtest enablement
- `check:combat-ceiling` browser screenshot proof (module smoke + structural checks pass)

### Wave 2 §6 handoff — partial
- This STATUS doc replaces ad-hoc `CURRENT_BUILD_STATUS` drift for revamp scope
- `design/revamp/WAVE3_PROMPT.md` pre-authored (detail layer); Wave 4 holds wingman orders, one-map cutover, overload/vent, tooltips/a11y

### Asset-gated (Grok lane — out of scope for Wave 1.5 code goal)
- Blender/GLB authoring, `parts_manifest.json`, ring-gate/landmark visuals, PBR hero maps
- **Note:** `assets/**` changes in the working tree are **concurrent graphics-lane work** (not modified by this Wave 1.5 code goal). Scoped file list: `{SCRATCH}/wave15-changed-files.log`.

### Lead pip proof (structural fix)
- Pure gate: `computeLeadPipOverlay()` in `src/ai/gunnery.js` (headless-tested in `check:combat-ceiling`)
- DOM path: `hud.frame()` → `updateCombatHud()` applies overlay coords; `check:wave15-flight-boot` asserts `.sf-leadpip.visible` strictly (no fallback math)

---

## Reconciliation pass (concurrent render + flight lanes) — 2026-07-06

A later orchestration session reconciled the **uncommitted** concurrent graphics/flight work that was
sitting in the working tree alongside the committed combat+story lanes. Two adversarial read-only
reviewers (render, flight) + the Fable advisor drove this. Verdicts and fixes:

### Render code lane (BP-10) — KEEP + one fix applied
- New shared trail system (`trailTexture.js`, `engineTrailSurfaces.js` — ribbon + streak-mesh pool),
  `hlod.js` (legit distance impostor, detail preserved not deleted), `postTelemetry.js`, plus vfx/renderer/
  bloom/partsLibrary edits. **Golden-safe** (vfx runs in the render phase, never the sim step).
- **FIXED — HARD RULE #3 (no quality reduction):** the new streak/ribbon surfaces originally had NO
  quality toggle and had replaced the old particle path. Added `settings.video.engineTrails` (default true) +
  `richEngineTrailsEnabled(video)` in `vfx.js` gating both `_spawnTrailStreak` and the ribbon path (off →
  degrades to the base particle look; also off at `particleQuality:'low'`/`motionReduce`). Settings UI row added.
  Still TODO (Wave 3): capture the 30fps-floor A/B and the mapless→textured hull-material spot-check.
- New render/perf gates (`check:render-hotpath`, `check:ship-material-sharing`, `check:station-hlod`,
  `check:spatial-hash`, `check:vfx-sleep`, `check:perf-summary`, `probe-gpu-path`) audited: mostly HONEST
  behavioral asserts; `check:render-hotpath` is grep-heavy and `check:perf-budget` is a doc-keyword linter (weak).

### Flight/tether lane — KEEP (this is NOT BP-07 feel work)
- `masslineTricks.js` → split into `masslineTelemetry.js` (read-only observer) + `tetherGameplay.rateRelease()`
  + tiered release feedback; incidental snap-policy bugfix + latch-grace fix. Clean removal (no dangling refs).
- `check:flight:clean` + `check:juice` PASS; new `check:massline:*` gates are honest. Golden byte-identical
  (the 47-A tape has no break event, so the cut-threshold retune has no fixture to perturb).
- **BP-07 headline items remain UNBUILT** (leash-steering, brake-to-stop/Space, mass-wired handling,
  ring-lane mechanic). Correctly DEFERRED — a half-tuned `flightV3.js` is the one way to leave the tree worse.

### Gate seam fix (orchestrator)
- Split `check:runtime-assets` OUT of `check:bundle` → own `check:assets` gate. `check:bundle` is now
  code/reachability-only and GREEN; `check:assets` is allowed-red on Grok's GLB asset debt (dock-interior
  NORMALs, 8 station-lod0 markers), documented like the 47-A precondition. Keeps the code-merge gate honest.

### Corruption recovery (concurrent-writer hazard)
- A stash-collision from the review pass clobbered `src/systems/combat.js` (−89 lines, lost weak-point
  integration + World-Overhaul faction precedence) and `src/core/physics.js` (−100, lost the
  `projectileSweepLimit` maxDistance-enforcement invariant). Both **restored from HEAD** and re-verified
  byte-identical golden. `src/combat/damage.js` scratch-reuse perf-opt was verified legit and KEPT.

### Verified state at end of pass (all GREEN except the documented asset gate)
`check:bundle` · `check:combat-ceiling` · `check:story-beats` · `check:mining:2` · `check:flight:clean` ·
`check:juice` · `check:ai` all PASS. `check:sim:compare` fails ONLY on the documented 47-A
projectile-collision precondition (`_BASELINE.md`) — byte-identical. `check:assets` RED on Grok's GLB debt.
- **Committed:** combat (BP-02) + story-minimum (BP-05). **Uncommitted (reviewed+kept, gremlin-protected via
  `git add -N`):** render lane + engineTrails fix, flight massline refactor, damage.js perf-opt, gate-seam.
  Recommend committing these as durable lanes.

## Wave 4 — T3 massline ladder resumed (2026-07-06)

### T3-04 `tether.load` (rung 04) — DONE
- `state.player.tether.load`: 0..1 PRESENTATION signal, separate from `tether.strain` (physical break
  ratio, untouched). Formula: `load = clamp(max(strain*2.5, baseByPhase), 0, 1)`, floors
  `{slack:0, capture:0.35, loaded:0.55, overload:0.9}` — exported as `computeTetherLoad()` in
  `tetherGameplay.js`; mirrored in `_mirror`; relayed by `masslineTelemetry.js` (`telemetry.load`).
- `vfx.js` tether cable: ordinary glow/color/band/anchor reads now key off `load` (loadSmooth);
  physical strain keeps sag geometry, taut width, overload flicker, and near-break sparks.
- Acceptance: `npm run check:massline:load` PASS (real tetherGameplay+masslineTelemetry integration:
  inactive→0, slack≈0, capture≥0.25, loaded+low-strain≥0.5, overload≥0.9, strain byte-equal to
  lastTension/breakTension). Adjacent green: `check:massline:{telemetry,release,release-feedback}`,
  `check:sg02:{tether,tether-break}`. `check:sim:compare` failure identical to `_BASELINE.md`
  (47-A projectile-collision precondition only).
### T3-09..12 "make the swing readable" loop (rungs 09-12) — DONE (2026-07-06)
- **09 threat events**: NEW observer `src/systems/masslineThreats.js`, registered immediately after
  `masslineTelemetry` (registry SYSTEMS + UPDATE_ORDER + rationale comment). Reads settled tether
  mirror + telemetry + entities; writes ONLY `state.player.masslineThreats`; single documented emit
  `massline:threat` {kind, targetId, severity, tick, time}. Kinds: `line-near-break` (strain ≥ 0.75
  overload floor, once/latch), `hostile-on-arc` (scanner.isHostileToPlayer + closing ≥ 12.5 wu/s +
  genuine swing ≥ 25 wu/s, once/hostile/latch), `collision-course` (ballistic first-contact ≤ 1.5 s,
  once/obstacle/latch). `check:massline:threats` PASS (9 cases); 4 break-controls each failed red.
- **10 threat feedback**: `presentationOrchestrator` consumes `massline:threat` → `massline.threat`
  cue (severity→magnitude, kind in tags; sibling of tether.near_break); recipe in `cueRecipes.js`;
  adapters fan-out audio sting + ONE non-diegetic HUD warn ('SWING THREAT') + caption.
  `check:massline:threat-feedback` PASS (5 cases incl. end-to-end from the real rung-09 observer +
  dedupe suppression); 3 break-controls red.
- **11 arc-preview data**: `telemetry.arcPreview` {peakSpeed = targetSpeed+|relVel| (≥ current speed),
  exitAngle, exitSpeed, timeToWhip (taut-solve, null > 8 s), viable (loaded phase + tangentQuality
  ≥ 0.5 + exit ≥ 25 wu/s + anchor-clearance ray test)} recomputed per active tick, cleared inactive;
  in FALLBACK/freshRuntime/writeInactive. `check:massline:arc-data` PASS (7 cases incl. isolated
  anchor-clearance A/B); 4 break-controls red.
- **12 arc-preview render**: `vfx.js` `_initArcPreview`/`_updateArcPreview` (tether-cable siblings,
  gated by `_arcPreviewActive` in update()): faint dashed additive ribbon along the exit vector,
  length ∝ peakSpeed (24-130 wu), visible only tethered+viable, fade envelope, cosmetic-only
  (Math.random shimmer — VFX exempt). `check:massline:arc-render` PASS (5 cases); vfx
  trail-bind/frame-sleep/sg08 green; 3 break-controls red.
- No-regression: all 12 `check:massline:*` green after each rung; `check-tether-gameplay` green;
  `check:sim:compare` fails ONLY on the documented 47-A projectile-collision precondition —
  A/B-verified byte-identical with masslineThreats unregistered. Pre-existing (not ours):
  `check-phase0-slice-contract` red on `stationHub.js:1226` Math.random site (committed 7/5 state,
  zero working diff). Next: **T3-13 (whip-impact detect) — Chunk B, whip+impulse**.
