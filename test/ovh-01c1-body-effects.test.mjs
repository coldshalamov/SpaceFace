// OVH-01c1 — Pilot Tree body effects. One seeded with/without pair per node at the
// packet's own threshold, plus the kick-stamp contract and an NPC-exclusion proof.
// Real owner seams: weapons' projectile-contact impulse site, collisionConsequences'
// physics:impact route, playerModifiers' swarm upkeep, damage's collision take-side,
// and flightV3's player boost state machine.
import test from 'node:test';
import assert from 'node:assert/strict';

import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { weapons, applyProjectilePhysicalContact } from '../src/systems/weapons.js';
import { maintainSwarmPlayerMods } from '../src/systems/playerModifiers.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import {
  recordImpulseProvenance,
  readKickStamp,
  KICK_STAMP_WINDOW_S,
} from '../src/combat/impulseKernel.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createRunState } from '../src/core/runState.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  snapshotFeatureMaps,
  restoreFeatureMaps,
  COMBAT_FLAGS,
} from '../src/data/featureFlags.js';

const THUMP_IMPULSE = (() => {
  const def = WEAPONS.find((w) => w && w.id === 'wpn_concussion_cannon_m');
  return Number.isFinite(def && def.impulsePerHit) ? def.impulsePerHit : 920;
})();

// ---------------------------------------------------------------------------
// harness

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(ev, fn) {
      let list = handlers.get(ev);
      if (!list) handlers.set(ev, (list = []));
      list.push(fn);
      return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
    },
    off(ev, fn) {
      const list = handlers.get(ev);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(ev, p) {
      emitted.push({ ev, p });
      const list = handlers.get(ev);
      if (list) for (const fn of list.slice()) fn(p);
    },
    queue() {},
    setPayloadSnapshot() {},
  };
}

let nextId = 0;
function uid(prefix) { nextId += 1; return `${prefix}${nextId}`; }

function makeBody({ id, type = 'ship', team = 1, hull = 100, hullMax = null,
  mass = 10, pos = { x: 0, z: 0 }, vel = { x: 0, z: 0 }, dynamic = true, extra = {} } = {}) {
  return {
    id: id ?? uid(type), type, team, alive: true,
    pos: { x: pos.x, z: pos.z }, vel: { x: vel.x, z: vel.z }, rot: 0,
    hull, hullMax: hullMax ?? hull, shield: 0, armorHp: 0, armorMax: 0,
    mass, radius: 2, flags: {}, data: {},
    physicsBody: { mass, dynamic },
    ...extra,
  };
}

function makeState(nodes, { withPlayer = true } = {}) {
  const entities = new Map();
  const bus = makeBus();
  const state = {
    mode: 'flight', tick: 10, simTime: 100, playerId: 'player',
    entities, bus, input: {}, ui: {}, settings: {},
    rng: () => 0.5,
    run: createRunState({ kind: 'survival', ruleset: 'swarm', seed: 47 }),
  };
  state.run.phase = 'active';
  if (nodes != null) {
    state.run.pilot = { points: {}, nodes: [...nodes], banked: 0, offer: null };
  }
  let player = null;
  if (withPlayer) {
    player = makeBody({ id: 'player', type: 'ship', team: 0, hull: 300, hullMax: 300, mass: 10 });
    entities.set('player', player);
    state.player = player;
  }
  return { state, bus, player };
}

function makeCollisionCtx(state, bus, kills) {
  const helpers = { getEntity: (id) => state.entities.get(id) || null };
  const registry = { get: () => null };
  const kernel = getCombatKernel(
    { state, bus, helpers, registry },
    {
      onKill: (target, killerId, lethal) => {
        target.alive = false;
        kills.push({ id: target.id, killerId, source: lethal && lethal.packet && lethal.packet.source });
        bus.emit('entity:killed', { id: target.id, killerId, type: target.type });
      },
    });
  const cc = Object.create(collisionConsequences);
  cc.init({ state, bus, helpers, registry: { get: (n) => (n === 'combat' ? { kernel } : null) } });
  return { cc, kernel, helpers };
}

function emitImpact(bus, a, b, { tick = 10, closing = 100, momentum = 60000,
  normal = { x: 1, z: 0 }, causalActorId = undefined } = {}) {
  bus.emit('physics:impact', {
    consequenceKernelVersion: 1,
    aId: a.id, bId: b.id, tick,
    impulse: momentum, dp: momentum,
    normal, pos: { x: b.pos.x, z: b.pos.z },
    preSolveClosingSpeed: closing,
    ...(causalActorId !== undefined ? { causalActorId } : {}),
  });
}

