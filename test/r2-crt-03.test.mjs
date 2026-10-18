// CRT-03 first slice: one station lot hull from a real loss or surrender.
// The bought hull keeps the scars and papers the listing showed, the bored
// thrusters change derived acceleration, and the history is on the news wire
// before the purchase. A quiet loss does not open a second offer.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { combat as combatPrototype, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { livingHullWithRenown, livingHullWithScar } from '../src/core/livingHull.js';
import { peekDeedRecord } from '../src/systems/deedRecord.js';
import { lawSecurity as lawPrototype } from '../src/systems/lawSecurity.js';
import { lossLedger as lossPrototype } from '../src/systems/lossLedger.js';
import { buildSlotList, getDerivedStats, ships as shipsPrototype } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { createShipStage } from '../src/ui/station/screens/shipworks.js';
import { fakeDom } from './helpers/fake-dom.mjs';

const WASP = SHIPS.find((ship) => ship.id === 'ship_wasp');
const HITCH = SHIPS.find((ship) => ship.id === 'ship_kestrel');
const RAW_ID = /\b(?:ship|sector|station|faction|loss)_[a-z0-9_]+\b/i;
const CAMEL = /\b[a-z]+[A-Z][A-Za-z0-9]*\b/;

function scarPrint(hull) {
  return (hull && hull.scars ? hull.scars : []).map((scar) => ({
    id: scar.id,
    cause: scar.cause,
    surface: scar.surface,
    band: scar.band,
    facing: scar.facing,
    patchedAtT: scar.patchedAtT,
  }));
}

function boot({ stationId = 'station_helios', credits = 0 } = {}) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 120;
  state.tick = 7200;
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.credits = credits;
  state.player.heat = 0;
  state.playerId = 1;
  state.player.ownedShips = [{
    defId: HITCH.id,
    fittings: new Array(buildSlotList(HITCH).length).fill(null),
    appearance: null,
  }];
  state.player.activeShipIndex = 0;
  state.ui.docked = true;
  state.ui.dockedStationId = stationId;
  state.entities.set(1, {
    id: 1,
    alive: true,
    type: 'ship',
    hull: 140,
    shield: 55,
    cap: 80,
    data: { defId: HITCH.id, fittings: [], sectorId: 'sector_helios_prime' },
  });

  const bus = createBus();
  const charges = [];
  const news = [];
  const fines = [];
  const voices = [];
  const papers = [];
  bus.on('economy:chargeCredits', (payload) => {
    charges.push(payload);
    state.player.credits -= payload.amount;
  });
  bus.on('news:publish', (payload) => news.push(payload));
  bus.on('law:fineAssessed', (payload) => fines.push(payload));
  bus.on('law:voice', (payload) => voices.push(payload));
  bus.on('law:hullPapers', (payload) => papers.push(payload));

  const ledger = Object.create(lossPrototype);
  ledger.init({ state, bus, helpers: {} });
  const ships = Object.assign({}, shipsPrototype, { _instSeq: 0 });
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ledger, ships, charges, news, fines, voices, papers };
}

function markedHull(extraRenown) {
  let hull = livingHullWithScar(null, {
    id: 'scar-bow',
    cause: 'weapon',
    surface: 'weapon',
    band: 'heavy',
    facing: 'bow',
    atT: 40,
    tick: 2400,
    patchedAtT: null,
  }, 40);
  hull = livingHullWithScar(hull, {
    id: 'scar-stern',
    cause: 'slam',
    surface: 'craft',
    band: 'hard',
    facing: 'stern',
    atT: 80,
    tick: 4800,
    patchedAtT: null,
  }, 80);
  if (extraRenown) {
    hull = livingHullWithRenown(hull, {
      id: 'renown-concord',
      act: 'kill',
      factionId: 'faction_scn',
      sectorId: 'sector_helios_prime',
      atT: 90,
      tick: 5400,
    }, 90);
  }
  return hull;
}

function spawnVictim(state, { id, defId, name, callsign, livingHull, factionId = 'faction_reach' }) {
  state.entities.set(id, {
    id,
    alive: true,
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    factionId,
    data: {
      defId,
      name,
      callsign,
      sectorId: 'sector_helios_prime',
      livingHull,
    },
  });
}

