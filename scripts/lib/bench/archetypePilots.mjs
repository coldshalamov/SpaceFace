// scripts/lib/bench/archetypePilots.mjs — the fit-archetype pilot RUNNER.
//
// THE CLAIM UNDER TEST (see archetypePilotData.mjs for the fits and the scorer): four different
// FITS of the same hull complete the same fixed-seed combat content through measurably different
// verb profiles. Each pilot is a small deterministic policy reading only player-visible sim truth
// (positions, tether state, hostility) and writing only the ordinary input contract (axes, fire,
// tether fire/cut, countermeasure deploy).
//
// Real-path law: this module integrates no physics of its own. `bootRealPath` stands up the
// authoritative runtime (rapier-dynamic, SG-02, the live systems), and every counted verb is a
// bus event the game itself published.
//
// Hosts are strictly sequential (see realPath.mjs): one pilot boots, runs, and disposes before
// the next starts.

import { combat, makeEnemySpawnSpec } from '../../../src/systems/combat.js';
import { countermeasures } from '../../../src/systems/countermeasures.js';
import { collisionConsequences } from '../../../src/systems/collisionConsequences.js';
import { tetherGameplay } from '../../../src/systems/tetherGameplay.js';
import { masslineSnares } from '../../../src/systems/masslineSnares.js';
import { weapons } from '../../../src/systems/weapons.js';
import { getDerivedStats } from '../../../src/systems/ships.js';
import { bootRealPath, writeRealPathInput } from './realPath.mjs';
import {
  ANCHOR,
  ARCHETYPES,
  ARCHETYPE_SEED,
  LATCH_RANGE,
  RAIDER_COUNT,
  RAIDER_ENEMY_TYPE_ID,
  RAIDER_FITTINGS,
  RAIDER_SPREAD,
  TICK_BUDGET,
  TERRAIN,
  archetypeById,
} from './archetypePilotData.mjs';

// The verbs every run counts, with the bus events that feed each row. Rows the policy does not
// promise (pdsIntercept, whipImpact, snareCaught) still ride the profile when they happen —
// they thicken the pairwise distance without being load-bearing.
const VERB_EVENTS = [
  { row: 'shotsFired', events: ['combat:fire'], playerId: true },
  { row: 'latches', events: ['tether:latched'] },
  { row: 'lineCuts', events: ['tether:released'] },
  { row: 'whipSnap', events: ['tether:whipSnap'] },
  { row: 'whipImpact', events: ['tether:whipImpact'] },
  { row: 'swingDash', events: ['ship:swingDash'] },
  { row: 'snareDeployed', events: ['massline:snareDeployed'] },
  { row: 'snareCaught', events: ['massline:snareCaught'] },
  { row: 'decoyDeployed', events: ['countermeasure:deployed'], keep: (p) => p && p.kind === 'decoy' },
  { row: 'pdsIntercept', events: ['pds:intercept'] },
  { row: 'towFlailHit', events: ['combat:collisionConsequence'], keep: (p) => p && (p.provenance === 'tow_flail' || (p.provenance && p.provenance.tag === 'tow_flail')) },
  { row: 'kills', events: ['entity:killed'] },
];

const POLICIES = {
  predator: predatorPolicy,
  control: controlPolicy,
  precision: precisionPolicy,
  industrial: industrialPolicy,
};

/**
 * Runs one archetype pilot to completion (three raiders down, player alive) or the tick budget.
 * Strictly sequential hosts — never run two pilots concurrently.
 *
 * @returns {Promise<object>} receipt: completion, verb profile, real-path proof.
 */
