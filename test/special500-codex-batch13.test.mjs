// special-500 Phase 2, batch 13 — the codex family. Fourteen codex/lore legs, each a pure
// read in data/discoveryPresentation.js over durable state the live owners already keep
// (the director's special500.* receipts, the chronicler's kill facts, the scanner's
// per-signal record, the economy trade ledger, the calendar's station watches, the authored
// Tessera registry line), a codexPages.js overlay row in the section the entry names, and a
// World-tab section in the codex screen. Every read fails closed: no gate, no rows, no
// invented paperwork.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANDLE_COUNT_UNDERSTOOD_FLAG,
  cockpitManifestRows,
  cockpitScanCount,
  COCKPIT_MANIFEST_FLAG,
  COCKPIT_MANIFEST_LINES,
  constellationRows,
  customsCoinRows,
  DIONE_COIN_RETIRED_FLAG,
  DISCONTINUED_CARGO_ID,
  dustScriptRows,
  COUNTED_COUNTED_FLAG,
  jukeboxRows,
  kitchenRows,
  photographRows,
  plinthRows,
  quietCountRows,
  rimTitheRows,
  slingChimeRows,
  TALLY_MARKS_FLAG,
  tallyRows,
  TESSERA_HULL_DIGIT,
  TESSERA_REGISTRY,
  tideLedgerRows,
  TIDE_WOUND_FLAG,
  TITHE_NOTICES_FLAG,
  B8_RESOLVED_FLAG,
  B8_HELIX_AUDIT_FLAG,
  witnessedDeathsInSector,
  voidCrateRows,
} from '../src/data/discoveryPresentation.js';
import { stationShiftAt } from '../src/data/worldCalendar.js';
import { CODEX_PAGES, codexPageById } from '../src/data/codexPages.js';
import { codexPageView } from '../src/ui/sim/codexPages.js';
import { codexScreen } from '../src/ui/screens/codex.js';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';

const DAY = 600; // CAL_DAY_S — the one day the world agrees on

function baseState(over = {}) {
  return {
    meta: { seed: 5013 },
    simTime: 0,
    tick: 0,
    player: { credits: 0, heat: 0, stats: {}, cargo: { items: {} }, ownedShips: [], activeShipIndex: 0 },
    factions: {},
    story: {
      beatIndex: 1,
      flags: {},
      depthProgramEncounters: { schemaVersion: 1, completed: {}, history: [] },
    },
    world: { currentSectorId: 'sector_helios_prime', discovery: {} },
    ...over,
  };
}

function withKill(state, sectorId = 'sector_helios_prime') {
  state.chronicler = {
    stories: [{
      id: 'story:loss', revision: 2, createdAt: 100, updatedAt: 130, edges: [], groups: ['g:loss'],
      nodes: [{
        id: 'f1', stage: 'kill', t: 120, seq: 1, group: 'g:loss', dedupe: 'd:loss:1',
        actor: { key: 'npc:3', id: 3, player: false, name: 'Rockfall' },
        subject: { key: 'npc:9', id: 9, player: false, name: 'A Working Tug' },
        details: { cause: 'gunfire', victimClass: 'ship' },
        sectorId, sectorName: sectorId.replace(/^sector_/, '').replace(/_/g, ' '),
        visibility: 'public', parent: null, parentStatus: 'none',
      }],
    }],
  };
  return state;
}

const ALL_READS = [
  plinthRows, cockpitManifestRows, kitchenRows, photographRows, voidCrateRows,
  quietCountRows, slingChimeRows, dustScriptRows, rimTitheRows, tideLedgerRows,
  jukeboxRows, constellationRows, tallyRows, customsCoinRows,
];

test('no batch-13 read invents rows on an empty, missing or hostile state', () => {
  for (const read of ALL_READS) {
    assert.equal(read(null).length, 0, `${read.name}(null) fails closed`);
    assert.equal(read({}).length, 0, `${read.name}({}) fails closed`);
    assert.equal(read(baseState()).length, 0, `${read.name} on a fresh save fails closed`);
  }
});

