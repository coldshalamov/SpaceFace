// Pilot personalities (CH-61) — every ambient pilot drives differently: the
// temperament is a stable seeded stamp that changes cruise pacing, spacing,
// boost appetite, weave and approach braking through the one ambient drive site,
// and changes what the same stimulus earns (a cocky hauler keeps its load and
// runs; an ordinary one dumps). A hull with no temperament flies the historical
// default verbatim.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PILOT_PERSONALITY_IDS,
  PILOT_PERSONALITIES,
  pilotPersonalityFor,
  pilotPersonalityDef,
  pilotPersonalityDrive,
} from '../src/data/pilotPersonalities.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';
import { trafficRoleOps } from '../src/systems/trafficRoleOps.js';
import { pilotPersonalityHailFor } from '../src/data/barks.js';

void trafficBase;

const STATE = { meta: { seed: 4711 } };

function hull(id, personality = null) {
  const e = { id, alive: true, data: {}, pos: { x: 0, z: 0 }, rot: 0 };
  if (personality) e.data.pilotPersonality = personality;
  return e;
}

test('the temperament is a stable seeded stamp per hull, unchanged across reloads', () => {
  const a = pilotPersonalityFor(STATE, hull(31));
  assert.ok(PILOT_PERSONALITY_IDS.includes(a), `temperament picked from the pool (${a})`);
  assert.equal(a, pilotPersonalityFor(STATE, hull(31)), 'same hull id, same temperament');
  const fresh = { meta: { seed: 4711 } };
  assert.equal(pilotPersonalityFor(fresh, hull(31)), a, 'survives a rematerialization unchanged');
  assert.notEqual(
    PILOT_PERSONALITY_IDS.map((id) => pilotPersonalityFor(STATE, hull(id.length * 97 + id.charCodeAt(0)))),
    new Array(PILOT_PERSONALITY_IDS.length).fill(a),
    'the pool is not collapsed onto one temperament',
  );
});

test('cautious spacing: a hull ahead inside the lookahead asks for breathing room', () => {
  const def = PILOT_PERSONALITIES.cautious;
  const eased = pilotPersonalityDrive(def, { distToTarget: 900, distToHullAhead: 80, simTime: 10, hullId: 5 });
  assert.ok(eased && eased.moveZ != null && eased.moveZ < 1, `eases off behind traffic (${eased && eased.moveZ})`);
  const clear = pilotPersonalityDrive(def, { distToTarget: 900, distToHullAhead: -1, simTime: 10, hullId: 5 });
  assert.equal(clear, null, 'a clear lane flies the historical default');
});

test('cocky boost: a clear lane burns, a crowded lane does not', () => {
  const def = PILOT_PERSONALITIES.cocky;
  const clear = pilotPersonalityDrive(def, { distToTarget: 900, distToHullAhead: -1, simTime: 3, hullId: 7 });
  assert.ok(clear && clear.boost === true, 'cocky boosts on a clear lane');
  const busy = pilotPersonalityDrive(def, { distToTarget: 900, distToHullAhead: 120, simTime: 3, hullId: 7 });
  assert.ok(!busy || !busy.boost, 'cocky does not boost into traffic');
});

test('panicky weave and proximity boost', () => {
  const def = PILOT_PERSONALITIES.panicky;
  const weave = pilotPersonalityDrive(def, { distToTarget: 900, distToHullAhead: -1, simTime: 4.5, hullId: 9 });
  assert.ok(weave && Math.abs(weave.aimAngleOffset) > 0.01, 'panicky hull weaves on cruise');
  const near = pilotPersonalityDrive(def, { distToTarget: 900, distToHullAhead: 120, simTime: 4.5, hullId: 9 });
  assert.ok(near && near.boost === true, 'anything close inside 170 WU spooks the throttle');
});

