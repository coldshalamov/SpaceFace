<!-- LIFETIME: ACTIVE_PACKET -->
# Task D — The modes, the reading screens, the sweep and the proof (queue: `PQ-182.00`–`.03`, `PQ-185.00`–`.01`, `PQ-192.00`–`.01`, the CSS/font sweep of `PQ-184`, `PQ-187.04`)

**Read first:** [`../DIRECTION_SHEET.md`](../DIRECTION_SHEET.md) (all of it; your screens are under
"The modes" and "The reading screens" in §2; §10 and §11 drive the sweep), then
[`../KIT_SPEC.md`](../KIT_SPEC.md) (all of it). Task A must be accepted before you start. Parts 1–3
(the Crucible, the Works, the reading screens) can run while Tasks B and C are in flight on other
agents — you share no files with them. Parts 4–5 (the sweep and the proof) start only when B and C
are on master.

**Outcome in one sentence:** the Crucible reads white-hot and instant, Asteroid Works keeps its
warm law and stops fighting the kit, the four reading screens read like a book, every dead
stylesheet, style block and font is gone, the floor is re-measured on the new look, and the
proof — the thirteen moments as clips, the blind pairs and the reel — is on file.

Files you own: `src/ui/screens/crucible.js`, `crucibleDraft.js`, `crucibleLabControls.js`,
`crucibleLabTelemetry.js`, `src/ui/asteroid/**` (motion and sound only), `styles/asteroid-ops.css`
(motion only), `src/ui/screens/missionLog.js`, `codex.js`, `help.js`, `techTree.js`, and for the
sweep: `styles/ui.css`, `styles/menu.css`, `styles/fonts.css`, `styles/fonts/*`, `_uilab.html`,
`src/ui/uiRoot.js` (the hover-cue emitter and dead CSS only), `src/ui/shipEngineeringStage.js`,
`test/ui-frame-references/**`, `scripts/` capture tooling. Tasks B and C own the shell, the HUD,
the station, the instruments and the chart.

---

## 0. Before the first edit

1. `git status --short`, `node scripts/check-now-liveness.mjs`, your `NOW.md` row, `npm run check:baseline`.
   Tasks B, C and D edit `styles/kit.css` and `src/ui/kit/temperature.js` in parallel: append your
   permitted rules under a `/* Task D additions */` comment at the end of `kit.css`, keep
   `temperature.js` edits to the lines this file names, and `git pull --rebase origin master` before
   every push.
