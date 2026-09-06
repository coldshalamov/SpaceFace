<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-184.00 — The budgets, measured

```text
DONE  PQ-184.00 — the UI matrix now measures every surface's real per-frame cost and DOM node count, the committed budget baseline sits beside the reference frames with a staleness digest, and a new check fails red the day any surface regresses against it — while naming, per surface, the measured debt the grammar's two-millisecond budget still carries.
WHAT I FOUND     The grammar's budget table said "≤ 2 ms UI frame cost, ≤ 1,500 DOM nodes" but nothing anywhere measured either number: the matrix photographed pixels only, and the frame-cost rule was an honest "seam: no published timing" cell.
WHAT I CHANGED   The capture boots now wrap the game's own animation-frame clock so every surface's real frame work is sampled without touching the cadence, budgets runs record per-surface frame cost and DOM subtree counts, a committed budget baseline (headed renderer, UI source digest, named coverage gaps) sits beside the reference frames, and check:ui:perf gained a member that fails red on a regression, a stale baseline, a missing baseline, or a surface that silently stops being measured.
WHAT YOU WILL FEEL   Nothing when you play — this is the instrument. What changes is that the two-millisecond promise now has a number attached to every screen: the worst surface today is the wingman radial at ~42 ms mean, twenty-four screens carry named debt against the grammar budget, and any of them getting worse is red the day it lands.
THE NUMBERS      surfaces measured | 34 of 34 reachable (+ 6 named unreachable gaps: credits, statistics, photo-mode, crucible-lab, localmap-legacy, starmap-legacy) · baseline | committed, headed, digest-stale-proof, gap-named · worst mean frame cost | wingman-radial 42.0 ms (comms-radial 40.7, power-rail 32.7, flight 18.9) · worst DOM count | station-market 964 of 1,500 · surfaces over the grammar budget | 24, named per surface (owed to PQ-184.01/.02) · reference matrix cost | unchanged (the probe installs only on --budgets-out runs)
THE FRAMES       none — this unit adds no player-felt change; the instrument's artifact is the committed budgets.json beside the reference PNGs
NEXT             PQ-184.02 / PQ-184.01 (the leaves that pay the named debt; --strict on check:ui:budgets is their teeth)
```

## What was connected (nothing new was invented)

- The DOM-node half already existed: `scripts/lib/ui-grammar-measure.mjs` counts the surface
  subtree and judges it against `MAX_SURFACE_DOM_NODES`. The budget probe uses the same
  definition (subtree `querySelectorAll('*').length + 1`, counted on the same resolved handle
  Playwright photographed) so the two instruments agree.
- The thresholds already existed in their one legal home (`scripts/ui-grammar-thresholds.mjs`,
  cited by INSTRUMENT_GRAMMAR §12.1). Nothing restates a number; the check imports the constants.
- The capture harness already boots every surface deterministically (seed 47, neutral ground) —
  the probe rides `openBoot`'s existing init-script seam and reads in `captureSurfaceScreenshot`.

## The mechanism

- `scripts/capture-ui-matrix.mjs`: on `--budgets-out` runs only, an init script wraps
  `requestAnimationFrame` before any page script runs, timing each frame's callback execution —
  the WHOLE game tick (sim + presentation + UI submission) for the live surface — without
  changing cadence. A 150 ms time-based warm-up is discarded after each surface opens (frame-count
  warm-ups ate the whole window on slow frames), rows with zero samples are skipped rather than
  committed as healthy zeros, and the aggregation keeps the WORST sample per surface. The DOM
  count is taken on the resolved element handle, not a re-run selector (multi-selector station
  roots re-resolved differently and once committed `domNodes: 0` — the review caught it).
- `test/ui-frame-references/budgets.json` (committed): the baseline — 34 reachable surfaces,
  headed renderer named, sha256 over the in-frame UI source (`src/ui`, `styles`, plus `src/core`
  and `src/render`, which run inside the measured callback), and a `missing` list naming every
  planned-but-unmeasured surface WITH its reason, so coverage can shrink only loudly.
- `scripts/check-ui-budgets.mjs` (new member of `check:ui:perf`, standalone `check:ui:budgets`):
  red on a missing, unparseable, headless, stale (digest moved), empty, or silently incomplete
  baseline; red on a REGRESSION (a re-measured surface worse than its committed row — mean/p95/
  domNodes at 5 % + 0.05 dust; a single-frame max is hitch noise, not a regression key; compare a
  fresh capture with `--current=<path>`); names every surface over the grammar budget as GRAMMAR
  DEBT owed to PQ-184.01/.02 — red under `--strict`, which those leaves flip on when they pay it.

## Why the grammar debt is reported, not fatal (the packet's own sequencing)

