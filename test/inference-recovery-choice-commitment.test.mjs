import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import { recoveryEncounter } from '../src/systems/recoveryEncounter.js';
import { createRecoveryEncounterPrompt } from '../src/ui/recoveryEncounterPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

function boot(capVolume = 1) {
  const sim = createSimulation({ seed: 4242, systems: [cargo, recoveryEncounter] });
  const { state, bus } = sim; state.mode = 'flight'; state.world.currentSectorId = 'sector_ceres_belt';
  state.player.cargo.capVolume = capVolume;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {} }); state.playerId = player.id;
  const wreck = sim.spawn({ type: 'wreck', team: 2, pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, mass: 1800, hull: 1, hullMax: 1, data: { parentType: 'survivor_pod',
      salvagePointId: 'choice-test', salvagePool: {}, salvageTimeLeft: 8 } });
  state.salvage = { points: [{ id: 'choice-test', sectorId: 'sector_ceres_belt',
    pos: { ...wreck.pos }, entityId: wreck.id, offered: false }] };
  sim.runTicks(1);
  bus.emit('signal:investigated', { signalId: 'choice-signal', sectorId: 'sector_ceres_belt',
    sourceKind: 'distress', sourceId: wreck.id, entityId: wreck.id, pos: { ...wreck.pos } });
  bus.emit('scan:pulse', { pos: { ...player.pos } });
  state.player.tether = { active: true, targetId: wreck.id }; sim.runTicks(155);
  const system = sim.registry.get('recoveryEncounter');
  const record = state.recoveryEncounters.records['recovery:choice-test'];
  assert.equal(record.phase, 'decision'); assert.equal(record.hasSurvivor, true);
  const grants = [], retries = [], receipts = [];
  bus.on('economy:grantCredits', p => grants.push(p)); bus.on('recovery:retryAvailable', p => retries.push(p));
  bus.on('recovery:receipt', p => receipts.push(p));
  const choose = choice => bus.emit('recovery:choose', { recoveryId: record.id, choice });
  return { sim, state, bus, system, record, choose, grants, retries, receipts };
}

for (const replacement of ['rescue', 'blackbox']) {
  test(`partly stripped freight cannot be relabeled ${replacement} to bypass the chosen consequence`, () => {
    const r = boot();
    try {
      r.choose('strip'); assert.equal(r.record.phase, 'decision');
      const before = JSON.stringify(r.state.player.cargo.items);
      assert.ok(Object.values(r.record.recoveredCargo).some(q => q > 0));
      r.choose(replacement);
      assert.equal(r.record.phase, 'decision'); assert.equal(r.record.rewardPlan.choice, 'strip');
      assert.equal(r.grants.length, 0); assert.equal(r.receipts.length, 0);
      assert.equal(JSON.stringify(r.state.player.cargo.items), before);
      assert.equal(r.retries.at(-1).committedChoice, 'strip');
      r.state.player.cargo.capVolume = 20; r.choose('strip'); r.choose('strip');
      assert.equal(r.receipts.length, 1); assert.equal(r.receipts[0].outcome, 'strip');
      assert.equal(r.grants[0].amount, 120); assert.equal(r.grants.length, 1);
      assert.equal(r.state.player.cargo.items.cmdty_salvage_electronics, 2);
      assert.equal(r.state.player.cargo.items.cmdty_scrap_metal, 2);
    } finally { r.sim.dispose(); }
  });
}

test('a completely refused extraction has not committed the player to stripping', () => {
  const r = boot(0);
  try {
    r.choose('strip'); assert.deepEqual(r.record.recoveredCargo, { cmdty_salvage_electronics: 0, cmdty_scrap_metal: 0 });
    r.choose('rescue'); assert.equal(r.receipts[0].outcome, 'rescue'); assert.equal(r.grants[0].amount, 620);
  } finally { r.sim.dispose(); }
});

test('the recovery save carrier preserves the physical choice commitment and ungranted remainder', () => {
  const r = boot();
  try {
    r.choose('strip'); const saved = JSON.parse(JSON.stringify(r.system.serialize()));
    r.system.deserialize(saved); r.choose('rescue');
    const live = r.state.recoveryEncounters.records[r.record.id];
    assert.equal(live.phase, 'decision'); assert.equal(live.rewardPlan.choice, 'strip');
    assert.equal(r.grants.length, 0); r.state.player.cargo.capVolume = 20; r.choose('strip');
    assert.equal(r.receipts.length, 1); assert.equal(r.receipts[0].outcome, 'strip');
    assert.equal(r.state.player.cargo.items.cmdty_salvage_electronics, 2);
  } finally { r.sim.dispose(); }
});

test('the live decision adapter offers Continue Strip after a partial pickup, not incompatible methods', () => {
  const r = boot(); const offers = [];
  setPromptDeck({ offerDecision(spec) { offers.push(spec); return true; }, resolveDecision() {} });
  const prompt = createRecoveryEncounterPrompt({ state: r.state, bus: r.bus });
  try {
    r.choose('strip'); const spec = offers.at(-1);
    assert.deepEqual(spec.choices.map(c => c.id), ['strip']);
    assert.match(spec.choices[0].label, /CONTINUE STRIP/);
    assert.match(spec.detail, /already started/i); assert.match(spec.detail, /cargo space/i);
    r.state.player.cargo.capVolume = 20; spec.onChoose('strip', 'keyboard');
    assert.equal(r.receipts[0].outcome, 'strip');
  } finally { prompt.destroy(); setPromptDeck(null); r.sim.dispose(); }
});