test('stale flag shapes degrade to honest empty rows instead of crashing the page', () => {
  const garbage = baseState();
  for (const id of ['SP2-009', 'SP2-166', 'SP2-164', 'SP2-192', 'SP2-138', 'SP2-039',
    'SP3-025', 'SP1-156', 'SP2-153', 'SP2-155', 'SP3-145', 'SP3-091', 'SP3-199', 'SP2-135']) {
    garbage.story.flags[`special500.${id}`] = { nonsense: true };
  }
  garbage.story.flags[COCKPIT_MANIFEST_FLAG] = 'many';
  garbage.story.flags[TALLY_MARKS_FLAG] = 'most of them';
  garbage.signalInvestigation = { records: { 'signal:poi:poi_charon_preserved_cockpit': 'scanned a lot' } };
  garbage.chronicler = { stories: 'the whole war' };
  garbage.player.tradeLedger = 'two pages, both lost';
  for (const read of ALL_READS) {
    assert.equal(read(garbage).length, 0, `${read.name} on garbage state fails closed`);
  }
});

test('refiring the same moment twice files the same rows — no duplicate paperwork', () => {
  const state = withKill(baseState());
  state.story.flags['special500.SP2-009'] = 12 * DAY;
  const first = plinthRows(state);
  state.story.flags['special500.SP2-009'] = 13 * DAY;
  assert.equal(plinthRows(state), first, 'a later receipt changes nothing');
});

test('SP2-009: the dark plinth answers only after a death has been witnessed in-sector', () => {
  const state = baseState();
  assert.equal(plinthRows(state).length, 0, 'no receipt, no answer');
  state.story.flags['special500.SP2-009'] = 9 * DAY;
  assert.equal(plinthRows(state).length, 0,
    'the director receipt alone does not light the plinth — nobody has died here yet');
  withKill(state, 'sector_io_reach');
  assert.equal(plinthRows(state).length, 0, 'a death in another sector is not a death witnessed here');
  withKill(state, 'sector_helios_prime');
  const rows = plinthRows(state);
  assert.equal(rows, plinthRows(state), 'the table is the frozen authored one');
  const clerk = rows.find((r) => r.label === 'THE CLERK\'S LINE');
  assert.ok(clerk.value.includes('TWENTY-FIVE IS WHOEVER IS OUT THERE RIGHT NOW'),
    'the stored line is the clerk\'s, verbatim');
  assert.ok(clerk.value.includes('WELCOME TO THE COUNT'));
  assert.equal(rows.find((r) => r.label === 'PLINTH').value, 'THE TWENTY-FIFTH — KEPT DARK ON PURPOSE');
});

test('SP2-009: the scan leg\'s plain receipt stands in for the director, and the count is world-read', () => {
  const state = withKill(baseState());
  state.story.flags[CANDLE_COUNT_UNDERSTOOD_FLAG] = true;
  assert.equal(plinthRows(state).length, 4, 'the scan leg owns its gate; the read honors either writer');
  const bare = baseState();
  bare.story.flags[CANDLE_COUNT_UNDERSTOOD_FLAG] = true;
  assert.equal(plinthRows(bare).length, 0,
    'even the scan receipt waits for a witnessed death — the plinth does not take hearsay');
  assert.equal(witnessedDeathsInSector(null, 'sector_helios_prime'), 0,
    'a missing chronicler archives no deaths');
});

test('SP2-166: the manifest grows one line per scan, and the final scan files the redacted line', () => {
  const state = baseState();
  assert.equal(cockpitScanCount(state), 0, 'nothing scanned yet');
  assert.equal(cockpitManifestRows(state).length, 0, 'no scan, no manifest');
  state.signalInvestigation = { records: { 'signal:poi:poi_charon_preserved_cockpit': { scanCount: 1 } } };
  let rows = cockpitManifestRows(state);
  assert.equal(rows.length, 3, 'cockpit header, one item line, the growth note');
  assert.equal(rows[1].value, COCKPIT_MANIFEST_LINES[0], 'the first scan files the gloves');
  assert.equal(rows[2].value, 'ONE MORE LINE EVERY SESSION — ITEMS BEING ADDED, NOT RECOVERED');
  state.signalInvestigation.records['signal:poi:poi_charon_preserved_cockpit'].scanCount = 3;
  rows = cockpitManifestRows(state);
  assert.equal(rows.length, 5, 'three scans, three item lines');
  assert.equal(rows[3].value, COCKPIT_MANIFEST_LINES[2], 'the third scan files the paperback');
  state.signalInvestigation.records['signal:poi:poi_charon_preserved_cockpit'].scanCount = 5;
  rows = cockpitManifestRows(state);
  const last = rows[rows.length - 1];
  assert.equal(last.label, 'LAST LINE');
  assert.ok(last.value.includes('ONE (1) PILOT, PRESERVED, DO NOT WAKE UNTIL THE BELT IS SAFE'),
    'the final scan files the pilot, preserved');
  assert.equal(last.sealed, true, 'the status stays redacted');
});