export async function runArchetypePilot(archetypeId, { seed = ARCHETYPE_SEED, tickBudget = TICK_BUDGET } = {}) {
  const archetype = archetypeById(archetypeId);
  if (!archetype) throw new Error(`runArchetypePilot: unknown archetype "${archetypeId}"`);
  const policy = POLICIES[archetype.policyId];

  const host = await bootRealPath({
    seed,
    // The snare system rides along because one identity is built on it: a Transverse Snare press
    // is consumed by the masslineSnares helper, which only exists when the system is registered.
    systems: ['actions', 'flightV3', combat, 'physics', weapons, tetherGameplay, masslineSnares, countermeasures, collisionConsequences, 'aiPorts', 'tacticalAI'],
    hulls: [{
      hullId: archetype.hullId, pos: { x: 0, z: 0 }, rot: 0, isPlayer: true,
      factionId: 'faction_free', fittings: archetype.fittings.slice(),
    }],
  });
  try {
    // Content: terrain, the tow anchor, and the raiders, all from the production enemy spawner
    // (authorized doctrine, scaled hull, expanded weapons — the spec an encounter director hands
    // the world).
    for (const rock of TERRAIN) {
      host.spawnObstacle({ pos: { x: rock.x, z: rock.z }, radius: rock.radius, mass: rock.mass, hull: 8000, data: { archetypeTerrain: true } });
    }
    const anchor = host.spawnObstacle({
      pos: { x: ANCHOR.x, z: ANCHOR.z }, radius: ANCHOR.radius, mass: ANCHOR.mass,
      hull: 4000, dynamic: true, inertiaY: 4000, data: { archetypeAnchor: true },
    });
    const raiders = [];
    for (let i = 0; i < RAIDER_COUNT; i++) {
      const at = RAIDER_SPREAD[i % RAIDER_SPREAD.length];
      raiders.push(host.runtime.spawn(makeEnemySpawnSpec(RAIDER_ENEMY_TYPE_ID, 4, { x: at.x, z: at.z })));
    }
    host.step(1, { before: ({ state }) => writeRealPathInput(state, {}) });
    // Ships sit inside SG-02's proximity band; the anchor only earns a body when a line latches
    // it (the attachment service forces the endpoint body), so it is not asserted here.
    host.assertBodies([host.player, ...raiders], 'archetype content');

    const verbs = {};
    for (const spec of VERB_EVENTS) verbs[spec.row] = 0;
    const playerId = host.player.id;
    for (const spec of VERB_EVENTS) {
      for (const event of spec.events) {
        host.bus.on(event, (payload) => {
          if (spec.playerId && (!payload || payload.ownerId !== playerId)) return;
          if (spec.keep && !spec.keep(payload)) return;
          verbs[spec.row] += 1;
        });
      }
    }

    const ctx = {
      state: host.state,
      player: host.player,
      anchor,
      raiders,
      derived: getDerivedStats(archetype.hullId, archetype.fittings, host.state.player),
      input: {},
      live: raiders,
      nearest: null,
      target: null,
      phase: 'engage',
      phaseTicks: 0,
    };

    let ticks = 0;
    let completed = false;
    host.step(tickBudget, {
      before: ({ state }) => {
        ctx.live = ctx.raiders.filter((r) => r.alive !== false);
        ctx.nearest = nearest(ctx.live, ctx.player.pos);
        // Sticky targeting: a pilot commits to the chosen hull until it dies, like a player.
        if (!ctx.target || ctx.target.alive === false) ctx.target = ctx.nearest;
        ctx.input = {};
        if (ctx.target) policy(ctx);
        writeInput(state, ctx.input);
      },
      after: () => {
        ticks += 1;
        if (ctx.player.alive === false) return false;
        if (ctx.live && ctx.live.length === 0) { completed = true; return false; }
        return true;
      },
    });

    return {
      archetypeId: archetype.id,
      label: archetype.label,
      seed,
      completed,
      ticks,
      playerAlive: ctx.player.alive !== false,
      raidersDown: RAIDER_COUNT - (ctx.live ? ctx.live.length : 0),
      verbs,
      signature: archetype.signature,
      proof: host.proof(),
    };
  } finally {
    host.dispose();
  }
}

// ---------------------------------------------------------------------------------------------
// Policies. Each reads player-visible truth and fills ctx.input — the ordinary input contract.
// ---------------------------------------------------------------------------------------------

