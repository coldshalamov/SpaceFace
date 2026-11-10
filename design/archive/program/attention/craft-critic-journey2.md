# Craft critic — docking journey (loading → dock → station tabs), round 1

Independent pixel review. The reviewer did not implement this work. Scope: the DOCKING half of the
player journey — `loading`, `station-dock`, `station`, `station-market`, `station-shipworks`,
`station-bar`, `station-ledger` — at 1920×1080 and 1280×720, plus a 24-control `station-market`
walk. Judged against `design/frontend/ORRERY.md` (warm bone at rest; one amber Hand; ice only for
data in motion; red only for threat; instruments/rings/arcs/scales — never generic CSS
cards/pills/underlined links).

Evidence (fresh shots, this review): `.devshots/ui-bench/critic-station/` —
`<surface>-1920.png` / `<surface>-1280.png` for all seven surfaces, `station-market--*.png` walk
frames (42 click + 13 hover), `_crop-*.png` zooms, `_sheet-*.png` contact sheets. Sources read:
`styles/intro.css` (ORRERY loading skin), `src/ui/station/stationApp.js`, `stationEffects.js`,
`stationScreen.js`, `stationArrival.js`, `src/ui/station/screens/{bar,market,shipworks,ledger}.js`,
`src/ui/views/marketPresentation.js`, `src/ui/views/stationFrames.js`,
`src/ui/station/stationCommands.js`, `styles/station.css`, `styles/station-orbital.css`,
`styles/station-workbench.css`, `src/ui/orrery/stationTabsLayouts.js`.

`station` and `station-dock` mount identically (same screen, no tab arg, `station_helios` fixture)
— the 1280 shots are pixel-identical (PIL diff max 0) and 1920 differs only in sub-pixel noise.
Both land on the contracts/missions board at rest. They are scored together.

## Score table — 0–10 per axis

| Surface | Viewport | Hierarchy | Readability | State clarity | ORRERY fit | Polish | Mean | Verdict |
|---|---|---|---|---|---|---|---|---|
| loading | 1920x1080 | 8 | 9 | 8 | 9 | 8 | 8.4 | **PASS** |
| loading | 1280x720 | 8 | 9 | 8 | 9 | 8 | 8.4 | **PASS** |
| station-dock / station | 1920x1080 | 9 | 9 | 8 | 9 | 8 | 8.6 | **PASS** |
| station-dock / station | 1280x720 | 8 | 8 | 8 | 9 | 8 | 8.2 | **PASS** |
| station-market | 1920x1080 | 8 | 8 | 9 | 8 | 8 | 8.2 | **PASS** |
| station-market | 1280x720 | 8 | 8 | 9 | 8 | 7 | 8.0 | **PASS** |
| station-shipworks | 1920x1080 | 9 | 8 | 8 | 9 | 8 | 8.4 | **PASS** |
| station-shipworks | 1280x720 | 7 | 8 | 8 | 8 | 7 | 7.6 | **FAIL** |
| station-bar | 1920x1080 | 8 | 8 | 8 | 8 | 8 | 8.0 | **PASS** |
| station-bar | 1280x720 | 7 | 7 | 8 | 8 | 7 | 7.4 | **FAIL** |
| station-ledger | 1920x1080 | 7 | 8 | 7 | 8 | 7 | 7.4 | **FAIL** |
| station-ledger | 1280x720 | 7 | 8 | 7 | 8 | 7 | 7.4 | **FAIL** |

Verdict rule: PASS = mean ≥8 and every axis ≥7.

## Special-attention answers

1. **Does the loading progress read as an instrument?** Yes. The progress is a ticked ring with an
   ice arc sweep and a bloom head (`styles/intro.css:495-505` — `.boot-ring` track/bloom/fill/head/
   marks), stage ticks on the ring per spec ("ticks round the outer ring"), the drawn logotype mask,
   the pct centered in the aperture, and the hidden DOM bar kept for the presenter (`:490`). Ice is
   legal here — loading progress is data in motion. The `ELAPSED 00:06` corner clock
   (`intro.css:462-477`) is a diagnostic, not the progress display, so the spec's "never a timer"
   holds — but at 172px the ring is modest for the first instrument the player sees.
2. **Does station docking read as a transition (not a cut)?** Partially, and unverifiable in motion
   from the bench (it mounts at rest). What the rest frame proves: the backdrop is the lit 3D berth
   stage (`stationScreen.js:14-17`), so you land *aboard* a rendered bay, not on a flat menu — the
   right read. What the code says about the motion: `effects.arrive()` is a 360 ms opacity +
   translateY(6px) fade and tab `navigate()` a 260 ms fade (`stationEffects.js:159-165`,
   cubic-bezier easing) — below §3.5's staged power-up (rings draw → scales tick → labels decrypt →
   Hand swings) and §6's "each tab arrives with a ring swing". The 650 ms stroke-draw on the route
   beam (`:163`) is the one authored move.
