# Collector return clearance: bounded proof

Public parent: `2093fe7c61f6c9ec07a347b381c17b44a1060b0e`. Reviewed source tree: `22520807ada18a5341bbc0b95adef7d25aa1f583`.

The actual CI merge `0eb59a76a01b88c7dec50b8d891d932ca0c8a65c` recorded collector113 contacting Customs Gate3 at tick43454, penetration -0.4124683439731598. Its return arc bypassed existing fixed-solid clearance. This change reuses native/authored envelopes for return and blocked radial exits, checks incoming chords and overlapping solids, brakes when no local segment is clear, and requires actual radial exit before changing phase. Original shallow collection math and physics/contact/custody/yield rules remain unchanged.

## Checks

- 14 new focused +37 adjacent tests passed on the immutable reviewed tree; 1,485 repository module paths matched that tree, with no direct repository FS reads in the audit.
- Independent reviewer reran14 focused cases and two adversarial overlap cases.
- Opt-in native probe: `node test/fixtures/anvil-return-native-passage.mjs`; loaded control: `SEEDED_LOAD=12 node test/fixtures/anvil-return-native-passage.mjs`. Not part of the default test command.
- This reduced-system probe uses the actual32-collider collector and22-collider gate, ordinary FlightV3, planetary fields and native physics. Initial approach and optional12-unit manifest are explicitly constructed fixtures, not naturally earned gameplay. A nonphysical observer follows; participant poses/cargo are not rewritten during passage.
- Identical baseline controls collide at11.2833 simulated seconds, penetration -0.732978WU. Candidate controls pass at25.9667 seconds with no contacts, minimum center separation128.1236WU, hull200 and cargo unchanged. Native mass55 before/after. Empty and seeded12 results match; loaded candidate ran the final reviewed tree.

## Limits and preserved failures

An invalid first probe had an angular-wrap stop error and is excluded from success evidence. Full-registry shortcut probes did not establish passage: the later attempt yielded to a real Customs Checkpoint Hornet155. The product yield policy was not changed. That constructed traffic timing differs from the actual fullshift, so it is not the established cause of CI's gate contact.

These are bounded geometry/native steering results, not ordinary arrival, fullshift, Save/Continue, visual or whole-game acceptance. The actual successor CI route remains required. No collision tolerance, actor identity, finite cargo, damage or transfer rule was weakened. No local execution of the long receiver-delivery test was used for this increment.
