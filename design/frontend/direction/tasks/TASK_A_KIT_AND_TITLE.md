<!-- LIFETIME: ACTIVE_PACKET -->
# Task A — The kit and the title (queue: `PQ-187.02`, `PQ-187.03`)

**Read first:** [`../DIRECTION_SHEET.md`](../DIRECTION_SHEET.md) (all of it), then
[`../KIT_SPEC.md`](../KIT_SPEC.md) (all of it). This file tells you the order of work, the exact
files, the title screen's geometry, the checks and the handoff. It does not repeat the spec; where
it says "per spec §N" you copy from there.

**Outcome in one sentence:** the kit exists exactly as specified and the title screen is live on
the default route in the new look — boot the game and see the starter hull in its hangar filling
the frame, the game's name enormous top-left, a column of words down the left edge, the version in
fine print — with the old title CSS deleted and the capture path able to photograph it.

Nothing else is restyled under this task. Tasks B, C and D start only after this task is accepted.

---

## 0. Before the first edit

1. `git status --short` and `node scripts/check-now-liveness.mjs`. Do not touch a file a live
   `design/program/NOW.md` row names. Add your own row before your first mutation, naming the
   exact files below.
2. `npm run check:baseline` at the candidate base; note any entry red in the receipt.
3. Confirm the facts this task relies on (they were audited 2026-09-06; if one is no longer true,
   record that and adapt — do not stop):
   - `src/ui/screenManager.js` builds each screen root as `div.screen[data-screen=id]` inside
     `#screens` (z-index 100) and calls the screen object's `mount(el, ctx)`, `onShow(ctx)`,
     `refresh(ctx)`, `onHide()`, `dispose()` (lines ≈ 179–211, 315–398). There is no base class.
   - `#screens` carries the opaque title still (`styles/ui.css` ≈ 180–198,
     `assets/cinematics/C-INTRO-01.jpg` + a two-gradient `::before` scrim); `body.sf-in-run`
     clears it in a run (`ui.css` ≈ 209–221) but never at the menu (`src/ui/uiRoot.js` ≈ 609).
   - The main menu (`src/ui/screens/mainMenu.js`, export `mainMenuScreen`, id `mainMenu`) adds
     `panel sf-menu sf-menu-narrow sf-menu--bare` to its root and builds `h1.sf-title-logo`,
     `div.sf-title-tag`, `div.sf-menu-save-summary`, and `div.sf-col` of `button.sf-btn`
     (lines ≈ 209–286); its style block is `STYLE_ID = 'sf-main-menu-style'` (≈ 12, 49–77); its
     title rules live in `styles/menu.css` (`.sf-menu--bare` ≈ 108–121, `.sf-menu-save-summary`
     ≈ 573–591, `.sf-title-logo` ≈ 592–612, `.sf-title-tag` ≈ 613–639).
   - `src/ui/shipPreviewMount.js` exports `createShipPreviewMount(canvas, opts)` (≈ 420) — it
     takes a **canvas**, owns its own WebGL renderer, lights and camera, and returns
     `{ show, setRotating, setYaw, rotateBy, setZoom, zoomBy, setDockId, setActive, resize, frame,
     dispose, getDefId, … }`; `dockInteriorIdForArchetype` (≈ 48) gives the hangar backdrop id;
     `show(defId, { rotating, fittings, isPlayer })` (≈ 891); auto-rotate advances `yaw += 0.012`
     per frame (≈ 717), which is far too fast for the title — you drive the yaw yourself.
   - The starter is one ship: `src/data/newGameDefaults.js` `shipId: 'ship_kestrel'` ("Hitch"),
     `fittedModules` at ≈ 24–29.
   - `scripts/capture-ui-matrix.mjs` launches Chromium with no GPU flags (≈ 396), hides
     `#gl-canvas` and the `#screens` image on purpose (`applyNeutralGround`, ≈ 1891) so regression
     frames are comparable, and reaches the game by clicking
     `[data-screen="mainMenu"] .sf-col > button` (≈ 2258) then
     `[data-screen="newGame"] .sf-ng-footer button` (≈ 2272). `scripts/capture-screen-atlas.mjs`
     (≈ 95) is the one script that launches with `--use-gl=angle --ignore-gpu-blocklist`.
   - Reduced motion is `html.sf-reduce-motion` (`styles/accessibility.css` ≈ 145) plus the media
     query; the game's own flag is `state.settings.video.motionReduce`.

