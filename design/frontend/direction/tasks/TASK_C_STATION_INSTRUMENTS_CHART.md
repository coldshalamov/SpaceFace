<!-- LIFETIME: ACTIVE_PACKET -->
# Task C — The station, the instruments and the chart (queue: `PQ-162.00`–`.02`, `PQ-188.01`, `PQ-188.02`, `PQ-168.00`–`.01`)

**Read first:** [`../DIRECTION_SHEET.md`](../DIRECTION_SHEET.md) (all of it; your screens are under
"The station" and "The instruments" in §2, and §6 — the dense register — is your hardest rule),
then [`../KIT_SPEC.md`](../KIT_SPEC.md) (all of it). Task A must be accepted before you start. You
add to the kit only what §1.1 below names, and record it.

**Outcome in one sentence:** docking is an arrival at a place — the berth with your hull in it,
the station's name large, the destinations as words along the bottom edge — every station screen
sits over that berth in the new look with the market as the dense-register proof, and THE SHIP,
THE FOOTPRINT, THE RANGE and the chart are rebuilt on the kit with their centrepieces and verbs
kept.

Files you own: `src/ui/station/**`, `styles/station.css`, `styles/station-workbench.css`,
`styles/station-berth.css`, `src/ui/ship/**`, `src/ui/screens/footprint.js`,
`src/ui/screens/range.js`, `src/ui/galaxyMap.js`, `src/ui/map/**` (presentation only),
`src/ui/dockArrival.js`, `src/ui/shipLedgerPanel*` (whatever `createShipLedgerPanel` lives in),
`src/ui/listControls.js` (rendered classes only). Task B owns the shell and the HUD; Task D owns
the Crucible, the Works, the reading screens and the sweep. Do not enter their files.

---

## 0. Before the first edit

1. `git status --short`, `node scripts/check-now-liveness.mjs`, your `NOW.md` row, `npm run check:baseline`.
   Tasks B, C and D edit `styles/kit.css` and `src/ui/kit/temperature.js` in parallel: append your
   permitted rules under a `/* Task C additions */` comment at the end of `kit.css`, keep
   `temperature.js` edits to the lines this file names, and `git pull --rebase origin master` before
   every push.
