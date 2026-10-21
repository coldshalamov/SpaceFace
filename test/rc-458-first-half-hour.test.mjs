import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { makeEntity, Masks } from '../src/core/entity.js';
import { BEATS as ROUTE_BEATS, onboarding } from '../src/systems/onboarding.js';
import { rescueBeatLine, rescuePodAtBeacon, rescueRockHitDerelict } from '../src/onboarding/rescueOpening.js';
import { missingThreeBeatLine } from '../src/onboarding/missingThree.js';
import { RANGE_POINTER_LINE } from '../src/ui/hudAttention.js';
import { resolveRescueEntryRung } from '../src/ui/screens/range.js';
import * as pace from '../src/onboarding/firstHalfHourPace.js';
import { onboardingTrackerStep } from '../src/onboarding/firstHalfHourPace.js';
import { SECTORS } from '../src/data/sectors.js';
import { buildFirstTradeOffer } from '../src/data/economyContractTemplates.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { firstHourOfferDestinationTag, firstHourBoardOfferPresentation } from '../src/ui/station/screens/contracts.js';
import { ALL_CHECKS, checkFirstHourBudget, overall, FIRST_HOUR_BUDGET } from '../scripts/player-truth/checks.mjs';

function stubElement() {
  return {
    children: [],
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    classList: {
      contains: () => false,
      add: () => {},
      remove: () => {},
      toggle: () => {},
    },
    appendChild() {},
    prepend() {},
    remove() {},
    setAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
}

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  head: stubElement(),
  body: stubElement(),
  documentElement: null,
  createElement: () => stubElement(),
};

