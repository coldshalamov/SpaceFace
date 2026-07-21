# Fleet Breadth Foundry — Contract & Harness Workflow

The one-page contract every lane shares: where candidate assets live, how they are
named, what budgets they must hit, and the exact commands to render + validate a
candidate. The render/validation harness (Lane B) lives under `tools/foundry/`.

## Foundry paths (new files only — never touch `release/`, `parts_manifest.json`, `partsLibrary.js`, `visualFactory.js`, `registry.js`, `gameState.js`, `design/program/`)

| Path | Contents |
| --- | --- |
| `assets/ships/foundry/fleet_breadth_20260720/{kit,materials,textures,variants,scenery}/` | candidate assets |
| `tools/foundry/` | the render + validation harness (this contract's tools) |
| `tools/foundry/{kitgen,texgen}/` | generation scripts |
| `design/foundry/` | design docs (this file) |
| `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/{renders,reports}/` | evidence: contact sheets + validation/contract JSON |

## Naming

| Kind | Pattern | Example |
| --- | --- | --- |
| Kit-bash piece | `kit_<family>_v<NN>.glb` | `kit_bracket_v03.glb` |
| Faction variant | `var_<donor>_<faction>_<family>_v<NN>.glb` | `var_hull_fighter_pirate_overplate_v02.glb` |
| Scenery prop | `scenery_<name>_v<NN>.glb` | `scenery_fuel_derrick_v01.glb` |

`<NN>` is a zero-padded, monotonic version. Keep the donor id verbatim in variant names.

## Budgets (triangle ceilings — enforced by `validate_foundry_glb.mjs --class`)

| Class | Ceiling | For |
| --- | --- | --- |
| `kit` | 800 | a single kit-bash piece (bracket, greeble, plate) |
| `variant` | 8000 | a full donor-derived faction variant part (**default**) |
| `scenery` | 3000 | a scenery / set-dressing prop |

Override the numeric ceiling with `--budget <tris>`. Reference donors sit mid-`variant`
(`hull_fighter` 4690 tris, `engine_ion_twin` 5664 tris).

## Axis + camera facts (extracted from `src/render/camera.js`)

- **FOV 50°** — Three.js `PerspectiveCamera` fov is the *vertical* fov; on the square
  512 render frame vertical == horizontal, so the game-cam view matches gameplay
  foreshortening exactly.
- **Tilt 60°** — camera elevation above the horizontal plane (offset
  `(0, D·sin60, -D·cos60)`, lookAt origin ⇒ 60° above horizon = 30° off nadir, a steep
  top-down chase). `DEFAULT_ZOOM` 72 wu (informational).
- **Part axes (Blender Z-up, post glTF import): `+X` thrust/forward (length), `+Y` beam,
  `+Z` up = DORSAL** (the surface the player sees). The dorsal is what the steep camera
  reveals — author detail there.

## Workflow commands

Render a deterministic contact sheet (system Python — has PIL; drives Blender for you):

```
python tools/foundry/render_contact_sheet.py \
  --glb assets/ships/foundry/fleet_breadth_20260720/kit/kit_bracket_v03.glb \
  --out assets/ships/parts/revamp-evidence/fleet_breadth_foundry/renders/<batch> \
  [--label kit_bracket_v03] [--fast] [--views neutral_close,game_cam,silhouette]
```

Produces `<label>_sheet.png` (labeled 5-wide composite) plus a `<stem>/` folder of the
individual 512² view PNGs and a `_views.json` manifest. `--fast` = 24 samples / 384px.

Validate against a budget (Node — exits non-zero on FAIL):

```
node tools/foundry/validate_foundry_glb.mjs <glb...> \
  --out assets/ships/parts/revamp-evidence/fleet_breadth_foundry/reports/<batch> \
  [--class kit|variant|scenery] [--budget <tris>]
```

Per-GLB report JSON: tris, draw groups, material names + usage, textures (size +
sRGB/linear colorspace role), tangents present?, UV sets, non-applied node transforms,
node names, world bbox dims, and the PASS/FAIL verdict.

Dump a donor's contract surface (for the variant lane — MOUNT/SOCKET/HOOK poses, LOD0
meshes, material slots, dims, forward-axis check):

