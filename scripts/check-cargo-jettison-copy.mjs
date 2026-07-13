#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';

const source = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');

assert.match(
  source,
  /function cargoDisplayName\(id\)/,
  'HUD cargo panel must keep a shared player-facing cargo display-name helper',
);
assert.match(
  source,
  /const name = cargoDisplayName\(commodityId\);[\s\S]*Jettisoned \$\{dumped\}x \$\{name\}/,
  'cargo jettison toast must use authored commodity names rather than raw cargo ids',
);
assert.doesNotMatch(
  source,
  /Jettisoned \$\{dumped\}x \$\{commodityId\.replace\('cmdty_'/,
  'cargo jettison toast must not leak raw cmdty_* ids through simple string replacement',
);
assert.match(
  source,
  /const name = cargoDisplayName\(id\);[\s\S]*lines\.push\(`  \$\{name\}: \$\{qty\}`\)/,
  'cargo tooltip must use authored commodity names rather than raw cargo ids',
);
assert.doesNotMatch(
  source,
  /lines\.push\(`  \$\{id\.replace\('cmdty_'/,
  'cargo tooltip must not leak raw cmdty_* ids through simple string replacement',
);
assert.match(
  source,
  /Personal effects cannot be jettisoned/,
  'personal effects must remain protected from cargo jettison copy/actions',
);
assert.match(
  source,
  /PERSISTENT_CARGO_BY_ID/,
  'persistent cargo names must still resolve from narrative data',
);
assert.match(
  source,
  /createSupplyTree/,
  'cargo hold supply-chain panel must use the shared supplyTree effect primitive',
);
assert.match(
  source,
  /function cargoMemoryAgeLabel\(s, seenAt\)/,
  'cargo hold market memory copy must own its HUD-safe age formatter',
);
assert.doesNotMatch(
  source,
  /\bageLabel\(state,/,
  'cargo hold must not call Market screen private ageLabel() from HUD scope',
);
assert.doesNotMatch(
  source,
  /SUPPLY_CHAINS/,
  'cargo hold supply tree must not hard-code or invent production chains',
);

// Regression: dumped cargo used to spawn inside the mining collector/magnet, so the same units
// were re-collected on the next tick while jettisonImpulse still granted dv.
{
  const handlers = new Map();
  const bus = {
    on(name, fn) { const list = handlers.get(name) || []; list.push(fn); handlers.set(name, list); return () => {}; },
    emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload, name); },
  };
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, radius: 6, mass: 20, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {}, data: {},
  };
  const state = {
    mode: 'flight', tick: 20, simTime: 5, playerId: 1,
    entities: new Map([[1, player]]), entityList: [player], entityIndex: null,
    input: { fireGroup: null }, rng: () => 0.5,
    player: {
      cargo: { items: { cmdty_ore_iron: 4 }, usedVolume: 4, usedMass: 3.2, capVolume: 40, capMass: 60 },
      magnetRange: 420, miningBeam: null, moduleInventory: [], tether: { active: false },
    },
  };
  let nextId = 2;
  const impulses = [];
  const helpers = {
    spawnEntity(spec) {
      const e = { id: nextId++, alive: true, flags: {}, data: {}, ...spec };
      state.entities.set(e.id, e); state.entityList.push(e); return e;
    },
    combatPhysics: { applyImpulse(input) { impulses.push(input); return true; } },
  };
  const cargoSystem = Object.create(cargo);
  const miningSystem = Object.create(mining);
  const impulseSystem = Object.create(jettisonImpulse);
  const registry = { get: (name) => (name === 'cargo' ? cargoSystem : null) };
  cargoSystem.init({ state, bus, helpers, registry });
  miningSystem.init({ state, bus, helpers, registry });
  const savedFlags = { ...MASSLINE2_FLAGS };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.jettisonImpulse = true;
  try {
    impulseSystem.init({ state, bus, helpers, registry });
    assert.equal(cargoSystem.jettison('cmdty_ore_iron', 4), 4);
    const pickup = state.entityList.find((e) => e.type === 'pickup');
    assert.ok(pickup && pickup.data.jettisonedCargo && pickup.data.pickupEmbargoUntil > state.simTime,
      'dumped cargo must carry a deterministic collection embargo');
    assert.ok(pickup.pos.x < -(player.radius + pickup.radius), 'dumped cargo must start safely aft');
    assert.equal(pickup.collides, false, 'physics collection must stay disabled during the embargo');
    miningSystem._updatePickups(1 / 60, state);
    assert.equal(pickup.alive, true, 'dumped cargo must not be immediately re-collected');
    assert.equal(state.player.cargo.items.cmdty_ore_iron || 0, 0, 'the hold stays empty after the kick');
    assert.equal(impulses.length, 1, 'one dump grants exactly one reaction impulse');

    state.simTime = pickup.data.pickupEmbargoUntil + 0.01;
    pickup.pos.x = player.pos.x; pickup.pos.z = player.pos.z;
    miningSystem._updatePickups(1 / 60, state);
    assert.equal(pickup.alive, false, 'expired dumped cargo can be recovered normally');
    assert.equal(state.player.cargo.items.cmdty_ore_iron, 4, 'later recovery returns through cargo ownership');
  } finally {
    Object.assign(MASSLINE2_FLAGS, savedFlags);
  }
}

console.log('Cargo display copy checks OK');
