# 10 — Reference encounters and integrated acceptance

**Outcome:** a small reproducible suite demonstrates that the combat is understandable, controllable, physical, satisfying, and performant through the same routes ordinary players use. Planning only. CEC identifiers are local scenario labels, not new global queue IDs. Evidence: E13 and all relevant source owners.

## Use the real game

Reuse the existing combat lab, scenario schema/runner, input tape, normal Adventure/Swarm launch routes, and current visual/performance tools. Creator's Dock documents what its dialect actually accepts. In particular, it does not currently accept an arbitrary force-field object as a lab spawn. Drive a real power through supported input or extend the existing adapter narrowly with validation; never silently omit unsupported setup fields or replace the game with a custom demo simulation.

A synthetic lab proves a bounded mechanic. It does not prove acquisition, default bindings, live HUD reachability, ordinary world placement, saves, or player discovery. Every important claim therefore has a focused fixture and at least one normal-player route. Specify the actual backend and feature flags; a Node route with fields disabled cannot validate a field interaction by accident.

## CEC-A — The kit workshop

**Question:** can a player discover and use the tools they actually possess?

Start from an ordinary current profile, then a documented equipped profile for later tools. Through actual armory/help and flight controls, identify Pull, Shove, Pin, the selected bomb, current Rig mode, Gyre, fitted cloak, and the primary weapon. Explain unavailable or retired/mode-specific equipment honestly. A developer-injected item is acceptable for a bounded mechanic test, not as evidence of acquisition.

Exercise remapping, explicit unbinding, mouse/trackpad, gamepad/touch equivalents where supported, hold-preview cancellation, modal interruptions, and depleted/empty states. Ask the tester to predict the next button result before using it. Watch whether glyphs remain distinct at normal size and whether contextual tool changes are visible before action.

Evidence: capability-to-route matrix, actual UI captures, input/event trace, successful use and specific denials. Failure examples: beautiful icons hidden in the wrong screen, an unbound action shown with a phantom key, or a sticky charge thrown when the UI promises a different bomb.

## CEC-B — The contact and flight range

**Question:** can the player read living contacts and target intentionally while enemies move coherently?

Use a player, neutral worker, useful debris, pack strikers, a lance unit, and a heavier role chosen from the actual catalog. Begin with isolated contacts, then combine them. Test manual aim beside a selected target, assisted aim, explicit target cycling/release, a tethered hostile while another is selected, a tethered neutral/rock, cover, and target concealment/removal.

Run a leader/follower route with sustained straight travel, acceleration, turn, narrow gap, external impulse, leader loss, and regroup. A follower entering its radius once does not pass. Record sustained position/velocity error, phase churn, command saturation, and unwanted contacts.

Show shield/armor/hull hit differences, living concussion and recovery, genuine disable, fatal smoke/failure/rupture, and wreck aftermath. Repeat in bright and dark moods at the normal camera. Ask which hull is selected, which hull the guns actually address, which enemy attacks next, and which object is still alive.

Evidence: synchronized motion and authoritative trace, target-identity assertions, sustained control metrics, and image/recognition review. A still screenshot cannot certify motion or aiming.

## CEC-C — The debris forge

**Question:** does manipulation produce a readable and useful physical result?

Provide eligible loose material, a heavier borderline object, protected cargo, an anchored structure, and enemies positioned so a throw can matter. Use the actual Pull well and Gyre input route. Gather, show growing mass, refuse or only influence protected/ineligible bodies for the correct reason, aim, release, and observe collision/torque/destruction.

Validate passive aggregate accounting, active launch impulse, inherited motion, contact attribution, protected contents, and useful aftermath. Add the deployed gather-and-launch variant only through its completed production owner; label the baseline and extension separately. Test two tools contesting a body, capacity, charge depletion, cancellation, death while holding, and Continue.

Evidence: input-to-core-to-impact trace, mass/member/loot ledger before and after, normal-camera video, and downstream physical outcome. Fail if matter disappears into a visual ball without correct mass, launches from the wrong location, or pays twice as salvage and absorbed material.

## CEC-D — The broken gate

**Question:** does the paired shield create comprehensible, fair tactical geometry?

Place endpoint A, preview B, reject an invalid span, form a valid pair, and route both friendly and hostile actors through it. Exercise every permission row from 06 in both directions. Include a fast projectile, beam, blast, electrical hop, neutral debris, owned controlled payload, multiple overlapping panels, endpoint motion, heavy impact, and low-charge failure.

Observe enemies responding by flanking, attacking a known endpoint, or coherently regrouping—not milling against an invisible wall. Test occupied-span linking, pair capacity/replacement, endpoint loss, relationship changes, entity reuse, and restoration. Integrate the pair into an actual fight rather than only spawning test bullets at a static segment.

Evidence: contact/energy transaction trace, permission matrix results, actual rendered footprint, AI route response, and lifecycle checks. A line that looks right but only blocks one of the production attack paths fails.

