// PB-TAC-D — SF-053 reinforcement ingress lanes + SF-054 safety-derived breather.
//
// SF-053: a scheduled squad enters through ONE deterministic ingress bearing, members fanned
// across it, every spot cleared against collision / playable bounds / the pilot's escape
// pocket, budget reserved at promise time, sector-scoped, and flown inbound on arrival —
// nothing materializes inside the pilot's escape space.
// SF-054: the tactical director's breather is derived from real temporary safety —
// actionableThreat (proximity + prosecution), not a countdown — with arming dwell,
// hysteresis, a refractory cooldown, a max hold, and committed inbound squads blocking it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { DirectorPhase } from '../src/ai/contracts.js';
import { EncounterDirector } from '../src/ai/director.js';
import { aggregatePerceivedTelemetry } from '../src/ai/perception.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';

const DT = 1 / 60;
const CLEARANCE_WU = 420;

function makeHarness(seed = 0x74acd001, { withBudget = true } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_home';
  const busEvents = [];
  const listeners = new Map();
  const bus = {
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, set = new Set());
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(event, payload) {
      busEvents.push({ event, payload });
      for (const fn of [...(listeners.get(event) || [])]) fn(payload, event);
    },
    queue(event, payload) { this.emit(event, payload); },
    flush() {},
  };
  const helpers = {};
  const ctx = { state, bus, helpers, registry: { get() { return null; } } };
  const h = {
    state, bus, busEvents, helpers, ctx,
    core: Object.create(core),
    aiPorts: Object.create(aiPorts),
    aiEncounter: Object.create(aiEncounter),
  };
  h.core.init(ctx);
  h.aiPorts.init(ctx);
  h.aiEncounter.init(ctx);
  if (withBudget) h.helpers.spawnBudget = makeBudgetApi(state);
  const player = helpers.spawnEntity(makeShipSpec({ team: 0, x: 0, z: 0, role: 'player_anchor' }));
  state.playerId = player.id;
  state.spatialHash.rebuild(state.entityList);
  return h;
}

function makeShipSpec({ team, x, z, role }) {
  return {
    type: 'ship',
    alive: true,
    collides: true,
    radius: 12,
    mass: 32,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    team,
    factionId: team === 0 ? 'faction_free' : 'faction_vael',
    hull: 150,
    hullMax: 150,
    armorHp: 40,
    armorMax: 40,
    armorFlat: 2,
    shield: 60,
    shieldMax: 60,
    cap: 100,
    capMax: 100,
    capRegen: 8,
    data: { role, combatProfileId: 'combat_profile_standard_ship' },
  };
}

function makeRockSpec({ x, z, radius }) {
  return {
    type: 'asteroid',
    alive: true,
    collides: true,
    radius,
    mass: radius * 400,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: { role: 'obstruction' },
  };
}

function step(h, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    h.core.preStep(DT, h.state);
    h.aiEncounter.update(DT, h.state);
  }
}

function eventsOf(h, name) {
  return h.busEvents.filter((e) => e.event === name);
}

function issueWing(h) {
  h.helpers.aiEncounter.issue({ tick: 0, type: 'request_reinforcement', packageId: 'fixture_wing_pair' });
}

