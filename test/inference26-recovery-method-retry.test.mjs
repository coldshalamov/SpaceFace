import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import { recoveryEncounter } from '../src/systems/recoveryEncounter.js';
import { createRecoveryEncounterPrompt } from '../src/ui/recoveryEncounterPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

function fixture({ full = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [cargo, recoveryEncounter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.player.cargo.capVolume = 1;
  const player = sim.spawn({ type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  const wreck = sim.spawn({ type: 'wreck', alive: true, pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 }, hull: 1, hullMax: 1, data: { salvagePointId: 'partial-strip' } });
  const payouts = [], readouts = [];
  bus.on('economy:grantCredits', payload => payouts.push(payload));
  bus.on('recovery:retryAvailable', payload => readouts.push(payload));
  bus.emit('signal:investigated', { sourceKind: 'distress', entityId: wreck.id,
    sectorId: state.world.currentSectorId, signalId: 'signal:partial-strip', pos: { ...wreck.pos } });
  bus.emit('scan:pulse', {});
  const record = state.recoveryEncounters.records['recovery:partial-strip'];
  assert.equal(record.hasSurvivor, true);
  state.player.tether = { active: true, targetId: wreck.id };
  sim.runTicks(155);
  assert.equal(record.phase, 'decision');
  if (full) assert.equal(sim.registry.get('cargo').addCargo('cmdty_salvage_electronics', 1), 1);
  const choose = choice => bus.emit('recovery:choose', { recoveryId: record.id, choice });
  return { sim, state, bus, system: sim.registry.get('recoveryEncounter'), record, payouts, readouts, choose };
}

test('partially stripped components commit that recovery method across cargo-full retries and Continue', () => {
  const h = fixture();
  h.choose('strip');
  assert.equal(h.record.phase, 'decision');
  assert.equal(h.record.retryReason, 'cargo_full');
  assert.equal(h.state.player.cargo.items.cmdty_salvage_electronics, 1);
  assert.equal(h.record.recoveredCargo.cmdty_salvage_electronics, 1);
  h.choose('rescue');
  assert.equal(h.record.phase, 'decision', 'partial extraction cannot turn into a full rescue plus free components');
  assert.equal(h.record.rewardPlan.choice, 'strip');
  assert.equal(h.payouts.length, 0);
  assert.equal(h.readouts.at(-1).committedChoice, 'strip', 'the prompt can explain the committed method');

  const saved = h.system.serialize();
  h.system.deserialize(saved);
  h.bus.emit('salvage:placed', { sectorId: h.state.world.currentSectorId });
  const restored = h.state.recoveryEncounters.records[h.record.id];
  h.choose('blackbox');
  assert.equal(restored.phase, 'decision', 'Continue preserves extraction commitment');
  assert.equal(restored.rewardPlan.choice, 'strip');
  h.state.player.cargo.capVolume = 20;
  h.choose('strip');
  assert.equal(restored.outcome, 'strip');
  assert.equal(h.payouts.length, 1);
  assert.equal(h.payouts[0].amount, 120);
  assert.equal(h.state.player.cargo.items.cmdty_salvage_electronics, 2, 'only missing components are granted');
  assert.equal(h.state.player.cargo.items.cmdty_scrap_metal, 2);
});

test('a completely full hold does not commit a method before anything is extracted', () => {
  const h = fixture({ full: true });
  h.choose('strip');
  assert.equal(h.record.phase, 'decision');
  assert.equal(Object.values(h.record.recoveredCargo).some(amount => amount > 0), false);
  h.choose('rescue');
  assert.equal(h.record.outcome, 'rescue', 'the player may change their mind before extraction starts');
  assert.equal(h.payouts.length, 1);
  assert.equal(h.payouts[0].amount, 620);
  assert.equal(h.state.player.cargo.items.cmdty_salvage_electronics, 1, 'only the preexisting cargo remains');
});

test('the live decision adapter explains the pending extraction and disables incompatible methods', () => {
  const h = fixture();
  let visible = null;
  setPromptDeck({ offerDecision(spec) { visible = spec; return true; }, resolveDecision() {} });
  const adapter = createRecoveryEncounterPrompt({ state: h.state, bus: h.bus });
  try {
    h.choose('strip');
    assert.match(visible.detail, /Extraction started.*finish STRIP/);
    assert.equal(visible.choices.find(choice => choice.id === 'rescue').disabled, true);
    assert.equal(visible.choices.find(choice => choice.id === 'blackbox').disabled, true);
    assert.notEqual(visible.choices.find(choice => choice.id === 'strip').disabled, true);
    visible.onChoose('rescue', 'stale-action');
    assert.equal(h.record.phase, 'decision', 'the sim also refuses stale incompatible activations');
    assert.equal(h.payouts.length, 0);
    h.state.player.cargo.capVolume = 20;
    visible.onChoose('strip', 'retry');
    assert.equal(h.record.outcome, 'strip');
  } finally {
    adapter.destroy();
    setPromptDeck(null);
  }
});
