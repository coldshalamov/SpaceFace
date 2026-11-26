// Works contracts: station-board jobs done with the rover, with machines inside a rock, with
// Field Build over a belt, and in the planet's bands. These tests drive the real mission system
// with the events the rover, the site system and the planet already emit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKS_CONTRACTS, WORKS_CONTRACT_TYPE, WORKS_REPEAT_PAY, validateWorksContracts, worksContractOpen,
  worksObjectiveLine, worksOfferFor, worksOffersForStation, worksRockTypesFor,
} from '../src/data/worksContracts.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missions } from '../src/systems/missions.js';

function harness(id, { sites = null } = {}) {
  const state = createGameState(312);
  const offer = worksOfferFor(id, state);
  state.mode = 'flight'; state.simTime = 100; state.playerId = 1;
  state.world.currentSectorId = offer.destSectorId;
  state.settings.gameplay.tutorialHints = false;
  state.player.cargo = { items: {}, capVolume: 400, usedVolume: 0, usedMass: 0 };
  state.onboarding = { active: false, finished: true };
  const pilot = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, mass: 26 };
  state.entities.set(1, pilot); state.entityList.push(pilot);
  const bus = createBus(), grants = [], completions = [], toasts = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('mission:completed', (p) => completions.push(p));
  bus.on('toast', (p) => toasts.push(p.text));
  const host = Object.create(missions);
  host.init({ state, bus, helpers: { voice: { say: () => true } },
    registry: { get: (name) => (name === 'asteroidSites' ? sites : null) } });
  const accept = (which = offer) => host.postAndAcceptAuthoredOffer(which);
  const active = () => state.missions.active.find((m) => m.type === WORKS_CONTRACT_TYPE && m.status === 'active');
  const paid = () => grants.reduce((sum, g) => sum + (Number(g.amount) || 0), 0);
  return { state, offer, bus, host, grants, completions, toasts, accept, active, paid };
}

test('the catalog can be worked where it is posted, and offers never share live state', () => {
  assert.deepEqual(validateWorksContracts(), []);
  assert.ok(WORKS_CONTRACTS.length >= 14);
  const rungs = new Set(WORKS_CONTRACTS.map((row) => row.rung));
  for (const rung of ['rover', 'build', 'yard', 'planet']) assert.ok(rungs.has(rung), `a ${rung} job exists`);
  const a = worksOfferFor('works_ceres_kroll_copper');
  a.params.works.breaches = 9; a.params.works.goal.qty = 1;
  const b = worksOfferFor('works_ceres_kroll_copper');
  assert.equal(b.params.works.breaches, 0);
  assert.equal(b.params.works.goal.qty, 8);
  assert.deepEqual(worksRockTypesFor('sector_ceres_belt', 'cmdty_ore_copper'), ['ast_metallic']);
  assert.equal(worksOfferFor('missing'), null);
});

test('a job that builds on another stays off the board until the first is done', () => {
  const state = createGameState(1);
  const first = WORKS_CONTRACTS.find((row) => row.id === 'works_beltout_first_claim');
  const fat = WORKS_CONTRACTS.find((row) => row.id === 'works_ceres_fat_face');
  assert.equal(worksContractOpen(state, first), true);
  assert.equal(worksContractOpen(state, fat), false);
  assert.ok(!worksOffersForStation('station_ceres', state).some((o) => o.params.works.id === fat.id));
  state.story.flags.worksContracts = { works_beltout_first_claim: 1 };
  assert.equal(worksContractOpen(state, first), false, 'a one-off is not posted twice');
  assert.equal(worksContractOpen(state, fat), true);
  assert.ok(worksOffersForStation('station_ceres', state).some((o) => o.params.works.id === fat.id));
});

test('the board posts works contracts at their own station and withdraws an accepted one', () => {
  const h = harness('works_helios_first_cut');
  const board = h.host.ensureBoard('station_helios');
  const row = () => h.state.missions.boards.station_helios.slots.filter((o) => o?.params?.works?.id === 'works_helios_first_cut');
  assert.equal(row().length, 1);
  assert.equal(h.host.acceptMission(row()[0].id), true);
  h.host.ensureBoard('station_helios');
  assert.equal(row().length, 0);
  assert.equal(h.active().objectiveTarget, 4);
  assert.ok(board);
});