function spawnedReinforcements(h) {
  return h.state.entityList.filter((e) => e && e.type === 'ship' && e.data && e.data.encounter && e.data.encounter.owner === 'sg06');
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

test('SF-053: the squad lands on one shared lane, inbound, outside the pilot pocket', () => {
  const h = makeHarness();
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  const scheduled = eventsOf(h, 'ai:reinforcementScheduled');
  assert.equal(scheduled.length, 1);
  const bearing = scheduled[0].payload.ingressBearing;
  assert.ok(Number.isFinite(bearing), 'the schedule event publishes the lane bearing');

  step(h, 1);
  const members = spawnedReinforcements(h);
  assert.equal(members.length, 2);
  const player = h.state.entities.get(h.state.playerId);
  const bounds = h.state.bounds;
  for (const m of members) {
    assert.ok(dist(m.pos, player.pos) >= CLEARANCE_WU - 1e-6,
      `member ${m.id} at ${dist(m.pos, player.pos).toFixed(0)} WU must be outside the ${CLEARANCE_WU} WU pocket`);
    assert.ok(dist(m.pos, bounds.center) <= bounds.radius - 90 + 1e-6,
      'member must land inside the playable bound minus its margin');
    // SF-053 core: the arrival is a flight-in — velocity carries the ship toward the anchor.
    const speed = Math.hypot(m.vel.x, m.vel.z);
    assert.ok(Math.abs(speed - 130) < 1e-6, `inbound approach speed ${speed} ≈ 130 WU/s`);
    const toward = { x: player.pos.x - m.pos.x, z: player.pos.z - m.pos.z };
    const len = Math.hypot(toward.x, toward.z);
    const dot = (m.vel.x * toward.x + m.vel.z * toward.z) / (speed * len);
    assert.ok(dot > 0.98, `velocity must point at the anchor (dot ${dot.toFixed(3)})`);
    const nose = { x: Math.cos(m.rot), z: Math.sin(m.rot) };
    assert.ok((nose.x * toward.x + nose.z * toward.z) / len > 0.98,
      'the hull nose already points down the lane');
    // And the member sits on the announced lane, not on a directionless ring.
    const memberBearing = Math.atan2(m.pos.z - player.pos.z, m.pos.x - player.pos.x);
    let diff = Math.abs(memberBearing - bearing) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    assert.ok(diff < 1.9, `member bearing ${memberBearing.toFixed(2)} stays inside the lane fan of ${bearing.toFixed(2)}`);
  }
});

test('SF-053: a director-paced call announces the lane at schedule time', () => {
  const h = makeHarness();
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  const inbound = eventsOf(h, 'alert').filter((e) => String(e.payload && e.payload.key || '').startsWith('reinforcements_inbound_'));
  assert.equal(inbound.length, 1, 'a callerless squad telegraphs its approach when scheduled');
  assert.equal(inbound[0].payload.sev, 'warn');
  assert.ok(eventsOf(h, 'toast').some((e) => /inbound/i.test(e.payload && e.payload.text || '')));
});

test('SF-053: an anchor on the bound edge keeps the squad inside the playable bound', () => {
  const h = makeHarness();
  const player = h.state.entities.get(h.state.playerId);
  player.pos.x = 2520;
  player.pos.z = 0; // 80 WU past the soft fence — the squad must still land legal
  h.state.spatialHash.rebuild(h.state.entityList);
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  step(h, 1);
  const members = spawnedReinforcements(h);
  assert.equal(members.length, 2, 'the squad still lands from the edge case');
  for (const m of members) {
    assert.ok(dist(m.pos, h.state.bounds.center) <= h.state.bounds.radius - 90 + 1e-6,
      'no member may materialize beyond the playable bound');
    assert.ok(dist(m.pos, player.pos) >= CLEARANCE_WU - 1e-6, 'edge case keeps the pocket too');
  }
});

test('SF-053: a blocked lane re-resolves at arrival — the world moved between call and landing', () => {
  const h = makeHarness();
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  const pendings = h.state.aiEncounter.owner.pendingReinforcements;
  assert.equal(pendings.length, 2);
  const spot = { x: pendings[0].pos.x, z: pendings[0].pos.z };
  // An asteroid sweeps into the recorded lane spot before the squad lands.
  const rock = h.helpers.spawnEntity(makeRockSpec({ x: spot.x, z: spot.z, radius: 320 }));
  h.state.spatialHash.rebuild(h.state.entityList);
  step(h, 1);
  const members = spawnedReinforcements(h);
  assert.equal(members.length, 2, 'both members still arrive');
  for (const m of members) {
    assert.ok(dist(m.pos, rock.pos) >= 320 + 40 - 1e-6,
      'the re-resolved spot clears the interposed body plus margin');
  }
  const moved = members.map((m) => dist(m.pos, spot));
  assert.ok(moved.some((d) => d > 1e-6), 'at least one member moved off the blocked spot');
});

test('SF-053: a real sector departure cancels the squad and returns its reserved slots', () => {
  const h = makeHarness();
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 2);
  assert.equal(h.helpers.spawnBudget.current(), 2, 'the promise reserved two slots');

  const toastsBefore = eventsOf(h, 'toast').length;
  // The world moved on: a different sector whose bound sits far from the anchor.
  h.state.world.currentSectorId = 'sector_far';
  h.state.bounds = { radius: 2600, hardRadius: 3000, center: { x: 40000, z: 0 } };
  step(h, 1);

  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 0, 'the departed call is gone');
  assert.equal(h.helpers.spawnBudget.current(), 0, 'the reservation came back');
  const cancelled = eventsOf(h, 'ai:reinforcementCancelled');
  assert.equal(cancelled.length, 2);
  assert.equal(cancelled[0].payload.reason, 'sector_departure');
  assert.equal(eventsOf(h, 'toast').length, toastsBefore, 'a cancelled squad leaves no warning behind');
  assert.equal(eventsOf(h, 'ai:reinforcementSpawned').length, 0);
  assert.equal(h.aiEncounter.inspect().cancelled, 2);
});

