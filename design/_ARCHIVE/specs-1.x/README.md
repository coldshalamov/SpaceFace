# design/_ARCHIVE/specs-1.x/ — Legacy 1.x subsystem specs (ARCHIVED 2026-07-13)

> **ARCHIVED. Do not implement from these.** The original 12 subsystem specs (00-11), written
> 2026-07-04. Every subsystem they describe is now implemented in `src/` and has a live successor in
> `design/spec2/` or `design/spec3/` that outranks this folder.
>
> Kept for historical context and git-blame only. The live authority chain is:
> `ARCHITECTURE.md` > `design/GDD_2_0.md` > `design/spec2/00_MASTER_TASTE.md` >
> `design/vision/ALPHA_PROGRAM.md` > the specific `design/spec2/` / `design/spec3/` task spec.
>
> **Two files were active anti-guidance before archiving** — do not follow either as current policy:
> - `09-ui-ux-hud-menus-screen-management-dom-overlay.md` mandated glassmorphic `backdrop-filter:blur(8px)`
>   panels. The current repository has no universal blur, transparency, or opaque-panel recipe;
>   choose the strongest accessible treatment and measure the owning compositor path.
> - `10-art-vfx-direction-three-js-primitives-only.md` mandated "three.js primitives only, no shadow maps,
>   no postprocessing addon." The live direction is authored GLB parts via `partsLibrary.js` /
>   `visualFactory.js` with a real post pipeline (spec3-F8/F9). The title mandate is dead.
>
> The structural architecture notes in 09 (ScreenManager modal stack, z-layers, split update cadence)
> and the procedural-noise math in 10 survive in the live code and are not re-derived here.
