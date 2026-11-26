import test from 'node:test';
import assert from 'node:assert/strict';

import { BEATS, onboarding } from '../src/systems/onboarding.js';
import { createChaseCamera } from '../src/render/camera.js';
import { CameraDirectorMode } from '../src/render/cameraDirector.js';
import { tableWorldToScreen } from '../src/render/tabletopPolicy.js';

// INF-061 — the first real encounter teaches a physical discovery: the raid beat stages a
// vulnerable enemy (crippled drifting raider), a useful anchor (a big rock downrange), and
// a clear release line (raider between the player and the rock). A genuine player-caused
// whip impact completes the lesson on real ratings — no kill required, no fake physics,
// no hidden damage bonus — while ordinary guns stay a viable, slower path.

const RAID_INDEX = BEATS.findIndex((beat) => beat.key === 'raid');

function drive() {
  assert.ok(RAID_INDEX >= 0, 'the raid beat must exist on the route');
  let nextId = 100;
  const entities = new Map();
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
  };
  entities.set(1, player);
  const wall = {
    id: 50, type: 'asteroid', alive: true, pos: { x: 900, z: 100 }, vel: { x: 0, z: 0 },
    radius: 40, hull: 9000, hullMax: 9000,
  };
  entities.set(50, wall);
  const events = [];
  const state = {
    tick: 10,
    simTime: 5,
    playerId: 1,
    entities,
    entityList: [player, wall],
    player: { targetId: null },
    onboarding: {
      active: true,
      finished: false,
      currentBeat: RAID_INDEX,
      beatDoneAt: {},
      beatAction: null,
      tutorialLog: [],
      rescue: { ids: { asteroid: 50 } },
    },
  };
  const system = Object.create(onboarding);
  system.state = state;
  system.bus = { on() { return () => {}; }, emit: (event, payload) => events.push({ event, payload }) };
  system.helpers = {
    spawnEntity(spec) {
      const entity = {
        id: nextId++,
        occupantGeneration: nextId,
        alive: true,
        vel: { x: 0, z: 0 },
        ...spec,
        pos: { x: spec.pos.x, z: spec.pos.z },
        data: spec.data ? { ...spec.data } : {},
      };
      entities.set(entity.id, entity);
      return entity;
    },
    removeEntity(id) { entities.delete(id); },
  };
  system._lastTextAtS = 0;
  return { system, state, events, player, wall };
}

function bearing(from, to) {
  return Math.atan2(to.z - from.z, to.x - from.x);
}

function angleDelta(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

test('INF-061: the raid stages a vulnerable enemy, an anchor, and a release line', () => {
  const { system, state, player } = drive();
  system._enterRaidBeat();
  const raid = state.onboarding.raid;
  assert.ok(raid && raid.active, 'the beat stages its cast on the new-game route');
  const raider = state.entities.get(raid.ids.raider);
  const rock = state.entities.get(raid.ids.throwRock);
  const hauler = state.entities.get(raid.ids.hauler);
  assert.ok(raider && rock && hauler, 'raider, throw rock, and hauler all exist');

  // Vulnerable: crippled, unshielded, unarmed, passive — but a REAL hull and REAL mass.
  assert.equal(raider.data.onboardingRaid, true);
  assert.equal(raider.shieldMax || raider.shield, 0, 'no shield to chew through first');
  assert.deepEqual(raider.data.weapons, [], 'it cannot shoot back');
  assert.equal(raider.data.ai && raider.data.ai.passive, true, 'it drifts, it does not duel');
  assert.ok(raider.hullMax >= 100, `a genuine hull to cave (${raider.hullMax}), not a 1-HP prop`);
  assert.ok((raider.mass || 0) >= 100, `genuine mass so the throw carries momentum (${raider.mass})`);
  assert.ok(!raider.data.invuln && raider.data.damageTakenMult == null, 'no hidden damage bonus either way');

  // Anchor: a solid rock, not a painted backdrop.
  assert.ok((rock.hullMax || 0) >= 1000, 'the anchor is solid enough to throw against');
  assert.ok((rock.mass || 0) > (raider.mass || 0) * 5, 'and heavy enough to stop the lesson');

  // Clear geometry: the raider hangs between the player and the rock on one bearing.
  const toRaider = Math.hypot(raider.pos.x - player.pos.x, raider.pos.z - player.pos.z);
  const toRock = Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z);
  assert.ok(toRock > toRaider, 'the rock is downrange of the raider');
  const spread = angleDelta(bearing(player.pos, raider.pos), bearing(player.pos, rock.pos));
  assert.ok(spread < 0.35, `one release line, not a search pattern (spread ${spread.toFixed(3)} rad)`);
});

