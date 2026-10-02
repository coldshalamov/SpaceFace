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

## 5. DECISIONS (2026-10-01 planning debate: 5 lenses + advisor arbitration; supersedes §3 slice order)
Lenses: motion director, variety designer, combat-feel director, technical director, red-team skeptic. They converged, so no
second round was run. Inventory facts (verified on origin/master, NOT the stale local checkout) are in §0 and below.

**Gate 0 (not a slice): land the pending graphics batch from a worktree on origin/master.** Checked 2026-10-01: the Forge kit on
master (`forge.py`, `forge_export.py`) adds `motion_group`; for bodies WITHOUT motion rigs it builds byte-identical output
(drill_platform: same tris, identical node/material list), so earlier landings are not stale-kit damage. Bodies WITH rigs (kestrel,
yard_tug, salvage_cutter, mining_drone, cargo_pod_standard, fab, jump_ring) must be rebuilt in the master worktree. KESTREL IS HELD OUT of
the detail batch: any bolt/plate on a moving part must join its `MOTION_` group, +3k tris breaks the pinned `check:kestrel:wholeship`
range (31500-34800; master is already outside it and over maxDraws 35/35/33 vs 24/24/22), and PR #206 also edits kestrel.py.
Take a fresh `probe-frame-solid` baseline from the worktree BEFORE the first new publish, with no Blender/helpers running.
Do NOT add `.gitattributes` (the existing file deliberately avoids renormalising under concurrent lanes).

**The five, in order**
1. THRUSTER LIFECYCLE (main drive, retro, fleet, RCS), render-only. Supply-history/spring envelopes change length, radiance and reach,
   NEVER opacity (VFX_TECHNIQUE_STANDARD B10/B17); hide only below 1/255. Verified pop lines: `driveEnvelope.js:95` (cmd<=0.001 -> 0),
   `:160-173` (spool<=0.02 jumps 10% len/45% radiance/full opacity -> 0); `plasmaStream.js:381,596-598` (emitting=spool>=0.081,
   throat.visible=emitting, throat energy floor ~0.31 so it pops lit), `:421` hard reset; keyboard throttle binary
   (`vfx.js:13861-13872`); NPC/fleet thresholds `throttleResponse.js:30-51`, `familyRecipes.js:66-72`; retro `playerRetroVolume.js:29-30,
   56-62,87-88,101-102,143-144` (born at >=55-67% length, frozen ~0.75 s, hidden at ~64% length/37% radiance); `vfx.js:13908,13923`
   retroOnly zeroes glow instantly. Measured: main press 0 -> 10.1 WU in one frame; release hides the mesh at 167 ms while still 8.24 WU
   (~49 px) long. Turn the combat lens's `sim1-3.mjs` into a `node --test` continuity gate; the Wave G10 "dark in 0.25 s" test must stay
   green. Blender hardware half (retro packs, RCS pods, bell interiors) DEFERRED: five hulls are already over the triangle cap.
2. LAMP BUS. One shared time uniform, no per-hull material clones, phase from world/object position, flash-and-decay <= 3 Hz, wire
   reduced-flash. DESIGN RULE: never pick a blink pattern by `glow_amber`/`glow_cyan`/`glow_warm` alone: those finishes carry today's
   lit trims, dock chase lamps and window rows, so keying on them would pulse every trim line. Start with NAV lights (own materials
   `Material_Emissive_NavRed/NavGreen`, survive packaging as `HOOK_NAV`). Beacons/strobes: read one compiled render-package.json to see
   whether they keep a distinct node/material; if not, they need opt-in channel finishes via `F.beacon`/`F.light` (respect the
   one-glow-variant-per-body draw budget). Lamp materials have no shader patch today, so no ILLUSTRATED_SURFACE_KEY bump is needed.
   Per-vertex `_LAMP` is DEFERRED (6+ files, shader-key bump, draw splits through the merge key). Gate spin-up keys off
   `gate:range`/`jump:chargeStart`: verify they fire for NPC transits too, else the owner only sees it on their own jump.
3. SALVAGE PR #206 (`devin/anim-phase2-audit`) BANK BY BANK on our own branch off master; never push to the cloud agent's branch (it is
   still pushing). Fix: ambient loop never resumes after `rest` (`motionBank.js:680` early return); `update()` allocates per call
   (5-20 KB/entity); ANI-34 dispatches to `site:<id>` which nothing registers; DROP ANI-35 (second writer vs shipMicroMotion.js; reaches
   no default-route hull); compact banks (1.86 -> 9.8 MB; force slerp on rotation); regenerate generated files, never merge
   `renderPackageManifest.js`; drop its unrelated `uiRoot.js` boot-overlay change; add reduced-motion. Gate each bank with the offline
   jerk/acceleration judge. ANI-17 canopy opening conflicts with the graphics lane's canopy arches (arches stay behind).
4. DEBRIS/SHARD KIT: render-only instanced shards from `wreck_kit` with COSMETIC randomness, mass-correct tumble; read
   `docs/plans/2026-09-30-hull-burst-handoff.md` first and stay out of slices B/H/F/G; prove it in Crucible/Swarm (the declared demo).
5. PICKUP/LOOT SHAPE KIT: 10-12 Blender solids by commodity category through the existing instanced pickup path (today one octahedron
   gem for 66 commodities, `visualFactory.js:3071`).
ENABLER: the MOTION JUDGE (offline bank judge ~200 lines, no GPU; then a deterministic frame strip `fleet-look --clip`; then an in-page
recorder; the current ANI-01 probe polls at ~11 Hz, too coarse for jerk) is built inside slice 3 and used by 1, 2, 4.

**Deferred:** fleet identity variants (next; each needs a roster-prewarm entry or the first spawn freezes ~183-200 ms), rocks (only ~7
visible, ~525 WU out), structure life beyond the salvaged banks, `_LAMP`, characters, new gate/station variety, skeletal rigs or GLB-
embedded animation (loader rejects it, assetLoader.js:1220; skinning breaks batching).

**What the player really sees (skeptic):** Helios spawn = the Kestrel plus one cargo pod ~92 WU away; rocks start ~525 WU out, ~7 on
screen; stations 1347+ WU; gates 2870 WU; zero hostiles. First 20 s of flight already runs ~36 fps on the owner's iGPU. The declared
demo is Swarm/Crucible combat, so thrusters, debris and consequences outrank scenery.

**Operations:** cap concurrent helpers at 3 (a session limit killed 7 parallel agents); every helper writes its report to a file as it
goes; one serial publish lane (every publish rebuilds all render packages); after each slice no `test/*.expected.json` may change and
`npm run check:baseline` must pass; the Blender GUI connector (127.0.0.1:9876) answers "Client timed out" (main loop not servicing it;
restart Blender or toggle the BlenderMCP server panel to revive it); headless Blender is the production path.
