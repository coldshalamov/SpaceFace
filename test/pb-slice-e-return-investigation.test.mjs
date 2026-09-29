// PB-SLICE-E — SF-294 quiet return + SF-295 investigation payoff.
//
// SF-294: a worked claim is a returnable place. The rock rematerializes with its cleared bore,
// its machines, and whatever the ledger accumulated while the player was elsewhere — and one
// comms line names the delta against the last witnessed baseline. No mission marker, no journal.
// SF-295: an ambush tell is a layered scan discovery — an uncertain signal first, a resolved
// warning after the pulse. The resolution must reach the player (comms + the signal row naming
// itself) because the choice it enables is physical: signature shapes are proximity-gated, so
// holding clear starves the spring. The non-investigative route (walk in blind) is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { ambushSignatures, activeAmbushSignatureTells } from '../src/systems/ambushSignatures.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { generateDrillField, tileIndex, DRILL_CONST } from '../src/systems/drill.js';
import { COMMODITIES } from '../src/data/commodities.js';

const { COLS, ROWS } = DRILL_CONST;
const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const POCKET = [[14, 2], [14, 0], [14, 1], [13, 2], [15, 2], [13, 1], [15, 1], [13, 3], [14, 3]];

// ── SF-295: scan resolves the authored warning, once ────────────────────────────────────────────

