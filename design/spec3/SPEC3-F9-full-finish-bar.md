# SPEC3-F9 — Full Finish Bar (historical manifest-part workflow)

**Thread:** F9 extension · **Status:** **HISTORICAL / LEGACY REPLAY ONLY** (retired
2026-07-29; records the 2026-07-06 revamp baseline)

This file preserves the former fixed-technique/count-based workflow for archaeology and exact
reproduction of its old evidence. It is **not** current graphics authority and must not be used to
judge, author, or accept new work. New and resumed visual-asset work starts at
[`../../docs/visual-assets/README.md`](../../docs/visual-assets/README.md) and follows
[`../../.grok/skills/spaceface-blender-material-truth/SKILL.md`](../../.grok/skills/spaceface-blender-material-truth/SKILL.md).
Those current routes require fiction-first component and material truth, asset-specific visual
iteration, exact-source receipts, and representative game-camera evidence; they do not accept a
universal number of detail meshes, named techniques, or renders as a proxy for quality.

The legacy executables named below now fail closed unless the operator supplies
`--legacy-replay`. That flag authorizes reproduction only; it does not confer production approval.

---

## 1. Historical applicability

| Lane | Use Full Finish Bar? |
|---|---|
| Any row in `assets/ships/parts/parts_manifest.json` (63 modular parts at the time) | Historical only |
| `assets/QUEUE.md` / BP-08 gap assets not yet in manifest | Never; use current visual-asset routing |
| Wholeships (`status:"blocked"`) | Never; use current visual-asset routing |
| Code-native ships (`kestrelHero.js`, faction builders) | Never; use current visual-asset routing |

---

## 2. Retired Full Finish Bar (per-asset replay requirements)

The following requirements describe what the retired verifier expected. They do not define whether
an asset is finished under the current production standard.

### 2.1 Modeling
- Authored blend: `assets/ships/parts/blender/<id>_authored.blend`
- Hard-surface form pass complete (blockout → refinement)
- Bevel **segments ≥ 2** on hard edges; weighted normals on exterior meshes
- **8 DET mesh layers** (name prefix `DET_`), bevel segs ≥ 2, story-matched to `needed-assets.md` for that ID

### 2.2 Surfacing (≥6 named techniques)
Document in `assets/ships/parts/revamp-evidence/<id>/deficiency.md` under **`≥6 surfacing techniques:`** — minimum set:

1. Layered node materials (not flat Principled + single color)
2. Trim sheet on exterior UVs (`*_trim_sheet_1k.jpg`)
3. Wear mask (`*_wear_mask_1k.jpg`) wired wear → roughness
4. AO bake per material role (Hull / Mechanical / Accent) → PNG in `textures/<id>/`
5. `SF_EdgeWear` / `SF_CavityDirt` or equivalent roughness variation
6. Story-matched skin pass (faction/sector/history — **two** distinct treatments visible in lit renders)

Optional hero additions: clearcoat zones, emissive masks, anisotropy.

### 2.3 Textures (on disk)
`assets/ships/parts/textures/<id>/` must contain at minimum:
- `*_trim_sheet_1k.jpg`
- `*_wear_mask_1k.jpg`
- `Material_Hull_ao_1k.png`
- `Material_Mechanical_ao_1k.png`
- `Material_Accent_ao_1k.png` **or** `Material_Glass_ao_1k.png`

### 2.4 Renders (acceptance — not clay alone)
- **EEVEE camera only:** `bpy.ops.render.render(write_still=True)`
- HDRI: `assets/concept/yt-refs/artist_workshop_1k.exr` + MCP_KEY + MCP_RIM
- Camera: lens **35**, distance **2.4–2.8 × max_dim**
- Output: `.devshots/graphics-revamp/2026-07-06_<id>_iter{N}_{clay|lit}_*.png`
- **NOT** `render_viewport_to_path` / OpenGL (crop/black failures)

