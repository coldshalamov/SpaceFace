# Stranger Lab

Autonomous, repeatable adversarial player testing for SpaceFace. Personas read observable sim state and emit the real input contract. The authoritative headless runtime steps. Failures shrink to a tape that replays.

This is a focused-fixture host. It does not claim a physical phone or a frame rate. Headed rows are Chrome replays of the recorded tapes at 390×844, or `unverified` with the browser error.

Each run now separates detected defects from route completion. `incomplete` names
missing actions or transitions; an unexercised detector is `unmeasured`, never a
closed negative control. CLI exits are 0 for a completed clean route, 1 for a
detected failure, 2 for infrastructure failure, and 3 for an incomplete route.

## One command

```bash
node tools/agentic/stranger-lab/cli.mjs prove
```

`prove` runs the flight canary twice (seed 7, first-time pilot, `drop-thrust`), replays that tape, checks the green control does not invent a failure, checks a second green run has the same digest, and shrinks the canary. Artifacts land in `artifacts/stranger-lab/`.

Use `--out .devshots/stranger-lab` to keep fresh results outside tracked artifacts.

Replay the sample by itself:

```bash
node tools/agentic/stranger-lab/cli.mjs replay --artifact artifacts/stranger-lab/sample-failure.json
```

## Sweep

```bash
node tools/agentic/stranger-lab/cli.mjs sweep
```

Twelve journeys × twelve seeds, rotating through every persona, including the hostile explorer and the weak-hardware pilot. A detector failure fails the sweep and that row keeps its tape. `simulated-touch` quantizes through the phone lane reducer. Chrome at 390×844 steps recorded axes in the focused flight bundle. Combat and docking rows stay `unverified` because that host does not run those worlds. `deviceTested` stays false. The sweep exits 4 when a headed row did not replay. Node replay applies the recorded axes with the fault injector off.

The docking fixture approaches the manifest's actual berth and measures physical
berth arrival. Its headless completion does not exercise the station screen or
UI docking commit. The death/recovery fixture lives outside Helios's sanctuary,
uses authored hostile attack context and the normal combat recovery owner.

## Journeys

launch, flight, tether-attach-cut, heavy-object, mining, docking, buy-refit, scan, mission, combat-death-retry, crucible-wave, save-continue.

## Personas

first-time-pilot, reckless-improvisor, meticulous-cargo-handler, mission-runner, massline-stunt-pilot, weak-hardware-input-stress, save-continue-skeptic, hostile-edge-case-explorer.

## Tests

```bash
node --test test/stranger-lab/stranger-lab.test.mjs
```
