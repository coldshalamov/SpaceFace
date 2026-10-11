// THE WORLD ANSWERS — C10: tumble x faction battle line (build_map §15.6).
// Tumble a destroyer and its point defence rakes its own fleet for the duration: the battery's
// solution is frozen in HULL-LOCAL frame at helm loss, so the world-frame bearing turns with the
// hull and sweeps across whatever stands in the arc — its own team included. Real combat kernel,
// real tumbleStates; the test plays the physics step (hull.rot += spin * dt) because the harness
// has no physics body. Seeds 4242 / 8008.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { HITSTUN_IMPULSE_EVENT } from '../src/combat/impulseKernel.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';
import { createBus } from '../src/core/eventBus.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import {
  TUMBLE_RAKE_MIN_MASS,
  captureTumbleRakeSeed,
  rakeBatteryFor,
  rakeWorldBearing,
  readTumbleRake,
} from '../src/ai/tumbleRake.js';

const DT = 1 / 60;
const FLAK = () => ({
  id: 'wpn_flak_turret_s', defId: 'wpn_flak_turret_s', facing: 'turret', tracking: 'auto_turret',
  intercepts: true, dmg: 4, rof: 8, range: 240, gimbalArc: Math.PI,
});

function ship(id, team, over = {}) {
  return {
    id, type: 'ship', alive: true, team, factionId: team === 1 ? 'faction_vael' : 'faction_player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 14, mass: 20,
    hull: 600, hullMax: 600, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, armorFlat: 0,
    cap: 100, capMax: 100, capRegen: 5, lastDamageT: -1e9, flags: {},
    data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship' },
    ...over,
  };
}

function harness({ seed = 4242, heavyMass = 420, weapons = [FLAK(), FLAK()], engaged = true, heavyTeam = 1 } = {}) {
  const player = ship(1, 0, { pos: { x: -300, z: -300 }, isPlayer: true, mass: 18, hull: 900, hullMax: 900 });
  const heavy = ship(2, heavyTeam, {
    mass: heavyMass, radius: 32, hull: 4000, hullMax: 4000, factionId: 'faction_vael',
    data: {
      derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship',
      weapons,
      intent: engaged ? { fire: true, aimAngle: 0, moveX: 0, moveZ: 0 } : { fire: false, moveX: 0, moveZ: 0 },
      combat: { targetId: 1 },
    },
  });
  // Wingmate dead abeam: the beam starts pointing +x and the hull spins toward +z.
  const wing = ship(3, 1, { pos: { x: 0, z: 150 }, factionId: 'faction_vael' });
  const bus = createBus();
  const voices = [];
  const events = { rake: [], damage: [] };
  bus.on('combat:tumbleRake', (p) => events.rake.push(p));
  bus.on('combat:damage', (p) => events.damage.push({
    attackerId: p.attackerId, targetId: p.targetId, applied: p.applied, origin: p.origin,
  }));
  const helpers = {
    combatPhysics: { applyImpulse: () => true },
    voice: { say(payload) { voices.push(payload); return true; } },
  };
  const state = {
    tick: 100, simTime: 100 / 60, mode: 'flight', playerId: 1,
    entities: new Map([[1, player], [2, heavy], [3, wing]]),
    entityList: [player, heavy, wing],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed },
  };
  const kernel = createCombatKernel({ state, bus, helpers, registry: { get: () => null } });
  const system = Object.create(tumbleStates);
  system.init({ state, bus, helpers, registry: { get: (name) => (name === 'combat' ? { kernel } : null) } });
  return { player, heavy, wing, bus, state, kernel, system, events, voices };
}

/** One sim tick; `spin` is the hull's yaw rate the test applies as the physics step. */
function step(h, spin, hull = h.heavy) {
  h.state.tick += 1;
  h.state.simTime += DT;
  h.kernel.prePhysics(DT);
  h.system.update(DT, h.state);
  hull.rot += spin * DT;
}

function gunHit(h, victim = h.heavy, deltaV = 900) {
  h.bus.emit(HITSTUN_IMPULSE_EVENT, {
    source: 'gun', victimId: victim.id, attackerId: h.player.id, attackerMass: 18, victimMass: victim.mass,
    deltaV, dirX: 0, dirZ: 1, hitSide: 1, tick: h.state.tick,
    provenance: { actorId: h.player.id, weaponId: 'wpn_concussion_cannon_m', tag: 'concussion_slug', appliedTick: h.state.tick },
  });
}

function withFlags(fn) {
  const previous = { weaponImpulseConsequences: COMBAT_FLAGS.weaponImpulseConsequences, tumbleFling: COMBAT_FLAGS.tumbleFling };
  Object.assign(COMBAT_FLAGS, { weaponImpulseConsequences: true, tumbleFling: true });
  try { return fn(); } finally { Object.assign(COMBAT_FLAGS, previous); }
}

function tumbleTicks(h, hull = h.heavy) {
  const t = readTumbleStatus(h.state, hull);
  return t ? Math.ceil((t.data.until - t.data.startedAt) * 60) : 0;
}

