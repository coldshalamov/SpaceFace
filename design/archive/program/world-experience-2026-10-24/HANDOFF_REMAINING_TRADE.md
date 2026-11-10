# THE HANDOFF: finish the remaining physical trade

## Behavior
The original player bond still commits at acceptance, paying 60 credits and +2 Quiet reputation once. Acceptance no longer scatters/releases the cast or resolves the scene. Existing live processing continues for the original NPC manifest until all remaining pods physically reach the buyer, or the existing death, missing/destroyed freight, or 110-second deadline boundary closes the deal.

A successful terminal `contact_made` now follows actual receipt of all remaining original NPC pods. Immediate bonded-custody comms remain; later withdrawal/deadline handling cannot claim no bond was signed or reverse it. An empty/unpaid manifest cannot claim a contact. Missing freight copy reports interrupted trade rather than claiming every pod became the player's; existing reputation consequences are preserved.

Non-enumerable scene-local original-object references reject recycled actor/pod IDs without mutating replacements. Pending freight must still belong to its seller; external custody is not overwritten. An original pod's completed deliveredBy receipt remains final even if the paid body is later removed, changes custody, or its ID is recycled; replacement bodies are untouched. A scene-local terminal guard precedes outward terminal callbacks, preventing synchronous reentry from duplicating penalty or receipt side effects. No global listener, secondary trade ledger, shared director/lifecycle, persistence, save-schema, or physics-authority changes.

## Paired physical evidence
Public predecessor: PR568 head `8ee99a339585d029bb11c44485c5890915050f7c`. Public scene blob `1247634f3b8787390b3b8fb28e1c83a140c6c386` matched the original local source exactly. Public master at inspection: `0ebaf5d32603707ba765498e6c8c7b5c8eea2eb1`.

- Unchanged predecessor plus sharp remainder assertion: native fly-through passes; settled hold fails because original pod5 remains seller-owned at 110.7 seconds.
- Candidate native pair: 2/2 pass. Hold bonds original pod4 at 7.0833 seconds; original pod5 enters buyer receipt range (24.280 WU) at 10.0833 seconds and becomes buyer-owned. The terminal contact then resolves, with three original buyer pods and one original player pod. No seller-owned remainder.
- Bonded motion remains +6.39985 WU toward the player over the first two seconds; reward remains exactly 60/+2.
- Fly-through remains unpaid and unbonded; all four original pods reach buyer receipt by 17.5833 seconds.
- Actual native snapshots at acceptance and terminal receipt include player, seller, buyer and every original pod. These are measured body positions/ownership, not interpolated trajectories or live-camera images.

## Regression coverage and independent review
Final focused driver: 55/55 (43 custody/continuation cases, 7 original Handoff cases, 5 NXB-040 cases). Coverage includes partial continuation, once-only reward, terminal reentry, deadline/death/theft/destruction after bond, stale/removed/recycled cargo, recycled actors, foreign custody, actual cargo-cap removal of paid versus unreceived bodies, and empty-manifest no-contact behavior. Original director-only tests preserve custody/reward assertions but replace premature terminal expectations; explicitly arranged arrival checks are labeled no-physics boundary tests, not motion evidence.

Independent read-only review reproduced 55/55 plus native 2/2 and old-source native 1 pass/1 expected fail. Reviewed source SHA256:
`bc701365639279ea041a8b57185c7f595815f977988879ca9b716dfa0df38e61`.

Ordinary exact-tree commands after publication:
- `node --test test/handoff-stationkeeping-custody.test.mjs test/cr-hollow-1-the-handoff.test.mjs test/next-wave-nxb-040.test.mjs`
- `node --test test/handoff-stationkeeping-native.test.mjs`

Existing package aliases already register the focused/native tests. A narrow compatibility gate additionally runs the existing 12 original Handoff and NXB-040 tests; it preserves their assertions and the existing check-chain prefix.

## Limits
Local runs use the existing selected-public-authority qualification loader and mixed historical transitive dependencies, not a fully materialized exact public tree. Exact-head hosted execution of this increment remains pending. Earlier predecessor hosted successes do not qualify this new increment.

Native carriers use synthetic radius-2 geometry, not production MTS hull geometry. No full production collision/AI encounter, live visual, Save/Continue, measured target-device performance, broad suite, or whole-game acceptance is claimed. Scene references remain transient; unfinished scenes follow the existing abandonment policy on load. No merge or deployment.

## Measured diagram
[Native-fixture position and custody diagram](handoff-followthrough.png) and [measured snapshot data](handoff-followthrough-native-evidence.json). This offline diagram plots measured native positions and ownership only: synthetic radius-2 carriers, mixed dependencies, not a live game camera, production model rendering, or visual acceptance. No intervening motion is inferred from the snapshots.

Attribution limit: unexplained missing or destroyed unreceived freight retains the inherited -2 Quiet reputation consequence. This does not establish that the player caused its disappearance or destruction, including cargo-cap removal; this increment does not redesign that inherited penalty policy. Already-received original freight stays delivered despite later removal or ID recycling.
