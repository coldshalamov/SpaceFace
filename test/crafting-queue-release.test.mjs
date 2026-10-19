// The fabrication line owns only timed work: a committed run can be scrapped off the line
// (its materials stay forfeit — build()'s up-front rule), and an instant refine is never
// queued behind a timed job. Covers crafting.cancel() and the Industry screen's verbs.
import test from 'node:test';
import assert from 'node:assert/strict';

import { crafting } from '../src/systems/crafting.js';
import { addCargo } from '../src/systems/cargo.js';
import { createBus } from '../src/core/eventBus.js';
import { createIndustryScreen, attemptIndustryScrap } from '../src/ui/station/screens/industry.js';
import { fakeDom } from './helpers/fake-dom.mjs';

const STATION = 'station_ceres';

function sellableQty(state, id) {
  const items = (state && state.player && state.player.cargo && state.player.cargo.items) || {};
  return Number(items[id]) || 0;
}

function boot(cargoItems = {}) {
  const events = [];
  const state = {
    player: {
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 400, capMass: 400 },
      researchedNodes: ['tech_bulk_logistics'],
      moduleInventory: [],
      ownedShips: [],
    },
    crafting: { queues: {} },
    ui: { docked: true, dockedStationId: STATION },
    simTime: 0,
  };
  let instanceSeq = 0;
  const inst = Object.create(crafting);
  inst.init({
    state,
    bus: {
      emit(name, payload) { events.push({ name, ...(payload && typeof payload === 'object' ? payload : {}) }); },
      on() {}, off() {},
    },
    registry: { get: (n) => (n === 'ships' ? { nextInstanceId: () => `inst-${++instanceSeq}` } : null) },
  });
  for (const [id, qty] of Object.entries(cargoItems)) addCargo(state, id, qty);
  return { state, inst, events };
}

// A timed assemble run: 3 hull plate + 2 polymers, ~20 s on the line.
const TIMED = 'bp_build_cargopod_m';
const TIMED_INPUTS = { cmdty_comp_hullplate: 3, cmdty_polymers: 2 };

test('a committed run scraps off the line — slot freed, materials stay forfeit, no product lands', () => {
  const { state, inst, events } = boot(TIMED_INPUTS);
  assert.equal(inst.build(TIMED, STATION), true, 'the timed build commits');
  assert.equal(sellableQty(state, 'cmdty_comp_hullplate'), 0, 'inputs were consumed up front');
  assert.equal(inst.isBusy(STATION), true);

  assert.equal(inst.cancel(STATION), true);
  assert.equal(inst.isBusy(STATION), false, 'the slot reads free');
  assert.equal(inst.progress(STATION), 0);
  assert.equal(state.player.moduleInventory.length, 0, 'no product was granted');
  assert.equal(sellableQty(state, 'cmdty_comp_hullplate'), 0, 'committed inputs are not returned');

  const cancelled = events.filter((e) => e.name === 'craft:cancelled');
  assert.deepEqual(cancelled, [{ name: 'craft:cancelled', bpId: TIMED, stationId: STATION }]);
  const queueOff = events.filter((e) => e.name === 'craft:queueChanged' && e.active === false);
  assert.equal(queueOff.length, 1);
  assert.ok(events.some((e) => e.name === 'toast' && /scrapped/i.test(e.text) && /not returned/i.test(e.text)),
    'the scrap receipt names the forfeit');
});

test('a scrapped job cannot complete later — update never resurrects it', () => {
  const { state, inst, events } = boot(TIMED_INPUTS);
  inst.build(TIMED, STATION);
  inst.update(10, state); // half the run
  assert.equal(inst.cancel(STATION), true);
  const grantsBefore = events.filter((e) => e.name === 'craft:complete').length;
  inst.update(999, state);
  inst.update(999, state);
  assert.equal(events.filter((e) => e.name === 'craft:complete').length, grantsBefore);
  assert.equal(state.player.moduleInventory.length, 0);
});

test('cancel only answers a live job at the named station', () => {
  const { inst } = boot(TIMED_INPUTS);
  assert.equal(inst.cancel(STATION), false, 'an idle line has nothing to scrap');
  inst.build(TIMED, STATION);
  assert.equal(inst.cancel('station_elsewhere'), false, 'another station cannot scrap this run');
  assert.equal(inst.isBusy(STATION), true, 'the job survives a foreign scrap attempt');
});

