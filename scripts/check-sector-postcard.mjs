// BP-11 packet A1 acceptance check: Sector Postcard on arrival.
//
// Contract (src/ui/sectorPostcard.js — see design/revamp/detail/A_sector_station.md):
//   - buildPostcard(state, sectorId, ecologyReadout?) is PURE + deterministic and returns the
//     documented fields {name, faction, securityTier, hazards[], primaryCommodity, ecology,
//     dominantZone, rumor}.
//   - sector_helios_prime reads "Helios Prime" / Solar Concord / 'secure' (security 0.98 →
//     dangerTier 0) / no hazards / a primary commodity from the flagship station / a dominant zone.
//   - Degrade: an unknown sector returns a bare name card without throwing.
//   - Voice budget: on sector:enter the RUMOR line routes through voice.say exactly once on the
//     'news' channel; the silent card fields are never voiced; no rumor → no voice call at all.
//
// Headless: no DOM, no Three.js — the DOM mount is `typeof document`-guarded and must no-op here.
import assert from 'node:assert/strict';

import { regionalEcology } from '../src/systems/regionalEcology.js';
import { buildPostcard, sectorPostcard, SECURITY_TIER_LABELS } from '../src/ui/sectorPostcard.js';

assertHeliosCardFields();
assertDeterministic();
assertDegradeToBareCard();
assertRumorReadsLiveHeadline();
assertVoiceRoutesRumorExactlyOnce();
assertNoRumorMeansNoVoice();
assertAppliedEcologySurfacesOnArrival();

console.log('Sector postcard checks OK');

// ── helpers ────────────────────────────────────────────────────────────────────────────────────

function makeState(headlines = []) {
  return {
    simTime: 12.5,
    ui: { marketNews: { log: headlines.map((text) => ({ text, kind: 'event', t: 1 })) } },
  };
}

function makeBus() {
  const handlers = new Map();
  return {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) { for (const fn of (handlers.get(evt) || []).slice()) fn(payload); },
  };
}

// ── pure builder ───────────────────────────────────────────────────────────────────────────────

function assertHeliosCardFields() {
  const card = buildPostcard(makeState(), 'sector_helios_prime');
  assert.ok(card && typeof card === 'object', 'buildPostcard must return a card object');
  assert.equal(card.name, 'Helios Prime', `name must be "Helios Prime"; got ${card && card.name}`);
  assert.match(String(card.faction), /Solar Concord/,
    `faction must name Solar Concord; got ${card.faction}`);
  // security 0.98 → dangerTier round((1-0.98)*5)=0 → the safest tier label.
  assert.equal(card.securityTier, SECURITY_TIER_LABELS[0],
    `security 0.98 must read as '${SECURITY_TIER_LABELS[0]}'; got ${card.securityTier}`);
  assert.ok(Array.isArray(card.hazards) && card.hazards.length === 0,
    'Helios Prime has no authored hazards — hazard row must be empty');
  assert.equal(typeof card.primaryCommodity, 'string',
    'flagship station (Helios Station, trade_hub L) must yield a primary commodity');
  assert.ok(card.dominantZone && typeof card.dominantZone.name === 'string',
    'Helios Prime has authored zones — dominantZone must name one');
  assert.equal(card.rumor, null, 'no live headline → rumor must be null');
}

function assertDeterministic() {
  const a = buildPostcard(makeState(['ore up at Ceres']), 'sector_helios_prime');
  const b = buildPostcard(makeState(['ore up at Ceres']), 'sector_helios_prime');
  assert.deepEqual(a, b, 'same (state, sectorId) must yield an identical card');
}