test('SF-053: a corridor hop keeps the call — the lane is still inside the shared bound', () => {
  const h = makeHarness();
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  h.state.world.currentSectorId = 'sector_corridor_link';
  // A continuous corridor keeps one bound centred on the shared space: the anchor stays legal.
  step(h, 1);
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 0,
    'delayTicks 1 — the squad has already landed inside the shared corridor');
  assert.equal(eventsOf(h, 'ai:reinforcementCancelled').length, 0, 'no abandonment inside the corridor');
  assert.equal(spawnedReinforcements(h).length, 2);
});

test('SF-053: an impossible arena cancels at the deadline instead of promising forever', () => {
  const h = makeHarness();
  // The pilot sits dead centre of a pocket smaller than the clearance floor: no legal spot exists.
  h.state.bounds = { radius: 300, hardRadius: 900, center: { x: 0, z: 0 } };
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  assert.equal(h.helpers.spawnBudget.current(), 2, 'slots stay reserved while the lane retries');

  step(h, 1 + 600); // dueTick 1 + arrivalDeadlineTicks 600
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 0);
  assert.equal(h.helpers.spawnBudget.current(), 0, 'the undeliverable reservation came back');
  const cancelled = eventsOf(h, 'ai:reinforcementCancelled');
  assert.equal(cancelled.length, 2);
  assert.equal(cancelled[0].payload.reason, 'placement_unreachable');
  assert.equal(eventsOf(h, 'ai:reinforcementSpawned').length, 0);
});

test('SF-053: a saturated cap queues the squad unreserved — and a blocked caller never announces', () => {
  const h = makeHarness();
  h.helpers.spawnBudget.request(h.helpers.spawnBudget.max(), 'test_blocker');
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 2,
    'a squad that cannot reserve still queues — the shared-capacity contract');
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements[0].reservedBudget, false);
  assert.equal(eventsOf(h, 'ai:reinforcementScheduled').length, 1, 'the call was accepted, it is just waiting');
  step(h, 2);
  assert.equal(spawnedReinforcements(h).length, 0, 'nothing materializes past a saturated cap');

  // The authored path is stricter: a hull-broken caller whose squad cannot field announces
  // nothing and holds its latch — then speaks the moment a slot frees.
  const caller = h.helpers.spawnEntity(makeShipSpec({ team: 1, x: 400, z: 0, role: 'sf053_caller' }));
  caller.data.reinforcements = { packageId: 'fixture_wing_pair', hullThreshold: 0.3 };
  caller.hull = Math.floor(caller.hullMax * 0.2);
  h.state.spatialHash.rebuild(h.state.entityList);
  h.aiEncounter.update(DT, h.state);
  assert.equal(eventsOf(h, 'alert').filter((e) => /CALLING REINFORCEMENTS/.test(e.payload && e.payload.text || '')).length, 0);
  assert.notEqual(caller.data.ai._calledReinforcements, true, 'the latch never claimed a squad');

  // A freed slot first admits the caller's schedule-time RESERVATION — reserving at promise
  // time is exactly what lets a call outrank a squad already queued behind the cap.
  h.helpers.spawnBudget.releaseSome('test_blocker', 1);
  step(h, 1);
  assert.equal(caller.data.ai._calledReinforcements, true, 'the freed slot lets the call land');
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 4,
    'the fixture pair waits behind the cap while the caller squad holds its one slot');
  h.helpers.spawnBudget.releaseSome('test_blocker', 4);
  step(h, 1);
  assert.equal(spawnedReinforcements(h).length, 4,
    'both squads land as capacity frees — the queued pair and the caller pair');
});

