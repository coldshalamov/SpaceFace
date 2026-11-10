import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeLanternWardDressing, lanternWardReservations } from '../src/world/lanternWardDressing.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { insertDressingRow, dropDressingSector } from '../src/world/dressingTable.js';
import { LANTERN_WARD_BODY_CONTRACTS as B } from '../src/data/lanternWardLayout.js';

function scene(origin = { x: 0, z: 0 }) {
  const sector = { id: 'sector_helios_prime', pois: [{ id: 'poi_memorial', pos: { x: 1680, z: -820 } }] };
  const anchor = { x: origin.x + 1680, z: origin.z - 820 };
  const active = { pois: [{ poiId: 'poi_memorial', pos: anchor }], dressing: [] };
  const state = { world: {}, entities: new Map(), nextEntityId: 1, freeIds: [] };
  const owner = {
    state, _toGlobal: p => ({ x: p.x + origin.x, z: p.z + origin.z }),
    _spawnPlaceProp(a, s, placeId, pos, opts) {
      const e = insertDressingRow(state, { pos, rot: opts.rot, radius: opts.radius,
        homeSectorId: s.id, data: { placeId, name: opts.name, homeSectorId: s.id } });
      a.dressing.push({ id: e.id, placeId, pos }); return e;
    },
  };
  return { owner, sector, active, state, anchor };
}

test('ordinary Helios world pass admits one bounded shore, never a second memorial', () => {
  const s = scene();
  assert.equal(materializeLanternWardDressing(s.owner, s.sector, s.active), 23);
  assert.equal(materializeLanternWardDressing(s.owner, s.sector, s.active), 0);
  assert.equal(s.state.entities.size, 0, 'static shore does not spend live actor slots');
  assert.equal(s.state.world.dressing.rows.length, 23);
  assert.deepEqual(s.active.pois, [{ poiId: 'poi_memorial', pos: s.anchor }]);
  assert.equal(s.state.world.dressing.rows.filter(e => e.data.placeId.includes('candle')).length, 0);
  assert.equal(dropDressingSector(s.state, s.sector.id), 23);
  assert.equal(s.state.world.dressing.rows.length, 0);
});

test('static collision uses the same boxes as the authored visible shore', () => {
  const s = scene(); materializeLanternWardDressing(s.owner, s.sector, s.active);
  for (const entity of s.state.world.dressing.rows.filter(e => e.data.lanternWardRole)) {
    assert.equal(entity.collides, true);
    assert.equal(entity.physicsBody.dynamic, false);
    const manifest = resolveCollisionProxyManifest(entity);
    assert.ok(manifest, `${entity.data.lanternWardRole} is admitted by the physics owner`);
    const c = B[entity.data.lanternWardRole];
    assert.equal(manifest.primitives.length, c.collision.length);
    for (let i = 0; i < c.collision.length; i++) {
      const p = manifest.primitives[i], b = c.collision[i];
      for (const key of ['x', 'z', 'hx', 'hz']) assert.ok(Math.abs(p[key] * entity.radius - b[key]) < 1e-9);
    }
  }
});

test('reservations and all bodies use the live anchor in the existing global frame', () => {
  const a = scene(), b = scene({ x: 50320, z: -78100 });
  const ra = lanternWardReservations(a.owner, a.sector, a.active);
  const rb = lanternWardReservations(b.owner, b.sector, b.active);
  assert.equal(ra.length, rb.length);
  for (let i = 0; i < ra.length; i++) {
    assert.equal(rb[i].pos.x - ra[i].pos.x, 50320);
    assert.equal(rb[i].pos.z - ra[i].pos.z, -78100);
    assert.equal(rb[i].radius, ra[i].radius);
  }
  materializeLanternWardDressing(b.owner, b.sector, b.active);
  const north = b.state.world.dressing.rows.find(e => e.data.worldRecordId?.includes('service_cut_north'));
  const south = b.state.world.dressing.rows.find(e => e.data.worldRecordId?.includes('service_cut_south'));
  assert.equal(south.pos.z - north.pos.z - 24, 84, '84 WU cut remains a physical gap');
  assert.equal(materializeLanternWardDressing(a.owner, { id: 'sector_sump' }, a.active), 0);
  assert.deepEqual(lanternWardReservations(a.owner, { id: 'sector_sump' }, a.active), []);
});
