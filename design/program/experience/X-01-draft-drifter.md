# X-01 draft — Drifter: the raid pays like a shift

Persona: The Drifter. Row §1P 559. Audit: `X-01-audit.md`.

## Ground

A hauler's first fight is overtime, not glory. You want the chit cashed at the berth you can reach.
Today the raid drops `cmdty_stolen_goods`, which Helios won't buy. The loop dies at the counter, so
the fight reads as a detour.

## What the player gets

1. Raiders shed **lawful plate**: scrap metal and salvage electronics, not someone's stolen lot. The
   "+N Scrap Metal" float is the existing one.
2. Hazard pay lands as now (`d.grant(250,'convoy:guard')`). The MTS line gets a working tail:
   *"All raiders down. Hazard pay's sent. Their plate's yours — Helios buys scrap."*
3. First raid-scrap sale at Helios, one hint: *"Raid scrap sold. Fight paid twice."*
4. The spilled fuel cells stay MTS manifest pods, and taking them is still custody theft. Honest
   plate on one side, someone else's cells on the other: the choice the audit says is missing.

Pay: scrap 10 cr/u, electronics 36 cr/u (`commodities.js:110-111`). A full defend comes to 250 hazard
+ 3×340 bounty + ~80–200 cr of plate. That's a shift's wage, not a jackpot.

## Lands in

- `344-opening-hauler-raid.js` `runtime.fire`: after `spawnShips`, stamp each `raider` role's
  `data.loot` in the `enemies.js` shape:
  `{creditsRange:[100,400], drops:[{id:'cmdty_scrap_metal',chance:1,qtyRange:[3,6]},
  {id:'cmdty_salvage_electronics',chance:0.3,qtyRange:[1,2]}]}`. It's the same per-entity `loot` field
  the carrier adoption already saves (`:72,112`). The archetype stays untouched.
- Same file: the `defended` comms text.
- `onboarding.js`: one `economy:tradeCompleted` branch (scrap sold after 344 resolved) →
  `_showHint('raidScrapSold', …)`.
- Re-run: `first-session-places`, `first-hour-choice-contracts`, `rc-458-first-half-hour`.

## Working life

The fight ends at a counter with a weigh slip, like every other job.
