// A01-03 — the eight Swarm drops. Payload shapes here are the ones the game sends:
//   massline:throw       masslineThrow.js runtime.lastThrow ({ payloadId, ... })
//   tether:whipImpact    masslineImpacts.js ({ targetId: the mass, victimId, slung, rating })
//   pickup:collected     mining.js ({ pickupId, collectorId, kind, ... })
//   run:awardRequested   survivalRewards / swarmBrood ({ credits, reason, wave })
//   weapon mounts        ships.js makeWeaponRuntime ({ defId, _cooldown, _heat, ... })
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { validateRunState } from '../src/core/runState.js';
import { runSession } from '../src/systems/runSession.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { WEAPONS } from '../src/data/weapons.js';
import { buildWeaponDamagePacket } from '../src/systems/weapons.js';
import { normalizeDamagePacket } from '../src/combat/damage.js';
import { swarmDropMagnetRange } from '../src/systems/mining.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
  getSystemClock,
} from '../src/runtime/authoritativeSystemManifest.js';
import {
  SWARM_DROP_KIND,
  SWARM_DROP_INTERVAL,
  SWARM_DROP_TTL_S,
  SWARM_DROP_DEFS,
  SWARM_DROP_BY_ID,
  SWARM_DROP_ARENA_RADIUS,
} from '../src/data/swarmDrops.js';
import { swarmDrops } from '../src/systems/swarmDrops.js';

const SEED = 4242;
const WEAPON_DEF = WEAPONS.find((w) => w.id === 'wpn_autocannon_s');

function boot({ seed = SEED, registryStub = {} } = {}) {
  const state = createGameState(seed);
  const bus = createBus();
  const emitted = [];
  const wrapped = {
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    once: bus.once.bind(bus),
    emit(event, payload) {
      emitted.push({ event, payload });
      bus.emit(event, payload);
    },
  };
  const damage = [];
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { ...spec.pos } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      wrapped.emit('entity:spawned', { id, type: entity.type, entity });
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      entity.alive = false;
      state.entities.delete(id);
      const idx = state.entityList.indexOf(entity);
      if (idx !== -1) state.entityList.splice(idx, 1);
      wrapped.emit('entity:destroyed', { id, entity });
      return true;
    },
    routeCombatDamage(request) { damage.push(request); return { ok: true }; },
  };
  const player = {
    id: state.nextEntityId++,
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    type: 'ship',
    hull: 200,
    hullMax: 200,
    data: {
      weapons: [
        // The real mount shape: it names its def by defId, and has no impulsePerHit of its own.
        { defId: 'wpn_autocannon_s', dmg: 10, _heat: 45, _cooldown: 1.2 },
        // A mount that carries its own knockback override (ships.js: mount-margin hulls).
        { defId: 'wpn_autocannon_s', dmg: 10, _heat: 80, _cooldown: 2, impulsePerHit: 21 },
      ],
      weaponVentUntil: 105,
      _weaponVenting: true,
    },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.simTime = 100;
  state.tick = 6000;
  const registry = { get: (id) => registryStub[id] || null };
  const ctx = { state, bus: wrapped, helpers, registry };
  runSession.init(ctx);
  swarmDrops.init(ctx);
  wrapped.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed, arenaId: 'helios_core' });
  return { state, bus: wrapped, emitted, helpers, player, damage };
}

function body(h, { team = 3, mass = 20, hull = 50, pos = { x: 40, z: 0 } } = {}) {
  const id = h.state.nextEntityId++;
  const e = {
    id, alive: true, type: 'ship', team, mass, hull, hullMax: hull, shield: 0,
    pos: { ...pos }, vel: { x: 0, z: 0 },
    data: { runCohort: SURVIVAL_COHORT_TAG, combat: { targetId: h.state.playerId } },
  };
  h.state.entities.set(id, e);
  h.state.entityList.push(e);
  return e;
}

function kill(h, n = 1) {
  for (let i = 0; i < n; i++) {
    const v = body(h);
    h.bus.emit('entity:killed', { id: v.id, killerId: h.state.playerId, type: 'ship', pos: { ...v.pos }, victim: v });
  }
}

