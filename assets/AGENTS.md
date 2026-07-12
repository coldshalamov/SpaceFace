# assets/ — Visual Asset Catalog & Pipeline

> **Start here for any visual asset work.** This file is the master index for everything under
> `assets/`. Ship GLB pipeline details are in §Ship pipeline below; per-folder notes live in nested
> `AGENTS.md` files where noted.
>
> **Authority:** root `AGENTS.md` §Concurrent Graphics Work + §3 (uncommitted-tree trap).
> Failure-mode playbooks: `docs/COMMON_BUGS.md` §3–3b. Machine-readable “do not wire” list:
> `scripts/check-asset-reachability.mjs` → `REFERENCE_ONLY`.
>
> **Verified against the working tree 2026-07-05.**

---

## 0. Quick routing — which lane am I in?

| You need to… | Read |
|---|---|
| Wire or fix a **ship/station/place GLB** | §Ship pipeline + `design/spec3/SPEC3-F9-asset-pipeline.md` |
| Add/fix **station bar NPC portraits** | `assets/portraits/AGENTS.md` + `src/data/portraits.js` |
| Use **concept art** as Blender reference | `assets/concept/AGENTS.md` + `assets/concept/index.json` |
| Understand why an agent wired the **wrong ship** | §Blocked & trap assets + §Ship visual stack |
| See what's **queued but not built** | `assets/QUEUE.md` |
| **Parallel graphics sprint threads** (goal prompts, locks, handoffs) | `design/graphics-sprints/GOAL_PROMPTS.md` + `00_ORCHESTRATION.md` |
| Asset lifecycle / wiring status | `assets/ASSET_STATUS.json` + `npm run report:asset-status` |
| Confirm an asset **ships in the bundle** | `npm run check:asset-reachability` |
| Confirm GLBs **load in flight** | `npm run check:assets:live` + `npm run check:asset-status` |

---

## 1. Master catalog — every visual lane

**Status legend**

| Status | Meaning |
|---|---|
| **LIVE** | Referenced by runtime `src/` or `styles/`; must exist and bundle |
| **UI-ONLY** | Wired in menus/previews, not the flight world sim |
| **AUTHORING** | Build input; runtime loads `release/` copy, not this path |
| **REFERENCE** | On disk for artists/agents; **must never** be wired into gameplay |
| **BLOCKED** | Tracked in manifest with `status:"blocked"`; wiring forbidden |
| **PROCEDURAL** | No static file — built in code (canvas textures, primitives, shaders) |
| **CODE-NATIVE** | Ship/place mesh built in `src/render/ships/*.js`, not from `assets/` |

### 1.1 Bundled roots (what ships in release builds)

`scripts/build-bundle.mjs` and `package.json` `build.files` copy these trees:

`assets/cinematics` · `assets/ui` · `assets/ships` · `assets/portraits`

Everything else under `assets/` is **dev/authoring/reference only** unless you deliberately add a new bundled root (and update `check-asset-reachability.mjs`).

### 1.2 Folder-by-folder

