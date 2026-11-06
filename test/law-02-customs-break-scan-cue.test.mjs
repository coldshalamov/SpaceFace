// LAW-02 — breaking a customs scan has the flight cue its seam was authored for. The customs
// deck emitted `customs:breakScan` into a void (zero consumers in EVENT_ROUTING): clicking
// BREAK RANGE produced nothing on screen. One recipe row now answers the receipt on the
// player hull — a drive flare, not the scan's induction paint — and the deck emits the
// scanner's identity with it. The seam never adds heat, a banner, or a second fine.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { ActionVfx } from '../src/render/actionVfx.js';
import {
  ADDITIONAL_ACTION_VFX_RECIPES,
  resolveAdditionalActionVfxReceipt,
} from '../src/render/vfx/actionEventRecipes.js';
import { ENCOUNTER_SCRIPTS } from '../src/systems/encounterScripts.js';

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function makeState() {
  const player = { id: 'player', alive: true, pos: { x: 10, z: -4 }, vel: { x: 3, z: 1 }, rot: 0.4, radius: 7 };
  return {
    meta: { seed: 4242 },
    simTime: 50,
    tick: 100,
    mode: 'flight',
    playerId: 'player',
    player: { credits: 5000 },
    ui: {},
    entities: new Map([['player', player]]),
  };
}

test('the break-scan receipt has an authored recipe that lands on the player hull', () => {
  const recipe = ADDITIONAL_ACTION_VFX_RECIPES['customs:breakScan'];
  assert.ok(recipe, 'recipe row exists');
  assert.equal(recipe.verb, 'ignition', 'a drive flare answers breaking the scan');
  assert.equal(recipe.continuous, false, 'one pulse, not a sustained effect');
  const state = makeState();
  const resolved = resolveAdditionalActionVfxReceipt('customs:breakScan', { factionId: 'faction_scn' }, state);
  assert.ok(resolved, 'receipt resolves');
  assert.equal(resolved.targetId, 'player');
  assert.equal(resolved.sourceId, 'player');
  assert.equal(resolved.attachToTarget, true, 'the record rides the running hull');
  assert.equal(resolved.bodySurface, true);
});

test('a dead or missing player fabricates no record', () => {
  const state = makeState();
  state.entities.get('player').alive = false;
  assert.equal(resolveAdditionalActionVfxReceipt('customs:breakScan', {}, state), null);
  state.entities.get('player').alive = true;
  state.entities.get('player').pos = { x: NaN, z: 0 };
  assert.equal(resolveAdditionalActionVfxReceipt('customs:breakScan', {}, state), null);
  const out = new ActionVfx(new THREE.Scene());
  try {
    assert.equal(out.emit('customs:breakScan', { factionId: 'faction_scn' }, state), false);
  } finally { out.dispose(); }
});

test('the real patrol pre-scan run choice produces one live recipe record on the hull', () => {
  const state = makeState();
  const bus = makeBus();
  const out = new ActionVfx(new THREE.Scene());
  const player = state.entities.get('player');
  const leader = { id: 'patrol-3', pos: { x: 30, z: -4 } };
  const live = { id: 'scan:1', phase: 'offer', factionId: 'faction_scn', vars: {}, data: { stationId: 'station_helios' } };
  const d = {
    player: () => player,
    entsOf: () => [leader],
    emit: (event, payload) => bus.emit(event, payload),
    rep() {},
    say() {},
    despawnAll() {},
    resolve() {},
  };
  try {
    bus.on('customs:breakScan', (p) => out.emit('customs:breakScan', p, state));
    ENCOUNTER_SCRIPTS.patrolScan.choose(d, live, state, 'run');
    const breaks = bus.emitLog.filter((e) => e.evt === 'customs:breakScan');
    assert.equal(breaks.length, 1, 'one break-scan intent');
    assert.equal(breaks[0].payload.patrolId, 'patrol-3', 'the scanner identity travels with the break');
    const records = out.slots.filter((s) => s.alive && s.event === 'customs:breakScan');
    assert.equal(records.length, 1, 'exactly one recipe record on the player hull');
    assert.equal(records[0].id, 'player');
    assert.equal(records[0].attached, true);
    out.update(state);
    assert.ok(out.mesh.count > 0, 'the batch drew the flare');
    // One record, not a stream: the 0.14 s coalesce refuses an immediate double.
    assert.equal(out.emit('customs:breakScan', breaks[0].payload, state), false, 'repeat inside the window coalesces');
  } finally {
    out.dispose();
  }
});

test('breaking the scan adds no heat, banner, or second penalty path', () => {
  const state = makeState();
  const bus = makeBus();
  const live = { id: 'scan:2', phase: 'offer', factionId: 'faction_scn', vars: {}, data: {} };
  const d = {
    player: () => state.entities.get('player'),
    entsOf: () => [{ id: 'patrol-4' }],
    emit: (event, payload) => bus.emit(event, payload),
    rep() {}, say() {}, despawnAll() {}, resolve() {},
  };
  ENCOUNTER_SCRIPTS.patrolScan.choose(d, live, state, 'run');
  const forbidden = bus.emitLog.filter((e) => (
    e.evt === 'heat:changed' || e.evt === 'toast' || e.evt === 'contraband:scanned'
    || e.evt === 'economy:chargeCredits' || e.evt === 'faction:repDelta'
  ));
  assert.deepEqual(forbidden, [], 'no heat bump, banner, charge, or second penalty path');
  assert.equal(state.player.credits, 5000);
});
