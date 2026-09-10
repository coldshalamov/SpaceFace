```yaml
session: S5
title: QA and the second pass — live captures reviewed against the frames; punch list, assets v2, corrections, the proof protocol
tool: ChatGPT 6 Pro — vision review + image generation + JS/CSS in the VM
dependsOn: [S4, L-C]
phases: [P40, P41, P42]
current: [title, flight, station-dock, station-market, ship, chart-galaxy, crucible-door, crucible-results, settings, save-load, game-over, mission-log, codex, pause]
inputs: [.devshots/frontend/S5-captures/, design/frontend/direction/approved/, .devshots/ui-packets/returns/S3-return/kit/, .devshots/ui-packets/returns/S3-return/HANDOFF_TO_ENGINE.md]
source: [styles/fh.css, styles/hud.css, styles/kit.css, src/ui/kit/, src/ui/hud.js, src/ui/radar.js, src/ui/screens/, src/ui/station/, src/ui/ship/, src/ui/views/]
returns: S5-return.zip
```

# S5 — QA and the second pass

## What this session is

The integrated game has been captured screen by screen **with the world** (`inputs/S5-captures/`,
one PNG per surface at 1920 plus 1280 and 2560 where they differ, plus frame strips of the thirteen
motion clips). You are the adversarial reviewer and the second-pass author: compare every capture
to its approved frame, write the punch list with exact fixes, produce the assets the captures show
are missing or wrong, correct the motion and sound, and write the protocol for the blind
comparison that closes the program. This session runs only after the local integration lane
(L-C) has landed the port; its timing follows that lane.

## Phases

### Phase 0 — Set up

Read `NOTES.md` from S4 and the integration receipt (`inputs/` carries them); skeleton; `PLAN.md`.

### Phase 1 — The review (vision)

For every surface: the capture beside the approved frame in `review/<surface>.png` (side by side
and a 50 % overlay), judged by the rubric — materials match · type matches · the world is lit and
dimensional · the eye lands in the frame's order · nothing reads as a web page — and by the two
tests and the guard. `PUNCH_LIST.md`: one row per finding with surface, severity (blocks veto /
visible / polish), the exact cause where you can see it (a plate not stretching, a wrong hex, a
legend at the wrong dim level, a missing state, a glyph unreadable at size, text under 12 px, a
box where a tile should be), and the exact fix (CSS rule, asset id, DOM change). Checkpoint.

### Phase 2 — Assets v2 (image generation + SVG)

Everything the punch list attributes to an asset: missing states, wrong sizes, plates whose corners
smear, glyphs that fail at 10 px, tiles that do not read in a 160 px window, a cold variant that
was never made. Same conventions, same ids (append `-v2` only where the old id must survive).
Contact sheets. Checkpoint.

### Phase 3 — Fix patches (code)

For every punch-list row attributed to CSS or DOM: the change against `source/` (the
post-integration snapshot), as full files plus `patch/S5.diff`; run the static checks as in S4.
As in S4, also deliver the fixes as a branch `chatgpt/s5-second-pass` with a pull request through
the connector; never push to `master`. Checkpoint.

### Phase 4 — Motion and sound corrections — specs `phases/P40.md`, `phases/P41.md`

From the clip strips: timings that miss the register numbers, motions without a state, reveals
that stack, alerts that loop; cue gains that stick out. Corrections as patches to `motion.js`,
`fh.css`, `hud.css`, `sound-recipes` entries, with before/after strip crops in `review/motion/`.

### Phase 5 — The proof protocol — spec `phases/P42.md`

`proof/protocol.md`: the eight screen types, how the comparison sheets are built (unlabeled,
randomised left/right, same crop size), the reviewer prompt for a memoryless vision model, the
scoring, the target (chosen every time against the genre baseline, at least half the time against
A-list frames); `proof/make-sheets.py` that builds the sheets from a folder of captures and a
folder of reference frames the local lane supplies; `proof/reel-storyboard.md` for the
ninety-second reel (shot list, durations, which cue plays where).

### Phase 6 — Package

`QA.md`, `manifest.json`, final zip.

## Return contract

```
S5-return/
  PLAN.md · PROGRESS.md · NOTES.md · QA.md · PUNCH_LIST.md · manifest.json
  review/<surface>.png · review/motion/
  assets-v2/ (+ contact sheets)
  files/<repo path> · patch/S5.diff · checks/
  proof/ protocol.md · make-sheets.py · reel-storyboard.md
```

## Definition of done

Every surface reviewed with a side-by-side; every finding has a fix or an owner; assets v2 pass
the conventions' checks; patches apply and the static checks are green; the proof protocol runs on
sample folders.

## The way this session gets faked

A review that says "looks good" without side-by-sides; fixes described rather than written; a
protocol without the sheet script.
