# GFX-16 — make the world feel alive (motion program), plan of 2026-10-01

Owner direction (2026-10-01): exceptional, not heavy, graphics made with love; the world must feel
ALIVE second to second. Everything floats and nothing moves: no arms lifting, doors opening, lights
blinking, rings spinning up before a launch, no weight in anything. Thruster plumes look solid and
janky (they appear and disappear instead of growing out of the nozzle throat and fading). Movement
must respect size and weight, carry micro-movement, and never look like "a scripted move just got
called". Blender (MCP when reachable) plus new models/primitives where needed. Run as long as it takes.

This file is the plan skeleton. It was written with the advisor before any building. Edit it in place;
do not open a second authority. Register status in GRAPHICS_PROGRAM.md §4 (GFX-16).

## 0. Start here: INVENTORY (read-only, one Explore agent, file:line facts), THEN plan slices

Much of this probably already exists; the first wins are likely wiring and tuning dormant pieces.
- On master: `tools/blender/forge/animations/`, `assets/ships/motions/`, the src/render player for
  them. How a recipe tags a part animated, what the runtime drives, whether it is on the default route.
- The cloud work (found 2026-10-01): `origin/devin/anim-phase2-audit` is 1 commit ahead of master
  (`2ec396d4c feat(anim): phase-2 ambient motion — attach-armed loops on 5 rigs + event routes`;
  touches tools/blender/forge/animations, assets/ships/motions, 2 files in design/program, 1 in
  src/render, 1 test). `origin/devin/anim-consolidated` and `origin/feat/blender-animation-references`
  are already merged (0 ahead). 13 accepted reference clips ANI-01..ANI-15 (minus 04, 12) live in
  `assets/animation-references/` as DESIGN references (not runtime). Check its PR status and review
  comments with `gh pr list --head devin/anim-phase2-audit` / `gh pr view`.
- Other life systems and where each stands on the default route: microevent library, NPC work
  signatures, NPC activity pack, VFX Next, the thruster plume system (ContinuousPlumeSystem) and
  contrail terminators, hull-burst slices B/D/F/G/H (memory: hull-burst-physics-overhaul-design),
  GRAPHICS_PROGRAM §5.1 "Life on the structures".
- Render-package merge: flight-static packages are fully merged; only names in `dynamicNameIncludes`
  survive as separate nodes. How does an animated part survive? (`publish.mjs` sets that list.)
- Existing authority: which design/program doc already owns animation (phase-2 touched two). Extend it.
- Also: `git fetch --prune`, then sync `design/program/vm-drop/` wholesale from `origin/vm-drop`;
  `vm-drop/IMPORT_DIGEST/` perf patch imports are their OWN lane under frame-solid, never mixed into
  animation commits.

## 1. Rules the plan turns into checks
1. **A motion-judging tool comes FIRST.** Stills cannot show "triggered-looking" motion. Build a
   frame-strip capture plus a numeric check over sampled transforms: max acceleration and jerk, flag
   any jump at a clip's start or end. Nothing ships without passing it.
2. **Lamps next (most coverage, near-zero cost).** Bake a per-vertex lamp channel (pattern id +
   phase) on glow finishes; the shader evaluates the pattern, so NO extra draws and NO per-frame CPU.
   Flash-and-decay envelopes, never square waves. Stagger each instance's phase with a COSMETIC
   hash, never `state.rng`. glTF custom attributes need a leading underscore (`_LAMP`); verify it
   survives meshopt/KTX2 and the render-package merge.
3. **Every transition is a damped spring** with its time constant scaled by size and mass. Idle
   micro-motion stays small, never noisy. Weight is the point: a tug starts slowly, a dart snaps.
4. **Thrusters:** plume length/width follows throttle smoothly, grows out of the nozzle throat, and
   retracts and cools on release (no pop in/out). Obey `VFX_TECHNIQUE_STANDARD.md`; a soft camera-facing
   square/disc is never a designed object.
5. **Event anticipation lives in the render layer only,** driven by bus events: gate/ring spin-up and
   lamp flashing before a launch, dock approach chase lights, undock sequences, crane/arm moves,
   doors/ramps. Nothing here may write GameState or touch `state.rng`.
6. **Faction motion language:** Helios smooth and rounded, Ashline twitchy and sharp, work fleet
   ponderous. Same primitive, different spring numbers.
7. **Accessibility:** reduced-motion and reduced-flash settings (AGENTS.md §6) must tame strobes and
   fast flashes. No exceptions.
8. **Determinism:** if any `test/*.expected.json` golden changes, motion leaked into the simulation.
9. **Plumbing:** ONE data owner for motion values (the way `src/data/lookMoods.js` owns the Look).
   Everything reachable on the default route (no hidden flags). A frame gate per slice
   (`probe-frame-solid --compare`, longest frame and p99 must not rise).
10. **Lanes:** check `design/program/NOW.md` and `git status` before touching `src/render` (another
    lane has files there dirty). HUD/screen motion belongs to the ORRERY lane, not this one.

## 2. Primitive library to develop (brainstorm; confirm against the inventory)
- Blink/pulse/flash-decay lamp patterns (nav, strobe, beacon, approach chase, ring spin-up).
- Hinge/slide/rotate/telescope part motions with eased, mass-scaled springs (doors, arms, cranes,
  radar dishes, clamps, ramps, loaders).
- Idle micro-motion: hover bob, breathing roll, antenna sway, cable/hose settle, vent puffs.
- Thruster plume: throttle-following growth out of the throat, heat colour cooling, afterglow.
- Debris/explosion primitives: shard sets, plate curls, sparks, smoke puffs, tumbling fragments
  with mass-correct spin (ties into hull-burst slices).
- Ambient traffic gestures: parked shuttles that undock, tugs nudging, drones working.

## 3. Slice order (each slice: build, judge by motion strips, frame gate, land)
S0 inventory + merge/sync of cloud work. S1 motion-judging tool. S2 lamp channel (blink/pulse/
chase, gates and docks first: the owner's "ring flashes before launch" example). S3 thruster plume
overhaul. S4 structure life (dishes, arms, cranes, doors) with the primitives above. S5 hull idle
micro-motion per hull class. S6 debris/explosion primitives. S7 faction motion language pass.
S8 whole-world review: stranger test on motion strips, per-lane frame gate, accessibility pass.

## 4. Before any slice: land the pending graphics batch (see the HANDOFF doc pickup block)
Animated parts will touch the same recipes, and every publish rewrites all render packages. The
frame-solid compare owed for the landed A + tier 1-3 work becomes the motion baseline.
