// VERB-28 — the route follower's brake is seen and heard when it fires.
//
// `nav:routeBrake` is emitted once per leg approach (routeFollower.js, edge-guarded by the
// TRANSITING -> APPROACHING transition) and had zero consumers: the autopilot committed a
// braking burn with no paint and no sound. This file pins both halves of the answer —
// one authored bite through `audio._onRouteBrake`, deduped against the input-edge bite the
// autopilot's own `actions.brake` would otherwise stack on top — and one painted record
// through the actionVfx additional-recipe table, whose receipt carries `bestMode` as `kind`
// so a flipBurn handoff reads as a re-lit mains burn instead of a counter-thrust vent.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { routeFollower, ROUTE_EXECUTOR_STATUS } from '../src/systems/routeFollower.js';
import { buildAtlasIndex } from '../src/core/atlasIndex.js';
import { audio } from '../src/audio/audioSystem.js';
import { ActionVfx, ACTION_VFX_EVENTS } from '../src/render/actionVfx.js';
import {
  ADDITIONAL_ACTION_VFX_RECIPES,
  resolveAdditionalActionVfxReceipt,
} from '../src/render/vfx/actionEventRecipes.js';

const ATLAS = buildAtlasIndex();

function makeBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    of(name) {
      return events.filter((e) => e.name === name);
    },
    clear() {
      events.length = 0;
    },
  };
}

