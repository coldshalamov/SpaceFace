import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { save } from '../src/save/saveSystem.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

// Wall-clock stamps and the player id the loader reallocates. Every other written field must return.
const VOLATILE_PERSISTED = /^(meta\.lastSavedAt|entities\.player\.id|player\.entityId)$/;

function comparePersisted(before, after, path, dropped, changed) {
  if (Array.isArray(before)) {
    if (!Array.isArray(after)) {
      dropped.push(path || '(root)');
      return;
    }
    if (before.length !== after.length) {
      changed.push({ path: `${path}.length`, before: before.length, after: after.length });
    }
    const n = Math.min(before.length, after.length);
    for (let i = 0; i < n; i++) comparePersisted(before[i], after[i], `${path}[${i}]`, dropped, changed);
    return;
  }
  if (before && typeof before === 'object') {
    if (!after || typeof after !== 'object' || Array.isArray(after)) {
      dropped.push(path || '(root)');
      return;
    }
    for (const key of Object.keys(before)) {
      const next = path ? `${path}.${key}` : key;
      if (!Object.prototype.hasOwnProperty.call(after, key)) dropped.push(next);
      else comparePersisted(before[key], after[key], next, dropped, changed);
    }
    return;
  }
  if (before !== after) changed.push({ path, before, after });
}

function makeVec(x = 0, z = 0) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(pos) { this.x = pos.x || 0; this.y = pos.y || 0; this.z = pos.z || 0; return this; },
  };
}

test('a populated save round-trips every persisted field at version 14', () => {
  assert.equal(CURRENT_VERSION, 14);
  const state = createGameState(4242);
  state.mode = 'flight';
  state.player.credits = 4321;
  state.player.cargo = { items: { ore_iron: 4 }, capVolume: 40, capMass: 40, usedMass: 8 };
  state.meta.playtimeS = 90;
  const spec = makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    factionId: 'faction_free',
    pos: { x: 30, z: -12 },
    rot: 0.2,
    player: state.player,
  });
  const player = {
    ...spec,
    id: state.nextEntityId++,
    alive: true,
    pos: makeVec(30, -12),
    prevPos: makeVec(30, -12),
    vel: makeVec(4, -1),
    rot: 0.2,
    prevRot: 0.2,
    hull: Math.max(1, spec.hullMax * 0.4),
    shield: Math.max(0, spec.shieldMax * 0.25),
  };
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: player.data.fittings }];
  state.player.activeShipIndex = 0;
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const original = {
    state: save.state,
    bus: save.bus,
    helpers: save.helpers,
    registry: save.registry,
  };
  save.state = state;
  save.bus = { emit() {} };
  save.helpers = {
    spawnEntity(spec) {
      const ent = {
        id: state.nextEntityId++,
        ...spec,
        alive: spec.alive !== false,
        data: spec.data || {},
        flags: spec.flags || {},
        pos: makeVec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        prevPos: makeVec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        vel: makeVec(spec.vel && spec.vel.x, spec.vel && spec.vel.z),
      };
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      return ent;
    },
    getEntity(id) { return state.entities.get(id); },
    player() { return state.entities.get(state.playerId); },
  };
  save.registry = { get() { return null; } };
  try {
    const envelope = save.serialize('roundtrip');
    assert.equal(envelope.version, 14);
    const persisted = JSON.parse(JSON.stringify(envelope.data));
    state.player.credits = 1;
    state.player.cargo.items.ore_iron = 0;
    const ok = save.loadEnvelope(envelope, 'roundtrip');
    assert.equal(ok, true);
    assert.equal(state.player.credits, persisted.player.credits);
    assert.equal(state.player.cargo.items.ore_iron, persisted.cargo.items.ore_iron);
    assert.equal(state.meta.seed, persisted.meta.seed);
    const loaded = save.serialize('roundtrip');
    assert.equal(loaded.version, CURRENT_VERSION);
    const again = JSON.parse(JSON.stringify(loaded.data));
    const dropped = [];
    const changed = [];
    comparePersisted(persisted, again, '', dropped, changed);
    assert.deepEqual(dropped, [], `written fields dropped on load: ${dropped.join(', ')}`);
    const volatile = changed.filter((row) => !VOLATILE_PERSISTED.test(row.path));
    assert.deepEqual(volatile, [], `persisted values changed: ${volatile.slice(0, 12).map((row) => row.path).join(', ')}`);
  } finally {
    save.state = original.state;
    save.bus = original.bus;
    save.helpers = original.helpers;
    save.registry = original.registry;
  }
});
