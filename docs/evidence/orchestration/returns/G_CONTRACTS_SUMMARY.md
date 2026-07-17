# G_CONTRACTS_SUMMARY — dossier authored mission summary

**Owner:** Grok  
**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Branch:** `grok/depth-player-route-actualization`  
**Date:** 2026-07-17  
**Scope:** SMALL player-visible polish. No station shell redesign. No thrusters/materials/graphics peer.

## Intent

Show authored mission narrative on the live Contracts dossier:

- Body under title, before reward/risk stats
- Prefer `summary`, then `description` (then brief/instruction)
- Class: `sx-dossier__summary`

## Changes

| File | Change |
|---|---|
| `src/ui/station/screens/contracts.js` | `renderDossier` emits escaped narrative under `.sx-dossier__summary` when present |
| `styles/station.css` | Minimal `.sx-dossier__summary` type (13.5px, muted, max-width 62ch) |
| `scripts/check-contracts-board-polish.mjs` | Group 6 pins summary field order, class, placement before topline, CSS hook |

## Verification

| Check | Result |
|---|---|
| `npm run check:contracts-board-polish` | **PASS** (6 groups) |

## Fences

- No station shell redesign
- No dual-platform claims
- No thruster / material / graphics peer work
- No drive-by refactors outside summary path

## Residual

- Board offers without `summary`/`description` still omit the paragraph (no generic filler on the board).
- Headed visual pass optional for taste; source gate pins the render path.
