// PLOUGH-02 — the two edges of THROW-01's plough, measured on the real path.
//
// THROW-01 shipped the plough (src/combat/ploughFlight.js) validated on one scenario: the pack.
// This file answers the three questions the packet asks, with the same harness SWING-01 uses —
// `bootRealPath` stands up the real authoritative runtime (real `physics` system on the
// `rapier-dynamic` authority, real `collisionConsequences`, real `masslineImpacts`, real
// `masslineImpactDamage`, real `combat`), and every number below is read out of that run. No
// velocity is written after the release, no contact is fabricated.
//
//   1. A thrown Wasp hits a Foundry-room station solid (huge mass). Before this fix the club was
//      re-accelerated straight back into the structure every tick, still carrying its full throw
//      speed for the whole 1.5 s window.
//   2. A thrown Wasp hits a boss-mass body (>= 50x its mass, not killed by the hit). Measured
//      before the fix: met at 150 WU/s, carry took it back to 200 WU/s, and it drove itself out
//      the far side of the hull over 14 contacts.
//   3. A thrown body bounces back off a lighter body (25x — under the heavy ratio, so the plough
//      survives the hit) toward the pilot: before the fix the carry restored its speed along a
//      heading that closed on the pilot at 48 WU/s.
//
// FIXTURE (disclosed; not a game rule): the wall is placed by this file at a fixed world position
// down the club's release heading, and the player hull is pinned (its SG-02 body is made static) so
// the throw geometry is identical run to run. The measurement isolates the plough's carry, which is
// the question. Nothing in the game is tuned here.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { masslineImpactDamage } from '../src/systems/masslineImpactDamage.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { combat } from '../src/systems/combat.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import {
  PLOUGH_FLIGHT_TICKS,
  PLOUGH_HEAVY_MASS_RATIO,
  PLOUGH_MIN_SPEED,
  isPloughing,
} from '../src/combat/ploughFlight.js';

const DT = 1 / 60;
const SEED = 101;
const CLUB_HULL = 'ship_wasp';
const TETHER = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');

const SWING_RADIUS = 110;      // WU — the line's rest length, and the club's start radius
const THROW_SPEED = 200;       // WU/s — the club's tangential speed at release
const OBSERVE_TICKS = PLOUGH_FLIGHT_TICKS;  // the whole plough window

// The club is a 16-mass Wasp. 50x is 800 mass; 400 (the colossus) is 25x and keeps the carry,
// 2000 (the leviathan) is 125x and spends it, a Foundry room solid is six figures.
const REBOUND_WALL = { hullId: 'ship_colossus', mass: 400, radius: 30 };  // 25x — carry survives
const BOSS_WALL = { hullId: 'ship_leviathan', mass: 2000, radius: 40 };    // 125x — carry spends
const STATION_WALL = { radius: 40, mass: 1_000_000 };                     // a structure

function stationSpec({ x, z, radius, mass }) {
  return {
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x, z }, rot: 0, radius, mass, collides: true, hull: 1e9, hullMax: 1e9,
    data: { stationId: 'plough02_station', dockRadius: radius },
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * 4, dynamic: false, material: 'station', revision: 0 },
  };
}

function hullWallSpec({ hullId, mass, radius }, { x, z }) {
  const spec = makeShipEntitySpec(hullId, { team: 2, pos: { x, z } });
  return {
    ...spec,
    hull: 1e9, hullMax: 1e9, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    mass, radius,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * 4, dynamic: true, ccd: true, revision: 0 },
  };
}

/**
 * One run: a wall already in the world, the pinned player, a Wasp moving +z at THROW_SPEED on a
 * taut line that is cut one tick after the latch. Returns per-tick samples of everything the
 * assertions read.
 *
 * @param {object} options
 * @param {object} options.wall  A spec factory result: the body to throw the club into.
 * @param {number} [options.wallZ]  Wall's z (the club flies +z from (SWING_RADIUS, 0)).
 * @param {number} [options.wallX]  Wall's x (defaults to the club's line; an offset makes the hit oblique).
 */
