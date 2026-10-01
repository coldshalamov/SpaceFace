// NXB-038 — a failed job leaves a playable continuation, and the survivors stay in the world.
//
//   * NXI-149: a plainly settled failure names the actual failed condition, not just the title.
//   * NXI-150: losing the convoy lead releases the surviving wing haulers to lane life —
//     the contract no longer owns their hulls, and the world keeps what the fight left.
//   * Disabled-helper readout: a drive-dead convoy hull is spoken once as a towable loss,
//     not a silent stall that only the deadline can ever settle.
//   * NXI-152 shape pin: the mutation successor carries a depth and a second failure closes.
import test from 'node:test';
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { missions } from '../src/systems/missions.js';

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }

  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }

  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function escortOffer(overrides = {}) {
  return {
    id: 'offer_escort_nxb038',
    type: 'escort',
    stationId: 'station_helios',
    factionId: 'faction_mts',
    params: { targetStrength: 1, convoySize: 2 },
    reward_cr: 900,
    collateral_cr: 0,
    riskTier: 2,
    destStationId: 'station_forge',
    destSectorId: 'sector_vesta_forge',
    distance: 2400,
    title: 'Escort the relief convoy',
    summary: 'Keep the convoy intact to Forge Foundry.',
    source: 'careerContract',
    ...overrides,
  };
}

function baseState(offers) {
  const boards = {};
  for (const offer of [].concat(offers)) {
    boards[offer.stationId] = boards[offer.stationId] || { refreshEpoch: 0, slots: [] };
    boards[offer.stationId].slots.push(offer);
  }
  return {
    meta: { seed: 47, playtimeS: 0 },
    seed: 47,
    tick: 0,
    simTime: 20,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 5000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 20, capMass: 20, usedVolume: 0, usedMass: 0 },
      stats: {},
    },
    missions: {
      boards,
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: { faction_mts: { rep: 500 } },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    combat: { entities: {}, beams: [] },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function boot(offers) {
  const state = baseState(offers);
  const bus = new Bus();
  const missionSystem = { ...missions };
  const helpers = { hash32, mulberry32, voice: { say: () => true } };
  const registry = { get: () => null };
  missionSystem.init({ state, bus, helpers, registry });
  return { state, bus, missionSystem };
}

function wingHull(id, missionId) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 100, z: 40 },
    vel: { x: 0, z: 0 },
    data: {
      missionTag: missionId,
      escortee: true,
      name: null,
      intent: { moveX: 0, moveZ: 0.8, boost: true, fire: false, fireGroup: null, aimAngle: 0 },
    },
  };
}

function toasts(bus) {
  return bus.log.filter((e) => e.name === 'toast').map((e) => e.payload);
}

test('a plain failure toast names the condition that failed', () => {
  const { state, bus, missionSystem } = boot(escortOffer());
  bus.emit('ui:acceptMission', { missionId: 'offer_escort_nxb038' });
  const m = state.missions.active[0];
  assert.ok(m, 'escort accepted');
  missionSystem._failMission(m, 0, 'escort_abandoned');

  const failToast = toasts(bus).find((t) => /^Mission FAILED:/.test(t.text || ''));
  assert.ok(failToast, 'the failure still speaks');
  assert.match(failToast.text, /convoy was left behind/,
    'the toast names the actual failed condition, not just the title');
});

test('escortee_lost releases surviving convoy wings instead of despawning them', () => {
  const { state, bus, missionSystem } = boot(escortOffer());
  bus.emit('ui:acceptMission', { missionId: 'offer_escort_nxb038' });
  const m = state.missions.active[0];
  const wing = wingHull(91, m.id);
  const wingTwo = wingHull(92, m.id);
  state.entities.set(91, wing); state.entityList.push(wing);
  state.entities.set(92, wingTwo); state.entityList.push(wingTwo);
  m.targetEntityIds = [555, 91, 92];
  m._escorteeId = 555;

  // The lead dies; the failure mutates to a salvage successor.
  bus.emit('entity:destroyed', { id: 555, type: 'ship', pos: { x: 60, z: 10 } });

  const successor = state.missions.active.find((x) => x && x.mutatedFromMissionId === m.id);
  assert.ok(successor, 'the loss still mints the salvage continuation');
  for (const w of [wing, wingTwo]) {
    assert.equal(w.alive, true, `wing ${w.id} must survive the settlement`);
    assert.equal(w.data.escortee, null, 'the released hull is no longer contract-bound');
    assert.equal(w.data.missionTag, null, 'the released hull carries no mission identity');
  }
});

test('a completed escort still sweeps its convoy at dock', () => {
  const { state, bus, missionSystem } = boot(escortOffer());
  bus.emit('ui:acceptMission', { missionId: 'offer_escort_nxb038' });
  const m = state.missions.active[0];
  const wing = wingHull(91, m.id);
  state.entities.set(91, wing); state.entityList.push(wing);
  m.targetEntityIds = [91];
  m.status = 'completed';
  missionSystem._cleanupTargets(m);
  assert.equal(wing.alive, false, 'a finished job sweeps the convoy — crew dispersal, not a scene');
});

test('a drive-dead convoy hull speaks once as a towable loss', () => {
  const { state, bus, missionSystem } = boot(escortOffer());
  bus.emit('ui:acceptMission', { missionId: 'offer_escort_nxb038' });
  const m = state.missions.active[0];
  const lead = {
    id: 555, type: 'ship', alive: true, team: 0,
    pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 },
    data: { missionTag: m.id, escortee: 'lead', intent: { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 } },
  };
  state.entities.set(555, lead); state.entityList.push(lead);
  m._escorteeId = 555;
  m.targetEntityIds = [555];
  state.combat.entities['555'] = {
    subsystems: { subsystem_drive: { effectiveDisabled: true } },
    capabilities: { drive: false },
  };

  missionSystem._steerEscortee(m, state, 1 / 60);
  const pops = bus.log.filter((e) => e.name === 'comms:popup');
  assert.equal(pops.length, 1, 'the dead drive is spoken exactly once');
  assert.match(pops[0].payload.text, /line on the hull|dead in the water/i,
    'the line names the real continuation — a taut tow, not a reset');
  assert.equal(m.params.helperDisabledSaid, true, 'the once-guard rides the save');

  missionSystem._steerEscortee(m, state, 1 / 60);
  assert.equal(bus.log.filter((e) => e.name === 'comms:popup').length, 1, 'it does not repeat');
});

test('a second failure closes the job rather than spawning retries forever', () => {
  const { state, bus } = boot(escortOffer());
  bus.emit('ui:acceptMission', { missionId: 'offer_escort_nxb038' });
  const m = state.missions.active[0];
  m._escorteeId = 555;
  bus.emit('entity:destroyed', { id: 555, type: 'ship', pos: { x: 60, z: 10 } });

  const successor = state.missions.active.find((x) => x && x.mutatedFromMissionId === m.id);
  assert.ok(successor, 'first failure minted the continuation');
  assert.equal(successor.mutationDepth, 1, 'the successor carries its chain depth');

  // The successor fails too — depth 1 is the cap, so this settles plainly.
  const before = state.missions.active.length;
  bus.emit('mission:abandon', { missionId: successor.id });
  const third = state.missions.active.find((x) => x && x.mutatedFromMissionId === successor.id);
  assert.ok(!third, 'no third link — the job closes instead of retrying forever');
  assert.equal(state.missions.active.length, before - 1);
});
