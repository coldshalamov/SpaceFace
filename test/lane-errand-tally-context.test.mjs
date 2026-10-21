import test from 'node:test';
import assert from 'node:assert/strict';
import { world } from '../src/systems/world.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { ZONE_TETHYS_TALLY as TALLY } from '../src/data/authoredPlaces.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { LANE_ERRANDS, pickLaneErrand, armLaneErrands, applyLaneErrandIntent } from '../src/systems/laneErrands.js';

const sector = 'sector_tethys_junction';
const postIds = ['tally_creep', 'invoice_match'];
const center = sectorLocalToGlobalForSector(TALLY.center, sector);
function harness(sectorId = sector, pos = center) {
  const hull = { id: 2, alive: true, pos: { ...pos }, rot: 0,
    data: { activityActorSlotId: 'charon_colony_hauler', trafficRole: 'hauler' } };
  const entry = { entityId: 2, worldRecordId: 'charon-proof', sectorId, control: null,
    job: { id: 'job:charon-proof', kind: 'hauler', phase: 'transit', simTime: 50, progress: 0.25 } };
  const events = [], intents = [];
  const post = { id: 3, alive: true, pos: { ...center }, data: { poi: true, poiId: 'poi_tethys_tally_post', sectorId: sector } };
  const runtime = { state: { mode: 'flight', meta: { seed: 9 }, playerId: 1,
    world: { currentSectorId: sectorId, activeSector: { pois: [{ id: 3, poiId: 'poi_tethys_tally_post' }] } }, traffic: { charonSalvageSupply: { phase: 'working' } },
    entities: new Map([[1, { id: 1, alive: true, pos: { ...pos } }], [2, hull], [3, post]]) },
    bus: { emit: (type, payload) => events.push({ type, ...payload }) },
    _byId: () => ({ job: entry }), _writeIntent: (...args) => intents.push(args) };
  return { runtime, entry, hull, post, events, intents };
}
function oldPick(seed, recordId, window, kind, partner) {
  const rows = LANE_ERRANDS.filter(r => r.kinds.includes(kind) && (!r.partner || partner));
  return rows[hash32(seed, recordId, window, kind, 'lane-errand') % rows.length] || null;
}
function admittedWindow(id) {
  for (let w = 0; w < 1000; w++) if (oldPick(9, 'charon-proof', w, 'hauler', false)?.id === id
    && hash32(9, 'charon-proof', w, 'lane-errand-gate') % 2 === 0) return w;
  throw new Error(`No admitted window for ${id}`);
}
function arm(f, id) { const time = admittedWindow(id) * 42; armLaneErrands(f.runtime, time); return time; }

test('authored gold post sits inside the actual Tally footprint', () => {
  const post = SECTORS.find(s => s.id === sector).pois.find(p => p.id === 'poi_tethys_tally_post');
  assert.match(post.discoveryPlate.body, /Meridian gold/);
  assert.ok(Math.hypot(post.pos.x - TALLY.center.x, post.pos.z - TALLY.center.z) < TALLY.radius);
});

test('returned Charon hauler cannot emit either Tally-post errand', () => {
  for (const id of postIds) {
    const f = harness('sector_charon_expanse', sectorLocalToGlobalForSector({ x: 0, z: 0 }, 'sector_charon_expanse'));
    const time = arm(f, id);
    applyLaneErrandIntent(f.runtime, f.entry, f.hull, time);
    assert.equal(f.entry.errand, undefined, id);
    assert.equal(f.events.length, 0, id);
    assert.equal(f.intents.length, 0, id);
  }
});

test('both post errands still emit unchanged prose once at the Tally', () => {
  for (const id of postIds) {
    const f = harness();
    const before = structuredClone(f.entry.job);
    const time = arm(f, id);
    assert.equal(f.entry.errand.id, id);
    assert.equal(applyLaneErrandIntent(f.runtime, f.entry, f.hull, time), true);
    applyLaneErrandIntent(f.runtime, f.entry, f.hull, time + 1);
    assert.equal(f.events.filter(e => e.type === 'toast').length, 1);
    assert.equal(f.events[0].text, LANE_ERRANDS.find(r => r.id === id).line);
    assert.deepEqual(f.entry.job, before);
  }
});

