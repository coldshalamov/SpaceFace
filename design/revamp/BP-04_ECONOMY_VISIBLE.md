# BP-04 — ECONOMY VISIBLE

> **Extends** `SPEC3-F1` (§10 living-economy, §11 trading-UX). **Builds on** Wave-1 `marketNews.js`.
> The economy sim is the **deepest system in the codebase and it runs invisible** — this is the highest
> value-per-effort domain in the plan.

## Goal
Objective #3: *the economy breathes on-screen*. A player makes a speculative trade off a news item and it pays.

## Scope
- [ ] **NPC trade loop phase 2** (`npcEconomy.js` — deferred from Wave 1 for double-count risk): trader NPCs
      pick routes from real prices and buy/sell through the **existing** trade-event seam, **flag-gated, small
      volumes**. Then, as a deliberate BP-04 step, *stage the replacement* of abstract offscreen flows with
      real trader volume (never both at once — see RISK #4). Convoys (BP-01) draw their cargo fiction from this.
- [ ] **Market news** depth (extends Wave-1 ticker): forecast cones (render `predictPriceCurve()`),
      supply-chain glyphs (producedBy→consumedBy icons + tooltips), dock **event cards** on arrival
      (shortage/boom), post-trade profit% / cost-basis toast (data exists in `tradeLots`).
- [ ] **Atmospheric-economy surfacing** — Silt/air scarcity as the visible spine: which sectors are being cut,
      MTS short positions as headlines, Quiet canister runs. Ties price to the story (REVAMP_MASTER §7).

## Primary files
`src/ui/marketNews.js` + `src/data/newsTemplates.js` (own, from Wave 1), new `src/systems/npcEconomy.js` +
`src/data/tradeRoutes.js`, the market/trade screen, `src/systems/economy.js`/`economyCycles.js` (read-mostly;
any write is single-owner + flag-gated).

## Acceptance
`check:market-news` (new): headlines are deterministic per seed and reflect real economy events; NPC traders
move goods without desyncing prices (assert conservation: real+abstract flow ≤ prior abstract flow when the
replacement flag is on); `check:balance` stays green.

## Dependencies
Wave-1 `marketNews`; `voiceArbiter`; coordinate with BP-01 convoys.
