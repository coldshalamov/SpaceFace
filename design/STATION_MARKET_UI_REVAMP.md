# Station Market & Hub Screen Revamp — Design Spec

> **Status: LEGACY 2026-07-06.** This is unmanaged drift per `AGENTS.md §4`. The live UI authority is
> `design/spec2/06_UI_IDENTITY.md` + the taste constitution `design/spec2/00_MASTER_TASTE.md` (esp. §3:
> clean non-diegetic HUD — no cockpit/visor motifs) + the economy threads `design/spec3/SPEC3-F1*` /
> `SPEC3-F2*`. The chart/market-viz goal here is partially captured by `design/revamp/` T8h
> (`check:market-chart`). Do **not** implement this revamp wholesale from this file — reconcile against
> spec2/06 and the revamp ledger first.

**Goal:** Replace the cramped, text-heavy station Market tab (and the hub shell that contains it) with a spacious, distinctive trade-control-panel interface that uses charts, visual hierarchy, and industrial sci-fi styling. The economy behind the charts must feel alive: hidden regional events push prices along partially-predictable curves, so reading the chart is a real skill.

**Scope:**
- `src/ui/screens/market.js` — full panel rewrite.
- `src/ui/screens/stationHub.js` — hub shell size + rail redesign (benefits all tabs).
- `src/ui/screens/shipyard.js` — larger preview pane + denser hull cards (viewer complaint).
- `src/systems/economy.js` — add cyclic regional price drivers + visible event history.
- `src/ui/priceHistory.js` / `src/ui/sparkline.js` — longer-horizon, higher-resolution history + event markers.
- `styles/ui.css` — new station scoped CSS block.

**Out of scope:** No new npm deps; no changes to core trade math or save format beyond adding `priceCycles`/`eventHistory` to economy state; no 3D preview renderer internals.

---

## 1. Aesthetic direction: Industrial Trade Terminal

- **Tone:** gritty, working-space, non-diegetic control panel. Think Freelancer commodity exchange meets a rigging-company SCADA terminal.
- **No glassmorphism.** Solid, dark steel panels (`#0a0f17` to `#111a26`), machine-cut borders, cyan/amber data accents, warning red for danger.
- **Texture details:** subtle horizontal scanline overlay on panels, corner "bracket" decorations on cards, 1px hairlines, uppercase mono labels with ≥0.12em letter-spacing.
- **Color lock:** reuse existing palette — cyan `#39d0ff`, amber `#ffb35c`, red `#ff5c5c`, good `#62e08a`, energy `#ffd84a`. No new hues.
- **Typography:** keep existing `--mono` and `--font`. Use mono for numbers/labels, sans for short content.
- **No `backdrop-filter`.** Opaque panels only.

---

## 2. Hub shell changes

The current hub is `min(1100px, 94vw) × min(760px, 92vh)` — a small postcard in the center of the screen.

- New size: `min(1600px, 96vw) × min(920px, 94vh)`.
- Remove the double stacked purpose/handoff text walls at the top; collapse them into a single thin status strip.
- Left rail: 196px wide, icon + full label, no truncation. Use horizontal tab group at the top of the content area instead for the Market sub-views (optional; fallback to rail).
- Keep the airlock graffiti strip (it is part of worldbuilding) but make it a thin 28px ticker, not a multi-line wall.

---

## 3. Market tab layout

