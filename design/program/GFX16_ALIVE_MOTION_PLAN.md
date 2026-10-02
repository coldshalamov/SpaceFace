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

## 6. STATUS (2026-10-02) — what landed on origin/master and what is next
LANDED (each verified by its own tests; `npm run check:baseline` stays red ONLY on the pre-existing flight-lane rows D117: sim,
sim-v3, sim-v3-compare, pq020-ceres-topology):
- Slice 1 THRUSTER LIFECYCLE `fa47e4d1f`: main-drive press ramps (first frame 10.1 WU -> 1.2 WU), release tapers to 0 (was cut at 8.2 WU / 52%
  radiance), retro born at 7% length (was 67%) and shrinks away (was frozen then hidden at 64%), fleet mode flips crossfade over 0.14 s;
  `test/thruster-continuity.test.mjs` (8 tests) is the gate; Wave G10 "dark in 0.25 s" still green. NOT visually checked on a real GPU: look at
  one flight when convenient. RCS untouched. The player's bell hull light now actually lights (record lacked `alive: true`): revert that hunk if unwanted.
- Slice 2 LAMP BUS `77b3c7d1f` (nav lights only): one shared clock, double flash + decay on a 1.5 s cycle, port/starboard half a cycle apart, floor 30%,
  reduced-flash holds steady; `src/render/lampBus.js`, `src/data/lampChannels.js`, `test/lamp-bus.test.mjs` (20). Gate spin-up events
  (`gate:range`, `jump:chargeStart`) fire ONLY for the player's own jump: NPC traffic never uses gates, so gate spin-up can only play for the player.
- Slice 3 MOTION JUDGE + SMOOTHING `ea55d415c`: `scripts/judge-motion-banks.mjs` calls the runtime's own evaluator at 60 Hz; before: 176 of 275 clips had
  visible velocity corners; the runtime now evaluates sparse channels (< 15 keys/s) as C1 cubic curves (PCHIP translation, angular-velocity-tangent rotation,
  zero-velocity ends, periodic loops) with NO bank file touched: snap 170 -> 3, no clip gained a flag; peak speeds rise up to 1.54x (inherent to easing).
  Devin's PR #207 (phase-2 authored motion: 20 rigged bodies, ANI-37 hornet rig, ANI-38 chassis kit on every flying hull) had already merged; this slice audits and
  smooths it instead of redoing it. Remaining judge flags: 17 no-settle, 3 whip, 3 snap (hull_flinch 17 keys/s, line_quiver, kestrel deploy).
- Slice 5 PICKUP KIT `f9466b219`: 17 Blender-designed solids (one per commodity category + the cut gem), exported by `tools/blender/forge/pickups/pickup_kit.py`
  to a baked JS module (live and headless Blender produce byte-identical output; no fetch, no hitch).
- Graphics batch: detail layer on 7 hulls (hornet, pelican, mule, ranger, liner, drifter, atlas; Hornet's flap rivets ride the ANI-37 flap rig), lit dock mouths on the 3 dock
  interiors, 3 place fixes, derelict lamp re-seats, Quiessence freighters kept becalmed (the kit now strips every motion rig and lit trim they inherit from their base ships).
NEXT, in order: (a) Forge-side beacons and strobes (one-line `forge.py Ship.mat` base-finish fallback, ~33 hull recipes `'glow_amber'` -> `'glow_amber.beacon'` for the top
beacon, update `scripts/check-kestrel-wholeship-runtime.mjs`, republish those hulls; full list in the lamp helper's report); (b) debris/shard kit (read
`docs/plans/2026-09-30-hull-burst-handoff.md` first); (c) Bastion + Kestrel detail layers (Kestrel needs its 5 motion rigs honoured and `check:kestrel:wholeship` re-pinned);
(d) structure life with the salvaged banks; (e) fleet identity variants (each needs a roster-prewarm entry); (f) `hull_flinch` / no-settle clips through the judge.
PROCESS LESSON: never make full git worktrees (assets make each ~6 GB; the disk hit 100% on 2026-10-02): sparse worktrees only, removed the same turn.

### 6b. Later on 2026-10-02 (all on origin/master)
- BLINKING BEACONS (Forge side of the lamp bus): `forge.py Ship.mat` falls back to the base finish colour for a channel variant; 18 hull recipes (24 ids with
  variants) name `glow_amber.beacon` for their top beacon. DRAW-NEUTRAL ONLY: converted only where the beacon is the hull's sole amber user (the finish is replaced, not
  added); hulls whose beacon shares amber with trims/window/dock lamps stay steady (apron_shuttle, ashline_*, helios_cradle, ironback, kestrel, leviathan, liner,
  pelican, salvage_cutter, scrap_sweeper, volatiles_tanker, rescue_lifter). Bastion and saucer convert a beacon that was already its own hook mesh.
- FIVE ANIMATED STATIONS (ANI-39..43, banks `research|ceres-refinery|mining|military|blackmarket.motion.json`): research habitat wheel 240 s/turn + telescope slews + dish
  sweep on dock:range; refinery stack crown 180 s/turn + hab dish; military radar bar 20 s/turn + tracking turret + fire-control dish; mining cutter drum + gantry crawl +
  hab dish; blackmarket signal yardarm + clamp jaws on dock verbs. Judge: 0 flags. COST: 2-3 MOTION_ nodes each = ~9-14 extra LOD0 draw calls per station when in view
  (~51 across the five); NOT measured by the frame probe (its scenario is the Helios hub). Known: a second `dock:range` mid-sweep snaps the dish back toward rest
  (fix needs a busy-gate in src/). The trade hub is NOT animated (flight-static-v3 bakes it flat).
