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

---

## Live-boot survey (2026-10-12, real game booted in headless Chromium, 1280×720 + 1920×1080)

Captured by booting the actual game (`node server.js`, Playwright + SwiftShader) and clicking through the main menu the way a player does. Images: `docs/ui-polish/before/*.jpg`, `docs/ui-polish/after/*.jpg`.

Screens reached: Main menu (+ keyboard focus), Load, Crucible (Encounter step), Settings (Audio / Video / Gameplay / Access / Controls), Credits, New Game.
Not reached from the menu: **Archive**, **Achievements** and **Quit** clicks left the main menu on screen (no visible response in a browser build — verify they are wired or give feedback), **Circuits / Sandbox** were not clickable in time (likely locked / gated — needs a visible locked state). In-flight HUD, pause, dialogs and station screens still need a live run to capture (next session).

### Prioritized issues (P0 = broken / clipped, P1 = readability / consistency, P2 = finish)

| Pri | Screen | Issue |
|---|---|---|
| P0 | Settings @ ≤1500px | Label column was 150px: "Sun shadows (ships/rocks/stations)", "Emergency dynamic resolution", "Mute when the window loses focus", "Steer left (classic scheme)" wrapped to 3 lines and rows went ragged. **Fixed** (190px labels, wider pane, tighter tracking + `text-wrap:balance`). |
| P0 | Crucible @ 720p | Stake tiles clipped their own text ("PAYS ×0.75 ·" cut mid-line, "100% / PRESSURE" wrapped) and the Arena row fell below the fold. **Fixed** for the tiles (mark hidden at short heights, single-line pressure/yield). Arena fold still open. |
| P0 | Archive / Achievements / Quit | Click gives no visible response in browser build. Needs a screen, a toast, or a disabled state. |
| P1 | Settings @ 1080p | All legends 12px on a 1080p screen — tiny. **Fixed** with a 1.12 composition zoom between 1800–2199px (the existing 1440p/4K zoom rules already did this above). |
| P1 | Crucible | Hero arena title ("RICOCHET FOUNDRY") and its blurb sit straight on bright 3D art without a scrim — blurb unreadable over the lit floor. Needs a bottom-left gradient scrim. |
| P1 | Crucible @ 1080p | The 3D hull in the bottom-right renders over BACK / ESC and the footer hint. Reserve that corner or move the footer. |
| P1 | Crucible | Step tabs mix three styles: boxed "01 ENCOUNTER", bare "02 SHIP & KIT", and lowercase "03 / Armory". One tab treatment. |
| P1 | Settings / Video | Live HUD preview's FOV readout collides with the speed dial at 1280 width. |
| P1 | Settings | Value numerals (52%, 1.00x) use the thin read face while the rest of the row is Archivo legend caps — reads as two different products. |
| P1 | Main menu | First Tab press jumps to "Credits" in the footer instead of NEW GAME; focus order should follow the visual ladder. |
| P1 | Main menu | SPACEFACE wordmark sits on top of the orrery rings; menu words overlap ring strokes. Needs a clear zone. |
| P2 | Load | "No saves yet" is ~50% bone on void, under contrast for body copy. |
| P2 | New Game | Loadout list ("PULSE LASER · S") is tracked caps at 11px with no column alignment for the size letter (styling only — list data is off-limits). |
| P2 | Settings | Scroll lists fade out at the bottom (Engine trails, Boost / Dash) without a scroll affordance. |
| P2 | Credits | "0% READ" dial reads as a loading bar; fine conceptually but the label needs explaining. |

## Design direction (consolidated)

The game already ships a mature system: Deckplate tokens (`--dp-*`) + ORRERY instruments + the `--sf-*` semantic colour set in `styles/ui.css`. The direction is **unify and enforce, not replace**.

- **Palette:** void `#0a0c10` / surface `#12161c`; bone ink `#dfe3e8` for copy (≥ 7:1), calm `#9aa4b0` for chrome; one amber Hand (`--dp-hand`, ~`#f2b950`) for focus/selection only; `--sf-you` green gains, `--sf-foe` red threat, `--sf-goal` amber objectives; ice blue only for live data. No new hues.
- **Type scale** (already bundled, all OFL in `styles/fonts/`): Archivo variable (wdth 62–125) for display titles (900/125) and legends (700/62–86); Instrument Sans for body/prose; Bricolage Grotesque for hero numerals; Spline Sans Mono only for Asteroid Works. Steps: 12 / 13.5 / 15 / 19 / 24 / 29 / 48–96 (title clamp). Minimum legend 12px at 720p; scale the composition (zoom) at 1080p+ rather than per-rule font bumps.
- **Spacing grid:** 4px base (`--sp-1..6` = 4/8/12/16/24/32); screen gutters `clamp(22px, 3.2vw, 64px)`; row minimum 40px (720p) / 50px (1080p).
- **Component set:** ladder nav + Hand marker, graduated Scale slider, switch-word pair on rail, choice tile with lit underline (`.orr-tile`), keycap / bind dial, primary amber key (`.orr-prep-continue`), footer "‹ BACK ESC" link, live preview plate. Every interactive one needs: rest / hover / focus-visible (amber 2px) / pressed / disabled (50% + "locked" word).
- **Custom elements needed:** locked-state treatment for gated menu items (Circuits/Sandbox), scrim component for text over 3D art, toast/notice for menu actions that do nothing in the browser build, scroll-edge affordance for long setting lists.
- **Open-source assets (only if needed; none added yet):** icons — Lucide (ISC) for generic UI glyphs, game-icons.net (CC BY 3.0, **attribution required** in Credits) for weapon/module glyphs, Kenney UI packs (CC0) for placeholder controller/keyboard prompts. Fonts — current bundled OFL faces cover the need; Rajdhani/Inter (OFL) are not necessary and would dilute the identity. Any addition goes in `third_party/` with its licence and a Credits entry.

## Done this session (stacked commit)

- `src/ui/orrery/settingsLayouts.js`: ≤1500px label column 150→190px, pane 480→516–560px, nav 168–176px, tighter label tracking + balanced wrap; ≥1501px label 236px; 1.12 zoom for 1800–2199px wide screens.
- `src/ui/orrery/cruciblePreparationLayouts.js`: ≤820px tall — stake mark hidden, pressure/yield single-line with tightened tracking, so tiles no longer clip.
- No selectors/IDs changed; no engine/render, audio, loadout data or HUD threat-marker code touched.
