// test/quill-expansion.test.mjs — QUILL / AR-3: the information economy.
// Copies mint folios (sellable intel: manifests, routes, NAMES). The desk sells
// one per cadence while the pilot stands the rim; names burn and forgeries get
// detected; answered page-errands raise every price; too much notice sends the
// Archive's redactor to take a page back — or take credits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUILL } from '../src/data/quill.js';
import {
  createQuill, quillSpec, quillRedactorSpec,
  quillFolioKind, quillFolioGrade, quillFolioPrice,
  quillNamesBurns, quillForgeryDetected, quillBurnFaction, quillBuyerFor,
  quillOverprintable, quillBlank, quillReimpressable, quillErrandFor,
  quillExposureNow, sanitizeQuillLedger,
  QUILL_DESK, QUILL_PRESS, QUILL_NOTICE, QUILL_REDACTOR, QUILL_REBOUND_CR, QUILL_ERRANDS,
} from '../src/systems/quill.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { mulberry32 } from '../src/core/rng.js';

const QUILL_EVENTS = [
  'quill:folioMinted', 'quill:folioSold', 'quill:folioBurned', 'quill:forgeryDetected',
  'quill:folioSeized', 'quill:errandArmed', 'quill:errandAnswered', 'quill:archiveRebound',
  'quill:redactorSpawned', 'quill:redactorKilled', 'quill:redactorWithdrew',
];

function fixture({ sector = 'sector_triton_wake', runKind = 'adventure' } = {}) {
  const bus = createBus();
  const popups = []; const grants = []; const charges = []; const repDeltas = [];
  const logs = []; const events = [];
  bus.on('comms:popup', (p) => popups.push(p));
  bus.on('comms:log', (p) => logs.push(p));
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('economy:chargeCredits', (p) => charges.push(p));
  bus.on('faction:repDelta', (p) => repDeltas.push(p));
  for (const ev of QUILL_EVENTS) bus.on(ev, (p) => events.push({ ev, p }));
  const player = { id: 7, alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const state = {
    run: { kind: runKind },
    world: { currentSectorId: sector },
    story: { flags: {} },
    simTime: 100,
    tick: 60,
    playerId: player.id,
    player,
    entityList: [player],
    entities: new Map([[player.id, player]]),
    rng: mulberry32(4242),
  };
  const helpers = {
    spawnEntity(spec) {
      const e = { id: 900 + state.entityList.length, alive: true, ...spec };
      state.entityList.push(e); state.entities.set(e.id, e); return e;
    },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    sectorCookProviders: [],
  };
  const sys = createQuill();
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, popups, grants, charges, repDeltas, logs, events, sys, player };
}

const robot = (state) => state.entityList.find((e) => e.alive && e.data?.quill);
const redactor = (state) => state.entityList.find((e) => e.alive && e.data?.quillRedactor);
const ledgerOf = (state) => state.story.quillLedger;
const says = (popups, prefix) => popups.filter((p) => String(p.id).startsWith(prefix));
const evts = (events, name) => events.filter((e) => e.ev === name);
let wreckSeq = 0;
const put = (state, e) => { state.entityList.push(e); state.entities.set(e.id, e); return e; };
const wreck = (state, data, { at = QUILL.post, speed = 0, type = 'wreck' } = {}) => put(state, {
  id: 500 + (wreckSeq++), alive: true, type,
  pos: { x: at.x + 12, z: at.z - 8 },
  vel: { x: speed, z: 0 },
  radius: 16, mass: 80, hull: 0, hullMax: 200,
  data,
});
const scannedWreck = (state, extra = {}) => wreck(state,
  { scanRevealed: { discovery: 'hulk' }, markerId: `wreck_${wreckSeq}`, ...extra });
