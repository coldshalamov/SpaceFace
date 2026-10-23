// W1-F: a notice raised by the wall clock must not reach simulation state. The physics stall line,
// the retail error line and the slow-frame offer used to ride the shared bus as `toast`, and the
// "Two ships, one mistake" encounter sampled its adhesive film on EVERY toast - so a failed physics
// start could change encounter state by host speed (1 ms/tick vs 17 ms/tick gave different vars).
// Two fixes are pinned here: the three notices no longer touch the bus, and the encounter only
// listens for the film's own lines.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { ADHESIVE_LINES } from '../src/data/reactiveMatter/adhesive.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { economy } from '../src/systems/economy.js';
import { reactiveMatter } from '../src/systems/reactiveMatter.js';

const SEED = 4242;
const SECTOR = 'sector_tethys_junction';
const SHAPE = 'two_ships_one_mistake';

function stubClock(t) {
  const clock = { t: 5000 };
  const had = Object.prototype.hasOwnProperty.call(performance, 'now');
  const saved = had ? Object.getOwnPropertyDescriptor(performance, 'now') : null;
  Object.defineProperty(performance, 'now', { value: () => clock.t, configurable: true, writable: true });
  t.after(() => {
    if (saved) Object.defineProperty(performance, 'now', saved);
    else delete performance.now;
  });
  return clock;
}

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [physics, reactiveMatter, encounterDirector, economy] });
  const { state } = sim;
  const player = sim.spawn({
    type: 'ship', isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 3, mass: 16, hull: 100, hullMax: 100,
    data: {},
  });
  state.playerId = player.id;
  state.mode = 'flight';
  state.timeScale = 1;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.world.currentSectorId = SECTOR;
  state.world.activeSector = {
    stations: [{ id: 'station_tethys', name: 'Tethys Trade Hub', pos: { x: 400, z: 0 } }],
    pois: [],
  };
  return { sim, state, bus: sim.bus, phys: sim.registry.get('physics'), director: sim.registry.get('encounterDirector') };
}

// Start the job, then run it for `ticks` live-flight ticks with the flight authority failing to start,
// at `msPerTick` of wall time each. Returns what a host-speed difference could have moved.
async function playStalledJob(t, msPerTick, ticks) {
  const clock = stubClock(t);
  const rig = boot();
  const stalled = [];
  const busToasts = [];
  rig.bus.on('physics:authorityStalled', (p) => stalled.push(p));
  rig.bus.on('toast', (p) => busToasts.push(p));
  rig.phys._sg02OwnerFactory = () => Promise.reject(new Error('rapier init failed (test)'));

  // A distinct id per run: the encounter's film watch is keyed by id at module level.
  const encounterId = 'debug:mistake:w1f-' + msPerTick;
  const forced = rig.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId, sectorId: SECTOR, anchor: { x: 0, z: 0 }, force: true,
  });
  assert.equal(forced.ok, true, JSON.stringify(forced));
  rig.bus.emit('encounter:choose', { encounterId, choiceId: 'take' });
  const live = () => rig.state.encounterDirector.live[encounterId];
  assert.equal(live().phase, 'work', 'the job is live');

  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let i = 0; i < ticks; i += 1) {
      clock.t += msPerTick;
      rig.sim.step(SIM_DT);
      // Let the rejected init settle so the next tick can retry, as it does between real frames.
      await Promise.resolve();
      await Promise.resolve();
      if (i === 12) {
        // The film spoke while the bridge formed. Clear what it recorded, so the only thing left that
        // could move the vars is a notice raised by the wall clock.
        delete live().vars.sawLive;
        delete live().vars.severed;
      }
    }
  } finally {
    console.warn = warn;
  }
  const result = {
    vars: JSON.stringify(live().vars),
    phase: live().phase,
    tick: rig.state.tick,
    stalled: stalled.length,
    busToasts: busToasts.filter((row) => /Flight systems/.test(row.text || '')).length,
  };
  rig.sim.dispose();
  return result;
}

test('a physics stall at two host speeds leaves the encounter state identical', async (t) => {
  const fast = await playStalledJob(t, 1, 260);
  const slow = await playStalledJob(t, 17, 260);
  assert.equal(fast.stalled, 0, 'a fast host never reaches the 3 s stall window');
  assert.equal(slow.stalled, 1, 'a slow host does: the notice really fires in this scene');
  assert.equal(fast.tick, slow.tick);
  assert.equal(slow.vars, fast.vars, 'encounter vars do not depend on host speed');
  assert.equal(slow.phase, fast.phase);
  assert.equal(slow.busToasts, 0, 'and the notice is not a bus toast');
});

test('the film is sampled on its own lines only, never on an unrelated toast', () => {
  const rig = boot();
  const encounterId = 'debug:mistake:film';
  assert.equal(rig.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId, sectorId: SECTOR, anchor: { x: 0, z: 0 }, force: true,
  }).ok, true);
  rig.bus.emit('encounter:choose', { encounterId, choiceId: 'take' });
  const live = rig.state.encounterDirector.live[encounterId];
  rig.sim.runTicks(8);
  assert.equal(live.phase, 'work');
  // The film already spoke while the bridge formed; clear what it recorded so the probe is clean.
  delete live.vars.sawLive;
  delete live.vars.severed;
  const before = JSON.stringify(live.vars);

  for (const text of [
    'Flight systems are still starting. If your ship stays still, reload the game.',
    'Something went wrong, and the error was logged. If the game stops responding, reload it.',
    'SpaceFace is running slowly on this device. Switch to the Performance preset?',
    'Progress saved',
  ]) rig.bus.emit('toast', { text, kind: 'warn', ttl: 4 });
  rig.bus.emit('toast', { kind: 'info' });
  rig.bus.emit('toast', null);
  assert.equal(JSON.stringify(live.vars), before, 'unrelated toasts move nothing');

  // The film's own line still samples the live bridge (the behaviour the watch was written for).
  rig.bus.emit('toast', { text: ADHESIVE_LINES.bridged, kind: 'info', ttl: 4 });
  assert.equal(live.vars.sawLive, true, 'a film notice records that the bridge was seen alive');
  rig.sim.dispose();
});
