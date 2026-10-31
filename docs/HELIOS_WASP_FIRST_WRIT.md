# Helios: the moving first Wasp writ

The existing first Wasp writ tracks the real named gate runner, including its moving
position, through existing mission navigation and HUD consumers. Live story identity
or the exact durable mission slot must match; a recycled ID cannot acquire the
runner's name. Missing contacts produce an honest search explanation, not a false
completion. Outside Helios the route directs the player back to the writ's sector.

The ordinary bounty spawner, durable target records, Ram Plate qualification and
kill/settlement owners are unchanged. This creates no new target or encounter.

Owners: `src/missions/starterWaspRoute.js`, consumed by the mission waypoint reader.

## Current-source verification (2026-10-31)

Candidate reconciled against `coldshalamov/SpaceFace` commit
`31a011002036e625c971d315f8da08a7a32687ee`. Existing files received the original
historical delta by three-way reconciliation, not replacement with archived files.
Newer mission acceptance, navigation identity and bar contact changes are retained.
Worker/registry, rescue collider, training-rock and asset owners are unchanged.
`index.html` retains current hints and adds only the newly required eager `verbSpeech.js` hint; historical preload lists are not restored.

The Helios focused suites pass 76/76 against current dependencies: conversation
25, board composition 9, iron route 17, Wasp route 10, buoy aftermath 13, native worker-wire 2.
These execute pure readers and actual current owner method bodies with scoped
fixtures. The native worker-wire checks run the production domain differ, structured
clone and facade merge into the actual Kessler/receipt readers, plus the native event
bridge. They preserve receipt provenance, starter counters, current board offers and
the receiving scene payload without modifying worker owners. These are not a full
registry boot or rendered browser playthrough.
No visual/readability, performance, full Save/Continue route or deployment claim
follows from these tests. Run the normal dock → Bar → Kessler → Accept + Track →
physical work → settlement route in a fully built game before visual acceptance.
No new asset, reward writer, control owner or persistent progression key is added.


## Next-radius continuation: second and third writs (2026-10-31)

After Nim's ticket settles, the existing board and Kessler conversation already
point the player toward Joss Wire and then Vex Tollcut. The route now follows each
actual named runner too. Previously only Nim opted into this reader; later writs
fell through to ordinary bounty navigation, whose retained station anchor caused
the HUD to prefer Helios Station over the target's moving position.

The reader strictly selects an existing numeric authored step and verifies that
step's exact mark name, story role, fit and destination. It retains the original
`firstWaspRouteFocus` export for compatibility. Missing contacts remain searches,
sector departure returns a sector direction, and restored slot zero must belong
to the exact writ. No new target, mission, payout, saved state or encounter is added.

The focused route suite passes 17/17. It executes the actual waypoint method and
HUD consumer for all three named writs, plus moving targets, missing/dead/foreign
contacts, reused runtime IDs, exact durable slot restoration, inactive missions,
invalid steps and cross-writ name rejection. Ordinary bounty behavior is retained.
This is executable component-route evidence, not a rendered or physical flight
playthrough. Existing visual, performance and whole-game acceptance limits above
still apply. Pre-edit owned files matched PR724 head `3f2124dd`; remote master
`9eefbdb6` retains the same three authored starter jobs and board behavior.
