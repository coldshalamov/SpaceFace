# Resolved specification — hauling that rewards competent real play

Companion to [SF-106 — Make competent hauling viable through real terms](../plans/08-economy/SF-106-make-competent-hauling-viable-through-real-terms.md). Proposed design policy; no new earnings measurement is claimed here.

## Do not repeat the already-described model repair

D80 says the model's executable buy-quantity/sell-leg mismatch was repaired, leaving structural concerns. Read [careerCohorts](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/balance/careerCohorts.js), [economy](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economy.js), [economyModel](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/economy/economyModel.js), [contracts](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/economyContracts.js) and the live [Market](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/station/screens/market.js). The model is an instrument, not permission to simulate unavailable routes or bypass custody.

## Selected economic direction

A competent hauler should have a repeatable sequence of informed deliveries with meaningful route/cargo risk and an attainable next capability. Prefer repairing specific cost/supply/contract relationships to a universal profit multiplier. Trade remains constrained by real stock, executable quantities, capacity, travel, lawful access and finite opportunities.

For an actual trip, use executed quantities and paid costs:

```text
net realized credits = sale proceeds + legitimately settled job compensation
                       - cargo purchase cost - travel/service/toll costs
                       - actual loss/recovery costs
```

Measure elapsed simulation time on the actual feasible route, including loading, travel, access and replenishment wait. Do not charge a hypothetical loss in one comparison while omitting it in another. A purchase whose sale is not realized by a reporting horizon must be distinguished as unsold inventory, not silently treated as a completed profitable trip.

## Decide which lever is genuinely binding

Reproduce a representative starter-hull cycle. Inspect quote quantity, legal capacity, sell stock/demand, full trip costs, opportunity depletion and return-leg options. Compare with a legitimate contract-assisted route using the same physical load and time. Keep experimental variants isolated and change one structural lever at a time.

If tolls consume nearly every feasible margin, adjust the specific toll/waiver/service relationship under current law, not all prices. If market replenishment makes every accessible lane inert, connect replenishment to real production or an explicit existing economic process, not a reset on reopening the screen. If freight jobs are the intended income floor, ensure they are actually available, price their risk/time honestly and do not double-count the same delivered goods as both a sale and an incompatible contract settlement.

## Guardrails against an accidental money printer

Same-station immediate round trips must respect the intended spread. A canceled contract cannot retain its reward while releasing its obligation. Two offers must not settle the same reserved lot incompatibly. Reopening a screen, reloading a save or repeating a handoff cannot replenish stock or pay again. NPC/operation cargo cannot be sold as the player's personal inventory. Any rebate must be owned and settled once by the existing economic/law owner.

Do not change the healthy benchmark band merely to turn a gate green. If a product target truly changes, state that as an explicit design decision with evidence, separate from the implementation's result.

## Proof portfolio

Use the existing cohort/earnings tools for quick comparative signals after understanding their adapters. Then play the same attainable route with the actual starting hull and current Market/contract UI. Compare at least an initial viable lane, its depleted repeat, an alternative lane and an interrupted delivery. Record full costs, realized earnings, unsold inventory, waiting time and the next meaningful purchase.

The outcome should remain viable without hidden perfect-information advantages unavailable to a player. Check adjacent hunter/prospector paths for unintended economy effects, but do not rebalance all careers in the same patch. The final acceptance is an interesting sustainable hauling loop—not a chart, a relaxed target or a hard-coded bonus.
