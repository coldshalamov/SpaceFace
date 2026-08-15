<!-- LIFETIME: DURABLE -->
# 06 — MARKET COHERENCE: prices the player can actually study

Owner's report: station price charts look like "random steps going up and down" — not a
learnable function, not plannable, not exploitable by skill. This is precisely the failure the
system was built to avoid, so this is a **find-the-bug-and-fix-it** task, not a redesign.

## What the code says (verified)

`src/systems/economyCycles.js` is a hidden wave-equation engine: per station+commodity, a
regime (stable/sine/rising/falling/poly families/volatile/turbulent) with 25–90 min durations,
continuous formulas, weighted regime picks, factor clamps [0.58, 1.72], `CYCLE_WEIGHT 0.5`,
and a `predictPriceCurve` forecast helper. The *intent* is exactly right: smooth, learnable
motion inside a long-lived regime, rare re-rolls, mean-reverting band.

The displayed result doesn't match the intent. Suspects to investigate, in order:

1. **Sampling / history recording.** If price history points are recorded at sparse or
   irregular intervals, a continuous function *renders* as steps. Check the market history
   writer (economy.js) for sample cadence and quantization (integer rounding per sample on
   cheap goods = visible stairs). Fix: regular fixed-cadence sampling; chart interpolates the
   true function between samples; keep raw values unrounded for history.
2. **Noise stacked on the formula.** Stock-multiplier jitter, per-trade price impact, event
   `demandMult` steps, and spread re-derivation can each dwarf the cycle (which only
   contributes half its deviation by design). Audit what fraction of displayed Δprice comes
   from the formula vs everything else; anything non-formula that flickers per-tick must be
   smoothed, slowed, or removed from the *chart* series (the chart shows the learnable
   signal; transaction noise lives in the quote, not the graph).
3. **Regime re-roll discontinuity.** `createCycle` re-rolls phase/amplitude/family; a new
   regime can start at a value far from where the old one ended → a vertical jump on the
   chart that reads as noise. Fix: blend regimes — on re-roll, crossfade old→new over
   ~2–5 min (factor = lerp(oldFactor, newFactor, blendT)), and bias initial phase so the
   new curve starts near the current price.
4. **Re-roll frequency.** `maybeAdvanceRegime` also re-rolls when the raw factor goes
   non-positive — with clamps at 0.35–2.80 that should be rare; verify it is.

## The target (owner's standard)

- A player watching one commodity's chart for ~2 minutes can correctly guess the next few
  minutes' direction most of the time, within a regime.
- Regime changes are rare (25–90 min) and *legible as events*: the chart bends, and the
  station's news/rumor feed can say why (hooks exist — `newsTemplates.js`).
- Prices never trend to absurdity: the existing band [0.35×, 2.8× base] is the guarantee.
- Different stations have different dominant families (their "personalities" — a refinery
  station's metals sine is a learnable identity).
- `predictPriceCurve` (or successor) powers an honest "if current conditions hold" forecast
  overlay on the market chart — the planning tool the owner imagined. Dashed, labeled as a
  projection, wrong when regimes flip. Being sometimes wrong is fine; being noise is not.

## Acceptance (measurable, per 09_VALIDATION)

- **Continuity:** over any regime, tick-to-tick |Δ mid| stays under a stated bound except at
  recorded, explained events (each jump must carry an event id).
- **Smoothness:** second-difference of the charted series bounded; no zero-order-hold stairs
  in recorded history.
- **Learnability score:** fit the last N minutes of the series with the regime family and
  forecast M minutes ahead; median relative error under a stated threshold across all
  station/commodity pairs in a seeded run.
- **Blend check:** no chart discontinuity > bound at 1000 seeded regime transitions.
- Human gate: owner opens three market charts and judges "I could plan a haul off this."
