// R391 / AL-FIGHT-1 Crossfire: reckless NPC gunners shoot through same-team traffic, the struck
// Reaver turns on the shooter for 12 s, and the grudge restores exactly the state it interrupted.
// Damage routing uses the real combat kernel; grudges use a focused lawSecurity simulation.
import test from 'node:test';
import assert from 'node:assert/strict';

import { scalarHitToDamagePacket, npcCrossfireAdmits } from '../src/combat/damage.js';
import { combat } from '../src/systems/combat.js';
import { mines } from '../src/systems/mines.js';
import { schedulePhysicalBlast } from '../src/combat/physicalEffects.js';
import { lawSecurity, NPC_GRUDGE_REASON, NPC_GRUDGE_S } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { createSimulation } from '../src/core/sim.js';
import { crossfireDisciplineFor, CROSSFIRE_AIM_CEILING } from '../src/ai/temperament.js';
import { assessFriendlyFireLane } from '../src/ai/fireDiscipline.js';
import {
  ActivityKind,
  authoritativeAssignmentTargetId,
  normalizeActivity,
} from '../src/ai/doctrine.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import { resolveAdditionalActionVfxReceipt } from '../src/render/vfx/actionEventRecipes.js';

const SEED = 4242;

function vec(x, z) {
  return {
    x, y: 0, z,
    copy(other) { this.x = other.x; this.y = other.y || 0; this.z = other.z; return this; },
  };
}

function ship(id, team, { x = 0, z = 0, ai = {}, data = {}, factionId = 'faction_reach' } = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    factionId,
    pos: vec(x, z),
    prevPos: vec(x, z),
    vel: vec(0, 0),
    rot: 0,
    radius: 18,
    mass: 32,
    flags: {},
    data: {
      ...data,
      ai: {
        archetype: 'pirate',
        combatDoctrineId: 'interceptor_flyby',
        squadId: 'reaver_wing',
        ...ai,
      },
      combat: {},
    },
    hull: 100,
    hullMax: 100,
    armorHp: 0,
    armorMax: 0,
    shield: 20,
    shieldMax: 20,
  };
}

function makeState(extras = []) {
  const player = ship(1, 0, { factionId: 'faction_free', ai: { lawful: false, combatDoctrineId: null, squadId: null } });
  player.data = { defId: 'ship_kestrel' };
  const entities = new Map([[player.id, player]]);
  const entityList = [player];
  for (const entity of extras) {
    entities.set(entity.id, entity);
    entityList.push(entity);
  }
  return {
    tick: 300,
    simTime: 5,
    playerId: player.id,
    meta: { seed: SEED },
    settings: { gameplay: { difficulty: 'standard' } },
    content: {},
    input: {},
    player: { credits: 5000, heat: 0 },
    entities,
    entityList,
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
  };
}

function routed(state, events, attackerId, targetId, { damage = 40, origin = { kind: 'weapon', id: 'wpn_autocannon_s' } } = {}) {
  const target = state.entities.get(targetId);
  combat.init({
    state,
    bus: {
      on() { return () => {}; },
      emit(event, payload) { events.push({ event, payload }); },
    },
    helpers: {},
    registry: { get() { return null; } },
  });
  return combat.ensureKernel().routeDamage({
    attackerId,
    targetId,
    packet: scalarHitToDamagePacket({ damage, damageType: 'kinetic', pos: { ...(target.pos || { x: 0, z: 0 }) } }),
    origin,
  });
}