function makeState() {
  const player = makeEntity({
    type: 'ship',
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: {
      weapons: [{ defId: 'pulse_laser_s', _heat: 0, heatMax: 100 }],
      combat: {},
      ai: {},
    },
  });
  player.id = 1;
  return {
    meta: { seed: 4242 },
    simTime: 10,
    tick: 0,
    mode: 'flight',
    settings: { gameplay: { tutorialHints: true } },
    playerId: 1,
    player: { hints: {}, targetId: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    nextEntityId: 10,
    nav: {},
    combat: { attachments: { byId: {} } },
    input: {
      boost: false,
      autoTargetPath: { active: false, drawing: false, points: [] },
    },
    world: { activeSector: { stations: [], gates: [] } },
    story: { beatIndex: 0 },
  };
}

function boot() {
  const bus = createBus();
  const state = makeState();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const sys = Object.create(onboarding);
  const seen = { rescue: [], firsthour: [], rangePrompt: [], folded: [], clinic: [], milestones: [] };
  for (const [event, key] of [['onboarding:drillFolded', 'folded'], ['onboarding:swingClinic', 'clinic'], ['firsthour:milestone', 'milestones']]) bus.on(event, (p) => seen[key].push(p));
  bus.on('rescue:started', (p) => seen.rescue.push({ event: 'rescue:started', ...p }));
  bus.on('rescue:beat', (p) => seen.rescue.push({ event: 'rescue:beat', ...p }));
  bus.on('rescue:complete', (p) => seen.rescue.push({ event: 'rescue:complete', ...p }));
  bus.on('firsthour:started', (p) => seen.firsthour.push({ event: 'firsthour:started', ...p }));
  bus.on('firsthour:verb', (p) => seen.firsthour.push({ event: 'firsthour:verb', ...p }));
  bus.on('firsthour:beat', (p) => seen.firsthour.push({ event: 'firsthour:beat', ...p }));
  bus.on('firsthour:complete', (p) => seen.firsthour.push({ event: 'firsthour:complete', ...p }));
  bus.on('onboarding:rangePrompt', (p) => seen.rangePrompt.push(p));
  sys.init({ state, bus, helpers, registry: null });
  return { bus, state, sys, helpers, spawned, seen };
}

function launchDefaultRoute(h) {
  h.bus.emit('game:started', {});
  return h.state.onboarding;
}

function tick(h, dt = 0.25) {
  h.sys.update(dt, h.state);
  const ob = h.state.onboarding;
  if (h.steps && ob.currentBeat >= 0 && ob.beatDoneAt.dock == null) {
    h.steps.push(onboardingTrackerStep(ob, ROUTE_BEATS).number);
  }
}

function advanceTime(h, seconds = 5) {
  h.state.simTime += seconds;
}

function tutorialLines(h) {
  return (h.state.onboarding.tutorialLog || []).map((entry) => entry.text);
}

function rescueActor(h, slot) {
  const id = h.state.onboarding.rescue.ids[slot];
  return id == null ? null : h.state.entities.get(id);
}

// Production route order (onboarding.js BEATS): the tether attach leads; the movement
// drills follow it. Raid/claimed sit between disengage and seam for the full-route tests.
const DRILL_KEYS = ['tether', 'raid', 'claimed', 'thrust', 'brake', 'marker', 'focus', 'burst', 'disengage'];
function driveDrillTo(h, beatKey) {
  const st = h.state;
  const player = st.entities.get(st.playerId);
  const sys = h.sys;
  const derelictOf = () => st.entities.get(sys._derelictId);
  const trainerOf = () => (sys._trainerId != null ? st.entities.get(sys._trainerId) : null);

  const step = (key) => {
    if (key === 'thrust') {
      player.vel.x = 41;
      tick(h);
    } else if (key === 'brake') {
      player.vel.x = 0;
      player.vel.z = 0;
      tick(h);
    } else if (key === 'marker') {
      tick(h);
      const trainer = trainerOf();
      assert.ok(trainer, 'marker lesson must stage its trainer');
      trainer.pos.x = player.pos.x + 100;
      trainer.pos.z = player.pos.z;
      tick(h);
    } else if (key === 'focus') {
      const trainer = trainerOf();
      assert.ok(trainer, 'focus lesson needs its trainer');
      h.bus.emit('flybyFocus:start', { targetId: trainer.id });
      tick(h);
    } else if (key === 'claimed') {
      advanceTime(h);
      tick(h);
      completeClaimed(h, { heatPath: true });
    } else if (key === 'tether') {
      tick(h); // the route opens on the tether beat: one tick stages its derelict
      const derelict = derelictOf();
      assert.ok(derelict, 'tether lesson must stage its derelict');
      st.player.targetId = derelict.id;
      h.bus.emit('tether:latched', { targetId: derelict.id });
      h.bus.emit('tether:reel', { targetId: derelict.id, before: 80, after: 58 });
      h.bus.emit('tether:released', { targetId: derelict.id });
      tick(h);
    } else if (key === 'burst') {
      player.data.weapons[0]._heat = 36;
      for (let i = 0; i < 3; i++) {
        h.bus.emit('combat:fire', { ownerId: player.id, weaponId: 'pulse_laser_s' });
      }
      player.data.weapons[0]._heat = 2;
      tick(h);
    } else if (key === 'raid') {
      advanceTime(h);
      tick(h);
      completeRaid(h);
    } else if (key === 'disengage') {
      const trainer = trainerOf();
      assert.ok(trainer, 'disengage lesson needs its trainer');
      trainer.pos.x = player.pos.x + 901;
      trainer.pos.z = player.pos.z;
      tick(h);
    }
  };

  const start = h._drivenIdx || 0;
  const target = DRILL_KEYS.indexOf(beatKey);
  assert.ok(target >= start, `drill driver cannot rewind to ${beatKey}`);
  for (let i = start; i <= target; i++) {
    const key = DRILL_KEYS[i];
    if (st.onboarding.beatDoneAt[key] == null) step(key);
    advanceTime(h);
    tick(h);
    assert.ok(st.onboarding.beatDoneAt[key] != null, `drill beat must DONE: ${key}`);
  }
  h._drivenIdx = target + 1;
}

function completeSwing(h) {
  const rock = rescueActor(h, 'rock');
  const derelict = rescueActor(h, 'derelict');
  h.bus.emit('tether:latched', { targetId: rock.id });
  h.bus.emit('tether:reel', { targetId: rock.id, before: 80, after: 50 });
  h.bus.emit('tether:released', { targetId: rock.id });
  rock.pos.x = derelict.pos.x + 20;
  rock.pos.z = derelict.pos.z;
  rock.vel.x = -30;
  rock.vel.z = 0;
  assert.ok(rescueRockHitDerelict(rock, derelict), 'the proof setup is a genuine hit');
  tick(h);
}

function completeGrab(h) {
  const st = h.state;
  const player = st.entities.get(st.playerId);
  const pod = rescueActor(h, 'pod');
  const beacon = rescueActor(h, 'beacon');
  h.bus.emit('tether:latched', { targetId: pod.id });
  player.vel.x = 30;
  player.vel.z = 0;
  pod.pos.x = beacon.pos.x;
  pod.pos.z = beacon.pos.z;
  assert.ok(rescuePodAtBeacon(pod, beacon), 'the proof setup is a genuine delivery');
  tick(h);
}


// Thesis-first route: the raid + claimed beats now sit between the rescue grab and the missing
// three. Drive them with real event receipts (throw-kill; heat clear through the law path).
function completeRaid(h) {
  const st = h.state;
  advanceTime(h);
  tick(h); // the raid beat enters and stages its cast
  const raid = st.onboarding.raid;
  assert.ok(raid && raid.ids.raider != null, 'raid lesson stages its raider');
  const player = st.entities.get(st.playerId);
  const raider = st.entities.get(raid.ids.raider);
  h.bus.emit('tether:latched', { targetId: raider.id });
  raider.vel.x = 200; // the fling: a genuine release at speed
  h.bus.emit('tether:released', { targetId: raider.id });
  h.bus.emit('entity:killed', { id: raider.id, killerId: player.id, type: 'ship' });
  tick(h);
  assert.ok(st.onboarding.beatDoneAt.raid != null, 'a throw kill completes the raid');
}

function completeClaimed(h, { heatPath = false } = {}) {
  const st = h.state;
  advanceTime(h);
  tick(h); // the claimed beat enters and stages the spill + witness
  const claimed = st.onboarding.claimed;
  if (claimed == null || claimed.resolved) {
    // The driver's earlier pass already collected the spill and resolved the beat.
    assert.ok(st.onboarding.beatDoneAt.claimed != null, 'the claimed beat resolved');
    return;
  }
  assert.ok(claimed.ids && claimed.ids.pickups.length >= 1, 'claimed lesson stages its spill');
  h.bus.emit('pickup:collected', {
    pickupId: claimed.ids.pickups[0],
    collectorId: st.playerId,
    kind: 'cargo',
    amount: 4,
    commodityId: 'cmdty_salvage_electronics',
    pos: { x: st.entities.get(st.playerId).pos.x, z: st.entities.get(st.playerId).pos.z },
  });
  tick(h);
  if (heatPath && !claimed.resolved) {
    // An accepted law receipt raises the wanted state; the escape clears it with a grace.
    h.bus.emit('heat:changed', { value: 0.22, level: 2, zone: { level: 2 } });
    assert.equal(claimed.wantedFired, true, 'an accepted law receipt raises the wanted state');
    h.bus.emit('heat:changed', { value: 0, level: 0, zone: { level: 0 } });
    advanceTime(h, 1);
    tick(h);
    assert.ok(st.onboarding.beatDoneAt.claimed == null, 'the clear grace holds before DONE');
    advanceTime(h, 3);
    tick(h);
  }
  assert.ok(st.onboarding.beatDoneAt.claimed != null, 'the claimed beat resolves');
}
function driveRescueToGrab(h) {
  driveDrillTo(h, 'tether');
  completeSwing(h);
  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'burst');
  const scout = rescueActor(h, 'scout');
  h.bus.emit('tether:whipImpact', {
    targetId: h.state.onboarding.rescue.ids.rock,
    victimId: scout.id,
    relSpeed: 24,
  });
  tick(h);
  advanceTime(h);
  tick(h);
  driveDrillTo(h, 'disengage');
  completeGrab(h);
}

