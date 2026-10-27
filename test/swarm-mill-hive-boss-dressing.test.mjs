// SWARM-07 B4 follow-through — the Asteroid Mill and the Hive joined ARENA_MODULE_LIBRARY
// carrying authored bossRole rows (seam_crusher / queen_warden), but the dressing tables
// only named the four original law arenas, so their wave-10 champions fielded bare.
//
// Done when: LAW_ARENA_BOSS_ROLES resolves both library rows on the same hull+role+law
// contract; BOSS_DRESSING_KINDS/BOSS_BUILDERS hang real geometry on both kinds; a real
// survivalWave run in each arena materializes the wave-10 dreadnought wearing its stamp;
// the four original arenas resolve unchanged; and the dressing is presentation-only — the
// stamped boss's hull, shield and weapons read byte-identical to an undressed one.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { HIVE_BOSS_ROLE, MILL_BOSS_ROLE } from '../src/data/arenaModuleLibrary.js';
import { MILL_ARENA_ID } from '../src/systems/asteroidMillArena.js';
import { HIVE_ARENA_ID } from '../src/systems/theHiveArena.js';
import { CINDER_ARENA_ID, CINDER_BOSS_ROLE } from '../src/systems/cinderSluiceArena.js';
import { CRYO_ARENA_ID, CRYO_BOSS_ROLE } from '../src/systems/cryoDriftArena.js';
import { LAGRANGE_ARENA_ID, LAGRANGE_BOSS_ROLE } from '../src/systems/lagrangeCrucible.js';
import { STORM_ARENA_ID, STORM_BOSS_ROLE } from '../src/systems/stormLatticeArena.js';
import { createLawArenaDressing } from '../src/render/lawArenaDressing.js';
import { lawArenaBossDressing, SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;
const SEED = 4242;

// The whole law-arena dressing table: arena id -> role row -> dressing kind.
const LAW_ARENAS = [
  [LAGRANGE_ARENA_ID, LAGRANGE_BOSS_ROLE, 'tidal_engine'],
  [CINDER_ARENA_ID, CINDER_BOSS_ROLE, 'chain_tug'],
  [CRYO_ARENA_ID, CRYO_BOSS_ROLE, 'manifold_warden'],
  [STORM_ARENA_ID, STORM_BOSS_ROLE, 'grid_tyrant'],
  [MILL_ARENA_ID, MILL_BOSS_ROLE, 'seam_crusher'],
  [HIVE_ARENA_ID, HIVE_BOSS_ROLE, 'queen_warden'],
];

function boot(wave, arenaId) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    routeCombatDamage(packet) { return packet; },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  state.run.arenaId = arenaId;
  state.run.phase = 'active';
  state.run.wave = wave;

  const ctx = { state, bus, helpers };
  survivalWave.init(ctx);
  swarmJuice.init(ctx);
  return { state, bus, emitted, spawned };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalWave.update(DT);
    swarmJuice.update(DT, h.state);
  }
}

function startWave(h, wave, arenaId) {
  const plan = planWave({ seed: SEED, arenaId, wave, ruleset: SWARM_RULESET });
  assert.ok(!plan.error, `${arenaId} wave ${wave} plans`);
  h.bus.emit('run:wavePlanned', { wave, plan });
  h.bus.emit('run:waveStarted', { wave });
  tick(h, 3);
  return plan;
}

function waveTenBoss(h) {
  const boss = h.spawned.find((e) => e.data && e.data.lootTableId === 'dreadnought_boss'
    && e.data.runCohort === SURVIVAL_COHORT_TAG);
  assert.ok(boss, 'the wave-10 dreadnought champion materialized');
  return boss;
}

// The stat surface a dressing must never touch — hull, shield, capacitor, flight and guns.
function combatStatSnapshot(entity) {
  return {
    hull: entity.hull,
    hullMax: entity.hullMax,
    armorHp: entity.armorHp,
    armorMax: entity.armorMax,
    armorFlat: entity.armorFlat,
    shield: entity.shield,
    shieldMax: entity.shieldMax,
    shieldRegenRate: entity.shieldRegenRate,
    cap: entity.cap,
    capMax: entity.capMax,
    capRegen: entity.capRegen,
    maxSpeed: entity.maxSpeed,
    combatSpeed: entity.combatSpeed,
    thrust: entity.thrust,
    turnRate: entity.turnRate,
    mass: entity.mass,
    radius: entity.radius,
    weapons: (entity.data.weapons || []).map((w) => ({ id: w.id, dmg: w.dmg, rof: w.rof })),
    visualTier: entity.data.visualTier,
    level: entity.data.level,
  };
}

function bossMesh() {
  const mesh = new THREE.Group();
  const hull = new THREE.Group();
  mesh.add(hull);
  mesh.userData.hull = hull;
  return mesh;
}

