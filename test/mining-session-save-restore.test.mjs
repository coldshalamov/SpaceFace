import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { cargo } from '../src/systems/cargo.js';
import { drill, drillSessionTarget, tileIndex } from '../src/systems/drill.js';
import { save } from '../src/save/saveSystem.js';

test('saving an active visit settles its charge, restores rock progress, and starts a newly bound session', () => {
  const sim = createSimulation({ seed: 4242, systems: [ships, cargo, drill, save], updateOrder: [] });
  try {
    const { state, bus } = sim;
    const get = name => sim.registry.get(name);
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_helios_prime';
    state.meta.createdAt = 'mining-identity-save';
    get('ships').newGame();
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true,
      player: state.player, fittings: state.player.ownedShips[0].fittings }));
    state.playerId = player.id;
    state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };
    const rock = sim.spawn({ type: 'asteroid', alive: true, pos: { x: 30, z: 0 },
      flags: { persistent: true }, data: { yieldU: 100, fieldId: 'mining-save' } });
    const owner = get('drill');
    assert.equal(owner.begin(rock.id), true);
    const oldSession = state.drill;
    assert.equal(drillSessionTarget(state, structuredClone(oldSession)), undefined,
      'a copied live session does not acquire producer authority');
    oldSession.rockBudget = 5; oldSession.rockBudgetMax = 50;
    oldSession.field[14][2] = { type: 'vein', ore: 'cmdty_ore_iron', yieldU: 10, tierReq: 1 };
    oldSession.charge = { col: 14, row: 2, payload: 'blast', pattern: [{ col: 14, row: 2 }] };

    // The save writer emits this before capturing either the synchronous or paced envelope.
    bus.emit('save:started', { slot: 'mining', reason: 'test' });
    assert.equal(oldSession.charge, null);
    const envelope = JSON.parse(JSON.stringify(get('save').serialize('mining')));
    assert.equal(envelope.data.drill, undefined, 'the active field is not a save payload');
    assert.equal(get('save').loadEnvelope(envelope, 'mining'), true);
    assert.equal(state.drill, null, 'restore closes the transient visit');

    const restored = state.entityList.find(e => e.type === 'asteroid' && e.data?.fieldId === 'mining-save');
    assert.ok(restored, 'the persistent rock is restored by the save owner');
    assert.notEqual(restored, rock);
    assert.ok(restored.data.drillCleared.includes(tileIndex(14, 2)));
    assert.ok(restored.data.drillScars.includes(tileIndex(14, 2)));
    assert.equal(restored.data.drillDepletion, 0.1);
    assert.equal(state.player.cargo.items.cmdty_ore_iron, 3);
    assert.equal(owner.begin(restored.id), true);
    assert.notEqual(state.drill, oldSession);
    assert.equal(drillSessionTarget(state, state.drill), restored);
    assert.equal(state.drill.field[14][2].type, 'empty');
    assert.equal(state.drill.charge, null);
    owner.end();
  } finally {
    sim.dispose();
  }
});