test('SF-053: a throwing spawn cancels that member and still walks the queue tail', () => {
  const h = makeHarness();
  issueWing(h);
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 4);
  const reserved = h.helpers.spawnBudget.current();
  assert.equal(reserved, 4);

  let thrown = 0;
  const realSpawn = h.helpers.spawnEntity;
  h.helpers.spawnEntity = (spec) => {
    if (thrown++ === 0) throw new Error('fixture spawn failure');
    return realSpawn(spec);
  };
  step(h, 1);
  const cancelled = eventsOf(h, 'ai:reinforcementCancelled');
  assert.equal(cancelled.length, 1, 'only the failed member is cancelled');
  assert.equal(cancelled[0].payload.reason, 'spawn_threw');
  assert.equal(spawnedReinforcements(h).length, 3, 'the rest of the queue still lands');
  assert.equal(h.helpers.spawnBudget.current(), 3, 'the failed member released its slot');
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 0);
});

test('SF-053: a materialization-time claim releases its slot when the spawn throws', () => {
  const h = makeHarness();
  // One free slot: the schedule-time reservation takes it for member 1 only — member 2 queues
  // unreserved and must claim at materialization.
  h.helpers.spawnBudget.request(h.helpers.spawnBudget.max() - 1, 'test_blocker');
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 2);
  // Free the blocker so member 2's fallback claim succeeds.
  h.helpers.spawnBudget.release('test_blocker');
  let calls = 0;
  const realSpawn = h.helpers.spawnEntity;
  h.helpers.spawnEntity = (spec) => {
    if (calls++ === 1) throw new Error('fixture spawn failure on the claim path');
    return realSpawn(spec);
  };
  step(h, 1);
  assert.equal(spawnedReinforcements(h).length, 1);
  const cancelled = eventsOf(h, 'ai:reinforcementCancelled');
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].payload.reason, 'spawn_threw');
  assert.equal(h.helpers.spawnBudget.current(), 1,
    'the claimed slot must be released even though the record was never schedule-reserved');
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 0);
});

test('SF-053: a saturated cap that never frees cancels the queue at the deadline', () => {
  const h = makeHarness();
  h.helpers.spawnBudget.request(h.helpers.spawnBudget.max(), 'test_blocker');
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 2);
  step(h, 1 + 600);
  assert.equal(h.state.aiEncounter.owner.pendingReinforcements.length, 0);
  const cancelled = eventsOf(h, 'ai:reinforcementCancelled');
  assert.equal(cancelled.length, 2);
  assert.equal(cancelled[0].payload.reason, 'budget_unavailable');
  assert.equal(spawnedReinforcements(h).length, 0);
});

