import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { physics } from '../src/core/physics.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { PLATE_THEFT } from '../src/systems/foundryPlateTheft.js';

// Focused motion proof: ordinary wave materialization, enemy factory, tactical AI,
// maneuver port and Rapier run together. Weapons are excluded to isolate hauling.
// No scripted NPC intent, injected force, or post-spawn pose/velocity edits. This
// does not claim a rendered encounter or the complete production system manifest.
for (const arenaId of ['helios_core', 'cinder_sluice']) {
  test(`ordinary escort movement physically retrieves the bank in ${arenaId}`, async t => {
    const seed = 4242;
    const sim = createSimulation({ seed, systems: [spawnBudget, survivalArena, survivalWave,
      createTacticalAISystem(), actions, aiPorts, physics, combat] });
    const { state, bus } = sim;
    const native = sim.registry.get('physics');
    t.after(() => { native._sg02?.dispose(); sim.dispose(); });
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_helios_prime';
    state.run = { ...createRunState({ kind: 'survival', ruleset: 'scored', seed }),
      arenaId, wave: PLATE_THEFT.wave, phase: 'active', retireToken: 17 };
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
      team: 0, isPlayer: true, player: state.player, pos: { x: 0, z: 0 },
    }));
    state.playerId = player.id;
    assert.equal(await native.prepareBackend(state), true);

    const arena = sim.registry.get('survivalArena'), receipts = [];
    bus.on('survivalArena:plateTheft', receipt => receipts.push({ ...receipt, tick: state.tick }));
    const plan = planWave({ seed, arenaId, wave: PLATE_THEFT.wave });
    bus.emit('run:wavePlanned', { wave: PLATE_THEFT.wave, plan });
    bus.emit('run:waveStarted', { wave: PLATE_THEFT.wave });
    const admitted = arena.diagnostics().plateTheft;
    assert.ok(admitted, 'the real arena installs the contested resource');
    const plate = state.entities.get(admitted.plateId), home = { ...plate.pos };
    assert.equal(plate.mass, PLATE_THEFT.mass);

    for (let tick = 0; tick < 600 && arena.diagnostics().plateTheft?.status !== 'stolen'; tick++) sim.step();

    const result = arena.diagnostics().plateTheft;
    const displacement = Math.hypot(plate.pos.x - home.x, plate.pos.z - home.z);
    assert.equal(result?.status, 'stolen', JSON.stringify({ result, displacement, tick: state.tick }));
    assert.ok(displacement >= PLATE_THEFT.displacement, `measured native displacement ${displacement}`);
    assert.equal(state.entities.get(plate.id), plate, 'the moved bank retains its physical identity');
    assert.equal(plate.alive, true);
    assert.equal(result.links, 0, 'the successful tow releases its physical constraint');
    assert.equal(receipts.filter(receipt => receipt.status === 'stolen').length, 1);
    const escorts = result.actorIds.map(id => state.entities.get(id));
    assert.ok(escorts.length > 0 && escorts.length <= PLATE_THEFT.maxActors);
    for (const escort of escorts) {
      assert.equal(escort.mass, 75, 'the ordinary enemy factory owns the towing hull');
      assert.equal(escort.data.ai.combatDoctrineId, 'escort_screen');
      assert.equal(escort.data.lootTableId, PLATE_THEFT.enemyId);
      assert.equal(native._sg02.records.get(escort.id).body.isValid(), true);
    }
    assert.equal(native._sg02.records.get(plate.id).body.isValid(), true);
    const maneuvers = sim.registry.get('aiPorts').inspect();
    assert.ok(maneuvers.flushedManeuvers > 0, 'production AI supplies the motion');
    assert.equal(maneuvers.droppedManeuvers, 0);
    assert.equal(state.run.score, 0, 'relocating room geometry cannot fabricate a kill or reward');
  });
}