## 1. The order of work

Commit and push after each numbered step (pathspec-limited: `git commit -- <files>`; `git add -N`
new files first; `git fetch origin master` before every push).

### Step 1 — the display face (spec §2)

Run the vendoring commands in spec §2.1 exactly. Append the `@font-face` block in spec §2.2 to
`styles/fonts.css`. Verify the axes print as `['opsz', 'wdth', 'wght']`. Commit
`styles/fonts/bricolage-grotesque-var.woff2`, `styles/fonts/OFL-BricolageGrotesque.txt`,
`styles/fonts.css`. Do not delete any existing font yet (Task D does).

### Step 2 — `styles/kit.css` (spec §3–§7, §12)

Create it with the tokens, temperature block, type classes, layout, components and motion classes
from the spec, verbatim, in that order. Then add these three kit-only rules at the end (they are
part of the kit, not of any screen):

```css
/* A kit screen replaces the legacy screen ground and the screen manager's fade. */
.screen.k-screen { transition: none; transform: none; }
.screen.k-screen.sf-screen--exiting { opacity: 0; transition: opacity var(--k-d-settle) var(--k-ease); }
body.k-screen-top #screens { background-image: none !important; background-color: transparent !important; }
body.k-screen-top #screens::before { display: none !important; }
```

Link it in `index.html` as the **last** stylesheet `<link>` (after `styles/accessibility.css`).
Verify in the browser console: `getComputedStyle(document.documentElement).getPropertyValue('--k-fs-name')`
returns a px value.

### Step 3 — `src/ui/kit/` (spec §5, §7, §8, §11)

Create `motion.js`, `temperature.js`, `sound.js`, `dom.js`, `index.js` from the spec. The seams
(reduced-motion class, the audio context and mute field, the temperature events and state fields)
are named in spec §11 — use exactly those names. `dom.js` exports:

```js
export function el(tag, className, text)            // createElement + className + textContent
export function words(items, { row = false, onPick })  // <ul class="k-words"> (k-words--row when row) of <li><button class="k-word" data-action>; ArrowUp/Down (Left/Right when row)/Home/End roving focus; cue('move') on keyboard moves, cue('confirm') on pick, cue('deny') on a disabled word — exactly spec §6.5
export function rows(items, { cols, onPick })       // <ul class="k-rows"> of .k-row with .k-row__name / .k-row__num / .k-row__sub cells
export function table({ head, body, onPick })       // .k-table-wrap > table.k-table with .k-caps headers, .k-name / .k-num cells, aria-selected
export function hero(n, w, { size = 'num', signal = false })  // .k-hero with .k-hero__n (k-display) and .k-hero__w
export function title(text, sub)                    // header.k-title > h1.k-display.k-t-title + p.k-t-emph.k-62
```

The reachability check refuses a module nothing imports: `index.js` re-exports all four, and the
title screen (Step 7) imports from `../kit/index.js`, so every module has a consumer.

### Step 4 — the screen manager knows a kit screen (one edit)

In `src/ui/screenManager.js` `syncVisibility()` (≈ 213–267): where the visible screen's display
value is written inline (≈ 221, `'flex'`), make it `el.classList.contains('k-screen') ? 'grid' : 'flex'`
(inline `flex` would override the kit grid); then, after the top-of-stack element is resolved, add:

```js
document.body.classList.toggle('k-screen-top', !!topEl && topEl.classList.contains('k-screen'));
```

(`topEl` being whatever local holds the visible root — read the function; do not rename anything.)
This is what removes the legacy still and gradient for kit screens without touching non-migrated
screens. Nothing else in the screen manager changes.

### Step 5 — the kit page and its capture (spec §10)

