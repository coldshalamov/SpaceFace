import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activeOwnedShip,
  nextStarterStep,
  shipCarriesModule,
  starterJobForShip,
  starterJobStepsDone,
  STARTER_JOBS,
} from '../src/data/starterJobs.js';
import {
  kesslerStarterWorkChoice,
  kesslerStarterWorkReply,
} from '../src/ui/station/starterWorkdayConversation.js';
import { kesslerFreightChoice, kesslerFreightReply } from '../src/ui/station/heliosFreightConversation.js';
import { kesslerCeresShiftChoice, kesslerCeresShiftReply } from '../src/ui/station/ceresShiftConversation.js';

const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';
const CHOICE = 'helios_local_work';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Use the exact current production board author and worksite reader. Its emitted board object is
// the posting Kessler may surface; the conversation is not allowed to synthesize one.
const workdaySource = read('src/missions/starterWorkday.js')
  .replace(/^import[^;]*;\n/gm, '')
  .replace(/^export /gm, '');
const workday = Function(workdaySource + '; return { starterWorkSite, STARTER_WORKDAY_VERSION };')();
const boardSource = read('src/systems/missionBoardOps.js')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace('export const missionBoardOps', 'const missionBoardOps');
const missionBoardOps = Function(
  'activeOwnedShip', 'nextStarterStep', 'starterWorkSite', 'STARTER_WORKDAY_VERSION',
  boardSource + '; return missionBoardOps;',
)(activeOwnedShip, nextStarterStep, workday.starterWorkSite, workday.STARTER_WORKDAY_VERSION);

function freshState(job, done = 0) {
  return {
    ui: { docked: true, dockedStationId: STATION },
    player: {
      activeShipIndex: 0,
      ownedShips: [{ defId: job.shipId, fittings: [job.requiredModule] }],
    },
    missions: {
      starterJobStep: { [job.id]: done },
      active: [],
      boards: { [STATION]: { slots: [] } },
    },
  };
}
function postFromCurrentBoard(state) {
  const board = state.missions.boards[STATION];
  missionBoardOps._injectStarterJob.call({
    state,
    _rollOffer: (type) => ({ type, params: {} }),
  }, { id: STATION, sectorId: SECTOR }, board.slots, 9);
  return board.slots[0] || null;
}
function postedState(job, done = 0) {
  const state = freshState(job, done);
  const offer = postFromCurrentBoard(state);
  return { state, offer };
}

for (const job of STARTER_JOBS) {
  for (let done = 0; done < job.steps.length; done++) {
    test(`${job.id} step ${done + 1}: Kessler returns the exact current board posting read-only`, () => {
      const { state, offer } = postedState(job, done);
      assert.ok(offer, 'the production board posts the next starter step');
      const before = JSON.stringify(state);
      assert.deepEqual(kesslerStarterWorkChoice(state, STATION), {
        id: CHOICE, label: 'Any local work for my ship?',
      });
      const result = kesslerStarterWorkReply(state, STATION, CHOICE);
      assert.equal(result.missionOffer, offer);
      assert.ok(result.text.includes(offer.title));
      assert.ok(result.text.includes(offer.brief));
      if (done > 0) assert.ok(result.text.includes(`ticket ${done} is settled`));
      assert.equal(JSON.stringify(state), before, 'asking Kessler writes no state');
    });
  }
}

