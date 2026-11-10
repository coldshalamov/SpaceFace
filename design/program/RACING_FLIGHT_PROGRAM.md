<!-- LIFETIME: STABLE -->
# Racing flight: a complementary build program

## Product contract

The fantasy is **threading a heavy, fast ship through a place worth remembering**, then returning
to the same living universe. The chase camera is a reusable flight view; a circuit is one use of
it, not a fork of SpaceFace's flight engine. More content should compound on the existing three
terrains, authored contracts, mission driver, physics authority and camera owner.

This is an owner-requested program of complementary builds, not a second implementation queue.
`build_map.md` remains the front door. Claim exact paths in the existing work coordination system;
update the existing owners, do not create parallel save, input, physics, mission or camera stacks.
Instructions and current code take precedence over illustrative names below. Player feedback is
welcome, but no delivery waits for the owner to do an agent's verification work.

## Current delivery — 2026-10-11

The foundation from [PR #239](https://github.com/coldshalamov/SpaceFace/pull/239) is merged.
[PR #263](https://github.com/coldshalamov/SpaceFace/pull/263), which adds camera-leased mission
sections and station handoffs, remains OPEN as a separate cloud lane. Its work is not included here.
The original course/camera tranche is commit `9a2bc2e5f`; the synchronous save repair is
`5a632ddd2`. This continuation adds physical opponents, personal ghosts and a complete three-heat
cup loop, plus the first playable versions of the complementary pieces below.

The main-menu board now offers **Time trial**, **Pack race** and **Circuit cup**, three opponent
levels, the three starter hulls and Standard/Sprint/Endurance drives. Chase remains a reusable
player toggle outside races, with cursor aiming and selected-target AFT guidance. Course coaching
reads the actual fitted propulsion profile and leaves steering to the player.

- **Physical opponents:** Mira Vale, Rook Six and Sable Reed rotate between the three courses.
  They fly real hulls through the ordinary tactical-AI / flightV3 / Rapier path, brake for corners,
  take bounded passing lines, recover missed gates physically, and finish or retire. The instrument
  and results show actual order and times. Solo time trials remain available.
- **Compatible personal ghosts:** clean best runs record authoritative poses and gate stamps;
  playback clones the authored hull with private translucent materials and never creates a sim
  body. Real split deltas replace estimated pace when a compatible replay exists. Course, route,
  laps, hull, fit, physics/tuning and pack difficulty separate comparisons. Recovery, discontinuity
  or refitting excludes a run. Storage is bounded to eight tapes / 1 MiB; show, export and delete
  controls are on the board. Older fit categories remain stored but do not compete with fit5 (draft tuning v3-3).
- **A replayable cup:** three ordered heats, fixed hull and difficulty, drive changes between
  heats, 6/3/1 points and local medals. Completed heats survive reload; an interrupted heat restarts
  with a fresh receipt identity. Rival meeting history survives alongside honors. Repeated or stale
  completion receipts cannot score twice. These local records do not award campaign money.
- **Save recovery:** a full browser store can synchronously compress valid old plaintext primaries
  without deleting another slot. The previous valid gzip save rotates to recovery; corrupt gzip
  cannot evict a good backup. Ordinary Save → reload → Continue passes, including unload saving.
  Temporary circuits remain unable to overwrite campaign saves.
- **Adventure extension:** the existing three speed jobs are joined by **The Cold Chain** (real
  sealed medical cargo, cover cooling and quality loss), **Lifeline Through the Queue** (a physical
  Massline rescue with pod-scored gates and a slow handoff), and **Run Quiet, Run Deep** (noise
  exposure and a real armed listening hunter). These use station boards and existing mission,
  cargo, AI, physics, reward and save owners. They do not turn adventure into temporary quick play.

### Twelve complementary pieces: delivered scope

Each row has a reachable implementation in the existing mode. The larger RF briefs below retain
future depth explicitly; this table does not claim all their aspirational variants are complete.

| Piece | Playable implementation | Main source owners |
|---|---|---|
| Personal ghost | Compatible clean-best hull replay, actual gate splits, bounded local storage, export/delete. Courier-memory reuse remains future content. | `racingGhosts.js`, `racingGhostView.js` |
| Massline apex anchors | Two marked, physical, attachable anchor bodies per quick-play course; normal rope physics earns the swing. HUD selection uses the existing world-selection owner. | `racingSetPieces.js`, `racingHud.js` |
| Precision charge chain | Narrow, aligned, sufficiently fast crossings build a small capped boost-energy refund; missed windows break the chain. Flight owns the resource change. | `racingPrecision.js`, `flightV3.js` |
| Customs shutter | A physics-controlled Tethys cargo shutter closes on a schedule. A marked 96-WU service lane remains open; warning, closure and reopening cues share its clock. | `data/racingSetPieces.js`, `missions/racingSetPieces.js` |
| Thermal shelter delivery | Eight sealed medical packs warm in exposure/burn and cool behind real cover; excess heat spoils that load and scales its once-only payout. | `adventureSpeedRuntime.js`, `adventureSpeedSetPieces.js` |
| Rivals with habits | Three named hulls with different line/braking preferences, three difficulty profiles, physical recovery, finish/DNF and durable meeting notes. | `racingDriver.js`, `racingOpponents.js`, `racingCareer.js` |
| Rescue tow extraction | Tow the real evacuation pod through six gates using the actual Massline, then slow both bodies below 65 WU/s. Save/load adopts the same pod and remapped native joint. | `adventureSpeedSetPieces.js`, `adventureSpeedRuntime.js` |
| Listening pursuer | Nearby boost, travel burn and gunfire raise exposure; full exposure releases a real armed Corsair through tactical AI. Quiet distance loses the search; destruction stays resolved. | `adventureSpeedSetPieces.js`, `adventureSpeedRuntime.js` |
| Workfleet crossing | A scheduled physical Mule crosses Textile's straight after a warning. A marked refuge lets the pilot wait; actors use normal flight and collision. Ambient-world scheduling remains future depth. | `missions/racingSetPieces.js` |
| Breakout debris wave | Three real Veil fragments receive a single bounded impulse after a warning; gaps and refuge stay usable. Bodies persist until heat cleanup, including when tethered. | `missions/racingSetPieces.js` |
| Pit-fit decisions | Drive selection between cup heats, with fixed hull/difficulty and separate fitted record categories. RCS pit tuning is not yet offered. | `raceBoard.js`, `racingCareer.js`, `racingSteer.js` |
| Local cups and recognition | Ordered cup progression, reload continuation, medals and head-to-head history, visible on the circuit board from the menu or adventure. Completed cups unlock Copper Current, Glacier Line and Solar Crown paint through the normal ship appearance owner. Station-dialogue reactions remain future content. | `racingCareer.js`, `racingRecognition.js` |

### Direct verification and remaining limits

- Ordinary public launch, Save, reload and Continue: **16/16 passed**. Browser and Electron public
  circuit launches: **12/12 passed**; the latest browser route also observes both rendered moving
  rivals and both physical anchors. No uncaught exceptions, shader failures or missing assets.
- Native Rapier tests run the production AI → flight → physics → mission order. Packs complete all
  three authored terrain courses; a forced missed-gate impulse recovers without teleporting.
  Moving crossing/debris fixtures preserve the advertised refuge and full-pack completion. The
  Tethys shutter test finishes all three rivals in 64.918 / 76.319 / 88.172 seconds with zero
  contacts or recoveries, including passage during closure; the real shutter moves 63.814 WU.
- Focused checks cover gzip quota/recovery, ghost storage/render disposal and actual mission
  lifecycle, precision ownership, cup receipt/reload handling, launch cleanup, sealed cargo and
  native Massline save/load. The component control walk covers format/hull/drive/difficulty,
  keyboard fencing, recovery/results, ghost export/delete and mobile overflow. These checks are
  distinct from a full human-played campaign or sustained device-performance acceptance.
- **D182 resolved:** Ceres passes its unchanged topology expectation. Both simulation expectations
  were deliberately migrated after historical source reproduced the old pins and isolated shipped
  content/save changes and the intentional native contact/separation fix. Committed source
  `5214f5f38` reproduces both new hashes independently of concurrent dirty work. Five-run/reload
  gates pass without loosening any invariant or input tape. The full run passed **15/16**; its
  remaining VFX inventory mismatch was then repaired after the concurrent Gyre rewrite landed,
  and the focused VFX check passes (**D183 resolved**).
  Its 163-second wall time also exceeds the existing 90-second runner budget on this shared host;
  the budget is unchanged, and this is not a device-performance measurement.
- Remaining RF depth includes wider heavy-hull camera/handling coverage, route unlocks, richer
  adventure handoffs, cosmetic preview/station reactions and measured mobile/GPU budgets. No claim
  of finished RF-01–RF-08 or whole-game certification follows from this delivery.

### Drafting, earned paint and bounded work — continuation

- **Physical drafting:** only live racing entrants can lead a wake. Matched forward velocity,
  heading, a safe longitudinal gap, tapered lateral envelope and clear physical sightline qualify.
  The gain builds over 0.65 seconds, cannot stack, and stops for braking, reverse, obstructions,
  finish or departure. NPC counterthrust cancels the gain as well as player braking. Ghosts never
  participate. The normal physics port applies the same bounded propulsion rule to player and NPC.
  Thin, static-color wake rails show the same envelope; the flight instrument names the leader and
  strength. The old scripted beacon is explicitly a pace light and no longer applies artificial speed
  pulses. Time trials remain draft-free.
- **Earned paint:** completed cups unlock three finishes at 3/9/15 points at any opponent level.
  Selection survives reload, fails safely on unavailable storage, and is validated again before
  fitting. Temporary craft receive paint before visual admission. The board can apply earned paint
  to an adventure ship through the ordinary appearance event; saving remains the save owner's job.
  Paint changes no handling stats. New fit5/tuning-v3-3 records cannot compete with old draft-free
  records or ghosts.
- **Performance:** physics and gate arbitration retain 60 Hz. Standings publish at 10 Hz and on
  terminal changes, rival previous poses and set-piece cue arrays are reused, and course markers
  upload only when their local geometry changes. Moving Massline anchors keep their marker attached.
  The wake renderer has one fixed line/color buffer, updates at simulation cadence, and disposes
  all owned resources. A 144-render-frame fixture produces zero extra stationary-marker uploads;
  same-tick wake renders produce zero extra uploads. These are structural reductions, not an FPS claim.
- **Direct checks:** native drafting gives 181.50 WU/s against an otherwise identical 160 WU/s
  control after two seconds, earning 22.07 WU without contact; the leader keeps its momentum.
  Geometry, brake/reverse, occlusion, duplicate-tick, storage/unlock, renderer reuse/disposal and
  UI-control checks pass. All three native course packs with active drafting finish with zero contacts or recoveries,
  including the closed Tethys shutter and returning Veil fragments. The Veil times are
  76.72/90.36/109.11 seconds. The real browser circuit route passes
  13/13 including selected earned paint, rendered moving rivals and save isolation; local cup
  receipts were seeded for this paint check, so it is not a claim of a human-completed cup. A final
  ordinary public circuit launch passes 12/12 and confirms zero tutorial actors, no tutorial
  waypoint and inactive Adventure onboarding. Temporary circuits now suppress that rail without
  changing tutorial preferences; the focused return-to-Adventure scene tests pass 11/11.


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

The first versions of RF-04 and RF-05 now ship together with the course, mission and cup work
above. Continue the remaining depth from those live owners; do not restart an implemented packet.
RF-08 remains continuous work, with device performance measured by the dedicated quiet-host lane.

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
