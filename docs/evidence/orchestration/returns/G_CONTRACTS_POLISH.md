# G_CONTRACTS_POLISH — Small Contracts board attention + Accept hierarchy

**Owner:** Grok (parallel complementary polish)  
**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Branch:** `grok/depth-player-route-actualization`  
**Tip base:** `15ea9482` or later  
**Date:** 2026-07-17  
**Scope:** SMALL presentation polish. **No commit.** No station shell redesign. No long suites.

## Intent

Make the Missions / Contracts board read **needs-attention first**:

1. Board rows with `.sx-ct-row.is-attention` scan harder than hover/active peers.
2. Primary **Accept** is the dominant foot CTA: verb large, readiness meta secondary, disabled quiet.
3. Ready Accept under attention gets the strongest glow/pulse; blocked Accept does not pulse.

## Fences honored

| Fence | Status |
|---|---|
| No station shell redesign (`stationApp` destinations/layout) | Yes — not redesigned |
| No `input.js` thrash | Yes |
| No thruster / material / asset remaster | Yes |
| No long suites | Yes — tiny source check only |
| No commit | Yes |

## Changes

### 1. `styles/station.css` (primary ownership)

**Attention rows**

- Left inset azure rail + multi-layer glow (outer ring + bloom).
- Gradient wash so the row reads as “act here,” not a plain selected tile.
- Compound `.is-active.is-attention` keeps attention dominant over plain active.
- Title weight 600 + brighter meta; ACT flag slightly larger / brighter glow.
- `z-index: 1` so the rail is not buried under neighbors.

**Primary Accept hierarchy**

- `.sx-ct-commit` grid: label (`span`) left, readiness (`em`) right.
- Label **15px / 700**; readiness **11px / normal case / muted** (not shout-cased).
- Default primary has a soft azure lift shadow; **disabled** drops glow/filter and uses surface mute.
- Dossier attention frames the panel; ready commit under attention gets stronger white ring + bloom.
- Pulse only when reduced-motion allows and the button is attention-ready (`.is-attention` / ready path).

### 2. `styles/station-workbench.css` (live cascade companion)

Workbench loads **after** `station.css` and was washing out attention when a row was also selected. Minimal companion strengthen only — same selectors, no board topology redesign:

- Stronger worklight rail/glow on `.sx-ct-row.is-attention`.
- Late dispatch-ticket rules: attention beats `.is-active` / hover washout.
- Commit span/em hierarchy + ready-only attention glow aligned with base intent.

### 3. Source check

- New: `scripts/check-contracts-board-polish.mjs`
- npm: `check:contracts-board-polish`
- Pins wiring (`contracts.js`), station.css rail/compound/title, Accept span>em hierarchy, ready-only glow, shell fence.

## Verification

| Check | Result |
|---|---|
| `npm run check:contracts-board-polish` | **PASS** (5 groups) |

Not run (out of scope): full `npm run check`, headed station screenshots, mission handoff runtime.

## Explicit non-goals

- Did **not** redesign dock chrome, destination set, or station shell zones.
- Did **not** change mission accept/track/abandon sim intents or board sort policy.
- Did **not** retune rewards, collateral, or readiness rules.
- Did **not** commit.

## Files touched

- `styles/station.css`
- `styles/station-workbench.css` (live cascade companion only)
- `scripts/check-contracts-board-polish.mjs` (new)
- `package.json` (`check:contracts-board-polish` alias only)
- `docs/evidence/orchestration/returns/G_CONTRACTS_POLISH.md` (this return)

## Residual / follow-ons

- Headed before/after capture of Missions board with `missionDockAttention` accept focus still valuable for taste sign-off.
- Workbench has multiple historical theme layers; the late dispatch-ticket block is the live row chrome — re-check if a future theme pass reorders those rules.
- If a fuller “information hierarchy ruling” lands for station instruments, reuse the span/em + is-attention vocabulary already wired in `contracts.js`.

## Charter return block

```
LIVE AUDIT: contracts board .sx-ct-row.is-attention + .sx-ct-commit Accept hierarchy; station.css base + workbench cascade; contracts.js wiring unchanged.
DIFF SUMMARY: strengthen attention row rail/glow + active+attention; Accept span>em hierarchy + disabled quiet + ready glow; workbench companion so live path is not washed out; check-contracts-board-polish.
GATES: check:contracts-board-polish PASS (5 groups).
FAILURE CLASS: N/A — presentation polish only.
PLAN DRIFT: none — no shell redesign; no long suites; no commit.
RESIDUAL: headed screenshot taste pass; watch future workbench theme reorder.
```