Create `_kitlab.html` at the repo root (a dev harness like `_uilab.html`; no game code). It links
`/styles/ui.css`, `/styles/fonts.css`, `/styles/kit.css` and nothing else, sets
`<html data-k-temp="menu">` and a `body` background of `var(--k-ink)`, and renders in one
`section.k-screen` every component in spec §10 with these real strings: station "Helios Prime",
commodities "Ore, refined 4,750 / 4,310 / 120", "Water ice 310 / 288 / 1,240", "Hull plate 2,100 /
1,905 / 36" (and nine more rows of your choosing from `src/data/`), the hull name "Hitch", a
faction crest copied as inline SVG from `src/ui/station/icons.js`, the ten type sizes each labelled
with its token name, and a row of the six temperature values as swatches. Include a second
`section.k-screen.k-screen--split.k-screen--dense` below the first showing the dense register with
the selected row's price repeated at hero size in the stage.

Create `scripts/capture-kit.mjs`:

```js
// Captures _kitlab.html at the three declared widths → .devshots/frontend/A/kit-<w>.png
import { loadPlaywright } from './lib/load-playwright.mjs';
import { mkdirSync } from 'node:fs';
import { createGameServer } from './lib/gameServer.cjs';   // if the export is not usable from ESM, copy the 30-line static server from scripts/probe-frontend-snapshot.mjs instead
const WIDTHS = [[1280, 720], [1920, 1080], [2560, 1080]];
const OUT = '.devshots/frontend/A';
mkdirSync(OUT, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();                       // serve the repo root on a free port, like probe-frontend-snapshot.mjs:45
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--mute-audio'] });
for (const [w, h] of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await page.goto(`${server.url}/_kitlab.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/kit-${w}.png`, fullPage: true });
  await page.close();
}
await browser.close(); await server.close();
```

Add `"capture:kit": "node scripts/capture-kit.mjs"` to `package.json` scripts. Run it; open the
three PNGs yourself and check them against spec §12 before going on. Bricolage must visibly be the
display face (the distinctive `a`, `g` and `R`); if the fallback face rendered, the font path or
the `@font-face` block is wrong — fix it before continuing.

### Step 6 — the capture seam (the hull must be in the photograph)

Today's headless matrix captures show THE SHIP's sockets with no hull because (a) Chromium runs on
software GL with no flags and (b) the capture does not wait for the preview mount's first frame.
Fix both, additively, in `scripts/capture-ui-matrix.mjs`:

1. Add a `--world` flag: when set, launch with
   `args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--mute-audio']`, **skip**
   `applyNeutralGround`, and after each surface opens wait
   `await page.waitForFunction(() => { const r = document.querySelector('.k-screen[data-screen]'); return !r || r.dataset.kReady === '1'; }, null, { timeout: 15000 })`
   before the screenshot — **wrapped in try/catch**: on timeout, continue with the run and write
   `hull absent: <surface>` into the run's log and the receipt; never let one surface abort the
   matrix. Kit screens that host a 3D mount set `data-k-ready="1"` in the mount's `onFirstFrame`;
   kit screens without a mount set it in `onShow`.
2. Add `--out=<dir>` (default unchanged) so review captures go to `.devshots/frontend/<TASK>/`.
3. Change the boot's New Game selector (≈ 2258) to `[data-screen="mainMenu"] [data-action="newGame"]`
   and keep the Launch selector as it is. The title (Step 7) puts `data-action` on every word.
4. Do the same selector change wherever else it appears (`grep -rn "sf-col > button" scripts test`).

Without `--world` the script behaves exactly as before (the regression baseline stays valid).
Record in the receipt the exact command that produced a capture with the hull visible.

### Step 7 — the title screen, live

Rewrite `src/ui/screens/mainMenu.js` on the kit. Keep: the export name `mainMenuScreen`, id
`mainMenu`, `coreText` labels, the Continue logic (`readSaveIndex`, `latestSave`, the disabled
states including the shared-store sync check, the black veil `_showContinueFade`), `requestQuit`,
`requestCodexTab('Archive')`, the `IS_DEV` Sandbox entry, and `pushWhenReady`. Delete: the
injected style block and `STYLE_ID`, the `panel sf-menu sf-menu-narrow sf-menu--bare` classes, the
stamp dataset, the attract-mode code (`ATTRACT_IDLE_MS`, `_startIdleAttract`, `_setAttractDrift`
— the camera hook it calls does not exist), the `.sf-col` stagger.

**Markup** (build with `dom.js`; every `data-action` is required):