const standAtDesk = (state, player) => {
  const r = robot(state);
  player.pos = { x: r.pos.x + 10, z: r.pos.z };
};
const holdFolio = (state, folio, extra = {}) => {
  state.story.quillLedger = {
    schema: 1, seq: 1, saleSeq: 0,
    folios: [{
      id: 'quill_folio_1', markerId: 'm_test', sectorId: QUILL.sectorId,
      kind: 'manifest', grade: 3, impression: 1, forged: false,
      copiedAt: 90, status: 'held', priceCr: 0, grantedCr: 0, soldAt: 0, saleSeq: 0, buyer: null,
      ...folio,
    }],
    exposure: 0, exposureAt: state.simTime, ...extra,
  };
  return state;
};

// ── the ledger: every copy mints a folio ─────────────────────────────────────
test('a copied wreck mints a held folio — kind, grade, and notice on the ledger', () => {
  const { state, sys, events } = fixture();
  const w = scannedWreck(state);
  sys.update(0.5, state);
  const ledger = ledgerOf(state);
  assert.ok(ledger, 'the first copy mints the ledger subtree');
  assert.equal(ledger.schema, 1);
  assert.equal(ledger.folios.length, 1);
  const folio = ledger.folios[0];
  assert.equal(folio.status, 'held');
  assert.ok(['manifest', 'route', 'names'].includes(folio.kind), `kind ${folio.kind}`);
  assert.ok(folio.grade >= 1 && folio.grade <= 5);
  assert.equal(folio.impression, 1);
  assert.equal(folio.markerId, w.data.markerId);
  assert.equal(w.data.quillFolioKind, folio.kind, 'the stamp carries the folio kind');
  assert.ok(ledger.exposure > 0, 'a page that exists twice gets noticed');
  assert.equal(evts(events, 'quill:folioMinted').length, 1);
  assert.equal(evts(events, 'quill:folioMinted')[0].p.id, folio.id);
});

test('folio kind reads the log: court/registry paper is names, the rest hash to lane goods', () => {
  assert.equal(quillFolioKind({ provenance: { recordType: 'dual_registry_loss' } }), 'names');
  assert.equal(quillFolioKind({ provenance: { incidentId: 'incident_hearing_x' } }), 'names');
  assert.equal(quillFolioKind({ provenance: { sourceRef: 'mission.courier_run' } }), 'names');
  const plain = quillFolioKind({ markerId: 'wreck_77' });
  assert.ok(['manifest', 'route', 'names'].includes(plain));
  assert.equal(quillFolioKind({ markerId: 'wreck_77' }), plain, 'deterministic off the marker');
  assert.notEqual(quillFolioKind({}), undefined);
});

// ── the desk: sales while the pilot stands the rim ────────────────────────────
test('standing the desk sells the best folio — gross price, ink cut, cadence', () => {
  const { state, player, sys, grants, events } = fixture();
  holdFolio(state, { kind: 'manifest', grade: 3 });
  standAtDesk(state, player);
  sys.update(0.5, state);
  const ledger = ledgerOf(state);
  const folio = ledger.folios[0];
  assert.equal(folio.status, 'sold');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].reason, 'quill:folio:manifest');
  const expectedGross = Math.round(QUILL_PRESS.baseCr.manifest * (0.7 + 0.3 * 3));
  assert.equal(folio.priceCr, expectedGross);
  assert.equal(grants[0].amount, Math.max(1, Math.round(expectedGross * (1 - QUILL_DESK.inkCut))));
  assert.equal(folio.grantedCr, grants[0].amount);
  assert.equal(ledger.sold, 1);
  assert.equal(ledger.earnedCr, grants[0].amount);
  assert.equal(evts(events, 'quill:folioSold').length, 1);
  assert.equal(evts(events, 'quill:folioSold')[0].p.saleSeq, 1);
  // Cadence: the drone writes carefully — no second sale on the same beat.
  sys.update(0.5, state);
  assert.equal(grants.length, 1, 'one folio per cadence');
});

test('the desk only trades while the pilot holds the rim — and never during a quiet', () => {
  const { state, player, sys, grants } = fixture();
  holdFolio(state, { kind: 'manifest', grade: 2 });
  // Player is 500+ away — no sale no matter how good the offer.
  sys.update(0.5, state);
  assert.equal(grants.length, 0);
  // Standing the rim but the desk is quiet after a burn.
  state.story.quillLedger.quietUntil = state.simTime + 60;
  standAtDesk(state, player);
  sys.update(0.5, state);
  assert.equal(grants.length, 0);
  // Quiet lifts: the next cadence sells.
  state.simTime += 61;
  sys.update(0.5, state);
  assert.equal(grants.length, 1);
});