2. Confirm the facts this task relies on (audited 2026-09-06):
   - **Docked is not a mode.** `state.ui.docked === true` (set `uiRoot.js` ≈ 898, cleared ≈ 947); the
     world canvas **stops redrawing while docked** (`src/core/renderUpdatePhase.js` ≈ 25–31 returns
     early) and holds its last frame behind the station's opaque DOM. There is no berth scene and no
     docked camera. Do not change the render phase; the berth is built with the hull mount (§1.2).
   - The station: `src/ui/station/stationScreen.js` (id `station`, adds `sx-fullbleed` to the
     host) → `createStationApp(rootEl, ctx)` in `stationApp.js` builds `div.sx-app` from one
     `innerHTML` (≈ 164–217: `.sxb-fascia` crown with `.sxb-berth__name`, `.sxb-vitals`,
     `.sxb-purse__value`, `button.sxb-launch[data-act=undock]` with `.sxb-launch__state` and
     `data-state="ready|check|risk"`; `main.sx-workspace` with `.sx-operation-rail` and
     `section.sx-screen` holding `#sx-panel[role=tabpanel]`; `.sx-pop`; `aside.sx-comms` receipts).
     Three sheets are injected in order (≈ 67–85). `DESTINATIONS` (≈ 87–96): `market`,
     `shipworks`, `industry`, `contracts` (label "Missions"), `factions`, `bar`, `ledger`.
     `createCommandDock` (`dock.js` ≈ 32–207) builds `button.sx-tile[data-nav][role=tab][id=sx-tab-<id>][aria-controls=sx-panel]`
     with roving arrow keys. `navigate(id)` (≈ 544–573) swaps `#sx-panel`'s child, sets
     `app.dataset.operation`, emits `audio:cue ui_tab`, persists screen memory. Docking opens the
     station and navigates to the remembered destination, else `market`; `applyDockAttention` may
     pick `contracts` or `bar`. The exit gate is `station:exitRequest` → departure check popover
     (`sx-pop--dep`, "Launch Anyway") → `dock:undocked { committed: true }` (≈ 741).
     Vitals (`renderStatus` ≈ 853–920) carry their service verbs (Repair/Wash/Insurance on Hull,
     Refuel on Fuel, Sell on Hold, Resupply on Munitions).
   - Checks (read each before touching its surface): `check:station-tabs` (browser: pointer +
     keyboard on the dock), `check:station-shell` (reachability, intents, a11y, real economy
     mutations; "does not prescribe panel topology, palette or visual technique"),
     `check:station-egress` (names `.sxb-launch`), `check:station-departure` (READY/CHECK/RISK
     painted on Undock + the popover), `check:market-nav` (source assertions: `applyTradeNavigation`,
     `computeBestTrades`, `describeTradeIntel`, `formatCargoUnits`, `unitPrice` used in
     `market.js`), `check:market-first-loop` (browser: read prices, trade, plot a route),
     `check:faction-standings`, `check:outfitting-buy-fit`, `check:ship-purchase-guidance`,
     `check:services-readiness`, `check:bar:narrative`, `check:station-hub-classes`,
     `check:station-missions-layout`, `check:station-ui-stability`, `check:station-interact-undock`,
     `check:station:overflow`, `check:station:tabstate`, `check:engineering-preview`,
     `check:data-states`, `check:entity-links`, `check:colour-tokens`, `check:type-floor`,
     `check:map-authority`, `check:map-nav-context`, `check:map-information-depth`,
     `check:map-camera`, `check:map-confidence`, `check:map-never-lost`, `check:map-frames`,
     `check:starmap-objective`, `check:localmap-routes`, `check:mission-log-map`.
   - THE SHIP and the station's Shipworks share **one** stage: `getSharedShipStage(ctx)`
     (`shipworks.js` ≈ 371), root `sx-sw` (+`sx-sw--flight` in flight), re-parented by
     `src/ui/ship/shipScreen.js` (id `ship`, key F2). `src/ui/shipEngineeringStage.js` is dead
     code (no callers) — leave it for Task D's sweep. The stage's classes (`sx-sw__*`,
     `sx-sw-band*`, `sx-hardpoint*`, `sx-chooser*`, `sx-modrow*`) are styled only in
     `styles/station-workbench.css`. The four bands are rendered by `renderApron` (≈ 1162–1267);
     hardpoints by `renderSpatialSlots` (≈ 1376–1407) with projected positions; orbit by pointer
     and wheel on the canvas (≈ 2390–2429). Models: `src/ui/ship/shipBandModels.js`.
   - THE FOOTPRINT (`footprint.js`, id `footprint`, F3): DOM nodes (`.fp-chain > .fp-cell >
     button.fp-node`) plus an SVG edge layer (`.fp-edges`); columns ACT · INCIDENT · STANDING ·
     CONSEQUENCE; an ASCII heat field (`_renderHeatField`); crest line with the display word
     CLEAN/MARKED/WANTED; three data states (`LEDGER_SYNC`, `LEDGER_FAULT`, `NOTHING_STANDS`);
     data from `state.provenance.chains`/`openIncidents`, `state.player.heat`, `bounty`; shared
     `fp-*` rules in `styles/ui.css` plus a local block.
   - THE RANGE (`range.js`, id `range`): canvas 2D inside `.sf-range__box`; four rungs
     (`RAIL_ROWS` ≈ 147–152); `canvasRoles()` (≈ 28–42) reads the seven grammar roles
     `--sf-you/foe/goal/calm/paper/surface/edge` for the canvas; cleared state in
     `state.ui.rangeCleared`; a drawer with Rules/Bestiary tabs; local style block.
   - THE CHART is `src/ui/galaxyMap.js` (id `galaxyMap`, 11k lines, canvas 2D, prefix `gm-`,
     one injected block ≈ 2180); `starmap.js`/`localmap.js` are legacy and stay registered for
     checks — do not restyle them. Header `.gm-head` (title lockup, search, scale buttons
     local/system/galaxy, weather, hint, close); left rail of five `details` sections (lenses,
     missions, bookmarks, alternatives, key); the viewport canvas; right inspector with nine tabs
     (`MAP_INSPECTOR_TABS` ≈ 4089) and the actions Set waypoint · Plot course · Engage route;
     the apron with the route ribbon (`#gm-ribbon-arrival` is the route time; `mapRouteRibbon.js`
     is a pure model — "there is no route-wide time-of-arrival in state") and the cargo deck table.
     Selection: click picks (≈ 8428), double-click lays a course. Canvas colours come from an ink
     palette in the file (search `INK`).
   - Entity links (`src/ui/entityLinks.js`) mount a drawer **inside** the active screen root,
     absolute-positioned; keep `sf-drawerhost` behaviour and the `[data-entity]` attributes; the
     drawer's classes (`sf-drawer*`, `sf-tile*`, `sf-deck*`) get kit styling in §1.1.
   - The four data states (`src/ui/uiPrimitives.js` `mountDataState`/`dataStateHtml`) emit
     `.sf-state*`; `check:data-states` walks call sites and forbids `pulse|blink|flash` class
     names and `--accent`; you restyle `.sf-state` in `kit.css` and never touch the primitive.

## 1. The station

### 1.1 Kit additions this task is allowed (add to `styles/kit.css`, record in the receipt)

