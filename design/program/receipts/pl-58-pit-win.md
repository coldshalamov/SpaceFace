# PL-58: You win the Pit → Static reports

Plant row: `| PL-58 | You win the Pit | "Lights came up at the Pit last night." |`

## Before

The Pitborn Cull settles a scored run through `pitborn:cullSettled` (score, purse,
kills) — the Band never heard it.

## After

- `deriveBandEventKeys('pitborn:cullSettled')` opens `player.won_pit` when the settle
  paid a purse — the yard only emits on a scored run.
- `the_static` carries `static_77` "Lights came up at the Pit last night." — once.

## Proof

`node --test test/inf-radio-pit-win.test.mjs` — dry settle opens nothing, paid purse
opens the key, authored line is the sole eligible report.