const liveDrops = (h) => h.state.entityList.filter(
  (e) => e.alive !== false && e.type === 'pickup' && e.data && e.data.kind === SWARM_DROP_KIND,
);

function forceDrop(h, dropId, index = 100) {
  return h.helpers.spawnEntity({
    type: 'pickup', pos: { x: 10, z: 10 },
    data: { kind: SWARM_DROP_KIND, dropId, swarmDrop: true, swarmDropIndex: index, amount: 1 },
  });
}

function scoop(h, drop) {
  h.bus.emit('pickup:collected', { pickupId: drop.id, collectorId: h.state.playerId, kind: drop.data.kind, amount: 1 });
}

function packetImpulse(w) {
  const p = buildWeaponDamagePacket(w, WEAPON_DEF, 10, 'kinetic');
  return p.impulse ? p.impulse.magnitude : 0;
}

// ---- production route ---------------------------------------------------------------------

test('swarmDrops is in the production manifest, clocked, and initialised through the real runtime', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('swarmDrops'), 'init order');
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('swarmDrops'), 'update order');
  assert.ok(getSystemClock('swarmDrops'), 'declared clock');
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: SEED });
  try {
    const owner = runtime.getSystem('swarmDrops');
    assert.ok(owner, 'the node runtime materialises it');
    assert.ok(owner._unsubs.length > 0, 'and init() ran against the bus');
  } finally {
    if (typeof runtime.dispose === 'function') runtime.dispose();
  }
});

test('the browser registry materialises swarmDrops from the manifest, in swarm-only mode scope', () => {
  const registry = createRegistry({ state: createGameState(7), bus: createBus(), helpers: {} });
  assert.ok(registry.get('swarmDrops'), 'registry lookup');
  assert.ok(registry.systems ? registry.systems.includes?.(registry.get('swarmDrops')) !== false : true);
});

// ---- cadence, caps, TTL, determinism ---------------------------------------------------------

test('at most one drop per 12 kills, never more than 2 alive, TTL 12 s', () => {
  const h = boot();
  kill(h, SWARM_DROP_INTERVAL - 1);
  assert.equal(liveDrops(h).length, 0);
  kill(h, 1);
  assert.equal(liveDrops(h).length, 1);
  kill(h, SWARM_DROP_INTERVAL * 5);
  assert.equal(liveDrops(h).length, 2, 'capped at two alive');
  const d = liveDrops(h)[0];
  assert.equal(d.data.despawnAt, 100 + SWARM_DROP_TTL_S);
  h.state.simTime = 100 + SWARM_DROP_TTL_S + 0.1;
  swarmDrops.update(1 / 60);
  assert.equal(liveDrops(h).length, 0, 'unclaimed drops despawn');
});

test('the same run seed deals the same drops; weights are equal with free_forge at a quarter', () => {
  const run = (seed) => {
    const h = boot({ seed });
    kill(h, SWARM_DROP_INTERVAL * 2);
    const ids = liveDrops(h).map((e) => e.data.dropId);
    return ids;
  };
  assert.deepEqual(run(777), run(777));
  assert.equal(SWARM_DROP_BY_ID.get('free_forge').weight, 0.25);
  assert.equal(SWARM_DROP_DEFS.filter((d) => d.weight === 1).length, 7);
  const h = boot();
  assert.equal(SWARM_DROP_DEFS.length, 8);
  void h;
});

test('ambient traffic (no run cohort mark) never drops', () => {
  const h = boot();
  for (let i = 0; i < 30; i++) {
    const v = body(h);
    delete v.data.runCohort;
    h.bus.emit('entity:killed', { id: v.id, killerId: h.state.playerId, victim: v, pos: { ...v.pos } });
  }
  assert.equal(liveDrops(h).length, 0);
});

test('the eight toast lines are exactly the spec, 2.5 s', () => {
  const lines = {
    full_rack: 'Reload, darling.', heavy_hands: "Oh, now you've done it.",
    dead_weight: 'Throw something. Anything.', magnet: 'Tidy.', big_bang: 'Everybody out.',
    double_scrap: 'The sponsors are generous.', loose_cannon: "It's not house-trained.",
    free_forge: 'On the house. Once.',
  };
  for (const [id, text] of Object.entries(lines)) {
    const h = boot({ registryStub: { fields: { deployOneOffShove() {} }, weapons: {} } });
    scoop(h, forceDrop(h, id));
    const toast = h.emitted.find((e) => e.event === 'toast');
    assert.equal(toast.payload.text, text, id);
    assert.equal(toast.payload.ttl, 2.5);
  }
});