## CEC-E — The silent vault

**Question:** can the player read attention, bypass a superior opponent, steal something valuable, and escape without killing it?

Use the actual cloak module and energy behavior, readable patrol/guard geometry, a separate cache/cargo object, recharge/observation opportunities, and a meaningful exit. First prove a no-kill route. Then prove a surgical disable route and a noisy recovery route. Failure may produce pursuit, dropped loot, or partial success; it must not always force the same boss fight.

Demonstrate unaware, suspicion, investigation, confirmed notice, lost contact/search, and disengagement. A second observer, delayed alarm report, scanner sweep, fired missile, revealing action, and neutral witness each test a distinct rule. The player should be able to explain why they were noticed without receiving hidden-enemy coordinates.

Test hidden-only, rear-only, and hidden-plus-rear action requirements. Include an opener miss, a turning target, multiple projectiles sharing one entitlement, a repeated cloak toggle, and invalid target lifetime. Save/Continue during search and after taking loot must not refill the cache, reset durable alarm consequences, or grant an unadvertised free opener.

Evidence: per-observer knowledge trace, eligibility/commit/hit ordering, cargo/reward custody, completed extraction, and human explanation. Legal wanted heat is checked separately from suspicion.

## CEC-F — The salvage swarm yard

**Question:** do all these systems make one good fight rather than several unrelated demonstrations?

Compose a meaningful environment from the existing world/arena language: loose ammunition, a brittle obstruction, valuable cargo, a useful shield position with counterplay, multiple recognizable enemy roles, and clear approach/escape lanes. Use the actual ordinary kit and plausible upgrades. Mix coordinated approach, readable high-consequence attacks, displacement, gathering, launch, shield interception, disabled survivors, and cascading destruction.

Record the physical story: what the player intended, which objects moved, which enemies lost control or died, which explosion caused a secondary event, and what useful material remains. A reviewer should reconstruct the central causal sequence from normal-speed footage without the developer narrating every event.

Increase density and overlapping events through a documented sweep. Retain the existing default quality and gameplay rules. Compare the whole-frame distribution, simulation progress, input latency, target stability, and useful recognition at typical and stress loads. Check first-use hitches and repeated-run memory cleanup.

Demonstrate relevant Adventure and Swarm route parity without assuming their progression/reward policies are identical. The same physical rule should not behave differently merely because a private lab called another API.

## Evidence ladder

1. **Pure/contract tests:** eligibility, geometry, lineage budgets, aliases, permission rules, and deterministic ordering.
2. **Real simulation fixtures:** actual physics, action, perception, damage, and lifecycle owners with recorded inputs and temporal assertions.
3. **Integrated route tests:** normal acquisition/equipment/UI/input/launch/save paths; no fabricated success events.
4. **Motion and perceptual review:** normal camera, actual display scale, live event overlap, and accessible variants.
5. **Target-hardware performance:** matched default-quality whole-game runs through the current quiet-host/profiler workflow.
6. **Owner/player acceptance:** users recognize the state, can choose the intervention, and enjoy the resulting control and consequence.

Keep these labels separate. A pass at one level does not imply the next. A clip's existence is not a visual pass; a successful screenshot command is not a gameplay pass.

## What to measure

For readability, measure wrong target identification, mistaken alive/dead classification, missed attack preparation, cause-recognition errors, and time to find a desired equipped action. A prototype goal such as recognizing the selected threat within roughly one second is a tuning hypothesis, not a universal perceptual standard. Use small tests diagnostically and state the sample size; do not claim statistical certainty from a handful of familiar testers.

For control, measure sustained errors, target/phase switching, uncommanded movement, input latency, and recovery after disruption. For physics, assert accepted transaction identity, passive mass/momentum consistency within the backend's justified numerical tolerances, actual contact, and no duplicated reward/custody. Active fields and launch energy are accounted separately.

For performance, use 09 and the current repository budgets. For persistence, zero tolerated duplicate loot, orphan colliders, stale entity references, or regenerated killed actors contrary to the world policy. For accessibility, retain essential geometry/state/controls under reduced motion, reduced flash, color-independent identification, and supported input devices.

Exact bitwise cross-platform floating-point identity is not assumed. Use the repository's supported determinism and replay contract, same-environment repeats, and semantic invariant checks where appropriate.

## Review record

Each result names baseline and candidate commits, scenario/seed, input tape or human route, mode/backend/flags, hardware/browser/resolution/settings, commands actually run, output locations, observed result, and remaining failures. Attach side-by-side or interleaved motion evidence when judging a visual change. Explicitly separate lab-only proof, normal-route proof, and untested hardware.

The integrator may accept a bounded improvement while keeping other packets open, but cannot mark this program complete until every owner requirement in README has corresponding ordinary-player evidence. No checks or player routes were executed by this planning PR.