function bootScan(seed = 4701) {
  const sim = createSimulation({ seed, systems: [scanner, ambushSignatures] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_pallas_drift';
  state.world.activeSector = { id: 'sector_pallas_drift', pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  state.encounterDirector = {
    pending: [{
      encounterId: 'ambush-SF295',
      shapeId: 'ambush_snare',
      kind: 'ambush_snare',
      script: 'ambush',
      sectorId: 'sector_pallas_drift',
      zoneId: 'zone_pallas_ambush',
      zoneName: 'Sker-Run Ambush',
      zoneCenter: { x: 0, z: 0 },
      zoneRadius: 420,
      dueAt: 1e9,
    }],
  };
  const log = { comms: [], scans: [], results: [] };
  bus.on('comms:log', (p) => log.comms.push(p));
  bus.on('ambushSignature:scanned', (p) => log.scans.push(p));
  bus.on('signal:scanResults', (p) => log.results.push(p));
  return { sim, state, bus, log, player, ambSys: sim.registry.get('ambushSignatures') };
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

test('SF-295: pulsing a tell speaks the authored warning and resolves the row that earned it', () => {
  const t = bootScan();
  t.ambSys.update(0.1, t.state);
  const tell = activeAmbushSignatureTells(t.state)[0];
  assert.ok(tell, 'the pending ambush plants a passive tell');
  // Park the player beside the tell so the pulse lands inside the scan radius.
  t.player.pos.x = tell.pos.x + 10;
  t.player.pos.z = tell.pos.z;

  pulse(t);
  assert.equal(t.log.scans.length, 1, 'one scan resolves the tell once');
  const warn = t.log.comms.find((c) => /ambush|trap|raider|distance|clear/i.test(c.text));
  assert.ok(warn, 'the authored counterplay warning reaches the comms feed');
  assert.match(warn.text, /dead beacon/i, 'the line names what the signature actually is');

  const row = t.log.results[0].signals.find((r) => r.id === `signal:${tell.id}`);
  assert.ok(row, 'the tell keeps its row in the scan results');
  assert.equal(row.classification, tell.label.toUpperCase(),
    'the resolved row names the signature instead of the vague traffic class');
  assert.match(row.detail, /ambush|distance|clear/i, 'the resolved detail carries the warning');

  // The unread case: a tell the pulse never reached stays deliberately uncertain.
  t.log.comms.length = 0;
  t.log.results.length = 0;
  // ~1.5k out: inside the 2000 signal radius so the row is live on the board, outside the
  // 1200 signature-scan radius so this pulse cannot resolve it.
  t.state.encounterDirector.pending.push({
    encounterId: 'ambush-SF295-far',
    shapeId: 'ambush_snare', kind: 'ambush_snare', script: 'ambush',
    sectorId: 'sector_pallas_drift', zoneId: 'zone_pallas_ambush',
    zoneName: 'Sker-Run Ambush', zoneCenter: { x: 1600, z: 0 }, zoneRadius: 100, dueAt: 1e9,
  });
  t.ambSys.update(0.1, t.state);
  t.state.input.actions.scanPulse = false;
  t.sim.runTicks(Math.ceil(8.1 / SIM_DT)); // clear the pulse cooldown
  pulse(t);
  const farTell = activeAmbushSignatureTells(t.state).find((row) => row.encounterId === 'ambush-SF295-far');
  assert.ok(farTell, 'a second pending ambush places its own tell');
  assert.equal(farTell.scanned, false, 'the out-of-range tell is not resolved by a distant pulse');
  const unresolved = t.log.results.at(-1).signals.find((r) => r.id === `signal:${farTell.id}`);
  assert.ok(unresolved, 'the uninvestigated tell still holds a signal row');
  assert.notEqual(unresolved.classification, farTell.label.toUpperCase(),
    'an uninvestigated tell never leaks the authored name');
  assert.equal((unresolved.detail || '').includes(farTell.hint), false,
    'the authored warning never appears before the scan that earns it');
  assert.equal(t.log.comms.filter((c) => /dead beacon/i.test(c.text)).length, 0,
    'no warning is spoken for a tell that was never scanned');
});

test('SF-295: the scan payoff is once-only — re-pulses do not re-warn or un-resolve', () => {
  const t = bootScan();
  t.ambSys.update(0.1, t.state);
  const tell = activeAmbushSignatureTells(t.state)[0];
  t.player.pos.x = tell.pos.x + 10;
  t.player.pos.z = tell.pos.z;
  pulse(t);
  t.state.input.actions.scanPulse = false;
  t.sim.runTicks(Math.ceil(8.1 / SIM_DT));
  pulse(t);
  assert.equal(t.log.scans.length, 1, 'a resolved tell does not re-fire the scan event');
  assert.equal(t.log.comms.filter((c) => /dead beacon/i.test(c.text)).length, 1,
    'the comms warning stays once per tell');
  const row = t.log.results.at(-1).signals.find((r) => r.id === `signal:${tell.id}`);
  assert.ok(row, 'the row persists across pulses');
  assert.equal(row.classification, tell.label.toUpperCase(), 'resolution survives re-scans');
});

// ── SF-294: the quiet return line reports only what changed unwitnessed ─────────────────────────

function makeSiteHarness() {
  const handlers = new Map();
  const bus = {
    events: [],
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
    emit(name, payload) {
      this.events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
  const entities = new Map();
  const state = {
    simTime: 0, tick: 0, meta: { seed: 47 },
    entities, playerId: 1,
    player: { cargo: { items: { cmdty_regocrete: 40, cmdty_control_unit: 8, cmdty_refined_metals: 12, cmdty_electronics: 8, cmdty_purified_silica: 6 }, usedVolume: 0, usedMass: 0, capVolume: 900, capMass: 1400 } },
    world: {
      currentSectorId: 'sec_core_alpha',
      sectors: { sec_core_alpha: { name: 'The Test Face' } },
    },
    content: { commodities: COMMODITIES },
  };
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      if (typeof helpers.spawnEntity !== 'function') throw new Error('spawn helper unavailable');
      const ent = { id: nextId++, alive: true, ...spec };
      ent.data = spec.data || {};
      entities.set(ent.id, ent);
      return ent;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry: { get: () => null } });
  return { sys, state, bus, entities };
}

function addAsteroid(h, id = 42) {
  const ent = {
    id, type: 'asteroid', alive: true, pos: { x: 120, z: -40 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_1' },
  };
  h.entities.set(id, ent);
  return ent;
}

function openSession(h, asteroidId, cells) {
  const field = generateDrillField(asteroidId);
  for (const [c, r] of cells) field[c][r] = EMPTY();
  h.entities.get(asteroidId).data.drillCleared = cells.map(([c, r]) => tileIndex(c, r));
  h.state.drill = { active: true, asteroidId, field, avatar: { col: cells[0][0], row: cells[0][1] } };
  return field;
}

function returnVisit(h, siteId) {
  // The rock despawns with the sector; re-entry respawns it through the real chain:
  // sector:enter arms the sweep and the next balance tick runs _repairAnchors.
  const site = h.sys.getSite(siteId);
  h.entities.delete(site.asteroidId);
  h.state.drill = null;
  h.bus.emit('sector:enter', { sectorId: 'sec_core_alpha' });
  h.sys.update(1, h.state);
  return h.bus.events.filter((e) => e.name === 'comms:log');
}

test('SF-294: a worked claim reports what it did while away — diffed, not restated', () => {
  const h = makeSiteHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  const siteId = res.siteId;
  const site = h.sys.getSite(siteId);
  assert.equal(site.anchored, true, 'the claim is anchored');

  // Player departs: the baseline snapshots the witnessed state (all zeros).
  h.bus.emit('sector:exit', { sectorId: 'sec_core_alpha' });
  h.entities.delete(42);

  // While away the site produces, ships, and a courier lands — all unwitnessed.
  site.stats.exportedU += 7;
  site.fleet.delivered += 2;
  site.exportBuffer.cmdty_ore_iron = 4;

  const lines = returnVisit(h, siteId);
  const line = lines.at(-1);
  assert.ok(line, 'the rematerialized claim speaks once');
  assert.match(line.payload.text, /Test Face/, 'the line names the place');
  assert.match(line.payload.text, /7u shipped/, 'unwitnessed production is reported');
  assert.match(line.payload.text, /2 couriers home/, 'courier deliveries are reported');
  assert.match(line.payload.text, /4u in the hopper/, 'buffered output is reported');

  // A second return with nothing new: the line must not re-report the same delta.
  const again = returnVisit(h, siteId).at(-1);
  assert.ok(again, 'each return still answers');
  assert.doesNotMatch(again.payload.text, /7u shipped|2 couriers/,
    'already-reported work is not restated as new');
  assert.match(again.payload.text, /still stands/, 'a quiet claim still reads as a place kept');
});

test('SF-294: the return line survives a save/load and never double-reports', () => {
  const h = makeSiteHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  const siteId = res.siteId;

  // The player watches 5u ship, then saves in-sector: the save boundary is itself a
  // witnessed moment, so the snapshot must carry those 5u as already-seen.
  const site = h.sys.getSite(siteId);
  site.stats.exportedU = 5;
  const snapshot = h.sys.serialize();
  const h2 = makeSiteHarness();
  h2.sys.deserialize(snapshot);
  const restored = h2.sys.getSite(siteId);
  assert.ok(restored && restored.anchored, 'the claim survives the save path');
  restored.stats.exportedU += 3;

  const line = returnVisit(h2, siteId).at(-1);
  assert.ok(line, 'a restored claim still greets the return');
  assert.match(line.payload.text, /3u shipped/, 'only post-save work is news');
  assert.doesNotMatch(line.payload.text, /8u shipped/, 'witnessed work is not restated after a load');
});

test('SF-294: a claim that did nothing earns the standing line, not a fabricated delta', () => {
  const h = makeSiteHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  const siteId = res.siteId;
  h.bus.emit('sector:exit', { sectorId: 'sec_core_alpha' });
  const line = returnVisit(h, siteId).at(-1);
  assert.ok(line, 'even a quiet claim is acknowledged on return');
  assert.match(line.payload.text, /still stands/, 'no work means no invented production');
  assert.equal(line.payload.text.includes('shipped'), false, 'zero deltas never masquerade as work');
});
