# Main Menu & Pause Menu — Complete Overhaul Brief

**Purpose:** Hand-off dossier for a design agent that will redesign the main menu and pause menu
(and the other screens still on the legacy "blue matte plastic" style) from the ground up.

**Status:** Research only — no code changes made. This file is a reference/brief.

---

## 0. TL;DR for the designer

- The main menu and pause menu are the **last holdouts of a legacy "blue matte plastic /
  glassmorphic" style** that the rest of the game has already moved away from. The station UI was
  just redesigned and is the **liked north star** — match that direction.
- The old look = **translucent dark-blue `.panel` cards + screaming cyan `#39d0ff` glow + cyan→violet
  gradients + soft rounded corners + single mono font.**
- The new direction (station) = **opaque warm near-black machine fascia + hairline steel edges +
  amber worklight accent + sharp beveled/`clip-path` plates + a Saira / IBM Plex type trio +
  diegetic mono "stamps" burned into the surface.**
- The design thesis to obey, quoted from the station stylesheet itself:
  > **"The station is an operating machine, not a stack of translucent web cards."**
- This is explicitly sanctioned by the game's own constitution: *"Avoid generic glassmorphic/SaaS
  treatment"* and *"Flight, station, map, and fitting should feel related without becoming visually
  identical."*

---

## 1. The game's vibe (what these menus must feel like)

### 1.1 What kind of game
A **semi-3D top-down open-world space sandbox** (browser + Electron, Three.js + Rapier). Pitched as
**"Freelancer's living universe, played top-down, with physics you can feel."** Bundles mining,
trading, combat, missions, ship upgrading, and sector jumping into one persistent world.
Inspirations (README): *Freelancer, Endless Sky, Star Valor, Rebel Galaxy, the X series.*

Pacing is **deliberate, fair, readable** — the constitution explicitly rejects difficulty-for-its-own-sake:
*"Current game is already too lethal"*, *"Prefer assists and clarity over 'git gud' gates."* The
signature verb is **momentum/massline physics** (tether, slingshot, winch): *"If a feature can be
expressed through physics instead of a menu, express it through physics."*

### 1.2 Tone — working-space, not pulpy, not shiny-utopia
**Terse, dry, working-space professionalism.** The canonical voice rule:

> *"Crews talk like riggers, not like marketing."*
> - Good: *"Masslines only. If the spool lies, believe the spool."*
> - Bad (never): *"Welcome, brave pilot! Ready for an epic adventure?"*

The world is **industrial, lived-in, factional frontier** — "places, not rocket badges." Sector
palettes encode this:
- **core** = cyan/steel, "maintained surfaces, licensed signage"
- **belt** = rust/amber, "refinery grit, yellow-white fluorescents slipping"
- **fringe** = sodium-red, "contested jurisdiction, graffiti layers, functional wrong-lighting"
- **anomaly** = violet/green

A representative belt sector mood note: *"Maintenance every 96 hours instead of 48; air quality
adequate, temperature 18 degrees, fluorescent elements shifting yellow-white — close to full
spectrum but not quite."*

### 1.3 The standing UI law (load-bearing — quote it to the design agent)
From the constitution and GDD §9.4:

- **Non-diegetic, clean, hierarchical.** *"Flight presents one clear current objective, one
  immediate action, and one threat picture."*
- **Strategy density, not prose.** *"Primary numbers always visible: credits, cargo, hull/shield,
  target layers, price, payout, risk, distance."*
- **Anti-generic-SaaS:** *"Avoid generic glassmorphic/SaaS treatment... Flight, station, map, and
  fitting should feel related without becoming visually identical."*
- **Reject the dashboard:** (station contract) *"Reject a result whose structure is interchangeable
  with a generic admin dashboard, whose important mechanics are walls of text, or whose visual
  hierarchy is a repeated list / center card / inspector template."*
- **Quality bar:** *"This game must feel like a $30 premium PC/browser release: nothing on screen is
  unexplained, nothing stutters, every input answers within 50 ms."*
- **Sore-thumb test:** *"Every surface in a hero frame should survive a 5-second sore-thumb test."*

