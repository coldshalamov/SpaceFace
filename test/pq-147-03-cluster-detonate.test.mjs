// PQ-147.03 — Cluster and detonate.
// One action (plant a well) plus a primed light (PQ-137.09) produces the chain.
// Secondary consequences are counted from receipts, never from a scripted explode-all.
import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_DEFS, FIELD_FLAGS, FIELD_KINDS, WELL_CLUSTER } from '../src/data/fields.js';
import { wellUsesVelocityTerm } from '../src/core/fields/fieldKernel.js';
import {
  classifyClusterReceipt,
  mergeClusterSecondaries,
  rateClusterMoment,
  wellWithholdsVelocityTerm,
} from '../src/core/fields/clusterDetonate.js';
import { FIELD_VELOCITY_TERM_TYPES } from '../src/systems/fields.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { bootRealPath, writeRealPathInput, REAL_PATH_DT } from '../scripts/lib/bench/realPath.mjs';
import { CURVE_SYSTEMS } from '../scripts/lib/bench/scenarios/feel.hitstun_curve.mjs';

const SEEDS = Object.freeze([14703, 14713, 14723, 14733, 14743]);
const JITTER = Object.freeze([0, 5, -7, 8, -4]);
const PLAYER_HULL = 'ship_kestrel';
const LIGHT_HULL = 'ship_wasp';
const WELL_CENTER = Object.freeze({ x: 0, z: 0 });
const PLAYER_POS = Object.freeze({ x: -56, z: 0 });
const CHAIN_TICKS = 360;
const NEED = 3;
const PASS_SEEDS = 4;
const EVENT_ORDER = Object.freeze({
  'chain:slam': 0,
  'charge:detonated': 1,
  'combat:tumbled': 2,
  'combat:collisionConsequence': 3,
});

function withFieldsFlag(fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  return Promise.resolve()
    .then(fn)
    .finally(() => { FIELD_FLAGS.enabled = prev; });
}

function park(entity) {
  const data = entity.data || (entity.data = {});
  const intent = data.intent || (data.intent = {});
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.turnIntent = 0;
  intent.boost = false;
  intent.brake = false;
  intent.fire = false;
  intent.fireGroup = null;
}

function parkAll(list) {
  for (let i = 0; i < list.length; i++) park(list[i]);
}

function spawnCargo(host, pos) {
  return host.runtime.spawn({
    type: 'payload',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 5,
    mass: 8,
    collides: true,
    hull: 40,
    hullMax: 40,
    physicsBody: {
      schemaVersion: 1,
      radius: 5,
      mass: 8,
      inertiaY: 14,
      dynamic: true,
      ccd: true,
      material: 'asteroid',
      revision: 0,
    },
    data: { kind: 'payload', payloadType: 'jettisoned_cargo', commodityId: 'cmdty_ore_iron', amount: 4 },
  });
}

function armPrimedLight(host, player, light) {
  const charges = host.runtime.getSystem('impulseCharges');
  assert.ok(charges, 'impulseCharges is the PQ-137.09 primed-state writer');
  host.withFeatures(() => {
    const primed = charges._prime(light, host.state, { byId: player.id, reason: 'blast' });
    assert.equal(primed, true, 'setup may prime the light; the well is the one action');
  });
  host.runtime.spawn({
    type: 'charge',
    pos: { x: light.pos.x, z: light.pos.z + (light.radius || 10) },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 1.2,
    mass: 0.5,
    collides: false,
    team: player.team,
    ownerId: player.id,
    data: {
      kind: 'impulse_charge',
      chargeId: 'charge_standard',
      ownerId: player.id,
      hostId: light.id,
      localOffset: { x: 0, z: light.radius || 10 },
      localRot: 0,
      armed: true,
      spawnedAt: host.state.simTime,
    },
  });
}

