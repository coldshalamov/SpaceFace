// PB-SLICE-B — SF-289 + SF-290 (must-share pair).
// SF-289: the customs weir has three honest approaches — hold for the read (logged transit),
// run the gate unread (flagged runner: visible, proportionate, decaying), or stay out
// (recoverable refusal). A mid-read bolt resolves the manifest the beam actually kept.
// SF-290: a starved industry hopper is a real shortage — a neighbor board posts a feed run
// naming the starving input, and contract delivery lands in the market so the line resumes.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { economy, starvedIndustryNeedFor } from '../src/systems/economy.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { HELIOS_CUSTOMS_WEIR } from '../src/world/customsWeir.js';

// ── SF-289: weir approach semantics ───────────────────────────────────────────────────────────

function weirHarness(sectorId, playerPos) {
  const player = {
    id: 'pilot', type: 'ship', alive: true, team: 0, isPlayer: true,
    pos: { ...playerPos }, vel: { x: 0, z: 0 }, hull: 140, hullMax: 140,
  };
  const events = [];
  const scanCalls = [];
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: player.id,
    player: {},
    entities: new Map([[player.id, player]]),
    entityList: [player],
    world: { currentSectorId: sectorId },
  };
  const sys = Object.create(lawSecurity);
  sys.bus = { emit(name, payload) { events.push({ name, payload }); } };
  sys.state = state;
  sys.registry = {
    get(name) {
      if (name !== 'economy') return null;
      return {
        runScan(p) { scanCalls.push(p); return { found: false }; },
      };
    },
  };
  return { state, sys, player, events, scanCalls };
}

test('SF-289 lawful approach: hold the read → transit logged, exit clean, never flagged', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player, events, scanCalls } = weirHarness('sector_helios_prime', { ...center });
  for (let i = 0; i < 4; i += 1) sys._updateCustomsWeir(0.9, state); // readT crosses 1.6s
  assert.equal(scanCalls.length, 1, 'the read resolved once');
  assert.equal(scanCalls[0].source, 'customs_weir');
  player.pos.x = center.x + 400; // leave after the read
  sys._updateCustomsWeir(0.2, state);
  assert.equal(events.filter((e) => e.name === 'customs:weirBolt').length, 0,
    'a completed transit is not a bolt');
  assert.equal(events.filter((e) => e.name === 'law:response' && e.payload.action === 'weir_bolt').length, 0);
});

test('SF-289 risky approach: running the gate unread flags the hull — once per transit', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player, events, scanCalls } = weirHarness('sector_helios_prime', { x: center.x + 400, z: center.z });
  player.vel.x = 200; // above the 34 WU/s read ceiling — the beam cannot finish
  player.pos.x = center.x; // streak through the gate
  sys._updateCustomsWeir(0.5, state);
  player.pos.x = center.x + 400; // out the far side
  sys._updateCustomsWeir(0.5, state);
  const bolts = events.filter((e) => e.name === 'customs:weirBolt');
  assert.equal(bolts.length, 1, 'one unread transit is one flag, not a stream');
  assert.equal(bolts[0].payload.kind, 'speed_run');
  assert.equal(bolts[0].payload.factionId, 'faction_scn');
  const row = events.find((e) => e.name === 'law:response' && e.payload.action === 'weir_bolt');
  assert.ok(row, 'the flag is instrumented on the law surface');
  assert.equal(row.payload.kind, 'speed_run');
  const voice = events.find((e) => e.name === 'law:voice');
  assert.ok(voice && /unread transit/i.test(voice.payload.text), 'the booth calls it out');
  assert.equal(scanCalls.length, 0, 'a pure speed-run resolves no manifest');
});

test('SF-289 mid-read bolt flags the runner; a beam mostly finished resolves what it kept', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  // Deep bolt: 1.2s of the 1.6s read accumulated, then exit — the beam kept most of the manifest.
  const deep = weirHarness('sector_helios_prime', { ...center });
  deep.sys._updateCustomsWeir(0.7, deep.state);
  deep.sys._updateCustomsWeir(0.6, deep.state); // readT = 1.3 ≥ 0.8
  deep.player.pos.x = center.x + 400;
  deep.sys._updateCustomsWeir(0.2, deep.state);
  const deepBolt = deep.events.find((e) => e.name === 'customs:weirBolt');
  assert.ok(deepBolt && deepBolt.payload.kind === 'read_bolt', 'breaking the beam is a read bolt');
  assert.equal(deep.scanCalls.length, 1, 'the mostly-finished read resolves through the scan path');
  assert.equal(deep.scanCalls[0].source, 'customs_weir_bolt');

  // Shallow graze: 0.3s in the beam, then out — flagged, but the gate kept nothing to resolve.
  const shallow = weirHarness('sector_helios_prime', { ...center });
  shallow.sys._updateCustomsWeir(0.3, shallow.state); // readT = 0.3 < 0.8
  shallow.player.pos.x = center.x + 400;
  shallow.sys._updateCustomsWeir(0.2, shallow.state);
  assert.equal(shallow.scanCalls.length, 0, 'a shallow graze gives the beam no manifest');
  const flag = shallow.events.find((e) => e.name === 'customs:weirBolt');
  assert.ok(flag && flag.payload.kind === 'read_bolt', 'still an unread transit — flagged once');
});

