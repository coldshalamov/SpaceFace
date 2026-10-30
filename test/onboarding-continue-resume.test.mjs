// Continue mid-lesson — a save written in the middle of ANY first-hour rail must
// resume with its actors restaged, its panel mounted, its voice re-armed, and a
// real completion path left standing. Actor ids are session-local: the saved
// record deliberately carries empty id slots, so the restore (not the record)
// owns re-staging the world. A restore that returns "resumed" with no live
// lesson is the stranded-pilot bug this file pins.
// Run: node --test test/onboarding-continue-resume.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import {
  RESCUE_PROOF_SEED,
  freshRescueState,
  rescueBeatLine,
} from '../src/onboarding/rescueOpening.js';
import { freshMissingThreeState } from '../src/onboarding/missingThree.js';
import { BEATS, onboarding } from '../src/systems/onboarding.js';

function stubElement() {
  return {
    children: [],
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
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
    data: { weapons: [], combat: {}, ai: {} },
  });
  player.id = 1;
  return {
    meta: { seed: RESCUE_PROOF_SEED },
    simTime: 100,
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
    input: { boost: false, actions: {}, autoTargetPath: { active: false, drawing: false, points: [] } },
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
  sys.init({ state, bus, helpers, registry: null });
  return { bus, state, sys, helpers, spawned };
}

function entityOf(h, id) {
  return id == null ? null : (h.state.entities.get(id) || null);
}
function alive(h, id) {
  const e = entityOf(h, id);
  return Boolean(e && e.alive !== false);
}
function tick(h, dt = 0.25) {
  h.sys.update(dt, h.state);
}
function advanceTime(h, s = 1) {
  h.state.simTime += s;
}
function tutorialLines(h) {
  return (h.state.onboarding.tutorialLog || []).map((entry) => entry.text);
}

// The minimum save slice shape: a live, unfinished rail with the fields
// serialize() reads. mutator() parks it mid-lesson before the round trip.
function saveMidRail(mutator) {
  const a = boot();
  a.state.onboarding = {
    active: true,
    finished: false,
    currentBeat: 0,
    beatDoneAt: {},
    firedFollowups: {},
    oreCollected: 0,
    trainingOre: 0,
    tetherReeled: false,
    tetherBreaks: 0,
    beatAction: '',
    startedAt: 0,
    rescue: null,
    raid: null,
    claimed: null,
    missingThree: null,
    pace: null,
    powerSit: null,
  };
  mutator(a.state.onboarding, a);
  const record = a.sys.serialize();
  assert.ok(record, 'a mid-rail save must serialize a resume record');
  return JSON.parse(JSON.stringify(record));
}

function continueFrom(record) {
  const b = boot();
  b.sys.deserialize(JSON.parse(JSON.stringify(record)));
  b.bus.emit('save:loaded', {});
  return b;
}

function rescueWithSwingDone() {
  const rescue = freshRescueState();
  rescue.beats.swing.state = 'done';
  rescue.beats.swing.doneAt = 45;
  rescue.ids = { rock: 21, derelict: 22, scout: 23, asteroid: 24, pod: 25, beacon: 26 };
  return rescue;
}

test('Continue mid-raid restages the raid cast AND the still-open rescue cast, then finishes the beat', () => {
  const raidBeat = BEATS.findIndex((b) => b.key === 'raid');
  const record = saveMidRail((ob) => {
    ob.currentBeat = raidBeat;
    ob.beatDoneAt = { tether: 50 };
    ob.beatAction = 'Latch the raider. Swing him into the rock.';
    ob.rescue = rescueWithSwingDone();
    ob.raid = {
      active: true,
      enteredAt: 60,
      ids: { raider: 31, hauler: 32, throwRock: 33, wing: 34 },
      lastWhipAt: null,
      gunKills: 0,
      strayKills: 0,
      wingDone: false,
    };
    ob.missingThree = freshMissingThreeState();
  });
  // The saved record must carry empty actor slots — ids are session-local.
  assert.equal(record.raid.ids.raider, null);
  assert.equal(record.rescue.ids.derelict, null);

  const h = continueFrom(record);
  const ob = h.state.onboarding;
  assert.equal(ob.active, true, 'the rail re-arms on Continue');
  assert.ok(h.sys._panel, 'the objective panel mounts on a sub-rail resume');
  assert.notEqual(h.sys._storyMode, true, 'story mode must not shadow a live rail');

  // The SAVED raid record survives — _enterBeat would have rebuilt it and
  // stamped enteredAt = simTime.
  assert.equal(ob.raid.active, true);
  assert.equal(ob.raid.enteredAt, 60, 'the saved raid record is preserved, not rebuilt');
  assert.ok(alive(h, ob.raid.ids.raider), 'a live raider is restaged');
  assert.ok(alive(h, ob.raid.ids.throwRock), 'the authored whip rock is restaged');
  assert.ok(alive(h, ob.raid.ids.hauler), 'the raid hauler is restaged');

  // The side rail that overlaps the beat restages beside it — the old
  // early-return left rescue actors missing for the whole beat.
  assert.ok(alive(h, ob.rescue.ids.derelict), 'the pending rescue verbs keep their wreck');
  assert.ok(alive(h, ob.rescue.ids.asteroid), 'the pending shove keeps its wall');

  // An uncredited kill restages the raider and keeps the beat alive.
  const firstRaider = ob.raid.ids.raider;
  h.bus.emit('entity:killed', { id: firstRaider, killerId: 999, ownerId: 999 });
  assert.equal(ob.beatAction, 'the raider broke off');
  assert.ok(ob.raid.ids.raider && ob.raid.ids.raider !== firstRaider, 'a fresh raider is staged');
  assert.ok(alive(h, ob.raid.ids.raider));

  // Whip-kill completion on the restaged cast still resolves the beat.
  const raider = entityOf(h, ob.raid.ids.raider);
  h.bus.emit('tether:latched', { targetId: raider.id });
  raider.vel.x = 200;
  raider.vel.z = 0;
  h.bus.emit('tether:released', { targetId: raider.id });
  assert.ok(ob.raid.lastWhipAt != null, 'the whip arm lands on the restaged raider');
  h.bus.emit('entity:killed', { id: raider.id, killerId: h.state.playerId });
  assert.ok(ob.beatDoneAt.raid != null, 'the resumed raid lesson can still complete');
});

