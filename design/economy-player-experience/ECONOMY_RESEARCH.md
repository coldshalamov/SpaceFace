# SpaceFace: an economy that creates adventures

Research, production audit, implementation, and acceptance plan · 12 October 2026

**Audited base:** `coldshalamov/SpaceFace@d748312d1f28a1c954b6bbc508749191bee82457`.
**Recommendation:** keep the causal simulation and physical logistics; make financial commitments exact, information provenance explicit, and advancement a widening set of playable capabilities. Do not replace the economy with either an arbitrary shop or an exhaustive accounting simulation.

## 1. Decision and limits of the evidence

SpaceFace's economy should answer four questions without making the pilot leave the game: what can I do with what I have; what will this action actually cost; what could change while I do it; and what new action does success make possible? The economy is successful when answering those questions sends the player back into a more interesting physical situation. The wallet is a means, not the protagonist.

The best supported direction is a **causal, bounded, legible adventure economy**. Prices respond to actual stock and world conditions. Cargo changes how the ship handles. Manufacturing, salvage, contracts, and automation create different kinds of work. The interface distinguishes a current executable purchase quote from a remembered destination price and from an uncertain forecast. The player is allowed to become powerful; this is not a monetary-policy exercise whose job is to confiscate every surplus.

This is a design judgment with falsifiable tests, not a claim to have found a universal mathematical optimum. A balance function can optimize a specified output while optimizing away the fun. The research informs the objectives; the repository establishes what runs; tests establish particular properties; human play establishes whether the tradeoffs feel worthwhile. Those are different kinds of evidence.

The audit used the commit-pinned engineering packet: 15,298 source/configuration/documentation files, with heavyweight assets explicitly omitted by the repository's packet workflow. It traced the transaction owner, stock model, regional demand/freight, generated balance model, cargo, progression, crafting/automation, intelligence, active station market, adventure decisions, receipts, and existing test fixtures. It did not perform a human study or visually sign off every station screen. The full-game browser gate could not run in this environment. Section 10 records that limitation rather than substituting a mock-up for evidence.

The delivered implementation fixes verified pricing and decision-contract defects and adds coverage. The remaining design campaign is separately labeled in section 9. It is not silently counted as shipped code.

## 2. Research: what transfers, and what does not

**Player competence and autonomy.** The researcher-maintained PENS overview reports four original studies connecting need satisfaction with motivation and enjoyment. It highlights clear, consistent feedback, masterable controls, and choice of goals/strategies [S1]. This supports investigating opaque or contradictory trade feedback. It does not establish an optimal credit reward, session length, or number of currencies for SpaceFace. Do not reproduce the proprietary PENS questionnaire commercially without the required permission; the playtest questions below are original task-comprehension questions.

**A closely relevant trading postmortem.** Failbetter describes Sunless Sea's combination of many price permutations, inadequate dedicated trade UI, indefinitely repeatable routes, and stingy-then-generous progression. Its Sunless Skies redesign prioritized understandable rules, bounded opportunities, and memorable decisions [S2]. The transferable lesson is not to delete SpaceFace's supply simulation: Failbetter explicitly chose a different, non-simulation design. Borrow the legibility and finite opportunity; retain our physical causality.

**Separate editing an intention from executing it.** Factorio's developers explain that an extra confirmation in logistics prevents robots acting before the player has finished configuring a request [S3]. This is a useful boundary for a cargo purchase, not an argument for a modal confirmation on every harmless click. The present change adds review-only route loading while retaining the existing explicit Buy action.

**Context is part of a control's meaning.** Factorio's character-interface design discussion documents how inventory transfer behavior and logistics organization depend on context [S4]. In SpaceFace, a selection, a course change, and a purchase must not be conflated. A button's wording should describe the state change it performs. A fast combined haul action may remain, but only with disclosed terms and success-gated navigation.

**Simulated balance is an instrument, not a verdict on enjoyment.** GEEvo describes graph-based economy generation and evolutionary balancing against specified objectives, using repeated simulations [S5; abstract reviewed]. That is evidence for systematic objective-based exploration, not evidence that its objective is ours. Credit velocity, sink ratios, and numerical stability must be measured alongside comprehension, physical play, recovery, and capability variety.

