<!-- LIFETIME: DURABLE -->
# KIT_SPEC — the implementation spec for the SpaceFace frontend

**Authority order:** [`DIRECTION_SHEET.md`](./DIRECTION_SHEET.md) (what every screen looks like and
the rules) → this file (the exact tokens, classes, markup, motion, sound and integration seams) →
the four task files under [`tasks/`](./tasks/) (per-screen geometry, steps, checks, handoff). If this
file and the sheet disagree, the sheet wins and this file is corrected. If a task file and this
file disagree, this file wins.

This spec is written so that an agent can build the frontend **without making design decisions**.
Every value is given. Where a value is not given, use the nearest one on the scale in §3 and record
the choice in the receipt. Do not invent a new colour, size, face, shadow, radius, gradient or
animation. If a screen seems to need one, the screen is wrong, not the spec — stop and re-read the
sheet's line for that screen.

Facts about the code in §11 were audited on 2026-09-06 with file and line references. Lines drift;
the names do not. If a name is gone, grep for it, adapt, and say so in the receipt.

---

## 0. The kit in one paragraph

One stylesheet, `styles/kit.css`, loaded last in `index.html`, owns the tokens and every component
class (all prefixed `k-`). One small module folder, `src/ui/kit/`, owns the transition helper, the
temperature switch, the sound cues and a few DOM builders. A migrated screen builds its DOM from
the `k-` classes, sits over the live world with a flat scrim, injects **no** style block of its
own, and deletes the style block it used to inject. Nothing in the kit is themed per screen: the
only per-screen variables are the grid variant (§6.1) and the scrim depth (§5). The flight HUD is
not a screen; it keeps its own injected stylesheet and adopts the kit's tokens and faces (§11.4).

## 1. Files

| Path | Role |
|---|---|
| `styles/kit.css` | tokens, temperature, type, layout, components, motion classes, the legacy-ground override. Loaded as the **last** `<link>` in `index.html` (after `styles/accessibility.css`). |
| `styles/fonts.css` | add the variable Bricolage `@font-face` (§2). The Plex/Saira/Spline faces stay declared until Task D deletes them. |
| `styles/fonts/bricolage-grotesque-var.woff2` | the variable display face, vendored (§2). |
| `styles/fonts/OFL-BricolageGrotesque.txt` | its licence (OFL 1.1), copied from the source repo. |
| `src/ui/kit/index.js` | re-exports `motion.js`, `temperature.js`, `sound.js`, `dom.js`. |
| `src/ui/kit/motion.js` | `settle`, `stamp`, `cut`, `reducedMotion` (§7). |
| `src/ui/kit/temperature.js` | `setTemperature`, `deriveTemperature`, `bindTemperature` (§5). |
| `src/ui/kit/sound.js` | `cue(name)` → the game's audio bus (§8). |
| `src/ui/kit/dom.js` | `el`, `words`, `rows`, `table`, `hero`, `title` builders (§6.5). |
| `src/data/audioRecipes.js` | the eight UI recipes re-tuned (§8) — an edit, not a new file. |
| `_kitlab.html`, `scripts/capture-kit.mjs` | the kit page and its three-width capture (§10). |

Nothing else is added. No per-screen CSS files. No new fonts beyond Bricolage. No images. No new
audio files (the game synthesises every sound; §8). Tasks B, C and D each add the few rules their
task file permits: append them under a `/* Task <X> additions */` comment at the **end** of
`styles/kit.css`, keep `temperature.js` edits to the lines the task names, and run
`git pull --rebase origin master` before every push — three agents touch the kit in parallel.

## 2. Faces

### 2.1 Vendoring the variable Bricolage (one-time, Task A)