test('INF-061: a genuine thrown-raider impact completes the lesson with no kill', () => {
  const { system, state, events } = drive();
  system._enterRaidBeat();
  const raid = state.onboarding.raid;
  const raider = state.entities.get(raid.ids.raider);
  const rock = state.entities.get(raid.ids.throwRock);

  // A glancing contact is not the lesson.
  system._onRaidWhipImpact({ targetId: raider.id, victimId: rock.id, rating: 'graze' });
  assert.equal(state.onboarding.beatDoneAt.raid, undefined, 'a graze teaches nothing');

  // The thrown raider striking the rock as a projectile IS the lesson — hull intact or not.
  system._onRaidWhipImpact({ targetId: raider.id, victimId: rock.id, rating: 'solid' });
  assert.ok(state.onboarding.beatDoneAt.raid != null, 'a solid player-caused collision completes the beat');
  assert.equal(raider.alive, true, 'no kill was required or granted');
  const milestone = events.find((e) => e.event === 'firsthour:milestone' && e.payload.milestone === 'momentumKill');
  assert.ok(milestone, 'the thesis moment is recorded');
  assert.equal(milestone.payload.cause, 'throwImpact');
});

test('a missing throw rock is replaced ahead of the held Raider without taking another body’s slot', () => {
  const { system, state, player } = drive();
  state.mode = 'flight';
  state.nav = {};
  system._enterRaidBeat();
  const raid = state.onboarding.raid;
  const raider = state.entities.get(raid.ids.raider);
  const oldRock = state.entities.get(raid.ids.throwRock);
  const hauler = state.entities.get(raid.ids.hauler);
  const wing = state.entities.get(raid.ids.wing);
  const line = state.player.tether = { active: true, targetId: raider.id };
  const recycled = { ...oldRock, occupantGeneration: oldRock.occupantGeneration + 400, radius: 60, data: {} };
  state.entities.set(oldRock.id, recycled);

  system._onRaidWhipImpact({ targetId: raider.id, victimId: recycled.id, rating: 'solid' });
  assert.equal(state.onboarding.beatDoneAt.raid, undefined);
  system._resolveRaidDone();
  system._setObjectiveWaypoint(true);
  const replacement = state.entities.get(raid.ids.throwRock);
  assert.notEqual(replacement.id, oldRock.id);
  assert.notEqual(replacement.occupantGeneration, oldRock.occupantGeneration);
  assert.equal(replacement.data.typeId, oldRock.data.typeId);
  assert.equal(replacement.mass, oldRock.mass);
  assert.ok(Math.hypot(replacement.pos.x - recycled.pos.x, replacement.pos.z - recycled.pos.z)
    > replacement.radius + recycled.radius, 'the occupied straight-ahead berth is skipped');
  assert.ok(angleDelta(bearing(player.pos, raider.pos), bearing(raider.pos, replacement.pos)) <= Math.PI / 8);
  assert.equal(state.player.tether, line);
  assert.equal(state.entities.get(raid.ids.raider), raider);
  assert.equal(state.entities.get(raid.ids.hauler), hauler);
  assert.equal(state.entities.get(raid.ids.wing), wing);
  assert.equal(state.nav.waypoint.presentationEntityId, replacement.id);
  assert.equal(state.nav.waypoint.presentationEntityGeneration, replacement.occupantGeneration);
  assert.equal(state.onboarding.beatDoneAt.raid, undefined);
  system._resolveRaidDone();
  assert.equal(state.entities.get(raid.ids.throwRock), replacement, 'following updates keep the same target');

  system._onRaidWhipImpact({ targetId: raider.id, victimId: replacement.id, rating: 'solid' });
  assert.equal(state.onboarding.beatDoneAt.raid, state.simTime);
  system._removeRaidActors();
  assert.equal(state.entities.get(recycled.id), recycled);
});