```css
/* Task C: a nested panel grid inside a screen, and a full-width row. */
.k-span  { grid-column: 1 / -1; min-height: 0; }
.k-panel { display: grid; grid-template-columns: var(--k-hang) minmax(0, 1fr); column-gap: var(--k-gap); min-height: 0; height: 100%; }
.k-panel--split { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.k-panel > .k-hang, .k-panel > .k-stage { grid-area: auto; }
/* Task C: the four data states and the entity drawer in kit clothes (markup owned by uiPrimitives.js / entityLinks.js). */
.k-screen .sf-state { display: flex; flex-direction: column; gap: calc(12px * var(--k-s)); max-width: var(--k-measure); background: none; border: 0; box-shadow: none; padding: 0; }
.k-screen .sf-state__glyph { width: calc(24px * var(--k-s)); height: calc(24px * var(--k-s)); color: var(--k-bone-62); }
.k-screen .sf-state--error .sf-state__glyph, .k-screen .sf-state--denied .sf-state__glyph { color: var(--k-red); }
.k-screen .sf-state__word { font-size: var(--k-fs-fine); color: var(--k-bone-38); letter-spacing: 0.08em; text-transform: uppercase; }
.k-screen .sf-state__head { font-size: var(--k-fs-sub); color: var(--k-bone-62); }
.k-screen .sf-state__fills, .k-screen .sf-state__detail { font-size: var(--k-fs-body); color: var(--k-bone-62); }
.k-screen .sf-state__verb { all: unset; cursor: pointer; font: 500 var(--k-fs-emph) var(--k-text); color: var(--k-signal); }
.k-screen .sf-state__skel, .k-screen .sf-state__bar { background: var(--k-hair); height: 2px; }
.k-screen .sf-drawer { position: absolute; top: var(--k-margin); right: var(--k-margin); bottom: var(--k-margin); width: var(--k-hang); background: none; border: 0; box-shadow: none; border-left: 1px solid var(--k-hair); padding: 0 0 0 var(--k-gap); overflow: hidden auto; }
.k-screen .sf-drawer__title { font-family: var(--k-display); font-weight: 800; font-variation-settings: "opsz" 96; font-size: var(--k-fs-sub); letter-spacing: -0.03em; line-height: .9; }
.k-screen .sf-drawer__kicker, .k-screen .sf-deck__label { font-size: var(--k-fs-fine); color: var(--k-bone-38); letter-spacing: 0.08em; text-transform: uppercase; }
.k-screen .sf-tile { display: flex; justify-content: space-between; min-height: var(--k-row); border-top: 1px solid var(--k-hair); background: none; padding: 0; }
.k-screen .sf-tile__k { color: var(--k-bone-62); font-size: var(--k-fs-body); }
.k-screen .sf-tile__v { color: var(--k-text-live); font-size: var(--k-fs-emph); }
.k-screen .sf-entity-link { all: unset; cursor: pointer; color: var(--k-text-live); border-bottom: 1px solid var(--k-hair); }
.k-screen .sf-entity-link:hover, .k-screen .sf-entity-link:focus-visible { border-bottom-color: var(--k-signal); }
.k-screen .sf-drawer__verb { all: unset; cursor: pointer; font: 500 var(--k-fs-emph) var(--k-text); color: var(--k-signal); }
.k-screen .sf-drawer__x { all: unset; cursor: pointer; font-size: var(--k-fs-body); color: var(--k-bone-62); }
```

Nothing else is added to the kit by this task.

### 1.2 The station shell (`stationApp.js`, `dock.js`, `stationScreen.js`, the station sheets)

The three station sheets become **one** `styles/station.css`, rewritten from scratch with kit
tokens only and the §12 bans, containing rules only for classes that still exist after this task.
`stationApp.js` injects only that sheet (keep the id `sx-station-css`). Delete
`station-workbench.css` and `station-berth.css` when nothing references them (grep `scripts/`
and `test/` too; `check:station-hub-classes` reads root classes from `stationHubModel.js`, not
CSS).

Sheet (amended): *Docking is arrival, not a menu: the berth with your hull in it, the station's
name at hero size, one line of local news in emphasis size, the destinations as words in a row
along the bottom edge, Undock as the one primary word at the row's end with its readiness beneath;
credits and the four vitals with their service verbs as a quiet column top-right. The frame warms
to the docked scrim. A low swell.*

The `.sx-app` root (the host `.screen` gets `k-screen`; `.sx-app` becomes a plain wrapper with
`display: contents`, or move the kit classes to `.sx-app` and make it `position:absolute; inset:0`
— pick the former):

