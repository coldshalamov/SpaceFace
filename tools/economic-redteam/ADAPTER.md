# SF-CLOUD-13 adapter — withheld production fixes

The red team runs entirely under `tools/economic-redteam/`. It does not edit
`src/systems/economy.js` or `src/systems/cargo.js`. Those files are shared
single-writers (credits, cargo). The reproductions below are player-reachable
command traces against the current runtime. `FIX.patch` is the exact change to
land later; it is not applied.

## Exploit 1 — allied standing washes the same berth

**Family:** `zero_spread_trade_cycles`

Standing multipliers in `priceModForState` (`src/systems/factions.js`) discount
buys and raise sells. The book spread is not wide enough to absorb that once
`faction_scn` rep is about 200 or higher. At unchanged stock the sell integral
and the buy integral cover the same interval, so the multipliers are the whole
margin. Buy uses `ceil` and sell uses `floor`, which is not enough to close it.

Reproduced by `ui:buy` / `ui:sell` at Helios (`station_helios`, iron):

- Rep 0: a 25-unit round trip loses credits. Stock and cargo return to start.
- Iron trading alone, 350 round trips, raises rep through
  `economy:tradeCompleted` and then stalls short of the inversion. That climb
  is not the exploit.
- The player path into the prices is `faction:repDelta` of `+15`, the same
  delta `mission:completed` applies. Twelve of those grants reach rep 180.
  The smallest closed iron round trip there is 5 units for +1 cr. Stock delta
  is 0. Continuing the same grants to rep 410, 25 units print +113 cr with
  stock still unchanged.

This is a closed feedback loop, not a two-stop haul. No travel, no fine, no
mission reward on the wash itself. The standing that opens it is earned.

**Fix (not applied):** `FIX.patch` hunk for `src/systems/economy.js` `quote()`.
After `spreadOf`, clamp the sell multiplier so

```
sellMult * (1 - spread/2) <= buyMult * (1 + spread/2)
```

`execute()` prices through `quote()`, so both the panel and the settlement see
the guard. The purchase discount is left in place. Neutral standing is unchanged
because sell and buy multipliers are both 1.

## Exploit 2 — kill-loot contraband cashes in as clean scrap

**Family:** `contraband_relabel`

Enemy loot tables drop `cmdty_stolen_goods` (`reaver_pirate` and others in
`src/data/enemies.js`). A player kill emits `loot:drop` with `source: 'kill_burst'`.
`mining._onLootDrop` marks that pickup `combatLoot`. With the production
`salvageBay` flag, `cargo` files it in the bay instead of the hold. The next
`dock:docked` runs `_cashInSalvage`, which grants `floor(qty * basePrice * 0.6)`
through `economy:grantCredits` and never asks `runScan`.

The same two units in the trade hold, docked at Customs Gate, are confiscated
and fined (negative control). A second dock of an empty bay pays nothing.
Legal kill-loot ore still cashes at the scrap rate (allowed source).

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