function launchToSwing(h) {
  launchDefaultRoute(h);
  driveDrillTo(h, 'tether');
  assert.equal(h.state.onboarding.rescue.current, 'swing');
}

function launchToRaid(h) {
  launchToSwing(h);
  completeSwing(h);
  advanceTime(h);
  tick(h);
  assert.equal(ROUTE_BEATS[h.state.onboarding.currentBeat].key, 'raid');
}

function completeFiveVerbs(h) {
  const st = h.state;
  assert.equal(st.onboarding.missingThree.current, 'boost');
  st.input.boost = true;
  tick(h);
  st.input.boost = false;
  advanceTime(h); tick(h);
  assert.equal(st.onboarding.missingThree.current, 'stroke');
  st.input.autoTargetPath = { active: true, drawing: false, points: [{ x: 0, z: 0 }, { x: 40, z: 10 }, { x: 80, z: 20 }] };
  tick(h);
  st.input.autoTargetPath = { active: false, drawing: false, points: [] };
  advanceTime(h); tick(h);
  assert.equal(st.onboarding.missingThree.current, 'well');
  h.bus.emit('fields:deployed', { kind: 'well', sourceId: st.playerId, fieldId: 'pace_well' });
  tick(h);
  advanceTime(h); tick(h);
  assert.equal(st.onboarding.missingThree.current, 'repulsor');
  h.bus.emit('fields:deployed', { kind: 'repulsor', sourceId: st.playerId, fieldId: 'pace_repulsor' });
  tick(h);
  advanceTime(h); tick(h);
  assert.equal(st.onboarding.missingThree.current, 'cone');
  h.bus.emit('fields:coneToggled', { active: true, fieldId: 'pace_cone' });
  tick(h);
  assert.equal(st.onboarding.missingThree.completed, true);
  for (const key of ['boost', 'stroke', 'well', 'repulsor', 'cone']) {
    assert.equal(st.onboarding.missingThree.beats[key].state, 'done');
    assert.equal(tutorialLines(h).filter((line) => line === missingThreeBeatLine(key)).length, 1);
  }
  advanceTime(h); tick(h);
}

