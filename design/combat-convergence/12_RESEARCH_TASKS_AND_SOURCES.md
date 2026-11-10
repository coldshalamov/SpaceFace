# 12 — Bounded research tasks and source guidance

**Purpose:** resolve the uncertainties that materially affect a mature implementation. These are assignments to investigate current production behavior, not permission to replace the existing architecture with speculative frameworks. Planning only. Source baseline and evidence limits are in 00; current code and route evidence must refresh them.

## Required research output

Every task returns: the precise question; current source/route identity; at least two plausible explanations or implementations; the smallest discriminating experiment; observations separated from inference; the recommended decision and rejected alternatives; the minimal existing-owner changes; compatibility/performance/lifecycle risks; and an implementation-ready next assignment with acceptance.

A research task ends when it has enough evidence to choose a bounded implementation or a precise next experiment. It does not need a complete survey of every game or every source file. Where a capability is missing, state what remains unverified, request the exact capture or backend check, and finish independent analysis rather than repeatedly reproducing the same environment failure.

## R01 — Capability and physical-tool reachability

**Question:** which desired tools exist, which are reachable in each mode/device, and where does the path from definition to understood action break?

Start with E01–E04, the live weapon/module retirement and acquisition rules, effective fitting/ordnance selection, input mappings, glyph resolution, power rail, help/armory, and the actual Gyre/well producers and presenters. Follow a small representative set end to end before expanding the census.

Competing explanations include a missing runtime feature, a disabled route/flag, a fitted-but-unreachable binding, a hidden or generic glyph, contradictory text, wrong current-payload display, and a correct mechanic whose visual result is too weak to recognize. These require different fixes.

Use ordinary acquisition or a clearly labeled equipped fixture. Witness actual Pull placement, Gyre gather/hold/release, bomb selection, and cloak use. Compare what the UI predicts with accepted events and observed motion. Inspect both a new profile and a legacy save, including modes in which retired equipment remains owned.

Deliver a capability funnel with defined/obtainable/equipped/reachable/witnessed/understood columns, the exact broken edges, and the smallest projection/input/teaching repairs. The next assignment should make one coherent kit understandable through CEC-A and use it in CEC-C, not create another static encyclopedia of all weapons.

## R02 — Closed-loop flight and intention

**Question:** why do representative units look unstable or unintentional in actual fights?

Start with the tactical AI stack, perception, maneuver/squad frame, ports, FlightV3 and physics authority, plus current control/convergence tests. Trace several actual misbehaving actors across the full command chain. Inspect update cadence and all movement writers before tuning a gain.

Compare at least these hypotheses: underdamped control; infeasible reference motion; discontinuous target/doctrine switching; formation reassignment; stale sensing; avoidance/formation priority conflict; incorrect actuator/mass assumptions; and an expected external kick whose incapacity is not visible.

Run an isolated moving-reference case and then the same actor in the production encounter. Hold all but one suspected layer constant with a clearly labeled diagnostic intervention; never ship that intervention as the fix. Measure sustained relative position/velocity error, angular reversals, saturation, phase dwell, collision rate, and recovery rather than best-ever error.

Deliver a causal diagnosis, candidate control/arbitration repair, tested operating envelope, and CEC-B implementation assignment. Do not recommend a new flight engine because a source function is long or because a visually pleasing kinematic demo is easier to build.

## R03 — Stealth truth and attention

**Question:** what does each enemy actually know, what causes transitions, and can the player reliably choose avoidance or an opener?

Start with E05/E06, `aiPorts`, gunnery/lock consumers, scanner, squad reports, final engagement authority, and the legal heat owner. Identify any consumer that reads concealed live coordinates around the perception gate. Inspect whether current contact confidence/age can express the proposed states without another memory store.

Compare missing UI against incorrect sensing, stale lock retention, instant group knowledge, over-short feasible cloak time, and route geometry that makes stealth impossible. Record awareness per observer and the accepted action that produced a reveal. Do not infer stealth quality from the transparency shader.

Build a small production-backed patrol/cover/cache trial. Measure actual approach, interaction, recharge, and exit times with the real module. Test false alarms, last-known search, a second observer, a scan, and a missile already in flight. Trace commit → reveal → hit for a conditional opener before implementing damage bonuses.

Deliver the minimal authoritative awareness projection/state changes, explicit signal/action table, feasible no-kill route, opener entitlement contract, save/alarm policy, and CEC-E assignment. Preserve independence of legal wanted heat and physical detectability.

## R04 — Selective shield feasibility and collision/query closure

**Question:** how can the exact friendly-pass/hostile-block panel work across the repository's actual physics and every relevant weapon path without energy, ownership, or tunneling defects?

Inspect the pinned JavaScript physics package/version and its wrapper, collision groups/hooks, physical body commands, projectile sweeps, beams/rays, explosion occlusion, chain selection, fields, and relation/ownership services. The first deliverable is an inventory of these paths, not a new panel shader.

Compare a relation-filtered physical contact implementation with a bounded swept-interaction approach through the existing authority. Evaluate moving endpoints, anchoring, recoil/overload, and actual support for limiting reactions. A backend API documented for Rust or another release is not evidence it exists in the installed JavaScript binding.

Use a minimal real-backend fixture with two endpoints, friendly/hostile/neutral bodies, fast projectiles, a beam, and an explosion. Test both directions, endpoint motion, zero separation, maximum span, occupied placement, and a destroyed endpoint. Check that the visible contact, damage, and resource debit agree and occur once.

Deliver the selected implementation with its rejected alternative, shared geometry/eligibility read contract, full weapon-path matrix, remaining exceptions explicitly justified, and CEC-D assignment. A collider that works for ships but lets beam and projectile code bypass it is not a successful feasibility result.

