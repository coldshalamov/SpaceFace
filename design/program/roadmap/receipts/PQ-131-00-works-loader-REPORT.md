<!-- LIFETIME: HISTORICAL -->
# PQ-131.00 — Works-context loader receipt

- **packetId:** PQ-131
- **leafId:** PQ-131.00
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS
- **acceptance:** focused_green

## What changed

`createWorksPartLoader({ renderer })` binds authored release loading to the mine's own WebGL
context through ONE seam: `loadWorksPart(id)` returns a LOD-aware group with named hooks;
`setRegister('work'|'site')` flips LOD0 (work register) / LOD1 (site) on every live group;
`dispose()` on screen exit fires three.js's REAL disposers (the asset system's ownership wrapper
was no-op'ing `.dispose` while the lease only dropped its ticket — the live leak a mock could not
see until the mock was strengthened to render-before-dispose and model the wrapper). Production
loads ride the existing authored-asset lease and the process-wide shared Basis transcoder /
meshopt singleton — no second KTX2 stack; main-game loading files untouched. The works camera
library (`tools/blender/spaceface_works_camera.py`) and capture harness shipped alongside.

## Proven in the LIVE mine (controller GPU gate, exit 0)

`scripts/capture-works-release-part.mjs`: the drill platform loads and renders in the running
works screen at both registers with exact LOD sets (8 LOD0 material groups visible at work, 8 LOD1
at site, 0 untagged meshes), correct color space, shadows suppressed as contracted, and disposes
across hide/remount/full-teardown with ZERO growth across cycles. The dispose bound is honest to
the repo's own residency policy: the shared authored-asset runtime retains a bounded one-time
warmth (≤8 geometries allowance, measured 5) exactly as the flight game's ref-counted residency
does; a per-cycle leak fails loudly. Headless suite 3/3 (strengthened mock now reproduces the leak
class red). Evidence stills + renderer_info in assets/works/evidence/PQ-131.00/.

## Unblocked

Every PQ-131 art unit (.01+: rover, Core, extractor, refinery, derrick, conduits, gas tap,
fabricator, port, inclusions) can now load its authored release body in the works renderer, and
PQ-130's blocked acceptance has its prerequisite. The capture harness photographs any part at both
registers via `capture-asteroid-works.mjs --part=<id>`.
