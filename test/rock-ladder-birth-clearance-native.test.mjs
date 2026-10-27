import assert from 'node:assert/strict';
import test from 'node:test';
import { world } from '../src/systems/world.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { SECTORS } from '../src/data/sectors.js';
import { killMachinesForSector } from '../src/data/environmentalMachinery.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import { ROCK_LADDER_RADII, rockTierForRadius } from '../src/data/rockSubstances.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import scenario from '../src/data/scenarios/47a.scenario.json' with { type: 'json' };

const SECTOR = SECTORS.find(row => row.id === 'sector_helios_prime');
const FIELD = SECTOR.fields.find(row => row.id === 'f_helios_starter');
const MACHINE = killMachinesForSector(SECTOR.id).find(row => row.id === 'helios_claim_cracker');

function fixture(machineFirst = false) {
  const state = { tick: 0, simTime: 0, meta: { seed: 4242 }, nextEntityId: 1,
    world: {}, entities: new Map(), entityList: [],
    rng() { assert.fail('ladder placement must not consume the shared RNG'); } };
  const helpers = { hash32, mulberry32, spawnEntity(spec) {
    const entity = { id: state.nextEntityId++, alive: true, rot: 0, angVel: 0,
      vel: { x: 0, z: 0 }, ...spec };
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  } };
  const system = Object.create(world); system.state = state; system.helpers = helpers;
  const anchors = Object.create(terrainAnchors); anchors.state = state; anchors.helpers = helpers;
  const active = { dressing: [] };
  const materialize = () => [
    anchors._ensureKillMachineAnvil({ ...MACHINE.anvil, machineId: MACHINE.id }),
    system._spawnPlaceProp(active, SECTOR, MACHINE.placeId, MACHINE.globalPos,
      { rot: MACHINE.rot, name: MACHINE.mouth.name, radius: MACHINE.mouth.radius, worldOneOff: true }),
  ];
  const params = { tierCap: 4, _homeSectorId: SECTOR.id };
  for (const boulder of FIELD.boulders) system._spawnAuthoredBoulder(SECTOR, FIELD, params, boulder);
  let machines;
  if (machineFirst) machines = materialize();
  const ids = [];
  system._ensureRockLadderBedrock(SECTOR, FIELD, params, FIELD.center, FIELD.clusterRadius, FIELD.count, ids);
  if (!machineFirst) machines = materialize();
  const rocks = state.world.asteroidField.rocks;
  const ladder = rocks.filter(row => row.data.authoredBoulderId?.startsWith(`ladder_${FIELD.id}_`));
  return { state, rocks, ladder, machines };
}

function rungSnapshot(rows) {
  return rows.map(row => ({ slot: row.data.asteroidSlotId, radius: row.radius, mass: row.mass,
    pos: { ...row.pos }, vel: { ...row.vel }, angVel: row.angVel }));
}

test('seed 4242 ladder keeps every authored rung and clears dormant peers before machines materialize', () => {
  const before = fixture(true), after = fixture(false);
  assert.deepEqual(rungSnapshot(before.ladder), rungSnapshot(after.ladder), 'machine adapter order must not alter bedrock');
  assert.deepEqual([0, 1, 2, 3, 4].map(tier => after.ladder.filter(row => rockTierForRadius(row.radius) === tier).length),
    [6, 0, 3, 6, 6], '42 scatter bodies and the three existing authored boulders still count toward their bands');
  for (const rung of after.ladder) {
    assert.equal(rung.radius, ROCK_LADDER_RADII[rockTierForRadius(rung.radius)]);
    assert.deepEqual(rung.vel, { x: 0, z: 0 }); assert.equal(rung.angVel, 0);
    const radius = asteroidColliderRadius(rung.data.typeId, rung.radius);
    for (const other of after.rocks) {
      if (other === rung) continue;
      assert.ok(Math.hypot(rung.pos.x - other.pos.x, rung.pos.z - other.pos.z)
        >= radius + asteroidColliderRadius(other.data.typeId, other.radius) + 4,
      `${rung.data.asteroidSlotId} overlaps dormant ${other.data.asteroidSlotId}`);
    }
    assert.ok(Math.hypot(rung.pos.x - MACHINE.globalPos.x, rung.pos.z - MACHINE.globalPos.z)
      >= radius + MACHINE.hazardRadius + 4, `${rung.data.asteroidSlotId} starts in the cracker envelope`);
  }
});

test('all dormant ladder rungs compile clear of real machine proxies and stay still through the native first solve', async () => {
  const { rocks, ladder, machines } = fixture(false);
  // Compile every rung explicitly; a rung outside the active promotion radius must not make this check vacuous.
  const entities = rocks.map(row => ({ ...row, data: { ...row.data }, pos: { ...row.pos }, vel: { ...row.vel },
    physicsBody: { radius: asteroidColliderRadius(row.data.typeId, row.radius) } })).concat(machines);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities(entities);
    for (const entity of entities) assert.ok(owner.records.has(entity.id), `native body missing for ${entity.id}`);
    const rungIds = new Set(ladder.map(row => row.id));
    for (const id of rungIds) {
      const a = owner.records.get(id);
      for (const b of owner.records.values()) {
        if (a === b) continue;
        for (const ca of a.colliders) for (const cb of b.colliders) {
          const contact = ca.shape.contactShape(ca.translation(), ca.rotation(), cb.shape, cb.translation(), cb.rotation(), 0);
          assert.ok(!contact || contact.distance >= -0.001,
            `${a.entity.data.asteroidSlotId} penetrates ${b.entity.data.asteroidSlotId || b.entity.data.placeId || b.entity.data.killMachineAnvilId}: ${contact?.distance}`);
        }
      }
    }
    owner.step(1 / 60, 1);
    for (const id of rungIds) {
      const velocity = owner.records.get(id).body.linvel();
      assert.ok(Math.hypot(velocity.x, velocity.z) < 1e-6, `${id} received a birth depenetration kick`);
    }
  } finally { owner.dispose(); }
});


