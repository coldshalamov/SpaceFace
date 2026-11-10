<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-173
leafId: PQ-173.01
acceptance: focused_green
disposition: PASS
candidateCommit: b4401771066cfd60165419f36be48e07e4756930
-->

# PQ-173.01 — The measurer: every §B bar and the fun metrics, printed, with a before/after diff

```yaml
packet: PQ-173
dispatchUnit: PQ-173.01
candidateCommit: b4401771066cfd60165419f36be48e07e4756930
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
deterministicHash: PASS (same-seed repeat hashes bit-identical; two full measurer runs byte-identical apart from timestamp/wallMs)
knockBudgetMeasured: PASS (bar B13 measured in two independent sources; honestly failing)
routeCheckNote: check:crucible:route 17/17 PASS on a clean checkout of master tip; red on the shared working tree from the protected render-async-disposal dirty hunks (not this unit's files; attribution evidence below)
```

## Outcome

`node scripts/measure-fun-loop.mjs` runs the three benches (Crucible swarm, flight, verbs) in-process
on the fixed seeds, evaluates every FEEL_CONTRACT §B bar against the contract thresholds, derives the
seven §3.2 fun metrics per run, and writes one JSON + one Markdown receipt per bench+seed plus a
rollup under `design/program/roadmap/receipts/fun-loop/`. `--diff <before.json> <after.json>` aligns
two measure summaries on the same seeds and prints per-bar before → after with direction and a
KEEP/REVERT verdict (ties revert, §3.6). Bars the bench cannot reach (B9 presentation-layer, B12
needs the PQ-141 proof scenario) appear with their reason — never silently missing. Verdicts are
recomputed from raw numbers against the contract: the bench's internal booleans are overridden
(B4's looser 0.15 bench threshold vs the contract's 0.30; the crucible's synthetic `b13Met:true`
stub replaced by real contact-resolved knock events).

## The knock budget on the player is measured (done-when)

Two independent sources, both resolving contacts through the live rule
(`resolveCollisionConsequence`, `src/combat/impulseKernel.js`), seeded:

- `feel.knock_budget` verb scenario (600 sim-seconds of ordinary flight): **2.3 knocks/min, largest
  single bump 17.7 % of cruise, 0 heading changes → B13 NOT met** — the owner's "knocked around all
  the time" (audit A13) is now a number: the bump ceiling (10 %) is breached by ~1.8×.
- Every Crucible run: 2.5–5 knocks/min on the player hull, max fraction 0.036–0.052 → rate bar
  breached (≤ 2/min), magnitude clean. The old hard-coded 0.08 stub is gone.

## Bars across the full default run (seeds 4242 / 8008 / 13502)

reachable 11 | met 3 | partial 10 | unreachable 2

