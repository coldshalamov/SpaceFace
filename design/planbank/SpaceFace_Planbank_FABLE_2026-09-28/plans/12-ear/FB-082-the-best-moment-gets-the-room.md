# FB-082 — A razor release or slingshot apex gets the hush and the camera beat a capital kill already gets

**Kind:** deepening · **Lane:** THE EAR · **Routing:** open
**Seam tags:** seam: audioSystem.js, seam: camera.js
**Write-set:** `src/audio/audioSystem.js`, `src/render/camera.js`, `test/fb-stunt-hush.test.mjs`

## The gap
`_triggerHush` has four call sites (capital kill, station destroyed, ≥4 hits, player death); none is the
player's own best moment. `sfx_stunt_link`/`sfx_stunt_bank` fire as plain one-shots and `sfx_massline_apex`
marks the crest with no room around it. `MASSLINE_RELEASE_ZOOM_MIN/MAX/DURATION` already exist in `camera.js`,
so the camera half is buildable. Adjacent to SF-218 (camera context during a throw), which is framing during
the swing, not the beat at release.

## Why this direction
A louder sting was rejected; the design tool for "this mattered" is silence and room. The hush envelope and
the release zoom both exist.

## Mechanism
- Call `_triggerHush({ kind: 'capital' })`-depth on the razor-rated release (`tether:releaseRated` at the top
  band) and on the slingshot apex cue; 0.35 s attack, steep release as the existing envelope.
- Trigger the release zoom beat on the same edge and hold it for the hush duration; reduced motion keeps the
  hush and drops the zoom.
- Rate-limit to one room per 6 s so a chain of good releases does not become a strobe of silence.

## Done when
Seed 4242 scripted razor release: the audio record shows one hush envelope and the camera log one release zoom
on the same tick; a clean-band release produces neither; `test/fb-stunt-hush.test.mjs` pins both and the 6 s
limiter.

## Do not
Do not add trauma or particles. Do not hush on every release grade. Do not change the release rating law.

## Focus test starting points
- `test/inf-048-shield-duck.test.mjs`
- `test/massline-release-ghost.test.mjs`