async function throwIntoWall({ wall, wallZ, wallX = SWING_RADIUS }) {
  const host = await bootRealPath({
    seed: SEED,
    systems: ['physics', collisionConsequences, stuntGrammar, masslineImpacts, masslineImpactDamage, combat],
  });
  const { state, bus } = host;
  try {
    // The wall exists BEFORE the first step: SG-02 admits bodies it sees on its first sync, and a
    // body spawned mid-run never enters the static layer.
    const target = host.runtime.spawn({ ...wall, pos: { x: wallX, z: wallZ } });

    // FIXTURE: the player is a pinned observer/damage author, not a participant (see header).
    const player = host.spawnShip({ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, isPlayer: true });
    player.physicsBody = { ...(player.physicsBody || {}), dynamic: false, revision: (player.physicsBody?.revision || 0) + 1 };
    player.vel.x = 0;
    player.vel.z = 0;

    const club = host.spawnShip({ hullId: CLUB_HULL, pos: { x: SWING_RADIUS, z: 0 }, team: 1 });
    club.vel.x = 0;
    club.vel.z = THROW_SPEED;

    host.step(1);
    const physicsSystem = host.runtime.getSystem('physics');
    const owner = physicsSystem && physicsSystem._sg02;
    assert.ok(owner, 'the live SG-02 dynamic-body owner must exist');
    for (const entity of [player, club, target]) {
      const record = owner.records.get(entity.id);
      assert.ok(record && record.entity === entity, `every actor must own a native body (#${entity.id} ${entity.type})`);
    }

    const created = owner.createAttachment({
      attachmentId: 'plough02-line', defId: TETHER.id, ownerId: player.id, targetId: club.id,
      sourceWorld: player.pos, targetWorld: club.pos, restLength: SWING_RADIUS,
      spring: TETHER.spring, break: TETHER.break, tick: state.tick,
    });
    assert.ok(created, 'the player must be able to latch the club on the line');
    const tether = state.player.tether || (state.player.tether = {});
    Object.assign(tether, {
      active: true, targetId: club.id, attachmentId: 'plough02-line', phase: 'loaded',
      restLength: SWING_RADIUS, strain: 0.3, load: 0.5, latchedTick: state.tick,
    });
    host.step(1);
    assert.equal(owner.cutAttachment({ attachmentId: 'plough02-line', reason: 'tether_cut', tick: state.tick }), true,
      'the throw must cut the line');
    tether.active = false;
    tether.targetId = null;
    tether.attachmentId = null;
    tether.phase = 'slack';
    const releaseTick = state.tick;
    const releaseSpeed = Math.hypot(club.vel.x, club.vel.z);

    const samples = [];
    let contacts = 0;
    let playerDamage = 0;
    bus.on('physics:impact', (payload) => {
      if (!payload) return;
      const hitClub = payload.aId === club.id || payload.bId === club.id;
      const hitWall = payload.aId === target.id || payload.bId === target.id;
      if (hitClub && hitWall) contacts += 1;
    });
    bus.on('combat:damage', (payload) => {
      if (payload && payload.targetId === player.id) playerDamage += Math.max(0, Number(payload.applied) || 0);
    });

    for (let i = 0; i < OBSERVE_TICKS; i++) {
      host.step(1);
      const vx = Number(club.vel.x) || 0;
      const vz = Number(club.vel.z) || 0;
      const speed = Math.hypot(vx, vz);
      const dx = player.pos.x - club.pos.x;
      const dz = player.pos.z - club.pos.z;
      const toPlayer = Math.hypot(dx, dz);
      samples.push({
        t: state.tick - releaseTick,
        speed,
        // Positive = the club is moving at the pilot.
        closingOnPlayer: toPlayer > 1e-6 ? (vx * dx + vz * dz) / toPlayer : 0,
        gapToWall: Math.hypot(club.pos.x - target.pos.x, club.pos.z - target.pos.z) - (target.radius + club.radius),
        ploughing: isPloughing(state, club),
        contacts,
        playerDamage,
      });
    }
    return {
      samples, contacts, releaseSpeed, playerDamage,
      clubAlive: club.alive !== false,
      clubHull: Number(club.hull) || 0,
      ploughSpent: !!(state.massline2?.plough?.spent && state.massline2.plough.spent[club.id]),
    };
  } finally {
    host.dispose();
  }
}

/** The first sample at or after the first contact, and everything after it. */
function afterFirstContact(run) {
  const firstIndex = run.samples.findIndex((row) => row.contacts > 0);
  assert.ok(firstIndex >= 0, 'the club must actually reach the wall inside the plough window');
  return { first: run.samples[firstIndex], rest: run.samples.slice(firstIndex) };
}

const maxSpeed = (rows) => rows.reduce((max, row) => Math.max(max, row.speed), 0);
const fmt = (run) => `contacts=${run.contacts} clubHull=${run.clubHull.toFixed(0)} ploughSpent=${run.ploughSpent}`
  + ` playerDamage=${run.playerDamage.toFixed(1)} speeds=${run.samples.map((r) => r.speed.toFixed(0)).join(',')}`;

