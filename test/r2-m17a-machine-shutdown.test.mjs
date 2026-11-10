import assert from 'node:assert/strict';
import test from 'node:test';

import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { createGameState } from '../src/core/gameState.js';
import { STARTER_FIELD_MACHINE as MACHINE } from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { fields } from '../src/systems/fields.js';
import { mining } from '../src/systems/mining.js';
import { combat } from '../src/systems/combat.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { world } from '../src/systems/world.js';

const SURGE = MACHINE.phaseOffsetS + MACHINE.cycle.warningS + 0.2;

async function boot({ safeApproach = false } = {}) {
  const host = await bootRealPath({
    seed: 4242,
    systems: [environmentalMachinery, fields, 'physics', combat, terrainAnchors, mining],
    hulls: [{
      hullId: 'ship_kestrel', isPlayer: true,
      pos: {
        x: MACHINE.globalPos.x + MACHINE.dir.x * (safeApproach ? -150 : 16),
        z: MACHINE.globalPos.z + MACHINE.dir.z * (safeApproach ? -150 : 16),
      },
    }],
  });
  host.machinery = host.runtime.getSystem('environmentalMachinery');
  host.fields = host.runtime.getSystem('fields');
  host.state.world.currentSectorId = MACHINE.sectorId;
  host.state.simTime = SURGE;
  host.step(1);
  return host;
}

function plate(host) {
  return host.state.entityList.find((entity) => entity.data?.killMachineAnvilId === MACHINE.anvil.id);
}

function mine(host, target, dps) {
  host.withFeatures(() => host.runtime.getSystem('mining').applyMining(target.id, dps, 1 / 60));
}

function shoot(host, target, damage) {
  host.withFeatures(() => host.bus.emit('projectile:hit', {
    targetId: target.id, ownerId: host.player.id,
    damage, damageType: 'kinetic', pos: { ...target.pos },
  }));
}

test('destroying the live breaking plate shuts down the intake once and keeps it off', async () => {
  const host = await boot();
  try {
    const target = plate(host);
    assert.ok(target, 'terrainAnchors produces the reachable breaking plate');
    assert.equal(host.fields.hasExternal(MACHINE.fields[0].id), true, 'the intake is running before the cut');
    const toasts = [], phases = [], exits = [];
    host.bus.on('toast', (payload) => toasts.push(payload));
    host.bus.on('environmentalMachinery:phaseChanged', (payload) => phases.push(payload));
    host.bus.on('hazard:exit', (payload) => exits.push(payload));
    mine(host, target, 100_000);
    assert.equal(target.alive, false, 'the mining owner destroys the plate');
    assert.equal(host.fields.hasExternal(MACHINE.fields[0].id), false,
      'destroying the breaking plate must stop the machine intake');
    assert.equal(exits.filter((row) => row.zoneId === MACHINE.id).length, 1,
      'shutdown ends the occupied machine hazard');
    assert.equal(phases.filter((row) => row.siteId === MACHINE.id && row.phase === 'shutdown').length, 1);
    assert.deepEqual(toasts.map((row) => row.text), [
      'Claim Cracker stopped; its breaking plate was destroyed.',
    ]);
    const wire = projectBridgeEvent('toast', toasts[0]);
    assert.equal(wire.dropped, false, 'the existing worker event bridge carries the player sentence');
    assert.equal(wire.flat.text, toasts[0].text);
    host.bus.emit('entity:killed', { id: target.id, killerId: host.player.id });
    host.step(3, { before({ state }) { state.simTime = SURGE + 120; } });
    assert.equal(host.fields.hasExternal(MACHINE.fields[0].id), false, 'a later surge cannot restart it');
    assert.equal(host.state.entityList.some((entity) => entity.alive !== false
      && entity.data?.killMachineAnvilId === MACHINE.anvil.id), false, 'the destroyed plate is not respawned');
    assert.equal(toasts.length, 1, 'duplicate deaths and later ticks stay quiet');
    const readout = host.machinery.diagnostics(host.state).machines.find((row) => row.id === MACHINE.id);
    assert.equal(readout.phase, 'shutdown');
    assert.equal(readout.fieldActive, false);
    console.log('seed=4242 plate destroyed: intake stopped, hazard exited, one announcement, later surge stayed off');
  } finally { host.dispose(); }
});

