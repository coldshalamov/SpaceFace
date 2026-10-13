import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { spectrum } from '../src/systems/spectrum/index.js';
import { applyTow, applyBrake, createSpectrumModel, publicSpectrum, serializeSpectrum, hydrateSpectrum } from '../src/systems/spectrum/model.js';
import { bindSpectrumWorld, materializeSpectrum, refreshSpectrumBodies, captureSpectrumBodies } from '../src/systems/spectrum/live.js';
import { bearingDeg } from '../src/systems/spectrum/geometry.js';
import { SPECTRUM_CASES } from '../src/data/spectrum/scenarios.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

function fixture() {
  const sim = createSimulation({ seed: 21, systems: [scanner, spectrum] });
  sim.state.mode = 'flight'; sim.state.run = { kind: 'adventure' };
  sim.state.world.currentSectorId = 'sector_helios_prime';
  sim.state.world.activeSector = { id: 'sector_helios_prime', pois: [] };
  sim.state.input.actions = {};
  sim.state.combat.attachments = { byId: {} };
  const player = sim.spawn({ type: 'ship', isPlayer: true, radius: 10, mass: 16, hull: 100,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} });
  sim.state.playerId = player.id;
  return { sim, state: sim.state, player, system: sim.registry.get('spectrum') };
}

test('the first real scanner pulse offers an Adventure bearing after the scanner batch, without hidden position or payout', () => {
  const f = fixture(), results = [], rewards = [], courses = [];
  f.sim.bus.on('signal:scanResults', (p) => results.push(p));
  f.sim.bus.on('signal:investigated', (p) => rewards.push(p));
  f.sim.bus.on('ui:setCourse', (p) => courses.push(p));
  f.state.input.actions.scanPulse = true;
  f.sim.runTicks(1);
  assert.equal(f.state.spectrum.liveBound, true);
  const row = results.at(-1).primary;
  assert.equal(row.manualInvestigation, true);
  assert.deepEqual(row.pos, { x: f.player.pos.x, z: f.player.pos.z });
  assert.ok(Number.isFinite(row.triangulation.bearingDeg));
  assert.equal(row.fixedPos, undefined);
  assert.equal(f.state.spectrumPublic.fix, null);
  assert.equal(f.state.spectrumPublic.livePoses, undefined);
  assert.equal(rewards.length, 0); assert.equal(courses.length, 0);
  f.system.destroy(); f.sim.dispose();
});

test('measurement and braking use the current physical source, and a retired source cannot reveal or finish', () => {
  const f = fixture(); f.sim.runTicks(1);
  const model = f.state.spectrum;
  const source = f.state.entities.get(model.bindings.find((b) => b.key === 'emitter:buoy').entityId);
  source.pos.set(400, 0, 300); source.vel.set(5, 0, -3);
  f.state.simTime = 8;
  f.sim.bus.emit('scan:pulse', { source: 'player-scanner', scannerId: f.player.id, seq: 1,
    pos: f.player.pos, radius: 1200, simTime: 8 });
  assert.ok(Math.abs(publicSpectrum(model).bearingDeg - bearingDeg(f.player.pos, source.pos)) < 0.01);
  model.revealed = true; model.fix = { x: 400, z: 300 }; model.velocity = { x: 0, z: 0 }; model.fixTime = 8;
  source.alive = false; refreshSpectrumBodies(model, f.state);
  assert.equal(applyBrake(model, { x: 400, z: 300 }, { x: 0, z: 0 }, 8).reason, 'no-brake-payoff');
  assert.equal(model.resolved, false);
  f.system.destroy(); f.sim.dispose();
});

test('live relay completion requires an actual Massline displacement; coordinate intents never teleport it', () => {
  const f = fixture();
  const model = createSpectrumModel('spectrum_echo_gallery', 0, 1);
  bindSpectrumWorld(model, { x: 0, z: 0 }); model.sectorId = 'sector_helios_prime';
  materializeSpectrum(model, f.state, f.sim.helpers);
  f.state.spectrum = model;
  f.system._activeSector = model.sectorId;
  const relay = f.state.entities.get(model.bindings.find((b) => b.key === 'prop:relay').entityId);
  assert.equal(isAttachable(relay, f.player.id, f.state), true);
  const before = { x: relay.pos.x, z: relay.pos.z };
  assert.equal(applyTow(model, 'relay', { x: 400, z: 1500 }, f.player.pos, 0).reason, 'physical-tow-required');
  assert.deepEqual({ x: relay.pos.x, z: relay.pos.z }, before);
  model.revealed = true; model.fix = { x: 400, z: 1500 }; model.fixTime = 0;
  relay.pos.set(400, 0, 1500);
  refreshSpectrumBodies(model, f.state);
  assert.equal(model.resolved, false, 'displacement without a real line is not towing');
  f.state.combat.attachments.byId = { line: { id: 'line', ownerId: f.player.id, targetId: relay.id, state: 'active' } };
  refreshSpectrumBodies(model, f.state);
  assert.equal(model.resolved, true);
  f.system.update(1 / 60, f.state);
  assert.ok(f.system.serialize().completed.sector_helios_prime.includes(model.caseId));
  f.system.destroy(); f.sim.dispose();
});