function stampKick(body, state, { at = state.simTime, hops = 0, impulse = { x: 400, z: 0 } } = {}) {
  return recordImpulseProvenance(body, {
    actorId: state.playerId, weaponId: 'wpn_concussion_cannon_m', tag: 'weapon_hit',
    appliedTick: state.tick, magnitude: Math.hypot(impulse.x, impulse.z),
    by: state.playerId, at, impulse, kickHops: hops,
  });
}

function makeWeaponsCtx(state, bus) {
  const helpers = {
    getEntity: (id) => state.entities.get(id) || null,
    hash32: (...args) => args.reduce((h, v) => (h * 31 + String(v).length) >>> 0, 7),
    mulberry32: () => () => 0.5,
    spawnEntity: (spec) => {
      const e = { id: spec.id ?? uid('proj'), alive: true, ...spec };
      state.entities.set(e.id, e);
      return e;
    },
  };
  const w = Object.create(weapons);
  w.init({ state, bus, helpers, registry: { get: () => null } });
  return { w, helpers };
}

function withCombatFlags(t, fn) {
  const snap = snapshotFeatureMaps();
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try { fn(); } finally { restoreFeatureMaps(snap); }
}

// ---------------------------------------------------------------------------

test('OVH-01c1 kick stamp — player projectile impulse stamps { by, at, impulse } on the victim', () => {
  const { state, bus } = makeState([]);
  const { w, helpers } = makeWeaponsCtx(state, bus);
  const npc = makeBody({ id: 'npc', team: 1 });
  const proj = makeBody({ id: 'proj', type: 'projectile', team: 0, extra: { ownerId: 'player' } });
  proj.data.weaponId = 'wpn_concussion_cannon_m';
  state.entities.set(npc.id, npc);
  state.entities.set(proj.id, proj);
  applyProjectilePhysicalContact(w, {
    projectileId: proj.id, targetId: npc.id, ownerId: 'player',
    damagePacket: { impulse: { x: 920, z: 0 }, source: {} },
    pos: { x: 0, z: 0 },
  });
  const stamp = readKickStamp(npc, state);
  assert.ok(stamp, 'player Thump impulse writes a kick stamp');
  assert.equal(stamp.by, 'player');
  assert.equal(stamp.at, state.simTime);
  assert.ok(stamp.impulse.x > 0);
  assert.equal(stamp.kickHops, 0);
  assert.ok(consumePhysicsCommand(npc), 'physics command was queued by the delivery route');
});

test('OVH-01c1 kick stamp — stale after 4 s of sim time; NPC kicks never carry one', () => {
  const { state } = makeState([]);
  const npc = makeBody({ id: 'npc', team: 1 });
  stampKick(npc, state, { at: state.simTime });
  assert.ok(readKickStamp(npc, state));
  state.simTime += KICK_STAMP_WINDOW_S + 0.5;
  assert.equal(readKickStamp(npc, state), null, 'stamp older than the window reads null');
  // An NPC-authored provenance record has no `by` = playerId, so it is not a player kick.
  state.simTime = 100;
  recordImpulseProvenance(npc, { actorId: 'npc2', tag: 'weapon_hit', appliedTick: state.tick, magnitude: 10 });
  assert.equal(readKickStamp(npc, state), null);
});

test('OVH-01c1 bruiser_heavy_slugs — Thump impulse ×1.3, damage untouched; non-Thump unchanged', () => {
  const run = (nodes, weaponId) => {
    const { state, bus } = makeState(nodes);
    const { w } = makeWeaponsCtx(state, bus);
    const npc = makeBody({ id: uid('npc'), team: 1 });
    const proj = makeBody({ id: uid('proj'), type: 'projectile', team: 0 });
    proj.data.weaponId = weaponId;
    state.entities.set(npc.id, npc);
    state.entities.set(proj.id, proj);
    applyProjectilePhysicalContact(w, {
      projectileId: proj.id, targetId: npc.id, ownerId: 'player',
      damagePacket: { impulse: { x: 100, z: 0 }, damage: 30, source: {} },
    });
    const cmd = consumePhysicsCommand(npc);
    const mag = cmd && cmd.impulses.length ? Math.hypot(cmd.impulses[0].x, cmd.impulses[0].z) : 0;
    return mag;
  };
  const base = run([], 'wpn_concussion_cannon_m');
  const boosted = run(['bruiser_heavy_slugs'], 'wpn_concussion_cannon_m');
  assert.ok(base > 0);
  assert.equal(boosted, base * 1.3);
  // Damage path untouched: the packet's scalar damage is what combat routes — impulse ≠ damage.
  const laser = run(['bruiser_heavy_slugs'], 'wpn_pulse_laser_s');
  const laserBase = run([], 'wpn_pulse_laser_s');
  assert.equal(laser, laserBase, 'non-Thump families get no kick bonus');
});