2. Confirm the facts this task relies on (audited 2026-09-06):
   - **Crucible door** `crucible.js` (`crucibleScreen`, id `crucible`; results are
     `crucibleResultsScreen` in the same file, id `crucibleResults`, `data.locked`): the "Mode"
     cards are the ruleset — `CRUCIBLE_MODE_CARDS` (Swarm "Hold the line" / Gauntlet "Enter the
     Gauntlet", each with a blurb); hull cards from `COMBAT_LAB_STARTER_PACKAGES`
     (`src/data/combatLabSetups.js`); the arena is fixed (`CRUCIBLE_ARENA_ID`), no arena UI; the
     seed input + "New seed"; the primary button's label is the mode's verb; Back. Results: title
     from `resultTitle(result)`, `result.headline`, sections in `resultSectionOrder(result)`
     (build · last_seconds · ledger · kill_chain), rows from `resultRows(result)` (Outcome, Reached,
     Kills, Best chain (swarm), Score, Salvage, Level, Seed), the kill chain (`killChainRows`,
     `BEARING_WORDS`, `BREACH_PHRASES`), the last seconds as hit bars, the build steps; the
     buttons "Run it again — same seed" (primary), "New run", "Main menu". Style block
     `sf-crucible-door-style`.
   - **Draft / refit** `crucibleDraft.js` (`crucibleDraftScreen` id `crucibleDraft`,
     `crucibleRefitScreen` id `crucibleRefit`, both `data.locked`): offer cards with verb, name,
     blurb, slot and a hotkey numeral; "Keep current loadout", "Re-roll"; number keys pick,
     arrows move, R re-rolls, Esc keeps; refit rows carry a `<select class="sf-cru-pick">` of
     spares and "Launch next block". Style block `sf-crucible-draft-style`.
   - **Lab** `crucibleLabControls.js` / `crucibleLabTelemetry.js`: pure request builders plus a
     thin mount; classes `sf-lab-*`; style ids `sf-lab-controls-style`, `sf-lab-tel-style`.
   - Checks: `check:crucible:run`, `check:crucible:arc`, `check:crucible:route` (a real browser
     plays a run), `check:crucible:meta`, `check:crucible-lab`.
   - **Asteroid Works** `src/ui/asteroid/asteroidScreen.js` (id `drill`), `styles/asteroid-ops.css`
     (`.ast-screen` scope, `--aw-*` tokens), its law `design/ASTEROID_WORKS_DESIGN_LAW.md` (four
     laws, seven rulings, seven chrome objects, ten invariants: board ≥ 88 %, ≤ 15 words, 12 px
     floor, zero uppercase, its own warm palette with plates and 8/10 px radii). Checks:
     `check:asteroid-works-render`, `check:asteroid-theater`, `check:asteroid-drive-cadence`,
     `check:asteroid-sound`, `check:asteroid-drawers`, `check:asteroid-motion`, `check:drill-smooth`,
     `check:asteroid-instance-structure`.
   - **Missions log** `missionLog.js` (id `missionLog`): sections Story objective · Current action
     · Career ladder · Active missions · Completed (toggle); entity links; checks
     `check:gamepad-mission-log` (Start → Pause → Mission log route), `check:mission-log-contract-terms`
     (active cards must show payout, timer, route/risk, stake, failure terms).
   - **Codex** `codex.js` (id `codex`): tabs Story · Comms · Discoveries · Graffiti · Figures ·
     Ship · Archive · Ledger; a search input; entries as `.sf-codex-entry` blocks with `h3`, meta,
     body; discovery plates carry `data-entity` sector links; the Signal Archive is a poster grid
     whose thumbnails play cinematics; check `check:codex-narrative` (data contract only).
   - **Help** `help.js` (id `help`): tabs Controls · Loops · Ships · Commodities · Ores · Factions;
     key labels come from `src/ui/bindings.js` — never literal (`check-ui-screen-imports`
     rejects "J", "I", "L", "T", "B", "C" as key text and asserts the Loops tab teaches recovery,
     Ironman finality and save timing, and that the touch controls are documented).
   - **Tech tree** `techTree.js` (id `techTree`): canvas 2D lanes (`buildLayout`), head figures
     CR · RP · Unlocked, side pane with name/branch/cost/prereqs/unlocks/state and an Unlock
     button (`describeTechNodeReadiness`); checks `check:tech-tree-guidance`,
     `check:tech-display-names`.
   - `scripts/check-ui-screen-imports.mjs` also asserts every menu screen's `STYLE_ID` is present
     and unique — when you delete a screen's style block, **update that check** to stop requiring
     it for migrated screens (read ≈ 146–168 first); it is a check about the old mechanism, and
     the receipt records the change.
   - The sweep targets (from the audit): `uiRoot.js` ≈ 405–420 emits `ui_hover` on every
     `pointerover` in `#screens`; `styles/ui.css` ≈ 156–162 `body.ui-live-screen` is dead (the
     class is never set); `.panel` and `button` are each defined twice (≈ 164/232, ≈ 165/238);
     the `#screens` still and gradients (≈ 180–221); legacy tokens `--nebula-*`, `--glow-cyan`,
     `--visor-*`, `--text-shadow-hard` (≈ 67–88); `styles/menu.css` (the shell chrome);
     `src/ui/shipEngineeringStage.js` (dead — only `SHIP_ENGINEERING_GAUGE_DEFS` is imported, by
     `shipworks.js`); fonts `saira-scond-600/700`, `plex-sans-400/500/600`, `plex-mono-400/500`,
     `bricolage-grotesque-600` (static) and their `@font-face` rules; `_uilab.html` re-declares
     the old faces inline. Spline Sans Mono stays (the Works law).
   - The floor: `test/ui-frame-references/` (PNGs + `floors.json`), `budgets.json`;
     `check:visual-regression` and `check:ui:budgets`; the reshoot procedure is in
     `scripts/capture-ui-matrix.mjs`'s header and in the `PQ-180.03` receipt under
     `design/program/roadmap/receipts/` — read both before reshooting.

## 1. The Crucible (`PQ-182`)

The temperature is `crucible` (white signal, no scrim) on every Crucible screen and during a run.
`deriveTemperature` keys on the screen ids `crucible`, `crucibleDraft`, `crucibleRefit`,
`crucibleResults`, `crucibleLab` — add `crucibleRefit` to the set (a one-line kit edit; record
it) — and on the run flag: find the real one (the results owner is `registry.get('survivalResults')`;
the run request goes through `requestCrucibleRun` in `src/ui/crucibleLaunch.js`; read where the
run's active state lives, e.g. `state.survival`/`state.crucible`, and put that exact path in
`deriveTemperature`; record it).

### 1.1 The door — `k-screen--stage` (sheet, amended: *Mode, Hull and Seed as three words with their values, changeable in place — the arena is fixed; Enter as one word, the mode's verb; a stranger reads it in five seconds*)

| Region | Content |
|---|---|
| `.k-title` | `h1.k-display.k-t-title#sf-crucible-title` "Crucible"; `p.k-t-emph.k-62` = the live mode's blurb (`syncMode` writes it) |
| `.k-stage` | three settings as a `ul.k-rows` of `k-row--static` (`--k-row-cols: auto minmax(0,1fr)`): **Mode** — a `k-words--row` toggle of the two mode words (Swarm · Gauntlet, `data-ruleset`, `aria-pressed`, `.sf-crd-mode` hook) with the live one bright; **Hull** — a `k-words--row` of the starter names (`data-starter-id`, `aria-pressed`, `.sf-crd-hull` hook) and beneath the row one `p.k-sentence` = the live hull's blurb; **Seed** — `input.k-input.k-input--num` (`aria-label="Run seed"`) with a `k-word--fine` "New seed"; the arena named in fine print beneath ("Arena: <name>") since it cannot change |
| `.k-foot` | `button.k-word.k-word--emph.k-word--primary` = the mode's verb ("Hold the line" / "Enter the Gauntlet"), `Back` as `k-word--emph` |

### 1.2 Draft and refit — `k-screen--stage` (sheet, amended: *offers are three across on the sky, each a verb, a name and one line, with its key in fine print; the focused one bright*)

Draft: `.k-title` "Rearm" + the sub sentence; `.k-stage` a flex row of three offer blocks
(`button.sf-cru-card[data-offer-id]` hooks kept), each: `p.k-caps` = the verb (the one place
uppercase is permitted, as a column-header-like label), `h2.k-display.k-t-sub` = the name,
`p.k-sentence` = the blurb, `p.k-t-fine.k-38` = the slot, the hotkey numeral as `k-t-fine.k-38`
before the verb; focused block 100 %, others 62 %; `.k-foot` "Keep current loadout" (`k-word--emph`),
"Re-roll" (`k-word--emph`); the note `role=status` as `k-sentence`. Keyboard unchanged.
Refit: `.k-stage` `ul.k-rows` of hardpoint rows (`--k-row-cols: minmax(0,1fr) auto`): the
hardpoint's name at `.k-row__name`, the fitted module at `.k-row__sub`, and `select.k-select.sf-cru-pick`
on the right; `.k-foot` "Launch next block" (`k-word--emph.k-word--primary`).

### 1.3 Results — `k-screen--stage` (sheet: *the run as a story: the best chain as a hero number, the moments as a column of sentences, the cause of death and its telegraph as two lines, the build code as fine print, Retry as one word. A still, not a form.*)

| Region | Content |
|---|---|
| `.k-title` | `h1.k-display.k-t-title#sf-crucible-results-title` = `resultTitle(result)`; `p.k-sentence--emph` = `result.headline` |
| `.k-corner` | `.k-hero.k-hero--hero.k-hero--signal` = the best chain (swarm) or the score (gauntlet), word "best chain" / "score" |
| `.k-stage` | two columns (a `.k-panel` inside the stage — Task C's kit addition; if C has not landed, add the same three rules and record it): left — `ul.k-rows` of `k-row--static` from `resultRows(result)` (Outcome, Reached, Kills, Score, Salvage, Level, Seed; the number at `.k-row__num`); right — the sections in `resultSectionOrder(result)`, each `k-caps` header (Kill chain · Last seconds · Ledger · Build): the kill chain as `k-row--static` rows ("Killed by" and "Its weapon" rows' values in `k-bad`), then "What was left of you" as `k-row--static` rows; the last seconds as rows with a `.k-bar` (`__hit-track/__hit-fill` hooks) and the figure at `.k-row__num`; the ledger rows; the build as `k-row--static` rows (Wave N · verb) with the causal tags as `k-word--fine` static words and the build lead as `k-sentence`; the "build code" the sheet names is this build list — print it also as one fine-print line joined by `·` |
| `.k-foot` | "Run it again — same seed" (`k-word--emph.k-word--primary`, focused), "New run" (`k-word--emph`), "Main menu" (`k-word--emph.k-word--danger`) |

Under reduced motion nothing settles; otherwise the title stamps and the rows settle from left.

### 1.4 The lab controls and telemetry

`sf-lab-runtime` → a `ul.k-rows` of `k-row--static` rows (speed as a `k-words--row` toggle of the
legal time scales with `aria-pressed`; invulnerability as a two-word toggle; clear/refill as
`k-word--body`, the destructive one `k-word--danger`); the telemetry overlay → `k-rows` of
`k-row--static` at data size, 62 %, top-right, no plate; delete both style blocks and the
`sf-track-micro` tracking. They are instruments, not debug dumps.

## 2. Asteroid Works (`PQ-185`) — reconciliation only

The Works keeps its law: its faces, its `--aw-*` palette, its plates and radii, its board share
and word budget. This task does three things and no more:

1. **Motion:** every transition in `asteroid-ops.css` and `asteroidScreen.js` obeys spec §7 —
   `--k-ease`, ≤ 160 ms for settles, ≤ 400 ms for the drawer, nothing infinite, reduced motion
   is a cut (the game's `sf-reduce-motion` class); `check:asteroid-motion` must stay green.
2. **Temperature:** the kit derives `works` for the `drill` screen and sets nothing; verify the
   `#hud::before` scrim is not visible under the Works (the Works root is opaque by its law) and
   that leaving the Works restores the previous temperature.
3. **Never-list overlap:** confirm there is no glow, gradient fill, glass, blur, uppercase or
   tracked label on the Works (the law forbids the same); fix any that crept in; the law's soft
   shadow and radii are permitted there and nowhere else.

`PQ-185.00`'s assertions and `PQ-185.01`'s acceptance re-run stay their own work; record what you
verified.

## 3. The reading screens (`PQ-192`)

All four migrate as in Task B §1 mechanics (kit classes on the root, `dom.js` markup, style block
deleted, hooks kept, `open`/`close` cues, settles, `data-k-ready`). Temperature `menu`.

### 3.1 Missions log — `k-screen` (sheet: *one column of missions as sentences with hairlines; the focused mission opens on the right with its name at screen-title size, its next step as one sentence, its reward as a number. The sky behind at 25 %.*)

| Region | Content |
|---|---|
| `.k-title` | "Missions"; `p.k-t-emph.k-62` = the story objective when one exists (the "Story objective" section collapses into this line) |
| `.k-hang` | `k-caps` "Current action" then one `k-row` (the recommendation, `#sf-mlog-current-action-heading` hook); `k-caps` "Active" then `ul.k-rows` — one per active mission: the mission in one sentence (`.k-row__name`), the payout at `.k-row__num`, the timer at `.k-row__sub`; `k-caps` "Career" rows when present; `k-caps` "Completed" with a `k-word--fine` "Show"/"Hide" toggle (`aria-expanded`, `.sf-mlog-toggle` hook) and the completed rows at 38 % |
| `.k-stage` | the focused mission: `h2.k-display.k-t-title` = its name; `p.k-sentence--emph` = the next step; `.k-hero.k-hero--hero.k-hero--signal` = the payout (word "on delivery"); `ul.k-rows` of `k-row--static`: Timer, Route and risk, Stake, On failure (the four terms `check:mission-log-contract-terms` requires, using the same consequence math as today), the client and destination as entity links; the actions as `k-word--emph`: "Track"/"Tracked" (`aria-pressed`), "Open on the chart" (`missionMapAction`), "Abandon" (`k-word--danger`, confirm kept) |

The gamepad route Start → Pause → Missions is unchanged (the pause word exists in Task B's list).

### 3.2 Codex — `k-screen` (sheet: *a left column of entry names; the entry as a readable measure of text with a plate image where one exists; the entry title at screen-title size. A book, not a wiki.*)

| Region | Content |
|---|---|
| `.k-title` | "Codex"; `p.k-t-emph.k-62` = the live tab's one-line description |
| `.k-hang` | `input.k-input.sf-codex-search[type=search]` at the top; `ul.k-words` of the eight tab words (`.sf-tab` hook, `aria-current`); beneath the words, `k-caps` per section of the live tab and `ul.k-rows` of entry names (`.k-row__name`, `.k-row__sub` = meta) — the entries themselves move to the stage |
| `.k-stage` | the focused entry: `h2.k-display.k-t-title` = its title; `p.k-t-fine.k-38` = its meta; the body as `p.k-sentence` paragraphs at body size in a `.k-measure`; the note as `k-sentence--emph`; a discovery plate's image (when one exists) at the top of the stage, 320 px tall, no frame; the sector link as an entity link; the Signal Archive tab: the posters as a row of images 200 px tall with their titles beneath and a `k-word--fine` "Play" (the ▶ overlay deleted); the Ledger tab: the ledger panel restyled by Task C (if C has not landed, leave the panel as is and note it); the Ship tab: rows |
| search | hides non-matching entry rows and empty section headers as today; empty → `p.k-empty` "No matching unlocked entries." |

The filed/chosen endgame mark becomes the entry name in `k-signal` (no left rail).

### 3.3 Help — `k-screen` (sheet: *the controls as hairline rows of action and key; the current profile named; nothing else.*)

`.k-title` "Help" + `p.k-t-emph.k-62` = the current control profile's name (`.sf-help-now` hook);
`.k-hang` `ul.k-words` of the six tab words; `.k-stage`: Controls — `ul.k-rows` of `k-row--static`
(action at body 62 %, the key label from `bindings.js` at emphasis 100 %; touch and gamepad routes
as their own `k-caps` groups); Loops — `k-caps` per loop and `p.k-sentence` paragraphs (the recovery,
Ironman and save-timing sentences the check asserts stay verbatim); Ships / Commodities / Ores —
`k-table`s (the `createListControls` search rendered as `k-input`, its sort header as `k-caps` with
`aria-sort`); Factions — rows. The rebind footnote as `k-t-fine.k-38` naming Settings → Controls.

### 3.4 Tech tree — `k-screen` (sheet: *the lanes drawn as hairline paths on the sky; nodes as words; the selected node's name at screen-title size with its cost as a number and Unlock as a word.*)

| Region | Content |
|---|---|
| `.k-title` | "Research"; `p.k-t-emph.k-62` = the selected node's branch (or "Select a node") |
| `.k-corner` | three `.k-hero` in a column at `k-t-num`: credits (`[data-cr]`), research points (`[data-rp]`), unlocked `n/N` (`[data-count]`) |
| `.k-stage` | the canvas (`.tt-scroll` becomes the stage; the canvas fills it; the zoom badge as `k-t-fine.k-38`); the draw code paints lanes as 1 px `rgba(234,230,223,.14)` paths, lane labels at data size 38 %, nodes as words in Instrument Sans (available 62 %, researched 100 %, locked 38 %, selected in `#f2b950`), edges hairline — set the canvas colours from the same six kit hexes as the chart (record the mapping) and remove the canvas ground fill; the side pane (`.tt-side`, `[data-sel]`) becomes the stage-right column: `h2.k-display.k-t-title` = the node's name, `.k-hero.k-hero--signal` = the cost (word "credits"), `p.k-sentence` = its effects, `k-caps` "Requires" + `k-row--static` rows, `k-caps` "Unlocks" + rows, the state as `k-sentence`, and `button.k-word.k-word--emph.k-word--primary.tt-unlock[data-act=unlock]` "Unlock" (`data-why` kept) |
| `.k-foot` | the legend as three `k-word--fine` static words (available · researched · locked) in their strengths — no swatches |

`check:tech-tree-guidance` reads `describeTechNodeReadiness`/`unlockDisplayName` and source
strings — keep them.

## 4. The sweep (after B and C are on master)

Each deletion is one commit with a grep in its message proving no live reference remains
(`grep -rn "<name>" src styles scripts test index.html _uilab.html _kitlab.html`).

1. `uiRoot.js` ≈ 405–420: delete the `pointerover` → `ui_hover` emitter (the sheet forbids sound
   on mouse hover). Keep the `ui_hover` recipe (the Works may use it; check).
2. `styles/menu.css`: delete the file and its `<link>` when no live screen carries `sf-menu`,
   `sf-btn`, `sf-tab`, `sf-row`, `sf-slot`, `sf-foot`, `sf-crest`, `sf-col`, `panel` (the
   confirm dialog `#sf-confirm-root .sf-confirm` may still — migrate the confirm dialog to kit
   words and rows first: `src/ui/confirm.js`, a `k-rows` body and two words, `k-word--danger` for
   the destructive one).
3. `styles/ui.css`: delete the `#screens` still and its gradients (≈ 180–221) and
   `body.ui-live-screen` (≈ 156–162); collapse the duplicate `.panel`/`button` definitions to the
   one still used (or delete both if nothing uses them); delete the legacy tokens (≈ 67–88) and
   every `--sf-*-face`, `--t-*`, `--r-*`, `--sh-*`, `--glass*`, `--console-*` token with zero
   references; delete the `fp-*` rules Task C left; keep `#hud`/`#toasts`/`#alerts` layering, the
   `[hidden]` rule and the accessibility hooks.
4. `styles/fonts.css` + `styles/fonts/`: delete Saira, the Plex trio and the static Bricolage 600
   (files and `@font-face`) once nothing references them; update `_uilab.html`'s inline
   declarations to the kit faces (it is a harness; it must not 404).
5. `src/ui/shipEngineeringStage.js`: move `SHIP_ENGINEERING_GAUGE_DEFS` into
   `src/ui/ship/shipBandModels.js`, update the import in `shipworks.js`, delete the file.
6. `scripts/check-ui-screen-imports.mjs`: the `STYLE_ID` uniqueness block no longer applies to
   migrated screens — make it assert the **absence** of a style block in migrated screens instead
   (a list of ids), so the old mechanism cannot come back.
7. `styles/station-workbench.css` / `station-berth.css` if Task C left them; the `--hud-*` aliases
   in `injectHudCss` can stay (they are kit aliases now).
8. Re-baseline the budgets (spec §11.7 command) and reshoot the regression references with the
   documented procedure (neutral ground, all modes, all widths); commit the new PNGs and
   `floors.json`; `npm run check:visual-regression` and `npm run check:ui:budgets` green;
   `npm run check:all:smoke` once at the end.

## 5. The proof (`PQ-187.04`)

1. **The thirteen moments** as ten-second clips at 1920×1080 in
   `.devshots/frontend/D/moments/NN-<name>.webm`: 01 title (from Task A), 02 new game, 03 first
   undock (B), 04 docking (C), 05 undocking, 06 going wanted (B), 07 death and game over, 08
   Crucible results, 09 first upgrade (a module installed on shipworks: the socket fills), 10 load,
   11 pause, 12 photo mode, 13 a thirty-second montage of screens opening and closing. Reuse A–C's
   clips where they exist; record the rest with Playwright `recordVideo` on scripted routes (the
   check scripts in `scripts/` show how to reach each state).
2. **The blind pairs:** `design/frontend/direction/proof/PAIRS.md` listing twenty pairs — a
   SpaceFace capture beside an official screenshot of the same screen type from the reference
   board's linked sources (title ↔ a title; a market ↔ an inventory/loot screen; THE SHIP ↔ a
   character/loadout screen; the chart ↔ a map; results ↔ a run summary; the HUD ↔ a HUD; the
   pause ↔ a pause; at least two pairs against each genre baseline, Everspace 2 and Starsector) —
   with the reference images downloaded to `.devshots/frontend/D/refs/` (not committed; fair-use
   review copies). The reviewer runs the blind pick; you prepare, you do not judge.
3. **The reel:** a ninety-second silent cut of the route title → new game → undock → dock →
   market → ship → chart → wanted → pause → photo → game over → Crucible results, recorded in one
   Playwright session (`.devshots/frontend/D/reel-1920.webm`), plus a sidecar
   `reel-cues.txt` listing each UI cue and its timestamp (Playwright video carries no audio; the
   cut to sound is honestly unproven until a headed recording with audio exists — say so).
4. The receipt `design/program/roadmap/receipts/FRONTEND-D-REPORT.md` per spec §13 with the
   sweep's deletion list (file, lines, the grep), the reshoot summary (surfaces, widths, modes,
   floors), the moments list, the pairs list and the reel path; update the queue units
   `PQ-182.00`–`.03`, `PQ-185.00`–`.01`, `PQ-192.00`–`.01`, `PQ-184`'s CSS/font leaves and
   `PQ-187.04` to `implemented` with an `IMPLEMENTED <date>:` prefix; commit; push; remove your
   `NOW.md` row; report in plain words.

## 6. How agents get this wrong on this task

- Restyling the Works. It keeps its law; you touch motion, temperature and the never-list overlap.
- A Crucible door with cards. Three words with values and one verb.
- Deleting a stylesheet while a screen still references a class in it; deleting without the grep.
- Reshooting the regression baseline before B and C landed, then reshooting again.
- Judging the blind pairs yourself, or picking flattering references.
- Calling the reel "cut to sound" when the recording is silent.
- Asking the owner anything.

## 7. Definition of done

- The Crucible's five screens, the four reading screens, and the Works' reconciliation match
  their sheet lines and the tables above at three widths; old blocks deleted; every check in §0
  green.
- The sweep: no `menu.css`, no legacy fonts, no `#screens` still, no dead engineering stage, no
  hover cue; budgets and regression references re-baselined on the new look; `check:all:smoke`
  green.
- The proof: thirteen clips, twenty pairs, the reel and its cue sidecar on file; the receipt
  written; the queue updated; pushed.