// Momentum predator: hold ground, let the raiders come, latch the committed target, burn off the
// line to load the whip spring (swing-dashing on the tangent), cut — the stored ½ks² leaves as
// the snap — then finish the staggered hull with the momentum gun before it recovers.
function predatorPolicy(ctx) {
  // Opportunistic: a raider that flees out of reach is dropped for the nearest one still in
  // the water — the whip is a close verb, and chasing a faster kiter is not the fantasy.
  const target = ctx.nearest;
  if (!target) return;
  const tether = ctx.state.player.tether;
  const d = distance(ctx.player.pos, target.pos);
  if (ctx.phase === 'engage') {
    // Close to latch range and let the raiders come the rest of the way. Shoot the whole
    // approach (auto-aim carries the lead).
    turnToward(ctx, target.pos);
    if (d > LATCH_RANGE - 40) ctx.input.moveZ = 1;
    if (d <= 460) {
      aimGun(ctx, target);
      ctx.input.fire = true;
    }
    if (d <= LATCH_RANGE) {
      aimAt(ctx, target.pos);
      ctx.input.tetherFire = true;
      ctx.phase = 'stretch';
      ctx.phaseTicks = 0;
    }
    return;
  }
  if (ctx.phase === 'stretch') {
    ctx.phaseTicks += 1;
    if (target.alive === false) { ctx.phase = 'engage'; ctx.phaseTicks = 0; return; }
    if (!tether || !tether.active) { ctx.phase = 'terminate'; ctx.phaseTicks = 0; return; }
    // Burn along the tangent (the swing drive redirects the dash there too) to load the spring,
    // and shoot while the line constrains the target's motion — the tether-lock shot.
    turnToward(ctx, target.pos, Math.PI / 2);
    ctx.input.moveZ = 1;
    if (ctx.phaseTicks === 20 || ctx.phaseTicks === 60) ctx.input.boost = true;
    if (d <= 380) {
      turnToward(ctx, target.pos);
      aimGun(ctx, target);
      ctx.input.fire = true;
    }
    if (ctx.phaseTicks > 90) { ctx.phase = 'release'; ctx.phaseTicks = 0; }
    return;
  }
  if (ctx.phase === 'release') {
    ctx.phaseTicks += 1;
    ctx.input.tetherCut = true;
    if (ctx.phaseTicks > 6 || !tether || !tether.active) { ctx.phase = 'terminate'; ctx.phaseTicks = 0; }
    return;
  }
  // terminate: the snap staggered it — chase and finish before it recovers.
  ctx.phaseTicks += 1;
  turnToward(ctx, target.pos);
  ctx.input.moveZ = 1;
  if (d <= 420) {
    aimGun(ctx, target);
    ctx.input.fire = true;
  }
  if (target.alive === false || ctx.phaseTicks > 120) { ctx.phase = 'engage'; ctx.phaseTicks = 0; }
}

// Control specialist: lay the snare across the pursuit lane (one live line at a time — the
// hazard's own TTL clears it), kite so the pursuit crosses it, bait with the decoy buoy when
// they close, and shoot whatever survives.
function controlPolicy(ctx) {
  const target = ctx.target || ctx.nearest;
  if (!target) return;
  const d = distance(ctx.player.pos, target.pos);
  const tether = ctx.state.player.tether;
  ctx.phaseTicks += 1;
  if (ctx.phase === 'engage') {
    // One press per lay: the snare head consumes it as a world-to-world transaction.
    if (ctx.phaseTicks < 3) {
      const mid = {
        x: ctx.player.pos.x + (target.pos.x - ctx.player.pos.x) * 0.5,
        z: ctx.player.pos.z + (target.pos.z - ctx.player.pos.z) * 0.5,
      };
      aimAt(ctx, mid);
      ctx.input.tetherFire = true;
      return;
    }
    ctx.phase = 'kite';
    ctx.phaseTicks = 0;
    ctx.lastSnareTick = ctx.state.tick;
    return;
  }
  // Hold the mid band: close enough that the pursuit has a lane across the line, far enough
  // to keep the beam working.
  turnToward(ctx, target.pos);
  if (d > 340) ctx.input.moveZ = 1;
  else if (d < 220) {
    turnToward(ctx, target.pos, Math.PI);
    ctx.input.moveZ = 1;
  }
  if (d < 300) ctx.input.deployCountermeasure = true;
  if (d <= 360) {
    aimGun(ctx, target);
    ctx.input.fire = true;
  }
  // Re-lay at most once per snare lifetime.
  if (ctx.state.tick - (ctx.lastSnareTick || 0) > 12 * 60) { ctx.phase = 'engage'; ctx.phaseTicks = 0; }
}

// Precision pilot: stand-off gunnery at the mid band, and a short latch-and-cut cycle whose
// monofilament blade staggers anything it crosses. The servo intercepts what arrives.
function precisionPolicy(ctx) {
  const target = ctx.target || ctx.nearest;
  if (!target) return;
  const d = distance(ctx.player.pos, target.pos);
  const tether = ctx.state.player.tether;
  ctx.phaseTicks += 1;
  turnToward(ctx, target.pos);
  aimGun(ctx, target);
  ctx.input.fire = true;
  if (d > 300) ctx.input.moveZ = 1;
  else if (d < 180) {
    turnToward(ctx, target.pos, Math.PI);
    ctx.input.moveZ = 1;
  }
  if (!tether || !tether.active) {
    if (d <= LATCH_RANGE && ctx.phaseTicks % 120 === 0) {
      aimAt(ctx, target.pos);
      ctx.input.tetherFire = true;
    }
  } else if (ctx.phaseTicks % 30 === 0) {
    ctx.input.tetherCut = true;
  }
}

