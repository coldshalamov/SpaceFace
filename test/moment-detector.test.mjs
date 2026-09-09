// test/moment-detector.test.mjs — The moment detector (PQ-146.03).
//
// Done when (this lane):
//   Headless 60s proof on a fixed seed: >= 3 distinct moment events,
//   0 on an ordinary-traffic control tape. Event is on the bus with a
//   stable name (`moment:holyShit`).
//
// The chain under proof is physics receipts -> stunt:trickDetected ->
// moment:holyShit. Detection never reads button presses; ordinary traffic
// produces no tricks, so it can never produce a moment.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { snapshotFeatureMaps, restoreFeatureMaps, MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import {
  bulletTime,
  MOMENT_EVENT,
  MOMENT_THRESHOLD,
  MOMENT_SLOWMO_SCALE,
  rateMoment,
} from '../src/systems/bulletTime.js';

const SEED = 47;
const DT = 1 / 60;
const PROOF_TICKS = 3600; // 60 s @ 60 Hz

function boot() {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.bulletTime = true;
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.playerId = 'player';
  state.input.actions = {};
  const bus = createBus();
  const timeEffects = createTimeEffects(state);
  const stuntSys = Object.create(stuntGrammar);
  stuntSys.init({ bus, state });
  const bulletSys = Object.create(bulletTime);
  bulletSys.init({ state, bus, timeEffects, helpers: {} });
  const seen = { tricks: [], moments: [], cues: [] };
  bus.on('stunt:trickDetected', (t) => seen.tricks.push(t));
  bus.on(MOMENT_EVENT, (m) => seen.moments.push(m));
  bus.on('audio:cue', (c) => seen.cues.push(c));
  return { state, bus, timeEffects, stuntSys, bulletSys, seen, snap };
}

function shutdown(h) {
  h.bulletSys.destroy?.();
  h.stuntSys.destroy?.();
  h.bus.clear();
  restoreFeatureMaps(h.snap);
}

// Ordinary traffic: gentle bumps, cruising passes, messy unlatches, NPC-NPC
// brushes. Mirrors the stunt-taxonomy false-positive tape. Must yield nothing.
function ordinaryAt(tick) {
  const out = [];
  if (tick % 200 === 0) {
    out.push(['combat:collisionConsequence', {
      tick, targetId: 'player', otherId: `asteroid_dock_${tick}`, surface: 'terrain',
      deltaV: 1.5 + (tick % 3), exchangedMomentum: 40 + (tick % 20),
      provenance: { actorId: 'player', tag: 'direct_contact' },
    }]);
  }
  if (tick % 240 === 0) {
    out.push(['flight:nearMiss', {
      tick, actorId: 'player', obstacleId: `rock_${tick}`, speed: 18 + (tick % 5), clearance: 12,
    }]);
  }
  if (tick % 300 === 150) {
    out.push(['tether:releaseRated', {
      tick, sourceId: 'player', targetId: `cargo_pallet_${tick}`, classification: 'messy',
      releaseScore: 0.22, angularSpeed: 0.1, tangentialSpeed: 4,
    }]);
  }
  if (tick % 400 === 200) {
    out.push(['combat:collisionConsequence', {
      tick, targetId: `traffic_freighter_${tick}`, otherId: `traffic_miner_${tick}`,
      surface: 'craft', deltaV: 0.8, exchangedMomentum: 50,
      provenance: { actorId: null, tag: 'environment' },
    }]);
  }
  return out;
}

// Proof beats: five stunt compositions spread across the 60 s window.
function proofAt(tick) {
  switch (tick) {
    case 300:
      return [['tether:releaseRated', {
        tick, sourceId: 'player', targetId: 'rock_A', classification: 'razor',
        releaseScore: 0.92, angularSpeed: 4.5, tangentialSpeed: 42,
      }]];
    case 310:
      return [['tether:whipImpact', {
        tick, sourceId: 'player', targetId: 'rock_A', victimId: 'pirate_corvette',
        relSpeed: 58, mass: 45, momentum: 2610,
      }]];
    case 720:
      return [['massline:clothesline', {
        tick, sourceId: 'player', victimId: 'scout_interceptor', anchorId: 'buoy_station', deltaV: 34,
      }]];
    case 1200:
      return [['combat:hitstunImpulse', {
        tick, actorId: 'player', victimId: 'raider_wasp', weaponId: 'hornet_concussion',
        tag: 'weapon_shove', deltaV: 25,
      }]];
    case 1225:
      return [['combat:collisionConsequence', {
        tick, targetId: 'raider_wasp', otherId: 'asteroid_titan_04', surface: 'terrain',
        deltaV: 28, exchangedMomentum: 1000, provenance: { actorId: 'player', tag: 'weapon_shove' },
      }]];
    case 1800:
      return [['well:fling', {
        tick, actorId: 'player', wellId: 'singularity_vortex_1', targetId: 'propelled_rock',
      }]];
    case 1830:
      return [['combat:collisionConsequence', {
        tick, targetId: 'hostile_frigate', otherId: 'propelled_rock', surface: 'craft',
        deltaV: 35, exchangedMomentum: 2100, provenance: { actorId: 'player' },
      }]];
    case 2400:
      return [['tether:attached', {
        tick, sourceId: 'player', targetId: 'heavy_ore_pod', isTow: true, relSpeed: 22,
      }]];
    case 2430:
      return [['entity:killed', {
        tick, id: 'pursuer_scout', killerId: 'player', cause: 'ship_collision',
      }]];
    case 3000:
      // Fast clean pass: a real trick, but a common one — never a moment.
      return [['flight:nearMiss', {
        tick, actorId: 'player', obstacleId: 'station_spindle', speed: 80, clearance: 2.5,
      }]];
    default:
      return [];
  }
}

