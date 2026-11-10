// SF-278 — once-only rewards survive repeated resume.
//
// One real reward boundary: bounty/patrol completion through the missions owner, paid by the
// economy owner. The commit point is `_completeMission` — the single reward emitter — so the
// assertions all hammer THAT boundary rather than callbacks:
//
// (a) a duplicate kill event for the settled target cannot re-pay;
// (b) a direct duplicate `_completeMission` on the settled row cannot re-pay;
// (c) a settled mission serialized, restored, and then hit with a repeated kill still pays
//     nothing — the receipt and the removed-from-active identity are the durable truth;
// (d) a mission that was valid but UNCOMMITTED at save time still completes once after the
//     restore — resume must not strand a legitimately earned reward;
// (e) an unrelated later reward still pays normally — the guard is per-settlement, never global.
//
// Credits move through the real `economy:grantCredits` listener, so the assertions read
// authoritative state (player.credits, missions.receipts), not emitted callbacks alone.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { MISSION_TUNING } from '../src/data/missions.js';

const PLAYER_ID = 1;

function bountyMission(overrides = {}) {
  return {
    id: 'm_sf278_bounty',
    status: 'active',
    type: 'bounty_hunt',
    title: 'SF-278 warrant',
    stationId: 'station_helios',
    destSectorId: 'sector_helios_prime',
    factionId: 'faction_scn',
    reward_cr: 1200,
    collateral_cr: 0,
    riskTier: 0,
    params: {},
    objectiveProgress: 0,
    objectiveTarget: 1,
    targetEntityIds: [55],
    completedTargetSlots: [],
    needsTargets: false,
    ...overrides,
  };
}

function makeState() {
  return {
    meta: { seed: 27801 },
    simTime: 100,
    tick: 600,
    mode: 'flight',
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 2,
      config: { ...MISSION_TUNING },
    },
    player: {
      credits: 5000,
      reputation: {},
      researchPoints: 0,
      stats: { missionsDone: 0 },
      cargo: { items: {}, capVolume: 100, usedVolume: 0, capMass: 100, usedMass: 0, richLots: [] },
      uniqueWrecks: { bearings: {} },
    },
    playerId: PLAYER_ID,
    entities: new Map(),
    entityList: [],
    nav: { waypoint: null },
    ui: { trackedMissionId: null },
    story: { flags: {} },
    world: { currentSectorId: 'sector_helios_prime' },
    sim: {},
  };
}

function makeScene(state = makeState()) {
  const bus = createBus();
  const registry = { get() { return null; } };
  const missionsSys = Object.create(missions);
  missionsSys.init({ state, bus, helpers: {}, registry });
  const economySys = Object.create(economy);
  economySys.init({ state, bus, helpers: {}, registry });
  return { bus, state, missionsSys, economySys, credits: () => state.player.credits };
}

function grantsOf(bus, marker) {
  const seen = [];
  bus.on('economy:grantCredits', (p) => seen.push(p));
  return seen;
}

// ── (a)(b) duplicate completion events and duplicate invocations pay exactly once ──────────────

test('a settled bounty pays once across duplicate kill events and duplicate settle calls', () => {
  const scene = makeScene();
  const m = bountyMission();
  scene.state.missions.active.push(m);
  const grants = grantsOf(scene.bus);
  const before = scene.credits();

  // The real boundary: entity:killed → _onKill → _settleBountyTargetKill → _completeMission.
  scene.bus.emit('entity:killed', { id: 55, killerId: PLAYER_ID, type: 'ship' });
  // The same kill receipt replayed (bus double-delivery, event-slice drain race).
  scene.bus.emit('entity:killed', { id: 55, killerId: PLAYER_ID, type: 'ship' });
  // A *different* target id arriving after the mission already settled.
  scene.bus.emit('entity:killed', { id: 56, killerId: PLAYER_ID, type: 'ship' });
  // A direct re-invocation of the commit boundary on the settled row.
  scene.missionsSys._completeMission(m, 0);

  const missionGrants = grants.filter((g) => g && g.reason === `mission:${m.id}`);
  assert.equal(missionGrants.length, 1, 'one grant was emitted for the settled mission');
  assert.equal(missionGrants[0].amount, 1200);
  assert.equal(scene.credits(), before + 1200, 'credits reflect exactly one payout');
  assert.equal(scene.state.missions.active.length, 0, 'settled mission left the active list');
  const receipt = scene.state.missions.receipts.find((r) => r && r.missionId === m.id);
  assert.ok(receipt, 'the settled reward identity is recorded');
  assert.equal(receipt.outcome, 'completed');
});

