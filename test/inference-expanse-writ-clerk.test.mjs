// Charon Expanse hunter exchange: the bar gets a face (Ferrow, writ clerk) and an authored
// rumor that names the sector's real distress site (Snapped-Tether Hab-Pod). The writ wall's
// own bar can now send a hunter at something the writ does not pay for.
import assert from 'node:assert/strict';
import test from 'node:test';

import { AUTHORED_DOCK_RUMORS } from '../src/data/frontierRumors.js';
import {
  buildReply,
  generateContacts,
  getChoices,
} from '../src/ui/station/barContacts.js';
import { SECTORS } from '../src/data/sectors.js';

const STATION = 'station_expanse';

test('expanse: the sector still owns a real distress site for the rumor to point at', () => {
  const sector = SECTORS.find((s) => s.id === 'sector_charon_expanse');
  assert.ok(sector, 'Charon Expanse exists');
  const pod = (sector.pois || []).find((p) => p.id === 'poi_charon_tether_wreck');
  assert.ok(pod, 'Snapped-Tether Hab-Pod exists');
  assert.equal(pod.survivorPod, true);
  assert.equal(pod.recoveryEncounter, true);
  assert.match(String(pod.name), /Snapped-Tether/);
});

test('expanse: the writ clerk is an authored, recurring bar contact', () => {
  const contacts = generateContacts(STATION, {});
  const ferrow = contacts.find((c) => c.canonicalKey === 'ferrow');
  assert.ok(ferrow, 'Ferrow appears in the generated contact list');
  assert.equal(ferrow.name, 'Ferrow');
  assert.equal(ferrow.role, 'bounty_hunter');
  assert.equal(ferrow.roleLabel, 'Writ Clerk');
  assert.equal(ferrow.factionId, 'faction_dmc');
  assert.match(ferrow.line, /writ wall/);
});

test('expanse: the barkeep rumor names the hab-pod distress, not a generic quiet lane', () => {
  const text = AUTHORED_DOCK_RUMORS[STATION];
  assert.ok(text, 'station_expanse has an authored dock rumor');
  assert.match(text, /hab-pod/i);
  assert.match(text, /radiation lane/i);

  // Through the live reply path: an unfeatured barkeep asking for rumors hears the authored line.
  const reply = buildReply('barkeep', 'rumors', { state: {} }, STATION, { id: 'contact_x', role: 'barkeep' });
  assert.equal(reply.text, text);
});

test('expanse: the writ clerk answers all three hunter choices in register', () => {
  const choices = getChoices('bounty_hunter', { canonicalKey: 'ferrow' }).map((c) => c.id);
  assert.deepEqual(choices, ['bounties', 'action', 'low']);

  const noBoard = buildReply('bounty_hunter', 'bounties', { state: {} }, STATION, { canonicalKey: 'ferrow' });
  assert.match(noBoard.text, /Wall is bare/);
  assert.equal(noBoard.missionOffer, undefined);

  const withBoard = buildReply('bounty_hunter', 'bounties', {
    state: { missions: { boards: { [STATION]: { slots: [{ id: 'm1', type: 'bounty_hunt', title: 'Test Tag', reward: 900 }] } } } },
  }, STATION, { canonicalKey: 'ferrow' });
  assert.match(withBoard.text, /Filed and stamped/);
  assert.ok(withBoard.missionOffer, 'a live bounty rides the reply as a mission offer');

  const action = buildReply('bounty_hunter', 'action', { state: {} }, STATION, { canonicalKey: 'ferrow' });
  assert.match(action.text, /radiation lane/);
  assert.match(action.text, /Lung/);

  const low = buildReply('bounty_hunter', 'low', { state: {} }, STATION, { canonicalKey: 'ferrow' });
  assert.match(low.text, /wall remembers/);
});
