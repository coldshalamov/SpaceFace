<!-- LIFETIME: ACTIVE_PACKET -->
# Task B — The shell and the flight HUD (queue: `PQ-181.00`–`.03`, `PQ-188.00`)

**Read first:** [`../DIRECTION_SHEET.md`](../DIRECTION_SHEET.md) (all of it; your screens are under
"The shell" and "Flight" in §2), then [`../KIT_SPEC.md`](../KIT_SPEC.md) (all of it; §11.1–§11.7
are the seams you touch). Task A must be accepted before you start: `styles/kit.css`,
`src/ui/kit/`, the kit page and the title in the new look must be on master. You add nothing to
the kit; if a component seems missing, use the nearest one and write the choice in the receipt.

**Outcome in one sentence:** every screen the player meets outside the world — new game, load,
settings, pause, game over, credits — is in the new look over the live world, and the flight HUD
speaks in the kit's faces and sizes with its two signature moments: the instruments arriving one by
one on undock, and the whole frame going cold when the player is wanted.

Files you own: `src/ui/screens/newGame.js`, `saveLoad.js`, `settings.js`, `pause.js`,
`gameOver.js`, a new `src/ui/screens/credits.js`, the shell rules in `styles/menu.css` you delete,
`src/ui/hud.js`, `src/ui/uiRoot.js` (the `injectHudCss` block, the undock hook, the arrival call),
`src/ui/powerRail.js` (class names only if needed), `src/ui/toasts.js`, `src/ui/alerts.js`,
`src/ui/targetPanel.js` (CSS-facing markup only), `src/data/audioRecipes.js` (the wanted recipe
only). Tasks C and D touch other files; do not enter theirs.

---

## 0. Before the first edit

1. `git status --short`, `node scripts/check-now-liveness.mjs`, add your `NOW.md` row naming the
   files above. `npm run check:baseline` at the candidate base.
   Tasks B, C and D edit `styles/kit.css` and `src/ui/kit/temperature.js` in parallel: append your
   permitted rules under a `/* Task B additions */` comment at the end of `kit.css`, keep
   `temperature.js` edits to the lines this file names, and `git pull --rebase origin master` before
   every push.
