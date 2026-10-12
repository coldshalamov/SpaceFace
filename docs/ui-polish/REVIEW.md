# UI polish review — living doc for the `ui-polish` PR

Branch worktree: `/workspace/spaceface-scratch/ui-polish` · branch `ui-polish` · base `master` @ `d748312d1`.

This file tracks the stacked visual polish of every shootable 2D screen (`node scripts/ui-bench.mjs --list`). Seeded from `design/frontend/UNIFICATION_LEDGER.md` where useful; **this REVIEW is the authority for this PR**, not the ledger.

Owner bar: consistent, high-detail, creative, interactive, non-generic. Design authority: Deckplate (`--dp-*` / `.dp-*`) + ORRERY composition (light, scales, ladders, the Hand). Screen placement lives in `deckplate/screens.js` / orrery layouts; no new token root.

## Design direction (this PR)

| Axis | Direction |
|---|---|
| **Palette** | Bone / hot bone on void (`--dp-void`); one amber Hand (`--dp-hand` / `--dp-lamp`); ice only for data-in-motion; phos for live readings |
| **Type** | Display title once per screen; label face (Archivo stretch) for instruments; thin numerals for values; read face for prose |
| **Spacing** | Anchored three-column / ladder geometries; instruments dense on purpose; menus breathe; no floating near-misses |
| **Components** | Ladders + Hand, graduated Scales, switch-word pairs on a rail, bind dials, live previews (mixer / Cluster / keys) |
| **Custom elements** | SVG instruments (arcs, ticks, beams with 45° cuts); produced art where an object is shown |
| **OSS assets + licenses** | Existing Deckplate / ORRERY faces and kit textures only this session — no new third-party packs added |

## Status vocabulary

- `SURVEYED` — photographed / known defects; not composed this PR yet
- `IN PROGRESS` — being polished on this branch
- `DONE` — walked, before/after under `docs/ui-polish/`, judged improved
- `SKIP` — deferred (off-limits, harness-owned, or not mountable)

---

## Screen ledger (bench ids)

| Screen (bench id) | Status | Notes / prioritized issues |
|---|---|---|
| `title` / `mainMenu` | SURVEYED | Ledger DONE earlier; re-judge later if polish stack returns |
| `motionAsk` | SURVEYED | Inherits title |
| `new-game` / `newGame` | SURVEYED | Still on fh primitives; composition pass later |
| `pause` | SURVEYED | Ledger DONE; keep selectors stable for player-truth |
| **`settings`** | **DONE** | See § Settings below — this session |
| `save-load` / `saveLoad` / `save-load-empty` / `save-load-live` | SURVEYED | Next player-path candidate |
| `help` | SURVEYED | Next after save-load |
| `codex` / `codex-record` | SURVEYED | |
| `mission-log` / `missionLog` | SURVEYED | |
| `credits` | SURVEYED | Shares orrery settingsLayouts credits path |
| `achievements` | SURVEYED | |
| `statistics` | SURVEYED | |
| `game-over` / `gameOver` | SURVEYED | |
| `tech-tree` / `techTree` / `tech-tree-progress` | SURVEYED | |
| `flight` / `power-rail` | SURVEYED | Off-limits for threat markers (PR #300); polish chrome only later |
| `mobile-flight` / `mobile-stick` / `mobile-boost` / `mobile-brake` / `mobile-wheel` / `mobile-wheel-pinned` | SURVEYED | |
| `crucibleHud` | SURVEYED | |
| `orrery-flight` | SURVEYED | |
| `comms-radial` | SURVEYED | |
| `wingman-radial` | SURVEYED | |
| `ship` | SURVEYED | Ledger DONE earlier |
| `footprint` / `footprint-marked` / `footprint-clean` | SURVEYED | |
| `range` | SURVEYED | Owns CSS holdout |
| `chart` / `galaxyMap` / `chart-galaxy` / `chart-route` / `chart-local` | SURVEYED | Ledger DONE for chart shell |
| `station` / `station-dock` + tabs (`market`, `shipworks`, `industry`, `contracts`, `factions`, `bar`, `ledger`) | SURVEYED | Ledger DONE; re-judge when stack reaches station |
| `crucible` / `crucible-door` / `crucible-draft` / `crucible-rearm` / `crucible-refit` / `crucible-refit-swarm` / `crucible-results` | SURVEYED | |
| `demoEnd` | SURVEYED | |
| `asteroid-works` / `drill` / `drill-claimed` / `drill-build` | SURVEYED | Own design law |
| `base` / `base-claimed` | SURVEYED | |
| `loading` | SURVEYED | |
| `automation` | SURVEYED | |
| `replay` | SURVEYED | |
| `clips` | SURVEYED | |
| `sandbox` | SURVEYED | Ledger DONE for overflow |
| `localmap` / `localmap-legacy` | SURVEYED | |
| `starmap` / `starmap-legacy` | SURVEYED | |

---

## Settings — session notes (2026-10-12)

**Before:** measured clean; composition already ORRERY (ladder + scales + live mixer/HUD/dial). Still read flat: switch words had weak affordance, row hierarchy competed with numerals, preview glass was thin, beam and foot read soft.

**After (2 visual iterations):**

1. **Pass 1** — brighter label hierarchy; roomier rows; switch/choice pairs sit on a rail with a lit underline on the pressed word; thicker scale fill + hotter cursor; stronger category ladder contrast; deeper preview glass veil + brighter legend/beam.
2. **Pass 2** — focus-within row wash; larger/brighter value numerals and select values; BACK foot rail; preview stage corner ticks + foot rule.

**Walk:** `node scripts/ui-bench.mjs --shot=settings --walk` — exit 0; all 19 controls exercised; no tangled/buried/cut-off/offscreen; selectors/IDs unchanged.

**Artifacts**

| | Path |
|---|---|
| Before (Audio) | `docs/ui-polish/settings-before.png` |
| Before tabs | `docs/ui-polish/settings-before-{video,gameplay,access,controls}.png` |
| After (Audio) | `docs/ui-polish/settings-after.png` |
| After tabs | `docs/ui-polish/settings-after-{video,gameplay,access,controls}.png` |

**Code touched:** `src/ui/orrery/settingsLayouts.js`, `src/ui/orrery/settingsPreview.js` only. No loadout data, audio systems, flight HUD threat markers, or engine/render changes.

**Next:** `save-load` (then `help`) on the player path.