**Accessible controls are economic safety.** W3C's WCAG 2.2 documentation specifies a 24-by-24 CSS-pixel minimum pointer target with exceptions and spacing alternatives; the enhanced target criterion uses 44-by-44 with its own exceptions [S6, S7]. The project target proposed here is the larger size for high-consequence touch actions. No accessibility-conformance claim is made for the current unrendered fixture.

## 3. How the global economy actually works

### 3.1 Authorities and state

`src/systems/economy.js` owns settlement of credits and station stock. `src/systems/cargo.js` owns cargo changes. UI controllers should quote, describe, and send intent; they should not become another wallet or inventory writer. The patch follows that boundary. A correct-looking second calculator is dangerous precisely because it can drift from the first.

The generated balance lane includes `src/economy/economyModel.js`, `src/data/economyDerived.js`, and `scripts/generate-economy.mjs`. Mission economics, resource-work publishers, ships, services, and automation consume these or associated authored tables. There are also authored mission and starter exceptions. A balance-table target is not proof that every live player route realizes it.

`src/economy/regionalSupply.js`, `demandModel.js`, `freightCausality.js`, and `stationConditions.js` connect local books to regional specialization, shortages, freight, and remembered world events. `src/systems/economyCycles.js` adds time-varying structure. Production/import/export behavior, ambient economic events, and recovery toward authored targets mean this is a bounded world simulation, not a globally closed general-equilibrium model. That abstraction is appropriate unless it breaks a player's observable causal explanation.

### 3.2 Prices, depth, and geographic identity

The stock curve has the form

`p_stock(s) = basePrice * clamp((s / baseEq)^(-elasticity), 0.4, 2.6)`.

Persistent demand and cycles modify the midpoint, with a final live band of 0.35–2.8 times base price. The station's target stock and its pricing reference are intentionally distinct. Collapsing both into one equilibrium would erase some location-specific opportunities as stock returns to target. Preserve that distinction.

The station quotes an ask for buying from it and a bid for selling to it. Frontier/event effects can widen the spread. The common spread is 8%, with bounded variation. A batch consumes a range of the stock curve: ten units are not necessarily ten times the displayed one-unit price. `averageLivePrice` integrates across clamp boundaries and handles the logarithmic elasticity limit. Settlement rounds purchases upward and sales downward to whole credits. The existing integral and conservative rounding are strengths; they should not be replaced with a GUI approximation.

For a batch of size `q`, source stock `s`, spread `a`, and standing multiplier `r_buy`, its current purchase cost is approximately expressed as

`C(q) = ceil(r_buy * (1 + a/2) * integral[p(x), x=s-q..s])`.

The actual function also applies the established access, stock, and hold rules. The quote is the authority, not this explanatory equation.

Buying depletes stock and raises marginal cost; selling replenishes stock and lowers marginal proceeds. Recovery, consumption, supply and cycle evolution create renewed opportunities over simulation time. This prevents infinite instant exploitation of a single price difference while preserving repeated trade as a legitimate career. Slow economic ticking is also cheaper than simulating every economic actor every rendered frame.

### 3.3 Sources, transfers, and sinks

The player can obtain resources or credits through extraction, salvage, mission work, combat-related rewards, trading, and automation. Purchases, refitting, services, fabrication inputs, law consequences, and automation costs consume or transfer resources. Physical cargo and manufactured goods are not interchangeable with currency: they have space, mass, location, processing, legal, and opportunity costs.

Separate three accounting questions. Does a transaction conserve the goods it claims to transfer? Does an economic source have an authorized cause? Does a career's total reward over a real session produce enjoyable progression? Passing one does not answer the others. In particular, a growing single-player money supply is not itself a defect. An unlimited no-work credit loop is a defect because it dominates the intended choices.

Freight manifests and terminal receipts give a useful basis for causal identity and deduplication. Keep scarce-goods delivery finite; an accepted logistics contract must not manufacture unlimited inventory or rewards on replay. A visible convoy should eventually agree with its manifest, even when off-screen simulation is aggregated rather than physically rendered ship by ship.

### 3.4 Cargo, production, and automation

Volume is the capacity constraint; mass is a flight-performance tradeoff. That is unusually valuable for this game's identity. A full light hold and a full heavy hold should not be the same voyage. Keep the mass warning tied to the same operational-mass law the flight kernel uses, rather than attaching an invented risk score to the route card.

