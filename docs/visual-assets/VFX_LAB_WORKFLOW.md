# Ship-context VFX lab

The [gameplay demo](../../scripts/vfx-gameplay-demo.html) is a small, repeatable scene for
judging production effects beside an authored ship and asteroids. It imports the game's
effect owners and materials. Changes belong in those production owners; the lab must not
correct a weak effect with substitute geometry, extra glow, or a closer camera.

The visual direction lives in [VFX_TECHNIQUE_STANDARD.md](./VFX_TECHNIQUE_STANDARD.md).
The lab is an iteration tool, not another rendering path or a claim that screenshots certify taste.

## Run it

Start an isolated local server from the repository in PowerShell:

```powershell
$env:SPACEFACE_PLAYER_STORE_DIR = ''
$env:SPACEFACE_USER_CONTENT_DIR = ''
node server.js 8769
```

Open `http://127.0.0.1:8769/scripts/vfx-gameplay-demo.html`. In a second terminal,
capture a selected action with the [capture driver](../../scripts/capture-vfx-gameplay-demo.py):

```powershell
python scripts/capture-vfx-gameplay-demo.py --scenario well --video
python scripts/capture-vfx-gameplay-demo.py --all --output .devshots/vfx-gameplay-review
python scripts/capture-vfx-gameplay-demo.py --scenario capital-rupture --continuous-video --continuous-fps 60
python scripts/capture-vfx-gameplay-demo.py --scenario singularity --context open --view wide
python scripts/capture-vfx-gameplay-demo.py --all --continuous-video --width 960 --height 540 --seed-variant 41 --context-variant open --output .devshots/vfx-sequence-review
# Compare the bundled browser with Playwright's new Chromium headless channel:
python scripts/capture-vfx-gameplay-demo.py --scenario singularity --continuous-video --continuous-max-seconds 0.5 --continuous-fps 60 --width 960 --height 540 --browser-channel chromium --output .devshots/vfx-channel-bench
```

The driver uses Python Playwright and saves diagnostic output under
`.devshots/vfx-gameplay-demo/`. The page exposes `window.__vfxDemo` for deterministic
selection and time sampling; pause playback before automated sampling.
`--video` produces a labeled phase reel. `--continuous-video` records every selected case at
normal speed, with every displayed frame sampled from the same 60 Hz simulation. It defaults to
60 fps; 24 and 30 fps are available. Capture is checkpointed in `manifest.json` at bounded chunk
intervals and can resume with `--resume`. `--continuous-max-seconds` is an explicit cap: capped
sequences are reported as truncated instead of being silently mistaken for complete lifecycles.
`timeline.html` is a compact contact sheet linking native canvas phase frames, raw continuous
frames, and any encoded MP4s. Continuous frames are retained only with
`--retain-continuous-frames`; otherwise bounded chunks are encoded and temporary PNGs are
removed. Repeat `--scenario` to select several cases; `--all` selects the whole page catalog.
Add `--seed-variant` or `--context-variant` to capture a cross-product of deterministic
seed/context variants. Use the interactive page for unlimited continuous playback.
`--browser-channel default` keeps the bundled Playwright Chromium; `chromium`, `chrome`, and
`msedge` select an installed Playwright channel for a controlled renderer comparison. The
manifest records the browser version, WebGL debug vendor/renderer when exposed, source/module
hashes, exact capture configuration, wall time, and per-chunk frame throughput. Resume rejects
changed source or configuration so frames from an older production build are not reused.
Weapon samples follow actual flight and contact times.
Rock fracture, armor breach, volatile fuel, ship collision, and capital rupture use native
cause-specific receipts. Capital destruction uses the released Colossus and its real radius/mass.
The `open` context moves actual bodies beyond the field instead of disabling the environment
response. `near` and `close` use visible, alive released bodies. Compare at the same seed, camera
and age: local flow should bend where bodies are present, while the true force boundary stays put.
Timelines include local arrival, early and mature flow, supply cutoff, release and extinction.
The report records resolution, renderer, asset-manifest identity, selected phases, and errors.

## Autonomous iteration

1. Pick the affected action and inspect its source, force, contact, and release in context.
   Keep the seed, camera, background, resolution, and bloom settings fixed across a comparison.
   Populate the same phase names and lifetime receipts as the production producer. A bomb's
   field belongs to its bomb presenter; adding an unrelated tool field changes the effect.
   Match model bounds to entity radii and use the real event payload. A hit hidden inside an
   oversized fixture, or a destroyed body left over its blast, cannot judge an effect's brightness.
2. Watch its full lifecycle. Inspect several native-resolution frames, including an early frame,
   an active frame, release, and quiet aftermath. Include the wider camera when changing thin detail.
3. Name a visible defect before changing code. Give one worker the exact production paths and
   another the lab/capture paths when parallel work helps. Preserve concurrent changes.
4. Fix the production effect, then replay the affected scenario. Check silhouette and internal
   motion before judging glow. Turn bloom off to inspect construction, then judge with production bloom.
5. Run the focused lifecycle/behavior tests for that owner. Check shader errors, pause,
   reduced motion/flash, and cleanup. Record the renderer used; software rendering cannot
   establish hardware frame-rate performance.
6. Stop once the visible defect is resolved and the relevant checks pass. Broaden the scenario
   only if the change affects a shared material or a new overlap reveals a concrete problem.

## What to look for

| Family | Causal motion and finish |
|---|---|
| Destruction | Mineral fracture fans, directional armor tearing, reactor cavities, or rolling fuel fire; material-specific fragments and cooling |
| Gravity | Unequal inward arrival, differential shear, mature recirculation, then supply cutoff and draining fragments |
| Pressure | Broad bowed advancing crests with depth, open sectors, peeling and slowing wake |
| Electrical | Branch formation, travelling charge, local contact, disconnected branches and cooling |
| Tools and Massline | Connected endpoints, transported work or load, truthful contact and release |
| Repair and transfer | Directed convergence or arrival, local completion, clean retirement |
| Propulsion | Nozzle impulse plus recorded world-space history; turns and stops preserve their different roles |

At every stage the hull, target, and gameplay footprint should remain readable. Reject visible
pixel grids, solid luminous blankets, frozen internal detail, identical repeated bursts, clipped
edges, and decorative particles unrelated to the action. Judge actual matter as matter and energy
as substantial translucent material with moving dark channels and hot crests. Variation changes the character of an event without changing
what the player understands happened.
