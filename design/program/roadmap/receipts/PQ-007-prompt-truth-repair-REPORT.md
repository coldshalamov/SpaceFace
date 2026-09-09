<!-- LIFETIME: EVIDENCE -->
# PQ-007 control-prompt truth repair report

```yaml
packet: PQ-007
dispatchUnit: PQ-007.prompt-truth-repair
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedBrowserLaunched: false
headedElectronLaunched: false
```

## Recorded failure

The default Pilot and Helm flight/combat prompts still taught `MMB pursue/course`, `MMB pursue
locked ship`, and `flight keys break pursuit`. PQ-007 explicitly rejected pursuit-slot control,
impulses, HUD, and teaching. A focused prompt-family regression was written first and failed 2/3
tests solely on those two active keyboard schemes; the classic, gamepad, and touch snapshots
already passed.

## Repair

The stale pursuit copy was removed from Pilot and Helm. Both active keyboard schemes now teach:

- `G auto-target` and its gun-lock effect;
- direct pointer drawing to fly;
- pausing pointer drawing as the clutch/release action.

No input, flight, targeting, HUD structure, settings, gamepad, touch, or classic-control behavior
changed.

## Focused evidence

- Red characterization: `node --test test/pq007-control-prompts.test.mjs` — FAIL, 1/3 pass and
  2/3 fail on the retained Pilot/Helm pursuit strings.
- `node --test test/pq007-control-prompts.test.mjs` — PASS, 3/3.
- `npm run check:player-facing-labels` — PASS.
- `npm run check:ui-a11y` — PASS.
- Path-scoped `git diff --check` — PASS.

## Honest residual

This unit repaired visible control truth only. The current probes still need broker-authorized
Browser and Electron public-route modes. No runtime claim, pointer semantics, target acquisition,
HUD state, physical controller behavior, or acceptance artifact is proven here.