test('a scooped drop cannot be claimed twice', () => {
  const h = boot();
  const d = forceDrop(h, 'magnet');
  scoop(h, d);
  const first = h.state.swarmDropMagnetUntil;
  h.state.swarmDropMagnetUntil = null;
  scoop(h, d);
  assert.equal(h.state.swarmDropMagnetUntil, null);
  assert.ok(first > 100);
});

// ---- Heavy Hands ------------------------------------------------------------------------------

test('Heavy Hands doubles what buildWeaponDamagePacket reads, per mount, and restores exactly', () => {
  const h = boot();
  const [a, b] = h.player.data.weapons;
  const baseA = packetImpulse(a);
  const baseB = packetImpulse(b);
  assert.ok(baseA > 0 && baseB > 0, 'fixture guns have knockback');
  assert.equal(baseA, WEAPON_DEF.impulsePerHit);
  assert.equal(baseB, 21);
  scoop(h, forceDrop(h, 'heavy_hands'));
  assert.equal(packetImpulse(a), baseA * 2, 'mount that inherits its def');
  assert.equal(packetImpulse(b), 42, 'mount with its own override');
  h.state.simTime = 120.1;
  swarmDrops.update(1 / 60);
  assert.equal(packetImpulse(a), baseA);
  assert.equal('impulsePerHit' in a, false, 'the inherited mount carries no override again');
  assert.equal(b.impulsePerHit, 21);
  assert.equal(a._heavyHandsSaved, undefined);
});

test('save:loaded and run:ended put the guns back (a save keeps the doubled value)', () => {
  for (const event of ['save:loaded', 'run:ended']) {
    const h = boot();
    scoop(h, forceDrop(h, 'heavy_hands'));
    assert.equal(h.player.data.weapons[1].impulsePerHit, 42);
    h.bus.emit(event, {});
    assert.equal(h.player.data.weapons[1].impulsePerHit, 21, event);
    assert.equal('impulsePerHit' in h.player.data.weapons[0], false, event);
    assert.equal(swarmDrops.isHeavyHandsActive(), false);
  }
});

// ---- Full Rack --------------------------------------------------------------------------------

test('Full Rack refills guns and every power through their owners', () => {
  const h = boot();
  h.state.fields = { schemaVersion: 1, cooldowns: { well: 9, repulsor: 8 } };
  h.state.player.massSeed = { cooldownUntil: 150 };
  h.state.bombs = { cooldownUntil: 140, cooldowns: { frag: 8 } };
  h.state.player.cargo = { items: { cmdty_impulse_charge: 2 }, capVolume: 100 };
  scoop(h, forceDrop(h, 'full_rack'));
  for (const w of h.player.data.weapons) {
    assert.equal(w._cooldown, 0);
    assert.equal(w._heat, 0);
  }
  assert.ok(!(h.player.data.weaponVentUntil > h.state.simTime), 'vent lockout cleared');
  assert.deepEqual(h.state.fields.cooldowns, { well: 0, repulsor: 0 });
  assert.equal(h.state.player.massSeed.cooldownUntil, 0);
  assert.equal(h.state.bombs.cooldownUntil, 0);
  assert.equal(h.state.bombs.cooldowns.frag, 0);
});

// ---- Dead Weight ------------------------------------------------------------------------------