test('the freed slot runs again immediately after a scrap', () => {
  const { state, inst } = boot(TIMED_INPUTS);
  inst.build(TIMED, STATION);
  inst.cancel(STATION);
  addCargo(state, 'cmdty_comp_hullplate', 3);
  addCargo(state, 'cmdty_polymers', 2);
  assert.equal(inst.build(TIMED, STATION), true, 'the line accepts a fresh commit');
  inst.update(25, state);
  assert.equal(state.player.moduleInventory.length, 1, 'the rebuilt run delivers its module');
});

test('a run parked at completion over a full hold scraps the same way — nothing unloads', () => {
  const { state, inst, events } = boot();
  addCargo(state, 'cmdty_silicate', 2);
  state.player.cargo.capVolume = 2; // the hold cannot take the refine output
  state.crafting.queues[STATION] = {
    bpId: 'bp_refine_metals', elapsed: 1, total: 1, done: false, stationId: STATION,
  };
  inst.update(0.1, state); // parks: elapsed pinned at total, waiting on hold space
  assert.ok(state.crafting.queues[STATION], 'the stalled run still owns the line');
  assert.equal(inst.cancel(STATION), true);
  assert.equal(state.crafting.queues[STATION], null, 'the parked run releases the line');
  assert.equal(state.player.cargo.items.cmdty_refined_metals, undefined, 'the finished goods are abandoned with it');
  assert.equal(events.filter((e) => e.name === 'craft:cancelled').length, 1);
});

test('an instant refine never queues behind timed work — the busy gate only holds timed jobs', () => {
  const { state, inst } = boot({ ...TIMED_INPUTS, cmdty_crystal_silica: 2, cmdty_ore_copper: 2 });
  inst.build(TIMED, STATION);
  assert.equal(inst.isBusy(STATION), true);
  // Etch Microchips is a fab-side instant run (timeS 0): the line does not own it.
  assert.equal(inst.build('bp_refine_microchips', STATION), true, 'instant work still runs');
  assert.equal(state.player.cargo.items.cmdty_microchips, 1);
  assert.equal(inst.isBusy(STATION), true, 'the timed run keeps its slot');
});

// ---- screen: the verbs the stage draws while the line runs ---------------------------------

function screenHarness(t, ctx) {
  const doc = fakeDom();
  doc.documentElement = doc._make('html');
  doc.documentElement.classList.add('sf-reduce-motion');
  const root = doc._make('div');
  const list = doc._make('div');
  const stage = doc._make('div');
  const marker = doc._make('i');
  const key = doc._make('button');
  const ring = doc._make('span');
  root.querySelector = (s) => (s === '.sx-ind__list' ? list : s === '.sx-ind__stage' ? stage : null);
  list.querySelector = (s) => (s === ':scope > .orr-extent' ? marker : null);
  key.querySelector = (s) => (s === '.dp-holdring' ? ring : null);
  key.closest = (s) => (s.includes('.sx-fab-build') || s === '[data-build]' ? key : null);
  stage.querySelector = (s) => (s.startsWith('.sx-fab-build') && !key.disabled ? key : null);
  let lastStageHtml = '';
  Object.defineProperty(stage, 'innerHTML', {
    set(html) {
      lastStageHtml = html;
      const button = html.match(/<button[^>]+data-build="([^"]+)"[^>]*>/);
      key.disabled = !button || /\sdisabled(?:\s|>)/.test(button[0]);
      if (button) key.setAttribute('data-build', button[1]);
    },
    get() { return lastStageHtml; },
  });
  doc.createElement = () => root;
  const names = ['document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'];
  const previous = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let screen;
  t.after(() => {
    screen?.dispose();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 10_000 } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: undefined });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value() {} });
  Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: () => 0 });
  Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value() {} });
  screen = createIndustryScreen(ctx);
  screen.onShow();
  return {
    screen, stage, list, key,
    get stageHtml() { return lastStageHtml; },
    pickRow(bpId) {
      for (const listener of list.listeners.click || []) {
        listener({ target: { closest: (s) => (s === '[data-bp]' ? { getAttribute: () => bpId } : null) } });
      }
    },
    clickScrap() {
      const scrapNode = { getAttribute: () => '1' };
      for (const listener of stage.listeners.click || []) {
        listener({ target: { closest: (s) => (s === '[data-ind-scrap]' ? scrapNode : null) } });
      }
    },
  };
}