function approx(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: expected ≈${expected}, got ${actual}`);
}

// ── case 1: temperament-derived discipline ──────────────────────────────────────────────────

test('crossfire discipline is a deterministic per-pilot trait', () => {
  assert.equal(CROSSFIRE_AIM_CEILING, 0.5);
  for (const seed of [1, 47, SEED]) {
    for (let id = 1; id <= 20; id++) {
      assert.equal(crossfireDisciplineFor(ship(id, 1), seed), 'reckless',
        `Reaver ${id} on seed ${seed} fires through a same-team hull`);
    }
  }
  const concord = ship(30, 1, { ai: { lawful: true, combatDoctrineId: 'escort_screen' } });
  assert.equal(crossfireDisciplineFor(concord, SEED), 'holds');
  const wingman = ship(31, 0, { ai: { lawful: false, combatDoctrineId: 'escort_screen' } });
  assert.equal(crossfireDisciplineFor(wingman, SEED), 'holds');
  const hauler = ship(32, 2, { ai: { lawful: false, combatDoctrineId: 'pack_pursuit' } });
  assert.equal(crossfireDisciplineFor(hauler, SEED), 'holds');
  const cohort = ship(33, 1, { data: { runCohort: 'survival' } });
  assert.equal(crossfireDisciplineFor(cohort, SEED), 'holds');
  const swarm = ship(34, 1, { ai: { lawful: false, combatDoctrineId: 'swarm_pack' } });
  assert.equal(crossfireDisciplineFor(swarm, SEED), 'holds');
  assert.equal(crossfireDisciplineFor({ type: 'station', id: 5 }, SEED), 'holds');
});

// ── cases 2 and 3: damage admission and refusals ────────────────────────────────────────────

test('a reckless Reaver bolt and splash land on the Reaver behind the player', () => {
  const a = ship(10, 1, { x: 0, z: 0 });
  const b = ship(11, 1, { x: 200, z: 0, ai: { squadId: 'other_wing' } });
  const state = makeState([a, b]);
  const events = [];
  const before = { shield: b.shield, hull: b.hull };
  const result = routed(state, events, a.id, b.id);
  assert.equal(result.ok, true, `expected routed damage, got ${result.reason}`);
  assert.ok(b.shield < before.shield || b.hull < before.hull, 'the struck Reaver loses shield or hull');
  const hits = events.filter((entry) => entry.event === 'combat:damage'
    && entry.payload.attackerId === a.id && entry.payload.targetId === b.id);
  assert.equal(hits.length, 1, 'exactly one A→B combat:damage receipt');
});

test('a reckless Reaver splash blast delivers real damage to the same-team hull', () => {
  const a = ship(10, 1, { x: 0, z: 0 });
  const b = ship(11, 1, { x: 200, z: 0, ai: { squadId: 'other_wing' } });
  const state = makeState([a, b]);
  const events = [];
  combat.init({
    state,
    bus: {
      on() { return () => {}; },
      emit(event, payload) { events.push({ event, payload }); },
    },
    helpers: {},
    registry: { get() { return null; } },
  });
  const route = combat.ensureKernel().routeDamage;
  const center = { x: 230, z: 0 };
  const radius = 60;
  const before = { shield: b.shield, hull: b.hull };
  const recipients = [];
  // The same delivery weapons.js uses for a weapon_splash detonation: schedule the blast,
  // then route a damage packet per recipient found in the radius.
  const scheduled = schedulePhysicalBlast(state, {
    center,
    radius,
    onBody(body) {
      const dx = body.pos.x - center.x;
      const dz = body.pos.z - center.z;
      const dist = Math.hypot(dx, dz);
      const fall = Math.max(0, 1 - Math.max(0, dist - (body.radius || 0)) / radius);
      recipients.push(body.id);
      return route({
        attackerId: a.id,
        targetId: body.id,
        packet: scalarHitToDamagePacket({
          damage: 40 * fall,
          damageType: 'explosive',
          pos: center,
          source: { kind: 'weapon_splash', weaponId: 'wpn_autocannon_s' },
        }),
        origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
      });
    },
  });
  assert.equal(scheduled, true, 'the blast delivery is scheduled');
  assert.ok(recipients.includes(b.id), 'the blast gathers the same-team hull inside the radius');
  assert.ok(b.shield < before.shield || b.hull < before.hull, 'the splash takes shield or hull');
  const hits = events.filter((entry) => entry.event === 'combat:damage'
    && entry.payload.attackerId === a.id && entry.payload.targetId === b.id);
  assert.equal(hits.length, 1, 'exactly one A→B combat:damage receipt from the blast');
});

test('the friendly-fire law still refuses every non-crossfire pair', () => {
  const c1 = ship(20, 1, { x: 0, z: 0, ai: { lawful: true, combatDoctrineId: 'escort_screen' } });
  const c2 = ship(21, 1, { x: 200, z: 0, ai: { lawful: true, combatDoctrineId: 'escort_screen' } });
  assert.equal(routed(makeState([c1, c2]), [], c1.id, c2.id).reason, 'friendly_fire');

  const raider = ship(22, 1, { x: 0, z: 0 });
  const station = {
    id: 23, type: 'station', alive: true, team: 1, factionId: 'faction_reach',
    pos: vec(300, 0), prevPos: vec(300, 0), vel: vec(0, 0), rot: 0, radius: 42, mass: 1e6,
    flags: {}, data: { stationId: 'station_test' },
    hull: 1e6, hullMax: 1e6, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
  };
  assert.equal(routed(makeState([raider, station]), [], raider.id, station.id).reason, 'friendly_fire');

  const other = ship(24, 1, { x: 200, z: 0, ai: { squadId: 'other_wing' } });
  assert.equal(routed(makeState([raider, other]), [], raider.id, other.id, {
    origin: { kind: 'test', id: 'r391' },
  }).reason, 'friendly_fire');

  const ally = ship(25, 0, { x: 0, z: 0, factionId: 'faction_free' });
  const neutralStation = { ...station, id: 26, team: 0, factionId: 'faction_scn' };
  assert.equal(routed(makeState([ally, neutralStation]), [], ally.id, neutralStation.id).reason, 'friendly_fire');
});

test('a reckless Reaver cannot shoot through traffic the law protects', () => {
  const reaver = ship(10, 1, { x: 0, z: 0 });
  assert.equal(crossfireDisciplineFor(reaver, SEED), 'reckless', 'the shooter is the reckless control');

  const hauler = ship(11, 1, { x: 200, z: 0, ai: { combatDoctrineId: 'pack_pursuit', role: 'hauler' } });
  assert.equal(routed(makeState([reaver, hauler]), [], reaver.id, hauler.id).reason, 'friendly_fire',
    'a same-team role-tagged hauler is a protected civilian');

  const convoy = ship(12, 1, { x: 200, z: 0, ai: { spawnContext: 'convoy_civilian' } });
  assert.equal(routed(makeState([reaver, convoy]), [], reaver.id, convoy.id).reason, 'friendly_fire',
    'a convoy-context hull is a protected civilian');

  const slotHauler = ship(13, 1, {
    x: 200, z: 0, data: { activityActorSlotId: 'ceres_ambush_loaded_hauler' },
  });
  assert.equal(routed(makeState([reaver, slotHauler]), [], reaver.id, slotHauler.id).reason, 'friendly_fire',
    'the authored Ceres ambush hauler is a protected civilian');

  // The control: a plain same-team raider is still admitted, so the guard is not a blanket refusal.
  const mate = ship(14, 1, { x: 200, z: 0, ai: { squadId: 'other_wing' } });
  assert.equal(routed(makeState([reaver, mate]), [], reaver.id, mate.id).ok, true);
});

// ── case 2b: an authorized grudge target may always be shot back ───────────────────────────

test('a disciplined NPC may return fire at its authorized grudge target, both ways', () => {
  const first = ship(60, 1, { x: 0, z: 0, ai: { combatDoctrineId: 'brawler_commit', squadId: 'jackals' } });
  const second = ship(61, 1, { x: 200, z: 0, ai: { combatDoctrineId: 'brawler_commit', squadId: 'jackals_b' } });
  assert.equal(crossfireDisciplineFor(first, SEED), 'holds', 'a disciplined hull cannot rely on collateral fire');
  assert.equal(crossfireDisciplineFor(second, SEED), 'holds');
  const state = makeState([first, second]);
  const events = [];

  // lawSecurity writes this record when the victim is struck by a same-team shooter.
  first.data.ai.npcGrudge = { targetId: second.id, startedT: 5, untilT: 17, cause: 'damage', prior: {} };
  const forward = routed(state, events, first.id, second.id);
  assert.equal(forward.ok, true, `expected the grudge holder's return shot to route, got ${forward.reason}`);
  assert.ok(second.shield < 20 || second.hull < 100, 'the grudge target takes shield or hull');

  second.data.ai.npcGrudge = { targetId: first.id, startedT: 5, untilT: 17, cause: 'damage', prior: {} };
  const reverse = routed(state, events, second.id, first.id);
  assert.equal(reverse.ok, true, `expected the mirrored grudge shot to route, got ${reverse.reason}`);
  assert.ok(first.shield < 20 || first.hull < 100, 'the mirrored grudge target takes shield or hull');
});

