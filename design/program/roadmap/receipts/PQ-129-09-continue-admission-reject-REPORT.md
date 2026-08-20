# PQ-129.09 — Continue and sector-admission rejection

Status: done by measured invalidation; no production mutation.

## Direct result

The runtime witness now supports `--continue`. It reads the player's save JSON without mutation,
copies only `sf.save.*` keys into an isolated Electron profile, presses the public Continue control,
and runs the same bounded hitch classifier used for New Game. Any runtime save writes remain inside
the throwaway profile.

The result-bearing route loaded the indexed `auto`, `m2-seamless-world`, and `quick` slots, reached
foreground Intel D3D11 flight, opened the public galaxy map, searched for Ceres Belt, used the
public `Set Course & Jump` action, and waited for `sector_ceres_belt` to finish entry. The three
captured canvas hashes changed.

Across the full Continue-to-sector-entry window it classified 256 of 258 observed frames as hitches,
with 233 named (91.0% coverage). Admission owned zero hitches. The only one-off route events were one
compile and one autosave hitch; upload, compose, mesh build, shadow, GC, and restore also remained
zero. The large owners were sim (98), external scheduling (67), and bloom (50).

The measured render pole remained the main HDR scene render: `bloomScene` p95 247.7 ms, average
46.9 ms, and maximum 2224.6 ms. Downsample p95 was 1.0 ms and composite p95 was 0.2 ms. The public
sector boundary completed without an admission-owned hitch.

Report SHA-256: `10B8A0FF7EB994527CF95F3343BBE6CCABDAAE53ED8F2225B9A5002FDC5998BE`
for `.devshots/runtime-witness/report.json`.

## Disposition

Do not change `prepareSectorEntry`, the opening cohort, or presentation recovery for this leaf. The
real Continue route plus a completed public sector boundary does not reproduce the historical 2 s
admission owner, while it does reproduce the already measured presentation/bloom-scene pole. The
single compile observation belongs to the already measured exact-key line and does not justify a
broad prewarm. No renderer, save, population, quality, or visual behavior changed.

Routing consequence: Wave B has no remaining ready implementation leaf. Promote the Wave C owner
that PQ-129.02 and this Continue route both name: same-picture main-scene presentation/bloom work.

## Verification

- `node --check scripts/probe-runtime-witness.mjs`
- `npm run probe:runtime-witness -- --continue --sector-entry` — result-bearing headed Intel run
  above; nonzero status is expected while the truthful verdict remains `hitching`.
- Bounded instrumentation restored its previous state before shutdown.