| Tier | IDs | Min lit renders |
|---|---|---|
| **T1** | `hull_starter`, `weapon_gatling`, `fin_wedge`, `cockpit_recessed`, `place_asteroid_rock_a`, `place_station_trade_hub` | **≥10** |
| **T2** | all other manifest parts | **≥20** |

Clay renders are iteration evidence only; lit PBR at mid + close distance is acceptance.

### 2.5 Evidence files
`assets/ships/parts/revamp-evidence/<id>/`:
- `deficiency.md` — exactly **4** `## Before iter` blocks + 7-metric rubric + named techniques
- `finalize.log` — JSON with `tris`, `bytes` matching `parts_manifest.json`

### 2.6 Export & manifest
1. `tools/blender/spaceface_export.py` → `_export_tmp.glb` (AO + roughness image nodes per role)
2. `node tools/art/finalize_part.mjs <tmp> <id> --method blender_mcp` → `assets/ships/parts/<category>/<id>.glb`
3. `parts_manifest.json` — `note` starts with **`PRO Full Finish 2026-07-06`** (or current date), lists techniques + tris; `tris`/`bytes` match finalize log

### 2.7 Release sync (runtime truth)
**Finalize alone is insufficient.** Flight loads `assets/ships/release/parts/`, not `parts/`.

After any batch of finalize writes:
1. `node scripts/fix-revamp-part-contract.mjs` — strips illegal `MOUNT_*` from non-hulls, adds UV0 to `DET_*`, drops trim-as-`normalTexture` (see §5)
2. Sync `revamp-evidence/<id>/finalize.log` bytes if fix script changed GLB size
3. `node scripts/build-sg04-release-assets.mjs` (or `--resume-valid` after interrupt)
4. Confirm `release_manifest.json` entry `sourceBytes` + `sourceSha256` match current `parts/` file

---

## 3. Legacy replay workflow (transcribed MCP loop)

Do not use this loop for new or resumed asset work. It is retained only to reproduce the historical
revamp. Supply `--legacy-replay` to the entry point being invoked; direct Blender `runpy` replay must
also place `--legacy-replay` in `sys.argv` before loading `revamp_full_finish.py`.

Process **`needed-assets.md` in order**. Do not stop after one ID. Do not ask to continue.

**Skills (load first):**
- `.grok/skills/spaceface-blender-pipeline`
- `.grok/skills/spaceface-blender-hardsurface` (surfacing pass)
- `.grok/skills/spaceface-blender-blockout` (if form weak)
- `.grok/skills/imagine` (trim/wear JPG generation only — not mesh substitute)

**Per-ID loop:**

```
1. LOAD  assets/ships/parts/blender/<id>_authored.blend  (Blender MCP)

2. iter0  Baseline clay + lit EEVEE camera renders
          → .devshots/graphics-revamp/2026-07-06_<id>_iter0_*.png

3. MODEL  Add/verify 8 DET_* story layers (bevel segs=2)
          Wire materials per role:
            trim MULTIPLY on baseColor
            ao_bake PNG per role → ORM
            wear mask green → roughness

4. AO     CYCLES bake one role per MCP call (Hull → Mechanical → Accent)
          Save PNGs → assets/ships/parts/textures/<id>/
          git add -N every new texture immediately

5. iter1/2/3  EEVEE camera lit + clay batches (target ≥35 total PNGs T2, ≥10 T1)

6. EXPORT spaceface_export.py → _export_tmp.glb
          finalize_part.mjs → parts/<cat>/<id>.glb

7. EVIDENCE  Write deficiency.md (4 Before-iter blocks) + finalize.log
          Update GOAL row + manifest PRO note (only after verify passes)

8. NEXT ID immediately (same session / next harness turn)
```

**Split large Blender scripts** across MCP calls (AO per role, render batches) to avoid timeout.

**Concurrent ownership:** respect `release.__lock/` — do not edit `assets/**` while another graphics lane holds the lock.

---

## 4. Historical replay verification gates

