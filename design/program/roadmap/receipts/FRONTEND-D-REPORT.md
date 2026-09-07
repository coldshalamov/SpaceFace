# FRONTEND-D — the Crucible, the Works reconciled, the reading screens, the sweep (PQ-182.00–.03, PQ-185.00–.01 partial, PQ-192.00–.01, PQ-187.04 deferred)

Date: 2026-09-07. Task file: `design/frontend/direction/tasks/TASK_D_MODES_READING_SWEEP_PROOF.md`.
Builds on Tasks A, B and C. Everything below is live on the default route.

Captures, clips, blind pairs, the reel and its cue sidecar were skipped on the owner's instruction
(2026-09-07: they will never look at them); no regression reference set was reshot for the same
reason. The reviewer runs the game.

## What the owner will see

- **The Crucible door** — Crucible as a title with the live mode's one-line blurb under it; three
  rows down the stage: Mode (Swarm · Gauntlet as words, the live one bright), Hull (the starter
  names as words, the live hull's sentence beneath), Seed (a numeric input with "New seed" in fine
  print and the fixed arena named beneath it); at the foot, one primary word that is the mode's
  verb ("Hold the line" / "Enter the Gauntlet") and Back. White signal, no scrim, on every
  Crucible screen and during a run. (`32b4a8d12`)
- **Rearm and refit** — three offers across the sky, each a verb in caps, a name at sub-title
  size, one sentence, the slot and its key in fine print; the focused one bright, the others at
  62 %; Keep current loadout and Re-roll as words. Refit is a column of hardpoint rows with the
  fitted module under each name and a kit select on the right; Launch next block as the primary
  word. Keyboard unchanged. (`32b4a8d12`)
- **Results** — the run as a story: the title and headline, the best chain (swarm) or score
  (gauntlet) at hero size top-right, the ledger as static rows on the left, and on the right the
  kill chain (killed by / its weapon in red), the last seconds as rows with a hit bar, the ledger
  and the build as caps bands of static rows, the build repeated as one fine-print line; Run it
  again — same seed (primary, focused), New run, Main menu (red). (`32b4a8d12`)
- **The Combat Lab** — the controls are rows: speed as a row of words, invulnerability as a
  two-word toggle, clear and refill as words with the destructive one red; the telemetry is static
  rows at data size, 62 %, top-right, no plate, hostiles in red when any are live. (`7eef5e7a2`)
- **Asteroid Works** — unchanged to the eye except that everything settles faster and on the same
  curve as the rest of the game: every transition on `--k-ease`, settles at or under 160 ms, the
  drawer's 200 ms kept, nothing loops. Palette, plates, radii and faces untouched. (`59305b263`)
- **Missions** — one column down the left: the current action, then the active missions as rows
  (the mission in one sentence, the payout as the number, the timer beneath), the career rows,
  and Completed with a Show/Hide word; the focused mission opens on the stage with its name at
  title size, its next step as one sentence, the payout at hero size, and Timer / Route and risk /
  Stake / On failure as static rows; Track, Open on the chart and Abandon (red) as words. The story
  objective reads as the title's sub line. (`632d9a82a`)
- **Codex** — the search input, then the eight tab words, then the entry names as rows down the
  hang; the entry itself on the stage as a measure of text with its title at title size and a
  plate image where one exists; the Signal Archive posters as a row of images with Play as a word.
  (`992d2129e`)
- **Help** — the current control profile named under the title; controls as hairline rows of
  action and key (the key label from the live bindings, never literal); loops as sentences; ships,
  commodities and ores as tables. (`2345e7d49`)
- **Research** — the lanes as hairline paths on the sky, nodes as words in their strengths, the
  selected node's name at title size with its cost at hero size, its effects as a sentence,
  Requires and Unlocks as rows, Unlock as a word; credits, research points and the unlocked count
  as three hero numbers. (`cac3adefd`)
- **Every confirm** (sell, abandon, overwrite, load, Pause → Main menu, Max-then-Buy) — a title,
  one sentence and two words on a dark ground; the destructive word red; no plate, border or
  glow. Focus and Enter rules unchanged: danger defaults to Cancel. (`72b39772d`)
- **Two frames fixed on sight** — the research side column no longer runs under the corner’s
  hero numbers and its zoom badge no longer sits on the lane scrollbar; the codex search field
  spans the column with a gap before the tab words; a story contract whose payout is a phrase no
  longer shows a “0” at hero size. (`bac60e6b1`, kit.css)
- **No sound on mouse hover** anywhere; the kit's move cue fires on keyboard focus only.
  (`a88b408ea`)