| Region | Content |
|---|---|
| `.k-world` | a canvas with `createShipPreviewMount(canvas, { dockId: shipworksDockIdForState(ctx.state), authoredShips: true, allowFastFallback: false, onFirstFrame → data-k-ready })`, `show(<player defId>, { rotating: false, fittings: <the player's fittings as shipworks derives them>, isPlayer: true })`, `setZoom(1.0)`, the slow yaw from Task A's title (`rotateBy(dt * 0.06)`, none under reduced motion). This is the berth. When the destination is `shipworks`, `setActive(false)` and hide the canvas (the shared stage shows the hull); re-activate on leaving |
| `.k-title` | `h1.k-display.k-t-hero.sxb-berth__name` the station's name at **hero** size (112) on arrival; after the arrival settles (1.2 s) it stays hero on `bar`/`factions`/`industry`/`ledger` and drops to `k-t-title` (80) on `market`, `shipworks`, `contracts` where the stage needs the room — implement as a class toggle in `navigate`; `p.k-t-emph.k-62` = the dock arrival's `news` line from `buildDockArrival(state, station)` (fallback: authority · traffic) |
| `.k-corner` | `.k-hero` credits (`.k-hero__n.sxb-purse__value` tabular, word "credits"), then `ul.k-rows` of four `k-row--static` rows (`--k-row-cols: 1fr auto auto`): label (Hull / Fuel / Hold / Munitions) at body 62 %, value at emphasis 100 % (`.sxb-vital__value` hook, `data-tone` kept: `bad` → `k-bad`, `warn` → `k-signal`), and the service verb as `k-word--fine` (`.sxb-vital__act` hook) with its price — only when applicable, as today. The stage content leaves this region clear: `.k-stage > .k-title-like` blocks get `padding-right: calc(420px * var(--k-s))` on `market`/`contracts`/`shipworks` |
| `#sx-panel` | `class="k-span"`; each destination's element is a `.k-panel` (or `.k-panel--split`) |
| `.k-foot` | `dock.js` builds `ul.k-words.k-words--row[role=tablist]` of `button.k-word.k-word--body.sx-tile[data-nav][role=tab][id=sx-tab-<id>][aria-controls=sx-panel]` — the seven destination words (labels as today; "Missions" for contracts), `aria-current` on the live one, arrow keys and the pointer field kept (drop the `--dock-scale/lift` transforms: words do not grow); then, pushed to the row's end (`margin-left: auto`), `button.k-word.k-word--emph.k-word--primary.sxb-launch[data-act=undock][data-state]` "Undock" with `div.k-word-sub.sxb-launch__state` = "Ready" · "Departure check" · "Risk" (`departureReadinessSummary`) |
| receipts (`.sx-comms`) | one line at the bottom-centre of the foot area at body size 100 %, text only (`.sx-receipt__title` + `__delta`), fades by `k-out`; the history toggle as a `k-word--fine` |
| popovers (`.sx-pop`) | keep floating-ui positioning; the popover is a transparent block with a hairline top rule, rows (`k-rows`) and words; Departure Check: `.sx-depchip` rows with `k-good`/`k-signal`/`k-bad` text, "Launch anyway" as `k-word--emph.k-word--primary`; Hold: rows + "Sell" words; Help: sentences |
| the operation rail, backplane, sigil, `sx-screen__head` | delete (the foot words and the title carry the state) |

Arrival (moment 4): on the station's first show after `dock:docked`, `setTemperature` is the
kit's; the station stamps its name (`stamp` on the `h1` words, state `'station:arrive'`), then the
news line (`settle` top, delay 200), then the foot words (`stamp`, gap 60, delay 400), then the
panel (`settle` left/right, delay 700); the dock sound: verify the cue emitted on `dock:docked`
(`uiRoot.js` ≈ 909 emits `ui_confirm` today) and change it to `ui_dock` so the re-tuned swell
(`sfx_dock_clunk`) plays; the undock path already plays `sfx_undock_release`. On later
navigation only the panel settles. Undock (moment 5): `cue` is the game's; the panel and foot
`k-out` in 140 ms, then the existing fade.

Density: `navigate` toggles `k-screen--dense` on the host root for `market` and `ledger`.

### 1.3 Market — `.k-panel--split`

Sheet: *Left half: the commodity table in the dense register — name, buy, sell, stock — twelve
rows visible with hairlines, the selected row marked by a gold rule on its left edge. Right half:
the selected commodity's name at screen-title size and its price at hero size, one sentence of why
the price is what it is, and Buy and Sell as two words with a quantity beside them.*