test('a killed hull is listed with its scars and papers, then bought as that same hull', () => {
  const h = boot();
  spawnVictim(h.state, {
    id: 7,
    defId: 'ship_wasp',
    name: 'Marrow',
    callsign: 'Marrow',
    livingHull: markedHull(true),
  });
  const beforeScars = scarPrint(h.state.entities.get(7).data.livingHull);
  let deadAtReceipt = false;
  h.bus.on('entity:killed', () => { deadAtReceipt = h.state.entities.get(7).alive === false; });
  combatPrototype.kill.call({ state: h.state, bus: h.bus }, h.state.entities.get(7), 1);
  assert.equal(deadAtReceipt, true, 'combat marks the victim dead before lossLedger receives the kill');

  const listing = h.state.lossLedger.impound;
  assert.ok(listing, 'a killed hull is on the station lot before anyone buys it');
  assert.equal(listing.defId, 'ship_wasp');
  assert.equal(listing.stationId, 'station_helios');
  assert.ok(listing.price < WASP.price, 'the lot price is below the catalog price');
  assert.equal(listing.price, 11200);
  assert.deepEqual(scarPrint(listing.livingHull), beforeScars);
  assert.equal(h.news.length, 1);
  assert.equal(h.news[0].text, listing.historyLine);
  const line = h.news[0].text;
  assert.match(line, /Wasp/);
  assert.match(line, /Helios Station/);
  assert.match(line, /Marrow/);
  assert.match(line, /bow/);
  assert.match(line, /11,200/);
  assert.match(line, /bored out/);
  assert.match(line, /Shot down a Concord hull at Helios Prime\./);
  assert.equal(RAW_ID.test(line), false, line);
  assert.equal(CAMEL.test(line), false, line);
  assert.equal(peekDeedRecord(h.state), null);

  const law = Object.create(lawPrototype);
  law.init({ state: h.state, bus: h.bus, helpers: {} });
  h.state.player.credits = 15000;
  const fleetBefore = h.state.player.ownedShips.length;
  h.bus.emit('ui:buyShip', { defId: 'ship_wasp', listingId: listing.listingId });

  assert.equal(h.state.player.ownedShips.length, fleetBefore + 1);
  const owned = h.state.player.ownedShips.at(-1);
  assert.deepEqual(scarPrint(owned.livingHull), beforeScars);
  assert.equal(owned.rapSheet.kind, 'kill_lawful');
  assert.equal(owned.rapSheet.id, listing.deed.id);
  assert.equal(owned.rapSheetLine, 'Shot down a Concord hull at Helios Prime.');
  assert.equal(h.charges.at(-1).amount, listing.price);
  assert.equal(h.charges.at(-1).reason, 'buyShip:ship_wasp');
  assert.equal(h.state.player.credits, 15000 - listing.price);
  assert.equal(h.state.lossLedger.impound, undefined);
  assert.equal(h.state.player.heat, 0);
  assert.equal(h.fines.length, 0);
  assert.ok(h.state.lawSecurity.hullPapers);
  assert.equal(h.state.lawSecurity.hullPapers.kind, 'kill_lawful');
  assert.equal(h.state.lawSecurity.hullPapers.line, owned.rapSheetLine);
  assert.equal(peekDeedRecord(h.state), null);

  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.fines.length, 0);
  assert.equal(h.state.player.heat, 0);

  h.state.tick += 1;
  h.bus.emit('customs:submit', { factionId: 'faction_scn', stationId: 'station_helios' });
  assert.ok(h.voices.some((voice) => voice.text === owned.rapSheetLine));

  assert.equal(h.ships.setActiveShip(1), true);
  const clean = getDerivedStats(owned.defId, owned.fittings, h.state.player);
  const flown = h.state.entities.get(1);
  assert.notEqual(flown.propulsion.mainAccel, clean.propulsion.mainAccel);
  assert.equal(flown.propulsion.mainAccel, clean.propulsion.mainAccel * owned.impoundQuirk.accelMult);
  assert.equal(flown.thrust, clean.thrust * owned.impoundQuirk.accelMult);
  assert.equal(owned.impoundQuirk.kind, 'overbored');
  assert.equal(owned.impoundQuirk.accelMult, 1.12);

  h.state.player.cargo.usedMass = 4;
  h.ships._cargoMassRefreshPending = true;
  h.ships.flushCargoMassRefresh();
  const loaded = getDerivedStats(owned.defId, owned.fittings, h.state.player);
  assert.equal(flown.propulsion.mainAccel, loaded.propulsion.mainAccel * owned.impoundQuirk.accelMult);

  h.state.player.credits = 20000;
  const purchases = [];
  h.bus.on('ship:purchased', (payload) => purchases.push(payload));
  h.bus.emit('ui:buyShip', { defId: 'ship_pelican' });
  const pelican = h.state.player.ownedShips.at(-1);
  assert.equal(pelican.defId, 'ship_pelican');
  assert.equal(pelican.impoundQuirk, undefined);
  assert.equal(pelican.rapSheet, undefined);
  assert.equal(scarPrint(pelican.livingHull).length, 0);
  assert.deepEqual(purchases, [{ defId: 'ship_pelican', price: 12000 }]);

  const afterWasp = h.state.player.ownedShips.length;
  h.bus.emit('ui:buyShip', { defId: 'ship_wasp', listingId: listing.listingId });
  assert.equal(h.state.player.ownedShips.length, afterWasp);

  const blob = JSON.parse(JSON.stringify(owned));
  const restored = createGameState(4242);
  restored.mode = 'flight';
  restored.player.heat = 0;
  restored.playerId = 1;
  restored.player.ownedShips = [
    { defId: HITCH.id, fittings: new Array(buildSlotList(HITCH).length).fill(null) },
    blob,
  ];
  restored.player.activeShipIndex = 0;
  restored.entities.set(1, {
    id: 1, alive: true, type: 'ship', hull: 10, shield: 10, cap: 10,
    data: { defId: HITCH.id, fittings: [] },
  });
  const restoredBus = createBus();
  const restoredShips = Object.assign({}, shipsPrototype, { _instSeq: 0 });
  restoredShips.init({ state: restored, bus: restoredBus, helpers: {} });
  assert.equal(restoredShips.setActiveShip(1), true);
  const restoredOwned = restored.player.ownedShips[1];
  const restoredClean = getDerivedStats(restoredOwned.defId, restoredOwned.fittings, restored.player);
  const restoredEntity = restored.entities.get(1);
  assert.deepEqual(scarPrint(restoredOwned.livingHull), beforeScars);
  assert.equal(
    restoredEntity.propulsion.mainAccel,
    restoredClean.propulsion.mainAccel * restoredOwned.impoundQuirk.accelMult,
  );
  const restoredLaw = Object.create(lawPrototype);
  restoredLaw.init({ state: restored, bus: restoredBus, helpers: {} });
  assert.equal(Object.hasOwn(restoredLaw.serialize(), 'hullPapers'), false);
  restoredBus.emit('save:loaded');
  assert.equal(restored.lawSecurity.hullPapers.line, owned.rapSheetLine);
  assert.equal(Object.hasOwn(restoredLaw.serialize(), 'hullPapers'), false);

  law.destroy();
  restoredLaw.destroy();
  h.ledger.destroy();
});