test('a names sale that burns: fine, faction hit, the desk goes quiet, a collector comes', () => {
  const { state, player, sys, grants, charges, repDeltas, events, popups } = fixture();
  holdFolio(state, { id: 'quill_folio_names', kind: 'names', grade: 2, markerId: 'm_names' });
  // Pick the sale sequence that burns — deterministic off (folio id, saleSeq).
  let seq = 1;
  while (seq < 300 && !quillNamesBurns({ id: 'quill_folio_names' }, seq)) seq += 1;
  assert.ok(seq < 300, 'a burn exists inside 300 sales');
  state.story.quillLedger.saleSeq = seq - 1;
  standAtDesk(state, player);
  sys.update(0.5, state);
  const ledger = ledgerOf(state);
  assert.equal(grants.length, 1, 'the sale itself pays before the burn lands');
  assert.equal(charges.length, 1);
  assert.equal(charges[0].reason, 'quill:names_burned');
  assert.ok(charges[0].amount >= QUILL_PRESS.namesFineMinCr);
  assert.equal(repDeltas.length, 1);
  assert.equal(repDeltas[0].delta, QUILL_PRESS.namesRepHit);
  assert.equal(repDeltas[0].reason, 'quill:names_burned');
  assert.ok(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_quiet', 'faction_reach']
    .includes(repDeltas[0].factionId));
  assert.ok(ledger.quietUntil > state.simTime, 'the desk goes still');
  assert.ok(redactor(state), 'the Archive sends a collector for the burn');
  assert.equal(ledger.burned, 1);
  assert.equal(ledger.folios[0].burned, true);
  assert.equal(evts(events, 'quill:folioBurned').length, 1);
  assert.equal(evts(events, 'quill:redactorSpawned').length, 1);
  assert.ok(says(popups, 'quill_burn_').length >= 1);
});

test('a detected forgery collapses the market and sends the collector', () => {
  const { state, player, sys, charges, events } = fixture();
  holdFolio(state, { id: 'quill_folio_fake', kind: 'forgery', grade: 4, forged: true });
  let seq = 1;
  while (seq < 300 && !quillForgeryDetected({ id: 'quill_folio_fake' }, seq)) seq += 1;
  assert.ok(seq < 300);
  state.story.quillLedger.saleSeq = seq - 1;
  standAtDesk(state, player);
  sys.update(0.5, state);
  const ledger = ledgerOf(state);
  assert.equal(charges.length, 1);
  assert.equal(charges[0].reason, 'quill:forgery_detected');
  assert.ok(ledger.burnedMarketUntil > state.simTime, 'every price collapses');
  assert.ok(redactor(state));
  assert.equal(evts(events, 'quill:forgeryDetected').length, 1);
  // While the market is burned, prices run at the collapsed multiplier.
  const held = { id: 'x', kind: 'manifest', grade: 2, impression: 1 };
  const burned = quillFolioPrice(held, ledger, state.simTime);
  const clean = quillFolioPrice(held, { ...ledger, burnedMarketUntil: 0 }, state.simTime);
  assert.equal(burned, Math.round(clean * QUILL_DESK.burnedPriceMult));
});

// ── the press: post-Archive work ─────────────────────────────────────────────
test('the Archive out: a scanned wreck gets an OVERPRINT — a folio, no page, no quillCopied', () => {
  const { state, sys, events, popups } = fixture();
  state.story.flags[QUILL.copiedFlag] = QUILL.secrets.length;
  const w = scannedWreck(state);
  sys.update(0.5, state);
  assert.equal(w.data.quillOverprinted, true);
  assert.equal(w.data.quillCopied == null, true, 'the Archive-stamp contract is untouched');
  assert.equal(state.story.flags[QUILL.copiedFlag], QUILL.secrets.length, 'no new page opened');
  const ledger = ledgerOf(state);
  assert.equal(ledger.folios.length, 1);
  assert.ok(['manifest', 'route', 'names'].includes(ledger.folios[0].kind));
  assert.equal(ledger.folios[0].forged, false);
  assert.equal(evts(events, 'quill:folioMinted').length, 1);
  assert.ok(says(popups, 'quill_press').length === 1, 'the press announces itself once');
  sys.update(0.5, state);
  assert.equal(says(popups, 'quill_press').length, 1, 'and stays said');
});

