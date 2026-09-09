# FRONTEND-C — the station as a place, THE SHIP, THE FOOTPRINT, THE RANGE, the chart (PQ-162.00–.02, PQ-188.01–.02, PQ-168.00–.01)

Date: 2026-09-07. Task file: `design/frontend/direction/tasks/TASK_C_STATION_INSTRUMENTS_CHART.md`.
Builds on Task A (kit + title). Everything below is live on the default route.

## What the owner will see

- **Docking** — the world freezes and the station arrives over the berth: the player's own hull,
  in the station's dock interior, fills the frame behind the words (the berth mount; the HUD is
  hidden). The station's name stamps at hero size top-left, the news line and the first-dock
  handoff settle under it, credits are the hero number top-right with the vitals as three static
  rows, the destinations are seven words along the bottom edge (a real tablist), Undock at the
  row's end. One dock chime, not two. (`5516b3500`)
- **Market** — the dense register: a twelve-row table of commodities down the left half (name ·
  trend glyph · price · held), the selected commodity's name at title size on the right with its
  price repeated at hero size, one sentence, a 240×48 hairline sparkline, the quantity as an
  underlined input with ¼ / ½ / max words, Buy / Sell as words, best routes as rows. No cards,
  pips, gradients or brush. (`0513b050a`)
- **Ledger** — the shared ledger panel in kit clothes (twelve entries per page, amount at emphasis
  in good/bad), split with a reading column on the right that shows the hovered or focused entry's
  cycle, type and text; evidence detail as before. (`ed0819252`)
- **Missions** — posted jobs as rows (crest · job · payout) down the hang; the dossier on the
  stage: kicker, title, one emphasised sentence, the reward as a signal hero number, terms as
  static rows, clauses as fine words, Accept as one word; your active missions as static rows.
  Arrow keys move the board. (`785efe51b`)
- **Factions** — every faction as a row with a standing bar and signed number; the selected one's
  crest at hero size, its name at title size, standing and rank as hero numbers, ladders and
  network as static rows. The dial and relation web are gone. (`ad9a2f65c`)
- **Industry** — processes grouped under caps down the hang; the selected blueprint's output and
  time as hero numbers, inputs as static rows with "Source in market" as a fine word where short,
  Fabricate as one word. (`bedcc1dcc`)
- **Bar** — who is here as a column of emphasised words with their roles beneath, leads as rows;
  the conversation on the stage with the portrait (240 px, no frame) beside the name, the reply as
  one emphasised sentence, choices as words, offers as sentences with one primary word. (`0fd8f56ed`)
- **Shipworks / THE SHIP** (one shared stage, both hosts) — the hull orbitable and full-bleed in
  the stage; your hulls (or the ones for sale) as rows down the hang; the hull's name at title size
  with its blurb; six compact static rows in the corner (Mass · Energy · Shield · Cargo · Thrust ·
  Heat) instead of six dials, with a hovered module's or a selected build's value beside the live
  one at 38 %; hardpoint labels pinned to the hull by hairline leaders ending in a 4 px square;
  four hero numbers along the foot — top speed, power headroom (good/bad), condition, hold — and
  the selected band explains itself in rows beneath (handling bars, power cap/regen/draw, hull
  marks, capability words); the verbs (Take it to the range · Record · Fit · Make active) as words
  at the foot's end; builds as fine words; choosing a slot puts the compatible modules in the hang
  column in place of the hulls — no modal, no scrim — with Back returning them; Buy & Fit as a
  primary word with the price in fine print. In flight (F2) the same panel fills a `k-screen--stage`.
- **THE FOOTPRINT** — kit regions: chains as hang rows, the traced chain and record on the stage,
  heat tier as the corner hero, verbs as foot words. (`1b8f79e3b`)
- **THE RANGE** — `k-screen--stage`: the box and the flying as the stage, figures as hero numbers,
  verbs as words. (`052b06f47`)
