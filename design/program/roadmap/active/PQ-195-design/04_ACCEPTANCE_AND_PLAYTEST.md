# BREAKAWAY — acceptance, experiments and rejection gates

## 1. What this packet has already proved

The delivered test suite exercises mechanics, receipt gates and a real Rapier world. The laboratory demonstrates the same receiver code using the actual authored meshes. Read `qa/STATUS.md` and machine outputs for the final counts and results.

The provided headless browser cannot create a WebGL context. The laboratory’s explicit CPU preview renders the actual GLB triangles while **Rapier still runs the physical simulation**. This is useful shape/UI/interaction evidence, not WebGL shading approval, performance evidence for the user’s machine, or a live SpaceFace run. The source-only archive omits the game’s heavyweight release assets. No amount of green lab tests closes those missing production gates.

## 2. Mechanical acceptance

| Test | Required observation | Reject |
|---|---|---|
| Clean entry | A real 80 WU/s body crosses the mouth, slows under bounded force and reaches stable custody | Transform teleport; body deletion on first touch |
| Slow entry | A 1 WU/s body is allowed fully inside and eventually settles | Braking it to rest outside the settle region |
| Overspeed | 155 WU/s is refused; real colliders continue deciding motion | Accepting it because a frame skipped through a sensor |
| Side and rear | No acquisition from either direction | Any overlapping body counts as delivery |
| Correct geometry | Radius/extent fits between visible inner rail faces | Center-only test captures a visibly clipping object |
| Tether withdrawal | Pulling an acquired body out cancels capture, no payout | Historical contact remains valid custody |
| Destruction | A body killed before commit cannot be delivered | Invisible body is removed and still pays |
| Spin | Excess spin must settle under bounded torque | Rotation forced to zero by the UI/render system |
| Fixed tick | 21 consecutive stable physics samples required | Display FPS changes dwell or duplicated callbacks complete early |
| Pause/focus | Simulation and capture dwell stop together | A tab left hidden finishes the encounter |
| Transport release | Removing a joint preserves actual current body motion | Double inherited velocity or a hidden speed cap |
| Replay | Same inputs/configuration reproduce supported deterministic results | Wall-clock/RNG calls in new authoritative paths |

The supplied mathematical/property tests include 500 deterministic samples checking dissipative bounds. Their pass is evidence for those laws, not for every conceivable integration or hardware.

## 3. Custody and economy acceptance

Run the included real-source fault probe before and after the repair. The current pinned characterization intentionally records an unsafe result. On the repaired production source, both injected refusals must leave mission completion false and produce no delivery reward.

Test fresh commit, idempotent replay, wrong receipt, wrong stable body, wrong receiver, duplicate event, missing owner, refused preparation, failed commit, and an `already_committed` reply without durable corroboration. No receiver body may be consumed twice. A failed handoff leaves the body physical or enters a truthful recovery state; it does not quietly turn into a success.

Force a reentrant callback that moves or destroys the load between preparation and commit. Fresh validation must refuse it. Also test one that calls settlement recursively after commit. The existing effect journal must allow exactly one physical consumption, one reward, one faction outcome and one local consequence.

Exercise a prepared delivery that becomes permanently impossible. The new bounded abort/withdraw path must either return the still-live obligation to play before irreversible effects, or recover forward from a committed receipt. It cannot leave the mission indefinitely prepared or rewind existing legal consequences.

Do not test only the standalone gate. Import the actual modified mission/facility owners and demonstrate the call ordering that previously failed.

## 4. Save/load matrix

Use the ordinary game save/export/import route at these points: before launch; during free flight; while tethered; during braking; one tick before stable; ready but not prepared; prepared; physical commit before payout; after payout; after consequence; after destruction with recovery available. Include sector exit and a fresh game process.

At each point assert stable identity, no duplicate body, preserved pose and actual velocity where applicable, preserved original owner and legal status, no fabricated completion, and eventual resolution. An active line must restore through its owner or be cleanly detached according to an explicit existing policy without changing cargo custody.

Reapply the same delivery/recovery receipt after each restore and prove no duplicate credits or manufactured cargo. A changed receiver transform may reset dwell; it may not erase the load or grant success. Migrating old Capsule Run saves must retain their prior intended behavior.

## 5. Player-route and content gates

The first release is accessible from an ordinary existing station/mission/encounter path with normal assets and default configuration. A query flag, lab button, console-spawn command or injected save can aid engineering; none is the sole acceptance route.