test('grudge authorization never opens lawful, player-side or civilian hulls', () => {
  const shooter = (id, extra) => ship(id, 1, {
    x: 0, z: 0, ai: { combatDoctrineId: 'brawler_commit', squadId: `s${id}`, ...extra?.ai },
  });

  const lawfulShooter = shooter(70);
  const lawful = ship(71, 1, { x: 200, z: 0, ai: { lawful: true, combatDoctrineId: 'escort_screen' } });
  lawfulShooter.data.ai.npcGrudge = { targetId: lawful.id, startedT: 0, untilT: 12, cause: 'damage', prior: {} };
  assert.equal(routed(makeState([lawfulShooter, lawful]), [], lawfulShooter.id, lawful.id).reason, 'friendly_fire',
    'a lawful hull is never a grudge target');

  // A team-0 (player-side) NPC can never carry grudge authority, even with a forged record.
  const wingShooter = ship(72, 0, { x: 0, z: 0, factionId: 'faction_free', ai: { combatDoctrineId: 'escort_screen' } });
  const wingTarget = ship(73, 0, { x: 200, z: 0, factionId: 'faction_free', ai: { combatDoctrineId: 'escort_screen' } });
  wingShooter.data.ai.npcGrudge = { targetId: wingTarget.id, startedT: 0, untilT: 12, cause: 'damage', prior: {} };
  assert.equal(routed(makeState([wingShooter, wingTarget]), [], wingShooter.id, wingTarget.id).reason, 'friendly_fire',
    'team-0 traffic keeps the friendly-fire law');

  const civilianShooter = shooter(74);
  const civilian = ship(75, 1, { x: 200, z: 0, ai: { combatDoctrineId: 'pack_pursuit', role: 'hauler' } });
  civilianShooter.data.ai.npcGrudge = { targetId: civilian.id, startedT: 0, untilT: 12, cause: 'damage', prior: {} };
  assert.equal(routed(makeState([civilianShooter, civilian]), [], civilianShooter.id, civilian.id).reason, 'friendly_fire',
    'a civilian hauler is never a grudge target');

  const other = ship(76, 1, { x: 200, z: 0, ai: { squadId: 'other_wing' } });
  const mismatched = shooter(77);
  mismatched.data.ai.npcGrudge = { targetId: 999, startedT: 0, untilT: 12, cause: 'damage', prior: {} };
  assert.equal(routed(makeState([mismatched, other]), [], mismatched.id, other.id).reason, 'friendly_fire',
    'a grudge on someone else does not authorize fire at a different hull');
});

// ── case 4: the lane gate ───────────────────────────────────────────────────────────────────