test('SF-289 jumping out of the sector mid-visit is still a bolt — the gate saw a hull leave unread', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player, events, scanCalls } = weirHarness('sector_helios_prime', { ...center });
  sys._updateCustomsWeir(0.5, state); // seen inside, shallow read
  state.world.currentSectorId = 'sector_ceres_belt'; // jumped away mid-visit
  sys._updateCustomsWeir(0.5, state);
  const bolt = events.find((e) => e.name === 'customs:weirBolt');
  assert.ok(bolt, 'a sector exit while inside the gate flags the runner');
  assert.equal(bolt.payload.weirId, 'helios_customs_weir', 'the flag belongs to the weir that saw it');
  assert.equal(scanCalls.length, 0, 'a shallow read resolves nothing');
});

test('SF-289 jumping from one gate sector into the other still flags the first gate', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player, events } = weirHarness('sector_helios_prime', { ...center });
  sys._updateCustomsWeir(0.5, state); // seen inside the Helios corridor, shallow read
  // Helios and Tethys are mutual neighbors — a direct jump lands inside the OTHER weir sector.
  state.world.currentSectorId = 'sector_tethys_junction';
  player.pos = { x: 9000, z: 9000 }; // nowhere near the Tethys cone
  sys._updateCustomsWeir(0.5, state);
  const bolt = events.find((e) => e.name === 'customs:weirBolt');
  assert.ok(bolt, 'leaving the Helios gate unread flags it even when the next sector has its own weir');
  assert.equal(bolt.payload.weirId, 'helios_customs_weir', 'the flag belongs to the gate that was bolted');
});

test('SF-289 a completed transit that then leaves the sector is not flagged', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player, events, scanCalls } = weirHarness('sector_helios_prime', { ...center });
  for (let i = 0; i < 4; i += 1) sys._updateCustomsWeir(0.9, state); // read completes
  assert.equal(scanCalls.length, 1);
  state.world.currentSectorId = 'sector_ceres_belt';
  sys._updateCustomsWeir(0.5, state);
  assert.equal(events.filter((e) => e.name === 'customs:weirBolt').length, 0,
    'a logged transit is clean wherever the hull goes next');
});

test('SF-289 recoverable refusal: never entering the gate costs nothing', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, events, scanCalls } = weirHarness('sector_helios_prime', { x: center.x + 400, z: center.z });
  for (let i = 0; i < 4; i += 1) sys._updateCustomsWeir(0.9, state);
  assert.equal(scanCalls.length, 0);
  assert.equal(events.filter((e) => e.name === 'customs:weirBolt').length, 0,
    'a hull that declines the gate is never flagged');
});

test('SF-289 the flag is the scanner ledger: weirBolt sets the faction gates hot, decaying', () => {
  const sim = createSimulation({ seed: 28901, systems: [economy] });
  const { state, bus } = sim;
  state.simTime = 100;
  assert.equal(state.player.customsHotUntil == null
    || state.player.customsHotUntil.faction_scn == null, true);
  bus.emit('customs:weirBolt', { weirId: 'helios_customs_weir', factionId: 'faction_scn', kind: 'speed_run' });
  const until = state.player.customsHotUntil && state.player.customsHotUntil.faction_scn;
  assert.ok(until > state.simTime, 'the runner is hot until the window decays');
  const first = until;
  bus.emit('customs:weirBolt', { weirId: 'helios_customs_weir', factionId: 'faction_scn', kind: 'speed_run' });
  assert.equal(state.player.customsHotUntil.faction_scn, first,
    'repeat bolts extend by max, never stack');
});

// ── SF-290: a real shortage, a real lead, a real delivery ─────────────────────────────────────

