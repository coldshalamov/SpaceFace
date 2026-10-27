# Controlled Chaos — Combat Experience Convergence

**Owner-requested planning package, 25 October 2026. Planning only: no gameplay implementation, automatic dispatch, acceptance, or performance improvement is claimed.**

Source baseline: `coldshalamov/SpaceFace` master at `8491f7ae7462b61bd6cb34c88fd3453c0c382e5e`. The audit was a focused remote source review, not a playtest. The owner's account of darkness, confusing equipment, unstable movement, unsatisfying destruction, and screen chaos is the experience to fix. A subsystem's existence does not invalidate that account.

## The outcome

A player should see an intelligible fight, choose an intervention, manipulate actual bodies, and recognize the consequence. SpaceFace should support both a spectacular swarm fight and a deliberate stealth raid. Those are different encounter rhythms using the same world, physics, perception, damage, and ownership rules.

The intended ten-second story is: recognize a dangerous formation, select an actual target without losing manual mouse aim, gather debris into a visible mass, throw it through the formation, recognize surviving ships tumbling rather than dying, and watch the destroyed ships fail into readable wreckage. The intended stealth story is: read a patrol's attention, coast through a genuine blind opportunity, steal valuable cargo near a stronger enemy, and escape without being forced to kill the guard.

**Controlled does not mean quiet or easy.** It means the player can distinguish intentional attack, external physical disruption, loss of control, destruction, and harmless scenery. Surprise should come from consequences and enemy decisions, not from unreadable controls or random-looking steering.

## What is already there

Pull already deploys a gravity well. Gyre Snare already has gather, accrete, and launch code, plus a dedicated renderer. Cloak already has sensor gating and lock-loss behavior. Weapon identities and glyph infrastructure already exist. Tactical AI already has maneuver and formation machinery. The program is principally convergence and maturation, with a specific new paired-shield mechanic and bounded expansions. Do not rebuild those foundations because their player-facing result is weak. Read [the evidence and decision register](00_EVIDENCE_AND_DECISIONS.md).

## Packet map

| Packet | Outcome | Read first |
|---|---|---|
| [01 — Arsenal and input](01_ARSENAL_AND_INPUT.md) | The player knows what is fitted, available, selected, and about to happen | Evidence E01–E04, E10 |
| [02 — Readability and targeting](02_COMBAT_READABILITY_AND_TARGETING.md) | Ships, NPCs, props, targets, threats, and opportunities are distinguishable without surrendering mouse aim | 01, evidence E07/E10/E11 |
| [03 — Flight AI and swarm choreography](03_FLIGHT_AI_AND_SWARM_CHOREOGRAPHY.md) | Enemies fly intentional, physically achievable maneuvers and react coherently to disruption | Evidence E05/E06/E08 |
| [04 — Stealth, attention, and raiding](04_STEALTH_ATTENTION_AND_RAIDING.md) | Observable suspicion, real evasion, exclusive openers, and loot-without-boss-kill routes | 02, 03 |
| [05 — Telekinesis and composition](05_TELEKINESIS_AND_COMPOSITION.md) | Gather, hold, transfer, launch, and impact are useful, physical, and visibly causal | 01, 02 |
| [06 — Linked shield pylons](06_LINKED_SHIELD_PYLONS.md) | Successive deployed endpoints create a selective, destructible shield panel | 02, 05; research R04 |
| [07 — Responsive battlefields](07_RESPONSIVE_BATTLEFIELDS.md) | Purposeful layouts and consistent materials make manipulation and stealth worth using | 03–06 |
| [08 — Damage, destruction, and look](08_DAMAGE_DESTRUCTION_AND_LOOK.md) | Readable bright subjects, concussed survivors, smoking failures, and satisfying bounded explosions | 02, 03, 05 |
| [09 — Performance and lifecycles](09_PERFORMANCE_AND_LIFECYCLES.md) | The complete experience fits existing budgets without hiding work or lowering default quality | All packets as interfaces, not wholesale implementation |
| [10 — Reference encounters and acceptance](10_REFERENCE_ENCOUNTERS_AND_ACCEPTANCE.md) | Reproducible player routes prove the combined experience | 01–09 |
| [11 — Agent orchestration](11_AGENT_ORCHESTRATION.md) | Capability-aware assignments, exact ownership, useful research, integration, and adversarial review | README, 00, chosen packet |
| [12 — Research tasks and sources](12_RESEARCH_TASKS_AND_SOURCES.md) | Close important unknowns with evidence rather than inventing another architecture | The research task's source slice |
| [Integration](INTEGRATION.md) | Install, route, refresh, and dispatch this package safely | Existing repository instructions |

