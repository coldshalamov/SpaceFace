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
// The only order is the theft owner's own tow-out activity; no injected force or
// post-spawn pose/velocity edits. This does not claim a rendered encounter or the
// complete production system manifest.
for (const arenaId of ['helios_core', 'cinder_sluice']) {
  test(`ordinary escort movement tows the bank out through the gate in ${arenaId}`, async t => {
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

    for (let tick = 0; tick < 2400 && arena.diagnostics().plateTheft?.status !== 'towing'; tick++) sim.step();
    const towing = arena.diagnostics().plateTheft;
    const displacement = Math.hypot(plate.pos.x - home.x, plate.pos.z - home.z);
    assert.equal(towing?.status, 'towing', JSON.stringify({ towing, displacement, tick: state.tick }));
    assert.ok(displacement >= PLATE_THEFT.displacement, `measured native displacement ${displacement}`);
    assert.ok(towing.towing >= 1 && towing.links >= 1, 'the captor keeps its own line for the tow-out');
    const escorts = towing.actorIds.map(id => state.entities.get(id));
    const { gate, dir } = towing.exit;
    const out = () => (plate.pos.x - gate.x) * dir.x + (plate.pos.z - gate.z) * dir.z;
    const startOut = out();
    for (let tick = 0; tick < 4800 && arena.diagnostics().plateTheft?.status !== 'stolen'; tick++) sim.step();

    const result = arena.diagnostics().plateTheft;
    assert.equal(result?.status, 'stolen', JSON.stringify({ result, out: out(), startOut, tick: state.tick,
      escorts: escorts.map(e => ({ pos: e.pos, act: e.data.ai.activity })) }));
    assert.ok(out() >= PLATE_THEFT.exitClear, `the plate left through the exit gate (${out()})`);
    assert.equal(plate.alive, false, 'the stolen plate is gone for the run');
    for (let i = 0; i < 4; i++) sim.step();
    assert.equal(state.entities.get(plate.id) === plate, false, 'the ordinary removal seam retired it');
    assert.equal(result.links, 0, 'the tow-out releases its physical constraint');
    assert.equal(result.towing, 0);
    assert.equal(receipts.filter(receipt => receipt.status === 'stolen').length, 1);
    for (const escort of escorts) {
      assert.notEqual(escort.data.ai.activity?.reason, 'vignette_motion:foundry_plate_tow', 'escorts return to the fight');
    }
    assert.ok(escorts.length > 0 && escorts.length <= PLATE_THEFT.maxActors);
    for (const escort of escorts) {
      assert.equal(escort.mass, 75, 'the ordinary enemy factory owns the towing hull');
      assert.equal(escort.data.ai.combatDoctrineId, 'escort_screen');
      assert.equal(escort.data.lootTableId, PLATE_THEFT.enemyId);
      assert.equal(native._sg02.records.get(escort.id).body.isValid(), true);
    }
    const maneuvers = sim.registry.get('aiPorts').inspect();
    assert.ok(maneuvers.flushedManeuvers > 0, 'production AI supplies the motion');
    assert.equal(maneuvers.droppedManeuvers, 0);
    assert.equal(state.run.score, 0, 'relocating room geometry cannot fabricate a kill or reward');
  });
}