test('Continue mid-claimed restages the spill and the witness — the decline timer still resolves it', () => {
  const claimedBeat = BEATS.findIndex((b) => b.key === 'claimed');
  const record = saveMidRail((ob) => {
    ob.currentBeat = claimedBeat;
    ob.beatDoneAt = { tether: 50, raid: 55 };
    ob.beatAction = 'That cargo has an owner. Walk away.';
    ob.rescue = rescueWithSwingDone();
    ob.claimed = {
      active: true,
      enteredAt: 60,
      ids: { patrol: 41, pickups: [42, 43, 44] },
      taken: false,
      wantedFired: false,
      clearSince: null,
      resolved: false,
    };
    ob.missingThree = freshMissingThreeState();
  });
  assert.equal(record.claimed.ids.patrol, null);
  assert.deepEqual(record.claimed.ids.pickups, []);

  const h = continueFrom(record);
  const ob = h.state.onboarding;
  assert.equal(ob.claimed.active, true, 'teardown-cleared claimed flag is re-armed');
  assert.equal(ob.claimed.enteredAt, 60, 'the saved claim clock is preserved');
  assert.equal(ob.claimed.ids.pickups.length, 3, 'the spill restages all three pickups');
  for (const id of ob.claimed.ids.pickups) assert.ok(alive(h, id), `claimed pickup ${id} is live`);
  assert.ok(alive(h, ob.claimed.ids.patrol), 'the witness patrol is restaged');
  assert.ok(alive(h, ob.rescue.ids.derelict), 'the overlapping rescue rail keeps its cast');
  assert.ok(h.sys._panel, 'the panel mounts on a claimed-beat resume');

  // The honest completion path that needs no events: the 120 s decline window.
  advanceTime(h, 130);
  tick(h);
  assert.equal(ob.claimed.resolved, true, 'the restored decline timer resolves the claim');
  assert.ok(ob.beatDoneAt.claimed != null, 'the claimed beat finishes on the resumed clock');
});

test('Continue mid-swing rewinds latch state, restages the cast, re-speaks the verb — and it still completes', () => {
  const record = saveMidRail((ob) => {
    ob.currentBeat = 0;
    ob.beatDoneAt = { tether: 50 };
    ob.rescue = rescueWithSwingDone();
    // A save taken mid-attempt: latched and reeled, about to release.
    ob.rescue.current = 'swing';
    ob.rescue.beats.swing = { state: 'current' };
    ob.rescue.rockLatched = true;
    ob.rescue.rockReeled = true;
    ob.rescue.rockReleasedAfterReel = false;
  });

  const h = continueFrom(record);
  const ob = h.state.onboarding;
  const rescue = ob.rescue;
  assert.equal(rescue.current, 'swing');
  assert.equal(rescue.beats.swing.state, 'current');
  // The tether never survives a restore: a saved latch is dead state, so the
  // beat's latch/reel progress rewinds with the restaged cast.
  assert.equal(rescue.rockLatched, false, 'a saved latch rewinds — the new rock is not latched');
  assert.equal(rescue.rockReeled, false);
  assert.equal(rescue.rockReleasedAfterReel, false);
  assert.ok(alive(h, rescue.ids.rock) && alive(h, rescue.ids.derelict), 'the swing pair is restaged');
  assert.ok(alive(h, rescue.ids.asteroid) && alive(h, rescue.ids.pod) && alive(h, rescue.ids.beacon),
    'the standing pieces for the pending verbs come back too');
  assert.ok(tutorialLines(h).includes(rescueBeatLine('swing')),
    'the interrupted verb re-presents its line');
  assert.ok(h.sys._panel, 'the panel mounts on a rescue-verb resume');

  // The lesson is finishable on the restaged bodies.
  const rock = entityOf(h, rescue.ids.rock);
  const derelict = entityOf(h, rescue.ids.derelict);
  h.bus.emit('tether:latched', { targetId: rock.id });
  h.bus.emit('tether:reel', { targetId: rock.id, after: 40 });
  h.bus.emit('tether:released', { targetId: rock.id });
  assert.equal(rescue.rockReleasedAfterReel, true, 'the resumed beat tracks the re-throw');
  rock.pos.x = derelict.pos.x + 20;
  rock.pos.z = derelict.pos.z;
  rock.vel.x = -30;
  rock.vel.z = 0;
  tick(h);
  assert.equal(rescue.beats.swing.state, 'done', 'the resumed swing lesson completes');
});

