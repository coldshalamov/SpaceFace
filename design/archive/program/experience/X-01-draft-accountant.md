# X-01 draft — The Accountant

## Audit correction

"Salvage is contraband" holds only on `legacy47a`. In production, `lootShards` is on
(`runtimeProfiles.js:36`). A hostile kill by the player then sets `shardsOwnKillBurst`
(`combat.js:1098`), which skips the `d.loot` roll that holds `cmdty_stolen_goods`.

The burst comes from `rollKillRewardItems` (`killRewards.js:347`): scrap, salvage electronics
and alloys, all legal (`commodities.js:77,110,111`), plus chips. Every legal commodity trades at
every station (`economy.js:2336`). So kill→salvage→sell probably already closes at Helios.
**Prove it before writing content.**

## Proposal

No new system and no save field.

1. **Test first.** Add `test/x01-raid-salvage-sells-at-helios.test.mjs` (production profile,
   seed 4242).
   - The player kills one 344 `reaver_pirate`, collects the burst, and quotes `sell` at
     `station_helios`. Assert `ok`.
   - One sale emits `economy:tradeCompleted`, which B4 already reads (`onboarding.js:584`).
   - If a quote comes back `untraded`, fix that commodity's market tier. Do not add a fence.
2. **One line.** Extend the `defended` text in `344-opening-hauler-raid.js:337-341` to: *"…Hazard
   pay transferred. Their scrap's yours — Helios buys salvage by the ton."* Credits still come only
   from `d.grant(250,'convoy:guard')` → `economy:grantCredits`.
3. **No new tier-0 encounter.** 344 (d0), 367 (d1) and 346 (d2) are pinned. X-02 owns the rail
   fight.

## Numbers

If the reaver classifies light:

| burst item | value |
|---|---|
| scrap | 4×12–18 at 10 cr |
| electronics | 5 at 36 |
| alloys | 3 at 143 |
| chip | 40–90 |

That is about 1,100–1,400 cr of goods per raider, already live and well above the 250 guard pay.
The test confirms the tier through `classifyKillRewardVictim`. The line points at money already
paid, so nothing is retuned.

## Determinism and save

There are no draws and no state changes. Only a `comms:log` string changes, so sim digests hold.

## Keep green

- `first-session-places`
- `pq-163-opening-choice-pacing`
- `rc-458-first-half-hour`
- `adventure-kill-shard`
- `node scripts/check-encounter-director.mjs`

**Verdict: shippable, S.** Drop item 2 if item 1 fails for a reason other than market tier.
