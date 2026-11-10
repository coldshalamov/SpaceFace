# IMPORT — guard-the-wins (PERF backlog #70)

## What it is

A patch series that lands three performance guardrails from
`design/perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md` item **#70**:

1. **Zero shader links after first presented frame** — `RendererInfoMonitor` marks the first
   presented flight frame and counts mid-flight program links; `probe:renderer-info` exits
   non-zero when any appear; `check:zero-shader-links-after-first-frame` gates on that signal
   (offline `--anomalies-json=` for CI, live probe otherwise).
2. **Scoreboard as one command** — `npm run perf:scoreboard` runs the witness phases
   (launch-to-flight main-thread profile, sector-entry runtime witness, zero-shader-links check)
   as a single entry point (`--list` / `--dry-run` / `--only=` / `--skip=`).
3. **20-minute resource plateau soak** — `check:resource-plateau-soak` asserts geometries /
   textures / programs plateau after warmup. Default wall is 20 minutes; on soft-GPU use
   `--wall-s=120 --sim-minutes=20 --live` (or offline `--samples-json=`).

## How to apply

From a clean master tip (or a throwaway import branch cut from master):

```bash
git fetch origin
git checkout -B import/guard-the-wins origin/master
git am design/program/vm-drop/guard-the-wins/patches/*.patch
npm run check:guard-the-wins
npm run check:baseline -- --json   # expect no worse than baseline-before.md
```

To abort a bad apply: `git am --abort`.

## PERF backlog items claimed

- **#70** Guard the wins (all three bullets).

Does **not** claim picture-cost items (#86–#94) and does not touch bloom/shadows.

## What still needs owner-GPU verification

- Live `npm run check:zero-shader-links-after-first-frame` (full headed/headless flight) on the
  Intel/ANGLE machine — soft-GPU may link differently.
- Live `npm run check:resource-plateau-soak -- --live --wall-s=1200` (true 20 wall minutes) on
  owner GPU; the VM used shortened wall / offline samples for the plateau *assertion* proof.
- `npm run perf:scoreboard` end-to-end on a quiet owner machine (Electron witness phases).

## What this does **not** wire

- Does not merge to master (importer decides).
- Does not add the 20-minute soak to `check:baseline` (too slow for the 90s gate).
- Does not change bloom, shadows, or any picture contract.
- Does not invent a parallel probe framework — extends `rendererInfoMonitor` /
  `probe:renderer-info` and wraps existing witness scripts.