function runTape(h, withProof) {
  for (let tick = 0; tick <= PROOF_TICKS; tick++) {
    h.state.simTime = tick / 60;
    for (const [event, payload] of ordinaryAt(tick)) h.bus.emit(event, payload);
    if (withProof) {
      for (const [event, payload] of proofAt(tick)) h.bus.emit(event, payload);
    }
    h.stuntSys.update(h.state, DT);
    h.bulletSys.update(DT, h.state);
  }
}

test('rateMoment: rarity x momentum x collateral, commons never qualify', () => {
  const common = (metrics) => ({
    trickId: 'near_miss', rarity: 'common', metrics,
    secondaryIds: [], causeChain: [{ step: 1 }, { step: 2 }],
  });
  // A lone fast pass is a trick but not a moment.
  assert.equal(rateMoment(common({ speed: 80, clearance: 2.5 })).qualifies, false);
  // Razor timing alone is not a moment either.
  assert.equal(rateMoment({
    trickId: 'razor_release', rarity: 'common',
    metrics: { releaseScore: 0.92, tangentialSpeed: 42, angularSpeed: 4.5 },
    secondaryIds: [], causeChain: [{ step: 1 }, { step: 2 }],
  }).qualifies, false);
  // A chainless receipt is never a moment, whatever its rarity.
  assert.equal(rateMoment({
    trickId: 'well_golf', rarity: 'legendary', metrics: {}, secondaryIds: [], causeChain: [],
  }).qualifies, false);
  assert.equal(rateMoment(null).qualifies, false);

  // Wrecking ball: uncommon x heavy momentum x one collateral body.
  const wrecking = rateMoment({
    trickId: 'wrecking_ball', rarity: 'uncommon',
    metrics: { relSpeed: 58, mass: 45, momentum: 2610 },
    secondaryIds: ['rock_A'], causeChain: [{ step: 1 }, { step: 2 }],
  });
  assert.ok(wrecking.qualifies, `wrecking ball must qualify, scored ${wrecking.score}`);
  assert.ok(wrecking.score >= MOMENT_THRESHOLD);

  // Legendary well golf qualifies even with a short chain.
  assert.equal(rateMoment({
    trickId: 'well_golf', rarity: 'legendary',
    metrics: { deltaV: 35, exchangedMomentum: 2100 },
    secondaryIds: ['propelled_rock', 'singularity_vortex_1'],
    causeChain: [{ step: 1 }, { step: 2 }, { step: 3 }],
  }).qualifies, true);
});

test('60s proof on fixed seed: >= 3 distinct moments, never on ordinary traffic', () => {
  const h = boot();
  try {
    runTape(h, true);
    const { tricks, moments } = h.seen;
    const trickIds = new Set(tricks.map((t) => t.trickId));
    const momentTrickIds = new Set(moments.map((m) => m.trickId));

    assert.ok(moments.length >= 3, `need >= 3 moments, saw ${moments.length}`);
    assert.ok(momentTrickIds.size >= 3,
      `need >= 3 DISTINCT moments, saw [${[...momentTrickIds].join(', ')}]`);

    // Stable bus contract: every moment carries its rating breakdown.
    for (const m of moments) {
      assert.equal(typeof m.trickId, 'string');
      assert.ok(m.score >= MOMENT_THRESHOLD, `${m.trickId} scored ${m.score}`);
      assert.ok(Object.isFrozen(m), 'moment records are frozen receipts');
    }

    // Commons happened (razor release, fast pass) but never became moments.
    assert.ok(trickIds.has('razor_release'), 'proof must include a common trick');
    assert.ok(trickIds.has('near_miss'), 'proof must include a common near-miss');
    assert.ok(!momentTrickIds.has('razor_release'), 'razor release must never be a moment');
    assert.ok(!momentTrickIds.has('near_miss'), 'lone near-miss must never be a moment');

    // The stinger hook fired once per moment for audio consumers.
    const stingers = h.seen.cues.filter((c) => c && c.id === 'moment.stinger');
    assert.equal(stingers.length, moments.length,
      `one stinger per moment (${stingers.length} cues for ${moments.length} moments)`);

    // The held bullet-time meter was never touched by any moment.
    assert.equal(h.state.massline2.bulletTime.energy, 1, 'moments must not drain the meter');
    assert.equal(h.state.massline2.bulletTime.active, false);
    assert.ok(h.state.massline2.moment.totalMoments >= 3);
  } finally {
    shutdown(h);
  }
});

