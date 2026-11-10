# Rig Workshop candidate — verification record

## Exact source and scope

- Repository: `coldshalamov/SpaceFace`.
- Parent: `34310c836bf80216b869331c54b777c231a637ee` (`master` snapshot).
- Requested candidate ref: `codex/pro-experiences-rigWorkshop-20261023`.
- Supplied context archive SHA-256:
  `683a5d9511cc095e996fc7e807294f5ea50f875243f45902175911f38d256a9d`.
- `HANDOFF_CONTEXT.json` matched the repository and exact parent. All **13,292**
  included original tracked files matched their manifest SHA-256 on initial
  verification and again after implementation; none was changed or missing.
- Candidate paths are exclusively `src/features/rigWorkshop/**`,
  `src/data/encounters/8202-pro-rig-workshop.js`, and
  `test/pro-experiences-rigWorkshop.test.mjs`.
- Dependencies, exact-base omitted files fetched for checks, asset downloads,
  browser tools, fixture servers, and intermediate captures are not candidate
  files. Shared owner imports are deliberately reserved for local integration.

## Focused automated result

Run from the repository root with its installed dependencies:

```sh
node --test --test-isolation=none test/pro-experiences-rigWorkshop.test.mjs
```

Final candidate run on 2026-10-23: **32 tests passed, 0 failed, 0 skipped**,
approximately **8.83 seconds**. All twelve JavaScript/test modules in the
candidate also passed `node --check`. Timing is a check-run observation, not a
game performance budget or benchmark.

The harness uses the real `createSimulation`, SG-02 dynamic-body owner, combat
attachment service, economy, promptDeck routing, world residency methods, Three
scene resources, save seams, and production Flight V3. Native tests do not
substitute a toy solver or fake body/constraint admission.

| Experience or boundary | Exercised evidence |
| --- | --- |
| Discovery and decisions | Ordinary Adventure offer; refusal; bench approach; choices through prompt revisions; no second machine on reentry. |
| Assembly | All six part definitions; actual native compound bodies; open cradle mouth; free valid/invalid preview; stock only after admission; cancellation before/after pending commit; last-fit undo. |
| Native failure | Stale preview rejection; unavailable admission rollback; exactly one explanatory failure receipt; no phantom body or spent repair stock. |
| Ordinary ship controls | Production-order FlightV3, physics, combat, and tether gameplay with the authored starter definition; normal thrust, strafe, and braking haul and settle an owned 190-mass payload. |
| Useful powered machinery | Mover force through actual connected mass; cut power retains earned momentum; the pilot controls affect the native tow. |
| Physical limitation | Real native obstacle contacts deflect the machine; a real overload warns before a structural brace separates; original surviving bodies remain recoverable. |
| Needle Orchard | A modified cradle physically carries an original more than 1,000 WU; partial payment, modified-machine bonus, receipt replay refusal, and closing the remainder preserve earned credits. |
| Heavy work order | Both original 190/266-mass stores move through native constraints to the actual receiver; partial then full settlement; original IDs and once-only economy grants. |
| Capture and recapture | Collector capacity of two native restraints; release/failed restraint cannot invent carried distance; generic owned salvage is reachable through the ordinary field deck without a job. |
| Navigation | Marking remaining cargo follows a drifting original's current position; receiver and bench remain separate choices; blocked work sites refuse without bodies/payment or find a deterministic clear pocket. |
| Return and recovery | Existing world residency demotion/rematerialization keeps originals and avoids a second world-record owner; a bounded distant offer keeps recovery reachable. |
| Repair and loss | Repair surviving originals at their positions; failed reseating is free; destroyed roots retire once; survivor root promotion; complete-loss rebuilding via deck and native admission with undo. |
| Cold restore | Names, tokens, numerical IDs, damage, broken connections, paid receipts, semantic/native links, and stock survive; repeated restoration creates nothing. |
| ID remapping | Adopt ordinary-envelope remapped bodies by durable token; rebind parts/cargo/receipts/receiver custody; changed player IDs preserve ordinary cargo ownership and recapture. |
| Refused saves | Duplicate bodies, foreign recycled IDs, or invalid feature data fail before feature mutation; the save adapter throws to the existing rollback owner. |
| Save integration | Synchronous and chunked plan slots capture identical data; an undiscovered workshop has a valid absent-bench save. |
| UI lifecycle | Invalid choices are disabled, repeated answers are consumed once, a next synchronous page survives, changing edit preconditions cannot strand the deck, remounts do not duplicate events. |
| Worker/view lifecycle | Late mirrored prompt hydration, closed-revision suppression, new-game revision reuse, live feedback clock, floating-origin rebasing, and idempotent resource/listener teardown. |