test('Dead Weight: a thrown body kills a light ship and takes 60% off a heavy, through the combat route', () => {
  const h = boot();
  scoop(h, forceDrop(h, 'dead_weight'));
  const rock = body(h, { team: 0, mass: 30 });
  h.bus.emit('massline:throw', { payloadId: rock.id, tick: 6000 });

  const light = body(h, { mass: 20, hull: 50 });
  h.bus.emit('tether:whipImpact', { targetId: rock.id, victimId: light.id, slung: true, rating: 'solid' });
  assert.equal(h.damage.length, 1);
  const req = h.damage[0];
  assert.equal(req.targetId, light.id);
  assert.equal(req.attackerId, h.state.playerId);
  const norm = normalizeDamagePacket(req.packet);
  assert.ok(norm.channels.kinetic >= light.hull, 'the combat owner reads a lethal hit (channels, not a bare damage field)');

  const heavy = body(h, { mass: 200, hull: 500 });
  h.bus.emit('tether:whipImpact', { targetId: rock.id, victimId: heavy.id, slung: true, rating: 'crushing' });
  const hv = normalizeDamagePacket(h.damage[1].packet);
  assert.equal(Math.round(hv.channels.kinetic), 300);

  // The several receipts of one touch land once.
  h.bus.emit('physics:impact', { aId: rock.id, bId: heavy.id, dp: 900 });
  assert.equal(h.damage.length, 2);
});

test('Dead Weight ignores unthrown bodies, friendlies and the player, and expires after 20 s', () => {
  const h = boot();
  scoop(h, forceDrop(h, 'dead_weight'));
  const rock = body(h, { team: 0 });
  const foe = body(h);
  h.bus.emit('physics:impact', { aId: rock.id, bId: foe.id, dp: 900 });
  assert.equal(h.damage.length, 0, 'not thrown');
  h.bus.emit('massline:throw', { payloadId: rock.id });
  const ally = body(h, { team: 1 });
  h.bus.emit('physics:impact', { aId: rock.id, bId: ally.id, dp: 900 });
  h.bus.emit('physics:impact', { aId: rock.id, bId: h.state.playerId, dp: 900 });
  assert.equal(h.damage.length, 0);
  h.state.simTime = 120.1;
  swarmDrops.update(1 / 60);
  h.bus.emit('physics:impact', { aId: rock.id, bId: foe.id, dp: 900 });
  assert.equal(h.damage.length, 0, 'window closed');
});

// ---- Magnet -----------------------------------------------------------------------------------

test('Magnet opens mining’s vacuum window for ordinary pickups and closes it', () => {
  const h = boot();
  assert.equal(swarmDropMagnetRange(h.state), 0);
  scoop(h, forceDrop(h, 'magnet'));
  assert.ok(swarmDropMagnetRange(h.state) > 1200, 'whole floor is inside the vacuum');
  h.state.simTime += 6;
  assert.equal(swarmDropMagnetRange(h.state), 0);
});

// ---- Big Bang ---------------------------------------------------------------------------------

test('Big Bang asks the fields owner for one Shove of arena radius', () => {
  const calls = [];
  const h = boot({ registryStub: { fields: { deployOneOffShove: (r) => { calls.push(r); return 'f'; } } } });
  scoop(h, forceDrop(h, 'big_bang'));
  assert.deepEqual(calls, [SWARM_DROP_ARENA_RADIUS]);
  assert.ok(h.emitted.some((e) => e.event === 'camera:shake'));
});

// ---- Double Scrap -----------------------------------------------------------------------------

test('Double Scrap doubles earnings through runSession for 30 s, and never refunds or sell-backs', () => {
  const h = boot();
  scoop(h, forceDrop(h, 'double_scrap'));
  const credits = () => h.state.run.credits;
  const c0 = credits();
  h.bus.emit('run:awardRequested', { credits: 100, reason: 'chip_scooped', wave: 1 });
  assert.equal(credits() - c0, 200);
  h.bus.emit('run:awardRequested', { credits: 100, reason: 'brood', wave: 1 });
  assert.equal(credits() - c0, 400);
  const c1 = credits();
  h.bus.emit('run:awardRequested', { credits: 100, reason: 'swarm:sellBack' });
  h.bus.emit('run:awardRequested', { credits: 100, reason: 'crucible:purchaseRefund' });
  h.bus.emit('run:awardRequested', { credits: 100, reason: 'crucible:pact' });
  assert.equal(credits() - c1, 300, 'one copy each');
  h.state.simTime = 130.1;
  swarmDrops.update(1 / 60);
  const c2 = credits();
  h.bus.emit('run:awardRequested', { credits: 100, reason: 'chip_scooped' });
  assert.equal(credits() - c2, 100, 'expired');
});

