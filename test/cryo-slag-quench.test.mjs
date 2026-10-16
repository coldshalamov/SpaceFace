import assert from 'node:assert/strict';
import test from 'node:test';

import { applyCryoQuench } from '../src/systems/weapons.js';
import {
  CRYO_QUENCH,
  adventureMaterialFor,
  environmentMaterialOf,
  stampEnvironmentMaterial,
} from '../src/data/environmentMaterials.js';

const DT = 1 / 60;

function harness({ typeId = 'ast_icy', headId = 'frame_coupler', active = true } = {}) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 90,
    data: {
      weapons: [{ defId: 'wpn_heavy_beam_l', _heat: 80, _cooldown: 0, heatMax: 100, heatDissip: 20 }],
    },
  };
  const rock = {
    id: 2,
    type: 'asteroid',
    alive: true,
    pos: { x: -200, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 14,
    mass: 900,
    data: { typeId, materialCondition: { heat: 0, reacted: false } },
  };
  stampEnvironmentMaterial(rock);
  const entities = new Map([[player.id, player], [rock.id, rock]]);
  const state = {
    tick: 0,
    simTime: 0,
    playerId: player.id,
    entities,
    entityList: [player, rock],
    combat: {
      attachments: {
        nextId: 2,
        byId: {
          att_000001: {
            id: 'att_000001',
            defId: 'tether_standard',
            ownerId: player.id,
            targetId: rock.id,
            state: active ? 'active' : 'broken',
            restLength: 200,
            lastTension: 0,
            tetherPolicy: headId ? { headId } : {},
          },
        },
      },
    },
  };
  const thermalCalls = [];
  const fields = { registerThermal(spec) { thermalCalls.push(spec); return { id: spec.id }; } };
  const events = [];
  const hooks = { fields, emit: (type, payload) => events.push({ type, payload }) };
  return { state, player, rock, fields, thermalCalls, events, hooks };
}

test('icy asteroids are the cryo material on the ordinary route', () => {
  for (const slot of [0, 3, 7, 12, 31]) {
    assert.equal(adventureMaterialFor('ast_icy', 4242, 'f_helios_outer', slot), 'cryo',
      `ast_icy slot ${slot} must resolve as cryo ice`);
  }
  assert.equal(environmentMaterialOf({ type: 'asteroid', data: { typeId: 'ast_icy' } }), 'cryo');
  const stamped = stampEnvironmentMaterial({ type: 'asteroid', data: { typeId: 'ast_icy' } });
  assert.equal(stamped.name, 'Cryo ice');
  const rock = { type: 'asteroid', data: { typeId: 'ast_icy' } };
  stampEnvironmentMaterial(rock);
  assert.equal(rock.data.cryoReserve, CRYO_QUENCH.cryoReserve, 'fresh cryo ice carries its authored cold reserve');
  // Common rock keeps its deterministic pocket bucket — the quench does not redraw the field.
  assert.ok(['rock', 'metal', 'crystal', 'volatile'].includes(adventureMaterialFor('ast_common_rock', 4242, 'f_x', 5)));
});

test('a coupled overheated hull sheds at the authored rate only while contact holds', () => {
  const h = harness();
  const weapon = h.player.data.weapons[0];
  assert.equal(weapon._heat, 80);

  for (let tick = 0; tick < 60; tick += 1) {
    h.state.tick = tick;
    applyCryoQuench(h.state, h.player, DT, h.hooks);
  }
  const expectedHeat = 80 - CRYO_QUENCH.heatPerSecPerMount;
  assert.ok(Math.abs(weapon._heat - expectedHeat) < 1e-9,
    `one second of coupling sheds exactly the authored rate; got ${weapon._heat}, want ${expectedHeat}`);
  const shedTotal = CRYO_QUENCH.heatPerSecPerMount;
  assert.ok(Math.abs(h.rock.data.cryoReserve - (CRYO_QUENCH.cryoReserve - shedTotal * CRYO_QUENCH.reservePerHeat)) < 1e-9,
    'the rock pays for every unit shed');
  assert.ok(Math.abs(h.rock.data.materialCondition.heat - shedTotal * CRYO_QUENCH.rockHeatPerHeat) < 1e-9,
    'the absorbed heat lands on the rock through the ordinary thermal-state owner');

  assert.ok(h.thermalCalls.length > 0, 'the plume paints through the thermal-field grammar');
  assert.equal(h.thermalCalls[0].thermal.kind, 'coolant');
  assert.equal(h.thermalCalls[0].id, `cryo_quench:${h.rock.id}`);
  assert.ok(h.events.some((row) => row.type === 'weapons:cryoQuench' && row.payload.reserve > 0),
    'the quench publishes its receipt');

  // Contact lost — the line is cut — and the shed stops mid-fight.
  h.state.combat.attachments.byId.att_000001.state = 'broken';
  for (let tick = 60; tick < 120; tick += 1) {
    h.state.tick = tick;
    applyCryoQuench(h.state, h.player, DT, h.hooks);
  }
  assert.ok(Math.abs(weapon._heat - expectedHeat) < 1e-9, 'a broken line sheds nothing');
});

test('the same coupling to ordinary rock, a plain rope, and spent ice all do nothing', () => {
  const ordinary = harness({ typeId: 'ast_common_rock' });
  assert.equal(applyCryoQuench(ordinary.state, ordinary.player, 1, ordinary.hooks), false);
  assert.equal(ordinary.player.data.weapons[0]._heat, 80);
  assert.equal(ordinary.thermalCalls.length, 0);

  const plainRope = harness({ headId: null });
  assert.equal(applyCryoQuench(plainRope.state, plainRope.player, 1, plainRope.hooks), false);
  assert.equal(plainRope.player.data.weapons[0]._heat, 80);

  const spent = harness();
  spent.rock.data.cryoReserve = 0;
  assert.equal(applyCryoQuench(spent.state, spent.player, 1, spent.hooks), false);
  assert.equal(spent.player.data.weapons[0]._heat, 80, 'drained ice is just rock');
});

test('a rock drained as a heat sink cracks apart through the ordinary fracture owner', () => {
  const h = harness();
  const weapon = h.player.data.weapons[0];
  let calls = 0;
  while (h.rock.data.cryoReserve > 0 && calls < 400) {
    weapon._heat = CRYO_QUENCH.heatPerSecPerMount; // a fresh overheat every call, as a hot fight would
    h.state.tick = calls;
    applyCryoQuench(h.state, h.player, 1, h.hooks);
    calls += 1;
  }
  assert.equal(h.rock.data.cryoReserve, 0, `the reserve must fully drain in bounded calls; got ${calls}`);
  assert.ok(h.rock.data.materialCondition.heat >= CRYO_QUENCH.fractureHeat,
    'a fully drained rock reaches its fracture heat');
  const reactions = h.state.materialReactions || [];
  assert.equal(reactions.length, 1, 'the fracture is queued exactly once through the material owner');
  assert.equal(reactions[0].material, 'cryo');
  assert.equal(h.rock.data.materialCondition.pending, true, 'the reaction is durable work, not an instant pop');
});