// ── (c) repeated loads over a settled mission mint nothing ─────────────────────────────────────

test('a mission settled before save pays nothing again after repeated restore', () => {
  const scene = makeScene();
  const m = bountyMission();
  scene.state.missions.active.push(m);
  const grants = grantsOf(scene.bus);
  const before = scene.credits();

  scene.bus.emit('entity:killed', { id: 55, killerId: PLAYER_ID, type: 'ship' });
  assert.equal(scene.credits(), before + 1200);
  assert.equal(scene.state.missions.active.length, 0);

  // First save → load round-trip through the missions owner's own serializer.
  const saved1 = JSON.parse(JSON.stringify(scene.missionsSys.serialize()));
  scene.missionsSys.deserialize(saved1);
  // Resume-side replays of the original kill receipt must not mint.
  scene.bus.emit('entity:killed', { id: 55, killerId: PLAYER_ID, type: 'ship' });
  assert.equal(scene.credits(), before + 1200, 'first restore minted no second payout');

  // Second save → load round-trip — repeated resume.
  const saved2 = JSON.parse(JSON.stringify(scene.missionsSys.serialize()));
  scene.missionsSys.deserialize(saved2);
  scene.bus.emit('entity:killed', { id: 55, killerId: PLAYER_ID, type: 'ship' });
  scene.missionsSys._completeMission(m, 0);
  assert.equal(scene.credits(), before + 1200, 'second restore minted no second payout');

  const missionGrants = grants.filter((g) => g && g.reason === `mission:${m.id}`);
  assert.equal(missionGrants.length, 1, 'exactly one grant across the whole interrupted route');
  const receipt = scene.state.missions.receipts.find((r) => r && r.missionId === m.id);
  assert.ok(receipt, 'the settled identity survived both restores');
});

// ── (d) a valid-but-uncommitted reward still completes after restore ────────────────────────────

test('a bounty still open at save time completes exactly once after restore', () => {
  const scene = makeScene();
  const m = bountyMission();
  scene.state.missions.active.push(m);
  const grants = grantsOf(scene.bus);
  const before = scene.credits();

  // Serialize BEFORE the kill: the reward is valid but uncommitted at the boundary.
  const saved = JSON.parse(JSON.stringify(scene.missionsSys.serialize()));
  assert.equal(saved.active.length, 1, 'the open mission serialized');
  scene.missionsSys.deserialize(saved);

  // Entity ids are transient: the restore re-arms targets (production does this through
  // _ensureMissionTargets on sector re-entry). The durable row is still active.
  const restored = scene.state.missions.active.find((row) => row.id === m.id);
  assert.ok(restored, 'the uncommitted mission survived the load');
  assert.equal(restored.status, 'active');
  assert.equal(restored.objectiveProgress, 0, 'no progress was fabricated at restore');
  restored.targetEntityIds = [77]; // re-armed target id after sector re-materialization

  scene.bus.emit('entity:killed', { id: 77, killerId: PLAYER_ID, type: 'ship' });
  const missionGrants = grants.filter((g) => g && g.reason === `mission:${m.id}`);
  assert.equal(missionGrants.length, 1, 'the delayed reward paid exactly once');
  assert.equal(scene.credits(), before + 1200);
  assert.equal(scene.state.missions.active.length, 0);
});

// ── (e) unrelated later rewards still pay — the guard is per-settlement ─────────────────────────

test('an unrelated second mission pays normally after the first is settled and restored', () => {
  const scene = makeScene();
  const first = bountyMission();
  const second = bountyMission({
    id: 'm_sf278_later', title: 'Later warrant', reward_cr: 800, targetEntityIds: [88],
  });
  scene.state.missions.active.push(first, second);
  const grants = grantsOf(scene.bus);
  const before = scene.credits();

  scene.bus.emit('entity:killed', { id: 55, killerId: PLAYER_ID, type: 'ship' });
  const saved = JSON.parse(JSON.stringify(scene.missionsSys.serialize()));
  scene.missionsSys.deserialize(saved);
  const restored = scene.state.missions.active.find((row) => row.id === second.id);
  assert.ok(restored, 'the still-open second mission survived');
  restored.targetEntityIds = [88];

  scene.bus.emit('entity:killed', { id: 88, killerId: PLAYER_ID, type: 'ship' });
  const secondGrants = grants.filter((g) => g && g.reason === `mission:${second.id}`);
  assert.equal(secondGrants.length, 1, 'the later unrelated reward paid');
  assert.equal(scene.credits(), before + 1200 + 800);
  assert.equal(grants.filter((g) => g && g.reason === `mission:${first.id}`).length, 1);
});