test('sector label alone, other sectors, and invalid positions cannot admit post errands', () => {
  for (const [sectorId, pos] of [[sector, { x: center.x + TALLY.radius + 1, z: center.z }],
    ['sector_charon_expanse', center], [sector, { x: NaN, z: center.z }],
    [sector, { x: center.x, z: Infinity }]]) {
    const f = harness(sectorId, pos);
    arm(f, 'tally_creep');
    assert.equal(f.entry.errand, undefined);
  }
  const edge = harness(sector, { x: center.x + TALLY.radius, z: center.z });
  arm(edge, 'tally_creep');
  assert.equal(edge.entry.errand.id, 'tally_creep');
});

test('an armed post errand yields before speech or motion after leaving the place', () => {
  for (const id of postIds) {
    const f = harness(); const time = arm(f, id);
    f.hull.pos.x += TALLY.radius + 1;
    assert.equal(applyLaneErrandIntent(f.runtime, f.entry, f.hull, time), false);
    assert.equal(f.entry.errand, null);
    assert.equal(f.events.length, 0);
    assert.equal(f.intents.length, 0);
  }
});

test('all generic picks and all legitimate Tally picks retain the old deterministic selection', () => {
  for (const kind of ['miner', 'tender', 'hauler', 'patrol', 'surveyor', 'salvor']) {
    for (const partner of [false, true]) for (let w = 0; w < 100; w++) {
      const old = oldPick(9, 'charon-proof', w, kind, partner);
      assert.equal(pickLaneErrand(9, 'charon-proof', w, kind, partner, true), old);
      assert.equal(pickLaneErrand(9, 'charon-proof', w, kind, partner), postIds.includes(old?.id) ? null : old);
    }
  }
});

test('ordinary Charon errands remain active and contract precedence remains intact', () => {
  const f = harness('sector_charon_expanse', { x: 0, z: 0 });
  const time = arm(f, 'manifest_aloud');
  assert.equal(applyLaneErrandIntent(f.runtime, f.entry, f.hull, time), true);
  assert.equal(f.events[0].text, LANE_ERRANDS.find(r => r.id === 'manifest_aloud').line);
  for (const blocked of ['flee', 'complete', 'claimed']) {
    const g = harness();
    const t = arm(g, 'tally_creep');
    if (blocked === 'claimed') g.entry.control = { owner: 'test' }; else g.entry.job.phase = blocked;
    assert.equal(applyLaneErrandIntent(g.runtime, g.entry, g.hull, t), false);
    assert.equal(g.events.length, 0);
    assert.equal(g.intents.length, 0);
  }
});


test('post identity and living presence are required, including after arming', () => {
  const changes = [
    f => { f.post.alive = false; },
    f => { f.runtime.state.entities.delete(f.post.id); },
    f => { f.post.data.poiId = 'oneoff_tag_post'; },
    f => { f.post.data.sectorId = 'sector_charon_expanse'; },
    f => { f.post.data.poi = false; },
    f => { f.post.pos.x += TALLY.radius + 1; },
    f => { f.runtime.state.world.activeSector.pois = []; },
    f => { f.runtime.state.world.activeSector.pois.push({ id: 4, poiId: 'poi_tethys_tally_post' }); },
  ];
  for (const change of changes) for (const id of postIds) {
    const f = harness(); change(f); arm(f, id);
    assert.equal(f.entry.errand, undefined);
    const g = harness(); const time = arm(g, id); change(g);
    assert.equal(applyLaneErrandIntent(g.runtime, g.entry, g.hull, time), false);
    assert.equal(g.events.length, 0);
    assert.equal(g.intents.length, 0);
  }
});


test('production World POI spawning admits the live Tally post without fixture-only stamps', () => {
  const f = harness();
  f.runtime.state.entities.delete(3);
  f.runtime.state.world.activeSector = { id: sector, pois: [] };
  f.runtime.state.nextEntityId = 10;
  const owner = Object.assign({}, world, { state: f.runtime.state,
    helpers: { spawnEntity(spec) {
      const entity = { ...spec, id: f.runtime.state.nextEntityId++, alive: true };
      f.runtime.state.entities.set(entity.id, entity);
      return entity;
    } },
    _toGlobal: (point, id) => sectorLocalToGlobalForSector(point, id),
    _stampHomeSector() {},
  });
  owner._spawnPOIs(SECTORS.find(s => s.id === sector), f.runtime.state.world.activeSector,
    { pois: {} }, mulberry32(4242));
  const time = arm(f, 'tally_creep');
  assert.equal(f.entry.errand?.id, 'tally_creep');
  assert.equal(applyLaneErrandIntent(f.runtime, f.entry, f.hull, time), true);
  assert.match(f.events[0].text, /Post's gold/);
});