Refining, fabrication, and asteroid work can turn the same material into an immediate sale, a fitted capability, or a productive installation. Those mutually exclusive uses create opportunity cost without adding more currencies. Keep production location and bottlenecks tangible. Automation should graduate the player from repetitive hauling to choosing and maintaining a logistics policy, not simply multiply a wallet while everything else becomes decorative.

Current automation has operating costs, offline crediting, unpaid upkeep, distress, and possible repossession. This is a deliberate pressure mechanism already present, not added by this patch. Its alignment with a physics-first game is questionable, especially where idling or being away creates losses without an interesting decision. The patch makes the receipt truthful but does not silently rebalance all online/offline costs. Section 9 specifies the policy change and its acceptance gates.

## 4. Player journey: strengths, weaknesses, and the intended experience

### Discover work and choose a goal

The existing combination of station services, mission boards, market intelligence, and world events gives the player multiple reasons to leave a berth. Its weakness is the possibility of many individually correct panels without a clear immediate action. The opening should offer a small set of genuinely different opportunities: collect/sell something nearby, carry a finite shipment, or perform a physical service/combat task. The first meaningful choice should not require understanding the entire commodity catalogue.

An earned capability is a better progression landmark than an arbitrary balance threshold. Show the actual fitting that current credits can purchase, its compatibility, and the maneuver or activity it changes. Do not pitch already-owned or unavailable modules. Existing first-fit/onboarding work belongs to its own lane and is not overwritten here.

### Inspect a commodity

The production market has a searchable register, commodity families, history, causal driver summaries, hold information, and an inspector. These are valuable foundations. Before this patch, the visible one-unit buy/sell values could come from cached general-market prices while the actual counterparty applied reputation and settlement rules elsewhere. Calling both figures what the player pays is misleading.

The active controller now reads its one-unit values from the same economy quote owner. The hero identifies its one-unit meaning; the bulk console remains the accepted batch's own quote. Unavailable prices display as unknown, not as zero-credit goods. The bid/ask difference is named **Local spread**, not confused with the player's profit.

Keep the world-history midpoint distinct from a personalized executable quote. Do not redraw the historical trace as though a reputation change rewrote past market prices. Retain demand explanations near the decision and secondary detail behind disclosure controls.

### Decide whether to carry a load

The old route path calculated affordable units and total cost from a spot price while checkout integrated depth. That allowed a recommended load to exceed the wallet that supposedly made it affordable. It also allowed a full load to look best even after its final units destroyed the expected margin.

The new pure planner searches canonical source quotes for an affordable whole-unit batch, respects local available stock and hold volume, and stops expanding the batch where marginal purchase cost overtakes the remembered destination bid when the curve supports that calculation. The displayed source total is executable now. Destination proceeds remain explicitly estimated; they do not include future price changes, destination depth, flight costs, or a made-up certainty premium.

Route intelligence now offers **Review load**. It selects the commodity and quantity without spending money or changing navigation. **Set course** remains a navigation action; its footnote explicitly says it does not buy cargo. The existing faster haul decision remains available with a reviewed batch total, current-berth check, accepted-quantity check, and success-gated navigation.

Current ranking still prefers estimated credit margin rather than offering a full Pareto choice among fastest, safest, lightest, and highest-return routes. That is a remaining design task, not an implemented risk optimizer. Never label a route globally optimal simply because it has the highest last-known bid.

### Choose quantity and commit

The existing quantity entry, dial, more/fewer controls, Max action, accepted-quantity preview, and stale-quote protection should remain. Max now rejects partial or capacity-limited quote responses as evidence that a larger requested batch is affordable. Malformed and throwing quote callbacks fail closed.

The receipt preview adds **Credits after** and labels a sale's cash inflow **Sale proceeds**. A sale is not necessarily profit: the player may have paid for its goods, processed them, lost some in flight, or collected them without a recorded cash basis. Do not decorate all sale proceeds as earned investment profit.

The haul shortcut now carries the displayed maximum total into settlement. A price increase, changed hold/stock, insufficient wallet, or another berth cannot quietly purchase different terms and redirect the ship. Those refusals explain what changed and state that nothing was bought or plotted. The ordinary countertrade path keeps its existing quantity/receipt contract.

