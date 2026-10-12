# UI polish review — living doc for the `ui-polish` PR

Branch worktree: `/workspace/spaceface-scratch/ui-polish` · branch `ui-polish-5` (PR #325) · stacked on `master`. `ui-polish-4` (PR #322) is frozen for review.

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
| **`title`** / **`mainMenu`** | **DONE** | Tab order + logo clear of the orrery rings on ui-polish-5 (§ Main menu below) |
| `motionAsk` | SURVEYED | Inherits title |
| **`new-game`** / `newGame` | **DONE** | See § New Game below; yard/loadout fixes on ui-polish-5 (§ New Game yard fixes) |
| **`pause`** | **DONE** | See § Pause below — ui-polish-5 |
| **`settings`** | **DONE** | See § Settings below — this session |
| **`save-load`** / `saveLoad` / `save-load-empty` / `save-load-live` | **DONE** | See § Save/Load below — this session |
| **`help`** | **DONE** | See § Help below — this session |
| **`codex`** / **`codex-record`** | **DONE** | See § Codex below — this session |
| **`mission-log`** / `missionLog` | **DONE** | See § Mission Log below — this session |
| **`credits`** | **DONE** | See § Credits below — this session |
| **`achievements`** | **DONE** | See § Achievements below — this session |
| **`statistics`** | **DONE** | See § Statistics below — this session |
| **`game-over`** / `gameOver` | **DONE** | See § Game Over below — this session |
| **`tech-tree`** / `techTree` / `tech-tree-progress` | **DONE** | See § Tech Tree below — this session |
| `flight` / `power-rail` | SURVEYED | Off-limits for threat markers (PR #300); polish chrome only later |
| `mobile-flight` / `mobile-stick` / `mobile-boost` / `mobile-brake` / `mobile-wheel` / `mobile-wheel-pinned` | SURVEYED | |
| `crucibleHud` | SURVEYED | |
| **`crucible-results`** | **DONE** (ui-polish-5) | See § Crucible results below |
| `orrery-flight` | SURVEYED | |
| `comms-radial` | SURVEYED | |
| `wingman-radial` | SURVEYED | |
| `ship` | SURVEYED | Ledger DONE earlier |
| `footprint` / `footprint-marked` / `footprint-clean` | SURVEYED | |
| `range` | SURVEYED | Owns CSS holdout |
| `chart` / `galaxyMap` / `chart-galaxy` / `chart-route` / `chart-local` | SURVEYED | Ledger DONE for chart shell |
| `station` / `station-dock` + tabs (`market`, `shipworks`, `industry`, `contracts`, `factions`, `bar`, `ledger`) | SURVEYED | Ledger DONE; re-judge when stack reaches station |
| **`crucible` / `crucible-door`** (+ draft/rearm/refit/results still open) | **DONE** (Encounter / door) | See § Crucible door below — this session |
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

**Next after settings was:** `save-load` — now DONE (see below).

---

## Save/Load — session notes (2026-10-12)

**Before:** live-boot Load empty (`docs/ui-polish/before/03-load-*.jpg` / `save-load-before*.png`) — title emph and empty body too dim on void; vacant hero word washed out; empty filmstrip names/subs faint; foot was plain `BACK ESC` (no ‹ / keycap), unlike settings.

**After (2 visual iterations, CSS-only in `saveLayouts.js`):**

1. **Pass 1** — emph/detail/context contrast raised toward bone (≥ ~0.88–0.94); vacant word brighter + soft glow; open berth rim brightened (`filter` + floor wash); empty filmstrip names/subs less washed; foot rail matched settings (`‹ BACK` + ESC keycap box + underline); mild 1.12 composition zoom at 1800–2199×≥1000 (720p untouched).
2. **Pass 2** — emph/detail/filmstrip empty contrast nudged further; context line hierarchy clearer.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=save-load-empty --walk` — exit 0; 5 controls exercised; no tangled/buried/cut-off/offscreen. Also `--shot=save-load` and `--shot=save-load-live` measured clean. Selectors/IDs unchanged. Game-over block untouched.

**Artifacts**

| | Path |
|---|---|
| Before (Load empty @720) | `docs/ui-polish/save-load-before.png` (+ `before/03-load-1280x720.jpg`) |
| Before (Load empty @1080) | `docs/ui-polish/save-load-before-1080.png` |
| After (bench empty @720) | `docs/ui-polish/save-load-after.png` |
| After (bench empty @1080) | `docs/ui-polish/save-load-after-1080.png` |
| After (filed + live) | `docs/ui-polish/save-load-filed-after.png`, `save-load-live-after.png` |

**Code touched:** `src/ui/orrery/saveLayouts.js` only. No loadout data, audio, flight HUD threat markers, engine/render, or game-over style changes.

**Next after save-load was:** `help` — now DONE (see below).

---


## Help — session notes (2026-10-12)

**Before:** ORRERY Help already strong (ladder + Hand, Controls Rig, readings). Gaps vs the polished settings/save-load stack: CLOSE foot was a display-size word + Esc glyph (not the `‹ … ESC` keycap rail); section ladder / reading / search rested too dim on void; search rule CSS was broken (duplicate `background` + stray `}) !important`); no shared foot language with settings.

**After (2 visual iterations, CSS-only in `helpLayouts.js`):**

1. **Pass 1** — foot rail matched settings/save-load (`‹ CLOSE` + ESC keycap box + underline); section-ladder and reading contrast raised (tabs/names/kickers/terms/lore/empty ≥ ~0.82–0.92); fixed search lit-rule CSS; deeper reading shade pool.
2. **Pass 2** — kept foot `min-height:44px` so the stage row doesn't collapse; left 1080p zoom off Help (EVERY KEY + rebound footnote already dense; 720p had a pre-existing measure tangle unrelated to this pass).

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=help --walk` — exit 0; measured clean at default 1920×1080; 26 controls exercised; selectors/IDs unchanged. `--viewport=1280x720` still reports a pre-existing EVERY KEY / rebound-footnote bounding-box tangle (present on master before this pass).