Twenty-four surfaces measure over the 2 ms grammar budget today. The packet's order puts the
instrument (.00) BEFORE the fixes (.01 virtualise the lists, .02 no per-frame allocation): a fatal
grammar gate today would have made every later `check:ui:perf` run red before its owner's first
edit, violating "nothing green at entry is now red" for the whole packet family. The debt is
instead NAMED per surface, in every run, with the owing leaf attached — and `--strict` turns it
fatal the day .01/.02 claim it is paid. THIS IS A TASTE CALL the senior reviewer should ratify or
overturn: the alternative reading is that the grammar budget is already law and .00 should gate on
it immediately, accepting a red `check` chain until .01/.02 land.

## Verification evidence

- `test/ui-budgets.test.mjs` (6/6): at-budget green with zero debt; over-budget = named debt, red
  under strict; aggregation keeps the WORST sample per surface and skips zero-sample rows;
  regression detection (mean/p95/domNodes, dust tolerance absorbed, max excluded, new surfaces
  recorded not failed); stale/headless/empty/incomplete baselines red before any number is read;
  the committed baseline's digest must match the live UI source; capture and check cite the same
  shared module.
- The live check: `npm run check:ui:budgets` PASS with the debt table printed; the
  `check:ui:perf` chain ends PASS with the new member appended last (it is not in check:baseline,
  so the fast gate is unaffected — verified).
- The committed baseline was shot HEADED on the host GPU (the check rejects headless numbers).
  Three capture iterations were needed: the first committed seven `domNodes: 0` lies (selector
  re-resolution) and an outlier-inflated chart-galaxy mean (one 7.7 s hitch inside a 600 ms
  window); the fixes are in the probe and the receipt, not in hand-edited JSON.
- Untouched, per the golden law: the 408 reference PNGs, `provenance.json`, `floors.json`, the
  diff-floor logic, and the threshold constants.

## Review findings and dispositions

Two subagent integrator review rounds (first REJECT, second REJECT) plus a self-review pass; all
blockers fixed before commit:

Round 1: (1) the stride-pinning tests for PQ-139.04 were attributed here in error — withdrawn by
the reviewer; (2) the receipt cited a pre-screencast real-time stage as the strip's speed —
receipt now quotes the manifest's own headline fields; (3) the shader used a retyped literal —
fixed via the named constant (landed in PQ-139.04's commit).

Round 2 (this unit's real review): (1) BLOCKER — seven station surfaces committed `domNodes: 0`
because the probe re-ran `surface.selectors[0]` in-document while Playwright resolved a different
root; fixed by counting on the resolved handle. (2) BLOCKER — chart-galaxy's headline mean was
outlier-driven (one 7.7 s frame); fixed with a time-based warm-up and by making max a reported
stat, not a regression key. (3) BLOCKER — receipt said 14 over budget, artifact says 24; fixed
(honest recount of the shipped artifact). (4) the probe ran in every boot, taxing the reference
matrix; fixed — installed only on budgets runs. (5) the regression layer existed only in tests;
fixed with `--current=<path>` compare mode on the check. (6) the digest covered only `src/ui` +
`styles` while the measurement covers the whole frame callback; fixed — `src/core` + `src/render`
added to the staleness contract. (7) zero-sample rows could commit as zeros; fixed (skipped, and
`samples` recorded). (8) silent coverage shrink passed integrity; fixed (named-gap list + the
completeness assertion over AUTOMATABLE_SURFACES). (9) the baseline's renderer string was
hardcoded "headed" even for headless shoots; fixed (reuses the capture's own renderer string).
Declined nits, recorded: the capture's printed table does not show the budget columns (they live
in budgets.json and the check's output — adding columns to a table 408 frames wide buys noise);
the receipt's "whole frame callback" definition is now also a `measured:` field in the baseline.

## Tradeoff deliberately spent

A ~750 ms per-surface sampling cost on `--budgets-out` runs only (the reference matrix is
untouched), one committed JSON beside the frames, and a check:ui:perf member that makes a stale
or silently-shrunk baseline red — bought with the first per-surface numbers the grammar's budget
table has ever had, and a regression gate that fires the day a surface gets slower.

## How this can be got wrong later

- Re-shooting PNGs to refresh budgets: never — budgets come from `--budgets-out` runs; the
  reference frames' provenance is a separate golden (test/ui-frame-references/README.md).
- Editing a number in budgets.json by hand: the digest staleness and the `--current` regression
  layer catch the drift; hand-edits are the forbidden golden move.
- Adding a surface without budgets: the completeness gate fails until it is measured or NAMED as
  a gap in the baseline's `missing` list — a silent shrink is the one thing this instrument
  refuses to do.
- Letting the debt table become furniture: `--strict` is the debt's teeth — .01/.02 flip it.
