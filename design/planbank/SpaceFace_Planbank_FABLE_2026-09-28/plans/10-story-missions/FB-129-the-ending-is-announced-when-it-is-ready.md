# FB-129 — The finale-ready signal and the written archive reach the player as a comms beat and a codex entry

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: story.js, seam: comms.js, seam: codex.js
**Write-set:** `src/systems/story.js`, `src/ui/comms.js`, `src/ui/screens/codex.js`, `test/fb-ending-announced.test.mjs`
**Neighbours (extend, never restate):** NXB-047, NXI-186

## The gap
`endgame:finaleReady` is emitted with the written ending archive and `endgame:archive` with the archive
record; neither has a listener. A player who has qualified for an ending learns it from the eligibility gate
at the board, not from the world. NXB-047 tests the endings' permissions across return visits; NXI-186 forbids
re-presenting a resolved ending; neither announces readiness.

## Why this direction
The story owner already composes the archive; two consumers make it a moment: one comms line when the finale
becomes ready, one codex Archive entry when the archive is written.

## Mechanism
- Subscribe `comms.js` to `endgame:finaleReady` for a once-per-save comms popup naming the reachable ending(s),
  gated by the voice arbiter.
- Subscribe the codex Archive tab data path to `endgame:archive` so the written archive appears without a reload
  (functional edit).
- Pin once-only announcement across save/load and that a resolved ending never re-announces.

## Done when
`test/fb-ending-announced.test.mjs`: one comms line on readiness, one archive entry, none after resolution;
`ending-choice-c-route.test.mjs` stays green.

## Do not
Do not add a new ending. Do not re-present a resolved ending. Do not interrupt combat voice.

## Focus test starting points
- `test/ending-choice-c-route.test.mjs`
- `test/post-ending-replay-chains.test.mjs`