The numbers identify documents, not mandatory serial execution. Packet dependencies and parallel work are in 11. Packet 09 begins with baseline capture; it is not a last-minute optimization pass.

## Owner-requirement coverage

| Reported problem or requested experience | Responsible packets | Proof route |
|---|---|---|
| Is a deployed gravity well already present? | 00, 01, 05 | CEC-A, CEC-C |
| Cannot discover powers or weapons; symbols missing or ineffective | 01, 02 | CEC-A, glyph-to-action recognition |
| Confusing descriptions and context-dependent controls | 01 | CEC-A, remapping and mode transitions |
| Drop two totems and connect a shield that blocks enemies and their weapons, not the player or theirs | 06 | CEC-D, interaction matrix |
| Drop an attractor; collect substantial matter; launch it destructively | 05, 07 | CEC-C, CEC-F |
| Telekinesis may be invisible, inaccessible, or unsatisfying | 01, 05, 08 | CEC-A, CEC-C |
| Environment must be purposeful and physically responsive | 07 | CEC-C–CEC-F |
| Enemy notice/attention is unclear | 02, 04 | CEC-E, awareness transitions |
| Stealth should bypass powerful enemies | 04, 07 | CEC-E no-kill route |
| Stealth-only, rear-only, and combined-condition special attacks | 04 | CEC-E opener truth table |
| Steal valuable gear or a chest without fighting its overwhelming guardian | 04, 07 | CEC-E extraction and Continue |
| Swarm-scale combat rather than isolated stat-duels | 03, 07, 10 | CEC-F |
| Shot ships smoke, veer, descend visually, then explode | 08 | CEC-B, CEC-F |
| Concussed survivors tumble, lose control, and retain inertia | 03, 05, 08 | CEC-B, CEC-C |
| Explosions and animation lack impact | 08 | CEC-B, CEC-F comparative motion review |
| Ships are too dark against sky and scenery | 02, 08 | CEC-B across bright/dark moods |
| Performance is poor | 09 | Matched CEC-B/C/F frame distributions |
| Retain fun manual mouse aim and personal flying while making selected targets obvious | 01, 02 | CEC-B crossing-target and free-aim routes |
| Living units resemble debris or noninteractive scenery | 02, 07, 08 | CEC-B/E classification task |
| AI flight and formations look unstable and unintentional | 03 | CEC-B, sustained tracking tests |
| Interactions feel like chaos rather than meaningful sequences | 03–10 | CEC-F causal reconstruction |
| Direct capable agents, including research agents, without uncontrolled parallel changes | 11, 12 | Exact-path handoff and integrated evidence |

## Program principles

1. **Repair before duplication.** Trace definition → acquisition → input → simulation → presentation → teaching. An asset file or green unit test is not an experienced feature.
2. **One authoritative fact.** Target identity, awareness, collision, damage, ownership, loot, and saves retain their existing writers. UI projects facts; it does not invent them.
3. **Manual intent survives.** No silent auto-piloting, camera recentering, target substitution, involuntary firing, or hidden context remapping to make demos look good.
4. **Physics makes decisions.** Mass, position, velocity, geometry, and material properties change outcomes. Cosmetics never supply a missing force or collision.
5. **Legibility is budgeted.** Keep important bodies and attack footprints readable when effects overlap. More bloom and more labels are not substitutes for hierarchy.
6. **Acceptance is experienced.** The final judge is the normal player route at the normal camera and supported hardware, including reduced-motion and low-end profiles. Test fixtures support that judgment; they do not replace it.

## Decisions versus investigations

Fixed intent: keep personal piloting and mouse aim; preserve physics centrality; deliver the shield pair; deliver useful stealth and positional attacks; make the existing kit legible; improve swarm spectacle and control. Implementation details, numerical tuning, exact icons, and controller coefficients remain evidence-driven. Numbers marked **prototype** are starting hypotheses, not claims about current behavior or permanent design law.

Research is permitted to reject a proposed mechanism when it produces a stronger implementation of the fixed intent. It must return a decision, evidence, a narrow implementation seam, and an executable next assignment—not another unbounded plan.

This package does not create a second global queue, change current ownership, launch paid agent sessions, merge other PRs, or authorize a renderer/engine replacement. Follow [Integration](INTEGRATION.md) and the repository's current program front door.
