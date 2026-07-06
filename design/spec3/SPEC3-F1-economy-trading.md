# SPEC3-F1 — Economy & Trading (specs 10–12)
**Thread:** F1 · **Reads:** `_context/02_SIM_ECONOMY_WORLD.md` §1/§5/§7, GDD §11 · **Status:** PLAN
**Thread pitch:** the economy sim is the crown jewel and it's running in the dark. These specs turn
already-computed depth into visible, playable, strategic systems — then add the one missing layer
(economic warfare) that makes the market a battlefield.

Ground truth (from recon, all live code): price = `basePrice·clamp((stock/baseEq)^-el, .40, 2.60)`
(`economy.js:133-135`); producers drift stock to 2.0×baseEq, consumers to 0.35× — that gradient IS
route profit (`economy.js:9-13,163-165`; the baseEq/equilibrium split is load-bearing, never
"simplify"). Price-impact is a closed-form integral (`avgMid`, `economy.js:137-149`) so flooding a
lane self-decays. Spread 8% base, +6% frontier penalty. Stock drifts with ~1.9 min half-life every
5 s tick. **Hidden regional price cycles** (`economyCycles.js`): seeded sine regimes
(stable/volatile/rising/falling/turbulent, re-rolled 180–420 s) with `predictPriceCurve()` +
`regimeLabel()` — full forecasting, zero UI. Events (shortage/boom/blockade/piracy) propagate one
hop with ×0.35 decay. `marketMemory` (last-seen prices), `marketIntel`, `tradeLots` (FIFO cost-basis
→ real per-run profit) all tracked, all invisible. Faction WAR layer (power scores, 5 contested
pairs, tension→war→sector flips at |momentum|≥100) runs daily, invisibly.

---

## SPEC3-10 — Living economy, made legible
**One-line pitch:** a market-news layer + supply-chain read that makes the simulation's cause-and-
effect visible — the player learns the economy is real by *watching it move*.

### 1. Why / what's holding us back
Recon §1.11: cycles computed but chartless; events fire silently; the production graph
(`producedBy[]/consumedBy[]` on all 33 commodities — mining→ore→refinery→refined→fab→components→
military) exists only as data. Players can't tell the living economy from a random-number generator —
so it earns zero trust and zero strategy.

### 2. The design
- **The Ticker (station + nav chart):** a 1-line rotating feed fed by real events:
  `economy:eventStarted/Ended` → "BLOCKADE: Vesta Forge — outbound freight frozen"; war-state changes
  → "Tension rising: Io Reach (MTS vs Free)"; sector flips; hunter sightings (F4-22). Max 1 line,
  4 s dwell, attention-arbiter tier `chatter` (never interrupts). Every headline is *tradeable
  information* — the ticker is a strategy surface disguised as flavor.
- **Market chart (the big one):** per-commodity sparkline at the market screen: last 10 min of mid
  price (sampled 10 s from `lastMid` cache) + the *forecast cone* from `predictPriceCurve()` drawn
  as a translucent band, labeled with `regimeLabel()` ("Rising demand"). Charts make the learn-the-
  wave skill layer (recon §1.5) real: buy into a rising regime, race the re-roll clock.
- **Supply-chain glyphs:** each commodity row shows tiny `producedBy → consumedBy` station-type
  icons. Hover a refinery: "buys ore (cheap when belts are healthy) · sells refined metals". The
  whole economy teaches itself in one tooltip pattern.
