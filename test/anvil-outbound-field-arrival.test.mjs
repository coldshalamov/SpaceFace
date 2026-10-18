import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { fields } from '../src/systems/fields.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { ANVIL_WORK } from '../src/systems/anvilWork.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

const trafficWork = { ...traffic, update(dt, state) { this._stepAnvilWork(dt, state); } };
const worldRecords = { name: 'world', init(ctx) { this.state = ctx.state; },
  upsertWorldRecord: world.upsertWorldRecord };

test('outbound collector reaches its authored skim waypoint against the native planetary well', async t => {
  const prior = [PLANET_FLAGS.enabled, FIELD_FLAGS.enabled];
  PLANET_FLAGS.enabled = true; FIELD_FLAGS.enabled = true;
  // Production owner order: flight emits drive forces before fields, then native physics.
  const sim = createSimulation({ seed: 424214,
    systems: [worldRecords, trafficWork, flightV3, fields, planetRuntime, physics] });
  t.after(() => { sim.dispose(); [PLANET_FLAGS.enabled, FIELD_FLAGS.enabled] = prior; });
  const state = sim.state;
  state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  sim.step();
  const collector = state.entities.get(state.planet.witnessId);
  assert.ok(collector);
  assert.equal(collector.data.itinerary.phase, 'outbound');
  const center = state.planet.center;
  const target = { x: center.x + ANVIL_WORK.radius, z: center.z };
  // Explicit fixture setup, before native admission: the actual stalled endpoint's relative
  // pose and motion. This fixture is not a replay or a claim about live harvest/thermal history.
  collector.pos = { x: center.x + 935.740600585938, z: center.z - 6.7646484375 };
  collector.vel = { x: 2.14989972114563, z: -0.5634666085243225 };
  collector.rot = 0.14024232597141023; collector.angVel = 0.02551853284239769;
  const observer = sim.spawn({ type: 'ship', isPlayer: true, team: 0, hull: 100,
    pos: { x: center.x + 1400, z: center.z + 250 }, collides: false, physicsBody: false });
  state.playerId = observer.id;
  const facade = sim.registry.get('physics');
  assert.equal(await facade.prepareBackend(state), true);
  const canonical = makeShipEntitySpec('ship_mule');
  const hull = collector.hull, shield = collector.shield;
  let ticks = 0, closest = Infinity;
  while (ticks < 600 && collector.data.itinerary.phase === 'outbound') {
    sim.step(SIM_DT); ticks++;
    const native = facade._sg02.records.get(collector.id);
    assert.ok(native, 'the production collector remains a native dynamic body');
    assert.equal(native.body.mass(), canonical.mass);
    assert.equal(native.colliders.length, 32);
    assert.deepEqual(collector.propulsion, canonical.propulsion);
    closest = Math.min(closest, Math.hypot(collector.pos.x - target.x, collector.pos.z - target.z));
  }
  console.log({ outboundTicks: ticks, phase: collector.data.itinerary.phase, closest,
    pos: collector.pos, vel: collector.vel, intent: collector.data.intent });
  assert.equal(collector.data.itinerary.phase, 'collect',
    'ordinary native flight must enter the unchanged 25 WU waypoint, rather than balance outside it');
  assert.ok(closest <= 25, 'the authored outbound arrival radius remains 25 WU');
  assert.equal(collector.hull, hull); assert.equal(collector.shield, shield);
  assert.equal(collector.data.cargoManifest.totalQty, 0);
});

