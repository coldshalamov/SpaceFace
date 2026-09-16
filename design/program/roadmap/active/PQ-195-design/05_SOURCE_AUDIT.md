# BREAKAWAY — source audit and research provenance

## Snapshot and limits

Repository: `coldshalamov/SpaceFace`. Inspected commit: `3bd28815e924a85cf3b952284b7fa6934ef4c487`, committed 14 September 2026. The source-only workflow artifact was generated at `2026-09-14T01:29:36.736107+00:00`. Its manifest selects 7,264 files and omits 4,462 tracked files, approximately 5.43 GB of tracked bytes, mainly heavyweight media. It is not a complete playable game distribution.

The original research report and three surviving visual sheets were recovered, as was the generated scene reference. The earlier BREAKAWAY code/spec files were not found in the available runtime or Files search. This packet’s new source, models and tests were rebuilt, then executed in this completion turn. The historical reference sheets are not passed off as the new test results.

The exact SHA-256 hashes of inspected source owners are in `integration/source-baseline.json`. The files are not copied wholesale into the packet. Recheck live source before implementing: a pinned audit is useful evidence, not a claim that no later work exists.

## Primary repository evidence

All paths below refer to the pinned commit. Full source links and exact hashes are in the machine-readable baseline.

| Source | Finding | Consequence for this feature |
|---|---|---|
| `AGENTS.md` | Current flight/physics/AI and single-writer authority | Do not fork those systems |
| `design/VISION.md`, `design/FEEL_CONTRACT.md` | Physical agency, understandable consequences, earned speed | Preserve player-authored motion; no hidden governor or particle substitute |
| `src/core/physicsAuthority.js` | Queue linear and Y angular impulses; physics alone consumes them | Capture computes commands, never poses |
| `src/core/sg02DynamicBodyOwner.js` | Rapier authority and `entity.angVel` physical Y velocity | Use real post-solve samples and correct cross-product sign |
| `src/systems/heistFacilities.js` | Scheduled physical capsule, catch/fence candidates, prepare/commit/abort handoff | Extend the existing owner; fresh-settled proof is a new evidence kind |
| `src/missions/heistMissionRuntime.js` | Existing mission bridge, owner effect sequence and save restoration | Reuse it, but repair the reproduced fail-open settlement path |
| `src/missions/heistArbiter.js` | Causal-tick terminal arbitration, immutable receipt and effect journal | No second arbiter; narrow uncommitted-abort support only |
| `src/data/heistMission.js` | Capsule Run policy, fixed tuning, recovery default and outcome matrix | Add a variant instead of changing every current mission |
| `src/data/heistFacilities.js` | Fixed physical/facility layout, socket projection and authored capsule identity | Parameterization and placement are required integration work |
| `src/systems/cargoCustody.js` | Operation-owned shipment sales | Not a generic free-cargo receiver API |
| `src/data/encounters/329-curtain-convoy.js` | Explicit cargo-raid predation, hauler and raider roles | Reuse existing intentions and reaction machinery |
| `src/combat/subsystems.js` | Next-tick subsystem disable/restore and attachment break behavior | Later transport clamp can use existing combat ownership |
| `design/program/roadmap/active/PQ-148.md` | Physical cargo, named owner/destination, volatility and smuggling scope | Avoid duplicate cargo programme |
| `design/program/roadmap/active/PQ-152.md` | Physical multi-solution set pieces and failure mutation scope | Admit this as a bounded instance, not a parallel mission plan |
| `design/frontend/direction/FIELD_HARDWARE_PROGRAM.md` | Newer asset-first UI authority and three-anchor/Power Rail constraints | Reconcile new art with approved hardware kit |

Registry membership and an authored plan are not proof of a good player experience. The source audit establishes reuse opportunities and specific implementation contracts; the feature’s real-route and human acceptance remain open.

## Reproduced integration hazard

`tools/probe-source-settlement.mjs` imports the actual mission runtime and arbiter and injects receiver refusal through minimal owner doubles. Both refused prepare and refused commit still call mission completion in the pinned source. The result is recorded in `qa/source-settlement-characterization.json`.

This is a targeted source-level failure reproduction. It does not show a player reproducing an exploit in the shipped route. The tested `settlementGate.mjs` is a repair ingredient. It has not been installed into that source, so the packet does not claim the game is fixed.

A second important finding is explicit in the source comments: the current heist facility state/capsule are not persisted by the save capture plan. BREAKAWAY’s durable physical load needs a versioned extension; saving the mechanical helper by itself is insufficient.

## Research-to-design reasoning

The prior `SpaceFace_Fun_Research_Report.md` supplies the larger comparison and qualitative player-feedback review. This feature does not need another literature survey before implementation. The load links expressive action, a readable physical challenge, improvisation after mistakes, and a meaningful consequence. That is a design inference, not a paper proving this particular feature will improve retention.

Primary motivation reference: the Self-Determination Theory site’s **Player Experience of Needs Satisfaction** overview and its underlying game studies connect autonomy/competence/relatedness with game experience. This supports testing whether players understand and own their actions; it does not justify coercive loops or claim that more options always improve fun.

Primary technical references: Rapier’s JavaScript rigid-body and joint documentation support the distinction between free bodies, constraints and impulses. The lab uses the exact vendored library version from the source snapshot, rather than assuming every online example matches the game.

Reference URLs:

- SDT/PENS: https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/
- Rapier rigid bodies: https://rapier.rs/docs/user_guides/javascript/rigid_bodies/
- Rapier joints: https://rapier.rs/docs/user_guides/javascript/joints/
- Pinned repository: https://github.com/coldshalamov/SpaceFace/tree/3bd28815e924a85cf3b952284b7fa6934ef4c487

These sources were checked during the completion work. No source establishes “highest ROI” empirically. The direction is selected because it composes the game’s existing distinctive verbs with a bounded art/integration footprint, subject to the acceptance experiments in this packet.

## License and asset provenance

New models, SVGs, helpers, code examples and prose are original packet work. The earlier generated concept and recovered sheets are marked as references. Three.js and Rapier files are included only to make the standalone lab run without installation/network; their licenses and provenance are retained under `third_party/`. No font files, stock sound files, copied game art or external game screenshots are bundled.
