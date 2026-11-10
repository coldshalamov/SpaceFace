# PQ-129.07 — Exact-key prewarm rejection

Status: done by measured rejection; both production candidates were reverted.

## Result

The Intel D3D11 census mapped four first-boost misses to the production player
`PlasmaStreamSystem`: three custom ribbon/forge meshes and `sf-plasma-throat-0`. An exact
production-system warmup moved all four keys into the loading-owned cache. It was not shipped,
because actual headed flight worsened.

The first candidate retained the full inactive PlasmaStream graph. Combat post-boot links fell
from 12 to 9 and the four plasma keys disappeared, but the immediately matched runtime witness had
presentation p95 207.1 ms versus 147.4 ms without the candidate.

The second candidate retained only the four visible program owners. It again removed all four
plasma keys (31 retained keys versus 27 at baseline, zero missing), but its matched witness was also
worse: presentation p95 219.6 ms and sim-frame p95 232.8 ms versus the same 147.4 ms presentation
baseline. Loading remained visibly live, but this packet explicitly says to revert if the fly
worsens. The four-key compile-count win therefore does not satisfy the player outcome.

`src/render/precompile.js` and its focused test are restored exactly to the published baseline.
No default quality, population, bloom, shadow, or VFX behavior changed.

## Bound evidence

- Baseline combat census: `.devshots/perf/pq129-06-shader-key-census-combat.json`, SHA-256
  `F13AC4DB20A9F6E077D86E9D63503120C5760CBD762BB81DC007397410FCC34C`.
- Full-graph candidate census: `.devshots/perf/pq129-07-shader-key-prewarm-combat.json`, SHA-256
  `D30DD270F3B0C80B1086F8250AC9D0150C108B3861C67D674A88D7117499FF77`.
- Four-owner candidate census: `.devshots/perf/pq129-07-shader-key-prewarm-combat-v2.json`, SHA-256
  `53692C3915D9254547FF90C0729BE8F569C01F927075BE864B4EC05C2CAEC645`.
- Final candidate witness: `.devshots/runtime-witness/report.md`, SHA-256
  `152EEBEBC9EB198DD2F8921AF7B577119CD8ACAFEF06319C7C0C2E69BDC5397A`.
- All admitted census runs used headed Chromium on
  `ANGLE Intel(R) Graphics Direct3D11 vs_5_0 ps_5_0`, default visual quality, and the public Combat
  Range route with live traffic, three hostile ships, hostile target lock, and player fire.
- Production and page-level `linkProgram` counters agreed; retained-key coverage had zero misses.

## Verification and routing

- `node --test test/authored-precompile-residency.test.mjs` — 5/5 passed after full revert.
- `npm run check:shader-compile` passed on the candidate: 116 programs, zero broken, zero page
  errors.
- Generic browser playability timed out before Main Menu under concurrent host load; the Electron
  harness found the already-visible New Game screen but shared the same Main Menu-only timeout.
  Neither reported an exception or missing asset. The headed census and runtime witness both
  reached live Intel flight, changing canvas frames, controls, target lock, and player fire.
- Do not replay the broad BatchedMesh/shadow warmups. Their prior same-machine regression remains
  larger, and the current census still assigns the remaining physical misses to those families.
- Advance to `PQ-129.08` only if upload counters name a first-use upload brick; otherwise invalidate
  it and continue to the measured presentation/bloom owner.
