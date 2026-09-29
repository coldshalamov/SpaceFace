# Quality bar: observable promises and adversarial counterexamples

The bar is a coherent experience, not the average of twelve scores. Severe corruption, bad controls or unreadable combat cannot be compensated by a beautiful station menu. Existing technical and Feel Contract targets remain authoritative. Proposed targets below are starting acceptance criteria, not measurements from this audit.

| Axis | Required player outcome | How to test it | Failure that a green unit test can miss |
|---|---|---|---|
| Control | Deliberate intent becomes motion without lost actions or hidden auto-brakes | Trackpad + keyboard, current G mode, brake/rig/bomb sequences, device/focus transitions | Individually correct bindings require impossible simultaneous gestures |
| Physical trust | Mass, momentum, contact and capability behave consistently | Light/light, light/heavy, dynamic/scripted, moving/static, high-speed and overlap cases | Gorgeous throw animation acts on a body the solver never moves |
| Combat agency | Guns and physics create useful, readable choices | Same encounter played gun-first, rig-first and escape-first | Every alternative secretly requires the same overpowered combo |
| Challenge | Difficulty comes from geometry, roles, timing and competing duties | Varied cohorts and counterplay with finite recovery windows | Health inflation or repeated control denial creates boredom, not depth |
| Mission craft | A contract poses a distinct physical question and can survive improvisation | Alternate solutions, late arrival, missed actions and fail-forward routes | Completion listens to a toast/proximity rather than the actual objective |
| Progression | An upgrade produces something newly useful | Earn, buy, fit, depart, demonstrate and compare | Catalog stats change while the selected live ship does not |
| Economy | Prices, custody and costs are comprehensible and conservative | Trace a lot across extraction, spill, transfer, sale and cancellation | Double refund or custody loss turns a story into an exploit |
| World | NPC work and consequences continue coherently | Interrupt a work cycle, leave, save, return, resolve | A district looks busy but every actor simply orbits |
| Narrative | Important facts are discovered through action and remain consistent | Multiple visit orders, missing optional evidence, replayed chapters | Higher knowledge changes physical truth or an optional clue softlocks the ending |
| Visual craft | Shapes, materials, forces and attention belong to one game | Actual shipping camera, dense moving scene, bloom on/off and varied lighting | A beauty shot hides hollow backs, screen-sized halos or detached nozzles |
| Audio | Weight, danger, state and silence are legible | Loudness-matched comparisons, full mix, interrupted loops and captions | A correct event plays the wrong or inaudible sound |
| Interface | Essential actions are clear, responsive and reachable | Ordinary action walks, large text, focus, controller, reduce motion | Pretty screen contains dead controls or wrong business predicates |
| Runtime | Full-quality frames and resources remain predictable | Cold/warm, dense/quiet, travel/load/refit cycles, declared host load | Average FPS hides one-second first-use freezes |
| Reliability | Progress and control survive ordinary interruptions | Save at seams, errors, focus/device loss, old fixtures and shell parity | One stale async callback replaces a newer run |
| Finish | The retained whole has no unexplained prototype seams | Complete new-player and returning-player sessions | Every packet says DONE, but boot-to-dock still feels unfinished |

## Minimum evidence package per changed experience

Use the current repo's relevant checks plus a short current ordinary-route reproduction. For visible work, inspect actual rendered motion/states; for sound, listen; for physics, inspect trajectories and authority; for persistence, round-trip the consequential state. An independent reviewer checks the result, not only the report. Store only useful compact integration evidence in the repository according to current policy; large temporary captures/profiles belong in scratch.

## Proposed player tests

A first-time tester should be able to identify their ship, the next threat and an available exit in the chosen dense scene. They should discover one meaningful action without coaching, explain why a selected upgrade helps, and recover from an ordinary mistake. Record misunderstandings and observed behavior, not “fun = 8/10” as the sole output. A small sample is diagnostic, not statistically representative evidence of market appeal.

When a target conflicts with the actual user-approved game—such as current speed-normalized camera bars—amend the stale target in its existing authority with a causal rationale. Never quietly weaken a test solely to make a change pass.
