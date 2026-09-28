# 15 — Authored bodies, place legibility and camera composition

**Current lane:** THE PICTURE  
**Build-map connections:** PQ-190, PQ-193, PQ-159; CV-GLASS, CV-PAINT, CV-MOTION  
**15 proposed packets:** SF-211–SF-225

## Existing foundation, not a blank slate

The game already separates camera/tabletop policy, visibility, authored body LOD and infrastructure motion. The source packet omits media, so no current mesh-quality verdict is justified without the full runtime assets.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Ship bodies use Forge and the current material language. Manifest/release/runtime evidence outranks prose inventory. Keep on-screen authored bodies, collision truth, physical sockets and silhouette identity across LOD; do not fix performance by lowering default art quality.

## Reusable implementation workflow

1. Inspect the current authored asset/runtime mapping and a same-camera live image before changing art. A file omitted from the packet is not a missing repository asset.
2. Specify silhouette, function and motion at the actual projected size. Use Forge for body work and current authored-place sources for station/site geometry.
3. Align collider/socket/interaction placement and materials with the visible body. Keep the source, release entry and live mapping consistent.
4. For camera changes preserve aiming projection and encounter context; for LOD changes preserve the signature silhouette and detach owned resources safely.
5. Test near/far transitions, broadside/front view, contact, dock approach, active effects and pause/revisit. Read pixel geometry at the shipping camera, not only a turntable.
6. Compare before/after with identical framing and lighting. Reject beautiful standalone art that makes navigation, target acquisition or authored identity worse.

## Ordinary-route proof

Use the normal flight camera around the player, one enemy and one destination, then inspect close/medium/distant presentation and a return after streaming.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-11: Graphics Asset Families And World Dressing](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-11_GRAPHICS_ASSET_FAMILIES_AND_WORLD_DRESSING.md)
- [WF-12: Vfx Camera Lighting And Visual Feel](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-12_VFX_CAMERA_LIGHTING_AND_VISUAL_FEEL.md)
- [WF-03: Sector World Composition](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-03_SECTOR_WORLD_COMPOSITION.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-211 — A player hull silhouette that survives normal zoom](../plans/15-picture/SF-211-a-player-hull-silhouette-that-survives-normal-zoom.md) — deepening
- [SF-212 — Enemy role recognition without a nameplate](../plans/15-picture/SF-212-enemy-role-recognition-without-a-nameplate.md) — deepening
- [SF-213 — Whole-ship LOD without disappearing identity](../plans/15-picture/SF-213-whole-ship-lod-without-disappearing-identity.md) — deepening
- [SF-214 — A destination entrance that advertises how to use it](../plans/15-picture/SF-214-a-destination-entrance-that-advertises-how-to-use-it.md) — deepening
- [SF-215 — A quiet machine with visible residual life](../plans/15-picture/SF-215-a-quiet-machine-with-visible-residual-life.md) — deepening
- [SF-216 — Background depth without dome edges](../plans/15-picture/SF-216-background-depth-without-dome-edges.md) — deepening
- [SF-217 — A material hierarchy that preserves industrial function](../plans/15-picture/SF-217-a-material-hierarchy-that-preserves-industrial-function.md) — deepening
- [SF-218 — Camera context during a real throw](../plans/15-picture/SF-218-camera-context-during-a-real-throw.md) — deepening
- [SF-219 — A large place that stays usable during combat](../plans/15-picture/SF-219-a-large-place-that-stays-usable-during-combat.md) — deepening
- [SF-220 — Aftermath variants with the same recognizable origin](../plans/15-picture/SF-220-aftermath-variants-with-the-same-recognizable-origin.md) — deepening
- [SF-221 — A convoy readable as a working group](../plans/15-picture/SF-221-a-convoy-readable-as-a-working-group.md) — deepening
- [SF-222 — A layered sky that supports sector identity](../plans/15-picture/SF-222-a-layered-sky-that-supports-sector-identity.md) — deepening
- [SF-223 — A damaged ship that remains readable and aimable](../plans/15-picture/SF-223-a-damaged-ship-that-remains-readable-and-aimable.md) — deepening
- [SF-224 — A place family with meaningful operating states](../plans/15-picture/SF-224-a-place-family-with-meaningful-operating-states.md) — deepening
- [SF-225 — An authored-picture comparison that drives a real fix](../plans/15-picture/SF-225-an-authored-picture-comparison-that-drives-a-real-fix.md) — deepening

## Owner reading map

- [`src/render/camera.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/camera.js)
- [`src/render/cameraDirector.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/cameraDirector.js)
- [`src/render/tabletopPolicy.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/tabletopPolicy.js)
- [`src/render/entityMeshVisibility.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/entityMeshVisibility.js)
- [`src/render/infrastructureMotion.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/infrastructureMotion.js)
- [`src/render/wholeShipLodPolicy.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/wholeShipLodPolicy.js)
- [`src/data/sectorVisualProfiles.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/sectorVisualProfiles.js)
- [`tools/blender/forge/FORGE.md`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/tools/blender/forge/FORGE.md)
- [`src/render/illustratedSurface.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/illustratedSurface.js)
- [`src/render/industrialMaterialFamilies.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/industrialMaterialFamilies.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
