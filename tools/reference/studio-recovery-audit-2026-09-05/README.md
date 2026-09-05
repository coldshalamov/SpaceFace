# Standalone reference code

These examples are analytical tools accompanying the SpaceFace audit. They are **not integrated changes to SpaceFace**. All 33 tests in the delivered run passed under Node.js 22.16.0.

## Commands

```bash
node --test reference.test.mjs
node examples.mjs
node frameAudit.mjs synthetic-frame-trace.json
# With two REAL, independently collected compatible traces:
node frameAudit.mjs candidate.json baseline.json
```

## Modules

`ropeEnvelope.mjs` uses consistent arbitrary mechanical units. Its equilibrium assumes fixed tangential relative speed, not fixed angular momentum. Its scalar timestep ceiling is a diagnostic for an explicit spring, not a Rapier stability guarantee. It does not apply forces or create bodies. The current game already contains load-scaled stiffness; the example is for edge-case selection, not a claim that this audit invented or shipped that fix.

`maneuverEnvelope.mjs` consumes strictly increasing arc-length samples and supplied curvature. Sample interior curvature extrema before relying on the envelope. It reports boundary infeasibility rather than editing a body's speed. It does not generate a smooth path, steer, avoid obstacles, or integrate with the game's focus/input rules.

`transferPlan.mjs` demonstrates validation-before-commit with immutable snapshots and durable exact-retry receipts. It assumes one storage-volume unit per item and a trusted local quote. It has no network security layer, commodity catalog, market slippage, production save adapter, or concurrency scheduler. The sample receipt-capacity failure is intentional: production needs checkpoint/epoch semantics, not unsafe receipt eviction. Never let this module become a second real credits or cargo writer.

`frameAudit.mjs` consumes exported data. `frameMs` must be documented by the instrumenter: requestAnimationFrame intervals, CPU callback time, and actual display present intervals are different measurements. CPU phase fields are analyzed separately; their percentiles are not additive. GPU samples require valid query results with disjoint status checked by the collector. Missing GPU is unknown, not zero. `shedTicks` is per-frame shed-step count, not a cumulative counter; convert cumulative counters to deltas before export. `shedSimulationMs` is simulation time, not necessarily wall time under time scaling. Lifecycle exclusions are reported and must be reviewed separately, especially restore transitions. An over-budget interval is not, by itself, proof of a missed display refresh; retain timing precision and interpret it with the actual presentation instrument. The CLI does not collect or validate those measurements itself.

## Trace shape

```json
{
  "manifest": {
    "route": "route ID",
    "scenarioRevision": 1,
    "inputTapeHash": "hash",
    "seed": 123,
    "hull": "hull and fitting signature",
    "device": "named CPU / GPU / browser / OS configuration",
    "resolution": [1920, 1080],
    "quality": "complete settings signature",
    "profile": "production",
    "physicsBackend": "rapier-dynamic",
    "cacheState": "warm",
    "displayHz": 60,
    "commit": "measured commit"
  },
  "frames": [
    {
      "lifecycle": "foreground",
      "frameMs": 16.7,
      "cpuCallbackMs": 7,
      "simulationMs": 2,
      "presentationCpuMs": 3,
      "gpuMs": 5,
      "gpuValid": true,
      "shedTicks": 0
    }
  ]
}
```

The numbers in this schema example and the supplied trace are **synthetic**, not measurements. Manifest matching does not establish statistical significance or control for all asset/content changes. Review the whole route, cold/warm state, observer overhead, and complete-frame tail behavior.

---

Placed in the SpaceFace repo on 2026-09-05 by the integrator as DIAGNOSTIC REFERENCE ONLY. Nothing under `src/` may import from this directory (the game has one physics, one economy and one rendering authority). Run: `node --test reference.test.mjs` here.