async function runSeed(seed, jitterZ) {
  return withFieldsFlag(async () => {
    const host = await bootRealPath({
      seed,
      systems: [...CURVE_SYSTEMS, stuntGrammar],
      hulls: [{
        hullId: PLAYER_HULL,
        pos: { x: PLAYER_POS.x, z: PLAYER_POS.z },
        rot: 0,
        isPlayer: true,
        factionId: 'faction_free',
      }],
    });

    try {
      const state = host.state;
      const player = host.player;
      const light = host.spawnShip({
        hullId: LIGHT_HULL,
        pos: { x: -38, z: jitterZ },
        rot: 0,
        team: 1,
      });
      const cluster = [
        host.spawnShip({ hullId: LIGHT_HULL, pos: { x: 22, z: jitterZ }, rot: 0, team: 1 }),
        host.spawnShip({ hullId: LIGHT_HULL, pos: { x: 24, z: 26 + jitterZ }, rot: 0, team: 1 }),
        host.spawnShip({ hullId: LIGHT_HULL, pos: { x: 24, z: -26 + jitterZ }, rot: 0, team: 1 }),
      ];
      const cargo = [
        spawnCargo(host, { x: 6, z: 14 + jitterZ }),
        spawnCargo(host, { x: 6, z: -14 + jitterZ }),
      ];
      const rock = host.spawnObstacle({
        pos: { x: 46, z: jitterZ },
        radius: 16,
        mass: 420,
        dynamic: false,
      });

      const cast = [player, light, ...cluster, ...cargo];
      const cargoIds = new Set(cargo.map((e) => e.id));
      const terrainIds = new Set([rock.id]);

      const rec = {
        detonations: [],
        slams: [],
        primed: [],
        tumbled: [],
        collisions: [],
        flings: [],
        captures: [],
        ratings: [],
        tricks: [],
      };
      host.bus.on('charge:detonated', (p) => rec.detonations.push({ tick: state.tick | 0, ...p }));
      host.bus.on('chain:detonated', (p) => rec.detonations.push({ tick: state.tick | 0, trigger: 'sympathetic', ...p }));
      host.bus.on('chain:slam', (p) => rec.slams.push({ tick: state.tick | 0, ...p }));
      host.bus.on('chain:primed', (p) => rec.primed.push({ tick: state.tick | 0, ...p }));
      host.bus.on('combat:tumbled', (p) => rec.tumbled.push({ tick: state.tick | 0, ...p }));
      host.bus.on('combat:collisionConsequence', (p) => rec.collisions.push({ tick: state.tick | 0, ...p }));
      host.bus.on('well:fling', (p) => rec.flings.push({ tick: state.tick | 0, ...p }));
      host.bus.on('well:capture', (p) => rec.captures.push({ tick: state.tick | 0, ...p }));
      host.bus.on('fields:clusterDetonate', (p) => rec.ratings.push(p));
      host.bus.on('stunt:trickDetected', (p) => rec.tricks.push(p && p.trickId));

      let ticks = host.step(1, { before: () => { writeRealPathInput(state, {}); parkAll(cast); } });
      host.assertBodies(cast, 'PQ-147.03 cluster cast');
      const proof = host.proof();
      if (proof.sg02Ready !== true || proof.backend !== 'rapier-dynamic') {
        throw new Error(`PQ-147.03: real path is not ready (${proof.backend}, sg02=${proof.sg02Ready})`);
      }

      armPrimedLight(host, player, light);
      const charges = host.runtime.getSystem('impulseCharges');
      assert.equal(charges.isPrimed(light, state), true, 'the light is primed before the well is planted');

      let deployed = false;
      let actionTick = -1;
      ticks += host.step(CHAIN_TICKS, {
        before: () => {
          writeRealPathInput(state, {});
          parkAll([...cast, rock]);
          state.input.aimWorld = { x: WELL_CENTER.x, z: WELL_CENTER.z };
          if (!deployed) {
            state.input.actions.deployWell = true;
            deployed = true;
            actionTick = state.tick | 0;
          }
        },
      });

      const fieldsRt = state.fields || {};
      const wellLive = Array.isArray(fieldsRt.snapshot)
        && fieldsRt.snapshot.some((f) => f && f.kind === FIELD_KINDS.WELL);
      assert.equal(deployed, true, 'the one action is planting the well');
      assert.ok(wellLive || rec.flings.length > 0 || rec.captures.length > 0 || rec.detonations.length > 0,
        'the well had to exist on the route (FIELD_FLAGS.enabled)');

      const ctx = {
        primedId: light.id,
        playerId: player.id,
        actionTick,
        cargoIds,
        terrainIds,
        primedTumbled: false,
        chainStarted: false,
        entityOf: (id) => state.entities.get(id),
      };
      // Tick order matches the live moment detector. Batching detonations first would
      // mark the chain started and then credit earlier collision tumbles as secondaries.
      const timeline = [];
      const pushAll = (name, rows) => {
        for (let i = 0; i < rows.length; i++) timeline.push({ name, row: rows[i] });
      };
      pushAll('chain:slam', rec.slams);
      pushAll('charge:detonated', rec.detonations);
      pushAll('combat:tumbled', rec.tumbled);
      pushAll('combat:collisionConsequence', rec.collisions);
      timeline.sort((a, b) => {
        const tick = (a.row.tick | 0) - (b.row.tick | 0);
        if (tick !== 0) return tick;
        return eventOrder(a.name) - eventOrder(b.name);
      });
      let secondaries = [];
      for (let i = 0; i < timeline.length; i++) {
        secondaries = mergeClusterSecondaries(
          secondaries,
          classifyClusterReceipt(timeline[i].name, timeline[i].row, ctx),
        );
      }

      const rating = rateClusterMoment(secondaries);
      const live = rec.ratings[0] || null;
      const liveFinal = fieldsRt.cluster && Number.isFinite(fieldsRt.cluster.count)
        ? fieldsRt.cluster.count
        : 0;
      const kinds = rating.kinds.join(',');
      return {
        seed,
        secondaries: rating.count,
        kinds,
        kindList: rating.kinds,
        pass: rating.count >= NEED && liveFinal >= NEED && !!live,
        detonations: rec.detonations.length,
        slams: rec.slams.length,
        flings: rec.flings.length,
        captures: rec.captures.length,
        ratedEvent: !!live,
        liveCount: live ? live.count : 0,
        liveFinal,
        liveKinds: live && live.kinds ? live.kinds.join(',') : '',
        tricks: rec.tricks.slice(),
        causal: secondaries.map((row) => `${row.kind}@t${row.tick}: ${row.detail}`),
        ticks,
        dt: REAL_PATH_DT,
        wellEquilibrium: FIELD_DEFS.well.strength / FIELD_DEFS.well.damping,
      };
    } finally {
      host.dispose();
    }
  });
}