function rescueLines(h) {
  const lines = ['swing', 'shove', 'grab'].map(rescueBeatLine);
  return tutorialLines(h).filter((line) => lines.includes(line));
}

test('tracker maps every authored beat exactly once, monotonically, with docking at step six', () => {
  assert.equal(pace.ONBOARDING_TRACKER_STEP_COUNT, 7);
  const indices = ROUTE_BEATS.map((b) => pace.trackerStepIndexForBeat(b.key));
  assert.ok(indices.every((n, i) => n >= 0 && (i === 0 || n >= indices[i - 1])));
  assert.deepEqual(pace.ONBOARDING_TRACKER_STEPS.flatMap((s) => s.beats), ROUTE_BEATS.map((b) => b.key));
  assert.equal(pace.trackerStepIndexForBeat('dock') + 1, 6);
  assert.ok(pace.trackerStepIndexForBeat('dock') + 1 <= 8);
  assert.equal(pace.trackerStepIndexForBeat('thrust'), pace.trackerStepIndexForBeat('disengage'));
  assert.equal(pace.trackerStepIndexForBeat('unknown'), -1);
  assert.equal(onboardingTrackerStep({ currentBeat: -1 }, ROUTE_BEATS).number, 0);
  const ob = { beatDoneAt: { tether: 0 } };
  assert.equal(pace.trackerStepDone(ob, 0), true);
  assert.equal(pace.trackerStepDone(ob, 3), false);
});

test('seed 4242 route reaches dock in six tracker steps, folds proven flying and preserves all verbs and Range', () => {
  const h = boot(); h.steps = [];
  launchToSwing(h);
  assert.equal(resolveRescueEntryRung(h.state), 2);
  completeSwing(h);
  advanceTime(h); tick(h);
  const player = h.state.entities.get(h.state.playerId);
  player.vel.x = 60; tick(h);
  completeRaid(h);
  player.vel.x = 0; tick(h);
  completeClaimed(h);
  advanceTime(h); tick(h);
  driveDrillTo(h, 'burst');
  const actor = h.sys._trainingActor();
  const dx = actor.pos.x - player.pos.x, dz = actor.pos.z - player.pos.z;
  assert.ok(actor.vel.x * dx + actor.vel.z * dz > 0, 'burst sends the wingman away');
  assert.ok(Math.hypot(actor.vel.x, actor.vel.z) >= 100);
  const scout = rescueActor(h, 'scout');
  h.bus.emit('tether:whipImpact', { targetId: h.state.onboarding.rescue.ids.rock, victimId: scout.id, relSpeed: 24 });
  tick(h); advanceTime(h); tick(h);
  driveDrillTo(h, 'disengage');
  completeGrab(h);
  completeFiveVerbs(h);
  const rock = h.state.entities.get(h.sys._miningRockId);
  assert.ok(rock, 'seam stages after the five verbs');
  rock.data.scanHighlightUntil = h.state.simTime + 5;
  h.bus.emit('scan:completed', { found: { asteroids: 1, wrecks: 0, anomalies: 0 } });
  h.bus.emit('mining:yield', { minerId: player.id, asteroidId: rock.id, commodityId: 'cmdty_ore_iron', qty: 3, pos: { ...rock.pos } });
  tick(h); advanceTime(h); tick(h);
  const ob = h.state.onboarding;
  assert.equal(ROUTE_BEATS[ob.currentBeat].key, 'dock');
  assert.equal(h.sys._countEl.textContent, '6 / 7');
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.ok(ob.beatDoneAt.dock != null);
  assert.ok(h.steps.every((n, i) => i === 0 || n >= h.steps[i - 1]));
  assert.equal(Math.max(...h.steps), 6);
  assert.deepEqual([...new Set(h.steps)], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ob.pace.folded, { thrust: 'flown', brake: 'flown' });
  assert.equal(h.seen.folded.length, 2);
  assert.ok(!tutorialLines(h).includes('Thrust until speed passes forty.'));
  assert.ok(!tutorialLines(h).includes('Brake below ten.'));
  assert.equal(ob.rescue.completed, true);
  assert.deepEqual(rescueLines(h), ['swing', 'shove', 'grab'].map(rescueBeatLine));
  assert.equal(h.seen.rangePrompt[0].text, RANGE_POINTER_LINE);
});

