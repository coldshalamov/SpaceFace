import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { vfx } from '../src/render/vfx.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { combat } from '../src/systems/combat.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';

function targetShip() {
  const mass = 22;
  const radius = 7;
  return {
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    collides: true,
    pos: { x: 48, z: 0 },
    vel: { x: 0, z: 0 },
    rot: Math.PI,
    angVel: 0,
    radius,
    mass,
    hull: 1000,
    hullMax: 1000,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    capRegen: 0,
    flags: {},
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: mass * radius * radius * 0.5,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      derived: { damageReductionMult: 1 },
      combat: {},
      weapons: [],
    },
  };
}

async function runPhysicalRam(withPlate, seed) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: [physics, combat, collisionConsequences],
    updateOrder: [physics, combat, collisionConsequences],
  });
  const { state, bus } = sim;
  const physicsSystem = sim.registry.get('physics');
  try {
    state.mode = 'flight';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const fittings = fittingsFromDefaultModules('ship_hitch', withPlate ? ['mod_ram_plate'] : []);
    const player = sim.spawn(makeShipEntitySpec('ship_hitch', {
      isPlayer: true,
      team: 0,
      factionId: 'faction_free',
      pos: { x: 0, z: 0 },
      rot: 0,
      fittings,
    }));
    player.hull = 1000;
    player.hullMax = 1000;
    player.shield = 0;
    player.shieldMax = 0;
    player.armorHp = 0;
    player.armorMax = 0;
    player.armorFlat = 0;
    player.vel.set(82, 0, 0);
    const target = sim.spawn(targetShip());
    state.playerId = player.id;
    const impacts = [];
    const consequences = [];
    bus.on('physics:impact', (payload) => impacts.push(structuredClone(payload)));
    bus.on('combat:collisionConsequence', (payload) => consequences.push(structuredClone(payload)));
    assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true);

    for (let tick = 0; tick < 150 && (player.hull === 1000 || target.hull === 1000); tick++) {
      sim.step(SIM_DT);
    }
    const physical = impacts.find((payload) => {
      const ids = new Set([payload.aId, payload.bId]);
      return payload.backend === 'rapier-dynamic' && ids.has(player.id) && ids.has(target.id);
    });
    assert.ok(physical, 'the comparison begins with a real Rapier craft contact');
    const dealtReceipt = consequences.find((payload) => payload.targetId === target.id);
    const takenReceipt = consequences.find((payload) => payload.targetId === player.id);
    assert.ok(dealtReceipt && takenReceipt, 'the contact resolves through both Combat directions');
    return {
      dealt: 1000 - target.hull,
      taken: 1000 - player.hull,
      dealtReceipt,
      takenReceipt,
    };
  } finally {
    physicsSystem?._disableSg02DynamicAuthority?.();
    sim.dispose();
  }
}

test('Ram Plate deals more, takes less, and drives one hard bow-contact scar', async (t) => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previous; });

  const bare = await runPhysicalRam(false, 0x450101);
  const plated = await runPhysicalRam(true, 0x450101);
  assert.ok(bare.dealt > 0 && bare.taken > 0,
    `bare craft contact has a real two-way damage baseline (dealt=${bare.dealt}, taken=${bare.taken})`);
  assert.ok(plated.dealt > bare.dealt * 1.35,
    `the plate materially raises physical bow damage (${bare.dealt} -> ${plated.dealt})`);
  assert.ok(plated.taken < bare.taken * 0.75,
    `the plate materially reduces incoming collision damage (${bare.taken} -> ${plated.taken})`);
  assert.equal(plated.dealtReceipt.provenance.weaponId, 'mod_ram_plate');
  assert.equal(plated.takenReceipt.damageTakenMultiplier, 0.55);

  const scene = new THREE.Scene();
  const bus = createBus();
  const state = {
    playerId: plated.dealtReceipt.otherId,
    entities: new Map(),
    entityList: [],
    player: {},
    settings: {
      video: { particleQuality: 'low', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    render: { scene, frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    content: {},
  };
  const renderer = Object.create(vfx);
  renderer.init({ state, bus, helpers: {} });
  try {
    bus.emit('combat:collisionConsequence', plated.dealtReceipt);
    const scar = renderer._ramPlateScar;
    assert.ok(scar, 'the production VFX owner initializes the Ram Plate scar pool');
    assert.equal(scar.update(0.05), 1);
    const inspection = scar.inspect();
    assert.deepEqual({
      active: inspection.active,
      hardMeshes: inspection.hardMeshes,
      sprites: inspection.sprites,
      points: inspection.points,
      transparentMaterials: inspection.transparentMaterials,
      lastSourceId: inspection.lastSourceId,
    }, {
      active: 1,
      hardMeshes: 36,
      sprites: 0,
      points: 0,
      transparentMaterials: 0,
      lastSourceId: plated.dealtReceipt.otherId,
    });
    const visibleSlot = scar.group.children.find((child) => child.visible);
    assert.ok(visibleSlot && visibleSlot.children.length === 6);
    assert.ok(visibleSlot.children.every((child) => child.isMesh
      && child.material.transparent === false),
    'the scar is opaque, depth-writing hard geometry rather than a card or point spray');
  } finally {
    renderer.destroy();
  }
});
