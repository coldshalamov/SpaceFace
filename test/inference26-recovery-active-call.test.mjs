import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { recoveryEncounter } from '../src/systems/recoveryEncounter.js';
import { createRecoveryEncounterPrompt } from '../src/ui/recoveryEncounterPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

for (const closingEvent of ['entity:destroyed', 'salvage:completed']) {
  test(`closing an older distress call through ${closingEvent} preserves the current physical recovery`, t => {
    const sim = createSimulation({ seed: 4242, systems: [recoveryEncounter] });
    const { state, bus } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_ceres_belt';
    const player = sim.spawn({ type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {} });
    state.playerId = player.id;
    let visible = null;
    setPromptDeck({ offerDecision(spec) { visible = spec; return true; },
      resolveDecision() { visible = null; } });
    const prompt = createRecoveryEncounterPrompt({ state, bus });
    t.after(() => { prompt.destroy(); setPromptDeck(null); });
    const payouts = [], ready = [];
    bus.on('economy:grantCredits', payload => payouts.push(payload));
    bus.on('recovery:decisionReady', payload => ready.push(payload));
    const track = (pointId, x) => {
      const wreck = sim.spawn({ type: 'wreck', alive: true, pos: { x, z: 0 },
        vel: { x: 0, z: 0 }, hull: 1, hullMax: 1, data: { salvagePointId: pointId } });
      bus.emit('signal:investigated', { sourceKind: 'distress', entityId: wreck.id,
        sectorId: state.world.currentSectorId, signalId: `signal:${pointId}`, pos: { ...wreck.pos } });
      return { wreck, record: state.recoveryEncounters.records[`recovery:${pointId}`] };
    };
    const older = track('old-call', 120);
    const current = track('current-call', 150);
    const currentCard = visible;
    assert.ok(currentCard);
    assert.equal(state.recoveryEncounters.activeId, current.record.id);

    bus.emit(closingEvent, closingEvent === 'entity:destroyed'
      ? { id: older.wreck.id, pos: { ...older.wreck.pos } }
      : { wreckId: older.wreck.id, loot: { cmdty_scrap_metal: 1 } });
    assert.ok(state.recoveryEncounters.outcomes[older.record.id], 'the older situation still closes');
    assert.equal(state.recoveryEncounters.activeId, current.record.id,
      'settling a background call must not hide or disable the newer active call');
    assert.equal(visible, currentCard, 'the background receipt must preserve the actual current prompt');

    bus.emit('scan:pulse', {});
    assert.equal(current.record.phase, 'stabilizing');
    state.player.tether = { active: true, targetId: current.wreck.id };
    sim.runTicks(155);
    assert.equal(current.record.phase, 'decision');
    assert.equal(ready.at(-1).recoveryId, current.record.id);
    bus.emit('recovery:choose', { recoveryId: current.record.id, choice: 'rescue' });
    assert.equal(current.record.outcome, 'rescue');
    assert.equal(payouts.length, 1, 'only the completed live rescue pays');
    assert.equal(state.recoveryEncounters.activeId, null, 'settling the actual current call retires it');
    assert.equal(visible, null, 'a matching receipt retires the current prompt');
  });
}