test('veteran approach: one early breathing-off band before the berth', () => {
  const def = PILOT_PERSONALITIES.veteran;
  const early = pilotPersonalityDrive(def, { distToTarget: 120, distToHullAhead: -1, simTime: 1, hullId: 3 });
  assert.ok(early && early.moveZ != null && early.moveZ < 1, `brakes earlier than the historical band (${early && early.moveZ})`);
  const cruise = pilotPersonalityDrive(def, { distToTarget: 400, distToHullAhead: -1, simTime: 1, hullId: 3 });
  assert.equal(cruise, null, 'mid-leg the veteran flies the default');
});

test('no temperament means no decision: the historical default flies verbatim', () => {
  // A hull with no data bag (scenario cast and any foreign hull) never asks for one.
  assert.equal(pilotPersonalityFor(STATE, { id: 77, data: null }), null);
  assert.equal(pilotPersonalityFor(STATE, null), null);
  // And the pure decision defers: a null temperament answers nothing this tick.
  assert.equal(pilotPersonalityDrive(null, { distToTarget: 100, distToHullAhead: 50, simTime: 0, hullId: 77 }), null);
});

test('the same stimulus lands differently: cocky keeps the load, ordinary hauler dumps', () => {
  // Minimal this-context: the reaction dispatcher with its neighbours stubbed out.
  const violence = { x: 10, z: 0, t: 1000, attackerId: 2, victimId: 3 };
  function makeThis() {
    return {
      state: { simTime: 1002, world: { currentSectorId: 'sector_helios_prime' }, entities: new Map() },
      helpers: null,
      _nearbyViolence: () => violence,
      _emitCivilianViolenceFlee: () => {},
      _broadcastCivilianDistress: () => {},
      _violenceThreatScratch: {},
      _spillHaulerCargoFromViolence: () => null,
      _pickFleeStation: () => null,
      _dumpCalls: 0,
    };
  }
  function haulerEntity(kind) {
    const e = hull(64);
    e.data.trafficRole = 'hauler';
    e.data.role = 'hauler';
    if (kind) e.data.pilotPersonality = kind;
    return e;
  }
  const rec = { role: 'hauler' };
  const stations = [{ id: 'a', pos: { x: -400, z: 0 } }, { id: 'b', pos: { x: 400, z: 0 } }];

  const cocky = makeThis();
  const okCocky = trafficRoleOps._reactCivilianViolence.call(cocky, haulerEntity('cocky'), rec, stations, cocky.state);
  assert.equal(okCocky, true, 'cocky hull still writes its own intent');
  assert.equal(rec.civilianReaction, 'hold_cargo_flee', 'cocky keeps the load and just runs');

  const plain = makeThis();
  plain._spillHaulerCargoFromViolence = function () { this._dumpCalls += 1; return null; };
  trafficRoleOps._reactCivilianViolence.call(plain, haulerEntity(null), rec, stations, plain.state);
  assert.equal(plain._dumpCalls, 1, 'an ordinary hauler dumps as before');
  assert.equal(rec.civilianReaction, 'dump_cargo');

  const jumpy = makeThis();
  jumpy._spillHaulerCargoFromViolence = function () { this._dumpCalls += 1; return null; };
  trafficRoleOps._reactCivilianViolence.call(jumpy, haulerEntity('panicky'), rec, stations, jumpy.state);
  assert.equal(jumpy._dumpCalls, 1, 'panicky dumps at the first whiff of violence');
});

test('the temperament speaks its own register on a close pass', () => {
  const cocky = pilotPersonalityHailFor('cocky', 0);
  assert.ok(cocky && cocky.register === 'pilot-cocky' && cocky.text.length > 0);
  for (const kind of PILOT_PERSONALITY_IDS) {
    assert.ok(pilotPersonalityHailFor(kind, 3), `${kind} has a hail line`);
  }
  assert.equal(pilotPersonalityHailFor('standard', 0), null, 'untemperamented hulls keep their role register');
});