**Artifacts**

| | Path |
|---|---|
| Before (Controls @1080) | `docs/ui-polish/help-before.png` |
| Before tabs | `docs/ui-polish/help-before-{loops,ships,commodities,ores,factions}.png` |
| After (Controls @1080) | `docs/ui-polish/help-after.png` |
| After tabs | `docs/ui-polish/help-after-{loops,ships,commodities,ores,factions}.png` |
| After @720 | `docs/ui-polish/help-after-720.png` |

**Code touched:** `src/ui/orrery/helpLayouts.js` only. No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next after help was:** `credits` — now DONE (see below).

---


## Credits — session notes (2026-10-12)

**Before:** ORRERY Credits already strong (reel + orrery Hand + drift). Gaps vs the polished settings/save-load/help stack: BACK foot was plain `‹ BACK ESC` text (no keycap box / underline); subtitle / ladder / notice / row-sub copy sat too dim on void; "0% READ" read as a loading bar; at 720p orrery body nums 03/04 clipped their discs.

**After (2 visual iterations, CSS + one label string in `settingsLayouts.js`):**

1. **Pass 1** — foot rail matched settings/save-load/help (`‹ BACK` + ESC keycap box + underline); progress label `Read` → `Of reel`; title/ladder/notice/row-sub/end contrast raised (≥ ~0.78–0.92); short-window hide of orrery body nums; 1.12 zoom @1080p band.
2. **Pass 2** — ladder rest/current contrast nudged; title rule and row ticks brighter.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=credits --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 14 controls exercised; selectors/IDs unchanged.

**Artifacts**

| | Path |
|---|---|
| Before (Made by @1080) | `docs/ui-polish/credits-before.png` |
| Before (@720) | `docs/ui-polish/credits-before-720.png` |
| After (Made by @1080) | `docs/ui-polish/credits-after.png` |
| After (@720) | `docs/ui-polish/credits-after-720.png` |
| After (Libraries / Fonts) | `docs/ui-polish/credits-after-libraries.png`, `credits-after-fonts.png` |

