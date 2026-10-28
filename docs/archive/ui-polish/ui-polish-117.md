# ui-polish-117: 960x540 Market chart AVG / SPREAD overlap

**Issue.** At desktop 651–1100 × 461–600 (e.g. 960×540) the Market price trace is ~119px wide and
48–56px tall. The SPREAD reading sits over its bracket, whose top is at most h−40px down, and the
AVG label sat over its own dashed line, so both used the same band over the plot. On Machine
Control Unit, "AVG 215" printed across "14 SPREAD" and touched "Last move: …". On Iron Ore and Fuel
Cells, SPREAD rode 3px into the "Last move" line.

**Fix.**
- `src/ui/views/marketPresentation.js`: the AVG label gets `sx-mkt-instrument__avg--upper` when the
  average is in the upper 62% of the plot. This is markup only and changes nothing at other sizes.
- `src/ui/orrery/marketLayouts.js`, desktop-only (`MD`) 651–1100 × 461–600 block: SPREAD is set on
  one 13px line (padding 1px). AVG uses a 14px line and sits 3px above its line, or 3px under it
  when it has the `--upper` class. At 48px and 56px plot heights the 62% split keeps AVG out of the
  SPREAD band and inside the plot.

**Checked.**
- 960×540, walked: a DOM probe over all 64 Market rows found 0 overlaps of AVG with SPREAD, cause,
  max or min, and of SPREAD with cause or hero. Before the fix: MCU had AVG×SPREAD and AVG×cause,
  and Iron Ore and Fuel Cells had SPREAD×cause.
- 1024×600 and 800×480: probe over 64 rows, all clear.
- 390×844, 1280×720, 1920×1080: main Market shot is pixel-identical before and after (1920 differs
  only in the animated bottom timeline strip). Bench findings are identical before and after.
- 960×540 bench walk findings: 17 before and 17 after, all command-palette reachability notes.
- `node scripts/check-type-floor.mjs`: OK.

Shots (box): `/workspace/spaceface-scratch/ui-shots/polish117/` (before-, after-, compare-market-960x540*.png).
