# Scene Truth atlas

Verdict: **pass** (integration-ready).

This gallery is semantic 3D scene integrity. It is not the UI screenshot matrix.

## Limitations
- Lab rendering is detached. These images are semantic projections of sim poses and package metadata, not GPU frames.
- Frame half-extents follow camera.js clampFocusToPlayerSafeRect (fov, zoom, 0.72, 16:9). A tilted frustum can show more ground than this safe rect.
- Pixel, exposure, anti-alias, and compositor differences are review items. They do not fail the build.
- Stations, gates, beacons, and landmarks are joined from authored sector anchors because the flight-lab bundle does not call world.enterSector.
- Asteroid rings use the production place id and size range at the authored field center. They are not a second scatter simulation.
- Shield hit points are not on the lab checkpoint surface. Shield discs use the ship or enemy def shield stat with coverage 0.22.
- No WebGL context is created. runtimeFps is null. captureCostMs is witness wall time, not a frame-time measurement.
- Whole-ship LOD runtime demotion is off. Census LOD outline flags are review items, not drawn swaps.

## Command

```
node tools/scene-truth/cli.mjs
```

Commit 6ca1f1e22bcd5a0d9870bb27a29349c7c60ddb8e. Scenarios 26. High fails 0. Reviews 4.
Sim wall 702 ms. Atlas wall included in captureCostMs 708 ms. runtimeFps: null.

## Scenarios

| id | source | objects | lab | high fails |
|---|---|---:|---|---:|
| scene.starter-rest | authored | 1 | pass | 0 |
| scene.starter-cruise | authored | 1 | pass | 0 |
| scene.enemy-crowd | authored | 9 | pass | 0 |
| scene.capital-leviathan | authored | 2 | pass | 0 |
| scene.capital-colossus | authored | 2 | pass | 0 |
| scene.station-helios | authored | 2 | pass | 0 |
| scene.station-military | authored | 2 | pass | 0 |
| scene.asteroid-collision | authored | 5 | pass | 0 |
| scene.dense-tethers | authored | 8 | pass | 0 |
| scene.jump-arrival | authored | 2 | pass | 0 |
| scene.size-extremes | authored | 3 | pass | 0 |
| scene.damaged-components | authored | 3 | pass | 0 |
| scene.shields | authored | 2 | pass | 0 |
| scene.ore-pods | authored | 7 | pass | 0 |
| scene.offscreen-onscreen | authored | 2 | pass | 0 |
| scene.wreck-cathedral | authored | 2 | pass | 0 |
| scene.dead-hulk | authored | 2 | pass | 0 |
| scene.opening-traffic | authored | 6 | pass | 0 |
| scene.saucer | authored | 2 | pass | 0 |
| scene.hawser-tug | authored | 2 | pass | 0 |
| scene.damaged-capital | authored | 2 | pass | 0 |
| scene.gate-buoy | authored | 3 | pass | 0 |
| fixture.production-canary | fixture | 27 | pass | 0 |
| fixture.massline-latch | fixture | 2 | pass | 0 |
| fixture.flight-fixed-input | fixture | 1 | incomplete | 0 |
| fixture.flight-save-load | fixture | 1 | incomplete | 0 |

## Issues

- **review surface-identity-omitted** `fixture.production-canary` tick 2 zoom 144 tier low objects checkpoint-surface
  - expected: place or package id on the checkpoint
  - observed: 13 entities (asteroid, beacon, freighter, fx, wreck)
  - The lab checkpoint keeps defId only. These entities have no package id on that surface, so a missing model is not claimed. ADAPTER.md names the live hook that would copy it.
  - `node tools/scene-truth/cli.mjs --only=fixture.production-canary`

## Captures

