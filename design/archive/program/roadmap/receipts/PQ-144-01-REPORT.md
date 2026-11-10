<!-- LIFETIME: PACKET_RECEIPT -->
# PQ-144.01 — seven production routes on the baseline laptop

RESULT: DONE. All seven real routes were driven and measured. This closes the baseline task,
not the performance campaign: several routes still hitch and exceed a 16.7 ms frame budget.

The same production source digest was used for every row:
`c37f2a01727c12705aedb3f5c7e97b7ebce7ea13fd9ec99fa06053f59974af57`. Implementation is in `8bda6a93`, `9a047016` and `72ffa37c`;
`02d03d88` corrects the player-site save lookup and `22001eab` handles CSP-safe polling values.
Those last repairs affect the driver, not game behavior. The original failed speed run is retained
under `.devshots/next10-production-matrix/20260906-140741/earned-speed-traversal/`; only its repaired,
successful run is in this table. Each linked JSON retains its own exact commit and harness digest.

Machine: Intel Core Ultra 7 155U, 14 logical CPUs, Windows 10.0.26200, Intel Graphics 0x7D45 through
ANGLE/D3D11. Electron 43.2.0 / Chromium 150.0.7871.129. Production profile, 1832×973 drawing surface,
device pixel ratio 1.25, FOV 50, default bloom/shadows/effects, no quality cuts. Native display refresh
is unavailable through this browser API. Seed 47; Kestrel for adventure, Hornet for Crucible.

These are foreground rAF intervals across the actual route, including loading/refit/reload portions,
not sums of phase percentiles or a fabricated GPU measurement. The existing witness also records
CPU phase distributions and the longest intervals with their correlated phase snapshots. GPU timing
returned zero valid samples on every route and is explicitly invalid/unknown. Input age is unknown
because this runtime does not publish a public input timestamp. Neither unknown is presented as zero.
Shed time uses reset-aware cumulative fixed-step counters, excluding history before the first sample.
Runs were serial, with no simultaneous second GPU capture.

| Route and run manifest | Intervals | Frame p50 / p95 / p99, ms | Max, ms | Shed sim, ms | Dominant cost or bounded uncertainty |
|---|---:|---:|---:|---:|---|
| [cold ordinary opening](../evidence/pq144-production-baseline-2026-09-06/cold-opening.json) | 877 | 16.7 / 116.7 / 566.6 | 5516.8 | 1683.3 | Admission reaches 5.50 s; steady simulation frames reach p95 14.1 ms. |
| [warm dense combat](../evidence/pq144-production-baseline-2026-09-06/warm-dense-combat.json) | 820 | 16.7 / 49.9 / 83.3 | 683.4 | 900.0 | Simulation frames lead at 17.2 ms; one admission takes 676 ms. |
| [earned-speed traversal](../evidence/pq144-production-baseline-2026-09-06/earned-speed-traversal.json) | 559 | 16.7 / 50.0 / 66.8 | 6366.8 | 466.7 | Simulation frames lead at 15.4 ms; first-use admission still reaches 6.34 s. |
| [sustained Swarm](../evidence/pq144-production-baseline-2026-09-06/sustained-swarm.json) | 720 | 16.7 / 16.8 / 33.0 | 5683.5 | 283.3 | Steady simulation frames are 7.2 ms, but rare loading/render stalls remain. |
| [dock / refit / undock](../evidence/pq144-production-baseline-2026-09-06/dock-refit-undock.json) | 2118 | 16.7 / 50.1 / 100.1 | 4850.3 | 1750.0 | Actual save/unfit/apply/delete-preset and undock succeed; simulation frames lead at 12.1 ms. |
| [Asteroid Works in / out](../evidence/pq144-production-baseline-2026-09-06/asteroid-works-roundtrip.json) | 1781 | 16.7 / 33.4 / 83.3 | 4750.0 | 1400.0 | Actual local-map approach, Massline, B entry and Escape exit succeed; simulation frames lead at 9.1 ms. |
| [busy-site save / reload](../evidence/pq144-production-baseline-2026-09-06/busy-site-save-reload.json) | 491 | 33.1 / 83.3 / 483.2 | 8916.8 | 1366.7 | A producing site saves and reloads; the 8.92 s presentation gap is not fully explained by the correlated CPU sample. |

The longest interval is not automatically the CPU bucket sampled beside it. Some gaps cross loading
or external scheduling and remain unattributed; valid GPU timers are missing. This baseline therefore
supports two concrete directions already in `PERF_WHAT_MATTERS.md`: reduce the regular simulation
work on the table, and reduce first-use program/material admission. It does not justify dimming the
picture, another generic prewarm sweep, or attributing all external gaps to one shader.

Direct checks: baseline 15/15 green before this matrix; five production-matrix contract tests green;
all seven public route executions returned zero after the two driver repairs. Each manifest records
settings, route tape, hull, device, source and timing validity. The current finding is linked from
`design/program/PERF_WHAT_MATTERS.md`.
