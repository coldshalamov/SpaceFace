<!-- LIFETIME: RECEIPT -->
# PQ-184.02 — Hot UI work is bounded and unchanged state sleeps

DONE — The flight HUD avoids repeated DOM writes, the chart reuses its paths and label state,
and station screens use the shared event-driven models. The three hot surfaces named by this
leaf are below the **2 ms mean UI CPU budget** at 1920×1080. The controller reviewed the code
changes before their implementation commits and inspected the current HUD and chart captures.

Implementation: `aa95391f` (unchanged HUD state), `367fa41d` (chart paths and DOM state),
`e314492c` (chart show/hidden-overview lifecycle), plus the shared station work in `ce9ba29f`
and `0baa4914`. Content and default rendering quality remain intact.

## Direct measurement

Headed Chromium on the host GPU, seed 47, default accessibility mode, 2026-09-06 20:25 UTC.
The UI matrix uses its documented neutral background for comparable UI images. Its v2 CPU
instrument measures the real UI owner and authored UI animation-frame callbacks; it does not
substitute the whole game's frame duration or freeze chart animation. The screenshot background
is therefore not evidence of the 3D world's appearance or liveness.

| Surface | Mean UI ms | p95 UI ms | DOM nodes | Samples |
|---|---:|---:|---:|---:|
| Flight HUD | 0.461 | 1.400 | 804 | 28 |
| Local chart | 1.400 | 3.200 | 351 | 26 |
| Station Dock | 0.211 | 1.000 | 395 | 28 |
| Station Market | 0.244 | 0.800 | 539 | 27 |
| Station Contracts | 0.168 | 0.600 | 395 | 28 |
| Station Bar | 0.125 | 0.500 | 244 | 28 |
| Station Factions | 0.175 | 0.400 | 504 | 28 |
| Station Industry | 0.143 | 0.200 | 340 | 28 |
| Station Ledger | 0.150 | 0.600 | 181 | 28 |
| Station Shipworks | 0.200 | 0.200 | 423 | 1 |

The Shipworks window yielded only one sample, so it is not a stable percentile estimate. The
preceding complete 34-surface run (`88201be7`) measured the same Shipworks implementation at
0.179 ms mean. The chart's p95 exceeds 2 ms; this leaf satisfies the existing **mean** budget,
not a promise that every frame or percentile stays below 2 ms. Deferred browser layout/paint is
outside this synchronous CPU instrument.

Raw current evidence: [budgets.json](../evidence/pq184-hot-surfaces-2026-09-06/budgets.json).
Capture command: `node scripts/capture-ui-matrix.mjs --headed --only=flight,chart,station-market,station-shipworks,station-ledger,station-contracts,station-dock,station-industry,station-factions,station-bar --mode=default --viewport=1920x1080 --out=.devshots/next10-ui-hot-final --budgets-out=.devshots/next10-ui-hot-final/budgets.json`.
Ten of ten requested captures were produced. Local images are in that output directory.

## Idle and behavior checks

`node scripts/check-ui-frame-sleep.mjs` passes. Inactive floating text and retired damage
indicators perform zero projection/player reads; unchanged HUD state does not rewrite attributes.
The ten focused tests in `physics-hud-dom-writes.test.mjs` and
`hud-contact-roster-keyed-rows.test.mjs` pass, including change-only contact updates. Closing the
chart cancels its owned animation frame; hidden overview screens no longer run their loops.
Station UI updates follow state changes rather than maintaining a standing animation loop.

The post-integration baseline passed 15/15 at `7b891461`. The focused checks above passed on the
current candidate. The full matrix's v2 baseline was committed in `88201be7`; the later renderer
changes make its digest stale, so its final refresh remains part of this campaign's integration
checks. This receipt does not claim a current green aggregate budget check.

## Remaining packet debt

The wider PQ-184 packet is still open. Asteroid Works' separate interactive 3D callback was
measured above 2 ms in the full matrix (2.875 ms mean), and the later focused measurement was
5.100 ms with eight samples. It is not one of this leaf's HUD/chart/station surfaces and is not
waived or marked paid. The final game review must retain and address that existing debt. The
old .00 receipt's whole-frame v1 numbers are historical and are superseded by the v2 instrument.
