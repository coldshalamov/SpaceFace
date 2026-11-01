import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kesslerStarterWorkChoice as choice, kesslerStarterWorkReply as reply } from '../src/ui/station/starterWorkdayConversation.js';
import { STARTER_JOBS } from '../src/data/starterJobs.js';

const STATION = 'station_helios';
const ID = 'helios_local_work';
function setup(job = STARTER_JOBS[0], done = 0) {
  const step = job.steps[done];
  const offer = step && { id: `starter-${job.id}-${step.step}`, source: 'starterJob', type: step.type,
    title: step.title, destStationId: STATION, destSectorId: 'sector_helios_prime',
    params: { starterJobId: job.id, starterStep: step.step, requiredModule: job.requiredModule } };
  const state = { ui: { docked: true, dockedStationId: STATION },
    player: { ownedShips: [{ defId: job.shipId, fittings: [job.requiredModule] }], activeShipIndex: 0 },
    missions: { starterJobStep: { [job.id]: done }, active: [], boards: { [STATION]: { slots: offer ? [offer] : [] } } } };
  return { state, offer };
}

for (const job of STARTER_JOBS) {
  test(`${job.id}: arrival offers only the real current ticket and writes nothing`, () => {
    const { state, offer } = setup(job);
    const before = JSON.stringify(state);
    assert.equal(choice(state, STATION).id, ID);
    const r = reply(state, STATION, ID);
    assert.equal(r.missionOffer, offer);
    assert.match(r.text, /No settled/);
    assert.ok(r.text.includes(job.steps[0].title));
    assert.equal(JSON.stringify(state), before);
  });
  test(`${job.id}: settled ticket survives JSON continuation; next posting is exact`, () => {
    const { state } = setup(job, 1);
    const restored = JSON.parse(JSON.stringify(state));
    const r = reply(restored, STATION, ID);
    assert.match(r.text, /ticket 1 is settled/);
    assert.equal(r.missionOffer, restored.missions.boards[STATION].slots[0]);
    assert.ok(r.text.includes(job.steps[1].title));
  });
  test(`${job.id}: active wins over duplicate board, objective progress is not settlement`, () => {
    const { state, offer } = setup(job);
    state.missions.active.push({ ...offer, status: 'active', progress: { delivered: true, quota: 999 }, objectivesComplete: true });
    const r = reply(state, STATION, ID);
    assert.equal(r.missionOffer, undefined);
    assert.match(r.text, /No settled/);
    assert.match(r.text, /already have a local ticket open/);
    assert.doesNotMatch(r.text, /original buoy|marked iron/); // legacy live work uses its own log
  });
  test(`${job.id}: lost or failed ticket is not remembered as completed; retry stays ordinary`, () => {
    const { state, offer } = setup(job);
    state.missions.active.push({ ...offer, status: 'failed' });
    assert.match(reply(state, STATION, ID).text, /No settled/);
    assert.equal(reply(state, STATION, ID).missionOffer, offer);
    state.missions.boards[STATION].slots = [];
    assert.equal(reply(state, STATION, ID).missionOffer, undefined);
    assert.match(reply(state, STATION, ID).text, /lost job is not a settled one/);
  });
  test(`${job.id}: missing equipment cannot turn a conversation into acceptance`, () => {
    const { state } = setup(job); state.player.ownedShips[0].fittings = [];
    assert.equal(reply(state, STATION, ID).missionOffer, undefined);
    assert.match(reply(state, STATION, ID).text, /fittings/);
  });
}

