import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

test('production Choir crew repairs and brings Mercy to the actual Helios berth', { timeout: 240000 }, async () => {
  os.setPriority(os.constants.priority.PRIORITY_LOW);
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 8008 });
  try {
    const { state, bus } = runtime;
    state.mode = 'flight';
    state.settings.gameplay.tutorialHints = false;
    runtime.getSystem('ships').newGame();
    state.playerId = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
      team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
      fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules), pos: { x: 0, z: 0 },
    })).id;
    runtime.getSystem('world').newGame();
    runtime.getSystem('economy').newGame();
    runtime.getSystem('world').enterSector(NEW_GAME.startingSectorId, {});
    bus.emit('game:started', {});
    await runtime.getSystem('physics').prepareBackend(state, { reset: true });
    const bearing = state.player.uniqueWrecks.bearings.wreck_choir_tender;
    bus.emit('scan:pulse', { pos: { ...bearing.exactPos } });
    const wreck = state.entityList.find((e) => e.data?.uniqueWreckId === 'wreck_choir_tender');
    bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
    bus.emit('uniqueWreck:choose', { wreckId: 'wreck_choir_tender', choiceId: 'authority_handover' });
    const patient = state.entityList.find((e) => e.data?.choirReliefRole === 'patient');
    const attendant = state.entityList.find((e) => e.data?.choirReliefRole === 'attendant');
    assert.ok(attendant.data.jobId, 'production boot commissions the actual tender job');
    console.log('CHOIR_BOOT', attendant.data.jobId);
    const collected = new Set(), deliveries = [], faces = new Set();
    bus.on('traffic:oreCollected', (p) => collected.add(p.manifestId));
    bus.on('freight:arrival', (p) => { if (collected.has(p.manifestId)) deliveries.push(p); });
    const start = { ...patient.pos };
    let repairedAt = null;
    for (let second = 0; second < 180 && (!state.player.uniqueWrecks.choirRelief.evacuated || deliveries.length < 2 || faces.size < 2); second++) {
      runtime.runTicks(60, 1 / 60);
      for (const e of state.entityList) if (e.data?.minerShiftRockId != null) faces.add(e.data.minerShiftRockId);
      if (repairedAt == null && state.player.uniqueWrecks.choirRelief.driveRestored) repairedAt = state.simTime;
      if ((second + 1) % 30 === 0) console.log('CHOIR_PROGRESS', second + 1,
        { ...state.player.uniqueWrecks.choirRelief, repairedAt, deliveries: deliveries.length, faces: [...faces] },
        state.entityList.filter((e) => e.data?.choirReliefRole || e.data?.activityActorSlotId === 'helios_starter_cutter').map((e) => ({ role: e.data.choirReliefRole || 'cutter',
          pos: e.pos, jobId: e.data.jobId, phase: e.data.jobPhase, speed: Math.hypot(e.vel.x, e.vel.z), beam: e.data.minerShiftBeamS })));
    }
    assert.ok(repairedAt != null, 'the real tender approaches and completes drive repair');
    assert.ok(Math.hypot(patient.pos.x - start.x, patient.pos.z - start.z) > 100, 'the survivor physically departs');
    assert.equal(state.player.uniqueWrecks.choirRelief.evacuated, true, 'arrival requires the actual body at the medical berth');
    assert.ok(deliveries.length >= 2, 'the same physical arrival control lets the opening shift deliver real ore repeatedly');
    assert.ok(faces.size >= 2, 'the physical cutter returns to work a fresh face');
    console.log(`CHOIR_RELIEF seed=8008 repaired=${repairedAt.toFixed(2)}s observedThrough=${state.simTime.toFixed(2)}s evacuated=true oreDeliveries=${deliveries.length} faces=${faces.size}`);
  } finally { runtime.dispose(); }
});
