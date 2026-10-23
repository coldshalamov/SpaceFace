// SEED-PC-10 — spawned squads carry a faction flight callsign, not a captain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ContactKind } from '../src/ai/contracts.js';
import { SquadCommander, squadSpeech } from '../src/ai/squad.js';
import { FACTION_CALLSIGNS, FACTION_DOCTRINES, squadCallsign } from '../src/data/factionDoctrines.js';

const SEED = 4242;
const HOSTILE = {
  id: 'player', kind: ContactKind.SHIP, alive: true, valid: true, visible: true, hostile: true,
  confidence: 1, threat: 1, pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, team: 0,
};
const HAZARD = { id: 'rock', kind: ContactKind.HAZARD, alive: true, visible: true, pos: { x: -100, z: 0 } };

function prefix(callsign) {
  return callsign.slice(0, callsign.lastIndexOf('-'));
}

function frame(id, hull) {
  return {
    self: {
      id, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      hullFraction: hull, alive: true, disabled: false, capabilities: ['weapon'],
      occupantGeneration: 1,
    },
    contacts: [HOSTILE, HAZARD],
    events: [],
  };
}

test('two squads on seed 4242 do not share a callsign', () => {
  for (const factionId of Object.keys(FACTION_DOCTRINES)) {
    assert.ok(FACTION_CALLSIGNS[factionId] && FACTION_CALLSIGNS[factionId].length >= 4, factionId);
  }
  const commander = new SquadCommander({ seed: SEED });
  const concord = commander.registerSquad({
    id: 'wing-left',
    faction: 'faction_scn',
    members: [{ id: 'a', capabilities: ['weapon'] }, { id: 'b', capabilities: ['weapon'] }],
  });
  const reach = commander.registerSquad({
    id: 'wing-right',
    faction: 'faction_reach',
    members: [{ id: 'c', capabilities: ['weapon'] }, { id: 'd', capabilities: ['weapon'] }],
  });
  const otherConcord = new SquadCommander({ seed: SEED }).registerSquad({
    id: 'wing-other',
    faction: 'faction_scn',
    members: [{ id: 'e', capabilities: ['weapon'] }],
  });
  assert.notEqual(concord.callsign, reach.callsign);
  assert.notEqual(concord.callsign, otherConcord.callsign);
  assert.equal(squadCallsign('faction_scn', SEED, 'wing-left'), concord.callsign);
  assert.ok(FACTION_CALLSIGNS.faction_scn.includes(prefix(concord.callsign)));
  assert.ok(FACTION_CALLSIGNS.faction_reach.includes(prefix(reach.callsign)));
  assert.equal(FACTION_CALLSIGNS.faction_scn.includes(prefix(reach.callsign)), false);
  for (const kind of ['hail', 'bark', 'receipt']) {
    const line = squadSpeech(concord.callsign, kind);
    assert.equal(line.includes(concord.callsign), true);
    assert.equal(/\byou\b/i.test(line), false);
  }
});

test('the retreat bark carries the callsign and does not change the cue', () => {
  const commander = new SquadCommander({ seed: SEED });
  commander.registerSquad({
    id: 'wing',
    faction: 'faction_scn',
    members: [
      { id: 'a', capabilities: ['weapon'] },
      { id: 'b', capabilities: ['weapon'] },
      { id: 'c', capabilities: ['weapon'] },
    ],
  });
  const result = commander.update('wing', 10, new Map([
    ['a', frame('a', 1)],
    ['b', frame('b', 0.2)],
    ['c', frame('c', 1)],
  ]));
  const ward = [...result.directives.values()].find((row) => row.objective && row.objective.cue);
  assert.ok(ward);
  assert.equal(ward.objective.cue, 'fighting_retreat');
  assert.equal(ward.callsign, result.callsign);
  assert.equal(ward.objective.speech, squadSpeech(result.callsign, 'bark'));
  assert.equal(ward.objective.speech.includes(result.callsign), true);
});