function assertDegradeToBareCard() {
  let card = null;
  assert.doesNotThrow(() => { card = buildPostcard(makeState(), 'sector_uncharted_void'); },
    'unknown sector must not throw');
  assert.ok(card && typeof card.name === 'string' && card.name.length > 0,
    'unknown sector must still get a name');
  assert.equal(card.faction, null, 'bare card: faction null');
  assert.equal(card.securityTier, null, 'bare card: securityTier null');
  assert.deepEqual(card.hazards, [], 'bare card: hazards empty');
  assert.equal(card.primaryCommodity, null, 'bare card: primaryCommodity null');
  assert.equal(card.dominantZone, null, 'bare card: dominantZone null');
}

function assertRumorReadsLiveHeadline() {
  const card = buildPostcard(makeState(['Shortage bites at Ceres Refinery', 'older headline']),
    'sector_helios_prime');
  assert.equal(card.rumor, 'Shortage bites at Ceres Refinery',
    'rumor must be the freshest live marketNews headline');
}

// ── voice budget (system wiring, headless) ─────────────────────────────────────────────────────

function assertVoiceRoutesRumorExactlyOnce() {
  const bus = makeBus();
  const state = makeState(['Meridian tolls spike at Tethys']);
  const sayCalls = [];
  const ctx = { bus, state, helpers: { voice: { say(msg) { sayCalls.push(msg); return true; } } } };

  sectorPostcard.init(ctx);
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime', firstVisit: false });

  assert.equal(sayCalls.length, 1,
    `exactly ONE voice.say per arrival (the rumor line); got ${sayCalls.length}`);
  assert.equal(sayCalls[0].channel, 'news', `rumor must route on the 'news' channel; got ${sayCalls[0].channel}`);
  assert.equal(sayCalls[0].text, 'Meridian tolls spike at Tethys', 'the voiced line must BE the rumor');

  // The silent fields must not have been voiced: no say text matches name/faction/tier.
  const card = state.ui.sectorPostcard && state.ui.sectorPostcard.card;
  assert.ok(card, 'system must publish state.ui.sectorPostcard on sector:enter');
  for (const silent of [card.name, card.faction, card.securityTier, card.primaryCommodity]) {
    if (!silent) continue;
    assert.ok(!sayCalls.some((c) => c.text === silent), `card field "${silent}" must be silent text, not voiced`);
  }

  sectorPostcard.destroy();
}

function assertNoRumorMeansNoVoice() {
  const bus = makeBus();
  const state = makeState([]); // no live headlines
  const sayCalls = [];
  const ctx = { bus, state, helpers: { voice: { say(msg) { sayCalls.push(msg); return true; } } } };

  sectorPostcard.init(ctx);
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt', firstVisit: true });
  assert.equal(sayCalls.length, 0, 'no live headline → the card is fully silent (zero voice calls)');
  const rec = state.ui.sectorPostcard;
  assert.ok(rec && rec.sectorId === 'sector_ceres_belt' && rec.card, 'card state still published');
  assert.ok(rec.card.hazards.length >= 1, 'Ceres Belt has an authored hazard — glyph row must carry it');
  sectorPostcard.destroy();
}

function assertAppliedEcologySurfacesOnArrival() {
  const bus = makeBus();
  const state = {
    ...makeState([]),
    meta: { seed: 47 },
    player: {},
    world: { currentSectorId: 'sector_ceres_belt' },
  };
  const ctx = { bus, state, helpers: {} };

  regionalEcology.init(ctx);
  regionalEcology.newGame();
  sectorPostcard.init(ctx);
  bus.emit('aftermath:causeRecorded', {
    fingerprint: 'postcard_ceres_pressure',
    sectorId: 'sector_ceres_belt',
    status: 'open',
    motiveId: 'predation',
    consequenceKind: 'security',
  });
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt', firstVisit: true });

  assert.deepEqual(state.ui.sectorPostcard.card.ecology, {
    familyId: 'industrial_belt',
    familyLabel: 'Industrial Belt',
    unresolvedCauses: 1,
  }, 'arrival card must consume the applied regional ecology without another HUD surface');
  sectorPostcard.destroy();
  regionalEcology.destroy();
}