function meshesUnder(root) {
  const out = [];
  root.traverse((n) => { if (n.isMesh) out.push(n); });
  return out;
}

// ---- the role table ----

test('lawArenaBossDressing resolves all six law arenas on hull+role+law — the B4 pair included', () => {
  for (const [arenaId, role, kind] of LAW_ARENAS) {
    assert.deepEqual(
      lawArenaBossDressing(arenaId, role.hullId, role.role),
      { kind, law: arenaId },
      `${arenaId} stamps ${kind}`,
    );
  }
});

test('the B4 dressing contract stays exact — wrong hull, wrong role, wrong arena all refuse', () => {
  for (const [arenaId] of [[MILL_ARENA_ID], [HIVE_ARENA_ID]]) {
    assert.equal(lawArenaBossDressing(arenaId, 'wasp_swarmer', 'elite'), null,
      `${arenaId}: chaff never dresses`);
    assert.equal(lawArenaBossDressing(arenaId, 'dreadnought_boss', 'mass'), null,
      `${arenaId}: the role half of the contract binds, not just the hull`);
  }
  assert.equal(lawArenaBossDressing('helios_core', 'dreadnought_boss', 'elite'), null,
    'a non-law arena still fields the hull bare');
  assert.equal(lawArenaBossDressing(null, 'dreadnought_boss', 'elite'), null);
});

// ---- live materialization ----

test('the Asteroid Mill wave-10 boss materializes wearing seam_crusher through the real run', () => {
  const h = boot(10, MILL_ARENA_ID);
  const plan = startWave(h, 10, MILL_ARENA_ID);
  assert.equal(plan.swarm.bossId, 'iron_maw', 'wave 10 is the first rotation row');
  const boss = waveTenBoss(h);
  assert.equal(boss.data.swarmChampion, true, 'the boss is an owed champion');
  assert.equal(boss.data.missionTag, 'capital_boss', 'the score binds the dressed hull');
  assert.equal(boss.data.runRole, MILL_BOSS_ROLE.role, 'the elite package slot rode in');
  assert.deepEqual(boss.data.bossDressing, { kind: 'seam_crusher', law: MILL_ARENA_ID },
    'the authored dressing stamp is exactly { kind, law }');
});

test('the Hive wave-10 boss materializes wearing queen_warden through the real run', () => {
  const h = boot(10, HIVE_ARENA_ID);
  startWave(h, 10, HIVE_ARENA_ID);
  const boss = waveTenBoss(h);
  assert.equal(boss.data.swarmChampion, true);
  assert.equal(boss.data.runRole, HIVE_BOSS_ROLE.role);
  assert.deepEqual(boss.data.bossDressing, { kind: 'queen_warden', law: HIVE_ARENA_ID });
});

test('the four original law arenas still stamp their authored dressings live', () => {
  // One full run per arena would be slow; the lookup and one live materialization prove the
  // shared path is undisturbed — the other three are pinned by the table test above.
  const h = boot(10, LAGRANGE_ARENA_ID);
  startWave(h, 10, LAGRANGE_ARENA_ID);
  const boss = waveTenBoss(h);
  assert.deepEqual(boss.data.bossDressing, { kind: 'tidal_engine', law: LAGRANGE_ARENA_ID });
});

test('chaff inside a law arena never wears the boss dressing', () => {
  const h = boot(10, MILL_ARENA_ID);
  startWave(h, 10, MILL_ARENA_ID);
  const cohort = h.spawned.filter((e) => e.data && e.data.runCohort === SURVIVAL_COHORT_TAG);
  assert.ok(cohort.length > 1, 'the boss wave fields its reduced swarm too');
  const dressed = cohort.filter((e) => e.data.bossDressing != null);
  assert.equal(dressed.length, 1, 'exactly one body wears the stamp');
  assert.equal(dressed[0].data.lootTableId, 'dreadnought_boss');
});

test('the dressing is presentation-only — a dressed boss reads stat-identical to a bare one', () => {
  const bare = boot(10, 'helios_core');
  startWave(bare, 10, 'helios_core');
  const bareBoss = waveTenBoss(bare);
  assert.equal(bareBoss.data.bossDressing, undefined, 'helios is not a law arena');

  for (const arenaId of [MILL_ARENA_ID, HIVE_ARENA_ID]) {
    const h = boot(10, arenaId);
    startWave(h, 10, arenaId);
    const boss = waveTenBoss(h);
    assert.ok(boss.data.bossDressing != null, `${arenaId} boss is dressed`);
    assert.deepEqual(
      combatStatSnapshot(boss),
      combatStatSnapshot(bareBoss),
      `${arenaId}: dressing added no hull, shield, capacitor or weapon numbers`,
    );
    // The stamp is exactly the two keys the render layer reads — no combat fields hitchhike.
    assert.deepEqual(Object.keys(boss.data.bossDressing).sort(), ['kind', 'law']);
  }
});