### 1.4 Hard "no"s (standing user decisions — do not violate)
- **No first-person / visor / cockpit / helmet framing. Ever.** No screen-edge arcs, no pilot avatars
  on the HUD. The old "visor" concept was explicitly rejected. *(This is a top-down, non-diegetic
  UI.)*
- **No real backdrop blur / glassmorphism.** `backdrop-filter` is forcibly disabled in
  `styles/accessibility.css` and is not in the live theme. Translucency must be earned, not decorative.

### 1.5 Vibe keywords to design toward
*"Freelancer's living universe, played top-down"* · *"Momentum is the toy"* · *"Crews talk like
riggers, not like marketing"* · *"Sheen, not shell"* · *"an operating machine"* · *"a $30 premium
PC/browser release"* · *"the universe was here before you"* · *"read the battlefield at a glance"*

---

## 2. The legacy style (what we're leaving behind) — full map

### 2.1 What "blue matte plastic" actually is
It's the **`.panel` + `.sf-menu` vocabulary** driven by these tokens (defined in `styles/ui.css`,
lines 4–37 and 284–303):

| Token | Value | Effect |
|---|---|---|
| `--panel` | `#0b1220` | dark navy panel base |
| `--panel-2` | `#111d30` | lighter navy (gradient top) |
| `--panel-edge` | `#1d3350` | blue hairline border |
| `--accent` | `#39d0ff` | **screaming cyan** — the signature glow |
| `--accent-3` | `#c08bff` | violet |
| `--glass` | `rgba(11,18,32,.62)` | translucent glass fill |
| `--glass-edge` | `rgba(57,208,255,.16)` | translucent cyan edge |
| `--grad-accent` | `linear-gradient(135deg, accent→accent-3)` | cyan→violet button/tab fill |
| `--r-md / --r-lg / --r-pill` | `7 / 10 / 999px` | soft rounded corners |

The look = translucent navy card + cyan hairline + cyan glow halos
(`box-shadow:0 0 24px rgba(57,208,255,.55)`, `text-shadow:0 0 18px rgba(57,208,255,.45)`) + soft
rounded corners + a single Consolas-mono font with heavy uppercase tracking.

> Note: `styles/ui.css` line 1–3 already **warns that these tokens are not an art-direction mandate**
> and that *"New UI must not automatically inherit the old cyan/purple, glass, rounded-card, visor,
> or console vocabulary."* So moving off them is sanctioned, not heretical.

### 2.2 The two screens the user specifically named

#### A. Main menu (title screen)
- **Module:** `src/ui/screens/mainMenu.js` (401 lines). `mount()` at lines 235–287.
  - Line 238 applies the style hooks: `rootEl.classList.add('panel','sf-menu','sf-menu-narrow')`.
  - Builds: `.sf-title-logo` wordmark "SPACEFACE", `.sf-title-tag`, `.sf-menu-save-summary`
    (Continue status), and a `.sf-col` of 5 `.sf-btn` buttons: **New Game · Continue · Load Game ·
    Settings · Signal Archive.**
  - Lines 319–370: idle "attract" camera drift (after 12s, nudges the frozen live scene behind the
    menu — mostly a feel feature since `#screens` is opaque over the canvas).
  - Lines 373–400: `.sf-continue-fade` full-screen black veil for the Continue→gameplay transition.
  - Lines 45–106: `injectStyle()` injects `<style id="sf-main-menu-style">` — the **canonical source**
    of the duplicated `.sf-menu` block (defines `.sf-menu`, `.sf-title-logo`, `.sf-title-tag`,
    `.sf-menu-save-summary`, the `.sf-stagger` first-show animation, `.sf-continue-fade`).
- **Backdrop:** `styles/ui.css` line 107 sets `#screens { background-image:
  url('../assets/cinematics/C-INTRO-01.jpg') }` (the cinematic still) with a `::before` darkening
  vignette (lines 112–118). `assets/cinematics/C-INTRO-01.jpg` confirmed present.
- **Buttons/copy:** `src/ui/localizedCoreCopy.js` (keys: `newGame`, `continue`, `loadGame`,
  `settings`, `signalArchive`, `continueSummary`, `noSave`).
- **Wiring:** `src/ui/uiRoot.js` lines 440–568 (cinematic intro splash + `showMainMenuWhenReady`),
  877–912 (screen registration), 840–875 (game:started/save:loaded → `closeAll()`).