test('the real canonical Kessler choice preserves ordinary questions and the existing weight slip', () => {
  const bar = read('src/ui/station/barContacts.js');
  const start = bar.indexOf('export function getChoices(');
  const end = bar.indexOf('\n}\n\n/* ── reply generators', start) + 2;
  assert.ok(start >= 0 && end > start);
  const getChoices = Function(bar.slice(start, end).replace('export function', 'function') + '; return getChoices;')();

  const wireStart = bar.indexOf('  let insertAt = 1;');
  const wireEnd = bar.indexOf('  const endingCourier =', wireStart);
  assert.ok(wireStart >= 0 && wireEnd > wireStart);
  const compose = Function(
    'contacts', 'canonicalContactsForStation', 'kesslerWeightSlipChoice',
    'kesslerStarterWorkChoice', 'kesslerFreightChoice', 'kesslerCeresShiftChoice', 'getChoices', 'state', 'stationId',
    bar.slice(wireStart, wireEnd) + '; return contacts;',
  );
  const job = STARTER_JOBS[0];
  const state = freshState(job);
  const before = JSON.stringify(state);
  const slip = { id: 'weight-slip', label: 'Read my weight slip.' };
  const contacts = compose([{ id: 'generated' }], (id) => id === STATION
    ? [{ id: 'contact_station_helios_kessler', canonicalKey: 'kessler', role: 'merchant' }]
    : [], () => slip, kesslerStarterWorkChoice, kesslerFreightChoice, kesslerCeresShiftChoice, getChoices, state, STATION);
  const kessler = contacts.find((contact) => contact.canonicalKey === 'kessler');
  assert.deepEqual(kessler.choices.map((choice) => choice.id), [
    'routes', 'market', 'weight-slip', CHOICE, 'ceres_second_measure_shift', 'dismiss',
  ]);
  assert.equal(JSON.stringify(state), before);

  const away = { ...state, ui: { docked: false, dockedStationId: STATION } };
  const awayContacts = compose([{ id: 'generated' }], (id) => id === STATION
    ? [{ id: 'contact_station_helios_kessler', canonicalKey: 'kessler', role: 'merchant' }]
    : [], () => null, kesslerStarterWorkChoice, kesslerFreightChoice, kesslerCeresShiftChoice, getChoices, away, STATION);
  const awayKessler = awayContacts.find((contact) => contact.canonicalKey === 'kessler');
  assert.equal((awayKessler.choices || []).some((choice) => choice.id === CHOICE), false);
});

test('the production Kessler reply keeps weight-slip precedence and routes local work to the read-only reader', () => {
  const bar = read('src/ui/station/barContacts.js');
  const start = bar.indexOf('function buildCanonicalReply(');
  const end = bar.indexOf('/* ── main panel export', start);
  assert.ok(start >= 0 && end > start);
  const canonical = Function(
    'kesslerWeightSlipReply', 'kesslerStarterWorkReply', 'kesslerFreightReply', 'kesslerCeresShiftReply',
    bar.slice(start, end) + '; return buildCanonicalReply;',
  )(
    (_state, _station, id) => id === 'weight-slip' ? { text: 'original slip reply' } : null,
    kesslerStarterWorkReply,
    kesslerFreightReply,
    kesslerCeresShiftReply,
  );
  const { state, offer } = postedState(STARTER_JOBS[0]);
  assert.equal(canonical({ canonicalKey: 'kessler' }, CHOICE, { state }, STATION).missionOffer, offer);
  assert.equal(canonical({ canonicalKey: 'kessler' }, 'weight-slip', { state }, STATION).text, 'original slip reply');
  assert.equal(canonical({ canonicalKey: 'slate' }, CHOICE, { state }, STATION), null);
  assert.ok(bar.includes('buildCanonicalReply(contact, choiceId, ctx, stationId)'));
});