// ---- the hung geometry ----

test('seam_crusher dressing attaches opposed grind wheels and the ore train, then releases on kill', () => {
  const dressing = createLawArenaDressing();
  const entity = {
    id: 'boss-mill', type: 'ship', alive: true, radius: 60,
    data: { bossDressing: { kind: 'seam_crusher', law: MILL_ARENA_ID } },
  };
  const mesh = bossMesh();
  dressing.updateBossDressing(entity, mesh, 0, DT, {});
  const group = mesh.userData.hull.children.find((c) => c.name === 'seam_crusher_dressing');
  assert.ok(group, 'dressing attached under the hull');
  const wheels = group.children.filter((c) => c.name === 'seam_grind_wheel');
  assert.equal(wheels.length, 2, 'the grind pair rides both flanks');
  assert.ok(group.children.some((c) => c.name === 'seam_ore_train'), 'the ore train rides the spine');
  for (let i = 1; i <= 90; i++) dressing.updateBossDressing(entity, mesh, i / 60, DT, {});
  assert.ok(wheels[0].rotation.z !== 0, 'grind wheels turn');
  assert.ok(Math.sign(wheels[0].rotation.z) !== Math.sign(wheels[1].rotation.z),
    'the opposed cones counter-rotate');
  const lumps = meshesUnder(group).filter((m) => m.name === 'seam_ore_lump');
  assert.equal(lumps.length, 5);
  for (const m of meshesUnder(group)) {
    assert.ok(m.geometry.type !== 'PlaneGeometry' && m.type !== 'Sprite', 'real geometry only');
  }
  entity.alive = false;
  for (let i = 0; i < 12; i++) dressing.updateBossDressing(entity, mesh, 2 + i * 0.1, 0.1, {});
  assert.equal(
    mesh.userData.hull.children.find((c) => c.name === 'seam_crusher_dressing'),
    undefined,
    'dressing detaches on kill',
  );
});

test('queen_warden dressing carries the sac clutch and orbiting attendants, seething', () => {
  const dressing = createLawArenaDressing();
  const entity = {
    id: 'boss-hive', type: 'ship', alive: true, radius: 60,
    data: { bossDressing: { kind: 'queen_warden', law: HIVE_ARENA_ID } },
  };
  const mesh = bossMesh();
  dressing.updateBossDressing(entity, mesh, 0, DT, {});
  const group = mesh.userData.hull.children.find((c) => c.name === 'queen_warden_dressing');
  assert.ok(group, 'dressing attached under the hull');
  const clutch = group.children.find((c) => c.name === 'queen_sac_clutch');
  assert.equal(clutch.children.filter((c) => c.name === 'queen_sac').length, 3, 'three sacs');
  const ring = group.children.find((c) => c.name === 'queen_attendant_ring');
  const pods = meshesUnder(ring).filter((m) => m.name === 'queen_attendant');
  assert.equal(pods.length, 4, 'four attendants on the ring');
  const sac = clutch.children.find((c) => c.name === 'queen_sac');
  const baseY = sac.scale.y;
  for (let i = 1; i <= 90; i++) dressing.updateBossDressing(entity, mesh, i / 60, DT, {});
  assert.ok(ring.rotation.x !== 0, 'the attendant ring orbits');
  assert.ok(Math.abs(sac.scale.y - baseY) > 1e-3, 'the sacs seethe off-phase');
  for (const m of meshesUnder(group)) {
    assert.ok(m.geometry.type !== 'PlaneGeometry' && m.type !== 'Sprite', 'real geometry only');
  }
  dressing.prune(new Set());
  assert.equal(mesh.userData.hull.children.find((c) => c.name === 'queen_warden_dressing'), undefined,
    'prune drops the record and its meshes');
});

test('the stamped kinds are the ones the render layer actually builds', () => {
  // The lookup and the geometry table share the role id — a kind that resolves but has no
  // builder would field a bare hull anyway. Drive the real stamp through updateBossDressing.
  const dressing = createLawArenaDressing();
  for (const [arenaId, role, kind] of LAW_ARENAS) {
    const stamp = lawArenaBossDressing(arenaId, role.hullId, role.role);
    assert.equal(stamp.kind, kind);
    const entity = {
      id: `boss-${arenaId}`, type: 'ship', alive: true, radius: 60,
      data: { bossDressing: stamp },
    };
    const mesh = bossMesh();
    dressing.updateBossDressing(entity, mesh, 0, DT, {});
    assert.ok(
      mesh.userData.hull.children.find((c) => c.name === `${kind}_dressing`),
      `${kind} hangs real geometry under the hull`,
    );
  }
});
