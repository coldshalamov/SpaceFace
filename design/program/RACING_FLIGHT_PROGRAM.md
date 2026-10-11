<!-- LIFETIME: STABLE -->
# Racing flight: a complementary build program

## Product contract

The fantasy is **threading a heavy, fast ship through a place worth remembering**, then returning
to the same living universe. The chase camera is a reusable flight view; a circuit is one use of
it, not a fork of SpaceFace's flight engine. More content should compound on the existing three
terrains, five contracts, mission driver, physics authority and camera owner.

This is an owner-requested program of complementary builds, not a second implementation queue.
`build_map.md` remains the front door. Claim exact paths in the existing work coordination system;
update the existing owners, do not create parallel save, input, physics, mission or camera stacks.
Instructions and current code take precedence over illustrative names below. Player feedback is
welcome, but no delivery waits for the owner to do an agent's verification work.

## Current tranche — 2026-10-10

The foundation from [PR #239](https://github.com/coldshalamov/SpaceFace/pull/239) is merged.
[PR #263](https://github.com/coldshalamov/SpaceFace/pull/263), which adds camera-leased mission
sections and station handoffs, remains a separate cloud lane in flight. Do not describe its work
as shipped or absorb its branch. The following additions are implemented in this tranche.
Browser and Electron public-menu circuit launches pass: Wasp + Sprint, chase camera, grid release,
live thrust, authored hulls/assets, no uncaught errors, and campaign-save isolation. Desktop/mobile
component checks cover every ship/drive selector, view cycling and braking advice. Targeted flight,
UI imports/labels, save-schema and deterministic V3 checks pass. Normal Adventure launches and
Continue restores a flyable ship, but its reload exposes the exit-save quota defect D181 in the
demo ledger; that path is not certified clean. Real device performance and complete race heats
are not established by these launch and focused checks.

- **Three constructed quick-play courses:** Textile Belt's quarry banks, Tally's technical lanes
  and express return, and Veil's shelter banks use deterministic placement of the existing terrain
  budget. Helios's start/return avoids the station; Veil gates pass beside landmarks. Actual world
  materialization checks cover all eight circuit contract seeds: asteroid bodies clear the gate
  corridor and static solids clear a 32-WU-radius hull path and grid. This is spawn-clearance
  evidence, not a claim of measured handling feasibility at every speed. Registration belongs to
  temporary-flight sector objects; campaign terrain keeps its existing generation.
- **Useful ship and drive choices:** the circuit board lends the existing starter hulls with
  Standard, Sprint or Endurance drives. Adventure still obtains those upgrades through its normal
  ship/equipment owners. Records distinguish fitted hulls and temporary/campaign layout; recovery
  or a changed fit leaves an unranked result. Old uncategorized times are not comparable records.
- **Reusable personal flight:** chase-camera horizon and input improvements and an AFT cue for a
  selected target behind the ship support ordinary flight as well as racing. Circuit braking and
  projected-drift advice reads the fitted propulsion profile; it never takes over the controls.
- **Three station-board speed jobs:** **Outrun the Cut** extends an escape margin at each gate;
  **Last Open Window** combines closing deadlines with a slow final handoff; **Follow the Cold
  Wake** uses a projected pace light and a burn ring under a passage deadline. Their pressure
  clocks begin at the start gate, excluding the station approach. First-clear rewards and their
  completion state use the existing mission/economy/save owners. The light remains a coaching
  projection, not an AI craft, and these jobs leave the player's camera toggle available.

This advances parts of RF-01/02/03/04/08; it does **not** close RF-01–RF-08. Real rivals, replay
ghosts, authored moving course machinery, broader hull/handling acceptance, and device performance
remain builds in this same program. The next implementation order is compatible ghosts, one
precision-speed mechanic, then real rivals after their physical line planning exists.

## Twelve complementary pieces to build

These are concrete expansions of the packets below, not twelve new queues. “Next” follows the
current tranche; “After” names work that uses those foundations. Keep each addition useful in
quick play and, where indicated, the adventure world.

| Priority / packet | Component and player decision | Existing implementation owners |
|---|---|---|
| Next / RF-04 | **Personal ghost and courier memory:** race a compatible clean run, compare actual gate splits, then reuse the same replay presentation for a memorable delivery route. Ghosts cannot collide or grant draft. | `racingSteer.js`, `racingGeometry.js`, course presentation and local records |
| Next / RF-06 | **Massline apex anchors:** marked anchor rocks offer a short tether swing around a corner; the outer lane stays safe. Releasing at the right heading earns momentum through the normal rope and flight physics. | `tetherGameplay.js`, attachments/physics authority, `raceLevels.js` |
| Next / RF-06 | **Precision charge chain:** central, well-aligned gate crossings build one small boost reserve; a messy corner breaks the chain while the race continues. This rewards a clean line instead of merely holding boost. | Ordered gate events, flight boost resource owner, racing HUD |
| Next / RF-02/03 | **Customs shutter windows:** visibly cycling scanner arms create a short timed service cut beside a reliable longer route. The same machinery gives evacuation and smuggling jobs a legible risk choice. | World machinery, authored course geometry, missions and course presentation |
| Next / RF-03 | **Thermal shelter delivery:** exposed burn legs warm a sensitive payload; larger structures provide cooling pockets. Choose between a fast hot line and a slower sheltered line, with the cost visible before entry. | Cargo/mission owners, environmental machinery, existing structure assets |
| After / RF-05 | **Rivals with habits:** a cautious hauler defends the safe line while an aggressive light hull attacks apexes. Both use actual thrust, collision avoidance and recoveries; repeated meetings develop readable rival identities. | Tactical AI/AI ports, propulsion kernel, mission progression |
| After / RF-03/05 | **Rescue relay and tow extraction:** reach a stranded pilot, carry or tow the casualty through a fast corridor, then make a controlled handoff. The added load changes braking and the winning route. | Physical cargo, Massline, ships' derived mass, mission handoff |
| After / RF-03/06 | **Listening pursuers:** hard burns and weapons attract a hunter's search, while a quiet detour buys distance. Race-line knowledge becomes an escape skill; pursuit pressure comes from actual AI and lawful heat owners. | AI perception, WANTED heat, encounters, missions |
| After / RF-02/03 | **Workfleet crossing schedules:** announced freight convoys intermittently occupy a straight. Commit before the crossing or take the service loop; adventure pilots can learn the same schedule outside a race. | Traffic/workfleet, world lane geometry, mission timing |
| After / RF-02/06 | **Breakout debris waves:** a telegraphed salvage breakup opens successive gaps rather than spawning surprise walls. Skilled pilots read the moving debris, preserve speed and choose which gap to take. | Existing physical effects, asteroid/resource bodies, course event presentation |
| After / RF-01/07 | **Pit-fit decisions:** a finite cup permits a drive/RCS change between heats, with visible acceleration, braking and energy tradeoffs. Equipment choices change lines and timing categories rather than providing a universal best upgrade. | Ships/loadouts, propulsion telemetry, circuit board and equipment UI |
| After / RF-07 | **Local cups with world recognition:** first-clear medals, rival notes and cosmetic recognition acknowledge clean runs at the host station. Repeat practice improves records; it does not become an unlimited credit faucet. | Mission/economy owners, local records, unlocks and station presentation |

## Order and dependencies

| Packet | Delivery | Depends on | Primary owners |
|---|---|---|---|
| RF-01 | Hull-aware handling and camera envelope | Current chase/circuit implementation | `src/render/camera.js`, `src/core/flight/`, `src/systems/flightV3.js` |
| RF-02 | Raceable terrain corridors and authoring validator | RF-01 envelope | `src/data/raceLevels.js`, world terrain owners, course presentation |
| RF-03 | Chase mission sections woven into adventure | RF-01; reuse RF-02 corridors | `src/systems/missions.js`, existing authored mission/quest data |
| RF-04 | Personal ghosts and trustworthy timing categories | Stable course revisions; RF-01 profile | Racing geometry, record store, presentation |
| RF-05 | Actual rivals, recoverable mistakes and overtaking | RF-02; RF-04 timing provenance | Existing tactical AI / AI ports / flight owners |
| RF-06 | Earned speed: draft, heat and clean-gate chains | RF-01, RF-02; RF-05 optional | Flight assists, heat authority, course presentation |
| RF-07 | Circuit career and rewards without an exploit economy | RF-02, RF-04; RF-03 routes | Mission, economy, unlock and board owners |
| RF-08 | Accessible controls and sustained runtime quality | Runs alongside every packet | UI input/mobile/gamepad, render and test owners |

The first useful tranche is RF-01 + RF-02 + one RF-03 mission. RF-04 follows before competitive
claims. RF-05 is deliberately later: a cone following a spline must never be sold as a rival AI.
RF-08 is continuous work, not a final cleanup bucket.

## RF-01 — Give speed a usable camera and handling envelope

**Outcome.** Small and large hulls can aim, brake, boost and exit a turn without camera clipping,
input inversion or an invisible assistance mode fighting their intent. Chase is useful outside races.

Keep movement in the existing kernel. Instrument commanded and achieved yaw rate, lateral slip,
speed, braking distance, gate miss distance, camera-to-hull range and solid-clearance intervention.
Use the current ship's actual derived stats. Define a curvature envelope from `R ≈ v / |yawRate|`
and stopping-distance scenarios from the actual thrust/brake controller, not from an assumed car
model. Do not globally clamp earned above-cap momentum to make a course pass.

Build opt-in racing assist profiles through existing control/physics interfaces: steering response,
lateral stabilization and forward braking, each with explicit caps and an off state. Steering intent
must win over guidance; tether/orbit assistance must either deliberately coexist or visibly suspend,
never alternate writers. Test boost release mid-turn and touching a steering control mid-autopilot.

Extend the camera with bounded velocity-heading blending only where measured slip needs it;
retain nose visibility and a stable horizon. Add boom occlusion/near-plane tests for ship swaps,
large hulls, narrow passages and floating-origin changes. The roof solver's conservative lift is a
safety floor, not evidence that every wall/overhang is well framed. Photo/death/director ownership
and reduced motion remain explicit. No independent FOV animator.

**Acceptance.** Fixed-seed runs across representative light/medium/heavy hulls; 30/60/144 Hz render
with unchanged simulation outcomes; no camera point inside named solid test volumes; bounded,
recorded steering response and stopping distances; no NaN, residual grid input or save mutation.
Publish tuning and measured limits, not a declaration that the controls merely “feel AAA.”

## RF-02 — Courses that are places, not dots over rocks

**Outcome.** Each existing terrain has a recognizable racing rhythm and a physically feasible
corridor that reads from the stern camera without destroying normal exploration.

Textile Belt becomes an open acceleration straight into a two-apex rock slalom, with an optional
wide recovery lane and a visible finish gantry. Tally Circuit alternates orderly customs lanes with
one tight service-cut shortcut; moving scanner shutters announce their phase well before commitment.
Veil Wash alternates sheltered landmark silhouettes and exposed burn sections; gas density changes
visibility, not the legitimacy of a hidden checkpoint. Reuse sector assets; do not add floating people.

Create a pure authoring validator for finite points, aligned lap seam, nonzero segments, consistent
aperture normals, minimum hull clearance, curvature/braking feasibility at profile speeds, boost
exit room and checkpoint bypasses. A race-specific clear corridor is a deterministic world-generation
intent, not runtime deletion of campaign actors. Validate the start grid against collisions before
acceptance. Store course revision and seeded decoration inputs with the course record.

Add sparse edge pylons, chevrons and start/finish structures using existing asset/Forge workflows.
Instanced geometry and bounded local residency beat duplicating a whole sector. Preserve readable
sky/negative space; clutter is not detail. Add optional route branches only with an explicit ordered
route graph and fair length/risk accounting, not by forgiving missed gates.

**Acceptance.** All three courses validate for their advertised hull classes; a deterministic pilot
can complete each legal route without resetting; rejected bad fixtures include a gate inside a rock,
180-degree hairpin at unachievable speed, duplicate seam, invalid branch and blocked grid. Actual
asset-loaded chase screenshots from each defining section accompany render checks.

## RF-03 — Mission sections that borrow the camera

**Outcome.** Adventure missions transition approach → chase section → resolution without starting
a new campaign, rewriting the player's camera preference or leaving a permanent lock.

Use `steerLock` plus `steerLockPhases` on the existing mission owner; select phase IDs already used
by that mission. A single active camera lease is resolved deterministically. Never let UI or a
separate cinematic loop advance mission phases. Announce the impending change, provide a brief
safe alignment stretch, and release control immediately on failure/abort/dock/jump/load/death.

Author five finite experiences, sharing the three race corridors:

- **Needle Run / Helios:** carry unstable salvage through the belt, choose safer outside apexes or
  a shorter high-stress line, deliver to the existing station. Damage/cargo state comes from its
  existing owner; the mission measures it. The chase leg is the middle, not the entire job.
- **Dead Reckoning / Tethys:** overhead telemetry fails during a customs escape. Follow physical
  lamps; a service-lane branch changes which pursuer arrives at the exit. No unavoidable blind gate.
- **Wake Thief / Tethys:** stay in a convoy's wake long enough to copy a navigation signature, then
  leave via the service cut. RF-05 can supply a real lead craft later; until then name the guide a
  training beacon and avoid fake convoy claims.
- **Whiteout Relay / Veil:** carry a temperature-sensitive payload between visible shelters. Burn
  through exposed wash for time or cool behind structure; telegraph the cost before the decision.
- **Pursuit Extraction / Helios to handoff:** choose a clean racing line while an escort engages
  pursuers. The final gate releases chase and hands back normal targeting, rather than ending the
  universe at a results screen.

**Acceptance.** Public board/story routes reach every phase; fixed-seed success and failure traces
show exactly one resolution/reward, one camera lease, no duplicate targets, no lost cargo authority
and restoration of the pre-mission view after every terminal path. Save/load in each phase has
intentional, tested semantics. Five different mission verbs, not five renamed stopwatch laps.

## RF-04 — Race the version of yourself that almost made it

**Outcome.** A clean local best produces a translucent but legible ghost and meaningful split deltas.

Record bounded samples of the authoritative pose/time plus discrete gate stamps. Playback is
interpolated presentation only: it cannot collide, draft, draw fire, claim gates or change the world.
Cap recording length and bytes; store a versioned envelope with course/revision, route branch,
lap count, hull class, derived loadout hash, physics/tuning version and assistance category.
Recovery, debug relocation, pause manipulation and invalid sample sequences cannot enter a clean
category. A separate “assisted practice” category may exist; do not silently mix it with clean bests.

Use gate-stamp comparison for actual split deltas. The current distance-weighted posted pace is an
estimate, not a historical opponent, and must retain that label until a compatible ghost exists.
Provide delete/export controls with storage failure handling; no uploads or online ranking in this
packet. Old records may remain readable but incomparable revisions do not compete.

**Acceptance.** Compatible run round-trip preserves gate times and bounded interpolation error;
malformed/oversize/wrong-version data fail closed; ghost never appears in sim entities; unlimited
restarts do not leak geometry or storage. A reset attempt demonstrably cannot replace a clean best.

## RF-05 — Rivals with inertia and somewhere to go

**Outcome.** Two or three actual craft make starts, overtakes and errors legible without cheating.

Use the existing AI intent-to-flight path. Generate a racing line with speed targets from RF-01's
measured curvature/brake envelope, plus limited lateral overtaking lanes validated by RF-02. Rivals
need launch spacing, collision avoidance, recovery and a finish/DNF state. Personality changes
risk preference and line choice, not hidden teleportation or infinite thrust.

Difficulty may choose stronger profiles before launch; any dynamic assistance must be bounded,
declared and placed outside clean competitive categories. Course obstacles and player collisions
remain physical. Preserve a non-contact time-trial option. The currently scripted pace beacon stays
an explicitly labelled coaching tool and never inherits combat/faction authority accidentally.

**Acceptance.** Seeded packs complete repeated heats; collision counts, recoveries and finish-time
spread are measured; no on-screen teleport or authority bypass; AI remains within the same kernel
force/turn limits; player leaving/death releases the whole heat without orphan entities.

## RF-06 — Earned speed, not free acceleration spam

**Outcome.** Three understandable opportunities reward precision: coherent drafting, clean gates and
well-timed cooling. Each communicates its cost and exit condition from the chase camera.

Make drafting depend on leader-relative longitudinal/lateral position, velocity alignment and
occlusion, not merely looking at a point ahead. Use a smooth bounded force through the physics
queue instead of a frame-rate-dependent impulse fountain. Keep the visible wake consistent with
the exact qualifying volume and preserve a reduced-flash presentation.

Prototype a clean-aperture chain: only a narrow central crossing at the correct angle earns a small
charge; missing the next clean window breaks the chain without erasing normal race progress.
Charge spends through the existing boost resource owner. Heat/overdrive cost is an intent handled
by the heat authority; the UI never subtracts meters. Surface penalties before commitment.

**Acceptance.** Backwards/sideways/wrong-order/repeated crossings earn nothing; one eligible gain per
lap/stamp; equivalent fixed-step results across render rates; force caps and resource conservation
verified; racing assistance outside an active race is impossible unless explicitly equipped.

## RF-07 — A career worth returning to

**Outcome.** A small, replayable circuit progression complements mining/trade/combat without becoming
the easiest infinite credit faucet.

Introduce per-class cups, unlockable route variants, rival notes and cosmetic ship recognition via
existing progression/economy owners. Balance rewards against measured median time, risk, recovery
and existing jobs, not abstract “race difficulty.” Separate repeatable practice from first-clear
awards and clean-tier milestones. No UI-side wallet increments, duplicate payout on reload, or
persistent world unlock from a temporary circuit flight.

Retain safe main-menu quick play and in-sector campaign entry. Add a deliberate save-and-enter
route only through the existing save owner, with success acknowledgement before replacing a live
flight. Provide retry/next-course actions using the same arming and cleanup path, never `game:new`
as a hidden shortcut for every restart. Persist career records separately with explicit migration.

**Acceptance.** Double clicks, simultaneous accept, abandon/retry, save/load at the finish and disk
failure cannot duplicate rewards. A temporary heat never overwrites campaign slots or charts new
campaign sectors. The board explains class, cost, duration, reward and record category before launch.

## RF-08 — Accessibility and sustained quality

**Outcome.** The same racing feature is controllable, readable and bounded on keyboard, gamepad and
touch; its quality survives a whole session rather than one screenshot.

Bring the camera action into the existing gamepad/rebinding registry and glyph prompts. Add
one-handed touch layout options without creating a second keyboard listener or reserving swipe
territory over core flight. Keep 44px touch targets and verify landscape notch safe areas. Test
modal/text-entry fencing, held keys, focus restore, orientation change, joystick cancellation and
camera changes during touch. Reduced motion/flash, high contrast and audio-only checkpoint cues
must describe the same mission events.

Use source-owner unit/integration tests plus real asset-loaded browser runs. A component fixture
proves layout/control behavior, not the entire game. Measure actual GPU/CPU time, draw calls,
resident bytes, compilation stalls and frame-time tails with course assets on representative mobile
hardware and integrated graphics. Avoid global quality reduction as the primary optimization.
Gate rings/pace coaching currently require at most four draw objects; verify measured rendering
cost after the renderer's actual passes, shadows and clipping, not just scene-child count.

**Acceptance.** Twenty enter/abort/retry cycles leave stable listener/entity/GPU counts; context loss
and return-to-menu recover; 320px portrait and 844px landscape layouts remain reachable; no repeated
layout/SVG construction in per-frame loops; key/gamepad/touch routes match advertised controls.
Publish actual limits where a device misses the budget. Never substitute “unit tests passed” for
visual clarity, physical playability, or a completed deployment.

## Skeptical review lenses for every delivery

Review simulation/authority, failure/recovery, rendering/performance, input/accessibility and
player meaning separately. Each claim needs its own evidence and a counterexample fixture. Where
independent agent execution is available, use it; where it is not, explicitly call these review
passes rather than claiming an independent review. Close the delivery with a public-route result,
measured limits and exact remaining work in this program, not an instruction for the owner to fix it.