test('seed 4242 scatter slot 25 is born clear of its later authored boulder at the native owner', async () => {
  const lane = createSimHost();
  let owner;
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      viewport: { w: 1280, h: 720 }, scenarioContract: scenario });
    const ring = createSimCommandRing();
    pushLaneCommand(ring, { kind: 'rpc', id: 'boot', op: 'newGameBoot', args: { opts: { seed: 4242 } } });
    await lane.tick({ tick: 1, steps: 0, ackEnd: init.initRebuild?.end ?? 0,
      commands: structuredClone(ring.drain()) });
    const state = lane.host.state;
    const rows = state.world.asteroidField.rocks;
    const scatter = rows.find(row => row.data.fieldId === FIELD.id && row.data.asteroidSlotId === '25');
    const boulder = rows.find(row => row.data.authoredBoulderId === 'helios_boulder_mid');
    assert.ok(scatter && boulder, 'both physical resource identities must exist before their first sim step');
    assert.deepEqual(boulder.pos, { x: 830, z: -180 }, 'the authored landmark keeps its exact position');
    assert.equal(boulder.radius, 17);
    assert.ok(Math.abs(scatter.radius - 11.640394592657685) < 1e-9, 'scatter still consumes the same size draw');
    const entities = [scatter, boulder].map(row => ({ ...row, data: { ...row.data },
      pos: { ...row.pos }, vel: { ...row.vel },
      physicsBody: { radius: asteroidColliderRadius(row.data.typeId, row.radius) } }));
    owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
    owner.syncFromEntities(entities);
    const [a, b] = entities.map(row => owner.records.get(row.id));
    assert.ok(a?.colliders.length && b?.colliders.length, 'both actual native resource proxies must compile');
    for (const ca of a.colliders) for (const cb of b.colliders) {
      const contact = ca.shape.contactShape(ca.translation(), ca.rotation(), cb.shape, cb.translation(), cb.rotation(), 0);
      assert.ok(!contact || contact.distance >= -0.001,
        `scatter25 penetrates helios_boulder_mid at birth: ${contact?.distance}`);
    }
    // Isolate birth geometry from the authored cracker/NPC fields, whose real impulses remain unchanged.
    owner.step(1 / 60, 1);
    for (const record of [a, b]) {
      const velocity = record.body.linvel();
      assert.ok(Math.hypot(velocity.x, velocity.z) < 1e-6, 'the ordinary first solve must not create a birth kick');
    }
  } finally { owner?.dispose(); await lane.shutdown(); }
});


test('seed 4242 scatter slot 21 is born clear of the later cracker mouth at its real native skin', async () => {
  const lane = createSimHost();
  let owner;
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      viewport: { w: 1280, h: 720 }, scenarioContract: scenario });
    const ring = createSimCommandRing();
    pushLaneCommand(ring, { kind: 'rpc', id: 'boot', op: 'newGameBoot', args: { opts: { seed: 4242 } } });
    await lane.tick({ tick: 1, steps: 0, ackEnd: init.initRebuild?.end ?? 0,
      commands: structuredClone(ring.drain()) });
    const scatter = lane.host.state.world.asteroidField.rocks.find(row =>
      row.data.fieldId === FIELD.id && row.data.asteroidSlotId === '21');
    assert.ok(scatter, 'the same budgeted scatter slot must remain present');
    assert.ok(Math.abs(scatter.radius - 9.021392384544015) < 1e-9, 'the scatter size draw stays unchanged');
    const mouth = fixture(false).machines[1];
    assert.equal(mouth.data.placeId, MACHINE.placeId);
    assert.deepEqual(mouth.pos, MACHINE.globalPos, 'the cracker keeps its authored position');
    const rock = { ...scatter, data: { ...scatter.data }, pos: { ...scatter.pos }, vel: { ...scatter.vel },
      physicsBody: { radius: asteroidColliderRadius(scatter.data.typeId, scatter.radius) } };
    owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
    owner.syncFromEntities([rock, mouth]);
    const a = owner.records.get(rock.id), b = owner.records.get(mouth.id);
    assert.ok(a?.colliders.length && b?.colliders.length, 'both real native skins must compile');
    for (const ca of a.colliders) for (const cb of b.colliders) {
      const contact = ca.shape.contactShape(ca.translation(), ca.rotation(), cb.shape, cb.translation(), cb.rotation(), 0);
      assert.ok(!contact || contact.distance >= -0.001, `scatter21 penetrates the cracker mouth: ${contact?.distance}`);
    }
    owner.step(1 / 60, 1);
    const velocity = a.body.linvel();
    assert.ok(Math.hypot(velocity.x, velocity.z) < 1e-6, 'the first solve must not eject scatter from the machine');
  } finally { owner?.dispose(); await lane.shutdown(); }
});