The static `bricolage-grotesque-600.woff2` in the repo is **not** the display face. Vendor the
variable font (axes `opsz` 12–96, `wdth` 75–100, `wght` 200–800) from Google's fonts repository
(OFL 1.1). Run from the repo root (Python with fontTools ≥ 4.63 and brotli are installed on the
owner's machine; verified 2026-09-06):

```bash
curl -L -o styles/fonts/_bricolage.ttf "https://github.com/google/fonts/raw/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf"
curl -L -o styles/fonts/OFL-BricolageGrotesque.txt "https://github.com/google/fonts/raw/main/ofl/bricolagegrotesque/OFL.txt"
pyftsubset styles/fonts/_bricolage.ttf --flavor=woff2 --layout-features="*" --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD" --output-file=styles/fonts/bricolage-grotesque-var.woff2
rm styles/fonts/_bricolage.ttf
```

Expected: a woff2 between 60 and 140 KB that still carries `fvar` with three axes. Verify:

```bash
python -c "from fontTools.ttLib import TTFont; f=TTFont('styles/fonts/bricolage-grotesque-var.woff2'); print([a.axisTag for a in f['fvar'].axes])"
```

must print `['opsz', 'wdth', 'wght']`. Anything else means the subset lost the axes; do not ship it.

### 2.2 The `@font-face` block (append to `styles/fonts.css`)

```css
/* Kit display face (design/frontend/direction/KIT_SPEC.md §2). Variable: opsz 12–96, wdth 75–100, wght 200–800. */
@font-face { font-family:"Bricolage Grotesque"; font-style:normal; font-weight:200 800; font-stretch:75% 100%;
  font-display:swap; src:url("/styles/fonts/bricolage-grotesque-var.woff2") format("woff2"); }
```

This declaration must come **after** the existing static Bricolage 600 declaration so it wins;
Task D deletes the static one. Instrument Sans is already declared (`instrument-sans-var.woff2`,
weight 400–700, tabular figures present — verified with fontTools). Do not re-declare it.

### 2.3 How the faces are used

| Role | Class | Face and settings |
|---|---|---|
| Display: names, screen titles, hero numbers | `.k-display` | Bricolage, weight 800, stretch 100 %, `font-variation-settings: "opsz" 96`, letter-spacing −0.03 em, line-height 0.9, tabular numerals, sentence case |
| Text: everything else | inherited from `.k-screen` (or `.k-text` on a root that is not a screen) | Instrument Sans 400; 500 only on the focused/selected word; line-height 1.4; tabular numerals |
| Column headers | `.k-caps` | Instrument Sans 400 at fine size, uppercase, letter-spacing +0.08 em, 38 % — **the only** uppercase and the only positive tracking in the kit |

No `font-family` other than `var(--k-display)` and `var(--k-text)` may appear in a migrated
screen. `var(--mono)`, `var(--font)`, `var(--sf-*-face)`, `IBM Plex`, `Saira` and `Spline Sans
Mono` are banned on migrated screens. Asteroid Works keeps its own law and is not migrated.

## 3. Tokens and the scale

The complete `:root` block. Copy it verbatim into `styles/kit.css`.

```css
:root {
  /* scale: 1 at 1920 px wide, 0.75 at 1280, 1.25 at 2560; every size below multiplies by it */
  --k-s: 1;                                              /* fallback where trig functions are unsupported */
  --k-s: clamp(0.75, tan(atan2(100vw, 1920px)), 1.25);   /* unitless viewport ratio: 0.75 at 1280, 1 at 1920, 1.25 at 2560 */

  /* faces */
  --k-display: "Bricolage Grotesque", "Instrument Sans", system-ui, sans-serif;
  --k-text: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;

  /* colour — the only colours that exist */
  --k-bone-rgb: 234 230 223;
  --k-bone: rgb(var(--k-bone-rgb));
  --k-bone-62: rgb(var(--k-bone-rgb) / 0.62);
  --k-bone-38: rgb(var(--k-bone-rgb) / 0.38);
  --k-hair: rgb(var(--k-bone-rgb) / 0.14);
  --k-ink: #0a0b0d;
  --k-gold: #f2b950;
  --k-red: #ff4d3d;
  --k-white: #ffffff;
  --k-good: #9bd8a0;
  --k-bad: #ff7a6b;

  /* live temperature — overridden by html[data-k-temp]; a screen never sets these */
  --k-signal: var(--k-gold);
  --k-text-live: var(--k-bone);
  --k-scrim: rgb(7 9 15 / 0);

  /* the scale (px at 1920; 12 px floor) */
  --k-fs-fine:  max(12px, calc(12px  * var(--k-s)));
  --k-fs-data:  max(12px, calc(14px  * var(--k-s)));
  --k-fs-body:  max(12px, calc(16px  * var(--k-s)));
  --k-fs-emph:  calc(20px  * var(--k-s));
  --k-fs-sub:   calc(28px  * var(--k-s));
  --k-fs-menu:  calc(40px  * var(--k-s));
  --k-fs-num:   calc(56px  * var(--k-s));
  --k-fs-title: calc(80px  * var(--k-s));
  --k-fs-hero:  calc(112px * var(--k-s));
  --k-fs-name:  calc(160px * var(--k-s));

  /* layout */
  --k-margin: 5vw;                         /* 96 px at 1920 */
  --k-hang:   calc(480px * var(--k-s));    /* the left column */
  --k-gap:    calc(32px  * var(--k-s));
  --k-row:    calc(40px  * var(--k-s));    /* dense-register row height */
  --k-pad:    calc(12px  * var(--k-s));    /* cell padding */
  --k-measure: 64ch;

  /* motion */
  --k-ease: cubic-bezier(0.2, 0, 0, 1);
  --k-d-focus: 80ms;
  --k-d-settle: 140ms;
  --k-d-temp: 400ms;
  --k-shift: calc(12px * var(--k-s));
}
```

Rules that follow from the tokens:

- `--k-s` must stay **unitless**. `calc(100vw / 1920)` is a length, and a length inside `clamp()`
  with plain numbers is invalid CSS — the browser drops the declaration and every
  `calc(Npx * var(--k-s))` collapses. The `tan(atan2(...))` form divides two lengths into a number;
  where a browser cannot parse it the line is dropped at parse time and the `1` above stands, so
  sizes fall back to the 1920 values instead of vanishing. Do not "simplify" it.

- Every size in a migrated screen is one of the ten `--k-fs-*` tokens. No other `font-size` value
  may appear.
- Every colour is one of the tokens. No hex, rgb or named colour may appear in a migrated screen's
  markup or JS.
- Every screen has at least one element at `--k-fs-num` or larger (sheet §3).
- The legacy tokens (`--bg`, `--ink`, `--panel*`, `--accent*`, `--font`, `--mono`, `--t-*`, `--r-*`,
  `--sh-*`, `--glass*`, `--sf-you/foe/goal/calm/paper/surface/edge`, `--hud-*`) are not used by any
  migrated screen. They remain for screens that have not migrated yet.

## 4. Type classes

```css
.k-display { font-family: var(--k-display); font-weight: 800; font-stretch: 100%;
  font-variation-settings: "opsz" 96; letter-spacing: -0.03em; line-height: 0.9;
  font-variant-numeric: tabular-nums; color: var(--k-text-live); margin: 0; }
.k-text { font-family: var(--k-text); font-weight: 400; line-height: 1.4;
  font-variant-numeric: tabular-nums; color: var(--k-text-live); }
.k-t-fine  { font-size: var(--k-fs-fine); }
.k-t-data  { font-size: var(--k-fs-data); }
.k-t-body  { font-size: var(--k-fs-body); }
.k-t-emph  { font-size: var(--k-fs-emph); }
.k-t-sub   { font-size: var(--k-fs-sub); }
.k-t-menu  { font-size: var(--k-fs-menu); }
.k-t-num   { font-size: var(--k-fs-num); }
.k-t-title { font-size: var(--k-fs-title); }
.k-t-hero  { font-size: var(--k-fs-hero); }
.k-t-name  { font-size: var(--k-fs-name); }
.k-62 { color: var(--k-bone-62); }
.k-38 { color: var(--k-bone-38); }
.k-signal { color: var(--k-signal); }
.k-good { color: var(--k-good); }
.k-bad  { color: var(--k-bad); }
.k-caps { font-size: var(--k-fs-fine); text-transform: uppercase; letter-spacing: 0.08em; color: var(--k-bone-38); }
.k-measure { max-width: var(--k-measure); }
```

Usage: a screen title is `<h1 class="k-display k-t-title">Helios Prime</h1>`. A hero number is
`<div class="k-display k-t-hero">4,750</div>`. Body copy is a plain element at `.k-t-body` inside
the screen root. Never combine `.k-display` with `.k-t-fine`, `.k-t-data` or `.k-t-body` — the
display face is never set smaller than `--k-fs-emph`.

## 5. Temperature

The whole frame changes with the game's state. The kit sets one attribute on `<html>`,
`data-k-temp`, and everything else follows from CSS.

```css
html[data-k-temp="flight"]   { --k-scrim: rgb(7 9 15 / 0); }
html[data-k-temp="menu"]     { --k-scrim: rgb(7 9 15 / 0.25); }
html[data-k-temp="docked"]   { --k-scrim: rgb(26 20 16 / 0.25); }
html[data-k-temp="wanted"]   { --k-scrim: rgb(6 8 15 / 0.35); --k-signal: var(--k-red); --k-text-live: #e4e8f0; }
html[data-k-temp="crucible"] { --k-scrim: rgb(7 9 15 / 0); --k-signal: var(--k-white); }
html[data-k-temp="works"]    { /* Asteroid Works keeps its own law; the kit sets nothing */ }
```

| Value | When |
|---|---|
| `flight` | flight with no screen open; also the title screen (the sheet gives the title no scrim) |
| `menu` | any other screen open over flight or over the menu (pause, settings, load, the instruments, the chart, the reading screens, game over) |
| `docked` | the player is docked (`state.ui.docked === true`): the station and its screens |
| `wanted` | the player is wanted — **overrides** flight, menu and docked |
| `crucible` | any Crucible screen, or a Crucible run in flight |
| `works` | the Asteroid Works screen |

Dense screens deepen the docked scrim to 45 %: add `k-screen--dense` to the screen root (§6.1).
The scrim, the signal colour and the live text colour transition over `--k-d-temp` (400 ms); under
reduced motion they cut.

`src/ui/kit/temperature.js` (the field names are the audited ones from §11.3):

```js
const CRUCIBLE_SCREENS = new Set(['crucible', 'crucibleDraft', 'crucibleResults', 'crucibleLab']);
const WORKS_SCREENS = new Set(['drill', 'asteroid']);
export const TEMPERATURE_EVENTS = ['mode:changed', 'heat:changed', 'dock:docked', 'dock:undocked',
  'sim:pause', 'sim:resume', 'game:started', 'save:loaded'];
export function setTemperature(name) {              // named state: 'kit:temperature'
  const html = document.documentElement;
  if (html.dataset.kTemp !== name) html.dataset.kTemp = name;
}
export function deriveTemperature(state) {
  const top = document.body.dataset.kScreen || '';   // set by screenManager.syncVisibility (§11.1)
  if (WORKS_SCREENS.has(top)) return 'works';
  if (CRUCIBLE_SCREENS.has(top) || state?.crucible?.run?.active === true) return 'crucible';
  if (((state?.player?.heat) ?? 0) >= 0.15) return 'wanted';     // WANTED_THRESHOLD, src/systems/heat.js
  if (state?.ui?.docked === true) return 'docked';
  if (top === 'mainMenu') return 'flight';
  if (top || state?.mode === 'menu') return 'menu';
  return 'flight';
}
export function bindTemperature(bus, state) {
  const apply = () => setTemperature(deriveTemperature(state));
  for (const evt of TEMPERATURE_EVENTS) bus.on(evt, apply);
  bus.on('ui:screenTop', apply);                       // emitted by screenManager.syncVisibility (§11.1)
  apply();
  return apply;
}
```

`bindTemperature(ctx.bus, ctx.state)` is called once from `ui.init` in `src/ui/uiRoot.js`
immediately after `injectHudCss()` (§11.1). A screen never sets the temperature itself. If the
Crucible run flag has a different path than `state.crucible.run.active`, read
`src/ui/screens/crucible.js` for the real one and record it in the receipt.

## 6. Layout and components

All component CSS below is the content of `styles/kit.css` after the tokens and temperature
blocks. Copy it verbatim. Markup examples follow each block.

### 6.1 The screen root and the scrim

```css
.k-screen { position: fixed; inset: 0; box-sizing: border-box; padding: var(--k-margin);
  background: transparent; isolation: isolate; color: var(--k-text-live);
  font-family: var(--k-text); font-weight: 400; line-height: 1.4; font-variant-numeric: tabular-nums;
  display: grid; column-gap: var(--k-gap); row-gap: calc(64px * var(--k-s));
  grid-template-columns: var(--k-hang) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas: "title title" "hang stage" "foot foot"; }
.k-screen::before { content: ""; position: absolute; inset: 0; z-index: -1;
  background: var(--k-scrim); transition: background-color var(--k-d-temp) var(--k-ease); }
.k-screen--dense::before { background: rgb(26 20 16 / 0.45); }
.k-screen--split { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.k-screen--stage { grid-template-columns: minmax(0, 1fr); grid-template-areas: "title" "stage" "foot"; }
.k-title { grid-area: title; min-width: 0; }
.k-hang  { grid-area: hang;  min-width: 0; overflow: hidden auto; scrollbar-width: thin; scrollbar-color: var(--k-hair) transparent; }
.k-stage { grid-area: stage; min-width: 0; position: relative; }
.k-foot  { grid-area: foot; display: flex; align-items: flex-end; gap: calc(64px * var(--k-s)); min-width: 0; }
.k-fine  { position: absolute; left: var(--k-margin); bottom: calc(var(--k-margin) * 0.42);
  font-size: var(--k-fs-fine); color: var(--k-bone-38); }
.k-corner { position: absolute; right: var(--k-margin); top: var(--k-margin); text-align: right; }
.k-world { position: absolute; top: 0; left: -9vw; width: 150vw; height: 100%; z-index: -2; display: block; }

/* A kit screen replaces the legacy screen ground and the screen manager's fade (§11.1). */
.screen.k-screen { transition: none; transform: none; }
.screen.k-screen.sf-screen--exiting { opacity: 0; transition: opacity var(--k-d-settle) var(--k-ease); }
body.k-screen-top #screens { background-image: none !important; background-color: transparent !important; }
body.k-screen-top #screens::before { display: none !important; }
/* The flight HUD's own scrim, so the frame can go cold in flight (§11.4). */
#hud::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background: var(--k-scrim); transition: background-color var(--k-d-temp) var(--k-ease); }
```

The three grid variants:

| Class | Columns | For |
|---|---|---|
| `.k-screen` (default) | hang 480 px · stage | menus, lists with a detail pane, settings, missions, codex, help |
| `.k-screen--split` | half · half | the market, the ledger, contracts — the dense register on the left, the selected thing on the right |
| `.k-screen--stage` | one column | the title, pause, THE SHIP, the chart, the Crucible door, game over, new game, load |

Markup skeleton every migrated screen uses (the root is the element the screen manager hands to
`mount(el, ctx)`; add the kit classes to it — never replace it):

```html
<div class="screen k-screen" data-screen="market" data-k-ready="0">   <!-- variants: k-screen--split / k-screen--stage / k-screen--dense -->
  <header class="k-title"> <h1 class="k-display k-t-title">…</h1> <p class="k-t-emph k-62">…</p> </header>
  <div class="k-hang"> … a k-words list, k-rows or a k-table … </div>
  <div class="k-stage"> … the selected thing: a k-display title, a hero number, one sentence, word buttons … </div>
  <footer class="k-foot"> … hero blocks or foot words … </footer>
  <div class="k-fine">…</div>
  <div class="k-corner">…</div>
</div>
```

The screen root is **transparent** — the world canvas shows through, darkened only by the scrim.
A screen never sets `background` on itself or any descendant. `data-k-ready` is `"1"` when the
screen has everything it needs to be photographed (§13).

### 6.2 Words (menus, navigation, buttons)

```css
.k-words { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: calc(16px * var(--k-s)); }
.k-words--row { flex-direction: row; gap: calc(48px * var(--k-s)); flex-wrap: wrap; align-items: baseline; }
.k-word { all: unset; box-sizing: border-box; cursor: pointer; position: relative; display: inline-block;
  font-family: var(--k-text); font-weight: 500; font-size: var(--k-fs-menu); line-height: 1.1;
  color: var(--k-bone-62); padding-bottom: 0.15em; white-space: nowrap;
  transition: color var(--k-d-focus) var(--k-ease); }
.k-word::after { content: ""; position: absolute; left: 0; bottom: 0; height: 2px; width: 2.5em;
  background: var(--k-signal); transform: scaleX(0); transform-origin: left;
  transition: transform var(--k-d-focus) var(--k-ease), background-color var(--k-d-temp) var(--k-ease); }
.k-word:hover, .k-word:focus-visible, .k-word[aria-current="true"], .k-word[aria-pressed="true"] { color: var(--k-text-live); }
.k-word:hover::after, .k-word:focus-visible::after, .k-word[aria-current="true"]::after, .k-word[aria-pressed="true"]::after { transform: scaleX(1); }
.k-word:disabled, .k-word[aria-disabled="true"] { color: var(--k-bone-38); cursor: default; }
.k-word:disabled::after, .k-word[aria-disabled="true"]::after { display: none; }
.k-word--emph { font-size: var(--k-fs-emph); }
.k-word--body { font-size: var(--k-fs-body); }
.k-word--fine { font-size: var(--k-fs-fine); font-weight: 400; }
.k-word--primary { color: var(--k-signal); }
.k-word--primary:hover, .k-word--primary:focus-visible { color: var(--k-signal); }
.k-word--danger { color: var(--k-red); }
.k-word--danger::after { background: var(--k-red); }
.k-word-sub { font-size: var(--k-fs-data); color: var(--k-bone-38); margin-top: calc(-6px * var(--k-s)); }
```

- A menu is `<ul class="k-words" role="menu"><li><button class="k-word" data-action="continue" aria-current="true">Continue</button></li>…</ul>`.
  Every word carries a `data-action` — the checks and the capture scripts find words by it.
- A screen's actions are `<button class="k-word k-word--emph k-word--primary">Buy</button>` and
  `<button class="k-word k-word--emph">Sell</button>`. **One primary per screen.**
- Destructive actions (Quit, Abandon, Delete save, Main menu from a run) are `k-word--danger`.
- Navigation along the bottom edge is `<ul class="k-words k-words--row">`.
- A toggle is two `k-word--body` buttons in a `k-words--row`; the live one carries `aria-pressed="true"`.
- The focused word is the keyboard focus; `dom.words()` (§6.5) gives a list ArrowUp/Down/Home/End
  roving focus. Gamepad focus is handled by `src/ui/input.js` and needs nothing from the kit.

There are **no** filled buttons, bordered buttons, pill buttons or icon buttons on migrated screens.

### 6.3 Rows and the dense register

```css
.k-rows { list-style: none; margin: 0; padding: 0; }
.k-row { display: grid; grid-template-columns: var(--k-row-cols, minmax(0, 1fr) auto); align-items: center;
  column-gap: var(--k-gap); min-height: var(--k-row); padding: 0 var(--k-pad);
  border-top: 1px solid var(--k-hair); color: var(--k-bone-62); font-size: var(--k-fs-body); cursor: pointer;
  transition: color var(--k-d-focus) var(--k-ease), box-shadow var(--k-d-focus) var(--k-ease); }
.k-rows > .k-row:last-child { border-bottom: 1px solid var(--k-hair); }
.k-row__name { color: var(--k-text-live); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.k-row__num  { font-size: var(--k-fs-emph); color: var(--k-text-live); text-align: right; white-space: nowrap; }
.k-row__sub  { font-size: var(--k-fs-data); color: var(--k-bone-38); }
.k-row:hover, .k-row:focus-visible, .k-row[aria-selected="true"] { color: var(--k-text-live); box-shadow: inset 2px 0 0 var(--k-signal); }
.k-row[aria-selected="true"] .k-row__name { font-weight: 500; }
.k-row--static { cursor: default; }
.k-row--static:hover { box-shadow: none; color: var(--k-bone-62); }

.k-table-wrap { max-height: calc(var(--k-row) * 12 + calc(24px * var(--k-s))); overflow: hidden auto;
  scrollbar-width: thin; scrollbar-color: var(--k-hair) transparent; }
.k-table { width: 100%; border-collapse: collapse; font-size: var(--k-fs-data); color: var(--k-bone-62); }
.k-table th { text-align: left; font-weight: 400; padding: 0 var(--k-pad) calc(8px * var(--k-s)); }
.k-table th.k-num, .k-table td.k-num { text-align: right; }
.k-table th[aria-sort] { color: var(--k-text-live); cursor: pointer; }
.k-table td { height: var(--k-row); padding: 0 var(--k-pad); border-top: 1px solid var(--k-hair); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-table td.k-name { color: var(--k-text-live); }
.k-table td.k-num  { font-size: var(--k-fs-emph); color: var(--k-text-live); }
.k-table tbody tr { cursor: pointer; transition: box-shadow var(--k-d-focus) var(--k-ease); }
.k-table tbody tr:hover, .k-table tbody tr:focus-visible, .k-table tbody tr[aria-selected="true"] { box-shadow: inset 2px 0 0 var(--k-signal); }
.k-table tbody tr[aria-selected="true"] td.k-name { font-weight: 500; }
```

The dense register (sheet §6), exactly:

```html
<div class="k-table-wrap">
  <table class="k-table" aria-label="Market">
    <thead><tr><th class="k-caps">Commodity</th><th class="k-caps k-num">Buy</th><th class="k-caps k-num">Sell</th><th class="k-caps k-num">Stock</th></tr></thead>
    <tbody>
      <tr aria-selected="true" tabindex="0"><td class="k-name">Ore, refined</td><td class="k-num">4,750</td><td class="k-num">4,310</td><td class="k-num">120</td></tr>
      …
    </tbody>
  </table>
</div>
```

Twelve rows visible, then the wrap scrolls. The selected row's key number is **repeated** at
`--k-fs-hero` in `.k-stage` with the sentence that explains it. Filters are a `k-words--row` of
`k-word--body` above the table; the live one has `aria-pressed="true"`. Sorting is a header click;
the sorted header carries `aria-sort`. The existing `src/ui/listControls.js` search/sort control may
stay as the logic; only its rendered elements change to kit classes.

### 6.4 Hero blocks, titles, empty states, inputs, pins, crests, bars

```css
.k-hero { display: flex; flex-direction: column; gap: calc(6px * var(--k-s)); min-width: 0; }
.k-hero__n { font-family: var(--k-display); font-weight: 800; font-stretch: 100%; font-variation-settings: "opsz" 96;
  letter-spacing: -0.03em; line-height: 0.9; font-variant-numeric: tabular-nums; font-size: var(--k-fs-num); color: var(--k-text-live); }
.k-hero__w { font-size: var(--k-fs-body); color: var(--k-bone-62); }
.k-hero--signal .k-hero__n { color: var(--k-signal); transition: color var(--k-d-temp) var(--k-ease); }
.k-hero--title .k-hero__n { font-size: var(--k-fs-title); }
.k-hero--hero  .k-hero__n { font-size: var(--k-fs-hero); }
.k-sentence { font-size: var(--k-fs-body); color: var(--k-bone-62); max-width: var(--k-measure); margin: 0; }
.k-sentence--emph { font-size: var(--k-fs-emph); color: var(--k-text-live); }
.k-empty { font-size: var(--k-fs-sub); color: var(--k-bone-62); max-width: var(--k-measure); margin: 0; }
.k-input { all: unset; box-sizing: border-box; font-family: var(--k-text); font-size: var(--k-fs-body); color: var(--k-text-live);
  border-bottom: 1px solid var(--k-hair); padding: calc(4px * var(--k-s)) 0; min-width: 6ch; font-variant-numeric: tabular-nums;
  transition: border-color var(--k-d-focus) var(--k-ease); }
.k-input:focus { border-bottom-color: var(--k-bone); }
.k-input--num { text-align: right; font-size: var(--k-fs-emph); }
.k-select { all: unset; box-sizing: border-box; cursor: pointer; font-family: var(--k-text); font-size: var(--k-fs-body); color: var(--k-text-live);
  border-bottom: 1px solid var(--k-hair); padding: calc(4px * var(--k-s)) 0; }
.k-select:focus { border-bottom-color: var(--k-bone); }
.k-range { -webkit-appearance: none; appearance: none; width: calc(240px * var(--k-s)); height: 2px; background: var(--k-bone-38); outline-offset: 8px; }
.k-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 2px; height: calc(16px * var(--k-s)); background: var(--k-bone); border: 0; border-radius: 0; }
.k-range::-moz-range-thumb { width: 2px; height: calc(16px * var(--k-s)); background: var(--k-bone); border: 0; border-radius: 0; }
.k-pin { position: absolute; font-size: var(--k-fs-data); color: var(--k-text-live); white-space: nowrap; transform: translate(-50%, -100%); padding-bottom: calc(6px * var(--k-s)); }
.k-pin__sub { display: block; color: var(--k-bone-38); }
.k-pin__lead { position: absolute; left: 0; top: 0; height: 1px; background: var(--k-hair); transform-origin: 0 0; }
.k-crest { width: calc(96px * var(--k-s)); height: auto; }
.k-crest--hero { width: calc(240px * var(--k-s)); }
.k-crest--row { width: calc(24px * var(--k-s)); }
.k-bar { position: relative; height: 2px; width: calc(240px * var(--k-s)); background: var(--k-bone-38); }
.k-bar__fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--k-text-live); transition: width var(--k-d-focus) linear, background-color var(--k-d-temp) var(--k-ease); }
.k-bar--signal .k-bar__fill { background: var(--k-signal); }
.k-rule { border: 0; border-top: 1px solid var(--k-hair); margin: calc(24px * var(--k-s)) 0; }
.k-screen :focus-visible { outline: 2px solid var(--k-bone); outline-offset: 4px; border-radius: 0; }
.k-screen ::selection { background: var(--k-signal); color: var(--k-ink); }
.k-screen *, .k-screen *::before, .k-screen *::after { border-radius: 0; }
```

- A foot row of four bands is four `.k-hero` blocks inside `.k-foot`.
- The one number a screen is about is `.k-hero.k-hero--hero` in `.k-stage`; if it is the actionable
  thing (a price to buy at), add `k-hero--signal`.
- Empty state: `<p class="k-empty">No contracts posted here today.</p>` and nothing else in the pane.
- A numeric setting is `<input type="range" class="k-range">` with its value beside it at
  `.k-t-emph`; a choice among many is `<select class="k-select">`; a choice among two to four is a
  words toggle, never a select.
- A pinned label on THE SHIP is `.k-pin` positioned by JS at the projected socket
  (`mount.projectLocalPoint`); its `.k-pin__lead` is a 1 px hairline rotated to the socket.
- A crest is an inline SVG from `src/ui/station/icons.js` with `.k-crest` (never a tint).
- The heat bar on the HUD is `.k-bar`; it turns red through the temperature, not a class.

### 6.5 `src/ui/kit/dom.js` — the builders

```js
import { cue } from './sound.js';
export function el(tag, className = '', text = '') { const e = document.createElement(tag); if (className) e.className = className; if (text) e.textContent = text; return e; }

/** items: [{ action, label, sub?, primary?, danger?, disabled?, current? }] → <ul class="k-words">; roving ArrowUp/Down/Home/End; Enter/Space activate. */
export function words(items, { row = false, onPick } = {}) {
  const ul = el('ul', row ? 'k-words k-words--row' : 'k-words'); ul.setAttribute('role', 'menu');
  for (const it of items) {
    const li = el('li'); const b = el('button', 'k-word' + (it.primary ? ' k-word--primary' : '') + (it.danger ? ' k-word--danger' : ''), it.label);
    b.type = 'button'; b.dataset.action = it.action; b.setAttribute('role', 'menuitem');
    if (it.disabled) b.setAttribute('aria-disabled', 'true'); if (it.current) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') === 'true') { cue('deny'); return; } cue('confirm'); onPick?.(it.action, b); });
    li.appendChild(b); if (it.sub) li.appendChild(el('div', 'k-word-sub', it.sub)); ul.appendChild(li);
  }
  ul.addEventListener('keydown', (ev) => {
    const keys = row ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    const all = [...ul.querySelectorAll('.k-word:not([aria-disabled="true"])')]; const i = all.indexOf(document.activeElement);
    let j = -1;
    if (ev.key === keys[0]) j = Math.max(0, i - 1); else if (ev.key === keys[1]) j = Math.min(all.length - 1, i + 1);
    else if (ev.key === 'Home') j = 0; else if (ev.key === 'End') j = all.length - 1;
    if (j >= 0) { ev.preventDefault(); if (j !== i) { all[j].focus(); cue('move'); } }
  });
  return ul;
}
/** items: [{ id, name, num?, sub?, selected? }] → <ul class="k-rows">; cols overrides --k-row-cols. */
export function rows(items, { cols, onPick } = {}) { /* build .k-row elements with .k-row__name / .k-row__num / .k-row__sub; aria-selected; click → cue('confirm') + onPick(id); keydown ArrowUp/Down like words() */ }
/** head: [{ label, num? }], body: [{ id, cells: [text…], selected? }] → .k-table-wrap > table.k-table; numeric cells get .k-num, the first cell .k-name. */
export function table({ head, body, onPick, ariaLabel }) { /* as §6.3 */ }
/** hero(n, w, { size: 'num'|'title'|'hero', signal }) → .k-hero */
export function hero(n, w, { size = 'num', signal = false } = {}) { const h = el('div', 'k-hero' + (size !== 'num' ? ` k-hero--${size}` : '') + (signal ? ' k-hero--signal' : '')); h.appendChild(el('div', 'k-hero__n', String(n))); if (w) h.appendChild(el('div', 'k-hero__w', w)); return h; }
/** title(text, sub) → header.k-title */
export function title(text, sub) { const h = el('header', 'k-title'); h.appendChild(el('h1', 'k-display k-t-title', text)); if (sub) h.appendChild(el('p', 'k-t-emph k-62', sub)); return h; }
```

The comments in `rows` and `table` are the implementation brief; write the bodies to match the CSS
in §6.3. The reachability check (`scripts/check-src-reachability*`) refuses a module nothing
imports: `index.js` re-exports all four modules and every migrated screen imports from
`../kit/index.js`.

## 7. Motion

CSS (in `kit.css`):

```css
.k-in { opacity: 0; transform: translate(var(--k-in-x, 0px), var(--k-in-y, 0px)); }
.k-in.k-in--go { opacity: 1; transform: none;
  transition: opacity var(--k-d-settle) var(--k-ease), transform var(--k-d-settle) var(--k-ease);
  transition-delay: var(--k-in-delay, 0ms); }
.k-in--left   { --k-in-x: calc(-1 * var(--k-shift)); }
.k-in--right  { --k-in-x: var(--k-shift); }
.k-in--top    { --k-in-y: calc(-1 * var(--k-shift)); }
.k-in--bottom { --k-in-y: var(--k-shift); }
.k-in--stamp  { --k-in-y: calc(4px * var(--k-s)); }
.k-out { opacity: 0 !important; transition: opacity var(--k-d-settle) var(--k-ease); }
@media (prefers-reduced-motion: reduce) { :root { --k-d-focus: 0ms; --k-d-settle: 0ms; --k-d-temp: 0ms; } }
html.sf-reduce-motion { --k-d-focus: 0ms; --k-d-settle: 0ms; --k-d-temp: 0ms; }
```

`html.sf-reduce-motion` is the game's own class, toggled by `src/ui/accessibility.js` from the
player's setting or the system preference (§11.5). The kit adds no class of its own.

`src/ui/kit/motion.js`:

```js
const raf2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
/** Bring one element in from the edge it hangs from. `state` names the state that started it (required). */
export function settle(el, { from = 'left', delay = 0, state } = {}) {
  if (!state) throw new Error('kit.settle: name the state that started this motion');
  el.classList.remove('k-in--go'); el.classList.add('k-in', `k-in--${from}`);
  el.style.setProperty('--k-in-delay', `${delay}ms`);
  raf2(() => el.classList.add('k-in--go'));
}
/** Stamp a run of elements in, one after another. gap 60 ms; a seven-word menu takes 420 ms. */
export function stamp(els, { gap = 60, state } = {}) {
  Array.from(els).forEach((el, i) => settle(el, { from: 'stamp', delay: i * gap, state }));
}
/** A cut: hide now, show the next thing now. The settle follows. */
export function cut(hideEl, showEl) { if (hideEl) hideEl.hidden = true; if (showEl) showEl.hidden = false; }
/** True when the kit must not animate (the game's class or the system setting). */
export function reducedMotion() {
  return document.documentElement.classList.contains('sf-reduce-motion')
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
```

Rules:

- A screen opening: in `onShow`, `settle` the title from `top`, the hang column from `left`, the
  stage from `right`, the foot from `bottom` — all in the same frame with no delay between regions.
  Total cost 140 ms. The screen manager's own enter fade is disabled for kit screens by the
  `.screen.k-screen` rule; its 200 ms exit timer still runs and the kit's exit rule fades out in
  140 ms inside it.
- Hero type (the game's name, a station's name, a cause of death) uses `stamp` on its words.
- Focus changes use the CSS transitions only (80 ms). Nothing else moves on focus.
- Temperature changes are CSS transitions of 400 ms on the scrim and colours; the JS only sets the
  attribute.
- Nothing in a migrated screen may use `@keyframes`, `animation`, a transition over 400 ms, an
  infinite or alternating animation, `transform: scale`, blur, or opacity pulsing.
- Under reduced motion every duration is 0 ms; the code path is identical.

## 8. Sound

The game already synthesises every sound with WebAudio (`src/audio/synth.js`; there are no audio
files) from recipes in `src/data/audioRecipes.js`, played by `src/audio/audioSystem.js` when
something emits `bus.emit('audio:cue', { id })`. The kit adds **no** audio context, no files and
no new ids: it re-tunes the eight recipes that already carry the UI's meaning and emits the cue ids
the audio system already maps (§11.6).

`src/ui/kit/sound.js`:

```js
const CUE_ID = { open: 'ui_open', close: 'ui_back', move: 'ui_tab', confirm: 'ui_confirm', deny: 'ui_deny' };
let bus = null;
export function bindSound(b) { bus = b; }                 // called once from ui.init (§11.1)
export function cue(name) {
  const id = CUE_ID[name]; if (!id) throw new Error(`kit.cue: unknown cue ${name}`);
  bus?.emit('audio:cue', { id, gain: name === 'move' ? 0.25 : 0.6 });
}
```

`dock`, `undock` and `wanted` are not emitted by the kit: the game already plays
`sfx_dock_clunk` on docking, `sfx_undock_release` on undocking and `sfx_wanted_alert` on going
wanted (§11.6). Task A re-tunes all eight recipes to the sheet's character:

| Recipe id (in `audioRecipes.js`) | Sheet cue | Character | Length |
|---|---|---|---|
| `sfx_ui_open` | open | a soft low thud: sine, 110 → 100 Hz, low-pass 500 Hz | ≤ 250 ms |
| `sfx_ui_back` | close | the same, lower: sine, 82 → 74 Hz, low-pass 420 Hz | ≤ 250 ms |
| `sfx_ui_tab` | move | a barely-there tick: sine 660 → 640 Hz, low-pass 2.4 kHz, very short | ≤ 60 ms |
| `sfx_ui_confirm` | confirm | one clear tone: sine 440 Hz, no sweep, low-pass 3 kHz | ≤ 300 ms |
| `sfx_ui_error` | deny | a dull two-note fall: sine 330 → 247 Hz over 120 ms, low-pass 900 Hz | ≤ 300 ms |
| `sfx_dock_clunk` | dock | a low swell: sine 48 → 62 Hz, slow attack, low-pass 600 Hz | ≤ 900 ms |
| `sfx_undock_release` | undock | the swell reversed, faster: 62 → 48 Hz, low-pass 500 Hz | ≤ 600 ms |
| `sfx_wanted_alert` | wanted | one sustained cold tone: sine 196 Hz, slow attack, held, low-pass 800 Hz | ≤ 1.2 s |

Copy the existing `sfx_ui_open` recipe (§11.6 names the line) as the template for the five UI
recipes and change only `baseFreq`, `freqSweep`, `sweepTimeS`, `gainEnvelope`, `filterType`,
`filterFreq`. Read `src/audio/synth.js` `applyEnvelope` before setting the envelope fields so
attack/sustain/release mean what you think. Keep every recipe's `id` and `category`. No beeps, no
chirps, no noise bursts, no sci-fi voice. The game ships **muted by default**
(`state.settings.audio.muted: true`) and automation is always muted; that is unchanged.

Where cues fire: `open` when a kit screen opens; `close` when one closes; `move` on keyboard/pad
focus moving between words or rows (never on mouse hover); `confirm` on a word activated; `deny`
on a refused action. Silence is the default; a state with no change makes no sound.

## 9. Geometry conventions (px at 1920×1080; every value multiplies by `--k-s` at other widths)

```
(0,0) ┌──────────────────────────────────────────────────────────────────────────┐
      │  M = 96 margin                                             corner (W−M, M) │
      │  ┌ title block at (M, M): the screen's name in the display face          │
      │  │                                                                       │
      │  │  hang column x ∈ [96, 576]   stage x ∈ [608, 1824]                     │
      │  │  (words / rows / table)      (the selected thing: title, hero          │
      │  │                               number, one sentence, word buttons)     │
      │  │                                                                       │
      │  └ foot row bottom edge at y = 984: hero blocks or foot words             │
      │  fine print at (96, 1040)                                                 │
      └──────────────────────────────────────────────────────────────────────────┘ (1920,1080)
```

- The **middle of the frame belongs to the world**. Content never centres itself; it hangs from
  the left, the bottom, the top-left or the top-right.
- The title block's top edge is at `M`. A menu list starts 64 px below the title block (the grid's
  row gap).