### Learn prices and plan a journey

Exploration, scans, and uplinks can give information economic value. But that only works if provenance is honest. Previously, merging information at station level could let one commodity's freshness make another look current, or allow older scan data to supersede newer remembered data. A compatibility fallback could expose remote live books when old saves lacked memory.

The merge now occurs per commodity and observation time. Recognized dock memory, survey, scan, and uplink records retain their source. Future-dated or unrecognized observations are rejected. Missing memory means unknown, not hidden omniscience. The local planner never queries a remote live book to improve a displayed opportunity. Existing saves retain their earned observations; no schema migration is introduced.

There is still a product choice about the useful horizon of intelligence: too little persistence makes the player repeat busywork; too much live information removes scouting. Keep observations useful, offer paid/earned refresh deliberately, and visibly age estimates. Do not invent precise confidence percentages unless prediction error has actually been calibrated.

### Fly, deliver, and settle

The voyage should realize the cargo decision through handling, route hazards, fuel or service constraints that actually exist, and alternative destinations. A market screen should not promise net voyage profit when it only knows gross resale less acquisition. Destination stock impact is also real, even if no one attacks the ship.

A good delivery has a short receipt that explains accepted quantity, cash movement, rejected/sealed remainder if any, and a world consequence where one occurred. Contract cargo, stolen freight, contaminated goods, and ordinary owned stock must not share a misleading “sell all” affordance. Existing cargo/custody authorities remain in charge; the patch does not relabel legally reserved freight as free stock.

### Spend gains and recover from failure

A fitting should reveal buy price, install/replace consequences, fit compatibility, and the capability it changes before committing. Research gates should open mechanisms rather than merely scaling rewards. The ship/hull vocabulary and modal progression systems deserve their own naming pass, but changing those systems here would collide with active work and require a broader progression proof.

Recovery matters more than forcing the player to maintain an emergency-fund spreadsheet. A player with no spendable credits should still have an available route back into meaningful play that does not require buying the input they lack. Test post-death, impounded-cargo, depleted-market, and full-hold states. Do not solve recovery by silently giving every player an invisible bailout or by making failure economically meaningless.

### Automate and return after an absence

A logistics installation should explain what limits it now: supply, transport throughput, receiving capacity, operating cost, or policy. A single passive-income number can conceal a broken chain. The next policy design should allow explicit parking/pause, preserve a working-capital reserve, and disclose the maximum liability before a commitment.

The present receipt fix distinguishes credited revenue, upkeep actually charged, unpaid upkeep not yet charged, and net wallet movement. A 1,200-credit payout with 1,500 credits charged is a 300-credit loss, not a 1,200-credit success. Negative movement or unpaid liability produces a warning instead of a success celebration. Receipt deduplication includes the unpaid component.

## 5. Reproduced defects and measured improvements

The portable probe is `tools/economy-player-trust/probe.mjs`; before/after JSON accompanies the delivery. Seed 4242, simulation time 600, Helios market, coalition destination observations, and a 250-volume hold are explicit fixture conditions, not a claim about every player's opening state.

| Case | Before | After |
|---|---|---|
| 1,000-credit food load | 16 units advertised at 992; real quote 1,005 | 15 units advertised and quoted at 942; 58 credits remain |
| 10 refined-metals units | Displayed 940; real quote 937 | Displayed and quoted 937 |
| 13 consumer-goods units | Displayed 949; real quote 952 | Displayed and quoted 952 |
| Neutral one-unit iron round trip | Buy 33, sell 29; −4 | Unchanged: −4 |
| Reputation 500 iron round trip | Buy 28, sell 32; +4 without time or stock change | Buy 32, sell 30; −2 |
| Reputation 1,000 iron round trip | Buy 23, sell 35; +12 without time or stock change | Buy 32, sell 30; −2 |

The reputation defect is not an intended trader skill reward. Buying and immediately selling the same unit at the same counter restores stock and cargo while minting credits. With no world change, it dominates any risky flight. The cure preserves rank benefits by improving the merchant's spread rather than discounting the underlying good on purchase and marking it up again on sale.

