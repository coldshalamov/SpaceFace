# Force-language VFX: mandatory animation contract

Read `docs/visual-assets/VFX_LIFECYCLE_STANDARD.md` before changing this directory.

An existing powered tool must visibly animate with **zero affected bodies**. `engaged` is contact,
not power. Every recipe needs ignition/build, sustained shape/transport motion, and a distinct
release. A screenshot or a changing uniform cannot prove this. Run the production-adapter pixel
capture and include the movie and `temporal-results.json` with source hashes.

Keep simulation state read-only; snapshot reused producer values into retained slots. Keep the
true footprint separate from the growing body; remove force boundaries immediately on release.
Respect pause, accessibility, floating origins, stable id reuse, and bounded residue admission.
Do not add a private animation loop or expand the point-light budget.

Checks: `npm run check:vfx-force-language`, `check:vfx-sleep`, `check:vfx-techniques`,
`npm run capture:vfx-force-language -- --video` (Python Playwright + Chromium; ffmpeg for video).