| Bar | Measured | Target | Verdict |
|---|---|---|---|
| B1 earned speed kept | 0.958 kept 5 s after release | ≥ 99 % at 10 s, hands off + forward | met — (only the 5 s release clause is benched; the 10 s clauses are kernel-level) |
| B2 nimble regime | 180° reversal 4.48 s | ≤ 3.0 s | no (rest→cruise + turn-radius clauses unbenched) |
| B3 fight stays on screen | 0.59 s to cross (derived 115 WU ÷ 195 WU/s) | ≥ 1.2 s | no |
| B4 shove magnitude | ΔV 15.4 % of cruise | ≥ 30 % (dedicated shove) | no |
| B5 shove displacement | 0.52 screen depths after 2 s | ≥ 1.0 | no |
| B6 terrain lethal | dies at 76 % closing; 100 % hull + helm lost | dies at ≥ 75 % | yes (heavy-side clause unbenched) |
| B7 rope is a rope | stretch 10.27 %; keeps 95.8 % at 5 s | < 10 %; ≥ 95 % | no (stretch clause) |
| B8 draw-to-fly rips | mean 95.5 %, slowest 35.9 % of cruise | ≥ 70 % / ≥ 35 % | yes |
| B9 impacts answer | — | hitstop/trauma/audio | not reachable headlessly (reason printed) |
| B10 world reacts | salvor arrives 3.75 s after spill | ≤ 30 s | yes (patrol/civilian clauses unbenched) |
| B11 hitstun law | helm 1.5 s at 15.4 % ΔV | universal curve; ≥ 30 % ΔV regime | met — (below the clause's regime; scenario constant, not a curve) |
| B12 60-second proof | — | ≥ 9 of 11 beats | not reachable (needs PQ-141) |
| B13 knock budget | 2.3/min, max 17.7 % of cruise | ≤ 2/min, ≤ 10 %, no heading change | no |

Fun metrics per run (law §3.2, crucible sample): verbs/min 7.5, consequences per action 1.03
(thin — bar is ≥ 2), time to first consequence after an action 0.333 s (slow — instant is ≤ 0.3 s),
moments/min 0–15 by loadout, nothing-happened seconds 0, deaths by cause {weapon: 71}, knock budget
as above.

## Route-check attribution (evidence)

`npm run check:crucible:route` on the shared working tree: MENU PASS,
DOOR PASS, ROUTE FAIL (`page.waitForFunction: Timeout 90000ms exceeded` waiting for
`window.SF.state.mode === 'flight'`). Controlled run in a clean worktree at master tip
(`624f4b2c`, no dirty files): **17/17 PASS — "Crucible route is playable."** The route check imports
nothing from this unit's files (`scripts/check-crucible-route.mjs` imports only node builtins and
the playwright loader). The only delta between the two runs is the protected
`render-async-disposal` dirty set (`src/render/assetLoader.js`, `assetResidency.js`,
`partsLibrary.js`, `pipelineReadiness.js`, `test/render-async-disposal.test.mjs`; NOW.md row
`codex-root/render-async-disposal`, stale per `check-now-liveness`). Diagnosis: entering the
Crucible hangs on the shared tree; adopt or repair that work to restore the shared-tree route check.

## Verification

- `node --test test/feel-bars.test.mjs test/fun-bench.test.mjs test/fun-measurer.test.mjs` → 25/25
  (registry drift vs FEEL_CONTRACT §B fails the test; B7 diff-direction regression pinned:
  0.09 → 0.12 must diff away + REVERT).
- `npm run check:baseline` → 14/14 green at entry, before reviewer repairs, and at exit.
- Determinism: two full default measurer runs byte-identical apart from timestamp/wallMs; two
  full-run diff → all bars unchanged → REVERT-by-tie (§3.6), receipts written.
- Independent acceptance review (two passes): first pass REPAIR REQUIRED (B7 diff direction could
  turn a stretch regression into KEEP); repairs applied and re-reviewed → **ACCEPT** with all four
  repairs independently reproduced.
- New tests: registry-vs-contract drift pin, B1/B11 honesty (met null outside measured regimes),
  B13 honest-failure pin, pooled-table markdown hygiene (no truncation, no repo paths), B7
  diff-direction regression, diff KEEP/REVERT/tie semantics, tri-state met rendering.

## Artifacts

- Runner: `scripts/measure-fun-loop.mjs` (flags: `--crucible|--flight|--verbs`, `--seeds=`,
  `--quick`, `--json`, `--out`, `--diff`)
- Engine: `scripts/lib/bench/feelBars.mjs` (13-bar registry + evaluateBars),
  `scripts/lib/bench/funMetrics.mjs`, `scripts/lib/bench/knockModel.mjs`
- Bench enrichment: `scripts/lib/bench/verbBench.mjs` (+`feel.knock_budget`),
  `scripts/lib/bench/crucibleBench.mjs` (kill causes, real knocks, trace exposure)
- Tests: `test/feel-bars.test.mjs`, `test/fun-measurer.test.mjs`, `test/fun-bench.test.mjs`
- Receipts (this run): `design/program/roadmap/receipts/fun-loop/2026-09-03-crucible-{4242,8008,13502}.{md,json}`,
  `2026-09-03-flight-13502.{md,json}`, `2026-09-03-verbs-4242.{md,json}`, `2026-09-03-measure-summary.{md,json}`
- Diff demo: `.devshots/2026-09-03-measure-diff.{md,json}` (same-seed tie → REVERT per §3.6)