test('SF-290 the starvation read names the hungriest input of a real yard book', () => {
  const sim = createSimulation({ seed: 29001, systems: [economy] });
  const econ = sim.registry.get('economy');
  const market = econ.ensureMarket('station_ceres'); // refinery, tier 1 — recipe_refine_iron
  const iron = market.cmdty_ore_iron;
  iron.stock = iron.baseEq * 0.6; // throttled, not starving
  assert.equal(starvedIndustryNeedFor('refinery', 1, market), null,
    'a fed line posts no shortage');
  iron.stock = iron.baseEq * 0.1; // hopper nearly dry
  const need = starvedIndustryNeedFor('refinery', 1, market);
  assert.ok(need, 'a starving hopper is detectable');
  assert.equal(need.inputId, 'cmdty_ore_iron', 'the shortage names the real input leg');
  assert.equal(need.jobId, 'recipe_refine_iron');
  assert.ok(need.deficitUnits > 0, 'the deficit is a real unit count');
});

test('SF-290 a neighbor board posts a feed run into the starving yard', () => {
  const sim = createSimulation({ seed: 29002, systems: [economy, economyContracts] });
  const econ = sim.registry.get('economy');
  const market = econ.ensureMarket('station_ceres');
  market.cmdty_ore_iron.stock = market.cmdty_ore_iron.baseEq * 0.05;
  sim.state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 80 };

  const contracts = sim.registry.get('economyContracts');
  // Docked at Helios — a station that can see the Ceres sector's boards.
  const offer = contracts.planOffer({ id: 'station_helios', name: 'Helios Station', type: 'trade_hub', tier: 0, sectorId: 'sector_helios_prime', factionId: 'faction_scn', size: 'M' }, 3);
  assert.ok(offer, 'a starving neighbor yields a posted offer');
  assert.equal(offer.type, 'cargo_delivery');
  assert.equal(offer.destStationId, 'station_ceres', 'the run points INTO the starving yard');
  assert.equal(offer.params.cmdtyId, 'cmdty_ore_iron', 'the contract names the real input leg');
  assert.ok(offer.params.qty > 0);
  assert.match(offer.summary, /starving|starved|empty hopper/i,
    'the offer says why — the line is idling, not a rolled event');
  assert.equal(offer.cause.tag, 'industry_starved');
});

test('SF-290 calm hoppers post no feed run', () => {
  const sim = createSimulation({ seed: 29003, systems: [economy, economyContracts] });
  const econ = sim.registry.get('economy');
  econ.ensureMarket('station_ceres'); // rest state — every input at equilibrium
  sim.state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 80 };
  const contracts = sim.registry.get('economyContracts');
  assert.equal(contracts._starvedNeighborNeed({ id: 'station_helios', sectorId: 'sector_helios_prime' }), null,
    'a fed neighborhood detects nothing');
});

test('SF-290 contract delivery lands in the market and the starved line resumes', () => {
  const sim = createSimulation({ seed: 29004, systems: [economy] });
  const { state, bus } = sim;
  state.simTime = 1000;
  const econ = sim.registry.get('economy');
  const market = econ.ensureMarket('station_ceres');
  const iron = market.cmdty_ore_iron;
  const metals = market.cmdty_refined_metals;
  iron.stock = iron.baseEq * 0.05; // starving — the line limps at throttle
  const starvedMetals = metals.stock;
  econ.applyStationIndustry(60);
  const starvedDelta = metals.stock - starvedMetals;
  assert.ok(starvedDelta < 1, `a starving yard barely produces (${starvedDelta.toFixed(3)}u/min)`);
  assert.ok(starvedIndustryNeedFor('refinery', 1, market), 'starved before relief');

  // The contract's sealed lot arrives — cargo:delivered is the custody→stock seam.
  const preDelivery = iron.stock;
  bus.emit('cargo:delivered', {
    commodityId: 'cmdty_ore_iron', qty: 30, missionId: 'm-relief', stationId: 'station_ceres',
  });
  assert.ok(iron.stock - preDelivery >= 29, 'the delivered lot is real stock, not a flag');
  const postDelivery = iron.stock;
  const fedMetals = metals.stock;
  econ.applyStationIndustry(60);
  const fedDelta = metals.stock - fedMetals;
  assert.ok(fedDelta > starvedDelta * 3,
    `the line resumed on relief (${fedDelta.toFixed(2)}u vs ${starvedDelta.toFixed(3)}u starved)`);
  assert.ok(iron.stock < postDelivery,
    'the yard eats the relief, not just banks it');
});
