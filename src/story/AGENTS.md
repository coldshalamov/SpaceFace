# src/story/

Narrative libraries. `systems/story.js` is the registered overlay. `systems/missions.js` owns `beatIndex`, branch, chain progress, and beat rewards.

- `campaign47a/` writes only `state.story.campaign47a`. `recordBeatStep` must not advance the spine or pay.
- `campaign47a/storySpine.js` is the only writer of `campaign47a.flags.spine`. It stores the verb the payload carried, a method only when that method is one of the beat's two solutions, the deployed asset kind, the door taken, the doors refused, and the open miss. It reads `state.morrow` and never writes it. It reads `story.flags.deep_reach_operation_complete` and `deep_reach_variant` and does not write them. `buildMissionBoardContract` applies the miss to the offer only when the caller passes `options.state`. A headline verb is not spoken as a solution.
- Depth-program blurbs may change on the card returned for a station. The frozen contact list stays authored. Dorin and Kell stay on the witness seam. A filed ending is spoken at Helios by Maera and Halev, still inside twelve words.
- `endings/` is the live A–E plus sandbox catalog. `campaignData.ENDINGS` is a sidecar descriptor, not a second payer.
- Eligibility and resolution are pure. Story applies the plan through `faction:repDelta`, `heat:clear`, and `economy:grantCredits`.
- `storyFacts.js` is the only writer of `state.story.facts`. Cap is 64. Same id does not move `atS`, except the explicit declined-career replace. A push at the cap drops the oldest row, not the new one.
- No `Math.random` and no wall clock. Receipt ids come from `hash32` and the caller's `simTime`.
- `beatStandard.js` and `factionRegisters.js` read `docs/worldbuilding`. Do not import them from the sim loop.