test('deterministic 60 Hz follower meets latch and raid budgets on seed 4242', (t) => {
  const h = boot(); launchDefaultRoute(h);
  let firstInputAt = null, requestKey = null, requestAt = 0;
  for (let frame = 0; frame < 180 * 60 && h.state.onboarding.beatDoneAt.raid == null; frame++) {
    advanceTime(h, 1 / 60); tick(h, 1 / 60);
    const ob = h.state.onboarding;
    if (ob.currentBeat < 0) continue;
    if (firstInputAt == null) firstInputAt = h.state.simTime;
    const key = ob.rescue.current === 'swing' ? 'swing' : ROUTE_BEATS[ob.currentBeat].key;
    if (key !== requestKey) { requestKey = key; requestAt = h.state.simTime; }
    if (h.state.simTime - requestAt < 10) continue;
    if (key === 'tether' && ob.beatDoneAt.tether == null) {
      const targetId = h.sys._derelictId;
      h.bus.emit('tether:latched', { targetId });
      h.bus.emit('tether:reel', { targetId, before: 80, after: 58 });
      h.bus.emit('tether:released', { targetId });
    } else if (key === 'swing' && ob.rescue.beats.swing.state !== 'done') completeSwing(h);
    else if (key === 'raid' && ob.beatDoneAt.raid == null) {
      const targetId = ob.raid.ids.raider;
      h.bus.emit('tether:latched', { targetId });
      h.state.entities.get(targetId).vel.x = 200;
      h.bus.emit('tether:released', { targetId });
      h.bus.emit('tether:whipImpact', { targetId, victimId: ob.raid.ids.throwRock, rating: 'solid' });
    }
  }
  const attach = h.seen.milestones.find((p) => p.milestone === 'attach');
  const raid = h.seen.milestones.find((p) => p.milestone === 'momentumKill');
  assert.ok(attach && raid);
  assert.ok(attach.atS - firstInputAt <= 60);
  assert.ok(raid.atS - firstInputAt <= 180);
  t.diagnostic(`seed 4242: latch ${(attach.atS - firstInputAt).toFixed(3)}s; raid ${(raid.atS - firstInputAt).toFixed(3)}s`);
});

test('spoken lessons keep four seconds of silence while silently folded drills add no delay', () => {
  const h = boot(); launchDefaultRoute(h);
  const ob = h.state.onboarding;
  ob.rescue = null; ob.missingThree = null;
  ob.currentBeat = ROUTE_BEATS.findIndex((b) => b.key === 'claimed');
  ob.beatDoneAt.claimed = 10;
  ob.pace.fastAtS = 2; ob.pace.slowAtS = 3;
  h.sys._lastTextAtS = 10;
  h.state.simTime = 13.999; h.sys._tryAdvanceBeat();
  assert.equal(ROUTE_BEATS[ob.currentBeat].key, 'claimed', 'DONE alone does not advance a spoken predecessor');
  h.state.simTime = 14; h.sys._tryAdvanceBeat();
  assert.equal(ROUTE_BEATS[ob.currentBeat].key, 'marker', 'both silent folds and marker enter the same tick');
  assert.deepEqual(ob.pace.folded, { thrust: 'flown', brake: 'flown' });
  assert.equal(h.seen.folded.length, 2);
  const actor = h.sys._trainingActor();
  const player = h.state.entities.get(h.state.playerId);
  actor.pos = { x: player.pos.x + 100, z: player.pos.z };
  h.sys._resolveProximityDone();
  h.state.simTime = 17.999; h.sys._tryAdvanceBeat();
  assert.equal(ROUTE_BEATS[ob.currentBeat].key, 'marker');
  h.state.simTime = 18; h.sys._tryAdvanceBeat();
  assert.equal(ROUTE_BEATS[ob.currentBeat].key, 'focus');
});

function missSwing(h, lesson) {
  const ob = h.state.onboarding;
  const targetId = lesson === 'raid' ? ob.raid.ids.raider : ob.rescue.ids.rock;
  h.bus.emit('tether:latched', { targetId });
  if (lesson === 'rescue') h.bus.emit('tether:reel', { targetId, before: 80, after: 50 });
  else h.state.entities.get(targetId).vel.x = 200;
  h.bus.emit('tether:cut', { targetId });
  h.bus.emit('tether:released', { targetId }); // duplicate production receipt must count only once
  for (let i = 0; i < 25; i++) { advanceTime(h, 0.25); tick(h); }
}