For favorable standing, the implementation progressively grants up to 80% of each half-spread, retaining 20% for the counterparty. Neutral behavior is unchanged; hostile penalties and adverse station conditions keep their existing magnitude. Shipyard/service discounts are not changed. The 80% value is a conservative initial design parameter, not a scientifically determined optimum; the important invariant is that bid and ask never cross. At a frozen book/time, matching buy and sell integrals plus conservative rounding then rule out this same-counter loop.

A warm Node benchmark on this host measured 200 route computations at 52 canonical quote calls per plan: median about 0.12 ms, 95th percentile about 0.53 ms, maximum about 1.36 ms. This is useful evidence against an accidentally linear per-unit scan. It is not an iPhone frame-time, renderer, or cold-start claim.

## 6. Artistic license versus accidental weakness

**Keep bounded prices and aggregate off-screen recovery.** These are intentional abstractions that prevent a single accidental shortage from permanently killing the playground and keep simulation costs bounded. Surface their effects honestly; do not pretend every recovered unit travelled on a rendered ship.

**Keep geographical specialization and local impact.** They make knowing the world and moving through it valuable. A uniform global shop would flatten both trade and exploration. Conversely, making all local markets maximally efficient would remove many of the player's useful niches.

**Keep profitable asymmetries with a cause.** A dangerous frontier destination, a damaged refinery, a constrained receiving depot, or specialized cargo equipment can justify good returns. A crossed same-station bid/ask or replayable receipt cannot. Generosity is not the enemy; dominant no-play strategies are.

**Keep mass as a physical tradeoff, not a second arbitrary capacity cap.** It links economic choice to the central flying toy. Give the player the forecast and let them choose a cumbersome load. Do not prohibit everything that is inefficient.

**Reject mandatory administrative friction.** More bills, more currencies, daily collection requirements, forced repair chores, and wealth-indexed prices do not automatically create depth. Add a cost only if it changes a meaningful decision. Optional industrial complexity should live behind the player's decision to build an industry.

**Reject omniscient certainty.** Exact current terms are fair; unknowable future returns should stay unknowable. Make room for weather, traffic, intervention, new stock and player skill without blaming those for a current arithmetic discrepancy.

**Let wealth buy freedom.** Expensive sidegrades, new mission verbs, production capacity, and territorial projects are better long-term uses than taxes designed solely to keep a number small. Luxury endgame goals are acceptable; mandatory treadmill costs are not necessary simply because a wallet grows.

## 7. Implementation inventory

| Production file | Implemented change |
|---|---|
| `src/economy/economyMath.js` | Spread-bounded commodity reputation multiplier; neutral/adverse terms preserved |
| `src/systems/economy.js` | Canonical multiplier applied to settlement quotes; `priceOf` shares one-unit quote authority |
| `src/economy/tradePlanning.js` | New pure full-quantity validation, logarithmic affordability search, convex-depth load planning |
| `src/ui/market/tradeLogic.js` | Per-good provenance/freshness merge; no invisible remote fallback; quote-backed routes; clear estimated-margin labels |
| `src/ui/station/screens/market.js` | Live counter prices, safe Max, review-only load selection, cash-after preview, exact route integration and explanatory haul refusals |
| `src/ui/adventureDecisions.js` | Actual batch terms replace linear re-estimation; stale/changed load guarded; purchase success precedes navigation |
| `src/ui/views/marketPresentation.js` | Unknown quotes stay unknown; hero identifies one-unit quote; Local spread wording |
| `src/ui/automationPayoff.js` | Actual net wallet movement and unpaid upkeep disclosed; negative outcomes warn |

New tests and tools are outside the runtime. No save-version bump, new currency, new database, new asset format, recurring charge, timer, or renderer dependency is introduced. The existing no-owner route helper remains a explicitly labeled spot estimate for read-only legacy projections; the active station and haul paths both pass the quote owner. The planner's optional reserve parameter is an API capability, **not** a new player-facing reserve control.

## 8. What the existing tests do not establish

The repository already has substantial economy tests. Their existence did not prevent the two principal defects because the relevant composition—reputation with same-counter settlement, and route advice with executable batch prices—was not pinned by those tests.

