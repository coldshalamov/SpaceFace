# FB-074 — The authored light identities drive event lights instead of per-call-site hand tuning

**Kind:** wire · **Lane:** THE PICTURE · **Routing:** open
**Seam tags:** seam: vfxColorLightDirector.js, seam: vfx.js
**Write-set:** `src/render/vfxColorLightDirector.js`, `src/render/vfx.js`, `test/fb-light-director-wired.test.mjs`

## The gap
`src/render/vfxColorLightDirector.js` authors nine light identities including a capital-kill tier
(`explosionCapital`) and exports `presetFor` / `describeVfxLightPlan`. Nothing in `src/` calls them; every
event light in `vfx.js` is hand-tuned at its call site. The file's own header names the intended seam:
presenters call `presetFor()` and route through `_flashLight`.

## Why this direction
Re-tuning lights by hand was rejected; the director is the single writer the picture needs and it already
exists with a test.

## Mechanism
- Route every `_flashLight` call in `vfx.js` through `presetFor(kind)` (extend it with a severity argument);
  delete the inline colour/intensity literals it replaces.
- Bind the capital kill to `explosionCapital` so the audio's five-part beat has a matching light identity.
- Keep the reduced-motion floor from FB-077 so no preset can zero a light.

## Done when
`rg _flashLight src/render/vfx.js` shows zero inline literals; `test/fb-light-director-wired.test.mjs` asserts
every event kind used by `vfx.js` has a preset; seed-4242 Crucible capital kill produces the
`explosionCapital` plan in the VFX record.

## Do not
Do not add presets per weapon. Do not exceed the event light pool size. Do not use camera-facing discs.

## Focus test starting points
- `test/vfx-color-light-director.test.mjs`
- `test/quarks-vfx-system.test.mjs`
