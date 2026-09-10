```yaml
packet: P42
title: The sweep and the proof — dead skin deleted, baselines reshot, the blind comparison, the reel
lane: CODE
tool: local (the controller; a memoryless vision reviewer for the blind comparison)
dependsOn: [P40, P41]
current: []
inputs: [design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P42-REPORT.md + the tally + the reel
mutex: [ui-kit, ui-perf]
```

# P42 — The sweep and the proof

## Objective

**Sweep.** Delete what the migration left behind: `styles/menu.css`, `styles/orbital.css`,
`styles/commsradial.css` (linked from nowhere), the retired sections of `styles/ui.css`,
`styles/station.css`, `styles/asteroid-ops.css` chrome rules, `src/ui/views/hudStyles.js`, the
six injected HUD style nodes, every `createElement('style')` in the 36 modules that now use
`fh.css`/`hud.css`, the old `--k-*`/`--sf-*`/`--visor-*` token layers, Bricolage and any unused
font, the dead `.k-world--still` JPG rule, `assets/cinematics/menu_hangar_bg.jpg` if unreferenced.
`MIGRATED_SCREENS` in `check-ui-screen-imports.mjs` becomes every screen. Re-shoot the two
baselines: `test/ui-frame-references/budgets.json` (`--budgets-out`) and the visual-regression
matrix (`--update`, the long run, on a quiet machine).

**Proof.** (1) The blind comparison: for each of eight screen types (title, HUD, station, market,
map, ship, results, settings), a SpaceFace capture beside a frame of the same screen type from
Everspace 2 (the genre baseline) and from one A-list game on the reference board, unlabeled, judged
by a memoryless vision reviewer: "which is the more finished, more physical, more distinctive
interface?" Target: SpaceFace chosen every time against the baseline and at least half the time
against the A-list frames. (2) A ninety-second reel of the thirteen P40 clips cut to the P41
sounds. (3) A last pass of the two tests (`02_ART_DIRECTION.md` §2) on every surface capture.

## Checks and evidence

`npm run check:all` on a quiet machine · `npm run check:visual-regression` against the reshot
baseline · `npm run check:ui:perf` · `node scripts/check-src-reachability.mjs` · the tally and the
reel under `.devshots/frontend/P42`.

## Acceptance

Zero injected `<style>` nodes in `src/ui`; one token layer; the old stylesheets gone; baselines
green; the tally meets the target or the receipt names which screens lost and why (those return
to their surface packet).