3. **Do the tabs communicate eligibility/payment/refusal?** Yes on market, partially elsewhere.
   Market rest: `SOLD OUT · Restock ~5s/…~5m` row labels, dimmed `—` buy cells, the "Not enough
   credits, stock, or hold space." sentence under TOTAL COST with the BUY lamp visibly desaturated
   (`station-market--25`, `--31`), HOLD arc 41/40u, DEBT/SETTLE/DRAW/REARM ledger actions, toast
   receipts (`LOAN COMPLETE +7,240 cr`, `MUNITIONS LOADED −792 cr`), and UNDOCK's state word
   flipping READY→CHECK after cargo ops. Contracts board: RISK scale (ROUTINE–ELEVATED–SEVERE),
   STANDING −3/+4, TIME, COLLATERAL, FOLLOW-UP, READINESS rows + ACCEPT Lamp Key — but the fixture
   contains only takeable jobs, so a refusal state is never photographed. Shipworks: EMPTY·S slot
   states read; module-fit eligibility is not exercised by the fixture.
4. **Clipped / off-frame / empty boxes:** four real items — the bar's `NEW ARRIVAL` badges clip
   mid-word at 1280; the shipworks stats rail and the bar's leads footer fall below scroll folds at
   720; the ledger's empty book leaves ~70% of the screen void; the sold-out hero numeral renders
   as a solid white slab. Details below.

## Findings — actionable only

**F1 — The command palette is a bordered, rounded, shadowed card with a bordered input — a
generic-CSS modal on an instrument screen.** Photographed open (`station-market--01`): the
"STATION ACCESS / Where to next?" dialog shows a visible rectangular border and corner radius on a
gradient slab, the "Find a service" field is a 1px-bordered rounded rect, and the selected row is
a filled slab inside a border. Source: `styles/station-orbital.css:234` (`.so-command-palette`:
`border: 1px solid #616c7b; border-radius: 10px; box-shadow: 0 28px 100px`), `:237`
(`.so-command-search` border + radius), `:240` (selected-row border + fill), `:243` (footer
`border-top`). Markup: `src/ui/station/stationCommands.js:10-12`; trigger at
`src/ui/views/stationFrames.js:34`. Note `styles/station-workbench.css:15-21` intends to flatten
`.so-command-palette`/`.sx-pop` under `.sx-berth` (transparent border, radius 0, `--dp-field`, no
shadow) — the orbital rules evidently still win the cascade for the palette, and `.so-command-search`
has no flattening rule at all. → Re-skin the palette as an ORRERY Unfold layer: borderless glass,
ladder rows on a scale, the service glyphs bone, selection by the Hand tick — not a slab.

**F2 — Sold-out commodities render the hero price as a giant em-dash that reads as a UI artifact.**
`station-market--31`/`--42` (zoom `_crop-soldout-numeral2`): where "33" sits for priced goods, a
sold-out row paints a ~135×6px solid bone bar beside "YOU PAY · ONE UNIT NOW" — at display weight it
reads as a stray filled rect, not a glyph. Cause: `src/ui/views/marketPresentation.js:8`
(`quoteFmt` → `'—'`) feeding the hero slot at `:480`. → For `buy == null` render "SOLD OUT" at label
size in the hero slot (or dim the numeral treatment to a thin dash at `dfeeff`/low alpha) and let
"Unavailable" own TOTAL COST — it already does.

**F3 — Bar @1280×720: `· NEW ARRIVAL` badges clip mid-word at the contacts ladder's right edge.**
`_crop-bar-badges` (from `station-bar-1280`): "PILOT · NEW ARR", "BARKEEP · NEW ARRIVAI" — the badge
runs past the ladder's visible column and hard-clips. The wide contact grid
`grid-template-columns:560px …` only engages ≥1500px
(`src/ui/orrery/stationTabsLayouts.js:969`); at 1280 the `.sx-bar__hang` column is narrower while the
row keeps `width:100%` + clip (`styles/station.css:252`, `.sx-bar-row` `station-orbital.css:195`).
→ Under 1500px, condense the badge (e.g. a `· NEW` marker or a tick), or give the rail a wider first
column; do not clip words mid-glyph.

**F4 — Bar @720 height: the third LEAD row and the `OPEN THE BOARD · 5 / Play Manifest` footer sit
below the scroll fold.** `station-bar-1280` bottom vs `_crop-bar-leads-1920`: 1920 shows three
priced leads + the board verb; 720 shows two leads and no footer (`.sx-bar__hang` overflow scroll +
20px fade mask, `styles/station.css:252` + `:1304`). The verbs exist (scrollable) but the board
entry point is invisible at rest at 720. → Pin the footer outside the scroll region, or shorten
contact rows at ≤800px height so one footer row clears.