test('C10 a tumbling heavy\'s PD bearing turns with the hull and damages the friendly in the arc', () => {
  withFlags(() => {
    const h = harness();
    gunHit(h);
    step(h, 0);
    const tumble = readTumbleStatus(h.state, h.heavy);
    assert.ok(tumble, 'the heavy loses its helm');
    const ticks = tumbleTicks(h);
    assert.ok(ticks >= 60, `the tumble is a real beat (${ticks} ticks)`);

    // The solution is frozen in hull-local frame: beam world bearing = rot + constant.
    step(h, 4);
    const rec = readTumbleRake(h.heavy);
    assert.ok(rec, 'a mid-salvo heavy keeps a frozen PD solution');
    const local0 = rec.localBearing;
    const world0 = rakeWorldBearing(h.heavy, rec);
    for (let i = 0; i < 20; i += 1) step(h, 4);
    assert.equal(readTumbleRake(h.heavy).localBearing, local0, 'hull-local solution never re-tracks');
    const world1 = rakeWorldBearing(h.heavy, readTumbleRake(h.heavy));
    assert.ok(Math.abs(world1 - world0 - 4 * 20 * DT) < 1e-9, 'world bearing rotates with the hull');

    const hullBefore = h.wing.hull;
    for (let i = 0; i < ticks && readTumbleStatus(h.state, h.heavy); i += 1) step(h, 4);
    assert.ok(h.wing.hull < hullBefore, `the wingmate in the arc takes damage (${hullBefore} -> ${h.wing.hull})`);
    const hit = h.events.damage.find((d) => d.targetId === h.wing.id);
    assert.ok(hit, 'combat:damage landed on the friendly');
    assert.equal(hit.attackerId, h.heavy.id, 'the tumbling hull is the damage source');
    assert.equal(hit.origin && hit.origin.kind, 'tumble_rake');
    assert.ok(h.events.damage.every((d) => d.targetId !== h.player.id), 'the player is not in the beam');
    console.log(`C10 seed=4242 tumbleTicks=${ticks} wing ${hullBefore}->${h.wing.hull} hits=${h.events.damage.filter((d) => d.targetId === 3).length}`);
  });
});

test('C10 one receipt (and no writer-side bark) when the sweep first crosses a friendly', () => {
  withFlags(() => {
    const h = harness({ seed: 8008 });
    gunHit(h);
    step(h, 0);
    const ticks = tumbleTicks(h);
    for (let i = 0; i < ticks + 30; i += 1) step(h, 9); // several revolutions: the wing is crossed repeatedly
    const hits = h.events.damage.filter((d) => d.targetId === h.wing.id);
    assert.ok(hits.length >= 2, `the beam crossed the wing more than once (${hits.length})`);
    assert.equal(h.events.rake.length, 1, 'exactly one combat:tumbleRake receipt');
    const [receipt] = h.events.rake;
    assert.equal(receipt.hullId, h.heavy.id);
    assert.equal(receipt.factionId, 'faction_vael');
    assert.deepEqual([...receipt.victims], [h.wing.id]);
    assert.ok(Number.isInteger(receipt.tick) && receipt.tick > 100);
    // The voice belongs to barkDirector (test/world-answers-barks-ore-flood-rake.test.mjs); the
    // writer emits the receipt and stays silent, so a bark can never double up.
    assert.equal(h.voices.filter((v) => v.kind === 'tumbleRake').length, 0, 'tumbleStates itself does not bark');
  });
});

test('C10 a heavy that is not tumbling never rakes, whatever its hull does', () => {
  withFlags(() => {
    const h = harness();
    for (let i = 0; i < 300; i += 1) step(h, 6); // spinning by hand, but no helm loss
    assert.equal(readTumbleStatus(h.state, h.heavy), null);
    assert.equal(readTumbleRake(h.heavy), null);
    assert.equal(h.events.damage.length, 0);
    assert.equal(h.events.rake.length, 0);
    assert.equal(h.wing.hull, h.wing.hullMax);
  });
});

test('C10 the sweep ends with the tumble: nothing keeps firing after recovery', () => {
  withFlags(() => {
    const h = harness();
    gunHit(h);
    step(h, 0);
    const ticks = tumbleTicks(h);
    for (let i = 0; i < ticks + 90; i += 1) step(h, 9);
    assert.equal(readTumbleStatus(h.state, h.heavy), null);
    assert.equal(readTumbleRake(h.heavy), null, 'the record is cleared with the tumble');
    assert.equal(h.heavy.data.tumbleRakeSeed, undefined);
    const damageEvents = h.events.damage.length;
    for (let i = 0; i < 240; i += 1) step(h, 9);
    assert.equal(h.events.damage.length, damageEvents, 'bounded by the tumble duration');
  });
});