2. Confirm the facts this task relies on (audited 2026-09-06):
   - Every shell screen is a duck-typed object (`id`, `mount(el, ctx)`, `onShow`, `refresh`,
     `onHide`, `dispose`); each adds `panel sf-menu …` to its root and injects a style block
     (`newGame.js` ≈ 226, `saveLoad.js` ≈ 325, `settings.js` ≈ 16, `pause.js` ≈ 356,
     `gameOver.js` ≈ 7). The shared chrome is `styles/menu.css`.
   - New game (`newGame.js`): **one** starter, `ship_kestrel` "Hitch"; four difficulties
     (`DIFFICULTIES` ≈ 13–18: casual, standard, veteran, ironman; default standard); pilot name
     input `#sf-ng-pilot-name` (default "Wren", max 20); seed `#sf-ng-seed`; optional New Run+
     section; loadout rows from `starterLoadoutRows()`; Launch emits `game:new`; a first-run
     splash `.sf-firstrun-splash` (z 3200). Checks: `check:new-game-first-run`,
     `check:new-game-layout` (**headed by default**; `:ci` variant is headless) and
     `check:electron:new-game`. Read `scripts/check-new-game-layout.mjs` and
     `scripts/check-new-game-layout-contract.mjs` before touching the DOM: keep every id and class
     they query (`.sf-ng-header`, `.sf-ng-body`, `.sf-ng-footer`, `.sf-ng-shell`, the `#sf-ng-*`
     ids) as inert hooks on the new elements.
   - Load (`saveLoad.js`): slot ids `quick`, `autosave`, `1..N`; each row shows sector, ship,
     objective, playtime, credits, saved-at; confirmations must repeat that context
     (`check:save-load-slot-trust` asserts source text); Export/Import/Back in the footer.
   - Settings (`settings.js`): tabs Audio · Video · Gameplay · Access · Controls; row factories
     `rowSlider` (range + value), `rowToggle` (On/Off with `aria-pressed`), `rowSelect`; the
     Controls tab has the rebind capture (`.sf-bind-btn--capture`) and gamepad settings; the only
     screen with arrow-key roving on its tab bar (≈ 219–228). Check: `check:settings-profile`
     (headless, no browser).
   - Pause (`pause.js`): the flight brief (`.sf-pause-brief`, `aria-live`, kicker
     `coreText('flightBrief')`, objective, next step, save line — `check:pause-brief` asserts the
     kicker text) then Resume (primary), Settings, Save, Load (confirm), Mission Log, My Ship,
     Operations, Review map (conditional), Help, Codex, Sandbox (dev), Main Menu (confirm), Quit
     (confirm); `onShow` sets `state.mode = 'paused'`.
   - Game over (`gameOver.js`): `data.locked: true`; "Ship Lost"; seven k/v pairs — cause,
     lifespan ("Final sortie"), damage ("Final damage"), dock ("Recovery dock"), cost ("Recovery
     cost"), cargo ("Cargo consequence"), insurance ("Coverage") — then recovery text and the
     buttons "Continue from recovery berth", "Load save", "New Game", "Main Menu / Load".
     `check:gameover-recovery-copy` asserts the strings `This is Ironman mode:`, `Casual, Standard,
     and Veteran deaths use insurance respawn` and `Main Menu / Load` exist in the source. There is
     no "telegraph" field.
   - No credits, statistics or photo-mode screen exists. No version string exists (Task A added
     the fine-print version on the title).
   - The HUD: `src/ui/hud.js` builds into `#hud`; its CSS is `injectHudCss()` in `uiRoot.js`
     (≈ 1383–2600, tokens at ≈ 1959–1974, `#hud` font-size at ≈ 1389); anchors and classes are
     listed in spec §11.4; the arrival hook is `uiRoot.js` ≈ 1142 (`hud.forceRefresh()` on the
     first visible frame); wanted is `heat:changed { wanted, wantedCrossed }` and the persistent
     `#alerts` pill (`hud.js` ≈ 3249–3268); the receipts lane is `#toasts.sf-receipts` with a
     computed rectangle (do not move it); checks are `check:hud-j07`, `check:one-voice`,
     `check:ui-identity`, `check:ui-a11y`, `check:wcag-contrast`, `check:player-facing-labels`,
     `check:ui:perf`, `check:ui:budgets`; the binding rules are `design/HUD_FLIGHT_ATTENTION.md` §2.

## 1. The shell screens

Every screen below follows the same mechanics: in `mount`, add the kit classes to the root the
manager hands you (never `panel`/`sf-menu`/`sf-menu-*`), build the DOM with `dom.js`, delete the
injected style block and its `STYLE_ID`, keep the ids and classes the checks query as inert hooks;
in `onShow`, `cue('open')`, settle the regions (spec §7), set `data-k-ready="1"`; in `onHide`,
`cue('close')`. The temperature is derived by the kit (`menu` for all of these). Commit and push
per screen.

### 1.1 New game — `k-screen` (default grid)

Sheet (amended for the one-starter reality): *the sky; the starter hull lit in its rig on the
stage; its name and one sentence saying how it plays; the difficulty as four words in a row with
the live one bright and its sentence beneath; the pilot's name as an underlined field; the seed in
fine print; New Run+ as a two-word toggle when available; the loadout as four words at 62 %;
Launch as the one primary word.*

| Region | Content |
|---|---|
| `.k-title` | `h1.k-display.k-t-title` "New game"; `p.k-t-emph.k-62` "One hull, one contract, the whole sky." |
| `.k-hang` (the form; structural hooks `.sf-ng-header`/`.sf-ng-body`/`.sf-ng-footer` kept as extra classes on title/hang/foot) | rows with hairlines, each a label at `.k-t-body.k-62` and its control: **Pilot** — `input.k-input#sf-ng-pilot-name`; **Difficulty** — `k-words--row` of four `k-word--body` (`data-action="difficulty:casual"` …) with `aria-pressed` on the live one, and beneath the row one `p.k-sentence` that shows the live difficulty's sentence (the four sentences from `DIFFICULTIES`); keep a hidden `<select id="sf-ng-difficulty">` in sync for the checks; **Seed** — `input.k-input#sf-ng-seed` at `.k-t-fine` with a `k-word--fine` "New seed"; **New Run+** (when the section renders today) — a toggle `Off · On` plus the keepsake as `k-select`; **Loadout** — four `k-word--body` static words at 62 % (the module names) with `aria-disabled` (not buttons the player can press) |
| `.k-stage` | the hull: a `canvas.k-world`-style mount but bounded to the stage (`position:absolute; inset:0` inside `.k-stage`, not the 150 vw trick) using `createShipPreviewMount` with the starter's dock interior, `setZoom(1.1)`, the same slow yaw as the title; under it (bottom-left of the stage) `h2.k-display.k-t-sub` "Hitch" and `p.k-sentence` "Turns wide. Sluggish under load. Stops badly." (the hull's blurb — read it from the same source the title/ship screens use, `hullBlurb` or the ship def's `tagline`; if none exists, use this literal) |
| `.k-foot` | `button.k-word.k-word--emph.k-word--primary` "Launch" (`data-action="launch"`, class `sf-ng-launch` kept as hook), `button.k-word.k-word--emph` "Back" |
| `.k-fine` | "Casual, Standard and Veteran deaths use insurance respawn. Ironman ends the run." (keep the copy the check asserts, in sentence case, in this fine line) |

Delete the static preview image (`.sf-ng-preview__still`) and its rules; delete the "First
Minutes" four-step grid unless `check:new-game-first-run` asserts it — if it does, render its four
steps as four `k-row--static` rows under the loadout. The first-run splash stays as it is (it is a
cinematic, not a screen). Keep the duplicate-launch guard the screen-imports check asserts.

### 1.2 Load — `k-screen` (default grid)

Sheet (amended): *saves as portraits — the focused save's hull on the stage as it is in that save,
its name huge, the sector and date in fine print, the credits as a hero number; the saves as
hairline rows down the left.*

| Region | Content |
|---|---|
| `.k-title` | "Load"; sub: the count, e.g. "Four saves · last flown yesterday" |
| `.k-hang` | `k-rows`: one `.k-row` per slot (`--k-row-cols: minmax(0,1fr) auto`): `.k-row__name` = the slot's label (Quick save, Autosave, Slot 1 …), `.k-row__sub` = `sectorName · shipName · playtime`, `.k-row__num` = credits; empty slot: name at 38 % "Empty", no number; keep `.sf-slot`, `.sf-slot-name` as hook classes on the row and name |
| `.k-stage` | the focused save's ship: the same bounded mount as new game, `show(meta.shipId …)` when the row focus changes (if a save has no ship id, show the starter); `h2.k-display.k-t-title` = the ship's name; `p.k-sentence--emph` = the objective summary; a `.k-hero.k-hero--hero` = credits with word "credits"; fine line = `sectorName · savedAt · playtime`; then the words `Load` (primary), `Save here` (when a run is live), `Delete` (`k-word--danger`), each with the existing confirm dialogs whose bodies still repeat sector, ship, objective, playtime, credits and saved-at (`check:save-load-slot-trust`) |
| `.k-foot` | `Export`, `Import` (the hidden file input stays), `Back` as `k-word--emph` |

Focus follows the row list (`dom.rows` with roving keys); the stage updates on focus, not only on
click. Reduced motion: no yaw.

### 1.3 Settings — `k-screen` (default grid)

Sheet: *the world behind at the menu scrim; a left column of section words; the chosen section's
controls as rows with hairlines, each a label and its value; toggles are two words; nothing is a
slider unless it is a number.*

| Region | Content |
|---|---|
| `.k-title` | "Settings"; sub: one sentence naming the live profile ("Saved with your profile.") |
| `.k-hang` | `k-words` of the five section words (`data-action="tab:Audio"` …), `aria-current` on the live one, `.sf-tab`/`.sf-tabbar` hooks kept; the arrow-key roving comes from `dom.words` (remove the screen's own handler) |
| `.k-stage` | the pane: `k-rows` of `k-row--static` rows, `--k-row-cols: minmax(0,1fr) auto`, the label at `.k-t-body.k-62`, the control on the right: `rowSlider` → `input.k-range` + the value at `.k-t-emph` tabular; `rowToggle` → a two-word toggle (`Off`, `On`) with `aria-pressed`; `rowSelect` → `select.k-select`; the Controls tab's rebind rows → the action label left, the key as a `k-word--body` right that enters capture on press (keep `.sf-bind-btn`, `--capture`, `--digit` as hooks); gamepad and fixed-shortcut sections as `k-caps` headers within the rows |
| `.k-foot` | `Back` |

Keep the persistence path untouched (`sf.settings.profile.v1`; `check:settings-profile` is
headless and reads code paths, not DOM). Delete the `.sf-tabbar`, `.sf-settings-pane`, `.sf-row`,
`.sf-ctl` rules this screen used once no other screen references them (grep first; the help and
codex screens use `.sf-tabbar` until Task D migrates them — leave the rule in `menu.css` if they
still do, and note it).

### 1.4 Pause — `k-screen--stage`

Sheet (amended): *the world held, not hidden — the frozen game at 0 % scrim; "Paused" at
screen-title size top-left; the flight brief as one sentence beneath it; the actions as a column
of words down the left edge; the HUD dims to 38 % rather than disappearing.*

| Region | Content |
|---|---|
| `.k-title` | `h1.k-display.k-t-title` "Paused"; then the brief: `div.sf-pause-brief[aria-live=polite]` (hook kept) containing `span.k-caps.sf-slot-sub` = `coreText('flightBrief')` (the check asserts this text), `p.k-sentence--emph.sf-slot-name` = the objective, `p.k-sentence.sf-muted` = the next step, `p.k-t-fine.k-38.sf-slot-sub` = the save line |
| `.k-stage` | `k-words` (menu size) in the existing order — Resume (primary, focused), Settings, Save, Load, Mission log, My ship, Operations, Review map (conditional), Help, Codex, Sandbox (dev, `k-38`), Main menu (`k-word--danger`), Quit (`k-word--danger`); every confirm dialog and `pauseExitConfirmBody` stays |
| `.k-fine` | "Esc resumes" — only if `check-ui-screen-imports` allows the literal; otherwise the binding label from `bindings.js` |

Pause forces the scrim off: the kit derives `menu` for a screen over flight, but the sheet gives the
pause 0 %. Add `pause` to the kit's exception list the same way `mainMenu` is
(`deriveTemperature`: `if (top === 'mainMenu' || top === 'pause') return 'flight'`) — that is a
one-line kit edit permitted by this task; record it. The HUD stays visible under the pause at
38 %: replace `body.ui-modal-open #hud { opacity: 0 }` for the pause case with
`body.k-screen-top[data-k-screen="pause"] #hud { opacity: 0.38 }` — do this by setting
`document.body.dataset.kScreen` (the kit already does) and adding that one rule to `kit.css`
(permitted; record it). Under every other screen the HUD hides as before.

### 1.5 Game over — `k-screen--stage`

Sheet (amended for the real fields): *a still — the wreck or the last frame, cooled with the
wanted-blue scrim; what killed you at screen-title size; the final sortie and the final damage as
the second line; the recovery dock, recovery cost and cargo consequence as three hero blocks;
coverage as one sentence; the actions as words.*

| Region | Content |
|---|---|
| temperature | the kit derives `menu`; this screen is the one place a screen may deepen it: add `k-screen--cold` (a kit class you add to `kit.css` for this task: `.k-screen--cold::before { background: rgb(6 8 15 / 0.35); }`) |
| `.k-title` | `h1.k-display.k-t-title#sf-gameover-title` = the loss cause (e.g. "Hull breach under pulse fire"); `p.k-sentence--emph` = "Final sortie 14 min · final damage pulse laser" (the lifespan and damage pairs) |
| `.k-stage` | three `.k-hero` in a `k-words--row`-like flex row: recovery dock (word "recovery dock"), recovery cost (word "recovery cost"), cargo consequence (word "cargo"); then `p.k-sentence` = coverage; then the recovery text as `p.k-sentence` |
| `.k-foot` | `Continue from recovery berth` (primary, hook `.sf-go-retry`), `Load save`, `New game`, `Main Menu / Load` (this exact label survives because the check asserts it; render it in sentence case as the label text "Main menu / load" **only if** the check reads the source constant rather than the DOM — read `scripts/check-gameover-recovery-copy.mjs` and keep whichever the check needs) |

`data.locked` stays true. The Ironman/insurance copy the check asserts stays in the source as the
coverage sentence.

### 1.6 Credits — new screen `src/ui/screens/credits.js`, id `credits`, `k-screen`

Sheet: a reading screen. Register it in `uiRoot.js` `SCREEN_MODULES` beside `help`. Reached from
the title's fine line: change Task A's `.k-fine` to "SpaceFace v0.0.0 · " followed by a
`button.k-word.k-word--fine` "Credits" (`data-action="credits"`).

| Region | Content |
|---|---|
| `.k-title` | "Credits"; sub: "Who made SpaceFace and what it is built on." |
| `.k-hang` | `k-words` of section words: Made by · Type · Libraries · Fonts and licences · Third-party notices |
| `.k-stage` | the section as `k-rows` of `k-row--static` (name · role/licence): **Made by** — the owner's studio name from `package.json` `author` if present, else "SpaceFace"; **Type** — Bricolage Grotesque (Mathieu Triay, OFL 1.1), Instrument Sans (Instrument, OFL 1.1), Spline Sans Mono (OFL 1.1, Asteroid Works); **Libraries** — three.js (MIT), Rapier (Apache-2.0), @floating-ui/dom (MIT), and every other `dependencies` entry in `package.json` with its licence read from `node_modules/<pkg>/package.json` at build time by a small script `scripts/write-credits.mjs` that emits `src/data/credits.js` (commit the generated file; `npm run credits` regenerates it); **Third-party notices** — the full text of each licence, read from the same script, as a readable measure |
| `.k-foot` | `Back` |

This closes the third-party-notice obligation from `PQ-033.00`. Add `credits` to
`scripts/ui-grammar-surfaces.mjs` as a `nested('mainMenu', '[data-screen="mainMenu"] [data-action="credits"]', 'Credits', 'title → Credits')`
entry so the matrix captures it.

### 1.7 Photo mode (moment 12)

A minimal photo mode, from the pause word `Photo`: closes all screens, adds `body.k-photo`,
which `kit.css` uses to hide `#hud`, `#toasts` and `#alerts` (`body.k-photo #hud, body.k-photo
#toasts, body.k-photo #alerts { opacity: 0; pointer-events: none; }`) and shows one fine-print hint
bottom-left ("Esc to return", binding label from `bindings.js` if one exists) that fades out after
two seconds via `settle`'s reverse (`k-out`). Esc removes `body.k-photo` and re-opens the pause.
The sim stays paused while in photo mode only if the pause screen is still on the stack —
implement it as a pause **sub-state**: the pause screen root gets `hidden` while `body.k-photo` is
set, so the stack (and the sim pause) is unchanged; Esc unhides it. No camera change.

## 2. The flight HUD (`PQ-188.00`)

You restyle the HUD's injected CSS and add two moments. What the HUD does, where each instrument
sits, the receipts lane, the one voice, the Power Rail's contract and the attention rules do not
change. Work inside `injectHudCss()` (`uiRoot.js`) and the small blocks in `hud.js`.

### 2.1 Tokens and faces

Replace the HUD token block (≈ 1959–1974) with kit aliases:

```css
#hud { --hud-display: var(--k-display); --hud-body: var(--k-text); --hud-data: var(--k-text);
  --hud-paper: var(--k-text-live); --hud-muted: var(--k-bone-62); --hud-line: var(--k-hair);
  --hud-cyan: var(--k-text-live); --hud-amber: var(--k-signal); --hud-radius: 0;
  font-family: var(--k-text); font-size: var(--k-fs-data); color: var(--k-bone-62);
  font-variant-numeric: tabular-nums; }
```

and change `#hud { font-size: calc(15px * var(--ui-scale)) }` (≈ 1389) to the line above (keep
`--ui-scale` multiplying the kit scale if the setting must still work: `font-size: calc(var(--k-fs-data) * var(--ui-scale))`).
Then sweep the whole block: every `font-family` becomes one of the two tokens; every colour
becomes a kit token (`--hud-*` aliases or `--k-*`); every `border-radius` becomes 0; every
`background`, `box-shadow`, `text-shadow`, `backdrop-filter` and gradient is removed (the receipts
lane, the target panel `.sf-hudpanel`, the tether chips `.sf-tchip`, the alert pill `.sf-alert`,
the first-use hint `.sf-firstuse` all lose their plates and become text on the world); every
uppercase/tracked label (`.sf-stat__k`, `.sf-barrow__label`, `.sf-prail__label`, the condition
head) becomes sentence case at `--k-fs-data` in `--k-bone-62` with no tracking. `INK_SHADOW`
(`--sf-ink`) is removed with the rest. Keep the bracket CSS wiring (`bracketCss()`) in place but
make its output invisible by setting the bracket colour to `transparent` — the j07 test only
asserts the function's shape.

### 2.2 The instruments (sheet: Flight → The HUD)

| Instrument | Restyle |
|---|---|
| speed (`.sf-stat--speed .sf-stat__v`) | `font-family: var(--k-display); font-weight: 800; font-variation-settings: "opsz" 96; font-size: var(--k-fs-num); line-height: .9; letter-spacing: -.03em; color: var(--k-text-live)` — the hero number, bottom-left of the command deck; its label `.sf-stat__k` "speed" at data size 62 % beneath it |
| the other stats (`WPN`, `TETHER`, chips) | `--k-fs-data` 62 %, the value at `--k-fs-emph` 100 % |
| vitals bars (`.sf-bar`, `.sf-bar__fill`) | 2 px tall, track `--k-bone-38`, fill `--k-text-live`; the heat row's fill `--k-signal` (so it goes red when wanted); labels sentence case; numbers only when low (existing rule) |
| the ship schematic (`.sf-schematic`) | keep as it is (a drawn silhouette is an object, not a plate); strokes `--k-bone-62`, shield ring `--k-text-live` |
| Power Rail (`.sf-prail`, `.sf-pslot`) | slots become words: `.sf-pslot { background: none; border: 0; box-shadow: none; padding: 0 0 .15em; }` `.sf-pslot__name { font: 500 var(--k-fs-body) var(--k-text); color: var(--k-bone-62) }`; `data-state="armed"` → name `--k-text-live` plus a 2 px `--k-signal` rule beneath (`::after`, as `.k-word`); `ready` 62 %; `cooling`/`unaffordable`/`locked` 38 %; `empty` hidden name; the key glyph `.sf-pslot__key` at fine size 38 % before the word; the sweep ring stays (stroke `--k-hair` → `--k-signal`), its keyframes are the one permitted animation; band labels `.sf-prail__label` as `.k-caps` |
| target panel (`.sf-target`) | no plate; name `--k-fs-emph` 100 %, faction and distance `--k-fs-data` 62 %, the range bar as a 2 px `.k-bar`, threat tier as a word not pips (keep the `data-tier` selectors the j07 test asserts, styled as text weight/colour) |
| contact roster (`.sf-overview-row`) | hairline rows at data size; the count at rest |
| radar | unchanged drawing; its CSS ring/border removed (canvas only) |
| comms tape (`.sf-commtape`) | one line at `--k-fs-data` 62 % on the top edge, no band background |
| receipts (`.sf-toast`) | text only at `--k-fs-body` `--k-text-live`, no card/icon/stripe/shadow; `.sf-toast--in/--out` opacity only; the lane rectangle untouched |
| one voice (`#alerts .sf-alert`) | text at `--k-fs-emph` 100 %, no pill; the wanted pill text stays (it is the voice floor) |
| reticle, lock ring, lead pip, tells, gravity marks, momentum sinks | stroke colours to kit tokens; no other change |
| the massline instrument (`.sf-ml-instrument`) | track/fill as `.k-bar` style; words as data size; no box |

Every HUD element sits at the edges (they already do). The reticle stays centred (the one
permitted centring).

### 2.3 Arrival on undock (moment 3)

Add `arrive()` to the object `createHud` returns (`hud.js` ≈ 4638–4648): it settles the four
anchors in this order with 200 ms between them — `.sf-leftstack` from `bottom`, `.sf-command-deck`
from `bottom`, `.sf-prail` from `bottom`, `.sf-rightdock` from `right` — using the kit's
`settle(el, { from, delay, state: 'hud:arrive' })`, and emits `cue('open')` at each step (four
sounds, 200 ms apart). Call it from `uiRoot.js` where the HUD becomes visible again
(≈ 1142, inside `if (!this._hudVisibleLast && this.hud.forceRefresh)`), **only when the previous
hidden reason was docking** (track `this._hudHiddenByDock = !!state.ui.docked` while hidden). It
plays on every undock (there is no first-undock flag; the sheet's moment 5 wants undock fast, and
0.8 s is fast). Under reduced motion the anchors appear at once and one `open` plays. The
existing 400 ms dock fade and push-zoom stay.

### 2.4 Going wanted (moment 6)

The kit already turns the frame cold: `bindTemperature` sets `data-k-temp="wanted"` on
`heat:changed`, the `#hud::before` scrim (spec §6.1) tints the world, `--k-signal` turns red (the
heat bar, the Power Rail rule, any signal element), and `--k-text-live` goes a degree cooler.
Your part: make sure every HUD colour that should shift uses those tokens (2.1–2.2), and re-tune
`sfx_wanted_alert` in `src/data/audioRecipes.js` to the spec §8 character (sine 196 Hz, slow
attack, held, low-pass 800 Hz, ≤ 1.2 s) so the game's existing `wanted_escalate` cue sounds like
one sustained cold tone. Nothing flashes; the alert pill does not pulse (check its CSS).

### 2.5 Checks for the HUD

After the restyle: `npm run check:hud-j07`, `npm run check:one-voice`, `npm run check:ui-identity`,
`npm run check:ui-a11y`, `npm run check:wcag-contrast`, `npm run check:player-facing-labels`,
`npm run check:ui:perf`, then the budgets re-baseline command in spec §11.7 and
`npm run check:ui:budgets`. HUD positions move by `transform` only; idle overlays stay
`display:none` (`check-ui-frame-sleep.mjs`). No edit to sim files.

## 3. Captures, receipt, handoff

1. `node scripts/capture-ui-matrix.mjs --world --out=.devshots/frontend/B` and keep, at the three
   widths: `newGame`, `saveLoad`, `settings` (each tab), `pause`, `gameOver`, `credits`, and the
   flight HUD default frame (`hud` surface or the `flight` boot frame). Add the credits surface to
   the manifest first (1.6).
2. Two ten-second clips at 1920×1080: `.devshots/frontend/B/undock-arrive-1920.webm` (dock at
   Helios Prime, press undock, the HUD arrives) and `.devshots/frontend/B/wanted-1920.webm` (raise
   heat past the threshold on a fixed seed — `scripts/check-crucible-route.mjs` and the fun-loop
   scripts show how to script heat; if none fits, call `ctx.bus.emit('heat:changed', …)` is **not**
   acceptable — drive real heat through `src/systems/heat.js`'s incident path).
3. Photo mode: one capture with `body.k-photo`.
4. Receipt `design/program/roadmap/receipts/FRONTEND-B-REPORT.md` per spec §13, plus the list of
   `menu.css` rules deleted and the ones left for Task D with the reason. Update the queue units
   `PQ-181.00`–`.03` and `PQ-188.00` to `implemented` with an `IMPLEMENTED <date>:` brief prefix.
   Commit, push, remove your `NOW.md` row, report in plain words.

## 4. How agents get this wrong on this task

- Restyling the HUD by adding a second stylesheet instead of editing the injected block.
- Louder instruments: bigger labels, more colour, a plate to "help legibility". The sheet's HUD is
  quiet; only speed is hero.
- Moving the receipts lane, changing the one-voice priorities, adding a windshield key hint.
- Building the difficulty as a `<select>` or the toggles as switches.
- Keeping `panel sf-menu` on a root "so the old CSS still works".
- Faking the wanted clip by emitting the event by hand.
- Forgetting the budgets re-baseline and reporting a red `check:ui:budgets` as "pre-existing".
- Asking the owner anything.

## 5. Definition of done

- Six shell screens (new game, load, settings, pause, game over, credits) plus photo mode live on
  the default route, matching their sheet lines and the tables above, old CSS deleted, all named
  checks green.
- The HUD in the kit's faces and tokens with no plates; the arrival and wanted moments captured as
  clips; HUD checks green; budgets re-baselined.
- Captures at three widths, the receipt, the queue updated, pushed.
