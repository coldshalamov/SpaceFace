import test from 'node:test';
import assert from 'node:assert/strict';
import { mining } from '../src/systems/mining.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { asteroidSites, makeSiteRecord } from '../src/systems/asteroidSites.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { COMMODITIES } from '../src/data/commodities.js';

test('B093: a refused freight spill stays in the physical pod and can be retried', () => {
  const events = [];
  const pickups = [];
  let admitted = 1;
  const sys = Object.create(mining);
  sys.state = { simTime: 12, rng: () => 0.5 };
  sys.helpers = { spawnEntity(spec) {
    if (admitted-- <= 0) return null;
    const entity = { id: pickups.length + 100, alive: true, ...spec };
    pickups.push(entity);
    return entity;
  } };
  sys.bus = { emit: (event, payload) => events.push({ event, payload }) };
  sys._stopBeam = () => {};
  sys._syncWorldSiteRemainingPool = () => {};
  const pod = { id: 40, alive: true, radius: 8, pos: { x: 2, z: 3 },
    data: { commodityId: 'cmdty_scrap_metal', amount: 8, salvagePool: { cmdty_scrap_metal: 8 } } };
  sys._splitCargoPod({ id: 1 }, pod);
  const loose = () => pickups.reduce((sum, entity) => sum + entity.data.amount, 0);
  assert.equal(loose(), 3);
  assert.equal(pod.alive, true, 'unspawned freight retains its real source');
  assert.deepEqual(pod.data.salvagePool, { cmdty_scrap_metal: 5 });
  assert.equal(events.filter(row => row.event === 'mining:podSplit')[0].payload.qty, 3,
    'split receipt describes the physical spill, not the requested load');
  admitted = 10;
  sys._splitCargoPod({ id: 1 }, pod);
  assert.equal(loose(), 8);
  assert.equal(pod.alive, false);
  assert.deepEqual(pod.data.salvagePool, {});
  sys._splitCargoPod({ id: 1 }, pod);
  assert.equal(loose(), 8, 'terminal retry cannot mint freight');
});

test('B094: scans preserve ordinary and exhausted aftermath salvage custody in place', () => {
  const state = { simTime: 5, entities: new Map(), player: {} };
  const sys = Object.create(salvageActions);
  sys.init({ state, bus: { on() {}, emit() {} }, registry: { get: () => null } });
  const pool = { cmdty_scrap_metal: 1 };
  const wreck = { id: 4, type: 'wreck', alive: true, data: { parentType: 'ship', salvagePool: pool } };
  state.entities.set(wreck.id, wreck);
  sys._onScanCompleted({ targetId: wreck.id });
  assert.equal(wreck.data.salvagePool, pool);
  assert.deepEqual(pool, { cmdty_scrap_metal: 1 });
  delete pool.cmdty_scrap_metal;
  wreck.data.markerId = 'aftermath:worked';
  sys._onScanCompleted({ targetId: wreck.id });
  assert.equal(wreck.data.salvagePool, pool, 'persistent marker still owns the same pool');
  assert.deepEqual(pool, {}, 'rescan never replenishes an exhausted wreck');
});

test('B094: legality annotation cannot mint classified stock on a worked military wreck', () => {
  const state = { simTime: 5, entities: new Map(), player: {} };
  const sys = Object.create(salvageActions);
  sys.init({ state, bus: { on() {}, emit() {} }, registry: { get: () => null } });
  const pool = { cmdty_scrap_metal: 2 };
  const wreck = { id: 4, type: 'wreck', alive: true,
    data: { parentType: 'military', salvagePool: pool } };
  state.entities.set(wreck.id, wreck);
  sys._onScanCompleted({ targetId: wreck.id });
  assert.deepEqual(pool, { cmdty_scrap_metal: 2 }, 'a previously worked classified lot cannot regenerate');
  delete pool.cmdty_scrap_metal;
  sys._onScanCompleted({ targetId: wreck.id });
  assert.equal(wreck.data.salvagePool, pool);
  assert.deepEqual(pool, {}, 'an exhausted restricted wreck remains exhausted');
  pool.cmdty_salvage_electronics = 3;
  sys._onScanCompleted({ targetId: wreck.id });
  assert.deepEqual(pool, { cmdty_classified_salvage: 3 }, 'actual remaining electronics still receive their legality remap');
});