| Region | Content |
|---|---|
| `.k-hang` | above the table: `ul.k-words.k-words--row` of `k-word--body` family filters (`.sx-mkt-filter` hook, `aria-pressed`) and `input.k-input[data-market-search]` (the existing search); then `dom.table({ head: [Commodity, Buy, Sell, Stock, Held], … })` — one `tr[role=tab][id=sx-market-tab-<id>][aria-controls=sx-market-instrument]` per commodity (keep the virtual list only if the row count exceeds 60; today it is under 50 — drop `createVirtualList` and its horizontal rail), `td.k-name` = the name via `entitySpanHtml('commodity:'+id, …)`, `td.k-num` × 3, held as `td` at data size 62 % (`12 u` or `—`); trend as a `k-good`/`k-bad` triangle glyph after the buy price (`▲`/`▼` text, allowed: it is a numeral's sign, not an icon); the tracked commodity's row gets a `◆` in fine print before its name |
| `.k-stage` (`#sx-market-instrument`) | `h2.k-display.k-t-title` = the commodity's name; `.k-hero.k-hero--hero.k-hero--signal` = the buy price (word "you pay") — or the sell price when the Sell word is live; `p.k-sentence` = `describeTradeIntel(...)` (the drivers, one sentence); the price history as an inline SVG sparkline 240×48 px, `stroke: var(--k-hair)` with the last point `var(--k-signal)` — keep `buildChart`'s data, drop its gradients and cursor chrome (`.sx-mkt-brush*`, `.sx-mkt-cursor`); then `ul.k-rows` of `k-row--static`: "Station pays" (sell), "Galactic average", "Demand" (as a word: low/normal/high — no pips), "You hold", "Hold free", "Credits"; then the quantity: `input.k-input.k-input--num.sx-qty__in` with `k-word--body` `fewer` / `more` / `Max` (`.sx-qty__b`, `.sx-qty__max` hooks; delete the slider); then the words: `Buy N` as `k-word--emph.k-word--primary.sx-trade__go.sx-trade__go--buy` and `Sell N` as `k-word--emph.sx-trade__go.sx-trade__go--sell` (the Buy/Sell segmented control `.sx-seg` is deleted — the two words are the mode; keep `.sx-seg__btn` hooks on them if `check:market-first-loop` clicks them; read that script), `p.k-t-fine.k-38.sx-trade__note`; then `k-caps` "Best routes from here" and three `k-row` rows (destination · profit `.k-row__num` · units) each with a `k-word--fine` "Set course" (`applyTradeNavigation`) |
| data states | `mountDataState` calls stay (`HOLD_EMPTY`, `EXCHANGE_DARK`) |

`check:market-nav` reads `market.js` source for the five function names — keep them in use.

### 1.4 Ledger — `.k-panel--split`

The `createShipLedgerPanel` output (`st-*` classes) is restyled once and serves both hosts (the
codex's Ledger tab too). Left: `.k-hero.k-hero--hero` = credits (word "credits"); `ul.k-rows`
of the twelve entries per page (`--k-row-cols: minmax(0,1fr) auto`): name/description at body,
the amount at emphasis in `k-good` or `k-bad`; page controls as two `k-word--body` (`previous`,
`next`). Right: the selected entry: `h2.k-t-title`, its lines as `k-sentence`s, rumours as
`k-sentence--emph`. Delete the ledger's own injected block in `screens/ledger.js` and the desk grid.

### 1.5 Missions (contracts) — `.k-panel`

| Region | Content |
|---|---|
| `.k-hang` | `k-caps` "Posted here" then `ul.k-rows` — one row per board slot (`--k-row-cols: auto minmax(0,1fr) auto`): the client's crest at `k-crest--row`, the job in one line (`.k-row__name`), the payout `.k-row__num`; `aria-selected` on the open one; then `k-caps` "Yours" and the active missions as rows with a `k-word--fine` "Track"/"Tracked" (`aria-pressed`, the `__track` hook) |
| `.k-stage` | the dossier: `h2.k-display.k-t-title` = the job's title; `p.k-sentence--emph` = the client (entity link) and type; `.k-hero.k-hero--hero.k-hero--signal` = the payout (word "on delivery"); `p.k-sentence` = the route in a sentence (origin → destination, jumps); `p.k-sentence` = the risk in a sentence (`RISK_LABEL` + what makes it risky); `ul.k-rows` of `k-row--static`: Payload (entity link + qty), Time, Collateral, Upfront, Follow-up; the gate/blocker line as `p.k-sentence.k-bad` when present; clauses as `k-word--fine` static words with their `data-why`; `Accept` as `k-word--emph.k-word--primary` (or the final-disposition variant's words) |

`check:station-missions-layout` — read it; keep the ids/classes it queries as hooks.

### 1.6 Factions — `.k-panel`

Left: `ul.k-rows` — one per faction (`--k-row-cols: minmax(0,1fr) auto`): name (prefixed
"Authority · " when it owns the berth), the standing as `.k-row__num` signed; a `.k-bar` under the
name showing rep (fill `--k-text-live`, the zero marker as a 1 px `--k-hair` line). Right: the
crest at `k-crest--hero` (top-right of the stage, under the corner column — `padding-right`
rule from §1.2 applies to the title only, the crest sits below it), `h2.k-display.k-t-title` =
the name, `p.k-sentence--emph` = "Current station authority" / "External power" + controls;
three `.k-hero` in a row: Now (tier word + signed rep), Next (N reputation), Hostility buffer (rep −
threshold) with `guidance.last/next/risk` as their words; then `k-caps` "Standing ladder" and the
tiers as `k-row--static` rows (name · min), the contract ladder likewise, "Next move" as a
`k-sentence`; the relation web SVG becomes `k-caps` "Relations" and `k-row--static` rows
(faction · Align/Rival · weight). Delete the dial SVG.

### 1.7 Industry — `.k-panel`

Left: `k-caps` per category, `ul.k-rows` of processes (name × qty at body, tier at
`.k-row__sub`, the `--signal` tone as the row's `k-good`/`k-signal`/`k-bad` name colour only).
Right: `h2.k-t-title` = the output's name; `.k-hero.k-hero--hero` = the output quantity (word
"per run"); `.k-hero` = time (word "seconds"); `k-caps` "Needs" then `k-row--static` rows: input
name, `have / need` at emphasis, missing inputs' name in `k-bad` with a `k-word--fine` "Source in
market" (`data-source-cmdty` hook); the queue/status as a `k-sentence` (`k-good`/`k-signal`/`k-bad`
by state); `Fabricate` as `k-word--emph.k-word--primary[data-build]` (or the block reason as its
label, `aria-disabled`).

