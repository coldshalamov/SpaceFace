<!-- LIFETIME: STABLE (handoff record) -->
# VFX program handoff — the complete history, reasoning, and remaining work

Written 2026-09-27 after the fourth working session of the VFX epic died at the provider usage
limit mid-run. This document consolidates the entire history of the game-wide VFX program — every
owner directive, every rebuild, the reasoning behind each decision, every file location, the
tooling, the verification receipts, and the exact point where work stopped. A finisher with this
file alone has the full context. Facts below are verified against the live tree and git history
(all SHAs checked); narrative reasoning comes from the session records.

If you read only three other files, read: `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md` (the
art law), `docs/visual-assets/VFX_PRIMITIVE_GUIDE.md` (how to author new effects), and
`docs/visual-assets/VFX_LAB_WORKFLOW.md` (how to look at effects).

---

## 1. The mission — how the owner's mandate evolved (five stages, in order)

The bar moved four times. Each rejection was about a real, specific visual failure, and each
rebuke redefined "done." The current bar is stage 5.

1. **"Upgrade game-wide VFX."** Generic mandate. → Session 1 (`dce9d08b9`).
2. *Rejection 1*: effects still had visible pixels, looked too solid, expanded/floated without
   intent. Demanded: distinct categories with distinct feelings, interesting particles, advanced
   features, open-source VFX tooling from the repo, intentional lifecycles end to end — "think
   modern 2020s games"; the whole game's actions/movements/life must be accentuated; no
   unsatisfactory actions or events. → Session 2 (the lab + seven packets).
3. *Rejection 2* ("the Halo 1 speech"): "those vfx are kind of weak, I don't think you'd find them
   in modern games, the energy vfx for attacks and powers is thin and flat, the explosions all
   look exactly the same… you're stuck in this same rut… taking the easiest road out by tuning
   parameters instead of actually building optimal VFX even if it means tearing some things down
   and rebuilding them… thicker energy strands, everything looks wirey or like a ball… explosions
   are like a bunch of ball puffs… you know what modern VFX would look like, give me something
   you'd see in Destiny 2… this is literally like Halo 1 for the original xbox… **Don't stop until
   the vfx are not embarrassing in 2026.**" → Session 3 (the rebuilds: energy volumes, material
   rupture, choreography).
