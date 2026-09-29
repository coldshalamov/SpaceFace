# FB-084 — The kill camera beat scales with victim weight and agrees with the ear

**Kind:** deepening · **Lane:** THE PICTURE · **Routing:** open
**Seam tags:** seam: camera.js, seam: feel.js
**Write-set:** `src/render/camera.js`, `src/render/feel.js`, `test/fb-kill-beat-weight.test.mjs`

## The gap
`killCam()` is one 250 ms kiss at 0.96× for every kill; a capital gets the audio's five-part beat and the same
camera move. `deathCam()` and the release zoom prove a tiered beat is buildable; `CAMERA_TRAUMA_TUNING` is the
natural home for a weight table.

## Why this direction
Shake per kill was rejected. A weight-keyed push/hold table and a shared edge with the hush keep picture and
room agreeing.

## Mechanism
- Add a weight-keyed beat table beside `CAMERA_TRAUMA_TUNING` (light: no beat; medium: 0.96× 250 ms; heavy:
  0.93× 400 ms; capital: 0.9× 700 ms with the hush).
- Key on the same victim mass the kill audio ladder uses (FB-078) so the two tiers cannot disagree.
- Under reduced motion, keep the hold and drop the zoom.

## Done when
Seed 4242 Crucible: the camera log shows three distinct kill beats across wasp/bruiser/capital, none on wasps;
`test/fb-kill-beat-weight.test.mjs` pins the table and the reduced-motion form.

## Do not
Do not add translational shake. Do not beat on NPC-vs-NPC kills. Do not change hit-stop.

## Focus test starting points
- `test/hitstun-curve.test.mjs`
- Locate camera suites with `rg killCam test/`.