test('the exact Kessler offer reaches the existing bar Accept + track card and mission-lane handler', () => {
  const screen = read('src/ui/station/screens/bar.js');
  const availableStart = screen.indexOf('  function missionOfferAvailable(');
  const htmlStart = screen.indexOf('  function missionOfferHtml(');
  const htmlEnd = screen.indexOf('  function frontierRumorOfferHtml(', htmlStart);
  assert.ok(availableStart >= 0 && htmlStart > availableStart && htmlEnd > htmlStart);
  const available = screen.slice(availableStart, htmlStart);
  const rendererSource = screen.slice(htmlStart, htmlEnd);
  const makeRenderOffer = Function(
    'acceptedMissionId', 'pendingMissionOffer', 'BINDINGS', 'missionPreflight',
    'missionConsequenceSummary', 'offerWord', 'escapeHtml',
    available + rendererSource + '; return missionOfferHtml;',
  );
  const { state, offer } = postedState(STARTER_JOBS[0]);
  const result = kesslerStarterWorkReply(state, STATION, CHOICE);
  // This is the ordinary screen's existing handoff assignment, tested as an exact source seam.
  assert.ok(screen.includes('try { result = buildReply(c.role, choiceId, ctx, sid(), c); }'));
  assert.ok(screen.includes('pendingMissionOffer = result && result.missionOffer || null;'));
  assert.ok(screen.includes("ev.target.closest('[data-accept-mission]')"));
  assert.ok(screen.includes('acceptMissionOnLane(ctx.bus, missionId)'));
  const renderOffer = makeRenderOffer(
    null,
    result.missionOffer,
    { missionLog: { label: 'L' } },
    () => ({ chips: [{ kind: 'ok', text: 'Slot 1/8' }], warning: null, blocker: null }),
    () => ({ chips: [] }),
    (attributes, label) => `<button ${attributes}>${label}</button>`,
    (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  );
  const html = renderOffer(state);
  assert.match(html, new RegExp(`data-accept-mission="${offer.id}"`));
  assert.match(html, /Accept \+ track/);
  assert.doesNotMatch(html, /disabled/);
  assert.ok(result.text.includes(offer.title) && result.text.includes(offer.brief));
});

test('wrong station, undocked/stale click, and a non-starter hull fail closed', () => {
  const job = STARTER_JOBS[0];
  const { state, offer } = postedState(job);
  assert.equal(kesslerStarterWorkChoice(state, 'station_tethys'), null);
  assert.equal(kesslerStarterWorkReply(state, 'station_tethys', CHOICE).missionOffer, undefined);
  state.ui.docked = false;
  const stale = kesslerStarterWorkReply(state, STATION, CHOICE);
  assert.equal(stale.missionOffer, undefined);
  assert.match(stale.text, /Come back to the Helios desk/);
  state.ui.docked = true;
  state.player.ownedShips[0].defId = 'ship_unrelated';
  assert.equal(kesslerStarterWorkReply(state, STATION, CHOICE).missionOffer, undefined);
  assert.match(kesslerStarterWorkReply(state, STATION, CHOICE).text, /No local starter ticket/);
  assert.equal(offer.params.starterJobId, job.id);
});

test('an active ticket blocks duplicates; a failed/lost ticket does not advance the counter', () => {
  const job = STARTER_JOBS[1];
  const { state, offer } = postedState(job);
  state.missions.active.push({ ...offer, status: 'active', objectiveProgress: 99 });
  const before = JSON.stringify(state);
  const active = kesslerStarterWorkReply(state, STATION, CHOICE);
  assert.equal(active.missionOffer, undefined);
  assert.match(active.text, /already have a local ticket open/);
  assert.equal(JSON.stringify(state), before);

  const lost = postedState(job);
  lost.state.missions.active.push({ ...lost.offer, status: 'failed' });
  assert.equal(kesslerStarterWorkReply(lost.state, STATION, CHOICE).missionOffer, lost.offer);
  assert.equal(starterJobStepsDone(lost.state, job.id), 0);
});

test('a ticket left open on another hull is not duplicated after switching ships', () => {
  const { state, offer } = postedState(STARTER_JOBS[0]);
  state.missions.active.push({ ...offer, status: 'active' });
  state.player.ownedShips.push({ defId: STARTER_JOBS[1].shipId, fittings: [STARTER_JOBS[1].requiredModule] });
  state.player.activeShipIndex = 1;
  const result = kesslerStarterWorkReply(state, STATION, CHOICE);
  assert.equal(result.missionOffer, undefined);
  assert.match(result.text, /Hitch ticket open/);
  assert.match(result.text, /Changing hulls does not settle it/);
});

test('missing fit cannot surface a ticket, while the authored scarred Wasp plate remains valid', () => {
  const hitch = postedState(STARTER_JOBS[0]);
  hitch.state.player.ownedShips[0].fittings = [];
  const before = JSON.stringify(hitch.state);
  const result = kesslerStarterWorkReply(hitch.state, STATION, CHOICE);
  assert.equal(result.missionOffer, undefined);
  assert.match(result.text, /Drill Amp fitted/);
  assert.equal(JSON.stringify(hitch.state), before);

  const wasp = postedState(STARTER_JOBS.find((job) => job.id === 'starter_wasp'));
  wasp.state.player.ownedShips[0].fittings = ['mod_ram_plate_scarred'];
  assert.equal(shipCarriesModule(wasp.state.player.ownedShips[0], 'mod_ram_plate'), true);
  assert.equal(kesslerStarterWorkReply(wasp.state, STATION, CHOICE).missionOffer, wasp.offer);
});

test('stale, wrong-hull, malformed, missing, or duplicate board rows never become dialogue offers', () => {
  const mutations = [
    (offer) => { offer.source = 'other'; },
    (offer) => { offer.type = 'cargo_delivery'; },
    (offer) => { offer.params.starterJobId = 'starter_pelican'; },
    (offer) => { offer.params.starterStep = 2; },
    (offer) => { offer.params.requiredModule = 'mod_fake'; },
    (offer) => { offer.destStationId = 'station_tethys'; },
    (offer) => { offer.destSectorId = 'sector_ceres_belt'; },
    (offer) => { offer.id = ''; },
    (offer) => { offer.title = ''; },
    (offer) => { offer.brief = ''; },
  ];
  for (const mutate of mutations) {
    const { state, offer } = postedState(STARTER_JOBS[0]);
    mutate(offer);
    const result = kesslerStarterWorkReply(state, STATION, CHOICE);
    assert.equal(result.missionOffer, undefined);
    assert.match(result.text, /one current next-step ticket/);
  }
  const missing = freshState(STARTER_JOBS[0]);
  assert.equal(kesslerStarterWorkReply(missing, STATION, CHOICE).missionOffer, undefined);
  const duplicate = postedState(STARTER_JOBS[0]);
  duplicate.state.missions.boards[STATION].slots.push({ ...duplicate.offer, id: 'duplicate' });
  assert.equal(kesslerStarterWorkReply(duplicate.state, STATION, CHOICE).missionOffer, undefined);
});

test('a completed or corrupt local book does not issue a ticket or claim a 47-A unlock', () => {
  const job = STARTER_JOBS[2];
  const completed = freshState(job, job.steps.length);
  const before = JSON.stringify(completed);
  const result = kesslerStarterWorkReply(completed, STATION, CHOICE);
  assert.equal(result.missionOffer, undefined);
  assert.match(result.text, /no later step/);
  assert.doesNotMatch(result.text, /47-A|unlock|repaired|restored/);
  assert.equal(JSON.stringify(completed), before);

  const corrupt = freshState(job, 999);
  const bad = kesslerStarterWorkReply(corrupt, STATION, CHOICE);
  assert.equal(bad.missionOffer, undefined);
  assert.match(bad.text, /does not match/);
});

test('missing or malformed conversation state is read-only and fails without throwing', () => {
  for (const state of [null, {}, { ui: { docked: true, dockedStationId: STATION } },
    { ui: { docked: true, dockedStationId: STATION }, player: { ownedShips: [] }, missions: { active: [] } }]) {
    assert.doesNotThrow(() => kesslerStarterWorkChoice(state, STATION));
    assert.doesNotThrow(() => kesslerStarterWorkReply(state, STATION, CHOICE));
    assert.equal(kesslerStarterWorkReply(state, STATION, CHOICE).missionOffer, undefined);
  }
  assert.equal(kesslerStarterWorkReply({}, STATION, 'market'), null);
});


// Exercise the actual receipt builder, not a hand-authored success flag. The production
// board supplies the authored workday identity; settlement supplies the accepted method.
const buoyReceiptFields = (await import('../src/missions/starterBuoyAftermath.js')).firstBuoyReceiptFields;
const missionsSource = read('src/systems/missions.js');
const receiptStart = missionsSource.indexOf('export function missionReceiptFor(');
const receiptEnd = missionsSource.indexOf('export const CLEAN_PHYSICAL_RELEASE', receiptStart);
assert.ok(receiptStart >= 0 && receiptEnd > receiptStart);
const receiptFor = Function('firstBuoyReceiptFields', 'receiptTitle', 'missionRepDeltaFor',
  'SET_PIECE_MISSION_SOURCE', missionsSource.slice(receiptStart, receiptEnd)
    .replace('export function', 'function') + '; return missionReceiptFor;')(
  buoyReceiptFields, (mission) => mission.title, () => 0, 'setPiece');

function buoyReturn(step = 1, completionMethod = 'tow_in', outcome = 'completed') {
  const job = STARTER_JOBS.find((entry) => entry.id === 'starter_pelican');
  const original = postedState(job, step - 1).offer;
  original.params.completionMethod = completionMethod;
  const receipt = receiptFor(original, outcome, null, { at_s: 100, repDelta: 0 });
  const { state, offer } = postedState(job, step);
  state.simTime = 110;
  state.world = { currentSectorId: SECTOR };
  state.missions.receipts = [receipt];
  return { state, offer, receipt };
}

for (const method of ['tow_in', 'sling_in']) {
  for (const step of [1, 2, 3]) {
    test(`accepted buoy ${step} ${method} returns through Kessler without another settlement`, () => {
      const { state, offer, receipt } = buoyReturn(step, method);
      assert.equal(receipt.starterBuoyRecovery.step, step);
      const before = JSON.stringify(state);
      const reply = kesslerStarterWorkReply(state, STATION, CHOICE);
      assert.match(reply.text, /Kessler turns the receiving slip toward you/);
      assert.ok(reply.text.includes(['44-C', 'Claim-rim', 'Outer-yard'][step - 1] + ' buoy.'));
      assert.ok(reply.text.includes(method === 'tow_in' ? 'Tow-in accepted.' : 'Sling-in accepted.'));
      assert.ok(reply.text.includes(`ticket ${step} is settled`));
      assert.equal(reply.missionOffer, offer || undefined, 'next ticket remains the exact board object');
      assert.deepEqual(kesslerStarterWorkReply(state, STATION, CHOICE), reply, 'repeat is read-only');
      const continued = JSON.parse(JSON.stringify(state));
      assert.equal(kesslerStarterWorkReply(continued, STATION, CHOICE).text, reply.text);
      assert.equal(JSON.stringify(state), before);
    });
  }
}

test('receiving dialogue rejects failed, unpaid, old, future, foreign and malformed receipts', () => {
  const mutations = [
    (state) => { state.missions.receipts = []; },
    (state) => { state.missions.receipts[0].outcome = 'failed'; },
    (state) => { state.missions.receipts[0].rewardCr = 0; },
    (state) => { state.missions.receipts[0].source = 'other'; },
    (state) => { state.missions.receipts[0].destStationId = 'station_tethys'; },
    (state) => { state.missions.receipts[0].starterBuoyRecovery.version = 2; },
    (state) => { state.missions.receipts[0].starterBuoyRecovery.completionMethod = 'cut_down'; },
    (state) => { state.missions.receipts[0].starterBuoyRecovery.step = 2; },
    (state) => { state.simTime = 280; },
    (state) => { state.simTime = 99; },
    (state) => { delete state.simTime; },
    (state) => { state.world.currentSectorId = 'sector_ceres_belt'; },
    (state) => { state.run = { kind: 'survival' }; },
  ];
  for (const mutate of mutations) {
    const { state, offer } = buoyReturn();
    mutate(state);
    const before = JSON.stringify(state);
    const result = kesslerStarterWorkReply(state, STATION, CHOICE);
    assert.doesNotMatch(result.text, /receiving slip|Tow-in accepted|Sling-in accepted/);
    assert.equal(result.missionOffer, offer);
    assert.equal(JSON.stringify(state), before);
  }
  const failed = buoyReturn(1, 'tow_in', 'failed');
  assert.equal(failed.receipt.starterBuoyRecovery, undefined);
  assert.doesNotMatch(kesslerStarterWorkReply(failed.state, STATION, CHOICE).text, /receiving slip/);
});

test('the current settled book and active hull constrain reordered receiving history', () => {
  const { state, receipt: second } = buoyReturn(2, 'sling_in');
  const first = buoyReturn(1).receipt;
  second.at_s = 105;
  for (const receipts of [[first, second], [second, first, second]]) {
    state.missions.receipts = receipts;
    const reply = kesslerStarterWorkReply(state, STATION, CHOICE);
    assert.match(reply.text, /Claim-rim buoy\. Sling-in accepted/);
    assert.doesNotMatch(reply.text, /44-C buoy/);
  }
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: ['mod_drill_amp'] }];
  assert.doesNotMatch(kesslerStarterWorkReply(state, STATION, CHOICE).text, /receiving slip/);
});
