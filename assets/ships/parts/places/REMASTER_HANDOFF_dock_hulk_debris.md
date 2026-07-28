# Resume handoff: place dock / hulk / debris remaster

**Find this later by searching the repo for:**
`REMASTER_HANDOFF_dock_hulk_debris` · `place_dock_interior` · `G1_FORM` · `ac1_form=partial`

**Last updated:** 2026-07-28 (debris source checkpoint integrated; goal NOT complete)

---

## What this goal was

Visual remaster of **three** place GLBs to pro 2026 hard-surface form under multi-angle EEVEE:

| Asset | What it is in the game | Player sees it when |
|---|---|---|
| `place_dock_interior` | Shipyard hangar **backdrop** (UI) | Docked → shipyard/shipworks ship preview |
| `place_dead_hulk` | World **wreck landmark** | Freeflight near derelict POIs |
| `place_debris_chunk` | World **debris prop** | Freeflight near wreck fields / stash POIs |

Dock is **not** a flyable interior. Variants exist: `_military`, `_grit` (not the focus of this run).

**Wiring:** `src/ui/shipPreviewMount.js` → `dockInteriorIdForArchetype()`; shipyard stage in `src/ui/screens/shipyard.js`.

---

## Current live status (honest)

The earlier iteration loop has been stopped. Debris now has a deterministic editable-source rebuild
that cleared its original G1 silhouette defect in matched offline evidence. Hulk and dock remain at
G1 and require method resets. None of the three has passed runtime/G7 acceptance.

| Asset | Current source | Gate | Approx source size | Residual |
|---|---|---|---|---|
| dock | scratch **iter280** copied to source | partial / **G1_FORM** | 96.6MB / 1,193,240 tris | Sealed dark slab; no readable structural bay, PBR maps, LOD, hooks, or sockets |
| hulk | scratch **iter219** copied to source | partial / **G1_FORM** | 56.2MB / 703,433 tris | Symmetric dumbbell/citadel silhouette; no PBR maps, LOD, hooks, or sockets |
| debris | deterministic **opening_debris_chunk_v4** rebuild | offline **G1 keep**; G2–G4 partial; G7 open | 4.17MB / 18,846 tris across LOD0–2 | Runtime release/manifest and headed acceptance remain blocked |

- `self_accept=false`, G7 open always
- `live_reassess_gates.py` is **RETIRED** (fabricated AC1 pass) — do not revive
- Skeptic panel text about orange 9.69MB dock / clay hulk / soft peels 313k is **STALE** vs live disk

### Debris source checkpoint

- Authored Blender source:
  `assets/ships/parts/blender/place_debris_chunk_authored.blend`
  - SHA-256 `1F34FA6C4B5E351C17E4087EE0176AA3CCA079BA2B6A1FBCB79E264BA7313417`
- Source GLB:
  `assets/ships/parts/places/place_debris_chunk.glb`
  - SHA-256 `2989ECA7438E3A39C91C3232DEE1A7275CD8CED6858762CD2A88035F543483FF`
- Rebuild source:
  `tools/blender/remaster_opening_debris_chunk_v1.py`
- Material-source generator:
  `tools/art/build_opening_infrastructure_maps.py`
- Contract:
  root `place_debris_chunk`; `SOCKET_Tether_Massline` at canonical glTF `[2,1,0]`;
  authored monotonic LOD0/1/2; semantic Hull/Mechanical/Accent/Insulation/Radiator/Cable/Decal
  materials; embedded base-color/normal/ORM maps with UV0 and tangents.
- Strict offline validation:
  Foundry pass, Khronos glTF validator `0 errors / 0 warnings`, and texture audit
  `21/21 bound, 0 errors / 0 warnings`.
- Determinism: two clean rebuilds from the canonical authored blend produced the identical source
  GLB hash `2989ECA7438E3A39C91C3232DEE1A7275CD8CED6858762CD2A88035F543483FF`.
  The builder requires explicit `--source-blend`, `--maps-root`, `--output-blend`, `--output-glb`,
  and `--report` paths and never writes a repository or manifest path implicitly.
- Matched current-versus-v4 review:
  `C:\Users\93rob\.codex\visualizations\2026\07\28\019fa6a4-f178-7530-8a98-a35eab6ec617\debris-rebuild-v4\debris_current_vs_v4.png`
- Keep rationale: the old twin-pod/spring silhouette was replaced by one manufactured pressure
  module with a directional rupture, rooted frame/load path, severed members, exposed insulation,
  and a canonical tether clevis. This closes the specific G1 macro-form failure offline.
- Honest residual: the source uses authored material-scale normal/ORM inputs rather than a
  mesh-derived bake. Deliberate seam/density/padding/bake evidence, release KTX2/Meshopt, live LOD
  transitions, Browser/Electron presentation, and independent art acceptance remain open.

**Goal status:** one of three has a reviewed source checkpoint; the overall goal remains incomplete.

---

## Where files live

### Repo (durable)

```
assets/ships/parts/places/place_dock_interior.glb
assets/ships/parts/places/place_dead_hulk.glb
assets/ships/parts/places/place_debris_chunk.glb
assets/ships/release/parts/places/   ← release pair may be STALE; check ASSET_STATUS / check:assets:live
```

### Scratch (session artifacts; may be deleted by OS cleanup)

