# Resume handoff: place dock / hulk / debris remaster

**Find this later by searching the repo for:**
`REMASTER_HANDOFF_dock_hulk_debris` · `place_dock_interior` · `G1_FORM` · `ac1_form=partial`

**Last updated:** 2026-07-26 (session interrupted; goal NOT complete)

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

## Live status when work stopped (honest)

**All three still fail AC1 form.** Do **not** rebrand to `ac1_form=pass` or `G7_INDEPENDENT`.

| Asset | Live iter (scratch) | Gate | Approx size | Residual |
|---|---|---|---|---|
| dock | **279 KEEP** | partial / **G1_FORM** | ~90MB / ~1.19M tris | Modular multi-volume hangar (corner wings + mid height step) |
| hulk | **219** | partial / **G1_FORM** | ~54MB / ~703k tris | Citadel/mid-poly densify residual; freighter HS (NOT clay) |
| debris | **191** | partial / **G1_FORM** | ~11MB / ~141k tris | Tip/mid-poly residual; freighter hard-chine (NOT soft peels) |

- `self_accept=false`, G7 open always
- `live_reassess_gates.py` is **RETIRED** (fabricated AC1 pass) — do not revive
- Skeptic panel text about orange 9.69MB dock / clay hulk / soft peels 313k is **STALE** vs live disk

**Rough progress (substance, not verifier):** debris ~70–85%, hulk ~65–80%, dock ~40–55%.
**Verifier complete:** 0/3 AC1 clear → **goal incomplete**.

Dock 280 (upper longitudinal parapet) was **started but interrupted**; final live remained **279**.

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

1. Open multi-angle EEVEE from `final/final_*.png` if scratch still exists; else re-render from live GLB.
2. Confirm gates are still `partial` / `G1_FORM` (or update honestly after review).
3. **Refute** any claim of ac1=pass, orange dock 9.69MB, clay hulk, soft peels 313k against **live** evidence.
4. Name **ONE** residual only. Primary was: **dock modular multi-volume continuous hangar**.

### 2. Fix one residual, then re-render multi-angle EEVEE

Preferred SAFE methods (history of KEEP):

- Join-only solid volumes immediately merged into `D204_Wall_*` / `D204_Roof`
- IN PLACE densify (subdiv + moderate insets; no force-deep explosion)
- Embedded mid-height fills (no underhang bulbs)

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

### 3. KEEP vs RESTORE

- **KEEP** only if EEVEE improves or holds construction without free leftovers / regressions
- **RESTORE** by copying previous `iter_NNN` GLB back to `final/place_*.glb`
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

1. **Debris** — closest; tip residual only
2. **Hulk** — citadel densify residual
3. **Dock** — primary macro blocker **or descope** (see options)

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
RE-VERIFY first. Live was dock 279 / hulk 219 / debris 191 all ac1_form=partial G1_FORM.
Do not rebrand gates. Fix ONE residual (primary: dock modular multi-volume continuous hangar
OR finish debris tip then hulk citadel). Blender 5.1 headless EEVEE multi-angle.
Ban free shells/tip pods/hanging bulbs/vertex-push/jail bars/rect decks.
```

Shorter:

```
Continue REMASTER_HANDOFF_dock_hulk_debris — re-verify, one residual, honest partial/G1 until form clears.
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
