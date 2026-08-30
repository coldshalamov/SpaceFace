<!-- LIFETIME: DURABLE -->
# SCREENS D — The Docked Station & the Meta Layer


> **2026-08-30 IDENTITY NOTE:** the visual identity mandates in this document that predate the
> 2026-08 revision (neon cyan/teal/mint/purple accents, Saira SemiCondensed, tracked-out micro
> labels, coloured left rails, glass/glow treatments) are **superseded** by
> [`INSTRUMENT_GRAMMAR.md`](./INSTRUMENT_GRAMMAR.md) §3/§4 (2026-08 revision): neutral charcoal,
> one blue accent #4f8fdd, desaturated semantics, Plex Sans/Mono, no rails/glass/glow/tracking.
> Read this document for its structural and interaction design; take every colour, type, and
> surface treatment from the grammar.

**Status:** per-screen design authority for `src/ui/station/` (the live docked station) and
`src/ui/screens/` (the meta layer). Subordinate to `design/frontend/INSTRUMENT_GRAMMAR.md` — type,
colour roles, motion contract, layout skeleton, disclosure tiers, naming rules and the technique
catalogue are settled there and are **not** restated here. This document supplies only what the
grammar deliberately leaves open: **the idea per screen** — what the centerpiece object IS, what
you physically DO to it, and what its silhouette looks like with the text removed.

**Out of scope, specced elsewhere:** `shipworks.js` (THE SHIP), the consequence graph (THE
FOOTPRINT), rules teaching (THE RANGE), the chart (THE CHART).

**Dead, do not touch:** `src/ui/screens/stationHub.js` (234 KB) is not the station. It survives only
because `stationApp.js` imports six helper exports from it (`departureReadinessChips`,
`departureReadinessSummary`, `firstDockHandoffVisible`, `firstDockHandoffSteps`,
`holdUnitSellPrice`, `setStationExitOwner`, `stationExitNeedsConfirm`). Those move to a small module
during the flatten; the file then dies. It is also the **only importer of `uiPrimitives.js`**, which
is why the sanctioned primitive layer currently ships in zero live screens.

---

## 0. WORK ITEM ZERO — reconcile `check:station-tabs` before anything else

`scripts/check-station-tab-navigation-runtime.mjs` is the pinning check for this whole area. **Its
locators no longer match the live shell.** This is verifiable from source and must be fixed before a
single interior is redesigned, or every subsequent change lands under a check that was already
looking at nothing.

| Check asserts | Live shell renders | Evidence |
|---|---|---|
| `.sx-readout` ×3 with `.sx-readout__track` ≥60 px, labels `['Hull','Fuel','Hold']` | `.sxb-vital` with `.sxb-vital__track` | `stationApp.js:776-846`; `.sx-readout` survives **only as orphan CSS** at `styles/station-workbench.css:90-93, 913` — no JS emits it |
| `.sx-dock [data-act]` ×4 = `repair/refuel/resupply/undock`, each with a `[data-cost]` label | dock is built with `actions: []`; the verbs moved onto the vitals as `[data-vital-act]`, Undock became `.sxb-launch` | `stationApp.js:239-244, 763-793, 180-183` |
| `.sx-handoff:not([hidden])`, `.sx-hstep[data-handoff]` | `.sxb-handoff`, `.sxb-hstep` | `stationApp.js:189, 223, 480-495`; `.sx-handoff/.sx-hstep` survive only at `styles/station.css:630-633` |

**The migration was correct** — a verb belongs at the meter it changes, not 600 px away — but the
check was never moved with it. Reconciliation rules:

1. **The rail is binding and untouchable.** Seven destinations in a `role=tablist` inside a
   `role=toolbar`, exact order `market, shipworks, industry, contracts, factions, bar, ledger`,
   exactly one `aria-selected="true"`, exactly one `tabindex="0"` (roving), `ArrowLeft/Right/Up/Down`
   + `Home` + `End`, every tab `aria-controls="sx-panel"`, panel `role=tabpanel` labelled
   `sx-tab-<id>`. **No screen in this document changes any of that.**
2. **The service verbs are not the rail.** They already left the dock by design. Re-point the check's
   action locator from `.sx-dock [data-act]` to the fascia (`[data-vital-act]` + `.sxb-launch`).
3. **`DOCK_ACTIONS` goes 4 → 5.** Insurance joins repair/refuel/resupply/undock (§A.7).
4. **Three metered vitals are the pinned set; action-only units are outside it.** The vitals list is
   variable-length: `renderStatus()` pushes a fourth `Munitions` unit with `track: false` whenever
   `costs.resupply && !costs.resupply.disabled`, and Insurance will be a fifth of the same kind. The
   check must assert *"the three vitals that carry a track are Hull, Fuel, Hold, each ≥60 px"*, not
   *"there are exactly three vital elements."* A naive rename without this breaks the check the day a
   player runs low on ammo.
5. Keep every behavioural assertion as-is: first-dock handoff routes to real destinations, Departure
   Check opens on a not-ready launch with ≥4 labelled button chips and a working "Launch Anyway",
   cross-system handoffs (Industry missing-input → Market buy mode; Bar lead → Contracts row;
   Factions relation node → that faction) all still hold. Those are the screens' contracts with each
   other and every redesign below preserves them.

---

## 1. The diagnosis

> **GRAMMAR CONFORMANCE (added in review).** This document was authored before the canonical
> colour block existed and references no role tokens. Every colour decision in it resolves to the
> §4 table below; where it names a raw hex or a station `--sx-*` token for a NEW element, substitute
> the matching role.

> **GRAMMAR CONFORMANCE (added in review).** Colour on this surface uses the canonical role tokens
> defined in `INSTRUMENT_GRAMMAR.md` §4 — `--sf-you` `#7af7d0`, `--sf-foe` `#ff5470`, `--sf-goal`
> `#ffb347`, `--sf-calm` `#84a0c8`, `--sf-paper` `#d3e6ff`, surface `#0b1220`, edge `#1d3350`.
> **`--accent` `#39d0ff` is roleless and may not be used.** Entry keys come from the canonical table
> in §10.5, which outranks this file.


### 1a. Five station screens have one silhouette

| Screen | Left | Centre | Right |
|---|---|---|---|
| market | `.sx-mkt__list` | `.sx-mkt__stage` | `.sx-mkt__console` |
| contracts | `.sx-ct__board` | `.sx-ct__dossier` | `.sx-ct__active` |
| industry | `.sx-ind__list` | `.sx-ind__stage` | `.sx-ind__console` |
| bar | `.sx-bar__rail` | `.sx-bar__stage` | `.sx-bar__leads` |
| factions | `.sx-fac__rail` | `.sx-fac__stage` | `.sx-fac__detail` |

`nav rail | section stage | aside column`, five times, each with `role="tablist"` on the rail. By the
grammar's one-line test, **four of these have no idea in them.** This is the owner's "cheap web game"
complaint stated mechanically — it is not a styling problem and no amount of interior polish fixes
it. **A redesign that puts a new interior inside the same three columns is a failed redesign.**

### 1b. Eight meta screens have one plate

`pause`, `newGame`, `settings`, `saveLoad`, `gameOver`, `help`, `codex` and the confirm dialog all
render `.screen.sf-menu` — `min-width:360px; max-width:min(92vw,920px); max-height:88vh;
backdrop-filter:blur(18px)`, a bordered gradient plate with a laser-sweep top edge
(`styles/menu.css:55-109`). That is precisely the pattern the grammar bans: *"a centred card
floating over a background image is banned — that single pattern is most of the current 'cheap web
game' read."*

**`mainMenu` is the only one that escapes**, via `.sf-menu--bare` (`menu.css:125-147`): no plate, no
border, no shadow, no blur, a left-anchored column at `margin-left: clamp(20px, 7vw, 120px)` over
full-bleed art. **That is the thing to lift.** The meta section below is, in one sentence: *every
meta screen becomes `--bare` over its own backdrop, and then earns a distinct silhouette on top of
that.*

---

## 2. The six station silhouettes, side by side

Written first and checked for mutual distinguishability. Text removed, these are six different
pictures. If two ever rhyme in implementation, one is wrong.

| Screen | Archetype | Verb | Silhouette with text removed |
|---|---|---|---|
| **MARKET** | a beam you tip | **WEIGH** | one horizontal beam on a centre fulcrum, tilted, a pan hanging at each end; a rack of small square tiles beneath it |
| **CONTRACTS** | a rail you take from | **TAKE** | a vertical spindle at the left with tags hanging at varied depths, meeting one horizontal ribbon that runs right — an **L** |
| **INDUSTRY** | a line you feed | **FEED** | a single full-width horizontal band, hoppers → block → cradle, with four drums standing above it |
| **BAR** | a room you cross | **APPROACH** | a top-down floor plan; scattered occupied positions, one of them yours; no rings, no centre, no rows |
| **FACTIONS** | a constellation you sit inside | **ORIENT** | you at dead centre, nine concentric rings, fourteen bodies at metric radii, chords drawn between them |
| **LEDGER** | a slab you turn | **TURN** | one large solid object centred, sockets around its edge, some filled and some empty |