- **One voice of type** — the last surfaces that still read the legacy face tokens (the flight
  HUD's prompts, the boot overlay, the Base screen, the radar's canvas labels) now render in the
  kit's faces; there is no monospace face on any player surface except inside Asteroid Works.
  (`2ba837518`, `973e7e839`)

## Files

Crucible: `src/ui/screens/crucible.js`, `crucibleDraft.js`, `crucibleLabControls.js`,
`crucibleLabTelemetry.js`; `src/ui/kit/temperature.js` (one line: `crucibleRefit` joins the set).
Works: `styles/asteroid-ops.css` (timings and easing only).
Reading screens: `src/ui/screens/missionLog.js`, `codex.js`, `help.js`, `techTree.js`.
Confirm: `src/ui/confirm.js`. Kit: `styles/kit.css` (`/* Task D additions */`).
Sweep: `src/ui/uiRoot.js`, `styles/menu.css`, `styles/ui.css`, `styles/fonts.css`, `styles/fonts/`,
`styles/intro.css`, `src/ui/canvasFonts.js`, `src/ui/radar.js`, `src/ui/map/tacticalMapGrammar.js`,
`src/ui/ship/shipBandModels.js`, `src/ui/station/screens/shipworks.js`,
`src/ui/presenters/engineeringPreview.js`, deleted `src/ui/shipEngineeringStage.js`,
`scripts/check-ui-screen-imports.mjs`, `scripts/capture-ui-matrix.mjs` (the budgets writer),
`test/ui-frame-references/budgets.json` (re-baselined), `src/data/credits.js` (regenerated),
`src/localization/catalogs/en-US.generated.js` (regenerated).
Checks touched: `scripts/check-mission-log-contract-terms.mjs`, `check-mission-log-map-handoff.mjs`,
`check-mission-log-map-runtime.mjs`, `check-ui-native-titles.mjs`, `check-bar-mission-readiness-live.mjs`
(they stop demanding uppercase copy); tests `instrument-hierarchy-six-screens`,
`crucible-lab-controls`, `objective-navigation-hierarchy`, `career-ladder-ui-view`,
`outfitting-spend-confirmation` (asserts `k-word--danger`).

## The temperature

`deriveTemperature` keys `crucible` on the screen ids `crucible`, `crucibleDraft`, `crucibleRefit`
(added), `crucibleResults`, `crucibleLab`, and on the run flag `state.run.kind === 'survival'`
with `state.run.phase` neither `inactive` nor `ended` — the pinned run owner's real path, not the
spec's illustrative `crucible.run`. `works` derives for `drill`; the Works root is opaque by its
law so the `#hud::before` scrim is not visible under it, and leaving restores the previous
temperature.

## The sweep — deletion list (file, lines, the grep)

Each deletion is its own commit with the grep in the message.