**F5 — Shipworks @1280×720: the stats rail folds after `Agility` — Inertia, Brake, BUILDS and
`SAVE FIT 0/6` are below the fold.** `_crop-sw-left` vs `_crop-sw-left-1920`: the 1920 rail carries
three scales + BUILDS + SAVE FIT; at 720 the rail ends at the Agility scale (`.sx-sw__stats`
`max-height:50%`, `styles/station.css:422`; observatory-scoped `min-height`/`overflow` rule
`styles/station.css:1962`). Everything is reachable by scroll, but at rest the screen's
only build verb is invisible. → Raise the rail's floor at ≤800px height (tighter row rhythm) or
hoist SAVE FIT above the scroll region.

**F6 — `SAVE FIT 0/6` renders as a plain `›` text row, not the amber Lamp Key the sheet prescribes.**
`_crop-sw-savefit` (1920): bone text + chevron, no amber field/cut. `styles/station.css:2029`
comments "SAVE FIT is the ONE amber Lamp Key — amber field, dark ink, 45° cut, sheen." If the text
form is the inert (no-unsaved-fit) state it reads as a link, not a key; if the lamp only appears
when a fit is dirty, the bench fixture never photographs it. → Either always draw the key
(disabled = dimmed amber, matching market's desaturated BUY) or photograph/document the lit state.
Minor: the circular "TESSERA · 27.5 M" type lightly tangles with the ring's bottom tick scale at
1280 (`_crop-sw-center-low`).

**F7 — Arrival and tab transitions are plain fades, not the §3.5 choreography.** `effects.arrive()`
= opacity + `translateY(6px)` over 360 ms; `navigate()` = 260 ms fade + 8px lift
(`src/ui/station/stationEffects.js:159-165`), cubic-bezier easing — §3.5 specifies springs and the
staged power-up (glass → rings draw → scales tick → decrypt → numerals → Hand), and §6 Station asks
"each tab arrives with a ring swing". The route beam's 650 ms stroke-draw (`:163`) is the only
instrument move. The rested frame does read as an arrival aboard (berth stage carries it), so this
is a motion-contract gap, not a composition one.

**F8 — No §6 hub view is photographed.** The bench default lands on the contracts board; the dock
rail offers MARKET/SHIPWORKS/INDUSTRY/MISSIONS/FACTIONS/BAR/LEDGER — but §6's hub ("station name
huge; services on an Orbit Ring round the name with the Hand") exists nowhere in these shots.
Either the hub is a different shot id not in this pass, or the view doesn't exist — a structural
gap vs the spec worth the lane confirming.

**F9 — Minor chrome nits.**
- `FIND A SERVICE · CTRL K` is a bordered kbd pill on the head band
  (`stationFrames.js:34`, `dp-key dp-key--small` + `dp-kbd`) — generic pill chrome.
- Market secondary actions (`› REPAIR 22 CR`, `› INSURE`, `› DRAW`, `› SETTLE`, `› QUOTE BREAKDOWN`,
  `SELL ›`) are chevron text-link lists — functional and unbordered, but the weakest
  instrument-language element on the surface.
- `Find a commodity` click reported "no visible change" in the walk — the focus affordance is a
  bare caret; a focus tick on the field's scale underline would steady it.
- HOLD read `41/40u` in the mutated fixture — over-capacity display is a data nit, not chrome, but
  the gauge reads oddly.
- Ice-blue `▼/▲ %` deltas on the market ladder — legal under "ice = data in motion" (price movement
  marks) but worth an explicit sign-off since they're static glyphs.
- Loading `ELAPSED` corner clock: harmless diagnostic, but the spec's instrument-first loading
  screen could carry it as a scale tick rather than a timer if the lane wants strictness.

## What the walk verified (and did not)

- Command palette modal correctly captures hits (the 17 "UNREACHABLE after FIND A SERVICE" rows are
  the modal occluding the tab bar — expected modal behavior, not a defect).
- Hover gives a faint row light; the amber ladder tick stays on the *selected* row
  (`--hover-22`, `--hover-39`) — correct Hand semantics.
- Buy/borrow clicks update credits, debt, hold arc, ledger actions and fire toast receipts —
  payment state is legible end-to-end.
- Category filters re-render the ladder with per-category segmented tick strips and a "N OF 64"
  count (`--09`/`--11`/`--13`).
- Fixture limits: no contract refusal, no shipworks fit-change (SAVE FIT lamp), no bar offer
  purchase, and the ledger fixture is empty — those states are unverifiable from these pixels.