// Salvage industrialist: tow the heavy anchor (the frame coupler's hitch), then ram the pack
// dragging it. The hull strike while towing carries the load's mass (tow_flail); the dash buys
// the closing speed a kiting raider would otherwise match away.
function industrialPolicy(ctx) {
  const tether = ctx.state.player.tether;
  const player = ctx.player;
  if (ctx.phase === 'engage') {
    turnToward(ctx, ctx.anchor.pos);
    ctx.input.moveZ = 1;
    if (tether && tether.active) { ctx.phase = 'ram'; ctx.phaseTicks = 0; return; }
    if (distance(player.pos, ctx.anchor.pos) <= 140) {
      aimAt(ctx, ctx.anchor.pos);
      ctx.input.tetherFire = true;
    }
    return;
  }
  const target = ctx.nearest;
  ctx.phaseTicks += 1;
  if (!tether || !tether.active) { ctx.phase = 'engage'; ctx.phaseTicks = 0; return; }
  if (!target) return;
  const d = distance(player.pos, target.pos);
  turnToward(ctx, target.pos);
  ctx.input.moveZ = 1;
  // Point-blank chip only: the flail strike is the payload; the gun exists to finish what a
  // strike left at kissing distance, not to replace it.
  if (d <= 150) {
    aimGun(ctx, target);
    ctx.input.fire = true;
  }
  // Dash-punch at the edge of the burst: closing speed only exists in the dash, so fire it
  // while the gap is still closable.
  if (d <= 150 && ctx.phaseTicks % 60 === 1) ctx.input.boost = true;
}

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

function writeInput(state, input) {
  writeRealPathInput(state, input);
  state.input.aimIntentActive = input.aimIntentActive === true;
  if (input.aimWorld) state.input.aimWorld = { x: input.aimWorld.x, z: input.aimWorld.z };
  // Gun aim: the same channel the input layer carries — an explicit lead angle plus the game's
  // own auto-aim assist (each mount then re-solves lead at its own projectile speed).
  if (input.aimAngle != null) state.input.aimAngle = input.aimAngle;
  state.input.autoAim = input.autoAimTargetId != null
    ? { targetId: input.autoAimTargetId }
    : null;
  state.input.actions = {
    ...state.input.actions,
    tetherFire: input.tetherFire === true,
    tetherCut: input.tetherCut === true,
    massline: (input.tetherFire || input.tetherCut)
      ? { latch: input.tetherFire === true, cut: input.tetherCut === true, lineControl: false, lineLength: 0 }
      : (input.reelIn
        ? { latch: false, cut: false, lineControl: true, lineLength: -1 }
        : null),
  };
  if (input.deployCountermeasure) state.input.deployCountermeasure = true;
}

function turnToward(ctx, pos, offset = 0) {
  const want = Math.atan2(pos.z - ctx.player.pos.z, pos.x - ctx.player.pos.x) + offset;
  let diff = want - (ctx.player.rot || 0);
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  ctx.input.turnIntent = Math.max(-1, Math.min(1, diff * 2));
}

function aimAt(ctx, pos) {
  ctx.input.aimIntentActive = true;
  ctx.input.aimWorld = { x: pos.x, z: pos.z };
}

// Gun aim onto a hull: nose-angle lead channel + auto-aim assist target.
function aimGun(ctx, target) {
  if (!target || !target.pos) return;
  ctx.input.aimAngle = Math.atan2(target.pos.z - ctx.player.pos.z, target.pos.x - ctx.player.pos.x);
  ctx.input.autoAimTargetId = target.id;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearest(list, pos) {
  let best = null;
  let bestD = Infinity;
  for (const entity of list) {
    if (!entity || entity.alive === false || !entity.pos) continue;
    const d = distance(entity.pos, pos);
    if (d < bestD) {
      best = entity;
      bestD = d;
    }
  }
  return best;
}

export { ARCHETYPES, ARCHETYPE_SEED, RAIDER_COUNT, TICK_BUDGET, archetypeById };
export { l1, normalize, scorePilotRuns } from './archetypePilotData.mjs';