test('ordinary hits, unrelated deaths and residency retirement do not shut down a working machine', async () => {
  const host = await boot();
  try {
    const target = plate(host), toasts = [];
    host.bus.on('toast', (payload) => toasts.push(payload));
    mine(host, target, 1);
    assert.equal(target.alive, true);
    host.bus.emit('entity:killed', { id: target.id, killerId: host.player.id });
    host.bus.emit('entity:destroyed', { id: target.id, entity: target, reason: 'sector_exit' });
    const other = host.spawnShip({ hullId: 'ship_wasp', pos: {
      x: MACHINE.globalPos.x - 200, z: MACHINE.globalPos.z,
    } });
    shoot(host, other, 100_000);
    assert.equal(other.alive, false);
    assert.equal(host.fields.hasExternal(MACHINE.fields[0].id), true, 'the intake continues after unrelated activity');
    assert.equal(toasts.some((row) => /stopped|switched off/.test(row.text)), false);
    assert.equal(host.state.world.discovery[MACHINE.sectorId]?.machineShutdowns?.[MACHINE.id], undefined);
  } finally { host.dispose(); }
});

test('the ordinary player mining input can shut down the starter machine with its default beam', async () => {
  const host = await boot({ safeApproach: true });
  try {
    const target = plate(host);
    const toasts = [];
    host.bus.on('toast', (payload) => toasts.push(payload));
    host.state.input.worldObjectTargetId = target.id;
    host.state.input.fireGroup = 2;
    const ticks = host.step(7_200, { after() { if (!target.alive) return false; } });
    assert.equal(target.alive, false, 'the unmodified starter beam can finish the breaking plate');
    assert.equal(host.player.alive, true, 'the pilot can cut from outside the intake');
    assert.equal(host.fields.hasExternal(MACHINE.fields[0].id), false);
    assert.equal(toasts.filter((row) => row.text === 'Claim Cracker stopped; its breaking plate was destroyed.').length, 1);
    console.log(`seed=4242 default mining input: shutdown after ${ticks} ticks, pilot alive`);
  } finally { host.dispose(); }
});

test('shutdown survives the real world save overlay, reload and sector return; old saves still run', async () => {
  const host = await boot();
  try {
    mine(host, plate(host), 100_000);
    assert.equal(host.fields.hasExternal(MACHINE.fields[0].id), false);
    const worldOwner = Object.create(world);
    worldOwner.state = host.state;
    // Membership is runtime state; serialize the actual overlay without materializing a sector.
    host.state.world.currentSectorId = null;
    const saved = JSON.parse(JSON.stringify(worldOwner.serialize()));
    const restored = createGameState(4242);
    worldOwner.state = restored;
    worldOwner.deserialize(saved);
    assert.deepEqual(restored.world.discovery, saved.discovery);
    host.machinery.destroy();
    host.state.world.discovery = restored.world.discovery;
    host.state.world.currentSectorId = MACHINE.sectorId;
    host.machinery.init({ state: host.state, bus: host.bus,
      registry: { get(name) { return host.runtime.getSystem(name); } } });
    host.step(1, { before({ state }) { state.simTime = SURGE + 120; } });
    assert.equal(host.fields.hasExternal(MACHINE.fields[0].id), false, 'reload preserves shutdown');
    host.bus.emit('sector:exit', { sectorId: MACHINE.sectorId });
    host.state.world.currentSectorId = 'sector_ceres_belt';
    host.step(1);
    host.state.world.currentSectorId = MACHINE.sectorId;
    host.step(1, { before({ state }) { state.simTime = SURGE + 240; } });
    assert.equal(host.fields.hasExternal(MACHINE.fields[0].id), false, 'returning cannot restart it');
    worldOwner.state = restored;
    worldOwner.deserialize({ discovery: {} });
    host.state.world.discovery = restored.world.discovery;
    host.step(1, { before({ state }) { state.simTime = SURGE; } });
    assert.equal(host.fields.hasExternal(MACHINE.fields[0].id), true, 'legacy saves with no shutdown record retain the cycle');
  } finally { host.dispose(); }
});

test('named shutdown inputs are deterministic and invalid or duplicate requests stay quiet', async () => {
  for (const cause of ['operator_died', 'player_shutdown', 'tower_destroyed']) {
    const host = await boot();
    try {
      const toasts = [];
      host.bus.on('toast', (payload) => toasts.push(payload));
      assert.equal(host.machinery.shutdownKillMachine('missing_machine', cause), false);
      assert.equal(host.machinery.shutdownKillMachine(MACHINE.id, 'unknown_reason'), false);
      assert.equal(toasts.length, 0);
      assert.equal(host.machinery.shutdownKillMachine(MACHINE.id, cause), true);
      assert.equal(host.fields.hasExternal(MACHINE.fields[0].id), false);
      assert.deepEqual(host.state.world.discovery[MACHINE.sectorId].machineShutdowns[MACHINE.id], {
        cause, atS: host.state.simTime,
      });
      assert.equal(host.machinery.shutdownKillMachine(MACHINE.id, cause), false);
      assert.equal(toasts.length, 1);
      assert.equal(/operator_died|player_shutdown|tower_destroyed|helios_claim_cracker/.test(toasts[0].text), false);
    } finally { host.dispose(); }
  }
});