test('the unsold listing survives a save and a second loss does not replace it', () => {
  const h = boot();
  spawnVictim(h.state, {
    id: 7,
    defId: 'ship_wasp',
    name: 'Marrow',
    callsign: 'Marrow',
    livingHull: markedHull(true),
  });
  h.bus.emit('entity:killed', { id: 7, type: 'ship', killerId: 1, factionId: 'faction_reach' });
  const listing = h.state.lossLedger.impound;
  assert.ok(listing);
  const saved = JSON.parse(JSON.stringify(h.ledger.serialize()));
  assert.equal(saved.impound.historyLine, listing.historyLine);
  assert.deepEqual(scarPrint(saved.impound.livingHull), scarPrint(listing.livingHull));
  assert.equal(saved.impound.price, listing.price);

  const revived = createGameState(4242);
  const revivedLedger = Object.create(lossPrototype);
  revivedLedger.init({ state: revived, bus: createBus(), helpers: {} });
  revivedLedger.deserialize(saved);
  assert.equal(revived.lossLedger.impound.historyLine, listing.historyLine);
  assert.equal(revived.lossLedger.impound.deed.kind, 'kill_lawful');
  assert.deepEqual(scarPrint(revived.lossLedger.impound.livingHull), scarPrint(listing.livingHull));

  spawnVictim(h.state, {
    id: 8,
    defId: 'ship_wasp',
    name: 'Other',
    callsign: 'Other',
    livingHull: livingHullWithScar(null, {
      id: 'scar-other',
      cause: 'weapon',
      surface: 'weapon',
      band: 'crushing',
      facing: 'port bow',
      atT: 1,
      tick: 1,
    }, 1),
  });
  h.bus.emit('entity:killed', { id: 8, type: 'ship', killerId: 1, factionId: 'faction_reach' });
  assert.equal(h.state.lossLedger.impound.lossId, listing.lossId);
  assert.deepEqual(scarPrint(h.state.lossLedger.impound.livingHull), scarPrint(listing.livingHull));
  h.ledger.destroy();
  revivedLedger.destroy();
});