test('OVH-01c1 bruiser_stagger — kicked NPC cannot fire for 1 s of sim time, then can', () => {
  const { state, bus } = makeState(['bruiser_stagger']);
  const { w } = makeWeaponsCtx(state, bus);
  const npc = makeBody({
    id: 'npc', team: 1, extra: { cap: 1000 },
  });
  npc.data.intent = { fire: true };
  npc.data.weapons = [{ defId: 'wpn_pulse_laser_s' }];
  state.entities.set(npc.id, npc);
  state.entityIndex = { weaponShips: [npc], ships: [npc], projectiles: [], vectorMines: [] };
  state.entityList = [npc, state.player];
  const fires = () => bus.emitted.filter((e) => e.ev === 'combat:fire' && e.p && e.p.ownerId === 'npc').length;
  w.update(1 / 60, state);
  const beforeKick = fires();
  assert.ok(beforeKick > 0, 'sanity: unstaggered NPC fires');
  npc.data.kickStaggerUntil = state.simTime + 1;
  w.update(1 / 60, state);
  assert.equal(fires(), beforeKick, 'stagger suppresses NPC fire');
  state.simTime += 1.1;
  npc.data.weapons[0]._cooldown = 0;
  w.update(1 / 60, state);
  assert.ok(fires() > beforeKick, 'stagger lifts after the second elapses');
});

// ---------------------------------------------------------------------------
// collision-route nodes

function collisionPair(nodes, build, impact) {
  const { state, bus } = makeState(nodes);
  const kills = [];
  const { cc } = makeCollisionCtx(state, bus, kills);
  build(state);
  withCombatFlags(null, () => impact(bus, state));
  return { state, bus, kills };
}

test('OVH-01c1 juggernaut_juggernaut — above cruise, struck target takes double contact damage', () => {
  const run = (nodes, speed) => {
    const { state } = makeState(nodes);
    const kills = [];
    makeCollisionCtx(state, state.bus, kills);
    const npc = makeBody({ id: 'npc', team: 1, hull: 10000, hullMax: 10000, mass: 100,
      extra: { data: { encounter: { id: 'enc' } } } });
    state.entities.set(npc.id, npc);
    state.player.combatSpeed = 200;
    state.player.vel = { x: speed, z: 0 };
    withCombatFlags(null, () => emitImpact(state.bus, state.player, npc,
      { closing: 30, momentum: 2000 }));
    return 10000 - npc.hull;
  };
  const base = run([], 300);
  const fast = run(['juggernaut_juggernaut'], 300);
  const slow = run(['juggernaut_juggernaut'], 100);
  assert.ok(base > 0, 'baseline contact deals damage');
  assert.ok(Math.abs(fast - base * 2) < 1e-6,
    `above cruise the struck target takes double (got ${fast} vs ${base * 2})`);
  assert.equal(slow, base, 'below cruise the node does nothing');
});