4. *Rejection 3* (the "corny lifecycle" speech, arrived mid-Session-3): effects had an obvious
   3-phase (really 2-phase) birth/hold/reverse-birth cycle — "expand with no deformation into
   full size and then just rotate all at static speed… no different parts moving at different
   speeds, no procedural core that'd make the vfx look different every time it runs, no soul."
   Wanted: effects that only exist in full stride, some emerging from interactions of others,
   intentional growth/during/fade authored separately, **reaction to the environment** ("shouldn't
   there be some deformation depending on what's around me?"), "shoot for the moon." → the
   supply-transport choreography, flow environment, and GPU channel work.
5. **Final directive (the current task)**: "I want to **never have to come back and work on vfx
   again**. Use the low-token scaffolding to test out each of the vfx in this game and examine
   what actions would be improved from vfx at all, or brainstorm events that could use vfx.
   Make several vfx **category primitives that you combine in complex ways**… pay attention to
   how they're spawned and what they come from. **Another agent is working on how ships break
   apart when blown up and pieces fly** — there should be more realistic and carefully tuned
   events. When testing you must snap fast-fps screenshots from start to finish so you can
   critique the entire effect, not isolated stills. **Maximize the amount of vfx events AND the
   quality**… make sure there's a guide to using the primitives. You can research the internet or
   download open source tools — I just want maximum quality vfx in this game going forward."
   → Session 4 (the complete-catalog pass; died mid-run).

Standing laws from the workspace (AGENTS.md + standards): sim RNG never consumed by VFX;
`state.rng`/`state.simTime` only; pause and reduced-motion/flash authoritative; bounded pools;
no camera-facing soft squares/discs as designed objects; optimize algorithms/batching, never
pass gates by deleting authored visuals; accessibility preserved.

---

## 2. The VFX system today — complete file map

All paths relative to repo root. `src/render/AGENTS.md` and `src/render/forceLanguage/AGENTS.md`
govern edits in these trees.

### Main owner and entry wiring
- `src/render/vfx.js` — the central VFX owner (~15k lines). Subscribes to the event bus, owns
  mining beam, explosions wiring, action/wiring, reproject, cadence, disposer plumbing. Everything
  below is wired through it. Key seams added/changed in this epic: `_emitBombMaterial`
  (bombs:detonated/fieldEnded/destroyed → BombDetonationVfx), `_ensureStatusMatterVfx`
  (touchMomentum/touchStatus), `MINING_BEAM_RELEASE_S = 0.98` (slow release tail),
  `combat:bounceContinued` ricochet subscription, drill cargo-full handler fix (grid→world
  coordinates at the production handler).
- `src/render/actionVfx.js` — ActionVfx: event-receipt → slot lifecycle (kind-keyed variants,
  seeded serials, attachToTarget, surfaceWork/surfaceCapture flags, model-bounds-surface
  provenance, provenance `model-bounds-surface`).
- `src/render/vfxAccessibility.js` — `resolveVfxAccessibilityProfile`; reduced-motion/flash
  profiles; every new owner must honor it.
- `src/render/presentationSimClock.js` — presentation clock used by owners.

### The composable primitive system (Session 4 core)
- `src/render/vfx/actionPrimitives.js` — **the six primitives**: `compression` (folds),
  `connection` (loaded links), `deposition` (surface work), `pressure` (fronts),
  `induction` (branching), `capture` (hooks). HDR-corrected emission (core term ×3.7 —
  translucent but carrying energy, "not dyed plastic"). Also the travel compositions
  (charge rails / release compression / fail pressure / block) and NPC intent constructions.
- `src/render/vfx/actionEventRecipes.js` — recipes mapping native event receipts → primitive
  compositions. Covers countermeasures (chaff/flare/torch variants), impulse charge
  attach/prime/land, snare catch/reel/pump, inertial shunts, volatile cargo contacts
  (corrosive/cryo), cloak transitions, optic contacts/rekindle, beacon deployment,
  `salvage:cutComplete`, `salvage:completed`, `pickup:collected` (uses
  `src/core/pickupAcceptance.js::successfulPickupAmount`; material travels into the collector),
  `ai:telegraph` (kinds engine_flare/attach_spool/weapon_charge, life from durationTicks),
  `ai:flee`, `ai:formationBroken` (squadId lookup, never borrows the player),
  `player:scannedByPatrol`, `heat:changed` (wantedCrossed only), `presentation:cue`.
- `src/render/vfx/worldCueRecipes.js` — semantic world-cue whitelist, now **29 variants**:
  9 travel cues (`travel.cruise/jump/interdiction.*`, resolved on the travelling hull — never the
  destination sector), 6 mining cues (fracture anticipation/released, rich_core exposed/charge,
  chunk tether, yield collected — `surfaceWork` on the drawn receiver), plus the original 14
  survey/drill/capacity/seam/heat work cues. `isComposedTravelCue` / `isComposedMiningCue`.
- Dedicated owners in `src/render/vfx/`:
  - `bombDetonationVfx.js` — payload-specific bomb detonation/field-end/destroyed material;
    EMP received-charge forks crawl along the named target's surface (no false links).
  - `statusMatterVfx.js` — hull-attached burning seats, viscous residue, signed momentum
    stress; replaces the old sprite-based status puffs; authoritative status cutoff.
  - `damagedPortVfx.js` — damaged **subsystem** port releases (replaced old low-health puffs).
  - `stationOperationVfx.js` — station/job activity at actual work points.
  - `combatContactVfx.js` — payload-specific weapon contact effects (molten thermal contact,
    heavy siege discharge, narrow rail strike, branching EMP contact).
  - `masslineReleaseMatter.js` — Massline receiver load + thrown-mass release (replaced the
    huge flat neon apex rings).
  - `forceParticleFlow.js` + `quarksSystem.js` — seeded force-driven particle transport
    (Quarks is the bounded carrier for supporting parcels and solid debris; reset fixes so stale
    particles never survive a paused reset).
  - `fragmentFamilies.js` — metal/stone/ice/cargo fragment families.

### Force fields and bombs (forceLanguage)
- `src/render/forceLanguage/sweptSurfaceBatch.js` — the shared swept-surface batch shader;
  travelling density gaps for Well accretion (fwidth-AA parcels), Seed role-based articulation
  (JAW forks / plate / CREST bridges), per-role hot/body/absorb terms.
- `src/render/forceLanguage/fieldForcePresentation.js` — field presentation; Seed as an
  articulated clamp (opposed forks at unequal rates, bridging charge only after seating, sheared
  release), warning tint lerp cyan→amber on remaining drain.
- `src/render/forceLanguage/bombFlowSurface.js` — **GPU channel surface**: per singularity 3
  asymmetric channels, fixed 96×10 grid, curvature/contact/smooth normals in the vertex shader;
  CPU uploads retained descriptors only (no per-frame vertex rebuild). Plus
  `createBombFlowPrecompileMesh` for shader precompile warming.
- `src/render/bombPresentation.js` — bomb field presentation: connected basins/throats/truthful
  boundary (one CPU surface draw), singularity channels via BombFlowSurface (one instanced draw),
  goo as advected chemistry (curl at two speeds, ignition pockets meeting and breaking — shader
  rev `bomb-transport-volume-v6`), local supply/drain shutdown (no global scale envelope, no
  frozen clock), clamped feature scales so big fields don't become curtains.
- `src/render/forceLanguage/flowEnvironment.js` — samples nearby solid bodies; cosmetic flow
  deflection + hot contact seams; gameplay radius untouched; neighborhood caching so many
  simultaneous bombs don't rescan.
- `src/render/forceLanguage/effectLifecycle.js`, `emergentPrimitivePools.js` (gel/prism grow and
  retire through local material fronts), `catalog.js`, `weaponDischargePool.js`.
- `src/systems/fields.js` — sim-side field lifecycle publish (+3 lines: seed-present publish for
  presentation; quiet-path producers kept live by another lane's later fix 50298eba1).

### Weapons and explosions
- `src/render/weapons/ribbonPool.js` — **rebuilt**: closed 9-vertex cross-sections
  (`WEAPON_WAKE_SECTION_VERTICES = 9`), five shader profile families CORD (ballistic pressure
  tube with compression collars), BRAID (circulating plasma, dark convecting channels, two
  overtaking folds), FORK (two electrical lobes with migrating dark seam), SHEET (rolled motor
  exhaust), FILAMENT (starter pulse afterimage); world-anchored frames (no camera roll);
  Uint16/Uint32 index autoselect; `drawSlots` live-prefix packing + `setDrawRange` (one late wake
  never submits 255 empty neighbors); transport/twist/lobe motion per profile; reduced-motion
  removes modulation, not footprint.
- `src/render/weapons/energyBoltPool.js` + `projectileGeometries.js` — special projectiles are
  hollow flowing energy (fins deleted).
- `src/render/weapons/presenter.js`, `shieldShell.js`, `contactMarks.js`,
  `src/render/energy/energyMaterials.js`, `src/render/weapons/shieldContacts.js` — refined light
  transport; distortion producers exposed to the compositor.
- `src/render/combat/explosionRupture.js` — **material-cause rupture**: `explosionSourceMaterial`
  maps entity data (rock/armor/reactor/fuel/capital) to distinct causal silhouettes — rock→
  irregular mineral sheets/fans, armor→directional tears, reactor→ruptured cavity with asymmetric
  plasma tongues + compact sheared ejecta, fuel→uneven separating flame sheets cooling to dark
  residue. Generic shard layer removed from mineral/fuel so materials keep their own breakup.
- `src/render/combat/{transientVfxMaterials.js, structuredBurstGeometry.js,
  causalStructuralBurst.js, phasedExplosions.js, gas/*}` — gas compositing fix (washout),
  whole-body scaling, darker internal detail, plate breakup caps.
- `src/render/vfx.js` explosion wiring: `structure.at` / materialId admits per-material rupture;
  `_initArcadeStructural` reacquired after WebGL context restore.

### Tools / movement / hull
- `src/render/toolConduit.js` — **rebuilt** (`sf-tool-work-surface-v4`): 11 fixed-topology members
  per beam — 3 closed loaded transport channels (winding phase, per-verb spread), 6 curved work
  faces meeting the actual curved receiving surface (per-verb: extract lays/vents, cut peels with
  seeded spark cadence 0.055 s frame-rate-independent, repair deposits, transfer arcs), 2 source
  lips; analytic materials, no per-frame vertex uploads, arrival delay + stop-time cooling tail.
- Mining beam in `vfx.js`: source anchored to `SOCKET_Mining_Front` via
  `helpers.socketWorldPose` (fallback `getObjectByName`), stop cuts supply immediately while
  launched matter clears the chord and the work faces cool in place
  (`MINING_BEAM_RELEASE_S` 0.10 → 0.98); accessibility profile honored (two reduced-flash
  settings previously ignored — fixed, tested in `test/tool-conduit.test.mjs`).
- `src/render/thruster/ribbon/contrailTrail.js` — boost plume oldest-point taper fix.
- `src/render/visualFactory.js` — `deadenPackagedHulk`/`updateHulkEmber`: reactor-death heat
  limited to authored engine/mechanical materials (was heating every material equally → flat
  orange silhouette); `017538860`.

### Compositor / rendering
- `src/render/bloom.js` — distortion producers now composite in the **default** bloom path
  (`attachDistortionProducers`, pass skipped when idle); previously weapon distortion existed but
  never rendered on the shipping route. Same encoding as the optional render graph.

### Data / sim emitters (read-only context for VFX)
- `src/data/bombs.js` (payload defs incl. bomb_frag/singularity/goo/emp/anchor/scrambler/
  thermite/concussion), `src/data/fields.js` (FIELD_DEFS, well distortion radius/strength),
  `src/data/weapons.js`, `src/data/modelTruth.js` (mine sensor radius, sockets),
  `src/systems/{bombs,fields,weapons,impulseCharges,countermeasures,mining,masslineSnares,
  cloak}.js`, `src/combat/{opticField,inertialShunt}.js`, `src/presentation/cueRecipes.js`,
  `src/systems/presentationOrchestrator.js` (normalized cue emitter).

### Standards / guides (the law, all updated during the epic)
- `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md` — incl. the **"Body and rupture rebuild (owner
  correction, 2026-09-27)"** section: translucent ≠ wire-thin; powers occupy substantial evolving
  volume with darker moving channels and hot folded crests; must read without bloom and gain
  radiance with bloom; distinct causal silhouettes per material; derivative-filtered continuous
  edges (no sparkling pixels); stable per-event seeds; simulation RNG never consumed; grow-spin-
  shrink banned.
- `docs/visual-assets/VFX_LIFECYCLE_STANDARD.md` — Arrival/Release choreography replaces
  Birth/frozen-Release: arrival = separate paths/fronts; release = supply stops, existing
  material travels/tears/cools/retires; bomb channel cost model documented.
- `docs/visual-assets/VFX_PRIMITIVE_GUIDE.md` — **the authoring guide** (244 lines): the six
  primitives, receipt/port attachment rules, real-surface anchors, variant keying, pooling,
  accessibility, the distortion compositor seam, coordinates and transport controls, and how to
  add a new effect without another renderer.
- `docs/visual-assets/VFX_LAB_WORKFLOW.md` — lab/capture workflow incl. the chromium-channel
  default and per-family capture timing law (short attacks need sub-100 ms samples).
- `design/vfx/VFX_ANIMATION_FILL_OUT_PROMPT.md` — the owner-requested brief for remaining
  **authored content**: bespoke recoil mechanisms, material-specific fracture/debris assets.
  This is content work the VFX lane deliberately did not swallow.

### Tests (focused gates that pin all of the above)
`test/action-vfx.test.mjs`, `test/world-cue-recipes.test.mjs`, `test/bomb-vfx-radiance.test.mjs`,
`test/bomb-presentation.test.mjs`, `test/bomb-flow-surface.test.mjs`,
`test/bomb-detonation-vfx.test.mjs`, `test/status-matter-vfx.test.mjs`,
`test/momentum-sink-vfx.test.mjs`, `test/tool-conduit.test.mjs`,
`test/tool-conduit-lifecycle.test.mjs`, `test/weapon-source-identity.test.mjs`,
`test/weapon-vfx-techniques.test.mjs`, `test/wake-and-ring-weight.test.mjs`,
`test/vfx-weapon-variation.test.mjs`, `test/vfx-particle-transport.test.mjs`,
`test/quarks-vfx-system.test.mjs`, `test/explosion-rupture.test.mjs`,
`test/no-legacy-explosion-bodies.test.mjs`, `test/wreck-hulk-body.test.mjs`,
`test/vfx-field-lifecycle.test.mjs`, `test/vfx-force-language.test.mjs`,
`test/vfx-field-geometry-sleep.test.mjs`, `test/vfx-structured-transients.test.mjs`,
`test/phased-explosions.test.mjs`, `test/gas-volume-families.test.mjs`,
`test/emergent-vfx-materials.test.mjs`, `test/vfx-bounce-continuation.test.mjs`,
`test/world-cue-vfx.test.mjs`.

### Lab and capture tooling
- `scripts/vfx-gameplay-demo.html` — the ship-context lab: **real production render owners**,
  a real event-bus route (a diagnostic fire with no production subscriber throws loudly), authored
  GLB context (Kestrel hull, asteroid, wreck, capital, cargo pod, station refinery), ~150
  scenarios across weapons (incl. flak/torpedo/vector-mine/combat-beam), tools/massline/
  propulsion, all bomb payloads, native action receipts, world events, statuses, and the
  destruction set (rock-fracture/armor-breach/fuel-rupture/reactor-breakup/capital-rupture/
  ship-collision). `window.__vfxDemo` API: `select/pause/sample/fireEvent/inspect`.
- `scripts/lib/vfxGameplay{Explosion,Weapons,Tools,Actions,Bombs,WorldEvents,Statuses}.mjs` —
  lab adapters that drive the **production** owners (never re-implemented recipes).
  `vfxGameplayExplosion.mjs` syncs the full private state (fields, player, massSeed, massline2,
  beacons, tick, entityList, drill/jump/cruise/combat/traffic/meta) and re-updates all world
  presentation systems per tick.
- `scripts/capture-vfx-gameplay-demo.py` — capture driver:
  `--scenario X|--all --view normal|wide --context near|open --seed N --width/--height
  --continuous-video --continuous-fps N --continuous-max-seconds S --reduced-flash
  --browser-channel chromium --output .devshots/<name>`. Defaults to the `chromium` channel =
  **new headless with the Intel GPU** (fast; the old default was software SwiftShader). Emits
  per-phase PNGs, `*-continuous.mp4`, `manifest.json` (with source hashes), `report.json`;
  startup errors print immediately.
- `scripts/capture-vfx-field-lifecycle.py` — the five-field browser temporal gate (sustained
  motion with no targets, stable pause, reduced-motion, clean retirement), `--video --fps`.
- `.devshots/` scratch (untracked; recreate if cleaned): `review-vfx-sequence.py` (12-frame
  filmstrip sheets from mp4s via ffmpeg — **the** motion-review tool),
  `vfx-filmstrips*.py`, `run-vfx-final-polish.py`, `run-vfx-rebuild-review.py`,
  `run-final-vfx-catalog.py`, and **`run-vfx-context-polish.py` (written, NEVER RUN)**.
  ffmpeg lives at
  `C:\Users\93rob\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin`
  (prepend to PATH).
- Capture sets in `.devshots/`: `vfx-full-catalog-60fps` (first full pass),
  `vfx-final-catalog-60fps` (121 cases), `vfx-rebuild-review-60fps` (58 corrected),
  **`vfx-final-polish-60fps` (41 mp4s — the newest corrected set)**.

---

## 3. Complete history with reasoning

### Pre-epic context (2026-09-08 → 09-24; other lanes, do not revisit)
The VFX estate predates this epic: force-language packet integration (`b616420a0`), field tools
birthing/retiring (`d94e8d995`), weapon card-atlas deletion → swept muzzle/impact surfaces
(`0212af939`), Mach tracers/molten scars (`4d8dfc9cd`), world-anchored wake sheets with
per-family cross-sections (`f907dc79d`), authored projectile bodies (`045e5f24e`),
fragment families (`a882d5243`), glitter→causal sparks (`e0b3b820c`), staged emergent
primitives (`ec8a2b82a`), bomb-bay acceptance look (`808ccc5da`). These established the
architecture (bounded pools, swept surfaces, world anchoring) that the epic rebuilt the *content*
of. Later foreign-lane touches to VFX seams: perf quiet-latches `a98e4cd99`, `546f75f78`,
`588127b68`; force-language arena radius scaling `1c05a3ae3`; pickup-collector pin retargeted to
the ActionVfx receipt seam `489e3ff32` (devin-campaign-10 — **other lanes already depend on
ActionVfx receipts; keep that seam stable**).

### Session 1 — "Upgrade game-wide VFX" (2026-09-24) → `dce9d08b9`
Audit: gravity effects read like thin diagrams; chain reactions rendered as plain bars/toruses/
translucent spheres; before-captures in `.devshots/vfx-renewal-before`. Changes: broader curling
field surfaces with moving bright folds (`sweptSurfaceBatch`, `fieldForcePresentation`); created
`src/render/actionVfx.js` — 12 new direct-event action routes (~25% more coverage over the 49
audited routes); per-projectile special-weapon wakes; gas compositing washout fix (translucent gas
brightened into opaque cream — a blending bug), whole-body scaling, darker internal separation;
connected viscous tar body. Found+fixed along the way: mining-beam accessibility bug (two
reduced-flash settings ignored — `test/tool-conduit.test.mjs`). Verification: focused VFX tests,
five field pixel-motion lifecycles, `check:playable` 16/16; `check:baseline` exceeded wall budget
with one sim child timeout under load (no assertion failure). Checkpoint VFX-RENEWAL finished.

### Owner rejection 1 → Session 2 — the lab is born (2026-09-26/27 night) → 7 packets
Reasoning shift: parameters were being tuned against code, not against the live picture at the
gameplay camera. So first build **the instrument**: `scripts/vfx-gameplay-demo.html` +
`capture-vfx-gameplay-demo.py` + `lib/vfxGameplay{Explosion,Tools,Weapons}.mjs` — real
production owners, real ship (Kestrel GLB), per-family capture timings (electrical attacks finish
in ~0.22 s; gel/prism run seconds — one fixed timestamp set can't judge both).
Lab itself exposed real bugs: fixture ship radius ≠ game value; asteroid scaled beyond its
declared collision radius (contacts inside models); bomb scenarios never entered active field
phases; rectangular banding in field membranes; destroyed asteroid left in place hiding its own
explosion; mine armed-state invisible; reactor demo used the wrong wreck presentation; stale
particles survived paused resets.
Production changes, published in the packets the owner asked for:
- `5dd976304` seeded force-driven particle transport (`forceParticleFlow`, `quarksSystem`;
  singularity pulls fragments through inward spirals; goo stretches/creeps/rejoins).
- `a073758cd` force fields and bombs flowing optical lifecycles (accretion channels, connected
  reactive goo, clamped feature scales).
- `fb42cb098` weapon/combustion/tool light transport refinements (incl. `contrailTrail` boost
  cutoff taper).
- `8c910dc4b` ship/salvage/mine action responses (arming cue + four-part pressure release for
  mines via real `mineDeployed/mineArmed/mineDetonated` events).
- `017538860` charred hull detail during reactor cooling (heat limited to authored materials).
- `81be54a0c` the lab itself. `2259117e5` docs: D73 ledger row (below).
End state: 39-scenario lab, all focused checks green, pushed through `2259117e5`.

### Owner rejection 2 ("Halo 1") → Session 3 — the rebuilds (2026-09-27 00:34–02:01)
Root-cause diagnosis instead of tuning: (a) the power material suppressed most of the energy body
and lit only narrow strands → everything read wirey; (b) the explosion route added the same
combustion puffs regardless of what broke → identical ball-puff explosions. Both foundations were
torn down:
- `a741d41eb` art direction corrected in `VFX_TECHNIQUE_STANDARD.md` + the fill-out prompt
  (`design/vfx/VFX_ANIMATION_FILL_OUT_PROMPT.md`) written for the authored-content remainder.
- `d2165208a` weapon wakes → closed 9-vertex transported energy volumes (first version
  overcorrected — too solid, obscured the scene — and was **rejected in review**, then revised to
  translucent bodies with brighter crests; tests pin vertical thickness, broad body, transport
  under a fixed centerline, pause freezing transport).
- `2d893a27c` gravity/pressure → moving 3-D bodies (unequal rolled intake channels vs separated
  bowed fronts).
- `c3dda875d` projectile fins → hollow flowing energy.
- `9444c5d61` accretion channels + connected goo.
- `40557ab11` shared explosion puffs → **material rupture** (`explosionRupture.js`); also fixed
  asteroid breakup throwing metal plates and fuel selecting the rock effect.
- `4ae92090c` reactive flow environment (`flowEnvironment.js`) — the owner's "deformation
  depending on what's around me" demand; cosmetic only, gameplay radius authoritative.
- Mid-session the owner delivered rejection 3 (corny lifecycle). Response:
- `92986406c` field supply/interaction/detached-release choreography (`effectLifecycle.js`,
  `fields.js` publish): unequal arrivals, independent stream speeds, secondary eddies in
  established flow, shutdown cuts supply while matter drains — no scale envelope, no frozen clock.
- `e338e99ba` gel/prism local material fronts. `a89a1e491` lab continuous-lifetime capture
  (`--continuous-video`) + real surface context.
- `e865f31aa` bomb inflation → flowing surface choreography: `bombFlowSurface.js` GPU channels
  (smooth curves replacing polygonal CPU bends; density-pocket shader so the cyan sheet broke into
  travelling matter with openings). `f3a013f95` lab context-restore reacquire.
- `596d50877` standards codified (`VFX_LIFECYCLE_STANDARD.md` rewrite: Arrival/Release).
- `4e2be687a` Well advecting density gaps (same fix for the field's continuous-sheet problem).

### Owner final directive → Session 4 — complete catalog (2026-09-27 03:40–06:17, then cutoff)
Strategy: inventory every live effect and every event route; close lab blind spots (some cases
bypassed production event handlers; repair got richer lab data than the real game sends — hiding
anchoring bugs); build the composable primitive layer; then review **everything** in continuous
motion and fix what the sequences expose.
- `d03c58ba2` the six composed primitives + recipe system.
- `fe562c3cc` bomb puff handoffs → distinct transported material (`bombDetonationVfx.js`).
- `06937ccc0` lab covers native action+bomb receipts with released context models (cargo pod,
  station refinery, wreck; correct radius scaling; bombs resolve beside the asteroid, not inside).
- `cb791a769` / `829659a05` retained hull-bound burn/goo/momentum matter
  (`statusMatterVfx.js`); ricochet `combat:bounceContinued` restored; drill cargo-full grid→world
  coordinate bug fixed at the production handler.
- `13a0b2311` cargo capacity refusal shown on the receiving miner.
- `71e5bdb55` lab exercises native world + moving-hull VFX (world events/statuses adapters; the
  lab bus installs real subscriptions and throws on unsupported receipts).
- `6d1d5fe81` + `69df34600` + `99e19ee52` **weapon distortion composites through the default
  bloom compositor** (shipping-route bug: distortion existed but never rendered) and the lab
  matches it.
- `466b0fe48` / `d3eaca5ab` rupture matter: compact sheared releases, depth restored, irregular
  mineral breakup, oversized turquoise cosmetic shards capped on capital deaths (physical
  ship-breakup lane untouched).
- `9c540c54c` / `60888f53d` / `d96549002` Seed: load bridges → independently loaded dark frames
  (dark load-bearing frame, moving charged sections) → unequal open roots (symmetry broken).
  (A concurrent sweep `a871b2d1d` carried one Seed packet; content preserved per commit body.)
- `17d93f20c` capture defaults to modern Chromium headless (Intel GPU; captures got dramatically
  faster than SwiftShader).
- `5930dab6f` tool wires → transported volumes + curved work faces (`toolConduit.js` rebuild,
  socket anchoring, release tail; `test/tool-conduit-lifecycle.test.mjs`).
- `cf28cc76f` combat beams get a loaded contact lifecycle; `58a838cd4` (later) fixes beam restart
  after explicit stop (stop→fire produces fresh ignition while the old beam drains).
- `91cd0635f` loaded conductors + cargo capture contacts exposed.
- `bdb676f48` bomb reaction fronts articulated; EMP received forks crawl the target surface.
- `07ea8786d` drive charge/commit/fail/interdiction composed around the hull (was spawned inside
  the ship).
- `6a861a441` mining/salvage/collection responses on real receiving surfaces (measured model
  bounds; pickups fly into the collector via `successfulPickupAmount`).
- `c185d1c44` / `583d7e248` / `7d18543b5` NPC tells (telegraph kinds, flee, formation break,
  patrol scan, heat crossing) anchored to their owning ships with distinct causal motion (were
  identical-looking and some borrowed the player's position); collision/subsystem contact matter.
- `9dd55cd5e` / `5fdf96402` / `46627572d` the authoring guide built out (receipt construction,
  real anchors, coordinates, transport controls).
- `ce36f6f5f` station/job operations as visible transported matter; `6d2a952b6` damaged
  subsystem port releases; `fcf7e6025` cargo capture kept above the pod roof edge;
  `2ae315a17` interdiction resolved on the intercepted hull; `f05dabe65` massline rings →
  receiver load + thrown-mass release.
Full-catalog captures ran across `.devshots/vfx-{full,final}-catalog-60fps` (121 cases) and
`vfx-rebuild-review-60fps` (58 corrected), all with zero browser/shader errors (one special-
weapon GLSL identifier compile error was found and fixed during review). Checks during the
session: vfx-force-language/techniques/sleep green (one idle-cost timing overrun only while a
capture hogged the GPU), `check:playable` 16/16 including save/reload and shader compilation,
idle VFX cost 0.103 ms vs 0.25 ms budget.
**Cutoff:** while reviewing the final corrected set, the agent found the lab's damage-vent
scenario still fed the old low-health input, so it never exercised the new subsystem-based
`damagedPortVfx.js` — it announced the fixture fix, wrote `.devshots/run-vfx-context-polish.py`,
and the session died at the provider usage limit. Checkpoint
`.codex/agent-checkpoints/VFX-complete-catalog.json` is still `MUTATING` with todo 3 open
("Review continuous sixty-fps sequences, fix failures, run playable and publish"),
lastProgressAt 2026-09-27T10:16Z.

### Commit index (verified SHAs, chronological within the epic)
`dce9d08b9` · `5dd976304` · `a073758cd` · `fb42cb098` · `8c910dc4b` · `017538860` ·
`81be54a0c` · `2259117e5` · `a741d41eb` · `d2165208a` · `2d893a27c` · `c3dda875d` ·
`9444c5d61` · `40557ab11` · `4ae92090c` · `92986406c` · `e338e99ba` · `a89a1e491` ·
`e865f31aa` · `f3a013f95` · `596d50877` · `4e2be687a` · `d03c58ba2` · `fe562c3cc` ·
`06937ccc0` · `cb791a769` · `829659a05` · `13a0b2311` · `71e5bdb55` · `6d1d5fe81` ·
`466b0fe48` · `9c540c54c` · `69df34600` · `99e19ee52` · `d3eaca5ab` · `60888f53d` ·
`17d93f20c` · `5930dab6f` · `91cd0635f` · `bdb676f48` · `07ea8786d` · `6a861a441` ·
`c185d1c44` · `583d7e248` · `cf28cc76f` · `9dd55cd5e` · `ce36f6f5f` · `fcf7e6025` ·
`6d2a952b6` · `2ae315a17` · `f05dabe65` · `7d18543b5` · `d96549002` · `5fdf96402` ·
`46627572d` · `58a838cd4`. **All are on origin/master** (verified: the last, `58a838cd4`, is an
ancestor of origin/master).

---

## 4. Design reasoning — why it is built this way (so you don't undo it)

- **Closed cross-sections instead of camera-facing cards** (ribbonPool, toolConduit): a
  camera-facing strip is edge-on-invisible half the time and reads as a decal; a closed section
  occupies real depth from every view and lets the shader move material around it. The forbidden
  pattern (camera-facing soft square/disc) is an AGENTS.md law; distant background stars are the
  only exception.
- **GPU-evaluated channel surfaces** (bombFlowSurface): smooth curves at 96×10 per channel with
  curvature/contact/normals in the vertex shader; the CPU uploads retained descriptors only.
  This is why singularity channels are smooth at any bend while the CPU cost stays flat.
- **Supply → transport → local decay** instead of scale envelopes: the "corny lifecycle"
  rejection. Arrival is separate paths/fronts at unequal rates; release cuts supply and lets
  existing matter drain, tear, and cool. Never author birth as `scale 0→1` or death as its
  reverse.
- **Receipt-anchored, body-anchored**: every effect resolves to a real entity receipt and a real
  surface (measured model bounds, sockets like `SOCKET_Mining_Front`, the drawn receiver). The
  session-4 review repeatedly found effects spawned at body centers (inside opaque geometry) or
  on the wrong body (player instead of NPC, destination sector instead of travelling hull) —
  each fixed with a provenance field (`model-bounds-surface`) and a test.
- **Six composable primitives, recipes on top**: reuse without sameness — the same deposition
  primitive reads differently with different verbs/timing/attachments; when a family genuinely
  differs, it gets a dedicated owner (bombDetonationVfx, statusMatterVfx, …) rather than a
  variant flag. NPC tells were made *distinct* precisely because reuse had made them identical.
- **The lab fires real production subscriptions and throws when none exists** — a stand-in
  renderer would let production wiring rot silently (that is exactly how the distortion
  never-composited bug survived).
- **Continuous filmstrip review over stills** (owner order): judge onset → stride → release →
  aftermath as a sequence at the gameplay camera (`--view normal`); wide view only for large
  fields; reduced-flash pass for accessibility. A passing code test is never visual approval.
- **Seeds, never sim RNG**: stable per-event seeds choose curl/openings/timing so runs differ
  from each other (owner: "look different every time") while determinism holds.

---

## 5. Verification ladder for VFX work (use these, in this order)

1. Focused tests for the owner you touched (see test list in §2).
2. `npm run check:vfx-force-language`, `check:vfx-techniques`, `check:vfx-sleep`
   (the last is the idle-cost + field temporal browser gate).
3. Lab capture at the gameplay camera:
   `SPACEFACE_PLAYER_STORE_DIR='' SPACEFACE_USER_CONTENT_DIR='' node server.js 8769` then
   `python -X utf8 scripts/capture-vfx-gameplay-demo.py --scenario <cases> --view normal
   --context near --continuous-video --output .devshots/<name>`
   (server env vars are mandatory — an unset `SPACEFACE_PLAYER_STORE_DIR` mounts the real
   shared save drawer).
4. Filmstrip review: prepend the ffmpeg winget path to PATH, then
   `python .devshots/review-vfx-sequence.py .devshots/<name> <case>...` and actually look at
   the sheets.
5. `node scripts/capture-vfx-field-lifecycle.py --output .devshots/<name>` for field motion.
6. `npm run check:playable` (16 checks) before publishing.
Judgment rule from the epic: GPU/Chromium failure never blocks `implemented`, but every *visual*
claim needs the picture at the gameplay camera; stills are in-session aids, sequences are the
review.

---

## 6. Pitfalls, conventions, and neighboring lanes

- **Working tree**: dirty files right now belong to foreign lanes (src/ui/orrery/* = ORRERY
  frontend lane; careerCohorts, aiPorts, spaceReflectionEnvironment, check-career-earnings,
  probe-massline2, DEMO_READINESS, program-queue.json, .check-art-2.log, .probe-tmp/). Never
  stage them; commit with exact pathspecs (`git add -- <paths>; git commit -m ... -- <paths>`),
  verify with `git show --stat HEAD` after every partial commit.
- **Push state**: local master is ~62 commits ahead of origin/master — all Forge/graphics-lane
  work (PR #164). The VFX commits are already on origin. Pushing origin master publishes the
  Forge commits too; that's this repo's shared-master norm, but be aware.
- **Line endings/encoding**: repo files in these lanes are CRLF; several Python-scripted edits
  once produced cp1252-mangled UTF-8 comments (mojibake) and LF/CRLF flips — when scripting
  edits, read/write bytes with explicit `encoding='utf-8'` and preserve the file's existing EOL;
  check with `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol
  diff --check`.
- **Checkpoint protocol**: `.codex/agent-checkpoints/VFX-complete-catalog.json` is the open one
  (MUTATING, stale, owner codex-vfx-root, todos 1–2 done, 3 open). Adopt it, continue the same
  task, then `node scripts/agent-checkpoint.mjs finish --file
  .codex/agent-checkpoints/VFX-complete-catalog.json`. ~35 older VFX-* checkpoints in the same
  folder are finished history.
- **Neighboring lanes you must not absorb**: the physical ship-breakup agent (pieces flying on
  death); the ORRERY frontend lane (all of `src/ui/**`); the asset lane (D73 below);
  devin-perf lane (has quiet-latch commits inside vfx.js) and devin-campaign-10 (already pins
  tests to the ActionVfx receipt seam).
- **Open ledger row D73** (`design/program/DEMO_READINESS_2026-09-20.md` §6): dead-hulk source
  GLB extras declare 30,316 triangles while the `place_dead_hulk` parts manifest declares 30,518
  (`test/opening-dead-hulk-builder-contract.test.mjs` fails at line 114). Pre-existing, found
  during the wreck-material check; owned by the asset lane. Do not relax the contract assertion.
- **ffmpeg** is not on PATH (see §2 for the winget path). **Python** invocations in this repo
  use `python -X utf8` on Windows.

---

## 7. Exactly what remains (from the cutoff, in order)

1. **Fix the damage-vent lab fixture**: the scenario still supplies the old low-health input, so
   it never exercises the new subsystem-based `damagedPortVfx.js` path (adapter: likely
   `scripts/lib/vfxGameplayWorldEvents.mjs` / `vfxGameplayStatuses.mjs` and/or the lab html).
   Re-capture and review the real rupture→recovery sequence in motion.
2. **Run `.devshots/run-vfx-context-polish.py`** (written, never executed) or an equivalent
   representative pass: near-vs-open context, close-up, reduced-flash/accessibility over the
   corrected set.
3. **Re-verify in motion the last-landed cases** (anything after the `vfx-final-polish-60fps`
   recording): NPC intents/scans (`7d18543b5`), Seed open roots (`d96549002`), tool conductors
   (`5930dab6f`), cargo capture (`fcf7e6025`), beam restart (`58a838cd4`). Filmstrips at
   `--view normal`; fix whatever reads wrong; keep publishing small packets.
4. **Idle-cost re-run** `npm run check:vfx-sleep` on a quiet machine (the one overrun was under
   capture load; clean baseline 0.103 ms vs 0.25 ms budget).
5. **`npm run check:playable`** final pass (16/16 expected).
6. **Guide check**: anything you add must be authorable from `VFX_PRIMITIVE_GUIDE.md` without
   another renderer rebuild — that is the owner's "never come back" insurance.
7. **Close the checkpoint** (§6). Optional but valuable: an in-game (not lab) frame-cost sanity
   via `node scripts/probe-frame-solid.mjs` — hardware FPS in real gameplay was never measured;
   lab captures prove correctness, not frame budget.
8. **Not yours**: D73 (asset lane); physical ship-breakup (other agent); authored recoil/debris
   content (belongs to `design/vfx/VFX_ANIMATION_FILL_OUT_PROMPT.md` — a content brief, not this
   lane); anything under `src/ui/**`.

The finish condition, in the owner's words: the VFX are "not embarrassing in 2026," every action
and event has intentional accentuation, each category has its own distinct feeling and full
lifecycle, the guide covers future authoring — and the owner never has to come back.
