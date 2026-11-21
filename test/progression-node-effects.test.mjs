// The Pilot Tree nodes built on 2026-11-20 (progression lead): the six capstones' new members,
// the Stealth branch on the cloak, Powers tier 2, and the evolutions. Each test pins the one line
// the card prints, through the real effect seam, and that nothing changes without the node.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { swarmWeaponPierceRank, PILOT_GOLD_THREAD_PIERCE, PILOT_ORBITAL_SAW_PIERCE } from '../src/systems/playerModifiers.js';
import { playerFieldSpec } from '../src/core/fields/fieldReadModel.js';
import { FIELD_DEFS } from '../src/data/fields.js';
import {
  cloak,
  cloakAmbushActive,
  fittedCloakModule,
  PILOT_CLOAK_MODULE,
  AMBUSH_WINDOW_S,
} from '../src/systems/cloak.js';
import { fields } from '../src/systems/fields.js';
import { activePilotRecord, pilotHas } from '../src/data/pilotTree.js';
import { MASSLINE2_FLAGS, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';

function withCloakFlag(fn) {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.cloak = true;
  try { return fn(); } finally { restoreFeatureMaps(snap); }
}

const runWith = (nodes) => ({ kind: 'survival', ruleset: 'swarm', phase: 'active', pilot: { points: {}, nodes, banked: 0, offer: null } });

function bus() {
  const listeners = new Map();
  const events = [];
  return {
    events,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { events.push({ type, payload }); for (const fn of listeners.get(type) || []) fn(payload); },
  };
}

test('the pilot record resolves per door: Swarm reads its run, Adventure the saved player record', () => {
  const adventure = { run: { kind: 'adventure', phase: 'inactive' }, player: { pilot: { points: { gunner: 1 }, nodes: ['gunner_drum'] } } };
  assert.equal(pilotHas(adventure, 'gunner_drum'), true, 'Adventure reads state.player.pilot');
  const swarm = { run: runWith(['gunner_ricochet']), player: adventure.player };
  assert.equal(pilotHas(swarm, 'gunner_drum'), false, 'a Swarm run never inherits Adventure skills');
  assert.equal(pilotHas(swarm, 'gunner_ricochet'), true);
  assert.equal(activePilotRecord({ player: {} }), null);
});

test('Gold Thread: every player shot pierces two ships; Orbital Saw: every ship while on the Line', () => {
  const player = { id: 1 };
  const base = { playerId: 1, player: { tether: { active: false } } };
  assert.equal(swarmWeaponPierceRank({ ...base, run: runWith([]) }, player, 'wpn_x'), 0);
  assert.equal(swarmWeaponPierceRank({ ...base, run: runWith(['gunner_gold_thread']) }, player, 'wpn_x'), PILOT_GOLD_THREAD_PIERCE);
  assert.equal(swarmWeaponPierceRank({ ...base, run: runWith(['evolution_orbital_saw']) }, player, 'wpn_x'), 0, 'off the Line: nothing');
  const onLine = { playerId: 1, player: { tether: { active: true, targetId: 9 } }, run: runWith(['evolution_orbital_saw']) };
  assert.equal(swarmWeaponPierceRank(onLine, player, 'wpn_x'), PILOT_ORBITAL_SAW_PIERCE);
  assert.equal(swarmWeaponPierceRank(onLine, { id: 2 }, 'wpn_x'), 0, 'NPC fire never reads the pilot');
});

test('Implode: the Pull well is half the size and three times as strong; Heavy Shove doubles the push', () => {
  const player = { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, team: 0 };
  const at = (nodes) => ({ tick: 1, playerId: 1, input: { aimWorld: { x: 200, z: 0 } }, run: runWith(nodes) });
  const plainWell = playerFieldSpec('well', player, at([]));
  const implode = playerFieldSpec('well', player, at(['conjurer_implode']));
  assert.equal(plainWell.radius, FIELD_DEFS.well.radius);
  assert.equal(implode.radius, FIELD_DEFS.well.radius * 0.5);
  assert.equal(implode.strength, FIELD_DEFS.well.strength * 3);
  const shove = playerFieldSpec('repulsor', player, at(['conjurer_heavy_shove']));
  assert.equal(shove.strength, FIELD_DEFS.repulsor.strength * 2);
  assert.equal(shove.radius, FIELD_DEFS.repulsor.radius, 'Heavy Shove does not change the reach');
  assert.equal(playerFieldSpec('repulsor', player, at([])).strength, FIELD_DEFS.repulsor.strength);
});

function cloakHarness(nodes) {
  const b = bus();
  const state = {
    mode: 'flight', tick: 0, simTime: 10, playerId: 1,
    runtime: { features: null },
    player: { ownedShips: [{ fittings: [] }], activeShipIndex: 0, tether: null },
    input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, actions: {} },
    run: runWith(nodes),
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 } }]]),
  };
  const sys = Object.create(cloak);
  sys.init({ state, bus: b });
  return { state, sys, bus: b };
}

