<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->
# World, economy, missions, mining, and progression

Harden and enrich the living-world loops through existing owners, catalogs, and verbs.

**Tasks:** 100 · **Range:** `JULES-0701`–`JULES-0800`

## JULES-0701 — Commodity catalog and market identity — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-commodities`

**Objective:** Audit the data and owner relationships for commodity catalog and market identity. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in commodity IDs, unit semantics, category consistency, availability, pricing, and player-facing market identity.

**Context:** commodity catalog and market identity: commodity IDs, unit semantics, category consistency, availability, pricing, and player-facing market identity.

**Inspect:** `src/data/commodities.js`, `src/systems/economy.js`, `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map commodity catalog and market identity to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by commodity IDs, unit semantics, category consistency, availability, pricing, and player-facing market identity.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:commodity-flavor`
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0701 --format prompt`

## JULES-0702 — Commodity catalog and market identity — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-commodities`

**Objective:** Exercise commodity catalog and market identity across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** commodity catalog and market identity: commodity IDs, unit semantics, category consistency, availability, pricing, and player-facing market identity.

**Inspect:** `src/data/commodities.js`, `src/systems/economy.js`, `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map commodity catalog and market identity to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by commodity IDs, unit semantics, category consistency, availability, pricing, and player-facing market identity.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:commodity-flavor`
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0702 --format prompt`

## JULES-0703 — Commodity catalog and market identity — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-commodities`

**Objective:** Save and reload commodity catalog and market identity at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** commodity catalog and market identity: commodity IDs, unit semantics, category consistency, availability, pricing, and player-facing market identity.

**Inspect:** `src/data/commodities.js`, `src/systems/economy.js`, `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map commodity catalog and market identity to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by commodity IDs, unit semantics, category consistency, availability, pricing, and player-facing market identity.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:commodity-flavor`
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0703 --format prompt`

## JULES-0704 — Commodity catalog and market identity — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-commodities`

**Objective:** Improve one bounded feedback/discoverability failure in commodity catalog and market identity: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** commodity catalog and market identity: commodity IDs, unit semantics, category consistency, availability, pricing, and player-facing market identity.

**Inspect:** `src/data/commodities.js`, `src/systems/economy.js`, `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map commodity catalog and market identity to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by commodity IDs, unit semantics, category consistency, availability, pricing, and player-facing market identity.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:commodity-flavor`
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0704 --format prompt`

## JULES-0705 — Commodity catalog and market identity — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-commodities`

**Objective:** Add one small production content slice for commodity catalog and market identity using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** commodity catalog and market identity: commodity IDs, unit semantics, category consistency, availability, pricing, and player-facing market identity.

**Inspect:** `src/data/commodities.js`, `src/systems/economy.js`, `src/ui/screens/market.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map commodity catalog and market identity to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by commodity IDs, unit semantics, category consistency, availability, pricing, and player-facing market identity.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:commodity-flavor`
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0705 --format prompt`

## JULES-0706 — Market supply, demand, spreads, and price history — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-market-dynamics`

**Objective:** Audit the data and owner relationships for market supply, demand, spreads, and price history. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in transaction arithmetic, bounded stock, supply-demand drift, spread behavior, history sampling, and legible price causality.

**Context:** market supply, demand, spreads, and price history: transaction arithmetic, bounded stock, supply-demand drift, spread behavior, history sampling, and legible price causality.

**Inspect:** `src/systems/economy.js`, `src/ui/priceHistory.js`, `src/ui/sparkline.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map market supply, demand, spreads, and price history to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by transaction arithmetic, bounded stock, supply-demand drift, spread behavior, history sampling, and legible price causality.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:balance`
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0706 --format prompt`

## JULES-0707 — Market supply, demand, spreads, and price history — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-market-dynamics`

**Objective:** Exercise market supply, demand, spreads, and price history across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** market supply, demand, spreads, and price history: transaction arithmetic, bounded stock, supply-demand drift, spread behavior, history sampling, and legible price causality.

**Inspect:** `src/systems/economy.js`, `src/ui/priceHistory.js`, `src/ui/sparkline.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map market supply, demand, spreads, and price history to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by transaction arithmetic, bounded stock, supply-demand drift, spread behavior, history sampling, and legible price causality.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:balance`
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0707 --format prompt`

## JULES-0708 — Market supply, demand, spreads, and price history — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-market-dynamics`

**Objective:** Save and reload market supply, demand, spreads, and price history at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** market supply, demand, spreads, and price history: transaction arithmetic, bounded stock, supply-demand drift, spread behavior, history sampling, and legible price causality.

**Inspect:** `src/systems/economy.js`, `src/ui/priceHistory.js`, `src/ui/sparkline.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map market supply, demand, spreads, and price history to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by transaction arithmetic, bounded stock, supply-demand drift, spread behavior, history sampling, and legible price causality.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:balance`
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0708 --format prompt`

## JULES-0709 — Market supply, demand, spreads, and price history — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-market-dynamics`

**Objective:** Improve one bounded feedback/discoverability failure in market supply, demand, spreads, and price history: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** market supply, demand, spreads, and price history: transaction arithmetic, bounded stock, supply-demand drift, spread behavior, history sampling, and legible price causality.

**Inspect:** `src/systems/economy.js`, `src/ui/priceHistory.js`, `src/ui/sparkline.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map market supply, demand, spreads, and price history to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by transaction arithmetic, bounded stock, supply-demand drift, spread behavior, history sampling, and legible price causality.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:balance`
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0709 --format prompt`

## JULES-0710 — Market supply, demand, spreads, and price history — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-market-dynamics`

**Objective:** Add one small production content slice for market supply, demand, spreads, and price history using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** market supply, demand, spreads, and price history: transaction arithmetic, bounded stock, supply-demand drift, spread behavior, history sampling, and legible price causality.

**Inspect:** `src/systems/economy.js`, `src/ui/priceHistory.js`, `src/ui/sparkline.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map market supply, demand, spreads, and price history to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by transaction arithmetic, bounded stock, supply-demand drift, spread behavior, history sampling, and legible price causality.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:balance`
- `npm run check:known-vs-live-prices`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0710 --format prompt`

## JULES-0711 — Cargo capacity, mass, and transfer logistics — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-cargo-logistics`

