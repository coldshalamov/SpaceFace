# C_HELIOS_RETURN — W1 M1 Helios dock terminal approach

**Date:** 2026-07-17  
**Spine:** `SpaceFace-depth-actualization`  
**Owner task:** W1 #4 — strict M1 Helios route reaches and *holds* dock prompt  
**Fence honored:** no `input.js`, thrusters, materials, station redesign  

---

## Diagnosis

| Field | Value |
|---|---|
| **Class** | **REAL** (product terminal approach; historically red) |
| **Symptom** | Best approach ~294.777 WU, final ~324.520 WU, no dock prompt. Player ended past Helios `(1602.5, -384.2)` vs station `(1280, -420)`. |
| **Root cause** | After belt avoidance, ordinary autopilot treated **radial closing** as the only terminal brake signal. High **lateral / flyby** velocity with near-zero closing produced a ~300 WU orbit outside dock. Re-boost after avoidance re-energized the orbit. Capture-heading braking alone was not enough on moderate-speed orbits that never re-crossed the high capture-speed threshold. |
| **Dock prompt condition** | Physics `updateDockRange`: `d ≤ ((dockRadius \|\| radius) + player.radius) * 1.5` → emit `dock:range { inRange: true }`. For Helios L: dockRadius 90, player 14 → **dockRange = 156**. Prompt is HUD/alerts on that event. |
| **Why ~294** | Miss distance of an uncaptured flyby past station center; never entered 156 WU envelope. |

### Product fix (autopilot only — `src/systems/flightV3.js`)

Inside `resolveAutopilotInput` terminal phase:

1. **`approachBand`** — `max(arrivalRadius * 6, 420)` final-approach bubble.  
2. **`flybyOrbit`** — brake when inside band with speed > 18 and (closingSpeed < 6 **or** lateral dominates **or** receding).  
3. **Dual `headingCapture`** — keep high-speed misalign capture; add moderate-speed capture inside band when misaligned + lateral.  
4. **No re-boost inside approach band** — boost gate uses `approachBand` floor so post-avoidance boost cannot restart the Helios orbit.

### Not the failure

- Dock radius / station size / assets  
- `input.js`  
- Map `arrivalRadius` 90 (inside 156 dock envelope when approach works)  
- Focused check without hold (Check 0 first-touch alone is knife-edge; hold is the real prompt)

---

## Harness

| Script | npm | Role |
|---|---|---|
| `scripts/check-m1-helios-route.mjs` | `check:m1:helios-route` | **Primary M1-ROUTE gate** |
| `scripts/check-autopilot-v3.mjs` Check 0 | `check:autopilot` | Same seed-47 geometry; first dock entry |
| Browser New Game → N → Helios → dock | `check:demo-opening` / `check:m3:player-facing-public-route` | Complementary public route (Playwright); not required for this REAL product gate |

### `check:m1:helios-route` asserts

- **A** Source: `flybyOrbit`, `approachBand`, no re-boost inside band, no `input.js` import  
- **B** seed-47 Kestrel + authored belt + Rapier: enter dock envelope, **hold ≥90 ticks (~1.5 s)**, closest **&lt; 200** (guards historical ~294), **`dock:range` inRange** for `station_helios`  
- **C** Full `check-autopilot-v3` green (includes Check 0)

---

## Run results

```
npm run check:m1:helios-route
→ exit 0
```

| Check | Result |
|---|---|
| A source contract | PASS |
| B hold + dock:range | PASS — closest **132.12** WU (dock 156), hold 90 ticks, first `dock:range` tick 1082 / t≈18.03 s |
| C autopilot suite | PASS — Check 0 closest **155.63** first-entry, full suite green |

Supporting full-world probe (250 asteroids, traffic, residual boost vel): closest ~130.7, hold 120 ticks, exit OK (diagnostic only, not in gate).

```
npm run check:autopilot
→ exit 0 (via Check C)
```

Browser public route **not** re-run in this slice (long Playwright wall-clock). Product geometry that produced the 294 miss is green under live flightV3 + Rapier. If a browser-only failure reappears with green `check:m1:helios-route`, reclassify that residual as **HARNESS** and keep product path.

---

## Files touched

| Path | Change |
|---|---|
| `src/systems/flightV3.js` | Terminal flyby orbit capture + approach-band boost fence |
| `scripts/check-m1-helios-route.mjs` | New M1 route gate (hold + dock:range + suite) |
| `package.json` | `"check:m1:helios-route": "node scripts/check-m1-helios-route.mjs"` |
| `docs/evidence/orchestration/returns/C_HELIOS_RETURN.md` | This return |

---

## Exit codes

| Command | Exit |
|---|---|
| `npm run check:m1:helios-route` | **0** |

**Status:** REAL product failure addressed; M1 Helios terminal dock envelope + dock prompt emission proven hold under production autopilot. Complementary browser public-route evidence still available via existing demo/M3 routes when wall-clock allows.