A particularly important pacing caution is `test/economy-heavy-freight-tradeoff.test.mjs`. Its profitable heavy run sells in 25-unit tranches with 30 economy minutes of relaxation between tranches. That is a useful handling/stock test. It is not proof of the profit available from a single immediate arrival dump, nor proof of credits earned per hour of ordinary play. Do not use its headline full-hold profit as a player promise.

Similarly, a generated target-income curve, a script that counts presented decisions, or a repeated idempotency test cannot prove that those decisions are interesting. The report preserves quantitative checks but calls for actual routes and independent human observations before changing the whole reward ladder.

## 9. Remaining campaign: precise changes and gates

These are recommendations **not implemented by this patch**. They are ordered after the proven trust fixes so a broader economy redesign does not bury them.

### E1 — First-hour economic comprehension

Wire the already-authored first-fit and starter-work lanes into a single observed earn → sell → afford → fit → feel route. Show at most a few actionable options, with the actual offered module and compatibility, rather than a universal “you should trade” hint. Proposed initial playtest targets are first understood sale within 3–8 minutes and first distinct fitted capability within 5–15 minutes, subject to the tutorial route and player pace; these are hypotheses, not research-derived laws. Pass when novices can explain what changed in their ship and recover without following an external wiki. Test no-cargo, already-owned-module, insufficient-credits, and hints-disabled cases.

### E2 — A route choice set, not one fictitious best route

Offer a small nondominated set: highest estimated margin, shorter known route, and lighter load where they are genuinely different. Include actual distance/route information, legal access, mass consequence, and known hazards. Unknowns must stay unknown. Destination depth estimates may use observed depth snapshots, not a secretly queried live book. Pass when each recommendation quotes executable local acquisition terms and every displayed risk/distance has a traceable source. Do not invent a composite score with uncalibrated “risk percent.”

### E3 — True cost-basis and disposition continuity

Current purchase-lot accounting has a fallback for goods without a recorded acquisition cost; it should not be presented as fully realized profit. Add basis provenance (`purchased`, `produced`, `collected`, `unknown`) and proportionally consume it on sale, crafting, jettison, loss, and transfers through the existing cargo owner. Keep historical basis accounting distinct from decision-relevant replacement value. Pass with mixed-origin lots, partial sales, processing, loss, save/load and reverse transfers. Do not award counterfeit gains by assigning free resources an invented cash purchase price.

### E4 — Solvent, opt-in automation

Add explicit operating/parked policies, a working-capital reserve, and receiving/supply bottleneck explanations. Ordinary parked assets should not repossess themselves while the player is away. Bound automated liability to a disclosed budget or pause before insolvency; keep actual operated work and hazards meaningful. Implement online and offline through the same policy owner, migrate legacy orders deliberately, and never let pause/resume or save/load restart a profitable accounting interval. Pass full-storage, zero-demand, missing-source, four-hour absence, depleted reserve, and repeated resume cases. This is a gameplay-policy revision, not merely a receipt change.

### E5 — Comparable career advancement without homogenizing careers

Measure complete extraction, salvage, haul, bounty/service, fabrication, and automation-assisted sessions at several capability tiers. Compare net wallet movement, inventory/capital changes, loss distribution, travel and menu time, and distinct choices. Keep different variance and skill profiles: mining need not feel like bounty hunting with another icon. Fix a consistently dominated career through meaningful work, inputs, throughput or access before multiplying all payouts. No blanket income retune is justified by the present route-only benchmark.

### E6 — Causal opportunities and depletion

Bound crisis-driven demand, contract intake and follow-up rewards by a particular need/receipt. A delivery can stabilize an event, reduce local shortage, or enable a visible capability. Explain why an opportunity appears and why it ends. Pass duplicate completion, player/NPC simultaneous delivery, destroyed freight, revisited sector and save/load cases. Aggregate distant simulation is acceptable; double-counted goods are not.

### E7 — Recovery without compulsory poverty management

Guarantee at least one reachable, legal, capital-light way to recover from a bad trade or normal failure. The recovery should be an activity, not compulsory waiting. Derive it from available resources/services and test the disconnected or depleted edge cases. Before adding fuel reserve defaults or recovery grants, measure whether existing salvage, rescue and starter services already satisfy the requirement. Keep extreme voluntarily chosen losses consequential without accidentally trapping an ordinary player.

### E8 — The UI acceptance pass

