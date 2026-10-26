import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { scanReveal } from '../src/systems/scanReveal.js';
import { save } from '../src/save/saveSystem.js';

function fixture() {
  const sim = createSimulation({ seed: 4242, systems: [scanner, scanReveal, save] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_inference26_survey';
  state.world.sectors = { [state.world.currentSectorId]: { name: 'Survey Field' } };
  state.lossLedger = { bySector: { [state.world.currentSectorId]: [] } };
  const player = sim.spawn({ type: 'ship', team: 0, radius: 10, hull: 100,
    pos: { x: 0, z: 0 }, data: {} });
  state.playerId = player.id;
  const grants = [];
  bus.on('economy:grantCredits', event => grants.push(event));
  const addWreck = (lossId, x) => {
    state.lossLedger.bySector[state.world.currentSectorId].push({ lossId, sectorId: state.world.currentSectorId,
      kind: 'trader', factionId: 'faction_drift', simDay: 0, t: 0 });
    return sim.spawn({ type: 'wreck', team: 2, radius: 10, hull: 1, pos: { x, z: 0 },
      data: { provenance: { lossId }, salvagePool: { cmdty_scrap_metal: 1 } } });
  };
  return { sim, state, bus, grants, addWreck };
}

test('the real save envelope retains paid wreck surveys and milestones through Continue', () => {
  const original = fixture(), resumed = fixture();
  try {
    for (let i = 0; i < 3; i++) original.addWreck(`survey-loss-${i}`, 100 + i * 20);
    original.bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
    assert.equal(original.grants.filter(event => event.reason === 'survey_cartography').length, 3);
    assert.equal(original.grants.filter(event => event.reason === 'survey_chart_bonus').length, 1);
    const envelope = JSON.parse(JSON.stringify(original.sim.registry.get('save').serialize('survey')));
    assert.deepEqual(envelope.data.signalInvestigation.wreckSurvey, original.state.scanReveal);
    resumed.sim.registry.get('save')._callDeserialize('scanner', envelope.data.signalInvestigation);
    assert.deepEqual(resumed.state.scanReveal, original.state.scanReveal);
    for (let i = 0; i < 3; i++) resumed.addWreck(`survey-loss-${i}`, 100 + i * 20);
    resumed.bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
    assert.equal(resumed.grants.length, 0, 'rematerialized wrecks cannot pay their old claims again');
    const savedAt = original.state.scanReveal.investigated['survey-loss-0'].at;
    envelope.data.signalInvestigation.wreckSurvey.investigated['survey-loss-0'].at = 999;
    assert.equal(resumed.state.scanReveal.investigated['survey-loss-0'].at, savedAt,
      'restore owns its memory rather than aliasing the loaded envelope');
  } finally { original.sim.dispose(); resumed.sim.dispose(); }
});

test('loading a legacy scanner sidecar clears the outgoing run survey history', () => {
  const h = fixture();
  try {
    h.addWreck('outgoing-survey', 100);
    h.bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
    const legacy = { records: {}, completed: {}, receipts: [], trackedId: null };
    h.sim.registry.get('save')._callDeserialize('scanner', legacy);
    assert.deepEqual(h.state.scanReveal, { investigated: {}, milestones: {} });
  } finally { h.sim.dispose(); }
});
