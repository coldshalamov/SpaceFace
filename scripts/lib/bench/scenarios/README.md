# Verb-bench scenario modules (auto-discovered)

Every `*.mjs` file in this folder is a verb-bench scenario. `scripts/lib/bench/verbBench.mjs`
discovers them at run time, so adding a scenario never edits a shared file — each lane owns its own
module and nothing else.

## Contract

```js
// scripts/lib/bench/scenarios/feel.reversal_course.mjs
export const scenario = {
  id: 'feel.reversal_course',          // stable id; a module with the SAME id as an inline scenario REPLACES it
  label: 'B2 Nimble regime — rest→cruise, 180° reversal, turn radius at cruise',
  async run(seed) {                    // deterministic: state.rng / fixed tapes only; no Math.random, no Date.now
    // ... drive the REAL runtime (createAuthoritativeRuntime + the live systems, or the Motion Lab)
    return {
      eventTrace,                      // array of { tick, simTime, type, ... } — hashed
      metrics: {                       // hashed; every number the receipt prints
        cruiseSpeed,
        // Generic bar feed (single-writer seam for feelBars.mjs): each entry lands on that bar's
        // value list with this run as its fed-by; `met` is the clause verdict in player units.
        bars: [
          { bar: 'B2', label: 'rest→cruise, starter hull', value: 1.2, unit: 's', met: true },
          { bar: 'B2', label: 'full 180° velocity reversal, starter hull', value: 2.6, unit: 's', met: true },
          { bar: 'B2', label: 'turn radius at cruise, screen depths', value: 0.9, unit: 'screen depths', met: true,
            note: 'screen depth read from the live chase camera at cruise' },
        ],
      },
    };
  },
};
```

## Laws

1. **A scenario that integrates its own physics is not a measurement.** The number must come from
   the game's real path — the authoritative runtime (`src/runtime/createAuthoritativeRuntime.js`) with
   the live physics authority and the live systems, or a Motion Lab scenario (`src/testing/lab/`). A
   hand-rolled spring, a stand-in knock model, or a fixture that spawns the reaction it claims to
   observe measures the bench, not SpaceFace. (Several of the original inline scenarios in
   `verbBench.mjs` do exactly this; a module with the same id replaces them once the real-path version
   exists.)
2. **Fixed seed, fixed tape.** Two runs of the same seed hash identical (`runHash.mjs`).
3. **Player units.** Seconds, screen depths, hull lengths, fraction of cruise, fraction of hull.
4. **One module, one owner.** Do not edit another lane's module; do not register anything anywhere.
