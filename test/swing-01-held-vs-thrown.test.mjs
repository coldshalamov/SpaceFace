// SWING-01 — is swinging a held body weaker than throwing it, and not limp?
//
// The design (docs 11/12 and the lead's hammer rule) says the THROWN body is the payoff: swinging a
// held body through enemies should still hit (not limp) but clearly less than a throw. Browser
// samples of 1-8 hits could not answer it, so this file answers it headless and deterministically.
//
// Everything that measures is the shipped path: `bootRealPath` stands up the real authoritative
// runtime (real `physics` system on the `rapier-dynamic` SG-02 authority, real `collisionConsequences`,
// real `masslineImpacts` observer, real `masslineImpactDamage` recoil, real `combat` system). The
// `physics:impact` receipts are the ones `physics.js` itself publishes — this file never fabricates
// a contact payload.
//
// Scenario (per seed): the player latches ONE light hostile ship (the club) and swings it on a taut
// 110 WU line at 200 WU/s counter-clockwise. Five hostile Wasps stand in a tight seeded cluster just
// outside the swing arc. Case A swings the club through them for 1.5 s without releasing. Case B
// releases (throws) at the release window — the last tick before first contact where the club is
// aimed at the cluster — then steps 1.5 s with the club ballistic. Both cases share the seeded
// layout, so the difference between A and B is only whether the line is still attached on contact.
//
// FIXTURE (disclosed; not a game rule): the player hull is pinned (its SG-02 body is made static) so
// the club's tangential speed and the release geometry are identical in both cases. The measurement
// isolates held-vs-released, which is the question. Nothing in the game is tuned here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { restoreFeatureMaps, snapshotFeatureMaps } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { SHIPS } from '../src/data/ships.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { masslineImpactDamage } from '../src/systems/masslineImpactDamage.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { combat } from '../src/systems/combat.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';

const DT = 1 / 60;
const TICKS = 90;                             // 1.5 s of contact time, both cases
const SEEDS = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010];
const PLAYER_HULL = 'ship_kestrel';
const CLUB_HULL = 'ship_wasp';
const VICTIM_HULL = 'ship_wasp';
const VICTIM_COUNT = 5;
const ATTACHMENT_ID = 'swing-line';

const SWING_RADIUS = 110;                     // WU — the tether_standard rest length the club swings on
const SWING_SPEED = 200;                      // WU/s — tangential speed of the held mass
const CLUSTER_ANGLE = (88 * Math.PI) / 180;   // where the cluster sits on the swing
const CLUSTER_RADIUS = 126;                   // WU — the blob straddles the arc, mostly just outside it
const CLUSTER_SPREAD = 26;                    // WU — pentagon radius: "tight", adjacent hulls never overlap
const AIM_WINDOW_RAD = (6 * Math.PI) / 180;   // the release window: aim at the cluster before contact

const WASP = SHIPS.find((def) => def.id === CLUB_HULL);
const TETHER = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');

