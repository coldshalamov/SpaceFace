# C_ELECTRON_PLATFORM — Electron dual-platform residual (not AC2)

**Date:** 2026-07-17  
**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Branch:** `grok/depth-player-route-actualization`  
**Rev at capture:** `2226e908` (dirty tree may contain concurrent work)  
**Owner task:** Document Electron dual-platform residual only  
**Fence:** no commit; do **not** claim dual-platform golden-thread DONE  

**Packet authority:** `docs/evidence/orchestration/packets/ELECTRON_RESIDUAL_ONLY.md`,  
`docs/evidence/orchestration/packets/RESIDUAL_FREEZE.md`,  
`docs/evidence/orchestration/packets/GT1_DUAL_PLATFORM.md`

---

## 1) Verdict (honest)

| Claim | Status |
|---|---|
| Electron New Game authored-ship floor | **RED** — exit **1** |
| Failure class | **REAL** — NPC `authoredAssetState: procedural-fallback` |
| Electron dual-platform gallery | **NOT green** — not claimed; no Electron gallery parity run |
| GT1 content-class primary acceptance environment | **Browser (F1)** |
| Blocks plan **AC2** (first-hour)? | **NO** |

**Do not stamp:** Electron dual-platform golden-thread primaryAcceptance, Electron GT1 gallery green, or dual-platform DONE.

---

## 2) Run (single pass this return)

```
npm run check:electron:new-game
→ node scripts/check-electron-new-game-launch.mjs
→ EXIT_CODE=1
```

| Field | Value |
|---|---|
| Gate | `check:electron:new-game` |
| Script | `scripts/check-electron-new-game-launch.mjs` |
| Exit | **1** |
| Implementer log | `implementer/browser-electron-routes.log` |
| Tip | `2226e908` |

Electron **did** launch and reach New Game → flight under release authored-asset mode. The gate failed on the live ship authoring assertion — not on boot/harness load invent.

---

## 3) REAL residual — NPC procedural-fallback

**Class: REAL** (product asset floor under Electron release path).

Assertion (gate): Electron New Game must author every live player/NPC ship  
(`authoredAssetState !== 'procedural-fallback'` for all live ships).

**Observed failing NPCs (this run):**

| id | defId | isPlayer | authoredAssetState | authoredAssetMode |
|---|---|---|---|---|
| 293 | `ship_mule` | false | **procedural-fallback** | release |
| 294 | `ship_wasp` | false | **procedural-fallback** | release |
| 295 | `ship_mule` | false | **procedural-fallback** | release |

Player ship and several other NPCs reported `authored` under `release`; residual is **NPC hull authoring floor**, not total Electron death.

Stdout excerpt is captured in `implementer/browser-electron-routes.log` (includes full assertion payload + `=== EXIT_CODE=1 ===`).

---

## 4) Browser is F1 primary acceptance for GT1 content class

| Platform | Role for GT1 content class |
|---|---|
| **Browser** | **F1 primary acceptance environment** for GT1 content / literacy / supporting gallery surfaces |
| Electron | Compatibility dual-platform residual; **not** GT1 primaryAcceptance when red |

Browser supporting gallery (e.g. GT1 gallery 42 shots) stands on the browser path alone.  
Electron new-game RED does **not** reclassify browser evidence as invalid for F1 GT1 content-class acceptance.

See also: `docs/evidence/orchestration/returns/G_GT1_GALLERY.md` (browser primary gallery; Electron dual-platform gallery quota NOT MET).

---

## 5) Electron dual-platform gallery — NOT claimed green

| Surface | Status | Class |
|---|---|---|
| Browser GT1 gallery capture | supporting / may be green on shot count | supporting:true; platform=browser |
| Electron GT1 gallery | **not run / no parity harness green** | **HARNESS residual** |
| Dual-platform golden-thread primaryAcceptance | **not met** | REAL + HARNESS |

**Electron dual-platform gallery is NOT claimed green** in this return or for campaign close.

---

## 6) Plan AC2 (first-hour) — not blocked

**AC2 scope (only):** recovery settle + Helios dock + NAV-HUD hierarchy.

| AC2 gate | Owning check | AC2 claim |
|---|---|---|
| Recovery settle | `check:m3:recovery` | DONE (separate evidence) |
| Helios dock | `check:m1:helios-route` | DONE (separate evidence) |
| NAV-HUD hierarchy | `check:nav-hud-hierarchy` | DONE (separate evidence) |

| Out of AC2 | Why |
|---|---|
| GT1 continuous unassisted | residual / supporting |
| Electron new-game authored floor | dual-platform residual (this doc) |
| Electron dual-platform gallery | residual HARNESS |
| Dual-platform golden-thread primaryAcceptance | frozen open |

**This Electron residual does NOT block plan AC2 (first-hour).**  
AC2 is recovery / Helios / HUD only — not GT1 Electron dual-platform.

Pointers: `implementer/platform-limit.log`, `docs/evidence/orchestration/returns/DONE_STAMPS.md`,  
`docs/evidence/orchestration/packets/RESIDUAL_FREEZE.md`.

---

## 7) Classification matrix (single glance)

| Surface | Platform | Class | In AC2? | Claim |
|---|---|---|---|---|
| Electron New Game ship floor | Electron | **REAL** procedural-fallback NPCs | NO | RESIDUAL REAL — RED exit 1 |
| Electron GT1 gallery | Electron | **HARNESS** (no green dual-platform gallery) | NO | NOT green |
| GT1 content primary acceptance | **Browser (F1)** | primary for GT1 content class | NO (AC5/F1 residual docs) | Browser holds F1 role |
| Dual-platform golden-thread primary | browser+Electron | REAL + HARNESS | NO | NOT MET |
| Recovery / Helios / NAV-HUD | product gates | REAL green elsewhere | **YES** | AC2 not blocked |

---

## 8) Explicit non-claims

1. Do **not** claim Electron dual-platform golden-thread DONE.  
2. Do **not** claim Electron dual-platform gallery green.  
3. Do **not** treat this RED as an AC2 first-hour blocker.  
4. Do **not** invent HARNESS for the NPC fallback assertion — class is **REAL**.  
5. Browser remains F1 primary acceptance environment for GT1 content class.

---

## 9) Evidence pointers

| Artifact | Path |
|---|---|
| This return | `docs/evidence/orchestration/returns/C_ELECTRON_PLATFORM.md` |
| Implementer exit log | `implementer/browser-electron-routes.log` |
| AC2 vs residual split | `implementer/platform-limit.log` |
| DONE stamps (Electron residual row) | `docs/evidence/orchestration/returns/DONE_STAMPS.md` |
| Residual freeze packet | `docs/evidence/orchestration/packets/RESIDUAL_FREEZE.md` |
| Electron residual-only packet | `docs/evidence/orchestration/packets/ELECTRON_RESIDUAL_ONLY.md` |
| Browser GT1 gallery return | `docs/evidence/orchestration/returns/G_GT1_GALLERY.md` |