#### B. Pause menu
- **Module:** `src/ui/screens/pause.js` (445 lines). `mount()` at 357–417.
  - `screenShell()` (lines 79–90) adds `'panel','sf-menu','sf-menu-narrow'`.
  - Top of menu = `.sf-slot` **"FLIGHT BRIEF"** card (objective / next step / save line).
  - Button stack via `mk()` helper, in order: **Resume · Settings · Save · Load (confirm) · Mission
    Log · Operations · Review <Map> (conditional) · Help / Controls · Codex · Main Menu (confirm).**
  - Lines 34–75: `injectStyle()` injects `<style id="sf-pause-menu-style">` — a **near-verbatim
    duplicate** of the mainMenu `.sf-menu` block.
  - Pure helpers worth knowing: `pauseStatusLines(state)` (L296–330), `pauseMapAction(state)`
    (L194–243), `pauseExitConfirmBody(state, target)` (L332–342).
- **The ONLY pause-specific visual difference** lives in `styles/ui.css` lines 120–145: a
  `:has(.screen[data-screen="pause"])` rule that **clears the cinematic background and replaces the
  `::before` vignette with a soft dim** so the **live rendered game frame shows through** behind the
  pause panel. (Main menu keeps the cinematic plate; pause shows the frozen world.) **Preserve this
  live-frame-behind behavior in the redesign** — it's intentional and good.
- **Triggering:** `src/ui/input.js` — **Esc and P** open it (lines 182–199); gamepad Start
  (`src/systems/gamepad.js` L18,54 → action `pause`); touch `data-act="pause"` button
  (`src/systems/touch.js` L36,145,232).
- **Confirm dialogs** (Load / Main Menu gating): `src/ui/confirm.js` lines 15–49 — its own
  `.sf-confirm` overlay reusing the legacy blue tokens.

> **Architecture note for the designer:** the `.sf-menu` stylesheet is **copy-pasted into three
> files** (mainMenu.js, pause.js, newGame.js) under three `<style>` ids. A redesign should
> consolidate this into one shared stylesheet rather than re-triplicating.

### 2.3 Every other surface still on the legacy style (overhaul candidates)
So the redesign can be consistent, here is the full footprint of the old vocabulary:

**The 7 `.sf-menu` screens** (each `classList.add('panel','sf-menu')` + duplicates the style block):
| Screen | File | Shell call |
|---|---|---|
| Main menu | `src/ui/screens/mainMenu.js` | L238 `panel sf-menu sf-menu-narrow` |
| Pause | `src/ui/screens/pause.js` | `screenShell()` L79–90 + `sf-menu-narrow` |
| New Game | `src/ui/screens/newGame.js` | L125 `panel sf-menu` (+ `.sf-ng-*` extras L89–96) |
| Settings | `src/ui/screens/settings.js` | L86 `panel sf-menu` (+ `sf-menu-wide`) |
| Save / Load | `src/ui/screens/saveLoad.js` | L76 `panel sf-menu` (+ `sf-menu-wide`) |
| Help / Controls | `src/ui/screens/help.js` | L90 `panel sf-menu` (+ `sf-menu-wide`) |
| Codex (Signal Archive) | `src/ui/screens/codex.js` | L95 `panel sf-menu` (+ `sf-menu-wide`) |

**Other `.panel` screens:** Game Over (`src/ui/screens/gameOver.js`, `.sf-gameover`), Mission Log
(`src/ui/screens/missionLog.js`, `.sf-mlog`, CSS L2067–2118).

**Shared chrome (consumed by many screens):**
- Confirm dialog — `src/ui/confirm.js` L15–49 (`.sf-confirm`, pure legacy blue panel).
- Toasts — `styles/ui.css` L242–253 (`.toast`: `--panel` fill, `--panel-edge` border, `--accent`
  left stripe). Used for mining yields, kills, save confirmations.
- Boot overlay — `styles/ui.css` L94–98, 271–275 (`#boot-overlay` "SPACEFACE initializing", cyan
  wordmark glow over navy radial).
