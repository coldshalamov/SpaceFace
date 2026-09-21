import test from 'node:test';
import assert from 'node:assert/strict';

import { aiPorts } from '../src/systems/aiPorts.js';

// INF-029 — a lost contact actually becomes uncertain.
//
// A CONTROL-dispatched responder carries its offender as a reported track. That track used to
// stream the offender's LIVE position at confidence 1 every tick — pursuit never noticed losing
// perception. Now the track reports the dispatch-time last-seen position as unseen at reported
// confidence; live sightings still win outright, so reacquisition restores accurate behavior.

function makePlayer(x, z) {
  return {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, radius: 14,
    hull: 140, hullMax: 140, cap: 80, capMax: 80,
    data: {},
  };
}

function makeResponder() {
  return {
    id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 14,
    hull: 200, hullMax: 200, cap: 200, capMax: 200,
    data: {
      ai: {
        archetype: 'brawler',
        lawful: true,
        motive: 'jurisdiction_enforcement',
        engagementTrigger: 'security_response',
        zoneId: 'jurisdiction:station_helios',
        approachTelegraph: 'patrol_challenge',
        noFireResponseWindowS: 1,
        combatDoctrineId: 'interceptor_flyby',
        roe: 'weapons_free',
        securityTargetId: 1,
        securityTargetPos: { x: 100, z: 50 },
      },
    },
  };
}

function makeState(player, responder) {
  return {
    tick: 600,
    playerId: 1,
    entities: new Map([[1, player], [2, responder]]),
    entityList: [player, responder],
    combat: { entities: {} },
    aiEncounter: { schemaVersion: 1, nextSeq: 1, commands: [] },
  };
}

function frameFor(state, entityId) {
  // Radial filter over the live list: sensing the player inside sensor range is real.
  const helpers = {
    queryRadius(pos, range, out) {
      out.length = 0;
      for (const e of state.entityList) {
        if (!e || !e.pos) continue;
        const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
        if (dx * dx + dz * dz <= range * range) out.push(e);
      }
      return out;
    },
  };
  const bus = { on() { return () => {}; }, emit() {} };
  aiPorts.init({ state, bus, helpers });
  try {
    return helpers.aiSensors.frameFor(entityId, state.tick);
  } finally {
    aiPorts._pendingManeuvers = new Map();
  }
}

test('a beyond-sensor offender reads as last-seen, not live', () => {
  const player = makePlayer(3000, 0);
  const state = makeState(player, makeResponder());
  const frame = frameFor(state, 2);
  const track = frame.contacts.find((c) => c.id === 1);
  assert.ok(track, 'the reported track keeps the responder closing on the scene');
  assert.deepEqual({ x: track.pos.x, z: track.pos.z }, { x: 100, z: 50 });
  assert.equal(track.visible, false, 'reported, not sensed');
  assert.ok(track.confidence < 1, `reported confidence, got ${track.confidence}`);
});

test('reacquisition restores the live picture', () => {
  const player = makePlayer(200, 60);
  const state = makeState(player, makeResponder());
  const frame = frameFor(state, 2);
  const track = frame.contacts.find((c) => c.id === 1);
  assert.ok(track, 'sensed contact present');
  assert.deepEqual({ x: track.pos.x, z: track.pos.z }, { x: 200, z: 60 });
  assert.equal(track.visible, true, 'a live sighting wins over the report');
});