| Path | Status | Wired? | Registry / entry point | Notes |
|---|---|---|---|---|
| `assets/ships/release/parts/**` | **LIVE** | ✅ flight + UI previews | `src/render/partsLibrary.js`, `assetLoader.js` | **Default runtime path.** Release mode ON (`releaseMode.js`). |
| `assets/ships/parts/**` | **AUTHORING** | ❌ direct | Same maps, dev fallback URL | Source GLBs + `parts_manifest.json`. Run release build before expecting flight to load them. |
| `assets/ships/parts/wholeships/kestrel.glb` | **AUTHORING** | ✅ after release build | `parts_manifest.json` + player-only `WHOLE_SHIP_FILE_BY_DEF_ID` | K0 production Borrowed Time body. Editable Blender source + reproducible builder required. |
| `assets/ships/parts/wholeships/{pelican,wasp}.glb` | **BLOCKED** | ❌ | `parts_manifest.json` `status:"blocked"` | Accessory-only exports (no hull body). **Do NOT** wire them. |
| `assets/ships/kestrel/` | **REFERENCE** | ❌ direct | `tools/art/generate_kestrel_reference.py` | Reference package only. Player runtime body is **`assets/ships/release/parts/wholeships/kestrel.glb`**; code-native hero is the preflight shell. |
| `assets/ships/parts/places/place_dock_interior*.glb` | **UI-ONLY** | ✅ shipyard preview only | `src/ui/shipPreviewMount.js` | In manifest + release, **not** in `partsLibrary.js` `PLACE_FILES` — no flight-world dock backdrop yet. |
| `assets/portraits/*.jpg` | **LIVE** | ✅ station bar | `src/data/portraits.js` → `src/ui/portraitArt.js` → `bar.js` | 8 canonical + 7 role archetypes. Canvas stick-figure fallback on load error. **Not HUD** (bar/comms only). |
| `assets/cinematics/C-INTRO-*.jpg` | **LIVE** | ✅ | `src/ui/uiRoot.js`, `src/ui/screens/codex.js`, `styles/ui.css` | Menu backdrop uses `C-INTRO-01.jpg` (clean, no baked labels). |
| `assets/cinematics/C-INTRO-*_6s.mp4` | **LIVE** | ✅ | `uiRoot.js` `playCinematic`, `codex.js` | Intro/codex playback. |
| `assets/cinematics/menu_background.jpg` | **REFERENCE** | ❌ | `REFERENCE_ONLY` in `check-asset-reachability.mjs` | Labelled reference still; menus use `C-INTRO-01.jpg` instead. |
| `assets/ui/reticle.jpg` | **REFERENCE** | ❌ | `REFERENCE_ONLY` | Baked caption text. HUD uses inline `RETICLE_SVG` in `uiRoot.js`. |
| `assets/ui/icons_atlas.jpg` | **LATENT** | ⚠️ CSS only | `styles/ui.css` `.icon-ref` | Bundled; **no DOM element uses `.icon-ref` yet.** Not reference-only — intended for future icon slices. |
| `assets/bible/B-*.jpg` | **REFERENCE** | ❌ | `VISUAL_ASSET_PLAN.md` IDs | Style-bible boards for image_gen chaining. **Not loaded by runtime** (`getExternalTexture` in `visualFactory.js` is unused). |
| `assets/concept/**` | **REFERENCE** | ❌ | `assets/concept/index.json` | Sector/station/ship mood boards → Blender targets. See `assets/concept/AGENTS.md`. |
| `assets/ores/ore_*_hero.jpg` | **REFERENCE** | ❌ | `REFERENCE_ONLY` | Labelled multi-panel contact sheets; mining uses procedural materials. |
| `assets/fx/fx_*.jpg` | **REFERENCE** | ❌ | `REFERENCE_ONLY` | Labelled FX sheets; runtime VFX is procedural (`vfx.js`). |
| `assets/pilots/pf_spaceface_portraits.jpg` | **REFERENCE** | ❌ | `REFERENCE_ONLY` | **Banned motif** (helmet/visor pilots). HUD must stay non-diegetic; bar uses `assets/portraits/`. |
| `assets/QUEUE.md` | meta | — | — | Live work queue / blockers (not an asset). |

### 1.3 Procedural visuals (no `assets/` files)

These are **real in-game visuals** but intentionally have no static asset path:

| Visual | Builder | Notes |
|---|---|---|
| Space background (nebula, stars) | `src/render/spaceBackground.js` | Shader/canvas-driven |
| Ship hull panels, greebles, decals | `src/render/visualFactory.js` | Canvas procedural textures |
| Weapon trails, explosions, mining beam | `src/render/vfx.js` | Particles + procedural quads |
| HUD chrome, reticle | `src/ui/uiRoot.js` | Inline SVG + CSS tokens |
| Asteroid/ore surface (in flight) | `visualFactory.js` | Not the `assets/ores/` sheets |
| Authored-part **fallback** (boxes/torus) | `partsLibrary.js` | Shown when GLB 404 or validation fails — **silent**, no console error in normal play |