test('a reckless shooter yields the lane only to its own wingmates', () => {
  const shooter = ship(40, 1, { x: 0, z: 0, ai: { squadId: 'alpha' } });
  const target = ship(41, 0, { x: 320, z: 0, factionId: 'faction_free', ai: { squadId: null } });
  const stranger = ship(42, 1, { x: 150, z: 0, ai: { squadId: 'beta' } });
  const wingmate = ship(43, 1, { x: 150, z: 0, ai: { squadId: 'alpha' } });

  const clear = assessFriendlyFireLane({ shooter, target, aimAngle: 0, entities: [shooter, target, stranger], seed: SEED });
  assert.equal(clear.clear, true, 'a different-squad Reaver does not hold a reckless shooter');

  const blocked = assessFriendlyFireLane({ shooter, target, aimAngle: 0, entities: [shooter, target, wingmate], seed: SEED });
  assert.equal(blocked.clear, false);
  assert.equal(blocked.reason, 'ally_in_lane');
  assert.equal(blocked.blockerId, wingmate.id);

  const concord = ship(44, 1, { x: 0, z: 0, ai: { lawful: true, combatDoctrineId: 'escort_screen', squadId: 'law' } });
  const concordAlly = ship(45, 1, { x: 150, z: 0, ai: { lawful: true, combatDoctrineId: 'escort_screen', squadId: 'law' } });
  const lawfulBlock = assessFriendlyFireLane({ shooter: concord, target, aimAngle: 0, entities: [concord, target, concordAlly], seed: SEED });
  assert.equal(lawfulBlock.reason, 'ally_in_lane');
});

// ── grudge harness ─────────────────────────────────────────────────────────────────────────

function grudgeSim(extraSystems = []) {
  const sim = createSimulation({ seed: SEED, systems: [lawSecurity, ...extraSystems] });
  sim.state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -400, z: 0 }, radius: 12, factionId: 'faction_free',
    data: { defId: 'ship_kestrel', ai: { squadId: null } },
  });
  sim.state.playerId = player.id;
  const events = [];
  const record = (event) => (payload) => {
    if (event === 'ai:telegraph' || event === 'combat:damage') {
      events.push({ event, payload: { ...payload } });
    }
  };
  sim.bus.on('ai:telegraph', record('ai:telegraph'));
  sim.bus.on('combat:damage', record('combat:damage'));
  return { sim, player, events };
}

function spawnReaver(sim, id, { x = 0, z = 0, squadId = 'reaver_wing', activity = null, retaliationTargetId = null } = {}) {
  return sim.spawn({
    id,
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    radius: 18,
    pos: { x, z },
    data: {
      ai: {
        archetype: 'pirate',
        combatDoctrineId: 'interceptor_flyby',
        squadId,
        ...(activity ? { activity } : {}),
        ...(retaliationTargetId != null ? { retaliationTargetId } : {}),
      },
      combat: {},
    },
  });
}

function loiterActivity() {
  return normalizeActivity({ kind: ActivityKind.LOITER, reason: 'r391_patrol', anchor: { x: 0, z: 0 }, leashRadius: 1800 });
}

function emitHit(sim, attackerId, targetId, origin = { kind: 'weapon', id: 'wpn_autocannon_s' }) {
  sim.bus.emit('combat:damage', { attackerId, targetId, applied: 10, origin });
}

// ── case 5 and 6: one direction, then the pair ─────────────────────────────────────────────

test('a same-team weapon hit turns the victim on the shooter inside one tick', () => {
  const { sim, events } = grudgeSim();
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing', activity: loiterActivity() });

  emitHit(sim, a.id, b.id);

  assert.equal(b.data.ai.retaliationTargetId, a.id);
  assert.equal(authoritativeAssignmentTargetId(b.data.ai.activity), a.id);
  assert.equal(isHostileForAI(sim.state, b, a), true);
  const telegraphs = events.filter((entry) => entry.event === 'ai:telegraph'
    && entry.payload.kind === 'return_fire_warning'
    && entry.payload.entityId === b.id && entry.payload.targetId === a.id);
  assert.equal(telegraphs.length, 1, 'one return-fire picture for the grudge');

  emitHit(sim, b.id, a.id);
  assert.equal(a.data.ai.retaliationTargetId, b.id, 'the pair fights both ways');
  sim.dispose();
});

// ── case 7: expiry and refresh ─────────────────────────────────────────────────────────────

test('a grudge expires after 12 s and restores the prior posture', () => {
  const { sim } = grudgeSim();
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing', activity: loiterActivity() });

  emitHit(sim, a.id, b.id);
  sim.runTicks(713);
  approx(sim.state.simTime, 713 / 60, 'simTime after 713 ticks');
  assert.equal(b.data.ai.retaliationTargetId, a.id, 'still hot just before the window closes');

  sim.runTicks(6);
  approx(sim.state.simTime, 719 / 60, 'simTime at 11.98 s');
  assert.equal(b.data.ai.retaliationTargetId, a.id, 'still hot at 11.98 s');

  sim.runTicks(1);
  assert.ok(sim.state.simTime >= NPC_GRUDGE_S);
  assert.equal(b.data.ai.retaliationTargetId, undefined, 'prior retaliation (none) restored');
  assert.equal(b.data.ai.activity.kind, ActivityKind.LOITER);
  assert.equal(b.data.ai.activity.reason, 'r391_patrol');
  assert.equal(b.data.ai.npcGrudge, undefined);
  assert.equal(b.data.ai.roe, undefined, 'an absent prior roe is restored by deleting the key, not writing null');
  assert.equal(isHostileForAI(sim.state, b, a), false);
  sim.dispose();
});