// One case: `mode` is 'held' (line stays on for all TICKS) or 'thrown' (line cut at the release
// window, then TICKS more of ballistic flight).
async function runCase(seed, mode) {
  const host = await bootRealPath({
    seed,
    systems: ['physics', collisionConsequences, stuntGrammar, masslineImpacts, masslineImpactDamage, combat],
  });
  const { state, bus } = host;
  try {
    const rng = state.rng;
    // The player is a pinned observer/damage author, not a participant in the swing (see FIXTURE).
    const player = host.spawnShip({ hullId: PLAYER_HULL, pos: { x: 0, z: 0 }, isPlayer: true });
    player.physicsBody = { ...(player.physicsBody || {}), dynamic: false, revision: (player.physicsBody?.revision || 0) + 1 };
    player.vel.x = 0;
    player.vel.z = 0;

    // The club: one light hostile hull, already moving along the swing tangent.
    const club = host.spawnShip({ hullId: CLUB_HULL, pos: { x: SWING_RADIUS, z: 0 }, team: 1 });
    club.vel.x = 0;
    club.vel.z = SWING_SPEED;

    // Five hostile Wasps in a tight blob, seeded jitter so ten seeds sample the swing's timing.
    const victims = [];
    for (let index = 0; index < VICTIM_COUNT; index += 1) {
      const ringAngle = CLUSTER_ANGLE + (index / VICTIM_COUNT) * Math.PI * 2;
      const radial = CLUSTER_SPREAD + (rng() * 2 - 1) * 4;
      const angle = ringAngle + (rng() * 2 - 1) * 0.035;
      const victim = host.spawnShip({
        hullId: VICTIM_HULL,
        pos: {
          x: Math.cos(CLUSTER_ANGLE) * CLUSTER_RADIUS + Math.cos(angle) * radial,
          z: Math.sin(CLUSTER_ANGLE) * CLUSTER_RADIUS + Math.sin(angle) * radial,
        },
        team: 1,
      });
      victim.vel.x = 0;
      victim.vel.z = 0;
      victims.push(victim);
    }
    assert.ok(WASP.mass < 150, 'the club is a light hull');

    // One step first, then prove every actor owns a real Rapier body before any measurement.
    // (assertBodies reads opt-in telemetry, which is a different contract; the authority's own
    // record table is the body truth.)
    host.step(1);
    const physicsSystem = host.runtime.getSystem('physics');
    const owner = physicsSystem && physicsSystem._sg02;
    assert.ok(owner, 'the live SG-02 dynamic-body owner must exist');
    const missing = [player, club, ...victims]
      .filter((entity) => {
        const record = owner.records.get(entity.id);
        return !record || (record.entity !== entity);
      })
      .map((entity) => `#${entity.id} ${entity.type}`);
    assert.deepEqual(missing, [], `every actor must own a native body: ${missing.join(', ')}`);

    const created = owner.createAttachment({
      attachmentId: ATTACHMENT_ID,
      defId: TETHER.id,
      ownerId: player.id,
      targetId: club.id,
      sourceWorld: player.pos,
      targetWorld: club.pos,
      restLength: SWING_RADIUS,
      spring: TETHER.spring,
      break: TETHER.break,
      tick: state.tick,
    });
    assert.ok(created, 'the player must be able to latch the light hostile on the line');

    // The tether mirror tetherGameplay._mirror writes (same field names, same meaning).
    const tether = state.player.tether || (state.player.tether = {});
    Object.assign(tether, {
      active: true,
      targetId: club.id,
      attachmentId: ATTACHMENT_ID,
      phase: 'loaded',
      restLength: SWING_RADIUS,
      strain: 0.4,
      load: 0.55,
      latchedTick: state.tick,
    });

    const victimIds = new Set(victims.map((victim) => victim.id));
    const damageByVictim = new Map(victims.map((victim) => [victim.id, 0]));
    const damageByOrigin = new Map();
    let whipHits = 0;
    let contacts = 0;
    bus.on('combat:damage', (packet) => {
      if (!packet || !victimIds.has(packet.targetId)) return;
      const applied = Math.max(0, Number(packet.applied) || 0);
      damageByVictim.set(packet.targetId, damageByVictim.get(packet.targetId) + applied);
      const kind = String(packet.origin && packet.origin.kind || 'unknown');
      damageByOrigin.set(kind, (damageByOrigin.get(kind) || 0) + applied);
    });
    bus.on('tether:whipImpact', (payload) => {
      if (payload && payload.targetId === club.id) whipHits += 1;
    });
    bus.on('physics:impact', (payload) => {
      if (!payload) return;
      if (payload.aId === club.id || payload.bId === club.id) contacts += 1;
    });

    let releaseTick = -1;
    const release = () => {
      if (releaseTick >= 0) return;
      const cut = owner.cutAttachment({ attachmentId: ATTACHMENT_ID, reason: 'tether_cut', tick: state.tick });
      assert.equal(cut, true, 'the throw must cut the line');
      tether.active = false;
      tether.targetId = null;
      tether.attachmentId = null;
      tether.phase = 'slack';
      releaseTick = state.tick;
    };

    if (mode === 'thrown') {
      // Walk the swing until the club is aimed at the cluster (the release window), then throw.
      while (releaseTick < 0 && state.tick < TICKS) {
        const living = victims.filter((victim) => victim.alive !== false);
        if (!living.length || contacts > 0) break;
        if (aimError(club, centroid(living)) <= AIM_WINDOW_RAD) break;
        host.step(1);
      }
      release();
      assert.ok(releaseTick >= 0, 'the swing must offer a release window before contact');
    }
    const endTick = (releaseTick >= 0 ? releaseTick : 0) + TICKS;
    while (state.tick < endTick) host.step(1);

    const totalDamage = [...damageByVictim.values()].reduce((sum, value) => sum + value, 0);
    const kills = victims.filter((victim) => victim.alive === false).length;
    return {
      seed,
      mode,
      releaseTick,
      contacts,
      whipHits,
      damage: totalDamage,
      damageByOrigin: Object.fromEntries(damageByOrigin),
      kills,
      clubAlive: club.alive !== false,
      clubHull: Math.max(0, Number(club.hull) || 0),
    };
  } finally {
    host.dispose();
  }
}

function centroid(entities) {
  let x = 0;
  let z = 0;
  for (const entity of entities) {
    x += entity.pos.x;
    z += entity.pos.z;
  }
  return { x: x / entities.length, z: z / entities.length };
}

