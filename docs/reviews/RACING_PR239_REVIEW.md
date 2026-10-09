# PR 239: racing refinement review

## Review scope

Extend the existing `feat/racing-steer-mode` implementation, preserving its three terrains, five
contracts, mission/economy ownership and the existing flight kernel. No separate physics engine,
replacement campaign save format, online competition or pretend AI rival is introduced.

The review used separate code/authority, geometry/scoring, lifecycle/save, presentation and input
passes. No independent subagents were available; these are review passes, not a claim of a second
agent's independent approval.

## Findings and repairs

| Finding in the initial PR | Repair | Evidence target |
|---|---|---|
| Behind-ship view required settings/HUD access; no keyboard trigger | Existing UI router owns backslash, with modal/text/repeat fencing; touch gets a reachable View control | UI probe + policy tests |
| Camera switched directly, followed biased overhead focus, bypassed roof protection | Hull-anchored polar transition; shortest-arc yaw damping; shared clearance in both views; phase-scoped preference-preserving camera loan | Real chase-owner tests + pure transition tests |
| Flat race markers were difficult to interpret from the low view | Instanced vertical apertures, next gate, route line, same-sampler visible pace beacon | Three geometry/lifecycle tests |
| Reset positioned behind the next uncleared gate, bypassing most of a leg | Return behind last cleared gate; clock retained; recovery attempts do not set clean bests | Geometry and real mission-driver tests |
| Named circuits ended at an arbitrary last point and omitted the closing leg | Explicit aligned start/finish return; length/reference clock and multi-lap objective units agree | Every-course closure + three-lap completion tests |
| Plane crossing used loose endpoint tests and handled only one gate per tick | Exact swept-plane intersection, ordered multi-gate advancement, fractional timestamps, pre-green rejection | Counterexample geometry tests |
| Boost ring could be triggered by proximity and lacked per-lap scoring provenance | Ordered crossing stamp; one eligible pulse per lap | Repeated/proximity/backwards tests |
| Best times mixed different contracts and lap counts | Versioned clean-record key includes course revision, contract and laps; hostile/invalid storage rejected | Storage, version and recovery tests |
| Off-course was distance from the next gate, and delta compared current time with whole-race time | Segment-distance warning; distance-weighted reference pace clearly labelled as an estimate | Long-straight and midpoint tests |
| Fresh racing flights could autosave over a campaign | Lifetime temporary-flight guard in the save owner, covering direct/manual/mission/interval/exit writes | Real save-owner event-path tests |
| Duplicate arming / failed relocation could leave overlapping or stranded contracts | Preflight checks, single active race, mission-owned cleanup on grid failure | Launch acceptance/failure tests |
| Dead or out-of-sector pilots could retain an authored race | Dispatch authored cleanup before legacy early returns; abort/dock/jump use mission owner | Public dispatcher + failure tests |
| Countdown input could be reintroduced downstream by assistance/draw-flight | Final grid fence before propulsion kernel, no boost/travel debit or pursuit impulse | Real flight-owner physics-command test |
| Touch steering depended on world heading while camera yaw followed the ship | Chase-specific vehicle axes, forward-only boost, braking and cleared gesture ownership | Existing mobile suite + new chase-axis tests |
| Reopened board could display stale records/results | Cached screen refresh lifecycle; last result/lap times shown on reopening | Component UI re-entry test |

## Verification and limits

The focused local suite covers the original six racing tests plus new regression tests and existing
mobile/temporary-mode/exit-save behavior. The checked-in commands below reproduce the scopes;
GitHub Actions output is the authority for the exact revision's result.

```sh
node --test test/racingMode.test.js test/racing-refinement.test.mjs \
  test/mobile-flight.test.mjs test/crucible-contamination.test.mjs \
  test/pro-06-exit-to-menu-autosave.test.mjs
node --test test/racing-render.test.mjs test/camera-glide.test.mjs \
  test/camera-glide-integration.test.mjs test/chase-lookat-retain.test.mjs
node test/racing-ui-probe.mjs
```

The UI probe loads actual UI source into an isolated component page, exercises keyboard/text/modal
fencing, mission locks, recovery, result re-entry and guarded fresh launch, and emits screenshots.
It does not open a player save. The Three tests exercise the real chase owner and course-view
geometry/lifetime, without claiming an asset-loaded game or target-device GPU performance.

Still requiring the complementary program's actual builds and asset-loaded evidence: feasibility
of every course with every hull, collision-free authored terrain corridors, integrated adventure
mission choreography, real rival AI, replay ghosts, calibrated competitive categories, full mobile
performance and prolonged whole-game play. The current pace object is explicitly a coaching
beacon. Reference pace is an estimate, not a ghost. Clean local records do not yet separate hulls
or loadouts. A green unit suite does not make these claims true.

## Complementary program

`build_map.md` routes to [RACING_FLIGHT_PROGRAM.md](../../design/program/RACING_FLIGHT_PROGRAM.md),
with eight finite packets, concrete file ownership, dependency order, counterexamples and measured
acceptance. [RACING_MODE.md](../RACING_MODE.md) documents current controls and save semantics.
