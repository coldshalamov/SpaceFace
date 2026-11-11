# PL-55: Killed by traffic → Static reports

Plant row: `| PL-55 | You are killed by traffic | "Lane lights exist. Just saying." |`

## Before

`player:death` receipts already name the killer; the Band never listened. Getting run
down by a civilian hauler produced no radio remark.

## After

- `deriveBandEventKeys('player:death')` resolves the receipt's `killerId` and opens
  `player.killed_by_traffic` only when the law layer's own civilian test
  (`isCivilianEntity`) says the killer was traffic.
- `the_static` carries `static_76` "Lane lights exist. Just saying." — airs once.

## Proof

`node --test test/inf-radio-traffic-kill.test.mjs` — civilian killer opens the key,
a hostile/hazard/despawned killer does not; the authored line is the only eligible
report. Band tests re-run green.
