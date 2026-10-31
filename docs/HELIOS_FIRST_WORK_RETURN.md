# Helios: Kessler connects the first workday

Kessler's docked Helios conversation offers “Any local work for my ship?” alongside
existing trade and weight-slip choices. It reads the exact current posted starter
ticket for Hitch, Pelican or Wasp, preserving its title, brief and existing
Accept + Track handling. Talking does not accept, settle or pay a contract.

The reply distinguishes active tickets, hull changes, missing fits, absent offers,
settled counters and the end of the starter book. It remembers only the recorded
settled ticket number, never inventing earlier deeds or campaign progress.

Owners: `src/ui/station/barContacts.js` composes the choice and reply;
`starterWorkdayConversation.js` reads existing starter-job and mission state.
Existing board/acceptance and settlement owners remain authoritative.

## Initial current-source verification (2026-10-31 checkpoint)

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

## Read-only handback after the local book

After the current hull's third starter settlement, Kessler now returns the player to a
canonical **active** 47-A card when one exists. The card title, objective sentence and
recorded station/sector come from the live mission record plus the shared, pure
`objectiveText` / destination projection used by Mission Log. A more specific marker is
not needed: the shared B0 objective reads its current sample-recovery phase directly from
the canonical mission record, so even a stale waypoint cannot make Kessler send the player
home before recovery. Kessler invites the player to Track the card in Mission Log; dialogue
never accepts or tracks it, changes another pin, or advances 47-A.

The handback only recognizes B0 recovery, the current B1 sealed-alloy delivery, and the
current B1 infested-hauler detail. Thus the already-live B0 card first points to the marked
rock, then Helios after the sample is aboard; the Tethys delivery route appears only while
that B1 contract is active. The furnace detail now uses the corrected shared work-order recap: four marked
repair-mite sites and three marked ore pods, with CR-FEED receipts and losses shown
separately. Kessler names its Ceres receiving berth without inventing a phase or pay.
The live worksite owner still chooses the current target; neither leg is forced first.
The Scale 4 interval has no active 47-A contract to hand back, and legacy, completed,
malformed, missing, or ambiguous records keep the generic board line. `test/starter-story-handback.test.mjs`
checks those boundaries, a foreign or stale pin, the actual mission-owner B0 waypoint
projection before and after recovery, the furnace-owner objective and independent cargo ledger, no mutation,
and active-local-ticket precedence.
Combined with the existing Kessler conversation suite,
the focused Kessler, board, route, and worker-wire checks pass 62/62; this is not a
rendered-route or full-playthrough acceptance.

Final integration checks for this handback: 232/232 opening tests, six production
imports, and 12/12 unchanged Mission Log contract/failure regression tests pass.
The unrecovered B0 line names the immediate marked-rock recovery and the later
Helios delivery; after recovery it names delivery only. Original pending-payment,
authorization, mass terms and receiving-berth checks remain unchanged.

The furnace reader follow-through passes the complete 236-test opening set, plus
six imports and 12 unchanged Mission Log tests. Production intake, loss and
settlement seams cover partial cargo pay and all-lost zero cargo pay. Rendered
control-input and full Continue acceptance remain open.
