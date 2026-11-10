# SF-CLOUD-13 adapter — integrated production fixes

The quote clamp and illicit-bay custody repair are now in the production economy and cargo owners.
Ordinary docks retain illicit salvage; canonical inspections apply scanner evasion, confiscation,
fines, debt and faction consequences. Black markets may sell it. The regressions call the real
owners without installing `patchModel.mjs`. `FIX.patch` is a historical proposal, not an import.

Historical proposal follows.

The red team runs entirely under `tools/economic-redteam/`. It does not edit
`src/systems/economy.js` or `src/systems/cargo.js`.

`src/systems/economy.js` is in open PR 260 (`devin/s1-sim-worker-spike`,
"perf(s1): merge master into sim-worker spike"). The wash clamp stays in
`FIX.patch` until that path is free. Do not land it on top of PR 260.

`src/systems/cargo.js` was re-checked against open PRs 257–269 on 2026-10-11.
None of those pulls change it. The cargo hunk in `FIX.patch` is the exact
landing diff against `origin/master`, checked with `git apply --check` on a
temporary copy of that file. It is not applied to the working tree.

`git apply --check` of the whole patch against a temp repo holding
`origin/master` copies of both files succeeds. The economy hunk waits on PR 260.
The cargo hunk can land on its own.

## Standing and kill loot — tested, not confirmed by injection

`zero_spread_trade_cycles` raises standing by completing live Helios faction
missions through the missions writer. It does not emit `faction:repDelta` and
does not call that injection a confirmed exploit. `contraband_relabel` kills a
hostile through combat and reads the kill-reward recipe. It does not choose a
`kill_burst` commodity. Either family is `exploit` only when that real path
prints the loop, and `tested-not-broken` when it does not. `quote()` and
`cashInSalvage` are not rewritten here.

## Historical note — the old 200 wash figure

**Family:** `zero_spread_trade_cycles`

The `200` recorded here is an old note about standing multipliers. Shipping
`quote()` does not use it. There is no reputation gate at 200. After `spreadOf`,
`quote()` clamps `sellMultiplier` so a benefit keeps the same-port book from
inverting over an unchanged stock interval (`src/systems/economy.js`, the
`bidFactor` clamp). The shipped Allied tier is the `Allied` entry in
`src/systems/factions.js` (`min: 400`). On the allied wash seed (1846) a
10-unit Helios iron quote (`station_helios`, `cmdty_ore_iron`) stays negative
at rep 0 (buy 360 / sell 298), at that Allied tier (buy 356 / sell 302), and
at rep 1000 (buy 349 / sell 308).

Standing multipliers in `priceModForState` (`src/systems/factions.js`) still
discount buys and raise sells. The rounds below are the pre-clamp reproduction.
Shipping `quote()` settles the clamped book instead.

Reproduced, before the clamp, by `ui:buy` / `ui:sell` at Helios (`station_helios`, iron):

- Rep 0, funded only by `ui:service loan`: a 5-unit round trip lost 13 cr.
  Stock returned to 32.76.
- The player path into the prices was `faction:repDelta` of +15, the same delta
  `mission:completed` applies. Twelve of those grants reached rep 180. The
  smallest closed iron round trip there was 5 units for +1 cr. Before: 8154 cr,
  stock 32.76. The credit rows were `trade:buy:cmdty_ore_iron` −165 and
  `trade:sell:cmdty_ore_iron` +166. After: 8155 cr, stock 32.76, cargo unchanged.
- Continuing the same grants to rep 410, 25 units printed +113 cr with stock
  still unchanged.

That round was a closed same-berth book, not a two-stop haul. No travel, no
fine, no mission reward on the wash itself. The clamp above is what shipping
`quote()` settles now.

**Shipping clamp:** `quote()` applies the guard first written into `FIX.patch`.
After `spreadOf`, `sellMultiplier` is `min(standing.sell, standing.buy * (1 + spread/2) / (1 - spread/2))`
when `1 - spread/2 > 0`. `execute()` prices through `quote()`, so the panel and
the settlement see the guard. The purchase discount stays. Neutral standing is
unchanged because both multipliers are 1. The historical 200 figure is only
this note.

## Exploit 2 — kill-loot contraband cashes in as clean scrap

**Family:** `contraband_relabel`

Enemy loot tables drop `cmdty_stolen_goods` (`reaver_pirate` and others in
`src/data/enemies.js`). A player kill emits `loot:drop` with `source: 'kill_burst'`.
`mining._onLootDrop` marks that pickup `combatLoot`. With the production
`salvageBay` flag, `cargo` files it in the bay instead of the hold. The next
`dock:docked` runs `_cashInSalvage`, which grants `floor(qty * basePrice * 0.6)`
through `economy:grantCredits` and never asks `runScan`.

The shortest trace that still pays is one stolen-goods unit, one sim tick,
then a Helios dock: **+193 cr**, reason `salvage:bay_sale`. Command list:
`tools/economic-redteam/artifacts/contraband-minimized.json`. The same goods
collected into the trade hold and docked at Customs Gate are confiscated and
fined (negative control). A second dock of an empty bay pays nothing. Legal
kill-loot ore still cashes at the scrap rate (allowed source).

**Fix (not applied):** `FIX.patch` hunk for `src/systems/cargo.js`
`_cashInSalvage`.

- Legal lots still scrap through `economy:grantCredits` / `salvage:bay_sale`.
- Illicit lots at a non-blackmarket berth are removed and fined through
  `economy:chargeCredits` (`fine:contraband`) plus `faction:repDelta` and
  `contraband:scanned`, matching `runScan`'s `FINE_MULT`.
- At a `blackmarket` berth the illicit lots move into the hold with `addCargo`
  so a fence can buy them. They are not scrapped into clean credits. Overflow
  that does not fit stays in the bay and is not paid.

No new credit writer. Both moves use the existing economy events.

## Latent, not player-reachable

`ships.sellShip` refunds `floor(buyback * 0.5)`. The Helios Hitch offer price is
0 and `buyback` is 8000, so a second Hitch would refund 4000. `ui:sellShip` has
no listener (`shipworks.js` only mentions it in a comment), and the family probe
records that event as `unwired_ui_sellShip`. Do not treat the method diagnostic
as a shipped loop.

## Families tested, not broken

Stock floor after a max buy, parked-hold unit sums, sealed delivery versus
resale, abandon payout, empty offline catch-up, sealed refinery inputs, freight
receipt replay, save/load credits, malformed quantities, and hull-swap custody.
Mission rewards and legal scrap stay classified as allowed sources.

## After the patch lands

```
node --test tools/economic-redteam/test.mjs
```

The wash family must go `clean` (allied round trip `creditsDelta <= 0`) and the
contraband family must go `clean` (Helios dock of stolen-goods kill loot does
not increase credits). Update those two assertions when the patch is applied;
until then they lock the current reproductions.
