// EXP-13: the new aces are dock talk in their home sectors while their route window is open.
// Seed 4242. Ost shares Helios with Voss, so he speaks on the other half of the same cycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';
import {
  AUTHORED_ACE_ROUTES,
  getActiveAceRouteForSector,
  isAceRouteActive,
} from '../src/data/namedAces.js';

const HOME = [
  {
    aceId: 'ace_clatter',
    stationId: 'station_sker',
    sectorId: 'sector_sker_haven',
    named: 'Clatter',
    windowStartS: 0,
  },
  {
    aceId: 'ace_big_ballast',
    stationId: 'station_ashcache',
    sectorId: 'sector_ashfall_reach',
    named: 'Big Ballast',
    windowStartS: 0,
  },
  {
    aceId: 'ace_ratchet_lu',
    stationId: 'station_kepler_scar',
    sectorId: 'sector_kepler_scar',
    named: 'Ratchet Lu',
    windowStartS: 0,
  },
  {
    aceId: 'ace_petra_lusk',
    stationId: 'station_dione',
    sectorId: 'sector_dione_lane',
    named: 'Petra Lusk',
    windowStartS: 0,
  },
  {
    aceId: 'ace_mael_ost',
    stationId: 'station_helios',
    sectorId: 'sector_helios_prime',
    named: 'Mael Ost',
    windowStartS: 1800,
  },
];

test('seed 4242: each new ace has a home-sector route in the existing window shape', () => {
  for (const home of HOME) {
    const route = AUTHORED_ACE_ROUTES.find((row) => row.aceId === home.aceId);
    assert.ok(route, `${home.aceId} route exists`);
    assert.equal(route.sectorId, home.sectorId);
    assert.equal(route.windowStartS, home.windowStartS);
    assert.equal(route.windowDurationS, 1800);
    assert.equal(route.intervalS, 3600);
    assert.ok(route.rumorLine.includes(home.named), `${home.aceId} rumour names the ace`);
    const openAt = home.windowStartS + 120;
    const closedAt = home.windowStartS === 0 ? 2000 : 120;
    assert.equal(isAceRouteActive(route, openAt), true);
    assert.equal(isAceRouteActive(route, closedAt), false);
    assert.equal(getActiveAceRouteForSector(home.sectorId, openAt).aceId, home.aceId);
  }
  // Voss still owns the first half of the Helios cycle.
  assert.equal(getActiveAceRouteForSector('sector_helios_prime', 120).aceId, 'ace_voss_shaft_seven');
});

test('seed 4242: dock hands repeat the home-sector rumour and drop it when the window closes', () => {
  for (const home of HOME) {
    const openAt = home.windowStartS + 120;
    const closedAt = home.windowStartS === 0 ? 2000 : 120;
    const open = { seed: 4242, simTime: openAt };
    const closed = { seed: 4242, simTime: closedAt };

    const reply = buildReply('barkeep', 'rumors', { state: open }, home.stationId);
    assert.ok(reply, `${home.stationId} answers rumors`);
    assert.ok(reply.text.includes(home.named), `${home.stationId} names ${home.named}`);
    assert.equal(reply.aceRouteRumor.aceId, home.aceId);

    const contacts = generateContacts(home.stationId, open);
    const stamped = contacts.find((contact) => contact && contact.aceRouteRumorRef === home.aceId);
    // Helios berths authored faces first. The barkeep still answers "Any rumors?"
    // when no free regular is left to wear the line on their idle card.
    if (stamped) assert.ok(stamped.line.includes(home.named));
    else assert.equal(home.stationId, 'station_helios');

    const expired = buildReply('barkeep', 'rumors', { state: closed }, home.stationId);
    assert.equal(expired?.text?.includes(home.named), false, `${home.named} is quiet after the window`);
    const expiredContacts = generateContacts(home.stationId, closed);
    assert.equal(
      expiredContacts.some((contact) => contact && contact.aceRouteRumorRef === home.aceId),
      false,
    );
  }
});