test('OVH-01c1 juggernaut_snowplough — ramming a no-heavier hostile at ≥50% cruise kills it', () => {
  // With node, hostile, lighter, fast → dies with player credit.
  {
    const { state, bus } = makeState(['juggernaut_snowplough']);
    const kills = [];
    makeCollisionCtx(state, bus, kills);
    const npc = makeBody({ id: 'npc', team: 1, hull: 500, hullMax: 500, mass: 5,
      extra: { data: { encounter: { id: 'enc' } } } });
    state.entities.set(npc.id, npc);
    state.player.combatSpeed = 200;
    state.player.vel = { x: 150, z: 0 };
    withCombatFlags(null, () => emitImpact(bus, state.player, npc, { closing: 120, causalActorId: 'player' }));
    assert.equal(npc.alive, false, 'snowplough kills at threshold');
    assert.equal(kills[0].killerId, 'player');
  }
  // Without node: same impact is an ordinary (sub-lethal) contact.
  {
    const { state, bus } = makeState([]);
    const kills = [];
    makeCollisionCtx(state, bus, kills);
    const npc = makeBody({ id: 'npc', team: 1, hull: 500, hullMax: 500, mass: 5,
      extra: { data: { encounter: { id: 'enc' } } } });
    state.entities.set(npc.id, npc);
    state.player.combatSpeed = 200;
    state.player.vel = { x: 150, z: 0 };
    withCombatFlags(null, () => emitImpact(bus, state.player, npc, { closing: 120, causalActorId: 'player' }));
    assert.notEqual(npc.alive, false, 'no node, no plough kill');
    assert.equal(kills.length, 0);
  }
  // A heavier target does not plough.
  {
    const { state, bus } = makeState(['juggernaut_snowplough']);
    const kills = [];
    makeCollisionCtx(state, bus, kills);
    const heavy = makeBody({ id: 'big', team: 1, hull: 500, hullMax: 500, mass: 50,
      extra: { data: { encounter: { id: 'enc' } } } });
    state.entities.set(heavy.id, heavy);
    state.player.combatSpeed = 200;
    state.player.vel = { x: 150, z: 0 };
    withCombatFlags(null, () => emitImpact(bus, state.player, heavy, { closing: 120, causalActorId: 'player' }));
    assert.notEqual(heavy.alive, false, 'heavier target survives');
  }
  // A friendly contact does not plough.
  {
    const { state, bus } = makeState(['juggernaut_snowplough']);
    const kills = [];
    makeCollisionCtx(state, bus, kills);
    const civ = makeBody({ id: 'civ', team: 2, hull: 500, hullMax: 500, mass: 5 });
    state.entities.set(civ.id, civ);
    state.player.combatSpeed = 200;
    state.player.vel = { x: 150, z: 0 };
    withCombatFlags(null, () => emitImpact(bus, state.player, civ, { closing: 120, causalActorId: 'player' }));
    assert.notEqual(civ.alive, false, 'non-hostile never ploughs');
  }
});

test('OVH-01c1 juggernaut_shoulder_check — boosting into a body adds a Thump kick + stamp', () => {
  const { state, bus } = makeState(['juggernaut_shoulder_check']);
  const kills = [];
  makeCollisionCtx(state, bus, kills);
  const npc = makeBody({ id: 'npc', team: 1, hull: 10000, hullMax: 10000 });
  state.entities.set(npc.id, npc);
  state.player.combatSpeed = 200;
  state.player.flags.boosting = true;
  withCombatFlags(null, () => emitImpact(bus, state.player, npc));
  const cmd = consumePhysicsCommand(npc);
  assert.ok(cmd && cmd.impulses.length > 0, 'shoulder check queues a kick impulse');
  const mag = Math.hypot(cmd.impulses[0].x, cmd.impulses[0].z);
  assert.equal(mag, THUMP_IMPULSE, 'kick is the Thump family impulse');
  const stamp = readKickStamp(npc, state);
  assert.ok(stamp, 'a shoulder-checked body carries the player kick stamp');
  // Without the node: collision damage still routes but no kick is queued.
  const plain = makeState([]);
  const plainKills = [];
  makeCollisionCtx(plain.state, plain.bus, plainKills);
  const npc2 = makeBody({ id: 'npc', team: 1, hull: 10000, hullMax: 10000 });
  plain.state.entities.set(npc2.id, npc2);
  plain.state.player.flags.boosting = true;
  withCombatFlags(null, () => emitImpact(plain.bus, plain.state.player, npc2));
  const cmd2 = consumePhysicsCommand(npc2);
  assert.ok(!cmd2 || cmd2.impulses.length === 0, 'no node → no extra kick impulse');
  assert.equal(readKickStamp(npc2, plain.state), null);
});

test('OVH-01c1 juggernaut_unstoppable — contact never tumbles or disarms the player', () => {
  const { state, bus } = makeState(['juggernaut_unstoppable', 'juggernaut_snowplough']);
  const kills = [];
  makeCollisionCtx(state, bus, kills);
  const heavy = makeBody({ id: 'big', team: 1, hull: 100000, hullMax: 100000, mass: 500 });
  state.entities.set(heavy.id, heavy);
  withCombatFlags(null, () => emitImpact(bus, heavy, state.player, { closing: 500, momentum: 500000 }));
  assert.equal(state.player.alive, true);
  assert.equal(state.player.hull, 300, 'player takes no contact hull damage (invariant)');
  assert.ok(!state.player.data.control, 'no helm-loss control write on the player');
  assert.ok(!state.player.data.tumble && !state.player.tumbling, 'no tumble status on the player');
});