test('a grudge still hands the prior roe back when another system replaced the activity', () => {
  const { sim } = grudgeSim();
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing', activity: loiterActivity() });
  b.data.ai.roe = 'hold_fire';

  emitHit(sim, a.id, b.id);
  assert.equal(b.data.ai.roe, 'weapons_free', 'the grudge escalates posture');
  // A different writer takes the activity mid-grudge; the grudge's weapons-free roe is still
  // its own escalation and must revert at expiry rather than pinning the hull weapons-free.
  b.data.ai.activity = normalizeActivity({ kind: ActivityKind.LOITER, reason: 'other_writer', anchor: { x: 0, z: 0 }, leashRadius: 1800 });

  sim.runTicks(Math.ceil(NPC_GRUDGE_S * 60) + 1);
  assert.equal(b.data.ai.npcGrudge, undefined);
  assert.equal(b.data.ai.roe, 'hold_fire', 'the interrupted posture comes back');
  assert.equal(b.data.ai.activity.reason, 'other_writer', 'the foreign activity is left alone');
  sim.dispose();
});

test('a doctrine egress stash holding the grudge activity is reconciled at expiry', () => {
  const { sim } = grudgeSim();
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing', activity: loiterActivity() });
  b.data.ai.roe = 'hold_fire';

  emitHit(sim, a.id, b.id);
  assert.equal(b.data.ai.roe, 'weapons_free');
  // tacticalAI's egress phase stashes the grudge's live activity and owns the live channel with a
  // posture-reason activity — exactly the shape applyEngagementPosture leaves mid-egress.
  const grudgeActivity = b.data.ai.activity;
  b.data.ai.postureBaseActivity = grudgeActivity;
  b.data.ai.activity = normalizeActivity({
    kind: ActivityKind.LOITER, reason: 'posture:egress', anchor: { x: 0, z: 0 }, leashRadius: 1800, targetId: a.id,
  });

  sim.runTicks(Math.ceil(NPC_GRUDGE_S * 60) + 1);
  assert.equal(b.data.ai.npcGrudge, undefined);
  assert.equal(b.data.ai.roe, 'hold_fire', 'the interrupted posture comes back');
  assert.equal(b.data.ai.activity.reason, 'posture:egress', 'the live posture activity is left for the doctrine to commit');
  assert.equal(b.data.ai.postureBaseActivity.reason, 'r391_patrol',
    'the stash hands back the authored activity, not the expired grudge');
  assert.notEqual(b.data.ai.postureBaseActivity.reason, NPC_GRUDGE_REASON);
  sim.dispose();
});

test('a live player retaliation outlives the grudge window it interrupted', () => {
  const { sim, player } = grudgeSim();
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing', activity: loiterActivity() });
  b.data.ai.roe = 'hold_fire';

  emitHit(sim, a.id, b.id);
  assert.equal(b.data.ai.roe, 'weapons_free', 'the grudge escalates posture');
  // The player then shoots the same hull: _retaliate takes every posture channel over with the
  // same weapons_free value. Expiring the grudge must not disarm that live player fight.
  emitHit(sim, player.id, b.id);
  assert.equal(b.data.ai.retaliationTargetId, player.id);
  assert.equal(b.data.ai.activity.reason, 'retaliation:player_attack');
  assert.equal(b.data.combat.targetId, player.id);
  assert.equal(b.data.ai.roe, 'weapons_free');

  sim.runTicks(Math.ceil(NPC_GRUDGE_S * 60) + 1);
  assert.equal(b.data.ai.npcGrudge, undefined, 'the grudge window still closes');
  assert.equal(b.data.ai.roe, 'weapons_free', 'the player retaliation keeps its posture');
  assert.equal(b.data.ai.retaliationTargetId, player.id, 'the player target is left alone');
  assert.equal(b.data.ai.activity.reason, 'retaliation:player_attack', 'the player fight is left alone');
  assert.equal(b.data.combat.targetId, player.id);
  sim.dispose();
});