- Foot row items are left-aligned from `M` with 64 px gaps; foot navigation words use 48 px gaps.
- The corner (top-right) holds one number at most (credits, score); it is `.k-corner`.
- The split variant puts the table in the left half and the selected thing in the right half; the
  right half's title block sits at the same `M` top as the table's header row.
- A 3D mount that is the picture (`.k-world`) fills the frame and is shifted so the object sits at
  66 % of the width; the words hang on the left third.

## 10. The kit page in the lab

`_kitlab.html` at the repo root (a dev harness like `_uilab.html`; no game code; links only
`/styles/ui.css`, `/styles/fonts.css`, `/styles/kit.css`) renders, with real strings from the game,
every component in §6 in every state: a words menu with a focused and a disabled word; a foot words
row; a primary, a secondary and a danger word; twelve rows with one selected; the dense table with
twelve rows and one selected and its selected price repeated at hero size; a hero block at num,
title and hero size; a signal hero; an empty state; an input, a select, a range; a toggle; a pin
with a lead; a crest at three sizes; a bar; the ten type sizes labelled; the six temperature values
as swatches. `scripts/capture-kit.mjs` (`npm run capture:kit`) captures it at 1280, 1920 and 2560
to `.devshots/frontend/A/kit-<w>.png`. This page is the reviewer's reference for Task A and the
builder's reference for Tasks B–D.