test('SP2-166: a pruned scanner record degrades to the discovery receipt, never to an invented line', () => {
  const state = baseState();
  state.story.flags['special500.SP2-166'] = 4 * DAY;
  const rows = cockpitManifestRows(state);
  assert.equal(rows.length, 2, 'header and the honest growth note, no item lines');
  assert.equal(rows[1].value, 'ONE MORE LINE EVERY SESSION — ITEMS BEING ADDED, NOT RECOVERED');
  const counted = baseState();
  counted.story.flags[COCKPIT_MANIFEST_FLAG] = 2;
  assert.equal(cockpitManifestRows(counted).length, 4,
    'the counter leg\'s plain numeric flag is the alternate writer seam');
});

test('SP2-164: the galley PA names the food the hold actually carries', () => {
  const state = baseState();
  assert.equal(kitchenRows(state).length, 0, 'the vent has not breathed yet');
  state.story.flags['special500.SP2-164'] = 6 * DAY;
  let rows = kitchenRows(state);
  assert.ok(rows.find((r) => r.label === 'THE PA').value.includes('WHOEVER IS HOLDING FOOD'),
    'an empty hold gets the standing offer, not an invented cargo');
  state.player.cargo.items['cmdty_food'] = 2;
  rows = kitchenRows(state);
  assert.ok(rows.find((r) => r.label === 'THE PA').value.includes('ORDER FOR PROVISIONS'),
    'the PA reads the hold\'s real cargo name');
  assert.ok(rows.find((r) => r.label === 'THE PA').value.includes('TABLE FOR CREW COUNT: ZERO'));
  assert.equal(rows.find((r) => r.label === 'THE TAB').value, 'ONE MEAL AT EVERY CHARON DOCK — MARKED PAID — KITCHEN');
});

test('SP2-192: the file was a photograph, but only after the audit and the spot', () => {
  const state = baseState();
  state.story.flags['special500.SP2-192'] = 8 * DAY;
  assert.equal(photographRows(state).length, 0,
    'the communicator receipt alone is not the audit chain');
  state.story.flags[B8_HELIX_AUDIT_FLAG] = true;
  const rows = photographRows(state);
  assert.equal(rows.find((r) => r.label === 'VERDICT').value,
    'THE FILE WAS NEVER WRONG. THE FILE WAS A PHOTOGRAPH.');
  const resolvedOnly = baseState();
  resolvedOnly.story.flags[B8_RESOLVED_FLAG] = true;
  assert.equal(photographRows(resolvedOnly).length, 5,
    'the coordinate-reveal leg\'s b8_resolved receipt opens the page on its own');
  const auditOnly = baseState();
  auditOnly.story.flags[B8_HELIX_AUDIT_FLAG] = true;
  assert.equal(photographRows(auditOnly).length, 0,
    'reading the audit is not standing in the spot');
});

test('SP2-138: the void stasis crate keeps the answer withheld, and the sale is a ledger read', () => {
  const state = baseState();
  assert.equal(voidCrateRows(state).length, 0, 'the rock has not been scanned yet');
  state.story.flags['special500.SP2-138'] = 14 * DAY;
  let rows = voidCrateRows(state);
  assert.equal(rows.find((r) => r.label === 'SCANNER').value, 'MASS 0.0');
  assert.equal(rows.find((r) => r.label === 'MASSLINE').value, 'PULLS HEAVY');
  const glyph = rows.find((r) => r.label === 'THE GLYPH');
  assert.equal(glyph.value, 'WHAT WAS STORED HERE? (ANSWER WITHHELD)');
  assert.equal(glyph.sealed, true, 'the answer stays withheld');
  assert.ok(rows.find((r) => r.label === 'THE SALE').value.includes('HOLD IT'),
    'no ledger row, no sale claim');
  state.player.tradeLedger = [{
    receiptId: 'trade:x:1', commodityId: DISCONTINUED_CARGO_ID, side: 'sell',
    stationId: 'station_archive_berth', qty: 1, seenAt: 20 * DAY,
  }];
  rows = voidCrateRows(state);
  assert.equal(rows.find((r) => r.label === 'THE SALE').value,
    'SOLD — DAY 20, STATION_ARCHIVE_BERTH — THIS PAGE REWROTE ITSELF',
    'the sale date is read off the economy ledger, not asserted');
  state.player.tradeLedger.push({
    commodityId: 'cmdty_food', side: 'sell', stationId: 'elsewhere', seenAt: 21 * DAY,
  });
  assert.ok(voidCrateRows(state).find((r) => r.label === 'THE SALE').value.includes('DAY 20'),
    'other cargo\'s sales do not rewrite this page');
});

