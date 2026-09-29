# FB-078 — Light, medium and heavy kills sound different by acoustic mass, the way slams already do

**Kind:** deepening · **Lane:** THE EAR · **Routing:** open
**Seam tags:** seam: audioSystem.js, seam: audioRecipes.js
**Write-set:** `src/audio/audioSystem.js`, `src/data/audioRecipes.js`, `test/fb-kill-mass-ladder.test.mjs`
**Neighbours (extend, never restate):** SFQ-B191

## The gap
Capital kills get a five-part composed beat; every non-capital kill collapses to one voice (`sfx.killSmall`,
or `sfx.killConfirmed` when the player did it) differing only in gain. Two screens away, `resolveCollisionCue`
plus `COLLISION_LADDER` already resolve a 3×3 material×force ladder from acoustic mass and exchanged momentum,
and `sfx_kill_sine` / `sfx_kill_noise` are authored as layers of the confirm.

## Why this direction
More kill samples were rejected; the collision ladder is the proven model and the layers exist. Keying the
kill on victim mass with the same law gives a wasp and a bruiser different deaths for free.

## Mechanism
- Key the non-capital kill on `victimRadius`/mass through the same acoustic-mass→rate law `resolveCollisionCue`
  uses; light kills lean on `sfx_kill_sine`, heavy on `sfx_kill_noise`, medium blends.
- Reserve the hush for capital and structure kills as today; add no hush to small kills.
- Keep player-kill attribution (`sfx.killConfirmed`) as an added confirm layer, not a replacement.

## Done when
Seed 4242 Crucible waves 1–10: the audio record shows at least three distinct kill rates spanning
wasp→bruiser; `test/fb-kill-mass-ladder.test.mjs` pins rate monotonic in mass; `hit-voice.test.mjs` stays
green.

## Do not
Do not add samples. Do not exceed the per-target 40 ms admission. Do not add a kill tier for HP.

## Focus test starting points
- `test/hit-voice.test.mjs`
- `test/audio-wanted-heat.test.mjs`
- Locate collision-cue suites with `rg resolveCollisionCue test/`.