// Angle between the club's velocity and the direction to the target cluster, in radians.
function aimError(club, target) {
  const vx = Number(club.vel && club.vel.x) || 0;
  const vz = Number(club.vel && club.vel.z) || 0;
  const speed = Math.hypot(vx, vz);
  const dx = target.x - club.pos.x;
  const dz = target.z - club.pos.z;
  const distance = Math.hypot(dx, dz);
  if (!(speed > 1e-9) || !(distance > 1e-9)) return Math.PI;
  const dot = (vx * dx + vz * dz) / (speed * distance);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

test('SWING-01: a held swing lands, and the throw is the payoff (10 seeds)', { timeout: 600000 }, async () => {
  // The process-global flag MAPS default to legacy47a until a runtime seeds them, and
  // createAuthoritativeRuntime applies the profile only for the duration of init/step. The
  // features this measurement depends on are therefore asserted on the PRODUCTION config the
  // runtime actually runs, and the live proof is read off each case below.
  const previous = snapshotFeatureMaps();
  assert.equal(PRODUCTION_FEATURES.combat.whipDamage, true, 'the whip damage law must be live');
  assert.equal(PRODUCTION_FEATURES.combat.weaponImpulseConsequences, true, 'collision consequences must be live');
  assert.equal(PRODUCTION_FEATURES.massline2.enabled, true, 'the massline block must be live');
  assert.equal(PRODUCTION_FEATURES.massline2.throw, true, 'the held-body law must be live');
  assert.equal(PRODUCTION_FEATURES.massline2.impactDamage, true, 'the whip recoil path must be live');
  assert.ok(TETHER, 'the standard Massline definition exists');

  try {
    const results = { held: [], thrown: [] };
    for (const seed of SEEDS) {
      results.held.push(await runCase(seed, 'held'));
      results.thrown.push(await runCase(seed, 'thrown'));
    }
    const { held, thrown } = results;

    for (const row of held) {
      console.log(`SWING-01 seed ${row.seed} HELD   contacts=${row.contacts} whipHits=${row.whipHits}`
        + ` dmg=${row.damage.toFixed(1)} kills=${row.kills}`
        + ` clubHull=${row.clubHull.toFixed(0)} origins=${JSON.stringify(row.damageByOrigin)}`);
    }
    for (const row of thrown) {
      console.log(`SWING-01 seed ${row.seed} THROWN releaseTick=${row.releaseTick} contacts=${row.contacts}`
        + ` whipHits=${row.whipHits} dmg=${row.damage.toFixed(1)} kills=${row.kills}`
        + ` clubHull=${row.clubHull.toFixed(0)} origins=${JSON.stringify(row.damageByOrigin)}`);
    }

    const summary = {
      seeds: SEEDS.length,
      held: {
        killsMean: mean(held.map((row) => row.kills)),
        killsTotal: held.reduce((sum, row) => sum + row.kills, 0),
        damageMean: mean(held.map((row) => row.damage)),
        damagePerContactMean: mean(held.map((row) => (row.contacts > 0 ? row.damage / row.contacts : 0))),
        whipHitsMean: mean(held.map((row) => row.whipHits)),
        contactsMean: mean(held.map((row) => row.contacts)),
        clubSurvived: held.filter((row) => row.clubAlive).length,
      },
      thrown: {
        killsMean: mean(thrown.map((row) => row.kills)),
        killsTotal: thrown.reduce((sum, row) => sum + row.kills, 0),
        damageMean: mean(thrown.map((row) => row.damage)),
        damagePerContactMean: mean(thrown.map((row) => (row.contacts > 0 ? row.damage / row.contacts : 0))),
        whipHitsMean: mean(thrown.map((row) => row.whipHits)),
        contactsMean: mean(thrown.map((row) => row.contacts)),
        clubSurvived: thrown.filter((row) => row.clubAlive).length,
      },
    };
    console.log('SWING-01 MEAN OVER SEEDS', JSON.stringify(summary));

    // The design's shape, exactly as the packet states it.
    assert.ok(
      summary.thrown.killsTotal > summary.held.killsTotal,
      `design shape: thrown kills (${summary.thrown.killsTotal}) must exceed held kills`
      + ` (${summary.held.killsTotal}) — ${JSON.stringify(summary)}`,
    );
    // THROW-01 plough: a thrown body ploughs a pack (it survives its own impacts and each kill only
    // costs it a share of its speed); the held swing stays chip damage with no kills, unchanged.
    assert.ok(summary.thrown.killsMean >= 2.0,
      `plough: a throw into five Wasps must kill >= 2.0 on average (got ${summary.thrown.killsMean}) — ${JSON.stringify(summary)}`);
    assert.equal(summary.held.killsTotal, 0, 'a held swing still kills nothing');
    assert.ok(Math.abs(summary.held.damageMean - 276.88) <= 276.88 * 0.05,
      `held damage is unchanged (276.88 +/- 5%), got ${summary.held.damageMean}`);
    assert.ok(
      summary.held.damageMean > 0,
      `design shape: a held swing must not be limp (held damage ${summary.held.damageMean})`
      + ` — ${JSON.stringify(summary)}`,
    );
  } finally {
    restoreFeatureMaps(previous);
  }
});