test('the press priority: overprint beats re-impression beats blank — one hull per census', () => {
  const { state, sys } = fixture();
  state.story.flags[QUILL.copiedFlag] = QUILL.secrets.length;
  const stamped = wreck(state, { quillCopied: true, quillFolioKind: 'route', quillFolioGrade: 4 });
  const blank = wreck(state, {});
  const fresh = scannedWreck(state);
  sys.update(0.5, state);
  assert.equal(fresh.data.quillOverprinted, true, 'the real log overprints first');
  assert.equal(stamped.data.quillReimpressed == null, true);
  assert.equal(blank.data.quillForgedBlank == null, true);
  sys.update(0.5, state);
  assert.equal(stamped.data.quillReimpressed, true, 'then the stamped hull re-impresses');
  assert.equal(blank.data.quillForgedBlank == null, true);
  sys.update(0.5, state);
  assert.equal(blank.data.quillForgedBlank, true, 'then the blank becomes a forged page');
  const ledger = ledgerOf(state);
  assert.equal(ledger.folios.length, 3);
  assert.equal(ledger.folios[1].kind, 'impression');
  assert.equal(ledger.folios[1].impression, 2);
  assert.equal(ledger.folios[1].grade, 3, 'an impression fades one grade off the stamp');
  assert.equal(ledger.folios[2].kind, 'forgery');
  assert.equal(ledger.folios[2].forged, true);
  assert.equal(ledger.forged, 1);
});

test('an unscanned blank carries a forged page — and a real log can still be read under it', () => {
  const { state, sys } = fixture();
  state.story.flags[QUILL.copiedFlag] = QUILL.secrets.length;
  const blank = wreck(state, {});
  assert.equal(quillBlank(blank, robot(state).pos), true);
  sys.update(0.5, state);
  assert.equal(blank.data.quillForgedBlank, true);
  assert.equal(quillBlank(blank, robot(state).pos), false, 'a forged blank is spent');
  // A scanner later finds a real manifest under the forged page: the hull is
  // still overprintable once — every hull is worth at most two products.
  blank.data.scanRevealed = { discovery: 'contraband_hold' };
  blank.data.markerId = 'm_late_scan';
  sys.update(0.5, state);
  assert.equal(blank.data.quillOverprinted, true);
  assert.equal(ledgerOf(state).folios.length, 2);
});

// ── the errands: pages carried home ──────────────────────────────────────────
test('opening a page arms its errand — carry the copy to the sector that wrote it', () => {
  const { state, bus, sys, grants, events, popups } = fixture();
  scannedWreck(state);
  sys.update(0.5, state);
  const ledger = ledgerOf(state);
  assert.deepEqual({ page: ledger.errand.page, sectorId: ledger.errand.sectorId },
    { page: 0, sectorId: 'sector_dione_lane' });
  assert.equal(evts(events, 'quill:errandArmed').length, 1);
  state.world.currentSectorId = 'sector_dione_lane';
  bus.emit('sector:enter', { sectorId: 'sector_dione_lane' });
  assert.equal(ledger.answered[0], true);
  assert.equal(ledger.errandsDone, 1);
  assert.equal(ledger.errand, null, 'one page open, one errand — the chain waits');
  const errandGrants = grants.filter((g) => g.reason === 'quill:errand:0');
  assert.equal(errandGrants.length, 1);
  assert.equal(errandGrants[0].amount, QUILL_ERRANDS[0].rewardCr);
  assert.equal(evts(events, 'quill:errandAnswered').length, 1);
  assert.ok(says(popups, 'quill_answered_0').length === 1);
});