- SIX FACTION HULLS (palette + lit-trim variants over existing hulls, routed by EXISTING enemy ids only, in the roster prewarm list): Concord `hornet_scn_interdictor`
  (patrol_lawman, customs_cutter), Quiet `wasp_quiet_ghost` (quiet_ghost) and `ashline_rig_quiet` (rig hostiles under faction_quiet), Choir `ashline_dart_choir`
  (choir_zealot), Vael `ashline_lode_vael` (warden_escort), Drift Miners `helios_cradle_dmc` (miner traffic in faction_dmc sectors). NOT remapped: lancer_sniper,
  detonator_dart, pirate wasp (test pq-193-09 pins them to the base Wasp). 3 of 14 factions' worth of identity is still missing (Archive, Fulfillment, Helix, Pitborn,
  Understory, Verge-Layers have no early-sector presence; add variants when a sector needs them).
- WEIGHT-AWARE CHASSIS MOTION (`ANI_38.py`): the cloud agent's chassis kit gave every hull identical breathing; it now scales by hull length around a 22 m reference:
  angles ~ length^-0.35, durations ~ length^0.5 (pendulum), heave ~ length. A 61 m Leviathan idles on a 13.3 s cycle through 0.31 deg (was 8 s / 0.45 deg); a 15 m
  pelican is brisker. `test/chassis-mass-scaling.test.mjs` pins it against every shipped bank and the census hull sizes. Re-baked 33 hulls.
- FRAME GATE (software renderer, Helios hub scenario, `probe-frame-solid --headless`): PASS: 0 blinks, 0 root swaps, 0 regressions, 0 stuck frames; timings
  (p50 65 ms) are software-render numbers, not meaningful against the GPU baseline. The first headless attempt had aborted with "authored ship asset library did not preload"
  (transient). Run it again on the owner's GPU for real timings.
- ARTIFACT HYGIENE: the Blender GUI connector now works when Blender is open and responsive; headless remains the production path. Disk: never full worktrees (see memory).
### 6c. Evening of 2026-10-02 (all on origin/master)
- DIE LAUGHING IS BACK ON THE HITCH. The Forge rebuild had dropped the hero marking (a blank ivory plaque stood in for it). `tools/blender/forge/stencil.py` builds hand-cut
  lettering as real geometry in an existing finish (node `LOD0_Armor_ivory`, no new draw, no texture): bridged counters, chipped corners/edges, overspray, seeded,
  conformal by ray-cast; ~620 tris, LOD0 only. It sits on the aft PORT armour course and is turned to read upright at the spawn heading: the in-game chase camera sits north
  of the ship looking south, so at heading 0 the nose points screen-LEFT with port at the bottom (verified in the real renderer with `fleet-look`; the Blender top view alone had
  it upside down). `test/kestrel-hero-marking.test.mjs` pins recipe, orientation and the shipped body so a rebuild cannot drop it again.
- KESTREL DETAIL LAYER (LOD0 36.4k -> 39.2k tris, 39 draws, `check-kestrel-wholeship-runtime` re-pinned): armour bolts on the starboard courses and hull bands, access hatches with
  coamings, cable trays along both sponson roots, seam lines (`tools/blender/forge/skin.py` seats everything on the real skin by ray-cast); canopy frame arches and coamings ride the
  ANI-17 canopy hinge group so the lid carries its frame when a repair job opens it; the dorsal beacon is the lamp bus slow-flash channel (draw-neutral).
- BUG FOUND AND FIXED (mine, from the chassis mass-scaling slice): mass-scaled clip durations were off the 60 fps grid (7.409 s) while the bake closed channels on the grid
  (7.4167 s), so `validateMotionBank` threw at bind and 32 hull banks silently had NO authored motion. `Clip.duration_s` is now quantized in the bake, the shipped banks patched,
  and `test/chassis-mass-scaling.test.mjs` pins every clip to the grid. Lesson: after any bank/bake change run the whole motion test family, not just the new test.
- JUDGE CORRECTED: settle is END-vs-REST (channels are rest-relative), overlay clips are exempt: no-settle 17 -> 0. Kestrel `deploy` presses retimed (kink 0.69 -> 0.28) and the hit
  flinch thinned to under the runtime's 15 keys/s line (snaps 3 -> 1). Judge now: 4 flags, all intentional: whips scanring_sweep / grindCycle / yard-tug release (fast spins), snap line_quiver (a rattle).
- RCS JETS (helper, `23ca7fa6f`): attitude jets are born from a stub with a short press ramp and spent from the root instead of popping (thruster-continuity covers all 7 families).
  NOT changed: the NPC RCS flash sprites (`vfx._onShipRcsPulse`): the sprite pool has no attack channel and a valve-opening puff of 0.1-0.18 s is a pulse by nature.
- DOCK RANGE (helper, `3a0e0442c`): a `dock:range` retrigger mid-sweep no longer snaps the station dish back toward rest (busy gate on the clip, real-bank tests).
STILL OPEN (decided, not forgotten): trade-hub life stays baked flat: it is the biggest body, ~1350 WU from spawn, and `flight-static-v3` exists to keep the opening frame sacred; a carve-out
needs an on-GPU frame measurement first. Animated-station draw cost (+9-14 draws each) and a real-GPU look at plume ramps, nav-lamp blink and station motion still want one owner flight;
gate spin-up for NPC traffic needs traffic that uses gates (sim); debris variety (only more shape variants would help); more faction hulls only when a sector needs them.