## 11. Integration seams (audited 2026-09-06)

### 11.1 The screen system

- **No base class.** `src/ui/screenManager.js` duck-types a screen object: `id`, `mount(el, ctx)`
  (once), `onShow(ctx)`, `refresh(ctx)`, `onHide()` (no args), `dispose()`, `data.ariaLabel`,
  `data.locked`. Canonical example: `src/ui/screens/pause.js` ≈ 352–463.
- The root is created by the manager (≈ 189–211): `div.screen[data-screen=id][role=dialog]` inside
  `#screens`, `display:none` until top of stack (`syncVisibility`, ≈ 213–267). Screens are built
  once and cached. A migrated screen **adds** `k-screen` (and a variant) to that root in `mount`.
  The manager writes the visible screen's `style.display` **inline** (`'flex'`, ≈ 221), which would
  override the kit's `display: grid`; the Task A edit below makes it `'grid'` for roots that carry
  `k-screen` and leaves `'flex'` for every other screen.
- **Every screen pauses the sim** (stack occupancy → `sim:pause` / `sim:resume`, ≈ 295–310).
- The legacy ground is `#screens` (`styles/ui.css` ≈ 180–198: the cinematic still + a two-gradient
  `::before`), cleared in a run by `body.sf-in-run` (≈ 209–221; set in `src/ui/uiRoot.js` ≈ 609).
  The kit's `body.k-screen-top` rules (§6.1) replace it for kit screens.
