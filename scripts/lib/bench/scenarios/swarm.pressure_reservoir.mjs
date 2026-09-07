// PQ-174.08 — after a ≥3-kill clear the Crucible room stays visibly thinner for ≥4 s,
// then a telegraphed group spends the stored pressure. Headless. Real survivalWave stream.
//
// This is not a Rapier integration: the bar is spawn timing, and survivalWave is the
// owner of reinforcement. Kills are applied the same way the stream already receipts them.

import { createBus } from '../../../../src/core/eventBus.js';
import { createGameState } from '../../../../src/core/gameState.js';
import { makeBudgetApi } from '../../../../src/systems/spawnBudget.js';
import { runSession } from '../../../../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  survivalRun,
} from '../../../../src/systems/survivalRun.js';
import { survivalWave } from '../../../../src/systems/survivalWave.js';
import { SURVIVAL_COHORT_TAG } from '../../../../src/systems/waveMaterialization.js';
import {
  SWARM_BREATH_SECONDS,
  SWARM_BREATH_TICKS,
  SWARM_CLEAR_KILLS,
  SWARM_REINFORCE_BATCH,
  SWARM_RULESET,
  bindSwarmPressureContext,
  resetSwarmPressureState,
} from '../../../../src/data/swarmMode.js';
import { swarmArena } from '../../../../src/systems/swarmArena.js';
import { measureSwarmRun } from '../swarmMetrics.mjs';

const DT = 1 / 60;
const ARENA = 'helios_core';
const BAR_ID = 'PQ-174.08';

function boot(seed) {
  resetSwarmPressureState();
  const state = createGameState(seed);
  const raw = createBus();
  const eventTrace = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      eventTrace.push({
        tick: state.tick | 0,
        type: event,
        data: payload || {},
        seconds: (state.tick | 0) / 60,
      });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  return { state, bus, helpers, ctx, player, eventTrace };
}

function liveCount(h) {
  let n = 0;
  for (const entity of h.state.entities.values()) {
    if (entity.id === h.player.id) continue;
    if (entity.alive === false) continue;
    if (entity.type && entity.type !== 'ship' && entity.type !== 'drone') continue;
    if (!(entity.data && entity.data.runCohort === SURVIVAL_COHORT_TAG)) continue;
    n += 1;
  }
  return n;
}

function killOne(h) {
  for (const entity of h.state.entities.values()) {
    if (entity.id === h.player.id) continue;
    if (entity.alive === false) continue;
    if (entity.type && entity.type !== 'ship' && entity.type !== 'drone') continue;
    if (!(entity.data && entity.data.runCohort === SURVIVAL_COHORT_TAG)) continue;
    entity.alive = false;
    h.state.entities.delete(entity.id);
    h.bus.emit('entity:destroyed', { id: entity.id });
    h.eventTrace.push({
      tick: h.state.tick | 0,
      type: 'entity:killed',
      data: { cause: 'weapon', targetId: entity.id, archetype: 'fighter' },
      seconds: (h.state.tick | 0) / 60,
    });
    return true;
  }
  return false;
}

function step(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick = (h.state.tick | 0) + 1;
    survivalWave.update(DT);
    survivalRun.update(DT);
  }
}

export const scenario = {
  id: 'swarm.pressure_reservoir',
  label: 'PQ-174.08 earned breathing room — ≥3-kill clear then ≥4 s thinner air (headless stream)',

  async run(seed) {
    const h = boot(seed);
    h.bus.emit('run:beginRequested', {
      kind: 'survival', ruleset: SWARM_RULESET, seed, arenaId: ARENA,
    });
    h.bus.emit('run:loadoutReady', {});
    step(h, 1);
    step(h, SURVIVAL_ARENA_INTRO_TICKS);
    step(h, SURVIVAL_WAVE_INTRO_TICKS);
    step(h, 40);

    const occupancyTrace = [];
    const sample = () => {
      occupancyTrace.push({
        tick: h.state.tick | 0,
        seconds: (h.state.tick | 0) / 60,
        alive: liveCount(h),
        wave: h.state.run && h.state.run.wave ? h.state.run.wave : 1,
      });
    };
    sample();
    const before = liveCount(h);
    let killed = 0;
    for (let i = 0; i < SWARM_CLEAR_KILLS; i++) {
      if (killOne(h)) killed += 1;
    }
    const afterClear = liveCount(h);
    sample();

    let peak = afterClear;
    let heldTicks = 0;
    for (let i = 0; i < SWARM_BREATH_TICKS; i++) {
      step(h, 1);
      const n = liveCount(h);
      sample();
      peak = Math.max(peak, n);
      if (n <= afterClear + 1) heldTicks += 1;
    }
    step(h, 8);
    sample();
    const afterSpend = liveCount(h);
    const telegraphs = h.eventTrace.filter((e) => e.type === 'swarm:pressureTelegraph');
    const spends = h.eventTrace.filter((e) => e.type === 'swarm:pressureSpend');
    const emptierSeconds = heldTicks / 60;
    const met = killed >= SWARM_CLEAR_KILLS
      && emptierSeconds >= SWARM_BREATH_SECONDS
      && peak <= afterClear + 1
      && telegraphs.length >= 1
      && (afterSpend >= afterClear + SWARM_REINFORCE_BATCH || spends.length >= 1);

    const swarm = measureSwarmRun({
      loadoutId: 'physics_toolkit',
      seed,
      arenaId: ARENA,
      stopReason: 'wave_target',
      simSeconds: (h.state.tick | 0) / 60,
      ticks: h.state.tick | 0,
      eventTrace: h.eventTrace,
      occupancyTrace,
    });

    swarmArena.destroy();
    bindSwarmPressureContext(null);
    resetSwarmPressureState();

    return {
      eventTrace: h.eventTrace,
      occupancyTrace,
      metrics: {
        before,
        afterClear,
        afterSpend,
        killed,
        peakDuringBreath: peak,
        emptierSeconds,
        telegraphs: telegraphs.length,
        spends: spends.length,
        clearBreathMet: swarm.clearBreath && swarm.clearBreath.met === true,
        bars: [
          {
            bar: BAR_ID,
            label: '≥3-kill clear then ≥4 s emptier space',
            value: emptierSeconds,
            unit: 's',
            met,
            note: `seed ${seed}; telegraph ${telegraphs.length}; spend ${spends.length}`,
          },
        ],
      },
    };
  },
};