test('SP2-039: the board amends itself under either writer, and the difference is always you', () => {
  const state = baseState();
  assert.equal(quietCountRows(state).length, 0);
  state.story.flags['special500.SP2-039'] = 5 * DAY;
  let rows = quietCountRows(state);
  assert.equal(rows.find((r) => r.label === 'REGISTERED').value, 'FORTY-ONE');
  assert.equal(rows.find((r) => r.label === 'OBSERVED').value, 'FORTY-TWO');
  assert.equal(rows.find((r) => r.label === 'THE DIFFERENCE').value, 'ALWAYS YOU');
  const counted = baseState();
  counted.story.flags[COUNTED_COUNTED_FLAG] = true;
  assert.equal(quietCountRows(counted).length, rows.length,
    'the counter leg\'s counted_counted receipt earns the same page');
});

test('SP3-025: the sling band\'s page carries the lawlike note once the sector has sung', () => {
  const state = baseState();
  assert.equal(slingChimeRows(state).length, 0, 'the band has not been crossed yet');
  state.story.flags['special500.SP3-025'] = 11 * DAY;
  const rows = slingChimeRows(state);
  assert.ok(rows.find((r) => r.label === 'THE BAND').value.includes('ABOVE 140 WU/S'));
  assert.ok(rows.find((r) => r.label === 'THE HARMONIC').value.includes('MASS MADE AUDIBLE'));
  assert.ok(rows.find((r) => r.label === 'THE LAW').value.includes('EVEN THE PIRATES CROSS IT POLITELY'));
});

test('SP1-156: the dust script names the daily writer without inventing one', () => {
  const state = baseState();
  assert.equal(dustScriptRows(state).length, 0, 'the calm patch has not been read yet');
  state.story.flags['special500.SP1-156'] = 3 * DAY;
  const rows = dustScriptRows(state);
  assert.ok(rows.find((r) => r.label === 'THE DAILY LINE').value.includes('A PILOT EVERYONE THOUGHT DIED'));
  assert.equal(rows.find((r) => r.label === 'YOUR LINE').value,
    'LASTS EXACTLY AS LONG AS ANYONE\'S — THE DUST DOES NOT KEEP FAVORITES',
    'the page does not promise a persistent wake store the game does not keep');
});

test('SP2-153: the rim notices under either writer, and the signature stays sealed', () => {
  const state = baseState();
  assert.equal(rimTitheRows(state).length, 0);
  state.story.flags['special500.SP2-153'] = 7 * DAY;
  let rows = rimTitheRows(state);
  assert.ok(rows.find((r) => r.label === 'THE TALLY PLATE').value.includes('3 FOR 3'));
  const signed = rows.find((r) => r.label === 'SIGNATURE');
  assert.equal(signed.value, 'A SINGLE GLYPH — THE WATCHER\'S OWN');
  assert.equal(signed.sealed, true, 'the rim signs; the page keeps the seal');
  const noticed = baseState();
  noticed.story.flags[TITHE_NOTICES_FLAG] = true;
  assert.equal(rimTitheRows(noticed).length, rows.length,
    'the counter leg\'s tithe_notices receipt earns the same page');
});