- **Event cards on arrival:** docking at a station under an event shows one card ("SHORTAGE —
  medical goods ×2.1 · ends ~4 min") — the FTL-style beat GDD §6.4 wants, reusing the comms-choice UI.
- **Post-trade readout:** on sell, one toast from `tradeLots` cost-basis: "+2,340 cr profit (31%)
  — best this run". Profit becomes *felt*, not inferred.

### 3. Architecture & wiring
All read-side: a new `src/systems/marketNews.js` (subscribes: `economy:eventStarted/Ended`,
faction-war day-tick events, `encounter:resolved`; maintains `state.ui.newsQueue`, 12-item ring).
Chart: `market.js` screen adds a canvas sparkline fed by a 60-sample ring buffer in `marketIntel`
(extend `economy.js:430-441` snapshot to append samples — bounded, save-safe). Forecast:
`predictPriceCurve()` already returns the curve; render only, zero sim change. Ticker DOM: one line
in hud.js top-center channel, tier-gated by the arbiter (SPEC3-40). Determinism: untouched — every
feature here consumes existing events/caches.

### 4. Key code
```js
// marketIntel sampling — bounded ring, no per-frame allocation, saved compactly.
function sampleIntel(entry, ring) {           // called on the existing 5s econ tick, not per frame
  ring.t[(ring.i = (ring.i + 1) % 60)] = entry.lastMid;
}
// Forecast cone render: draw predictPriceCurve() ±(amplitude·basePrice) band. The CONE (uncertainty),
// not a line (oracle) — the regime can re-roll; the band's width IS that honesty.
```

### 5–6. Assets / deps
Sparkline + glyphs = canvas/CSS, existing atlas. No new deps.

### 7. Build plan
1. Intel ring + sparkline + regime label on market screen; `scripts/check-market-chart.mjs`
   (ring bounded, samples deterministic, forecast matches economyCycles output).
2. Ticker system + arbiter tier + event/war/flip headlines.
3. Supply-chain glyph row + tooltip; event arrival card.
4. Post-trade profit toast from tradeLots.
5. Floor: `check:sim:compare`, `check-price-memory.mjs`, `check:market-nav`.

### 8. Anti-patterns
Oracle forecasts (always cone + "if regime holds"); ticker spam (1 line, chatter tier, drop-if-stale);
charts that need a manual (sparkline + label only — no candlesticks); exposing the raw formula
(mystery with hints beats spreadsheet).

### 9. Ambition ceiling
Regional "market index" per sector on the nav chart (avg deviation from basePrice) — one glance
shows where money is loud. Feeds F7-30's sector identity.

---

## SPEC3-11 — Trading UX: memory, routes & the merchant's map
**One-line pitch:** surface `marketMemory` on the maps and add a knowledge-honest route advisor —
Elite's market data without the spreadsheet, exploration becomes market research.

### 1. Why
GDD §11 asks for exactly this; recon confirms the data exists (`economy.js:444-465` memory,
`marketIntel`, Dijkstra routing in `world.js`). What's missing is pure UX — and the *doctrine*:
the game must only ever advise from what the PLAYER has seen (no omniscience), so flying somewhere
new has trade value.

### 2. The design
- **Price memory overlay (nav chart + local map):** toggle shows, per known station, last-seen
  buy/sell for the commodity you're holding (or a picked one) + age chip ("4 min / 2 jumps old").
  Stale fades: >15 min renders hollow. Data age becomes an instinct.
- **Best-known-margin line:** for the selected commodity, the chart draws ONE suggested lane
  (buy X here → sell there) computed strictly over `marketMemory`, weighted by
  `margin − fuelCost − riskPenalty(interdiction)` reusing Dijkstra edge weights. Caption is honest:
  "best *known* margin — prices may have moved."
- **Cargo-aware quotes:** the buy dialog shows `priceImpactPct` (already returned by `quote()`,
  `economy.js:499-501`) as "flooding this market −12%" — teaching the sweet-spot mechanic that
  already exists.
- **Trade ledger screen (small):** last 10 trades with per-lot margins (tradeLots), lifetime stats
  (`lifetimeProfit`, `biggestSingleProfit`, `smuggledValue`). One screen, zero new sim.
- **Survey data → market data:** buying survey data (world.js, `750+tier·1250` cr) now ALSO seeds
  marketMemory with a 1-time snapshot of that sector's stations (age-stamped "survey"). Intel
  becomes a purchasable good; bars sell knowledge (hooks F7-31 rumors).

### 3. Architecture & wiring
Overlay renders in `starmap.js`/`localmap.js` from `state.player.marketMemory` (already saved).
Route advisor = pure function in a new `src/systems/tradeAdvisor.js` (read-only over memory + world
graph; recompute on dock/undock only — never per frame). Survey seeding: extend the survey-purchase
handler in `world.js` to call a new `economy.seedMemoryFromSurvey(sectorId, ageTag)`. All read-side;
determinism untouched.

### 4. Key code
```js
// tradeAdvisor.js — knowledge-honest by construction: it can ONLY see marketMemory.
export function bestKnownLane(memory, graph, cmdtyId, fuelPrice) {
  let best = null;
  for (const a of memory.stations()) for (const b of memory.stations()) {
    if (a === b) continue;
    const buy = memory.get(a, cmdtyId)?.buy, sell = memory.get(b, cmdtyId)?.sell;
    if (buy == null || sell == null) continue;
    const route = graph.route(a.sectorId, b.sectorId);            // existing Dijkstra
    const score = (sell - buy) - route.totalFuel * fuelPrice - route.risk; // risk = Σ interdict·K
    if (!best || score > best.score) best = { a, b, score, route };
  }
  return best;                     // O(known²) — known stays ≤ ~30 stations; fine on dock events
}
```

### 5–6. Assets / deps
Map chips/lines use existing map styling. No new deps.

### 7. Build plan
1. Memory overlay + age fade on both maps (`scripts/check-memory-overlay.mjs`: only visited
   stations render; ages correct; hidden with overlay off).
2. Advisor + one-lane suggestion + honest caption.
3. Impact % in trade dialog; ledger screen.
4. Survey→memory seeding (+ bar rumor variant).
5. Floor: `check:market-nav`, `check-price-memory.mjs`.

### 8. Anti-patterns
Omniscient route finders (the #1 way space-trading games kill exploration); auto-trade buttons
(advise, never act); overlay clutter (one commodity at a time, ever); punishing staleness with
lies (stale data fades — it never *invents*).

### 9. Ambition ceiling
Shareable "trade log" export at run end (credits/hr curve, best lane) — the brag screenshot.

---

## SPEC3-12 — Contracts, black market & economic warfare
**One-line pitch:** make the shadow economy and the faction war *playable* — smuggling with real
stakes, blockade running as content, and player-visible economic strikes.

### 1. Why
Recon: contraband scanning/fines/bribes fully work (`economy.js:837-891`); blackmarket stations
gate illegal goods; blockade events freeze restock (drift ×0.1); destroying a pirate base already
injects a narcotics shortage (`economy.js:1022-1032`); the faction war runs invisibly (§5.1). All
the verbs exist as sim — none exist as *decisions with drama*.

### 2. The design
- **Smuggling 2.0:** contraband jobs show the *risk math up front* (scan chance per gate from
  security + your cloak: recon formula `clamp(0.25·(1+sec)−cloak, .02, .95)`). Route choice becomes
  the gameplay: pay the high-security gate toll and eat 40% scan odds, or fly the frontier lane past
  pirates. Smuggler-hold module (exists) + bribe path (exists, 30% of fine) get surfaced in the scan
  event card: **Submit / Bribe / Run**. Run = the chase minigame (patrol scan-lock, GDD §6.4) —
  escaping marks you "hot" at that faction's gates for 10 min (scan +15%).
- **Blockade running:** when a blockade event is live, that station's board offers *blockade-runner
  contracts* (deliver food/meds at 2.5–3× reward, collateral required, SCN hostile-on-scan while
  carrying). The economy event becomes a mission-shape and a moral texture (feeding Sker Haven vs
  supplying Vale's embargo — narrative hooks, F7-32).
- **Economic warfare (the new layer):** three player verbs, all routed through the EXISTING event
  injector (`injectEvent`, `economy.js:909-935`) so the sim stays canonical:
  1. **Supply strike** (faction mission): destroy a convoy (F7-29 shape) → injects `shortage` at its
     destination (pressure 0.7, propagates 1 hop). You can *cause* the price spike you then trade.
  2. **Market flood** (contract): deliver N units of a faction-subsidized commodity → injects `boom`
     at a rival's station (their margins collapse; war tension +).
  3. **Toll war:** repeatedly stiffing tolls raises pirate-faction lean at that gate (existing
     tension nudges) — cheap play, real consequences.
- **The bounty-board station (Charon fix):** recon §4.6 — Charon's identity doc wants a bounty
  board; add station archetype `bounty_board` (OFFER_MIX heavy on bounty/patrol/salvage; sells
  `survey data` and hunter rumors). One data change closes a world gap and gives econ-warfare a home.
- **Wreck towing contracts (F3-17 tie):** salvage-yard contracts to tether-tow wrecks; payout by
  wreck mass × distance — the tether's industry verb gets an employer.

### 3. Architecture & wiring
Mission templates in `src/data/missions.js` (new types: `blockade_run`, `supply_strike`,
`market_flood`, `wreck_tow` with `OFFER_MIX` weights gated on live events/war state — board gen
already reads sector danger, extend gates to read `economy.activeEvents` + faction war state).
Scan event card = comms-choice UI (exists). "Hot" flag: `state.player.heat[factionId] = untilSim`
(saved). Charon archetype: `sectors.js` + `economy.js` station-type table. Economic strikes emit
through `mission:forceEvent` (exists). Determinism: mission boards stay seeded (`hash32(seed,
stationId, epoch)`); event-gated offers derive from sim state, which is itself deterministic.

### 4. Key code
```js
// The Submit/Bribe/Run card — drama is a function of SEEING the odds. Numbers ON for this one
// (exception to no-numbers: crime is a calculated business).
bus.emit('comms:choice', {
  title: 'CONCORD CUSTOMS — CARGO SCAN', options: [
    { id: 'submit', label: `Submit (fine ~${estFine} cr, cargo seized)` },
    { id: 'bribe',  label: `Bribe (${Math.round(estFine * 0.3)} cr, keep standing)`, gate: credits },
    { id: 'run',    label: 'Run (patrols engage · gates go hot 10 min)' },
  ]});
```

### 5–6. Assets / deps
Bounty-board station reuses station meshes + palette swap; no new deps.

### 7. Build plan
1. Scan card (Submit/Bribe/Run) + hot flag + chase hook; `scripts/check-smuggling-card.mjs`.
2. Blockade-runner contracts gated on live blockade events.
3. Supply-strike + market-flood mission types → `injectEvent` wiring; war-tension nudges.
4. Charon `bounty_board` archetype + wreck-tow contracts.
5. Floor: `check:sim:compare`, mission board determinism check, `check:balance` (warn-review).

### 8. Anti-patterns
Consequence-free crime (heat/rep/fines must bite); RNG-only smuggling (odds visible, route choice
real); econ-warfare griefing the player's own economy invisibly (strikes always headline on the
ticker — SPEC3-10); a 4th currency (everything stays credits + rep + heat).

### 9. Ambition ceiling
Faction embargo campaigns: a war at `tension≥75` spawns a 3-mission strike chain per side; finishing
one *flips a sector's owner* (the |momentum|≥100 flip that already exists) — the player becomes the
hand on the scale, and sees it on the map.