## R05 — Perceptual and physical correspondence

**Question:** which concrete image/motion failures make living units, telekinesis, targeting, and destruction unreadable or unsatisfying?

Start with E03/E09/E10/E11, actual material/asset binding, current Look/post pipeline, glyph and target presentation, status/tumble rendering, and the damage/aftermath producers. Determine current NOCTURNE status before touching shared lighting. Avoid using an unmerged branch's claims as baseline evidence.

Compare inadequate key/fill/rim separation, incorrect color-space handling, excessive background detail, insufficient projected hull size, generic silhouettes, hidden glyphs, false target overlays, weak temporal effect structure, and physical/render-body divergence. They are different defects; increasing bloom treats none reliably.

Capture the same source/scenario/camera in bright and dark moods with controlled diagnostic ablations. Inspect the first moment of capture, mass growth, release direction, collision, concussion, irreversible failure, rupture, and aftermath. Watch normal-speed motion and reduced-motion/flash variants. Keep scene geometry and exposure stable when comparing one cause.

Deliver concrete before/after perceptual failures, an image-chain diagnosis, selected shared-owner repairs, truthful lifecycle geometry policy, and CEC-B/C/F acceptance. A tasteful concept image or isolated close-up asset does not prove the gameplay camera can communicate the event.

## R06 — Whole-experience performance and lifecycle

**Question:** what dominates responsiveness and frame variance during the actual combined experience, and what state/resource leaks survive repeated transitions?

Use the current performance contract and designated capture workflow. First profile typical and stressful CEC-B/C/F routes at unchanged settings. Isolate CPU simulation, AI, collision/query, render submission, GPU shading/overdraw, UI/compositor, allocation/GC, asset admission, and shader first-use costs. Report source identity and hardware rather than borrowing an older benchmark's conclusion.

Compare one optimization at a time under repeated/interleaved runs. Record simulation time progress and input/decision age as well as FPS. Then recombine changes in the complete scene, because an optimization that shifts work to another phase may only move the hitch.

Exercise repeated encounter start/end, death, Continue, docking, sector/rebase, context loss, and device interruptions with held powers, live panels, observer searches, and dying bodies. Check counts and ownership after teardown instead of merely checking that no exception appeared.

Deliver a ranked measured cost/lifecycle map, quality-preserving experiments with rejected shortcuts, smallest implementation assignments, and explicit target-hardware unknowns. When target hardware is unavailable, return a precise capture requisition and verified narrow diagnostics; do not certify the full budget from software GL or an isolated function timer.

## Experiment record template

| Field | Required content |
|---|---|
| Decision | The choice this experiment can actually change |
| Baseline | Exact source, route, scene/seed, input, settings, device/backend |
| Competing explanations | At least the plausible alternatives that imply different fixes |
| Intervention | One controlled change, with diagnostic-only changes clearly labeled |
| Observables | Authoritative state and player-visible behavior; timing/cost where relevant |
| Result | Measured/observed values, retained failures, variability, and evidence location |
| Interpretation | What the evidence supports and what it does not |
| Next assignment | Minimal existing-owner changes and a reference route that can falsify success |

## Primary references and transfer limits

These references were checked during planning on 25 October 2026. They provide methods or API facts, not evidence that SpaceFace's current implementation is correct. Use official documentation matching the repository's installed revision before coding. The formulas and policies in this package are engineering proposals to test, not results borrowed from these sources.

**Rapier — JavaScript advanced collision detection.** [Official guide](https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection_js/). The inspected guide is labeled JavaScript 0.21 and describes contact/intersection filtering hooks, solver flags, and continuous collision detection. Transfer: investigate relation-based collision filtering and fast-object contact through the actual installed API. Limitation: this does not prove that arbitrary solver-contact modification is available in SpaceFace's binding, or that Rapier automatically governs the game's separate beam/projectile/area queries.

**Craig Reynolds — Steering Behaviors for Autonomous Characters.** [Author's overview](https://red3d.com/cwr/steer/), [Arrival](https://red3d.com/cwr/steer/Arrival.html), [Leader Following](https://red3d.com/cwr/steer/LeaderFollow.html). The author separates goals, steering, and locomotion and illustrates arrival and leader-following behavior. Transfer: diagnose layers separately and compare desired motion with finite actuator capability. Limitation: illustrative steering is not a complete controller for SpaceFace's damaged, force-driven spacecraft or a proof of sustained formation stability.

**Riot Games — Clarity in League.** [Developer article, 12 March 2021](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/). The article discusses recognizable silhouettes/facing, effect-to-hitbox agreement, attention hierarchy, and limits on visual noise. Transfer: test whether the most consequential action is the clearest action and whether effects predict real geometry. Limitation: do not copy another game's HUD or transplant its combat timing without testing SpaceFace's camera and physical density.

**Three.js — Color Management.** [Official manual](https://threejs.org/manual/pages/color-management.html). The manual distinguishes input, linear working, and display-output color spaces and identifies incorrect conversion as a cause of unintended brightness. Transfer: audit the actual asset-to-post-output chain before compensating for darkness with stronger lights. Limitation: this is one hypothesis, not a diagnosis of the current game; preserve the repository's pinned renderer and custom compositor ownership.

## Research that is not required

Do not survey every MMO, write a second engine architecture, implement machine learning for enemy control, or invent a full content-scripting language as prerequisites for this work. More advanced approaches remain legitimate only when a concrete bottleneck or expressivity gap is demonstrated and the bounded alternative wins the comparison. The owner's request is for a mature controlled experience, not maximum subsystem count.
