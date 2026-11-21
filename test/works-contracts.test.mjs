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
