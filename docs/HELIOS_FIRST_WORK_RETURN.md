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

## Current-source verification (2026-10-31)

Candidate reconciled against `coldshalamov/SpaceFace` commit
`31a011002036e625c971d315f8da08a7a32687ee`. Existing files received the original
historical delta by three-way reconciliation, not replacement with archived files.
Newer mission acceptance, navigation identity and bar contact changes are retained.
Worker/registry, rescue collider, training-rock and asset owners are unchanged.
`index.html` stays current; historical preload hints are not restored.

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