Complete the authored encounter in at least three distinct ways: protect/recover and lawfully deliver; take the cargo through a physical improvisation and deliver to the fence under the normal law rules; fail the intact-delivery route and complete the bounded reduced recovery. Also let the event run without player intervention and verify that the original actors still have understandable purposes.

At least one successful run should use the assembly as an improvised weapon without destroying its economic usefulness. At least one should deliver carefully without requiring combat perfection. These are independent capabilities, not a mandatory combo sequence.

Show the local industrial consequence in the world: the receiver has the assembly, a stopped operation restarts or remains stopped, and another actor behaves accordingly. A journal toast alone does not close this gate. Do not simulate a complete new manufacturing economy merely to stage one visible repair.

## 6. Human playtest, kept small and honest

Begin with six to eight fresh participants across two relevant backgrounds: action/physics players and space-sandbox players. That is a formative sample for discovering failures, not a statistically representative study or a reliable retention estimate. Do not teach the solution before observing the first attempt.

Ask after the initial encounter: “What is the load for?”, “Why did the receiver accept/refuse it?”, “Who owns it now?”, “What would you try differently next time?” Record errors and spontaneous ideas before describing your design intentions.

The first gate is comprehension. Most participants should identify the usable load and entrance unaided, explain a failed approach correctly, and understand the difference between a line attached and a delivery committed. Investigate each confusion instead of hiding it behind an aggregate score.

The second gate is agency. Observe whether players deliberately reposition the load, change a plan after a mistake, and discover at least one use beyond straight towing. A spectacular outcome caused entirely by a director script does not count as player-authored agency.

The third gate is motivation. Offer a natural stopping point. Ask what concrete experiment, destination or capability they would pursue next. “I want to try swinging that through the escort” is useful evidence. A long session caused by inability to finish is not evidence of fun.

Only after formative issues are resolved, compare matched old/new encounters. Counterbalance order for experienced players, use fresh participants for onboarding, and keep population/reward/time budgets comparable. Record confidence and uncertainty. Do not declare a percentage improvement from six people.

## 7. Performance acceptance

Measure matched default-route scenes on the user’s target integrated-GPU machine and the supported desktop runtime. Report frame-time distributions, worst hitches, simulation time, draw calls, triangles, body/joint counts, allocations/GC, and startup first-use behavior. Name hardware, resolution, settings, seed and candidate commit.

Candidate budget: one physical load; fork geometry preferably owned by existing station presentation; at most four actor roles; bounded particles and one audio loop. The exact incremental frame-time allowance is determined from the current performance envelope. Do not invent a universal millisecond budget without a baseline.

No regression may be disguised by hiding ambient traffic, reducing default effects, turning down unrelated art or shrinking draw distance. Test the first instance and repeated instances: first-use shader/asset cost and long-session leaks are different risks. Repeatedly enter/leave/abort/save/restore and check that listener, body, joint, audio and GPU resource counts return to expected values.

## 8. Visual and accessibility gates

Inspect default-camera stills of real gameplay, not just the lab. Validate the field-hardware surface against current approved PQ-194 assets, not a historical screenshot from this packet. A large new HUD card is a rejection unless the existing layout authority explicitly places it.

Threat, load, line and receiver must remain distinguishable without relying on hue. Reduced-flash/motion settings preserve the mechanical information. Current remapped keys appear in instructions; the lab’s B/Space/WASD examples are not production bindings. Test pointer, keyboard and supported controller input, text scale and focus changes.

The narrow lab layout only proves that its page does not overflow; it does not establish gamepad, touch or mobile game acceptance.

## 9. Review and finish without another planning loop

One integrator owns shared seams. Mechanics, art and content agents may work in disjoint paths once the ownership map is confirmed. Each returns implemented code/assets and the named proof, not a newly expanded master plan.

A reviewer rejects concrete failures and names the smallest corrective change. Repair a reproduced issue or state that an experiment falsified the hypothesis; do not endlessly tune against an unchanging imagined defect. Save completed, scoped work at each vertical slice. Finish with commit/PR evidence when working in the repo, and explicitly distinguish implemented, integrated, route-proven and player-accepted.

Passing every automated test while the ordinary encounter is unreachable is **not done**. Conversely, an attractive screenshot without physical/custody/save correctness is also **not done**. The feature needs both.
