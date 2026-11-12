# FIX-R5b — Fifth review: four C01-05 round-mechanic defects

**Lane 2. After C01-05.** Source: `design/program/fleet/reviews/2026-11-12-9615eb79.md` — read these in full. All in
`src/systems/swarmCourseTwists.js`:
1. **[HIGH] Reavers rob the player when they collide with each other** (:240) — remove the thief-thief fallback
   `|| (a && b ? a : null)`; a theft requires one impact endpoint to be `state.playerId`.
2. **[MED] Yardmaster spends both lane reversals immediately** (:350) — compare elapsed **round** ticks from the round's
   activation (capture it on activation, or use the wave owner's round-relative clock), not global `state.tick`.
3. **[MED] Law reinforcements ignore an already-active freight warning** (:325) — keep the active warning/lane until clear
   and apply the hold to new eligible Lawmen/Cutters as they materialize.
4. **[LOW] A refused odd-member chain bind is permanently discarded** (:444) — dequeue the odd hull only after `bind`
   returns true.

## Checks
One focused test per finding with the real producers' payloads (`physics:contact` aId/bId, `run:waveStarted`, the real
reinforcement path, a refusing attachment service) — each must fail before your fix. `node --test test/swarm-course*.test.mjs
test/swarm*.test.mjs` against the known reds; `node --test test/manifest-declarations-complete.test.mjs`;
`npm run gate` (full — it boots a Swarm round). Commits: one per finding, `fix(FIX-R5b): <what the player gets>`.
