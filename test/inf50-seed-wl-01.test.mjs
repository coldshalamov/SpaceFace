import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEntity, searchEntities } from '../src/ui/entityResolver.js';

const SEED = 4242;

function remembered() {
  return {
    meta: { seed: SEED },
    traffic: {
      captainRoster: [{
        id: 'captain:record-hauler-4242',
        name: 'Dessa Venn',
        homeStationId: 'station_helios',
        outcomes: { rescued: 1, robbed: 0, killed: 0 },
        lastOutcome: 'rescued',
        lastAtS: 1800,
        avoidsPlayerLane: true,
      }],
    },
  };
}

test('seed 4242: a captain: link for a roster id names the captain, home, and a remembered field', () => {
  const state = remembered();
  const byLink = resolveEntity(state, 'captain:captain:record-hauler-4242');
  const byId = resolveEntity(state, 'captain:record-hauler-4242');
  for (const dossier of [byLink, byId]) {
    assert.equal(dossier.label, 'Dessa Venn');
    assert.equal(dossier.kicker, 'Captain');
    const home = dossier.facts.find((fact) => fact.k === 'Home');
    assert.ok(home && String(home.v).includes('station_helios'));
    const outcomes = dossier.facts.find((fact) => fact.k === 'Outcomes');
    const meeting = dossier.lines.find((line) => line.label === 'Last meeting');
    const lane = dossier.facts.find((fact) => fact.k === 'Lane');
    assert.ok(outcomes || (meeting && String(meeting.text).includes('rescued')) || lane);
  }
  const found = searchEntities(state, 'dessa');
  assert.ok(found.some((row) => row.label === 'Dessa Venn' && row.type === 'captain'));
});

test('seed 4242: an ace id still resolves through aceById, not the roster', () => {
  const state = remembered();
  const dossier = resolveEntity(state, 'captain:ace_yara_no_cut');
  assert.equal(dossier.label, 'Yara No-Cut');
  assert.ok(dossier.lines.some((line) => line.label === 'Last heard'));
  assert.equal(resolveEntity(state, 'captain:nobody-4242'), null);
});
