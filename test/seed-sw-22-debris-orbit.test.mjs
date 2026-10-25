// SEED-SW-22 — Debris Orbit: rocks in the room are latched into an orbiting ring — at most
// four existing debris bodies per gun, only loose rocks claim (nothing conjured), and a dead
// or broken rock frees its slot for the room's next real rock.
import assert from 'node:assert/strict';
import test from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';
import { weapons } from '../src/systems/weapons.js';

const SEED = 4242;
const DEF = WEAPONS.find((d) => d.id === 'wpn_debris_orbit_s');

function rock(id, x, z, type = 'asteroid') {
  return { id, type, alive: true, pos: { x, z }, vel: { x: 0, z: 0 }, radius: 6, mass: 4, data: {} };
}

test('debris orbit is a catalogued gun on the swarm shelf', () => {
  assert.ok(DEF);
  assert.equal(SWARM_DRAFT_OFFERS.find((o) => o.defId === DEF.id)?.id, 'debris_orbit');
  assert.ok(DEF.debrisOrbit && DEF.debrisOrbit.maxRocks <= 4, 'authored cap <= 4');
});

test('the ring claims at most four existing rocks, never conjures, frees spent slots', () => {
  void SEED;
  const owner = {
    id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
    team: 'player', data: { weapons: [{ defId: DEF.id }] },
  };
  const rocks = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((id, i) => rock(id, 40 + i * 5, i * 4));
  const hostile = { id: 'h1', type: 'ship', alive: true, pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, team: 'brood', data: {} };
  const list = [owner, ...rocks, hostile];
  const entities = new Map(list.map((e) => [e.id, e]));
  const state = {
    tick: 5, simTime: 0, playerId: 'player', entities,
    entityList: list, entityIndex: null, spatialHash: null,
    combat: { attachments: { byId: {} } },
  };
  // Stand-in attachment service: same contract as the kernel's (create returns ok+attachment,
  // get returns the live record, breakAttachment retires it).
  const live = new Map();
  let nextAtt = 0;
  const attachments = {
    create: (spec) => {
      const id = `att_${++nextAtt}`;
      const att = { id, defId: spec.defId, ownerId: spec.ownerId, targetId: spec.targetId, state: 'active' };
      live.set(id, att);
      return { ok: true, attachment: att };
    },
    get: (id) => live.get(id) || null,
    breakAttachment: (id) => { const a = live.get(id); if (a) a.state = 'broken'; },
  };
  const events = [];
  const host = Object.assign(Object.create(weapons), {
    state,
    helpers: { getEntity: (id) => entities.get(id) || null },
    bus: { emit: (name, payload) => events.push({ name, payload }) },
    _orbitRings: new Map(),
    _byId: new Map([[DEF.id, DEF]]),
    _entityGetter: (id) => entities.get(id) || null,
    _attachmentsService: () => attachments,
  });
  weapons._tickDebrisOrbit.call(host, 1 / 60, state);
  const ring = host._orbitRings.get('player');
  assert.ok(ring.size <= 4, `ring capped at ${ring.size}`);
  assert.equal(ring.size, 4, 'four of the six rocks latched');
  for (const id of ring.keys()) assert.ok(id.startsWith('r'), `only room rocks claimed: ${id}`);
  assert.equal([...ring.keys()].includes('h1'), false, 'a hostile ship is never a ring rock');
  assert.ok(events.some((e) => e.name === 'weapons:debrisOrbitClaimed'), 'claim receipt');
  // A rock dies → its slot frees and the room's next real rock refills on the next tick.
  rocks[0].alive = false;
  weapons._tickDebrisOrbit.call(host, 1 / 60, state);
  assert.ok(!ring.has('r1'), 'dead rock freed its slot');
  assert.equal(ring.size, 4, 'slot refilled from the room');
  // A broken latch frees the slot the same way — the freed rock is out of reach now, so the
  // refill must come from the room's remaining real rock, not the just-broken one.
  attachments.breakAttachment(ring.get('r2'));
  rocks[1].pos.x = 9999;
  weapons._tickDebrisOrbit.call(host, 1 / 60, state);
  assert.ok(!ring.has('r2'), 'broken latch freed its slot');
  assert.equal(ring.size, 4, 'slot refilled from the room');
  assert.ok(ring.has('r6'), 'the last real rock was claimed');
});

test('unprofiled loose bodies are lent the tether-anchor profile before latching', () => {
  // The real kernel refuses targets with zero tether sockets; 'debris'/'rock'/'cargo_pod'
  // bodies have no entry in DEFAULT_COMBAT_PROFILE_BY_TYPE, so the claim must stamp the
  // anchor profile itself — the same stamp spawners use — or the gun is silently dead.
  const owner = {
    id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
    team: 'player', data: { weapons: [{ defId: DEF.id }] },
  };
  const loose = rock('d1', 40, 0, 'debris');
  const stamped = { ...rock('w1', 50, 0, 'debris'), data: { combatProfileId: 'combat_profile_pallet_jack' } };
  const asteroidBody = rock('a1', 60, 0, 'asteroid');
  const list = [owner, loose, stamped, asteroidBody];
  const entities = new Map(list.map((e) => [e.id, e]));
  const state = {
    tick: 5, simTime: 0, playerId: 'player', entities,
    entityList: list, entityIndex: null, spatialHash: null,
    combat: { attachments: { byId: {} } },
  };
  const live = new Map();
  let nextAtt = 0;
  const attachments = {
    create: (spec) => {
      const id = `att_${++nextAtt}`;
      const att = { id, defId: spec.defId, ownerId: spec.ownerId, targetId: spec.targetId, state: 'active' };
      live.set(id, att);
      return { ok: true, attachment: att };
    },
    get: (id) => live.get(id) || null,
    breakAttachment: () => {},
  };
  const host = Object.assign(Object.create(weapons), {
    state,
    helpers: { getEntity: (id) => entities.get(id) || null },
    bus: { emit: () => {} },
    _orbitRings: new Map(),
    _byId: new Map([[DEF.id, DEF]]),
    _entityGetter: (id) => entities.get(id) || null,
    _attachmentsService: () => attachments,
  });
  weapons._tickDebrisOrbit.call(host, 1 / 60, state);
  assert.equal(loose.data.combatProfileId, 'combat_profile_tether_anchor',
    'unprofiled debris gains the anchor profile so the kernel can socket the clamp');
  assert.equal(stamped.data.combatProfileId, 'combat_profile_pallet_jack',
    'an explicitly stamped profile is never overwritten');
  assert.equal(asteroidBody.data.combatProfileId, undefined,
    'a body whose type already defaults to the anchor profile is left alone');
});