Run the actual station shell on desktop, narrow landscape, touch portrait, keyboard-only and controller paths. Review register → inspector → quantity → confirmation → receipt → navigation, and test switching tabs and returning with a selected lot. Preserve the center of the flight view and collapse secondary economy detail. High-consequence touch controls should target 44 CSS pixels where practical. Check focus preservation, spoken status, non-colour error feedback, zoom, long names, high credit counts, and no purchase on review. An HTML fixture is provided; it is not a substitute for flight-to-berth acceptance.

### E9 — Telemetry that can falsify the design

Record action/quote/settlement identities, displayed and settled totals, refusal reasons, accepted units, observed intel age, time in economy screens, actual route completion, and capability purchases. Avoid personal data and avoid treating session length or compulsion as quality. Existing event buses/telemetry should carry these facts rather than adding another source of truth. A discrepancy should be reducible to a deterministic trace. Calibrate forecast bands from held-out prediction errors before calling them confidence intervals.

## 10. Validation and release judgment

**Completed:** 13 new focused tests, including a multi-seed/reputation/commodity/lot sweep; 60 exhaustive convex-planner comparison cases; false freshness, missing/future intel, no hidden remote reads; settlement equality; Max fail-closed behavior; offline loss/debt text; stale haul refusal; successful haul and duplicate safety; unknown-price display.

**Targeted regression command:** `node tools/economy-player-trust/verify.mjs` — 237 tests passed, none failed. This explicitly excludes five files whose baseline problems are recorded rather than rewriting unrelated assertions or inventing dependencies.

**Wider command:** `node tools/economy-player-trust/verify.mjs --wide` — 248 tests, 243 passed, five failures. All five also occur with the seven modified existing source files restored to the untouched pinned baseline. Four involve missing dependencies (`three/.../fflate.module.js` or `@elemaudio/core`); one expects design mass 32 where the existing ship data yields 35. The raw results and baseline comparison accompany the delivery.

**Full player-truth gate:** attempted with `SPACEFACE_PLAYER_STORE_DIR=''`; blocked by missing `sharp`. Browser navigation with installed Chromium was also blocked by the environment's administrative policy, including the local fixture. No screenshots, full-game playthrough, iPhone performance, or accessibility certification are claimed. The market module imports under Node, syntax checks pass, and the unexecuted browser fixture imports the real market/controller/simulation rather than a replacement UI.

**Release judgment:** the arithmetic/authority fixes have strong targeted evidence; the visual changes require the stated headed acceptance pass on a normal development host before declaring the entire economy release-ready. Preserve the new invariant tests when merging overlapping economy/worker PRs. Do not copy an old whole `economy.js` over newer concurrent work: use the patch or merge commit and rerun the tests.

## Sources

All external sources were checked on 12 October 2026. Source descriptions identify the strength of evidence; developer accounts are not controlled comparative trials.

- **S1 — Researcher-maintained overview:** Center for Self-Determination Theory, Player Experience of Needs Satisfaction. https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/
- **S2 — First-party design postmortem/proposal:** Failbetter Games, *Trade in the Skies: ROCHE LIMIT*, 22 November 2017. https://www.failbettergames.com/news/trade-in-the-skies-roche-limit
- **S3 — First-party implementation account:** Factorio, *Friday Facts #338 — The (real) Character GUI*, 13 March 2020. https://updater.factorio.com/blog/post/fff-338
- **S4 — First-party interface design account:** Factorio, *Friday Facts #289 — Character GUI*. https://www.factorio.com/blog/post/fff-289
- **S5 — Research abstract, not a claimed full-paper review:** Florian Rupp and Kai Eckert, *GEEvo: Game Economy Generation and Balancing with Evolutionary Algorithms*, 2024, IEEE CEC. https://arxiv.org/abs/2404.18574
- **S6 — Standards-author documentation:** W3C, Understanding WCAG 2.2 SC 2.5.8, Target Size (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- **S7 — Standards-author documentation:** W3C, Understanding WCAG 2.2 SC 2.5.5, Target Size (Enhanced). https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced

Repository references throughout name the live implementation at the pinned base, with changes expressly identified. Active overlapping PRs were inspected for coordination; their claimed playtest results are not counted as this patch's results.