### What the route drivers do

The two contract tests stage an **unloaded** rig at the pickup and place the
observer near the receiver as fixture setup. After capture, they move the real
frame using bounded native impulses and counter-torque. Cargo positions,
velocities, transported-distance ledgers, identity tokens, and reward records
are not rewritten to make delivery pass. The production FlightV3 test separately
proves the real ship/tow/mover control path with normal pilot inputs.

These complementary checks establish the physical and transactional contracts.
They are not a claim that a browser pilot has flown the complete Adventure route
from New Game through both work orders.

### Handling check used for tuning

A scratch probe used the production-order FlightV3, core physics, combat, and
tether gameplay owners, with the 35-mass starter ship and a 190-mass load. At
22% forward input for four seconds, mover assist increased loaded-rig speed
from approximately **14.7 to 18.8 WU/s**. Native structural anchor spread was
widened from 0.43 to 0.85 times the smaller part radius. In the same loaded
braking probe, cargo speed after fifteen seconds dropped from approximately
**10.2 to 3.1 WU/s** without breaking a seam. Native freedom, collision contacts,
stress, and overload separation remained active. No solver, pose, or velocity
override was introduced. These scenario observations informed the early-brake
cue; they are not universal stopping distances.

## Visual check actually performed

An isolated browser fixture loaded exact-base authored assets and metadata,
the production authored-place loader/factory, the existing promptDeck and its
actual stylesheet/typefaces, the feature's renderer, and a real native snapshot.
It used the unchanged default Adventure camera and actual runtime-produced
bench/parts/valid/blocked prompt payloads.

- The native snapshot contained the original player plus the bench and nine
  starter parts, with twenty-one active native structural constraints.
- **Ten of ten owned visible bodies** reached authored admission, with the
  original entity's presentation admission marked ready.
- **Zero** page errors, console warnings, or failed asset requests were reported
  in the final fixture.
- The bench, part menu, valid footprint, blocked footprint, and mobile part menu
  were captured and visually inspected.
- At **390 × 844**, all seven part-page choices were visible, without clipped
  choice labels or horizontal overflow.
- The first capture exposed a rig clipped below the normal camera. Moving both
  starter rigs to the far side of the bench made both assemblies visible at the
  same desktop camera. The maintenance gantry itself remained partially beyond
  the top edge at that particular approach position.

The fixture explicitly identified itself as isolated. It omitted the full-game
environment, player model, lighting/postprocessing stack, HUD competition, and
ordinary flight navigation. The visual observations establish authored asset
admission and the inspected UI/preview composition, not final production visual
acceptance or the player's subjective enjoyment.

## Concrete remaining acceptance limits

1. Apply the shared owner bindings in [README.md](./README.md), then run the
   actual worker/browser Adventure route. This scoped candidate intentionally
   does not edit those owners or their generated indexes.
2. Exercise actual Save/Continue and native warm-start continuation through the
   complete save envelope after those imports. The feature's cold restore,
   remapping, paid receipts, and save-plan parity are covered; the unintegrated
   complete browser envelope is not claimed as passed.
3. Judge final readability under production lighting, HUD competition, camera
   framing, and a player's approach to each work site. The mobile and desktop
   isolated fixture does not settle those judgments.
4. Measure frame time and worker/read-model cost in the full production scene.
   Bounds and cleanup are enforced and checked; a production performance capture
   was not run on this source-only environment.

No full-game acceptance, golden update, performance benchmark, or complete
browser-route pass is represented by the focused result above.