test('OVH-01c1 juggernaut_last_stand — collision damage dealt below 15% hull heals, capped at 30%', () => {
  const run = (nodes, hull, hits = 1) => {
    const { state, bus } = makeState(nodes);
    const kills = [];
    makeCollisionCtx(state, bus, kills);
    state.player.hull = hull;
    for (let i = 0; i < hits; i++) {
      const npc = makeBody({ id: uid('npc'), team: 1, hull: 100000, hullMax: 100000 });
      state.entities.set(npc.id, npc);
      // Player-authored provenance on the strike so "damage you dealt" attributes.
      recordImpulseProvenance(npc, {
        actorId: 'player', tag: 'weapon_hit', appliedTick: state.tick, magnitude: 10,
      });
      withCombatFlags(null, () => emitImpact(bus, state.player, npc, { causalActorId: 'player' }));
    }
    return state.player.hull;
  };
  const below = run([], 40); // 13% of 300 — under threshold, no node: no heal.
  assert.equal(below, 40);
  const healed = run(['juggernaut_last_stand'], 40);
  assert.ok(healed > 40, 'below 15% hull the dealt collision damage repairs');
  const above = run(['juggernaut_last_stand'], 100);
  assert.equal(above, 100, 'above 15% hull the node does nothing');
  // Cap: Last Stand never lifts the hull above 30% of hullMax (90 of 300).
  const capped = run(['juggernaut_last_stand'], 40, 12);
  assert.ok(capped <= 90 + 1e-9, `never heals above 30% of max (got ${capped})`);
  // The cap is a hull level, not a lifetime total: every later low-hull moment heals again.
  {
    const { state, bus } = makeState(['juggernaut_last_stand']);
    const kills = [];
    makeCollisionCtx(state, bus, kills);
    for (let moment = 1; moment <= 3; moment++) {
      state.player.hull = 40;
      const npc = makeBody({ id: uid('npc'), team: 1, hull: 100000, hullMax: 100000 });
      state.entities.set(npc.id, npc);
      recordImpulseProvenance(npc, {
        actorId: 'player', tag: 'weapon_hit', appliedTick: state.tick, magnitude: 10,
      });
      withCombatFlags(null, () => emitImpact(bus, state.player, npc, { causalActorId: 'player' }));
      assert.ok(state.player.hull > 40, `low-hull moment ${moment} still heals (got ${state.player.hull})`);
      assert.ok(state.player.hull <= 90 + 1e-9, `moment ${moment} stays at or under 30% of max`);
    }
  }
});

test('OVH-01c1 juggernaut_ram_plate — bow contact under 60% cruise pays nothing (take-side)', () => {
  // Take-side lives in the damage router: collision-family packets aimed at the player.
  const run = (nodes, { speed = 50, approach = { x: 1, z: 0 }, rot = 0 } = {}) => {
    const { state, bus } = makeState(nodes);
    const kills = [];
    const { kernel } = makeCollisionCtx(state, bus, kills);
    state.player.combatSpeed = 200;
    state.player.vel = { x: speed, z: 0 };
    state.player.rot = rot;
    state.player.hull = 300;
    const packet = scalarHitToDamagePacket({
      damage: 40, damageType: 'kinetic', approach,
      source: { kind: 'collision_craft' },
    });
    packet.flags = { allowAnyTarget: true };
    kernel.routeDamage({
      attackerId: 'npc', targetId: 'player', packet,
      origin: { kind: 'collision', id: 'craft' },
    });
    return 300 - state.player.hull;
  };
  const base = run([]);
  assert.ok(base > 0, 'baseline contact packet damages the player hull');
  const bowSlow = run(['juggernaut_ram_plate']);
  assert.equal(bowSlow, 0, 'bow contact below 60% cruise takes nothing');
  const bowFast = run(['juggernaut_ram_plate'], { speed: 150 });
  assert.ok(bowFast > 0, 'above 60% cruise the plate does not cover the hit');
  const sideSlow = run(['juggernaut_ram_plate'], { approach: { x: -1, z: 0 } });
  assert.ok(sideSlow > 0, 'a stern contact is outside the ±60° bow cone');
});