test('the errand chain: the next opened page arms the next home — and all six rebound', () => {
  const { state, bus, sys, grants, events } = fixture();
  for (let i = 0; i < 2; i += 1) scannedWreck(state);
  sys.update(0.5, state);
  sys.update(0.5, state);
  const ledger = ledgerOf(state);
  assert.equal(ledger.errand.page, 0);
  // Answer page 0: the chain immediately arms page 1's home.
  state.world.currentSectorId = 'sector_dione_lane';
  bus.emit('sector:enter', { sectorId: 'sector_dione_lane' });
  assert.equal(ledger.errand.page, 1);
  assert.equal(ledger.errand.sectorId, 'sector_orcus_shadow');
  // Force the tail: five answered, the last errand armed for the dark.
  ledger.answered = { 0: true, 1: true, 2: true, 3: true, 4: true };
  ledger.errandsDone = 5;
  ledger.errand = { page: 5, sectorId: 'sector_sedna_dark', armedAt: 1 };
  state.story.flags[QUILL.copiedFlag] = QUILL.secrets.length;
  state.world.currentSectorId = 'sector_sedna_dark';
  bus.emit('sector:enter', { sectorId: 'sector_sedna_dark' });
  assert.equal(ledger.rebound, true);
  assert.equal(state.story.flags.quill_rebound, true);
  const rebound = grants.filter((g) => g.reason === 'quill:rebound');
  assert.equal(rebound.length, 1);
  assert.equal(rebound[0].amount, QUILL_REBOUND_CR);
  assert.equal(evts(events, 'quill:archiveRebound').length, 1);
});

test('errands ignore wrong sectors and non-adventure runs', () => {
  const { state, bus, sys, grants } = fixture();
  scannedWreck(state);
  sys.update(0.5, state);
  state.world.currentSectorId = 'sector_io_reach';
  bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
  assert.equal(grants.filter((g) => String(g.reason).startsWith('quill:errand')).length, 0);
  assert.equal(ledgerOf(state).errand.page, 0, 'still armed — the page waits');
  const { state: s2, bus: b2, sys: y2, grants: g2 } = fixture({ runKind: 'survival' });
  // survival never mints a ledger (no drone), and an injected errand never resolves.
  s2.story.quillLedger = { schema: 1, folios: [], seq: 0, saleSeq: 0, exposure: 0, exposureAt: 0,
    answered: {}, errand: { page: 0, sectorId: 'sector_dione_lane', armedAt: 0 }, errandsDone: 0 };
  b2.emit('sector:enter', { sectorId: 'sector_dione_lane' });
  assert.equal(g2.length, 0);
});

// ── the notice and the redactor: secrets with consequences ───────────────────
test('hot notice sends a redactor; contact seizes the best held folio and leaves', () => {
  const { state, player, sys, events, popups } = fixture();
  holdFolio(state, { id: 'quill_folio_hot', kind: 'names', grade: 5 });
  state.story.quillLedger.exposure = 90;
  state.story.quillLedger.exposureAt = state.simTime;
  sys.update(0.5, state);
  const red = redactor(state);
  assert.ok(red, 'past the line the Archive sends a collector');
  assert.equal(evts(events, 'quill:redactorSpawned').length, 1);
  // Stand still: the collector reaches in and takes the page.
  player.pos = { x: red.pos.x + 5, z: red.pos.z };
  const before = state.story.quillLedger.exposure;
  sys.update(0.5, state);
  const ledger = ledgerOf(state);
  assert.equal(ledger.folios[0].status, 'seized');
  assert.equal(ledger.seized, 1);
  assert.equal(redactor(state), undefined, 'it leaves with the page');
  assert.ok(ledger.exposure < before, 'the Archive got what it came for');
  assert.equal(evts(events, 'quill:folioSeized').length, 1);
  assert.equal(evts(events, 'quill:folioSeized')[0].p.folioId, 'quill_folio_hot');
  assert.ok(says(popups, 'quill_seize_').length >= 1);
});

