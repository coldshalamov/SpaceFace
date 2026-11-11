// PL-03 second half: a real salvor hull is commissioned from the sector's yard through the
// general-salvor dispatcher, flies to the wreck the kill left, and arrives within a minute of sim
// time; if the player takes the wreck first the scavenger turns back. Uses the real
// entity:killed payload shape from combat.js ({ id, killerId, type, pos, ... }).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  RUBBERNECKERS_SCAVENGER_EVENT,
  RUBBERNECKERS_SCAVENGER_DISPATCHED_EVENT,
  RUBBERNECKERS_SCAVENGER_TURNED_BACK_EVENT,
} from '../src/systems/rubberneckers.js';
import { traffic } from '../src/systems/traffic.js';

function ship(id, x, z, extra = {}) {
  return { id, type: 'ship', alive: true, team: 2, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, radius: 7, occupantGeneration: 1, data: { ...extra } };
}

function world({ playerTakes = false } = {}) {
  const bus = createBus();
  const player = ship('player_1', 900, 900); player.team = 0;
  const victim = ship('victim_1', 300, 0);
  const station = { id: 'station_yard', type: 'station', alive: true, pos: { x: 600, z: 0 }, radius: 50, data: { stationId: 'station_yard', name: 'Yard' } };
  const entities = new Map([[player.id, player], [victim.id, victim], [station.id, station]]);
  let spawned = 0;
  const jobs = [];
  const state = {
    mode: 'flight', simTime: 100, tick: 6000, playerId: player.id, meta: { seed: 7 },
    entities: { get: (id) => entities.get(id) || null, has: (id) => entities.has(id), values: () => entities.values(), set: (id, e) => entities.set(id, e) },
    get entityList() { return [...entities.values()]; },
    traffic: { freighters: [] },
    world: { currentSectorId: 'sector_test', sectors: {} },
  };
  const helpers = {
    spawnEntity(spec) {
      spawned += 1;
      const e = { id: `salvor_${spawned}`, type: 'ship', alive: true, team: 2, pos: { ...spec.pos }, vel: { x: 0, z: 0 }, rot: 0, radius: 7, occupantGeneration: 1, data: { ...(spec.data || {}), ai: spec.ai } };
      entities.set(e.id, e);
      return e;
    },
    npcJobs: {
      assign(entity, spec) { const id = `job_${jobs.length + 1}`; jobs.push({ entity, spec, id }); entity.data.jobId = id; return id; },
    },
  };
  traffic.init({ bus, state, helpers });
  return { bus, state, entities, player, victim, station, jobs };
}

// What combat.js emits for a ship death, and the wreck body aftermathWrecks leaves beside it.
function killVictim(w) {
  const wreck = { id: 'wreck_1', type: 'wreck', alive: true, pos: { x: w.victim.pos.x + 20, z: w.victim.pos.z + 10 }, vel: { x: 0, z: 0 }, radius: 8, data: { salvagePool: { cmdty_scrap_metal: 4 } } };
  w.entities.set(wreck.id, wreck);
  w.entities.delete(w.victim.id);
  w.bus.emit('entity:killed', { id: w.victim.id, killerId: w.player.id, type: 'ship', pos: { x: w.victim.pos.x, z: w.victim.pos.z }, factionId: 'faction_free', victimClass: 'courier' });
  return wreck;
}

function stepTo(w, t) {
  w.state.simTime = t;
  w.state.tick = Math.round(t * 60);
  traffic._stepRubberneckers(w.state);
}

test('a real salvor is commissioned from the yard and arrives at the wreck inside a minute', () => {
  const w = world();
  const events = [];
  for (const n of [RUBBERNECKERS_SCAVENGER_DISPATCHED_EVENT, RUBBERNECKERS_SCAVENGER_EVENT]) w.bus.on(n, (p) => events.push([n, p]));
  const t0 = w.state.simTime;
  const wreck = killVictim(w);
  for (let t = t0; t <= t0 + 12; t += 0.5) stepTo(w, t);
  assert.equal(w.jobs.length, 1, 'one salvor job commissioned through npcJobs.assign');
  const job = w.jobs[0];
  assert.equal(job.spec.kind, 'salvor');
  assert.equal(job.spec.route[1].id, `hulk:${wreck.id}`, 'job route ends at the wreck');
  assert.ok(w.entities.get(job.entity.id), 'the salvor is a real entity');
  const dispatched = events.find(([n]) => n === RUBBERNECKERS_SCAVENGER_DISPATCHED_EVENT);
  assert.ok(dispatched, 'dispatch announced');
  assert.equal(dispatched[1].scavengerId, job.entity.id);
  assert.equal(events.some(([n]) => n === RUBBERNECKERS_SCAVENGER_EVENT), false, 'not there yet');
  // Fly the hull: it leaves the yard for the wreck (job runtime owns real motion).
  const hull = job.entity;
  for (let t = t0 + 12; t <= t0 + 55; t += 0.5) {
    const f = Math.min(1, (t - (t0 + 12)) / 30);
    hull.pos.x = 600 + (wreck.pos.x - 600) * f;
    hull.pos.z = wreck.pos.z * f;
    stepTo(w, t);
  }
  const arrived = events.find(([n]) => n === RUBBERNECKERS_SCAVENGER_EVENT);
  assert.ok(arrived, 'scavenger arrived');
  assert.ok(arrived[1].t - t0 < 60, 'inside a minute of sim time');
  assert.equal(arrived[1].scavengerId, hull.id);
  assert.equal(arrived[1].bodyId, wreck.id);
});

test('if the player took the wreck first the scavenger turns back', () => {
  const w = world();
  const events = [];
  for (const n of [RUBBERNECKERS_SCAVENGER_EVENT, RUBBERNECKERS_SCAVENGER_TURNED_BACK_EVENT]) w.bus.on(n, (p) => events.push([n, p]));
  const t0 = w.state.simTime;
  const wreck = killVictim(w);
  for (let t = t0; t <= t0 + 12; t += 0.5) stepTo(w, t);
  assert.equal(w.jobs.length, 1);
  // The player cuts the wreck empty before the salvor arrives.
  wreck.data.salvagePool = {};
  for (let t = t0 + 12; t <= t0 + 14; t += 0.5) stepTo(w, t);
  assert.ok(events.some(([n]) => n === RUBBERNECKERS_SCAVENGER_TURNED_BACK_EVENT), 'turned back');
  assert.equal(events.some(([n]) => n === RUBBERNECKERS_SCAVENGER_EVENT), false, 'never arrived');
});
