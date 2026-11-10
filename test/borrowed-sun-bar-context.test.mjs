import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { borrowedSun, borrowedSunServiceStatus } from '../src/systems/borrowedSun.js';
import { BORROWED_SUN as C } from '../src/data/borrowedSun.js';
import { SECTORS } from '../src/data/sectors.js';
import { generateContacts, buildReply, barContactIntelTags, availableSurveyOffer } from '../src/ui/station/barContacts.js';

function fixture() {
  const sim = createSimulation({ seed: 18, systems: [borrowedSun] });
  const state = sim.state, owner = sim.registry.get('borrowedSun');
  state.mode = 'flight'; state.world.currentSectorId = 'sector_tethys_junction';
  const ctx = { state, bus: sim.bus };
  const contacts = (station = C.stationId) => generateContacts(station, state);
  const host = () => contacts().find(c => c.role === 'barkeep');
  const reply = (role, choice) => buildReply(role, choice, ctx, C.stationId);
  const move = leg => {
    const row = owner.serialize();
    owner.deserialize({ ...row, itineraryLeg: leg, visitId: row.visitId + 1 });
    owner.afterContinue();
    state.world.currentSectorId = leg === 0 ? 'sector_tethys_junction' : 'sector_ceres_belt';
  };
  return { sim, state, owner, ctx, contacts, host, reply, move };
}
function projection(state) {
  const raw = state.content.sectors, rows = Array.isArray(raw) ? raw : Object.values(raw);
  return rows.flatMap(sector => (sector.stations || []).filter(station => station.id === C.stationId)
    .map(station => ({ sector, station })));
}
function identities(contacts) { return contacts.map(({ id, name, role }) => ({ id, name, role })); }

test('actual visiting-market projection supplies Meridian identity and Tethys context', () => {
  const h = fixture();
  try {
    const projected = projection(h.state);
    assert.equal(projected.length, 1);
    assert.equal(projected[0].sector.id, 'sector_tethys_junction');
    assert.equal(projected[0].station.factionId, 'faction_mts');
    assert.equal(h.host().factionId, projected[0].station.factionId);
    const tags = barContactIntelTags(h.host(), h.state, C.stationId);
    assert.ok(tags.some(tag => /Tethys Junction/.test(tag.text)));
    assert.ok(tags.every(tag => !/Helios Prime/.test(tag.text)));
    assert.equal(borrowedSunServiceStatus(h.state, C.stationId, { docking: true }).ok, false,
      'metadata does not make the arriving carrier dockable');
  } finally { h.sim.dispose(); }
});

test('configured berth movement and owner Continue preserve contact identity and existing visit memory', () => {
  const h = fixture();
  try {
    const before = identities(h.contacts());
    const hostId = h.host().id;
    h.state.player.stationContacts ||= {};
    h.state.player.stationContacts[hostId] = { met: true, talkCount: 2, standing: 1,
      stationId: C.stationId, name: h.host().name, lastChoice: 'word', lastTalkSimTime: 12,
      flags: { prior_visit: true } };
    const memoryBefore = JSON.parse(JSON.stringify(h.state.player.stationContacts));
    const assertMemory = () => {
      assert.equal(h.host().id, hostId);
      assert.deepEqual(h.state.player.stationContacts, memoryBefore);
      assert.ok(barContactIntelTags(h.host(), h.state, C.stationId)
        .some(tag => tag.label === 'Contact' && tag.text === 'Recognized'));
    };
    h.move(1);
    assertMemory();
    assert.deepEqual(identities(h.contacts()), before);
    assert.equal(h.host().factionId, 'faction_mts');
    assert.ok(barContactIntelTags(h.host(), h.state, C.stationId).some(tag => /Ceres Belt/.test(tag.text)));
    const saved = JSON.parse(JSON.stringify(h.owner.serialize()));
    h.owner.deserialize(saved); h.owner.afterContinue();
    assertMemory();
    assert.deepEqual(identities(h.contacts()), before);
    assert.equal(projection(h.state)[0].sector.id, 'sector_ceres_belt');
    h.move(0);
    assertMemory();
    assert.deepEqual(identities(h.contacts()), before);
    assert.ok(barContactIntelTags(h.host(), h.state, C.stationId).some(tag => /Tethys Junction/.test(tag.text)));
  } finally { h.sim.dispose(); }
});

test('array and object sector projections resolve the same existing carrier', () => {
  const h = fixture();
  try {
    const before = h.contacts();
    h.state.content.sectors = Object.fromEntries(h.state.content.sectors.map(sector => [sector.id, sector]));
    assert.deepEqual(h.contacts(), before);
    h.move(1);
    assert.equal(h.host().factionId, 'faction_mts');
    assert.equal(projection(h.state)[0].sector.id, 'sector_ceres_belt');
  } finally { h.sim.dispose(); }
});