test('only ore the rover cut counts, and a clean job pays its bonus as one figure', () => {
  const h = harness('works_ceres_kroll_copper');
  assert.equal(h.accept().ok, true);
  const m = h.active();
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_copper', qty: 8, minerId: 1, pos: { x: 0, z: 0 } });
  assert.equal(m.objectiveProgress, 0, 'the laser does not count');
  h.bus.emit('drill:yield', { commodityId: 'cmdty_ore_iron', qty: 5, pos: { col: 3, row: 5 } });
  assert.equal(m.objectiveProgress, 0, 'the wrong ore does not count');
  h.bus.emit('drill:yield', { commodityId: 'cmdty_ore_copper', qty: 5, pos: { col: 3, row: 20 } });
  assert.equal(m.objectiveProgress, 5);
  assert.match(worksObjectiveLine(m), /Cut 5\/8 Copper Ore with the rover · no gas breached/);
  h.bus.emit('drill:yield', { commodityId: 'cmdty_ore_copper', qty: 4, pos: { col: 3, row: 21 } });
  assert.equal(m.status, 'completed');
  assert.equal(h.paid(), 1500 + 450);
  assert.equal(h.state.story.flags.worksContracts.works_ceres_kroll_copper, 1);
  assert.ok(h.toasts.some((t) => /No gas breached: \+450 cr/.test(t)));
});

test('breaching gas costs the bonus, never the job', () => {
  const h = harness('works_ceres_kroll_copper');
  h.accept();
  const m = h.active();
  h.bus.emit('drill:gasHit', { dmg: 18, pos: { col: 4, row: 9 } });
  assert.match(worksObjectiveLine(m), /gas breached$/);
  assert.ok(h.toasts.some((t) => /sealed-rock bonus is gone/.test(t)));
  h.bus.emit('drill:yield', { commodityId: 'cmdty_ore_copper', qty: 8, pos: { col: 3, row: 21 } });
  assert.equal(m.status, 'completed');
  assert.equal(h.paid(), 1500);
});

test('a light dig is counted in cells the pilot opened, not in roof that fell', () => {
  const h = harness('works_beltout_light_touch');
  h.accept();
  const m = h.active();
  for (let i = 0; i < 24; i++) h.bus.emit('drill:break', { col: i % 20, row: 2, type: 'dirt' });
  h.bus.emit('drill:break', { col: 1, row: 9, type: 'rock', cave: true });
  assert.equal(m.params.works.cells, 24);
  assert.match(worksObjectiveLine(m), /24\/24 cells opened/);
  h.bus.emit('drill:yield', { commodityId: 'cmdty_ore_iron', qty: 10, pos: { col: 3, row: 4 } });
  assert.equal(h.paid(), 700 + 420);

  const over = harness('works_beltout_light_touch');
  over.accept();
  for (let i = 0; i < 25; i++) over.bus.emit('drill:break', { col: i % 20, row: 2, type: 'dirt' });
  assert.ok(over.toasts.some((t) => /light-dig bonus is gone/.test(t)));
  over.bus.emit('drill:yield', { commodityId: 'cmdty_ore_iron', qty: 10, pos: { col: 3, row: 4 } });
  assert.equal(over.paid(), 700);
});

test('work done in another sector does not settle a contract posted for this one', () => {
  const h = harness('works_helios_first_cut');
  h.accept();
  h.state.world.currentSectorId = 'sector_ceres_belt';
  h.bus.emit('drill:yield', { commodityId: 'cmdty_ore_iron', qty: 9, pos: { col: 3, row: 4 } });
  assert.equal(h.active().objectiveProgress, 0);
});

test('a blast job counts charge-opened cells and a backblast costs the bonus', () => {
  const h = harness('works_rhea_furnace_hall');
  h.accept();
  const m = h.active();
  h.bus.emit('drill:break', { col: 2, row: 6, type: 'dirt' });
  assert.equal(m.objectiveProgress, 0, 'a bored cell is not a blasted one');
  h.bus.emit('drill:backblast', { dmg: 10 });
  for (let i = 0; i < 24; i++) h.bus.emit('drill:break', { col: i % 9, row: 6 + (i % 3), type: 'rock', blast: true });
  assert.equal(m.status, 'completed');
  assert.equal(h.paid(), 2200);
});