- **The one screen-manager edit (Task A):** in `syncVisibility()`, once the top element is known:

  ```js
  // where the manager assigns the visible display value (≈ 221): el.style.display = el.classList.contains('k-screen') ? 'grid' : 'flex';
  document.body.classList.toggle('k-screen-top', !!topEl && topEl.classList.contains('k-screen'));
  document.body.dataset.kScreen = topEl ? (topEl.dataset.screen || '') : '';
  this.bus?.emit?.('ui:screenTop', { id: document.body.dataset.kScreen || null });   // if the manager holds a bus; else emit from uiRoot where it calls syncVisibility
  ```

- **`ui.init` edits (Task A):** in `src/ui/uiRoot.js`, right after `injectHudCss()` (≈ 371):
  `bindSound(ctx.bus); bindTemperature(ctx.bus, ctx.state);` (imports from `./kit/index.js`).
- z-order (`styles/ui.css` ≈ 105–143): `#gl-canvas` 0 · `#ui-root` 10 (pointer-events none) ·
  `#hud` 10 · `#toasts` 11 · `#modal-backdrop` 90 · `#screens` 100 · `#alerts` 1100.
  `body.ui-modal-open #hud { opacity: 0 }` (≈ 145) hides the HUD under any screen.
- Focus: the manager traps Tab only (≈ 111–127) and restores focus on pop (≈ 156–165). Arrow keys
  are per-screen; the kit's `dom.words()` / `dom.rows()` provide them. Gamepad UI focus is
  `src/ui/input.js` `handleGamepadUi` (≈ 754) and sets `html.sf-gamepad-focus`; nothing to do.
