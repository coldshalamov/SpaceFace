# S2 scene plates

RESULT: DONE for the local draft-plate packet. Four new scene builders plus the optional
cold berth are added; all five native 1920 x 1080 RGB PNGs were rendered and visually inspected.
Nothing was staged or committed. No requested draft plate or report is missing.

## Scenes and intended frames

| Scene / output | Use and composition |
|---|---|
| `berth` / `plates/plate-berth.png` | P03 docking arrival and Market. Native dock interior, overhead crane/cable, service gantry, equipment rack, cargo pod and practical lights. Hitch sits on two native skid assemblies on the deck's service pad. Hull stays centre-right; the left half is the calm wall/deck and service foreground. |
| `chart-field` / `plates/plate-chart-field.png` | P04 galaxy chart. Three deterministic star-depth slabs, two faint spatial dust volumes, eight named systems and eleven subdued, non-emissive lane connections. Centre stays free of bright stars. Sector labels and UI belong to the consuming frame. |
| `workshop-bench` / `plates/plate-workshop-bench.png` | P04 Settings. Native dock service plinth, access steps, indexed tool cassettes and a native repair-patch assembly on the work deck; warm practicals, shallow focus and a subdued background. |
| `ship-rig` / `plates/plate-ship-rig.png` | P03 THE SHIP and P04 Load. Same physical berth and supports, with a closer, clean three-quarter presentation of the whole Hitch hull. |
| `berth-cold` / `plates/plate-berth-cold.png` | Optional wanted-temperature plate. Same berth geometry, positions and camera, with cold white-blue practicals and fill. |

## Final renders

| Plate | Samples | Resolution | Wall time | File size |
|---|---:|---|---:|---:|
| `plate-berth.png` | 48 | 1920 x 1080 | 125.51 s | 2.31 MiB |
| `plate-chart-field.png` | 48 | 1920 x 1080 | 69.96 s | 1.53 MiB |
| `plate-workshop-bench.png` | 48 | 1920 x 1080 | 109.30 s | 1.84 MiB |
| `plate-ship-rig.png` | 48 | 1920 x 1080 | 137.76 s | 2.30 MiB |
| `plate-berth-cold.png` | 48 | 1920 x 1080 | 128.41 s | 2.31 MiB |

Total serial wall time: 570.94 s. Times include scene import,
Cycles rendering, denoising and PNG write. Logs: `render-<scene>.log`.

## Reproduction

From the repository root, run `python .devshots/ui-packets/S2-work/render_plates.py` to render
all five serially and capture the exact command, elapsed wall time, PNG hash and byte size.
Blender is 5.1.2. All plates use the existing `W.stage`: Cycles CPU, denoising, AgX / None,
6 maximum bounces, 6 transmission bounces, 2 volume bounces, opaque RGB PNG, native 1920 x 1080.
Final draft samples: 48. No upscaling or painted replacement pixels.