test('three raid swing misses open one closer clinic, keep the Range, and still permit a throw payoff', () => {
  const h = boot(); launchToRaid(h);
  for (let i = 0; i < 2; i++) missSwing(h, 'raid');
  assert.equal(h.state.onboarding.pace.swing.misses, 2);
  assert.equal(h.seen.clinic.length, 0);
  missSwing(h, 'raid');
  const ob = h.state.onboarding;
  assert.equal(h.seen.clinic.length, 1);
  assert.equal(h.seen.clinic[0].lesson, 'raid');
  assert.equal(tutorialLines(h).filter((s) => s === pace.SWING_CLINIC_LINE).length, 1);
  assert.equal(ob.rangePromptRungId, pace.SWING_CLINIC_RUNG_ID);
  assert.equal(resolveRescueEntryRung(h.state), 2);
  const raider = h.sys._raidActor('raider');
  const rock = h.state.entities.get(ob.raid.ids.throwRock);
  const player = h.state.entities.get(h.state.playerId);
  assert.ok(Math.abs(Math.hypot(raider.pos.x - player.pos.x, raider.pos.z - player.pos.z) - 120) <= 1);
  assert.ok(Math.abs(Math.hypot(rock.pos.x - raider.pos.x, rock.pos.z - raider.pos.z) - 110) <= 1);
  missSwing(h, 'raid');
  assert.equal(h.seen.clinic.length, 1);
  assert.equal(tutorialLines(h).filter((s) => s === pace.SWING_CLINIC_LINE).length, 1);
  h.bus.emit('tether:whipImpact', { targetId: ob.raid.ids.raider, victimId: ob.raid.ids.throwRock, rating: 'solid' });
  assert.ok(ob.beatDoneAt.raid != null);
});

test('three rescue swing misses restage the rock and open the rescue clinic once', () => {
  const h = boot(); launchToSwing(h);
  const oldId = h.state.onboarding.rescue.ids.rock;
  for (let i = 0; i < 3; i++) missSwing(h, 'rescue');
  const ob = h.state.onboarding;
  assert.equal(h.seen.clinic.length, 1);
  assert.equal(h.seen.clinic[0].lesson, 'rescue');
  assert.notEqual(ob.rescue.ids.rock, oldId);
  assert.equal(ob.rescue.rockLatched, false);
  assert.equal(ob.rescue.rockReeled, false);
  assert.equal(ob.rescue.rockReleasedAfterReel, false);
  assert.equal(resolveRescueEntryRung(h.state), 2);
  completeSwing(h);
  assert.equal(ob.rescue.beats.swing.state, 'done');
});

test('misses accumulate across rescue and raid while successful releases do not add misses', () => {
  const h = boot(); launchToSwing(h);
  missSwing(h, 'rescue'); missSwing(h, 'rescue');
  completeSwing(h);
  advanceTime(h); tick(h);
  assert.equal(h.state.onboarding.pace.swing.misses, 2);
  missSwing(h, 'raid');
  assert.equal(h.seen.clinic.length, 1);
  assert.equal(h.seen.clinic[0].lesson, 'raid');
});

