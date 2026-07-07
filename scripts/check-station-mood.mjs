// T8e backend gate: Station Mood.
//
// This is the cross-surface proof that the BP-11 station-life packets read as one coherent
// station "mood" in shipped code: silhouette label, station rings, ambient broadcast, no-fire
// comms, and seeded side-events all agree by station type. It is intentionally check-only.
import assert from 'node:assert/strict';

import { STATION_TYPES } from '../src/data/sectors.js';
import { bubblesFor, createNoFireWatch, BUBBLE_COLORS } from '../src/data/stationBubbles.js';
import { STATION_GLYPHS, glyphForStationType } from '../src/data/stationGlyphs.js';
import {
  AMBIENT_PRIORITY,
  CADENCE_S,
  STATION_BROADCASTS,
  stationBroadcast,
} from '../src/systems/stationBroadcast.js';
import { planStationSideEvents, SIDE_EVENTS } from '../src/data/stationSideEvents.js';
import { stationSideEventDirector as stationSideEventDirectorBase, ensureState } from '../src/systems/stationSideEventDirector.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

const MOOD_EXPECTATIONS = Object.freeze({
  trade_hub: {
    label: 'Market',
    tic: 'gantry_cycle',
    words: ['approach', 'convoy', 'gantries'],
  },
  refinery: {
    label: 'Refinery',
    tic: 'vent_flare',
    words: ['venting', 'slag', 'ore', 'tailings'],
  },
  mining: {
    label: 'Mine',
    tic: 'charge_flash',
    words: ['claim', 'survey', 'charges', 'belt'],
  },
  fab: {
    label: 'Foundry',
    tic: 'weld_bloom',
    words: ['foundry', 'casting', 'assembly', 'module'],
  },
  military: {
    label: 'Military',
    tic: 'beacon_strobe',
    words: ['perimeter', 'patrol', 'weapons', 'launch'],
  },
  blackmarket: {
    label: 'Cache',
    tic: 'low_ping',
    words: ['manifests', 'questions', 'coin', 'never here'],
  },
  research: {
    label: 'Research',
    tic: 'dish_sweep',
    words: ['array', 'telemetry', 'sensor', 'dish'],
  },
});

testStationMoodCatalog();
testBroadcastsSpeakTheStationType();
testNoFireRingMoodCue();
testSideEventMoodByStationType();
testDirectorIsVisibleOnlyAndSilent();

console.log('PASS  check:station-mood');

function testStationMoodCatalog() {
  assert.deepEqual(Object.keys(MOOD_EXPECTATIONS).sort(), [...STATION_TYPES].sort(),
    'station-mood expectations must cover exactly the shipped station types');
  assert.deepEqual(Object.keys(STATION_GLYPHS).sort(), [...STATION_TYPES].sort(),
    'station glyph table must stay total over shipped station types');

  for (const typeId of STATION_TYPES) {
    const expected = MOOD_EXPECTATIONS[typeId];
    const glyph = glyphForStationType(typeId);
    const broadcast = STATION_BROADCASTS[typeId];
    assert.equal(glyph.label, expected.label, `${typeId}: silhouette label must carry the mood`);
    assert.equal(broadcast.tic, expected.tic, `${typeId}: broadcast tic must match the station mood`);

    const speech = broadcast.lines.join(' ').toLowerCase();
    assert.ok(expected.words.some((word) => speech.includes(word)),
      `${typeId}: broadcast lines need a type-specific cue (${expected.words.join(', ')})`);

    const station = makeStation({ stationTypeId: typeId, size: 'L', dockRadius: 100 });
    const rings = bubblesFor(station);
    assert.equal(rings.noFire.color, BUBBLE_COLORS.noFire, `${typeId}: no-fire ring uses the warning color`);
    assert.equal(rings.docking.color, BUBBLE_COLORS.docking, `${typeId}: docking ring uses the approach color`);
    assert.equal(rings.patrol.color, BUBBLE_COLORS.patrol, `${typeId}: patrol ring uses the patrol color`);
    assert.equal(rings.traffic.color, BUBBLE_COLORS.traffic, `${typeId}: traffic ring uses the traffic color`);
    assert.ok(rings.noFire.radius < rings.docking.radius, `${typeId}: noFire < docking`);
    assert.ok(rings.docking.radius < rings.patrol.radius, `${typeId}: docking < patrol`);
    assert.ok(rings.patrol.radius < rings.traffic.radius, `${typeId}: patrol < traffic`);
  }
}

