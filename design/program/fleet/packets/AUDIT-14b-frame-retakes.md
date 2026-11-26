# AUDIT-14b — framing retakes for six audit-14 captures

**Lane 4 (capture only — change no game code, commit nothing).** Every capture run goes through
the lock: `node scripts/fleet/game-lock.mjs run -- <cmd>`. Backend note: this is scripting and
camera math, not frontend UI — follow the run log's findings exactly; the lead judges the frames.

## Why

AUDIT-14 captured every unseen place but six frames fail the bar "a judge can grade the feature's
looks from this frame". The lead viewed each one; verdicts and reasons live in
`.devshots/audit-14/INDEX.md`. The previous worker (devin2) completed the route and then died
writing its receipt — its script, results and hard-won findings survive in `.devshots/audit-14/`
(`capture.mjs`, `RESULTS.json`, `capture.log`, `probe-capstan.mjs`) and its run log at
`.devshots/fleet/runs/AUDIT-14-shoot-the-unseen-places.devin2.2026-11-15T15-47-59/run.log`.

## Retake these (same filenames, same 1920×1080, overwrite in place)

1. `02-hyperion-towout.png` + `02-hyperion-towout-2.png` — gantry + disabled hauler must sit
   inside frame with margin, hauler readable as a hull beside the machine intake (not overlapping
   the mast, not cut by an edge).
2. `04-ceres-winch-anchors.png` — mast, cable line and Long Plate centered at ~40–60 % of frame
   width; today they cram into the bottom-right corner.
3. `04-ceres-quarantine-yard.png` — the file on disk is the midpoint-bug shot (~10 km out). Use
   the worker's recorded pod positions (its fix lives in the run log) for a close yard frame:
   gantry rails, glowing lots, contract panel in one frame.
4. `04-ceres-quarantine-pods.png` — same scene, tighter: pods fill ~40 % of frame width and the
   lots read as glowing; the contract-signal panel visible.
5. `05-frontier-stead-tag.png` — stead + receiving ring + tag centered; today the massline and
   ship dominate and the tag is a speck at bottom-left.
6. `06-outpost-annexes.png` — whole outpost inside frame with margin: core refinery plus annex
   module bodies, their relationship readable (today the top-left corner cuts it).
7. `03-kepler-close.png` — the staged place (the amber wedge structure) fully in frame; hostile
   traffic may stay but must not be the subject.

## The worker's documented findings you must reuse (do not re-derive)

- Stage forcing only reaches real entities with `?simLane=main` (the sim registry lives in the
  worker lane); teleport with `world.relocatePlayerInSector`, never raw `pos` writes.
- Station GLBs stream in late: lengthen the settle (4.5 s was too short for Dione/Kepler).
- Capstan staging order matters: sync the worksite first, re-pin `objectiveProgress` to target,
  mark the mite `deadFauna` keys, then `_syncLane` — otherwise the objective tracker re-computes
  progress to 0 and retires the gantry (probe evidence in `probe-capstan.*`).
- Frontier raid clamp: set `raisedAt` to now, never in the past, or a raid spawns onto the shot.

## Lead continuation 2026-11-16 (second dispatch)

The first devin3 run (60 min cap, log:
`.devshots/fleet/runs/AUDIT-14b-frame-retakes.devin3.2026-11-16T06-15-53/run.log`) fixed the
orphaned capture process, patched the solver, and **solved cleanly: 03-kepler-close,
02-hyperion-towout, 02-hyperion-towout-2, 04-ceres-quarantine-yard, 04-ceres-quarantine-pods** —
those PNGs are re-shot; do not redo them unless a frame is visibly wrong. Finish the remaining
three, with the previous run's own diagnoses:

- `04-ceres-winch-anchors.png` — solved except the mast sits 4 px below frame; nudge the zoom or
  aim up by a hair.
- `06-outpost-annexes.png` — compose failed with "no live subjects": outpost bodies are dressing
  rows, not in `st.entities`, so the `entId` lookup found nothing; look them up through the
  dressing row / presence list instead.
- `05-frontier-stead-tag.png` — the solver picked the wrong tag's ring radius ("E-21 RECEIVING"
  ~2000 WU away) instead of the stead's own "SUPPLIES WANTED" tag; seed the radius from the
  stead's tag.

## Lead amendment after judging retake 1 (read even mid-run)

The solver's "solved cleanly" is not the bar — the bar is *a judge can grade the feature's looks*.
Judged on screen (INDEX.md updated): kepler PASS, stead PASS pending subject confirm,
**towout ×2 PASS-by-log but still lead-unviewed**, and:

- `04-ceres-quarantine-yard.png` / `04-ceres-quarantine-pods.png` **still fail on scale**: the
  solver centers the subject but it renders tiny. Get close or zoom until the subject fills
  ~40 % of frame width; the lots must read as *glowing* quarantine lots, and the yard frame must
  show the gantry/capstan at readable size. A centered speck is still a REDO.
- `04-ceres-winch-anchors.png` — same bar: mast + cable + Long Plate at ~40–60 % of frame width.

## Lead third dispatch — only two frames left

Lead-judged after run 2 (INDEX.md current): **kepler, stead, outpost, winch, towout ×2, dione,
orcus, ninth-mouth all PASS.** Do NOT re-shoot those. Only these two remain, both on scale:

- `04-ceres-quarantine-yard.png` — teleport within ~200–300 WU of the capstan/gantry and frame it
  so the gantry fills ~40–50 % of frame width.
- `04-ceres-quarantine-pods.png` — same closeness; the lots must read as *glowing* quarantine lots.
  If they do not glow up close, that is a LOOK finding, not a framing fault — report it honestly.

## Done

All seven files re-shot in `.devshots/audit-14/` (same names), `RESULTS.json` updated with the
new camera positions, and the receipt lists per file: command, what is in frame now, and an
honest "subject centered yes/no". No repo file changes, no commits. The lead re-judges the
frames afterwards.