- Style injection today: each screen hand-rolls `if (!document.getElementById(STYLE_ID)) …`
  (`mainMenu.js` ≈ 12, 49–77; `pause.js` ≈ 356; `newGame.js` ≈ 226; `saveLoad.js` ≈ 325;
  `settings.js` ≈ 16; `help.js` ≈ 17; `gameOver.js` ≈ 7). A migrated screen deletes its block and
  the `STYLE_ID`. Shared menu chrome lives in `styles/menu.css` (`.sf-btn`, `.sf-tab`, `.sf-row`,
  `.sf-slot`, `.sf-tabbar`, `.sf-foot`, `.sf-crest`, `.panel`, `.sf-menu*`) — a migrated screen
  stops using those classes; the file is deleted in Task D once nothing references it.
- Stylesheet order (`index.html` ≈ 10–15): `ui.css`, `fonts.css`, `menu.css`, `intro.css`,
  `asteroid-ops.css`, `accessibility.css` — `kit.css` goes after these. The station injects its
  own three sheets at runtime (`src/ui/station/stationApp.js` ≈ 68–70: `station.css`,
  `station-workbench.css`, `station-berth.css`, order load-bearing).
- **Keep structural hooks.** Checks and capture scripts find elements by `data-screen`, by ids
  (`#sf-ng-pilot-name`, `#sf-ng-difficulty`, `#sf-ng-seed`), by classes (`.sf-ng-header`,
  `.sf-ng-body`, `.sf-ng-footer`, `.sf-menu-save-summary`, `.sf-pause-brief`, `.sf-slot-name`) and
  by `coreText` labels. When a task migrates a screen, keep those ids and classes on the new
  elements as inert hooks (their CSS is deleted; the names stay) unless the task file says to
  update the script instead. Never rename `data-screen`.

