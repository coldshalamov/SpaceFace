# SPEC3-F9 — Elite Finish Bar (Phase 2)

**Authority:** `design/spec2/00_MASTER_TASTE.md` → this doc → `SPEC3-F9-full-finish-bar.md` (floor) · **Tracking:** `GOAL_ELITE_VISUAL_STANDARD.md`

## 1. Lanes

| Lane | Scope | Elite bar |
|---|---|---|
| **A — Uplift** | Existing 63 manifest IDs | Second pass; keep Phase 1 evidence |
| **B — New** | ≥5 IDs × 9 categories (≥45 total) | Full authoring from blockout |
| **C — VFX** | `src/render/vfx.js` + allies | ≥3 variations × 8 effect families |

## 2. Elite uplift (existing ID)

1. **≥10 named surfacing techniques** in `deficiency.md` (`≥10 surfacing techniques:` line or counted named list)
2. **≥12 `DET_*` layers** documented (bevel segs≥2); **4+ new** beyond Phase 1
3. **≥5 new lit EEVEE renders** in `iter4` or `iter5` batch (mid + close)
4. **Textures:** 2K trim/wear where 1K; **≥1 new story map** (`*_stencil_*`, `*_scorch_*`, `*_faction_*`, `*_roughness_story_*`)
5. Re-export → `finalize_part.mjs` → release build (batch `fix-revamp-part-contract` if needed)
6. `finalize.log` + manifest note: **`PRO Elite Finish YYYY-MM-DD`**

**Renders:** EEVEE camera only — `bpy.ops.render.render(write_still=True)`; HDRI `artist_workshop_1k.exr`; lens 35; d=2.4–2.8×max_dim.

## 3. Elite new asset (new ID)

- ≥10 techniques, ≥12 DET, trim/wear/3×AO + story maps
- **≥25 lit EEVEE** (T2) / **≥15** (T1 small props)
- 4 Before-iter blocks, full MCP loop, modular SOCKET/MOUNT/HOOK contract
- **Budget:** ≤22k tris/part; 2K hero exterior textures; ≤8 submeshes

## 4. VFX Elite

See `design/VFX_ELITE_STANDARD.md`. Per variation: ≥5 frames in `.devshots/vfx-elite/<family>_<variant>_*.png`; evidence in `design/vfx-evidence/<family>.md`.

**Families (≥3 variations each):** muzzle, projectile, impact, explosion, thruster, mining, countermeasure_tether_jump, station_emissive

## 5. Verification

```bash
npm run check:revamp:evidence   # Phase 1 floor — must stay 0 fail
npm run check:elite:evidence    # Phase 2 bar — all manifest IDs
node scripts/check-vfx-elite-evidence.mjs
npm run check:assets:live
node scripts/build-sg04-release-assets.mjs   # after parts batches
```

## 6. Workflow (per asset)

Load `_authored.blend` → iter4 uplift (or iter0 if new) → modeling/surfacing/life → AO per role → iter batches → export/finalize → evidence → **next ID immediately**.

**Skills:** `spaceface-blender-pipeline`, `spaceface-blender-hardsurface`, `spaceface-blender-surface-pass`, `imagine` (textures only).