test('a scripted takeover that only leaves a stale weapon lock still keeps its posture', () => {
  const { sim, player } = grudgeSim();
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing', activity: loiterActivity() });
  const c = spawnReaver(sim, 4, { x: 400, z: 0, squadId: 'other_wing', activity: loiterActivity() });
  b.data.ai.roe = 'hold_fire';

  emitHit(sim, a.id, b.id);
  assert.equal(b.data.ai.roe, 'weapons_free', 'the grudge escalates posture');
  // Scripted writers (defensive presence, fulfillment route, concord binding) repoint the
  // retaliation and activity channels but leave the per-tick weapon lock pointing at the grudge
  // target. The lock alone must not count as grudge ownership or the live response is disarmed.
  b.data.ai.retaliationTargetId = c.id;
  b.data.ai.activity = normalizeActivity({ kind: ActivityKind.LOITER, reason: 'faction_presence', anchor: { x: 0, z: 0 }, leashRadius: 1800 });
  b.data.combat.targetId = a.id;
  assert.notEqual(b.data.ai.retaliationTargetId, a.id);
  assert.notEqual(b.data.ai.activity.reason, NPC_GRUDGE_REASON);

  sim.runTicks(Math.ceil(NPC_GRUDGE_S * 60) + 1);
  assert.equal(b.data.ai.npcGrudge, undefined, 'the grudge window still closes');
  assert.equal(b.data.ai.roe, 'weapons_free', 'the scripted takeover keeps its posture');
  assert.equal(b.data.ai.retaliationTargetId, c.id, 'the takeover target is left alone');
  assert.equal(b.data.ai.activity.reason, 'faction_presence', 'the foreign activity survives expiry');
  assert.equal(b.data.combat.targetId, null, 'the stale lock on the grudge target is cleared');
  sim.dispose();
});

test('a fresh hit at t=6 extends the grudge to t=18', () => {
  const { sim } = grudgeSim();
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing', activity: loiterActivity() });

  emitHit(sim, a.id, b.id);
  sim.runTicks(360);
  approx(sim.state.simTime, 6, 'simTime at t=6');
  emitHit(sim, a.id, b.id);
  approx(b.data.ai.npcGrudge.untilT, 18, 'refreshed expiry');

  sim.runTicks(360);
  approx(sim.state.simTime, 12, 'simTime at t=12');
  assert.equal(b.data.ai.retaliationTargetId, a.id, 'refreshed hits keep the grudge alive');

  sim.runTicks(360);
  approx(sim.state.simTime, 18, 'simTime at t=18');
  assert.equal(b.data.ai.npcGrudge, undefined);
  sim.dispose();
});

test('a chunked save load re-indexes a carried grudge and expires it on the reset clock', () => {
  const { sim } = grudgeSim();
  const law = sim.registry.get('lawSecurity');
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing', activity: loiterActivity() });
  emitHit(sim, a.id, b.id);
  assert.ok(b.data.ai.npcGrudge, 'the live grudge exists before the load');

  // The async restore lane drives deserializeChunked directly, and a fresh session index is empty.
  law._grudgeVictims.clear();
  law._grudgeIndexDirty = false;
  // The entity's ai world record carried the grudge across the save, but the clock restarted.
  b.data.ai.npcGrudge.untilT = 500;
  sim.state.simTime = 0;
  for (const _ of law.deserializeChunked({})) { /* async loader: every batch inline */ }

  sim.step();
  assert.equal(law._grudgeVictims.has(b.id), true, 'the chunked load re-indexes the carried grudge');
  assert.ok(b.data.ai.npcGrudge.untilT <= NPC_GRUDGE_S + 0.02,
    `the stale clock is clamped to the authored window (got ${b.data.ai.npcGrudge.untilT})`);

  sim.runTicks(780);
  assert.equal(b.data.ai.npcGrudge, undefined, 'the loaded grudge ends inside the authored window');
  assert.equal(b.data.ai.retaliationTargetId, undefined, 'the prior posture is restored');
  sim.dispose();
});

test('a rematerialized hull re-enters the grudge index on spawn and expires on the clock', () => {
  const { sim } = grudgeSim();
  const law = sim.registry.get('lawSecurity');
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing', activity: loiterActivity() });
  emitHit(sim, a.id, b.id);
  assert.ok(b.data.ai.npcGrudge, 'the grudge exists before the demote');
  const carried = b.data.ai; // the world record's AI survives the hull

  // Demote: the hull leaves the world; the session index must not keep its stale id.
  sim.helpers.removeEntity(b.id, { immediate: true });
  sim.step();
  assert.equal(law._grudgeVictims.has(b.id), false, 'the demoted hull leaves the index');

  // Promote: the record rematerializes in a live hull carrying the grudge it held.
  const promoted = sim.spawn({
    id: 4, type: 'ship', team: 1, factionId: 'faction_reach', radius: 18, pos: { x: 200, z: 0 },
    data: { ai: carried, combat: {} },
  });
  assert.equal(law._grudgeVictims.has(promoted.id), true, 'the carried grudge is re-indexed on spawn');
  assert.ok(promoted.data.ai.npcGrudge.untilT <= NPC_GRUDGE_S + 0.05,
    `the carried clock stays inside the authored window (got ${promoted.data.ai.npcGrudge.untilT})`);

  sim.runTicks(800);
  assert.equal(promoted.data.ai.npcGrudge, undefined, 'the rematerialized grudge expires inside the window');
  assert.equal(promoted.data.ai.retaliationTargetId, undefined, 'the prior posture is restored');
  sim.dispose();
});