test('missing or ambiguous carrier projection fails closed rather than inventing a Helios bar', () => {
  const h = fixture();
  try {
    const valid = h.state.content.sectors;
    for (const projected of [
      undefined,
      valid.map(sector => ({ ...sector, stations: sector.stations.filter(station => station.id !== C.stationId) })),
      [...valid, projection(h.state)[0].sector],
    ]) {
      h.state.content.sectors = projected;
      assert.deepEqual(h.contacts(), []);
      assert.equal(availableSurveyOffer(h.state, C.stationId), null);
      for (const role of ['barkeep', 'merchant', 'pilot', 'smuggler', 'engineer', 'bounty_hunter', 'miner']) {
        assert.deepEqual(barContactIntelTags({ role }, h.state, C.stationId),
          [{ label: 'Station', text: 'No current Borrowed Sun berth record', kind: 'warn' }]);
        assert.match(h.reply(role, role === 'engineer' ? 'fix' : 'word').text, /no current berth record/);
      }
    }
  } finally { h.sim.dispose(); }
});

test('local survey and hazard advice follow the projected berth rather than Helios neighbors', () => {
  const h = fixture();
  try {
    for (const [leg, stationId] of [[0, 'station_tethys'], [1, 'station_ceres']]) {
      h.move(leg);
      assert.deepEqual(availableSurveyOffer(h.state, C.stationId), availableSurveyOffer(h.state, stationId));
      for (const [role, choice] of [['pilot', 'outside'], ['engineer', 'tech'], ['bounty_hunter', 'action']]) {
        assert.deepEqual(h.reply(role, choice), buildReply(role, choice, h.ctx, stationId));
      }
    }
  } finally { h.sim.dispose(); }
});

test('engineer and mining intel use the current carrier profile and local work', () => {
  const h = fixture();
  try {
    assert.match(h.reply('engineer', 'fix').text, /Trade hubs run hard/);
    const engineer = barContactIntelTags({ role: 'engineer' }, h.state, C.stationId);
    assert.ok(engineer.some(tag => tag.label === 'Station' && tag.text === 'repair / fuel / market'));
    for (const [leg, stationId] of [[0, 'station_tethys'], [1, 'station_ceres']]) {
      h.move(leg);
      const actual = barContactIntelTags({ role: 'miner' }, h.state, C.stationId);
      const expected = barContactIntelTags({ role: 'miner' }, h.state, stationId);
      assert.deepEqual(actual.find(tag => tag.label === 'Field'), expected.find(tag => tag.label === 'Field'));
    }
  } finally { h.sim.dispose(); }
});

test('fold, loss, and close-pending metadata never create service or docking authority', () => {
  const h = fixture();
  try {
    for (const phase of ['close_pending', 'fold', 'lost']) {
      h.owner.deserialize({ ...h.owner.serialize(), phase, lost: phase === 'lost' });
      h.owner.afterContinue();
      const before = h.owner.serialize();
      assert.equal(projection(h.state)[0].station.factionId, 'faction_mts');
      assert.equal(h.host().factionId, 'faction_mts');
      h.reply('engineer', 'fix'); barContactIntelTags(h.host(), h.state, C.stationId);
      assert.equal(borrowedSunServiceStatus(h.state, C.stationId).ok, false);
      assert.equal(borrowedSunServiceStatus(h.state, C.stationId, { docking: true }).ok, false);
      assert.deepEqual(h.owner.serialize(), before);
    }
  } finally { h.sim.dispose(); }
});

test('contact and context reads do not advance visits, alter markets, or grant rewards', () => {
  const h = fixture();
  try {
    const ownerBefore = h.owner.serialize(), marketsBefore = JSON.stringify(h.state.economy?.markets), payments = [];
    for (const event of ['economy:grant', 'economy:tradeCompleted', 'mission:completed', 'cargo:add']) {
      h.sim.bus.on(event, p => payments.push({ event, p }));
    }
    for (let i = 0; i < 3; i++) {
      h.contacts(); h.reply('pilot', 'outside'); h.reply('engineer', 'fix');
      barContactIntelTags(h.host(), h.state, C.stationId);
    }
    assert.deepEqual(h.owner.serialize(), ownerBefore);
    assert.equal(JSON.stringify(h.state.economy?.markets), marketsBefore);
    assert.deepEqual(payments, []);
  } finally { h.sim.dispose(); }
});

test('static catalog contacts and context ignore carrier projection overrides', () => {
  const h = fixture();
  try {
    const snapshot = () => ['station_helios', 'station_ceres', 'station_tethys', 'station_beltout'].map(stationId => ({
      contacts: h.contacts(stationId),
      survey: availableSurveyOffer(h.state, stationId),
      tags: barContactIntelTags({ role: 'engineer' }, h.state, stationId),
      reply: buildReply('engineer', 'fix', h.ctx, stationId),
    }));
    const before = snapshot();
    h.state.content.sectors = SECTORS.map(sector => ({ ...sector, name: 'WRONG PROJECTED NAME',
      stations: sector.stations.map(station => ({ ...station, name: 'WRONG', factionId: 'faction_quiet', services: [] })) }));
    assert.deepEqual(snapshot(), before);
    assert.equal(h.contacts('station_helios').find(c => c.canonicalKey === 'kessler').name, 'Kessler');
    assert.equal(h.contacts('station_beltout').find(c => c.canonicalKey === 'voss').name, 'Voss');
  } finally { h.sim.dispose(); }
});