**Code touched:** `src/ui/orrery/settingsLayouts.js` (CREDITS_CSS + `createReelProgress` label only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next:** `codex` / `codex-record` — now DONE (see below).

---

## Codex — session notes (2026-10-12)

**Before:** ORRERY Codex already strong (section ladder + entry rail + plate dial + unlock gauges). Gaps vs the polished settings/save-load/help/credits stack: CLOSE foot was plain `‹ CLOSE ESC` text (no keycap box / underline); subtitle, index labels, section tabs, locked cipher, filed/meta, empty notes, and search placeholder sat soft on void; no 1.12 composition zoom in the 1080p band; ladder/search rails and ticks read thin.

**After (2 visual iterations, CSS only in `archiveLayouts.js` CODEX_CSS):**

1. **Pass 1** — foot rail matched settings/save-load/help/credits (`‹ CLOSE` + ESC keycap box + underline); secondary copy contrast raised (≥ ~0.78–0.94); plate engraving brighter; 1.12 zoom @1080p band (1800–2199 × ≥1000).
2. **Pass 2** — search rule + lens, section scale, entry rail, row ticks, wedge edge, and measure rule nudged brighter.

**Walk:** `node scripts/ui-bench.mjs --shot=codex --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 13 controls exercised (tabs, next, close); selectors/IDs unchanged. `codex-record` re-shot after the same CSS.

**Artifacts**

| | Path |
|---|---|
| Before (Story / B0 @1080) | `docs/ui-polish/codex-before.png` |
| Before (@720) | `docs/ui-polish/codex-before-720.png` |
| After (Story / B0 @1080) | `docs/ui-polish/codex-after.png` |
| After (@720) | `docs/ui-polish/codex-after-720.png` |
| Before (Figures / The Record) | `docs/ui-polish/codex-record-before.png` |
| After (Figures / The Record) | `docs/ui-polish/codex-record-after.png` |

**Code touched:** `src/ui/orrery/archiveLayouts.js` (CODEX_CSS only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes. Mission-log CSS in the same file left alone this session.

**Next after codex was:** `mission-log` — now DONE (see below).

---


## Mission Log — session notes (2026-10-12)

**Before:** ORRERY Mission Log already strong (tracing beam + dial + route lane). Gaps vs the polished settings/save-load/help/credits/codex stack: BACK foot was plain `‹ BACK ESC` text (no keycap box / underline); story line, section caps, kickers, row-subs, empty notes, dial/clock secondary, and terms labels sat soft on void; no 1.12 composition zoom in the 1080p band; beam / lane / dial ticks read thin.

**After (2 visual iterations, CSS only in `archiveLayouts.js` MLOG_CSS):**

1. **Pass 1** — foot rail matched settings/save-load/help/credits/codex (`‹ BACK` + ESC keycap box + underline); secondary copy contrast raised (≥ ~0.78–0.94); beam + dial ticks brighter; 1.12 zoom @1080p band (1800–2199 × ≥1000).
2. **Pass 2** — SHOW/verb chevrons and word-subs nudged; lane band / hop ticks / route face ring / clock ticks / career diamond / completed hollow nodes brighter.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=mission-log --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 6 controls exercised (SHOW×2, track, local map, abandon, close); selectors/IDs unchanged.

**Artifacts**

| | Path |
|---|---|
| Before (@1080) | `docs/ui-polish/mission-log-before.png` |
| Before (@720) | `docs/ui-polish/mission-log-before-720.png` |
| After (@1080) | `docs/ui-polish/mission-log-after.png` |
| After (@720) | `docs/ui-polish/mission-log-after-720.png` |

**Code touched:** `src/ui/orrery/archiveLayouts.js` (MLOG_CSS only). Codex CSS in the same file left alone this session. No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next after mission-log was:** `achievements` — now DONE (see below).

---

## Achievements — session notes (2026-10-12)

**Before:** ORRERY Achievements already strong (medal orrery + read dial + word-scale filters). Gaps vs the polished settings/save-load/help/credits/codex/mission-log stack: BACK foot was plain `BACK · ESC` (no keycap box / underline / ‹); subtitle, filter rest words, kicker/of/status, locked glyph, dial ghost/ticks, stage tracks/labels sat soft on void; no 1.12 composition zoom in the 1080p band.

**After (2 visual iterations, CSS only in `constellationLayouts.js` ACHIEVEMENTS):**

1. **Pass 1** — foot rail matched settings/save-load/help/credits/codex/mission-log (`‹ BACK` + ESC keycap box + underline); secondary copy contrast raised (≥ ~0.78–0.94); read-dial ghost/ticks/glyph brighter; word-scale rule/counts brighter; 1.12 zoom @1080p band; optional 1440p/4K zoom rules (`1.25` / `1.85`) matching archive screens.
2. **Pass 2** — filter rest bumped again; stage orrery tracks / ring names / hub of / medal labels brighter under achievements-only selectors; read dial chrome nudged once more.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=achievements --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 28 controls (24 exercised: medals, Back, ALL); selectors/IDs unchanged.

**Artifacts**

| | Path |
|---|---|
| Before (@1080) | `docs/ui-polish/achievements-before.png` |
| Before (@720) | `docs/ui-polish/achievements-before-720.png` |
| After (@1080) | `docs/ui-polish/achievements-after.png` |
| After (@720) | `docs/ui-polish/achievements-after-720.png` |

**Code touched:** `src/ui/orrery/constellationLayouts.js` (ACHIEVEMENTS only). RESEARCH CSS in the same file left alone this session. No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next after achievements was:** `statistics` — now DONE (see below).

---

## Statistics — session notes (2026-10-12)

**Before:** kit `k-screen--stage` list with fh title; amber primary Back (no ‹ / ESC keycap); group caps / row hairlines / secondary copy soft on void; no ORRERY composition sheet; no 1.12 zoom in the 1080p band; LAW rows fell under the fold at 720p.

**After (2 visual iterations + short-frame tighten):**

1. **Pass 1** — new `statisticsLayouts.js` ORRERY sheet scoped to `.orr-statistics`: foot rail `‹ BACK` + ESC keycap + underline; title/subtitle contrast; shade pool under the reading; group caps + row names ≥ ~0.84–0.94; phos numerals; brighter hairlines; scrollable stage; 1.12 zoom @1080p (+1440/4K archive zoom).
2. **Pass 2** — group caps get a soft rule; row/numeral contrast nudged; stage bottom pad so LAW clears the foot; short-height (≤820px) tighten so Status + Heat stay on first paint at 720p.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=statistics --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 1 control (Back); selectors/IDs unchanged.

**Artifacts**

| | Path |
|---|---|
| Before (@1080) | `docs/ui-polish/statistics-before.png` |
| Before (@720) | `docs/ui-polish/statistics-before-720.png` |
| After (@1080) | `docs/ui-polish/statistics-after.png` |
| After (@720) | `docs/ui-polish/statistics-after-720.png` |

**Code touched:** `src/ui/orrery/statisticsLayouts.js` (new), `src/ui/screens/statistics.js` (inject + `orr-statistics` + `sf-back` on Back only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next after statistics was:** `new-game` — now DONE (see below).

---

## New Game — session notes (2026-10-12)

**Before:** ORRERY New Game already strong (yard carousel + hull ring + Lamp Launch). Gaps vs the polished settings/save-load/help/credits/codex/mission-log/achievements/statistics stack: BACK foot was plain `BACK ESC` text (no ‹ / keycap box / underline); field labels (~.55), difficulty rest words, route caps, loadout copy, and fine print sat soft on void; loadout size letters trailed with a · and no shared column edge (P2); no 1.12 composition zoom in the 1080p band.

**After (2 visual iterations, CSS overlay in `newGameLayouts.js`):**

1. **Pass 1** — foot rail matched settings stack (`‹ BACK` + ESC keycap box + underline); secondary copy contrast raised (≥ ~0.78–0.94); loadout size letter column (no · separator); 1.12 zoom @1080p band. Launch Lamp Key untouched.
2. **Pass 2** — loadout name column fixed-width so size letters share one edge; LOADOUT kicker brighter; short-width name column tighten.

**Walk:** `SF_CHROMIUM=… node scripts/ui-bench.mjs --shot=new-game --walk` — exit 0; measured clean at 1920×1080 and 1280×720; 12 controls exercised; selectors/IDs unchanged. Loadout item DATA untouched.

**Artifacts**

| | Path |
|---|---|
| Before (@1080) | `docs/ui-polish/new-game-before.png` |
| Before (@720) | `docs/ui-polish/new-game-before-720.png` |
| After (@1080) | `docs/ui-polish/new-game-after.png` |
| After (@720) | `docs/ui-polish/new-game-after-720.png` |

**Code touched:** `src/ui/orrery/newGameLayouts.js` (new), `src/ui/screens/newGame.js` (inject only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next:** `game-over` — now DONE (see below).

---

## Game Over — session notes (2026-10-12)

**Before:** ORRERY after-action already composed (red-cooled rays, cause as headline, career ring, black-box tape). Gaps vs the polished stack: at 1280×720 the action rail wrapped (MAIN MENU / LOAD dropped to a second line); the secondary verbs were 11px words with a dim `›` and no affordance; an unavailable *Load latest* (no save yet) looked exactly as live as the others; the ring hub (`NO RECORD` / time flown) sat straight on the hull plan view; hero labels, coverage lines, ring stations, ring title and the black-box legend sat at ~.6–.7 bone; no lift in the 1080p band.

**Bench note:** `ui-bench --shot=game-over` photographs before the screen's 400 ms death slide ends (a JS timer, not a CSS animation, so `settleAnimations` can't finish it) and shows only the backdrop. Shots this session came from a bench page held ~1.2 s past ready, plus a career-populated variant (playtime, contracts, kills, trades, profit) to load the ring stations.

**After (2 visual iterations, CSS overlay in `gameOverLayouts.js`):**

1. **Pass 1** — verbs on one non-wrapping rail with an underline that lights with the Hand (720p gets a tighter gap); verbs 12.5px bone; hub shaded with a soft void disc and the hull dimmed under `NO RECORD`; contrast raised on sub/coverage/hero labels/stations/units/tape legend; CAREER RECORD title flanked by rules; `--sv` 1.1 in the 1080p band.
2. **Pass 2** — red kicker one step larger; `aria-disabled` verbs (Load latest with no save) rest at .46 bone with a faint rule.

**Walk:** `node scripts/ui-bench.mjs --shot=game-over --walk` — exit 0; measured clean; 4 controls exercised (Load save → saveLoad, Load latest disabled, New Game asks, Main menu → mainMenu). Related tests (black-box names, death recovery, load-latest verb, interrupted recovery, death name, gamepad screens) 53/53 pass. Selectors/IDs unchanged.

**Artifacts**

| | Path |
|---|---|
| Before (career @1080) | `docs/ui-polish/game-over-before.png` |
| Before (no record @720) | `docs/ui-polish/game-over-before-720.png` |
| After (career @1080) | `docs/ui-polish/game-over-after.png` |
| After (no record @720) | `docs/ui-polish/game-over-after-720.png` |

**Code touched:** `src/ui/orrery/gameOverLayouts.js` (new), `src/ui/screens/gameOver.js` (inject only). `saveLayouts.js` GAME_OVER block untouched. No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next:** `tech-tree` / `tech-tree-progress` — now DONE (see below).

---

---

## Tech Tree — session notes (2026-10-12)

**Before:** Research Constellation already composed (dial, dossier, legend). Gaps vs the polished stack: the hour-verb curve (`1 Propelled charge · …`) ran the full title width and tangled with rim sector names (LOGISTICS) and star labels (Deflector Theory) — ui-bench reported ON TOP OF at 1080 and 720; foot used plain `BACK · ESC` instead of the stack's `‹ BACK` + ESC keycap; secondary copy (sub, corner labels, dossier chrome, legend/view) sat at ~.62–.8 bone; no 1080p composition zoom.

**After (2 visual iterations, RESEARCH CSS in `constellationLayouts.js` + curve clip in `techTree.js`):**

1. **Pass 1** — foot keycap rail; secondary contrast; title shade pool; curve max-width + ellipsis; rim sector chrome brighten; 1080p/1440/4K zoom.
2. **Pass 2** — tighter curve width; DOM-clipped hour-verb line (full ladder on `title=`) so Range-based layout measure matches the eye. Bench: `measured: no tangled…` on `tech-tree` and `tech-tree-progress`; walk exercised controls on both.

**Walk:** `node scripts/ui-bench.mjs --shot=tech-tree,tech-tree-progress --walk` — exit 0; measured clean; selectors/IDs unchanged. ACHIEVEMENTS block untouched.

**Artifacts**

| | Path |
|---|---|
| Before (empty @1080) | `docs/ui-polish/tech-tree-before.png` |
| Before (empty @720) | `docs/ui-polish/tech-tree-before-720.png` |
| Before (progress @1080) | `docs/ui-polish/tech-tree-progress-before.png` |
| Before (progress @720) | `docs/ui-polish/tech-tree-progress-before-720.png` |
| After (empty @1080) | `docs/ui-polish/tech-tree-after.png` |
| After (empty @720) | `docs/ui-polish/tech-tree-after-720.png` |
| After (progress @1080) | `docs/ui-polish/tech-tree-progress-after.png` |
| After (progress @720) | `docs/ui-polish/tech-tree-progress-after-720.png` |

**Code touched:** `src/ui/orrery/constellationLayouts.js` (RESEARCH block), `src/ui/screens/techTree.js` (curve clip + title= only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next:** `crucible` / `crucible-door` — now DONE for Encounter (see below); remaining draft/armory steps next.

---

## Crucible door (Encounter) — session notes (2026-10-12)

**Before:** Live-boot survey left three P1s open on the Encounter step: hero title/blurb sat on bright 3D art with no scrim; at 1080p the hull art painted over BACK/ESC and the door hint; step chrome mixed boxed `01 ENCOUNTER`, bare `02 SHIP & KIT`, and lowercase `03 / Armory`. Arena fold at 720p was still open after the earlier stake-tile fix.

**After (visual iterations in `cruciblePreparationLayouts.js` + nextStep label casing in `cruciblePreparation.js`):**

1. **Scrim** — bottom-left void→transparent wash via `.orr-door-hero::after` plus void gradients on `.orr-door-hero__words` / `.orr-prep-brief` so RICOCHET FOUNDRY + blurb + purse read over the lit floor.
2. **Foot rail** — `.k-foot` raised (`z-index:6`) with solid void + upward shadow; stronger bottom fade on `.orr-door-hero__art`; `‹ BACK` + ESC keycap matched to new-game / save / tech-tree (bone `#ece6d8`).
3. **Tabs** — one face, uppercase labels, number+label rhythm; selected = Hand underline only (outline only on `:focus-visible`); `.orr-prep-nextstep` muted as `03 ARMORY` / `03 LAUNCH`.
4. **720p Arena fold** — further tighten in `@media (max-height:820px)` (chrome, mode/stake, blurbs); arena strip thumbs hidden so both name rows sit above the foot.
5. **1080p lift** — type/spacing scale in the 1800–2199×≥1000 band (full `zoom:1.12` clipped the foot on this denser screen, so lift is applied without CSS zoom).

**Walk:** `node scripts/ui-bench.mjs --shot=crucible-door --viewport=1920x1080` and `--viewport=1280x720` — exit 0; measured clean. Selectors/IDs (`sf-prep-tab-*`, classes) unchanged.

**Artifacts**

| | Path |
|---|---|
| Before (@1080) | `docs/ui-polish/crucible-before.png` |
| Before (@720) | `docs/ui-polish/crucible-before-720.png` |
| After (@1080) | `docs/ui-polish/crucible-after.png` |
| After (@720) | `docs/ui-polish/crucible-after-720.png` |
| Live-boot baseline | `docs/ui-polish/before/04-crucible-*.jpg` (kept) |

**Code touched:** `src/ui/orrery/cruciblePreparationLayouts.js`, `src/ui/orrery/cruciblePreparation.js` (nextStep textContent casing/format only). No loadout data, audio, flight HUD threat markers, engine/render, or selector/ID changes.

**Next:** `crucible-draft` / armory (and remaining crucible family steps), then the next unfinished screen in the ledger.

---

## Pause (`pause`) — ui-polish-5 (2026-10-12)

New overlay `src/ui/orrery/pauseLayouts.js`, injected from `pause.js` (one import + one call beside `injectOrreryScreens`). Scoped to `.of-pause.orr-pause` / `.orr-pause--phone`; selectors/IDs unchanged. Composition in `screenLayouts.js` + deckplate PAUSE left alone.

**Before:** title/eyebrow soft on the held world; FLIGHT BRIEF kicker + save line sat ~.55–.6 bone; foot keys were bare glyphs (screenLayouts stripped the boxes); bank verbs on the dial read thin; no 1080p lift; phone brief had little hierarchy.

**Pass 1–2 (CSS only):**
1. Title hotter bone + deeper void halo.
2. Brief hierarchy — kicker ≥.9 with a trailing hairline, name hot bone, next ≥.86, save ≥.82, deeper shade pool, ice ring reading brighter.
3. Verb ladder — rest dial words ≥.86; sector legends ≥.92; phone group heads + bank verbs clearer with more row gap.
4. Foot — settings-rail keycap boxes (`ESC`/`P`/`F5`/…) + brighter verb labels + underline rail under the keys strip.
5. 1080p band — zoom **head + brief + foot only** (`--sv` 1.12); dial stage untouched (arcRail places from `getBoundingClientRect`).
6. Short-height tighten; phone brief kicker rule.

**Walk:** `node scripts/ui-bench.mjs --shot=pause --walk` — exit 0; measured clean; 19 controls exercised; selectors/IDs unchanged. Checked at 1280×720, 1920×1080, 390×844.

| Shot | Path |
|---|---|
| Before (@720) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/before/pause-1280x720.png` |
| After (@720) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/after/pause-1280x720.png` |
| Before (@1080) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/before/pause-1920x1080.png` |
| After (@1080) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/after/pause-1920x1080.png` |
| Before (phone) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/before/pause-390x844.png` |
| After (phone) | `/workspace/spaceface-scratch/ui-shots/pause-20261012-1515/after/pause-390x844.png` |

**Next:** HUD chrome / dialogs / stations; re-verify earlier screens on fresh assets; SANDBOX-over-nose remaining on main menu @1080p.


## Live-boot survey (2026-10-12, real game booted in headless Chromium, 1280×720 + 1920×1080)

Captured by booting the actual game (`node server.js`, Playwright + SwiftShader) and clicking through the main menu the way a player does. Images: `docs/ui-polish/before/*.jpg`, `docs/ui-polish/after/*.jpg`.

Screens reached: Main menu (+ keyboard focus), Load, Crucible (Encounter step), Settings (Audio / Video / Gameplay / Access / Controls), Credits, New Game.
Not reached from the menu: **Archive**, **Achievements** and **Quit** clicks left the main menu on screen (no visible response in a browser build — verify they are wired or give feedback), **Circuits / Sandbox** were not clickable in time (likely locked / gated — needs a visible locked state). In-flight HUD, pause, dialogs and station screens still need a live run to capture (next session).

### Prioritized issues (P0 = broken / clipped, P1 = readability / consistency, P2 = finish)

| Pri | Screen | Issue |
|---|---|---|
| P0 | Settings @ ≤1500px | Label column was 150px: "Sun shadows (ships/rocks/stations)", "Emergency dynamic resolution", "Mute when the window loses focus", "Steer left (classic scheme)" wrapped to 3 lines and rows went ragged. **Fixed** (190px labels, wider pane, tighter tracking + `text-wrap:balance`). |
| P0 | Crucible @ 720p | Stake tiles clipped their own text ("PAYS ×0.75 ·" cut mid-line, "100% / PRESSURE" wrapped) and the Arena row fell below the fold. **Fixed** for the tiles (earlier) and Arena fold (this session: short-height tighten + arena thumbs hidden so both name rows clear the foot). |
| P0 | Archive / Achievements / Quit | Click gives no visible response in browser build. Needs a screen, a toast, or a disabled state. |
| P1 | Settings @ 1080p | All legends 12px on a 1080p screen — tiny. **Fixed** with a 1.12 composition zoom between 1800–2199px (the existing 1440p/4K zoom rules already did this above). |
| P1 | Crucible | Hero arena title ("RICOCHET FOUNDRY") and its blurb sit straight on bright 3D art without a scrim — blurb unreadable over the lit floor. **Fixed** (void→transparent scrim under words + brief). |
| P1 | Crucible @ 1080p | The 3D hull in the bottom-right renders over BACK / ESC and the footer hint. **Fixed** (foot z-index + solid void backing, stronger art bottom fade, `‹ BACK` + ESC keycap rail). |
| P1 | Crucible | Step tabs mix three styles: boxed "01 ENCOUNTER", bare "02 SHIP & KIT", and lowercase "03 / Armory". **Fixed** (one uppercase tab face; selected = Hand underline; muted `03 ARMORY` / `03 LAUNCH`). |
| P1 | Settings / Video | Live HUD preview's FOV readout collides with the speed dial at 1280 width. |
| P1 | Settings | Value numerals (52%, 1.00x) use the thin read face while the rest of the row is Archivo legend caps — reads as two different products. |
| P1 | Main menu | First Tab press jumps to "Credits" in the footer instead of NEW GAME; focus order should follow the visual ladder. **Fixed** (Tab walks verbs → reference line → Credits/Achievements, wraps). |
| P1 | Main menu | SPACEFACE wordmark sits on top of the orrery rings; menu words overlap ring strokes. Needs a clear zone. **Fixed** (dial fades up from under the name; awake verb seated clear of tick + leader). |
| P2 | Load | "No saves yet" is ~50% bone on void, under contrast for body copy. **Fixed** (emph ≥.94, empty detail .92, vacant word .9 + open-berth glow). |
| P2 | New Game | Loadout list ("PULSE LASER · S") is tracked caps at 11px with no column alignment for the size letter (styling only — list data is off-limits). **Fixed** (size column, no ·; contrast + foot keycap). |
| P2 | Settings | Scroll lists fade out at the bottom (Engine trails, Boost / Dash) without a scroll affordance. |
| P2 | Credits | "0% READ" dial read as a loading bar. **Fixed** — label is now "OF REEL"; foot keycap + contrast pass. |

## Design direction (consolidated)

The game already ships a mature system: Deckplate tokens (`--dp-*`) + ORRERY instruments + the `--sf-*` semantic colour set in `styles/ui.css`. The direction is **unify and enforce, not replace**.

- **Palette:** void `#0a0c10` / surface `#12161c`; bone ink `#dfe3e8` for copy (≥ 7:1), calm `#9aa4b0` for chrome; one amber Hand (`--dp-hand`, ~`#f2b950`) for focus/selection only; `--sf-you` green gains, `--sf-foe` red threat, `--sf-goal` amber objectives; ice blue only for live data. No new hues.
- **Type scale** (already bundled, all OFL in `styles/fonts/`): Archivo variable (wdth 62–125) for display titles (900/125) and legends (700/62–86); Instrument Sans for body/prose; Bricolage Grotesque for hero numerals; Spline Sans Mono only for Asteroid Works. Steps: 12 / 13.5 / 15 / 19 / 24 / 29 / 48–96 (title clamp). Minimum legend 12px at 720p; scale the composition (zoom) at 1080p+ rather than per-rule font bumps.
- **Spacing grid:** 4px base (`--sp-1..6` = 4/8/12/16/24/32); screen gutters `clamp(22px, 3.2vw, 64px)`; row minimum 40px (720p) / 50px (1080p).
- **Component set:** ladder nav + Hand marker, graduated Scale slider, switch-word pair on rail, choice tile with lit underline (`.orr-tile`), keycap / bind dial, primary amber key (`.orr-prep-continue`), footer "‹ BACK ESC" link, live preview plate. Every interactive one needs: rest / hover / focus-visible (amber 2px) / pressed / disabled (50% + "locked" word).
- **Custom elements needed:** locked-state treatment for gated menu items (Circuits/Sandbox), scrim component for text over 3D art, toast/notice for menu actions that do nothing in the browser build, scroll-edge affordance for long setting lists.
- **Open-source assets (only if needed; none added yet):** icons — Lucide (ISC) for generic UI glyphs, game-icons.net (CC BY 3.0, **attribution required** in Credits) for weapon/module glyphs, Kenney UI packs (CC0) for placeholder controller/keyboard prompts. Fonts — current bundled OFL faces cover the need; Rajdhani/Inter (OFL) are not necessary and would dilute the identity. Any addition goes in `third_party/` with its licence and a Credits entry.

## Done this session (stacked commit)

- `src/ui/orrery/settingsLayouts.js`: ≤1500px label column 150→190px, pane 480→516–560px, nav 168–176px, tighter label tracking + balanced wrap; ≥1501px label 236px; 1.12 zoom for 1800–2199px wide screens. Credits: foot keycap rail, `Of reel` progress label, contrast, short-window orrery-num hide, 1080p zoom.
- `src/ui/orrery/cruciblePreparationLayouts.js`: ≤820px tall — stake mark hidden, pressure/yield single-line with tightened tracking, so tiles no longer clip.
- `src/ui/orrery/cruciblePreparationLayouts.js` + `cruciblePreparation.js`: Encounter door scrim, unified tabs, foot keycap rail, Arena fold @720p, 1080p type lift.
- `src/ui/orrery/saveLayouts.js`: save-load empty-state contrast (emph/detail/vacant/filmstrip), open-berth glow, settings-matched `‹ BACK` + ESC keycap foot rail, 1.12 zoom @1080p band. Game-over styles unchanged.
- `src/ui/orrery/helpLayouts.js`: Help foot rail `‹ CLOSE` + ESC keycap; ladder/reading/search contrast; fixed broken search-rule CSS; reading shade deepened. Selectors/IDs unchanged.
- `src/ui/orrery/archiveLayouts.js`: Codex foot keycap rail, secondary contrast, rail/tick brighten, 1080p zoom. Selectors/IDs unchanged.
- `src/ui/orrery/archiveLayouts.js`: Mission Log foot keycap rail, secondary contrast, beam/lane/dial brighten, 1080p zoom. Selectors/IDs unchanged.
- `src/ui/orrery/constellationLayouts.js`: Achievements foot keycap rail, secondary contrast, dial/stage chrome brighten, 1080p (+1440/4K) zoom. Selectors/IDs unchanged. RESEARCH block untouched.
- `src/ui/orrery/statisticsLayouts.js` + `src/ui/screens/statistics.js`: Statistics ORRERY foot keycap rail, reading contrast, shade pool, 1080p zoom, short-frame LAW fit. Selectors/IDs unchanged.
- `src/ui/orrery/newGameLayouts.js` + `src/ui/screens/newGame.js`: New Game foot keycap rail, secondary contrast, loadout size column, 1080p left-column lift (the screen-wide zoom was replaced on ui-polish-5). Selectors/IDs and loadout data unchanged.
- `src/ui/orrery/constellationLayouts.js` + `src/ui/screens/techTree.js`: Tech Tree / Research foot keycap rail, hour-verb curve clip (no dial tangle), secondary contrast, rim chrome, 1080p zoom. Selectors/IDs unchanged. ACHIEVEMENTS block untouched.
- `src/ui/orrery/pauseLayouts.js` + `src/ui/screens/pause.js`: Pause title/brief/ladder contrast, foot keycap rail, 1080p head/brief/foot lift (dial untouched). Selectors/IDs unchanged.
- No selectors/IDs changed; no engine/render, audio, loadout data or HUD threat-marker code touched.

## Crucible results (`crucible-results`) — ui-polish-5 (2026-10-12)

New overlay `src/ui/orrery/crucibleResultsLayouts.js`, injected from the results mount (one import + one call in `crucible.js`). Scoped to `.sf-crucible-results.has-deathdial`; no DOM, selector or ID changes.

- **Fixed (P0):** the left column was two clipped scrollers. At 720p *What you built* ran into *The run* and the share codes faded out; at 1080p *Share* showed a title with nothing under it. Now it is one scroll column in reading order: figures, the run, the build, results sheet, stunt combo, share. A bottom fade shows there is more.
- **Fixed (P0, 390×844):** the dial sat on top of the column and the figures overlapped ("6 31 24 88"). The phone layout now stacks title, dial, take, column, with the ways out docked at the bottom on a solid fade. The figures are a 2×2 grid, the wave engraving is hidden where it hit STARBOARD, and the short hit legend replaces the long one.
- **Finish (P1):** each band title runs into a hairline. The share codes are framed fields with an underlined save link. Story and lead copy is brighter. The 1080p band lifts the figures, copy and build verbs.
- Checked at 1280×720, 1920×1080 and 390×844, including scrolled to the bottom. Shots are in `/workspace/spaceface-scratch/ui-shots/results/` (not committed).

## New Game yard fixes (`new-game`) — ui-polish-5 (2026-10-12)

CSS only, in `src/ui/orrery/newGameLayouts.js`. No DOM, selector, ID or loadout-data changes.

- **Fixed (P0, 1080p):** HITCH / SKATER sat on the *First 15 minutes* route and WASP was cut by the hero ship. Cause: the screen-wide 1.12 zoom from the earlier New Game pass. The yard carousel places hulls and names from `getBoundingClientRect`, so the zoom scaled those offsets twice. The zoom now applies only to the left column (header, fields, foot, fine print), the same way the 1440p rule in `screenLayouts.js` already does it. The yard, stage and route stay at 1:1, and the caption copy and loadout get a small type lift instead.
- **Fixed (P1):** hull names sit above every ship model, with a dark halo, so a hero's engine glow no longer covers a rear name.
- **Fixed (P1, 720p):** SHIELD BOOSTER ran into its size letter. The loadout name column is wider at ≤1366px.
- **Fixed (P1, 390×844):** PELICAN and WASP ran together in the *Start as* row. Names now size to their content, slightly smaller, with a fixed gap.
- Checked at 1280×720, 1366×768, 1920×1080, 2560×1440 and 390×844; `--walk` exercised 12 controls with all three hulls brought to the front. `test/yard-carousel` and the new-game tests pass (50/50). Shots are in `/workspace/spaceface-scratch/ui-shots/ng5/` (not committed).

## Main menu (`mainMenu`) — ui-polish-5 (2026-10-12)

`src/ui/screens/mainMenu.js` + `src/ui/orrery/arcRail.js` (the `clearOf` mask is used only by the title; the new `seat` option defaults to the old 6px, so pause is unchanged). No selector, ID or DOM changes.

- **Fixed (P1, Tab order):** each `words()` group keeps its one roving Tab stop, and `_syncCurrent` set every reference word to `tabIndex -1`. The result was that the first Tab from the lit verb went straight to CREDITS, and HELP / ARCHIVE / CIRCUITS / PHYSICS / SANDBOX could not be reached with Tab at all. Tab and Shift+Tab now follow the reading order (verb ladder → reference line → Credits → Achievements) and wrap. Hidden Continue and still-loading verbs are skipped, the same as the arrow keys. Arrow keys still move within a group.
- **Fixed (P1, logo over rings):** the old mask cut a tight box out of the rings, so ring strokes ended right against the letters. A crown of rim also stuck out above the kicker. Now none of the dial is drawn above the name. It fades in under the name over about 1.3× the name's height, so the name has open space around it. The mask is a static gradient, not a blur filter, so the orbit's drift costs nothing extra per frame.
- **Fixed (P1, words on strokes):** the awake verb grows 6% toward the dial, so its first letter sat on the tick and the Hand's leader (0px gap at 720p). On the title the verbs now sit half a verb-size further out (18px @720, 23px @1080). The awake word clears the leader by about 12px.
- Checked at 1280×720, 1920×1080, 2560×1440 and 390×844 (phone has no dial; Tab order checked there too). `--walk` exercised 12 controls. Related tests pass, except two failures that also fail on the base commit: `focus-lifecycle` "pushScreen restores the prior exposure" and the credits NOTICE check. Shots are in `/workspace/spaceface-scratch/ui-shots/main-menu-20261012-1425/` (not committed).
- **Remaining:** at 1080p the reference line's SANDBOX sits over the hull's nose in the key art (this was already true before; it moved about 17px). Archive / Achievements / Quit (P0 above): the bench walk opens Codex and Achievements, and Quit asks to confirm. This still needs checking in a live browser build.