**Objective:** Audit the data and owner relationships for cargo capacity, mass, and transfer logistics. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.

**Context:** cargo capacity, mass, and transfer logistics: single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.

**Inspect:** `src/systems/cargo.js`, `src/data/commodities.js`, `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map cargo capacity, mass, and transfer logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:fragile-cargo`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0711 --format prompt`

## JULES-0712 — Cargo capacity, mass, and transfer logistics — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-cargo-logistics`

**Objective:** Exercise cargo capacity, mass, and transfer logistics across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** cargo capacity, mass, and transfer logistics: single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.

**Inspect:** `src/systems/cargo.js`, `src/data/commodities.js`, `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map cargo capacity, mass, and transfer logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:fragile-cargo`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0712 --format prompt`

## JULES-0713 — Cargo capacity, mass, and transfer logistics — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-cargo-logistics`

**Objective:** Save and reload cargo capacity, mass, and transfer logistics at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** cargo capacity, mass, and transfer logistics: single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.

**Inspect:** `src/systems/cargo.js`, `src/data/commodities.js`, `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map cargo capacity, mass, and transfer logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:fragile-cargo`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0713 --format prompt`

## JULES-0714 — Cargo capacity, mass, and transfer logistics — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-cargo-logistics`

**Objective:** Improve one bounded feedback/discoverability failure in cargo capacity, mass, and transfer logistics: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** cargo capacity, mass, and transfer logistics: single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.

**Inspect:** `src/systems/cargo.js`, `src/data/commodities.js`, `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map cargo capacity, mass, and transfer logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:fragile-cargo`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0714 --format prompt`

## JULES-0715 — Cargo capacity, mass, and transfer logistics — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-cargo-logistics`

**Objective:** Add one small production content slice for cargo capacity, mass, and transfer logistics using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** cargo capacity, mass, and transfer logistics: single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.

**Inspect:** `src/systems/cargo.js`, `src/data/commodities.js`, `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map cargo capacity, mass, and transfer logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer cargo mutations, volume caps, mass consequences, partial transfers, overflow, and pickup feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:fragile-cargo`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0715 --format prompt`

## JULES-0716 — Crafting, refining, and manufacturing queues — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-crafting`

**Objective:** Audit the data and owner relationships for crafting, refining, and manufacturing queues. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.

**Context:** crafting, refining, and manufacturing queues: recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.

**Inspect:** `src/systems/crafting.js`, `src/data/blueprints.js`, `src/ui/screens/automationPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map crafting, refining, and manufacturing queues to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0716 --format prompt`

## JULES-0717 — Crafting, refining, and manufacturing queues — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-crafting`

**Objective:** Exercise crafting, refining, and manufacturing queues across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** crafting, refining, and manufacturing queues: recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.

**Inspect:** `src/systems/crafting.js`, `src/data/blueprints.js`, `src/ui/screens/automationPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map crafting, refining, and manufacturing queues to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0717 --format prompt`

## JULES-0718 — Crafting, refining, and manufacturing queues — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-crafting`

**Objective:** Save and reload crafting, refining, and manufacturing queues at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** crafting, refining, and manufacturing queues: recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.

**Inspect:** `src/systems/crafting.js`, `src/data/blueprints.js`, `src/ui/screens/automationPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map crafting, refining, and manufacturing queues to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0718 --format prompt`

## JULES-0719 — Crafting, refining, and manufacturing queues — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-crafting`

**Objective:** Improve one bounded feedback/discoverability failure in crafting, refining, and manufacturing queues: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** crafting, refining, and manufacturing queues: recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.

**Inspect:** `src/systems/crafting.js`, `src/data/blueprints.js`, `src/ui/screens/automationPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map crafting, refining, and manufacturing queues to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0719 --format prompt`

## JULES-0720 — Crafting, refining, and manufacturing queues — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-crafting`

**Objective:** Add one small production content slice for crafting, refining, and manufacturing queues using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** crafting, refining, and manufacturing queues: recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.

**Inspect:** `src/systems/crafting.js`, `src/data/blueprints.js`, `src/ui/screens/automationPanel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map crafting, refining, and manufacturing queues to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by recipe inputs and outputs, queue lifecycle, cancellation/refunds, station context, completion delivery, and save persistence.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0720 --format prompt`

## JULES-0721 — Ship acquisition and outfitting progression — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-ship-progression`

**Objective:** Audit the data and owner relationships for ship acquisition and outfitting progression. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in purchase gates, credit/cargo/module transfers, derived-stat recomputation, starter-to-upgrade curve, and transaction rollback.

**Context:** ship acquisition and outfitting progression: purchase gates, credit/cargo/module transfers, derived-stat recomputation, starter-to-upgrade curve, and transaction rollback.

**Inspect:** `src/systems/ships.js`, `src/data/ships.js`, `src/ui/screens/shipyard.js`, `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map ship acquisition and outfitting progression to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by purchase gates, credit/cargo/module transfers, derived-stat recomputation, starter-to-upgrade curve, and transaction rollback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:handling-profile`
- `npm run check:mass-delta`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0721 --format prompt`

## JULES-0722 — Ship acquisition and outfitting progression — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-ship-progression`

**Objective:** Exercise ship acquisition and outfitting progression across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** ship acquisition and outfitting progression: purchase gates, credit/cargo/module transfers, derived-stat recomputation, starter-to-upgrade curve, and transaction rollback.

**Inspect:** `src/systems/ships.js`, `src/data/ships.js`, `src/ui/screens/shipyard.js`, `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map ship acquisition and outfitting progression to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by purchase gates, credit/cargo/module transfers, derived-stat recomputation, starter-to-upgrade curve, and transaction rollback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:handling-profile`
- `npm run check:mass-delta`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0722 --format prompt`

## JULES-0723 — Ship acquisition and outfitting progression — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-ship-progression`

**Objective:** Save and reload ship acquisition and outfitting progression at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** ship acquisition and outfitting progression: purchase gates, credit/cargo/module transfers, derived-stat recomputation, starter-to-upgrade curve, and transaction rollback.

**Inspect:** `src/systems/ships.js`, `src/data/ships.js`, `src/ui/screens/shipyard.js`, `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map ship acquisition and outfitting progression to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by purchase gates, credit/cargo/module transfers, derived-stat recomputation, starter-to-upgrade curve, and transaction rollback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:handling-profile`
- `npm run check:mass-delta`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0723 --format prompt`

## JULES-0724 — Ship acquisition and outfitting progression — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-ship-progression`

