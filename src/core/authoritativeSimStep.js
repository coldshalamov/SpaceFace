// Whole-sim worker stepper — the production registry.step shape, minus
// presentation telemetry, for hosts where the sim lives off the main lane.
//
// registry.js cannot be reused directly: its step carries perf counters and is
// bound to ctx built for a DOM realm, and the browser worker materializes the
// node-safe system set through createAuthoritativeRuntime instead. This module
// replicates the *sequencing contract* of registry.step(dt, tickBoundary) so the
// worker's ticks are shaped identically to the main lane's:
//
//   frozen  → keepalive(dt) + state.tick += 1 + boundary publish
//   normal  → core.preStep → input.update → boundary publish
//             → postInputPartitions queue → core.lifetimeSweep
//
// The boundary object is host-owned (it feeds completedTick.inputCommandSeq /
// inputWallMs and the inputCommandSnapshots history) and is called at the same
// point in the step the production boundary is called.
//
// Divergence guard: this file must track registry.step's ordering. The S1
// golden/canary gates compare worker-lane sim output to the main lane's; a
// sequencing drift surfaces there as a byte-level mismatch, not a guess.

import { runHiddenKeepalive, shouldSkipFullTickSystems } from './presentationFreeze.js';
import { updateQueueForThisStep } from './catchupPolicy.js';

export function createAuthoritativeStepper({
  state,
  input,
  core,
  postInputPartitions,
  getSystem = null,
}) {
  const byName = typeof getSystem === 'function' ? getSystem : () => null;

  function keepalive(dt = 0, wallDt = dt) {
    runHiddenKeepalive({ state, dt, wallDt, input, getSystem: byName });
  }

  function publishBoundary(tickBoundary) {
    if (tickBoundary && typeof tickBoundary.publishInputCommand === 'function') {
      tickBoundary.publishInputCommand(
        state.input,
        state.tick,
        typeof input?.inputActivityStamp === 'function' ? input.inputActivityStamp() : null,
      );
    }
  }

  return {
    keepalive,

    step(dt, tickBoundary = null) {
      if (shouldSkipFullTickSystems(state)) {
        try {
          keepalive(dt);
        } finally {
          // A frozen registry still consumed input this step — the tick counter
          // advances and the boundary publishes exactly like production.
          state.tick += 1;
          publishBoundary(tickBoundary);
        }
        return;
      }
      if (core && typeof core.preStep === 'function') core.preStep(dt, state);
      if (input && input.update) input.update(dt, state);
      publishBoundary(tickBoundary);
      for (const s of updateQueueForThisStep(postInputPartitions, state)) {
        s.update(postInputPartitions.updateDt(s, dt, state), state);
      }
      if (core && typeof core.lifetimeSweep === 'function') core.lifetimeSweep(dt, state);
    },
  };
}