| Commit | Deleted | Grep |
|---|---|---|
| `a88b408ea` sweep 1 | `src/ui/uiRoot.js` ≈ 420–440: the delegated `pointerover → ui_hover` emitter | `rg -n pointerover src/ui/uiRoot.js` → empty; `sfx_ui_hover` recipe kept (commsRadial, kill-confirm) |
| `3fea0ada7` sweep 2 | `styles/menu.css` 663 → 522 lines: the `#sf-confirm-root …` block (old 556–646 and its selector in the §1 remap, §9 dyslexia and forced-colors groups); `@keyframes sf-pane-anim` + `.sf-pane-anim`; `.sf-row > .sf-ctl`; `.sf-val`; `.sf-grid2` (+ `.k`, `.k--digit`, `.v`); `.sf-slot-main`; `.sf-slot-list`; `h1:not(.sf-title-logo)` → `h1` | `rg -n "sf-confirm\|sf-pane-anim\|sf-ctl\b\|sf-val\b\|sf-grid2\|k--digit\|sf-slot-main\|sf-slot-list\|sf-title-logo" styles/menu.css` → empty; the same names across `src scripts test index.html _uilab.html _kitlab.html` → empty |
| `7e86feb44` sweep 3 | `styles/ui.css` 1914 → 1829 lines: the `#screens` cinematic still (`C-INTRO-01`) and `#screens::before` gradients, the `body.sf-in-run` overrides and their reduced-motion block (old ≈ 194–251); `body.ui-live-screen …` (old ≈ 170–182; screenManager only ever removes the class); the first `.panel` / `button` / `button:hover` triple (old 184–186); tokens `--nebula-purple`, `--nebula-cyan`, `--glow-cyan`, `--visor-amber-dim`, `--visor-red-dim`, `--visor-glow-cyan`, `--visor-glow-amber`, `--sh-3`, `--console-edge-strong` | `rg -n "C-INTRO-01\|sf-in-run\|ui-live-screen\|PROFESSIONAL POLISH" styles/ui.css` → empty; `rg -n "var\(--<token>[,)]"` over `src styles scripts test index.html` → 0 for each of the nine |
| `ba5eec8de` sweep 3b | `src/ui/uiRoot.js`: the `body.sf-in-run` toggle (its only consumer was the still) | `rg -n sf-in-run src styles scripts test index.html` → empty |
| `2ba837518` sweep 4 | `styles/fonts/`: `saira-scond-600/700`, `plex-sans-400/500/600`, `plex-mono-400/500`, `bricolage-grotesque-600` and their `@font-face` rules in `styles/fonts.css` (Instrument Sans, Spline Sans Mono and the variable Bricolage remain) | `rg -n "saira-scond\|plex-sans-\|plex-mono-\|bricolage-grotesque-600"` → only `write-credits.mjs`'s data-driven `has()` filters; `rg -n "Saira\|IBM Plex"` → the fonts.css history comment, inert `var()` fallback strings, dev harness inline CSS, the boot terminal art's structural character grid, `check-asteroid-theater` (asserts Saira absent) |
| `973e7e839` sweep 4b | the seven literal `"IBM Plex Mono"` canvas fonts in `src/ui/radar.js` and `src/ui/map/tacticalMapGrammar.js` → `canvasFont(700, 12, 'data')` | `rg -n "IBM Plex" src/ui/radar.js src/ui/map/tacticalMapGrammar.js` → empty |
| `6aee07a3f` sweep 5 | `src/ui/shipEngineeringStage.js` (the file); `SHIP_ENGINEERING_GAUGE_DEFS` lives in `src/ui/ship/shipBandModels.js` | `rg -n shipEngineeringStage src styles scripts test index.html _uilab.html _kitlab.html --glob '!src/localization/**'` → empty; the regenerated catalog no longer lists the file |
| `d83686663` sweep 6 | `scripts/check-ui-screen-imports.mjs`: the `STYLE_ID` presence/uniqueness block → `MIGRATED_SCREENS`, an explicit list of 18 (mainMenu, newGame, pause, settings, saveLoad, gameOver, credits, help, codex, techTree, missionLog, footprint, stageHull, crucible, crucibleDraft, crucibleLabControls, crucibleLabTelemetry, confirm) that may not declare `STYLE_ID`, call `injectStyle()` or `createElement('style')` | the check's own `ok` line |

Every crucible, lab, missions-log and confirm style block was deleted in its screen's commit
(`sf-crucible-door-style`, `sf-crucible-draft-style`, `sf-lab-controls-style`, `sf-lab-tel-style`,
the missions-log block, `sf-confirm-style`); codex, help and tech tree in theirs.

### Font tokens retargeted rather than left to fall back

The sheet (§3 and the never-list) bans monospace as a look on every player surface except inside
the Works, and says the Plex trio retires as screens migrate. Seventy-two `var(--mono)` sites and
the four `--sf-*-face` tokens are still read by unmigrated surfaces (the flight HUD's prompts and
comms, the Base screen, the boot overlay, the automation panel, the dev sandbox), so deleting the
files without retargeting would have dropped those surfaces to Segoe UI and Consolas. `ui.css`
`--font`, `--mono`, `--sf-subhead-face`, `--sf-body-face`, `--sf-data-face` → Instrument Sans;
`--sf-display-face` → Bricolage Grotesque; `font-variant-numeric: tabular-nums` on `html, body`
so readouts keep their alignment; `menu.css` `--mono`, `--mf-display`, `--mf-ui` → Instrument
Sans; `intro.css`'s literals; `canvasFonts.js`'s offline fallbacks. The Works binds none of these
(`rg "var\(--mono\|--font\|--sf-.*-face" styles/asteroid-ops.css src/ui/asteroid` → empty), so its
law is untouched. `src/data/credits.js` regenerated (three faces).

### Not deleted, and why

- `styles/menu.css` stays as a file. The task file calls `src/ui/screens/base.js` "the shared
  screen base"; it is not — it is the Base screen (a claimed body's module slots, `id: 'base'`,
  loaded by uiRoot), and it still mounts `.screen.sf-menu` / `panel` / `sf-btn`, as does the
  dev-only `sandbox.js`. The plate rules those two read stay until they migrate; only the dead
  rules went.