test('no held pages: the redactor collects credits instead', () => {
  const { state, player, sys, charges, events } = fixture();
  holdFolio(state, { status: 'sold' });
  state.story.quillLedger.exposure = 90;
  sys.update(0.5, state);
  const red = redactor(state);
  assert.ok(red);
  player.pos = { x: red.pos.x + 5, z: red.pos.z };
  sys.update(0.5, state);
  assert.equal(charges.length, 1);
  assert.equal(charges[0].reason, 'quill:redactor_fine');
  assert.equal(charges[0].amount, QUILL_REDACTOR.seizeFineCr);
  assert.equal(evts(events, 'quill:folioSeized')[0].p.folioId, null);
});

test('the redactor chases through the impulse membrane — never a vel write', () => {
  const { state, sys } = fixture();
  holdFolio(state, {});
  state.story.quillLedger.exposure = 90;
  sys.update(0.5, state);
  const red = redactor(state);
  const vxBefore = red.vel.x; const vzBefore = red.vel.z;
  sys.update(0.5, state);
  const cmds = consumePhysicsCommand(red);
  assert.ok(cmds && cmds.impulses.length >= 1, 'homing is a queued impulse');
  const last = cmds.impulses[cmds.impulses.length - 1];
  assert.ok(Number.isFinite(last.x) && Number.isFinite(last.z));
  assert.equal(red.vel.x, vxBefore, 'vel is the membrane\'s, never ours');
  assert.equal(red.vel.z, vzBefore);
});

test('kill the collector: the Archive writes your name in a margin', () => {
  const { state, bus, sys, repDeltas, events } = fixture();
  holdFolio(state, {});
  state.story.quillLedger.exposure = 90;
  sys.update(0.5, state);
  const red = redactor(state);
  const before = state.story.quillLedger.exposure;
  red.alive = false;
  bus.emit('entity:killed', { id: red.id, killerId: 7 });
  const ledger = ledgerOf(state);
  assert.equal(ledger.redactorLosses, 1);
  assert.ok(ledger.exposure > before, 'killing a page-drone is noticed');
  assert.equal(repDeltas.length, 1);
  assert.equal(repDeltas[0].factionId, 'faction_archive');
  assert.equal(repDeltas[0].delta, -6);
  assert.equal(evts(events, 'quill:redactorKilled').length, 1);
});

test('a collector that loses the pilot withdraws — the Archive does not forget', () => {
  const { state, player, sys, events } = fixture();
  holdFolio(state, {});
  state.story.quillLedger.exposure = 90;
  sys.update(0.5, state);
  const red = redactor(state);
  // Outlast its patience.
  state.story.quillLedger.redactorUntil = state.simTime - 1;
  sys.update(0.5, state);
  assert.equal(redactor(state), undefined);
  assert.equal(evts(events, 'quill:redactorWithdrew').length, 1);
  // And it cannot be re-sent inside the retry beat.
  state.story.quillLedger.exposure = 95;
  sys.update(0.5, state);
  assert.equal(redactor(state), undefined, 'the retry beat holds');
});

test('the notice decays with quiet time — lazily, so any sector can hide', () => {
  const ledger = { exposure: 90, exposureAt: 100 };
  assert.equal(quillExposureNow(ledger, 100), 90);
  const later = quillExposureNow(ledger, 100 + 100);
  assert.equal(later, Math.max(0, 90 - 100 * QUILL_NOTICE.decayPerS));
  assert.equal(quillExposureNow(ledger, 100 + 1e6), 0, 'enough quiet cools anything');
  assert.equal(quillExposureNow(null, 100), 0);
});