function testBroadcastsSpeakTheStationType() {
  guarded(() => {
    for (const typeId of STATION_TYPES) {
      const { ctx, busLog, sayCalls } = makeBroadcastCtx({ stationTypeId: typeId });
      const sys = freshBroadcast();
      sys.init(ctx);
      sys._tick();
      sys._tick();
      assert.equal(sayCalls.length, 1, `${typeId}: one ambient line during the cadence window`);
      assert.equal(sayCalls[0].channel, 'ambient', `${typeId}: station mood is ambient, not mission voice`);
      assert.equal(sayCalls[0].priority, AMBIENT_PRIORITY, `${typeId}: station mood keeps lowest priority`);
      assert.ok(STATION_BROADCASTS[typeId].lines.includes(sayCalls[0].text),
        `${typeId}: spoken text must come from that station type`);

      const tics = busLog.filter((entry) => entry.evt === 'station:broadcastTic');
      assert.equal(tics.length, 1, `${typeId}: one visual tic seam with the mood line`);
      assert.equal(tics[0].payload.stationTypeId, typeId, `${typeId}: tic seam names the type`);
      assert.equal(tics[0].payload.tic, MOOD_EXPECTATIONS[typeId].tic, `${typeId}: tic seam carries the mood tic`);

      ctx.state.simTime += CADENCE_S + 1;
      sys._tick();
      assert.equal(sayCalls.length, 2, `${typeId}: cadence permits a later mood line`);
      sys.destroy();
    }
  });
}

function testNoFireRingMoodCue() {
  const station = makeStation({ stationTypeId: 'military', size: 'L', dockRadius: 100 });
  const rings = bubblesFor(station);
  const inside = { x: station.pos.x + Math.max(1, rings.noFire.radius - 10), z: station.pos.z };
  const outside = { x: station.pos.x + rings.traffic.radius + 200, z: station.pos.z };
  const calls = [];
  const watch = createNoFireWatch({ say: (msg) => calls.push(msg) });

  assert.equal(watch.weaponDrawn(outside, [station]), null, 'outside the no-fire core, weapons draw is quiet');
  const first = watch.weaponDrawn(inside, [station]);
  assert.equal(first, station.id, 'inside the no-fire core, the station names itself as the source');
  assert.equal(calls.length, 1, 'first weapon draw inside no-fire speaks exactly once');
  assert.equal(calls[0].channel, 'warn', 'no-fire mood uses the warn channel');
  assert.equal(calls[0].kind, 'noFireZone', 'no-fire cue is typed for UI/comms consumers');
  assert.equal(calls[0].factionId, station.factionId, 'no-fire cue keeps station faction attribution');

  watch.weaponDrawn(inside, [station]);
  assert.equal(calls.length, 1, 'staying inside the no-fire core does not chatter');
  watch.update(outside, [station]);
  watch.weaponDrawn(inside, [station]);
  assert.equal(calls.length, 2, 'leaving and re-entering rearms the warning');
}

function testSideEventMoodByStationType() {
  guarded(() => {
    for (const typeId of STATION_TYPES) {
      const schedule = planStationSideEvents(17, 'sector_mood', 2, `station_${typeId}`, typeId);
      assert.ok(schedule.length >= 3 && schedule.length <= 5, `${typeId}: station day has 3-5 ambient events`);
      assert.ok(schedule[0].delay <= 90, `${typeId}: first side-event lands within the readable window`);
      for (const item of schedule) {
        assert.ok(SIDE_EVENTS[item.kind], `${typeId}: ${item.kind} exists in the side-event catalog`);
        const affinity = SIDE_EVENTS[item.kind].affinity;
        assert.ok(affinity == null || affinity.includes(typeId),
          `${typeId}: ${item.kind} must fit the station type`);
      }
    }

    for (let seed = 0; seed < 40; seed++) {
      const hidden = planStationSideEvents(seed, 'sector_mood', 0, 'station_cache', 'blackmarket');
      assert.ok(hidden.every((item) => item.kind !== 'patrol_launch'),
        'blackmarket station mood must not schedule overt patrol launches');
    }

    let patrolSeed = null;
    for (let seed = 0; seed < 80; seed++) {
      const military = planStationSideEvents(seed, 'sector_mood', 0, 'station_fort', 'military');
      if (military.some((item) => item.kind === 'patrol_launch')) {
        patrolSeed = seed;
        break;
      }
    }
    assert.notEqual(patrolSeed, null, 'military station mood can schedule a patrol launch');
  });
}