test('flown-before folds exactly four drills at rest, preserves rescue, and round-trips without flag leakage', () => {
  const h = boot(); h.bus.emit('game:newGame', { flownBefore: true });
  launchToSwing(h);
  assert.equal(h.state.onboarding.pace.flownBefore, true);
  completeSwing(h); advanceTime(h); tick(h);
  completeRaid(h); completeClaimed(h); advanceTime(h); tick(h);
  const ob = h.state.onboarding;
  assert.deepEqual(ob.pace.folded, Object.fromEntries(pace.FLOWN_BEFORE_BEATS.map((b) => [b, 'flownBefore'])));
  assert.equal(ROUTE_BEATS[ob.currentBeat].key, 'burst');
  assert.equal(tutorialLines(h).at(-1), 'Fire a short burst into the raider.');
  h._drivenIdx = DRILL_KEYS.indexOf('burst');
  driveDrillTo(h, 'burst');
  const scout = rescueActor(h, 'scout');
  h.bus.emit('tether:whipImpact', { targetId: ob.rescue.ids.rock, victimId: scout.id, relSpeed: 24 });
  tick(h); advanceTime(h); tick(h);
  driveDrillTo(h, 'disengage'); completeGrab(h);
  assert.deepEqual(rescueLines(h), ['swing', 'shove', 'grab'].map(rescueBeatLine));
  assert.ok(ob.beatDoneAt.burst != null && ob.beatDoneAt.disengage != null);
  assert.equal(ob.missingThree.current, 'boost');
  const saved = JSON.parse(JSON.stringify(h.sys.serialize()));
  h.sys.deserialize(saved);
  assert.deepEqual(h.state.onboarding.pace, saved.pace);
  h.bus.emit('game:started', {});
  assert.equal(h.state.onboarding.pace.flownBefore, false);
  h.bus.emit('game:newGame', { flownBefore: true });
  h.bus.emit('save:loaded', {});
  h.bus.emit('game:started', {});
  assert.equal(h.state.onboarding.pace.flownBefore, false);
  delete saved.pace;
  h.sys.deserialize(saved);
  assert.equal(h.state.onboarding.pace, null, 'old saves retain the original rail');
  h.bus.emit('game:started', { scenario: '47a' });
  assert.equal(h.state.onboarding.pace, null, 'scenario boots stay unchanged');
  const source = readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8');
  assert.match(source, /flownBefore: refs\.flownBefore === true/);
});

test('pace normalization and live credit require fast then slow and pending swings settle only once', () => {
  assert.equal(pace.normalizePaceState(undefined), null);
  assert.equal(pace.normalizePaceState(null), null);
  const normalized = pace.normalizePaceState({ flownBefore: 'true', fastAtS: Infinity, slowAtS: NaN,
    folded: { thrust: 'flown', brake: 'bad', raid: 'flownBefore', focus: 'flownBefore' },
    swing: { misses: -4.8, pendingAtS: Infinity, pendingLesson: 'bad', clinicOpenedAtS: NaN, clinicLesson: 'raid' } });
  assert.deepEqual(normalized, { ...pace.freshPaceState(), folded: { thrust: 'flown', focus: 'flownBefore' },
    swing: { ...pace.freshPaceState().swing, clinicLesson: 'raid' } });
  assert.equal(pace.normalizePaceState({ swing: { misses: 3.9 } }).swing.misses, 3);
  const p = pace.freshPaceState();
  pace.notePaceFlight(p, 0, 0); assert.equal(p.slowAtS, null);
  pace.notePaceFlight(p, 40, 2); pace.notePaceFlight(p, 10, 3);
  assert.equal(pace.paceCreditFor(p, 'thrust'), 'flown');
  assert.equal(pace.paceCreditFor(p, 'brake'), 'flown');
  assert.equal(pace.paceCreditFor(p, 'marker'), null);
  pace.notePendingSwing(p, 'rescue', 4); pace.notePendingSwing(p, 'raid', 5);
  assert.equal(p.swing.pendingLesson, 'rescue');
  assert.equal(pace.settlePendingSwing(p, { paidOff: false, atS: 9 }), null);
  assert.equal(pace.settlePendingSwing(p, { paidOff: false, atS: 10 }), 'miss');
  assert.equal(pace.settlePendingSwing(p, { paidOff: false, atS: 20 }), null);
  pace.notePendingSwing(p, 'raid', 20);
  assert.equal(pace.settlePendingSwing(p, { paidOff: true, atS: 21 }), 'hit');
  assert.equal(p.swing.misses, 1);
});

test('default-route wingman retains every training safety pin and off-route dressing stays unchanged', () => {
  const h = boot(); launchDefaultRoute(h);
  const actor = h.sys._spawnTrainer('marker');
  assert.equal(actor.name, pace.RAID_WINGMAN_NAME);
  assert.notEqual(actor.factionId, 'faction_scn');
  assert.equal(actor.type, 'drone'); assert.equal(actor.team, 0);
  assert.equal(actor.flags.invuln, true);
  assert.equal(actor.data.ai.passive, true); assert.equal(actor.data.ai.roe, 'hold_fire');
  assert.deepEqual(actor.data.weapons, []);
  assert.equal(actor.collisionMask, Masks.PROJECTILE);
  assert.equal(actor.physicsBody.material, 'projectile');
  assert.equal(actor.data.onboardingTraining, true);
  assert.equal(actor.data.trainingFocusEligible, false);
  for (const key of ['marker', 'focus', 'burst', 'disengage']) {
    const line = ROUTE_BEATS.find((b) => b.key === key).line;
    assert.match(line, /raider/); assert.doesNotMatch(line, /trainer/i);
  }
  actor.pos = { ...h.state.entities.get(h.state.playerId).pos };
  h.sys._wingmanBreakOff();
  assert.equal(Math.hypot(actor.vel.x, actor.vel.z), 118);
  h.bus.emit('game:started', { scenario: '47a' });
  const oldActor = h.sys._spawnTrainer('marker');
  assert.equal(oldActor.name, 'SCN Flight Trainer');
  assert.equal(oldActor.factionId, 'faction_scn');
});