test('quiet losses, the wrong yard, and a thin wallet do not move the lot', () => {
  const h = boot({ credits: 20000 });
  h.bus.emit('automation:assetLost', {
    kind: 'trader',
    id: 'trader-1',
    sectorId: 'sector_helios_prime',
    value: 400,
  });
  assert.equal(h.state.lossLedger.impound, undefined);

  h.state.entities.get(1).data.defId = 'ship_wasp';
  h.bus.emit('player:death', { killerId: 9 });
  assert.equal(h.state.lossLedger.impound, undefined);
  h.state.entities.get(1).data.defId = HITCH.id;

  spawnVictim(h.state, {
    id: 7,
    defId: 'ship_wasp',
    name: 'Marrow',
    callsign: 'Marrow',
    livingHull: markedHull(true),
  });
  h.bus.emit('entity:killed', { id: 7, type: 'ship', killerId: 1, factionId: 'faction_reach' });
  const listing = h.state.lossLedger.impound;
  assert.ok(listing);
  const lossId = listing.lossId;

  h.bus.emit('ui:buyShip', { defId: 'ship_pelican' });
  const pelican = h.state.player.ownedShips.at(-1);
  assert.equal(pelican.defId, 'ship_pelican');
  assert.equal(scarPrint(pelican.livingHull).length, 0);
  assert.equal(pelican.impoundQuirk, undefined);
  assert.equal(h.state.lossLedger.impound.lossId, lossId);

  h.state.ui.dockedStationId = 'station_forge';
  const countAtForge = h.state.player.ownedShips.length;
  h.bus.emit('ui:buyShip', { defId: 'ship_wasp', listingId: listing.listingId });
  assert.equal(h.state.player.ownedShips.length, countAtForge);
  assert.equal(h.state.lossLedger.impound.lossId, lossId);

  h.state.ui.dockedStationId = 'station_helios';
  h.state.player.credits = 100;
  h.bus.emit('ui:buyShip', { defId: 'ship_wasp', listingId: listing.listingId });
  assert.equal(h.state.player.ownedShips.length, countAtForge);
  assert.equal(h.state.lossLedger.impound.lossId, lossId);
  assert.equal(h.state.player.credits, 100);

  const granted = h.ships.buyShip({ defId: 'ship_wasp', grant: true });
  assert.equal(granted, true);
  const gift = h.state.player.ownedShips.at(-1);
  assert.equal(gift.defId, 'ship_wasp');
  assert.equal(gift.rapSheet, undefined);
  assert.equal(gift.impoundQuirk, undefined);
  assert.equal(scarPrint(gift.livingHull).length, 0);
  assert.equal(h.state.lossLedger.impound.lossId, lossId);

  h.bus.emit('law:custodyTransfer', {
    entityId: 7,
    stationId: 'station_helios',
    factionId: 'faction_reach',
  });
  assert.equal(h.state.lossLedger.impound.lossId, lossId);
  h.ledger.destroy();
});

test('with no lot open, a locked catalog hull is not added', () => {
  const h = boot({ credits: 50000 });
  const before = h.state.player.ownedShips.length;
  h.bus.emit('ui:buyShip', { defId: 'ship_wasp' });
  assert.equal(h.state.player.ownedShips.length, before);
  assert.equal(h.state.lossLedger.impound, undefined);
  h.ledger.destroy();
});

test('a hull with no kill on its record is recovered, not credited with a shot', () => {
  const h = boot();
  spawnVictim(h.state, {
    id: 7,
    defId: 'ship_wasp',
    name: 'Marrow',
    callsign: 'Marrow',
    livingHull: null,
  });
  h.bus.emit('entity:killed', { id: 7, type: 'ship', killerId: 1, factionId: 'faction_reach' });
  const listing = h.state.lossLedger.impound;
  assert.ok(listing);
  assert.equal(scarPrint(listing.livingHull).length, 1);
  assert.equal(listing.livingHull.scars[0].cause, 'weapon');
  const line = listing.historyLine;
  assert.equal(line.includes('Shot down'), false);
  assert.match(line, /recovered near Helios Prime/);
  assert.match(line, new RegExp(listing.livingHull.scars[0].facing));
  assert.equal(RAW_ID.test(line), false);
  h.ledger.destroy();
});

test('a surrendered hull keeps the scar it arrived with and opens one lot', () => {
  const h = boot();
  const hull = livingHullWithScar(null, {
    id: 'scar-slam',
    cause: 'slam',
    surface: 'structure',
    band: 'hard',
    facing: 'port beam',
    atT: 10,
    tick: 600,
    patchedAtT: null,
  }, 10);
  spawnVictim(h.state, {
    id: 11,
    defId: 'ship_wasp',
    name: 'Marrow',
    callsign: 'Marrow',
    livingHull: hull,
  });
  h.bus.emit('law:custodyTransfer', {
    entityId: 11,
    stationId: 'station_helios',
    factionId: 'faction_reach',
    recoveryKind: 'drive_disabled',
  });
  const listing = h.state.lossLedger.impound;
  assert.ok(listing);
  assert.equal(listing.source, 'surrender');
  assert.deepEqual(scarPrint(listing.livingHull), scarPrint(hull));
  assert.equal(listing.livingHull.scars.some((scar) => scar.cause === 'weapon'), false);
  assert.match(listing.historyLine, /port beam/);
  assert.match(listing.historyLine, /recovered near Helios Prime/);
  assert.equal(listing.historyLine.includes('Shot down'), false);
  assert.equal(h.news.length, 1);
  assert.equal(h.news[0].text, listing.historyLine);
  assert.equal(RAW_ID.test(listing.historyLine), false);

  const quiet = createGameState(4242);
  quiet.mode = 'flight';
  quiet.playerId = 1;
  quiet.player.ownedShips = [{ defId: HITCH.id, fittings: [] }];
  quiet.player.activeShipIndex = 0;
  quiet.entities.set(1, { id: 1, alive: true, type: 'ship', data: { defId: HITCH.id } });
  const quietBus = createBus();
  const quietLaw = Object.create(lawPrototype);
  quietLaw.init({ state: quiet, bus: quietBus, helpers: {} });
  quietBus.emit('save:loaded');
  assert.equal(quiet.lawSecurity.hullPapers, undefined);
  quietLaw.destroy();
  h.ledger.destroy();
});