// ---- Loose Cannon -----------------------------------------------------------------------------

test('Loose Cannon is a tetherable body that fires through the weapons owner, then expires at 60 s', () => {
  const shots = [];
  const weapons = { _spawnProjectile: (owner, mount, def, angle, target) => shots.push({ owner, mount, def, angle, target }) };
  const h = boot({ registryStub: { weapons } });
  scoop(h, forceDrop(h, 'loose_cannon'));
  assert.equal(swarmDrops.activeTurretCount(), 1);
  const turret = h.state.entityList.find((e) => e.data && e.data.looseCannon);
  assert.equal(turret.tetherable, true);
  assert.equal(turret.data.masslineTetherable, true);
  assert.equal(turret.physicsBody.dynamic, true);
  const foe = body(h, { pos: { x: turret.pos.x + 100, z: turret.pos.z } });
  swarmDrops.update(1 / 60);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].owner.id, turret.id);
  assert.equal(shots[0].target.id, foe.id);
  assert.equal(shots[0].def.id, 'wpn_autocannon_s');
  // Out of reach: it holds fire.
  foe.pos.x += 5000;
  h.state.simTime += 1;
  swarmDrops.update(1 / 60);
  assert.equal(shots.length, 1);
  h.state.simTime = 160.1;
  swarmDrops.update(1 / 60);
  assert.equal(swarmDrops.activeTurretCount(), 0);
  assert.equal(h.state.entities.get(turret.id), undefined, 'turret removed');
});

test('run end retires a live Loose Cannon', () => {
  const h = boot({ registryStub: { weapons: { _spawnProjectile() {} } } });
  scoop(h, forceDrop(h, 'loose_cannon'));
  const turret = h.state.entityList.find((e) => e.data && e.data.looseCannon);
  h.bus.emit('run:ended', {});
  assert.equal(h.state.entities.get(turret.id), undefined);
  assert.equal(swarmDrops.activeTurretCount(), 0);
});

// ---- Free Forge -------------------------------------------------------------------------------

test('Free Forge flags the run without invalidating it, and the purse still works afterwards', () => {
  const h = boot();
  scoop(h, forceDrop(h, 'free_forge'));
  assert.equal(h.state.run.telemetry.freeForge, true);
  assert.equal(validateRunState(h.state.run).ok, true, 'the run envelope stays valid');
  const c0 = h.state.run.credits;
  h.bus.emit('run:awardRequested', { credits: 50, reason: 'chip_scooped' });
  assert.equal(h.state.run.credits - c0, 50);
  assert.equal(h.state.run.telemetry.freeForge, true, 'the flag survives the owner’s run clone');
});

// ---- Swarm only -------------------------------------------------------------------------------

test('outside a Swarm run nothing is claimed', () => {
  const h = boot();
  h.bus.emit('run:ended', {});
  h.state.run = { kind: 'adventure' };
  const d = forceDrop(h, 'magnet', 5);
  scoop(h, d);
  assert.ok(!h.state.swarmDropMagnetUntil);
});

// ---- Big Bang on the real fields owner -------------------------------------------------------

test('the real fields owner deploys a free Shove at arena radius and leaves the player’s cooldown alone', () => {
  const rt = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: SEED });
  try {
    const fields = rt.getSystem('fields');
    const st = fields.state;
    const p = rt.spawn({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, team: 1, hull: 100, hullMax: 100, data: {} });
    st.playerId = p.id;
    st.mode = 'flight';
    st.simTime = 5;
    st.tick = 300;
    const id = fields.deployOneOffShove(SWARM_DROP_ARENA_RADIUS);
    assert.ok(id, 'deployed');
    const rec = st.fields.deployed[id];
    assert.equal(rec.kind, 'repulsor');
    const emitter = st.entities.get(rec.emitterId);
    assert.equal(emitter.data.radius, SWARM_DROP_ARENA_RADIUS);
    assert.equal(st.fields.cooldowns.repulsor, 0, 'a free Shove starts no cooldown');
  } finally {
    if (typeof rt.dispose === 'function') rt.dispose();
  }
});