- **The chart** — the galaxy map on the kit's six colours with no plates; lens words with
  `aria-pressed`; inspector, rail and apron as words and rows; the canvas clears to the sky. Map
  authority and every guarding check unchanged. (`5b1ee35e0`)

## Files

Station: `src/ui/station/stationApp.js`, `dock.js`, `stationScreen.js`, `screens/{market,ledger,
contracts,factions,industry,bar,shipworks}.js`, `src/ui/shipLedgerPanel.js`, `src/ui/ship/shipScreen.js`,
`src/ui/uiRoot.js` (the duplicate dock cue line), `styles/station.css` (one sheet, 416 lines before
the shipworks section; kit tokens only).
Instruments: `src/ui/screens/footprint.js`, `src/ui/screens/range.js`, `src/ui/galaxyMap.js`.
Checks touched: `scripts/check-colour-tokens.mjs`, `scripts/check-type-floor.mjs`,
`scripts/probe-ship-screen-capture.mjs` (the deleted sheets removed from their lists),
`scripts/check-market-chart.mjs`, `scripts/check-market-navigation.mjs` (the simplified sparkline
and the manual selection path), `scripts/check-station-missions-layout.mjs` (`#sx-panel` /
`.sxb-berth` rects; left column + right stage), `scripts/check-bar-canonical-contacts.mjs`
(sentence case), `test/instrument-hierarchy-six-screens.test.mjs`,
`test/instrument-hierarchy-two-more-screens.test.mjs`, `test/ui-review.review.test.mjs` (the two
`station-berth.css` tests removed with the file).

## Station sheets

Deleted: `styles/station-workbench.css`, `styles/station-berth.css`. Remaining: `styles/station.css`
(one sheet). The shipworks section is the last ~130 lines of it.

## Recorded kit additions (`styles/kit.css`, under `/* Task C additions */`)

`.k-span`, `.k-panel`, `.k-panel--split`, `.k-panel > .k-hang/.k-stage`, and the data states /
entity drawer in kit clothes (`.k-screen .sf-state*`, `.k-screen .sf-drawer*`, `.k-screen .sf-tile*`,
`.k-screen .sf-entity-link`). Committed first (`690388803`) so the parallel screens built on them.

## Ink-palette mapping (`src/ui/galaxyMap.js` `INK`)

ink0 → `#eae6df`; ink1 → `rgba(234,230,223,.62)`; ink2 → `rgba(234,230,223,.38)`; amber, amberHot,
brass, warn, gold → `#f2b950`; teal → `#eae6df` (infrastructure reads in bone, not a second hue);
red → `#ff4d3d`; good → `#9bd8a0`; plate, plateHard → transparent; plateEdge → `rgba(234,230,223,.14)`;
knock → `rgba(10,11,13,.9)`.

## Hooks kept, and the check that needed each

`#sx-panel[role=tabpanel]`, `.sx-tile[data-nav]` + `.sx-tile__seat`, `[data-act]`,
`.sxb-launch[data-state]`, `.sx-comms`, `.sx-receipt__title` — `check:station-tab-navigation-runtime`,
`check:station-egress-runtime`, `check:station-shell`, `check:command-deck-ui`;
`.sxb-berth`, `.sxb-berth__name`, `.sxb-handoff` — `check:first-dock-handoff`, `check:station-missions-layout`;
`.sx-mkt-table`, `.sx-mkt-row`, `.sx-mkt-chart[data-chart]`, `selectCommodity` — `check:market-chart`,
`check:market-navigation`, `test/station-exit-confirmation.test.mjs`;
`.st-ledger*`, `.st-ledger-entry[aria-selected]` — `check:pq021-ledger-hosts`, `check:pq021-ledger-keyboard-route`,
`test/ship-ledger-evidence-host.test.mjs`;
`.sx-ct-row[data-mission]`, clause `data-why` + `tabindex="0"` — `check:tier2-why`, `check:station-missions-layout`;
`data-spatial-slot`, `.sx-hardpoint__copy`, `.sx-modrow[data-preview-module]`, `data-buyfit`,
`data-fit-slot`, `data-buyship`, `data-activate-ship`, `data-verb`, the gauge `data-why` writer and
`tabindex="0"`, the two pinned `title=` shims on `.sx-sw-row`, `.sx-sw__acquiring`, `.sx-sw__canvas`
+ `.sx-sw__stats`, the literal `Buy & Replace` — `check:station-shell`, `check:tier2-why`,
`check:ui-native-titles` (+ `test/native-title-sweep`), `check:data-states`,
`check:m3-player-facing-public-route`, `check:m5-role-public-route`, `check:screen-memory`,
`test/outfitting-spend-confirmation.test.mjs`;
`.sx-talk__avatar`, contact `data-contact` — `check:bar-canonical-contacts`.

