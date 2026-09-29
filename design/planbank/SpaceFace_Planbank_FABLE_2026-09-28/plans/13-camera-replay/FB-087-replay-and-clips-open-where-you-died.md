# FB-087 — Replay and Clips are reachable from the death screen and the Crucible results, not only Pause

**Kind:** wire · **Lane:** THE PICTURE · **Routing:** ORRERY lane
**Seam tags:** seam: gameOver.js, seam: crucible.js, seam: clips.js
**Write-set:** `src/ui/screens/gameOver.js`, `src/ui/screens/crucible.js`, `src/ui/screens/clips.js`, `test/fb-replay-from-results.test.mjs`
**Neighbours (extend, never restate):** SFQ-B058

## The gap
Photo, Replay and Clips sit in the Pause media group. Neither `gameOver.js` nor the Crucible results sheet
offers `openReplay`/`openClips`, which is where a player most wants to re-watch. `clips.js` exposes trim
handles but no playhead scrub, though it already imports `requestReplaySeek` and `replay.js` owns `seekTape`.

## Why this direction
Pure UI, so the ORRERY lane owns it; the sim half (tapes, seek) is done. Listed here so the lane sees the
whole ask at once.

## Mechanism
- Add Replay and Clips verbs to the death screen's action row and to the Crucible results sheet, with the mutual
  force-close the pause route already uses.
- Bind the existing `role="slider"` thumb in `clips.js` to `seekTape` so the clip playhead scrubs.
- Walk every control on both screens with `node scripts/ui-bench.mjs --walk` before calling it done.

## Done when
`test/fb-replay-from-results.test.mjs` opens replay from a scripted death and from a results sheet; the clips
slider seeks the tape; `pq-160-00-replay.test.mjs` and `pq-160-01-auto-clip.test.mjs` stay green.

## Do not
Do not add a second tape. Do not restyle the death screen beyond the two verbs. Do not stack replay over
clips.

## Focus test starting points
- `test/pq-160-00-replay.test.mjs`
- `test/pq-160-01-auto-clip.test.mjs`
