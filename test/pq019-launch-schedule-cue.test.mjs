// PQ-019A — player-visible launch schedule cue.
//
// The owner already produced deterministic schedule receipts; these tests pin the part the PLAYER
// can perceive: which sim moments become spoken lines, that they are bounded rather than per-frame,
// that they occupy exactly one voice floor, and that none of it touches the simulation.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import {
  PQ019_LAUNCH_CUE_CHANNEL,
  PQ019_LAUNCH_CUE_TMINUS_S,
  PQ019_LAUNCH_CUE_VOICE_ID,
  crossedLaunchCueTMinus,
  heistFacilities,
  launchCueAwayText,
  launchCueTextForTMinus,
} from '../src/systems/heistFacilities.js';
import { CHANNEL_PRIORITY, voiceArbiter } from '../src/ui/voiceArbiter.js';
import { PQ019_FACILITIES, PQ019_HEIST_SECTOR_ID } from '../src/data/heistFacilities.js';

function boot(seed = 19026) {
  const bus = createBus();
  const sim = createSimulation({
    seed,
    bus,
    // voiceArbiter last: a cue said during heistFacilities.update reaches the floor the same tick.
    systems: [physics, world, heistFacilities, voiceArbiter],
  });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    radius: 12,
    mass: 24,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  const cues = [];
  const surfaced = [];
  const cleared = [];
  bus.on('heist:launchCue', (payload) => cues.push(payload));
  bus.on('voice:surface', (payload) => surfaced.push(payload));
  bus.on('voice:clear', (payload) => cleared.push(payload));
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  return {
    sim,
    state,
    bus,
    player,
    cues,
    surfaced,
    cleared,
    system: sim.registry.get('heistFacilities'),
    arbiter: sim.registry.get('voiceArbiter'),
  };
}

// Advance the owner's clock by hand, one fixed step at a time, without paying for physics on a
// 35-second window. This drives the exact production update() entry point.
function driveWindow(t, seconds, { onStep } = {}) {
  const steps = Math.round(seconds / SIM_DT);
  for (let index = 0; index < steps; index++) {
    t.state.simTime += SIM_DT;
    t.state.tick = (t.state.tick | 0) + 1;
    t.system.update(SIM_DT, t.state);
    if (onStep) onStep(index);
  }
}

function moments(cues) {
  return cues.map((cue) => cue.moment);
}

test('crossedLaunchCueTMinus is a pure, total, edge-exact threshold detector', () => {
  // Nothing crossed: the interval sits strictly between two authored moments.
  assert.equal(crossedLaunchCueTMinus(100, 78, 79), null);
  // Half-open (prev, now]: the crossing tick is the one that lands ON the moment.
  assert.equal(crossedLaunchCueTMinus(100, 69.9, 70), 30);
  assert.equal(crossedLaunchCueTMinus(100, 70, 70.1), null, 'a moment fires once, not again after');
  assert.equal(crossedLaunchCueTMinus(100, 84.9, 85), 15);
  assert.equal(crossedLaunchCueTMinus(100, 94.9, 95), 5);
  // A single long frame stepping over several moments reports the reading closest to launch —
  // never a stale earlier one, and never a moment the clock has not actually reached.
  // launchAt 100 puts the moments at t=70 (T-30), t=85 (T-15) and t=95 (T-5).
  assert.equal(crossedLaunchCueTMinus(100, 60, 96), 5, 'all three crossed -> the freshest');
  assert.equal(crossedLaunchCueTMinus(100, 60, 86), 15, 'T-5 not yet reached at t=86');
  assert.equal(crossedLaunchCueTMinus(100, 60, 80), 30, 'only T-30 has been reached at t=80');
  // A clock that did not advance cannot cross anything, so a paused frame stays silent.
  assert.equal(crossedLaunchCueTMinus(100, 70, 70), null);
  assert.equal(crossedLaunchCueTMinus(100, 71, 70), null, 'a rewound clock never re-fires');
  // Total on hostile input.
  for (const bad of [NaN, Infinity, undefined, null, 'x']) {
    assert.equal(crossedLaunchCueTMinus(bad, 0, 1), null);
    assert.equal(crossedLaunchCueTMinus(100, bad, 1), null);
    assert.equal(crossedLaunchCueTMinus(100, 0, bad), null);
  }
});