test('PLOUGH-02: a throw that meets a Foundry room solid stops ploughing instead of driving into it', { timeout: 300000 }, async () => {
  const run = await throwIntoWall({
    wall: stationSpec({ x: SWING_RADIUS, z: 0, ...STATION_WALL }),
    wallZ: 200,
  });
  const { first, rest } = afterFirstContact(run);
  console.log(`PLOUGH-02 station: release ${run.releaseSpeed.toFixed(1)} WU/s, first contact at t=${first.t}`
    + ` at ${first.speed.toFixed(1)} WU/s; peak speed after contact ${maxSpeed(rest).toFixed(1)}`
    + `; ${fmt(run)}`);
  // The station is six figures of mass: far past the heavy ratio, so the carry is spent.
  assert.ok(STATION_WALL.mass >= 16 * PLOUGH_HEAVY_MASS_RATIO, 'the station is far heavier than the club');
  assert.equal(run.ploughSpent, true, `a heavy-body contact must spend the carry (${fmt(run)})`);
  // The point of the fix: the club does not get its throw speed back and drive into the structure.
  // Whatever it retains is what the contact left it, not the carry's restoration to 200 WU/s.
  const peakAfter = maxSpeed(rest);
  assert.ok(peakAfter < run.releaseSpeed * 0.75,
    `the plough must not restore throw speed into a station (peak after contact ${peakAfter.toFixed(1)}`
    + ` of ${run.releaseSpeed.toFixed(1)} released) — ${fmt(run)}`);
});

test('PLOUGH-02: a throw that meets a boss-mass body is spent, not re-accelerated through it', { timeout: 300000 }, async () => {
  const clubMass = 16; // a Wasp; asserted below against the real spawn
  assert.ok(BOSS_WALL.mass >= clubMass * PLOUGH_HEAVY_MASS_RATIO, 'the boss body is past the heavy ratio');
  const run = await throwIntoWall({
    wall: hullWallSpec(BOSS_WALL, { x: SWING_RADIUS, z: 0 }),
    wallZ: 200,
  });
  const { first, rest } = afterFirstContact(run);
  console.log(`PLOUGH-02 boss: release ${run.releaseSpeed.toFixed(1)} WU/s, first contact at t=${first.t}`
    + ` at ${first.speed.toFixed(1)} WU/s; peak speed after contact ${maxSpeed(rest).toFixed(1)}`
    + `; ${fmt(run)}`);
  assert.equal(run.ploughSpent, true, `a boss-mass hit must spend the carry (${fmt(run)})`);
  const peakAfter = maxSpeed(rest);
  assert.ok(peakAfter < run.releaseSpeed * 0.85,
    `the carry must not take the club back to throw speed against a boss body (peak after contact`
    + ` ${peakAfter.toFixed(1)} of ${run.releaseSpeed.toFixed(1)}) — ${fmt(run)}`);
  // The hammer rule survives the fix: the plough is what let a thrown body live through its own
  // impacts, and a light thrown at a capital is still allowed to come back and be thrown again.
  assert.equal(run.clubAlive, true, `the plough's own protection must survive a heavy contact (${fmt(run)})`);
});

test('PLOUGH-02: a rebound toward the thrower keeps what it bounced with', { timeout: 300000 }, async () => {
  // An oblique hit (the wall 8 WU to the club's side of the line) so the bounce retains speed and
  // the club is still ploughing after the contact — that is the case the rule is about.
  const run = await throwIntoWall({
    wall: hullWallSpec(REBOUND_WALL, { x: SWING_RADIUS, z: 0 }),
    wallZ: 170,
    wallX: SWING_RADIUS + 8,
  });
  const { first, rest } = afterFirstContact(run);
  const closing = rest.filter((row) => row.closingOnPlayer > 0);
  const maxClosing = closing.length ? Math.max(...closing.map((row) => row.closingOnPlayer)) : 0;
  const peakAfter = maxSpeed(rest);
  console.log(`PLOUGH-02 rebound: release ${run.releaseSpeed.toFixed(1)} WU/s, first contact at t=${first.t}`
    + ` at ${first.speed.toFixed(1)} WU/s; peak after ${peakAfter.toFixed(1)};`
    + ` max closing at the pilot ${maxClosing.toFixed(1)} WU/s; ${fmt(run)}`);
  // This wall is 25x the club — under the heavy ratio, so the carry is NOT spent by edge 1. The
  // club must still be ploughing after the bounce (otherwise this case proves nothing).
  assert.equal(run.ploughSpent, false, `a 25x hit must not spend the carry (${fmt(run)})`);
  assert.ok(rest.some((row) => row.ploughing),
    `the carry must still be live after a 25x hit, or this case tests the wrong rule — ${fmt(run)}`);
  // The rule under test: a body heading back at its thrower never gets its speed restored.
  for (const row of closing) {
    assert.ok(row.speed <= first.speed + 1e-6,
      `a rebound must not gain speed on a heading at the pilot: t=${row.t} speed ${row.speed.toFixed(2)}`
      + ` > ${first.speed.toFixed(2)} at contact — ${fmt(run)}`);
  }
  // And the player must not be taking contact damage from the plough's own work.
  assert.equal(run.playerDamage, 0, `the plough must never hurt the pilot (${fmt(run)})`);
});