test('SP2-155: the odometer reads cycle 4,110 and the whimsy digit is the hull\'s own', () => {
  const state = baseState();
  assert.equal(tideLedgerRows(state).length, 0, 'no full cycle has been sat through yet');
  state.story.flags['special500.SP2-155'] = 2 * DAY;
  let rows = tideLedgerRows(state);
  assert.equal(rows.find((r) => r.label === 'ODOMETER').value, 'CYCLE 4,110');
  assert.equal(rows.find((r) => r.label === 'THE WINDER').sealed, true,
    'nobody has ever been seen winding it; the page keeps that sealed');
  const wound = baseState();
  wound.story.flags[TIDE_WOUND_FLAG] = true;
  rows = tideLedgerRows(wound);
  assert.equal(TESSERA_REGISTRY, 'VHL-4471-T', 'the registry is the authored one from the wires');
  assert.equal(TESSERA_HULL_DIGIT, '1', 'the last digit of VHL-4471-T is 1');
  assert.ok(rows.find((r) => r.label === 'THE NEXT READING').value.includes('ENDS IN A 1'),
    'the odometer\'s whimsy reads the authored registration, not a random digit');
});

test('SP3-145: the jukebox files one unexplained track, and the barkeep\'s line does not change', () => {
  const state = baseState();
  assert.equal(jukeboxRows(state).length, 0, 'the Pale Holiday has not cut the mix yet');
  state.story.flags['special500.SP3-145'] = 33 * DAY + 260;
  const rows = jukeboxRows(state);
  assert.ok(rows.find((r) => r.label === 'THE TRACK').value.includes('NO RECIPE IN THE CATALOG MATCHES'));
  assert.equal(rows.find((r) => r.label === 'THE BARKEEP').value, '"NOBODY LOADED THAT."');
  assert.ok(rows.find((r) => r.label === 'THE HOLIDAY').value.includes('DAY 33'),
    'the artifact is filed on the festival\'s schedule, not on wall time');
});

test('SP3-091: the constellation keeps third watch at the frame\'s own clock', () => {
  const state = baseState();
  assert.equal(constellationRows(state).length, 0, 'the frame has not been visited yet');
  state.story.flags['special500.SP3-091'] = 10 * DAY;
  // find one simTime inside third watch at the frame and one outside it — the calendar owns both
  let onShift = null;
  let offShift = null;
  for (let t = 0; t < 2 * 600; t += 1) {
    const shift = stationShiftAt('poi_colony', t).id;
    if (shift === 'third' && onShift == null) onShift = t;
    if (shift !== 'third' && offShift == null) offShift = t;
    if (onShift != null && offShift != null) break;
  }
  assert.ok(onShift != null && offShift != null, 'the frame\'s clock has both a third watch and the rest of the day');
  state.simTime = offShift;
  assert.ok(constellationRows(state).find((r) => r.label === 'TONIGHT').value
    .includes('NOT THIRD WATCH'), 'off watch, the pattern keeps the weld schedule');
  state.simTime = onShift;
  assert.ok(constellationRows(state).find((r) => r.label === 'TONIGHT').value
    .includes('THE PATTERN IS SHOWING'), 'on third watch, the pattern is showing');
  assert.equal(constellationRows(state).find((r) => r.label === 'THE PLATE').value, '"THE SKY WE CAME FROM."');
});

test('SP3-199: the Tally files the first mark, and ten heard notes complete the scale', () => {
  const state = baseState();
  assert.equal(tallyRows(state).length, 0, 'no painted rock has rung yet');
  state.story.flags['special500.SP3-199'] = 13 * DAY;
  let rows = tallyRows(state);
  assert.equal(rows.find((r) => r.label === 'THE SCALE').value, 'TEN NOTES LONG — 1 HEARD SO FAR',
    'the strike receipt is one honest mark, not ten');
  assert.equal(rows.find((r) => r.label === 'THE SCALE').sealed, false);
  const counted = baseState();
  counted.story.flags[TALLY_MARKS_FLAG] = 4;
  assert.equal(tallyRows(counted).find((r) => r.label === 'THE SCALE').value,
    'TEN NOTES LONG — 4 HEARD SO FAR', 'the spawn leg\'s counter flag is the writer seam');
  const complete = baseState();
  complete.story.flags[TALLY_MARKS_FLAG] = 10;
  rows = tallyRows(complete);
  assert.equal(rows.find((r) => r.label === 'THE SCALE').value,
    'TEN NOTES, ALL HEARD — THE BELT WAS LEFT TUNED, AND NOW IT IS PLAYED');
  assert.equal(rows.find((r) => r.label === 'THE SCALE').sealed, true,
    'the completed scale seals itself');
  const overcounted = baseState();
  overcounted.story.flags[TALLY_MARKS_FLAG] = 999;
  assert.equal(tallyRows(overcounted).find((r) => r.label === 'THE SCALE').sealed, true,
    'a corrupt counter clamps to the scale it was left tuned to');
});

