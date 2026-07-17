# C_HELIOS_RETURN — W1 Helios dock terminal

**Date:** 2026-07-17  
**Spine:** grok/depth-player-route-actualization  
**Agent:** Grok spine + explore diagnostics

## Classification

| Finding | Class | Notes |
|---|---|---|
| Historical M1 ~294 WU orbit / no dock prompt | **REAL** (product) | Autopilot terminal missed lateral/away flybys after belt avoidance |
| Dock prompt radius | Not primary | Envelope ~156 WU; never reached historically |
| Focused seed-47 Helios terminal (check:autopilot Check 0) | **GREEN** | Enters dock envelope within 30s sim |
| ALPHA_PROGRAM text still saying M1 red | **STALE** if only docs lag | Re-pin when program rollup updated; live check wins |

## Product change

`src/systems/flightV3.js` autopilot only:
- `flybyOrbit` brake when approach-band lateral/away velocity dominates
- Dual-threshold `headingCapture` for moderate-speed orbits
- Suppress boost inside approach band / when guidance misaligned

## Gates

```
npm run check:autopilot        → exit 0 (Check 0 Helios terminal)
npm run check:m1:helios-route  → exit 0 (named program gate)
```

## Residual

- Full uninjected browser New Game→map→dock hold remains complementary public-route evidence (long Playwright). Headless Rapier terminal is the owning product proof for the 294-WU failure class.
- Graphics fence held.