None of the six is a list. None is a three-column split. The station's *shell* (crest fascia,
7-tile dock, one workspace) stays constant — that is the muscle memory. The **object inside it**
changes completely, which is what §2 of the grammar asks for.

---

## 3. Rulings that apply to all six station screens

### 3a. Flatten first, with appearance held constant

`stationApp.js:64-79` injects three sheets in order — `station.css` (763) → `station-workbench.css`
(2411) → `station-berth.css` (539) — and berth **must** stay last because it re-points the
`--ink-/--line-/--surface-` tokens the earlier sheets read and restores grid placement that
workbench had lifted into absolute overlays. That is already three override layers. **A redesign
that lands before the flatten becomes override layer four, and this document will have made the
problem worse.**

Measured depth-0 redefinitions across all three sheets, per screen. These are the actual offenders
each flatten must resolve — not the aggregate ruling restated:

| Screen | depth-0 selectors | distinct | **redefined** | worst offenders |
|---|---|---|---|---|
| contracts | 265 | 128 | **62** | `.sx-ct-row:hover` ×9, `.sx-ct-row.is-active` ×9, `.sx-ct-row` ×8, `.sx-ct__board` ×6, `.sx-ct-row__rew` ×6, `.sx-dossier` ×6, `.sx-ct__active` ×6 |
| market | 239 | 155 | **40** | `.sx-mkt__list` ×7, `.sx-mkt-row:hover` ×7, `.sx-mkt-row.is-active` ×7, `.sx-mkt-row` ×6, `.sx-mkt__stage` ×6, `.sx-mkt-row__name` ×5, `.sx-mkt-row__price` ×5; plus `.sx-mkt__console` ×4 in workbench **and** ×4 in berth |
| bar | 144 | 81 | **37** | `.sx-bar__stage` ×6, `.sx-bar-row` ×5, `.sx-bar-row:hover` ×5, `.sx-bar-row.is-active` ×5, `.sx-bar__leads` ×5, `.sx-bar__rail` ×4, `.sx-talk__head` ×4 |
| industry | 179 | 92 | **36** | `.sx-ind-row:hover` ×8, `.sx-ind-row.is-active` ×8, `.sx-ind__stage` ×8, `.sx-ind__list` ×7, `.sx-ind-row` ×7, `.sx-ind-row__name` ×6, `.sx-ind-row__tier` ×5 |
| factions | 150 | 104 | **23** | `.sx-fac-network` ×6, `.sx-fac-row` ×5, `.sx-fac-row:hover` ×5, `.sx-fac-row.is-active` ×5, `.sx-fac-pulse` ×5, `.sx-fac-ladder` ×4, `.sx-fac-intent` ×4 |
| ledger | 0 | 0 | **0** | none — it has no sheet of its own at all |

**Flatten procedure, per screen, appearance held constant:** collapse each redefined selector to one
authored block in `station.css`; delete the workbench and berth duplicates; capture a frame before
and after at 1440×900 and diff. Only then redesign. The flatten is *cheap* because the redesign
renames the element anyway — the beam, the spindle, the conveyor and the floor plan are new nouns.
**Every screen below states its own flatten line as step 1.**

### 3b. The noun vocabulary, inside the `sx-` namespace

The grammar's approved nouns are `crest / stage / apron / drawer / rail / housing / slab / deck /
tile`. The station sheet's namespace is `sx-`. Combine them: `sx-crest`, `sx-stage`, `sx-apron`,
`sx-drawer`. Do **not** introduce `sf-`-prefixed structure inside the station — it collides with
`styles/ui.css`.

**`.sx-mkt__console`, `.sx-ind__console`, `.sx-ct__active`, `.sx-bar__leads` and `.sx-fac__detail`
all become `.sx-apron`.** That single rename dissolves the 4×+4× `.sx-mkt__console` redefinition by
construction and is most of why the flatten is worth doing first.

### 3c. Three live class-name traps

Per grammar §8 the accessibility layer sanitises by class-name **substring**, and
`styles/accessibility.css` confirms the exact selectors:

- **`[class*="pulse"] | [class*="blink"] | [class*="flash"]`** get `animation:none !important;
  opacity:1 !important` under `html.sf-reduce-flash` (`accessibility.css:188-190`). Live offenders:
  **`.sx-fac-pulse`** — a *structural section* wrapping the entire factions standing readout —
  **`.sx-receipt__pulse`**, and **`.sx-mkt-row__pulse``**. Any animation authored inside those is
  silently dead in a mode nobody tests. Rename `.sx-fac-pulse` → `.sx-stage__standing` as part of
  the factions flatten; the other two to `__mark` and `__tick`.
- **`[class*="panel"] | [class*="card"] | [class*="menu"] | [class*="modal"]`** are stripped of
  `background-image`, `box-shadow`, `filter` and `backdrop-filter` under `forced-colors`
  (`accessibility.css:205-217`). Live offenders: **`.sx-panel` / `.sx-panel__head`** (used by bar
  leads, market routes and the industry console), **`.sx-fab-out-card`**, **`.sx-chooser__panel`**.
  Any of these that carries meaning in a gradient loses it. Fold them into `.sx-apron` / `.sx-slab`
  during the flatten.
- **Do not rename** `syncHudAccessibility`, `_isRestorableOpener`, `_restoreFocus`,
  `_ensureFocusIn`, or the `hud.inert` line in `screenManager.js` — `check:ui-a11y` asserts them as
  literal source substrings.

### 3d. Tier-2 "why" — the phrase banks, assigned

The rule, stated once: **every tier-2 phrase comes from an enumerated bank; an unknown tag renders
*nothing*, never a guess.** The mechanism exists and works — `src/ui/causeLedger.js` (217 lines)
already hovers a tooltip over market rows explaining who moved a price. Generalise it to a
`[data-why]` attribute read by one delegated `pointerover`/`focusin` listener on `.sx-workspace`.

| Screen | Bank | Status today |
|---|---|---|
| market | `causeLedger.js` via `marketDriverPresenter.js` (+ `priceForecast.js`, `demandDriverSummary.js`) | **wired**, this is the reference implementation |
| market (prose) | `COMMODITY_FLAVOR` — 47 entries, merged onto every `COMMODITIES` record at load (`commodities.js:94-99`) | **surfaced only in the news ticker**; zero commodity-inspection use |
| contracts | `CONTRACT_CLAUSES` (5) + `MORAL_TRAPS` (5) | **0 UI importers** — `src/data/contractClauses.js` and `moralTraps.js` are read only by systems and checks |
| factions | `FACTION_DOCTRINES` (14) + `PIRATE_DOCTRINES` (8) + `FACTION_META[].relations` weights | **0 UI importers**; factions screen has **0 tooltips today** |
| bar | `stationContactMemoryLine()` over `stationContacts.js` (15 counter defs) + `narrative.js` figures (26) | memory line rendered; nothing hoverable |
| industry | blueprint `requiresTech` / `stationType` / `inputs` (already enumerated in `BLUEPRINTS`) | notes rendered as flat text |
| ledger | evidence page provenance from the ledger records themselves | none |

### 3e. Reuse before invention

`src/ui/effects/` ships nine registered primitives — `circularGauge`, `dockRail`, `flickerGrid`,
`glyphMatrix`, `hexPattern`, `morphLabel`, `rippleField`, `routeBeam`, `supplyTree`. **Compose
these.** A tenth primitive must be registered in three places including the `DRIVERS` table inside
`scripts/check-ui-effects.mjs`; nothing below requires one.

Also note: station screens *do* have a real `dispose()` — `stationApp.js:1019` calls it on every
cached screen. The grammar's "there is no dispose hook, `onHide()` is the only teardown" applies to
`screenManager`-level screens (§B), **not** to the six modules here. Station screens get
`onShow / onHide / refresh / dispose` and must use `dispose()` for listener teardown, as
`contracts.js`, `industry.js` and `factions.js` already do.

---

# A. THE DOCKED STATION

## A.1 MARKET — the beam

**File:** `src/ui/station/screens/market.js` (716) · **flatten line:** 40 redefined depth-0
selectors, `.sx-mkt-row` family ×6–7 each, `.sx-mkt__console` ×4 in workbench **and** ×4 in berth.
Collapse to one authored `.sx-stage` / `.sx-apron` block; the rename to `.sx-apron` kills the
console duplication outright.

### 1. Concept, archetype, verb, silhouette

*A beam you tip.* **WEIGH.** The centerpiece is a **balance beam on a centre fulcrum** with a pan at
each end: **LEFT = HERE** (this berth's quote for the selected commodity), **RIGHT = THERE** (the
best price you actually know about, at a station you have actually visited). The beam **tilts by the
spread**, physically. Below it, the 47 commodities are a **rack of square tiles**, not a list — a
shelf you scan by shape and family mark, already half-built as `commodityGlyph()`.