test('OVH-01c1 juggernaut_ballast — player hull mass and physics body +30%', () => {
  const run = (nodes) => {
    const { state } = makeState(nodes);
    const player = state.player;
    player.mass = 10;
    player.physicsBody = { mass: 10, inertiaY: 50, dynamic: true };
    const helpers = { repairCombatHulls: () => ({ ok: false }) };
    maintainSwarmPlayerMods(state, helpers, 1 / 60);
    return { mass: player.mass, bodyMass: player.physicsBody.mass, inertia: player.physicsBody.inertiaY };
  };
  const base = run([]);
  const ballasted = run(['juggernaut_ballast']);
  assert.equal(base.mass, 10);
  assert.equal(ballasted.mass, 13, 'flat mass ×1.3');
  assert.equal(ballasted.bodyMass, 13, 'physicsBody.mass ×1.3');
  assert.equal(ballasted.inertia, 65, 'inertia scales with the same multiplier');
});

test('OVH-01c1 juggernaut_thick_skin — 4 s quiet → 4%/s armour regen, hull fallback, hit resets', () => {
  const helpersFor = (state) => ({
    repairCombatHulls: (repairs, source) => {
      const r = repairs[0];
      const e = state.entities.get(r.entityId);
      const applied = Math.min(r.amount, e.hullMax - e.hull);
      e.hull += applied;
      return { ok: true, repairs: [{ entityId: r.entityId, applied }] };
    },
  });
  // Armour path: regen starts only after 4 s without damage.
  {
    const { state } = makeState(['juggernaut_thick_skin']);
    const p = state.player;
    p.armorMax = 100; p.armorHp = 0;
    p.lastDamageT = 0; state.simTime = 2; // 2 s quiet — not yet.
    maintainSwarmPlayerMods(state, helpersFor(state), 1);
    assert.equal(p.armorHp, 0, 'regen waits for 4 s without damage');
    state.simTime = 4;
    maintainSwarmPlayerMods(state, helpersFor(state), 1);
    assert.equal(p.armorHp, 4, '4% of armour max per second');
    maintainSwarmPlayerMods(state, helpersFor(state), 25);
    assert.equal(p.armorHp, 100, 'regen stops at full');
    p.lastDamageT = 110; state.simTime = 110;
    maintainSwarmPlayerMods(state, helpersFor(state), 1);
    assert.equal(p.armorHp, 100, 'a fresh hit restarts the wait');
  }
  // Hull fallback: no armour layer → hull routes through repairCombatHulls.
  {
    const { state } = makeState(['juggernaut_thick_skin']);
    const p = state.player;
    p.armorMax = 0; p.armorHp = 0; p.hull = 100; p.hullMax = 300;
    p.lastDamageT = 0; state.simTime = 10;
    maintainSwarmPlayerMods(state, helpersFor(state), 1);
    assert.equal(p.hull, 112, 'no armour → hull regens at 4% hullMax/s');
    // No node → identical state, no regen.
    const plain = makeState(null);
    const pp = plain.state.player;
    pp.hull = 100; pp.hullMax = 300;
    maintainSwarmPlayerMods(plain.state, helpersFor(plain.state), 1);
    assert.equal(pp.hull, 100, 'no node → no regen');
  }
});

test('OVH-01c1 juggernaut_run_up — uninterrupted boost raises the speed cap, break drops it', () => {
  const mk = (nodes) => {
    const { state } = makeState(nodes);
    const fl = Object.create(flightV3);
    fl.bus = { emit() {}, on() {}, off() {} };
    fl.state = state;
    const p = state.player;
    p.driveId = 'drive_reaction_m';
    p.boost = { energy: 10000, max: 10000, drainRate: 1, regenRate: 1, dashImpulse: 0 };
    return { state, fl, p };
  };
  const maxSpeedOf = (p) => {
    const cmd = consumePhysicsCommand(p);
    return cmd && cmd.control ? cmd.control.maxSpeed : null;
  };
  const step = (fl, p, state, boost, seconds) => {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) {
      state.simTime += 1 / 60;
      state.tick += 1;
      fl._stepCraft(p, { throttle: 1, boost }, 1 / 60, state, true);
    }
    return maxSpeedOf(p);
  };
  // Baseline: boosted cap is the authored boostSpeedMult ceiling.
  const plain = mk([]);
  const plainCap = step(plain.fl, plain.p, plain.state, true, 6);
  // With the node: each unbroken boost-second adds 20%, ×2 at 5 s; a break resets.
  const run = mk(['juggernaut_run_up']);
  const earlyCap = step(run.fl, run.p, run.state, true, 1);
  const fullCap = step(run.fl, run.p, run.state, true, 5);
  assert.ok(earlyCap > plainCap, 'run-up begins lifting the cap inside the first second');
  assert.ok(fullCap > earlyCap, 'cap keeps climbing while boost holds');
  assert.ok(Math.abs(fullCap - 2 * plainCap) < Math.max(1e-6, plainCap * 0.05),
    `cap saturates at ×2 after five seconds (got ${fullCap} vs plain ${plainCap})`);
  // Breaking boost removes the bonus.
  run.fl._prevBoost = true;
  step(run.fl, run.p, run.state, false, 0.5);
  const reburn = step(run.fl, run.p, run.state, true, 0.5);
  assert.ok(reburn < fullCap, 'a broken boost drops the run-up bonus');
});

