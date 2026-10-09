# src/story/

Narrative libraries. `systems/story.js` is the registered overlay. `systems/missions.js` owns `beatIndex`, branch, chain progress, and beat rewards.

- `campaign47a/` writes only `state.story.campaign47a`. `recordBeatStep` must not advance the spine or pay.
- `endings/` is the live A–E plus sandbox catalog. `campaignData.ENDINGS` is a sidecar descriptor, not a second payer.
- Eligibility and resolution are pure. Story applies the plan through `faction:repDelta`, `heat:clear`, and `economy:grantCredits`.
- `storyFacts.js` is the only writer of `state.story.facts`. Cap is 64. Same id does not move `atS`, except the explicit declined-career replace. A push at the cap drops the oldest row, not the new one.
- No `Math.random` and no wall clock. Receipt ids come from `hash32` and the caller's `simTime`.
- `beatStandard.js` and `factionRegisters.js` read `docs/worldbuilding`. Do not import them from the sim loop.