### 11.2 The title and the hull

- `src/ui/screens/mainMenu.js` (`mainMenuScreen`, id `mainMenu`): Continue logic (`readSaveIndex`,
  `latestSave`, the disabled states, the black veil `_showContinueFade` ≈ 410–437) is product
  behaviour and stays. The attract-mode code (≈ 328–407) calls a camera hook that does not exist —
  delete it. Menu order today: New game, Continue, Load, Settings, Crucible, Signal Archive,
  Sandbox (dev), Quit; labels via `coreText(...)`.
- `src/ui/shipPreviewMount.js` `createShipPreviewMount(canvas, opts)` (≈ 420) — takes a **canvas**,
  owns its own WebGL renderer, lights and camera; `dockId` gives the hangar backdrop
  (`dockInteriorIdForArchetype`, ≈ 48); returns `show(defId, { rotating, fittings, weapons,
  isPlayer })`, `setRotating`, `rotateBy`, `setZoom` (clamped 0.72–2.1), `setActive`, `resize`,
  `dispose`, `projectLocalPoint`, `onFirstFrame` option (≈ 425). Auto-rotate is `yaw += 0.012`
  per frame (≈ 717) — too fast; drive the yaw yourself. Used today by
  `src/ui/shipEngineeringStage.js` (≈ 89–102) and `src/ui/station/screens/shipworks.js`
  (≈ 758–773; drag-to-orbit wiring ≈ 2397–2443). No headless guard: without WebGL the constructor
  throws — catch it.
- The starter: `src/data/newGameDefaults.js` `shipId: 'ship_kestrel'` (Hitch), `fittedModules`
  ≈ 24–29, `credits: 5000`, `startingSectorId: 'sector_helios_prime'`. There is **one** starter and
  four difficulties (`src/ui/screens/newGame.js` ≈ 13–18: casual, standard, veteran, ironman).
- There is no version string in the UI today and no credits or statistics screen (Task B adds the
  version line and a credits screen; statistics is out of scope).

### 11.3 State the kit reads

| Fact | Path |
|---|---|
| mode | `state.mode` ∈ `menu` · `loading` · `flight` · `paused`; every change emits `mode:changed { mode, previousMode }` (`src/main.js` ≈ 217, 596, 604) |
| docked | `state.ui.docked` (bool) + `state.ui.dockedStationId`; set `src/ui/uiRoot.js` ≈ 898, cleared ≈ 947, 1050. **Not a mode.** |
| dock events | `dock:docked` (`src/ui/input.js` ≈ 94) · `dock:undocked` (`input.js` ≈ 561, `stationApp.js` ≈ 742 with `{ committed: true }`) · `dock:range`, `dock:denied`, `station:exitRequest` |
| wanted | `state.player.heat` (0..1), wanted ⇔ `heat >= 0.15` (`isPlayerWanted`, `src/systems/heat.js` ≈ 446); event `heat:changed { value, level, wanted, wantedCrossed, … }` (≈ 442). No boolean field. |
| speed | player entity `p = state.entities.get(state.playerId)`; `Math.hypot(p.vel.x, p.vel.z)` (`hud.js` ≈ 4275) |
| hull / shield / energy | `p.hull / p.hullMax`, `p.shield / p.shieldMax`, `p.cap / p.capMax` (≈ 4144–4146) |
| weapon heat (not WANTED) | `weaponHeatSummary(p.data.weapons)` → `.frac`, `.overheated` (≈ 4147) |
| target | `state.player.targetId` → `state.entities.get(id)` (≈ 4388) |
| tracked mission | `state.ui.trackedMissionId`, `state.missions.active` |
| reduced motion | `html.sf-reduce-motion` (class) and `state.settings.video.motionReduce` (effective flag written by `src/ui/accessibility.js` ≈ 244–248) |
| audio settings | `state.settings.audio { master, sfx, music, ui, muted }` (`src/core/gameState.js` ≈ 16–22); muted by default |
| new-run signals | `game:new`, `game:started { newGamePlus }` (`main.js` ≈ 427), `save:loaded` |

### 11.4 The flight HUD

- Built by `createHud` in `src/ui/hud.js` into the static `#hud`; `ui.frame` (`uiRoot.js` ≈ 1116–1147)
  calls `hud.frame(dt)` only when `state.mode === 'flight' && !modalChromeOpen && !docked`, and
  `hud.forceRefresh()` on the first visible frame after being hidden (≈ 1142) — **that line is the
  arrival hook** (Task B).
- Anchors: `.sf-leftstack` (`.sf-leftcontext` + `.sf-bars`), `.sf-commtape`, `.sf-command-deck`
  (`.sf-vtape`, `.sf-cluster` with `.sf-stat--speed .sf-stat__v`, `.sf-ml-instrument`),
  `.sf-rightdock` (`.sf-target.sf-hudpanel`, `.sf-overview`, `.sf-radar-wrap`), `.sf-prail`
  (root-level), `#aim-reticle` (from `uiRoot.js` ≈ 470), `#alerts` (top-centre voice, z 1100),
  `#toasts.sf-receipts` (the receipts lane, re-parented into `#hud`).
- CSS: one injected block, `injectHudCss()` in `uiRoot.js` ≈ 1383–2600 (`#sf-hud-style`), plus
  small self-injected blocks in `hud.js` (`sf-vtape-style` ≈ 939, `sf-death-style` ≈ 911,
  `sf-caption-style` ≈ 1845, `sf-tell-style` ≈ 1909). The HUD tokens are at ≈ 1959–1974:
  `--hud-display`, `--hud-body`, `--hud-data`, `--hud-paper`, `--hud-muted`, `--hud-line`,
  `--hud-cyan`, `--hud-amber`, `--hud-radius`; `#hud { font-size: calc(15px * var(--ui-scale)) }`
  at ≈ 1389.
- Power Rail (`src/ui/powerRail.js`): `.sf-prail > .sf-prail__band > .sf-prail__slots >
  button.sf-pslot[data-state]`; the live slot is `data-state="armed"`; the slot-claim contract is
  bus events `hud:slotClaim` / `hud:slotRelease` — never change it; the cooldown sweep is a CSS
  animation on an SVG ring (`@keyframes sf-pslot-sweep`, `uiRoot.js` ≈ 2534) — it is state-bound
  and finite, keep it.
- Receipts: `src/ui/toasts.js` — `.sf-toast`, `.sf-toast--in/--out`, `.sf-toast__icon/__text/__count`;
  max two; admission rules in `src/ui/hudAttention.js` (`admitReceipt`). The lane rectangle is
  computed by `resolveObjectiveHudLayout` (`hud.js` ≈ 457–506) and written in two places
  (`hud.js` ≈ 4575, `toasts.js` ≈ 68) — do not move the lane.
- Wanted today: `hud.js` ≈ 3249–3268 raises a persistent `#alerts` pill on `heat:changed`; no class
  on the root. The kit's temperature attribute is what turns the frame cold; the pill stays as
  text (Task B restyles `.sf-alert`).
- Undock today (`uiRoot.js` ≈ 926–956): fade to dark, camera push-zoom, 400 ms later
  `state.ui.docked = false` and the station screen pops, 50 ms later the fade lifts. No arrival
  animation exists; there is no first-undock flag anywhere. The arrival choreography (Task B) plays
  on **every** undock from the forceRefresh hook above.
- Checks: `check:hud-j07` (`test/j07-hud-contract.test.mjs`: radar sizes per breakpoint, no fixed
  widths on `.sf-target*`/`.sf-overview`, `--sf-dock-w` at three breakpoints, threat-tier
  selectors, `hudBrackets.js` import and `bracketCss()` output), `check:one-voice`,
  `check:ui-identity` (forbids the words `SHIP CONDITION` in `hud.js`), `check:ui-a11y`,
  `check:wcag-contrast`, `check:player-facing-labels`, `check:ui:perf` (includes
  `check-ui-frame-sleep.mjs`: HUD positions move by `transform` only, idle overlays are
  `display:none`), `check:ui:budgets`.
