// WORLD-48: An ace routed through your sector is bar talk before you ever meet.
// On seed 4242 an ace with a route through the sector adds one bar rumour line naming the ace,
// expiring when the route passes; a focused test pins add and expiry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';
import {
  AUTHORED_ACE_ROUTES,
  getActiveAceRouteForSector,
  isAceRouteActive,
} from '../src/data/namedAces.js';

test('AUTHORED_ACE_ROUTES defines sector routes and timing windows for aces', () => {
  assert.ok(Array.isArray(AUTHORED_ACE_ROUTES), 'AUTHORED_ACE_ROUTES is exported');
  assert.ok(AUTHORED_ACE_ROUTES.length >= 3, 'at least 3 authored ace routes');

  const yaraRoute = AUTHORED_ACE_ROUTES.find((r) => r.aceId === 'ace_yara_no_cut');
  assert.ok(yaraRoute, 'Yara No-Cut route exists');
  assert.equal(yaraRoute.sectorId, 'sector_tethys_junction');
  assert.ok(yaraRoute.rumorLine.includes('Yara No-Cut'), 'rumorLine names the ace');
  assert.equal(yaraRoute.windowStartS, 0);
  assert.equal(yaraRoute.windowDurationS, 1800);
});

test('isAceRouteActive verifies time window and periodic expiry', () => {
  const route = {
    aceId: 'ace_test',
    sectorId: 'sector_tethys_junction',
    windowStartS: 0,
    windowDurationS: 600,
    intervalS: 1800,
  };

  assert.equal(isAceRouteActive(route, 0), true, 'active at start');
  assert.equal(isAceRouteActive(route, 300), true, 'active midway through window');
  assert.equal(isAceRouteActive(route, 601), false, 'expired once duration passed');
  assert.equal(isAceRouteActive(route, 1799), false, 'inactive before next interval cycle');
  assert.equal(isAceRouteActive(route, 1800), true, 'active again at next cycle');
});

test('seed 4242: active ace route adds bar talk naming the ace in station contacts, expiring when route passes', () => {
  // station_tethys is in sector_tethys_junction where Yara No-Cut is routed
  const stateActive = {
    seed: 4242,
    simTime: 120, // inside [0, 1800) window
  };

  const contactsActive = generateContacts('station_tethys', stateActive);
  const aceContact = contactsActive.find((c) => c && c.aceRouteRumorRef === 'ace_yara_no_cut');

  assert.ok(aceContact, 'contact stamped with ace route rumor exists');
  assert.ok(aceContact.line.includes('Yara No-Cut'), 'contact line names the ace');

  // Verify expiry: after 1800s, window passes and rumor expires
  const stateExpired = {
    seed: 4242,
    simTime: 2000, // beyond windowDurationS (1800s) and before intervalS (3600s)
  };

  const contactsExpired = generateContacts('station_tethys', stateExpired);
  const expiredContact = contactsExpired.find((c) => c && c.aceRouteRumorRef === 'ace_yara_no_cut');
  assert.equal(expiredContact, undefined, 'ace route rumor line expires when route passes');

  const hasAceLine = contactsExpired.some((c) => c && c.line && c.line.includes('Yara No-Cut'));
  assert.equal(hasAceLine, false, 'no contact speaks the expired ace rumor line');
});

test('seed 4242: asking rumors at the bar returns the active ace route rumour and expires when window passes', () => {
  const stateActive = {
    seed: 4242,
    simTime: 120,
  };

  // Barkeep contact replying to "Any rumors?"
  const replyActive = buildReply('barkeep', 'rumors', { state: stateActive }, 'station_tethys');
  assert.ok(replyActive, 'barkeep reply returned');
  assert.ok(replyActive.text.includes('Yara No-Cut'), 'reply text names Yara No-Cut while route is active');
  assert.equal(replyActive.aceRouteRumor?.aceId, 'ace_yara_no_cut');

  // When route passes, asking rumors no longer returns the expired ace rumor
  const stateExpired = {
    seed: 4242,
    simTime: 2000,
  };

  const replyExpired = buildReply('barkeep', 'rumors', { state: stateExpired }, 'station_tethys');
  assert.ok(replyExpired, 'barkeep reply returned after expiry');
  assert.equal(replyExpired.text?.includes('Yara No-Cut'), false, 'expired ace rumor is no longer returned');
});