- [scene.starter-rest zoom 45](captures/scene.starter-rest/z45.svg)
- [scene.starter-rest zoom 144](captures/scene.starter-rest/z144.svg)
- [scene.starter-rest zoom 330](captures/scene.starter-rest/z330.svg)
- [scene.starter-cruise zoom 45](captures/scene.starter-cruise/z45.svg)
- [scene.starter-cruise zoom 144](captures/scene.starter-cruise/z144.svg)
- [scene.starter-cruise zoom 330](captures/scene.starter-cruise/z330.svg)
- [scene.enemy-crowd zoom 45](captures/scene.enemy-crowd/z45.svg)
- [scene.enemy-crowd zoom 144](captures/scene.enemy-crowd/z144.svg)
- [scene.enemy-crowd zoom 330](captures/scene.enemy-crowd/z330.svg)
- [scene.capital-leviathan zoom 45](captures/scene.capital-leviathan/z45.svg)
- [scene.capital-leviathan zoom 144](captures/scene.capital-leviathan/z144.svg)
- [scene.capital-leviathan zoom 330](captures/scene.capital-leviathan/z330.svg)
- [scene.capital-colossus zoom 45](captures/scene.capital-colossus/z45.svg)
- [scene.capital-colossus zoom 144](captures/scene.capital-colossus/z144.svg)
- [scene.capital-colossus zoom 330](captures/scene.capital-colossus/z330.svg)
- [scene.station-helios zoom 45](captures/scene.station-helios/z45.svg)
- [scene.station-helios zoom 144](captures/scene.station-helios/z144.svg)
- [scene.station-helios zoom 330](captures/scene.station-helios/z330.svg)
- [scene.station-military zoom 45](captures/scene.station-military/z45.svg)
- [scene.station-military zoom 144](captures/scene.station-military/z144.svg)
- [scene.station-military zoom 330](captures/scene.station-military/z330.svg)
- [scene.asteroid-collision zoom 45](captures/scene.asteroid-collision/z45.svg)
- [scene.asteroid-collision zoom 144](captures/scene.asteroid-collision/z144.svg)
- [scene.asteroid-collision zoom 330](captures/scene.asteroid-collision/z330.svg)
- [scene.dense-tethers zoom 45](captures/scene.dense-tethers/z45.svg)
- [scene.dense-tethers zoom 144](captures/scene.dense-tethers/z144.svg)
- [scene.dense-tethers zoom 330](captures/scene.dense-tethers/z330.svg)
- [scene.jump-arrival zoom 45](captures/scene.jump-arrival/z45.svg)
- [scene.jump-arrival zoom 144](captures/scene.jump-arrival/z144.svg)
- [scene.jump-arrival zoom 330](captures/scene.jump-arrival/z330.svg)
- [scene.size-extremes zoom 45](captures/scene.size-extremes/z45.svg)
- [scene.size-extremes zoom 144](captures/scene.size-extremes/z144.svg)
- [scene.size-extremes zoom 330](captures/scene.size-extremes/z330.svg)
- [scene.damaged-components zoom 45](captures/scene.damaged-components/z45.svg)
- [scene.damaged-components zoom 144](captures/scene.damaged-components/z144.svg)
- [scene.damaged-components zoom 330](captures/scene.damaged-components/z330.svg)
- [scene.shields zoom 45](captures/scene.shields/z45.svg)
- [scene.shields zoom 144](captures/scene.shields/z144.svg)
- [scene.shields zoom 330](captures/scene.shields/z330.svg)
- [scene.ore-pods zoom 45](captures/scene.ore-pods/z45.svg)
- [scene.ore-pods zoom 144](captures/scene.ore-pods/z144.svg)
- [scene.ore-pods zoom 330](captures/scene.ore-pods/z330.svg)
- [scene.offscreen-onscreen zoom 45](captures/scene.offscreen-onscreen/z45.svg)
- [scene.offscreen-onscreen zoom 144](captures/scene.offscreen-onscreen/z144.svg)
- [scene.offscreen-onscreen zoom 330](captures/scene.offscreen-onscreen/z330.svg)
- [scene.wreck-cathedral zoom 45](captures/scene.wreck-cathedral/z45.svg)
- [scene.wreck-cathedral zoom 144](captures/scene.wreck-cathedral/z144.svg)
- [scene.wreck-cathedral zoom 330](captures/scene.wreck-cathedral/z330.svg)
- [scene.dead-hulk zoom 45](captures/scene.dead-hulk/z45.svg)
- [scene.dead-hulk zoom 144](captures/scene.dead-hulk/z144.svg)
- [scene.dead-hulk zoom 330](captures/scene.dead-hulk/z330.svg)
- [scene.opening-traffic zoom 45](captures/scene.opening-traffic/z45.svg)
- [scene.opening-traffic zoom 144](captures/scene.opening-traffic/z144.svg)
- [scene.opening-traffic zoom 330](captures/scene.opening-traffic/z330.svg)
- [scene.saucer zoom 45](captures/scene.saucer/z45.svg)
- [scene.saucer zoom 144](captures/scene.saucer/z144.svg)
- [scene.saucer zoom 330](captures/scene.saucer/z330.svg)
- [scene.hawser-tug zoom 45](captures/scene.hawser-tug/z45.svg)
- [scene.hawser-tug zoom 144](captures/scene.hawser-tug/z144.svg)
- [scene.hawser-tug zoom 330](captures/scene.hawser-tug/z330.svg)
- [scene.damaged-capital zoom 45](captures/scene.damaged-capital/z45.svg)
- [scene.damaged-capital zoom 144](captures/scene.damaged-capital/z144.svg)
- [scene.damaged-capital zoom 330](captures/scene.damaged-capital/z330.svg)
- [scene.gate-buoy zoom 45](captures/scene.gate-buoy/z45.svg)
- [scene.gate-buoy zoom 144](captures/scene.gate-buoy/z144.svg)
- [scene.gate-buoy zoom 330](captures/scene.gate-buoy/z330.svg)
- [fixture.production-canary zoom 45](captures/fixture.production-canary/z45.svg)
- [fixture.production-canary zoom 144](captures/fixture.production-canary/z144.svg)
- [fixture.production-canary zoom 330](captures/fixture.production-canary/z330.svg)
- [fixture.massline-latch zoom 45](captures/fixture.massline-latch/z45.svg)
- [fixture.massline-latch zoom 144](captures/fixture.massline-latch/z144.svg)
- [fixture.massline-latch zoom 330](captures/fixture.massline-latch/z330.svg)
- [fixture.flight-fixed-input zoom 45](captures/fixture.flight-fixed-input/z45.svg)
- [fixture.flight-fixed-input zoom 144](captures/fixture.flight-fixed-input/z144.svg)
- [fixture.flight-fixed-input zoom 330](captures/fixture.flight-fixed-input/z330.svg)
- [fixture.flight-save-load zoom 45](captures/fixture.flight-save-load/z45.svg)
- [fixture.flight-save-load zoom 144](captures/fixture.flight-save-load/z144.svg)
- [fixture.flight-save-load zoom 330](captures/fixture.flight-save-load/z330.svg)

## Critique

Critique tried 29 ways to disprove the detector. Planted faults were caught, benign contacts were allowed, and pixel drift stayed a review item.