function eventOrder(name) {
  const order = EVENT_ORDER[name];
  return Number.isFinite(order) ? order : 9;
}

function printTable(rows) {
  console.log('PQ-147.03 cluster-and-detonate seed table');
  console.log('seed\tsecondaries\tliveFirst\tliveFinal\tkinds\tpass');
  for (const row of rows) {
    console.log(`${row.seed}\t${row.secondaries}\t${row.liveCount}\t${row.liveFinal}\t${row.kinds || '-'}\t${row.pass ? 'YES' : 'no'}`);
  }
  const passed = rows.filter((row) => row.pass).length;
  console.log(`${passed}/${rows.length} seeds ≥ ${NEED} secondaries`);
  return passed;
}

test('PQ-137.09 primed-light seam is present; primed lights skip well convergence', () => {
  assert.ok(WELL_CLUSTER.secondaryKinds.includes('other_body_hit'));
  assert.ok(WELL_CLUSTER.secondaryKinds.includes('cargo_thrown'));
  assert.ok(WELL_CLUSTER.secondaryKinds.includes('second_tumble'));
  assert.ok(WELL_CLUSTER.secondaryKinds.includes('terrain_slam'));
  assert.equal(wellWithholdsVelocityTerm(true), true);
  assert.equal(wellUsesVelocityTerm({ primed: true }), false);
  assert.equal(wellUsesVelocityTerm({ primed: false }), true);
  assert.ok(FIELD_VELOCITY_TERM_TYPES.has('ship'));
  const equilibrium = FIELD_DEFS.well.strength / FIELD_DEFS.well.damping;
  assert.ok(equilibrium >= 30 && equilibrium <= 60, 'unmarked craft still converge in the 137.09 band');
});

test('receipt classifier counts secondaries, not the primed light itself', () => {
  const ctx = {
    primedId: 7,
    playerId: 1,
    actionTick: 10,
    cargoIds: new Set([20]),
    terrainIds: new Set([30]),
    primedTumbled: false,
    chainStarted: false,
  };
  const blast = classifyClusterReceipt('charge:detonated', {
    tick: 20, trigger: 'slam', hostId: 7, hits: [8, 9, 20, 1, 7],
  }, ctx);
  assert.equal(ctx.chainStarted, true);
  const kinds = blast.map((row) => row.kind).sort();
  assert.deepEqual(kinds, ['cargo_thrown', 'other_body_hit', 'other_body_hit']);
  const firstTumble = classifyClusterReceipt('combat:tumbled', { tick: 21, victimId: 7, source: 'impulse_charge' }, ctx);
  assert.equal(firstTumble.length, 0);
  const second = classifyClusterReceipt('combat:tumbled', { tick: 22, victimId: 8, source: 'impulse_charge' }, ctx);
  assert.equal(second[0].kind, 'second_tumble');
  const slam = classifyClusterReceipt('combat:collisionConsequence', {
    tick: 23, targetId: 8, otherId: 30, surface: 'terrain',
  }, ctx);
  assert.equal(slam[0].kind, 'terrain_slam');
  const rating = rateClusterMoment(mergeClusterSecondaries(mergeClusterSecondaries(blast, second), slam));
  assert.equal(rating.count, 5);
  assert.equal(rating.rated, true);
});

test('PQ-147.03: well + primed light yields ≥ 3 secondaries in 4 of 5 seeds', async (t) => {
  t.diagnostic('boots the real rapier-dynamic path five times; allow a couple of minutes');
  const rows = [];
  for (let i = 0; i < SEEDS.length; i++) {
    const row = await runSeed(SEEDS[i], JITTER[i]);
    rows.push(row);
    t.diagnostic(`seed ${row.seed}: ${row.secondaries} liveFirst=${row.liveCount} liveFinal=${row.liveFinal} [${row.kinds}] det=${row.detonations} fling=${row.flings} rated=${row.ratedEvent}`);
    t.diagnostic(`  ${row.causal.join(' | ')}`);
  }
  const passed = printTable(rows);
  assert.ok(passed >= PASS_SEEDS,
    `need ${PASS_SEEDS} of ${SEEDS.length} seeds with ≥ ${NEED} secondaries; got ${passed}. `
    + rows.map((row) => `${row.seed}:${row.secondaries}(${row.kinds})`).join(' | '));
});