**Objective:** Improve one bounded feedback/discoverability failure in ship acquisition and outfitting progression: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** ship acquisition and outfitting progression: purchase gates, credit/cargo/module transfers, derived-stat recomputation, starter-to-upgrade curve, and transaction rollback.

**Inspect:** `src/systems/ships.js`, `src/data/ships.js`, `src/ui/screens/shipyard.js`, `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map ship acquisition and outfitting progression to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by purchase gates, credit/cargo/module transfers, derived-stat recomputation, starter-to-upgrade curve, and transaction rollback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:handling-profile`
- `npm run check:mass-delta`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0724 --format prompt`

## JULES-0725 — Ship acquisition and outfitting progression — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-ship-progression`

**Objective:** Add one small production content slice for ship acquisition and outfitting progression using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** ship acquisition and outfitting progression: purchase gates, credit/cargo/module transfers, derived-stat recomputation, starter-to-upgrade curve, and transaction rollback.

**Inspect:** `src/systems/ships.js`, `src/data/ships.js`, `src/ui/screens/shipyard.js`, `src/ui/screens/outfitting.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map ship acquisition and outfitting progression to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by purchase gates, credit/cargo/module transfers, derived-stat recomputation, starter-to-upgrade curve, and transaction rollback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:handling-profile`
- `npm run check:mass-delta`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0725 --format prompt`

## JULES-0726 — Technology tree progression — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-tech-progression`

**Objective:** Audit the data and owner relationships for technology tree progression. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.

**Context:** technology tree progression: prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.

**Inspect:** `src/data/tech.js`, `src/ui/screens/techTree.js`, `src/systems/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map technology tree progression to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0726 --format prompt`

## JULES-0727 — Technology tree progression — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-tech-progression`

**Objective:** Exercise technology tree progression across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** technology tree progression: prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.

**Inspect:** `src/data/tech.js`, `src/ui/screens/techTree.js`, `src/systems/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map technology tree progression to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0727 --format prompt`

## JULES-0728 — Technology tree progression — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-tech-progression`

**Objective:** Save and reload technology tree progression at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** technology tree progression: prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.

**Inspect:** `src/data/tech.js`, `src/ui/screens/techTree.js`, `src/systems/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map technology tree progression to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0728 --format prompt`

## JULES-0729 — Technology tree progression — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-tech-progression`

**Objective:** Improve one bounded feedback/discoverability failure in technology tree progression: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** technology tree progression: prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.

**Inspect:** `src/data/tech.js`, `src/ui/screens/techTree.js`, `src/systems/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map technology tree progression to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0729 --format prompt`

## JULES-0730 — Technology tree progression — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-tech-progression`

**Objective:** Add one small production content slice for technology tree progression using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** technology tree progression: prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.

**Inspect:** `src/data/tech.js`, `src/ui/screens/techTree.js`, `src/systems/ships.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map technology tree progression to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by prerequisite graph integrity, unlock affordability, duplicate purchases, derived effects, discoverability, and old-save normalization.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0730 --format prompt`

## JULES-0731 — Beam mining cadence and seam extraction — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-beam-mining`

**Objective:** Audit the data and owner relationships for beam mining cadence and seam extraction. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.

**Context:** beam mining cadence and seam extraction: target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.

**Inspect:** `src/systems/mining.js`, `src/data/mining.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map beam mining cadence and seam extraction to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:mining:bulk-guidance`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0731 --format prompt`

## JULES-0732 — Beam mining cadence and seam extraction — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-beam-mining`

**Objective:** Exercise beam mining cadence and seam extraction across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** beam mining cadence and seam extraction: target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.

**Inspect:** `src/systems/mining.js`, `src/data/mining.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map beam mining cadence and seam extraction to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:mining:bulk-guidance`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0732 --format prompt`

## JULES-0733 — Beam mining cadence and seam extraction — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-beam-mining`

**Objective:** Save and reload beam mining cadence and seam extraction at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** beam mining cadence and seam extraction: target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.

**Inspect:** `src/systems/mining.js`, `src/data/mining.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map beam mining cadence and seam extraction to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:mining:bulk-guidance`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0733 --format prompt`

## JULES-0734 — Beam mining cadence and seam extraction — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-beam-mining`

**Objective:** Improve one bounded feedback/discoverability failure in beam mining cadence and seam extraction: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** beam mining cadence and seam extraction: target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.

**Inspect:** `src/systems/mining.js`, `src/data/mining.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map beam mining cadence and seam extraction to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:mining:bulk-guidance`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0734 --format prompt`

## JULES-0735 — Beam mining cadence and seam extraction — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-beam-mining`

**Objective:** Add one small production content slice for beam mining cadence and seam extraction using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** beam mining cadence and seam extraction: target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.

**Inspect:** `src/systems/mining.js`, `src/data/mining.js`, `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map beam mining cadence and seam extraction to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by target acquisition, seam multipliers, extraction cadence, release behavior, deterministic yield, and readable mining feedback.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:mining:bulk-guidance`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0735 --format prompt`

## JULES-0736 — Asteroid fracture, chunks, and pickup convergence — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-asteroid-fracture`

**Objective:** Audit the data and owner relationships for asteroid fracture, chunks, and pickup convergence. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.

**Context:** asteroid fracture, chunks, and pickup convergence: fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.

**Inspect:** `src/systems/mining.js`, `src/systems/cargo.js`, `src/systems/asteroidFormations.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map asteroid fracture, chunks, and pickup convergence to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:asteroid-motion`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0736 --format prompt`

## JULES-0737 — Asteroid fracture, chunks, and pickup convergence — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-asteroid-fracture`

**Objective:** Exercise asteroid fracture, chunks, and pickup convergence across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** asteroid fracture, chunks, and pickup convergence: fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.

**Inspect:** `src/systems/mining.js`, `src/systems/cargo.js`, `src/systems/asteroidFormations.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map asteroid fracture, chunks, and pickup convergence to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:asteroid-motion`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0737 --format prompt`

## JULES-0738 — Asteroid fracture, chunks, and pickup convergence — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-asteroid-fracture`

