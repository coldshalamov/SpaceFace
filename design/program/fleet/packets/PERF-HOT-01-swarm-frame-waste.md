# PERF-HOT-01 — Remove per-frame waste in the Swarm fight (mechanical, behaviour-preserving)

The lead verified these findings from the INV-03 audit
(`.devshots/fleet/runs/INV-03-swarm-hot-path.dsx.2026-11-15T18-35-04/RECEIPT.md`, which has the full
reasoning per item). Each fix must keep **exactly** the same visible behaviour and the same values; only the
allocation / repeated work goes away. Do them in this order, **one commit per item**, each committed by exact
path per the protocol (use `bash scripts/fleet/own-commit.sh` when the file already has someone else's edits).

## Items (INV-03 numbering)
- **14** `src/render/lod.js:56`: replace the array `.every(Number.isFinite)` with chained `Number.isFinite(...) &&`.
- **2** `src/render/renderer.js` (~29193): hoist the `{ framePass: true }` literal to one module-level frozen
  const and pass that.
- **19** `src/render/broodPresentation.js` (~440): precompute the draw scale per family once (as
  `FAMILY_COLORS` is), so the per-body loop reads an array.
- **12** `src/ui/survivalHud.js` `_bossVitals` (~777): iterate the ship index (`indexedShipLikeScan(state)`,
  as `src/ui/hud.js` ~4800 uses) instead of `entities.values()`. Same champion bodies must be found.
- **10** `src/ui/survivalHud.js` (~589/593): cache the style multiplier and the figure string on the key
  `(combo.activePoints, combo.bridges.length, combo.acts.length)`; recompute only when the key changes.
- **11** `src/ui/survivalHud.js` (~627/630): cache the composed mods line on `run.modifiers.length`.
- **9** `src/ui/hud.js` (~6226–6228): route the `title` / `aria-label` writes through a cached writer so an
  unchanged act line writes nothing (follow the existing `setAttr` cache pattern in that file).
- **15** `src/ui/hud.js` (~5812–5814): move the width/height/transform writes below the `arcSig`
  early-out only if the signature already covers `size` and position; if it does not, leave this item and
  say so.
- **16 / 17** `src/ui/swarmJuiceHud.js` (~217, ~312, ~354): skip the style write when the rounded value
  equals the last written value (store it on the dom node / record).
- **18** `src/ai/gunnery.js:66`: hoist the `tgt` / `vel` scratch objects to module scope (do NOT reuse the
  returned result object). This file is simulation code: run `npm run check:sim` after it and report the hash.

## Checks
For every file you touch, find its tests (`grep -l "<file basename>" test/*.mjs`) and run them with
`node --test <files>` before and after your change; report both counts. Any test that was passing and now
fails: fix your change or revert your own edit. Do not run the whole suite. Do not start the game.

## Receipt
List each item: done / skipped (why), the commit hash, and the before/after test counts.
