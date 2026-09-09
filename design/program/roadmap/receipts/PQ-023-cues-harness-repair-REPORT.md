<!-- LIFETIME: EVIDENCE -->
# PQ-023 Cathedral cue-harness repair report

```yaml
packet: PQ-023
dispatchUnit: PQ-023.cues-harness-repair
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedBrowserLaunched: false
headedElectronLaunched: false
performanceEvidenceClaimed: false
```

## Recorded failure

The retained H1 Browser state placed the player `4936.901 WU` from the Wreck Cathedral while
authored presentation admission requires an approach within `2400 WU`. Both Browser and Electron
harnesses waited for strict `presentationAdmission === 'ready'` before calling their existing
Cathedral framing seam, so the wait and the movement needed to satisfy it were ordered
impossibly.

The exact distance fingerprint and both host orderings were pinned before the repair. The focused
manifest suite failed 9/10 at the Browser ordering assertion.

## Repair

Both hosts now:

1. discover the failed Cathedral production record and live root;
2. use the existing framing seam to move and target the player inside authored-admission range;
3. wait for the strict authored-ready presentation state.

The later damage/recovery owner transitions and the already-valid impact, destruction,
reduced-motion/flash, and dense-scene paths are unchanged. No production gameplay or rendering
owner changed.

## Focused evidence

- Red characterization: `node --test test/pq023-corridor-cues-h1-manifest.test.mjs` — FAIL, 9/10.
- `node --test test/pq023-corridor-cues-h1-manifest.test.mjs` — PASS, 10/10.
- `npm run check:pq023:corridor-cues` — PASS, 20/20 plus receipt validation.
- `node --check` on both host harnesses and the manifest — PASS.
- Path-scoped `git diff --check` — PASS.
- `npm run check:presentation` reached the inherited headless WebGL assertion
  `linked WebGL trail program must consume instanceMatrix; active=` before this lane. Its
  remaining presentation-cue, SG-08 golden trace/mix/render, and propulsion-family checks were
  run separately and passed. No unrelated production fix was attempted.

## Honest residual

This repair did not launch Browser or Electron and did not replace or recapture any retained H1
artifact. The missing Cathedral sequence, Browser completion, Electron parity, motion/accessibility
human verdict, GPU facts, and matched performance remain unproven and require exact downstream
dispatch units.