**Objective:** Save and reload asteroid fracture, chunks, and pickup convergence at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** asteroid fracture, chunks, and pickup convergence: fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.

**Inspect:** `src/systems/mining.js`, `src/systems/cargo.js`, `src/systems/asteroidFormations.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map asteroid fracture, chunks, and pickup convergence to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:asteroid-motion`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0738 --format prompt`

## JULES-0739 — Asteroid fracture, chunks, and pickup convergence — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-asteroid-fracture`

**Objective:** Improve one bounded feedback/discoverability failure in asteroid fracture, chunks, and pickup convergence: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** asteroid fracture, chunks, and pickup convergence: fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.

**Inspect:** `src/systems/mining.js`, `src/systems/cargo.js`, `src/systems/asteroidFormations.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map asteroid fracture, chunks, and pickup convergence to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:asteroid-motion`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0739 --format prompt`

## JULES-0740 — Asteroid fracture, chunks, and pickup convergence — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-asteroid-fracture`

**Objective:** Add one small production content slice for asteroid fracture, chunks, and pickup convergence using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** asteroid fracture, chunks, and pickup convergence: fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.

**Inspect:** `src/systems/mining.js`, `src/systems/cargo.js`, `src/systems/asteroidFormations.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map asteroid fracture, chunks, and pickup convergence to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by fracture topology, chunk ownership, direct-to-cargo rules, vacuum convergence, cleanup, collision, and large-chunk hauling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:asteroid-motion`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0740 --format prompt`

## JULES-0741 — Rich-core and deep-drill play — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-rich-core`

**Objective:** Audit the data and owner relationships for rich-core and deep-drill play. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.

**Context:** rich-core and deep-drill play: core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.

**Inspect:** `src/systems/drill.js`, `src/ui/screens/drill.js`, `src/data/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map rich-core and deep-drill play to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:drill-smooth`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0741 --format prompt`

## JULES-0742 — Rich-core and deep-drill play — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-rich-core`

**Objective:** Exercise rich-core and deep-drill play across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** rich-core and deep-drill play: core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.

**Inspect:** `src/systems/drill.js`, `src/ui/screens/drill.js`, `src/data/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map rich-core and deep-drill play to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:drill-smooth`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0742 --format prompt`

## JULES-0743 — Rich-core and deep-drill play — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-rich-core`

**Objective:** Save and reload rich-core and deep-drill play at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** rich-core and deep-drill play: core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.

**Inspect:** `src/systems/drill.js`, `src/ui/screens/drill.js`, `src/data/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map rich-core and deep-drill play to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:drill-smooth`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0743 --format prompt`

## JULES-0744 — Rich-core and deep-drill play — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-rich-core`

**Objective:** Improve one bounded feedback/discoverability failure in rich-core and deep-drill play: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** rich-core and deep-drill play: core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.

**Inspect:** `src/systems/drill.js`, `src/ui/screens/drill.js`, `src/data/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map rich-core and deep-drill play to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:drill-smooth`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0744 --format prompt`

## JULES-0745 — Rich-core and deep-drill play — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-rich-core`

**Objective:** Add one small production content slice for rich-core and deep-drill play using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** rich-core and deep-drill play: core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.

**Inspect:** `src/systems/drill.js`, `src/ui/screens/drill.js`, `src/data/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map rich-core and deep-drill play to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by core reveal, timing interaction, hazard resolution, rewards, state reset, input reachability, and mining-loop handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:drill-smooth`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0745 --format prompt`

## JULES-0746 — Scanner, recon, and discovery state — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-scanner-discovery`

**Objective:** Audit the data and owner relationships for scanner, recon, and discovery state. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.

**Context:** scanner, recon, and discovery state: scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.

**Inspect:** `src/systems/scanner.js`, `src/data/sectors.js`, `src/ui/radar.js`, `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map scanner, recon, and discovery state to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:scan-reveal`
- `npm run check:map-confidence`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0746 --format prompt`

## JULES-0747 — Scanner, recon, and discovery state — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-scanner-discovery`

**Objective:** Exercise scanner, recon, and discovery state across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** scanner, recon, and discovery state: scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.

**Inspect:** `src/systems/scanner.js`, `src/data/sectors.js`, `src/ui/radar.js`, `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map scanner, recon, and discovery state to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:scan-reveal`
- `npm run check:map-confidence`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0747 --format prompt`

## JULES-0748 — Scanner, recon, and discovery state — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-scanner-discovery`

**Objective:** Save and reload scanner, recon, and discovery state at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** scanner, recon, and discovery state: scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.

**Inspect:** `src/systems/scanner.js`, `src/data/sectors.js`, `src/ui/radar.js`, `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map scanner, recon, and discovery state to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:scan-reveal`
- `npm run check:map-confidence`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0748 --format prompt`

## JULES-0749 — Scanner, recon, and discovery state — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-scanner-discovery`

**Objective:** Improve one bounded feedback/discoverability failure in scanner, recon, and discovery state: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** scanner, recon, and discovery state: scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.

**Inspect:** `src/systems/scanner.js`, `src/data/sectors.js`, `src/ui/radar.js`, `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map scanner, recon, and discovery state to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:scan-reveal`
- `npm run check:map-confidence`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0749 --format prompt`

## JULES-0750 — Scanner, recon, and discovery state — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `world-scanner-discovery`

**Objective:** Add one small production content slice for scanner, recon, and discovery state using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** scanner, recon, and discovery state: scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.

**Inspect:** `src/systems/scanner.js`, `src/data/sectors.js`, `src/ui/radar.js`, `src/ui/screens/starmap.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map scanner, recon, and discovery state to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by scan pulse lifecycle, reveal ownership, duplicate discoveries, saved knowledge, marker semantics, and mission credit.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:scan-reveal`
- `npm run check:map-confidence`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0750 --format prompt`

## JULES-0751 — Sector topology, routes, gates, and place registration — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-sector-topology`

**Objective:** Audit the data and owner relationships for sector topology, routes, gates, and place registration. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.

**Context:** sector topology, routes, gates, and place registration: graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.

**Inspect:** `src/data/sectors.js`, `src/systems/world.js`, `src/data/PLACE_REGISTRATION.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map sector topology, routes, gates, and place registration to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:atlas-integrity`
- `npm run check:map-nav-context`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0751 --format prompt`

## JULES-0752 — Sector topology, routes, gates, and place registration — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-sector-topology`

