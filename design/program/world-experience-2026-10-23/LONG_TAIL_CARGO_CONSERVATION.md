# Long Tail finite cargo custody

## Player-facing correction
The existing breached fuel courier now sheds its own finite fuel hold instead of creating a second supply outside that hold. The authored 10–16 units are shared by the five seeded trail pods, up to nine live shed slots, and ordinary damage/death spill. A high 16-unit roll can truthfully leave two units aboard when the nine live slots finish; this change does not invent extra release opportunities.

Only successfully admitted pods debit cargo. Denied admissions retain the stock and do not consume a live slot. The existing flat cargo and ordinary cargo manifest remain synchronized, preserving unrelated commodity lines and manifest identity. Dead or already-spilled couriers cannot shed again. Invalid manifests, missing stock, and unsafe/unrepresentable quantities fail closed. Empty-hold scan/comms appear only when the actual hold is empty; the defense receipt no longer invents depletion when cargo remains.

Original crew, timing, chase geometry, pod physics, rewards, and resolution behavior remain unchanged. No shared cargo owner, save schema, asset, or new ledger is introduced.

## Verification
Run `npm run check:long-tail-cargo-conservation` for the 17-case focused regression gate, added once to the default check chain. Independent review passed 22 tests: 17 new conservation cases plus five unchanged original Long Tail tests. The bounded coverage includes finite holds, rejected admissions, ordinary spill/death custody, malformed/legacy stock, exhaustion, and honest receipts.

The final candidate also passed 22/22 with the exact public-parent trafficRoleOps violence method substituted in memory. Relevant helper functions and constants were byte-identical; public lootShards, industrialBeam and encounter catalog owners were qualified. This is evidence for those actual production contracts, not qualification of the entire transitive runtime graph.

## Boundaries
No broad local check/check:ci suite was run. The complete current-native dependency graph, full Save/Continue, browser/rendered appearance, and whole-game acceptance remain unverified. Hosted exact-head CI is tracked separately on the draft pull request; local focused passes are not an aggregate CI pass.

The four-path increment contains only the encounter, focused test, minimal package script wiring, and this report. It is based on public master without private ancestry. Draft only; no merge or deployment.