test('SP2-135: the coin works once, and the wall keeps it after', () => {
  const state = baseState();
  assert.equal(customsCoinRows(state).length, 0, 'the stamp has not come down yet');
  state.story.flags['special500.SP2-135'] = 16 * DAY;
  let rows = customsCoinRows(state);
  assert.equal(rows.find((r) => r.label === 'THE COIN').value, 'ONE (1) HULL SETTLED TWO (2) LIENS');
  assert.equal(rows.find((r) => r.label === 'THE STAMP').value,
    'THIS COIN IS LEGAL NOWHERE AND VALID EVERYWHERE');
  const spent = rows.find((r) => r.label === 'SPENT');
  assert.ok(spent.value.includes('STILL IN HAND'), 'no retirement writer, no retirement claim');
  assert.equal(spent.sealed, false);
  const retired = baseState();
  retired.story.flags[DIONE_COIN_RETIRED_FLAG] = true;
  rows = customsCoinRows(retired);
  const nailed = rows.find((r) => r.label === 'SPENT');
  assert.ok(nailed.value.includes('NAILED TO THE CUSTOMS HALL WALL'),
    'the vendor leg\'s retirement receipt files the wall dressing');
  assert.equal(nailed.sealed, true, 'spent coins stay on the wall');
});

// ── codexPages.js overlays ──────────────────────────────────────────────────────────────────

test('the batch-13 sector overlays carry their lines in the sectors section', () => {
  const expectations = [
    ['sector_helios_prime', 'twenty-fifth plinth'],
    ['sector_charon_expanse', 'DO NOT WAKE UNTIL THE BELT IS SAFE'],
    ['sector_charon_expanse', 'PAID — KITCHEN'],
    ['sector_charon_expanse', 'sky we came from'],
    ['sector_veil_nebula', 'the file was a photograph'],
    ['sector_veil_nebula', 'pilot everyone thought died'],
    ['sector_nereid_shoal', 'void stasis crate'],
    ['sector_tethys_junction', 'Mass made audible'],
    ['sector_triton_wake', '3 FOR 3'],
    ['sector_orcus_shadow', 'CYCLE 4,110'],
    ['sector_dione_lane', 'legal nowhere and valid everywhere'],
    ['sector_ceres_belt', 'ten-note scale'],
  ];
  for (const [id, line] of expectations) {
    const page = codexPageById(id);
    assert.ok(page && page.section === 'sectors', `${id} is a sectors page`);
    assert.ok(page.body.includes(line), `${id} carries the batch-13 line: ${line}`);
  }
});

test('the Quiet count and the barkeep line file on their own pages', () => {
  const quiet = codexPageById('faction_quiet');
  assert.ok(quiet && quiet.section === 'factions');
  assert.ok(quiet.body.includes('forty-two observed'), 'the Quiet page carries the count');
  const quinn = codexPageById('quinn');
  assert.ok(quinn && quinn.section === 'figures');
  assert.ok(quinn.body.includes('Nobody loaded that'), 'the barkeep keeps his review');
});

test('SP2-138: the discontinued cargo is one codex-only page, unsealed only by holding it', () => {
  const pages = CODEX_PAGES.filter((p) => p.id === DISCONTINUED_CARGO_ID);
  assert.equal(pages.length, 1, 'one Discontinued Cargo page, no duplicate from the append');
  const page = pages[0];
  assert.equal(page.section, 'commodities');
  assert.equal(page.tag, 'discontinued');
  assert.ok(page.body.includes('ANSWER WITHHELD'), 'the page carries the interrogative');
  const locked = codexPageView(baseState(), page);
  assert.equal(locked.unlocked, false, 'no market lists it; an unheld hold unseals nothing');
  assert.equal(locked.body, '', 'a locked page leaks nothing');
  const holding = baseState();
  holding.player.cargo.items[DISCONTINUED_CARGO_ID] = 1;
  const unlocked = codexPageView(holding, page);
  assert.equal(unlocked.unlocked, true, 'holding the one unit is the ordinary route to the page');
  assert.ok(unlocked.body.includes('Archive berth'), 'the open page keeps the sale lore');
});