test('C10 the player hull is never a rake source, and never a victim of an NPC heavy\'s rake', () => {
  withFlags(() => {
    // The player never tumbles, so even a player hull set up exactly like a heavy has no sweep.
    const h = harness();
    h.player.mass = 900;
    h.player.data.weapons = [FLAK(), FLAK()];
    h.player.data.intent = { fire: true, aimAngle: 0, moveX: 0, moveZ: 0 };
    gunHit(h, h.player);
    for (let i = 0; i < 120; i += 1) step(h, 0, h.player);
    assert.equal(readTumbleStatus(h.state, h.player), null, 'the player ship is never knocked around');
    assert.equal(readTumbleRake(h.player), null);
    assert.equal(captureTumbleRakeSeed(h.state, h.player), false);
    assert.equal(h.events.rake.length, 0);

    // A heavy on the player's own team still never rakes the player: friendly victims are NPC hulls.
    const same = harness({ heavyTeam: 0 });
    same.player.pos = { x: 0, z: 150 };
    same.wing.pos = { x: 4000, z: 4000 };
    gunHit(same);
    step(same, 0);
    for (let i = 0; i < tumbleTicks(same) + 10; i += 1) step(same, 6);
    assert.equal(same.player.hull, same.player.hullMax);
    assert.equal(same.events.damage.filter((d) => d.targetId === same.player.id).length, 0);
  });
});

test('C10 light and medium hulls never rake; neither does a heavy with no point defence', () => {
  withFlags(() => {
    assert.equal(TUMBLE_RAKE_MIN_MASS, 140, 'the floor is the aiPorts heavy band');
    for (const mass of [20, 60, 139]) {
      const h = harness({ heavyMass: mass });
      gunHit(h, h.heavy, 4000);
      step(h, 0);
      for (let i = 0; i < 200; i += 1) step(h, 5);
      assert.equal(readTumbleRake(h.heavy), null, `mass ${mass} keeps no PD solution`);
      assert.equal(h.events.damage.filter((d) => d.attackerId === h.heavy.id).length, 0, `mass ${mass} rakes nobody`);
      assert.equal(h.events.rake.length, 0);
    }
    const bare = harness({ weapons: [{ id: 'wpn_autocannon_m', defId: 'wpn_autocannon_m', facing: 'front', tracking: 'fixed', dmg: 9, rof: 4, range: 600 }] });
    assert.equal(rakeBatteryFor(bare.state, bare.heavy), null);
    gunHit(bare);
    step(bare, 0);
    assert.ok(readTumbleStatus(bare.state, bare.heavy), 'it still tumbles');
    for (let i = 0; i < 200; i += 1) step(bare, 5);
    assert.equal(bare.events.rake.length, 0);
    assert.equal(bare.wing.hull, bare.wing.hullMax);
  });
});

test('C10 the Iron Maw\'s battery is its flak and autocannon turrets, never its beams or torpedoes', () => {
  const spec = makeEnemySpawnSpec('dreadnought_boss', 12, { x: 0, z: 0 }, { seed: 4242 });
  const battery = rakeBatteryFor({}, { id: 99, data: spec.data });
  assert.ok(battery, 'the capital carries a rake battery');
  assert.equal(battery.mounts, 10, '4 flak + 6 autocannon turrets');
  assert.equal(battery.range, 260);
  const window = 18 / 60;
  assert.ok(Math.abs(battery.salvoDamage - (4 * 4 * 8 + 6 * 18 * 4) * window) < 1e-9, `salvo ${battery.salvoDamage}`);
  // A shot-off turret goes silent through the ordinary subsystem gate.
  const state = { combat: { entities: { 99: { subsystems: { subsystem_turret_4: { destroyed: true } } } } } };
  const lost = rakeBatteryFor(state, { id: 99, data: spec.data });
  assert.equal(lost.mounts, 9);
});

test('C10 a heavy that was not shooting at helm loss has no bearing to freeze', () => {
  withFlags(() => {
    const h = harness({ engaged: false });
    gunHit(h);
    step(h, 0);
    assert.ok(readTumbleStatus(h.state, h.heavy));
    for (let i = 0; i < 200; i += 1) step(h, 6);
    assert.equal(readTumbleRake(h.heavy), null);
    assert.equal(h.events.damage.length, 0);
  });
});

test('C10 mass and momentum decide: a hull that whips past a friendly lands less than one that lingers', () => {
  withFlags(() => {
    const firstHit = (spin) => {
      const h = harness();
      gunHit(h);
      step(h, 0);
      for (let i = 0; i < 400 && h.events.damage.length === 0; i += 1) step(h, spin);
      assert.ok(h.events.damage.length > 0, `spin ${spin} reaches the wing`);
      return h.events.damage[0].applied;
    };
    const slow = firstHit(1.5);
    const fast = firstHit(8);
    assert.ok(slow > fast, `slow sweep ${slow.toFixed(2)} > whip ${fast.toFixed(2)}`);
    assert.ok(fast > 0, 'a whip still lands a sliver');
    assert.ok(slow <= 2 * 4 * 8 * (18 / 60) + 1e-9, 'never more than the battery\'s own salvo');
    console.log(`C10 seed=4242 salvo slow=${slow.toFixed(2)} whip=${fast.toFixed(2)}`);
  });
});
