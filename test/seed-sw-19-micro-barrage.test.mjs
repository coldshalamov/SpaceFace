// SEED-SW-19 — Micro-missile Barrage: one trigger pulls a fan of small missiles that lock
// onto NEARBY threats — each seeker handed a distinct hull when the room has enough of them.
import assert from 'node:assert/strict';
import test from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';
import { weapons } from '../src/systems/weapons.js';

const SEED = 4242;
const DEF = WEAPONS.find((d) => d.id === 'wpn_micro_barrage_m');

function ship(id, x, z, team) {
  return { id, type: 'ship', alive: true, pos: { x, z }, vel: { x: 0, z: 0 }, radius: 8, team, data: {} };
}

test('micro-missile barrage is a catalogued launcher on the swarm shelf', () => {
  assert.ok(DEF);
  assert.equal(SWARM_DRAFT_OFFERS.find((o) => o.defId === DEF.id)?.id, 'micro_barrage');
});

test('one trigger emits at least six missiles and each locks a distinct hostile', () => {
  const hostiles = ['ha', 'hb', 'hc', 'hd', 'he', 'hf', 'hg'].map((id, i) => ship(id, 80 + i * 20, i * 10, 'brood'));
  // The shooter stays OUT of the entity map so candidate collection uses the team check —
  // every brood ship in range is a candidate for a seeker head.
  const owner = ship('player', 0, 0, 'player');
  const state = {
    tick: 5, simTime: 0, playerId: 'player',
    entities: new Map(hostiles.map((e) => [e.id, e])),
    entityList: [...hostiles],
    entityIndex: null, spatialHash: null,
  };
  const w = { defId: DEF.id, slotIndex: 0, cooldown: 0 };
  const host = {
    state,
    helpers: { getEntity: (id) => state.entities.get(id) || null, spawnEntity: () => null },
    bus: { emit: () => {} },
    _attackQueryScratch: [],
    spawned: [],
    _spawnProjectile(e, ww, def, dir, tgt, isMissile, st, opts) {
      this.spawned.push({ dir, seekTargetId: opts && opts.seekTargetId });
    },
  };
  const spec = weapons._attackSpecFor.call(host, w, DEF, state, owner);
  assert.equal(spec.emitter.rootCount, 6, 'authored volley of six');
  weapons._emitProjectileVolley.call(host, owner, w, DEF, 0, hostiles[0], true, state, spec);
  assert.ok(host.spawned.length >= 6, `emitted ${host.spawned.length}`);
  const targets = new Set(host.spawned.map((s) => s.seekTargetId).filter(Boolean));
  assert.ok(targets.size >= 6, `distinct seeker hulls ${targets.size}: ${[...targets]}`);
});