### 1.8 Bar — `.k-panel`

Left: `k-caps` "Here tonight", `ul.k-words` of contact names (`k-word--emph`); then `k-caps`
"Leads" and `k-rows` (lead title · `k-word--fine` priced verb). Right: `p.k-caps` = the role,
`h2.k-t-title` = the contact's name, `p.k-sentence--emph` = the reply (the quote), then the
choices as `ul.k-words` of `k-word--emph` (`.sx-choice` hook); the avatar (`[data-bigpic]`) is
the one image allowed: 240 px tall, no frame, right of the name. Empty: `p.k-empty` "Nobody here."
The world behind at the docked scrim (the sheet's "room, lit warm" is the berth for now; note it).

### 1.9 Shipworks and THE SHIP — the shared stage (`sx-sw`, `styles/station.css` rules)

Sheet (THE SHIP): *The hull at full bleed, orbitable. Labels pinned to the hull by hairline
leaders. The four bands — handling, power, condition, capability — as four hero numbers along the
bottom edge with a word each; the selected band explains itself in one sentence.* Sheet
(Shipworks): *the parts as a column of words on the left; the selected part's name at screen-title
size, its effect as one number that changes on the hull's bands, Install as one word.*

One restyle serves both hosts. The stage root `sx-sw` becomes a `.k-panel` in the station and, in
flight (`sx-sw--flight` on the `ship` screen, whose host root gets `k-screen k-screen--stage`), a
`.k-panel` whose hang column is the fitted-module list:

| Element | Treatment |
|---|---|
| `.sx-sw__stage` + `canvas.sx-sw__canvas` | the canvas fills the whole panel (`position:absolute; inset:0; z-index:-2` on the panel, like `.k-world`), shifted so the hull sits at 66 %; orbit and wheel wiring unchanged; `is-dragging` cursor kept |
| `.sx-sw__nameplate` | the title block: `h2.k-display.k-t-title` = the hull's name, `p.k-sentence--emph` = its blurb ("Turns wide. Sluggish under load. Stops badly.") |
| `.sx-sw__gauges` (six dials) | the corner: `k-rows` of six `k-row--static` compact rows (Mass · Energy · Shield · Cargo · Thrust · Heat; value at emphasis); no dials |
| `.sx-hardpoint` | `.k-pin`: the label `b` at data size 100 %, `em` at `k-pin__sub`; `.sx-hardpoint__leader path` `stroke: var(--k-hair)`; `.sx-hardpoint__reticle` a 4 px `--k-bone` square; `is-selected` → the label in `--k-signal`; `is-empty` → 38 % |
| `.sx-sw__stats` (the apron) | the foot: four `.k-hero` blocks — Handling: n = the top-speed bar's value, w "top speed"; Power: n = the headroom (`+2/s`), w "power" (`--you` → `k-good`, `--foe` → `k-bad`); Condition: n = the verb (Sound), w "condition"; Cargo: n = the hold capacity, w "hold"; the selected band (click/focus) shows its detail as `k-row--static` rows beneath the foot (handling's four bars as rows with a `.k-bar`; power's cap/regen/draw; condition's marks; capability's chips as `k-word--body` static words) |
| `.sx-sw__rail` / `.sx-sw__list` (module carousel) | the hang column: `k-caps` "Fitted" and `ul.k-rows` of fitted modules (name · role, effect number at `.k-row__num`), then `k-caps` "For sale" (station host only) and the purchasable modules as rows (name · price num); `aria-selected` on the chosen one |
| `.sx-sw__side` | the stage-right column (under the corner): `h3.k-t-sub` = the selected part's name, `.k-hero` = its effect number (the delta the hull's bands show as ghost), `p.k-sentence` = what it does, `Install`/`Buy and fit` as `k-word--emph.k-word--primary`, `Remove` as `k-word--emph` |
| `.sx-chooser` (modal picker) | no modal: the chooser's list replaces the hang column's content while choosing (`__scrim` deleted; `__panel` becomes the hang; `__x` a `k-word--body` "Back") |
| `.sx-sw-verbs` (Take it to the range · Record · Fit · Activate) | `ul.k-words.k-words--row` of `k-word--body` at the foot's right end |
| ghost/preview (`.is-ghost`, `.sx-sw-ghost`) | ghost values as `k-38` text beside the live value, no chips |
| `.sx-sw__power` beams, `.sx-sw__focusline`, `.sx-sw__baylines`, `.sx-sw__dragcue`, `.sx-sw__delta`, `.sx-sw__acquiring` | beams and lines `stroke: var(--k-hair)`; the drag cue one fine-print line "Drag to orbit · pinch to zoom" bottom-right of the stage; `__acquiring` is a data state (keep) |

