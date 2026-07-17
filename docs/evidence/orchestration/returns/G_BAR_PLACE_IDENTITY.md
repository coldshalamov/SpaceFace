# G_BAR_PLACE_IDENTITY — quiet Bar place-identity chrome

**Date:** 2026-07-17 · **Owner:** Grok · **Spine:** `SpaceFace-depth-actualization` @ `grok/depth-player-route-actualization`  
**Owning check:** `npm run check:bar:place-identity` (also folded into `check:bar:narrative`)  
**Source residual:** Kimi task 10 / bar place-ness after `G_BAR_STATIONID` plumbing

## Verdict

**REAL gap closed.** Live Bar (`createBarScreen`) shows a quiet place line when `stationId` is available: **station name · faction/sector cantina flavor**. Missing `stationId` hides the chrome.

## Steam bar why

Freelancer / Rebel Galaxy name the berth you are drinking in. A generic “Bar” with only contact names erases place. This is presentation-only chrome — not shell redesign.

## Change

| File | Change |
|---|---|
| `src/ui/station/screens/bar.js` | Export `formatBarPlaceLine`; mount `.sx-bar__place` header; `renderPlace` from `sid()` |
| `styles/station.css` | Quiet place line styles + `.sx-bar__body` 3-col grid (preserves instrument columns) |
| `scripts/check-bar-place-identity.mjs` | Pure formatter + wiring + CSS/shell fence |
| `package.json` | `check:bar:place-identity`; `check:bar:narrative` also runs it |

### Place line contract

- **Input:** `stationId` (from onShow/refresh / `dockedStationId` via existing `sid()`)
- **Output:** `null` if no id; else `"Helios Station · Concord cantina"` (faction short preferred, else sector name, else `local cantina`)
- **Catalog** station name preferred over live entity alias; unknown ids may use entity name

## Gates

| Gate | Result |
|---|---|
| `npm run check:bar:place-identity` | **GREEN** (3 groups) |
| `npm run check:bar:narrative` | **GREEN** (canonical contacts + place identity) |

## Fences honored

| Fence | Status |
|---|---|
| No thrusters / materials / asset remaster | Yes |
| No station shell redesign | Yes — bar instrument only; destinations unchanged |
| No dual-platform claims | Yes |
| `stationId` plumbing from G_BAR_STATIONID reused | Yes |

## Explicit non-goals

- Did not redesign Orbital Command shell, dock zone, or destination set
- Did not change contact engine / wreck rumor / survey / mission lead logic
- Did not add dual-platform or thruster work

## PLAN DRIFT

none — SMALL bar identity chrome only.