function testDirectorIsVisibleOnlyAndSilent() {
  guarded(() => {
    const far = makeDirectorCtx({ stationTypeId: 'research', stationDist: 5000 });
    const farSys = freshDirector();
    farSys.init(far.ctx);
    drive(farSys, far.state, 140);
    assert.equal(far.busLog.filter((entry) => entry.evt === 'station:sideEvent').length, 0,
      'off-screen stations do not emit mood side-events');
    assert.deepEqual(Object.keys(ensureState(far.state).plannedKeys), [],
      'off-screen stations do not even plan side-events');
    assert.equal(far.voiceCalls.length, 0, 'station side-events never use voice');

    const near = makeDirectorCtx({ stationTypeId: 'research', stationDist: 240 });
    const nearSys = freshDirector();
    nearSys.init(near.ctx);
    drive(nearSys, near.state, 140);
    const seams = near.busLog.filter((entry) => entry.evt === 'station:sideEvent');
    assert.ok(seams.length >= 1, 'visible stations emit at least one ambient side-event');
    assert.equal(near.voiceCalls.length, 0, 'visible side-events are visual seams, not chatter');
    assert.ok(seams.every((entry) => entry.payload.kind === 'repair_drone'),
      'research station side-event mood stays on the universal quiet repair-drone event');

    const repeat = makeDirectorCtx({ stationTypeId: 'research', stationDist: 240 });
    const repeatSys = freshDirector();
    repeatSys.init(repeat.ctx);
    drive(repeatSys, repeat.state, 140);
    const signature = seams.map((entry) => `${entry.payload.eventId}:${entry.payload.kind}`);
    const repeatSignature = repeat.busLog
      .filter((entry) => entry.evt === 'station:sideEvent')
      .map((entry) => `${entry.payload.eventId}:${entry.payload.kind}`);
    assert.deepEqual(repeatSignature, signature, 'station side-event mood is deterministic');
  });
}

function makeStation({
  stationTypeId = 'trade_hub',
  id = 'station_mood',
  factionId = 'faction_scn',
  size = 'M',
  dockRadius = 80,
  pos = { x: 120, z: 0 },
} = {}) {
  return {
    id,
    type: 'station',
    alive: true,
    factionId,
    size,
    dockRadius,
    pos,
    data: { stationId: id, stationTypeId, factionId, dockRadius, size },
  };
}

function makeBus() {
  const handlers = new Map();
  const busLog = [];
  return {
    busLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) {
      busLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function makeBroadcastCtx({ stationTypeId }) {
  const bus = makeBus();
  const sayCalls = [];
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const station = makeStation({ stationTypeId, id: `station_${stationTypeId}`, pos: { x: 180, z: 0 } });
  const state = {
    mode: 'flight',
    simTime: 100,
    playerId: 1,
    entities: new Map([[player.id, player], [station.id, station]]),
    entityList: [player, station],
  };
  const ctx = {
    bus,
    state,
    helpers: { voice: { say: (msg) => { sayCalls.push(msg); return true; } } },
    registry: { get: (name) => name === 'voiceArbiter' ? { queue: { active: null, pending: [] } } : null },
  };
  return { ctx, state, station, sayCalls, busLog: bus.busLog };
}

function makeDirectorCtx({ stationTypeId, stationDist }) {
  const bus = makeBus();
  const voiceCalls = [];
  const player = { id: 1, type: 'ship', alive: true, team: 1, pos: { x: 0, z: 0 } };
  const station = makeStation({
    stationTypeId,
    id: `station_${stationTypeId}`,
    pos: { x: stationDist, z: 0 },
    dockRadius: 80,
  });
  const state = {
    mode: 'flight',
    simTime: 0,
    playerId: 1,
    meta: { seed: 23 },
    world: { currentSectorId: 'sector_mood' },
    entities: new Map([[player.id, player], [station.id, station]]),
    entityList: [player, station],
    entityIndex: { stations: [station] },
    player: { credits: 5000, flags: {} },
    ui: {},
  };
  const ctx = {
    bus,
    state,
    helpers: { voice: { say: (msg) => { voiceCalls.push(msg); return true; } } },
  };
  return { ctx, state, station, voiceCalls, busLog: bus.busLog };
}

function freshBroadcast() {
  return { ...stationBroadcast };
}

function freshDirector() {
  return { ...stationSideEventDirectorBase };
}

function drive(sys, state, seconds) {
  for (let i = 0; i < seconds; i++) {
    state.simTime += 1;
    sys.update(1, state);
  }
}

function guarded(fn) {
  const oldRandom = Math.random;
  const oldNow = Date.now;
  Math.random = () => { throw new Error('Math.random in station-mood backend path'); };
  Date.now = () => { throw new Error('Date.now in station-mood backend path'); };
  try {
    return fn();
  } finally {
    Math.random = oldRandom;
    Date.now = oldNow;
  }
}