`check:engineering-preview` reads code paths (derived stats), not DOM. `check:outfitting-buy-fit`
and `check:ship-purchase-guidance` — read them; keep hooks.

### 1.10 THE FOOTPRINT — `k-screen` (default grid), `footprint.js`

| Region | Content |
|---|---|
| `.k-title` | `h1.k-display.k-t-title` = the display word (Clean / Marked / Wanted, sentence case; `fp-display--*` hooks kept); `p.k-t-emph.k-62` = the crest sentence (standing · heat tier · clears in · radius · open chains) |
| `.k-corner` | `.k-hero.k-hero--signal` = the heat tier (`T2`) with word "heat · clears in 6 s"; when wanted the whole frame is already cold and the signal red |
| `.k-hang` | `k-caps` "Chains" and `ul.k-rows` — one per chain (the act's word · the stamp at `.k-row__sub`), `aria-selected` on the traced one |
| `.k-stage` | the traced chain's board: keep `.fp-board` → `.fp-chain` → `.fp-cell` → `button.fp-node` markup; style: column headers `k-caps` (Act · Incident · Standing · Consequence), nodes as `k-word--body` static words (`fp-node--live` 100 %, `--spent` 38 %, `--latch` `k-signal`), empty-column tags as `k-t-fine.k-38`, the SVG edges `stroke: var(--k-hair)` with the arrow marker fill `var(--k-bone-38)`; only the selected chain is drawn at full strength, the others at 38 % (or only the selected chain is on the stage and the rest are in the hang — choose the latter); the drawer (`.fp-drawer`) becomes the stage's lower half: `k-caps` "Chain record", `k-rows` of the record, the ledger as `k-row--static` rows |
| delete | `_renderHeatField` and the glyph block; the apron readouts (fold into the title sentence); `sf-footprint-style`; the `fp-*` rules in `ui.css` that no longer apply |

Data states (three) stay via `mountDataState`.

### 1.11 THE RANGE — `k-screen--stage`, `range.js`

| Region | Content |
|---|---|
| `.k-title` | `h1.k-display.k-t-title[data-range-rule]` = the rung's rule in sentence case ("Heavy hulls turn wide"); `p.k-sentence--emph[data-range-instruction]` = the instruction; the verdict line (`RULE CLEARED` / the because) as `p.k-sentence` in `k-good` or `k-bad` under it |
| `.k-corner` | `.k-hero` = cleared count over four (`2 / 4`, word "cleared"), `[data-range-cleared]` hook; gate progress as `k-t-fine` beneath |
| `.k-stage` | the canvas (`.sf-range__canvas`, `role=application`, keyboard focus kept) filling the stage; the beam element kept; the canvas paints **no** surface fill (find the surface `fillRect` in the draw loop and remove it so the sky shows); set the seven roles on the element `canvasRoles()` reads from — `--sf-you: var(--k-bone); --sf-foe: var(--k-red); --sf-goal: var(--k-signal); --sf-calm: var(--k-bone-38); --sf-paper: var(--k-bone); --sf-surface: transparent; --sf-edge: var(--k-hair)` — via a rule in the range's own block (permitted: canvas instruments keep one layout block, kit tokens only) |
| `.k-foot` | `ul.k-words.k-words--row` of the four rungs (`data-state` flown/cleared: cleared words carry a `✓` in `k-good` fine print after them), `aria-current` on the live one; at the row's end `Rules` and `Bestiary` as `k-word--body` that open the stage-right column with their rows (the drawer's content), `Close` likewise |

The rungs, the sims, `state.ui.rangeCleared` and the gate logic do not change.

### 1.12 The chart — `k-screen--stage`, `galaxyMap.js`

Do **not** restructure the chart's JS. Change the injected block's rules to kit rules, the ink
palette, the canvas background, and class swaps where the table says so. `mapAuthority.js`,
`mapRouteRibbon.js`, `mapNavContext.js` are untouched.