test('the held Raider and its marked rock stay in the Overhead work view as the pilot starts a swing', () => {
  const { system, state, player, wall } = drive();
  system._enterRaidBeat();
  const raid = state.onboarding.raid;
  const raider = state.entities.get(raid.ids.raider);
  const rock = state.entities.get(raid.ids.throwRock);
  raider.pos = { x: 24, z: -49 };
  rock.pos = { x: -43, z: 119.5 };
  state.mode = 'flight';
  state.nav = {};
  state.settings = { video: { fov: 50 }, gameplay: { steeringView: 'overhead' } };
  state.camera = { zoom: 144, tilt: 60, lookAhead: 18, lerp: 6, trauma: 0 };
  state.input = {};
  state.player.targetId = wall.id;
  const viewport = { width: 1280, height: 720 };
  const camera = createChaseCamera(state, { innerWidth: viewport.width, innerHeight: viewport.height });
  camera.snapToPlayer();
  const settle = () => { for (let tick = 0; tick < 240; tick++) camera.follow(1 / 60); };
  const project = body => tableWorldToScreen(state, viewport, body.pos, {});

  system._setObjectiveWaypoint(true);
  assert.equal(state.nav.waypoint.presentationEntityId, undefined, 'approaching the Raider uses normal flight');
  state.player.tether = { active: true, targetId: raider.id };
  system._setObjectiveWaypoint(true);
  settle();
  assert.equal(camera.composition().mode, CameraDirectorMode.INDUSTRIAL);
  assert.equal(state.nav.waypoint.presentationEntityId, rock.id);
  assert.equal(state.nav.waypoint.presentationEntityGeneration, rock.occupantGeneration);
  for (const body of [player, raider, rock]) {
    const screen = project(body);
    assert.ok(screen.onScreen && screen.x > 64 && screen.x < 1216 && screen.y > 36 && screen.y < 684,
      `${body.id} projects to ${screen.x}, ${screen.y} at zoom ${camera.composition().zoom}`);
  }
  player.vel.x = 90;
  settle();
  assert.equal(camera.composition().mode, CameraDirectorMode.INDUSTRIAL);
  assert.equal(project(rock).onScreen, true);
  assert.equal(state.player.targetId, wall.id, 'the camera does not change the existing selection');
  assert.equal(state.nav.waypoint.targetEntityId, undefined, 'the marker does not set a release target');

  state.entities.set(rock.id, { ...rock, occupantGeneration: rock.occupantGeneration + 1 });
  camera.follow(1 / 60);
  assert.equal(camera.composition().mode, CameraDirectorMode.RECOVER, 'a recycled rock loses framing');
  state.player.tether = { active: true, targetId: wall.id };
  system._setObjectiveWaypoint(true);
  settle();
  assert.equal(state.nav.waypoint.presentationEntityId, undefined, 'another attachment does not renew framing');
  assert.equal(camera.composition().mode, CameraDirectorMode.FOLLOW);
});

test('INF-061: ordinary guns stay viable — refusal only delays, never blocks', () => {
  const { system, state, events } = drive();
  system._enterRaidBeat();
  const firstRaider = state.onboarding.raid.ids.raider;
  // First gun kill: the lesson retries with a fresh raider instead of resolving.
  system._onRaidKilled({ id: firstRaider, killerId: 1 });
  assert.equal(state.onboarding.beatDoneAt.raid, undefined, 'the first refusal re-teaches');
  assert.ok(state.onboarding.raid.ids.raider !== firstRaider, 'a fresh raider is staged');
  // Second gun kill: the world moves on — combat was always a real path.
  system._onRaidKilled({ id: state.onboarding.raid.ids.raider, killerId: 1 });
  assert.ok(state.onboarding.beatDoneAt.raid != null, 'the second refusal resolves the beat');
  const milestone = events.find((e) => e.event === 'firsthour:milestone' && e.payload.milestone === 'momentumKill');
  assert.equal(milestone && milestone.payload.cause, 'guns');
});
