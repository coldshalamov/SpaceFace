# Accompanied formation progress

## Change
Formation work now counts leader displacement only from the start of the player's current uninterrupted in-band interval. Range breaks and new physical steps reset both the progress origin and hold clock. The authored time and displacement requirements are concurrent, not an extra delay after distance is met.

For scene 423, remain 60–180 WU from the leader for at least 8 seconds while the leader displaces at least 100 WU during that interval. Previously, leader travel while the player was absent could satisfy progress before a late stationary join. The shared formation observer also serves the other formation consumers. No authored scene, NPC navigation, reward, save, generator, trail, bow-angle or speed rule changes.

## Regression evidence
- New `npm run check:vignette-formation-progress`: 11 tests pass with the candidate; baseline passes 4/11. Seven failed baseline expectations cover the same defect and reset semantics, not seven distinct defects.
- Cases cover late joins, concurrent time/distance, both range breaks and inclusive boundaries, gap-cross/formation sequencing, consecutive formation steps, fresh entry, hold-clock reset, missing/dead/non-finite subjects, single payout, sponsor/decline and timeout.
- Existing `test/rc-vignettes-459-4242.test.mjs`: 8/8 pass against the candidate in the qualified module harness. Its deterministic two-hour route uses position fixtures; it is not native-flight evidence.
- The focused alias is registered exactly once in the existing `check:ci` graph via `scripts.check`. No workflow change. The full aggregate was not executed locally.

## Native qualification
Headless input-only route using actual tacticalAI, flightV3, aiPorts and Rapier physics; ordinary seed-1 lived selection at simulation 3600 in Ceres refinery, original 720 WU approach and actual patrol-lawman ring motion. No post-setup position, velocity, intent or body writes, damage suppression, reward injection, gate changes or NPC overrides.

Accepted at 3610.083333; held from 3611.083333 to settlement at 3619.083333: 8 seconds, 319.328742 WU leader displacement, 48 credits, +2 Helix and exactly one receipt. Player alive with hull 150; zero observed physics-impact events. Initial pilot with a poor approach offset produced 36 impacts and a physical timeout without payout; the corrected input-only controller passed. This is not rendered visual, human-usability or frame-performance acceptance.

## Save interruption
A separate native route was interrupted 3 seconds / 55.981923 WU into the hold. Actual SaveSystem `serialize → JSON round-trip → loadEnvelope` succeeded without errors. Live/transient formation progress was not serialized; the consumed-scene stamp remained, player restored, no reward/rep/receipt occurred, and ordinary selection did not readmit scene 423. This preserves existing consume-on-start/abandon-active-scene policy; it does not introduce resumable active encounters.

## Provenance and limits
Qualification source base: `0ebaf5d32603707ba765498e6c8c7b5c8eea2eb1`. Candidate interpreter blob: `655c558cab0246e5a79a5c1affa616412b4c2707`. Focused test blob: `746ff478d7ce3cabd566648bc6d47f8a2020e781`.

Core native owners were independently public-pinned, including SaveSystem `3927c4b7f8dc195b99525cf51ea646be398999c0`. Native qualification used archived dependency fallback (1560 modules), two unmodified generated catalogs and installed vendor dependencies, not a complete contemporary public checkout. Existing RC suite replay similarly used a qualified dependency harness. The publication parent is `8810e2255aabbc7c01d8eeaf65d22f3f23cc3ee4`; the intervening commits change swarm weapons and program records, not the formation observer, scene or package scripts. Hosted checks for this exact PR head remain a separate result, not implied by these local passes.
