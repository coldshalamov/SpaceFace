# Scene Truth observatory

Catches invisible-but-collidable hulls, wrong packages, bad bounds, pops, deep
overlaps, scaled props hiding neighbors, VFX that cover contacts, illegal depth
order, and late package admission. It does this with object ids and
render-package metadata on the authoritative lab runtime.

It is not a UI screenshot matrix and it does not retune shading.

## Run

```
node tools/scene-truth/cli.mjs
node tools/scene-truth/cli.mjs --only=scene.starter-rest --out=artifacts/scene-truth
node tools/scene-truth/cli.mjs --list
node --test tools/scene-truth/test/*.test.mjs
```

The atlas is `index.html`, `report.md`, `issues.csv`, `report.json`, and
`verdict.json` under the output directory. Default output is
`artifacts/scene-truth/`.

## What a capture is

Each scenario is a `spaceface.simScenario.v1` document. Authored scenes use
production ship, enemy, and payload profiles. Four scenes rerun existing lab
fixtures. Stations, gates, beacons, and landmarks are joined from authored
sector anchors because the flight-lab bundle does not call `world.enterSector`.

The runner is `runLabScenarioInternal` with checkpoint surfaces retained. The
public `runLabScenario` entry refuses that option. The sim is still
`createAuthoritativeRuntime`. Rendering stays detached, so the SVG files are
labeled semantic projections. `runtimeFps` is null. `captureCostMs` is wall
time spent building the witness, not a frame time.

Legal zooms are `CAMERA_ZOOM_MIN`, the shipping chase zoom 144, and
`CAMERA_ZOOM_MAX`. Quality tiers are the shipping presets. Penetration uses
the flight-plane stick from `src/data/modelTruthMath.js`.

Pixel, exposure, anti-alias, and compositor drift is a review item.

## Not applied

`ADAPTER.md` is the read-only renderer hook. It is not patched into
`src/render/**`.