---

## 2. Ship visual stack — read before wiring ships

Agents confuse this constantly. Default play uses **three different ship render paths**:

```
Player ship_kestrel
  → kestrelHero.js (CODE-NATIVE preflight/readiness shell)
  → required production wholeships/kestrel.glb replaces the shell before flight
  → explicit entity.isPlayer seam; NPC Kestrels remain modular

Named faction NPCs (by lootTableId)
  → concordPatrol.js, reaverPirate.js, meridianTrader.js, driftBarge.js,
     quietRaider.js, vaelSniper.js (CODE-NATIVE)
  → visualOverrides.js FACTION_BUILDERS map

All other ships (player + NPC)
  → visualFactory procedural fallback mesh
  → wrapShipWithAuthoredParts → modular GLB hull from HULL_FILE_BY_DEF_ID
  → plus seeded cockpit/engine/fin/weapon/greeble slots from parts manifest
```

**Critical maps (`src/render/partsLibrary.js`):**

| Map | Current state | Rule |
|---|---|---|
| `HULL_FILE_BY_DEF_ID` (line ~206) | **LIVE** — 13 `ship_*` → `hulls/hull_*.glb` | This is how catalog ships get silhouettes |
| `WHOLE_SHIP_FILE_BY_DEF_ID` (line ~253) | **Player Kestrel only** → `wholeships/kestrel.glb` | Activate only with the explicit `entity.isPlayer` seam; NPC Kestrels stay modular |
| `PART_LIBRARY_CONTRACT.slots.hull` | Modular hulls + production Kestrel | Blocked accessory-only whole ships remain omitted |

**`shipId → hull` live table** (`HULL_FILE_BY_DEF_ID`):

| defId | hull GLB |
|---|---|
| `ship_kestrel` | `hulls/hull_starter.glb` for NPCs; production `wholeships/kestrel.glb` for the explicit player entity |
| `ship_drifter`, `ship_ranger` | `hulls/hull_multirole.glb` |
| `ship_wasp` | `hulls/hull_fighter.glb` |
| `ship_pelican`, `ship_ironback` | `hulls/hull_miner.glb` |
| `ship_mule`, `ship_atlas` | `hulls/hull_freighter.glb` |
| `ship_hornet` | `hulls/hull_interceptor.glb` |
| `ship_bastion` | `hulls/hull_corvette.glb` |
| `ship_warden` | `hulls/hull_frigate.glb` |
| `ship_colossus`, `ship_leviathan` | `hulls/hull_capital.glb` |

Gameplay stats live in `src/data/ships.js` only — **no GLB paths there**.

### 2.1 Whole-ship status

| File | status | Why |
|---|---|---|
| `wholeships/kestrel.glb` | **live, player-only** | K0 production Borrowed Time: substantive hull, LOD0/1/2, semantic materials, nine stable sockets, no baked plume |
| `wholeships/pelican.glb` | blocked | Accessory-only: Cargo_Clamp, Industrial_Cockpit, Mining_Lens_Port |
| `wholeships/wasp.glb` | blocked | Accessory-only: Aft_Brace_Port, Canopy, Dorsal_Identity |

Pelican and Wasp remain tracked with `status:"blocked"`; `npm run check:asset-status` rejects wiring them. Kestrel is a production exception admitted by the manifest and focused whole-ship gate.

**File size ≠ quality.** 10–14 MB wholeships look “detailed” but render as floating accessories.

### 2.2 Live place/station GLBs (flight world)

Declared in `partsLibrary.js` `PLACE_FILES` + `STATION_ARCHETYPE_FILES`:

**Stations (8 archetypes):** `place_station_trade_hub`, `refinery`, `military`, `blackmarket`, `fab`, `mining`, `research`, `place_gate_jump_ring`