test('SF-053: a station-sized body keeps the lane off its real footprint, not just its core', () => {
  const h = makeHarness();
  const player = h.state.entities.get(h.state.playerId);
  // A ring station parked on the ingress ring: small core radius, wide authored spar reach.
  const station = { x: 620, z: 0 };
  h.helpers.spawnEntity({
    type: 'station',
    alive: true,
    collides: true,
    radius: 30,
    mass: 40000,
    pos: { x: station.x, z: station.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: { role: 'station', dockRadius: 120 },
  });
  h.state.spatialHash.rebuild(h.state.entityList);
  issueWing(h);
  h.aiEncounter.update(DT, h.state);
  step(h, 1);
  const members = spawnedReinforcements(h);
  assert.equal(members.length, 2);
  for (const m of members) {
    assert.ok(dist(m.pos, station) >= 120 + 40 - 1e-6,
      'the spawn must clear the station spar reach, not just its core radius');
    assert.ok(dist(m.pos, player.pos) >= CLEARANCE_WU - 1e-6);
  }
});

test('SF-053: ingress placement replays deterministically for a fixed seed', () => {
  const run = (seed) => {
    const h = makeHarness(seed);
    issueWing(h);
    h.aiEncounter.update(DT, h.state);
    return h.state.aiEncounter.owner.pendingReinforcements.map((p) => [p.pos.x, p.pos.z]);
  };
  assert.deepEqual(run(0x74acd055), run(0x74acd055));
  const a = run(0x74acd055);
  const b = run(0x74acd099);
  assert.notDeepEqual(a, b, 'a different seed resolves a different lane');
});

// ---------------------------------------------------------------------------
// SF-054 — the breather is earned by real safety, not a countdown.

function perceptionWith(self, contacts) {
  return { self, contacts, events: [] };
}

function hostileShip(id, x, z) {
  return { id, kind: 'ship', team: 0, hostile: true, alive: true, threat: 0.8, confidence: 1, pos: { x, z } };
}

test('SF-054: distance and prosecution shape actionable opposition', () => {
  const self = { team: 1, disabled: false, hullFraction: 1, pos: { x: 0, z: 0 } };
  // A dormant hostile 3000 WU out cannot hurt anyone right now.
  const far = aggregatePerceivedTelemetry([perceptionWith(self, [hostileShip('a', 3000, 0)])]);
  assert.equal(far.hostileContacts, 1, 'the legacy count still sees it');
  assert.equal(far.actionableContacts, 0);
  assert.equal(far.actionableThreat, 0);
  // The same hull at knife range is fully actionable.
  const near = aggregatePerceivedTelemetry([perceptionWith(self, [hostileShip('a', 200, 0)])]);
  assert.equal(near.actionableContacts, 1);
  assert.ok(near.actionableThreat > 0.7, `near threat ${near.actionableThreat}`);
  // Distant but actively prosecuted — an attack_run already committed to it — stays actionable.
  const prosecuting = { ...self, activity: { kind: 'attack_run', targetId: 'a' } };
  const chased = aggregatePerceivedTelemetry([perceptionWith(prosecuting, [hostileShip('a', 3000, 0)])]);
  assert.equal(chased.actionableContacts, 1, 'a prosecuted contact is actionable at any range');
  assert.ok(chased.actionableThreat > 0.7);
  // A hostile the squad cannot even localize must not read as safely absent — and the fail-safe
  // must hold for a perceiver far from the origin (missing pos must not measure as origin-distance).
  const ghost = hostileShip('ghost', 0, 0);
  delete ghost.pos;
  const farSelf = { team: 1, disabled: false, hullFraction: 1, pos: { x: 9000, z: 9000 } };
  const unlocalized = aggregatePerceivedTelemetry([perceptionWith(farSelf, [ghost])]);
  assert.equal(unlocalized.actionableContacts, 1, 'an unlocalized hostile counts as actionable');
  assert.ok(unlocalized.actionableThreat > 0.7, 'an unlocalized hostile fails safe toward pressure');
});

test('SF-054: the breather arms only after sustained real safety, then clamps pressure', () => {
  const director = new EncounterDirector({
    config: { freezeResults: false, breatherArmTicks: 4, breatherCooldownTicks: 4, breatherMaxTicks: 8 },
  });
  director.state.phase = DirectorPhase.BUILD;
  director.state.reinforcementCooldown = 999; // keep the escalation candidate out of the way
  const safe = { actionableThreat: 0, actionableContacts: 0 };
  let last;
  for (let tick = 1; tick <= 4; tick++) last = director.update(tick, safe, {});
  assert.equal(director.state.breatherActive, true, 'sustained safety arms the breather');
  assert.equal(last.breather, true);
  assert.ok(last.targetPressure <= 0.22 + 1e-9, 'target pressure rides the breather ceiling');
});

test('SF-054: a new actionable threat ends the breather on the spot', () => {
  const director = new EncounterDirector({
    config: { freezeResults: false, breatherArmTicks: 2, breatherCooldownTicks: 4, breatherMaxTicks: 8 },
  });
  director.state.phase = DirectorPhase.BUILD;
  const safe = { actionableThreat: 0, actionableContacts: 0 };
  director.update(1, safe, {});
  director.update(2, safe, {});
  assert.equal(director.state.breatherActive, true);
  const danger = { actionableThreat: 0.6, actionableContacts: 2 };
  director.update(3, danger, {});
  assert.equal(director.state.breatherActive, false, 'actionable threat ends the window immediately');
  assert.ok(director.state.breatherCooldown > 0, 'exit starts the refractory cooldown');
});

test('SF-054: hysteresis — a reading inside the band does not flicker the breather', () => {
  const director = new EncounterDirector({
    config: { freezeResults: false, breatherArmTicks: 2, breatherCooldownTicks: 4, breatherMaxTicks: 8 },
  });
  director.state.phase = DirectorPhase.BUILD;
  const safe = { actionableThreat: 0, actionableContacts: 0 };
  director.update(1, safe, {});
  director.update(2, safe, {});
  assert.equal(director.state.breatherActive, true);
  // 0.2 sits inside the 0.1/0.3 band: not safe enough to arm, not dangerous enough to break.
  const mid = { actionableThreat: 0.2, actionableContacts: 0 };
  director.update(3, mid, {});
  assert.equal(director.state.breatherActive, true, 'the band must not flicker the window shut');
  // …but jittering the same reading while disarmed must not count as dwell.
  const jitter = new EncounterDirector({
    config: { freezeResults: false, breatherArmTicks: 2, breatherCooldownTicks: 4 },
  });
  jitter.state.phase = DirectorPhase.BUILD;
  jitter.update(1, mid, {});
  jitter.update(2, mid, {});
  jitter.update(3, mid, {});
  assert.equal(jitter.state.breatherActive, false, 'the band never arms the breather');
});

test('SF-054: committed inbound reinforcements block the breather end to end', () => {
  const director = new EncounterDirector({
    config: { freezeResults: false, breatherArmTicks: 2, breatherCooldownTicks: 4 },
  });
  director.state.phase = DirectorPhase.BUILD;
  const safe = { actionableThreat: 0, actionableContacts: 0 };
  director.update(1, safe, { pendingReinforcements: 2 });
  director.update(2, safe, { pendingReinforcements: 2 });
  director.update(3, safe, { pendingReinforcements: 2 });
  assert.equal(director.state.breatherActive, false, 'an announced squad still on the lane is not safety');
  // And one that lands clears the way for a real window.
  director.update(4, safe, {});
  director.update(5, safe, {});
  assert.equal(director.state.breatherActive, true);
});

test('SF-054: the refractory cooldown and the max hold both bound the window', () => {
  const director = new EncounterDirector({
    config: { freezeResults: false, breatherArmTicks: 2, breatherCooldownTicks: 3, breatherMaxTicks: 4 },
  });
  director.state.phase = DirectorPhase.BUILD;
  const safe = { actionableThreat: 0, actionableContacts: 0 };
  director.update(1, safe, {});
  director.update(2, safe, {});
  assert.equal(director.state.breatherActive, true);
  for (let tick = 3; tick <= 6; tick++) director.update(tick, safe, {});
  assert.equal(director.state.breatherActive, false, 'the window cannot hold past its bound');
  // Even with a clear field the cooldown keeps the next window from re-arming.
  director.update(7, safe, {});
  director.update(8, safe, {});
  director.update(9, safe, {});
  assert.equal(director.state.breatherActive, false, 'refractory: no re-arm inside the cooldown');
  // …but it is refractory, not permanent: once the cooldown lapses the dwell counts again.
  director.update(10, safe, {});   // cooldown lapses (3→0), dwell 1
  director.update(11, safe, {});   // dwell 2 ≥ armTicks → re-armed
  assert.equal(director.state.breatherActive, true, 'a lapsed cooldown lets safety re-arm');
});

test('SF-054: a real breather dissolves the build back to respite', () => {
  const director = new EncounterDirector({
    config: { freezeResults: false, breatherArmTicks: 2, respiteMinTicks: 1 },
  });
  director.state.phase = DirectorPhase.BUILD;
  const safe = { actionableThreat: 0, actionableContacts: 0 };
  director.update(1, safe, {});
  const next = director.update(2, safe, {});
  assert.equal(next.phase, DirectorPhase.RESPITE, 'real safety routes the build to respite');
  assert.equal(director.state.lastDecision, 'begin_respite');
});

test('SF-054: a director with no actionability feed degrades to the legacy fields', () => {
  const director = new EncounterDirector({ config: { freezeResults: false, respiteMinTicks: 1 } });
  director.state.phase = DirectorPhase.RESPITE;
  director.state.phaseTick = 400;
  // Legacy-only telemetry: the raw fields still drive pressure — the contract is additive.
  const result = director.update(1, { visibleThreat: 0.9, hostileContacts: 6 }, {});
  assert.ok(result.targetPressure > 0.5, 'raw threat telemetry still pushes pressure up');
  assert.equal(director.state.breatherActive, false);
});