```html
<div class="screen k-screen k-screen--stage" data-screen="mainMenu" data-k-ready="0">   <!-- the root the manager hands to mount(el): add the classes to it; the children go inside -->
  <canvas class="k-world" aria-hidden="true"></canvas>                 <!-- the hull in its hangar -->
  <header class="k-title">
    <h1 class="k-display k-t-name">SpaceFace</h1>
    <p class="k-t-emph k-62">Contract 47-A remains open</p>             <!-- coreText if a key exists; else this literal -->
  </header>
  <div class="k-stage">
    <ul class="k-words" role="menu">
      <li><button class="k-word" data-action="continue" aria-current="true">Continue</button>
          <div class="k-word-sub">Helios Prime · Hitch · 2 h 14 m · 5,000 CR</div></li>   <!-- the save summary; "No saves yet" when none -->
      <li><button class="k-word" data-action="newGame">New game</button></li>
      <li><button class="k-word" data-action="load">Load</button></li>
      <li><button class="k-word" data-action="crucible">Crucible</button></li>
      <li><button class="k-word" data-action="archive">Archive</button></li>
      <li><button class="k-word" data-action="settings">Settings</button></li>
      <li><button class="k-word k-38" data-action="sandbox">Sandbox</button></li>            <!-- IS_DEV only -->
      <li><button class="k-word k-word--danger" data-action="quit">Quit</button></li>
    </ul>
  </div>
  <div class="k-fine" data-role="version">SpaceFace v0.0.0</div>
</div>
```

Add to `kit.css` (kit component, not screen CSS):

```css
.k-word-sub { font-size: var(--k-fs-data); color: var(--k-bone-38); margin-top: calc(-6px * var(--k-s)); }
.k-world { position: absolute; top: 0; left: -9vw; width: 150vw; height: 100%; z-index: -2; display: block; }
```

**Geometry at 1920×1080** (everything scales with `--k-s`):

| Element | Position | Size / style |
|---|---|---|
| hull | centred at x ≈ 1270 (66 % of the width), y ≈ 540; fills ≈ 55 % of the frame height | `k-world` canvas 150 vw wide shifted −9 vw so the mount's centred hull lands right of centre; `setZoom(1.25)` |
| name | top-left at (96, 96) | `k-t-name` 160 px Bricolage 800, "SpaceFace" |
| tagline | under the name, 16 px gap | `k-t-emph` 62 % |
| words | x = 96, first word 64 px under the tagline (≈ y 350) | `k-t-menu` 40 px, 16 px gaps; Continue's sub line 14 px 38 % |
| version | (96, 1040) | `k-fine` 12 px 38 % |
| scrim | none | the kit derives `flight` for `mainMenu` (spec §5): 0 % on the title; the screen sets nothing |

**The hull.** In `mount(el, ctx)`: create the canvas, then
`this.mount3d = createShipPreviewMount(canvas, { dockId: dockInteriorIdForArchetype(<the starter's archetype glb — read how shipworks.js derives it, ≈ 758–773>), authoredShips: true, authoredWarmup: true, fastPreview: false, allowFastFallback: false, onFirstFrame: () => { el.dataset.kReady = '1'; this._arrive(); } })`.
In `onShow`: `this.mount3d.setActive(true); this.mount3d.show('ship_kestrel', { rotating: false, fittings: NEW_GAME.fittedModules, isPlayer: true }); this.mount3d.setZoom(1.25);`
then start your own `requestAnimationFrame` loop that calls `this.mount3d.rotateBy(dt * 0.06)`
(≈ 3.4° per second) and stops in `onHide`; skip the loop when `reducedMotion()` or
`ctx.state.settings.video.motionReduce` is true. Call `this.mount3d.resize()` on window resize.
`dispose()` disposes the mount. If `createShipPreviewMount` throws (no WebGL), catch it, leave
`data-k-ready="0"`, and log once — the words still render.

**Arrival (sheet: "the menu arrives after the hull").** `_arrive()` runs once per show: `settle`
the title block from `top`; then `stamp` the `li` elements of the words list with `gap: 60`
(state `'title:arrive'`). If the mount's first frame has already fired when `onShow` runs, call
`_arrive()` from `onShow` directly. Under reduced motion everything appears at once.

**Version.** In `onShow`, `fetch('/package.json').then(r => r.json()).then(p => versionEl.textContent = \`SpaceFace v${p.version}\`)`
with a catch that leaves the text as `SpaceFace`. The server serves the repo root, so the file is
reachable in the browser and in Electron.