test('Continue mid-tether rewinds a saved reel flag — the restaged derelict is a fresh body', () => {
  const record = saveMidRail((ob) => {
    ob.currentBeat = 0;
    ob.beatDoneAt = {};
    ob.tetherReeled = true; // saved progress on a wreck the restore cannot keep
    ob.rescue = freshRescueState();
  });

  const h = continueFrom(record);
  const ob = h.state.onboarding;
  assert.equal(ob.tetherReeled, false, 'a saved reel asks again on the fresh derelict');
  assert.ok(alive(h, h.sys._derelictId), 'the training derelict is restaged');
  assert.ok(h.sys._panel, 'the panel mounts on a main-rail resume');
  assert.ok(alive(h, ob.rescue.ids.derelict), 'the authored rescue tableau is alongside');
});

test('an active power situation saved mid-setup re-queues instead of holding a phantom lesson', () => {
  const seamBeat = BEATS.findIndex((b) => b.key === 'seam');
  const record = saveMidRail((ob) => {
    ob.currentBeat = seamBeat;
    ob.beatDoneAt = {
      tether: 10, raid: 20, claimed: 30, thrust: 40, brake: 50,
      marker: 60, focus: 70, burst: 80, disengage: 90,
    };
    ob.powerSit = { next: 1, doneAt: {}, active: { power: 'pull', placedAtS: 90 }, nextAtS: 0 };
  });
  assert.equal(record.powerSit.active.power, 'pull');

  const h = continueFrom(record);
  const ob = h.state.onboarding;
  // Transient props never serialize: the restored situation owns no entities.
  assert.equal(h.sys._powerSitIds, null, 'the restore owns no phantom props');

  tick(h);
  const sit = ob.powerSit;
  assert.equal(sit.active, null, 'the unlanded situation is unwound, not silently held');
  assert.equal(sit.next, 0, 'the consumed index rewinds so the lesson is re-offered');
  assert.ok(sit.nextAtS > h.state.simTime - 1, 'the re-offer honours the placement gap');

  // After the gap (and outside the silence window) the lesson lands for real.
  advanceTime(h, 20);
  tick(h);
  assert.ok(Array.isArray(h.sys._powerSitIds) && h.sys._powerSitIds.length > 0,
    'the re-queued power situation actually stages props');
  assert.equal(sit.active.power, 'pull');
  const props = h.sys._powerSitIds.map((id) => entityOf(h, id));
  assert.ok(props.every((e) => e && e.data && e.data.powerSituation === 'pull'),
    'the staged props belong to the resumed pull lesson');
});

test('a lost standing piece restages the authored tableau instead of fail-looping on a ghost', () => {
  const h = boot();
  h.state.onboarding = {
    active: true,
    finished: false,
    currentBeat: 0,
    beatDoneAt: { tether: 50 },
    firedFollowups: {},
    tetherReeled: false,
    tetherBreaks: 0,
    beatAction: '',
    rescue: rescueWithSwingDone(),
  };
  const rescue = h.state.onboarding.rescue;
  rescue.current = 'swing';
  rescue.beats.swing = { state: 'current' };
  h.sys._spawnRescueCast();
  const derelictId = rescue.ids.derelict;
  assert.ok(alive(h, derelictId));

  // Whatever removed the standing piece (a sweep, a venue change) — the old
  // code respawned only the working slot and the wreck was never coming back.
  entityOf(h, derelictId).alive = false;
  tick(h);
  assert.ok(rescue.ids.derelict && rescue.ids.derelict !== derelictId,
    'the whole tableau is restaged — not just the rock');
  assert.ok(alive(h, rescue.ids.derelict));
  assert.ok(alive(h, rescue.ids.rock), 'the restage keeps a live working slot');
  assert.equal(rescue.current, 'swing', 'the verb stays current — retry, never a wall');
});