**Objective:** Exercise sector topology, routes, gates, and place registration across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** sector topology, routes, gates, and place registration: graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.

**Inspect:** `src/data/sectors.js`, `src/systems/world.js`, `src/data/PLACE_REGISTRATION.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map sector topology, routes, gates, and place registration to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:atlas-integrity`
- `npm run check:map-nav-context`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0752 --format prompt`

## JULES-0753 — Sector topology, routes, gates, and place registration — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-sector-topology`

**Objective:** Save and reload sector topology, routes, gates, and place registration at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** sector topology, routes, gates, and place registration: graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.

**Inspect:** `src/data/sectors.js`, `src/systems/world.js`, `src/data/PLACE_REGISTRATION.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map sector topology, routes, gates, and place registration to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:atlas-integrity`
- `npm run check:map-nav-context`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0753 --format prompt`

## JULES-0754 — Sector topology, routes, gates, and place registration — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-sector-topology`

**Objective:** Improve one bounded feedback/discoverability failure in sector topology, routes, gates, and place registration: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** sector topology, routes, gates, and place registration: graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.

**Inspect:** `src/data/sectors.js`, `src/systems/world.js`, `src/data/PLACE_REGISTRATION.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map sector topology, routes, gates, and place registration to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:atlas-integrity`
- `npm run check:map-nav-context`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0754 --format prompt`

## JULES-0755 — Sector topology, routes, gates, and place registration — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-sector-topology`

**Objective:** Add one small production content slice for sector topology, routes, gates, and place registration using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** sector topology, routes, gates, and place registration: graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.

**Inspect:** `src/data/sectors.js`, `src/systems/world.js`, `src/data/PLACE_REGISTRATION.md`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map sector topology, routes, gates, and place registration to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by graph connectivity, unreachable places, reciprocal routes, spawn anchors, registration completeness, and map visibility.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:atlas-integrity`
- `npm run check:map-nav-context`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0755 --format prompt`

## JULES-0756 — Hazards, cruise interdiction, and local danger — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-hazards-interdiction`

**Objective:** Audit the data and owner relationships for hazards, cruise interdiction, and local danger. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.

**Context:** hazards, cruise interdiction, and local danger: hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.

**Inspect:** `src/systems/world.js`, `src/systems/cruise.js`, `src/systems/dangerModel.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map hazards, cruise interdiction, and local danger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`
- `npm run check:core-combat-loop`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0756 --format prompt`

## JULES-0757 — Hazards, cruise interdiction, and local danger — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-hazards-interdiction`

**Objective:** Exercise hazards, cruise interdiction, and local danger across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** hazards, cruise interdiction, and local danger: hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.

**Inspect:** `src/systems/world.js`, `src/systems/cruise.js`, `src/systems/dangerModel.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map hazards, cruise interdiction, and local danger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:baseline`
- `npm run check:core-combat-loop`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0757 --format prompt`

## JULES-0758 — Hazards, cruise interdiction, and local danger — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-hazards-interdiction`

**Objective:** Save and reload hazards, cruise interdiction, and local danger at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** hazards, cruise interdiction, and local danger: hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.

**Inspect:** `src/systems/world.js`, `src/systems/cruise.js`, `src/systems/dangerModel.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map hazards, cruise interdiction, and local danger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:baseline`
- `npm run check:core-combat-loop`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0758 --format prompt`

## JULES-0759 — Hazards, cruise interdiction, and local danger — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-hazards-interdiction`

**Objective:** Improve one bounded feedback/discoverability failure in hazards, cruise interdiction, and local danger: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** hazards, cruise interdiction, and local danger: hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.

**Inspect:** `src/systems/world.js`, `src/systems/cruise.js`, `src/systems/dangerModel.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map hazards, cruise interdiction, and local danger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:baseline`
- `npm run check:core-combat-loop`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0759 --format prompt`

## JULES-0760 — Hazards, cruise interdiction, and local danger — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-hazards-interdiction`

**Objective:** Add one small production content slice for hazards, cruise interdiction, and local danger using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** hazards, cruise interdiction, and local danger: hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.

**Inspect:** `src/systems/world.js`, `src/systems/cruise.js`, `src/systems/dangerModel.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map hazards, cruise interdiction, and local danger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by hazard entry/exit, mass-lock and cruise drop, danger semantics, telegraph windows, deterministic selection, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:baseline`
- `npm run check:core-combat-loop`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0760 --format prompt`

## JULES-0761 — Factions, reputation, law, and wanted consequences — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-factions-law`

**Objective:** Audit the data and owner relationships for factions, reputation, law, and wanted consequences. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.

**Context:** factions, reputation, law, and wanted consequences: single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.

**Inspect:** `src/systems/factions.js`, `src/systems/heat.js`, `src/data/factions.js`, `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map factions, reputation, law, and wanted consequences to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0761 --format prompt`

## JULES-0762 — Factions, reputation, law, and wanted consequences — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-factions-law`

**Objective:** Exercise factions, reputation, law, and wanted consequences across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** factions, reputation, law, and wanted consequences: single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.

**Inspect:** `src/systems/factions.js`, `src/systems/heat.js`, `src/data/factions.js`, `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map factions, reputation, law, and wanted consequences to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0762 --format prompt`

## JULES-0763 — Factions, reputation, law, and wanted consequences — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-factions-law`

**Objective:** Save and reload factions, reputation, law, and wanted consequences at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** factions, reputation, law, and wanted consequences: single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.

**Inspect:** `src/systems/factions.js`, `src/systems/heat.js`, `src/data/factions.js`, `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map factions, reputation, law, and wanted consequences to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0763 --format prompt`

## JULES-0764 — Factions, reputation, law, and wanted consequences — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-factions-law`

**Objective:** Improve one bounded feedback/discoverability failure in factions, reputation, law, and wanted consequences: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** factions, reputation, law, and wanted consequences: single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.

**Inspect:** `src/systems/factions.js`, `src/systems/heat.js`, `src/data/factions.js`, `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map factions, reputation, law, and wanted consequences to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0764 --format prompt`

## JULES-0765 — Factions, reputation, law, and wanted consequences — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-factions-law`