test('a full schedule window speaks every authored moment exactly once and never per-frame', () => {
  const t = boot();
  const launchAtSimT = t.state.simTime + 32;
  t.system.requestLaunchSchedule({ scheduleId: 'pq019a-cue-window', launchAtSimT });

  driveWindow(t, 35);

  assert.deepEqual(
    moments(t.cues),
    ['t_minus_30', 't_minus_15', 't_minus_5', 'away'],
    'the countdown is the three authored thresholds plus the away line, in order',
  );
  // ~2100 update() calls produced 4 lines: the cue is moment-bound, not frame-bound.
  assert.equal(t.cues.length, PQ019_LAUNCH_CUE_TMINUS_S.length + 1);

  for (const [index, tMinus] of PQ019_LAUNCH_CUE_TMINUS_S.entries()) {
    assert.equal(t.cues[index].tMinusS, tMinus);
    assert.equal(t.cues[index].text, launchCueTextForTMinus(tMinus));
    assert.match(t.cues[index].text, new RegExp(`${tMinus}s`), 'remaining time is stated in words');
  }
  const away = t.cues.at(-1);
  assert.equal(away.tMinusS, 0);
  assert.equal(away.text, launchCueAwayText());
  assert.ok(
    away.text.includes(PQ019_FACILITIES.lawful_catcher.name),
    'the away line names where the capsule is headed',
  );

  // Cue ids are stable and unique per moment, so a consumer can dedupe without wall time.
  const cueIds = t.cues.map((cue) => cue.cueId);
  assert.equal(new Set(cueIds).size, cueIds.length);
  for (const cue of t.cues) {
    assert.equal(cue.scheduleId, 'pq019a-cue-window');
    assert.equal(cue.source, 'heistFacilities');
    assert.equal(cue.voiceId, PQ019_LAUNCH_CUE_VOICE_ID);
    assert.equal(cue.channel, PQ019_LAUNCH_CUE_CHANNEL);
    assert.ok(Object.isFrozen(cue));
  }

  // The schedule really did resolve into a physical capsule, so the cue described a real event.
  assert.equal(t.state.heistFacilities.schedule.status, 'launched');
});

test('the countdown holds exactly one voice floor and never competes with itself', () => {
  const t = boot(19027);
  t.system.requestLaunchSchedule({
    scheduleId: 'pq019a-cue-onevoice',
    launchAtSimT: t.state.simTime + 32,
  });

  let maxQueueSize = 0;
  driveWindow(t, 35, {
    onStep: () => {
      t.arbiter.update(SIM_DT, t.state);
      maxQueueSize = Math.max(maxQueueSize, t.arbiter.queue.size);
    },
  });

  assert.ok(t.surfaced.length > 0, 'the cue actually reached the one-voice floor');
  assert.equal(maxQueueSize, 1, 'the countdown never stacks a second entry against itself');

  // Every surfaced line is this cue, on the objective tier, under one stable presentation id.
  const cueTexts = new Set(t.cues.map((cue) => cue.text));
  for (const entry of t.surfaced) {
    assert.equal(entry.id, PQ019_LAUNCH_CUE_VOICE_ID, 'one stable id for the whole countdown');
    assert.equal(entry.channel, PQ019_LAUNCH_CUE_CHANNEL);
    assert.equal(entry.priority, CHANNEL_PRIORITY.objective);
    assert.ok(entry.priority < CHANNEL_PRIORITY.alert, 'a schedule cue never claims the danger tier');
    assert.ok(cueTexts.has(entry.text));
  }
  // Retractions are paired to the same id, so no presenter can be left holding a stale pill.
  for (const entry of t.cleared) assert.equal(entry.id, PQ019_LAUNCH_CUE_VOICE_ID);
});

test('entering mid-window speaks only the moments still ahead, and leaving cannot replay them', () => {
  const mid = boot(19028);
  // Seven seconds out: T-30 and T-15 are already in the past and must stay unspoken.
  mid.system.requestLaunchSchedule({
    scheduleId: 'pq019a-cue-midwindow',
    launchAtSimT: mid.state.simTime + 7,
  });
  driveWindow(mid, 9);
  assert.deepEqual(moments(mid.cues), ['t_minus_5', 'away'], 'no catch-up backlog is replayed');

  const away = boot(19029);
  away.system.requestLaunchSchedule({
    scheduleId: 'pq019a-cue-reentry',
    launchAtSimT: away.state.simTime + 32,
  });
  driveWindow(away, 20);                                   // hears T-30 and T-15
  assert.deepEqual(moments(away.cues), ['t_minus_30', 't_minus_15']);

  // Leave Tethys and keep the clock running: an absent player is not announced to.
  away.sim.registry.get('world').enterSector('sector_helios_prime', { placePlayer: false });
  driveWindow(away, 5);
  assert.deepEqual(moments(away.cues), ['t_minus_30', 't_minus_15'], 'cues are sector-local');
  assert.equal(away.state.heistFacilities.schedule.status, 'scheduled', 'the schedule is preserved');

  // Return with 7 s left: the passed thresholds stay passed.
  away.sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID, { placePlayer: false });
  driveWindow(away, 9);
  assert.deepEqual(
    moments(away.cues),
    ['t_minus_30', 't_minus_15', 't_minus_5', 'away'],
    're-entry resumes the countdown instead of restarting it',
  );
});

