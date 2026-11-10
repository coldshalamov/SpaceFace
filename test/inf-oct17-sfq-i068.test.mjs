// SFQ-I068 — after the first visit latches arrival beats, leaving past the long
// band and coming back once the site's life stage has changed speaks once.
// Quiet Ice is an ordinary site (not the garden, not the collar). Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32 } from '../src/core/rng.js';
import {
  deserializeAlienEcologyState,
  serializeAlienEcologyState,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';

const site = ALIEN_SITES.quiet_ice;
const AWAY = site.arrivalBands.long + 150;
const MID = (site.arrivalBands.mid + site.arrivalBands.close) / 2;

function pack(distance) {
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    tick: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {} } },
    rng: mulberry32(4242),
    world: {
      currentSectorId: site.sectorId,
      sectors: {},
      rng: mulberry32(4242),
    },
  };
  const events = [];
  const player = {
    id: 1, type: 'player', alive: true,
    pos: { x: site.center.x + distance, z: site.center.z },
    vel: { x: 0, z: 0 },
    data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  const world = {
    state,
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, payload) => events.push({ type, payload }) },
    helpers: { spawnEntity() { return null; }, removeEntity() {} },
  };
  return { state, world, events, player };
}

function record(state) {
  return ensureAlienEcologyState(state).sites[site.siteId];
}

function stageReturns(events) {
  return events.filter((e) => e.type === 'comms:log' && e.payload
    && typeof e.payload.text === 'string'
    && e.payload.text.includes('return pass'));
}

function move(pack, distance) {
  pack.player.pos.x = site.center.x + distance;
  pack.player.pos.z = site.center.z;
}

function step(pack, n = 1) {
  for (let i = 0; i < n; i += 1) {
    pack.state.simTime += 0.5;
    pack.state.tick += 1;
    tickAlienEcology(pack.world, 0.5);
  }
}

test('a stage change speaks once on the return and the latch survives a reload', () => {
  const live = pack(0);
  step(live, 1);
  const rec = record(live.state);
  assert.equal(rec.state, 'dormant');
  assert.equal(rec.beats.long, true);
  assert.equal(rec.beats.mid, true);
  assert.equal(rec.beats.close, true);
  assert.equal(stageReturns(live.events).length, 0, 'the first visit is the arrival beats, not a return');

  rec.state = 'awake';
  step(live, 5);
  assert.equal(stageReturns(live.events).length, 0, 'changing stage while still inside stays quiet');

  move(live, AWAY);
  step(live, 2);
  assert.equal(stageReturns(live.events).length, 0, 'leaving past the long band stays quiet');

  move(live, MID);
  step(live, 1);
  const awake = stageReturns(live.events);
  assert.equal(awake.length, 1, 're-entering the mid band speaks once');
  assert.equal(awake[0].payload.from, site.name);
  assert.equal(awake[0].payload.text.includes(site.name), true);
  assert.equal(awake[0].payload.text.includes('awake'), true);
  assert.equal(awake[0].payload.text.includes(site.siteId), false);
  assert.equal(rec.returnStageSeen, 'awake');

  step(live, 6);
  assert.equal(stageReturns(live.events).length, 1, 'remaining inside the site does not repeat the line');

  const saved = serializeAlienEcologyState(live.state);
  const loaded = pack(MID);
  deserializeAlienEcologyState(loaded.state, saved);
  assert.equal(record(loaded.state).returnStageSeen, 'awake');
  step(loaded, 4);
  assert.equal(stageReturns(loaded.events).length, 0, 'a reloaded visit inside the site stays quiet');
  assert.equal(record(loaded.state).returnStageSeen, 'awake');

  move(live, AWAY);
  step(live, 1);
  move(live, MID);
  step(live, 3);
  assert.equal(stageReturns(live.events).length, 1, 'the same stage does not speak again');

  move(live, AWAY);
  rec.state = 'bloom';
  step(live, 1);
  move(live, MID);
  step(live, 1);
  const bloom = stageReturns(live.events).filter((e) => e.payload.text.includes('bloom'));
  assert.equal(bloom.length, 1, 'a later bloom speaks once on the next return');
  assert.equal(bloom[0].payload.text.includes(site.name), true);
  assert.equal(bloom[0].payload.text.includes(site.siteId), false);
  assert.equal(rec.returnStageSeen, 'bloom');
  step(live, 4);
  assert.equal(stageReturns(live.events).filter((e) => e.payload.text.includes('bloom')).length, 1);

  move(live, AWAY);
  rec.state = 'severed';
  step(live, 1);
  move(live, MID);
  step(live, 1);
  const severed = stageReturns(live.events).filter((e) => e.payload.text.includes('severed'));
  assert.equal(severed.length, 1, 'a severed site speaks once on the next return');
  assert.equal(severed[0].payload.text.includes(site.name), true);
  assert.equal(severed[0].payload.text.includes(site.siteId), false);
  assert.equal(rec.returnStageSeen, 'severed');
  step(live, 4);
  assert.equal(stageReturns(live.events).filter((e) => e.payload.text.includes('severed')).length, 1);
  assert.equal(stageReturns(live.events).length, 3, 'one line for each stage, none repeated');
});

test('a dormant return and a first arrival at an already-awake site stay quiet', () => {
  const dormant = pack(0);
  step(dormant, 1);
  assert.equal(record(dormant.state).beats.mid, true);
  move(dormant, AWAY);
  step(dormant, 1);
  move(dormant, MID);
  step(dormant, 4);
  assert.equal(record(dormant.state).state, 'dormant');
  assert.equal(stageReturns(dormant.events).length, 0, 'leaving and returning while dormant stays quiet');
  assert.equal(record(dormant.state).returnStageSeen, undefined);

  const first = pack(AWAY);
  step(first, 1);
  const rec = record(first.state);
  assert.equal(rec.beats.long, undefined);
  rec.state = 'awake';
  step(first, 1);
  move(first, MID);
  step(first, 3);
  assert.equal(rec.beats.mid, true, 'the first arrival still latches the mid beat');
  assert.equal(stageReturns(first.events).length, 0, 'the first arrival is not a return');
  assert.equal(rec.returnStageSeen, undefined);
});
