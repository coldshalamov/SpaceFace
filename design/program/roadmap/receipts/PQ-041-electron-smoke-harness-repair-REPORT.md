<!-- LIFETIME: EVIDENCE -->
# PQ-041 Electron smoke-harness repair report

```yaml
packet: PQ-041
dispatchUnit: PQ-041.electron-smoke-harness-repair
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedElectronLaunched: false
performanceEvidenceClaimed: false
```

## Recorded failure

H1 row 8's retained failure state already showed all four facts needed to prove the Main Menu:

- phase `main-menu`;
- game mode `menu`;
- visible screens `["mainMenu"]`;
- focus on the visible `New Game` button.

The route had also completed its semantic locator wait. It then immediately sampled the same surface
again through `querySelector`, computed style, and `getBoundingClientRect`, and that second unstable
sample returned `visible: false`. The harness therefore contradicted its own stronger evidence.

The retained `failure-state.json` and source contract were added as a regression first. Before the
repair, the focused test was 7/9 and failed both the missing role-locator authority and the surviving
second-selector checks.

## Repair

- One exact `New Game` role locator is now the sole Main Menu visibility authority.
- The completed locator wait records `visible: true` and its semantic authority in the snapshot.
- That same locator is reused for the public click.
- The generic second `querySelector`/geometry surface sampler is removed.

No Electron shell, game route, UI, package, runtime, or product visibility behavior changed.

## Focused evidence

- Red characterization: `node --test test/h1-electron-e2e.test.mjs` — FAIL, 7/9.
- `node --test test/h1-electron-e2e.test.mjs` — PASS, 9/9.
- `npm run check:launch-policy` — PASS.
- `node --check scripts/check-h1-electron-e2e.mjs` — PASS.
- Path-scoped `git diff --check` — PASS.

## Honest residual

This repair unit did not launch Electron and did not spend another H1 attempt. Main Menu visibility is
now measured by one stable semantic authority, but the rest of the headed smoke route, exact-package
startup, Browser/Electron parity, GPU identity, teardown, and performance remain unproven.