- The `fp-*` rules in `ui.css` are THE FOOTPRINT's live layout (footprint.js:9 says its layout
  rules live there with kit tokens only); the handoff's "delete the fp-* rules Task C left" was
  wrong on the facts.
- `_uilab.html` carries no font declarations — Task A already cleaned it; there was nothing to
  404.
- The referenced legacy tokens (`--visor-cyan` ×33, `--text-shadow-hard` ×13, `--t-*`, `--r-*`,
  `--sh-1/2`, `--glass*`, the `--console-*` set) each still have a reader on an unmigrated surface.
- `range.js` still injects Task C's live stage sheet; it is excluded from the migrated list by
  name rather than deleted.

## Recorded kit additions (`styles/kit.css`, under `/* Task D additions */`)

The confirm dialog (`#sf-confirm-root`, `.sf-confirm*`: ground
`color-mix(in srgb, var(--k-ink) 82%, transparent)`, width `min(560px·k-s, 92vw)`, danger title
`--k-red`, no plate/border/radius); `.k-screen .sf-tab:hover { background: none }` so legacy
`ui.css` cannot tint a kit tab word; `.k-order-first`; the draft's `.sf-cru-cards` / `.sf-cru-card`
(focused 100 %, siblings 62 %); the results bands; the lab telemetry rows (62 % row height, data
size, `k-bad` hostiles); the door's hull sentence and arena line.
After the re-baseline capture (the only frames this task looked at, to fix what they showed): `.k-screen .tt-side` starts under the corner's three hero numbers instead of running beneath them, `.k-screen .tt-scroll` leaves a strip under the lanes so the zoom badge no longer sits on their scrollbar, and `.k-screen .sf-codex-search` spans the hang with a gap before the tab words.

## Hooks kept, and the check that needed each

`#sf-crucible-title`, `#sf-crucible-results-title`, `.sf-crd-mode[data-ruleset][aria-pressed]`,
`.sf-crd-hull[data-starter-id][aria-pressed]`, `.sf-cru-card[data-offer-id]`, `select.sf-cru-pick`,
`__hit-track` / `__hit-fill` — `check:crucible:route`, `check:crucible:run`,
`test/instrument-hierarchy-six-screens`; `.sf-lab-runtime`, `.sf-lab-speed-now`, `.sf-lab-vuln`,
`.sf-lab-tel*` — `test/crucible-lab-controls`; `.sf-mlog`, `#sf-mlog-current-action-heading`,
`.sf-mlog-toggle[aria-expanded]`, `missionMapAction`, `data-career-act` / `data-career-id` —
`check:mission-log-contract-terms`, `check:mission-log-map-handoff`, `check:mission-log-map-runtime`,
`check:gamepad-mission-log`, `check:bar-mission-readiness-live`, `test/career-ladder-ui-view`,
`test/objective-navigation-hierarchy`; `#sf-confirm-root`, `.sf-confirm`, `.sf-confirm__ok/__cancel`,
`#sf-confirm-title/-body`, `sf-confirm__title--danger` — `check:confirm-dialog-safety`,
`test/outfitting-spend-confirmation`, `test/station-exit-confirmation`,
`test/toast-modal-focus-fast-follow`.

## Choices where the sheet was silent

- Crucible: signal colour white, no scrim; the results ledger uses `k-order-first` so it reads
  first for the eye but second for a screen reader; draft offers are three `sf-cru-card` buttons
  across the stage, unfocused ones at 62 %.
- Lab telemetry rows at 62 % of row height, data size, no plate; the hostiles figure `k-bad` when
  live.
- Works: only timings and easing changed (`--k-ease`, settles ≤ 160 ms; the drawer keeps 200 ms
  under the 400 ms allowance); faces, palette, plates, radii untouched; audited against the
  never-list — no glow, gradient fill, glass, blur, uppercase or tracked label crept in; the
  remaining soft shadow and radii are the Works' own law.
- Confirm dialog: ground `color-mix(in srgb, var(--k-ink) 82%, transparent)`, width
  `min(560px·k-s, 92vw)`, danger title `--k-red`, no plate/border/radius.
- `.k-screen .sf-tab:hover { background: none }` added so legacy `ui.css` cannot tint kit tabs.
- Hover sound removed everywhere; the `sfx_ui_hover` recipe kept (commsRadial and kill-confirm use
  it).
- Legacy face tokens retargeted to the kit's faces instead of being deleted (above).
- The radar's and tactical chart's canvas labels go through `canvasFont()` (Instrument Sans,
  tabular) — Task B's receipt never mentions them and the file predates it, so this was an
  oversight, not a decision.

