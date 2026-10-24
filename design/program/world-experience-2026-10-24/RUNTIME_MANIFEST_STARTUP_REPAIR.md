# Restore importable production runtime composition

The public DOCKET commit 0a59973d4ed45040cd05e77ba8a129fec7cecd64 also added unrelated shipbreaking-yard, tender, outfit, disaster and workshop registrations without their factories or composition exporter. On master 719a82b85c07417e8661460147ed3977031ceb57, importing the pure manifest fails with ReferenceError at line 59.

This correction removes only those dangling init/update references. It retains DOCKET's init, update and table-clock entries and all existing prompt capabilities. It does not remove feature code or cancel planned shipbreaking/tender/outfit/disaster/workshop integration; those integrations remain OPEN until their actual factories, composition and clocks land coherently.

Validation: exact public manifest plus runtimeProfiles reproduced the failure in Node VM modules without game/browser factories. Corrected sources pass two isolated startup tests and the existing count/order testcase (3/3), with 232 init IDs, 180 update IDs and no clock violations. Static membership comparison against both current public factory tables, including their explicit slot aliases, finds no missing applicable IDs. Public systems/runtime/data/world directory trees were nontruncated and have no implementations for the dangling names. This is not full game boot, browser, Save/Continue or whole-game acceptance.

Publication gate: check:runtime-manifest-startup directly runs the two isolated tests. Inspected 311-command/233-static graph places it on static shard2/3. Existing command order/classifications/workflows are unchanged. The existing full manifest test retains exact232/180 count assertions; its other integration cases were not run locally. Hosted full-checkout results must be reported separately.

Ownership: current open PR509 and PR480 modify different manifest capability-map hunks, not these orphan init/update references. No absorption of those capabilities or other draft ancestry. Separate draft repair; no merge/deploy and no automatic changes to consumer PR582/583.