| Element | Treatment |
|---|---|
| the canvas | fills the frame (`position:absolute; inset:0; z-index:-2` on the screen root); the canvas clears to transparent (no `fillRect` ground — the sky is the ground; remove the ground fill in the draw loop); the ink palette constant (`INK`) mapped to kit values: paper/bright → `#eae6df`, dim → `rgba(234,230,223,.62)`, faint/grid → `rgba(234,230,223,.14)`, amber/hot → `#f2b950`, red/danger → `#ff4d3d`, green → `#9bd8a0`; every other hue in the palette becomes one of those six (record the mapping) |
| `.gm-head` | becomes the title block: `.gm-title` → `h1.k-display.k-t-title` = the **selected** place's name (or the current sector when nothing is selected — write it from `_selectedTarget` in `refresh`), `.gm-stamp` → `p.k-t-emph.k-62` = one sentence (type · authority · distance) and the route time (`#gm-ribbon-arrival` text appended: "· arrival 4 min" when a route is engaged); the scale buttons `.gm-scale-btn` → `k-word--body` in the foot; `.gm-search-input` → `input.k-input` in the corner with results as `k-rows` beneath; `.gm-weather` → `k-t-fine.k-38` under the search; `.gm-hint-btn`, `.gm-close` → `k-word--fine` |
| `.gm-left-rail` (five `details`) | the hang column: each `summary.gm-rail-sum` → `k-caps` with the count in fine print; lens buttons `.gm-layer-btn` → `k-word--body` with `aria-pressed` (`__state` text deleted); missions/bookmarks/alternatives items → `k-rows`; the key/legend → `k-row--static` rows (glyph at 16 px stroke `--k-bone-62` + label) |
| `.gm-right-inspector` | the stage-right column: `.gm-inspector-header` deleted; `.gm-tabs` → `ul.k-words.k-words--row` of `k-word--fine` (still `role=tablist`, roving keys kept, the nine ids kept); `.gm-inspector-content` → `k-rows` (`.gm-nav-row` rows: `-k` at body 62 %, `-v` at emphasis, `-d` at `.k-row__sub`); `#gm-set-course-btn` → `k-word--emph`, `#gm-plot-course-btn` → `k-word--emph.k-word--primary`, `#gm-engage-route-btn` → `k-word--emph`; the frame buttons → `k-word--body`; reasons as `k-t-fine.k-38` |
| `.gm-apron` | the foot: the ribbon as one `k-sentence--emph` (status · arrival) with the legs as `k-word--fine` static words separated by `·`; the cargo deck `.gm-deck-table` → `k-table` (commodity · here · there · profit) capped at six rows |
| `.gm-svc-chip`, `.gm-legend-row`, service glyph SVGs | glyphs stroke `--k-bone-62` at 16 px; chips become words |
| motion | delete every `@keyframes` except none; the scan ring (`triggerScanRing`) is a canvas draw — keep it but make it a single 400 ms fade with no repeat; reduced motion: no ring |

`check:map-*`, `check:mission-log-map`, `check:starmap-objective`, `check:localmap-routes` read
code paths and the legacy screens; run them all. The legacy `starmap`/`localmap` screens are not
restyled.

## 2. Captures, receipt, handoff

1. `node scripts/capture-ui-matrix.mjs --world --out=.devshots/frontend/C` and keep, at three
   widths: `station` (each of the seven destinations — the manifest has nested entries; add any
   missing), `ship`, `footprint`, `range`, `galaxyMap` (the three scales). The berth hull must be
   visible behind the station screens.
2. The docking clip: `.devshots/frontend/C/dock-arrive-1920.webm` (approach Helios Prime, dock,
   the station arrives).
3. The receipt `design/program/roadmap/receipts/FRONTEND-C-REPORT.md` per spec §13, plus: the
   station sheets deleted and the one that remains (line count), the ink-palette mapping, every
   hook class kept and which check needed it. Update the queue units `PQ-162.00`–`.02`,
   `PQ-188.01`, `PQ-188.02`, `PQ-168.00`–`.01` to `implemented` with an `IMPLEMENTED <date>:`
   prefix. Commit per screen; push; remove your `NOW.md` row; report in plain words.

## 3. How agents get this wrong on this task

- A market with cards, pips, a segmented control or a chart with gradients. It is a table, a
  name, a price, a sentence, and words.
- Painting `.sx-app` or any panel. The berth is the picture; the scrim is the only darkening.
- Leaving the hull out of the station because "the canvas is frozen" — the berth mount is the
  fix, and it is in this task.
- Two hulls rendering at once on shipworks (the berth mount must sleep there).
- Changing what a screen does: the trade math, the departure gate, the contract flow, orbit,
  trace, fly, the map's authority.
- Restructuring `galaxyMap.js`; anything beyond CSS, palette and class swaps there is out of scope.
- Keeping `station-workbench.css`/`station-berth.css` alive "for safety".
- Asking the owner anything.

## 4. Definition of done

- Docking arrives; the seven station screens, THE SHIP (both hosts), THE FOOTPRINT, THE RANGE and
  the chart match their sheet lines and the tables above at three widths with the world in the
  shot; old station sheets and blocks deleted; every check in §0 green; budgets re-baselined.
- Captures, the clip, the receipt, the queue updated, pushed.