// ── the codex screen's World tab ─────────────────────────────────────────────────────────────

function renderedWorldState13() {
  const state = baseState();
  // every director receipt lands, then the per-unit world facts the reads honestly need
  for (const id of ['SP2-009', 'SP2-166', 'SP2-164', 'SP2-192', 'SP2-138', 'SP2-039',
    'SP3-025', 'SP1-156', 'SP2-153', 'SP2-155', 'SP3-145', 'SP3-091', 'SP3-199', 'SP2-135']) {
    state.story.flags[`special500.${id}`] = 12 * DAY;
  }
  withKill(state, 'sector_helios_prime');
  state.signalInvestigation = { records: { 'signal:poi:poi_charon_preserved_cockpit': { scanCount: 5 } } };
  state.player.cargo.items['cmdty_food'] = 1;
  state.story.flags[B8_HELIX_AUDIT_FLAG] = true;
  state.player.tradeLedger = [{
    commodityId: DISCONTINUED_CARGO_ID, side: 'sell', stationId: 'station_archive_berth', seenAt: 12 * DAY,
  }];
  state.story.flags[TALLY_MARKS_FLAG] = 10;
  state.story.flags[DIONE_COIN_RETIRED_FLAG] = true;
  // the frame is on third watch at this simTime — computed, not assumed
  for (let t = 0; t < 2 * 600; t += 1) {
    if (stationShiftAt('poi_colony', t).id === 'third') { state.simTime = t; break; }
  }
  return state;
}

test('the World tab carries the batch-13 receipt sections in order, with honest empty states', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: renderedWorldState13() });
    const labels = codexScreen._sections.map((s) => s.label);
    assert.deepEqual(labels.slice(-14), [
      'The Twenty-Fifth Plinth', 'Do Not Wake', 'The Kitchen Is Open', 'The Photograph',
      'Void Stasis Crate', 'The Quiet Count', 'Mass Made Audible', 'The Dust Script',
      'The Rim Notices', 'Cycle 4,110', 'Nobody Loaded That', 'The Sky We Came From',
      'The Tally', 'The Coin',
    ], 'the batch-13 sections close the World tab after the batch-12 receipts');
    assert.equal(codexScreen._sections.length, 35,
      'eight standing sections, the thirteen batch-12 sections, and the fourteen batch-13 sections');
    for (const entry of codexScreen._entries) {
      assert.ok(entry.article, `${entry.id} carries a real article`);
      const text = textLines(entry.article).join('\n');
      assert.ok(text.includes(entry.name), `${entry.id} prints its name in the article`);
    }
    const pilot = codexScreen._entries.find((e) => e.id.startsWith('world:cockpit:LAST LINE'));
    assert.ok(pilot, 'the preserved pilot files his line');
    assert.ok(pilot.name.includes('DO NOT WAKE'), 'the ladder name carries the redaction');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});

test('a fresh save renders every batch-13 section as its honest empty state', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: baseState() });
    assert.equal(codexScreen._sections.length, 35, 'the sections exist before their moments');
    const empties = codexScreen._sections.slice(-14).map((s) => s.empty);
    for (const line of empties) {
      assert.ok(typeof line === 'string' && line.length > 0, 'every empty state says something honest');
    }
    assert.equal(codexScreen._entries.length, 1,
      'only the pilot\u2019s opening logbook entry renders; no batch-13 rows are invented');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});

test('a hostile save renders the batch-13 sections without crashing or inventing rows', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    const hostile = renderedWorldState13();
    hostile.chronicler = { stories: 'the whole war' };
    hostile.signalInvestigation = { records: 'lost' };
    hostile.player.tradeLedger = 3;
    hostile.story.flags[COCKPIT_MANIFEST_FLAG] = { junk: true };
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: hostile });
    assert.equal(codexScreen._sections.length, 35, 'the page structure survives a hostile save');
    const cockpitEntries = codexScreen._entries.filter((e) => e.id.startsWith('world:cockpit:'));
    assert.equal(cockpitEntries.length, 2,
      'the cockpit degrades to header and growth note, never to an invented manifest line');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});
