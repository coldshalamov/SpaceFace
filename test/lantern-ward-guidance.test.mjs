import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomainDiffer, applyDomainPathUpdate, configureDomainMirroring } from '../scripts/lib/simReadModel.mjs';
import { lanternWardDialogueFacts, lanternWardHailOffer, lanternWardHailResponse, LANTERN_WARD_REPAIR_ACTION } from '../src/data/lanternWardHail.js';
import { selectLanternWardDialogue } from '../src/missions/lanternWardStory.js';
import { LANTERN_WARD_ID, LANTERN_WARD_SECTOR } from '../src/data/lanternWardLayout.js';
import { LANTERN_WARD_RECORD_IDS as IDS } from '../src/data/lanternWardHardware.js';

const nessa = { id: 7, type: 'ship', alive: true, hull: 100,
  data: { worldRecordId: IDS.tug, lanternWardId: LANTERN_WARD_ID, lanternWardActor: 'tug' } };
function source(ward) {
  return { npcJobs: { lanternWard: ward }, world: { currentSectorId: LANTERN_WARD_SECTOR },
    missions: { lanternWardConversation: { visits: 2 } }, entities: new Map([[nessa.id, nessa]]), simTime: 10 };
}
function mirror(state) {
  configureDomainMirroring({});
  const differ = createDomainDiffer(), domains = new Map(), touched = new Set();
  for (let tick = 0; tick < 60; tick++) {
    for (const update of differ.diff(state, tick).updates) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
      applyDomainPathUpdate(domains, { ...update, segs }, touched);
    }
  }
  return { ...state, npcJobs: domains.get('npcJobs') };
}
function hail(state, choice = 'route', repairResult = null) {
  const offer = lanternWardHailOffer(state, { entity: nessa, targetId: nessa.id }, 'request', 100);
  return { offer, response: lanternWardHailResponse(state, offer, choice, repairResult) };
}
const ward = changes => ({ version: 1, initialized: true, phase: 'blocked', blocked: true, lampMissing: false,
  cradleAway: false, objects: { lamp: { lost: false }, cradle: { lost: false } }, history: {}, ...changes });

test('main and actual domain projection provide actionable state-specific hail guidance', () => {
  const cases = [
    [ward({}), 'blockage', /massline/i, /mast/i, /cradle/i, /south/i, /release/i],
    [ward({ phase: 'missing', lampMissing: true }), 'missingLamp', /original/i, /unavailable/i],
    [ward({ phase: 'damaged', history: { lampStolen: true } }), 'repair', /electronics/i, /slow/i, /FIT CONTACTS/i],
    [ward({ phase: 'displaced', history: { lampStolen: true } }), 'displaced', /same/i, /seat/i, /release/i],
    [ward({ phase: 'blocked', history: { ignored: true } }), 'revisitIgnored', /massline/i, /mast/i],
    [ward({ phase: 'installed', blocked: false, history: { playerCleared: true } }), 'revisitHelp', /connected/i, /memorial.*dark/i],
  ];
  for (const [w, expected, ...patterns] of cases) {
    const main = source(w), projected = mirror(main);
    const mainFacts = lanternWardDialogueFacts(main), projectedFacts = lanternWardDialogueFacts(projected);
    for (const key of ['phase', 'blocked', 'missingLamp', 'cradleMissing', 'damaged', 'installed'])
      assert.equal(projectedFacts[key], mainFacts[key], `${expected}: ${key}`);
    assert.match(selectLanternWardDialogue(mainFacts, { revisit: true }).id, new RegExp(`:${expected}$`));
    const a = hail(main), b = hail(projected);
    assert.deepEqual(b, a, expected);
    assert.match(a.offer.lines[1], /\S/);
    for (const pattern of patterns) assert.match(a.response.lines.join(' '), pattern, expected);
    if (expected === 'repair') {
      assert.ok(a.offer.actions.some(action => action.id === LANTERN_WARD_REPAIR_ACTION));
      assert.match(a.offer.lines[1], /contacts/i);
      assert.match(a.offer.lines[1], /remember/i);
    } else assert.ok(!a.offer.actions.some(action => action.id === LANTERN_WARD_REPAIR_ACTION));
    if (expected === 'missingLamp') assert.doesNotMatch(a.response.lines.join(' '), /find|cradle.*missing/i);
    if (expected === 'revisitIgnored') assert.doesNotMatch(a.offer.lines[1], /crew|cleared/i);
  }
});

