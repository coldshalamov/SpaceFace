# G_HELIOS_BROWSER — W1 uninjected Helios dock browser evidence

**Date:** 2026-07-17  
**Spine:** `SpaceFace-depth-actualization`  
**Owner task:** W1 complementary browser evidence for M1 Helios dock  
**Fence honored:** no `input.js`, no assets; no commit  

---

## 1) Scope

Capture **uninjected** player-route browser evidence: New Game → map Helios → wait physical dock prompt, with **no SF teleport**.

| In | Out |
|---|---|
| Thin `scripts/check-m1-helios-route-browser.mjs` | Changes to `input.js` / assets |
| Playwright headed Chrome + `.devshots` screenshots | Fake green on harness failure |
| Re-run / keep `check:m1:helios-route` as REAL product proof | Treating browser alone as primary product geometry |

---

## 2) Authority split

| Gate | npm | Role |
|---|---|---|
| **Primary REAL product** | `npm run check:m1:helios-route` | Headless flightV3 + Rapier seed-47 hold ≥1.5 s + `dock:range` (historical 294 miss guard) |
| **Complementary browser** | `npm run check:m1:helios-route-browser` | Wall-clock public inputs via Playwright; observe-only |

Browser is **not** primary acceptance. If Playwright/browser is broken, classify **HARNESS**, document stdout, and keep headless green as REAL terminal-approach proof.

Prior product fix / headless return: `docs/evidence/orchestration/returns/C_HELIOS_RETURN.md`.

---

## 3) Harness design

| Path | Role |
|---|---|
| `scripts/lib/alphaLiveBaselineRoute.mjs` | Shared public route: New Game → Launch → flight input → N map → search Helios → Set Waypoint → autopilot → `.sf-alert--dock` |
| `scripts/check-m1-helios-route-browser.mjs` | Thin browser entry (this slice) |
| `scripts/check-m1-helios-route.mjs` | Unchanged REAL product gate |
| `package.json` | `"check:m1:helios-route-browser": "node scripts/check-m1-helios-route-browser.mjs"` |

### Contract

- **Inputs only:** Space (intro), New Game, Launch, W/Shift flight causality, N, `/` + type `Helios Station`, Enter, Set Waypoint pointer, wait dock, held E.
- **Forbidden:** `player.pos` writes, SF teleports, entity injection, `?debug=`, harness `bus.emit` of gameplay events.
- **`injectedState: false`** in evidence/report.
- On failure: stamp `failureClass` **HARNESS** (Playwright/Chrome/Edge load/launch) vs **REAL** (route after boot), exit non-zero — do not fake green.

Pattern sources: `check-alpha-live-baseline-browser.mjs`, `check-m3-player-facing-public-route.mjs --demo-opening`, `check-career-origins-browser.mjs`.

---

## 4) Run results

### A — REAL product (headless)

```
npm run check:m1:helios-route
→ exit 0
```

| Check | Result |
|---|---|
| A source contract (flybyOrbit / approachBand) | PASS |
| B hold + dock:range | PASS — closest **132.12** WU (dock 156), hold 90 ticks, first `dock:range` tick 1082 / t≈18.03 s |
| C full V3 autopilot suite | PASS (Check 0 closest **155.63** first-entry) |

### B — Complementary browser (Playwright)

```
npm run check:m1:helios-route-browser
→ exit 0
```

| Step | Result |
|---|---|
| Server | `http://127.0.0.1:64517` (ephemeral loopback) |
| Browser | Chrome `C:\Program Files\Google\Chrome\Application\chrome.exe` |
| intro → main menu → New Game → Launch | PASS |
| ordinary flight input causality | PASS |
| galaxy map Helios waypoint + autopilot | PASS |
| **physical-dock-prompt** | PASS — text **`[ E ] DOCK AT STATION`** |
| approach distance at prompt | **151.79** WU (inside dock envelope 156; historical miss was ~294) |
| station hub (route continuation after E) | settled |
| page errors | none |

**HARNESS:** not observed — Playwright loaded; headed Chrome launched; full public route completed.

Raw stdout: `docs/evidence/orchestration/returns/G_HELIOS_BROWSER_RAW.txt`.

---

## 5) Artifacts (`.devshots`)

Directory: `.devshots/alpha/m1-helios-route-browser/`

| File | Role |
|---|---|
| `01-main-menu.png` | Title / Main Menu |
| `02-new-game.png` | New Game screen |
| `03-flight-after-input.png` | Authored flight after W/Shift |
| `04-galaxy-map.png` | Helios Station map selection |
| `05-dock-prompt.png` | **Physical dock prompt (W1 target)** |
| `06-station-hub.png` | Station after public E dock |
| `route-report.json` | Full step ledger + approach snapshot |
| `evidence.json` | `spaceface.alphaEvidence.v1` receipt |

Key approach snapshot at dock prompt:

```json
{
  "tick": 8293,
  "playerAlive": true,
  "pos": { "x": 1160.83, "z": -326.91 },
  "speed": 34.48,
  "autopilot": {
    "active": true,
    "status": "cruising",
    "distance": 151.79,
    "label": "Helios Station"
  }
}
```

---

## 6) Exit codes

| Command | Exit | Class |
|---|---|---|
| `npm run check:m1:helios-route` | **0** | REAL product |
| `npm run check:m1:helios-route-browser` | **0** | Complementary browser |

**Status:** Uninjected browser New Game → map Helios → physical dock prompt **green**. Terminal product geometry remains proven by headless hold gate; browser evidence confirms the same public path at wall-clock without teleport.

---

## 7) Files touched (this slice)

| Path | Change |
|---|---|
| `scripts/check-m1-helios-route-browser.mjs` | **New** thin Playwright harness |
| `package.json` | `check:m1:helios-route-browser` script |
| `docs/evidence/orchestration/returns/G_HELIOS_BROWSER.md` | This return |
| `docs/evidence/orchestration/returns/G_HELIOS_BROWSER_RAW.txt` | Captured browser stdout |
| `.devshots/alpha/m1-helios-route-browser/*` | Machine evidence (screenshots + JSON) |

**Not committed** (fence).
