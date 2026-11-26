// Real shared aftermath owners: this fixture checks the complete ordinary-kill
// reward path, including a save captured between combat and the next fixed step.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../../core/sim.js';
import { scalarHitToDamagePacket } from '../../combat/damage.js';
import { combat } from '../../systems/combat.js';
import { aftermathWrecks } from '../../systems/aftermathWrecks.js';
import { lootShards } from '../../systems/lootShards.js';
import { mining } from '../../systems/mining.js';
import { cargo } from '../../systems/cargo.js';
import { TOWJAW } from './catalog.js';
import { createTowjawRuntime, getActiveTowjawRuntime } from './runtime.js';

test('a real hull kill retains original salvage and lets the shared aftermath owner create finite residue once', () => {
  const sim = createSimulation({ seed: 4242,
    systems: [combat, aftermathWrecks, lootShards, mining, cargo], updateOrder: [] });
  const { state, bus, helpers, registry } = sim;
  state.mode = 'flight'; state.simTime = 9000; state.world.currentSectorId = TOWJAW.sectorId;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, cap: 100, capMax: 100, radius: 8, mass: 24 });
  state.playerId = player.id;
  const runtime = createTowjawRuntime({ state, bus, helpers, registry });
  let restored = null;
  try {
    assert.equal(runtime.start({ encounterId: 'towjaw-full-aftermath', sectorId: TOWJAW.sectorId,
      origin: { x: 300, z: 0 }, seed: 4242 }).ok, true);
    const issued = runtime.snapshot(), originalIds = new Set(state.entityList.map(body => body.id));
    const scrapIds = issued.bindings.filter(row => row.role === 'scrap').map(row => row.id);
    const boss = state.entities.get(issued.bindings.find(row => row.role === 'boss').id);
    const beforeCredits = state.player.credits;
    let kills = 0, markers = 0, creditGrants = 0, lootDrops = 0;
    bus.on('entity:killed', payload => { if (payload.id === boss.id) kills++; });
    bus.on('aftermathWreck:recorded', () => markers++);
    bus.on('economy:grantCredits', () => creditGrants++);
    bus.on('loot:drop', () => lootDrops++);
    player.pos.set(300, 0, 200); // A real exposed flank, clear of all three mounts.
    const hit = runtime.routeDamage({ attackerId: player.id, targetId: boss.id,
      packet: scalarHitToDamagePacket({ damage: 2000, damageType: 'kinetic', pos: boss.pos }),
      origin: { kind: 'weapon', id: 'towjaw_test' } });
    assert.equal(hit.ok, true);
    assert.equal(boss.alive, false);
    assert.equal(boss.hull, 0);

    // The actual save slot may capture here: combat is after Towjaw's fixed tick.
    const midFrameSave = JSON.parse(JSON.stringify(runtime.snapshot()));
    assert.equal(midFrameSave.outcome, 'defeat');
    assert.equal(midFrameSave.bindings.find(row => row.role === 'boss').tombstone, true);
    const residue = state.entityList.filter(body => !originalIds.has(body.id));
    assert.equal(residue.length, 2, 'ordinary kill has the existing hulk plus companion shard');
    assert.equal(residue.every(body => body.type === 'wreck' && body.data.persistenceOwner === 'aftermathWrecks'), true);
    assert.equal(residue.every(body => !body.data.towjaw), true, 'shared residue must never masquerade as a live boss slot');
    assert.equal(residue.reduce((sum, body) => sum + Object.values(body.data.salvagePool).reduce((a, b) => a + b, 0), 0), 5);
    const markerIds = state.aftermathWrecks.bySector[TOWJAW.sectorId].map(marker => marker.markerId);
    assert.equal(markerIds.length, 1);
    assert.equal(residue.filter(body => markerIds.includes(body.data.markerId)).length, 1);

    state.tick++; state.simTime += 1 / 60; runtime.step(1 / 60);
    assert.equal(runtime.getView().outcome, 'defeat');
    assert.equal(scrapIds.every(id => state.entities.get(id)?.alive === true), true);
    const survivingIds = state.entityList.map(body => body.id);
    for (let i = 0; i < 3; i++) {
      state.tick++; state.simTime += 1 / 60; runtime.step(1 / 60);
      restored = createTowjawRuntime(sim.registry.ctx);
      const result = restored.restore(midFrameSave);
      assert.equal(result.ok && result.terminal, true);
      assert.equal(result.outcome, 'defeat');
      assert.equal(getActiveTowjawRuntime(state), null);
      assert.deepEqual(state.entityList.map(body => body.id), survivingIds);
      assert.deepEqual(state.aftermathWrecks.bySector[TOWJAW.sectorId].map(marker => marker.markerId), markerIds);
      restored.dispose();
    }
    assert.equal(kills, 1);
    assert.equal(markers, 1);
    assert.equal(creditGrants, 0);
    assert.equal(lootDrops, 0);
    assert.equal(state.player.credits, beforeCredits);
    assert.equal(state.story.flags.towjawOutcome, 'defeat');
  } finally { restored?.dispose(); runtime.dispose(); sim.dispose(); }
});