```
python tools/foundry/import_donor.py --glb assets/ships/parts/hulls/hull_fighter.glb \
  [--out <report.json>]
```

`import_donor.py` is also importable **inside Blender** by a variant script:
`from import_donor import contract_surface, import_donor_glb, mount_sockets`.

Both Python tools are dual-mode: the `python …` form (above) is what lanes run; it
internally invokes `blender -b --factory-startup -P <tool> -- …` because Blender's
bundled Python has numpy but **no PIL**. Set `SF_BLENDER` to override the Blender path
(default `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`).

## The view set (`render_contact_sheet.py`)

`neutral_close` (3/4 dorsal, hero), `game_cam` (real 50°/60° game angle, nose up-screen),
`zoom_out` (~10% of frame), `silhouette` (black-on-white), `clay` (matte gray),
`basecolor` / `roughness` / `metallic` / `normal` / `ao`, `emissive_only`, `wireframe`,
and `turntable_00..07` (8 yaw steps at game elevation). One fixed 3-point neutral rig +
Filmic view transform + fixed exposure for the lit views; Standard transform for the
data/channel views so texel values read true. Lower-LOD proxies (`LOD1_`/`LOD2_`/
`*SILHOUETTE`) are hidden to avoid double-rendering; `HOOK_*`/`DET_*` are rendered (on
some parts, e.g. `engine_ion_twin`, `HOOK_DRIVE_*` carry real drive geometry).

## Determinism (batch rule 4)

Fixed Cycles seed 0, no animated seed, CPU device, OpenImageDenoise, fixed exposure, no
adaptive sampling. Cycles pixel output is byte-identical run-to-run here; the harness
additionally strips Blender's volatile PNG metadata (Date/Time/RenderTime tEXt chunks) so
**every delivered view PNG, contact sheet, and JSON report is byte-identical across runs**
(verified by sha256). Contact sheet built with PIL (no embedded timestamp).

## Honest substitutions / caveats

- **AO** = geometric Cycles Ambient-Occlusion node, **not** a baked `occlusionTexture`
  (the foundry donors carry none). It shows real cavity occlusion, which is the more
  useful read anyway.
- **Channel views render literal texel values** under the Standard transform: a genuinely
  dark asset (e.g. `hull_fighter`'s dark gunmetal) reads dark in `basecolor`/`normal` — by
  design, not a bug. Light assets (e.g. `engine_ion_twin`) read fully.
- The harness surfaces real donor issues: `hull_fighter`'s material wires the *color* trim
  sheet into the **normal** slot (a proper `hull_fighter_trim_sheet_1k_normal_role`
  texture sits unused), so its `normal` view reads dark instead of lavender. The engine's
  proper neutral normal map reads correct lavender.
- **Draco-compressed GLBs are unsupported** by the Node validator (no `draco3d` dep in the
  worktree; `meshoptimizer` is present). Foundry parts stay uncompressed or meshopt-packed.
- `validate_foundry_glb.mjs` is the foundry *budget/contract* gate. For strict glTF *spec
  validity*, also run the existing `tools/art/validate_gltf_assets.mjs` (Khronos validator).

## How a candidate maps into the real pipeline (REFERENCE ONLY — not executed this batch)

1. **Author** the candidate under `assets/ships/foundry/fleet_breadth_20260720/…` and
   iterate with the harness above until the sheet reads at gameplay scale and the
   validator PASSes its budget class.
2. **Finalize** — `node tools/art/finalize_part.mjs …` bakes the contract (LOD0/MOUNT/
   SOCKET, texture roles, strict single-buffer GLB) into a canonical part.
3. **Register** — the finalized part is added to `assets/ships/parts/parts_manifest.json`
   and consumed by `src/render/partsLibrary.js` / `visualFactory.js`.
4. **Release build** — `tools/art/build_release_parts.mjs` emits the `assets/ships/release/`
   payload the runtime ships.

Steps 2–4 are owned by the orchestrator / integration lane and touch files this batch is
forbidden to modify; the foundry only produces validated candidates + evidence.