```
C:\Users\93rob\AppData\Local\Temp\grok-goal-6abc52c84c39\implementer\
  visual-assets\place_dock_interior\     final/ + iter_###/
  visual-assets\place_dead_hulk\
  visual-assets\place_debris_chunk\
  form_pass_dock_*.py
  form_pass_hulk_*.py
  form_pass_debris_*.py
  REVERIFY_NOW_*.md
```

**If scratch is gone:** resume from repo GLBs + this handoff. Iteration history is lost; live meshes may still be in `parts/places/`.

**Blender:** `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` (5.1.2 headless EEVEE used).

---

## How to finish later (procedure)

### 1. Re-verify first (every session)

1. Open multi-angle EEVEE from the current source GLB or surviving evidence.
2. Confirm hulk and dock remain `partial` / `G1_FORM`; do not reopen debris G1 without a concrete
   regression.
3. **Refute** any claim of ac1=pass, orange dock 9.69MB, clay hulk, soft peels 313k against **live** evidence.
4. Name **ONE** residual only. Current next residual: **hulk symmetric dumbbell silhouette**.

### 2. Fix one residual, then re-render multi-angle EEVEE

Preferred SAFE methods:

- Rebuild from a low-complexity deterministic Blender script into ignored scratch.
- Fix macro silhouette and causal load path before adding secondary detail.
- Preserve canonical root, hooks/sockets, pivots, bounds, LOD roles, and source/release separation.
- Generate UV-aware authored maps; derive physical data only from defensible surface information.

**Banned (history of RESTORES):**

| Ban | Why |
|---|---|
| Free outer shells / tip pods left unjoined | Kitbash leftovers |
| Hanging underhang bulbs under elevated corners | dock 277 RESTORED |
| Thin wall seam-crack shoulders | dock 269 RESTORED |
| Vertex-push height ramps | dock 266 RESTORED |
| Free mid-bay height-step boxes | dock 257 RESTORED |
| Rect deck slabs | dock 247 RESTORED |
| Jail bars | dock 231 RESTORED |
| Crystalline clamp densify | dock 235/261 RESTORED |
| Force-deep densify blowout | dock 230/234 RESTORED |
| Rebrand gates to pass/G7 without form clear | plan AC1 |
| Resume iter219/iter280 densification | Adds cost without repairing the failed macro read |
| Copy straight from scratch to source/release | Bypasses matched review and source/release contracts |

### 3. KEEP vs RESTORE

- **KEEP** only if matched evidence improves construction without free leftovers or regressions.
- **REVISE** in isolated scratch; do not overwrite the source between rejected iterations.
- **REVERT** with Git history if a promoted source checkpoint later proves worse.
- Always leave honest `ac1_form=partial` `earliest_failed_gate=G1_FORM` until form actually clears

### 4. Done criteria (do not claim early)

All three must show under multi-angle EEVEE:

- Continuous hard-surface construction language (pro 2026)
- No clay/plastic default slabs
- No plain box kitbash as finished primary form
- Dock: continuous industrial hangar read **or** explicitly descoped as “UI backdrop only” (see below)
- Honest gate write: only then consider AC1; G7 remains independent/out-of-session

Ship the GLBs to both `parts/places` and release pair when form is accepted; run `npm run check:assets:live` (and owning asset checks).

### 5. Suggested finish order (play value)

1. **Hulk** — rebuild as one continuous commercial carrier/drill-tender load path with a causal
   starboard/dorsal rupture.
2. **Dock** — rebuild a readable portal-bent service bay and verify the real ship-preview
   composition.
3. **Debris release** — after the `asset-manifest` mutex is free, build only this exact release pair
   transactionally and run the runtime gates.

---

## Options if dock never clears macro AC1

Dock is only a **shipyard preview backdrop**. Acceptable product choices:

A. **Keep grinding** SAFE join/densify until continuous hangar silhouette passes pro bar
B. **Descope dock** in writing: “UI hangar shell, not freeflight landmark” with a lower form bar (still dark HS, no orange boxes, clamps solid)
C. **Park dock** at 279; finish hulk + debris only; close goal with explicit dock deferral

Record whichever you choose in this file when you resume.

---

## Useful prompts to paste into a new session

```
Resume place remaster from assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md
RE-VERIFY first. Debris v4 has an offline G1 keep but no release/G7 acceptance. Hulk iter219 and
dock iter280 remain partial/G1. Continue with the hulk method reset; do not densify iter219.
Blender 5.1 headless EEVEE matched multi-angle evidence. Preserve source/release separation.
```

Shorter:

```
Continue REMASTER_HANDOFF_dock_hulk_debris — hulk method reset next; keep all release/G7 claims honest.
```

---

## Session / scratch IDs (optional archaeology)

| Item | Value |
|---|---|
| Scratch root | `C:\Users\93rob\AppData\Local\Temp\grok-goal-6abc52c84c39\implementer` |
| Goal session id (Grok) | `019f926a-dc52-71d3-b792-57fa921e6a6c` (may not appear in “recent” list forever) |
| Skills | `.grok/skills/spaceface-blender-pipeline`, `spaceface-blender-blockout` |

---

## Do not

- Merge PQ-018 branches that would **revert** these place GLBs (see `design/program/NOW.md`)
- Treat green metric-only checks as form pass
- Call `update_goal(completed: true)` while G1 form residuals remain
- Assume release GLBs match source parts without checking

---

*This file is the durable front door for finishing this work without the original chat transcript.*