**Temperature.** Nothing to do: the kit derives `flight` for `mainMenu` (spec §5); a screen never
sets it.

**Focus and keys.** The words list uses `dom.words()` so ArrowUp/Down/Home/End move focus and play
`move`; Enter/Space activate and play `confirm`. The first show focuses Continue when enabled,
otherwise New game. Keep `data.ariaLabel`.

**Delete** from `styles/menu.css`: the `.sf-menu--bare` block, `.sf-menu-save-summary`,
`.sf-title-logo`, `.sf-title-tag` (grep each class across `src/ styles/ scripts/ test/` first; if
another live screen still uses one, leave that one and say so in the receipt). Delete the injected
block from `mainMenu.js`. Do not touch `.sf-btn`, `.sf-col`, `.panel` or anything another screen
uses.

**Checks that must stay green:** `npm run check:title-continue-runtime` (read
`scripts/check-title-continue-runtime.mjs` first and keep the elements it queries — if it queries
`.sf-menu-save-summary` or the Continue button by class, give the new elements those classes as
inert hooks rather than changing the script), `npm run check:ui-a11y`, `npm run check:responsive`,
`node scripts/check-ui-screen-imports.mjs`, `npm run check:baseline`, and the matrix boot
(`node scripts/capture-ui-matrix.mjs --world --out=.devshots/frontend/A` must get past the title
into the game).

### Step 8 — captures, receipt, handoff (spec §13)

1. `npm run capture:kit` → `.devshots/frontend/A/kit-{1280,1920,2560}.png`.
2. `node scripts/capture-ui-matrix.mjs --world --out=.devshots/frontend/A` — from its output keep
   `mainMenu-default-{1280x720,1920x1080,2560x1080}.png` and `mainMenu-reduced-motion-1920x1080.png`;
   the hull must be visible in all four.
3. A ten-second boot clip: `.devshots/frontend/A/title-arrive-1920.webm` (Playwright
   `recordVideo` on a 1920×1080 context, from `page.goto` to two seconds after the words arrive).
4. Write `design/program/roadmap/receipts/FRONTEND-A-REPORT.md` with, in order: the sheet's title
   line quoted; the capture paths; each check with its result; the exact `--world` command; what
   was deleted (file and line ranges); the fonts' axes printout; anything unproven. Then update
   `design/program/roadmap/program-queue.json` units `PQ-187.02` and `PQ-187.03` `state` to
   `"implemented"` with a one-line brief prefix `IMPLEMENTED <date>:` (the reviewer promotes to
   done), commit, push, remove your `NOW.md` row, and report in plain words what the owner will see
   when they boot the game.

## 2. How agents get this wrong on this task

- Vendoring the static 600 or a single instance instead of the variable face; skipping the axes
  check.
- Writing the title's own CSS instead of using the kit's classes; leaving the injected style block
  "for now".
- Keeping `panel` / `sf-menu` on the root (it paints a plate) or leaving the `#screens` still
  behind the title.
- Letting the mount auto-rotate (0.012 rad per frame is a spin, not a drift).
- Painting a background, a gradient or a vignette to make the words legible. If the words are hard
  to read over the hangar, the hull is too bright or too close — adjust `setZoom` and the canvas
  offset, never the text.
- Adding an icon, a logo lockup, a tagline in caps, a button border, a hover glow.
- Capturing without `--world` and calling the hull "present".
- Breaking the matrix boot by renaming `data-screen="mainMenu"` or dropping `data-action`.
- Asking the owner anything. The sheet and the spec decide; the nearest value on the scale wins
  when they are silent; write the choice down.

## 3. Definition of done

- Fonts: the variable Bricolage is vendored, licensed, declared and visibly rendering.
- Kit: `styles/kit.css`, `src/ui/kit/*`, the screen-manager body class, `_kitlab.html`,
  `capture:kit` exist as specified; the kit page captures at three widths pass spec §12 on sight.
- Capture seam: `capture-ui-matrix.mjs --world` photographs the hull on the title.
- Title: live on the default route; matches the sheet's title line and the geometry table at
  three widths; arrival and reduced-motion behave as specified; old CSS deleted; all named checks
  green; `check:baseline` green.
- Receipt written; queue units marked implemented; pushed.
