// Asking at Veil charts Page Nine. Ashfall charts the garden only while Ballast is dark.
// Seed 4242. The reply is buildReply, the live barkeep path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReply, generateContacts } from '../src/ui/station/barContacts.js';

function bench(sectorId, bearings = {}) {
  return {
    simTime: 2000,
    tick: 120000,
    meta: { seed: 4242 },
    player: { id: 1, flags: {}, heat: 0, uniqueWrecks: { bearings } },
    world: { currentSectorId: sectorId, frontierRumors: { byId: {} } },
    story: { flags: {} },
  };
}

function ask(stationId, state) {
  const contacts = generateContacts(stationId, state);
  const barkeep = contacts.find((contact) => contact && contact.role === 'barkeep');
  assert.ok(barkeep, `${stationId} has a barkeep`);
  return {
    barkeep,
    reply: buildReply('barkeep', 'rumors', { state }, stationId, barkeep),
  };
}

test('seed 4242: Veil rumors name Page Nine, and a known bearing stays quiet', () => {
  const fresh = bench('sector_veil_nebula', {
    wreck_isc_vigilant: { phase: 'rumored', sectorId: 'sector_veil_nebula' },
  });
  const heard = ask('station_veil', fresh);
  assert.equal(heard.reply.uniqueWreckRumor.wreckId, 'wreck_vael_page_nine');
  assert.equal(heard.reply.text, 'OVERRIDE TENDER · ADDENDUM ATTACHED');
  assert.equal(heard.reply.uniqueWreckRumor.sourceRef, 'bar.expansion.wreck_vael_page_nine');
  assert.equal(heard.barkeep.rumorSourceRef, 'bar.expansion.wreck_vael_page_nine');

  const again = bench('sector_veil_nebula', {
    wreck_isc_vigilant: { phase: 'rumored' },
    wreck_vael_page_nine: { phase: 'rumored' },
  });
  const quiet = ask('station_veil', again);
  assert.equal(quiet.reply.uniqueWreckRumor, undefined);
  assert.notEqual(quiet.reply.text, 'OVERRIDE TENDER · ADDENDUM ATTACHED');
});

test('seed 4242: Ashfall names the Charon garden when Ballast is dark, and not when he is routing', () => {
  const dark = bench('sector_ashfall_reach');
  dark.simTime = 2000;
  const garden = ask('station_ashcache', dark);
  assert.equal(garden.reply.uniqueWreckRumor.wreckId, 'wreck_understory_what_the_wreck_became');
  assert.equal(garden.reply.text, 'GARDEN HULL · STILL GROWING');

  const routing = bench('sector_ashfall_reach');
  routing.simTime = 120;
  const ballast = ask('station_ashcache', routing);
  assert.equal(ballast.reply.uniqueWreckRumor, undefined);
  assert.match(ballast.reply.text, /Big Ballast/);
});