function makeHarness(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'station'; state.simTime = 720;
  state.world.currentSectorId = 'sector_helios_prime'; state.ui.dockedStationId = 'station_helios';
  state.onboarding = { active: true, finished: false, currentBeat: ROUTE_BEATS.findIndex((b) => b.key === 'choice'),
    beatDoneAt: {}, firedFollowups: {}, tutorialLog: [] };
  const bus = createBus();
  const helpers = { hash32, mulberry32, voice: { say: () => true } };
  const missions = Object.create(missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, missions };
}

test('first three choice contracts and recommended delivery name their destination with unchanged badges', () => {
  const h = makeHarness();
  const firstTrade = buildFirstTradeOffer(4242);
  const recommendedTag = firstHourOfferDestinationTag(h.state, firstTrade);
  assert.ok(recommendedTag.startsWith('→ '));
  assert.ok(recommendedTag.includes('Ceres'));
  assert.deepEqual(firstHourBoardOfferPresentation(h.state, firstTrade), { label: 'RECOMMENDED', rank: -1, kind: 'recommended' });
  const choices = h.missions.ensureOnboardingChoiceOffers('station_helios');
  assert.equal(choices.length, 3);
  const offers = choices;
  const stationDefs = new Map(SECTORS.flatMap((s) => s.stations.map((b) => [b.id, b])));
  let local = false, ceres = false;
  for (const offer of offers) {
    const tag = firstHourOfferDestinationTag(h.state, offer);
    const params = offer.params || {};
    const station = stationDefs.get(offer.destStationId || params.destStationId);
    const sectorId = offer.destSectorId || params.destSectorId;
    assert.ok(tag.startsWith('→ ')); assert.ok(tag.includes(station.name)); assert.doesNotMatch(tag, /Destination/);
    if (sectorId === h.state.world.currentSectorId) { local = true; assert.ok(!tag.includes(' · ')); }
    if (sectorId === 'sector_ceres_belt') {
      ceres = true;
      assert.ok(tag.endsWith(' · ' + SECTORS.find((s) => s.id === sectorId).name));
    }
  }
  assert.ok(local && ceres);
  assert.equal(firstHourOfferDestinationTag(h.state, { destStationId: 'station_ceres' }), '');
  assert.equal(firstHourBoardOfferPresentation(h.state, firstTrade), null, 'three choices retain sole ownership of authored badges');
});

test('player-truth first-hour budget distinguishes scripted failures and unscripted advisories without UNKNOWN', () => {
  assert.deepEqual(FIRST_HOUR_BUDGET, { latchS: 60, raidS: 180 });
  assert.ok(ALL_CHECKS.includes(checkFirstHourBudget));
  const trace = (mode, attach, raid, tutorialPilot = false, end = 250) => ({
    meta: { mode, tutorialPilot }, samples: [{ sim: end }], events: [
      { ev: 'input', kind: 'keydown', code: 'KeyW', sim: 10 },
      ...(attach == null ? [] : [{ ev: 'milestone', milestone: 'attach', sim: 10 + attach }]),
      ...(raid == null ? [] : [{ ev: 'milestone', milestone: 'momentumKill', sim: 10 + raid }]),
    ],
  });
  const cases = [
    [trace('swarm', 30, 120), 'N/A'], [trace('adventure'), 'N/A'],
    [trace('adventure', 30, 120), 'PASS'], [trace('adventure', 30, 200), 'ADVISORY'],
    [trace('adventure', 30, 200, true), 'FAIL'], [trace('adventure', 61, 120, true), 'FAIL'],
    [trace('adventure', 30, null, true, 191), 'FAIL'], [trace('adventure', 30, null, false, 190), 'N/A'],
    [trace('adventure', 60, 180, true), 'PASS'],
  ];
  const noInput = trace('adventure', 30, 120); noInput.events.shift(); cases.push([noInput, 'N/A']);
  for (const [input, status] of cases) {
    const r = checkFirstHourBudget(input); assert.equal(r.status, status);
    assert.notEqual(overall([r]), 'INCOMPLETE');
  }
});

