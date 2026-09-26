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
```

The driver uses Python Playwright and saves diagnostic output under
`.devshots/vfx-gameplay-demo/`. The page exposes `window.__vfxDemo` for deterministic
selection and time sampling; pause playback before automated sampling.
The optional video is a labeled phase reel, not real-time playback. Use the interactive
page to watch continuous motion. Weapon samples follow the actual flight and contact times.
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
| Combustion and impact | Brief hot interfaces, breaking lobes and solid fragments, cooling cavities and residue |
| Gravity | Unequal inward capture paths, orbital shear, consumption and contracting release |
| Pressure | Directional separation, a thin advancing front, peeling and slowing wake |
| Electrical | Branch formation, travelling charge, local contact, retraction and cooling |
| Tools and Massline | Connected endpoints, transported work or load, truthful contact and release |
| Repair and transfer | Directed convergence or arrival, local completion, clean retirement |
| Propulsion | Nozzle impulse plus recorded world-space history; turns and stops preserve their different roles |

At every stage the hull, target, and gameplay footprint should remain readable. Reject visible
pixel grids, solid luminous blankets, frozen internal detail, identical repeated bursts, clipped
edges, and decorative particles unrelated to the action. Judge actual matter as matter and energy
as structured, optically thin light. Variation changes the character of an event without changing
what the player understands happened.