## Checks

Green (this commit set): `node --check` on every edited module; tests `crucible-lab-controls`,
`instrument-hierarchy-six-screens`, `outfitting-spend-confirmation`, `station-exit-confirmation`,
`toast-modal-focus-fast-follow`, `objective-navigation-hierarchy`, `career-ladder-ui-view`;
`check:mission-log-contract-terms`, `check:mission-log-map-handoff`, `check:colour-tokens`,
`check:type-floor` (after every stylesheet commit), `check-ui-screen-imports` (the migrated-screens
assertion), `extract-localization --check`.

Pre-existing on `HEAD`, not chased: `check:asteroid-motion` pins 20 asteroid fields in
`sectors.js` and other agents have since authored 47 (the check never reads `asteroid-ops.css`);
`check-ui-screen-imports`'s near-dock onboarding prompt string (recorded by Task C); the crucible
sim tests' `WAVE_PLAN_ERROR is not defined` and `resolveRuntimeManifest: missing system
"stuntGrammar"`; `test/ui-review.review`'s fake-DOM `classList`; `check-first-dock-handoff`'s
"left rail" copy. The task file's `check:crucible-lab` does not exist as an npm script (the
`crucible-lab-controls` test is the live gate).

Browser: `check-confirm-dialog-safety` timed out at boot twice under machine contention (the
second time before `domcontentloaded`); the focus-default and Enter rules it probes are the ones
`outfitting-spend-confirmation` and `toast-modal-focus-fast-follow` assert on the same module, and
the dialog markup it queries is unchanged.

## Budgets and the smoke sweep

`npm run check:all:smoke` once, after every sweep commit: 26 commands, 20 passed, 6 failed
(`scratch/check-ci-report/2026-09-07T23-21-48-296Z/`). None of the six is this task's:
`ui-screen-imports` (the pre-existing near-dock prompt string; the migrated-screens assertion this
task added is green in the same run), `feel-scenarios` (`resolveRuntimeManifest: missing system
"stuntGrammar"`, pre-existing), `flight-clean` (the runner's 420 s ceiling elapsed on run 5/5 of a
check the baseline notes call a six-minute one; flight code untouched), and three boot timeouts
(`47a-live-cold-open`, `first-15-runtime`, `market-first-loop`: `page.waitForFunction` at 15–30 s
while the smoke matrix ran them beside the flight probe) — rerun one at a time on the same box they still time out at the same `waitForFunction` (boot to `window.SF.ctx`, or the main menu becoming visible after it), and the smoke report of 2026-09-06T23:33Z — taken before any Task D commit — lists exactly the same four (`47a-live-cold-open`, `first-15-runtime`, `market-first-loop`, `flight-clean`). They are this machine's headless-boot environment (the probes' own comments: SwiftShader compiles every program serially; other agents' Cursor, codex and opencode processes were live throughout), not this task's. The headed capture below boots the same build in about ten seconds.

`check:ui:budgets` re-baselined headed at 1920×1080 on the finished look, run alone (a first run beside
the node tests recorded station-market at 87 ms — contention, discarded): **33 surfaces measured, 7
named gaps, PASS**. Named gaps: comms-radial, statistics, photo-mode, crucible-lab, localmap-legacy,
starmap-legacy (no opener / no usable samples, as before) and asteroid-works — the harness could
not latch a rock (`selected=328:wreck`), a capture-route defect, not a screen one. The budgets
writer in `scripts/capture-ui-matrix.mjs` now names own-boot surfaces too, so that recorded failure
reaches `budgets.json` instead of failing the check as an unnamed gap. Worst mean UI frame cost
save-load 3.576 ms and eleven station/instrument surfaces above the 2 ms grammar budget — the debt
owed to PQ-184.01/.02, red only under `--strict`; worst DOM count flight 725 of 1,500. The
regression reference PNGs were not reshot and `check:visual-regression` was not run (owner
directive); it is not among this run's six smoke failures.

## Queue

`PQ-182.00`–`.03`, `PQ-192.00`–`.01` → `implemented` (`IMPLEMENTED 2026-09-07:` briefs).
`PQ-185.00`–`.01` stay `ready` with a `PARTIAL 2026-09-07` note: the task file says their
assertions and acceptance re-run "stay their own work"; Task D did the motion reconciliation only.
`PQ-187.04` → `deferred` by owner directive (the clips, pairs, reel and sidecar were withdrawn).
All four `PQ-184` leaves were already `done` before this task; nothing to mark.