test('a carried grudge whose window already closed ends at spawn', () => {
  const { sim } = grudgeSim();
  const target = spawnReaver(sim, 2, { x: 0, z: 0 });
  const stale = sim.spawn({
    id: 3, type: 'ship', team: 1, factionId: 'faction_reach', radius: 18, pos: { x: 200, z: 0 },
    data: {
      ai: {
        archetype: 'pirate',
        combatDoctrineId: 'interceptor_flyby',
        squadId: 'other_wing',
        retaliationTargetId: target.id,
        activity: normalizeActivity({
          kind: ActivityKind.ATTACK_RUN,
          reason: NPC_GRUDGE_REASON,
          anchor: { x: 200, z: 0 },
          leashRadius: 2200,
          targetId: target.id,
        }),
        npcGrudge: {
          targetId: target.id, startedT: -30, untilT: -1, cause: 'damage',
          prior: { retaliationTargetId: null, activity: null, roe: null },
        },
      },
      combat: {},
    },
  });
  assert.equal(stale.data.ai.npcGrudge, undefined, 'a closed window never re-opens at spawn');
  assert.equal(stale.data.ai.retaliationTargetId, undefined, 'the stale order is cleared');
  assert.equal(stale.data.ai.activity.reason, 'npc_grudge_expired');
  assert.equal(stale.data.ai.activity.targetId, null);
  sim.dispose();
});

// ── case 8: a prior player retaliation survives ────────────────────────────────────────────

test('ending a grudge returns the victim to an earlier player retaliation', () => {
  const { sim, player } = grudgeSim();
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, {
    x: 200, z: 0, squadId: 'other_wing', activity: loiterActivity(), retaliationTargetId: player.id,
  });

  emitHit(sim, a.id, b.id);
  assert.equal(b.data.ai.retaliationTargetId, a.id, 'the newer NPC grudge outranks the old one');
  sim.runTicks(720);
  assert.equal(b.data.ai.retaliationTargetId, player.id, 'the old player retaliation comes back');
  sim.dispose();
});

// ── case 9: lawful ships never grudge ──────────────────────────────────────────────────────

test('lawful Concord ships never carry an NPC grudge', () => {
  const { sim } = grudgeSim();
  const p1 = sim.spawn({
    id: 10, type: 'ship', team: 1, factionId: 'faction_scn', radius: 18, pos: { x: 0, z: 0 },
    data: { ai: { lawful: true, combatDoctrineId: 'escort_screen' }, combat: {} },
  });
  const p2 = sim.spawn({
    id: 11, type: 'ship', team: 1, factionId: 'faction_scn', radius: 18, pos: { x: 200, z: 0 },
    data: { ai: { lawful: true, combatDoctrineId: 'escort_screen' }, combat: {} },
  });
  emitHit(sim, p1.id, p2.id);
  assert.equal(p1.data.ai.npcGrudge, undefined);
  assert.equal(p2.data.ai.npcGrudge, undefined);
  sim.dispose();
});

// ── case 10: no player heat from an NPC brawl ──────────────────────────────────────────────

test('NPC-on-NPC grudges add no player heat', () => {
  const { sim } = grudgeSim([heat]);
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing' });
  emitHit(sim, a.id, b.id);
  emitHit(sim, b.id, a.id);
  assert.equal(sim.state.player.heat, 0);
  sim.dispose();
});

// ── case 11: the existing return-fire picture resolves ─────────────────────────────────────