**Objective:** Add one small production content slice for factions, reputation, law, and wanted consequences using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** factions, reputation, law, and wanted consequences: single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.

**Inspect:** `src/systems/factions.js`, `src/systems/heat.js`, `src/data/factions.js`, `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map factions, reputation, law, and wanted consequences to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by single-writer reputation, threshold transitions, WANTED propagation, lawful hostility, docking consequences, and recovery.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0765 --format prompt`

## JULES-0766 — Civilian traffic routes and behavior — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-civilian-traffic`

**Objective:** Audit the data and owner relationships for civilian traffic routes and behavior. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.

**Context:** civilian traffic routes and behavior: route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.

**Inspect:** `src/systems/traffic.js`, `src/systems/world.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map civilian traffic routes and behavior to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0766 --format prompt`

## JULES-0767 — Civilian traffic routes and behavior — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-civilian-traffic`

**Objective:** Exercise civilian traffic routes and behavior across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** civilian traffic routes and behavior: route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.

**Inspect:** `src/systems/traffic.js`, `src/systems/world.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map civilian traffic routes and behavior to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0767 --format prompt`

## JULES-0768 — Civilian traffic routes and behavior — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-civilian-traffic`

**Objective:** Save and reload civilian traffic routes and behavior at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** civilian traffic routes and behavior: route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.

**Inspect:** `src/systems/traffic.js`, `src/systems/world.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map civilian traffic routes and behavior to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0768 --format prompt`

## JULES-0769 — Civilian traffic routes and behavior — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-civilian-traffic`

**Objective:** Improve one bounded feedback/discoverability failure in civilian traffic routes and behavior: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** civilian traffic routes and behavior: route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.

**Inspect:** `src/systems/traffic.js`, `src/systems/world.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map civilian traffic routes and behavior to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0769 --format prompt`

## JULES-0770 — Civilian traffic routes and behavior — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-civilian-traffic`

**Objective:** Add one small production content slice for civilian traffic routes and behavior using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** civilian traffic routes and behavior: route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.

**Inspect:** `src/systems/traffic.js`, `src/systems/world.js`, `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map civilian traffic routes and behavior to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by route generation, passive team semantics, despawn/respawn, collision avoidance, lifecycle cadence, and visible purpose.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0770 --format prompt`

## JULES-0771 — Claims, beacons, and player infrastructure — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `world-claims-beacons`

**Objective:** Audit the data and owner relationships for claims, beacons, and player infrastructure. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.

**Context:** claims, beacons, and player infrastructure: placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.

**Inspect:** `src/systems/claims.js`, `src/systems/beacons.js`, `src/data/claimableBodies.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map claims, beacons, and player infrastructure to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0771 --format prompt`

## JULES-0772 — Claims, beacons, and player infrastructure — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-claims-beacons`

**Objective:** Exercise claims, beacons, and player infrastructure across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** claims, beacons, and player infrastructure: placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.

**Inspect:** `src/systems/claims.js`, `src/systems/beacons.js`, `src/data/claimableBodies.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map claims, beacons, and player infrastructure to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0772 --format prompt`

## JULES-0773 — Claims, beacons, and player infrastructure — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-claims-beacons`

**Objective:** Save and reload claims, beacons, and player infrastructure at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** claims, beacons, and player infrastructure: placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.

**Inspect:** `src/systems/claims.js`, `src/systems/beacons.js`, `src/data/claimableBodies.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map claims, beacons, and player infrastructure to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0773 --format prompt`

## JULES-0774 — Claims, beacons, and player infrastructure — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-claims-beacons`

**Objective:** Improve one bounded feedback/discoverability failure in claims, beacons, and player infrastructure: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** claims, beacons, and player infrastructure: placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.

**Inspect:** `src/systems/claims.js`, `src/systems/beacons.js`, `src/data/claimableBodies.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map claims, beacons, and player infrastructure to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0774 --format prompt`

## JULES-0775 — Claims, beacons, and player infrastructure — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `world-claims-beacons`

**Objective:** Add one small production content slice for claims, beacons, and player infrastructure using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** claims, beacons, and player infrastructure: placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.

**Inspect:** `src/systems/claims.js`, `src/systems/beacons.js`, `src/data/claimableBodies.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map claims, beacons, and player infrastructure to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by placement legality, ownership, duplicate deployment, persistence, destruction, map registration, and resource handoff.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0775 --format prompt`

## JULES-0776 — Station mission-board generation — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-mission-board`

**Objective:** Audit the data and owner relationships for station mission-board generation. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in seeded offer generation, role and sector fit, duplicate suppression, expiration, replacement cadence, and board legibility.

**Context:** station mission-board generation: seeded offer generation, role and sector fit, duplicate suppression, expiration, replacement cadence, and board legibility.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`, `src/ui/screens/stationHub.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map station mission-board generation to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by seeded offer generation, role and sector fit, duplicate suppression, expiration, replacement cadence, and board legibility.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0776 --format prompt`

## JULES-0777 — Station mission-board generation — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-mission-board`

**Objective:** Exercise station mission-board generation across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** station mission-board generation: seeded offer generation, role and sector fit, duplicate suppression, expiration, replacement cadence, and board legibility.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`, `src/ui/screens/stationHub.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map station mission-board generation to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by seeded offer generation, role and sector fit, duplicate suppression, expiration, replacement cadence, and board legibility.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0777 --format prompt`

## JULES-0778 — Station mission-board generation — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-mission-board`

**Objective:** Save and reload station mission-board generation at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** station mission-board generation: seeded offer generation, role and sector fit, duplicate suppression, expiration, replacement cadence, and board legibility.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`, `src/ui/screens/stationHub.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map station mission-board generation to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by seeded offer generation, role and sector fit, duplicate suppression, expiration, replacement cadence, and board legibility.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0778 --format prompt`

## JULES-0779 — Station mission-board generation — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-mission-board`

**Objective:** Improve one bounded feedback/discoverability failure in station mission-board generation: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** station mission-board generation: seeded offer generation, role and sector fit, duplicate suppression, expiration, replacement cadence, and board legibility.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`, `src/ui/screens/stationHub.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map station mission-board generation to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by seeded offer generation, role and sector fit, duplicate suppression, expiration, replacement cadence, and board legibility.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0779 --format prompt`

## JULES-0780 — Station mission-board generation — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-mission-board`

