<!-- LIFETIME: DURABLE -->
# Frontend Direction & Menu Architecture

**Status:** design authority for 2D surfaces — the flight HUD, screens, menus, and the progression
UI. Research + direction + sequenced plan. **No implementation is claimed by this document.**

**Written:** 2026-08-14, from a read of the live UI layer, the captured evidence frames, and two
independent review passes. Every figure below was verified against the source at time of writing.

This document answers one owner complaint — *"the HUD and frontend design of the 2D stuff is kind of
weak… the menus and frontend design are basically like a cheap Web game"* — and one structural ask:
*"right now I can only really see what my ship consists of in the station menus, but if I'm flying I
can't access as much as far as menus go."*

---

## 0. Scope boundary — read this first

`design/HUD_FLIGHT_ATTENTION.md` is an **activated, user-authorized execution plan (2026-08-13)** and
is the layout law for the flight HUD. Its banned list explicitly forbids *"a second HUD spec that
restates this file."* **This document is not that.** The boundary:

| Owned by `HUD_FLIGHT_ATTENTION.md` | Owned here |
|---|---|
| What is on the glass in flight, and when — the "jobs" model, unboxing the cards, one destination line, contacts collapsing to a count, receipts, teach-once hints | **Screens and menus** — the docked station, progression, maps, the screen shell |
| Massline instrument placement (**bottom-centre while latched**) | **In-flight *access*** — which surfaces are reachable while flying, and the defect that makes them unusable (§3.5) |
| Ship instrument, speed, radar, target card | **Progression and customization** (§5.5) |
| Its own non-goals: *"new fonts or a new palette"*, *"station / map / menu redesign"* | The **type and colour evidence** (§3.2–3.3), recorded as findings for that plan's owner — **not prescribed here** |

