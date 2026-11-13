# Elroy: preserve the person beneath the register

Source parent: `265ad60d221b7b484e9c9553d963b991c4122202`, Adventure PR #982.

## Connected experience decision

Cinder teaches profitable violence and towing; Rookside shows that the same salvage can feed life; the Nest lets a player fight or withdraw; the next writ names a civilian maintenance vessel. The later Ashfall ledger must remember the player's actual Elroy outcome rather than silently convert custody into death.

The existing live resolver in `src/systems/missionObjectiveOps.js:1245–1324` identifies a real target, records `flags.elroy_outcome`, emits `story:elroyResolved`, and completes the contract. The desk in `src/systems/story.js:_onKurtzInteract` previously wrote `DECEASED (B2)` unconditionally. The old character sheet `docs/worldbuilding/sheets/characters/elroy.md` assumes mandatory death and is historical intent, not proof custody never happened.

Decision: the desk states **CUSTODY FILED**, **DECEASED**, or **STATUS UNVERIFIED**, using the outcome flag owned by the register resolver. Custody is not claimed to prove current whereabouts or survival years later. Do not use `campaign47aOutcomeKey`: that function deliberately remaps custody/force vocabulary from later faction branches, not from a person's fate. No new false-ledger conspiracy is invented to cover the contradiction.

## Implemented delta

- `src/story/campaign47a/elroyLedger.js`: bounded note selection; reconciliation only for recognized generated ELROY COUNTERPARTY notes.
- `src/systems/story.js`: first desk construction and repeat/open reconcile the note. Other rows and custom testimony survive unchanged; no mission/choice/reward flags are modified.
- `src/data/narrative.js`: the active Ashfall hint now refers to Elroy’s B2 disposition rather than asserting death.
- `test/elroy-ledger-outcome.test.mjs`: actual desk invocation, outcome/branch distinction, preexisting old row, repeat and JSON cold-copy, custom evidence protection.

The desk reconciliation corrects older saves when reopened. It does not forge a mission receipt or create an Elroy outcome. Missing outcome does not manufacture a death. The scene's existing effects, ledger cargo, endgame trigger and dialog stay intact.

## Further route findings and useful toolbox

- `src/data/encounters/705-the-nest.js:221–233` records the escape flag `reach_nest_raids_next_lane`; repository source search finds no consuming scheduler. This remains a dormant consequence, not a playable revenge raid.
- `hangTrophy` in that file stores a plate receipt. It is not a physical Sker trophy wall.
- `src/systems/missions.js:_storyWaypointForBeat` already directs post-Nest players back to Tethys for the Registry Writ. Avoid rewriting that denied-path owner.
- `src/story/campaign47a/embodiedMissions.js` contains Helios/Tethys and later branch route tables. Their custody/force terminology must not be reused as evidence that Elroy died.

## Open goals

| Marker | Intended outcome | State / owner | Evidence | Next action / acceptance gap |
|---|---|---|---|---|
| SF-WORLD-DIRECTION | Consequences stay causally true from Book 2 to Ashfall | In progress, creative integration | Outcome-aware desk candidate | Review remaining old prose against optional custody; preserve deliberate story ambiguity, do not fabricate a death |
| SF-SECTOR-COHERENCE | Nest departure leads to the next meaningful task | In progress | Existing Tethys waypoint and real register resolver | Earned post-Nest→Tethys→Elroy flight with ordinary camera and Continue |
| SF-LIVING-WORLD | Returns expose remembered actions | In progress | Ledger repeat/open reconciliation | Observe actual return desk rendering; future raid/wall still separate unimplemented scenes |
| SF-GAME | Narrative claim survives real play | In progress | Focused owner tests | Full earned custody/force playthrough and rendered ledger acceptance remain open |

No model work, denied-path changes, visual review, earned playthrough, merge or deployment is claimed by this packet.