**Objective:** Add one small production content slice for station mission-board generation using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** station mission-board generation: seeded offer generation, role and sector fit, duplicate suppression, expiration, replacement cadence, and board legibility.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`, `src/ui/screens/stationHub.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map station mission-board generation to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by seeded offer generation, role and sector fit, duplicate suppression, expiration, replacement cadence, and board legibility.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0780 --format prompt`

## JULES-0781 — Mission objective tracking and reward settlement — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-mission-tracking`

**Objective:** Audit the data and owner relationships for mission objective tracking and reward settlement. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.

**Context:** mission objective tracking and reward settlement: event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.

**Inspect:** `src/systems/missions.js`, `src/ui/screens/missionLog.js`, `src/systems/economy.js`, `src/systems/cargo.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map mission objective tracking and reward settlement to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0781 --format prompt`

## JULES-0782 — Mission objective tracking and reward settlement — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-mission-tracking`

**Objective:** Exercise mission objective tracking and reward settlement across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** mission objective tracking and reward settlement: event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.

**Inspect:** `src/systems/missions.js`, `src/ui/screens/missionLog.js`, `src/systems/economy.js`, `src/systems/cargo.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map mission objective tracking and reward settlement to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0782 --format prompt`

## JULES-0783 — Mission objective tracking and reward settlement — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-mission-tracking`

**Objective:** Save and reload mission objective tracking and reward settlement at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** mission objective tracking and reward settlement: event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.

**Inspect:** `src/systems/missions.js`, `src/ui/screens/missionLog.js`, `src/systems/economy.js`, `src/systems/cargo.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map mission objective tracking and reward settlement to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0783 --format prompt`

## JULES-0784 — Mission objective tracking and reward settlement — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-mission-tracking`

**Objective:** Improve one bounded feedback/discoverability failure in mission objective tracking and reward settlement: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** mission objective tracking and reward settlement: event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.

**Inspect:** `src/systems/missions.js`, `src/ui/screens/missionLog.js`, `src/systems/economy.js`, `src/systems/cargo.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map mission objective tracking and reward settlement to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0784 --format prompt`

## JULES-0785 — Mission objective tracking and reward settlement — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `world-mission-tracking`

**Objective:** Add one small production content slice for mission objective tracking and reward settlement using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** mission objective tracking and reward settlement: event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.

**Inspect:** `src/systems/missions.js`, `src/ui/screens/missionLog.js`, `src/systems/economy.js`, `src/systems/cargo.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map mission objective tracking and reward settlement to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by event-to-objective attribution, multi-step state, abandon/fail/complete races, idempotent rewards, and save/reload.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0785 --format prompt`

## JULES-0786 — Story beats, narrative memory, and player ledger — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-story-ledger`

**Objective:** Audit the data and owner relationships for story beats, narrative memory, and player ledger. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.

**Context:** story beats, narrative memory, and player ledger: beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.

**Inspect:** `src/systems/story.js`, `src/systems/aceMemory.js`, `src/data/narrative.js`, `src/data/sectorAnchors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map story beats, narrative memory, and player ledger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0786 --format prompt`

## JULES-0787 — Story beats, narrative memory, and player ledger — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-story-ledger`

**Objective:** Exercise story beats, narrative memory, and player ledger across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** story beats, narrative memory, and player ledger: beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.

**Inspect:** `src/systems/story.js`, `src/systems/aceMemory.js`, `src/data/narrative.js`, `src/data/sectorAnchors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map story beats, narrative memory, and player ledger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0787 --format prompt`

## JULES-0788 — Story beats, narrative memory, and player ledger — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-story-ledger`

**Objective:** Save and reload story beats, narrative memory, and player ledger at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** story beats, narrative memory, and player ledger: beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.

**Inspect:** `src/systems/story.js`, `src/systems/aceMemory.js`, `src/data/narrative.js`, `src/data/sectorAnchors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map story beats, narrative memory, and player ledger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0788 --format prompt`

## JULES-0789 — Story beats, narrative memory, and player ledger — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-story-ledger`

**Objective:** Improve one bounded feedback/discoverability failure in story beats, narrative memory, and player ledger: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** story beats, narrative memory, and player ledger: beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.

**Inspect:** `src/systems/story.js`, `src/systems/aceMemory.js`, `src/data/narrative.js`, `src/data/sectorAnchors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map story beats, narrative memory, and player ledger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0789 --format prompt`

## JULES-0790 — Story beats, narrative memory, and player ledger — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-story-ledger`

**Objective:** Add one small production content slice for story beats, narrative memory, and player ledger using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** story beats, narrative memory, and player ledger: beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.

**Inspect:** `src/systems/story.js`, `src/systems/aceMemory.js`, `src/data/narrative.js`, `src/data/sectorAnchors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map story beats, narrative memory, and player ledger to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by beat prerequisites, one-time delivery, remembered consequences, stale callbacks, branching consistency, and player comprehension.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0790 --format prompt`

## JULES-0791 — Battle aftermath, wrecks, and persistent world sites — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** high · **Size:** s · **Collision:** `world-aftermath-sites`

**Objective:** Audit the data and owner relationships for battle aftermath, wrecks, and persistent world sites. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.

**Context:** battle aftermath, wrecks, and persistent world sites: combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.

**Inspect:** `src/systems/aftermathWrecks.js`, `src/systems/asteroidSites.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map battle aftermath, wrecks, and persistent world sites to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:battle-aftermath`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0791 --format prompt`

## JULES-0792 — Battle aftermath, wrecks, and persistent world sites — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-aftermath-sites`

**Objective:** Exercise battle aftermath, wrecks, and persistent world sites across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** battle aftermath, wrecks, and persistent world sites: combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.

**Inspect:** `src/systems/aftermathWrecks.js`, `src/systems/asteroidSites.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map battle aftermath, wrecks, and persistent world sites to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:battle-aftermath`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0792 --format prompt`

## JULES-0793 — Battle aftermath, wrecks, and persistent world sites — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-aftermath-sites`

**Objective:** Save and reload battle aftermath, wrecks, and persistent world sites at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** battle aftermath, wrecks, and persistent world sites: combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.