**Where the two meet, `HUD_FLIGHT_ATTENTION.md` wins.** Its §2.7 ("Ink on vacuum… type large enough
to read — stop 7–8px tracked-out kit labels") and its §5 banned list ("7px tracked-out `SCI-FI`
labels", "`backdrop-filter` as polish", "more boxed cards") already authorize most of what §3.2–3.4
below measures. **That is corroboration, not conflict** — this review reached the same conclusions
independently, and the figures here are offered as ammunition for that plan, not as a rival one.

---

## 1. Authority and supersession

When two prescriptions about 2D surfaces disagree, use this table rather than averaging them.

| Source | Current use | Ruling here |
|---|---|---|
| [`design/VISION.md`](../VISION.md) | Product authority, owner's own words, 2026-08-10 | **Controls.** Arcade, bright, kinetic. "Progression means increasing physical agency." The player asks *"What can I do now?"*, never *"my damage went 170 → 212."* |
| [`PHYSICS_AS_SPECTACLE_ART_BIBLE.md`](../PHYSICS_AS_SPECTACLE_ART_BIBLE.md) | Visual authority for the 3D world | **Controls palette temperature.** "Bright, kinetic, colorful arcade-industrial science fiction." The 2D layer must not contradict it by staying cold and monochrome. |
| [`COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md`](./COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md) | 2026-07-08 doctrine + the `src/ui/effects/` contract | **Retained, narrowed.** It self-demotes in its own header ("a quarry, not automatic rules"). Its `src/ui/effects/` contract and eight built primitives remain in force. Its invitation to expand the palette yields to token-only. See §5.1. |
| [`design/HUD_FLIGHT_ATTENTION.md`](../HUD_FLIGHT_ATTENTION.md) | **Activated execution plan, user-authorized 2026-08-13** | **CONTROLS THE FLIGHT HUD.** Layout law for `#hud`. This document does **not** restate or override it — see §0. |
| [`FRONTEND_REBOOT_AUDIT.md`](./FRONTEND_REBOOT_AUDIT.md), [`HUD_THREE_ANCHOR.md`](./HUD_THREE_ANCHOR.md) | Surface inventory; flight anchor budget | Dated receipts. `HUD_FLIGHT_ATTENTION.md` supersedes `HUD_THREE_ANCHOR.md` as layout law. |
| [`STATION_UI_REFACTOR_BRAINSTORM.md`](../STATION_UI_REFACTOR_BRAINSTORM.md) | 2026-08-12 station stylesheet diagnosis | **Retained.** Its Stage 0 → 1 → 2 ruling is engaged directly in §6. |
| [`MENU_OVERHAUL_BRIEF.md`](../MENU_OVERHAUL_BRIEF.md) | 2026-07-17 handoff | **Closed/archived.** Not resumed. |

**Not active requirements:** first-person visor/cockpit framing in a third-person game; the
"holographic-bleak" direction named in `uiRoot.js:1749` (see §3.2).

---

## 2. What the owner asked for

Quoted, because the direction is theirs and every proposal below is measured against it:

> "lightweight shiny kind of quick-battle sort of space-parkour almost sort of trick flying game and
> fun shoot-em-up physics playground combat, shiny exploding things, swarms of enemies getting
> knocked around and blown against asteroids and blowing up, **but with a deep skill tree and
> customization system to allow different kinds of gameplay**."

Two consequences that constrain everything downstream:

1. **The UI gets out of the way during play and is generous when play stops.** Quick-battle arcade
   means the flight surface is read at a glance, not studied.
2. **Depth lives in the stopped state.** "Deep skill tree" and "quick-battle" only conflict if depth
   is smeared thinly across the flight HUD. Separated cleanly, they reinforce each other.

---

## 3. Diagnosis

All figures verified against source. Where a claim was checked and found **false**, it is recorded
as such, because this repo's standing hazard is inherited claims that were never re-verified.

### 3.1 The flight HUD is four unreconciled stylesheets

This is the root cause, and it is structural rather than aesthetic. Four layers style the same
elements, all still shipping:

| Layer | Where | What it establishes |
|---|---|---|
| 1 — "Tactical Visor" | `uiRoot.js` ~1246–1744 | Chromeless; `--visor-*` tokens; saturated `#00F0FF` + glow |
| 2 — "Flight HUD finish pass" | `uiRoot.js` ~1745–2072 | A **second, competing token set** `--hud-*`; re-declares `.sf-leftstack`, `.sf-bars`, `.sf-cluster`, `.sf-target`, `.sf-mission-tracker`, `.sf-wpn-heats` |
| 3 — "HUD/scene integration pass" | `uiRoot.js` ~2082–2105 | A trailing patch |
| 4 — `CARGO_HOLD_CSS` | `hud.js` ~2013+ | Redefines `.sf-cargo-panel` from layer 1's 380px to a fixed 980×600 |

Layer 1's rules still win wherever layer 2 did not happen to override them. **Nobody designed the
current state; it is residue.** This is the same append-only failure already diagnosed in
`station-workbench.css` — the flight HUD has it too, and it was never written down.

Layer 3's own source comment records that an independent review scored `ui_integration` **3/5**,
*"reads like flat webpage panels placed over the render."* The codebase already contains the
complaint the owner is now making.

**Correction to an earlier reading in this review:** it is *not* true that the HUD never adopted the
bundled typefaces. Layer 2 defines `--hud-display: "Saira SemiCondensed"`, `--hud-body: "IBM Plex
Sans"`, `--hud-data: "IBM Plex Mono"` (`uiRoot.js:1752-1754`). The defect is that **layer 1's 39
`font-family: var(--mono)` declarations — resolving to `:root`'s Consolas — were never migrated.**
The good type system exists in the HUD and is half-applied.

### 3.2 The HUD has no readable type scale

Across the HUD layer (`uiRoot.js`, `hud.js`, `hudMeta.js`, `radar.js`, `targetPanel.js`):

- **137** `font-size` declarations. **96 are ≤ 11px. 49 are ≤ 9px. Four are 7px.**
- Exactly **one** exceeds 20px — the 46px death banner. There is no display type in flight.
- Letter-spacing on those labels runs `.1em`–`.3em`.
- **39** `font-family: var(--mono)` (Consolas); **zero** `var(--font)`.

Sub-9px tracked monospace is not a style; it is the absence of one. It reads as a debug overlay
because structurally it is one. This is also the exact aesthetic recorded as owner-rejected on
2026-07-08 — the station and menus were fixed for it; **the flight HUD never was.**

### 3.3 The HUD palette is muted where the game is arcade

Two competing colour sets ship simultaneously:

- Layer 1: `--visor-cyan #00F0FF` (maximally saturated) with `--visor-glow-cyan 0 0 8px`, used
  **99 times across `src/ui/*.js`** — 49 of those `--visor-cyan` alone.
- Layer 2: `--hud-cyan #4ec3e6`, `--hud-muted #71828f` — desaturated grey-blue. Its own comment
  (`uiRoot.js:1749`) names the direction **"holographic-bleak."**

Both are wrong for this game, in opposite directions. Saturated cyan with an 8px glow on near-black
is the generic AI-sci-fi signature and costs contrast on the small type in §3.2. Muted grey-blue is
an enterprise dashboard sitting on top of a fireworks show — VISION.md demands "industrial machinery
pushed to arcade levels of energy… **NOT** muted brown-grey hard sci-fi."

Also verified live and violating stated constraints:

- **`backdrop-filter: blur(2px)`** at `uiRoot.js:2093`, on five HUD selectors — a hard constraint,
  already breached, and directly contradicted by layer 2's own comment promising "no always-on
  backdrop blur (compositor cost)."
- **Raw hex bypassing token-only** at `uiRoot.js` ~1900–1914, 1971 (`#4ec3e6 #a08cf0 #ff8a4a
  #4ecba8 #c99563 #c4a77e`).
- **~12 `infinite alternate` keyframes** pulsing at rest. `check:ui-frame-sleep` inspects rAF;
  CSS keyframes are compositor-side and pass straight through. Green check, pulsing HUD.
- **Reduced-motion is incomplete** — the `prefers-reduced-motion` block covers three selectors;
  `sf-diamondpulse`, `sf-barpulse`, `sf-barready`, `sf-wpnpulse`, `sf-alertpulse`, `sf-dockpulse`,
  `sf-reticlepulse` keep running.

### 3.4 Thirteen equal boxes ring the viewport

From `.devshots/alpha/m6-localization-reachability/03-flight-hud-qps-1440x900.png`: roughly thirteen
discrete panels, same fill, same 1px border, same radius, arranged around all four edges with ragged
widths and heights and no shared grid.

Layer 2 is responsible: it gave `.sf-mission-tracker`, `.sf-nav-readout`, `.sf-obj`, `.sf-overview`
and `.sf-target` a shared `border + background + box-shadow` treatment (`uiRoot.js` ~1961–2006).
**Five bordered, drop-shadowed dark cards over a 3D scene is the webpage look**, and layer 3's own
3/5 review already said so. Layer 1 had the better instinct (chromeless, text-shadow for legibility);
layer 2 reverted it.

Consequences: no hierarchy (hull state, a tutorial hint and a comms log shout equally); no room for
spectacle (the ship is small in frame, the periphery is a picture frame of UI); ragged edges read as
unfinished more than any single element does.

### 3.5 Opening a menu in flight blinds the player — a live defect

`styles/ui.css:82`:

```css
body.ui-modal-open #hud { opacity: 0; pointer-events: none; }
```

`src/ui/screenManager.js:207-209`:

```js
const modalOpen = open || state.ui.docked === true || state.ui.fulfillmentBlackoutActive === true;
document.body.classList.toggle('ui-modal-open', modalOpen);
```

`modalOpen` is *any screen being open*. **It never consults `PAUSING_SCREENS`.**

`PAUSING_SCREENS` (`screenManager.js:16`) excludes `galaxyMap`, `starmap`, `localmap`, `techTree`,
`missionLog` and `automation` — those open **over a live, running sim**. So opening the tech tree or
mission log mid-flight: the sim runs at full speed, **the entire HUD goes to `opacity: 0`**, the
reticle is `display:none`, alerts and toasts are zeroed, and `#modal-backdrop` dims the world while
swallowing pointer events. Enemies keep shooting at a player who can see neither their ship state
nor their crosshair.

The engine's "live-sim screen" class is currently **a blindfold**. This is not a designed trade-off;
it is two independent decisions that were never reconciled. **Fix this before designing any
in-flight surface** — it changes what the class is even capable of.

### 3.6 In flight you can reach thirteen surfaces — but not your ship

Contrary to the premise that little is reachable, `src/ui/input.js` + `bindings.js` expose thirteen
in-flight keys: maps `M`/`N`, tech `T`, missions `J`, codex `K`, help `F1`/`H`, **cargo `I`**, comms
`L`, fleet `Z`, band `Shift+O`, drill `B`, claim `U`, pause `P`, dock `E`.

Two real problems sit behind the owner's report:

1. **The one thing you cannot see while flying is your ship.** `station/screens/shipworks.js` (1264
   lines) — the 3D hull with `data-spatial-slot` hardpoints painted on it, literally the "this is my
   fucking ship" surface — exists **only behind docking.** That is precisely what the owner
   described. The headline move is not "add menus"; it is **move one screen across the dock
   boundary.**
2. **The good in-flight instrument is unadvertised.** `I` already opens a rich cargo panel over a
   live sim — five-tab rail, capacity and scan-risk gauges, inspector with market intelligence, SET
   COURSE / JETTISON. Permanent keycaps were deliberately removed to Settings → Controls
   (`uiRoot.js:1916-1917`), so nothing tells the player it exists.

### 3.7 `#screens` flex-centres everything over a static JPG

`styles/ui.css:50`:

```css
#screens { inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; }
```

Every screen is a centred flex child over `assets/cinematics/C-INTRO-01.jpg`. Any screen that does
not explicitly size itself becomes **a cramped card floating in the middle of a picture** — the
mechanism behind the owner's 2026-07-08 note about "a cramped centered panel with the scene bleeding
around it… not utilizing all the space." It was read as taste; it is one flex rule.

`08-mission-log-qps-1440x900.png` is the worst specimen: a ~700px card in a 1440px viewport holding
a vertical list of identical bordered records with two plain buttons each — **and the content is
visibly clipped at the card's bottom edge with no scroll affordance.** A contract to fly somewhere
shows no geography, no ship, no destination.

**Mission Log already uses the good `.sf-menu` theme.** Its problem is *composition*, not tokens.
Theming and layout are separate defects needing separate fixes.

### 3.8 The design system ships in zero live screens

- **44 modules under `src/ui/` each call `document.createElement('style')`** and inject a private
  stylesheet. techTree, missionLog, pause, settings, saveLoad, help, mainMenu, `galaxyMap.js`,
  `hud.js` — each invents its own type scale, border language and radii.
- The sanctioned vocabulary — `src/ui/uiPrimitives.js` plus the "UI PRIMITIVE LAYER" block at the
  end of `styles/ui.css` — has **exactly one importing file: `screens/stationHub.js`, which is
  dead** (§3.10). The `sf-*` primitives appear ~5 times across live modules.

**A design system that ships in zero live screens is not a design system; it is a proposal.** That
inconsistency — not any single screen's styling — is what the eye reads as "cheap."

### 3.9 The progression screen is the specimen — and is silently broken

`src/ui/screens/techTree.js` (677 lines): its own injected sheet; 20 raw hex + 16 rgba against 35
token refs; branch accents hardcoded (`#ff5470 #ffb347 #39d0ff #7af7d0`); eight distinct em sizes.
The DAG is painted to `<canvas>` — so no keyboard access, no screen reader, no text scaling, no
tokens. A `🔒` emoji is drawn straight to canvas (line 481) and a `✓ RESEARCHED` glyph at 465.

**And it does not render as authored.** All four canvas font assignments are:

```js
g.font = '700 12px var(--mono, monospace)';   // :391
g.font = '600 12px var(--font, sans-serif)';  // :456
g.font = '600 10px var(--mono, monospace)';   // :461
g.font = '11px var(--mono, monospace)';       // :479
```

Canvas 2D parses `font` with the CSS font-shorthand parser, which **does not resolve custom
properties**. `var()` is invalid there, and an invalid `font` assignment is **silently ignored**,
leaving the previous value — initially `10px sans-serif`. **The entire tech tree renders in 10px
browser-default sans-serif**, ignoring every intended size and face. No error, no failing check.

This is the same class of failure as the unclosed CSS brace that once silently killed the station
layout: the checks verify structure, never appearance.

### 3.10 ~10,780 lines of dead station UI ship in every bundle

`SCREEN_MODULES` registers the station as `station/stationScreen.js` → `station/stationApp.js`
(1024) + `station/screens/*` (3489), 7 destinations.

**`screens/stationHub.js` (4049 lines) is not a registered screen.** `stationApp.js` imports seven
helper symbols from it — and stationHub's own top-level imports then chain in `market.js` (2060),
`outfitting.js` (1083), `shipyard.js` (898), `bar.js` (1567), `factions.js` (271), `services.js`
(549), `manufacture.js` (303). **A seven-symbol convenience import drags ~10,780 lines of abandoned
station UI into every bundle.**

`outfitting.js` / `shipyard.js` / `manufacture.js` (2284 lines) have exactly one importer, and it is
itself dead. Others are half-alive: `market.js` still supplies `bestKnownSellFor` to `hud.js` — logic
reused, panel orphaned.

Much of the effects wiring documented in the command-deck bible (the Missions ops board, `dockRail`,
five wired effects) lives in that dead file and **is not what the player sees.**

### 3.11 Claims checked and found FALSE

Recorded so they are not inherited again:

- The global `button:active` transform bug is **fixed** — `styles/ui.css:177` now uses
  `translate: 0 1px`, which composes with `transform` instead of replacing it.
- `station/icons.js` **does** have a `close` glyph.
- There is no `check-station-tabs.mjs`; the real check is
  `scripts/check-station-tab-navigation-runtime.mjs`, and it pins **7 destinations in a
  `role=toolbar` dock whose nav group is `role=tablist`** — not an 8-tab left rail.
- `check-command-deck-ui.mjs` has **no `data-centerpiece` contract**; it is six static lints over a
  hardcoded 11-entry list, **five of which point at the dead files**, and it never inspects
  `src/ui/station/`. **The live docked station is linted by neither check.**

---

## 4. Direction

### 4.1 One sentence

> **Bright, confident, arcade-industrial. Big legible type, generous dark space, saturated colour
> spent on danger and agency — and the flight surface reduced to what can be read in a glance at
> speed.**

> **Scope note.** §4.2–4.3 are **binding for screens and menus** (this document's territory) and are
> offered to the flight HUD only as evidence. `HUD_FLIGHT_ATTENTION.md` lists *"new fonts or a new
> palette"* among its non-goals — so for `#hud`, **no new face and no new palette.** What that plan
> already authorizes on its own terms is the *size and tracking* fix (its §2.7: "type large enough to
> read — stop 7–8px tracked-out kit labels"), using the `--hud-display / --hud-body / --hud-data`
> faces that are **already declared** at `uiRoot.js:1752-1754`. That is a reconciliation of layers
> 1–4, not a new type system.

### 4.2 Type

Three roles, using faces already vendored in `styles/fonts/` and already declared as `--hud-*`:

| Role | Face | Use |
|---|---|---|
| **Display** | Saira SemiCondensed 600/700 | Screen titles; the few HUD values readable at a glance mid-combat (speed, hull at threshold, threat count). **Needs sizes well above 20px.** |
| **UI / body** | IBM Plex Sans 400/500/600 | Every label, description, button, list item — everything currently in Consolas for no reason. |
| **Telemetry** | IBM Plex Mono 400/500 | **Numeric readouts only**, where tabular alignment earns it. Not labels, not titles, not prose. |

Rules: **11px floor** — delete the 7 / 7.5 / 8 / 8.5 / 9px tier entirely; numbers 16–20px with
`tabular-nums`; tracking above `.06em` only on small-caps labels. Fewer things, bigger.

### 4.3 Colour

- Retire **both** `--visor-*` (too hot, glowing) and the muted `--hud-*` greys (too bleak) in favour
  of one *saturated arcade* set: hot cyan = you, hot magenta = hostile, hot amber = objective,
  white-hot = impact. **Saturation is the arcade signal.**
- Keep space dark — it is where the spectacle lives.
- Spend the hot accent on **danger and player agency**, never on resting chrome.
- Let faction and cargo colour through instead of washing everything one hue.
- Delete `backdrop-filter`; delete raw hex; complete the reduced-motion block; stop the at-rest
  `infinite` pulses (pulse on state *change*).

### 4.4 Composition

- **Chromeless in flight.** Strip border/background/shadow from the five panel selectors; use a soft
  per-anchor radial vignette plus hard `text-shadow`. Layer 1 had this right.
- **Full-bleed screens.** A 700px card in a 1440px viewport is not focused, it is unfinished.
- **One grid.** The ragged stacks in §3.4 are most of the cheapness and cost only discipline.
- **Delete native form controls** — `<select>` in `galaxyMap.js`, `automationPanel.js` (×2),
  `starmap.js`.

---

## 5. Menu and screen architecture

### 5.1 Where the command-deck bible is retained and where it yields

**Retained:** the `src/ui/effects/` contract and its eight built, checked, self-parking primitives;
the anti-generic FAIL checklist.

**Yields:** its invitation to expand the palette ("new hues need player-facing justification, not
permission from a closed palette") loses to token-only. And its "playable instrument, never a
document" thesis must not be applied to progression and fitting — forcing a spatial centrepiece onto
a progression screen is exactly how the tech tree became an unreadable canvas DAG. The correct rule
for the arcade brief:

> **Show consequence, not cost.** A node says *"you can now tow a freighter,"* not *"+18% tractor
> strength, 4200cr, requires Node 7."* Numbers may exist, secondary, for players who want them.

### 5.2 The map

| Tier | Surfaces | Ruling |
|---|---|---|
| **Always available** (flight + docked) | **SHIP** — new | The Shipworks stage minus commerce. Read-only in flight: the hull, what is bolted where, **what each fitting lets you do**, live mass / spool / impulse. Docked, the same screen grows Buy / Fit / Sell. **One screen, two modes.** |
| **In-flight overlays** | Maps, Missions, Codex, Cargo (`I`), Comms, Fleet radial, Band, Help | Keep — but fix the blindfold (§3.5) so they are usable at all. |
| **Docked only** | Market, Shipworks, Industry, Missions, Factions, Bar, Ledger | **Do not split.** The runtime check pins order, roles, roving tabindex, arrow map, three readouts, four dock actions with live costs, handoff routing and departure chips. Splitting costs a rewrite of that probe and buys the player nothing. *A split that adds clicks without adding agency is a loss.* |
| **Pause / meta** | pause, settings, saveLoad, gameOver, mainMenu, newGame | Leave alone; they work. Main menu is the quality bar. |
| **Retire** | `starmap`, `localmap` (superseded by `galaxyMap`); orphaned `outfitting` / `shipyard` / `manufacture`; fold `techTree` into SHIP | See §3.10 and the check cost in §6. |

Net: 17 screens → 13, one new always-available SHIP surface, one fewer docked/flight cliff.

**A separate `T` screen is precisely what makes progression feel like a spreadsheet in another
room.** Progression belongs on the ship it modifies.

### 5.3 In flight the player gets verbs, not screens

Full-viewport screens are spatially incompatible with flying (§3.5) — that is a fact about geometry,
not a tuning problem. Bullet-time was considered and rejected: `createTimeEffects` already offers a
lowest-wins scalar, but slow-motion is a **combat verb** the owner wants for a future V.A.T.S., and
spending it on menu access devalues it.

**Recommended: a quick-verb radial**, cloned from the working precedent `src/ui/wingmanRadial.js`
(280px at screen centre, `pointer-events:none` on the container and `auto` only on wedges, opens on
a key, closes on re-press/Escape, **never sets `.ui-modal-open`, never pauses**). Hold to open,
release to commit. Four wedges: **weapon group, Massline mode, consumable, wingmen**.

It changes what the ship *does right now* — VISION.md's definition of progression. Tech tree,
market, factions stay docked.

> **Key-binding caveat.** Every obvious key is claimed: `Q` strafeLeft/chargeThrow, `X`
> countermeasure, `C` scanPulse, `R` chargeDetonate, `G` autoFire, `Z` fleetCommand, plus
> E/I/L/K/M/N/T/J/B/U in `BINDINGS`. Verify against **both** tables — this repo already shipped one
> collision where `E` docked *and* strafed simultaneously.

### 5.4 Massline, swarm and impact — findings referred to the HUD plan

**These are HUD-owned (§0). Recorded here as findings for `HUD_FLIGHT_ATTENTION.md`'s owner, not as
instructions.**

**Massline placement is already ruled.** `HUD_FLIGHT_ATTENTION.md` §2.8 and §3 Flight 3 give the
latched Massline **bottom-centre** ("analog tension/length/release", agreeing with the existing
world-space release diamond in `masslineHud.js`). *That ruling stands.* An earlier draft of this
review proposed a load ring at screen centre; the companion prototype still shows it that way, and
**the prototype is wrong on this point** — it is kept as an illustration of *loudness*, not of
*placement*. The transferable finding is only this: the signature mechanic currently reads as a 3px
bar with an 11px label, and whatever form it takes, **tension should be the loudest thing on the
glass while latched.**

Two further findings, both compatible with that plan:

- **Swarm readability.** Twenty light enemies turns the lock diamonds into confetti. Cap world-space
  hostile marks at ~6 nearest; the rest become radar-only plus **one directional threat arc**. One
  target gets a readout; the swarm gets a *shape*.
- **Impact feedback.** The current hit tell is a 0.34s brightness pulse on a 62px schematic in the
  bottom-left corner. Nobody looks there mid-fight. Impact should be **directional, screen-edge, and
  proportional to actual momentum change — and it must fire for impacts the player delivers**, not
  only receives. That is "Holy shit, I did that."
- **Remove:** the `[ TARGET LOCK: ]` bracket typography (decorative punctuation is the AI-sci-fi
  tell) and the `.sf-target__triangle` E/K/X damage bars — that is HP-bar dogfighting, which
  VISION.md explicitly forbids.

### 5.5 The progression surface — "Ship & Capability"

**Does the content exist?** 29 tech nodes (13 combat / 5 industry / 5 drives / 6 logistics), max
prereq depth 5; 49 modules; 18 weapons; 13 hulls. **As a tech tree that is shallow — but the depth
the owner wants already exists in the module data.** Six Massline heads ship today (`tractor`,
`elastic_whip`, `frame_coupler`, `monofilament_sweep`, `transverse_snare`, `twin_bridle`); three
spool tiers (1.5× / 3× / 6× `tetherSpoolMult`); `ramDamageDealtMult 1.8`; `tractorWholeWrecks`;
`magnetRange` 560→780; `impulseChargeCapacity` + `bombPropulsion`; `microJumpBlink`; gravity-marker
and momentum-sink weapons.

Set that beside VISION.md's own list — *move much larger objects / produce enormous impulse /
sustain stronger Massline loads / deploy gravity fields / become an unusually good anchor* — and it
maps nearly 1:1 onto rows that already exist. **The agency is built. The UI discards it.** A node
today paints a rounded box, a wrapped name, credits, RP and a padlock: cost and gate, nothing about
capability.

**Two structural defects that are data, not layout:**

- `mod_massline_spool_l` (`tetherSpoolMult: 6` — the ceiling of the signature mechanic) has
  `requiresTech: 'tech_flagship_command'`, which costs **2,500,000 cr + 1,200 RP**, sits behind
  `tech_capital_hulls` + `tech_graviton_drives`, and unlocks the Leviathan. **To max the Massline
  you must first buy into capital-ship command.** VISION.md forbids collapsing into an X4-style
  empire manager; the signature mechanic's ceiling is gated behind exactly that.
- `tech_advanced_navigation` unlocks nothing but `jumpRangeMult +0.20 / jumpCooldownMult −0.15` — a
  pure number node, the "170 → 212" failure case VISION.md names.

**What to ship — one screen, three bands, DOM not canvas:**

1. **Top — the hull.** Reuse the Shipworks 3D stage and spatial hardpoints. Progression is shown *on
   the machine*, not in a chart in another room. This is what makes it "my ship."
2. **Middle — capability cards, not a DAG.** ~8 tracks phrased as verbs: *Tow & Swing*, *Hit Things
   Hard*, *Take a Hit*, *Reach & Grab*, *Bend Space*, *Go Dark*, *Dig*, *Haul*. Each states in one
   sentence what you can do now and what the next step buys — *"You can tow a 40t hauler. Next:
   swing a frigate."* The prereq DAG stays underneath as the rule engine and stops being the
   picture. Card = `.sf-card`, step = `.sf-chip`, reach = `.sf-data-bar`: **zero new CSS, and it
   makes the primitive layer live for the first time** (§3.8).
3. **Bottom — consequence readout.** Fitting X changes mass, handling, spool load, impulse. Show the
   delta in physical units the player feels. **Never DPS.**

**Authoring rule:** every node earns a verb sentence or it merges into its neighbour.
`tech_advanced_navigation` fails and should fold into Long-Range Survey. Reparent
`mod_massline_spool_l` onto a Massline-native node.

---

## 6. Sequencing

The 2026-08-12 ruling — **redesigning the station before flattening `station-workbench.css` just
becomes override layer #5** — is retained and is scoped to the three runtime-injected station
sheets. Verified: `stationApp.js` injects them **only inside the station**, so the ruling **does not
gate either thing the owner asked for.** In-flight ship access and the capability surface cannot
become override layer #5. Scope around it; do not skip it where it applies.

The flight HUD, however, has the *same disease* in `injectHudCss` (§3.1) and needs the same
discipline: **reconcile layers 1–4 rather than appending layer 5.**

Ranked by player-visible impact ÷ effort. Collision risk is against the **live performance agent**
working per-frame HUD DOM writes (`design/perf/lead4-hud-dom-writes-REPORT.md`).

**Owner** column: `THIS` = this document. `HFA` = `design/HUD_FLIGHT_ATTENTION.md` — listed only so
the two plans do not collide or double-work; **do not action HFA rows from this document.**

| # | Work | Owner | Impact | Effort | Perf collision |
|---|---|---|---|---|---|
| 1 | **Un-blind live screens** — give non-`PAUSING_SCREENS` a `body.ui-live-screen` class instead of `.ui-modal-open`; backdrop ~25%, HUD ~0.5, reticle + alerts survive (§3.5) | **THIS** | **Very high** | Low | **Low** — CSS + one class toggle |
| 2 | **Open the ship in flight** — Shipworks minus commerce on a free key (§5.2) | **THIS** | **Very high** | Med | **None** |
| 3 | **Fix the tech-tree canvas fonts** (§3.9) — resolve tokens via `getComputedStyle` before assigning `g.font` | **THIS** | High | Trivial | **None** |
| 4 | **Make each node say what it does** — capability sentence + unlock chips on the node face (§5.5) | **THIS** | High | Low–med | **None** |
| 5 | **Reparent the Capital Massline Spool; fold the pure-stat node** — two data edits in `tech.js` (§5.5) | **THIS** | Med | Trivial | **None** |
| 6 | **Full-bleed screen shell**; fix the clipped Mission Log (§3.7) | **THIS** | High | Med | **None** |
| 7 | **Quick-verb radial** + a visible chip for the existing `I` cargo panel (§5.3) | **THIS** | High | Med–high | **Medium** — new isolated file |
| 8 | **Replace native `<select>` controls** (§3.5 / §4.4) | **THIS** | Med | Low | **None** |
| 9 | **Adopt `sf-*` primitives in new work** so the design system ships somewhere live (§3.8) — do not retrofit the 44 injectors | **THIS** | Med | Low | **None** |
| 10 | **Retire the legacy screens (~10,780 lines)** (§3.10) | **THIS** | Med (load time) | Med | **None** |
| 11 | **Flatten `station-workbench.css`** (appearance held constant), then redesign interiors | **THIS** | Low → High | High | **None** |
| — | HUD type-size + tracking reconciliation; unbox the panels; delete `backdrop-filter` and raw hex; complete reduced-motion; stop at-rest `infinite` pulses; Massline instrument | *HFA* | — | — | Coordinate — this is where the perf agent is working |

**Item 13 has a stated cost:** `check-ui-screen-imports.mjs` (a hardcoded 17-entry list) and
`check-command-deck-ui.mjs` (11 entries, five pointing at dead files) both *require* those files to
exist with specific strings. **Both checks must be repointed at `src/ui/station/` first** — which
also fixes the fact that the live docked station is currently linted by neither.

**Success test for item 11 is "looks identical, file is half the size."** If it looks different, it
became override layer #5.

Items 1, 3, 5 and 8 are small CSS or data edits that can land immediately without touching a writer
site the perf agent is guarding. **Items 1 and 2 are the two that answer the owner's actual
complaint** and neither is blocked by the station-stylesheet ruling or by the HUD plan.

---

## 7. Verification obligations

Must stay green: `check:ui-a11y`, `check:wcag-contrast`, `check:ui-identity`, `check:ui-frame-sleep`,
`check:ui:perf`, `check:ui-effects`, `check:command-deck-ui`, `check:one-voice`, and
`check-station-tab-navigation-runtime`.

Standing constraints: token-only colours; no `backdrop-filter`; no remote fonts; no idle rAF;
reduced-motion degrades to a legible static state; one top-center transient channel.

**A green check is not proof — and this document contains three proofs of that:**

1. The clipped Mission Log card passes every check in the suite.
2. `check:ui-frame-sleep` inspects rAF and cannot see ~12 compositor-side `infinite` CSS keyframes.
3. The tech tree renders in the wrong font at the wrong size on every frame, and nothing reports it.

**Visual confirmation against a captured frame is required for every item in §6.** A companion
prototype lives at `_uilab.html` (repo root, following the `_*lab.html` convention) showing the
current and proposed treatments side by side for the flight HUD and the progression screen.