test('the first claim loads its parts, wants both machines once, and is not posted again', () => {
  const h = harness('works_beltout_first_claim');
  h.accept();
  const m = h.active();
  assert.equal(h.state.player.cargo.items.cmdty_control_unit, 2);
  assert.equal(h.state.player.cargo.items.cmdty_regocrete, 4);
  h.bus.emit('site:machineInstalled', { siteId: 'site_1', machineId: 'm1', defId: 'sm_extractor', col: 13, row: 2 });
  h.bus.emit('site:machineInstalled', { siteId: 'site_1', machineId: 'm2', defId: 'sm_extractor', col: 12, row: 2 });
  assert.equal(m.objectiveProgress, 1, 'a second extractor is not a core');
  assert.match(worksObjectiveLine(m), /Install a Line Core inside a rock \(1\/2\)/);
  h.bus.emit('site:machineInstalled', { siteId: 'site_1', machineId: 'm3', defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(m.status, 'completed');
  assert.equal(h.paid(), 800);
  assert.equal(worksOffersForStation('station_beltout', h.state).some((o) => o.params.works.id === 'works_beltout_first_claim'), false);
});

test('a contact job reads the ring the site system computed and says what is short', () => {
  const geo = { m1: { solid: 4, gas: 0, matrix: 4, basalt: 0, ores: {} },
    m2: { solid: 6, gas: 0, matrix: 3, basalt: 2, ores: { cmdty_ore_iron: 1 } } };
  const sites = { projection: () => ({ machines: Object.entries(geo).map(([id, g]) => ({ id, geo: g })) }) };
  const h = harness('works_ceres_fat_face', { sites });
  h.accept();
  const m = h.active();
  h.bus.emit('site:machineInstalled', { siteId: 'site_1', machineId: 'm1', defId: 'sm_extractor', col: 5, row: 5 });
  assert.equal(m.status, 'active');
  assert.ok(h.toasts.some((t) => /4 of 6 solid cells and 0 of 1 ore veins/.test(t)));
  h.bus.emit('site:machineInstalled', { siteId: 'site_1', machineId: 'm2', defId: 'sm_extractor', col: 8, row: 5 });
  assert.equal(m.status, 'completed');
  assert.equal(h.paid(), 1400);
});

test('couriers, belt links, pylons and the planet scoop each settle their own job', () => {
  const deliver = harness('works_ceres_standing_order');
  deliver.accept();
  deliver.bus.emit('site:courierDelivered', { siteId: 's', units: 24 });
  assert.equal(deliver.active().objectiveProgress, 24);
  deliver.bus.emit('site:courierDelivered', { siteId: 's', units: 24 });
  assert.equal(deliver.paid(), 2400);

  const link = harness('works_beltout_supply_line');
  link.accept();
  link.bus.emit('site:linkCreated', { fromSiteId: 'a', toSiteId: 'b', kind: 'power' });
  assert.equal(link.active().status, 'active', 'a power tether is not a cargo line');
  link.bus.emit('site:linkCreated', { fromSiteId: 'a', toSiteId: 'b', kind: 'material' });
  assert.equal(link.paid(), 2000);

  const picket = harness('works_hyperion_picket');
  picket.accept();
  picket.bus.emit('site:defenseDeployed', { siteId: 'a', defense: { kind: 'sensor' } });
  assert.equal(picket.active().status, 'active');
  picket.bus.emit('site:defenseDeployed', { siteId: 'a', defense: { kind: 'turret' } });
  assert.equal(picket.paid(), 1600);

  const skim = harness('works_tethys_skim');
  skim.accept();
  skim.bus.emit('planet:harvest', { commodityId: 'cmdty_gas_helium3', qty: 30 });
  assert.equal(skim.active().objectiveProgress, 0);
  skim.bus.emit('planet:harvest', { commodityId: 'cmdty_gas_hydrogen', qty: 20 });
  assert.equal(skim.paid(), 1300);
});

test('every job is posted at a real station, under its own title, behind a job that exists', async () => {
  const { SECTORS } = await import('../src/data/sectors.js');
  const stationIds = new Set(SECTORS.flatMap((sector) => (sector.stations || []).map((s) => s.id)));
  const ids = new Set(), titles = new Set();
  for (const row of WORKS_CONTRACTS) {
    assert.ok(stationIds.has(row.stationId), `${row.id} is posted at a station that exists`);
    assert.ok(!ids.has(row.id), `${row.id} is one job`); ids.add(row.id);
    assert.ok(!titles.has(row.title), `"${row.title}" names one job`); titles.add(row.title);
    assert.doesNotMatch(`${row.title} ${row.brief} ${row.summary}`, /[!\u2014]/, `${row.id} keeps the house voice`);
  }
  for (const row of WORKS_CONTRACTS) {
    for (const need of row.requires || []) assert.ok(ids.has(need), `${row.id} waits on a job that exists`);
  }
  assert.ok(new Set(WORKS_CONTRACTS.map((row) => row.stationId)).size >= 20, 'the jobs reach across the galaxy');
  // A station shows its Jobs door only when it keeps a desk. Every job sits on one, and the real
  // board of that station carries it once the jobs it builds on are done.
  const { hasContractsDesk } = await import('../src/data/missions.js');
  const stationById = new Map(SECTORS.flatMap((sector) => (sector.stations || []).map((s) => [s.id, s])));
  for (const row of WORKS_CONTRACTS) {
    assert.ok(hasContractsDesk(stationById.get(row.stationId).services), `${row.id}: ${row.stationId} has a job desk`);
    const h = harness(row.id);
    h.state.story.flags.worksContracts = Object.fromEntries((row.requires || []).map((need) => [need, 1]));
    h.host.ensureBoard(row.stationId);
    const slots = h.state.missions.boards[row.stationId]?.slots || [];
    assert.ok(slots.some((offer) => offer?.params?.works?.id === row.id), `${row.id} is on the ${row.stationId} board`);
  }
  // A rover job is only posted where the sector's belts really hold a rock that carries the ore.
  // The Bolus names an exotic field with no rocks in it; no job may lean on a belt like that.
  const sectorOf = new Map(SECTORS.flatMap((sector) => (sector.stations || []).map((s) => [s.id, sector])));
  assert.deepEqual(worksRockTypesFor('sector_the_bolus', 'cmdty_exotic_xenium'), []);
  for (const row of WORKS_CONTRACTS) {
    const sector = sectorOf.get(row.stationId);
    assert.ok((sector.fields || []).some((field) => field && field.count !== 0), `${row.id}: ${sector.id} has rocks to work`);
    if (row.goal.kind === 'cut') {
      assert.ok(worksRockTypesFor(sector.id, row.goal.ore).length > 0, `${row.id}: a rock in ${sector.id} carries the ore`);
    }
  }
});

// The two yard goals read the REAL site system: claims staked by installing machines through
// asteroidSites over a real generated rock, the way the bench and the contact-ring tests do it.
const YARD_POCKET = [[14, 2], [14, 0], [14, 1], [13, 2], [15, 2], [13, 1], [15, 1], [13, 3], [14, 3]];
async function yardHarness(id) {
  const { asteroidSites } = await import('../src/systems/asteroidSites.js');
  const { generateDrillField, tileIndex } = await import('../src/systems/drill.js');
  const { resolveBoreFamily } = await import('../src/systems/drillFieldModel.js');
  const box = { sites: null };
  const h = harness(id, { sites: new Proxy({}, { get: (_, key) => (typeof box.sites[key] === 'function' ? box.sites[key].bind(box.sites) : box.sites[key]) }) });
  const items = h.state.player.cargo.items;
  Object.assign(items, { cmdty_regocrete: 60, cmdty_control_unit: 12, cmdty_refined_metals: 20 });
  box.sites = Object.create(asteroidSites);
  box.sites.init({ state: h.state, bus: h.bus, helpers: {}, registry: { get: () => null } });
  const stake = (asteroidId, sectorId = h.offer.destSectorId) => {
    const here = h.state.world.currentSectorId;
    h.state.world.currentSectorId = sectorId;
    const ent = { id: asteroidId, type: 'asteroid', alive: true, pos: { x: 100 + asteroidId, z: 40 }, radius: 9,
      data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_1' } };
    h.state.entities.set(asteroidId, ent); h.state.entityList.push(ent);
    ent.data.boreFamily = resolveBoreFamily(ent.data);
    const field = generateDrillField(asteroidId, ent.data.boreFamily);
    for (const [c, r] of YARD_POCKET) field[c][r] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 };
    ent.data.drillCleared = YARD_POCKET.map(([c, r]) => tileIndex(c, r));
    h.state.drill = { active: true, asteroidId, field, avatar: { col: 14, row: 2 } };
    const bore = () => { h.state.drill = { active: true, asteroidId, field, avatar: { col: 14, row: 2 } }; };
    const anchor = () => {
      bore();
      h.state.world.currentSectorId = sectorId;
      const core = box.sites.installMachine({ asteroidId, defId: 'sm_massline_core', col: 14, row: 1 });
      assert.equal(core.ok, true, `core on rock ${asteroidId}: ${core.reason}`);
      h.state.world.currentSectorId = here;
      return core.siteId;
    };
    h.state.world.currentSectorId = here;
    return { ent, anchor };
  };
  const beat = () => { h.state.tick = (h.state.tick | 0) + 60; h.host.update(1 / 60, h.state); };
  return { ...h, sitesSys: box.sites, stake, beat };
}

test('a claims job counts real anchored claims in its sector, even after their rocks stream out', async () => {
  const h = await yardHarness('works_proteus_two_quiet_rocks');
  h.accept();
  const m = h.active();
  assert.equal(m.objectiveTarget, 2);
  assert.match(worksObjectiveLine(m), /Hold 0\/2 claims in this sector at once/);
  h.stake(9001).anchor();
  h.stake(9002, 'sector_helios_prime').anchor();
  h.beat();
  assert.equal(m.objectiveProgress, 1, 'a claim in another sector does not count');
  h.stake(9003);
  h.beat();
  assert.equal(m.objectiveProgress, 1, 'a rock nobody anchored does not count');
  // Fly away: the first rock leaves the streamed world. Its claim is still held.
  h.state.entities.delete(9001);
  h.state.entityList = h.state.entityList.filter((e) => e.id !== 9001);
  h.stake(9004).anchor();
  h.beat();
  assert.equal(m.status, 'completed');
  assert.equal(h.paid(), 3700);
});

test('a power job reads what one real claim runs on, shows the best so far, and stays cheap', async () => {
  const h = await yardHarness('works_phoebe_echo_forty_megawatts');
  h.accept();
  const m = h.active();
  const siteId = h.stake(9101).anchor();
  h.stake(9102).anchor();
  h.beat();
  assert.equal(m.status, 'active', 'two 12 MW cores are not one 40 MW claim');
  assert.match(worksObjectiveLine(m), /running on 40 MW \(best so far 12 MW\)/);
  // Reading a claim is the site system's full readout and costs milliseconds, so the job reads
  // only while the yard is changing: once a second for ten seconds after a build, then every 30.
  let reads = 0;
  const real = h.sitesSys.projection;
  h.sitesSys.projection = function counted(...args) { reads++; return real.apply(this, args); };
  const run = (ticks) => { for (let i = 0; i < ticks; i++) { h.state.tick++; h.host.update(1 / 60, h.state); } };
  run(600); reads = 0;                  // let the ten seconds after the two installs pass
  run(1700);
  assert.ok(reads <= 2, `a quiet yard is read once per 30 s per claim at most (${reads})`);
  // Power arriving over a tether from the second claim counts where it lands. The tether is a
  // yard change, so the job looks again within the second.
  h.state.sites.byId[siteId].sharedPowerInMw = 30;
  h.bus.emit('site:linkCreated', { fromSiteId: 'x', toSiteId: siteId, kind: 'power' });
  reads = 0;
  run(61);
  assert.ok(reads > 0, 'a yard change is read within a second');
  assert.equal(m.status, 'completed');
  assert.equal(h.paid(), 5200);
});

test('a standing job is posted again at the standing rate, and progress survives a save', () => {
  const h = harness('works_helios_first_cut');
  h.accept();
  h.bus.emit('drill:yield', { commodityId: 'cmdty_ore_iron', qty: 2, pos: { col: 3, row: 4 } });
  h.host.deserialize(JSON.parse(JSON.stringify(h.host.serialize())));
  const loaded = h.active();
  assert.equal(loaded.objectiveProgress, 2);
  assert.equal(loaded.params.works.goal.ore, 'cmdty_ore_iron');
  h.bus.emit('drill:yield', { commodityId: 'cmdty_ore_iron', qty: 2, pos: { col: 3, row: 4 } });
  assert.equal(h.paid(), 450);
  const again = worksOfferFor('works_helios_first_cut', h.state);
  assert.equal(again.reward_cr, Math.round(450 * WORKS_REPEAT_PAY / 10) * 10);
});
