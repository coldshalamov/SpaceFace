/**
 * Fair portable microbench: registry.step dispatcher residual.
 * Master-shaped combat island with expensive quiet early-outs on owners this
 * package lifts off the 60 Hz island, vs content-gated + calendar quiet queue.
 */
import {
  PRODUCTION_UPDATE_ORDER,
  getContentGate,
  getSystemClock,
} from '/workspace/spaceface-scratch/registry-step-20260924f/src/runtime/authoritativeSystemManifest.js';
import {
  partitionUpdateSystems,
  updateQueueForThisStep,
  contentWakeMask,
} from '/workspace/spaceface-scratch/registry-step-20260924f/src/core/catchupPolicy.js';

const CALENDAR_MOVES = new Set([
  'chronicler', 'difficultyDirector', 'titles', 'npcJobsRuntime', 'traffic',
]);
const PACKAGE_IDS = new Set([
  ...CALENDAR_MOVES,
  ...PRODUCTION_UPDATE_ORDER.filter((id) => getContentGate(id)),
]);

function expensiveIdle(state, name) {
  if (state.mode !== 'flight') return;
  for (let k = 0; k < 8; k++) {
    const player = state.player;
    if (player) {
      void player.tether; void player.heat;
      const tel = player.masslineTelemetry; if (tel) void tel.active;
    }
    const run = state.run; if (run) void run.phase;
    const world = state.world; if (world) void world.currentSectorId;
    state._sink = ((state._sink | 0) + name.length + k + (state.tick | 0)) | 0;
  }
}
function thinIdle(state) {
  state._sink = ((state._sink | 0) + 1) | 0;
}

const masterCombatNames = PRODUCTION_UPDATE_ORDER.slice(1).filter((id) => {
  if (CALENDAR_MOVES.has(id)) return true;
  return getSystemClock(id) !== 'calendar';
});
const masterSystems = masterCombatNames.map((name) => ({
  name,
  update(_dt, state) {
    if (PACKAGE_IDS.has(name)) expensiveIdle(state, name);
    else thinIdle(state);
  },
}));
const afterSystems = PRODUCTION_UPDATE_ORDER.slice(1).map((name) => ({
  name,
  update(_dt, state) {
    if (PACKAGE_IDS.has(name)) expensiveIdle(state, name);
    else thinIdle(state);
  },
}));
const partitions = partitionUpdateSystems(afterSystems);

function makeQuiet(sector) {
  return {
    mode: 'flight', tick: 100, simTime: 10,
    runtime: { profileId: 'production' }, simCatchupIndex: 0,
    run: { phase: 'inactive' },
    stationServices: { player: {} },
    automation: { fleet: [] },
    player: {
      tether: null, heat: null,
      masslineTelemetry: { active: false },
      masslineThreats: { active: false },
      remoteMassline: { active: false },
      masslineThrow: { active: false },
    },
    world: { currentSectorId: sector },
    planet: { active: false },
    capitalBossEncounters: { fights: {}, orders: {} },
    massline2: { cloak: { active: false, energy: 1 } },
    input: { actions: {} },
  };
}

function dispatchMaster(state, iters) {
  const dt = 1 / 60;
  for (let i = 0; i < iters; i++) {
    state.tick = 91 + (i % 29);
    for (let j = 0; j < masterSystems.length; j++) masterSystems[j].update(dt, state);
  }
}
function dispatchAfter(state, iters) {
  const dt = 1 / 60;
  for (let i = 0; i < iters; i++) {
    state.tick = 91 + (i % 29);
    const q = updateQueueForThisStep(partitions, state);
    for (let j = 0; j < q.length; j++) q[j].update(dt, state);
  }
}

function time(fn) {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

const iters = 60000;
const rows = [];
for (const sector of ['sector_ceres_belt', 'sector_deep_black']) {
  const quiet = makeQuiet(sector);
  partitions._wake = -1;
  const quietLen = updateQueueForThisStep(partitions, quiet).length;
  dispatchMaster(quiet, 2000);
  dispatchAfter(quiet, 2000);
  const baseMs = time(() => dispatchMaster(quiet, iters));
  partitions._wake = -1;
  const afterMs = time(() => dispatchAfter(quiet, iters));
  rows.push({
    sector,
    masterCombat: masterSystems.length,
    quietLen,
    wake: contentWakeMask(quiet),
    baseMs: +baseMs.toFixed(3),
    afterMs: +afterMs.toFixed(3),
    speedup: +(baseMs / afterMs).toFixed(3),
  });
}

const out = {
  schema: 'spaceface.registry-step-dispatch-microbench.v1',
  iters,
  packageIds: [...PACKAGE_IDS].sort(),
  rows,
  headline: {
    ceresSpeedup: rows[0].speedup,
    deepSpeedup: rows[1].speedup,
  },
};
console.log(JSON.stringify(out, null, 2));