test('B096: dismantling refuses a full refund hold, then recovers the unit exactly once', () => {
  const events = [];
  const sys = Object.create(asteroidSites);
  const site = makeSiteRecord({ id: 'site_test', asteroidId: 4, sectorId: 'sector_test', createdT: 0 });
  site.machines.push({ id: 'm1', defId: 'sm_extractor', col: 2, row: 2 });
  const cargo = { items: {}, usedVolume: 20, capVolume: 20, usedMass: 0 };
  sys.state = { player: { cargo }, content: { commodities: COMMODITIES } };
  sys.bus = { emit: (event, payload) => events.push({ event, payload }) };
  sys.getSite = () => site;
  sys.previewMachineRemoval = () => ({ spilledTotal: 0, spilled: [] });
  sys._markDirty = () => {};
  sys._rt = new Map();
  sys._ledger = () => {};
  assert.equal(sys.removeMachine(site.id, 'm1').ok, false);
  assert.equal(site.machines.length, 1, 'full hold must not destroy the machine or refund');
  cargo.capVolume = 21.1;
  assert.equal(sys.removeMachine(site.id, 'm1').ok, false, 'one volume unit cannot hold a 1.2-volume control unit');
  assert.equal(site.machines.length, 1);
  assert.equal(cargo.items.cmdty_control_unit, undefined);
  sys.state.content.commodities = { cmdty_control_unit: { id: 'cmdty_control_unit', volPerU: 3, massPerU: 2 } };
  cargo.capVolume = 22;
  assert.equal(sys.removeMachine(site.id, 'm1').ok, false,
    'preflight must use the same active commodity footprint as canonical cargo admission');
  assert.equal(site.machines.length, 1);
  assert.equal(cargo.items.cmdty_control_unit, undefined);
  cargo.capVolume = 40;
  assert.equal(sys.removeMachine(site.id, 'm1').ok, true);
  assert.equal(cargo.items.cmdty_control_unit, 1);
  assert.equal(site.machines.length, 0);
  assert.equal(sys.removeMachine(site.id, 'm1').ok, false);
  assert.equal(cargo.items.cmdty_control_unit, 1);
  assert.equal(events.filter(row => row.event === 'site:machineRemoved').length, 1);
});

test('B098: a salvor waits for its booked workpiece rather than substituting unrelated salvage', () => {
  const sys = Object.create(npcJobsRuntime);
  const target = { id: 20, type: 'wreck', alive: true, mass: 40, pos: { x: 600, z: 0 },
    data: { sectorId: 'sector_test', salvagePool: { cmdty_scrap_metal: 2 } } };
  const substitute = { ...target, id: 21, pos: { x: 10, z: 0 }, data: { ...target.data } };
  sys.state = { entities: new Map([[target.id, target], [substitute.id, substitute]]) };
  sys._findNearestOccupationalTarget = () => substitute;
  const entry = { sectorId: 'sector_test', job: { payload: { targetId: target.id } } };
  const cutter = { id: 1, pos: { x: 0, z: 0 }, data: { worldRecordId: 'cutter' } };
  assert.equal(sys._findSalvorTractorTarget(entry, cutter), null);
  target.pos.x = 30;
  assert.equal(sys._findSalvorTractorTarget(entry, cutter), target);
  target.alive = false;
  assert.equal(sys._findSalvorTractorTarget(entry, cutter), null);
  const recycled = { ...substitute, id: target.id, data: { ...substitute.data } };
  sys.state.entities.set(target.id, recycled);
  assert.equal(sys._findSalvorTractorTarget(entry, cutter), null,
    'recycling the booked id cannot substitute another workpiece');
  entry.job.payload = {};
  assert.equal(sys._findSalvorTractorTarget(entry, cutter), substitute, 'an unbooked salvor may pick work');
});