test('field capacity admission governs the collector compensation', t => {
  const prior = [PLANET_FLAGS.enabled, FIELD_FLAGS.enabled];
  PLANET_FLAGS.enabled = false; FIELD_FLAGS.enabled = true;
  t.after(() => { [PLANET_FLAGS.enabled, FIELD_FLAGS.enabled] = prior; });
  const observed = [];
  for (const maxAffected of [2, 1]) {
    const sim = createSimulation({ seed: 424214, systems: [worldRecords, trafficWork, fields] });
    try {
      const state = sim.state;
      state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
      const owner = sim.registry.get('traffic'), fieldOwner = sim.registry.get('fields');
      const collector = owner.ensureAnvilWorker(state, sim.spawn, { x: 0, z: 0 });
      collector.pos = { x: 935, z: 0 }; collector.vel = { x: 0, z: 0 }; collector.rot = 0;
      const pose = { pos: { ...collector.pos }, vel: { ...collector.vel } };
      const nearer = sim.spawn({ type: 'wreck', pos: { x: 800, z: 0 }, vel: { x: 0, z: 0 },
        radius: 4, hull: 100, physicsBody: { schemaVersion: 1, dynamic: true, radius: 4,
          mass: 55, inertiaY: 100, ccd: false, material: 'debris', revision: 0 } });
      fieldOwner.registerExternal({ id: 'limited-well', kind: 'well', center: { x: 0, z: 0 },
        radius: 1100, strength: 1000, damping: 0, maxAffected });
      FIELD_FLAGS.enabled = false;
      owner._stepAnvilWork(SIM_DT, state);
      const baseline = collector.data.intent.moveZ;
      FIELD_FLAGS.enabled = true;
      owner._stepAnvilWork(SIM_DT, state);
      assert.equal(collector.data.intent.moveZ, baseline,
        'a cold controller waits for an accepted force pass before compensating');
      sim.step(SIM_DT);
      const admitted = fieldOwner._affected.has(collector);
      assert.equal(admitted, maxAffected === 2);
      assert.equal(fieldOwner._affected.has(nearer), true, 'nearer body owns the first capacity slot');
      const command = consumePhysicsCommand(collector);
      const impulses = command?.impulses || [];
      assert.equal(impulses.length > 0, admitted, 'actual force delivery matches admission');
      if (admitted) assert.ok(impulses.reduce((n, p) => n + p.x, 0) < 0);
      owner._stepAnvilWork(SIM_DT, state);
      const throttle = collector.data.intent.moveZ;
      observed.push({ maxAffected, admitted, baseline, throttle, forceImpulses: impulses.length });
      if (admitted) assert.ok(throttle > baseline, 'admitted opposing force retains correction');
      else assert.equal(throttle, baseline, 'capacity-excluded collector receives no spurious compensation');
      assert.ok(throttle <= 55 / 170, 'the existing outbound command ceiling remains');
      const accepted = fieldOwner.readAcceptedFieldAcceleration(collector, {});
      assert.equal(!!accepted, admitted);
      if (admitted) {
        assert.equal(accepted.ax, impulses.reduce((n, p) => n + p.x, 0) / (55 * SIM_DT));
        assert.equal(accepted.tick, state.tick);
        FIELD_FLAGS.enabled = false;
        owner._stepAnvilWork(SIM_DT, state);
        assert.equal(collector.data.intent.moveZ, baseline, 'disabled force cannot provide feedback');
        FIELD_FLAGS.enabled = true;
        collector.rot = Math.PI;
        owner._stepAnvilWork(SIM_DT, state);
        assert.equal(collector.data.intent.brake, true);
        assert.equal(collector.data.intent.moveZ, 0, 'feedback cannot override alignment braking');
        collector.rot = 0;
        const sameField = fieldOwner._kernel.get('limited-well');
        sim.spawn({ type: 'wreck', pos: { x: 850, z: 0 }, vel: { x: 0, z: 0 },
          radius: 4, hull: 100, physicsBody: { schemaVersion: 1, dynamic: true, radius: 4,
            mass: 55, inertiaY: 100, ccd: false, material: 'debris', revision: 0 } });
        sim.step(SIM_DT);
        assert.equal(fieldOwner._kernel.get('limited-well'), sameField,
          'capacity membership changes without replacing or altering the field');
        assert.equal(fieldOwner._affected.has(collector), false);
        assert.equal(consumePhysicsCommand(collector)?.impulses.length || 0, 0,
          'the newer capacity-excluded pass queues no collector force');
        owner._stepAnvilWork(SIM_DT, state);
        assert.equal(collector.data.intent.moveZ, baseline, 'a newer excluded pass retires admitted feedback');
        assert.equal(fieldOwner.readAcceptedFieldAcceleration(collector, {}), null);
      }
      assert.deepEqual(collector.pos, pose.pos);
      assert.deepEqual(collector.vel, pose.vel, 'the controller and fields queue intent/impulses only');
    } finally { sim.dispose(); }
  }
  console.log({ fieldCapacity: observed });
});

test('accepted field feedback rejects stale passes, replaced lives and expired sources', t => {
  const previous = FIELD_FLAGS.enabled; FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed: 424214, systems: [worldRecords, trafficWork, fields] });
  t.after(() => { sim.dispose(); FIELD_FLAGS.enabled = previous; });
  const state = sim.state;
  state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
  const owner = sim.registry.get('traffic'), fieldOwner = sim.registry.get('fields');
  const collector = owner.ensureAnvilWorker(state, sim.spawn, { x: 0, z: 0 });
  collector.pos = { x: 935, z: 0 }; collector.vel = { x: 0, z: 0 }; collector.rot = 0;
  fieldOwner.registerExternal({ id: 'feedback-well', kind: 'well', center: { x: 0, z: 0 },
    radius: 1100, strength: 1000, damping: 0 });
  sim.step(SIM_DT);
  const read = () => fieldOwner.readAcceptedFieldAcceleration(collector, {});
  assert.ok(read());
  // Controlled clock/life edits isolate receipt validity; this is not saved-route gameplay.
  const tick = state.tick, life = collector.occupantGeneration;
  state.tick = tick + 1; assert.ok(read(), 'the preceding accepted pass is explicit one-tick feedback');
  state.tick = tick + 2; assert.equal(read(), null, 'older feedback is stale'); state.tick = tick;
  collector.occupantGeneration = life + 1; assert.equal(read(), null);
  collector.occupantGeneration = life;
  const replacement = { ...collector };
  state.entities.set(collector.id, replacement);
  assert.equal(read(), null);
  assert.equal(fieldOwner.readAcceptedFieldAcceleration(replacement, {}), null);
  state.entities.set(collector.id, collector);
  assert.ok(read());
  state.mode = 'station'; assert.equal(read(), null); state.mode = 'flight';
  const field = fieldOwner._kernel.get('feedback-well');
  field.expireAt = state.simTime; assert.equal(read(), null, 'elapsed source cannot support feedback');
  field.expireAt = Infinity;
  assert.ok(read());
  fieldOwner.registerExternal({ ...field });
  assert.equal(read(), null, 'replacing a registered source retires its feedback immediately');
  fieldOwner.update(SIM_DT, state);
  assert.ok(read());
  fieldOwner.update(0, state);
  assert.equal(read(), null, 'a newer zero-force pass retires prior feedback');
});