Silhouette: *one tilted horizontal beam on a fulcrum with two hanging pans, over a rack of small
squares.* Nothing else in the build looks like that.

**Why this is the idea:** the player currently sees only `state.economy.markets[<the station they
are standing in>]`, which makes trade reasoning literally impossible — there is no second number to
compare against. 24 sectors, 32 stations and 47 commodities of simulated price are invisible. The
beam does the subtraction for you, so a trade decision is a *glance at an angle*, not arithmetic.

### 2. Information shown

- **Selected commodity**: `COMMODITIES` record — `name`, `category`, `basePrice`, `volPerU`,
  `massPerU`, `legality`, `elasticity`, plus merged `COMMODITY_FLAVOR` prose and optional `moralTag`.
- **This berth's entry**: `state.economy.markets[state.ui.dockedStationId][cmdtyId]` —
  `{stock, equilibrium, baseEq, role, lastMid, lastBuy, lastSell, eventMods, demandMult,
  demandDrivers, history}`. `role` (producer/consumer/neutral) is the single most decision-relevant
  field and is currently rendered nowhere.
- **The other pan**: the same entry read across `state.economy.markets[*]` for every station in
  `SECTORS[].stations` — **knowledge-gated** (see §5).
- **Hold**: `state.player.cargo.{items, usedVolume, capVolume}`; **purse**: `state.player.credits`.
- **Drivers**: `presentMarketDrivers()` primary tags + `accessibleSummary` (already wired).
- **Tracked cargo**: `state.nav.waypoint.commodityId` / the tracked mission's
  `cargo.commodityId ?? params.cmdtyId`, with the existing `is-tracked` flag preserved.
- **Rack tile face**: family mark, name, `lastBuy`, held quantity, a two-state `role` mark.

### 3. Actions (APRON)

