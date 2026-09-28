// Escort convoys are a scene, not a nameless hull: the contract spawns a named lead hauler plus
// wing haulers, a raider wing waits on the approach line, the free-pay "never spawned" path is
// closed, and the fee settles short when haulers die. This drives the live missions system
// against a stubbed spawn seam — no renderer, no harness.
import test from 'node:test';
import assert from 'node:assert/strict';

import { missions } from '../src/systems/missions.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { promotedPilotIdentity } from '../src/data/pilotCallsigns.js';

const DEST_SECTOR = 'sector_helios_prime';
const DEST_STATION = 'station_helios';

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) { const rows = this.handlers.get(name) || []; rows.push(fn); this.handlers.set(name, rows); }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function makeHarness({ ambushSize = 2, convoySize = 3 } = {}) {
  const state = {
    meta: { seed: 4242, playtimeS: 0 },
    seed: 4242,
    tick: 12,
    simTime: 120,
    mode: 'flight',
    playerId: 1,
    player: { credits: 50000, cargo: { items: {} }, stats: {}, researchedNodes: [] },
    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null },
    story: { beatIndex: 2, branch: null, flags: {}, chainProgress: 0 },
    world: { currentSectorId: DEST_SECTOR },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null },
    settings: { gameplay: { tutorialHints: false } },
  };
  const bus = new Bus();
  const station = {
    id: 900, alive: true, type: 'station',
    pos: { x: 3000, z: 0 },
    data: { stationId: DEST_STATION, dockRadius: 90 },
  };
  const player = { id: 1, alive: true, type: 'ship', team: 0, pos: { x: 0, z: 0 }, rot: 0, data: {} };
  state.entities.set(station.id, station);
  state.entities.set(player.id, player);
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    byStationId: new Map([[DEST_STATION, station]]),
    stations: [station],
    shipLike: [player],
    wrecks: [],
  };
  let nextEntityId = 1000;
  const helpers = {
    hash32,
    mulberry32,
    player: () => player,
    spawnEntity(spec) {
      const ent = {
        id: nextEntityId++,
        alive: true,
        type: spec.type || 'ship',
        team: spec.team,
        pos: { x: spec.pos.x, z: spec.pos.z },
        rot: 0,
        hull: spec.hull || 10,
        hullMax: spec.hullMax || 10,
        data: spec.data || {},
      };
      state.entities.set(ent.id, ent);
      state.entityIndex.shipLike.push(ent);
      return ent;
    },
  };
  missions.state = state;
  missions.bus = bus;
  missions.helpers = helpers;
  missions.registry = { get: () => null };
  missions._spawnSeq = 0;
  const m = {
    id: 'm7',
    type: 'escort',
    status: 'active',
    factionId: 'faction_mts',
    riskTier: 1,
    stationId: 'station_helios',
    destStationId: DEST_STATION,
    destSectorId: DEST_SECTOR,
    needsTargets: true,
    targetEntityIds: [],
    _escorteeId: null,
    _escorteeArrived: false,
    reward_cr: 900,
    params: { convoySize, ambushSize },
  };
  state.missions.active.push(m);
  return { state, bus, m, station, player };
}

test('an escort spawns a named lead, wing haulers, and a raider wing on the approach line', () => {
  const { state, bus, m } = makeHarness();
  missions._spawnTargetsFor(m);

  const haulers = m.targetEntityIds.map((id) => state.entities.get(id));
  assert.equal(haulers.length, 3, 'a convoy, not a lone hull');
  const lead = state.entities.get(m._escorteeId);
  assert.ok(lead, 'lead is tracked as the escortee');
  assert.equal(lead.data.escortee, 'lead');
  const pilot = promotedPilotIdentity(0, m.id);
  assert.equal(lead.data.name, pilot.name, 'the lead is a person with a callsign');
  assert.match(lead.data.scanLabel, /convoy lead$/, 'scanner names the lead');
  for (const id of m.targetEntityIds) {
    const e = state.entities.get(id);
    assert.equal(e.team, 0, 'convoy hulls are friendly');
    assert.equal(String(e.data.missionTag), String(m.id), 'convoy carries the mission tag');
    assert.ok(!e.data.ai, 'haulers run the lane on authored intent, not dogfight AI');
  }
  const wings = haulers.filter((e) => e.id !== m._escorteeId);
  assert.equal(wings.length, 2);
  assert.ok(wings.every((e) => e.data.escortee === true), 'wings are stamped as haulers');
  assert.equal(m.params.convoyTotal, 3);

  const raiders = [...state.entities.values()].filter((e) => e.data && e.data.escortAmbushOf === String(m.id));
  assert.equal(raiders.length, 2, 'a raider wing springs with the convoy');
  assert.ok(raiders.every((e) => e.team === 1), 'raiders are hostile');
  assert.ok(raiders.every((e) => e.data.ai), 'raiders keep their combat AI');
  assert.ok(raiders.every((e) => !e.data.missionTag && !e.data.missionId),
    'raiders are not objective targets (adopt/cleanup never claim them)');
  // The ambush stands between the convoy and the berth, not in a ring around the player.
  for (const e of raiders) {
    const along = e.pos.x; // convoy near origin, berth at x=3000
    assert.ok(along > 400 && along < 2600, `ambush on the approach line (x=${along.toFixed(0)})`);
  }
  const springHail = bus.log.find((row) => row.name === 'comms:popup' && /raiders on the final leg/.test(row.payload.text));
  assert.ok(springHail, 'the lead hails when the ambush springs');
  assert.equal(springHail.payload.sender, pilot.name);
});