Individual command (PowerShell; replace `berth` with another scene name):

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' -b --factory-startup --python-exit-code 1 --python assets/ui/kit/tools/bl_scenes.py -- berth samples=48 width=1920
```

The five S2 scene names default to this packet's `plates/` directory. To specify an output,
pass an **absolute** PNG path after the scene name; Blender resolves relative render paths
against its own blend-file base, which can differ from the shell working directory.
The five existing scenes retain their old CLI defaults.

Regression command:

```powershell
$s2Regression=Join-Path (Resolve-Path '.devshots/ui-packets/S2-work').Path 'draft-flight.png'
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' -b --factory-startup --python-exit-code 1 --python assets/ui/kit/tools/bl_scenes.py -- flight $s2Regression samples=12 width=960
```

## Preservation and direct checks

- **Existing scene functions touched: none.** Exact source-segment comparison confirms all
  five original builders are unchanged, as are every existing function in `bl_common.py`.
  Only additive S2 builders/helpers, scene registry entries, S2 output defaults and the module
  description changed. `bl_world.py` is untouched.
- Both changed Python files compile; `git diff --check` passes. Nothing in the write set is staged.
- `flight` rendered successfully at 960 x 540 / 12 samples. Side-by-side visual comparison
  against the approved plate confirms identical hull orientation/size/position, upper-left
  cargo pod, upper-right asteroid and partial top-left rock. `flight-comparison.png` shows
  approved (left, downsampled) versus fresh (right); `flight-difference.png` is the raw RGB diff.
  Mean channel difference is approximately 0.71 / 0.64 / 0.69 on a 0-255 scale; expected sampling
  differences are not treated as a framing change.
- The eight sector positions and eleven connections were checked against the current native
  graph (`src/data/sectors.js`, including the Dione extension). No other sectors were added.
- New supporting props use only their authored LOD0. S2 imports fresh hierarchies because the
  existing cache duplicates nested objects without remapping their parents. This avoids misplaced
  second instances without altering the old loader or any S1 output.
- Native material maps and normals are retained. Scene-only adjustments use the existing accent
  remap, warm/cold light lenses, and matte service coating on the native skids/repair assembly.
  The dock, hull, gantry, tools and stand are not primitive stand-ins. Floor extension is the
  existing harness ground plane; chart points/etches and bounded dust volumes are spatial notation.

## Material preflight and provenance

`NOTES.md` records the preflight, complete visible-zone register, bill and scope before authoring.
`asset-inspection.json` records native bounds/material families. `source-hashes.json` identifies
the read-only GLBs. `checks.json` records exact function preservation and the regression comparison.
`render-results.json` binds each output to its command and PNG hash; `checks.json` also records
the final producer hashes. Native source hashes stayed unchanged throughout final rendering. Source models and source
textures were not modified or exported. No third-party model or image-generation tool was used.

Approved grade references were found at `design/frontend/direction/approved/plates/`: title-v1,
selected title-v2, crucible-door, and flight. The missing attachment paths omitted `plates/`
and the title version.

## Review scope / remaining items

These are **draft composition plates**, as requested. They do not promote or remaster the source
GLBs, certify whole-asset G1/G2/G4, or replace the consuming S2 frame review. No technical render blocker remains. The native tool
cassettes and repair assembly are service equipment; no separate hand-tool model set was invented.
The workshop's usefulness behind Settings text and the hull-window crop are for that composition
review. Labels, bench hardware, animation, runtime integration and final-quality sampling are
outside this scene packet.

During drafting, the berth's right-edge hull crop and cyan support accents were corrected. The
chart's distant stars were initially hidden by the camera's 1000-unit far clip; its S2-only
camera now reaches 20000 units. Background stars were then reduced in density/brightness so the
eight sector points retain priority. The transient diagnostic PNG that Blender first wrote at
`C:\.devshots` was moved into this work directory, and its empty accidental directories removed.

Final visual draft check: all five outputs inspected at native resolution. The warm berth and
ship rig retain a legible hull, constructed supports, deck contact and warm/cool material
separation. The workshop is subdued and its rear falls out of focus. The chart has eight
clear points above the quieter stars/dust and no bright centre object. The cold variant matches
the warm berth composition and visibly changes the illumination temperature. No independent
whole-asset acceptance is claimed.

## Follow-up: hangar wall and cold workshop — 2026-09-11

RESULT: DONE. Added `hangar-wall`, `hangar-wall-cold` and `workshop-bench-cold` to the
scene registry and rendered all three requested plates. The packet now contains eight plates.

| Scene / output | Composition | Samples | Resolution | Wall time |
|---|---|---:|---|---:|
| `hangar-wall` / `plates/plate-hangar-wall.png` | Near-frontal dressed dock wall, shallow depth, edge gantries, service runs, cabinets, crane cable and warm practicals. Central wall panels remain quiet signage space with no hero object. | 48 | 1920 x 1080 | 171.23 s |
| `hangar-wall-cold` / `plates/plate-hangar-wall-cold.png` | Exact warm-wall assembly and camera with white-blue practicals and cooler fill. | 48 | 1920 x 1080 | 157.06 s |
| `workshop-bench-cold` / `plates/plate-workshop-bench-cold.png` | Exact existing workshop assembly, camera, exposure and shallow focus with cold practical illumination. | 48 | 1920 x 1080 | 144.00 s |

Total serial plate wall time: 472.29 s. Blender 5.1.2, Cycles CPU, denoising, existing AgX / None
grade, native RGB PNGs. Cold variants call their warm builder and then change light colours and
untextured practical-lens colours; geometry, positions, light energy, camera, DOF and exposure
are preserved. Native wear maps, normals and non-emissive surface materials are retained.

Reproduce from the repository root:

```powershell
python .devshots/ui-packets/S2-work/render_followup.py
```

This renders the three full-size plates plus the flight regression at 960 x 540 / 12 samples.
`followup-render-results.json` contains every exact Blender command, elapsed time, byte size,
PNG hash, producer hash and native-input hash. Each new scene name also defaults to its requested
filename under this packet's `plates/` directory through the existing CLI. Logs are
`followup-render-<scene>.log`.

Direct checks and visual review:

- All three requested PNGs decode as RGB at 1920 x 1080 and match the recorded render hashes;
  each final command used 48 samples. All three were inspected at native resolution.
- The warm wall has a restrained amber grade and an empty central panel field. The cold wall
  preserves that composition with visibly cooler light. The cold workshop preserves the warm
  bench crop, foreground repair assembly, background falloff and material relief.
- Every function present before this follow-up is unchanged. `bl_common.py` and `bl_world.py`
  are unchanged by this follow-up, and all five earlier plate files retain their original hashes.
  Native GLBs and producer sources stayed unchanged throughout the final renders.
- Python compilation and whitespace checks passed. The fresh flight regression retained the
  approved framing; mean RGB difference was 0.71 / 0.64 / 0.69 on the 0–255 scale.
  `followup-flight-comparison.png` shows approved left and fresh right. `followup-checks.json`
  records the checks, and `followup-before.json` records the earlier plate/source identities.

Changes for this follow-up are limited to additive builders/helper, registry/default-path entries
and the module description in `assets/ui/kit/tools/bl_scenes.py`, plus files under this packet's
work directory. No staging or commits. No requested follow-up output is missing and no render
blocker remains. These remain draft composition plates for the consuming S2 frame review;
no whole-asset release acceptance or runtime integration is claimed.
