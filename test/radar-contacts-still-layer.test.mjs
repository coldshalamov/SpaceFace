import test from 'node:test';
import assert from 'node:assert/strict';
import {
  censusRadarContactsStillLayer,
  createRadarContactsStillCache,
  setRadarContactsStillLayerForBench,
  getRadarContactsStillLayerForBench,
} from '../src/ui/radar.js';
import { tacticalRadarMetrics } from '../src/ui/map/tacticalMapGrammar.js';

const RANGE = 4000;
const rangeSq = RANGE * RANGE;
const metrics = tacticalRadarMetrics(false);

function makeContacts(n = 24) {
  const contacts = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 6;
    const type = kind === 0 ? 'station' : kind === 1 ? 'wreck' : kind === 2 ? 'pickup' : 'ship';
    contacts.push({
      id: 100 + i,
      type,
      alive: true,
      team: 0,
      pos: { x: (i % 8) * 150 - 500, z: Math.floor(i / 8) * 180 - 300 },
      vel: { x: 0, z: 0 },
      rot: (i * 0.13) % (Math.PI * 2),
      data: {
        ai: { passive: true },
        isGate: type === 'station' && i % 9 === 0,
        namedLaneContactId: i % 11 === 0 ? `lane-${i}` : null,
      },
    });
  }
  return contacts;
}

function harness() {
  const player = { id: 1, pos: { x: 0, z: 0 }, team: 0 };
  const state = { playerId: 1, factions: {} };
  const contacts = makeContacts();
  const projectScratch = {
    x: 0, y: 0, dx: 0, dz: 0, distance: 0, offRange: false, angle: 0, scale: 0, resolved: true,
  };
  const hostileMarks = [];
  const infrastructureMarks = [];
  const neutralMarks = [];
  const cache = createRadarContactsStillCache();
  function pushHostileMark(entity, projected, distanceSq) {
    hostileMarks.push({ entity, x: projected.x, y: projected.y, distanceSq });
  }
  function pushInfrastructureMark(entity, projected, gate, distanceSq) {
    infrastructureMarks.push({
      entity, x: projected.x, y: projected.y, gate,
      offRange: projected.offRange, angle: projected.angle, distanceSq,
    });
  }
  function pushNeutralMark(entity, projected, distanceSq, meta) {
    neutralMarks.push({ entity, x: projected.x, y: projected.y, distanceSq, ...meta });
  }
  function run(opts = {}) {
    return censusRadarContactsStillLayer({
      contacts,
      player,
      playerTeam: 0,
      state,
      range: RANGE,
      rangeSq,
      metrics,
      targetId: opts.targetId ?? null,
      projectScratch,
      pushHostileMark,
      pushInfrastructureMark,
      pushNeutralMark,
      hostileMarks,
      infrastructureMarks,
      neutralMarks,
      cache,
    });
  }
  return { player, contacts, cache, hostileMarks, infrastructureMarks, neutralMarks, run };
}

test('radar contacts still-layer defaults ON', () => {
  assert.equal(getRadarContactsStillLayerForBench(), true);
});

test('first census walks; still pose then skips', () => {
  setRadarContactsStillLayerForBench(true);
  const h = harness();
  const first = h.run();
  assert.equal(first.skipped, false);
  assert.ok(h.neutralMarks.length + h.infrastructureMarks.length > 0);
  const second = h.run();
  assert.equal(second.skipped, true);
  assert.equal(h.neutralMarks.length, first.skipped ? h.neutralMarks.length : h.neutralMarks.length);
  assert.equal(second.hostileCount, first.hostileCount);
});

test('latch OFF always walks', () => {
  setRadarContactsStillLayerForBench(false);
  const h = harness();
  h.run();
  const second = h.run();
  assert.equal(second.skipped, false);
  setRadarContactsStillLayerForBench(true);
});

test('player move beyond one radar pixel wakes', () => {
  setRadarContactsStillLayerForBench(true);
  const h = harness();
  h.run();
  assert.equal(h.run().skipped, true);
  h.player.pos.x += 50; // ~1.3 radar px at compact scale
  assert.equal(h.run().skipped, false);
});

test('sub-pixel drift stays latched', () => {
  setRadarContactsStillLayerForBench(true);
  const h = harness();
  h.run();
  for (let i = 1; i <= 4; i++) {
    h.player.pos.x = i * 0.5;
    assert.equal(h.run().skipped, true, `drift step ${i}`);
  }
});

test('contact pose change wakes the still-layer', () => {
  setRadarContactsStillLayerForBench(true);
  const h = harness();
  h.run();
  assert.equal(h.run().skipped, true);
  const ship = h.contacts.find((c) => c.type === 'ship');
  ship.pos.x += 40;
  assert.equal(h.run().skipped, false);
});

test('targetId change wakes', () => {
  setRadarContactsStillLayerForBench(true);
  const h = harness();
  h.run({ targetId: null });
  assert.equal(h.run({ targetId: null }).skipped, true);
  const ship = h.contacts.find((c) => c.type === 'ship');
  assert.equal(h.run({ targetId: ship.id }).skipped, false);
});

test('rescan budget eventually forces a walk', () => {
  setRadarContactsStillLayerForBench(true);
  const h = harness();
  h.run();
  let walks = 0;
  let skips = 0;
  for (let i = 0; i < 12; i++) {
    const r = h.run();
    if (r.skipped) skips += 1;
    else walks += 1;
  }
  assert.ok(skips >= 8, `skips=${skips}`);
  assert.ok(walks >= 1, `walks=${walks}`);
});

test('bench toggle restores', () => {
  setRadarContactsStillLayerForBench(false);
  assert.equal(getRadarContactsStillLayerForBench(), false);
  setRadarContactsStillLayerForBench(true);
  assert.equal(getRadarContactsStillLayerForBench(), true);
});