test('the existing attachment service and native rope move a live relay before Spectrum accepts towing', async () => {
  const f = fixture();
  const model = createSpectrumModel('spectrum_echo_gallery', 0, 1);
  bindSpectrumWorld(model); model.sectorId = 'sector_helios_prime';
  materializeSpectrum(model, f.state, f.sim.helpers);
  const relay = f.state.entities.get(model.bindings.find((b) => b.key === 'prop:relay').entityId);
  f.player.pos.set(80, 0, -40);
  f.player.physicsBody = { shape: 'ball', radius: 10, mass: 16, dynamic: true };
  const owner = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60, publishTelemetry: false });
  try {
    f.sim.helpers.combatPhysics = owner;
    owner.syncFromEntities(f.state.entityList);
    const kernel = getCombatKernel({ state: f.state, bus: f.sim.bus, helpers: f.sim.helpers, registry: f.sim.registry });
    const line = kernel.attachments.create({ defId: 'attachment_massline', ownerId: f.player.id, targetId: relay.id });
    assert.equal(line.ok, true, JSON.stringify(line));
    const initial = { x: relay.pos.x, z: relay.pos.z };
    for (let tick = 0; tick < 120; tick++) {
      f.state.tick++; f.state.simTime += 1 / 60;
      queuePhysicsImpulse(f.player, { x: 0, y: 0, z: -16 * 0.5 }, { motionIntent: 'player_maneuver' });
      owner.syncFromEntities(f.state.entityList); owner.step(1 / 60);
      refreshSpectrumBodies(model, f.state);
    }
    assert.ok(Math.hypot(relay.pos.x - initial.x, relay.pos.z - initial.z) >= 16);
    assert.equal(model.towed.relay, true);
    assert.equal(model.resolved, false, 'a tow without earned bearings grants no completion');
  } finally { owner.dispose(); f.system.destroy(); f.sim.dispose(); }
});

test('live pose save/restore preserves displacement and missing bodies across all twelve cases', () => {
  const f = fixture();
  for (const def of SPECTRUM_CASES) {
    const model = createSpectrumModel(def.id, 0, 1);
    bindSpectrumWorld(model, { x: 100, z: -200 }); model.sectorId = 'sector_helios_prime';
    materializeSpectrum(model, f.state, f.sim.helpers);
    assert.ok(model.bindings.length > 0);
    for (const prop of def.props) {
      assert.ok(model.bindings.some((binding) => binding.key === `prop:${prop.id}`), `${def.id} ${prop.id}`);
    }
    const first = f.state.entities.get(model.bindings[0].entityId);
    first.pos.x += 100; first.vel.z += 3;
    const saved = captureSpectrumBodies(model, f.state);
    const restored = hydrateSpectrum(serializeSpectrum(model)); restored.sectorId = model.sectorId;
    for (const binding of model.bindings) f.sim.helpers.removeEntity(binding.entityId);
    materializeSpectrum(restored, f.state, f.sim.helpers, saved);
    const current = f.state.entities.get(restored.bindings[0].entityId);
    assert.equal(current.pos.x, saved[0].pos.x); assert.equal(current.vel.z, saved[0].vel.z);
    current.alive = false;
    const retired = captureSpectrumBodies(restored, f.state);
    assert.equal(retired[0].missing, true);
    for (const binding of restored.bindings) f.sim.helpers.removeEntity(binding.entityId);
    materializeSpectrum(restored, f.state, f.sim.helpers, retired);
    assert.equal(restored.bindings.some((b) => b.key === retired[0].key), false);
  }
  f.system.destroy(); f.sim.dispose();
});

test('destroy removes Spectrum listeners, and repeated initialization does not duplicate measurements', () => {
  const f = fixture(); f.sim.runTicks(1);
  const model = f.state.spectrum, count = model.ops;
  f.system.destroy();
  f.sim.bus.emit('scan:pulse', { source: 'player-scanner', scannerId: f.player.id, seq: 1,
    pos: f.player.pos, radius: 1200, simTime: 8 });
  assert.equal(model.ops, count);
  f.sim.dispose();
});

test('leaving a sector clears its public view and keeps detached survey progress in the save', () => {
  const f = fixture(); f.sim.runTicks(1);
  f.state.input.actions.scanPulse = true; f.sim.runTicks(1);
  const count = f.state.spectrum.ops;
  f.sim.bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
  assert.equal(f.state.spectrumPublic, null);
  assert.equal(f.state.spectrum, null);
  const saved = f.system.serialize();
  assert.equal(saved.sectorState.sector_helios_prime.caseId, 'spectrum_cold_parallax');
  assert.equal(saved.sectorState.sector_helios_prime.log.length > 0, true);
  saved.sectorState.sector_helios_prime.ops = -1;
  f.system._ensureLive();
  assert.ok(f.state.spectrum.ops >= 0);
  assert.ok(count > 0);
  f.system.destroy(); f.sim.dispose();
});