**Inspect:** `src/systems/aftermathWrecks.js`, `src/systems/asteroidSites.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map battle aftermath, wrecks, and persistent world sites to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:battle-aftermath`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0793 --format prompt`

## JULES-0794 — Battle aftermath, wrecks, and persistent world sites — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-aftermath-sites`

**Objective:** Improve one bounded feedback/discoverability failure in battle aftermath, wrecks, and persistent world sites: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** battle aftermath, wrecks, and persistent world sites: combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.

**Inspect:** `src/systems/aftermathWrecks.js`, `src/systems/asteroidSites.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map battle aftermath, wrecks, and persistent world sites to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:battle-aftermath`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0794 --format prompt`

## JULES-0795 — Battle aftermath, wrecks, and persistent world sites — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `world-aftermath-sites`

**Objective:** Add one small production content slice for battle aftermath, wrecks, and persistent world sites using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** battle aftermath, wrecks, and persistent world sites: combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.

**Inspect:** `src/systems/aftermathWrecks.js`, `src/systems/asteroidSites.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map battle aftermath, wrecks, and persistent world sites to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by combat-to-aftermath handoff, wreck ownership, salvageability, persistence, cleanup, revisits, and readable environmental storytelling.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:battle-aftermath`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0795 --format prompt`

## JULES-0796 — Automation, drones, outposts, and logistics — validate catalog and relationship integrity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** high · **Size:** s · **Collision:** `world-automation`

**Objective:** Audit the data and owner relationships for automation, drones, outposts, and logistics. Add a deterministic integrity check for IDs, references, numeric domains, graph constraints, and the specific consistency risks in automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.

**Context:** automation, drones, outposts, and logistics: automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.

**Inspect:** `src/data/automation.js`, `src/ui/screens/automationPanel.js`, `src/systems/sectorSim.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map automation, drones, outposts, and logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The check catches at least one realistic malformed fixture and gives the exact offending ID/path.
- It derives truth from live catalogs/owners rather than duplicating a second inventory.
- Valid extension rows remain easy to add without editing arbitrary counts.
- No production value is silently clamped when a hard failure is safer.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0796 --format prompt`

## JULES-0797 — Automation, drones, outposts, and logistics — repair transaction and progression edges

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P3 · **Risk:** high · **Size:** m · **Collision:** `world-automation`

**Objective:** Exercise automation, drones, outposts, and logistics across exact affordability/capacity thresholds, partial success, cancellation, duplicate delivery, and owner failure. Fix one atomicity or progression defect if reproduced.

**Context:** automation, drones, outposts, and logistics: automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.

**Inspect:** `src/data/automation.js`, `src/ui/screens/automationPanel.js`, `src/systems/sectorSim.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map automation, drones, outposts, and logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- Credits, cargo, reputation, inventory, unlocks, or rewards change exactly once and through their canonical writer.
- Failure leaves state unchanged or rolls back completely.
- Boundary values immediately below/at/above the threshold are covered.
- UI feedback reports the canonical failure reason.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0797 --format prompt`

## JULES-0798 — Automation, drones, outposts, and logistics — protect persistence and revisit continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P3 · **Risk:** high · **Size:** m · **Collision:** `world-automation`

**Objective:** Save and reload automation, drones, outposts, and logistics at its most fragile in-progress and completed states. Repair duplicate generation, lost progress, stale world state, or repeated reward/content publication.

**Context:** automation, drones, outposts, and logistics: automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.

**Inspect:** `src/data/automation.js`, `src/ui/screens/automationPanel.js`, `src/systems/sectorSim.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map automation, drones, outposts, and logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- In-progress state resumes coherently and completed state cannot pay or spawn twice.
- Transient handles, listeners, and presentation state are reconstructed rather than serialized.
- Old or partial save shapes normalize through the existing migration owner.
- Revisiting the sector/station/screen produces the intended remembered world.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0798 --format prompt`

## JULES-0799 — Automation, drones, outposts, and logistics — make cause, opportunity, and result legible

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P3 · **Risk:** high · **Size:** m · **Collision:** `world-automation`

**Objective:** Improve one bounded feedback/discoverability failure in automation, drones, outposts, and logistics: the player should understand what is available, why it changed, what action succeeded/failed, and where the consequence lives.

**Context:** automation, drones, outposts, and logistics: automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.

**Inspect:** `src/data/automation.js`, `src/ui/screens/automationPanel.js`, `src/systems/sectorSim.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map automation, drones, outposts, and logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The correction is driven by canonical state and uses existing HUD/map/comms/presentation surfaces.
- It adds no competing permanent log or generic tooltip wall.
- The action’s cost, constraint, or consequence is visible before commitment when it matters.
- Keyboard/gamepad and color-independent meaning are preserved.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0799 --format prompt`

## JULES-0800 — Automation, drones, outposts, and logistics — add one bounded content extension

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P3 · **Risk:** high · **Size:** m · **Collision:** `world-automation`

**Objective:** Add one small production content slice for automation, drones, outposts, and logistics using existing schemas, verbs, systems, art vocabulary, and reward owners. It must create a distinct player decision or situation, not a recolor or prose-only duplicate.

**Context:** automation, drones, outposts, and logistics: automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.

**Inspect:** `src/data/automation.js`, `src/ui/screens/automationPanel.js`, `src/systems/sectorSim.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/GDD_2_0.md`, `docs/MODULE_MAP.md`, `src/systems/AGENTS.md`

**Work:**
1. Map automation, drones, outposts, and logistics to its canonical data catalog, simulation writer, UI/presentation reader, and persistence path.
2. Characterize the exact relationship or player loop described by automation order validation, resource transfer, offscreen cadence, failure recovery, persistence, and comprehensible production output.
3. Implement one bounded integrity repair, progression fix, feedback improvement, or content row as requested by the facet.
4. Verify IDs/transactions/persistence and reachability through existing checks or a deterministic fixture.

**Acceptance:**
- The new row/variant/activity is reachable in ordinary play or an existing deterministic scenario.
- Its role and decision differ causally from existing content and are explained in the PR.
- IDs, balance domains, persistence, and presentation pass existing integrity checks.
- No new framework, global queue, or speculative future dependency is introduced.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE rather than adding filler when the scoped extension duplicates an existing role or depends on a new framework.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0800 --format prompt`