test('availability facts remain distinct, bounded and do not infer a lamp from generic missing phase', () => {
  for (const changes of [
    { phase: 'missing', lampMissing: true },
    { phase: 'missing', cradleAway: true },
    { phase: 'missing' },
    { phase: 'missing', objects: { lamp: { lost: true }, cradle: { lost: false } } },
  ]) {
    const main = source(ward(changes)), projected = mirror(main);
    const a = lanternWardDialogueFacts(main), b = lanternWardDialogueFacts(projected);
    assert.equal(b.missingLamp, a.missingLamp);
    assert.equal(b.cradleMissing, a.cradleMissing);
    assert.deepEqual(hail(projected), hail(main));
    assert.equal(typeof projected.npcJobs.lanternWard.lampMissing, 'boolean');
    assert.equal(typeof projected.npcJobs.lanternWard.cradleAway, 'boolean');
  }
  const away = hail(source(ward({ phase: 'missing', cradleAway: true })));
  assert.match(away.response.lines[0], /cradle.*away/i);
  assert.doesNotMatch(away.response.lines[0], /lamp.*unavailable/i);
  const other = hail(source(ward({ phase: 'missing' })));
  assert.match(other.response.lines[0], /equipment or operator/i);
  assert.doesNotMatch(other.response.lines[0], /original.*unavailable/i);
});

test('blocked introduction distinguishes the family seat and dark memorial; repair refusal retains real prerequisites', () => {
  const intro = hail(source(ward({}))).offer.lines[1];
  assert.match(intro, /household lamp/i); assert.match(intro, /three brass/i); assert.match(intro, /memorial.*dark/i);
  const state = source(ward({ phase: 'damaged' }));
  const missingCargo = hail(state, LANTERN_WARD_REPAIR_ACTION, { ok: false, reason: 'one_electronics_required' });
  assert.match(missingCargo.response.lines[0], /electronics/i);
  const notAttended = hail(state, LANTERN_WARD_REPAIR_ACTION, { ok: false, reason: 'attended_lamp_required' });
  assert.match(notAttended.response.lines[0], /lamp/i); assert.match(notAttended.response.lines[0], /match speed/i);
});


test('actual worker mirror preserves current handoff, recovery and connection progress without private journals', () => {
  for (const [phase, changes, pattern] of [
    ['transit', {}, /in transit/],
    ['recovering', {}, /recovering the loaded cradle/],
    ['interrupted', {}, /handoff interrupted/],
    ['brace', { cradleAway: true }, /handoff pending/],
    ['connect', { workS: 9, cradleAway: true }, /50%/],
    ['installed', { needsReinstall: true }, /circuit interrupted/],
    ['installed', { objects: { lamp: { lost: true } } }, /Original family lamp lost/],
    ['installed', { objects: { receiver: { lost: true } } }, /receiving cup lost/],
  ]) {
    const state = source(ward({ phase, blocked: false, ...changes,
      firstCompletionReceipt: { secret: 'private-owner-receipt' }, privateWorkJournal: 'owner-only' }));
    const projected = mirror(state), a = hail(state), b = hail(projected);
    assert.deepEqual(b, a, phase);
    assert.match(a.offer.lines.at(-1), pattern);
    assert.equal(projected.npcJobs.lanternWard.firstCompletionReceipt, undefined);
    assert.equal(projected.npcJobs.lanternWard.privateWorkJournal, undefined);
    if (phase === 'brace' || phase === 'connect') assert.doesNotMatch(a.offer.lines[1], /cradle is away/i);
  }
});

test('worker briefing clamps malformed progress and preserves the work owner reset after Continue', () => {
  for (const [workS, expected] of [[9, /50%/], [0, /0%/], [-4, /0%/], [Infinity, /0%/], [90, /100%/]]) {
    const state = source(ward({ phase: 'connect', workS, blocked: false }));
    const projected = mirror(state);
    assert.deepEqual(hail(projected), hail(state));
    assert.match(hail(projected).offer.lines.at(-1), expected);
    assert.ok(projected.npcJobs.lanternWard.workS >= 0 && projected.npcJobs.lanternWard.workS <= 18);
  }
});
