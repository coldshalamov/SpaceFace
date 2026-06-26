# SpaceFace Agent Policy

## One Game Path
- Browser play, Electron dev, Chrome probes, and packaged desktop builds must boot the same player-facing game route and entrypoint.
- Launcher differences may cover only shell concerns: window chrome, fixed local port, packaging, GPU process hints, and production debug stripping.
- A launcher must not change gameplay, assets, renderer features, UI availability, settings defaults, scenario defaults, or feature reachability.
- Normal play uses the release-authored runtime assets. Source assets are authoring/build inputs, not an alternate default game.
- Debug probes, screenshots, capture routes, and inspection globals are tooling. They must not be required to see normal game content.

## Wired Feature Policy
- Player-facing features, assets, settings, controls, missions, screens, and systems must be reachable in the default game or intentionally removed.
- Do not leave "sometimes wired" feature work behind. If it is not good enough for default play, improve it, delete it, or keep it only as a clearly named tool/test fixture.
- Browser and desktop manual testing should exercise the same assets and defaults. If a probe needs a special mode, it must prove instrumentation, not a different game.

## Concurrent Graphics Work
- Treat `assets/ships/release.__lock/`, `assets/ships/release.__building/`, running Blender/asset-export processes, and active graphics-agent edits as ownership signals.
- Do not edit, regenerate, delete, clean, format, revert, or stage `assets/**`, ship manifests, release outputs, or `src/render/**` while another graphics/asset lane is active unless the user explicitly redirects ownership.
- Performance work must not "fix" graphics conflicts by rolling assets back. If render or asset structure is the bottleneck during active graphics work, report the evidence and leave the graphics lane untouched.

## Performance Policy
- Do not solve performance by silently lowering visible quality, disabling authored assets, or making browser and desktop diverge.
- Measure before and after in Chrome/Electron-compatible runtime paths, and keep screenshots when render changes are involved.
- Prefer structural fixes: batching, instancing, cache reuse, allocation reduction, frame pacing, and avoiding duplicate system work.
- Authored model exports should merge static bolts, ribs, panels, and repeated detail into a small number of submeshes per material/animated role. Do not ship dozens of one-off primitives that turn into tiny runtime pools or per-ship draw calls.

## Verification
- Run `npm run check:launch-policy` after launcher, asset-mode, packaging, or debug-surface changes.
- Run `npm run check:flight:clean` for flight/render-loop work, then `npm run check:assets:live` and `npm run check:perf` before claiming a smoothness fix.
- Run `npm run check` before broad handoff when the change touches shared systems or launch policy.