- Pilot portrait frame — `styles/ui.css` L178–197 (cyan border + glow).
- Control-hints pill — `styles/ui.css` L220–239, 409 (`#control-hints`, `--glass`).
- Contact HAIL panel — `src/ui/contactHailPrompt.js` (~L150–175, inline blue-plastic styling).
- Base screen — `src/ui/screens/base.js` (`#sf-base` scoped blue-plastic variant; secondary candidate).

**Dead code (ignore):** `src/ui/screens/{market,shipyard,outfitting,manufacture,factions,services,bar,contracts,industry,stationHub}.js`
are the **pre-redesign station tabs**, NOT registered in `uiRoot.js` (lines 52–69). They are
superseded by `src/ui/station/*`. Leave them alone.

---

## 3. The north star — the station redesign (match this)

### 3.1 Two CSS layers; the LIVE one is the "workbench" reskin
`src/ui/station/stationApp.js` (lines 47–61, `STATION_STYLES`) loads, in order:
1. `styles/station.css` (710 lines) — base "Orbital Command" shell: azure-on-deep-navy, Saira +
   IBM Plex, soft 7–16px radii. **Structural layer.**
2. `styles/station-workbench.css` (**2396 lines**) — a full reskin loaded after. Its opening line is
   the thesis: **"The station is an operating machine, not a stack of translucent web cards."**
   **This is the layer to match.**

### 3.2 The token system to adopt
**Base structure (`station.css`, `.sx-app` scope, L24–53):**
- Type: `--sx-display:"Saira SemiCondensed"`, `--sx-ui:"IBM Plex Sans"`, `--sx-mono:"IBM Plex Mono"`
  (self-hosted woff2 in `styles/fonts/`).
- Surfaces: `--void-0:#05080e` → `--surface-3:#18293e` (opaque navy stack).
- Lines: `--line-1..3` = `rgba(120,160,210,.12/.22/.34)` (cool steel hairlines, **not cyan**).
- Ink: `--ink-0:#eef4ff` → `--ink-3:#61748f`.
- Accent: `--azure:#4aa8ff` / `--azure-bright:#7ac2ff` (a single **softer azure**, vs legacy
  screaming `#39d0ff`).
- Meaning: `--gain:#3fd07f`, `--warn:#f2b04a`, `--loss:#ff6a72`, `--hull`, `--fuel`, `--cargo`.
- Geometry: `--r-sm:7 --r-md:11 --r-lg:16px` (soft in the base), `--ease:cubic-bezier(.22,.8,.28,1)`,
  motion rule *"under 250ms."*

**Live reskin (`station-workbench.css`, L5–40) — THIS is the actual look:**
- Surfaces flattened to **near-black warm greys**: `--void-0:#070809`, `--surface-1:#121518` →
  `--surface-3:#1d2226`.
- Lines become **warm hairlines**: `--line-1:#292d2e`, `--line-2:#3b403f`, `--line-3:#66645d`.
- Ink warms: `--ink-0:#f1ede2` (warm white), `--ink-1:#d3cfc5` → `--ink-3:#656760`.
- **Accent flipped to amber worklight:** `--azure:#db9838`, `--azure-bright:#ffc064`,
  `--azure-dim:rgba(219,152,56,.12)`. (Name kept for compat; hue is amber.) Plus a secondary signal
  cyan `--sx-cool:#56bbb2` and `--sx-worklight:#db9838`.
- **Radii crushed to sharp:** `--r-sm:2 --r-md:3 --r-lg:4px`.
- Background = layered **machine-facia texture**: diagonal hatch
  (`repeating-linear-gradient(112deg,...)`), vertical seam guides at 4.1%/95.8%, warm worklight glow
  at the bottom edge, over a near-black warm gradient (L34–40).