test('ordinary-traffic control tape: 0 tricks, 0 moments', () => {
  const h = boot();
  try {
    runTape(h, false);
    assert.equal(h.seen.tricks.length, 0, `control tape must detect no tricks`);
    assert.equal(h.seen.moments.length, 0, `control tape must fire no moments`);
    assert.equal(h.state.massline2.moment.totalMoments, 0);
  } finally {
    shutdown(h);
  }
});

test('moment pulse min-wins with the held meter and never drains it', () => {
  const h = boot();
  try {
    // Fire one qualifying trick straight at the bus.
    h.state.simTime = 10;
    h.bus.emit('tether:whipImpact', {
      tick: 600, sourceId: 'player', targetId: 'rock_A', victimId: 'pirate_corvette',
      relSpeed: 58, mass: 45, momentum: 2610,
    });
    h.bulletSys.update(DT, h.state);
    assert.equal(h.seen.moments.length, 1);
    assert.equal(h.timeEffects.getEffectiveScale(), MOMENT_SLOWMO_SCALE);

    // Holding the verb deepens to the held bound: min wins, nothing is overwritten.
    h.state.input.actions.bulletTime = true;
    h.bulletSys.update(DT, h.state); // first held tick engages
    h.bulletSys.update(DT, h.state); // second held tick drains
    assert.equal(h.timeEffects.getEffectiveScale(), 0.35);
    assert.ok(h.state.massline2.bulletTime.energy < 1, 'only the held verb drains the meter');

    // Release the verb past the pulse window: the picture returns to full rate.
    const energyAfterHold = h.state.massline2.bulletTime.energy;
    h.state.input.actions.bulletTime = false;
    h.state.simTime = 20;
    h.bulletSys.update(DT, h.state);
    assert.equal(h.timeEffects.getEffectiveScale(), 1);
    assert.equal(h.state.massline2.bulletTime.energy, energyAfterHold,
      'releasing the verb only recharges; moments never spend');
  } finally {
    shutdown(h);
  }
});

test('feel answers a moment with punch, never with score text', async () => {
  // feel.js is a render-phase module (document at init). Stub the sliver of DOM
  // init touches; the punch itself is plain state + camera trauma.
  const { feel } = await import('../src/render/feel.js');
  const fakeEl = () => ({
    style: {}, className: '', isConnected: true,
    appendChild() {}, getContext() { return null; },
  });
  const realDocument = globalThis.document;
  const realWindow = globalThis.window;
  globalThis.document = {
    getElementById: () => null,
    createElement: () => fakeEl(),
    head: { appendChild() {} },
    body: { appendChild() {} },
  };
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    const state = createGameState(SEED);
    state.mode = 'flight';
    state.playerId = 'player';
    const bus = createBus();
    const timeEffects = createTimeEffects(state);
    const traumas = [];
    state.render = state.render || {};
    state.render.cameraCtrl = { addTrauma: (t) => traumas.push(t), pushZoom() {} };
    const sys = Object.create(feel);
    sys.init({ state, bus, timeEffects });
    assert.equal(sys._fovPunch, 0);
    bus.emit(MOMENT_EVENT, {
      trickId: 'wrecking_ball', name: 'Wrecking Ball', rarity: 'uncommon',
      score: 10.5, actorId: 'player', targetId: 'pirate_corvette',
    });
    assert.ok(sys._fovPunch > 0, 'moment punches the FOV envelope');
    assert.ok(sys._fovPunch <= 6.0, 'moment FOV stays below the death punch');
    assert.deepEqual(traumas, [0.25]);
    assert.ok(sys._hsTimer > 0, 'moment kisses the hit-stop');

    // Motion-reduce players keep the information path but lose the vestibular punch.
    sys._fovPunch = 0;
    traumas.length = 0;
    sys._hsTimer = 0;
    state.settings.video.motionReduce = true;
    bus.emit(MOMENT_EVENT, { trickId: 'clothesline', score: 11 });
    assert.equal(sys._fovPunch, 0);
    assert.equal(traumas.length, 0);
    bus.clear();
  } finally {
    if (realDocument === undefined) delete globalThis.document;
    else globalThis.document = realDocument;
    if (realWindow === undefined) delete globalThis.window;
    else globalThis.window = realWindow;
  }
});
