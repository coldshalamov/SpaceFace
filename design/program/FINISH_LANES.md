<!-- LIFETIME: ACTIVE_PROGRAM -->
# The finish in lanes — nine owners, one finished game

Owner, 2026-09-24 (paraphrased): the plan pile is too granular. Every small job carries its own
verification ceremony, and an agent can build the exact named thing while the area around it stays
wonky. Batch the remaining work into a few logical lanes. A lane's instructions are open-ended on
purpose: the agent owns an *area* of the game, lands the named work still open there, and reviews
and tunes that area wherever it falls short of the A-list bar — while they are already working in
it. **The game is finished when the lanes are finished.** Features, polish, and fun are one lane,
not three passes.

Build-map entry: [`build_map.md` §27](../../build_map.md#27-the-finish-in-lanes--admitted-2026-09-24).
This file does not create a second queue. `program-queue.json` still owns unit truth; §22 rows and
INFERENCE catalog lines still exist for grunt-sized sittings; §23's campaign briefs are the detailed
wording the lanes cite. What changes is the unit a strong agent is handed: an area, not a leaf.

## 1. What changed

- **The unit of a finishing session is a lane, not a leaf.** Take one lane, play it, and own it
  until a stranger would call that area finished. Lanes are disjoint by file ownership; run them
  in parallel by area. One agent holds one lane at a time; a lane spans as many sessions as it
  takes, and a later session resumes the same lane rather than starting a parallel copy of it.
- **The named work is a checklist, not a script.** Each lane below lists the queue units, §22
  rows, §23 campaigns, §24 rows, §25 phases and ledger rows that already own part of its area.
  Their done-whens are the floor. Order inside the lane is your judgment, not the queue's.
- **Review is the job, not a phase after it.** Every lane session opens by playing its area on
  the default route at the shipping camera and writing down what falls short — bugs, cheapness,
  dead seams, wonkiness nobody packeted. That list is lane work: fix what is real, hand off or
  ledger only what is out of area (`AGENTS.md` §7). The named checklist is what we already know
  is missing; the game is also unfinished in ways nobody wrote down. Finding those is the point
  of owning the area.
- **Acceptance is batched at the area level.** A queue unit reading `implemented` closes when the
  lane owner has seen its surface live and judged it — one honest area pass closes many leaves,
  instead of a ceremony per leaf. The lanes' own checks run per landing, not per leaf.
- **The campaign briefs stay the instructions.** §23's *feeling / what is lying / you invent /
  read / thin* is exactly the open-ended shape a lane keeps. A lane does not shrink a campaign
  into a checklist; the checklist is what the campaign already knows is broken.

Inherited law, unchanged: §1.3 craft floors, §23.0 §8's campaign laws, §21's loop order, single
writers, `state.rng`/`state.simTime` determinism, one game path, the default route is the only
route, never answer feel with content, never add drag, never edit a golden to pass. §15.7's
refusals still refuse.

## 2. The lanes

| # | Lane | The area a stranger would name | Gate it feeds (§15.1) |
|---|---|---|---|
| 1 | **THE MACHINE** | it boots fast, holds 60 with the picture on, never hitches, never leaks, nothing pops | DEMO + RELEASE perf row |
| 2 | **THE HAND** | the ship answers the hand: flight, the rope, the fields, the verbs, input truth | ALPHA |
| 3 | **THE FIGHT** | swarm is the showcase: waves, arenas, the draft, the kill you can see, the replay | ALPHA → BETA |
| 4 | **THE WORLD** | you arrived in the middle of their day: sectors, jobs, consequences, ordinary life | BETA |
| 5 | **THE LONG GAME** | the fit, the market, the story: decisions an hour, a spine that builds to an ending | BETA |
| 6 | **THE PICTURE** | one game on the glass: hulls, rocks, skies, residency honesty, the camera | BETA |
| 7 | **THE INSTRUMENT** | every 2D surface is the same instrument of light — ORRERY, not a webpage | BETA |
| 8 | **THE EAR** | a signature by ear: every verb has a voice, the mix has a hierarchy, silence exists | RELEASE |
| 9 | **THE RELEASE** | the demo path and the package: title → Crucible → adventure → end card → store | RELEASE |

**Order.** THE MACHINE and THE HAND go first: a session where the game cannot run, or the ship
does not answer, cannot judge anything else — and the §15.2 feel-before-content law still holds
(content built on a ship that cannot turn gets rebuilt). THE FIGHT sits next because swarm is the
demonstration surface every other lane inherits numbers from. THE WORLD and THE LONG GAME are the
depth. THE PICTURE, THE INSTRUMENT and THE EAR are the presentation — they run in parallel with
the depth lanes, not after them; a finished area is finished *with* its presentation. THE RELEASE
is last and continuous: it keeps the demo path honest while the others land, and closes last.

A session takes the first lane whose files are free. A lane whose named checklist is empty but
whose area still fails its bar is still open — that is the open-ended half of the assignment, and
it is not optional.

## 3. How a lane session runs

1. Read the lane brief below, then the law files it names. Check `NOW.md` and the demo defect
   ledger ([`DEMO_READINESS_2026-09-20.md` §6](./DEMO_READINESS_2026-09-20.md)) for live rows in
   your files.
2. **Play the area before touching code.** Boot the default route, spend real time in it at the
   shipping camera, and write down what falls short of the lane's bar — including and especially
   the things no packet names. Compare what you found against the lane's checklist; anything
   already covered is the known work, anything new is your found work. Both are the job.
3. Work the checklist and the found list in the order that makes the area converge fastest.
   `implemented` units in your lane are yours to judge live and close; `ready`/`planned` units
   are yours to build; deferred units are yours to un-defer when the lane wants them.
4. Verify per landing, not per leaf: run the checks that cover the change's real failure modes
   when a slice commits, and the lane's gates when you believe the area is done. The fixed-seed
   fixtures are the same ones the named rows cite — do not invent a parallel harness.
5. End every session with the stranger look: the area played again, judged against the lane's
   done-when. Report in §1.4 words. A lane closes when its checklist is clear **and** the area
   passes — a clear checklist over a wonky area is a lane still open.

Two rules keep the lanes honest:

- **A lane does not get narrower because a row was written small.** If the honest fix for the
  area is bigger than any single row, the lane owns it anyway.
- **A lane does not get wider than its name.** A defect found outside your area follows §7:
  small, fix it now; medium, subagent it; big or unknown, one row in the defect ledger. Never
  a second bug list, never silent.

## 4. Lane one — THE MACHINE

**The feeling.** The game starts in seconds, holds 60 with the picture on, and a two-hour session
ends with the same heap it started with. Ships and stations arrive as themselves, before you look
at them. Nothing pops into being on the glass and nothing winks out while you are still watching.
A busy machine slows the flood, never the truth.

**Play it first.** `npm run probe:runtime-witness`, `npm run probe:smooth-flight` and
`probe:smooth-flight:crucible` on a machine under real load, then a long session — dock, undock,
jump, fight, save, load. Read the hitch owners, the admission queue, the heap slope, the boot
ledger. §21.2's laws are the contract you are defending.

**The named work.** Queue: `PQ-129.11`–`.17` (deferred hitch leaves), `PQ-204.00`–`.04`,
`PQ-022.h3-performance`, `PQ-038`/`PQ-040`/`PQ-041` native acceptance, `PQ-042` GPU branch,
`PQ-025` the Gold Corridor qualification, `PQ-144` the density/perf guard, `PQ-186` the
regression fortress, `PQ-173` the fun-loop instrument (the measurement tooling every lane's
numbers come through), `PQ-208` drift guard, `PQ-033.02` min-spec floors and soak. §22: Wave
**D1–D8**, **E8** (the iGPU-60 preset — art-direct the substitution list with THE PICTURE).
§8.4's hitch order and `design/perf/TABLE_AUTHORITY_PLAN.md`. VM outbox: every patch and report
job in [`VM_LANES.md`](./VM_LANES.md) is imported through this lane when its `DONE.md` lands —
dynres, shader admission, bloom cost, residency budget, jump-arrival spread, the CPU sweeps,
draw-call batch, the GL-error flood, ktx2, the soaks, the moonshot read. Demo work list
([`DEMO_WORK_LIST_2026-09-23.md`](./DEMO_WORK_LIST_2026-09-23.md) §1 — dated, re-measure first):
**L1** load, **L2** admission throughput, **L4** the critical-hub stall, **L6** the readiness
check that cannot see its own fetches, **L7** commit hygiene. Live ledger: **D24** (the renderer
leak — re-measure on the fixed tree per its row).

**Done when.** The RELEASE perf row is green on a quiet machine with the default picture: 60 fps
median, ≤ 1 frame over 50 ms per minute, zero over 100 ms, sim p95 ≤ 5 ms, boot to control ≤ 10 s,
Crucible launch ≤ 15 s, heap growth bounded over the soak, no frame over 100 ms on the
fifteen-minute path. Nothing on the live glass lost its mesh to get there.

**Thin.** Buying frames by turning the picture off. Deleting off-screen actors. A prewarm that
fakes the cold start. A number from a quiet bench quoted against a busy-machine complaint.

**Read.** `build_map.md` §8 and §21, `docs/COMMON_BUGS.md`, `src/render/renderer.js`,
`src/render/assetResidency.js`, `src/render/authoredAdmissionPolicy.js`, `src/render/tabletopPolicy.js`,
`scripts/probe-*.mjs` (flat, under `scripts/`). GPU-absolute verdicts stay owner-hardware; produce
the mechanism and say so.

## 5. Lane two — THE HAND

**The feeling.** Throttle, plume, brake, rope, shove, well and fire are one breath. The picture,
the sound and the instrument agree inside a fraction of a second. A denied latch feels like the
world said no. A throw is a decision you made — you understand the line, you wait, you cut, and
the body goes where your cut sent it. Missing is allowed and readable. The first ten minutes hand
you the power fantasy without a wall of text.

**Play it first.** Fly a fixed-seed Crucible and the adventure opening at the shipping camera:
every verb, every denial, every stall. `design/FEEL_CONTRACT.md` is the bar; §21's loop-order law
is the contract; `FUN_CONVERGENCE_LOOP.md` is the method — one hypothesis, fixed seeds, before/after
numbers.

**The named work.** Queue: `PQ-135` (flight convergence — judge it live), `PQ-137.08`/`.09`,
`PQ-139.03`/`.05`, `PQ-141` **the 60-second proof** (the ALPHA gate this lane answers to),
`PQ-146` stunt grammar, `PQ-163` the first ten minutes, `PQ-189` the control contract, `PQ-164.04`
twin-stick, `PQ-026`/`PQ-029`/`PQ-030`/`PQ-031` the Massline heads and coupling, `PQ-147` the field
toy chest. §22: **A5** shot life, **A7** muzzles move, **B5** slam ≠ nudge, **B10** the rope's
outcome is a class not a coin flip, **E1** the six pad verbs, **F1** release ghost, **F2** the rope
sings (with THE EAR), **F9** a chain holds a beat, **F17** repair is staying attached. §23:
**CV-HAND**, **CV-THROW**. No live ledger rows in this area as of writing — the ledger is checked
fresh every session either way.

**Done when.** The ALPHA feel gates measure green on the route: B1–B12, the 60-second proof at
≥ 9 of 11 beats across five seeds, ≥ 12 named stunts detected, and a stranger performs a
swing-release, a shove and a grab-and-run in the first minutes without reading a wall.

**Thin.** Answering feel with content. A homing aid, a guided shot, a damage buff on release, a
tutorial modal. Retuning thrust curves to fake the answer. A meter that runs out.

**Read.** `design/FEEL_CONTRACT.md`, `src/systems/flightV3.js`, `src/core/flight/`,
`src/systems/masslineThrow.js`, `src/systems/tetherGameplay.js`, `src/systems/fields.js`,
`src/systems/stuntGrammar.js`, `src/systems/input.js` (ownership rules apply), `src/render/feel.js`,
`src/systems/onboarding.js`.

## 6. Lane three — THE FIGHT

**The feeling.** A fight is a cluster of bodies the sandbox can abuse. A light hull is a
positioning problem you end with a shove, a well or a throw; a heavy changes the room; a
specialist ruins exactly one plan. A kill is bodies: wreck pieces that keep the victim's
momentum, lit, at a size you can see — then grabbable. The run is the toy: fling, wreck, fling
again; die; retry in seconds; the results tell the story back.

**Play it first.** The ordinary Crucible route per §16.2 — a starter, the first encounter, a
round clear, the shop, a refit, a death, a retry — and watch what a stranger sees at the shipping
camera, kill included, 400 ms after it.

**The named work.** Queue: `PQ-133.04`/`.07`–`.12` (the remaining Crucible phases; `.13` stays
deferred research), `PQ-134.02` the causal VFX/audio grammar (with THE PICTURE and THE EAR),
`PQ-140` the roster as physical problems, `PQ-174` the fun contract, `PQ-175` content at craft,
`PQ-169` daily seed / ghosts / mutators, `PQ-160` replay and clips (its consumers: results kill
replay, the live title and the trailer in THE RELEASE), `PQ-205` ordnance bombs, `PQ-206` combat
variety residuals. §22: **A8** stunt names on results, **B3** wrecks grabbable next round,
**B4** four specialists break four plans, **B9** daily seed / ghost / share / five-second replay,
**B11** the physics lab on the front door. §24: the arena lattice stamps, "enemies use the room",
"your own grenade". §23: **CV-AMMO**. §25 Phase 3: the hit you can see — a kill leaves ≥ 2 lit
wreck bodies inside 250 ms at readable size. §16's owner revision is the design law; §12's
anti-patterns fail a slice on sight.

**Done when.** §16.2's judgment passes at the shipping camera: quick first contact, a useful
early purchase, fast retry, readable entry lanes, specialists with counterplay, no wave-number HP
inflation — and the kill reads as bodies on the glass. The swarm gate numbers of §15.1's ALPHA
row are the floor.

**Thin.** More wasps at the same spacing. A combo meter. A specialist that is only a DPS skin.
A replay that is a capture, not the sim resimmed.

**Read.** `design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md` (as a quarry, not a checklist),
`src/systems/survivalSwarm.js`, `src/systems/survivalArena.js`, `src/systems/survivalDraft.js`,
`src/ai/specialistPlans.js`, `src/systems/tacticalAI.js`, `src/systems/aftermathWrecks.js`,
`src/systems/killReplay.js`, `src/systems/postEndingReplay.js`, `src/ui/screens/replay.js`,
`src/data/postEndingReplayChains.js`, `src/ui/screens/crucible*.js` (screens' kit grammar belongs
to THE INSTRUMENT — coordinate by exact path).

## 7. Lane four — THE WORLD

**The feeling.** You arrived in the middle of their day. A miner is on a seam, a hauler is coming
or going, someone wants that cargo, a patrol has a route — and you did not press accept to make
any of it true. You can interfere anywhere in the chain or watch it continue without you. Failure
leaves a body with a job: the convoy died so there is salvage, the pod spilled so someone wants
it, the pirate got away so she can come back. The minutes between jobs are a place, not a loading
corridor.

**Play it first.** Fly a seeded session in each sector that claims a way of life. Do not accept a
mission. Watch whether the chain runs without you, whether anything remembers you, whether travel
has texture. The creative campaigns below are this lane's frontier.

**The named work.** Queue: `PQ-138` the world reacts, `PQ-143` ordinary life, `PQ-148` cargo is
physics, `PQ-149` the storyteller, `PQ-150` people who remember, `PQ-151` the wanted loop,
`PQ-153` six sectors (`.01`/`.02` open), `PQ-154` wrecks as terrain, `PQ-145` industry authorship,
`PQ-171` the content grammar, `PQ-045` the Ceres slice's deferred acceptance, `PQ-018`/`PQ-019`/
`PQ-020` deferred site-presentation captures (with THE PICTURE), `PQ-207.03`, `PQ-209.01` the
combat→salvage→economy chain. §22: **A1–A4**, **A6** the slice scenario, **B2** the pirate who
comes back, **B6** one job chain and one physical difference per sector, **B7** three set pieces,
**E6** the repetition budget, **F3–F8**, **F10–F16** (the world-side signature toys: the hot
arrival, the search volume, the hauler worth catching, the route ribbon, wrecks still there
tomorrow). §23: **CV-DAY**, **CV-SO**, **CV-QUIET**, and all eight creative campaigns —
**CR-CHAIN**, **CR-FEED**, **CR-CHOIR**, **CR-WEIR**, **CR-BERTH**, **CR-ANVIL**, **CR-HOLLOW**,
**CR-TEXTURE**. §24: the optic world rows — more stamps, seeded scatter, beams and missiles, spent
crystals, focus and shelter. Demo work list §1B
([`DEMO_WORK_LIST_2026-09-23.md`](./DEMO_WORK_LIST_2026-09-23.md)): the unreachable world-side
seams — Kurtz, Bay 7, the ending archive, faction service, claim defense, base-destroyed — wire
them or cut them, never leave them dead.

**Done when.** §15.1's BETA "alive enough to surprise" column: six sectors each recognisable from
30 s of unlabeled activity, the storyteller sustaining work→tension→violence→aftermath→quiet over
a held-out 90-minute session, aces hunting with counter-loadouts, the wanted loop physical at
every tier, and a stranger can tell one "so then" story per hour from the default route.

**Thin.** Decorative ships in orbit. A briefing. A second pocket system. A density slider called
a way of life. A beacon with flavor text where the campaign asked for a place.

**Read.** `design/VISION.md`, `src/systems/traffic.js`, `src/systems/npcJobs.js`,
`src/data/sectors.js`, `src/data/sectorActivityPockets.js`, `src/systems/encounterDirector.js`,
`src/systems/lawSecurity.js`, `src/systems/aftermathWrecks.js`, `src/systems/aceMemory.js`,
`src/systems/economy.js`, `src/data/environmentalMachinery.js`, `src/systems/planetRuntime.js`.

## 8. Lane five — THE LONG GAME

**The feeling.** Interesting and mentally stimulating. The fit, the market and the story are
decisions: a player predicts a build's handling before paying and is right; a reader of the
forecast out-earns a non-reader; a linear spine builds to an ending you earned with the toys —
reachable by a combat run and by a builder run. A new verb every hour for ten hours. A ship that
is yours: scars, repairs, titles, grudges.

**Play it first.** A new game through the first hours on a fixed seed: count the interesting
decisions per hour (§17.1 M1), watch the money curve, fit a build and predict it, read the
campaign's beats as a player would meet them.

**The named work.** Queue: `PQ-142` progression and my ship, `PQ-155` the verb curve, `PQ-156`
three starters, `PQ-176` customization with consequences, `PQ-177` the readable economy,
`PQ-178` the story pipeline, `PQ-032` the linear spine (`.00`–`.03`; one leaf has a live writer —
check `NOW.md`), `PQ-152` set pieces from verbs, `PQ-195` the Third Shift, `PQ-170` endgame pulls
(post-launch scope, still this lane), `PQ-172` mods and data-driven content, `PQ-209.02` the
income curve past hour 0, `PQ-208`'s unwired verb keys. §22: **B1** hours 1–10 still pay,
**B8** the ten-verb curve, **F10** the three starters are jobs. §17's rulings bind: no dialogue
trees, one linear story, replay value is not a goal, rarity loot only if it earns its place.

**Done when.** M1–M6 measure green: ≥ 6 interesting decisions an hour, handling predicted within
20 %, builds differing ≥ 25 % in reversal time both viable, the cone-reader out-earning by ≥ 30 %,
a 20–25 h spine where every beat has a physical headline verb, a load screen that reads your
ship's history back.

**Thin.** A spreadsheet screen. A forecast the sim does not compute. A black market that is a
menu. A beat that is text the player reads instead of a place with a verb.

**Read.** §17 in `build_map.md`, `src/systems/ships.js` `getDerivedStats`, `src/data/ships.js`,
`src/data/modules.js`, `src/systems/economy.js`, `src/systems/economyCycles.js`,
`src/ui/screens/outfitting.js`, `src/ui/screens/market.js`, `src/story/campaign47a/`,
`src/data/missions.js`, `docs/worldbuilding/`.

## 9. Lane six — THE PICTURE

**The feeling.** One game on the glass. Whatever is on screen is the real object at the quality
of the thing next to it, ready before it crossed into view. Industrial machinery at arcade
energy: painted working vessels under warm light, ceramics and rubber and bare metal as different
substances, faction as silhouette not recolor. The law of the glass holds: your hull → the body
you act on → the consequence → the threat → the world → the instrument → the sky. The camera is
art direction: speed opens the frame, impacts kick by delta-V, a signature kill gets a beat.

**Look first.** The opening flyby, a Crucible fight, a station approach, a wreck field — frames
at the shipping camera, judged against the law of the glass (`ZERO_TO_HERO` §2). In-session
stills only; nothing is stored.

**The named work.** Queue: `PQ-190` the style slice, `PQ-193` the 3D picture never looks broken
(waves A–E — complete bodies, the flyby, tubes, the shelf, places), `PQ-050` the fleet remaster
import lane (`.02`–`.22` land from `vm-drop` chase folders as `DONE.md` files appear; Hitch and
Kestrel stay frozen), `PQ-049` the express liner, `PQ-136` field the authored assets, `PQ-159`
camera and photo mode, `PQ-161` readable at zoom, `PQ-134` the arcade VFX foundation, §8.5's
rejected-asset defect. §22: **C6** six skies luminance-bounded (the sky stays rich — substances
and weight, not a dimming pass), **C7**/`C8` fleet and wreck art through `vm-drop`. §23:
**CV-GLASS**, **CV-PAINT**, **CV-MOTION** (the world moves when nothing is exploding — with THE
WORLD's occupations feeding it). §25 Phase 1 (body scale: hull p10 ≥ 48/36/28 px, plume never
covers the hull) and Phase 2 (the frame: one hero celestial, effect families sized to the bodies
they mark). §24's picture row (stone/metal/diamond read as themselves). §26's order is the law:
flyby → opening NPCs → reverse jets → rocks and sky → props.

**Done when.** Nothing on the default route's glass is a marker, a fallback, a floating part, or
a body from another game; the body-scale and law-of-glass bars hold on fixed seeds; a stranger
can name the job of anything they are looking at in a paused frame.

**Thin.** A halo or sprite standing in for a hull. A global color grade. Glow as substance. A
photo texture on a hull. Cutting draw distance, bloom or the sky to win hierarchy or framerate —
that is THE MACHINE's job and it has the same prohibition.

**Read.** `docs/visual-assets/README.md`, `docs/visual-assets/ILLUSTRATED_GRAPHICS_STANDARD.md`,
`src/render/partsLibrary.js`, `src/render/illustratedSurface.js`,
`src/render/industrialMaterialFamilies.js`, `src/data/sectorVisualProfiles.js`,
`src/render/spaceBackground.js`, `src/render/cameraDirector.js`, `src/render/shipMicroMotion.js`,
`src/render/asteroidInstancePool.js`, `assets/ships/AGENTS.md` and the material-truth preflight
for anything Blender-side.

## 10. Lane seven — THE INSTRUMENT

**The feeling.** Flight, dock, map, pause, prompt and the Crucible door are the same ship's
instrument: an orrery of light, the amber Hand that swings to your choice, rings and scales and
leader lines over deep glass — produced art, never a card grid. The live picture stays the bright
thing; the instrument sits on it and does not shout over it. Zero persistent sentence cards in
flight. Nothing reads like a webpage.

**Look first.** `node scripts/ui-bench.mjs --shot=<id>` over every surface in §18.2's manifest —
open each PNG yourself, fix what you see, `--walk` every control on screens you changed. The
picture you opened is the evidence; a green matrix over a cheap screen is a fail.

**The named work.** Queue: `PQ-180` the grammar matrix, `PQ-181` the meta shell, `PQ-182` the
Crucible screens (result-model rows A8/B9 stay THE FIGHT's), `PQ-183` everything is a link,
`PQ-184` UI performance, `PQ-185`/`PQ-130`/`PQ-131`/`PQ-132` Asteroid Works (the one screen that
is also a game — the board is the game), `PQ-162` the station, `PQ-168` the chart, `PQ-187` the
direction's deferred proof, `PQ-188` the HUD and instruments on the kit, `PQ-192` the reading
screens, `PQ-194` the Field Hardware production program (`.03`–`.07` — Blender sets, the
prototype port, kit runtime, surface integration, the QA sweep). §22: **C1–C4** every screen on
the one kit, **E3** the +40 % growth test, the instrument-shaped **G rows** (G1 bracket states,
G3 no combat sentences, G4 edge markers, G5/G12 unclipped disjoint labels, G7 contacts hidden
until lock, G8 law is a badge, G9 objective recall, G11 no dead stats, G13 hull is not a caption,
G14 bracket shapes, G15 bound-key prompts). §23: **CV-KIT**. §25 Phase 4: `CAN` becomes a shape,
results is replay + stunts + **Again**, the demo end card moves onto ORRERY. Direction law:
[`design/frontend/ORRERY.md`](../frontend/ORRERY.md) is the one plan; nothing under
`design/frontend/direction/approved/` carries owner authority. Live ledger rows in this area:
**D35**–**D37** (the works screen under host contention — scheduling stalls and the stale fault
strip).

**Done when.** The §18.1 matrix is green across the manifest **and** a stranger opening each
screen at the shipping camera finds it consistent, high-detail, interactive and non-generic —
the A-list floor is both columns, never one.

**Thin.** A token rename. A new font over the same boxes. A screenshot left for a later pass.
Restoring a superseded direction because its folder is still in the tree.

**Read.** `design/frontend/ORRERY.md`, `docs/UI_VISUAL_ITERATION.md`,
`design/frontend/INSTRUMENT_GRAMMAR.md`, `src/ui/orrery/`, `styles/`, `src/ui/`,
`scripts/ui-bench.mjs`.

## 11. Lane eight — THE EAR

**The feeling.** You can tell the rope from the gun from the dock from the station with your eyes
shut. A crowded fight has a mix: something can drown, something can vanish, and there is a silence
before the thing that matters. The chain you just made is audible. The station is a room, not a
mute menu. Reduced motion may thin the picture; it never deletes the cue that is information.

**Listen first.** A seeded fight and a docked minute with your eyes off the HUD: which verbs
collapse onto one sting, which channels fight, where the silence should be and isn't.

**The named work.** Queue: `PQ-158` audio direction (authored samples over the oscillator stack,
the impact ladder by mass × speed, the Massline as an instrument, adaptive themes, voice for the
script, the reverb bus, the weight-first mix), the audio half of `PQ-134.02`. §22: **C5** every
combat verb has a sound, **G2** the denied latch, **G10** throttle answer (verify it holds).
§23: **CV-EAR**, plus the audio half of **CV-HAND** and **CV-THROW** (the rope's voice, shared
with THE HAND). The intake list is the pallette: Elementary for continuous voices, the Kenney
audition set, the Sonniss picks for signatures — committed as part of the game, not a library.

**Done when.** The verb table is green (each verb id resolves its own recipe and its own
character), the mix hierarchy ducks predictably, the station room tone plays, and a stranger
learns a verb by ear the way they learn weight by hand.

**Thin.** One new music loop. The UI click repitched into a weapon. A caption saying what the ear
should have said. Restarting a sample every tick.

**Read.** `src/audio/audioSystem.js`, `src/audio/masslineInstrument.js`,
`src/data/audioRecipes.js`, `src/audio/sampleLibrary.js`, `src/render/vfx.js` (the cue seam),
`docs/OPEN_SOURCE_INTAKE.md` §0.

## 12. Lane nine — THE RELEASE

**The feeling.** A stranger boots it and the path plays: live title running a real replay behind
the menu, one press to a Crucible round zero that teaches by doing, results with a door into
adventure, a first dock that feels like arriving, an end card that thanks them — all of it on one
game path, on a real machine, in five languages, with a pad or a keyboard. Then the package
installs and the store page is true.

**Play it first.** The fifteen-minute path (`DEMO_READINESS` §5) end to end on a clean profile —
then the same again in the demo flag (`?demo=1`) and again with a gamepad. Every seam in that
walk is this lane's work.

**The named work.** Queue: `PQ-210.08` the fifteen-minute demo, `PQ-033` the release closeout
(legal, credits, crash reporting, version, store readiness — `.02`'s min-spec soak is THE
MACHINE's), `PQ-164` input truth (controller, Deck, trackpad, haptics — flight feel consult THE
HAND), `PQ-165` accessibility and options, `PQ-166` five languages, `PQ-167` telemetry and the
weekly playtest, `PQ-191` the independent passover (folded into every lane's review — this lane
runs the last one over the whole game). §22: **E2** reduced motion keeps the facts, **E4** five
languages, **E5** one save on both runtimes, **E7** mods load data. §25 Phase 5 (demo flag, live
title, round zero with THE FIGHT, load with THE MACHINE, end card with THE INSTRUMENT) and Phase
7 (Electron package, photo-mode store shots from THE PICTURE's mode, the replay-cut trailer from
THE FIGHT's replay, the opt-in funnel). Demo work list
[`DEMO_WORK_LIST_2026-09-23.md`](./DEMO_WORK_LIST_2026-09-23.md) §3 (**P1**–**P10**) and §5
(**S1**–**S7**), where not already claimed by another lane above.

**Done when.** §15.1's RELEASE row: the package builds and installs, the fifteen-minute path
plays with no frame over 100 ms, accessibility and localization checks are green, the demo funnel
reports, and the owner can hand the build to a stranger without a briefing.

**Thin.** A second entry point or build. A tutorial modal. Store shots of a build that is not
this one. A release gate closed on a laptop the game will never run on.

**Read.** `design/program/DEMO_READINESS_2026-09-20.md`,
`design/program/ZERO_TO_HERO_2026-09-23.md` §5/§7, `src/core/demoMode.js`,
`src/ui/screens/demoEnd.js`, `src/sim/titleAttract*.js`, `src/systems/gamepad.js`,
`src/localization/`, `src/save/`, `scripts/build-bundle.mjs`.

## 13. Coverage — nothing open is orphaned

Every non-done queue task, wave row, campaign and program lands in exactly one lane. The map:

| Lane | Queue tasks | §22 rows | §23 campaigns | Other |
|---|---|---|---|---|
| MACHINE | PQ-022, PQ-025, PQ-033.02, PQ-038, PQ-040–042, PQ-129, PQ-144, PQ-173, PQ-186, PQ-204, PQ-208 | D1–D8, E8 | — | VM_LANES imports; §8.4; DEMO_WORK_LIST L1/L2/L4/L6/L7; ledger D24 |
| HAND | PQ-026–031, PQ-135, PQ-137, PQ-139, PQ-141, PQ-146, PQ-147, PQ-163, PQ-164.04, PQ-189 | A5, A7, B5, B10, E1, F1, F2, F9, F17 | CV-HAND, CV-THROW | FEEL_CONTRACT; FUN_CONVERGENCE_LOOP; §13A/§13C |
| FIGHT | PQ-133, PQ-140, PQ-160, PQ-169, PQ-174, PQ-175, PQ-205, PQ-206 | A8, B3, B4, B9, B11 | CV-AMMO | §12/§16; §24 arena rows; §25 Phase 3 |
| WORLD | PQ-018–020 (with PICTURE), PQ-045, PQ-138, PQ-143, PQ-145, PQ-148–151, PQ-153, PQ-154, PQ-171, PQ-207, PQ-209.01 | A1–A4, A6, B2, B6, B7, E6, F3–F8, F10–F16 | CV-DAY, CV-SO, CV-QUIET, all CR-* | §24 world rows; DEMO_WORK_LIST §1B world seams |
| LONG GAME | PQ-032, PQ-142, PQ-152, PQ-155, PQ-156, PQ-170, PQ-172, PQ-176–178, PQ-195, PQ-208 (verb keys), PQ-209.02 | B1, B8, F10 | — | §17 bars M1–M6 |
| PICTURE | PQ-049, PQ-050, PQ-131 (art half), PQ-134, PQ-136, PQ-159, PQ-161, PQ-190, PQ-193 | C6–C8, G6 | CV-GLASS, CV-PAINT, CV-MOTION | §8.5; §13B/§13D; §25 Phases 1–2; §26; vm-drop ship/sky/wreck folders |
| INSTRUMENT | PQ-130–132, PQ-162, PQ-168, PQ-180–185, PQ-187, PQ-188, PQ-192, PQ-194 | C1–C4, E3, G1, G3–G5, G7–G9, G11–G15 | CV-KIT | §11; §18; §20; ORRERY; §25 Phase 4; ledger D35–D37 |
| EAR | PQ-158, PQ-134.02 (audio half) | C5, G2, G10 | CV-EAR | OPEN_SOURCE_INTAKE audio picks |
| RELEASE | PQ-033 (rest), PQ-160 (consumers), PQ-164, PQ-165–167, PQ-191, PQ-210 | E2, E4, E5, E7 | — | §25 Phases 5/7; DEMO_WORK_LIST P/S rows not already claimed |

Done tasks stay done — they are the foundation the lanes stand on, and a lane finding one of its
"done" units lying on the route reopens it in place, in the lane.

## 14. What stays outside the lanes

- **The queue machinery.** `program-dispatch`, queue states, `NOW.md`, checkpoints: unchanged.
  A lane closing a unit still writes the state; a grunt sitting still takes `--next` or an
  INFERENCE line.
- **The defect ledger.** `DEMO_READINESS_2026-09-20.md` §6 is the one ledger. Lane-found defects
  outside your files go there per §7 — never a per-lane bug list.
- **The vm-drop fence.** The other machine fills `vm-drop/`; MACHINE and PICTURE import its
  `DONE.md` folders. Its job list is unchanged.
- **The Jules bank.** Cloud candidates still route through `jules-dispatch`; a cloud task that
  lands inside a lane's files is that lane's collaborator, not its replacement.
- **Post-launch.** `PQ-170`'s territory wars and `PQ-172`'s mods ride the LONG GAME lane's tail;
  nothing in this file schedules them early.