test('the cue is sim-inert: it spawns nothing, mutates nothing, and is silent without a presenter', () => {
  const t = boot(19030);
  const cargoBefore = structuredClone(t.state.player.cargo);
  const creditsBefore = t.state.player.credits;

  t.system.requestLaunchSchedule({
    scheduleId: 'pq019a-cue-inert',
    launchAtSimT: t.state.simTime + 32,
  });
  const entitiesAtSchedule = t.state.entityList.filter((entity) => entity?.alive !== false).length;

  // Stop just short of launch so the only thing that happened is three spoken lines.
  driveWindow(t, 30);
  assert.deepEqual(moments(t.cues), ['t_minus_30', 't_minus_15', 't_minus_5']);
  assert.equal(
    t.state.entityList.filter((entity) => entity?.alive !== false).length,
    entitiesAtSchedule,
    'speaking the countdown creates and destroys no entity',
  );
  assert.deepEqual(t.state.player.cargo, cargoBefore);
  assert.equal(t.state.player.credits, creditsBefore);
  assert.equal(t.state.heistFacilities.schedule.status, 'scheduled');
  // No cue cursor is persisted anywhere in owner state: the publisher is stateless by construction.
  assert.deepEqual(
    Object.keys(t.state.heistFacilities.schedule).sort(),
    ['capsuleEntityId', 'launchAtSimT', 'launchedAtTick', 'receipt', 'scheduleId', 'status'],
    'the cue adds no schedule field, and therefore no save key',
  );

  // Without voiceArbiter there is no helpers.voice; the same window must run silently, not throw.
  const headless = createSimulation({
    seed: 19031,
    bus: createBus(),
    systems: [physics, world, heistFacilities],
  });
  headless.state.mode = 'flight';
  const solo = headless.registry.get('heistFacilities');
  assert.equal(headless.registry.ctx.helpers.voice, undefined, 'no presenter is registered');
  headless.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  const soloCues = [];
  headless.bus.on('heist:launchCue', (payload) => soloCues.push(payload));
  solo.requestLaunchSchedule({
    scheduleId: 'pq019a-cue-headless',
    launchAtSimT: headless.state.simTime + 32,
  });
  for (let index = 0; index < Math.round(35 / SIM_DT); index++) {
    headless.state.simTime += SIM_DT;
    headless.state.tick = (headless.state.tick | 0) + 1;
    solo.update(SIM_DT, headless.state);
  }
  assert.deepEqual(
    moments(soloCues),
    ['t_minus_30', 't_minus_15', 't_minus_5', 'away'],
    'the owner receipt is host-independent even when nothing can present it',
  );
});

test('the cue rides the real fixed-timestep route end to end', async () => {
  const t = boot(19032);
  // A short authored window so the whole path runs under real physics: schedule -> T-5 -> away.
  t.system.requestLaunchSchedule({
    scheduleId: 'pq019a-cue-live',
    launchAtSimT: t.state.simTime + 6,
  });
  for (let index = 0; index < Math.round(7 / SIM_DT); index++) t.sim.step(SIM_DT);

  assert.deepEqual(moments(t.cues), ['t_minus_5', 'away']);
  assert.equal(t.state.heistFacilities.schedule.status, 'launched');
  const capsules = t.state.entityList.filter((entity) => (
    entity?.alive !== false && entity.data?.heistFacilityRole === 'cargo_capsule'
  ));
  assert.equal(capsules.length, 1, 'the announced capsule is the one that physically exists');
  assert.ok(
    t.surfaced.some((entry) => entry.text === launchCueAwayText()),
    'the away line reached the player through the ordinary update loop',
  );
});
