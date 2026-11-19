// OVH-01c3 — Pilot Tree gun effects (Gunner wave 1). One seeded with/without pair
// per built node at the packet's own threshold, through the real owner systems:
// damage's routeDamage kernel (hollow point, execution), the weapons system's
// per-tick service + fire path (steady hands, drum, spin-up) and its
// projectile:hit handler (ricochet) — plus an NPC-exclusion proof that a hull
// holding every Gunner node still fires, heats and dies like an unpicked ship.
import test from 'node:test';
import assert from 'node:assert/strict';

import { weapons } from '../src/systems/weapons.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createRunState } from '../src/core/runState.js';
import { surfaceContactFromBodies } from '../src/core/surfaceContact.js';

const ALL_GUNNER = Object.freeze([
  'gunner_hollow_point', 'gunner_steady_hands', 'gunner_drum',
  'gunner_spin_up', 'gunner_execution', 'gunner_ricochet',
]);

// ---------------------------------------------------------------------------
// harness (ovh-01c1 shape)

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
  return { kernel, helpers };
}

function makeWeaponsCtx(state, bus, { rng = () => 0.5 } = {}) {
  const helpers = {
    getEntity: (id) => state.entities.get(id) || null,
    hash32: (...args) => args.reduce((h, v) => (h * 31 + String(v).length) >>> 0, 7),
    mulberry32: () => rng,
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

// A firing ship: cap so mounts can spend, the weapon-ship index so _tickWeapons
// cools cooldowns, input.fire held. entityIndex stays a plain object so the
// NPC-quiet latch can never engage and the full update path runs.
function makeFireCtx(nodes, mounts, { speed = 0, cruise = 200, shipId = 'player' } = {}) {
  const { state, bus, player } = makeState(nodes);
  player.cap = 10000;
  player.combatSpeed = cruise;
  player.vel = { x: speed, z: 0 };
  player.data.weapons = mounts.map((m) => ({ ...m }));
  state.entityIndex = { weaponShips: [player], ships: [player], projectiles: [], vectorMines: [] };
  state.entityList = [player];
  state.input.fire = true;
  const { w, helpers } = makeWeaponsCtx(state, bus);
  const ship = state.entities.get(shipId) || player;
  return { state, bus, player, w, helpers, ship };
}

const fires = (bus, ownerId) => bus.emitted
  .filter((e) => e.ev === 'combat:fire' && e.p && e.p.ownerId === ownerId);

// ---------------------------------------------------------------------------
// damage-route nodes

function routeWeaponHit(state, kernel, { attackerId, targetId, damage = 20,
  weaponId = 'wpn_pulse_laser_s' } = {}) {
  return kernel.routeDamage({
    attackerId, targetId,
    packet: scalarHitToDamagePacket({
      damage, damageType: 'kinetic', pos: { x: 0, z: 0 },
      source: { kind: 'weapon', id: weaponId, weaponId },
    }),
    origin: { kind: 'weapon', id: weaponId },
  });
}

test('OVH-01c3 gunner_hollow_point — unshielded hull takes 50 % more; live shield keeps authored damage', () => {
  const run = (nodes, shield = 0, attackerId = 'player') => {
    const { state, bus } = makeState(nodes);
    const { kernel } = makeCollisionCtx(state, bus, []);
    const npc = makeBody({ id: uid('npc'), team: 1, hull: 1000, hullMax: 1000 });
    npc.shield = shield;
    state.entities.set(npc.id, npc);
    routeWeaponHit(state, kernel, { attackerId, targetId: npc.id });
    return 1000 - npc.hull;
  };
  const base = run([]);
  assert.ok(base > 0, 'sanity: a baseline weapon hit lands hull damage');
  const boosted = run(['gunner_hollow_point']);
  assert.ok(Math.abs(boosted - base * 1.5) < 1e-6,
    `unshielded hull takes ×1.5 (got ${boosted} vs ${base * 1.5})`);
  // A hull still holding its shield is outside the node: the packet soaks on the shield.
  const shielded = run(['gunner_hollow_point'], 500);
  assert.equal(shielded, 0, 'a live shield eats the shot before the hull gate reads it');
  // An NPC attacker on an unshielded hull gets nothing.
  const npcDealt = run(['gunner_hollow_point'], 0, 'npcA');
  assert.equal(npcDealt, base, 'NPC fire never reads the pilot record');
});

test('OVH-01c3 gunner_execution — a hull under 20 % dies to the next player hit; at 20 % it holds', () => {
  const run = (nodes, hull, attackerId = 'player') => {
    const { state, bus } = makeState(nodes);
    const kills = [];
    const { kernel } = makeCollisionCtx(state, bus, kills);
    const npc = makeBody({ id: uid('npc'), team: 1, hull, hullMax: 100 });
    state.entities.set(npc.id, npc);
    routeWeaponHit(state, kernel, { attackerId, targetId: npc.id, damage: 5 });
    return { npc, kills };
  };
  // 19 % hull — under the threshold: the node executes; the ordinary kill path
  // owns the death and the player keeps the credit.
  {
    const { npc, kills } = run(['gunner_execution'], 19);
    assert.equal(npc.hull, 0, 'the whole remainder routes through the ordinary hullDamage write');
    assert.equal(npc.alive, false, 'the existing kill path claims the hull');
    assert.equal(kills[0] && kills[0].killerId, 'player', 'execution is player-credited');
  }
  // Same hit without the node: it wounds, nothing more.
  {
    const { npc } = run([], 19);
    assert.ok(npc.hull > 0 && npc.hull < 19, 'no node — the small hit only wounds');
    assert.notEqual(npc.alive, false);
  }
  // Exactly 20 % is not below 20 %.
  {
    const { npc } = run(['gunner_execution'], 20);
    assert.ok(npc.hull > 0 && npc.hull < 20, 'at the line the hull takes ordinary damage');
    assert.notEqual(npc.alive, false);
  }
  // An NPC attacker never spends it either.
  {
    const { npc } = run(['gunner_execution'], 19, 'npcA');
    assert.ok(npc.hull > 0, 'NPC fire on a low hull stays ordinary');
  }
});

// ---------------------------------------------------------------------------
// weapon-service nodes

test('OVH-01c3 gunner_steady_hands — above 20 % cruise the player\'s guns do not spread', () => {
  // The draw count lives on the harness rng: with the node, the spread stream
  // must not be touched at all (0 draws); the authored path draws 2 per shot.
  const runCounted = (nodes, speed) => {
    let draws = 0;
    const rng = () => { draws++; return 0.9; };
    const { state, bus, player } = makeState(nodes);
    player.cap = 10000;
    player.combatSpeed = 200;
    player.vel = { x: speed, z: 0 };
    player.data.weapons = [{ defId: 'wpn_pulse_laser_s' }];
    state.entityIndex = { weaponShips: [player], ships: [player], projectiles: [], vectorMines: [] };
    state.entityList = [player];
    state.input.fire = true;
    const { w } = makeWeaponsCtx(state, bus, { rng });
    w.update(1 / 60, state);
    return { dirs: fires(bus, 'player').map((e) => e.p.dir), draws };
  };
  // 60 > 0.2 × 200: with the node the barrel holds the bare line — and never
  // even touches the spread stream.
  const fast = runCounted(['gunner_steady_hands'], 60);
  assert.equal(fast.dirs.length, 1, 'sanity: the mount fired');
  assert.equal(fast.dirs[0], 0, 'no spread — the round leaves on the bare hardpoint line');
  assert.equal(fast.draws, 0, 'the spread RNG is not drawn at all');
  // Same speed without the node: the authored 0.6° spread is drawn per shot.
  const plain = runCounted([], 60);
  assert.equal(plain.draws, 2, 'the authored spread draws its two reads');
  assert.notEqual(plain.dirs[0], 0, 'the shot drifts off the bare line');
  // 30 < 0.2 × 200: below the threshold the node keeps authored behavior.
  const slow = runCounted(['gunner_steady_hands'], 30);
  assert.equal(slow.draws, 2, 'at 15 % of cruise the spread still applies');
  assert.notEqual(slow.dirs[0], 0);
});

test('OVH-01c3 gunner_drum — the player\'s heat bar is twice as long (34 shots vs 17)', () => {
  const run = (nodes) => {
    const { state, bus, w, ship } = makeFireCtx(nodes,
      [{ defId: 'wpn_pulse_laser_s', heatDissip: 0 }]);
    const mount = ship.data.weapons[0];
    for (let i = 0; i < 900 && (mount._heat || 0) < (mount.heatMax || 100); i++) {
      w.update(1 / 60, state);
    }
    return { count: fires(bus, 'player').length, heatMax: mount.heatMax };
  };
  const plain = run([]);
  assert.equal(plain.heatMax, undefined, 'no node — the mount inherits the authored 100');
  assert.equal(plain.count, 17, '17 six-point shots peg a 100 bar');
  const drum = run(['gunner_drum']);
  assert.equal(drum.heatMax, 200, 'the stamped bar is doubled');
  assert.equal(drum.count, 34, 'the doubled bar takes exactly twice the shots');
});

test('OVH-01c3 gunner_spin_up — held Hose stream spools to ×1.8 at two seconds; release resets', () => {
  const DT = 1 / 60;
  const BASE_CD = 1 / 14;   // wpn_bank_stream_m authored rof
  const run = (nodes, defId = 'wpn_bank_stream_m') => {
    const { state, bus, w, ship } = makeFireCtx(nodes,
      [{ defId, heatDissip: 0, heatMax: 1e6 }]);
    const mount = ship.data.weapons[0];
    let lastCd = null;
    const ticks = (n) => {
      for (let i = 0; i < n; i++) {
        const before = bus.emitted.length;
        w.update(DT, state);
        if (bus.emitted.some((e, idx) => idx >= before && e.ev === 'combat:fire')) {
          lastCd = mount._cooldown;
        }
      }
    };
    return { ticks, mount, ship, state, lastCdRef: () => lastCd };
  };
  // 2.5 s held — past the 2 s cap: the cooldown the stream chambers is base/1.8.
  const spun = run(['gunner_spin_up']);
  spun.ticks(150);
  const heldCd = spun.lastCdRef();
  assert.ok(Math.abs(heldCd - BASE_CD / 1.8) < 1e-9,
    `at ≥2 s held the stream chambers base/1.8 (got ${heldCd} vs ${BASE_CD / 1.8})`);
  // Five released ticks then re-press: the ramp starts from zero again.
  spun.state.input.fire = false;
  spun.ticks(5);
  assert.equal(spun.ship.data.gunnerSpinHeldS, 0, 'the released trigger zeroes the held clock');
  spun.state.input.fire = true;
  spun.ticks(6);
  const resetCd = spun.lastCdRef();
  assert.ok(resetCd > heldCd, 'after a release the stream is back at the foot of the ramp');
  assert.ok(resetCd <= BASE_CD + 1e-9, 'the re-spooled cadence never runs slower than base');
  // Without the node the cadence is base at every point of the same hold.
  const plain = run([]);
  plain.ticks(150);
  assert.ok(Math.abs(plain.lastCdRef() - BASE_CD) < 1e-9, 'no node — authored cadence throughout');
  // A non-Hose mount on the same held trigger keeps its own cadence.
  const pew = run(['gunner_spin_up'], 'wpn_pulse_laser_s');
  pew.ticks(150);
  assert.ok(Math.abs(pew.lastCdRef() - 1 / 5.5) < 1e-9, 'Pew cadence is untouched by the Hose ramp');
});

test('OVH-01c3 gunner_ricochet — the player\'s bullet skips off a rock once at 80 % speed', () => {
  const mk = (nodes, ownerId = 'player') => {
    const { state, bus } = makeState(nodes);
    const { w } = makeWeaponsCtx(state, bus);
    const rock = makeBody({ id: 'rock', type: 'asteroid', team: 0, dynamic: false, mass: 1000 });
    const proj = makeBody({
      id: 'shot', type: 'projectile', team: 0,
      pos: { x: -10, z: 0 }, vel: { x: 400, z: 0 },
    });
    proj.ownerId = ownerId;
    proj.radius = 0.7;
    proj.collides = true;
    proj.data.weaponId = 'wpn_pulse_laser_s';
    proj.data.kind = 'bullet';
    proj.data.damage = 10;
    proj.data.damageType = 'kinetic';
    state.entities.set(rock.id, rock);
    state.entities.set(proj.id, proj);
    return { state, bus, rock, proj, w };
  };
  const emitHit = (state, rock, proj, ownerId) => {
    const receipt = surfaceContactFromBodies(proj, rock, {
      point: { x: rock.pos.x, z: rock.pos.z },
      normal: { x: -1, z: 0 },
      velocity: { x: proj.vel.x, z: proj.vel.z },
    }, state.tick);
    state.bus.emit('projectile:hit', {
      projectileId: proj.id, targetId: rock.id, ownerId,
      damage: 10, damageType: 'kinetic', pos: { x: rock.pos.x, z: rock.pos.z },
      approach: { x: 1, z: 0 }, normal: { x: -1, z: 0 },
      projectileVelocity: { x: proj.vel.x, z: proj.vel.z },
      targetVelocity: { x: 0, z: 0 },
      weaponId: 'wpn_pulse_laser_s',
      receipt,
    });
  };
  // With the node: reflect about the contact normal at 80 %, survive the kill
  // write physics issues right after the emit, and spend the once.
  {
    const { state, rock, proj } = mk(['gunner_ricochet']);
    emitHit(state, rock, proj, 'player');
    assert.equal(proj.data.gunnerRicochetSpent, true, 'the skip is spent on first contact');
    assert.ok(Math.abs(proj.vel.x + 320) < 1e-6 && Math.abs(proj.vel.z) < 1e-6,
      `reflected at 80 % of incoming (got ${proj.vel.x},${proj.vel.z})`);
    proj.alive = false;   // physics consumes the round immediately after this emit
    assert.equal(proj.alive, true, 'the continuation swallowed the consume write');
    // Second wall: the once is spent — the round dies like any unpicked round.
    emitHit(state, rock, proj, 'player');
    proj.alive = false;
    assert.equal(proj.alive, false, 'spent once — the second contact is fatal');
  }
  // Without the node: the same contact ends the round.
  {
    const { state, rock, proj } = mk([]);
    emitHit(state, rock, proj, 'player');
    proj.alive = false;
    assert.equal(proj.alive, false, 'no node — the rock eats the shot');
    assert.equal(proj.data.gunnerRicochetSpent, undefined);
  }
});

// ---------------------------------------------------------------------------
// NPC exclusion — one hull holding every built node, getting none of it.

test('OVH-01c3 NPC exclusion — an NPC holding every Gunner node fires, heats and dies like an unpicked ship', () => {
  const { state, bus } = makeState(ALL_GUNNER);
  const npc = makeBody({ id: 'npc', team: 1, extra: { cap: 10000 } });
  npc.data.intent = { fire: true };
  npc.data.weapons = [{ defId: 'wpn_bank_stream_m', heatDissip: 0, heatMax: 1e6 }];
  state.entities.set(npc.id, npc);
  state.entityIndex = { weaponShips: [npc], ships: [npc], projectiles: [], vectorMines: [] };
  state.entityList = [npc, state.player];
  const { w } = makeWeaponsCtx(state, bus);
  const mount = npc.data.weapons[0];
  let lastCd = null;
  for (let i = 0; i < 200; i++) {
    const before = bus.emitted.length;
    w.update(1 / 60, state);
    if (bus.emitted.some((e, idx) => idx >= before && e.ev === 'combat:fire' && e.p.ownerId === 'npc')) {
      lastCd = mount._cooldown;
    }
  }
  assert.ok(lastCd != null, 'sanity: the NPC fired');
  assert.ok(Math.abs(lastCd - 1 / 14) < 1e-9, 'NPC Hose cadence stays authored — no spin-up');
  assert.equal(mount.heatMax, 1e6, 'NPC bar keeps the authored value — no drum stamp');
  assert.equal(npc.data.gunnerSpinHeldS, undefined, 'the held-trigger clock never stamps on an NPC');
  // An NPC round on the same rock is consumed like every unpicked round.
  const rock = makeBody({ id: 'rock', type: 'asteroid', team: 0, dynamic: false });
  const shot = makeBody({
    id: 'npcShot', type: 'projectile', team: 1,
    pos: { x: -10, z: 0 }, vel: { x: 400, z: 0 },
  });
  shot.ownerId = 'npc';
  shot.radius = 0.7;
  shot.collides = true;
  shot.data.weaponId = 'wpn_bank_stream_m';
  shot.data.kind = 'bullet';
  state.entities.set(rock.id, rock);
  state.entities.set(shot.id, shot);
  const receipt = surfaceContactFromBodies(shot, rock, {
    point: { x: rock.pos.x, z: rock.pos.z },
    normal: { x: -1, z: 0 },
    velocity: { x: 400, z: 0 },
  }, state.tick);
  bus.emit('projectile:hit', {
    projectileId: shot.id, targetId: rock.id, ownerId: 'npc',
    damage: 5, damageType: 'kinetic', pos: { x: rock.pos.x, z: rock.pos.z },
    approach: { x: 1, z: 0 }, normal: { x: -1, z: 0 },
    projectileVelocity: { x: 400, z: 0 }, targetVelocity: { x: 0, z: 0 },
    weaponId: 'wpn_bank_stream_m',
    receipt,
  });
  shot.alive = false;
  assert.equal(shot.alive, false, 'an NPC round on a rock is consumed — no ricochet');
  assert.equal(shot.vel.x, 400, 'and it never reflected');
  // NPC damage route: the dealt-side gates never see an NPC attacker, so a
  // low-hull victim takes the ordinary 5, not the executed remainder.
  const victim = makeBody({ id: 'victim', team: 0, hull: 19, hullMax: 100 });
  state.entities.set(victim.id, victim);
  const { kernel } = makeCollisionCtx(state, bus, []);
  kernel.routeDamage({
    attackerId: 'npc', targetId: victim.id,
    packet: scalarHitToDamagePacket({
      damage: 5, damageType: 'kinetic', pos: { x: 0, z: 0 },
      source: { kind: 'weapon', id: 'wpn_bank_stream_m', weaponId: 'wpn_bank_stream_m' },
    }),
    origin: { kind: 'weapon', id: 'wpn_bank_stream_m' },
  });
  assert.ok(victim.hull > 0 && victim.hull < 19, 'no execution for an NPC attacker');
  assert.notEqual(victim.alive, false);
});
