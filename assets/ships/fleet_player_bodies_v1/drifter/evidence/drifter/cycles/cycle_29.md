# Cycle 29 — value/volume repair attempt — VERDICT: REVISE (defect persists)

Scope: repair the cycle-29 assessment's top P0 ("dark sliver at play size") and P0-2 ("three
volumes merge into one tube") via authored surfacing value zones + hold-well/drive-house form
changes. Builder: `tools/blender/build_drifter_mtx.py`. New textures authored for accent, armor,
ceramic, hull_aft; LODs rebuilt headless; full chase still set rendered to `cycle_29/`.

## Result

The match-pose chase still at 144 WU (`cycle_29/play_chase.png` vs `cycle_28/play_chase.png`)
shows no legible improvement: the ship still reads as a dark sliver value-matched to the
backdrop, with only the hold's orange patch distinguishing anything. The texture-level value
changes did not survive to play size — the dominant hull surfaces still carry the near-black
read, and no volume break is visible at 144 WU.

Independent review verdict (judge agent, original-resolution read): REVISE — P0 dark sliver
persists; P1 winglet loft, needle-silhouette, nacelle-transom, and abeam-collapse defects
unchanged (form work was out of this cycle's scope).

## Disposition

- Evidence retained (this directory + cycle_29.json).
- The next attempt must change the modeling/value METHOD, not re-tune the same texture knobs:
  either the basecolor value ramp is being authored into the wrong UV/texture zone (verify which
  material actually dominates the chase-facing surfaces), or the dominant material assignment on
  the top hull is not the one that was edited. Verify material-to-surface dominance first
  (id_or_material_id.png), then re-target.
- Cycle 28's log line ("independently accepted") is not honored as closure: the queue leaf bar
  and the play-size P0 outrank it. The leaf remains open.

Hitch untouched; nothing promoted or wired.