`WEIGH` (commit the load at the beam's current quantity) · `BUY` / `SELL` mode · quantity scrubber
with `MAX` · `SET COURSE` on the right pan (reuses `applyTradeNavigation` — do not re-derive routes)
· `SELL ALL HERE` when the hold holds anything this berth wants.

### 4. Shown symbolically

- **The tilt angle IS the spread.** No "+340 cr" needed to know it is worth flying.
- **Pan weight = quantity.** Load 40 units and the left pan visibly sags; a hold-limited or
  credit-limited maximum is a *hard stop* on the pan travel, so "you cannot afford more" is felt as a
  physical limit, not read as a disabled button.
- **`role` is a shape, not a word.** Producer = pan with an *outflow* notch; consumer = *inflow*.
- **Staleness is scramble.** The right pan's station label scrambles in proportion to how long ago
  you saw that price (grammar §5, *label scramble duration ← knowledge staleness*). A price you
  learned ten sectors ago reads as unreliable *before* you read the number.
- Second channel always present per grammar §4: every colour state also carries a word or a shape.

### 5. Animation & interaction

- **§9.1 direct manipulation** — drag the beam itself to set quantity. Dragging the left pan down
  loads more; it stops dead at `min(maxByCredits, maxByHold)`.
- **§9.7 spatial hit-testing** — pick commodities by pointing at tiles on the rack, not by reading
  rows. Keyboard: arrows walk the rack in 2D; gamepad works free via `spatialFocusTarget`.
- **§5 SETTLE** — the beam overshoots slightly and returns when a price updates; the numbers count,
  they do not snap. **Nothing over 180 ms.**
- **§5 scramble** — staleness, as above.
- **What makes it a small game:** you are *tipping a physical thing until it balances against what
  you can pay*, and the answer to "should I buy this" arrives as an angle before you have read a
  single digit.
- Keep the existing chart, demoted into tier 3: it is real work (`priceHistory`, brush, keyboard
  cursor, `aria-live` readout) and it belongs in the DRAWER, not on the stage.

### 6. Progressive disclosure

- **Tier 1 (decide):** the beam, its tilt, both station names, the two quotes, your hold and purse,
  the rack.
- **Tier 2 (hover/focus, `[data-why]`):** *why* this price — `causeLedger` enumerated driver tags
  via `marketDriverPresenter` (already wired). *What this stuff is* — the `COMMODITY_FLAVOR` line,
  47 authored entries currently reachable only through the news ticker. *Why that pan is dim* — the
  staleness phrase (`STALE · 340s`).
- **Tier 3 (one click → DRAWER):** the price history chart with brush and `priceForecast`; the full
  cross-station table for this commodity; `marketNews` headlines touching it. **One drawer, never a
  second modal.**

### 7. Reduced motion & forced colors

- **Reduced motion:** the beam does not animate to its angle — it is *drawn* at it. Tilt is
  geometry, not motion, so the whole idea survives. Scramble becomes the printed phrase
  `STALE · 340s`. Overshoot becomes nothing. Call `prefersReducedMotion()` from
  `effects/effectRuntime.js` directly — the global blanket only neutralises CSS.
- **Forced colors:** the beam is a stroked shape with `currentColor`; the tilt is still legible with
  every fill removed. Pan contents carry a printed count. `role` marks are strokes, not fills. No
  structural element may be named `*panel*` / `*card*` (§3c).

---

## A.2 CONTRACTS — the spindle and the ribbon

**File:** `src/ui/station/screens/contracts.js` (502) · **flatten line:** the worst sheet in the
station — **62 redefined depth-0 selectors**, `.sx-ct-row:hover` and `.sx-ct-row.is-active` at ×9
each, `.sx-dossier` ×6. Collapse before touching the interior.

### 1. Concept, archetype, verb, silhouette

*A rail you take from.* **TAKE.** Offers hang off a **vertical spindle** at the left as physical
tags, at **depths set by risk** (`riskTier`) — routine jobs near the top, severe ones hanging low.
You **pull a tag off the spindle** and it lands on the **consequence ribbon**: one horizontal strip
running right, with three seats — **BIND → CARRY → SETTLE** — and the contract's **clauses clipped
onto the segment where each one actually bites.**

Silhouette: *a vertical stack of hanging tags meeting one horizontal ribbon — an **L**.*

**Why this is the idea:** `src/data/contractClauses.js` (5 clauses) and `src/data/moralTraps.js`
(5 traps) have **zero UI importers**. The systems settle them; the player never sees them coming.
A clause is not a tag in a row — it is a thing that fires *at a moment*, and the ribbon is that
moment made visible before you commit.

### 2. Information shown

- **Board**: `state.missions.boards[state.ui.dockedStationId].slots[]` — per offer `id`, `title`,
  `type`, `reward|reward_cr|rewardCr|payout`, `riskTier|risk`, `collateral_cr|collateralCr`,
  `upfrontCostCr`, `factionId`, `destStationId`/`destSectorId`/`destinationName`,
  `jumps|routeJumps`, `cargo.{commodityId,qty}` or `params.{cmdtyId,qty}`, `clauses[]`, `minRep`,
  `timeLimitMin`, `summary`, `source`, `preloadedCargo`, `requirementUnmet|lockedReason`.
- **Dispatch header**: `missionBoardDispatchLabel()` — station `dispatchConflictKey` →
  `state.conflicts[key].{state, tension}`, rendered as a two-sided pressure mark on the spindle's
  cap, not as a sentence.
- **Readiness**, all three gates already computed: standing (`state.factions[factionId].rep` vs
  `minRep ?? missionMinRepForRisk(risk)`), funds (`credits` vs `collateral + upfront`), hold
  (`cargoVolume` vs `capVolume − usedVolume`).
- **Active**: `state.missions.active[]` with `state.ui.trackedMissionId`.
- **Attention**: `missionDockAttention()` payload — `{kind, badge, reason, title, focusMissionId,
  surface, autoOpen}`. Preserve exactly; it is how the dock badges Missions.
- **Onboarding**: `state.onboarding.{active, finished, choiceStationId, choiceOfferIds}` and the
  `firstTradeContract` / `onboardingChoice` sources. Preserve `firstHourBoardOfferPresentation()`.
- **Final disposition**: `mission.storyDisposition` + `mission.finalDisposition`. Preserve
  `finalDispositionPresentation()` and its **separate irreversible confirmation** — that is a story
  contract, not styling.

### 3. Actions (APRON)

`TAKE` (pull → accept + bind route) · `TRACK` / untrack · `ABANDON` on an active tag ·
`RESOLVE` — a live jump to whichever gate is blocking (Market for funds, Shipworks for hold,
Factions for standing). Never a dead `Resolve Readiness` button that only restates the problem.

### 4. Shown symbolically

- **Hang depth = risk.** You see how dangerous the board is by how far the tags reach down. A board
  full of severe work *looks* heavy before you read a word.
- **Faction identity = tag colour + crest**, already keyed (`FAC_TINT`); **standing gate = a
  physical catch** on the spindle the tag will not slide past.
- **A clause is a clip on the ribbon.** `CONTRACT_CLAUSES` and `MORAL_TRAPS` render as small clips
  seated at BIND, CARRY or SETTLE — *"this one bites when you deliver"* is a position, not a
  sentence.
- **Collateral is a weight** hanging under the tag; a job that can cost you more than it pays hangs
  visibly wrong.
- **The turn-in you must not miss** — `attention.kind === 'turn_in'` — is a tag already *seated in
  the SETTLE socket*, glowing. No hunting.

### 5. Animation & interaction

- **§9.1 direct manipulation** — pointer drag pulls a tag off the spindle; `Enter`/`Space` does the
  same from the keyboard; gamepad via `spatialFocusTarget`. The pull has resistance proportional to
  `collateral + upfront` — an expensive commitment *feels* like one.
- **§9.6 ghost preview** — hovering a tag ghosts its clauses onto the ribbon before you commit.
  Decisions made before commitment, exactly as `panels/massDelta.js` does for fits.
- **§5 LATCH (~90 ms)** — the tag seats into BIND with a hard stop; `ui_confirm`.
- **§5 tree edge march** — the ribbon's BIND→CARRY→SETTLE edges march in the direction of
  dependency, the same grammar as the tech tree, so the player reads *order* without a legend.
- **What makes it a small game:** taking a job is a physical pull with weight and a catch, and the
  consequences arrive laid out along the strip you will actually travel.

### 6. Progressive disclosure

- **Tier 1:** tags on the spindle (title, faction crest, hang depth, reward, weight), the ribbon
  with clause clips, the readiness catch.
- **Tier 2 (`[data-why]`):** clause prose from `CONTRACT_CLAUSES`; trap prose from `MORAL_TRAPS`;
  the exact readiness blocker (`"Meridian +150 standing required"`); the rep preview from
  `missionRepPreview()`. Enumerated only.
- **Tier 3 (DRAWER):** the full dossier — authored `summary`, outcome preview, route with jumps,
  payload, time limit, follow-up availability (`missionOffersFollowUp`). This is today's
  `.sx-dossier` content, moved off the stage and into the drawer where it belongs.

### 7. Reduced motion & forced colors

- **Reduced motion:** no pull animation — click/`Enter` seats the tag instantly. Hang depth,
  clip position and weight are all geometry and survive untouched. Edge march becomes a static
  arrowhead per segment.
- **Forced colors:** faction tint is stripped, so every tag additionally carries the faction's
  `short` label and a distinct crest glyph. Risk is depth *and* the printed `RISK_LABEL` word. The
  readiness catch is a drawn notch, not a colour.

---

## A.3 INDUSTRY — the line

**File:** `src/ui/station/screens/industry.js` (193 — the smallest and thinnest of the six) ·
**flatten line:** 36 redefined depth-0 selectors, `.sx-ind-row:hover` / `.is-active` /
`.sx-ind__stage` at ×8 each.

### 1. Concept, archetype, verb, silhouette

*A line you feed.* **FEED.** One **full-width horizontal conveyor**: **hoppers** (one per input) →
**the machine block** → **the output cradle**. Above the line stand **four process drums** —
Refine · Assemble · Augment · Shipyard — and you **rotate a drum** to change what the line is set up
to make. There is no rail, no stage, no aside.

Silhouette: *one wide band running edge to edge, with four standing drums above it.*

**Why this is the idea:** the current screen is a list of 19 blueprints and a `Fabricate` button.
The verb `FEED` means you physically put material into a hopper — and when a hopper is short, it is
*visibly* short, and the fix is one gesture away. The existing missing-input → Market handoff
(`data-source-cmdty`, asserted by `check:station-tabs`) becomes literal: **you drag from an empty
hopper to the Market.**

### 2. Information shown

- **Blueprint**: `BLUEPRINTS` record — `id`, `name`, `desc`, `category` (refine/assemble/augment/
  ship), `tier`, `inputs{cmdtyId: qty}`, `outputs{id, kind, qty}`, `timeS`, `requiresTech`,
  `stationType`.
- **Hopper fill**: `state.player.cargo.items[inputId]` vs `bp.inputs[inputId]` — have/need per
  material, already computed.
- **Line state**: `state.crafting.queues[state.ui.dockedStationId]` = `{bpId, elapsed, total}`.
  **One strategic build slot** — the occupancy rule is real and should read as one machine, busy.
- **Gates**: `state.player.researchedNodes|researched` vs `requiresTech`; the berth's own
  `station.type` vs `bp.stationType` (`refinery` / `fab`).
- **Claims tie-in**: `src/systems/claims.js` production feeding the same line — an outpost you own
  becomes a *second hopper that fills itself*, which is the clearest possible statement of what a
  claim is for.

### 3. Actions (APRON)

`FEED` (commit inputs) · `RUN` (start the line; disabled only while genuinely occupied) ·
`SOURCE` on any short hopper → Market in buy mode at that commodity (preserve
`station:navigate {destination:'market', options:{tradeMode:'buy', commodityId}}`) · `CANCEL RUN`.

### 4. Shown symbolically

- **A short hopper is visibly short.** Fill height *is* have/need. You never read a fraction.
- **Occupancy is a machine that is moving.** The block turns while `state.crafting.queues[sid]`
  exists and is still; the `elapsed/total` progress is the *travel of the part along the belt*, not
  a percentage bar.
- **Tech-locked and wrong-station recipes are drums that will not rotate into place** — a physical
  refusal at the drum, with the reason on hover. `Requires refinery station` is a fact about *where
  you are*, and it should be felt at the machine.
- **Output tier is the size of the cradle's part.** T1 vs T4 differ in mass, visibly.

### 5. Animation & interaction

- **§9.1 direct manipulation** — drag cargo from the hold readout into a hopper; rotate a drum by
  drag or arrow keys.
- **§5 SPOOL, bound to real work** — the line spools up over `bp.timeS` and the spool ends exactly
  when `elapsed >= total`. **If a build resolves instantly the spool is instant.** A spinner that
  outlives its work is a lie.
- **§5 beam dash velocity and reversal**, generalised from `capRegen − continuousDrain` to *net
  material flow*: the belt's dash speed is throughput, and it **runs backwards** when the line is
  consuming stock faster than claims replenish it. You see the deficit before you read it.
- **§9.9 earned reveal** — a drum you cannot use yet is *present but empty*; researching its tech
  fills it. Progression as a socket filling.
- **What makes it a small game:** you load a machine, it runs, a part comes out the end. That is a
  toy. The current screen is a form.

### 6. Progressive disclosure

- **Tier 1:** the line, hopper fills, the drum in place, the output part, whether it can run.
- **Tier 2 (`[data-why]`):** why a hopper is short (`"12 short — this berth sells it"`); why a drum
  will not seat (`requiresTech` name, or `Requires fabrication station`); what the output does
  (module/weapon/ship description from `MODULES` / `WEAPONS` / `SHIPS`).
- **Tier 3 (DRAWER):** the full recipe tree — where each input comes from, which berths produce it
  (`entry.role === 'producer'` across `state.economy.markets`), and what the output unlocks
  downstream. Compose `effects/supplyTree.js`; do not write a new one.

### 7. Reduced motion & forced colors

- **Reduced motion:** the belt does not move. Hopper fill, part position along the belt and the
  printed `n s remaining` carry everything. Reversal becomes the printed `NET −4/min` in `foe`.
- **Forced colors:** hoppers are stroked outlines with a stroked fill line; the drum in place is
  identified by position and label, never by tint. `.sx-fab-out-card` must be renamed (§3c) or its
  gradient vanishes silently.

---

## A.4 BAR — the room

**File:** `src/ui/station/screens/bar.js` (427) · **flatten line:** 37 redefined depth-0 selectors,
`.sx-bar__stage` ×6, the `.sx-bar-row` family ×5 each.

### 1. Concept, archetype, verb, silhouette

*A room you cross.* **APPROACH.** The stage is a **plan view of the bar** — a floor with **occupied
positions**: the counter, two booths, the corner, the door. **You are a marker on that floor.** You
*cross the room* to stand in front of someone. Conversation rises at the position you are standing
at; it does not replace the room.

Silhouette: *a top-down floor plan with a handful of scattered occupied positions, one of them
yours.* No rings, no centre, no rows — which is exactly what separates it from Factions.

**Why this is the idea:** the verb is APPROACH, and a list of contacts has no approach in it. A
plan view also makes the room's population *legible at a glance* — a busy berth and a dead one look
different before you read a name. And it gives the four authored
`stationSideEventDirector` events (**currently unsubscribed — 0 consumers**) somewhere to actually
happen: they play **in the room, at a position, while you are standing there.**

### 2. Information shown

- **Occupants**: `generateContacts(stationId, state)` — `id`, `name`, `role`, `line`,
  `canonicalKey`, `trackerId`, plus any pinned contact. 15 counter definitions in
  `src/data/stationContacts.js`; 26 figures in `src/data/narrative.js`.
- **What they remember**: `stationContactMemoryFor(state, id)` → `stationContactMemoryLine()`.
  This is the game's memory of you and it is the best line on the screen — put it under the person,
  in the room.
- **Portraits**: `mountContactPortrait()` (real art, already working) at the position.
- **Choices**: `getChoices(role, contact)` → `buildReply(...)`.
- **Offers**: mission offer with `missionPreflight()` chips and `missionConsequenceSummary()` stakes;
  `frontierRumorOffer()`; `availableSurveyOffer()` + `surveyOfferLabel()`;
  `dossArchiveMapOffer()`; `vonnFreightLossMapOffer()`; the Tethys guidance
  (`state.world.frontierRumors.byId[id].phase === 'rumored'`).
- **Intel**: `barContactIntelTags(contact, state, stationId)`.
- **Leads**: `missionBoardSlots(state, stationId).slice(0,3)` — preserve the `data-inspect` → Contracts
  handoff, which `check:station-tabs` asserts.
- **Room mood**: `state.conflicts[...]` tension and recent `marketNews` — the room's *lighting and
  occupancy*, not a banner.

### 3. Actions (APRON)

`APPROACH` (cross to a position) · `ASK` (the choice set, at the position) · `BUY` (survey data,
rumor card) · `TAKE LEAD` (→ Contracts, focused on that mission) · `LEAVE` (back to the floor).

### 4. Shown symbolically

- **Who matters is where they stand.** The station authority's officer is at the counter; the
  black-market contact is in the corner by the door. Position is role, learned once, read forever.
- **A room with three people is a quiet berth.** Population is the fact; no "3 contacts" label.
- **Memory is proximity.** A contact who remembers you well is *turned toward you*; a cold one is
  turned away. `stationContactMemoryFor` counters drive the facing angle.
- **A side event is a thing that happens at a position** — someone arrives at the door, an argument
  starts at a booth — using the existing authored event content, not invented text.
- **An offer you cannot take** is a person you can stand in front of who does not turn: the block
  is physical, and the reason is tier 2.

### 5. Animation & interaction

- **§9.7 spatial hit-testing** — you pick people by pointing at them in the room. Keyboard: arrows
  walk the marker between positions (nearest-in-direction); gamepad free via `spatialFocusTarget`.
- **§5 SETTLE** — the marker crosses the floor and settles at the position; ≤180 ms, overshoot
  slight, and the overshoot amplitude reads your hull's `inertia` exactly as everywhere else
  (grammar §5 row 1). Your heavy freighter walks the bar like a heavy freighter. This is free
  characterisation and nobody else's space game does it.
- **§5 LATCH** — the reply seats with `ui_confirm`; the quote does not fade in over 150 ms.
- **§9.10 sound** — one delegated rate-limited `pointerover` on the floor gives every occupant
  `ui_hover`. Today only gamepad focus emits hover, which is most of why the whole build feels inert.
- **What makes it a small game:** you are *in* a place with people in it, and crossing to someone is
  a small physical act. A contact list is a phone book.

### 6. Progressive disclosure

- **Tier 1:** the room, who is in it, where they are, who you are standing in front of, what they
  just said, what you can ask.
- **Tier 2 (`[data-why]`):** why they remember you that way (the enumerated
  `stationContactMemoryLine` phrase); what a role does; why an offer is blocked (the
  `missionPreflight` blocker, verbatim).
- **Tier 3 (DRAWER):** the contact's full record — every prior exchange, the figure entry from
  `narrative.js`, the leads they have given you, and their faction's standing with you. This is
  where the Codex "Figures" tab and the Bar finally meet.

### 7. Reduced motion & forced colors

- **Reduced motion:** the marker does not walk — it is *at* the new position. Positions, facing and
  occupancy are all static geometry. Side events appear as a printed line at the position.
- **Forced colors:** the floor is a stroked plan; occupants are stroked marks with names beside
  them; portraits degrade to initials in a stroked frame. Nothing depends on a tint.
- **Both:** the room must never be *blank*. Every occupant carries a name and a role in text at
  ≥12 px.

---

## A.5 FACTIONS — the constellation

**File:** `src/ui/station/screens/factions.js` (355) · **flatten line:** 23 redefined depth-0
selectors — the least broken sheet — but it contains **`.sx-fac-pulse` ×5**, which is a structural
section whose name silently kills any animation inside it under `sf-reduce-flash` (§3c). Rename it
in the flatten.

### 1. Concept, archetype, verb, silhouette

*A constellation you sit inside.* **ORIENT.** **You are at dead centre.** Fourteen factions are
bodies placed at a **fixed identity bearing** (each faction always sits at the same angle, learned
once) and a **radius set by your standing** — allied bodies close, hostile bodies far out.
**Nine concentric rings** are the nine tiers. **Chords** drawn between bodies are inter-faction
relations, and they **march** when spillover is live.

Silhouette: *you at centre, nine rings, fourteen bodies at metric radii, chords between them.*

**Why this is the idea, bluntly:** the screen today shows a **numberless coloured dial** — a needle
with no number on the arc, no history, and **zero tooltips**. It is 14 factions × 9 tiers × a ±1000
span with real inter-faction spillover, presented as one dial you cannot read. The constellation
puts **the whole political situation in one picture**: how many powers hate you, how many are close,
and which of them will drag the others when you move.

**Give the number back.** `signed(rep)` in DATA, at the body, always.

### 2. Information shown

- **Standing**: `state.factions[id].rep` (clamped ±1000; `NEW_GAME.factionRep[id]` seed when
  unset), `state.factions[id].lastDelta`, `tierFor(rep)` over the 9 `FACTION_TIERS`,
  `FACTION_AGGRO_THRESHOLD`, and the **hostility buffer** = `rep − AGGRO_THRESHOLD`.
- **Identity**: `FACTION_META` — `id`, `name`, `short`, `controls[]`, `relations{id: weight}`.
- **Authority**: which faction owns the berth you are standing in (`station.factionId`) — the body
  you are physically *inside the jurisdiction of* gets a ring mark around it.
- **Guidance**: `factionStandingGuidance(rep, meta, lastDelta, {hideLastDelta})` — `.last`,
  `.next`, `.risk`, `.plan`. Respect `shouldHideOwnRepDelta(state)`; that is a story contract.
- **Doctrine**: `FACTION_DOCTRINES` (14) and `PIRATE_DOCTRINES` (8) — **0 UI importers today.**
  This is *what they will actually do to you*, and it is the single most useful thing on the screen.
- **Consequence preview**: which contracts, berths and services a threshold gates.

### 3. Actions (APRON)

`ORIENT` (recentre on a selected body to see the situation from their side — the same rings, their
standings) · `FOLLOW` a chord to a related power · `FIND WORK` → Contracts filtered to that faction ·
`WHERE` → the Chart at `controls[]`. A read-only screen is a document; this one has four verbs.

### 4. Shown symbolically

- **Distance is standing.** How much trouble you are in is *how far away everyone is*, read in one
  glance without a single number.
- **Bearing is identity.** Meridian is always at the same angle. You learn the sky.
- **Chord thickness is relation weight**; chord colour-plus-**dash-direction** is align vs rival, so
  it survives `forced-colors` and colour-blind modes (grammar §4: never colour alone).
- **The aggro threshold is a drawn ring, not a number.** A body outside it is *outside the line*.
- **Recent change is a wake** behind a body that moved — direction and length from `lastDelta`,
  suppressed when `shouldHideOwnRepDelta` says so.
- **Doctrine is a body's shape.** A faction that shoots on sight, one that demands tribute and one
  that shadows you are three different silhouettes, drawn from the enumerated doctrine id.

### 5. Animation & interaction

- **§9.1 direct manipulation** — drag to rotate the whole field (bearings hold, so you can bring any
  faction to the top); wheel to zoom the ring scale. Reuse `src/ui/map/mapCamera.js` — `zoomAt` is
  cursor-anchored and clamp-correct — rather than writing pan/zoom again.
- **§5 SETTLE** — when rep changes, the body *travels* to its new radius and settles. Crossing a
  tier ring is a `LATCH` with `lock_acquired`. This is the first time in the build that a standing
  change has a body.
- **§5 tree edge march** — chords march from the faction that moved toward the ones it drags. Fire
  it on `faction:repChanged` and the player *watches the spillover propagate*. That is the whole
  point of having inter-faction relations and it has never once been shown.
- **§5 ripple radius** — the aggro ring ripples outward when a body crosses into hostile.
- **What makes it a small game:** it is a sky you are standing under, you can spin it, and when you
  do something the sky moves.

### 6. Progressive disclosure

- **Tier 1:** you, the rings, the bodies with names and `signed(rep)`, the aggro ring, the chords.
- **Tier 2 (`[data-why]` — the screen currently has zero of these):** *what they do* —
  `FACTION_DOCTRINES[id]` prose; *what changed* — `guidance.last`; *what the next threshold buys* —
  `guidance.next` with the tier name and the gap; *why that chord exists* — the relation weight
  phrase. Enumerated only; an unknown doctrine id renders **nothing**.
- **Tier 3 (DRAWER):** the full standing ladder (all 9 tiers with `min`, current rung lit — keep
  today's `.sx-ladder`, it is good, just move it), the standing history, everything this faction
  gates, and every berth in `controls[]`.

### 7. Reduced motion & forced colors

- **Reduced motion:** bodies are drawn at their radii; no travel, no march, no ripple. Chord
  direction becomes a static arrowhead. Threshold crossings print `CROSSED · HOSTILE`.
- **Forced colors:** rings and bodies are strokes; standing is radius (geometry, preserved); align
  vs rival is dash pattern plus the printed words `ALIGN` / `RIVAL`, both already in the markup.
  The nine-stop `STANDING_RAMP` is decoration here, not information — radius carries the meaning.
- **`.sx-fac-pulse` must be renamed** or the whole standing section is animation-dead under
  `sf-reduce-flash`.

---

## A.6 LEDGER — the slab

**File:** `src/ui/station/screens/ledger.js` (32 — a lifecycle adapter over
`src/ui/screens/shipLedger.js`) · **flatten line:** **zero** — it has no styles of its own, which is
why it currently reads as an inset of another screen.

### The forced constraint

**Ledger is one of the seven pinned destinations.** `check:station-tabs` asserts the exact
seven-item order including `ledger`, so it **cannot be retired**, whatever moves to THE FOOTPRINT.
"Keep it as a thin adapter" is also not admissible — the grammar requires a distinct silhouette and
at least one APRON verb. So it needs the smallest honest idea that is **not** the Footprint's
consequence graph.

**The split:** the **Footprint owns consequences** — what your actions caused, traced along causal
edges. The **Ledger owns artifacts** — the physical pages you have actually recovered, where you got
them, and what is still missing. Different noun, no overlap.

### 1. Concept, archetype, verb, silhouette

*A slab you turn.* **TURN.** One large object centred in the stage: **the Tessera itself**, with
**sockets around its edge**. Recovered evidence pages are **seated in their sockets**; unrecovered
ones are **empty sockets you can see the shape of**. You turn the slab to bring a socket to the
front and open the page seated there.

Silhouette: *one large solid object, centred, with sockets around its edge, some filled and some
empty.* Nothing else in the build is a single object at centre.

**Why this is the idea:** grammar §9.9 — *"an empty socket filling is the single most legible
expression of progression."* The Ledger is the one screen in the game whose entire content is
"things you found." Making the gaps visible turns a document into a collection, and a collection is
a reason to go somewhere.

### 2. Information shown

- Every recovered evidence page from the ship's-ledger records: title, forensic detail body, the
  **provenance** (where and when it was physically recovered), and its relation to the 47-A / 47-B
  story spine.
- **Every unrecovered page as a shaped empty socket** — enough to know a thing exists without
  spoiling it: its class, its era, and the enumerated hint of where such things are found.
- Completion as **filled sockets over total**, which is a picture, not a percentage.
- The Tessera's own identity line, already authored: *"The Tessera keeps what the manifests leave
  out."*

### 3. Actions (APRON)

`TURN` (rotate the slab; keyboard `ArrowLeft/Right`, `Home` recentres — the exact interaction
`shipworks.js` already ships) · `OPEN` a seated page → DRAWER · `MARK` a socket for the Chart, so an
empty socket becomes somewhere to fly.

`MARK` is what makes this a screen and not a document: it is the only verb here that changes the
world outside the screen, and it is the reason the Ledger is a destination at all.

### 4. Shown symbolically

- **A gap is a hole you can see.** Progression is legible without a bar.
- **Provenance is position** — sockets are grouped by where the pages came from, so the shape of
  what you have tells you where you have been looking.
- **A page that connects to another** shows a seated pin between their sockets; the *edge* exists
  here, the *consequence* lives in the Footprint.

### 5. Animation & interaction

- **§9.1 direct manipulation** — drag to turn the slab; `shipworks.js` already ships pointer-drag
  orbit, wheel zoom with `deltaMode` normalisation, two-finger orbit vs pinch, and
  `Arrow`/`+`/`-`/`Home`. Copy that controller; do not write a third one.
- **§9.9 earned reveal** — a socket fills when the page is recovered, with a `LATCH` and
  `lock_acquired`. If a page was recovered since you last opened the screen, the fill plays on
  arrival. **This is the whole emotional payload of the screen** and it costs almost nothing.
- **§5 SETTLE** — the slab overshoots slightly as it turns and returns; amplitude reads hull
  `inertia`, same as every other stage.
- **What makes it a small game:** it is an object in your hands with holes in it.

### 6. Progressive disclosure

- **Tier 1:** the slab, the sockets, filled vs empty, which one is facing you.
- **Tier 2 (`[data-why]`):** for a filled socket, the provenance line; for an empty one, the
  enumerated class hint. Never invented text — an unknown page class renders **nothing**.
- **Tier 3 (DRAWER):** the full forensic detail of the seated page, exactly as
  `shipLedger.js` renders it today. The existing panel is the drawer's content; it is not the stage.

### 7. Reduced motion & forced colors

- **Reduced motion:** the slab does not spin — sockets are selected directly and the front face
  swaps. A newly filled socket prints `RECOVERED` rather than animating.
- **Forced colors:** the slab is a stroked outline; filled sockets are solid strokes, empty ones
  dashed — a shape difference, not a colour difference. Every socket carries a text label at ≥12 px.

---

## A.7 INSURANCE — the fifth dock verb

**Not a screen. A verb on the fascia.** `state.player.insurance` =
`{rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: null}`
(`src/core/gameState.js:75`). Note the field is **`deductibleCr`**, not `deductible`.

**The defect:** insurance is load-bearing at death (`src/combat/playerDefeat.js`,
`src/ui/screens/gameOver.js` renders it as `['insurance', 'Coverage']`), and it is configurable
**only in `src/ui/screens/services.js` — which is not in `SCREEN_MODULES` and therefore cannot be
opened.** The player meets their own insurance policy for the first time on the game-over screen,
where it is a row in a receipt and it is too late to change it.

**The fix:** insurance becomes the fifth `[data-vital-act]` on the fascia, beside repair, refuel and
resupply, seated on a **Coverage** unit.

- **Placement:** a fourth *action-only* vital unit (`track: false`), the same kind as Munitions —
  outside the three metered vitals the check pins (§0.4).
- **Live cost, like every other dock verb:** the premium at this berth, from
  `opts.serviceQuote('insurance', state, player)`. `services.js:350, 432-442` already computes the
  toggle intent and already raises the cancel-confirmation. Reuse it; delete nothing.
- **Symbolic:** coverage is **how much of your ship's value comes back**, drawn as a filled fraction
  of a ship outline. `insuredModules: false` means the outline's fittings are hollow. You can see
  what you are not covering.
- **Tier 2:** the enumerated consequence — *"On loss: hull recovered at 60%, 500 cr deductible,
  fittings not covered."* Same numbers `gameOver` will print, shown while you can still act on them.
- **`DOCK_ACTIONS` in `check-station-tab-navigation-runtime.mjs` goes to five** — see §0.

---

# B. THE META LAYER

## B.0 The one-line diagnosis, and what to lift from `mainMenu`

Every meta screen except `mainMenu` renders the same centred plate — `.screen.sf-menu`,
`min-width:360px`, `max-width:min(92vw,920px)`, `backdrop-filter:blur(18px)`, gradient fill,
1 px border, a laser-sweep `::after` — over the permanent background JPG that `#screens` carries.
**Same plate, same backdrop, eight times.** That is the grammar's explicitly banned pattern and it
is the whole "cheap web game" read in one CSS rule.

**`mainMenu.js` is already good and must be preserved as-is:**

- **`.sf-menu--bare`** — no plate, no border, no shadow, no blur.
- **A left-anchored column** at `margin-left: clamp(20px, 7vw, 120px)`, not a centred box.
- **Full-bleed art** underneath, with the `#screens` scrim carrying readability.
- **Confident DISPLAY type** and a plain vertical list of real verbs.
- **The idle attract drift** (`_startIdleAttract`) and the **Continue fade** that names the sector
  and slot you would resume into — resume you can *trust* before you click.

**Lift into every other meta screen, without exception:**

1. `--bare` — **delete the plate.** No meta screen is a card.
2. **Its own opaque backdrop.** Grammar §6: without a per-screen backdrop, Pause and Settings are
   the same room. Eight screens sharing one JPG is eight screens with one silhouette.
3. **An anchored column, not a centred box** — the anchor edge differs per screen and is part of the
   silhouette.
4. **One DISPLAY-sized element per screen**, nothing below 12 px.

Then each screen earns a distinct silhouette on top of that.

## B.1 `pause.js` — THE HOLD

*A frame you hold.* **LOOK.** Silhouette: *the live game frame, frozen and dimmed, full-bleed, with
three to five annotations pinned to actual things in it, and a short verb strip along one edge.*

A pause menu in a game whose menus already pause is a redundancy — `PAUSING_SCREENS` in
`screenManager.js:16` contains `pause, mainMenu, newGame, gameOver, settings, saveLoad, help, codex,
drill, base, station, sandbox`, i.e. **twelve screens already stop time.** Pause is therefore not
"the screen that stops the game." It is **the only moment the player can study a live situation
without dying.** That is a genuinely valuable thing and the current narrow plate wastes it entirely.

- **Shows:** the held frame; pinned annotations on what is actually near you — nearest contacts and
  their disposition, what you are carrying (`state.player.cargo`), your tracked objective and its
  next step (today's `sf-pause-brief` lines, moved onto the frame), hull/fuel, and the current
  `state.nav.waypoint`.
- **Verbs (APRON):** `RESUME` (primary) · `MISSION LOG` · `SETTINGS` · `SAVE` · `QUIT TO TITLE` ·
  and `REVIEW` on the map action `pause.js` already computes (`openPauseMapReview`).
- **Symbolic:** pins on the actual frame, at the actual things. Nothing is a list. Distance and
  bearing come free from where they are pinned. Reuse `shipPreviewMount.projectLocalPoint`'s
  pin-to-3D pattern (grammar §9.2).
- **Motion:** §5 LATCH on entry — the frame *stops*, hard, ~90 ms, with `ui_open`; pins arrive
  staggered. No fade.
- **Tiers:** 1 = the frame + pins + verbs. 2 = why a pin is hostile (enumerated disposition). 3 =
  DRAWER with the full objective brief.
- **Reduced motion / forced colors:** pins are drawn statically; the frame is already static.
  Under `forced-colors` pins become stroked leader-lines with text labels.

## B.2 `newGame.js` — THE BERTH

*A berth you cast off from.* **CAST OFF.** Silhouette: *your starting ship at the left, full-bleed,
with a route rail running right to a first destination.* It already has `.sf-ng-route` — a
first-session rail the runtime check drives. Keep the rail; kill the plate around it.

- Shows: the chosen start (ship, sector, career), what that start actually *means* in verbs
  ("tows a 40-tonne hauler" over `40 t`, per grammar §3), difficulty, seed, and the first
  destination.
- Verbs: `CAST OFF` (the pinned `Launch` label the check clicks — **do not rename**) · `RE-ROLL SEED`
  · `CHANGE START`.
- Motion: §9.9 earned reveal — choosing a start *seats the ship in the berth*.

## B.3 `settings.js` — THE BENCH

*A bench you tune.* **SET.** Silhouette: *a full-bleed left column of groups with a live specimen
occupying the right two-thirds* — the thing the setting actually changes, running.

The failure mode this fixes: a settings list where you cannot see what a setting does. Every group
gets a specimen. Graphics → a live rendered corner. Audio → the actual cue firing. Controls → hand
off to the bind sheet (§B.6). Accessibility → the specimen redraws under the mode you just enabled,
which is the only honest way to ship a reduced-motion or forced-colors toggle.

- Verbs: `SET` · `RESET GROUP` · `RESET ALL`.
- Motion: §5 SETTLE — a value arrives on the specimen; **nothing over 180 ms**.
- Tier 2: what each setting costs, enumerated. Tier 3: DRAWER with the raw value and its default.

## B.4 `saveLoad.js` — THE SHELF

*A shelf of runs.* **RESUME.** Silhouette: *a horizontal shelf of slot slabs, each one a picture of
that world.*

A save is not a filename and a timestamp. It is a world, held. Each slab carries: sector name, ship
silhouette, credits, playtime, the objective that was live, and whether it is a recovery copy —
**all of which `mainMenu.js:178-193` already assembles** into a single `' - '`-joined string. Stop
joining it into a sentence; lay it out on the slab.

- Verbs: `RESUME` · `SAVE HERE` · `DELETE` (with the existing confirm) · `EXPORT`.
- Symbolic: an empty slot is a **visibly empty slab**, not a row saying "Empty".
- Motion: §5 *rail magnify* — the single atmospheric allowance in the whole grammar, and this is the
  right place to spend it. §9.9 on save: the slab fills.
- Reduced motion: no magnify; the focused slab is outlined instead.

## B.5 `gameOver.js` — THE AFTERMATH

*A scene you left behind.* **RECOVER.** Silhouette: *the wreck, full-bleed, with a consequence chain
running away from it toward what happens next.*

VISION.md is explicit: *"failure should make better stories,"* not *"MISSION FAILED — RELOAD?"*.
Today the screen is a **centred modal at `min-width:380px; max-width:min(92vw,620px)`** with an
`h1` in mono at `letter-spacing:.28em` (the grammar bans anything above `.06em` outside the MICRO
label) reading **"Ship Lost"** or **"Run Over"**, above a `12px` key/value grid. That is a receipt
for a database transaction.

**What it becomes:** the wreck is on screen. Running away from it is the **consequence chain** —
built from the state the game already has, in the language of events: *the convoy died → there is
salvage · you owe restitution → someone wants paying · the pirate escaped → he will be back · the
station lost its shipment → prices moved.* Each link is an enumerated consequence tag, exactly the
same `[data-why]` discipline as everywhere else, and each is a **place you can go next**.

The recovery receipt — deterministic lawful-dock recovery, `insurance` coverage, deductible, what
you kept — is **tier 3**, in the drawer, because by then the player has already met their policy at
the dock (§A.7) and does not need to be taught it at the worst possible moment.

- **Verbs (APRON):** `RECOVER` (the existing deterministic lawful-dock path — keep the exact
  behaviour and its `aria-label`) · `GO TO THE SALVAGE` (the wreck you just made is a place) ·
  `LOAD` · `MAIN MENU`. Ironman keeps its sealed-save contract untouched.
- **Motion:** §5 tree edge march along the consequence chain — the same marching-beam vocabulary as
  the Footprint, so the player already knows how to read it.
- **Reduced motion:** the chain is drawn with static arrowheads. **Forced colors:** links are
  stroked with text labels; nothing depends on the `--danger` red.
- Title: the situation, not a verdict. `STORY_BEATS` is already imported here.

## B.6 `help.js` — THE BIND SHEET, and nothing else

*A board you re-key.* **REBIND.** Silhouette: *a device diagram — keyboard, pad, mouse — with
bindings pinned to the actual keys.*

Today `help.js` is a `.sf-tabbar` over six tabs (`Controls`, `Ships`, `Commodities`, `Ores`,
`Factions`, `Interaction Loops`) rendering `.sf-codex-table` at `font-size:12px` with `11px`
headers — **four blocks of keybindings and three reference tables, and it explains no rule.**

**Decision: Help becomes the bind sheet, done properly, and nothing else.**

- **The rules teaching moves to THE RANGE.** A rule you can play is worth more than a rule you can
  read, and a rules screen that nobody opens twice is dead weight.
- **The reference tables move to the CODEX** (`Ships`, `Commodities`, `Ores`, `Factions` are
  archive content and the Codex is *a shelf you pull from*). `help.js` already reads live bindings
  from Settings → Controls; that is the only thing here that is genuinely a *tool*.
- **What remains:** a spatial bind sheet. Bindings pinned to the keys they are on, so conflicts are
  *visible as two labels on one key* rather than discovered in flight. Grouped by device, not by
  four `SECTIONS` headings. Touch bindings are their own device diagram.
- **Verbs:** `REBIND` (click a key, press the new one) · `RESET DEVICE` · `PRINT SHEET`.
- **Symbolic:** an unbound action is an **empty key**; a conflict is one key with two labels.
- **Nothing below 12 px** — the current `11px` table headers are a direct grammar violation.

## B.7 `codex.js` — THE ARCHIVE WALL

*A shelf you pull from.* **PULL** — assigned by the grammar, honour it. Silhouette: *a wall of
spines at varying heights with visible gaps where entries are not yet earned.*

Eight story-gated tabs (`Story, Comms, Discoveries, Graffiti, Figures, Ship, Archive, Ledger`)
become eight **shelves on one wall**, with the reference tables inherited from Help as a ninth.
The gating is already correct and is the best thing about the screen — **make it visible**: a gated
entry is a **gap in the shelf**, so the player can see there is more, which is §9.9 earned reveal
again and the reason to keep playing.

- Verbs: `PULL` (open an entry) · `SEARCH` · `MARK` (send a Discoveries entry to the Chart).
- Tier 2: why an entry is gated — the enumerated beat name, never invented.
- Motion: §5 *rail magnify* on the spine under the cursor; §9.9 on a newly earned entry.
- The `Ledger` tab and the station Ledger destination render the **same** `createShipLedgerPanel`;
  keep exactly one implementation.

## B.8 `missionLog.js` + `careerLadderView.js` — THE CLIMB

*A ladder you climb.* **COMMIT.** Silhouette: *three vertical ladders side by side with your rung
lit on each and the rungs above still dark.*

`careerLadderView.js` is **888 lines carrying 3 careers and 31 ladder steps** — a real progression
structure that currently renders inside a mission log. Invert it: **the ladder is the screen**, and
active missions are **what is on the rung you are standing on**.

Distinct from Contracts by construction: Contracts is *offers hanging on a spindle at a berth*;
this is *your climb across the whole game*. Different object, different verb, different picture.

- Shows: 3 careers × their ladder steps, current rung, what the next rung requires, active missions
  seated on their rungs, and the tracked mission.
- Verbs: `COMMIT` (choose which ladder to push) · `TRACK` · `ABANDON` · `FIND WORK` → the Chart, at
  berths that post the work the next rung needs.
- Symbolic: **a rung you cannot reach is a rung with a gap under it.** Height is progress.
- Motion: §5 tree edge march up the ladder toward the next rung — dependency direction, the same
  vocabulary as the tech tree and the Footprint.
- **Known defect to fix in passing:** the clipped Mission Log card passes every check today. Grammar
  §11: a green check is not proof — capture a frame.

## B.9 `automationPanel.js` — THE FLOW BOARD

*A board you delegate on.* **ASSIGN.** Silhouette: *asset tokens scattered across a route field with
flow beams running between them, and one net-flow beam along the bottom edge.*

Four tabs (`drones`, `traders`, `outposts`, `fleet`) with upkeep and offline accrual, currently a
tabbed list of rows with `<select>` dropdowns in them. The system underneath is a **flow economy**:
gross income minus upkeep per minute, per asset, accruing while you are away. Draw the flow.

- Shows: each asset as a token at the place it works; its program; `upkeepPerMin`; gross rate; the
  net; and the accrual that happened while you were gone.
- **Verbs:** `ASSIGN` (drag a token to a place, or a program to a token) · `RECALL` · `PAY UPKEEP`.
- **Symbolic — this is the screen where the grammar's best motion row earns its keep:**
  **§5 beam dash velocity and reversal.** Beam speed is throughput; **the beam runs backwards when
  upkeep exceeds income.** *"Production halted while upkeep is unpaid"* becomes a thing you watch
  happen instead of a sentence you find. Compose `effects/routeBeam.js`; do not write a new one.
- **Kill both `<select>`s** — see §C.
- Reduced motion: reversal becomes the printed `OVER BUDGET −14/min` in `foe`, exactly as the
  grammar's static-equivalent table specifies.

## B.10 `src/ui/asteroid/` — the drill screen

**Owner playtest 2026-08-20 failed the live playfield.** Do not treat this screen as
the quality bar and do not “leave it alone.” Presentation and control are admitted as
`PQ-130`. The idea-spec is [`SCREENS_E_ASTEROID_WORKS.md`](./SCREENS_E_ASTEROID_WORKS.md);
campaign law is [`../program/ASTEROID_WORKS_PLAYFIELD.md`](../program/ASTEROID_WORKS_PLAYFIELD.md).

Keep: pausing minigame (`drill` is in `PAUSING_SCREENS`), console voice (tokens, command
card, no glass), contact-ring as the machine primitive, `screens/drill.js` as exported
input/particle helper only.

Change under `PQ-130`: the cutaway is the STAGE; HUD is auxiliary; tap is one cell;
surveyed geology must read on the board.

Two standing conformance items still apply:

1. CREST / STAGE / APRON skeleton — STAGE is the board, not a postage stamp.
2. Audit for sub-12 px type and for `pulse`/`panel` substrings in class names (§3c).

---

# C. The replacement for `<select>` — `sx-picker` / `sf-picker`

Native `<select>` is the most literal "cheap web page" tell in the build. **Three live call sites**
(the brief names two; there is a third, and it is on the *live* map):

| File | Line | What it selects |
|---|---|---|
| `src/ui/screens/automationPanel.js` | 707 | drone program assignment (`data-act="assignProgram"`) |
| `src/ui/screens/automationPanel.js` | ~707 | second instance, same control, trader programs |
| `src/ui/galaxyMap.js` | 4924 | `#gm-commodity-select`, "Select Commodity" |
| ~~`src/ui/screens/starmap.js`~~ | ~~499~~ | ~~`.sm-commodity`~~ — **dies with the screen** (§D) |

**The control:**

- A `<button>` carrying the **current value as a real label**, not a truncated option string.
- Pressing it opens an **anchored DRAWER** — grammar tier 3, slides from an edge, **never a modal
  over a modal**. `stationApp.js` already has the Floating-UI machinery (`computePosition`, `flip`,
  `shift`, `size`, `autoUpdate`) with a correct close-on-outside-click contract that exempts the
  opener by construction; reuse that pattern rather than re-solving it.
- Options are a **roving-tabindex list** (`role=listbox` / `role=option`), arrows + `Home` + `End` +
  type-ahead, `Esc` closes, focus returns to the button.
- **Every option shows its consequence**, which a `<select>` structurally cannot: a drone program
  shows its `upkeepPerMin` and what it will do; a commodity shows its current spread. That is the
  actual reason to replace the control, and it is why this is a design change and not a re-skin.
- **≥12 px**, SUBHEAD label over DATA numerals, `tabular-nums`.
- Class name may not contain `menu`, `panel`, `card` or `modal` (§3c) — `sx-picker` / `sx-drawer`.
- Reduced motion: the drawer appears without sliding. Forced colors: stroked, no shadow.

---

# D. Retirement

| File | Size | Recommendation |
|---|---|---|
| `src/ui/screens/starmap.js` | 61 KB | **Retire.** Superseded by `galaxyMap.js`. Removes one `<select>`. |
| `src/ui/screens/localmap.js` | 40 KB | **Retire.** Superseded by `galaxyMap.js`. |
| `src/ui/screens/stationHub.js` | 234 KB | **Retire after extracting seven helpers** (listed at the top of this document) into a small module. It is also the sole importer of `uiPrimitives.js`. |
| `src/ui/screens/services.js` | 25 KB | **Unregister formally.** Not in `SCREEN_MODULES`; its insurance logic is reused by the dock verb (§A.7), the rest is superseded by the vitals. |
| `src/ui/screens/shipyard.js`, `outfitting.js`, `manufacture.js` | 39 / 46 / 13 KB | Not in `SCREEN_MODULES`. Confirm no live import path, then retire. |
| `src/ui/screens/market.js`, `bar.js`, `factions.js` | 94 / 69 / 11 KB | **Keep — they are libraries, not screens.** The station screens import `computeBestTrades`, `applyTradeNavigation`, `generateContacts`, `getChoices`, `buildReply`, `tierFor`, `FACTION_TIERS`, `factionStandingGuidance` from them. Do not "clean these up." |
| `src/ui/screens/drill.js` | 128 KB | Keep for its exported input-controller and particle helpers, which checks assert. |

Per grammar §10: **do not retrofit the 44 private style injectors.** Let them die with their
screens. **Do adopt `uiPrimitives.js` in all new work** — it currently ships in zero live screens.

---

# E. Build order

Ordered so that no step lands on top of an unflattened sheet or an unreconciled check.

0. **Reconcile `check:station-tabs`** (§0). Nothing else may land first.
1. **Flatten, appearance held constant**, worst first: contracts (62) → market (40) → bar (37) →
   industry (36) → factions (23). Rename `__console` / `__active` / `__leads` / `__detail` →
   `.sx-apron`; fix the three class-name traps (§3c); extract the seven `stationHub` helpers.
2. **Generalise `[data-why]`** — one delegated listener on `.sx-workspace` reading the banks in
   §3d. This alone gives factions its first tooltip and surfaces four data files that have zero UI
   importers today.
3. **One delegated rate-limited `pointerover`** on `#screens` for `ui_hover` (§9.10). Today only
   gamepad focus emits hover; this one listener makes the whole build feel responsive.
4. **Insurance as the fifth dock verb** (§A.7).
5. **Station interiors**, in payoff order: **Factions** (worst-to-best ratio: a numberless dial over
   14×9×±1000 of real simulation) → **Market** (the cross-station scope that makes trade possible at
   all) → **Contracts** → **Industry** → **Bar** → **Ledger**.
6. **Meta layer**: `--bare` + per-screen backdrop for all eight, then `gameOver` → `pause` →
   `help` → `saveLoad` → `settings` → `codex` → `missionLog` → `automationPanel`.
7. **`sx-picker`** (§C), then retire `starmap` / `localmap`.

## Definition of done — per grammar §12, plus two additions

1. Silhouette distinguishable from every other screen with the text removed.
2. Exactly one DISPLAY-sized element; nothing below 12 px.
3. APRON contains at least one verb.
4. STAGE responds to pointer, keyboard **and** gamepad.
5. Every animation maps to a row of grammar §5.
6. Legible and complete under reduced-motion **and** `forced-colors`.
7. Tier 2 "why" wired for every value a player could reasonably question.
8. **Looked at** in a captured frame at 1440×900 **and** 1280×720.
9. **No class name contains** `pulse` / `blink` / `flash`, or `panel` / `card` / `menu` / `modal` on
   an element whose meaning lives in a gradient, shadow or background image.
10. **The check that guards it was verified to be looking at the live DOM**, not at a selector that
    was renamed out from under it. `.sx-readout` is the cautionary tale: 5 lines of CSS and a
    runtime assertion, both pointed at an element no code has emitted for some time.