### 3.3 Old vs new, axis by axis
| Axis | Legacy (leave behind) | Station workbench (match) |
|---|---|---|
| Palette | cyan `#39d0ff` + violet `#c08bff` on blue `#0b1220` | amber worklight `#db9838`/`#ffc064` + signal cyan `#56bbb2` on warm near-black `#070809` |
| Material | translucent glass `rgba(...,.62)` + glow halos + matte gradient | **opaque** machine fascia; zero blur; layered opaque gradients + 1px hairlines |
| Shape | soft rounded cards (7–10px, pill 999px) | **sharp/beveled**: 2–4px radii + **`clip-path` chamfered corners** everywhere (~25 distinct shapes) |
| Type | single mono (Consolas), heavy uppercase tracking | **three-family system**: Saira SemiCondensed (display) / IBM Plex Sans (body) / IBM Plex Mono (numbers/stamps) |
| Label language | minimal | **diegetic machine stamps** burned into the fascia via `content:""`: e.g. "STATION COMMAND / LIVE", "CREDIT LINE", "ORBITAL LINK / LOCAL SERVICES" |
| Decoration | glow + gradient fills | hairline rules, registration ticks, beveled inset shadows, numbered operation-rail, facia backplane rails |
| Motion | fade/slide 150–250ms | same sub-250ms envelope + springy `cubic-bezier(.16,1.18,.32,1)` tile lift with proximity scaling |
| Layout | centered modal card | **full-bleed owned viewport** (`.sx-fullbleed`), 3-row app grid, instrument screens are rail/stage/console columns |

### 3.4 Reusable component classes (the vocabulary to lift)
- **Root/scope:** `.sx-app` (the design-token scope).
- **Shell:** `.sx-topbar`, `.sx-crest` (`__mark`/`__name`/`__meta`), `.sx-status`, `.sx-readouts` /
  `.sx-readout` (`__ico`/`__meter`/`__fill`/`__v`), `.sx-credits` (`__v`/`__u`).
- **Navigation:** `.sx-dock`, `.sx-dockwrap`, `.sx-dockzone`, `.sx-tile` (`__icon`/`__label`/`__cost`/
  `__seat`/`__badge`, states `.is-active`/`.is-attention`/`.is-disabled`, modifier `.sx-tile--act`).
- **Workspace:** `.sx-workspace`, `.sx-screen` (`__head`/`__title`/`__sub`/`__body`),
  `.sx-operation-rail` (`__index`/`__track`/`__mode`), `.sx-enter`.
- **Instrument panels:** `.sx-panel` (`__head`), `.sx-stage`, `.sx-stat` (`__k`/`__v`/`__sub`),
  `.sx-kv`, `.sx-tag` (`--good`/`--bad`), `.sx-pips`, `.sx-seg` (`__btn`, `.is-on`).
- **Buttons:** `.sx-btn-primary` (amber gradient, dark text `#04121e`), `.sx-btn-ghost` (hairline
  outline), `.sx-choice`, `.sx-modrow__buy`.
- **Bars/meters:** `.sx-readout__meter`/`__fill`, `.sx-demand`, `.sx-ladder` (`__step`/`__dot`).
- **"Machine talks back" layer (great for pause):** `.sx-receipt` (`__kind`/`__title`/`__delta`),
  `.sx-comms` (`__toggle`/`__history`/`__count`), `.sx-pop`, `.sx-handoff` / `.sx-hstep` (numbered
  guidance chips).
- **Facia decor:** `.sx-backplane` (`__rail--a/--b`, `__stamp`).

---

## 4. Design direction (suggested, not mandated)

The constitution says surfaces should "feel related without becoming visually identical" — so the
menus should share the station's **material language and token system** without literally cloning
the station's full-bleed instrument layout. Concretely:

1. **Scope the menus under `.sx-app`** (or import the `station.css` + `station-workbench.css` token
   pair) so they inherit the warm near-black / amber / hairline system automatically.