test('PLOUGH-02: the plough still carries a body through a pack at the SWING-01 numbers', { timeout: 300000 }, async () => {
  // A guard on the fix's blast radius: SWING-01 owns the pack numbers (thrown >= 2.0 kills, held 0)
  // and re-runs there. What this asserts here is the invariant that made the carry worth having —
  // a throw into several light hulls keeps the plough alive — so a future change cannot quietly
  // turn the plough off entirely and pass the three edge cases above.
  assert.ok(PLOUGH_MIN_SPEED > 0, 'the plough still has its spent-speed floor');
  const host = await bootRealPath({
    seed: SEED,
    systems: ['physics', collisionConsequences, stuntGrammar, masslineImpacts, masslineImpactDamage, combat],
  });
  const { state } = host;
  try {
    const player = host.spawnShip({ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, isPlayer: true });
    player.physicsBody = { ...(player.physicsBody || {}), dynamic: false, revision: (player.physicsBody?.revision || 0) + 1 };
    player.vel.x = 0; player.vel.z = 0;
    const club = host.spawnShip({ hullId: CLUB_HULL, pos: { x: SWING_RADIUS, z: 0 }, team: 1 });
    club.vel.x = 0; club.vel.z = THROW_SPEED;
    const victims = [];
    for (let index = 0; index < 3; index += 1) {
      const victim = host.spawnShip({
        hullId: CLUB_HULL, team: 1,
        pos: { x: SWING_RADIUS, z: 120 + index * 46 },
      });
      victim.vel.x = 0; victim.vel.z = 0;
      victims.push(victim);
    }
    host.step(1);
    const owner = host.runtime.getSystem('physics')._sg02;
    owner.createAttachment({
      attachmentId: 'plough02-pack', defId: TETHER.id, ownerId: player.id, targetId: club.id,
      sourceWorld: player.pos, targetWorld: club.pos, restLength: SWING_RADIUS,
      spring: TETHER.spring, break: TETHER.break, tick: state.tick,
    });
    const tether = state.player.tether || (state.player.tether = {});
    Object.assign(tether, {
      active: true, targetId: club.id, attachmentId: 'plough02-pack', phase: 'loaded',
      restLength: SWING_RADIUS, strain: 0.3, load: 0.5, latchedTick: state.tick,
    });
    host.step(1);
    owner.cutAttachment({ attachmentId: 'plough02-pack', reason: 'tether_cut', tick: state.tick });
    tether.active = false; tether.targetId = null; tether.attachmentId = null; tether.phase = 'slack';

    let peakPloughSpeed = 0;
    let ploughTicks = 0;
    for (let i = 0; i < OBSERVE_TICKS; i++) {
      host.step(1);
      if (!isPloughing(state, club)) continue;
      ploughTicks += 1;
      peakPloughSpeed = Math.max(peakPloughSpeed, Math.hypot(club.vel.x, club.vel.z));
    }
    const kills = victims.filter((victim) => victim.alive === false).length;
    console.log(`PLOUGH-02 pack: ${ploughTicks} ploughing ticks, peak ${peakPloughSpeed.toFixed(1)} WU/s,`
      + ` ${kills} of ${victims.length} light hulls killed, club ${club.alive === false ? 'destroyed' : `alive at ${Number(club.hull).toFixed(0)}`}`);
    assert.ok(ploughTicks > 20, `a throw into a light pack must keep ploughing, saw ${ploughTicks} ticks`);
    assert.ok(peakPloughSpeed > 100, `the plough must carry real speed through a pack, peak ${peakPloughSpeed.toFixed(1)}`);
    assert.ok(kills >= 1, `a plough through three light hulls must kill at least one, saw ${kills}`);
  } finally {
    host.dispose();
  }
});