| Order | Command | Pass bar |
|---|---|---|
| 1 | `node scripts/verify-full-finish-evidence.mjs --legacy-replay` | historical report only; never current visual acceptance |
| 2 | `node scripts/fix-revamp-part-contract.mjs` | only if new/changed parts since last release build |
| 3 | `node scripts/build-sg04-release-assets.mjs` | exit 0; `release manifest wrote` |
| 4 | `node scripts/check-sg04-release-assets.mjs --release` | `releaseReady=true` |
| 5 | `npm run check:assets:live` | exit 0; `failureCount: 0`; all 63 loaded |
| 6 | Grep `GOAL_FULL_PROFESSIONAL_GRAPHICS_REVAMP.md` for `(3)` | count **0** in tracking table |

**Floor (no regression):** `npm run check:asset-reachability` · `npm run check:visual-stability`

`scripts/verify-full-finish-evidence.mjs --legacy-replay` checks the retired per-ID contract: 4
Before-iter blocks, ≥6 techniques, textures folder, lit render counts, `finalize.log` tris/bytes,
release manifest `sourceSha256` parity, and no viewport doc violations in deficiency/GOAL rows. A
green replay report proves only conformance to this historical receipt format.

---

## 5. Release contract repairs (`fix-revamp-part-contract.mjs`)

Revamp DET layers exposed three recurring loader failures after release sync:

| Failure | Cause | Fix |
|---|---|---|
| `MOUNT_* valid only in hull parts` | Empty `MOUNT_COCKPIT/ENGINE/FIN` nodes exported on cockpits/engines/fins/greebles/places | Script strips those nodes from non-hull GLBs |
| `DET_* has no UV0` | Story detail meshes without unwrap | Script adds box-projected UV0 |
| `normal map must be linear` | Trim JPG wired as `normalTexture` → KTX2 sRGB mismatch | Script drops trim from normal slot (trim stays on baseColor/wear path) |

After running the fix script, **re-sync** `finalize.log` `bytes` and rebuild release.

**Build script note:** `build-sg04-release-assets.mjs` uses `decodeImage()` (JPEG + PNG) for KTX2 encode — required when trim/wear are embedded JPGs.

**Parity note:** `inspectReleaseAssetPair` compares `materialTextureSlotCount`, not raw `textures[]` length (deduped texture objects are OK).

---

## 6. PRO note template

```
PRO Full Finish YYYY-MM-DD — <N> DET + <story brief>. Surfacing: trim_sheet+wear_mask+SF_EdgeWear+SF_CavityDirt+AO bake+<extras>. Skin: <two story beats>. <M>×EEVEE camera renders. <tris> tris / blender_mcp.
```

Do **not** use `PRO revamp` or mention `render_viewport` in manifest notes.

---

## 7. Related files

| File | Role |
|---|---|
| `needed-assets.md` | Per-ID story, faction, queue order |
| `GOAL_FULL_PROFESSIONAL_GRAPHICS_REVAMP.md` | 63-row tracking table (historical revamp log) |
| `tools/blender/spaceface_export.py` | Blender export gate |
| `tools/art/finalize_part.mjs` | Metadata stamp + manifest patch |
| `scripts/fix-revamp-part-contract.mjs` | Pre-release GLB repairs |
| `scripts/build-sg04-release-assets.mjs` | parts → release (KTX2 + meshopt) |
| `scripts/verify-full-finish-evidence.mjs` | Historical Full Finish replay verifier; requires `--legacy-replay` |
| `src/contracts/assetReleaseValidation.js` | Release pair parity |
| `src/render/assetLoader.js` | Runtime contract (MOUNT, UV, ORM, normal linear) |

---

## 8. Forbidden (inherits `00_MASTER_TASTE.md`)

- Viewport/OpenGL MCP renders as acceptance evidence
- Claiming PRO / GOAL row before verify + release sync pass
- Skipping release build after finalize (“parts/ done” ≠ shippable)
- `git checkout`/`reset`/`stash` on tracked files during active revamp
- Silent procedural fallback as success — fix the GLB instead