2. **Replace the translucent glass `.panel`** with an **opaque beveled `clip-path` plate** on warm
   near-black (the menu is a centered plate, not a full-bleed app — that's the "related but not
   identical" lever).
3. **Swap cyan/violet gradient buttons** for **amber worklight `--sx-worklight` accents on dark with
   hairline outlines** (`.sx-btn-primary` / `.sx-btn-ghost`).
4. **Adopt the Saira / Plex Sans / Plex Mono trio** and the tiny diegetic mono stamps — e.g. a pause
   header like *"MISSION CONTROL / STANDBY"* or *"CONTRACT 47-A / OPEN"* stamped into the fascia.
5. **Preserve the two existing good behaviors:**
   - Pause must keep showing the **live frozen game frame behind it** (the `:has([data-screen=pause])`
     rule in `ui.css` L120–145). A heavy fascia plate over a dimmed live world is the goal.
   - Main menu keeps the **cinematic still backdrop** (`C-INTRO-01.jpg`) and the idle attract drift.
6. **Consolidate the triplicated `.sf-menu` style block** into a single shared stylesheet rather
   than re-copying it into three screen modules.
7. **Don't regress accessibility:** forced-colors mode and dyslexia-font mode have hooks in
   `styles/accessibility.css` (L204–209, L293–299) that key off `.screen`/`.panel`/`.sf-menu`/
   `#screens` — keep equivalent semantic hooks so those rules keep working.

---

## 5. File reference index (give this to the design/build agent)

### Screens to redesign (the legacy blue footprint)
- `src/ui/screens/mainMenu.js` — **main menu** (mount L235–287, injected style L45–106)
- `src/ui/screens/pause.js` — **pause menu** (mount L357–417, injected style L34–75)
- `src/ui/screens/newGame.js` — New Game (mount ~L213, style L39–96)
- `src/ui/screens/settings.js` — Settings (L86, +`sf-menu-wide`)
- `src/ui/screens/saveLoad.js` — Save/Load (L76, +`sf-menu-wide`)
- `src/ui/screens/help.js` — Help/Controls (L90, +`sf-menu-wide`)
- `src/ui/screens/codex.js` — Codex / Signal Archive (L95, +`sf-menu-wide`)
- `src/ui/screens/gameOver.js` — Game Over (`.sf-gameover`)
- `src/ui/screens/missionLog.js` — Mission Log (`.sf-mlog`, CSS L2067–2118)
- `src/ui/confirm.js` — shared confirm dialog (L15–49)
- `src/ui/contactHailPrompt.js` — in-flight HAIL panel (~L150–175)

### Style sources
- `styles/ui.css` — **legacy token + `.panel`/`.sf-menu`/`.sf-btn` source** (tokens L4–37, L284–303;
  `.panel` L87 & L147–152; `.sf-btn` L356–365; `#screens` backdrop L104–118; **pause live-frame rule
  L120–145**). Loaded by `index.html` L8.
- `styles/accessibility.css` — forced-colors + dyslexia hooks (L204–209, L293–299). Loaded L9.

### North star (the new direction — match this)
- `styles/station.css` — base structure + "Orbital Command" tokens (L24–53)
- `styles/station-workbench.css` — **the live reskin to match** (tokens L5–40; thesis L3)
- `src/ui/station/stationApp.js` — shell builder, `.sx-app` mount (L47–61 loads both stylesheets)
- `src/ui/station/dock.js`, `src/ui/station/icons.js` — command dock + icons
- `src/ui/station/screens/{market,shipworks,industry,contracts,factions,bar}.js` — instrument screens
- `design/STATION_SHELL_CONTRACT.md` — station behavior/quality contract (the anti-dashboard rules)

### Vibe / policy sources
- `design/GDD_2_0.md` §1, §3, §9, §9.4 — game pitch, momentum pillar, HUD law
- `design/vision/00_CONSTITUTION.md` §3, §4, §5 — tone, difficulty, **UI law**
- `design/spec2/00_MASTER_TASTE.md` §3, §5 — art direction + voice rule ("riggers, not marketing")
- `design/world-identity/SECTOR_STYLE_INDEX.md` + `design/world-identity/sectors/*` — sector palettes/moods
- `README.md` — inspirations list
- `src/data/palettes.js`, `src/data/sectors.js` — runtime palette/sector data

### Wiring / entry (context only — likely no change)
- `index.html` — `#screens` container (L28), loads stylesheets (L8–9)
- `src/ui/uiRoot.js` — screen registration (L49–70), cinematic intro + title flow (L440–568),
  registerScreens (L877–912), game:started→closeAll (L840–875)
- `src/ui/screenManager.js` — screen stack, `PAUSING_SCREENS` (L16), pause/freeze semantics (L246–261)
- `src/ui/input.js` — Esc/P open pause (L182–199); also touch/gamepad paths
- `src/ui/localizedCoreCopy.js` — menu/pause button labels
- `assets/cinematics/C-INTRO-01.jpg` — main-menu cinematic backdrop

---

*End of brief. Generated 2026-07-16 from a read-only audit of the SpaceFace codebase.*