test('custody transfer cannot list a dead hull', () => {
  const h = boot();
  spawnVictim(h.state, {
    id: 11, defId: 'ship_wasp', name: 'Marrow', callsign: 'Marrow', livingHull: markedHull(true),
  });
  h.state.entities.get(11).alive = false;
  h.bus.emit('law:custodyTransfer', {
    entityId: 11, stationId: 'station_helios', factionId: 'faction_reach',
  });
  assert.equal(h.state.lossLedger.impound, undefined);
  assert.equal(h.news.length, 0);
  h.ledger.destroy();
});


test('Shipworks quotes the actual used hull and its purchase button buys that listing', { timeout: 60000 }, async () => {
  const require = createRequire(import.meta.url);
  const { createGameServer } = require('../scripts/lib/gameServer.cjs');
  const { loadPlaywright } = await import('../scripts/lib/load-playwright.mjs');
  const { chromium } = await loadPlaywright();
  const server = createGameServer({ root: fileURLToPath(new URL('../', import.meta.url)), playerStoreDir: '' });
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/tools/ui-bench.html?screen=station-shipworks&chrome=0`);
    await page.waitForFunction(() => window.__BENCH_READY === true);
    const hull = markedHull(true);
    const listing = await page.evaluate(async (livingHull) => {
      const [{ createBus }, { createGameState }, { lossLedger }, { ships, buildSlotList }, { combat }, ui] = await Promise.all([
        import('/src/core/eventBus.js'), import('/src/core/gameState.js'), import('/src/systems/lossLedger.js'),
        import('/src/systems/ships.js'), import('/src/systems/combat.js'), import('/src/ui/station/screens/shipworks.js'),
      ]);
      const previousStage = ui.getSharedShipStage({});
      previousStage.onHide();
      const state = createGameState(4242);
      state.mode = 'flight'; state.simTime = 120; state.tick = 7200;
      state.world.currentSectorId = 'sector_helios_prime';
      state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
      state.playerId = 1; state.player.credits = 15000;
      state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: new Array(buildSlotList('ship_kestrel').length).fill(null) }];
      state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: { defId: 'ship_kestrel' } });
      state.entities.set(7, {
        id: 7, type: 'ship', alive: true, factionId: 'faction_reach', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
        data: { defId: 'ship_wasp', name: 'Marrow', callsign: 'Marrow', sectorId: 'sector_helios_prime', livingHull },
      });
      const bus = createBus();
      const ledger = Object.create(lossLedger); ledger.init({ state, bus, helpers: {} });
      const owner = Object.assign({}, ships, { _instSeq: 0 }); owner.init({ state, bus, helpers: {} });
      const intents = [], charges = [];
      bus.on('ui:buyShip', (p) => intents.push(p));
      bus.on('economy:chargeCredits', (p) => { charges.push(p); state.player.credits -= p.amount; });
      combat.kill.call({ state, bus }, state.entities.get(7), 1);
      const stage = ui.createShipStage({ state, bus });
      previousStage.el.replaceWith(stage.el);
      stage.onShow();
      stage.el.querySelector('[data-mode="buy"]').click();
      stage.el.querySelector('[data-buy="ship_wasp"]').click();
      window.__CRT03 = { state, stage, intents, charges };
      return state.lossLedger.impound;
    }, hull);
    const row = page.locator('.sx-sw__list [data-buy="ship_wasp"]');
    assert.match(await row.innerText(), /11,200/, 'the actual purchase rail quotes the used price');
    assert.match(await row.innerText(), /used/i);
    const side = page.locator('.sx-sw__side');
    assert.match(await side.innerText(), /Marrow/);
    await page.waitForFunction(() => document.querySelector('.sx-sw-side__hero .k-hero__n')?.getAttribute('aria-label') === '11,200');
    assert.equal(await side.locator('.k-hero__n').getAttribute('aria-label'), '11,200');
    assert.ok((await side.innerText()).includes(listing.scarSentence));
    assert.ok((await side.innerText()).includes(listing.deedLine));
    assert.equal(RAW_ID.test(await side.innerText()), false);
    const buy = side.locator('[data-buyship="ship_wasp"]');
    assert.equal(await buy.isDisabled(), false, '15,000 credits can buy the 11,200-credit lot');
    assert.equal(await buy.getAttribute('data-listing-id'), listing.listingId);
    await page.evaluate(() => { const h = window.__CRT03; h.state.player.credits = 100; h.stage.refresh(); });
    assert.equal(await buy.isDisabled(), true);
    assert.match(await side.innerText(), /11,100 cr short/i, 'the disabled reason uses the lot price');
    await page.evaluate(async () => {
      const h = window.__CRT03; h.state.player.credits = 15000; h.stage.refresh();
      await document.fonts.ready;
      for (const animation of document.getAnimations()) {
        if (animation.effect?.getTiming?.().iterations !== Infinity) { try { animation.finish(); } catch {} }
      }
    });
    await page.screenshot({ path: '.devshots/delegates/oct17/fix-r3b-3/used-hull.png' });
    await buy.click();
    const bought = await page.evaluate(() => {
      const h = window.__CRT03;
      return { owned: h.state.player.ownedShips.at(-1), credits: h.state.player.credits,
        listing: h.state.lossLedger.impound || null, intents: h.intents, charges: h.charges };
    });
    assert.deepEqual(bought.intents, [{ defId: 'ship_wasp', listingId: listing.listingId }]);
    assert.equal(bought.charges[0].amount, 11200);
    assert.equal(bought.credits, 3800);
    assert.equal(bought.listing, null);
    assert.deepEqual(scarPrint(bought.owned.livingHull), scarPrint(hull));
    assert.equal(bought.owned.rapSheetLine, listing.deedLine);
    await page.evaluate(() => window.__CRT03.stage.dispose());
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});


// Mount the real stage without a browser. Only frame regions and rendered purchase
// buttons need DOM behavior; layout, WebGL and animation are outside this test.
function shipworksDom() {
  const doc = fakeDom();
  const make = doc.createElement;
  const regions = new Map();
  doc.createElement = (tag) => {
    const node = make(tag);
    node.ownerDocument = doc;
    node.hidden = true;
    node.style.removeProperty = (key) => { delete node.style[key]; };
    node.hasAttribute = (key) => node.getAttribute(key) !== null;
    node.removeEventListener = () => {};
    node.remove = () => {};
    node.prepend = (...children) => children.forEach((child) => node.appendChild(child));
    node.insertBefore = (child) => node.appendChild(child);
    node.after = () => {};
    node.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });
    node.getContext = () => null;
    node.contains = (child) => child?.parentNode === node;
    node.querySelector = (selector) => {
      if (node.className === 'k-panel sx-sw') {
        if (!regions.has(selector)) regions.set(selector, doc.createElement('div'));
        return regions.get(selector);
      }
      if (/^\[data-gauge-(?:value|ghost)\]$/.test(selector)) {
        node.gaugeNodes ||= new Map();
        if (!node.gaugeNodes.has(selector)) node.gaugeNodes.set(selector, doc.createElement('span'));
        return node.gaugeNodes.get(selector);
      }
      const attr = selector.match(/^\[(data-(?:buyship|buy|mode))(?:="([^"]*)")?\]$/);
      if (!attr) return null;
      const button = [...node.innerHTML.matchAll(/<button\b[^>]*>/g)]
        .find(([html]) => html.includes(`${attr[1]}="${attr[2] || ''}`));
      if (!button) return null;
      const control = doc.createElement('button');
      for (const [, key, value] of button[0].matchAll(/([\w-]+)="([^"]*)"/g)) control.setAttribute(key, value);
      control.disabled = /\sdisabled(?:\s|>)/.test(button[0]);
      control.parentNode = node;
      control.closest = (sel) => sel === `[${attr[1]}]` ? control : null;
      return control;
    };
    node.fire = async (target) => {
      for (const handler of node.listeners.click || []) await handler({ target, preventDefault() {}, stopPropagation() {} });
    };
    return node;
  };
  doc.createElementNS = (_ns, tag) => doc.createElement(tag);
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  return { doc, regions };
}