Three-column workspace:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STATION NAME · TYPE · CREDITS · CARGO · UNDOCK                              │
├──────────┬──────────────────────────────────────────────────────┬───────────┤
│ CATEGORY │  COMMODITY CARDS (responsive grid)                   │ INTEL     │
│ RAIL     │  each card: name, mini chart, buy/sell, qty, btns    │ SIDEBAR   │
│          │                                                      │ events,   │
│          │                                                      │ routes,   │
│          │                                                      │ ledger    │
└──────────┴──────────────────────────────────────────────────────┴───────────┘
```

- **Left category rail:** filter by commodity category (Raw Ore, Gas, Refined, Component, etc.) using icon + full name. No truncation. Active category highlighted with left cyan bar.
- **Center commodity grid:** responsive card grid. Minimum card width 260px, 2–4 columns depending on viewport. Each card is a self-contained trade tile.
- **Right intel sidebar:**
  - Best trade routes (visual route cards with profit bars).
  - Regional event feed (shortage/boom/blockade/piracy) with countdown.
  - Trade ledger mini-list.
  - Price-chart modal trigger for selected commodity.

---

## 4. Commodity card design

Each card is a visual unit, not a table row.

- Header: category glyph + commodity name + legality tag (restricted/contraband) if applicable.
- Subheader: one-line role hint shown as a tooltip, not inline text.
- Sparkline: 120×40 px inline chart with gradient fill under the line. Color by trend (up = amber/warm, down = cyan/cool).
- Price row: big BUY and SELL numbers. Heat indicator arrow (cheap ▼ green, dear ▲ red, flat ─).
- Owned badge: only shown if >0.
- Qty stepper: compact segmented control `1 | 10 | 100 | MAX`; current selection highlighted.
- Action buttons: `BUY` (green) and `SELL` (amber/red). Disabled state is dim + strikethrough price.
- Card hover: lift 2px, border glow to cyan, chart line thickens.
- Card click (not on buttons) opens the **expanded chart drawer/modal**.

---

## 5. Expanded price chart

Clicking a commodity opens a modal/overlay with a large chart (≈700×360px).

- **Time horizons:** Session / 1h / All. Default Session.
- **Data:**
  - Solid line = observed mid price history (longer buffer than current 32 points; target 128–256 points).
  - Faint dashed line = predicted continuation of the current cyclic formula (next ~20 ticks).
  - Vertical markers = economic event start/end.
  - Baseline band = basePrice ± 10% shaded.
- **Tooltip on hover:** shows exact price, age, and any active event.
- **Event log below chart:** list of recent events affecting this commodity/region.

---

## 6. Economy simulation: predictable cycles + hidden events

The existing economy has events (`shortage`, `boom`, `blockade`, `piracy`) but the price path is mostly drift back to equilibrium. Add a per-station, per-commodity **cyclic driver** so charts have shape the player can read.

### 6.1 Regional cycle model

Each `(stationId, commodityId)` gets a hidden `PriceCycle` object stored in `state.economy.cycles[stationId][cmdtyId]`:

```js
{
  phase: 0..2π,          // current phase
  frequency: f,           // radians per second (slow: 0.0003–0.002)
  amplitude: a,           // fraction of basePrice (0.08–0.35)
  bias: b,                // vertical offset (-0.15..0.15)
  regime: 'stable'|'volatile'|'declining'|'rising',
  regimeEndT: t,          // when the formula parameters may re-roll
}
```

The cycle produces a `cycleFactor`:

```
cycleFactor = 1 + bias + amplitude * sin(phase + frequency * elapsedT)
```

This factor multiplies the equilibrium target before drift:

```
effectiveEq = equilibrium * eventMods * clamp(cycleFactor, 0.6, 1.6)
```

### 6.2 Regime changes (the "random event")

- Every `REGIME_INTERVAL_S = 180–360s` (random per cycle), the cycle may re-roll `amplitude`, `frequency`, `bias`, and `regime`.
- The re-roll is seeded; the player sees the *effect* (chart curve changes) but not the cause.
- Display only the symptom in the event feed: e.g., "Volatility forecast: high" or "Consumer demand cooling" — no specific formula.

### 6.3 Visible events still exist

The existing event system (`injectEvent`) remains. Events create sharp discontinuities; cycles create smooth waves. Together they give charts readable structure.

### 6.4 History recording

`priceHistory.js` is upgraded:
- `MAX_POINTS = 256` (was 32).
- Sample every economy tick (was every 3rd).
- Store `(mid, buy, sell, simTime, eventIds[])` objects instead of raw numbers.
- Expose `getPriceHistory(stationId, cmdtyId, maxAgeS)`.

### 6.5 Predicted curve

A new `predictPriceCurve(stationId, cmdtyId, steps)` uses the current cycle parameters to project future mid prices. Drawn as a dashed line in the expanded chart. This is the "skill" layer: players learn to extrapolate the visible wave.

---

## 7. Interaction & motion

- **No new animation library.** Use CSS transitions + keyframes.
- Tab/card entrance: staggered fade/slide (0 → 1 opacity, +6px y) over 180ms with `cubic-bezier(0.16, 1, 0.3, 1)`.
- Hover: card lifts, border color shifts, chart line stroke widens.
- Button press: scale 0.97 + border flash.
- Chart modal: backdrop fades in, panel scales from 0.96 → 1.
- Tooltips: pure CSS `::after` tooltips on `[title]` converted to custom `data-tip` attributes; 120ms fade.
- Keyboard: maintain full tab navigation; cards focusable; enter opens chart; space toggles qty.
- Reduced motion: respect `prefers-reduced-motion` — disable transforms, keep instant state changes.

---

## 8. Accessibility

- All interactive elements have visible focus rings (2px cyan outline).
- Color is not the only signal: heat uses ▼/▲/─ symbols + words in tooltips.
- Charts have `aria-label` describing trend direction.
- Buttons have explicit `aria-label` with price + qty.
- Keyboard navigation through category rail → cards → qty → actions.

---

## 9. Shipyard viewer fix

- Increase preview pane from 168px to 320px tall and make it span 2/3 of the panel width.
- Move the hull list to the right as a scrollable column, or keep below if width is tight.
- Increase `previewCanvas` resolution to match container (use `ResizeObserver` or CSS scaling).
- The 3D renderer itself is not changed; only its container + layout.

---

## 10. Verification plan

1. `npm run check:market-first-loop` must still pass (or be updated if the test is viewport-sensitive).
2. `npm run check:market-navigation` must pass.
3. Manual browser check: open Market, verify:
   - no truncated labels;
   - cards use most of the screen;
   - expanded chart opens and shows history + prediction;
   - events appear in the feed;
   - buy/sell still update credits/cargo.
4. `npm run check:sim:compare` (hashEqual) — must not regress.
5. Five-second test: screenshot the Market tab; a stranger should name: credits, cargo, category filter, commodity cards, best route, event feed.

---

## 11. Implementation order

1. Extend hub shell size + rail (stationHub.js + CSS).
2. Add price-cycle system to economy.js + priceHistory.js upgrades.
3. Rewrite market.js with card grid + chart modal.
4. Add new scoped CSS block.
5. Enlarge shipyard preview (shipyard.js + CSS).
6. Run checks and iterate with browser screenshots.
