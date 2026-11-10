# 00 — Evidence, correction, and decision register

**Baseline:** `8491f7ae7462b61bd6cb34c88fd3453c0c382e5e`, inspected remotely on 25 October 2026. Source inspection only. No live gameplay, hardware performance, usability test, or visual acceptance was performed for this planning package.

## Evidence vocabulary

- **SOURCE:** an inspected definition, implementation slice, or documented owner exists at the pinned revision. This does not prove default-route reachability or quality.
- **OWNER REPORT:** the player's reported experience, accepted as the problem statement; not falsely presented as our measured diagnosis.
- **DESIGN:** a proposed outcome, rule, or experiment in this package.
- **UNKNOWN:** requires a current-route investigation. Missing from a focused search does not mean absent from the entire repository.
- **PR CLAIM:** an unmerged branch's own reported status; neither shipped master behavior nor independently reproduced evidence.

## Inspected source anchors

All links are pinned so later agents can distinguish this audit from a fresh diagnosis. Re-read the current equivalents before editing.

| Evidence | Inspected source and scope | What it establishes | What it does not establish |
|---|---|---|---|
| E01 | [powerVerbs.js, lines 1–100](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/systems/powerVerbs.js#L1-L100) | Five powers, old-action aliases, binding migration, and hold-preview/release intent exist | That every platform communicates those controls correctly |
| E02 | [fields.js, lines 1–68](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/systems/fields.js#L1-L68) | Pull places a well; field forces cross the existing physics authority; a field-emitter type exists | That the deployed object, extent, force, or counterplay is visually obvious |
| E03 | [gyreSnare.js, lines 1–130](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/systems/gyreSnare.js#L1-L130) and [presentation, lines 1–95](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/render/forceLanguage/gyreSnarePresentation.js#L1-L95) | Gather/hold/launch ownership, ingestion guards, member accounting, and a dedicated visual implementation exist | That the complete input-to-impact experience is accessible, attractive, or performant |
| E04 | [arsenalIdentity.js](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/data/arsenalIdentity.js) | Stable equipment IDs map to glyph keys and explanatory sentences; well, singularity, Gyre, and many weapons are named | That every item is obtainable, every glyph resolves, or those glyphs are visible/distinct on live screens |
| E05 | [cloak.js, lines 1–85](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/systems/cloak.js#L1-L85) | Dynamic signature radius, shared concealment gate, fire-break, scan reveal, and restore cleanup exist | A mature awareness display, encounter-level stealth economy, or exclusive opener system |
| E06 | [perception.js, lines 1–160](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/ai/perception.js#L1-L160) | Per-observer contacts, observation age, confidence decay, visibility, and snapshots already exist | That all AI consumers obey them or that their thresholds feel fair |
| E07 | [autoTargetMode.js, lines 1–150](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/combat/autoTargetMode.js#L1-L150) | Selection, tether target, and resolved gun target differ; one resolver supplies gunnery; assist strengths already exist | That the player can perceive those distinctions or that assistance matches their intent |
| E08 | [maneuver.js, lines 1–150](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/ai/maneuver.js#L1-L150) and [AI notes](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/ai/AGENTS.md) | Formation disruption/recovery, gap queuing, actuator-request architecture, and final engagement authority already have owners | Stable sustained formation behavior in the actual encounters |
| E09 | [deathSlide.js](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/render/deathSlide.js) | A bounded render-only death slide exists; its comment explicitly says the simulation body stays parked | Physical dying-hull travel, delayed detonation, or satisfying destruction |
| E10 | [UI notes](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/src/ui/AGENTS.md) | ORRERY and shared tokens own presentation; input and selection have specified boundaries; live visual checks are required | Approval to replace the design system or cover the playfield with dashboard panels |
| E11 | [LOOK.md](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/docs/visual-assets/LOOK.md) | Dark space, materially lit readable subjects, real illumination, and shared Look ownership are intentional | That the current balance of darkness, background, materials, and effects is acceptable |
| E12 | [PERF_BUDGET.md, lines 1–120](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/design/PERF_BUDGET.md#L1-L120) | Desktop 16.7 ms target, 33.3 ms floor, percentile/hitch measurements, and quality-preserving optimization policy | Any measured result for this package |
| E13 | [Creator's Dock dialect](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/tools/creators-dock/DIALECT.md) | Existing scenario runner/schema, input tape, temporal assertions, and authoring limitations | That every new field/pylon/stealth scenario can be expressed without extending an existing adapter |
| E14 | [Architecture, lines 1–135](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/ARCHITECTURE.md#L1-L135), [design notes](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/design/AGENTS.md), [plan registry](https://github.com/coldshalamov/SpaceFace/blob/8491f7ae7462b61bd6cb34c88fd3453c0c382e5e/design/PLAN_REGISTRY.md) | XZ simulation, single writers, stable identities, program authority, and subordinate design proposals | Permission to overwrite concurrent work or mark proposals complete |

Additional search findings: `scripts/check-sg06-rapier-formation-convergence.mjs` contains a check for entering a formation bound. Future validation must inspect the full test and verify sustained tracking, not infer stability from a best-ever error. `design/swarm/SWARM_EXPANSION.md` includes proposed Gravity Beacons, Repulsor Pylons, a Tesla pair, and Shield Emitters. This is evidence of overlapping design, not proof of the requested paired selective shield shipping.

## Important corrections to the preceding brainstorm

The next task is not to invent a first gravity well, first telekinetic ball, first cloak, first weapon glyph, first target assist, or first formation system. All have existing source footholds. The player's inability to recognize or use them is precisely the convergence defect.

The source catalog distinguishes a placed well, a moving singularity payload, and Gyre's growing throwable mass. UI must preserve that distinction instead of calling all three a black hole. A singularity-looking effect does not automatically mean there is a large physical projectile to launch.

A cosmetic death slide does not establish physical momentum after death. A renderer may show a sinking wreck while the collision owner has already parked it. That mismatch must be intentionally resolved before promising chain collisions from dying ships.

A function named `resolvePlayerGunTarget` does not prove targeting is clear. At this revision, a tethered hostile may own the gun solution while the player selection names something else. Show the effective target and preserve intentional free aim rather than adding a third competing lock.

## Related work and deduplication

- Continue `design/program/ARSENAL_EXPERIENCE.md`, the physical-play grammar/build plan, existing power-teaching and preview work, and `design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md`. Their older assertions must be re-audited rather than copied as current gaps.
- Preserve ORRERY as the UI owner and Look as the appearance owner. This package specifies experience and acceptance, not a replacement visual framework.
- **NOCTURNE PR #554** was read as open, draft, and unmerged; observed head `f54defb2e26d37bce110b875152566e193cd1aad`. Its description reports focused lighting work and outstanding full-game/hardware acceptance. Coordinate with its owner; do not treat that branch or its reported startup blockers as verified current-master facts. [PR](https://github.com/coldshalamov/SpaceFace/pull/554).
- Kinetic Catalysts, shipbreaking, disasters, rig workshops, and the creator tooling are related owner commissions. Resolve their current exact branches/landed paths before assigning overlapping edits. Their existence in a conversation is not evidence of a merged runtime.

## Decisions this package makes

D01: make known physical tools discoverable and reliable before multiplying variants. D02: preserve independent piloting and mouse aim; assistance is explicit and inspectable. D03: separate observer awareness, physical signature, and legal wanted heat. D04: distinguish living controlled, living incapacitated, irreversibly dying, and inert wreck states. D05: make the paired shield relation-selective, not merely a geometric one-way platform. D06: use actual local geometry, contact, and material rules for combinations. D07: scale swarm spectacle through composition and scheduling, not unlimited translucent overdraw. D08: accept the complete ordinary-player route, not a feature catalog.

## Unknowns that must remain visible

Default-route access and actual input ergonomics; glyph resolution and on-screen size; source of NPC oscillation; completeness of cloak consumers; detailed destruction ownership; shield contact-filter support in the repository's pinned backend; current bottleneck distribution; target-device motion quality; current mainline status of concurrent PRs. Each has a bounded research assignment in 12. None is grounds to dismiss the owner's experience or declare a rewrite necessary without evidence.
