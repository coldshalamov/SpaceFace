import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { routeFollower } from '../src/systems/routeFollower.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { buildAtlasIndex } from '../src/core/atlasIndex.js';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [combat, routeFollower] });
  const { state, bus } = sim; state.mode = 'flight'; state.world.currentSectorId = 'sector_helios_prime';
  const spec = team => ({ type: 'ship', team, pos: { x: -5000, z: -5000 }, vel: { x: 0, z: 0 },
    radius: 8, hull: 1000, hullMax: 1000, shield: 0, shieldMax: 0, armorHp: 0,
    data: { defId: 'ship_wasp' }, flags: {} });
  const player = sim.spawn(spec(0)), enemy = sim.spawn(spec(1)), friend = sim.spawn(spec(0));
  state.playerId = player.id;
  const destination = buildAtlasIndex().sectorNeighbors('sector_helios_prime')[0];
  assert.ok(destination);
  state.nav.route = { legs: [{ from: 'sector_helios_prime', to: destination, fuel: 4, charge: 1 }], totalHops: 1 };
  state.nav.autoTravel = true;
  const follower = sim.registry.get('routeFollower'); follower.engage(); follower.update(1 / 60, state);
  assert.equal(state.nav.executor.engaged, true); assert.equal(state.nav.autopilot.active, true);
  const releases = []; bus.on('travel:release', p => releases.push(p));
  const hit = ({ target = player, attacker = enemy, damage = 10, viaBus = false } = {}) => {
    const request = { targetId: target.id, attackerId: attacker.id,
      packet: scalarHitToDamagePacket({ damage, damageType: 'kinetic' }), origin: { kind: 'weapon', id: 'test' } };
    return viaBus ? bus.emit('combat:routeDamage', request) : sim.helpers.routeCombatDamage(request);
  };
  return { sim, state, bus, player, enemy, friend, follower, releases, hit };
}

for (const shield of [0, 100]) {
  test(`a real ${shield ? 'shield' : 'hull'} hit interrupts direct-kernel navigation and leaves one resumable itinerary`, () => {
    const r = boot();
    try {
      r.player.shield = r.player.shieldMax = shield; const itinerary = r.state.nav.route;
      const result = r.hit(); assert.equal(result.ok, true); assert.ok(result.totalApplied > 0);
      assert.equal(r.state.nav.executor.engaged, false); assert.equal(r.state.nav.executor.interruptReason, 'combat');
      assert.equal(r.state.nav.autopilot.active, false); assert.equal(r.state.nav.route, itinerary);
      assert.equal(r.releases.length, 1);
      r.hit(); r.follower.update(1 / 60, r.state); assert.equal(r.releases.length, 1);
      assert.equal(r.state.nav.autopilot.active, false, 'no automatic rearm after the player takes over');
      r.follower.engage(); r.follower.update(1 / 60, r.state); assert.equal(r.state.nav.executor.engaged, true);
    } finally { r.sim.dispose(); }
  });
}

for (const refusal of ['friendly', 'invulnerable', 'empty']) {
  test(`${refusal} damage requests cannot cancel travel before the combat owner adjudicates them`, () => {
    const r = boot();
    try {
      if (refusal === 'invulnerable') r.player.flags.invuln = true;
      r.hit({ attacker: refusal === 'friendly' ? r.friend : r.enemy, damage: refusal === 'empty' ? 0 : 10, viaBus: true });
      assert.equal(r.state.nav.executor.engaged, true); assert.equal(r.state.nav.autopilot.active, true);
      assert.equal(r.releases.length, 0);
    } finally { r.sim.dispose(); }
  });
}

test('accepted zero-applied packets and real combat against another ship do not steal the helm', () => {
  const r = boot();
  try {
    r.player.armorFlat = 1000;
    const result = r.hit(); assert.equal(result.ok, true); assert.equal(result.totalApplied, 0);
    r.hit({ target: r.friend });
    r.bus.emit('combat:hit', { targetId: r.player.id, damage: 10 }); // unadjudicated legacy intent
    assert.equal(r.state.nav.executor.engaged, true); assert.equal(r.releases.length, 0);
  } finally { r.sim.dispose(); }
});
