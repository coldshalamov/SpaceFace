// Bake-time only. The shipping title reads the generated tape, never this world.
// Four deterministic 15-second encounters demonstrate the real tether/field verbs.
import { createTitleVerbScenario, TITLE_VERB_SCENARIO } from '../testing/lab/titleVerbScenario.js';
import { SIM_DT } from '../core/sim.js';
export const TITLE_ATTRACT_SEED = TITLE_VERB_SCENARIO.seed;
export async function createTitleAttractWorld(options = {}) {
  const scenario = await createTitleVerbScenario(options);
  const { sim, state } = scenario;
  let started = false, disposed = false, acc = 0, fired = 0;
  sim.bus.on('entity:spawned', (p) => { if (p?.type === 'projectile') fired++; });
  return {
    sim, state, scenario,
    get started() { return started; }, get disposed() { return disposed; },
    get running() { return started && !disposed; }, get tick() { return state.tick; },
    get alpha() { return acc / SIM_DT; },
    start() { if (!disposed) started = true; },
    advance(dt = 0) {
      if (!started || disposed) return 0;
      acc = Math.min(acc + Math.max(0, Number(dt) || 0), SIM_DT * 4.999);
      let n = 0;
      while (acc >= SIM_DT && n < 4) { scenario.step(); acc -= SIM_DT; n++; }
      return n;
    },
    runTicks(n) {
      if (started && !disposed) for (let i = 0; i < n; i++) scenario.step();
      acc = 0; return state;
    },
    sample() {
      return state.entityList.filter((e) => e.alive && e.pos).map((e) => ({
        id: e.id, type: e.type, x: e.pos.x, z: e.pos.z, rot: e.rot, team: e.team,
      }));
    },
    counts() {
      return { tick: state.tick, ships: state.entityList.filter((e) => e.alive && e.type === 'ship').length,
        fired, catches: scenario.events.filter((e) => e.kind === 'catch').length,
        releases: scenario.events.filter((e) => e.kind === 'release').length,
        impacts: scenario.events.filter((e) => e.kind === 'impact').length,
        fields: scenario.events.filter((e) => e.kind === 'field').length };
    },
    dispose() { if (!disposed) { disposed = true; started = false; scenario.dispose(); } },
  };
}