function screenCtx(cargoItems, queueJob, craftingOverride = {}) {
  const state = {
    player: {
      researchedNodes: ['tech_bulk_logistics'],
      moduleInventory: [],
      ownedShips: [],
      cargo: { items: { ...cargoItems }, usedVolume: 0, usedMass: 0, capVolume: 400, capMass: 400 },
    },
    ui: { docked: true, dockedStationId: STATION },
    crafting: { queues: queueJob ? { [STATION]: queueJob } : {} },
    simTime: 0,
  };
  const bus = createBus();
  const emitted = [];
  bus.on('audio:cue', (p) => emitted.push({ name: 'audio:cue', ...p }));
  bus.on('toast', (p) => emitted.push({ name: 'toast', ...p }));
  return {
    state,
    station: { type: 'fab' },
    crafting: { build: () => true, cancel: () => false, ...craftingOverride },
    bus,
    emitted,
  };
}

const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

test('Industry: a running line offers Scrap run, and instant rungs stay fabricable beside it', async (t) => {
  const ctx = screenCtx(
    { cmdty_crystal_silica: 4, cmdty_ore_copper: 4, cmdty_comp_hullplate: 6, cmdty_polymers: 4 },
    { bpId: 'bp_ship_pelican', elapsed: 30, total: 120, done: false, stationId: STATION },
  );
  const h = screenHarness(t, ctx);
  // First-open selection lands on the first ready/materials rung — Etch Microchips is an
  // instant fab refine, so the hold key stays live even though the line is occupied.
  assert.match(h.stageHtml, /data-ind-scrap="1"/, 'the scrap verb stands while the line runs');
  assert.match(h.stageHtml, /data-station-control="scrap-run"/);
  assert.match(h.stageHtml, /Scrap run/);
  assert.match(h.stageHtml, /Instant processes are not queued/, 'the status says why this rung is still live');
  const buildButton = h.stageHtml.match(/<button[^>]+data-build="bp_refine_microchips"[^>]*>/);
  assert.ok(buildButton, 'the instant rung is the selected run');
  assert.ok(!/\sdisabled(?:\s|>)/.test(buildButton[0]), 'instant work is not held by the timed line');

  // A ready TIMED rung still reads the line honestly.
  h.pickRow('bp_build_cargopod_m');
  const timed = h.stageHtml.match(/<button[^>]+data-build="bp_build_cargopod_m"[^>]*>/);
  assert.ok(timed);
  assert.ok(/\sdisabled(?:\s|>)/.test(timed[0]), 'timed work waits on the occupied line');
  assert.match(h.stageHtml, /Line occupied/);
  assert.match(h.stageHtml, /data-ind-scrap="1"/, 'the scrap verb stands on every rung while the line runs');

  // The scrap verb commits through the crafting owner and the repaint drops it with the job.
  let cancelledAt = null;
  ctx.crafting.cancel = (sid) => { cancelledAt = sid; ctx.state.crafting.queues[sid] = null; return true; };
  h.clickScrap();
  await flush();
  assert.equal(cancelledAt, STATION, 'the scrap names the docked station line');
  assert.ok(!/data-ind-scrap/.test(h.stageHtml), 'the verb leaves with the job');
  assert.ok(ctx.emitted.some((e) => e.name === 'audio:cue' && e.id === 'ui_accept'), 'the scrap plays its accept cue');
});

test('Industry: an idle line draws no scrap verb', (t) => {
  const ctx = screenCtx({ cmdty_crystal_silica: 4, cmdty_ore_copper: 4 }, null);
  const h = screenHarness(t, ctx);
  assert.ok(!/data-ind-scrap/.test(h.stageHtml));
  assert.ok(!/Line occupied/.test(h.stageHtml));
});

test('attemptIndustryScrap resolves the worker ack shape and survives a rejecting lane', async () => {
  assert.equal(await attemptIndustryScrap({ crafting: { cancel: (sid) => Promise.resolve(sid === STATION) }, stationId: STATION }), true);
  assert.equal(await attemptIndustryScrap({ crafting: { cancel: () => Promise.reject(new Error('worker retired')) }, stationId: STATION }), false);
  assert.equal(attemptIndustryScrap({ crafting: { build: () => true }, stationId: STATION }), false,
    'a facade without cancel answers false instead of throwing');
});