**Props:** lane beacon, nav buoy, asteroids (seamed + rock_a/b/c + graffiti), debris, billboard, dead hulk, conveyor barge, mining drone

**Not in flight `PLACE_FILES`:** `place_dock_interior`, `place_dock_interior_military`, `place_dock_interior_grit` — UI shipyard backdrop only (`shipPreviewMount.js`).

---

## 3. Ship pipeline (GLB authoring → screen)

```
Blender (.blend)
  → export → parts/<category>/<id>.glb          (source)
  → finalize → stamps spacefaceAsset metadata
  → build release → release/parts/<cat>/<id>.glb (meshopt + KTX2)
  → runtime load → assetLoader.js validates → partsLibrary.js composes
```

### 3 registries (all required)

1. **`assets/ships/parts/parts_manifest.json`** — `parts[]` + `runtimeSlots`
2. **`assets/ships/release/release_manifest.json`** — auto-written by `build-sg04-release-assets.mjs`
3. **`src/render/partsLibrary.js`** — runtime slot lists + `HULL_FILE_BY_DEF_ID`

### Why models silently fail (ranked)

1. Forgot release build → 404 on `release/parts/` → procedural fallback, no error
2. Missing `spacefaceAsset` metadata → `assetLoader.js` rejects
3. Failed hull-body audit (wholeship &lt;800 `Material_Hull` tris)
4. Missing manifest / `partsLibrary.js` entry
5. Texture contract violation (normal/ORM convention)

**After any ship/place change:** `npm run check:assets:live` · `npm run check:asset-reachability` · `npm run check:visual-stability`

### Boot gate (do not weaken)

`src/main.js` refuses flight if authored assets are not preloaded. Fix the asset; don't lower the gate.

### Ownership signals

`release.__lock/` · `release.__building/` · `release.__previous/` · active Blender exports — **do not touch `assets/**` or `src/render/**` while present.**

### Key tooling files

- `assets/ships/parts/parts_manifest.json` — authoring source of truth
- `assets/QUEUE.md` — blockers + queued props/landmarks
- `tools/art/finalize_whole_ship.mjs` / `finalize_part.mjs`
- `scripts/build-sg04-release-assets.mjs`
- `tools/blender/spaceface_export.py`

---

## 4. HUD vs station portrait policy

| Context | Allowed | Forbidden |
|---|---|---|
| **Flight HUD** | Non-diegetic bars, inline SVG reticle, numeric readouts | Pilot helmet/visor portraits, cockpit frame motifs (`design/spec2/00_MASTER_TASTE.md` §3) |
| **Station bar / comms** | `assets/portraits/*.jpg` headshots | `assets/pilots/pf_spaceface_portraits.jpg` (visor bible sheet) |
| **Menus / codex** | `assets/cinematics/*` stills and clips | `menu_background.jpg` (labelled reference) |

`#pilot-portrait` CSS exists in `styles/ui.css` but **no HTML mounts it** — dead hook; do not wire `pf_spaceface_portraits.jpg` to satisfy it.

---

## 5. Nested agent docs

| File | Scope |
|---|---|
| `assets/portraits/AGENTS.md` | NPC bar portrait keys, roles, fallbacks |
| `assets/concept/AGENTS.md` | Reference art index, Blender mapping, not runtime |
| `src/render/AGENTS.md` | Runtime render ownership, `partsLibrary` maps |
| `VISUAL_ASSET_PLAN.md` | Historical image-gen plan + ID ledger (not implementation authority) |

---

## 6. Verification checklist

| Change type | Run |
|---|---|
| Any new runtime asset reference | `npm run check:asset-reachability` |
| Ship/place GLB | `npm run check:assets:live` + `npm run check:asset-status` |
| Portrait | `npm run check:asset-reachability` (bundled under `assets/portraits`) |
| Render/visual | `npm run check:visual-stability` |
| Full gate | `npm run check` |

When adding a **reference-only** asset that must never wire: add to `REFERENCE_ONLY` in `scripts/check-asset-reachability.mjs` with a one-line reason.