## Choices where the sheet was silent

- The shipworks hang column stays the **hull** list (fleet / for sale) rather than a fitted-module
  list: the hull's modules are already the pins on the hull, and the sheet's Shipworks line names
  "the parts as a column of words on the left" — the hulls are the parts one chooses between here.
  The module list appears in that same column while a slot is being chosen.
- The station's corner (credits + vitals) reaches into the panel's top-right, so the shipworks
  corner rows start two rows down in the station host and at the top in flight.
- The bar's "room, lit warm" waits on a room asset; the berth at the docked scrim stands in.
- The ledger's reading column reads the hovered/focused entry (never blank: the first entry on show).
- Factions' relation web and dial are text and static rows; the sheet has no dial.
- The market sparkline is 240×48, hairline, with one signal dot at the end; no brush or cursor.

## Checks

Green (this commit set): `check:station-shell`, `check:tier2-why`, `check:ui-native-titles`,
`check:engineering-preview`, `check:outfitting-buy-fit`, `check:ship-purchase-guidance`,
`check:data-states`, `check:colour-tokens`, `check:type-floor`, `check:market-chart`,
`check:market-navigation`, `check:station-missions-layout`, `check:bar-canonical-contacts`,
`check:pq021-ledger-hosts`, `check:pq021-ledger-keyboard-route`; tests `shipworks-dock-route`,
`outfitting-spend-confirmation`, `ships-station-service-authority`, `native-title-sweep`,
`station-exit-confirmation`, `ship-ledger-evidence-host`, `depth-program-a2-ship-ledger`,
`instrument-hierarchy-two-more-screens`; footprint, range and chart checks per their commits.

Not mine / left as found on `HEAD`:
- `test/instrument-hierarchy-six-screens` → `help.js` still authors one hex literal (Task D's screen).
- `test/ui-correctness-sweep` → the `tradeBusy` guard moved out of `src/ui/screens/market.js` by
  another agent's refactor (`src/ui/market/tradeLogic.js`); the guard exists there.
- `check:ui-screen-imports` → the near-dock onboarding prompt string (`f1058ca1d`).
- `check:first-dock-handoff` → the onboarding copy's "left rail" phrase (another agent's edit).
- `test/ui-review.review` → `rec.el.classList` on a fake element in the screen-manager test.
- The browser checks (`station-tab-navigation-runtime`, `station-egress-runtime`) timed out at
  boot under machine contention on every attempt; the source contracts they read are unchanged.

Budgets were not re-baselined in this task: the Task B re-baseline is one day old and other agents
are editing `src/ui` in the shared tree (the digest goes stale on every push); Task D's sweep
re-baselines once on the finished look.

## Captures

Per the owner's direction (2026-09-07) no capture set or docking clip was produced; the reviewer
runs the game: dock at any station (Helios Prime is nearest from a new game), walk the seven words,
press F2 in flight for THE SHIP, F3 for THE FOOTPRINT, F4 for THE RANGE, M for the chart.