test('worker impound updates let the real Shipworks stage buy, remove and replace the used lot', async (t) => {
  const h = boot({ credits: 15000 });
  t.after(() => h.ledger.destroy());
  const differ = createDomainDiffer();
  const domains = new Map();
  const main = createGameState(4242);
  const transport = (tick) => {
    for (const update of structuredClone(differ.diff(h.state, tick).updates)) {
      const segs = update.segs.length === 1 ? update.segs[0].split('.') : update.segs;
      domains.set(segs[0], main[segs[0]]);
      applyDomainPathUpdate(domains, { ...update, segs }, new WeakSet());
      main[segs[0]] = domains.get(segs[0]);
    }
  };
  transport(0);
  spawnVictim(h.state, { id: 7, defId: WASP.id, name: 'Marrow', callsign: 'Marrow', livingHull: markedHull(true) });
  combatPrototype.kill.call({ state: h.state, bus: h.bus }, h.state.entities.get(7), 1);
  const listing = h.state.lossLedger.impound;
  assert.equal(listing.price, 11200, 'the real combat and ledger owners create the used lot');
  transport(1);

  const dom = shipworksDom();
  const previous = new Map(['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout'].map((key) => [key, globalThis[key]]));
  globalThis.document = dom.doc;
  globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }) };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.setTimeout = () => 1;
  let stage;
  try {
    main.render = { renderer: { getContext: () => ({ isContextLost: () => true }) } };
    const bus = createBus();
    const intents = [];
    bus.on('ui:buyShip', (payload) => { intents.push(payload); h.bus.emit('ui:buyShip', payload); });
    stage = createShipStage({ state: main, bus, screenMemory: {
      read: (_screen, key, fallback) => ({ mode: 'buy', buyId: WASP.id })[key] ?? fallback,
      set() {},
    } });
    stage.onShow();
    const rail = dom.regions.get('.sx-sw__list');
    const side = dom.regions.get('.sx-sw__side');
    assert.match(rail.innerHTML.match(/<button[^>]*data-buy="ship_wasp"[\s\S]*?<\/button>/)[0], /11,200/,
      'the transported lot replaces the stock price on the actual Shipworks rail');
    assert.match(side.innerHTML, /Marrow/);
    assert.ok(side.innerHTML.includes(listing.scarSentence));
    assert.ok(side.innerHTML.includes(listing.deedLine));
    let buy = side.querySelector('[data-buyship="ship_wasp"]');
    assert.equal(buy.disabled, false, '15,000 credits can buy the worker lot');
    assert.equal(buy.getAttribute('data-listing-id'), listing.listingId);
    main.player.credits = 100;
    stage.refresh();
    assert.equal(side.querySelector('[data-buyship="ship_wasp"]').disabled, true);
    assert.match(side.innerHTML, /11,100 cr short/);
    main.player.credits = 15000;
    stage.refresh();
    buy = side.querySelector('[data-buyship="ship_wasp"]');
    await side.fire(buy);
    assert.deepEqual(intents, [{ defId: WASP.id, listingId: listing.listingId }]);
    assert.equal(h.charges.at(-1).amount, listing.price);
    for (let tick = 2; tick <= 61; tick++) transport(tick);
    assert.equal(main.lossLedger.impound, undefined, 'purchase removes the transported lot');
    stage.refresh();
    assert.doesNotMatch(side.innerHTML, /data-listing-id=/, 'the removed lot cannot be bought again');
    spawnVictim(h.state, { id: 8, defId: WASP.id, name: 'New Dawn', callsign: 'New Dawn', livingHull: markedHull(false) });
    combatPrototype.kill.call({ state: h.state, bus: h.bus }, h.state.entities.get(8), 1);
    transport(62);
    stage.refresh();
    assert.notEqual(main.lossLedger.impound.listingId, listing.listingId);
    assert.match(side.innerHTML, /New Dawn/);
    assert.equal(side.querySelector('[data-buyship="ship_wasp"]').getAttribute('data-listing-id'), h.state.lossLedger.impound.listingId);
    assert.equal(main.lossLedger.entries, undefined, 'the loss history stays authoritative');
  } finally {
    stage?.dispose();
    for (const [key, value] of previous) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('a catalog intent never substitutes a used hull, and a stale listing never buys stock', () => {
  const h = boot({ credits: 100000 });
  h.state.player.researchedNodes.push(WASP.requiresTech);
  spawnVictim(h.state, {
    id: 7, defId: 'ship_wasp', name: 'Marrow', callsign: 'Marrow', livingHull: markedHull(true),
  });
  combatPrototype.kill.call({ state: h.state, bus: h.bus }, h.state.entities.get(7), 1);
  const listing = h.state.lossLedger.impound;
  const before = h.state.player.ownedShips.length;
  h.bus.emit('ui:buyShip', { defId: 'ship_wasp' });
  assert.equal(h.state.player.ownedShips.length, before + 1);
  assert.equal(h.charges.at(-1).amount, WASP.price);
  assert.equal(h.state.player.ownedShips.at(-1).rapSheet, undefined);
  assert.equal(h.state.lossLedger.impound.listingId, listing.listingId);

  delete h.state.lossLedger.impound;
  const paid = h.charges.length;
  h.bus.emit('ui:buyShip', { defId: 'ship_wasp', listingId: listing.listingId });
  assert.equal(h.state.player.ownedShips.length, before + 1);
  assert.equal(h.charges.length, paid);
  h.ledger.destroy();
});

// CRT-03 second slice: the bought lot hull keeps a nemesis. While the player flies
// the marked hull the grudge finds it again — hailing the dead owner's callsign
// before it opens fire — and the papers remember how often it has died to this hull.
import { activeImpoundShadow, mintImpoundShadow, tickImpoundGrudge } from '../src/systems/impoundGrudge.js';

function grudgeCtx(state, captures) {
  let nextId = 9000;
  return {
    helpers: {
      spawnEntity: (spec) => {
        const id = nextId++;
        const ent = { ...spec, id, alive: true };
        state.entities.set(id, ent);
        return ent;
      },
      voice: { say: (p) => { captures.voices.push(p); return true; } },
      spawnBudget: null,
    },
    emit: (name, payload) => captures.emits.push({ name, payload }),
    makeEnemySpec: (archetype, level, pos, opts) => makeEnemySpawnSpec(archetype, level, pos, opts),
  };
}

function buyMarkedLotHull(h) {
  spawnVictim(h.state, {
    id: 7, defId: 'ship_wasp', name: 'Marrow', callsign: 'Marrow', livingHull: markedHull(true),
  });
  combatPrototype.kill.call({ state: h.state, bus: h.bus }, h.state.entities.get(7), 1);
  const listing = h.state.lossLedger.impound;
  h.state.player.credits = 20000;
  h.bus.emit('ui:buyShip', { defId: 'ship_wasp', listingId: listing.listingId });
  return h.state.player.ownedShips.at(-1);
}

test('the lot hull keeps a nemesis that hails the dead owner, and the papers remember each killing', () => {
  const h = boot();
  const owned = buyMarkedLotHull(h);
  const shadow = owned.impoundShadow;
  assert.ok(shadow, 'a hull whose papers name the dead owner carries its grudge');
  assert.equal(shadow.priorCallsign, 'Marrow');
  assert.ok(shadow.grudgeName);
  assert.ok(shadow.nextAt > h.state.simTime, 'the first find is a window out, not immediate');

  // Save-safe: the shadow is plain data riding the owned hull.
  const blob = JSON.parse(JSON.stringify(owned));
  assert.equal(blob.impoundShadow.priorCallsign, 'Marrow');

  // Flying a different hull: no active shadow.
  h.state.player.activeShipIndex = 0;
  assert.equal(activeImpoundShadow(h.state), null);

  // Fly the marked hull, undock, let the find window pass.
  const impoundIndex = h.state.player.ownedShips.length - 1;
  h.state.player.activeShipIndex = impoundIndex;
  h.state.ui.docked = false;
  h.state.entities.get(1).pos = { x: 0, z: 0 };
  const captures = { voices: [], emits: [] };
  const ctx = grudgeCtx(h.state, captures);

  h.state.simTime = shadow.nextAt - 10;
  tickImpoundGrudge(h.state, ctx);
  assert.equal(shadow.liveId, null, 'the grudge waits out its window');

  h.state.simTime = shadow.nextAt + 1;
  tickImpoundGrudge(h.state, ctx);
  const grudgeId = shadow.liveId;
  assert.ok(grudgeId != null, 'the grudge found the marked hull');
  const hunter = h.state.entities.get(grudgeId);
  assert.ok(hunter);
  assert.equal(hunter.alive, true);
  assert.equal(hunter.data.name, shadow.grudgeName);
  assert.equal(hunter.data.impoundGrudge.priorCallsign, 'Marrow');
  assert.equal(hunter.data.ai.activity.kind, 'attack_run');
  assert.equal(hunter.data.ai.activity.targetId, 1);
  assert.equal(hunter.data.combat.targetId, 1);
  assert.equal(hunter.data.ai.roe, 'weapons_free');
  assert.equal(shadow.visits, 1);

  // The hail names the dead owner — the grudge thinks the old hands still fly it.
  const hail = captures.emits.find((e) => e.name === 'comms:popup');
  assert.ok(hail, 'the nemesis announces itself on comms');
  assert.equal(hail.payload.sender, shadow.grudgeName);
  assert.match(hail.payload.text, /Marrow/);
  assert.equal(RAW_ID.test(hail.payload.text), false, hail.payload.text);
  assert.ok(captures.voices.length >= 1);

  // Distance check: it comes in on approach, not on top of the hull.
  const d = Math.hypot(hunter.pos.x - 0, hunter.pos.z - 0);
  assert.ok(d >= 1200 && d <= 1700, `approach distance ${d}`);

  // While the grudge hull lives, the tick holds — no doubling.
  h.state.simTime += 600;
  tickImpoundGrudge(h.state, ctx);
  assert.equal(shadow.liveId, grudgeId);

  // Kill the nemesis: the papers remember, and the refind window is scheduled.
  hunter.alive = false;
  h.state.simTime += 1;
  tickImpoundGrudge(h.state, ctx);
  assert.equal(shadow.deaths, 1);
  assert.equal(shadow.liveId, null);
  assert.ok(shadow.nextAt > h.state.simTime);

  // Docked in a station the grudge cannot land — it waits, it does not fire.
  h.state.ui.docked = true;
  h.state.simTime = shadow.nextAt + 500;
  tickImpoundGrudge(h.state, ctx);
  assert.equal(shadow.liveId, null);
  h.ledger.destroy();
});

test('a hull with no named owner carries no grudge', () => {
  assert.equal(mintImpoundShadow({ lossId: 'loss_x', callsign: null }, 0), null);
  assert.equal(mintImpoundShadow({ lossId: 'loss_x' }, 0), null);
  const shadow = mintImpoundShadow({ lossId: 'loss_x', callsign: 'Marrow' }, 50);
  assert.ok(shadow);
  const again = mintImpoundShadow({ lossId: 'loss_x', callsign: 'Marrow' }, 50);
  assert.deepEqual(shadow, again, 'the same papers mint the same nemesis');
});
