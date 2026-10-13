// SFQ-I047 — entity:killed has two bark listeners. One death speaks once.
// A later, different death still speaks after the normal ambient gap.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { barkDirector, AMBIENT_BASE_GAP_S } from '../src/systems/barkDirector.js';

const SEED = 4242;

function boot() {
  const bus = createBus();
  const entities = new Map();
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: 1,
    entities,
    entityList: [],
    meta: { seed: SEED },
    world: {},
    story: { titles: { byId: {} } },
    settings: { audio: {}, accessibility: {} },
    heat: { wanted: false, level: 0, fines: 0 },
    law: { fines: 0, citations: [] },
  };
  const add = (spec) => {
    const entity = {
      id: spec.id,
      type: spec.type || 'ship',
      team: spec.team ?? 1,
      alive: true,
      factionId: spec.factionId || 'faction_dmc',
      pos: { x: spec.x ?? 40, z: 0 },
      vel: { x: 0, z: 0 },
      data: spec.data || {},
    };
    entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  add({ id: 1, type: 'ship', team: 0, x: 0, z: 0 });
  const says = [];
  const voice = { say: (req) => { says.push(req); return true; } };
  const system = Object.assign({}, barkDirector);
  system.init({ state, bus, helpers: { voice } });
  return { bus, state, add, says, system };
}

function kill(h, entity) {
  entity.alive = false;
  h.bus.emit('entity:killed', {
    id: entity.id,
    killerId: h.state.playerId,
    type: entity.type,
    pos: { x: entity.pos.x, z: entity.pos.z },
    factionId: entity.factionId,
    targetHostileToPlayer: true,
  });
}

function barks(h) {
  return h.says.filter((line) => line.channel === 'bark');
}

test.afterEach(() => { barkDirector.destroy(); });

test('one kill receipt barks once; a later distinct kill still barks', () => {
  const h = boot();
  const keel = h.add({
    id: 40,
    data: { cargoManifest: { ownerId: 'lane_mira_bluepack', ownerName: 'Mira Bluepack', role: 'civilian' } },
  });
  kill(h, keel);
  const first = barks(h);
  assert.equal(first.length, 1);
  assert.match(first[0].text, /Mira Bluepack/);

  h.state.simTime += AMBIENT_BASE_GAP_S;
  h.state.tick += 1;
  const mio = h.add({
    id: 41,
    data: { cargoManifest: { ownerId: 'lane_kess_span', ownerName: 'Kess of the Span', role: 'civilian' } },
  });
  kill(h, mio);
  const second = barks(h).slice(first.length);
  assert.equal(second.length, 1);
  assert.match(second[0].text, /Kess of the Span/);
});

test('a kill with no named cargo still speaks its distress line', () => {
  const h = boot();
  const victim = h.add({ id: 42, factionId: 'faction_scn' });
  kill(h, victim);
  const lines = barks(h);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'barkDirector');
});