- The binding attention rules: `design/HUD_FLIGHT_ATTENTION.md` §2 — quiet instruments, receipts
  not toasts (no card, stripe, shadow), one top-centre voice, no key laundry, teach-once, numbers
  only when low, no glass plate, no decorative rail, no 7–8 px tracked labels, no new
  `backdrop-filter`, do not edit sim files.

### 11.5 Accessibility and motion

`src/ui/accessibility.js` owns `html.sf-reduce-motion`, `html.sf-reduce-flash`,
`html.sf-high-contrast`, `html.sf-forced-colors`, caption classes; effective motion flag written to
`state.settings.video.motionReduce`. `prefersReducedMotion()` lives in
`src/ui/effects/effectRuntime.js` ≈ 67–79. Canvas surfaces must gate motion in JS (the radar test
asserts it). `styles/accessibility.css` ≈ 132–154 kills animations under reduced motion.

### 11.6 Audio

`src/audio/audioSystem.js` subscribes `bus.on('audio:cue', p => this._onCue(p))` (≈ 1213); the
payload is `{ id, gain, position, rate, importance, duck }`; `AUDIO_CUE_TO_RECIPE` (≈ 469–590)
maps `ui_open → sfx_ui_open`, `ui_back → sfx_ui_back`, `ui_tab → sfx_ui_tab`,
`ui_confirm → sfx_ui_confirm`, `ui_deny → sfx_ui_error`, `ui_hover → sfx_ui_hover`,
`wanted_escalate → sfx_wanted_alert`, `wanted_clear → sfx_wanted_clear`; unknown ids fall back to
`sfx_ui_click`. Recipes: `src/data/audioRecipes.js` — `sfx_ui_open` ≈ 601, `sfx_ui_back` ≈ 611,
`sfx_ui_tab` ≈ 621, `sfx_ui_confirm` ≈ 502, `sfx_ui_error` ≈ 631, `sfx_ui_click` ≈ 473 (schema:
`{ id, category, type: 'oscillator', baseFreq, freqSweep: [from, to], sweepTimeS, gainEnvelope:
{ attack, sustain, release }, filterType, filterFreq }`); `sfx_dock_clunk`, `sfx_undock_release`,
`sfx_wanted_alert` by grep. Docking/undocking/wanted sounds are already emitted by the game
(`audioSystem.js` `_onUndocked` ≈ 2857, `_onHeatChanged` ≈ 2871–2900; dock at `uiRoot.js` ≈ 909).
`uiRoot.js` ≈ 405–420 emits `ui_hover` on every `pointerover` inside `#screens` — Task D removes
that emitter (the sheet forbids sound on mouse hover). UI volume is `settings.audio.ui`.

### 11.7 Capture and the regression floor

- `scripts/capture-ui-matrix.mjs`: Playwright, `chromium.launch({ headless })` with **no GPU
  flags** (≈ 396); boots the game by clicking the title's New Game and the new-game Launch
  (selectors ≈ 2258, 2272), opens surfaces from `scripts/ui-grammar-surfaces.mjs` (`kind` ∈
  default · key · nested · fixture · boot); **hides `#gl-canvas` and the `#screens` image on
  purpose** (`applyNeutralGround`, ≈ 1891) so regression frames compare; writes
  `.devshots/ui-matrix/<surface>-<mode>-<w>x<h>.png`; the committed baseline is
  `test/ui-frame-references/` with `floors.json`. Task A adds `--world` and `--out` (Task A §1
  step 6) for review captures with the world visible; without them nothing changes.
- `scripts/capture-screen-atlas.mjs` ≈ 95 is the one script launching with
  `--use-gl=angle --ignore-gpu-blocklist`.
- `scripts/probe-frontend-snapshot.mjs` serves the repo root with a 30-line static server (≈ 45)
  and captures `_uilab.html?lab=shots` to `.devshots/frontend/<name>.png` — copy its server for
  `capture-kit.mjs`.
- `check:ui:budgets` (`scripts/check-ui-budgets.mjs`) compares each surface's UI frame time
  (≤ 2 ms) and DOM nodes (≤ 1,500) against `test/ui-frame-references/budgets.json` and **any edit
  to UI source stales the baseline**. Re-baseline, headed, after each task's UI edits:

  ```bash
  node scripts/capture-ui-matrix.mjs --headed --mode=default --viewport=1920x1080 --budgets-out=test/ui-frame-references/budgets.json
  ```

- `check:visual-regression` fails on a reachable surface with no reference PNG or a diff above its
  floor; the reference set is reshot in Task D once every surface has migrated (Tasks A–C record
  the expected reds by name in their receipts instead of reshooting piecemeal).
- `.devshots/` is git-ignored; review captures live there. `node server.js 8123` serves the repo.

### 11.8 Station, instruments, modes, reading screens

The seams for Tasks C and D (station OS classes and navigation, the engineering stage, the
footprint graph, the range, the chart's drawing, the Crucible screens, Asteroid Works' law, the
reading screens' DOM, entity links and data states) are recorded at the top of
[`tasks/TASK_C_STATION_INSTRUMENTS_CHART.md`](./tasks/TASK_C_STATION_INSTRUMENTS_CHART.md) and
[`tasks/TASK_D_MODES_READING_SWEEP_PROOF.md`](./tasks/TASK_D_MODES_READING_SWEEP_PROOF.md).

## 12. Banned CSS on migrated screens

Any of these in a migrated screen fails review on sight:

| Property / pattern | Only permitted use |
|---|---|
| `background`, `background-color` on any element | none (the screen is transparent; the scrim is `.k-screen::before`) |
| `border` | `border-top`/`border-bottom` hairlines on rows, tables, inputs, `.k-rule` |
| `border-radius` > 0 | none |
| `box-shadow` | `inset 2px 0 0 var(--k-signal)` on the selected row only |
| `text-shadow`, `filter`, `backdrop-filter`, `mix-blend-mode` | none |
| `linear-gradient`, `radial-gradient`, `conic-gradient` | none |
| `letter-spacing` > 0, `text-transform: uppercase` | `.k-caps` column headers only |
| `font-family` other than the two tokens | none |
| a `font-size` not on the scale | none |
| a colour not in the tokens | none |
| `@keyframes`, `animation`, `transition` over 400 ms | the Power Rail's cooldown sweep only |
| `opacity` < 1 as a resting style on text | none — resting strength is a colour token (62 % / 38 %), not opacity |
| `position: absolute` centring (`left: 50%; transform: translateX(-50%)`) | the HUD reticle and the receipts lane only |
| an `<img>` or icon in a menu | none — menus are words |
| a panel, card, plate, chip, badge or pill element | none |
| a `<style>` element injected by a screen | none — except the chart, the range and the tech tree, whose canvas layout rules may stay in their one block, kit tokens only, every other row of this table obeyed |

## 13. Capture and review protocol

The owner does not review stylesheets. Every task ends with captures the reviewer judges against
the sheet's §9 checklist, and a receipt.

1. Captures go to `.devshots/frontend/<TASK>/<screen>-<state>-<width>.png` for widths 1280, 1920,
   2560 (the folder is git-ignored; the reviewer works on the same machine), produced by
   `node scripts/capture-ui-matrix.mjs --world --out=.devshots/frontend/<TASK>` plus the task's
   named extras. Temporal moments go to `.devshots/frontend/<TASK>/<moment>-<width>.webm`
   (Playwright `recordVideo`).
2. The hull, berth, chart or arena the sheet puts in the shot **must be visible** in the capture.
   Kit screens set `data-k-ready="1"` on their root when their 3D mount has drawn its first frame
   (or in `onShow` when they have no mount); `--world` waits for it. A capture with the DOM right
   and the world missing is a capture defect: fix the capture path before capturing again. Never
   paint a background to pass.
3. The receipt `design/program/roadmap/receipts/FRONTEND-<TASK>-REPORT.md` lists, per screen: the
   sheet line quoted, the capture paths, the checks run with their results, the old CSS deleted
   (file and line range), the structural hooks kept, and anything unproven.
4. The reviewer answers sheet §9 per capture and returns a punch list or accepts. Nothing is
   accepted from a description.