test('Cloak: the Stealth root gives a cloak with no module; V engages it', () => withCloakFlag(() => {
  const plain = cloakHarness([]);
  assert.equal(fittedCloakModule(plain.state), null, 'no node, no module: no cloak');
  const h = cloakHarness(['ghost_cloak']);
  assert.equal(fittedCloakModule(h.state), PILOT_CLOAK_MODULE);
  h.state.input.actions.cloakToggle = true;
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.massline2.cloak.active, true, 'the press puts the ship dark');
  assert.ok(h.bus.events.some((e) => e.type === 'cloak:engaged'));
}));

test('Cold Drift halves the ring while coasting; Deep Shroud halves the drain', () => withCloakFlag(() => {
  const run = (nodes) => {
    const h = cloakHarness(nodes);
    h.state.input.actions.cloakToggle = true;
    h.sys.update(1 / 60, h.state);
    h.state.input.actions.cloakToggle = false;
    for (let i = 0; i < 240; i++) h.sys.update(1 / 60, h.state);
    return h.state.massline2.cloak;
  };
  const plain = run(['ghost_cloak']);
  const cold = run(['ghost_cloak', 'ghost_cold_drift']);
  assert.ok(Math.abs(plain.radius - 320) < 1, `coasting ring sits at the floor (${plain.radius})`);
  assert.ok(Math.abs(cold.radius - 160) < 2, `Cold Drift halves it (${cold.radius})`);
  const deep = run(['ghost_cloak', 'ghost_deep_shroud']);
  const spentPlain = 1 - plain.energy;
  const spentDeep = 1 - deep.energy;
  assert.ok(Math.abs(spentDeep - spentPlain / 2) < 0.01, `half the drain (${spentPlain} vs ${spentDeep})`);
}));

test('Ambush opens on the first volley out of the dark; Phantom keeps the cloak; Vanish re-engages on a kill', () => withCloakFlag(() => {
  const fire = (h) => h.bus.emit('combat:fire', { ownerId: 1 });
  const engage = (h) => { h.state.input.actions.cloakToggle = true; h.sys.update(1 / 60, h.state); h.state.input.actions.cloakToggle = false; };

  const plain = cloakHarness(['ghost_cloak']);
  engage(plain); fire(plain);
  assert.equal(plain.state.massline2.cloak.active, false, 'firing drops the cloak');
  assert.equal(cloakAmbushActive(plain.state), false, 'no Ambush without the node');

  const ambush = cloakHarness(['ghost_cloak', 'ghost_ambush']);
  engage(ambush); fire(ambush);
  assert.equal(cloakAmbushActive(ambush.state), true);
  ambush.state.simTime += AMBUSH_WINDOW_S + 0.01;
  assert.equal(cloakAmbushActive(ambush.state), false, 'the window closes after a second');

  const phantom = cloakHarness(['ghost_cloak', 'ghost_phantom']);
  engage(phantom); fire(phantom);
  assert.equal(phantom.state.massline2.cloak.active, true, 'Phantom: firing keeps you dark');

  const vanish = cloakHarness(['ghost_cloak', 'ghost_ambush', 'ghost_vanish']);
  engage(vanish); fire(vanish);
  assert.equal(vanish.state.massline2.cloak.active, false);
  vanish.bus.emit('entity:killed', { id: 7, killerId: 1 });
  assert.equal(vanish.state.massline2.cloak.active, true, 'a kill in the window puts you back in the dark');
}));

test('Black Hole: going dark queues a free, doubled Pull well where the ship was', () => {
  const b = bus();
  const state = { tick: 1, simTime: 3, playerId: 1, run: runWith(['evolution_black_hole']),
    entities: new Map([[1, { id: 1, pos: { x: 40, z: -12 } }]]) };
  const sys = Object.create(fields);
  sys.state = state;
  sys._pilotEcho = [];
  sys._queueBlackHole();
  assert.deepEqual(sys._pilotEcho, [{ kind: 'well', center: { x: 40, z: -12 }, at: 3, scale: 2 }]);
  state.run = runWith([]);
  sys._pilotEcho = [];
  sys._queueBlackHole();
  assert.equal(sys._pilotEcho.length, 0, 'nothing without the evolution');
});

test('Mining: Steady Beam doubles the share of everything but silicate slag, on the same rng draws', async () => {
  const { mining } = await import('../src/systems/mining.js');
  const roll = (richer) => {
    let seed = 1;
    const state = { rng: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; } };
    const sys = Object.create(mining);
    sys.state = state;
    const def = { oreTable: { cmdty_silicate: 0.7, cmdty_ore_iron: 0.3 }, tierCap: 4 };
    let iron = 0;
    for (let i = 0; i < 4000; i++) if (sys._rollOre(def, { data: {} }, richer) === 'cmdty_ore_iron') iron += 1;
    return iron / 4000;
  };
  const plain = roll(false);
  const steady = roll(true);
  assert.ok(Math.abs(plain - 0.3) < 0.03, `plain iron share ${plain}`);
  assert.ok(Math.abs(steady - 0.6 / 1.3) < 0.03, `Steady Beam iron share ${steady}`);
});
