# Elroy: the person must arrive, not merely the cable

Read-only research against PR #982 head 03561c04bf9eef0e5efcf7a003471863e2cb1946. No gameplay fix or visual acceptance claimed.

## Connected scene

Book 2 moves through Cinder clearance and actual wreck delivery, Rookside first growth, Nest outcome, then Elroy's registry writ. The player has learned that original objects and physical arrival matter. The civilian custody branch should preserve that vocabulary: scan the original, choose live capture or lethal force, then receive the matching register and later ledger. The previous outcome-aware ledger correction is retained.

## Confirmed gap

- [missionObjectiveOps.js lines 1271–1283](https://github.com/coldshalamov/SpaceFace/blob/03561c04bf9eef0e5efcf7a003471863e2cb1946/src/systems/missionObjectiveOps.js#L1271-L1283) resolves custody when a player reel event names the identified target and its after value is at most 60. Actual hull distance, live attachment and current sector are not verified there.
- [attachments.js lines 550–596](https://github.com/coldshalamov/SpaceFace/blob/03561c04bf9eef0e5efcf7a003471863e2cb1946/src/combat/attachments.js#L550-L596) establishes that after is accepted rest length, not measured endpoint separation. A short elastic rest length does not establish arrival.
- [tetherGameplay.js lines 1767–1774](https://github.com/coldshalamov/SpaceFace/blob/03561c04bf9eef0e5efcf7a003471863e2cb1946/src/systems/tetherGameplay.js#L1767-L1774) suppresses another reel event at minimum length. A simple range guard could strand the player when the hull arrives after the final reel event.
- [missions.js active cadence](https://github.com/coldshalamov/SpaceFace/blob/03561c04bf9eef0e5efcf7a003471863e2cb1946/src/systems/missions.js#L938-L1044) is the proper place for a persistent physical-arrival observer. This run does not modify that protected path or hide settlement in unrelated hail/navigation hooks.

## Negative evidence

The isolated elroy-distant-custody-probe.test.mjs derives from the existing B2 investigation test. It identifies Elroy at 5 WU, explicitly stages him at 500 WU, then emits a reel-shaped event with rest length 50. The assertion that no custody occurred fails: one outcome was emitted. The unchanged lethal branch passes. Result: 1 passed, 1 expected acceptance failure.

This is an owner-level injected-event probe, not native tether physics, player flight, earned Book 2 traversal or a visual review. It proves the missing mission guard; source establishes producer semantics.

## Recommended implementation

1. Genuine live player Line reel marks capture intent, not completion.
2. Ordinary mission flight cadence observes the same alive original, current sector, attachment life/generation and physical range. Cut or replaced bodies earn no custody.
3. Arrival uses the existing resolve writer once. No pose/velocity writes, extra reward, timer substitute or parallel outcome owner.
4. A brief first-attempt cue explains that the winch is short but the vessel must come alongside; ordinary flight and lethal force remain available.
5. Verify minimum-spool arrival without another event, cut/reconnect, paused/Swarm states, target death, wrong sector, reused IDs, callback reentry and cold Continue.

Check live hull/socket collision envelopes before choosing a 60-WU center threshold: the current number is a rest-length contract. Prove starter-equipment attainability rather than weakening collision or positioning the hull to pass.

## Unresolved actor direction

[missionSpawningOps.js](https://github.com/coldshalamov/SpaceFace/blob/03561c04bf9eef0e5efcf7a003471863e2cb1946/src/systems/missionSpawningOps.js#L739-L750) stamps accepted bounty targets with hostile player teams. [Elroy's authored identity](https://github.com/coldshalamov/SpaceFace/blob/03561c04bf9eef0e5efcf7a003471863e2cb1946/src/story/campaign47a/embodiedMissions.js#L219-L225) is a Free civilian maintenance vessel using a Wasp archetype. Live review must establish whether this reads as intended coercion/self-defense or an unintended generic hostile. Do not rewrite the moral choice from source assumption alone.

## Open goals

- SF-GAME: physical Elroy custody open. Mission integration owns a proper cadence observer and native route proof; protected cadence path needs an authorized writable route.
- SF-WORLD-DIRECTION: distinct custody/death consequences partially integrated. Preserve ledger correction; validate actor behavior and surviving-person state after capture.
- SF-SECTOR-COHERENCE: Cinder→garden→Nest→registry remains open for an earned full route and cold Continue.
- SF-LIVING-WORLD: living Elroy must not become a death alias. Follow actual actor and registry consequences on return.

Existing hull, Line, registry UI, outcome writer and ledger suffice. No new model, raid or trophy-wall request is justified by this finding. Rendered evidence requires a working supported game preview.
