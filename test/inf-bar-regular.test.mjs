// inf-bar-regular (WF-09): a bar regular whose story advances each visit. The seeded patrons
// used to repeat one hashed bark forever; the visit ladder now reads the persisted contact
// memory (the stationContacts system stays the sole writer) and the same live sector facts
// the intel tags carry, so each visit answers with what changed since the last one.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import {
  generateContacts,
  barRegularStoryLine,
} from '../src/ui/station/barContacts.js';

const STATION = 'station_helios';

function stateWithMemory(contactId, memory, extra = {}) {
  return {
    simTime: 3600,
    player: { stationContacts: { [contactId]: { met: true, stationId: STATION, name: '', ...memory } } },
    ...extra,
  };
}

function contactFor(state, role) {
  const contacts = generateContacts(STATION, state);
  const found = contacts.find((c) => c.role === role) || contacts[0];
  assert.ok(found, `a ${role} contact exists at ${STATION}`);
  return found;
}

test('an unmet patron has no ladder line — the bark behavior is unchanged', () => {
  const state = { player: { stationContacts: {} } };
  const patron = contactFor(state, 'miner');
  assert.equal(barRegularStoryLine(patron, state, STATION), null);
  assert.equal(barRegularStoryLine({ id: 'contact_nowhere', role: 'miner', name: 'Nobody Voss' }, state, STATION), null);
});

test('the second meeting remembers the actual last exchange', () => {
  const state = { player: { stationContacts: {} } };
  const patron = contactFor(state, 'miner');
  const memoryState = stateWithMemory(patron.id, { talkCount: 1, standing: 0, lastChoice: 'routes' });
  const line = barRegularStoryLine(patron, memoryState, STATION);
  assert.match(line, /Met once before/, `recognition beat: ${line}`);
  assert.match(line, /trade routes/, `the line names what you last discussed: ${line}`);
});

test('consecutive visits in the trouble band never repeat', () => {
  const state = { player: { stationContacts: {} } };
  const patron = contactFor(state, 'pilot');
  const second = barRegularStoryLine(patron, stateWithMemory(patron.id, { talkCount: 2, standing: 1, lastChoice: 'work' }), STATION);
  const third = barRegularStoryLine(patron, stateWithMemory(patron.id, { talkCount: 3, standing: 1, lastChoice: 'work' }), STATION);
  assert.ok(second && third, 'both trouble visits speak');
  assert.notEqual(second, third, `visit 3 advances on visit 2: "${second}" vs "${third}"`);
});

test('the trouble beat is grounded in the live lanes: the worst neighbor sector is named', () => {
  const state = { player: { stationContacts: {} } };
  const sector = SECTORS.find((s) => s.stations?.some((st) => st.id === STATION));
  assert.ok(sector, 'the station lives in a real sector');
  let worst = null;
  for (const nId of (sector.neighbors || [])) {
    const ns = SECTORS.find((row) => row.id === nId);
    if (ns && (!worst || ns.security < worst.security)) worst = ns;
  }
  const patron = contactFor(state, 'pilot');
  const line = barRegularStoryLine(patron, stateWithMemory(patron.id, { talkCount: 2, standing: 1, lastChoice: 'work' }), STATION);
  if (worst) {
    assert.ok(line.includes(worst.name), `the live danger names ${worst.name}: ${line}`);
    assert.match(line, /lane/, `the security word rides the line: ${line}`);
  } else {
    assert.ok(line, 'without neighbors the regular still speaks a trouble line');
  }
});

test('a barkeep tells the shelf truth: the live econ event names its commodity', () => {
  const base = { player: { stationContacts: {} } };
  const keep = contactFor(base, 'barkeep');
  const state = stateWithMemory(keep.id, { talkCount: 2, standing: 1, lastChoice: 'drink' }, {
    economy: { econEvents: [{ stationId: STATION, commodityId: 'cmdty_food', type: 'shortage' }] },
  });
  const line = barRegularStoryLine(keep, state, STATION);
  assert.match(line, /shelf ran thin on /, `shelf beat: ${line}`);
  assert.match(line, /Provisions|Food/, `the live commodity name is spoken: ${line}`);
});

test('the story settles into the relationship: trusted regulars get the stool, strangers stay watched', () => {
  const state = { player: { stationContacts: {} } };
  const patron = contactFor(state, 'miner');
  const trusted = barRegularStoryLine(patron, stateWithMemory(patron.id, { talkCount: 5, standing: 3, lastChoice: 'fields' }), STATION);
  assert.match(trusted, /this stool is yours/, `settled warm: ${trusted}`);
  assert.match(trusted, new RegExp(patron.name.split(/\s+/)[0]), 'the regular is named');
  const watched = barRegularStoryLine(patron, stateWithMemory(patron.id, { talkCount: 5, standing: 0, lastChoice: 'fields' }), STATION);
  assert.match(watched, /friends not yet/, `settled wary: ${watched}`);
  assert.notEqual(trusted, watched);
});

test('the ladder is deterministic and pure — nothing writes while it reads', () => {
  const state = stateWithMemory('reg', { talkCount: 4, standing: 2, lastChoice: 'bounties' });
  const patron = { id: 'reg', role: 'bounty_hunter', name: 'Vess Hallow' };
  const before = JSON.stringify(state);
  const first = barRegularStoryLine(patron, state, STATION);
  const second = barRegularStoryLine(patron, state, STATION);
  assert.equal(first, second);
  assert.equal(JSON.stringify(state), before, 'the read writes nothing');
});