test('foreign station, stale undocked click, missing state and unrelated choice fail closed', () => {
  const { state } = setup();
  assert.equal(choice(state, 'station_tethys'), null);
  assert.equal(reply(state, STATION, 'market'), null);
  state.ui.docked = false;
  assert.equal(choice(state, STATION), null);
  assert.equal(reply(state, STATION, ID).missionOffer, undefined);
  assert.equal(reply({}, STATION, ID).missionOffer, undefined);
});
test('switched hull uses that hull’s record, not a different branch’s completed ticket', () => {
  const { state } = setup();
  state.missions.starterJobStep.starter_pelican = 3;
  assert.match(reply(state, STATION, ID).text, /No settled Hitch/);
  state.player.ownedShips[0].defId = 'ship_unrelated';
  assert.equal(reply(state, STATION, ID).missionOffer, undefined);
});
test('an open other-hull ticket is remembered through a ship switch, without offering duplicate work', () => {
  const { state } = setup();
  state.missions.active.push({ status: 'active', params: { starterJobId: 'starter_pelican' } });
  const r = reply(state, STATION, ID);
  assert.match(r.text, /Pelican ticket open/);
  assert.match(r.text, /Changing hulls does not settle/);
  assert.equal(r.missionOffer, undefined);
  state.player.ownedShips[0].defId = 'ship_unrelated';
  assert.match(reply(state, STATION, ID).text, /Pelican ticket open/);
});
test('the actual legacy board title and instructions win over newly authored step data', () => {
  const { state, offer } = setup(STARTER_JOBS[1]);
  offer.title = 'Existing saved recovery';
  offer.brief = 'Recover the registered core from this ticket’s marked site.';
  const r = reply(state, STATION, ID);
  assert.ok(r.text.includes(offer.title));
  assert.ok(r.text.includes(offer.brief));
  assert.doesNotMatch(r.text, /original buoy|marked iron/);
});
test('malformed, wrong step/branch/type/fit/destination/source postings cannot become offers', () => {
  const mutations = [m => m.source = 'random', m => m.type = 'cargo_delivery',
    m => m.params.starterStep = 3, m => m.params.starterJobId = 'starter_pelican',
    m => m.params.requiredModule = 'mod_fake', m => m.destStationId = 'station_tethys',
    m => m.destSectorId = 'sector_ceres_belt', m => m.id = ''];
  for (const mutate of mutations) {
    const { state, offer } = setup(); mutate(offer);
    assert.equal(reply(state, STATION, ID).missionOffer, undefined);
  }
});
test('legacy/missing counter does not manufacture memory; impossible counter does not claim full completion', () => {
  for (const n of [undefined, -1, '1', 1.5, NaN]) {
    const { state } = setup(); state.missions.starterJobStep.starter_hitch = n;
    assert.match(reply(state, STATION, ID).text, /No settled/);
  }
  const { state } = setup(); state.missions.starterJobStep.starter_hitch = 999;
  assert.equal(reply(state, STATION, ID).missionOffer, undefined);
  assert.match(reply(state, STATION, ID).text, /does not match/);
});
test('terminal counter remembers only the last settled ticket, not all skipped accomplishments or 47-A', () => {
  const { state } = setup(STARTER_JOBS[0], STARTER_JOBS[0].steps.length);
  const r = reply(state, STATION, ID);
  assert.equal(r.missionOffer, undefined);
  assert.match(r.text, /47-A keeps its own account/);
  assert.doesNotMatch(r.text, /All three|repaired|restored|cleared/);
});
test('scarred Wasp plate remains eligible through the existing equipment reader', () => {
  const { state, offer } = setup(STARTER_JOBS.find(j => j.id === 'starter_wasp'));
  state.player.ownedShips[0].fittings = ['mod_ram_plate_scarred'];
  assert.equal(reply(state, STATION, ID).missionOffer, offer);
});

// Execute the actual canonical reply owner with explicit ports for unrelated conversations.
// This is not a full bar/browser import; it proves the production route and slip precedence.
const source = readFileSync(new URL('../src/ui/station/barContacts.js', import.meta.url), 'utf8');
const start = source.indexOf('function buildCanonicalReply(');
const end = source.indexOf('/* ── main panel export', start);
const canonical = Function('kesslerWeightSlipReply', 'kesslerStarterWorkReply',
  source.slice(start, end) + '; return buildCanonicalReply;')(
    (_state, _station, id) => id === 'weight_slip:test' ? { text: 'original slip' } : null, reply);
test('actual Kessler reply reaches work reader without shadowing weight slip or other cast', () => {
  const { state, offer } = setup();
  assert.equal(canonical({ canonicalKey: 'kessler' }, ID, { state }, STATION).missionOffer, offer);
  assert.equal(canonical({ canonicalKey: 'kessler' }, 'weight_slip:test', { state }, STATION).text, 'original slip');
  assert.equal(canonical({ canonicalKey: 'slate' }, ID, { state }, STATION), null);
});
test('production choice composition retains ordinary choices, slip first, and work; greetings untouched', () => {
  const a = source.indexOf("    if (canonical.canonicalKey === 'kessler') {");
  const b = source.indexOf("    if (canonical.role === 'barkeep')", a);
  const decorate = Function('canonical', 'state', 'stationId', 'kesslerWeightSlipChoice',
    'kesslerStarterWorkChoice', 'getChoices', source.slice(a, b) + '; return canonical;');
  const { state } = setup();
  const result = decorate({ canonicalKey: 'kessler', role: 'merchant', line: 'story greeting' }, state, STATION,
    () => ({ id: 'slip' }), choice, () => [{ id: 'market' }]);
  assert.deepEqual(result.choices.map(c => c.id), ['market', 'slip', ID]);
  assert.equal(result.line, 'story greeting');
  assert.ok(source.includes("kessler.line = 'Maintenance still files tickets about a smell in Bay 7."));
});
