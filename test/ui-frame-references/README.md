# UI Frame Reference Matrix

This directory contains the committed UI frame references for the live frontend surfaces:

- `flight` (post-launch cruise)
- `ship` (`F2`)
- `footprint` (`F3`)
- `range` (`F4`)
- `chart` (`M`)

Across this capture matrix:

- Viewports: `2560x1080`, `1920x1080`, `1280x720`
- Modes: `default`, `reduced-motion`, `forced-colors`, `pseudo-localized`
- Total references: `60` PNG frames

## Regenerate References

```bash
npm run capture:ui-matrix -- --update
```

The same run also writes inspection copies to `.devshots/ui-matrix/`.

## Regression Thresholds

`npm run check:visual-regression` captures a fresh matrix and diffs against this directory with:

- Channel tolerance: `8/255` per RGBA channel
- Differing-pixel ratio threshold:
  - `0.5%` for deterministic instrument surfaces (`ship`, `footprint`, `range`, `chart`)
  - `2.5%` for `flight` (live world jitter behind HUD)

It also runs a repeatability guard by capturing the matrix twice and requiring `0.00%` self-diff on
all instrument frames.

## Golden Law

Never regenerate these frames just to make a failing visual diff pass.
Identify what changed first, then deliberately update references only when the visual change is
intentional.

## Thresholds (calibrated 2026-08-20 from measured two-pass variance)

| Surface | Measured rest variance | Threshold |
|---|---|---|
| footprint | 0.00% | 0.5% |
| range | 0.02-0.05% | 0.5% |
| ship | 0.00% (one 2.45% settle-frame outlier from gauge SETTLE easing) | 3% |
| chart | 2-4% (label scramble / staleness animation between frames) | 5% |
| flight | 5-8.6% (live world behind the HUD) | 10% |

These floors encode the measured rest variance of each surface on a clean tree. They are NOT
knobs to make an unknown change pass - see the golden law below.