test('skip-pays is closed: a convoy that never spawned cannot complete the contract', () => {
  const { m } = makeHarness();
  assert.equal(missions._escorteeArrivedOk({ type: 'escort', _escorteeId: null }), false,
    'never-spawned no longer auto-satisfies arrival');
  const { state, m: live } = makeHarness();
  missions._spawnTargetsFor(live);
  assert.equal(missions._escorteeArrivedOk(live), false, 'spawned but not arrived');
  live._escorteeArrived = true;
  assert.equal(missions._escorteeArrivedOk(live), true);
  assert.ok(state.entities.get(live._escorteeId), 'sanity: lead alive');
});

test('the convoy steers: wings run in trail, the lead gates arrival', () => {
  const { state, m, station } = makeHarness();
  missions._spawnTargetsFor(m);
  missions._steerEscortee(m, state, 1 / 60);
  const lead = state.entities.get(m._escorteeId);
  assert.ok(lead.data.intent.moveZ > 0, 'lead runs the lane toward the berth');
  for (const id of m.targetEntityIds) {
    if (id === m._escorteeId) continue;
    const wing = state.entities.get(id);
    assert.ok(wing.data.intent && wing.data.intent.aimAngle === wing.data.intent.aimAngle,
      'wings carry intent');
  }
  // Lead reaches the dock ring → arrival gates completion, wings hold formation behind it.
  lead.pos = { x: station.pos.x - 20, z: 0 };
  missions._steerEscortee(m, state, 1 / 60);
  assert.equal(m._escorteeArrived, true, 'lead arrival gates');
  assert.equal(lead.data.intent.moveZ, 0, 'lead eases to a hover at the dock');
});

test('a lost hauler settles the fee short, exactly once; the lead still fails the job', () => {
  const { state, bus, m } = makeHarness();
  missions._spawnTargetsFor(m);
  const wingId = m.targetEntityIds.find((id) => id !== m._escorteeId);

  // Wing dies → job survives, fee settles short at dock.
  const wing = state.entities.get(wingId);
  wing.alive = false;
  state.entities.delete(wingId);
  missions._onEntityDestroyed(wing);
  assert.equal(m.status, 'active', 'a lost hauler does not fail the contract');
  assert.equal(m.params.convoyLost, 1);
  assert.ok(bus.log.some((row) => row.name === 'toast' && /Convoy hauler down/.test(row.payload.text)));

  m._escorteeArrived = true;
  missions._settleEscortConvoyPay(m);
  assert.equal(m.reward_cr, 600, '900cr fee settles at 2/3 for two of three hulls');
  assert.equal(m.params.completionMethod, 'convoy_short');
  const settledAt = m.reward_cr;
  missions._settleEscortConvoyPay(m);
  assert.equal(m.reward_cr, settledAt, 'settlement is once');

  // Lead dies → the contract fails through the existing escortee_lost path.
  const lead = state.entities.get(m._escorteeId);
  lead.alive = false;
  state.entities.delete(lead.id);
  missions._onEntityDestroyed(lead);
  assert.equal(m.status, 'failed');
});

test('settlement releases sprung raiders to ordinary lane life and sweeps the convoy', () => {
  const { state, m } = makeHarness();
  missions._spawnTargetsFor(m);
  const raider = [...state.entities.values()].find((e) => e.data && e.data.escortAmbushOf === String(m.id));
  missions._cleanupTargets(m);
  assert.equal(raider.alive, true, 'a sprung raider outlives the contract');
  assert.equal(raider.data.escortAmbushOf, null, 'the stamp releases with the row');
  for (const id of m.targetEntityIds) {
    assert.notEqual(state.entities.get(id).alive, true, 'convoy hulls are swept with the row');
  }
});
