```yaml
session: S3
title: The prototype app — every remaining screen, then the whole frontend navigable outside the engine
tool: ChatGPT 6 Pro — image generation + SVG + JS in the VM
dependsOn: [S1, S2]
phases: [P05]
current: [crucible-results, crucible-draft, crucible-refit, game-over, mission-log, codex, help, tech-tree, pause, asteroid-works]
inputs: [.devshots/ui-packets/returns/S1-return/, .devshots/ui-packets/returns/S2-return/]
returns: S3-return.zip
```

# S3 — The prototype app

## What this session is

After S3, **the entire frontend exists as a runnable prototype outside the engine**: every screen,
navigable in order, with motion, sound, keyboard and gamepad focus, the temperature states, the
docking and first-undock choreographies, reduced motion and forced colours — so the owner can
play the interface in a browser before a line of engine code changes, and so the engine port
(S4) has something exact to port.

Inputs are the accepted S1 and S2 returns. Extend `fh.css` under `/* S3 */`; never fork.

Ground rules are S1's.

## Phases

### Phase 0 — Set up

Read S1's and S2's `NOTES.md`/`QA.md`; anything under `MISSING` that a screen here needs is Phase
1a. Skeleton, `PLAN.md`, `PROGRESS.md`; copy `tools/`.

### Phase 1 — The remaining frames (image generation) — spec `phases/P05.md`

Four generated frames: **Crucible results** (POSTER, white-hot cooling), **game over** (POSTER,
wanted-cold), **missions log** (BENCH), **codex** (BENCH, introducing the paper insert). Six
derived screens designed directly as prototypes from the registers, with a composed still each for
the record: **pause** (EDGE over the held world), **new game** (POSTER on the title stage), **help**,
**tech tree** (lanes etched on the held world), **credits** (POSTER roll), **photo mode**. Crop
sheets; `kit-notes.md` appended (the paper insert material, the results/game-over hero numerals).
Checkpoint.

### Phase 2 — Asset delta

The paper insert plate, the ten-light status strip if S1 left it, damage wedges, world tags,
tech-node tiles, the pause-overlay dimming treatment for the HUD (38 %), any icon or mark the
previous sessions listed as missing, and the Crucible draft/refit offer tiles. Contact sheets,
manifest. Checkpoint.

### Phase 3 — Prototypes of the remaining screens (code)

`screens/crucible-draft.html`, `crucible-refit.html`, `crucible-results.html`, `game-over.html`,
`pause.html`, `new-game.html`, `mission-log.html`, `codex.html`, `help.html`, `tech-tree.html`,
`credits.html`, `photo-mode.html`, and `asteroid-works-chrome.html` (only the EDGE chrome over a
still of the mining board — the board itself is not yours). All on the kit, real strings, fixtures,
keyboard focus, reveal, sounds; each added to `_compare.html`. Checkpoint.

### Phase 4 — The app (code)

`app/index.html` + `app/app.js`: one page that hosts **every** screen from S1–S3 as templates and
runs a small state machine over `fixtures.js`:

- flow: title → new game → **flight HUD** (over the flight plate; speed, energy, heat and radar
  driven by a fake sim tick) → pause → settings → back → dock (the arrival choreography; docked
  temperature) → each station tab → undock (**first-undock choreography**: instruments come online
  one by one with a tone each) → chart → THE SHIP → footprint/range stubs → **going wanted** (the
  whole-frame temperature move, one sustained tone) → clearing → crucible door → draft → refit →
  results → game over → load → credits → photo mode;
- a screen manager with the register-correct transitions from `MOTION_SPEC.md`; the HUD's
  resting/wake behaviour; the pause overlay dimming the HUD to 38 %;
- **input**: mouse, keyboard (arrows/tab/enter/escape), and gamepad (the Gamepad API: d-pad/stick
  moves focus, A confirms, B backs) with one focus model and the visible ring everywhere;
- **accessibility switches** in a small dev drawer: reduced motion (every transition becomes a
  cut; drift and parallax stop), forced colours (a page that renders every screen with a
  `forced-colors` emulation stylesheet), a 1280 / 1920 / 2560 viewport toggle;
- sounds through `kit/sound.js`, muted until the first click (browser autoplay rules).

Checkpoint.

### Phase 5 — The audit suite (code)

`audit/run.js` (Node, no deps) that opens each screen template in jsdom-free fashion — or, if
you have a headless browser in the VM, uses it — and reports per screen: DOM node count (budget
1,500), every text node's computed font size (floor 12 px at 1280), text/plate contrast pairs
(4.5:1 body, 3:1 large), infinite animations present outside paused screens (must be none),
elements outside the viewport at each width. If a headless browser is unavailable, implement the
static half (parse the HTML/CSS, count nodes, scan sizes from the CSS) and say so. Write the
results into `QA.md`. Fix what fails. Checkpoint.

### Phase 6 — Self-review and package

`HANDOFF_TO_ENGINE.md`: for every screen, the DOM skeleton (element roles and classes), the
CSS classes used, the assets referenced by id, the motions and cues fired and their triggering
state, the fixture fields it reads — the exact inventory S4 will port. Final `QA.md`, `manifest.json`,
zip.

## Return contract

```
S3-return/
  PLAN.md · PROGRESS.md · NOTES.md · QA.md · manifest.json · HANDOFF_TO_ENGINE.md
  frames/ plates/ crops/ kit-notes.md (cumulative)
  assets/ (delta) · kit/ (fh.css cumulative, fh.js, motion, sound)
  screens/ (S1–S3 prototypes, cumulative) · fixtures.js · _compare.html
  app/ index.html · app.js · screens/ (templates) · forced-colors.html
  audit/ run.js · results.json
  tools/ · serve.py
```

## Definition of done

Every screen in the dossier's loop table exists as a prototype and inside the app; the full flow
runs by keyboard alone and by gamepad; reduced motion and forced colours work; the audit passes
(or `QA.md` names each failure with its fix); the four generated frames pass the two tests;
`HANDOFF_TO_ENGINE.md` is complete.

## The way this session gets faked

An app that links pages instead of managing state; gamepad "support" that is a comment; an audit
that prints "ok" without measuring; a codex that is a two-column web page; a tech tree of boxes and
arrows.