test('the grudge telegraph resolves through the existing return-fire VFX receipt', () => {
  const { sim, events } = grudgeSim();
  const a = spawnReaver(sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing' });
  emitHit(sim, a.id, b.id);
  const telegraph = events.find((entry) => entry.event === 'ai:telegraph');
  assert.ok(telegraph);
  const receipt = resolveAdditionalActionVfxReceipt('ai:telegraph', telegraph.payload, sim.state);
  assert.ok(receipt, 'the telegraph draws a picture');
  assert.equal(receipt.sourceId, b.id);
  sim.dispose();
});

// ── case 12: hard collisions form mutual grudges ───────────────────────────────────────────

test('a hard NPC-NPC collision forms mutual grudges; a scrape forms none', () => {
  const hard = grudgeSim();
  const a = spawnReaver(hard.sim, 2, { x: 0, z: 0 });
  const b = spawnReaver(hard.sim, 3, { x: 200, z: 0, squadId: 'other_wing' });
  const collision = (targetId, otherId) => hard.sim.bus.emit('combat:collisionConsequence', {
    targetId, otherId, targetType: 'ship', otherType: 'ship', damageApplied: true, impactDamage: 20,
  });
  collision(b.id, a.id);
  collision(a.id, b.id);
  assert.equal(b.data.ai.retaliationTargetId, a.id);
  assert.equal(a.data.ai.retaliationTargetId, b.id);
  hard.sim.dispose();

  const scrape = grudgeSim();
  const c = spawnReaver(scrape.sim, 2, { x: 0, z: 0 });
  const d = spawnReaver(scrape.sim, 3, { x: 200, z: 0, squadId: 'other_wing' });
  scrape.sim.bus.emit('combat:collisionConsequence', {
    targetId: d.id, otherId: c.id, targetType: 'ship', otherType: 'ship', damageApplied: true, impactDamage: 0,
  });
  assert.equal(d.data.ai.npcGrudge, undefined);
  assert.equal(d.data.ai.retaliationTargetId, undefined);
  scrape.sim.dispose();
});

// ── case 13: determinism ───────────────────────────────────────────────────────────────────

test('the grudge sequence is deterministic across fresh sims', () => {
  const run = () => {
    const { sim, events } = grudgeSim();
    const a = spawnReaver(sim, 2, { x: 0, z: 0 });
    const b = spawnReaver(sim, 3, { x: 200, z: 0, squadId: 'other_wing', activity: loiterActivity() });
    emitHit(sim, a.id, b.id);
    emitHit(sim, b.id, a.id);
    sim.runTicks(720);
    const tail = events.filter((entry) => entry.event === 'ai:telegraph');
    const heatRows = events.filter((entry) => entry.event === 'combat:damage');
    sim.dispose();
    return { tail, heatRows };
  };
  assert.deepEqual(run(), run());
});

// ── case: NPC mine crossfire (AL-HF-01 mine delivery) ────────────────────────────────────────

test('a mine origin admits crossfire only through the same gates as a weapon', () => {
  const owner = ship(2, 1);
  const victim = ship(3, 1, { x: 200, z: 0 });
  const state = makeState([owner, victim]);
  assert.equal(crossfireDisciplineFor(owner, SEED), 'reckless', 'the owner is the reckless control');
  assert.equal(npcCrossfireAdmits(state, owner, victim, { kind: 'mine', id: 99 }), true,
    'a reckless owner\'s blast on a same-team hull is crossfire');
  assert.equal(npcCrossfireAdmits(state, owner, victim, { kind: 'splash', id: 99 }), false,
    'unlisted origin kinds still refuse');
  const lawfulTarget = ship(4, 1, { ai: { lawful: true } });
  assert.equal(npcCrossfireAdmits(state, owner, lawfulTarget, { kind: 'mine', id: 99 }), false,
    'a lawful hull never takes crossfire');
});

test("a reckless owner's mine trips on a same-team hull; a lawful owner's keeps its IFF", () => {
  const { sim } = grudgeSim([mines]);
  const liveMines = sim.registry.get('mines');
  const owner = spawnReaver(sim, 2, { x: -600, z: 0 });
  const teammate = spawnReaver(sim, 3, { x: 0, z: 0, squadId: 'other_wing' });
  const mine = liveMines.placeMine({
    ownerId: owner.id, pos: { x: 20, z: 0 }, armDelayS: 0, triggerRadius: 55, telegraph: false,
  });
  assert.ok(mine, 'the reckless mine was placed');
  const victim = liveMines._findTriggerVictim(sim.state, mine, mine.data);
  assert.equal(victim && victim.id, teammate.id, "a reckless owner's mine has no IFF for a same-team hull");

  const lawfulOwner = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_concord', radius: 18,
    pos: { x: -600, z: 400 },
    data: { ai: { lawful: true, archetype: 'patrol', combatDoctrineId: 'interceptor_flyby', squadId: 'law_wing' }, combat: {} },
  });
  const lawMine = liveMines.placeMine({
    ownerId: lawfulOwner.id, pos: { x: 20, z: 0 }, armDelayS: 0, triggerRadius: 55, telegraph: false,
  });
  assert.ok(lawMine, 'the lawful mine was placed');
  assert.equal(liveMines._findTriggerVictim(sim.state, lawMine, lawMine.data), null,
    "a lawful owner's mine still ignores teammates");
  sim.dispose();
});

test("a same-team mine blast lands as damage and turns the victim on the mine's owner", () => {
  const { sim, events } = grudgeSim([combat, mines]);
  const liveMines = sim.registry.get('mines');
  const owner = spawnReaver(sim, 2, { x: -600, z: 0 });
  const victim = sim.spawn({
    id: 3, type: 'ship', team: 1, factionId: 'faction_reach', radius: 18,
    pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, shield: 0, shieldMax: 0,
    data: {
      ai: {
        archetype: 'pirate', combatDoctrineId: 'interceptor_flyby', squadId: 'other_wing',
        activity: normalizeActivity({ kind: ActivityKind.LOITER, reason: 'r391_patrol', anchor: { x: 0, z: 0 }, leashRadius: 1800 }),
      },
      combat: {},
    },
  });
  const hullBefore = victim.hull;
  liveMines.placeMine({ ownerId: owner.id, pos: { x: 10, z: 0 }, armDelayS: 0, telegraph: false });
  sim.runTicks(1);
  assert.ok(victim.hull < hullBefore, `the blast lands as real same-team damage (${hullBefore} -> ${victim.hull})`);
  assert.equal(victim.data.ai.retaliationTargetId, owner.id, "the victim turns on the mine's owner");
  assert.equal(isHostileForAI(sim.state, victim, owner), true);
  assert.equal(events.filter((entry) => entry.event === 'ai:telegraph'
    && entry.payload.kind === 'return_fire_warning'
    && entry.payload.entityId === victim.id
    && entry.payload.targetId === owner.id).length, 1, 'one return-fire picture for the mine grudge');
  sim.dispose();
});
