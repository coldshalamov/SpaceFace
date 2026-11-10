import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import {
  deserializeAlienEcologyState,
  serializeAlienEcologyState,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';

const deep = ALIEN_SITES.harvest_deep;
// Inside the 560-unit arrival band, outside the separate 300-unit chorus setpiece.
const closePoint = { x: deep.center.x + 400, z: deep.center.z };

function worldAt(pos = closePoint) {
  const player = {
    id: 1, type: 'player', alive: true, pos: { ...pos }, vel: { x: 0, z: 0 },
    data: { fittings: [] },
  };
  const state = {
    meta: { seed: 4242 }, simTime: 0, tick: 0, rng: mulberry32(4242),
    playerId: player.id, entities: new Map([[player.id, player]]), entityList: [player],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0 } },
    world: { currentSectorId: deep.sectorId, sectors: {} },
  };
  const events = [];
  const world = {
    state,
    _toGlobal: (local) => ({ ...local }),
    _toLocal: (point) => ({ ...point }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, payload) => events.push({ type, payload }) },
    helpers: { spawnEntity() { return null; }, removeEntity() {} },
  };
  return { state, world, player, events };
}

function tick(pack) {
  pack.state.simTime += 1 / 60;
  pack.state.tick += 1;
  tickAlienEcology(pack.world, 1 / 60);
}

function deepLogs(pack) {
  return pack.events.filter((event) => event.type === 'comms:log'
    && event.payload.text.includes('DEEP-TRACE evidence logged'));
}

test('close arrival files deep-trace evidence with its site and readable knowledge', () => {
  const pack = worldAt();
  tick(pack);
  const ae = ensureAlienEcologyState(pack.state);
  assert.ok(ae.evidence.P01, 'close arrival must file P01 before the inner chorus');
  assert.deepEqual(ae.evidence.P01, {
    tier: 3, source: deep.siteId, sectorId: deep.sectorId, t: pack.state.simTime,
  });
  assert.equal(ae.revelation, 3);
  assert.equal(ae.sites[deep.siteId].deepTraceDone, true);
  assert.equal(deepLogs(pack).length, 1);
  const notes = ae.mapKnowledge[deep.sectorId].notes;
  assert.ok(notes.some((line) => line.includes(deep.name) && /evidence/i.test(line)),
    'the evidence knowledge names The Harvest Deep');
  const text = [...notes, ...pack.events.map((event) => event.payload.text).filter(Boolean)];
  for (const line of text) assert.doesNotMatch(line, /\b[a-z]+(?:_[a-z]+)+\b/);
});

test('repeat ticks, returning, the inner chorus, and reload keep one deep-trace entry', () => {
  const pack = worldAt();
  tick(pack);
  const ae = ensureAlienEcologyState(pack.state);
  assert.ok(ae.evidence.P01, 'the initial close visit must file P01');
  const original = { ...ae.evidence.P01 };
  tick(pack);
  pack.player.pos = { x: deep.center.x + deep.arrivalBands.long + 100, z: deep.center.z };
  tick(pack);
  pack.player.pos = { ...closePoint };
  tick(pack);
  pack.player.pos = { ...deep.center };
  tick(pack);
  assert.equal(ae.setpieces.N15_deep_chorus, true, 'the inner chorus also fires');
  assert.deepEqual(ae.evidence.P01, original);
  assert.equal(Object.keys(ae.evidence).filter((id) => id === 'P01').length, 1);
  assert.equal(deepLogs(pack).length, 1);

  const saved = JSON.parse(JSON.stringify(serializeAlienEcologyState(pack.state)));
  const restored = worldAt(deep.center);
  restored.state.simTime = pack.state.simTime;
  deserializeAlienEcologyState(restored.state, saved);
  tick(restored);
  const loaded = ensureAlienEcologyState(restored.state);
  assert.equal(loaded.sites[deep.siteId].deepTraceDone, true);
  assert.deepEqual(loaded.evidence.P01, original);
  assert.equal(Object.keys(loaded.evidence).filter((id) => id === 'P01').length, 1);
  assert.deepEqual(loaded.mapKnowledge[deep.sectorId].notes, ae.mapKnowledge[deep.sectorId].notes);
  assert.equal(deepLogs(restored).length, 0);
});

test('another site in the same sector and distant space file no deep-trace evidence', () => {
  for (const pos of [ALIEN_SITES.red_snow.center, { x: deep.center.x + 10000, z: deep.center.z }]) {
    const pack = worldAt(pos);
    tick(pack);
    tick(pack);
    assert.deepEqual(ensureAlienEcologyState(pack.state).evidence, {});
    assert.equal(deepLogs(pack).length, 0);
  }
});