// ---------------------------------------------------------------------------
// Bruiser chain nodes

test('OVH-01c1 bruiser_billiards — stamped body kills the first hostile it hits, once per kick', () => {
  const { state, bus } = makeState(['bruiser_billiards']);
  const kills = [];
  makeCollisionCtx(state, bus, kills);
  const striker = makeBody({ id: 'striker', team: 0, type: 'wreck', hull: 500, hullMax: 500 });
  const hostile = makeBody({ id: 'foe', team: 1, hull: 99999, hullMax: 99999,
    extra: { data: { encounter: { id: 'enc' } } } });
  const hostile2 = makeBody({ id: 'foe2', team: 1, hull: 99999, hullMax: 99999,
    extra: { data: { encounter: { id: 'enc' } } } });
  state.entities.set(striker.id, striker);
  state.entities.set(hostile.id, hostile);
  state.entities.set(hostile2.id, hostile2);
  stampKick(striker, state);
  // First hostile contact above the damage speed → dies with player credit.
  withCombatFlags(null, () => emitImpact(bus, striker, hostile, { closing: 50 }));
  assert.equal(hostile.alive, false, 'billiards kills the first hostile regardless of hull');
  assert.equal(kills[0].killerId, 'player');
  // Same kick, second contact → no second billiards kill (once per kick).
  bus.emitted.length = 0;
  withCombatFlags(null, () => emitImpact(bus, striker, hostile2, { closing: 50, tick: 11 }));
  assert.notEqual(hostile2.alive, false, 'the kill allowance is spent once per kick');
  // Below the damage speed: no kill even with a fresh stamp.
  const { state: s2, bus: b2 } = makeState(['bruiser_billiards']);
  const kills2 = [];
  makeCollisionCtx(s2, b2, kills2);
  const st2 = makeBody({ id: 'striker', team: 0, type: 'wreck', hull: 500 });
  const foe3 = makeBody({ id: 'foe3', team: 1, hull: 99999,
    extra: { data: { encounter: { id: 'enc' } } } });
  s2.entities.set(st2.id, st2);
  s2.entities.set(foe3.id, foe3);
  stampKick(st2, s2);
  withCombatFlags(null, () => emitImpact(b2, st2, foe3, { closing: 3 }));
  assert.notEqual(foe3.alive, false, 'under the damage speed there is no billiards kill');
});

test('OVH-01c1 bruiser_pass_it_on — stamped body hands its kick to what it hits, one hop', () => {
  const { state, bus } = makeState(['bruiser_pass_it_on']);
  const kills = [];
  makeCollisionCtx(state, bus, kills);
  const striker = makeBody({ id: 'striker', team: 0, type: 'wreck' });
  const hop = makeBody({ id: 'hop', team: 1, hull: 99999 });
  const last = makeBody({ id: 'last', team: 1, hull: 99999 });
  state.entities.set(striker.id, striker);
  state.entities.set(hop.id, hop);
  state.entities.set(last.id, last);
  stampKick(striker, state, { impulse: { x: 500, z: 0 } });
  withCombatFlags(null, () => emitImpact(bus, striker, hop, { closing: 20, normal: { x: 1, z: 0 } }));
  const cmd = consumePhysicsCommand(hop);
  assert.ok(cmd && cmd.impulses.length > 0, 'the receiver takes the same kick impulse');
  const hopStamp = readKickStamp(hop, state);
  assert.ok(hopStamp, 'the receiver is player-stamped');
  assert.equal(hopStamp.kickHops, 1, 'one hop recorded');
  assert.equal(Math.hypot(cmd.impulses[0].x, cmd.impulses[0].z), 500, 'same kick magnitude');
  // The hop-1 stamp cannot pass it on again (one hop only).
  withCombatFlags(null, () => emitImpact(bus, hop, last, { closing: 20, tick: 11 }));
  assert.equal(readKickStamp(last, state), null, 'no second hop');
  const cmd2 = consumePhysicsCommand(last);
  assert.ok(!cmd2 || cmd2.impulses.length === 0, 'no second-hop impulse');
});