function findMultiHopSectorChain(minHops = 2) {
  const start = 'sector_helios_prime';
  const seen = new Set([start]);
  let frontier = [[start]];
  for (let depth = 0; depth < 6; depth++) {
    const next = [];
    for (const path of frontier) {
      const tail = path[path.length - 1];
      for (const neighbor of ATLAS.sectorNeighbors(tail)) {
        if (seen.has(neighbor)) continue;
        const extended = [...path, neighbor];
        if (extended.length - 1 >= minHops) return extended;
        seen.add(neighbor);
        next.push(extended);
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return null;
}

const CHAIN = findMultiHopSectorChain(2);

function routeFromChain(chain) {
  const legs = [];
  for (let i = 0; i < chain.length - 1; i++) {
    legs.push({ from: chain[i], to: chain[i + 1], fuel: 4, charge: 1, interdict: 0 });
  }
  return { legs, totalFuel: legs.length * 4, totalHops: legs.length };
}

function makeHarness() {
  const player = {
    id: 'player',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 8,
  };
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    tick: 0,
    playerId: 'player',
    entities: new Map([['player', player]]),
    nav: {
      route: routeFromChain(CHAIN),
      autoTravel: true,
      waypoint: null,
      autopilot: { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' },
    },
    world: { currentSectorId: CHAIN[0] },
  };
  const bus = makeBus();
  const sys = Object.create(routeFollower);
  sys.init({ state, bus, atlas: ATLAS });
  return { state, bus, sys, player };
}

/** Drive an engaged route to its terminal handoff and return the emitted cue. */
function driveToBrake(h) {
  h.sys.engage({});
  const leg = h.state.nav.executor.legs[0];
  h.player.pos.x = leg.target.x - 60000;
  h.player.pos.z = leg.target.z;
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.executor.status, ROUTE_EXECUTOR_STATUS.TRANSITING);
  h.player.pos.x = leg.target.x - 200;
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.executor.status, ROUTE_EXECUTOR_STATUS.APPROACHING);
  return h.bus.of('nav:routeBrake');
}

function audioHost(played) {
  const host = Object.create(audio);
  host.rt = {};
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  return host;
}

test('seed 4242: the terminal handoff emits nav:routeBrake exactly once per leg', () => {
  const h = makeHarness();
  const cues = driveToBrake(h);
  assert.equal(cues.length, 1, 'one brake cue at the handoff');
  const p = cues[0].payload;
  assert.ok(['direct', 'flipBurn', 'stopped'].includes(p.bestMode), 'bestMode is the computed solution mode');
  assert.equal(p.bestMode, h.state.nav.executor.brakeMode, 'the cue carries the executor brake mode');
  assert.ok(Number.isFinite(p.rangeWU) && Number.isFinite(p.distanceWU), 'the cue carries the ranges it was decided on');
  h.sys.update(1 / 60, h.state);
  assert.equal(h.bus.of('nav:routeBrake').length, 1, 'a held approach never re-fires');
});

test('seed 4242: the handoff plays one brake bite and absorbs the input-edge double', () => {
  const h = makeHarness();
  const played = [];
  const host = audioHost(played);
  h.bus.on('nav:routeBrake', (p) => host._onRouteBrake(p));
  driveToBrake(h);
  assert.deepEqual(played, [{ recipeId: 'sfx_brake_bite', opts: { gain: 0.7 } }], 'one authored bite');
  assert.equal(host.rt._brakeWasHeld, true, 'the emit pre-marks the edge the autopilot is about to raise');
  host._onRouteBrake(h.bus.of('nav:routeBrake')[0].payload);
  assert.equal(played.length, 1, 'a replayed emit does not bite twice');
});

test('a brake already held sounds nothing new, and a released flag stays free to bite', () => {
  const played = [];
  const host = audioHost(played);
  host.rt._brakeWasHeld = true;
  host._onRouteBrake({ legIndex: 0, bestMode: 'direct', rangeWU: 100, distanceWU: 90 });
  assert.equal(played.length, 0, 'the input-edge bite already sounded — no stack');
  host.rt._brakeWasHeld = false;
  host._onRouteBrake({ legIndex: 0, bestMode: 'direct', rangeWU: 100, distanceWU: 90 });
  assert.equal(played.length, 1, 'a later handoff still gets its cue');
});

test('seed 4242: the receipt paints one surface record on the player hull, mode-selecting the variant', () => {
  const h = makeHarness();
  const cue = driveToBrake(h)[0];
  const resolved = resolveAdditionalActionVfxReceipt('nav:routeBrake', cue.payload, h.state);
  assert.ok(resolved, 'the receipt resolves');
  assert.equal(resolved.targetId, 'player');
  assert.equal(resolved.attachToTarget, true, 'the record rides the running hull');
  assert.equal(resolved.kind, cue.payload.bestMode, 'bestMode selects the variant');

  const recipe = ADDITIONAL_ACTION_VFX_RECIPES['nav:routeBrake'];
  assert.ok(recipe, 'recipe row exists');
  assert.equal(recipe.variants.flipBurn.verb, 'ignition', 'a flip-and-burn reads as a re-lit mains burn');
  assert.ok(ACTION_VFX_EVENTS.includes('nav:routeBrake'), 'vfx.js auto-subscribes the row');

  const out = new ActionVfx(new THREE.Scene());
  try {
    h.bus.on('nav:routeBrake', (p) => out.emit('nav:routeBrake', p, h.state));
    const h2 = makeHarness();
    h2.bus.on('nav:routeBrake', (p) => out.emit('nav:routeBrake', p, h2.state));
    driveToBrake(h2);
    const live = out.slots.filter((s) => s.alive && s.event === 'nav:routeBrake');
    assert.equal(live.length, 1, 'exactly one painted record');
    assert.equal(live[0].id, 'player');
  } finally { out.dispose(); }
});

test('a flipBurn payload paints the ignition variant, and no player fabricates nothing', () => {
  const state = {
    simTime: 0,
    playerId: 'player',
    entities: new Map([['player', { id: 'player', alive: true, pos: { x: 5, z: 5 }, rot: 0, radius: 8 }]]),
  };
  const flip = resolveAdditionalActionVfxReceipt('nav:routeBrake', { bestMode: 'flipBurn' }, state);
  assert.equal(flip.kind, 'flipBurn');

  const out = new ActionVfx(new THREE.Scene());
  try {
    assert.equal(out.emit('nav:routeBrake', { bestMode: 'flipBurn' }, state), true);
    const live = out.slots.filter((s) => s.alive && s.event === 'nav:routeBrake');
    assert.equal(live.length, 1);
    assert.equal(live[0].kind, 'flipBurn', 'the slot keeps the authored mode');
    state.entities.get('player').alive = false;
    assert.equal(out.emit('nav:routeBrake', { bestMode: 'direct' }, state), false, 'a dead player paints nothing');
    state.entities.clear();
    assert.equal(out.emit('nav:routeBrake', { bestMode: 'direct' }, state), false, 'no ship paints nothing');
  } finally { out.dispose(); }
});