// ── price law: hot paper, answered errands, impressions ──────────────────────
test('the price law: grade, impression fade, hot premium, answered bonus, burned market', () => {
  const folio = { id: 'p', kind: 'manifest', grade: 3, impression: 1 };
  const base = quillFolioPrice(folio, { exposure: 0, exposureAt: 0, errandsDone: 0 }, 0);
  assert.equal(base, Math.round(90 * (0.7 + 0.3 * 3)));
  const hot = quillFolioPrice(folio, { exposure: 50, exposureAt: 0, errandsDone: 0 }, 0);
  assert.equal(hot, Math.round(base * QUILL_NOTICE.hotMult));
  const answered = quillFolioPrice(folio, { exposure: 0, exposureAt: 0, errandsDone: 3 }, 0);
  assert.equal(answered, Math.round(base * (1 + 3 * QUILL_NOTICE.answeredBonusPer)));
  const faded = quillFolioPrice({ ...folio, impression: 2 }, { exposure: 0, exposureAt: 0 }, 0);
  assert.equal(faded, Math.round(base * QUILL_PRESS.impressionMult));
  const burned = quillFolioPrice(folio,
    { exposure: 0, exposureAt: 0, burnedMarketUntil: 50 }, 10);
  assert.equal(burned, Math.round(base * QUILL_DESK.burnedPriceMult));
});

// ── persistence: JSON-safe, self-healing ─────────────────────────────────────
test('the ledger is JSON-safe and a stale section self-heals', () => {
  const { state, sys } = fixture();
  scannedWreck(state);
  sys.update(0.5, state);
  const clone = JSON.parse(JSON.stringify(state.story.quillLedger));
  const healed = sanitizeQuillLedger(clone);
  assert.equal(healed.folios.length, 1);
  assert.equal(healed.folios[0].status, 'held');
  assert.equal(sanitizeQuillLedger('garbage'), null);
  assert.equal(sanitizeQuillLedger(42), null);
  const partial = sanitizeQuillLedger({ folios: [{ id: 'keep' }], exposure: 999 });
  assert.equal(partial.folios[0].id, 'keep');
  assert.equal(partial.exposure, QUILL_NOTICE.cap, 'exposure clamps');
  assert.equal(partial.errand, null);
  // A schemad-but-partial section heals at read time instead of minting NaN.
  state.story.quillLedger = { schema: 1, folios: [{ id: 'f1', kind: 'route', status: 'held' }] };
  sys.update(0.5, state);
  assert.ok(Number.isFinite(state.story.quillLedger.saleSeq));
  assert.ok(Number.isFinite(state.story.quillLedger.exposure));
  assert.equal(state.story.quillLedger.folios[0].id, 'f1');
});

// ── determinism: two runs, same ink ──────────────────────────────────────────
test('same seed, same ink: kind, price, burn and buyer are all stable-keyed', () => {
  const data = { markerId: 'm_determinism', scanRevealed: { discovery: 'x' } };
  assert.equal(quillFolioKind(data), quillFolioKind(data));
  const folio = { id: 'quill_folio_9', kind: 'names', grade: 2, impression: 1 };
  assert.equal(quillNamesBurns(folio, 7), quillNamesBurns(folio, 7));
  assert.equal(quillForgeryDetected(folio, 7), quillForgeryDetected(folio, 7));
  assert.equal(quillBuyerFor(folio, 4), quillBuyerFor(folio, 4));
  assert.equal(quillBurnFaction({ markerId: 'm_x' }), quillBurnFaction({ markerId: 'm_x' }));
  const a = fixture(); const b = fixture();
  scannedWreck(a.state); scannedWreck(b.state);
  a.sys.update(0.5, a.state); b.sys.update(0.5, b.state);
  assert.equal(ledgerOf(a.state).folios[0].kind, ledgerOf(b.state).folios[0].kind);
});

// ── contracts preserved ──────────────────────────────────────────────────────
test('existing exports and the drone spec are unchanged', () => {
  const s = quillSpec();
  assert.equal(s.data.quill, true);
  assert.equal(s.type, 'drone');
  const sys = createQuill();
  assert.equal(sys.name, 'quill');
  assert.equal(typeof quillErrandFor, 'function');
  assert.equal(quillErrandFor(QUILL.secrets.length), null, 'no errand past the last page');
  const spec = quillRedactorSpec({ x: 1, z: 2 }, 3);
  assert.equal(spec.data.quillRedactor, true);
  assert.equal(spec.data.quillRedactorSeq, 3);
  assert.equal(spec.data.scannerSignalKind, 'archive');
});