test('OVH-01c1 bruiser_wall_splat — stamped body dies on a fixed body above damage speed', () => {
  const { state, bus } = makeState(['bruiser_wall_splat']);
  const kills = [];
  makeCollisionCtx(state, bus, kills);
  const stamped = makeBody({ id: 'stamped', team: 1, hull: 99999 });
  const wall = makeBody({ id: 'wall', type: 'asteroid', team: 0, dynamic: false, mass: 1000 });
  state.entities.set(stamped.id, stamped);
  state.entities.set(wall.id, wall);
  stampKick(stamped, state);
  withCombatFlags(null, () => emitImpact(bus, stamped, wall, { closing: 50 }));
  assert.equal(stamped.alive, false, 'stamped body splats on the wall');
  assert.equal(kills[0].killerId, 'player');
  // Below the speed floor the same contact is an ordinary bounce.
  const s2 = makeState(['bruiser_wall_splat']);
  const kills2 = [];
  makeCollisionCtx(s2.state, s2.bus, kills2);
  const stamped2 = makeBody({ id: 'stamped', team: 1, hull: 99999 });
  const wall2 = makeBody({ id: 'wall', type: 'asteroid', team: 0, dynamic: false, mass: 1000 });
  s2.state.entities.set(stamped2.id, stamped2);
  s2.state.entities.set(wall2.id, wall2);
  stampKick(stamped2, s2.state);
  withCombatFlags(null, () => emitImpact(s2.bus, stamped2, wall2, { closing: 3 }));
  assert.notEqual(stamped2.alive, false, 'under the speed floor the body survives');
});

test('OVH-01c1 bruiser_newtons_cradle — stamped body gives all momentum to the next body', () => {
  const { state, bus } = makeState(['bruiser_newtons_cradle']);
  const kills = [];
  makeCollisionCtx(state, bus, kills);
  const striker = makeBody({ id: 'striker', team: 0, type: 'wreck', mass: 10, vel: { x: 40, z: 0 } });
  const receiver = makeBody({ id: 'recv', team: 1, hull: 99999 });
  state.entities.set(striker.id, striker);
  state.entities.set(receiver.id, receiver);
  stampKick(striker, state);
  withCombatFlags(null, () => emitImpact(bus, striker, receiver, { closing: 20 }));
  const stop = consumePhysicsCommand(striker);
  assert.ok(stop && stop.impulses.length > 0, 'striker gets a full stop impulse');
  assert.ok(Math.abs(stop.impulses[0].x + 400) < 1e-6 && Math.abs(stop.impulses[0].z) < 1e-6,
    'stop impulse cancels exactly m·v');
  const go = consumePhysicsCommand(receiver);
  assert.ok(go && go.impulses.length > 0, 'receiver takes the whole momentum');
  assert.ok(Math.abs(go.impulses[0].x - 400) < 1e-6, 'receiver impulse equals striker momentum');
  const stamp = readKickStamp(receiver, state);
  assert.ok(stamp && stamp.kickHops === 1, 'receiver becomes player-stamped, one hop deeper');
});

test('OVH-01c1 NPC exclusion — an NPC with the same contact/kick gets no pilot effect', () => {
  // NPC↔NPC contact with an NPC-“stamped” record: no pilot node fires, no stamp exists.
  const { state, bus } = makeState(['bruiser_billiards', 'bruiser_pass_it_on', 'juggernaut_juggernaut', 'juggernaut_snowplough']);
  const kills = [];
  makeCollisionCtx(state, bus, kills);
  const a = makeBody({ id: 'npcA', team: 1, hull: 500, mass: 10, vel: { x: 60, z: 0 } });
  const b = makeBody({ id: 'npcB', team: 1, hull: 500, mass: 10 });
  state.entities.set(a.id, a);
  state.entities.set(b.id, b);
  // NPC-authored provenance — not a player kick stamp (by !== playerId).
  recordImpulseProvenance(a, { actorId: 'npcA', tag: 'weapon_hit', appliedTick: state.tick, magnitude: 500 });
  withCombatFlags(null, () => emitImpact(bus, a, b, { closing: 60, momentum: 60000 }));
  assert.equal(readKickStamp(b, state), null, 'NPC contact writes no player kick stamp');
  assert.notEqual(b.alive, false, 'no billiards kill for NPC traffic');
  assert.equal(kills.filter((k) => k.killerId === 'player').length, 0, 'no player credit on NPC traffic');
  // Player never gains the stamp from an NPC kick either.
  assert.equal(readKickStamp(a, state), null);
});
