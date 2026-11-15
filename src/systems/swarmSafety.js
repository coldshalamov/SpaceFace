// Swarm arrival geometry and per-wave first-act admission. Placement never writes velocity.
// While the pilot waits, canonical damage/fuse owners hold harm; bodies keep their motion
// and resume ordinary damage after the act. The geometry tests below never park a body.
import { resolvePhysicsBodySpec, physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';

export const SWARM_ARRIVAL_GRACE_S = 2.5;
export const SWARM_SPAWN_LOOKAHEAD_S = 0.75;
export const SWARM_SPAWN_RETRY_TICKS = 30;
const SOLIDS = new Set(['asteroid', 'wreck', 'station', 'ship', 'drone']);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

/** Closest approach of two discs over the next horizon seconds (XZ world units). */
export function sweptDiscsOverlap(pos, radius, other, {
  horizon = SWARM_SPAWN_LOOKAHEAD_S, clearance = 8, velocity = null,
} = {}) {
  if (!other || other.alive === false || other.collides === false || !other.pos) return false;
  const rx = finite(other.pos.x) - pos.x;
  const rz = finite(other.pos.z) - pos.z;
  const vx = finite(other.vel?.x) - finite(velocity?.x);
  const vz = finite(other.vel?.z) - finite(velocity?.z);
  const speed2 = vx * vx + vz * vz;
  const t = speed2 > 1e-12
    ? Math.max(0, Math.min(Math.max(0, finite(horizon)), -(rx * vx + rz * vz) / speed2)) : 0;
  const dx = rx + vx * t;
  const dz = rz + vz * t;
  const otherRadius = clearanceFootprint(other);
  const reach = Math.max(0, finite(radius)) + otherRadius
    + Math.max(0, finite(clearance));
  return dx * dx + dz * dz < reach * reach;
}

/**
 * The footprint one body claims inside a placement check: the LARGER of its native
 * collider and its authored radius. A pending spawn spec is not an entity yet:
 * `resolvePhysicsBodySpec` can answer a default radius while the authored `radius` is the
 * hull that is about to exist — so a reserved neighbour is never treated as smaller than
 * its arriving body. Placement planners that pre-space bodies the live recheck will
 * measure must space by this same footprint, or the field silently drops what they accept.
 */
export function clearanceFootprint(other) {
  const nativeRadius = resolvePhysicsBodySpec(other)?.radius;
  const authoredRadius = finite(other && other.radius, 10);
  const measured = [nativeRadius, authoredRadius]
    .filter((r) => Number.isFinite(r) && r >= 0);
  return measured.length ? Math.max(...measured) : 10;
}

/** All live solid occupants, including the pilot and same-tick arrivals, are obstacles. */
export function swarmPlacementIsClear(state, pos, radius, options = {}) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)
    || !Number.isFinite(radius) || radius < 0) return false;
  const occupants = state?.entities && typeof state.entities.values === 'function'
    ? state.entities.values() : (state?.entityList || []);
  for (const entity of occupants) {
    if (!entity || (!SOLIDS.has(entity.type)
      && !(entity.physicsBody?.schemaVersion === 1 && entity.physicsBody.material !== 'massline_sensor'))) continue;
    if (sweptDiscsOverlap(pos, radius, entity, options)) return false;
  }
  for (const entity of options.reserved || []) {
    if (sweptDiscsOverlap(pos, radius, entity, options)) return false;
  }
  return true;
}

/**
 * Deterministic bounded search near the intended gate. A blocked gate returns null;
 * it never manufactures a collision, jumps through the player, or hides a ship kilometres away.
 * Search changes neither the RNG stream nor any existing body's position/velocity.
 */
export function findSwarmArrival(state, proposed, radius, options = {}) {
  if (!proposed || !Number.isFinite(proposed.x) || !Number.isFinite(proposed.z)
    || !Number.isFinite(radius) || radius < 0) return null;
  const player = state?.entities?.get?.(state.playerId);
  const fixedAnchor = options.anchor;
  const anchor = fixedAnchor && Number.isFinite(fixedAnchor.x) && Number.isFinite(fixedAnchor.z)
    ? fixedAnchor : player?.pos || { x: 0, z: 0 };
  const dx = proposed.x - finite(anchor.x);
  const dz = proposed.z - finite(anchor.z);
  const initial = Math.hypot(dx, dz);
  const floor = Math.max(72, finite(player?.radius, 6) + radius + 32);
  const ring = Math.max(initial, floor);
  const angle = Math.atan2(dz, dx);
  // `require` — the caller's ONE extra geometric condition (the Brood debut's recipe check).
  // A candidate that clears occupancy but fails the recipe is skipped, exactly like a blocked
  // one: the search keeps walking bearings instead of widening the recipe's meaning.
  const predicate = typeof options.require === 'function' ? options.require : null;
  if (initial >= floor && swarmPlacementIsClear(state, proposed, radius, options)
    && (!predicate || predicate(proposed))) {
    return { x: proposed.x, z: proposed.z };
  }
  // Preserve throw-shaped packs when only a neighbour blocks the proposed point.
  // Search their authored disc first; actual terrain may still require a wider gate berth.
  const center = options.clusterCenter;
  const clusterRadius = finite(options.clusterRadius);
  if (center && Number.isFinite(center.x) && Number.isFinite(center.z) && clusterRadius > 0) {
    for (let sample = 0; sample < 64; sample++) {
      const localAngle = angle + sample * 2.399963229728653; // golden-angle disc samples
      const r = clusterRadius * Math.sqrt(sample / 63);
      const pos = { x: center.x + Math.cos(localAngle) * r, z: center.z + Math.sin(localAngle) * r };
      if (Math.hypot(pos.x - finite(anchor.x), pos.z - finite(anchor.z)) < floor) continue;
      if (swarmPlacementIsClear(state, pos, radius, options)
        && (!predicate || predicate(pos))) return pos;
    }
  }
  // Nine radii, nine bearings. Keep the arrival within +/-22.5 degrees of its tell.
  for (let radial = 0; radial < 9; radial++) {
    for (let lane = 0; lane < 9; lane++) {
      const turn = (lane % 2 ? 1 : -1) * Math.ceil(lane / 2) * Math.PI / 32;
      const r = ring + radial * 24;
      const pos = { x: finite(anchor.x) + Math.cos(angle + turn) * r,
        z: finite(anchor.z) + Math.sin(angle + turn) * r };
      if (swarmPlacementIsClear(state, pos, radius, options)
        && (!predicate || predicate(pos))) return pos;
    }
  }
  return null;
}

export const SWARM_FORTIFY_MEET_WU = 110;

/**
 * Where pack `index` of a wave arrives when the pilot has paid for defences: on the far side of
 * the outermost defence of a defended corridor, on the line from the field's anchor through it,
 * so the pack has to cross the hardware to reach the pilot. Corridors with nothing standing are
 * skipped; packs rotate over the defended ones in fixed order. Wave-start work only: allocates
 * one point and never touches the RNG. `fortify` is the Fortify owner's getArrivalGuards() answer.
 */
export function fortifiedArrivalCentre(fortify, index) {
  const guards = fortify?.guards, anchor = fortify?.anchor;
  if (!guards?.length || !Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.z)) return null;
  const outer = new Map();
  for (const guard of guards) {
    const far = Math.hypot(guard.x - anchor.x, guard.z - anchor.z);
    const best = outer.get(guard.corridor);
    if (!best || far > best.far) outer.set(guard.corridor, { guard, far });
  }
  const corridors = [...outer.keys()].sort();
  const pick = outer.get(corridors[Math.abs(Math.trunc(index)) % corridors.length]);
  if (!pick || !(pick.far > 1e-6)) return null;
  const reach = pick.far + finite(pick.guard.radius, 12) + SWARM_FORTIFY_MEET_WU;
  return { x: anchor.x + (pick.guard.x - anchor.x) / pick.far * reach,
    z: anchor.z + (pick.guard.z - anchor.z) / pick.far * reach };
}

// --- PRI-11b: family debuts -----------------------------------------------------------
// The first course wave a specialist Brood family fields, ONE member lands alone beside the
// piece of the room that beats it (src/data/swarmBrood.js SWARM_BROOD_DEBUTS). Each recipe
// names the ONE geometric check below; the admission itself is the ordinary clearance/
// arrival search with that check folded in as `require`, so a near-miss that still keeps
// the recipe counts and one that breaks it does not. A room that cannot satisfy the recipe
// is not a stall — the family simply arrives the ordinary way. Wave-start work only:
// one bounded candidate list per call, no RNG, no body moved or manufactured.

function debutIdTie(a, b) {
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function debutScene(state) {
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return null;
  const pilotRadius = Math.max(finite(player.radius), finite(resolvePhysicsBodySpec(player)?.radius));
  if (!(pilotRadius > 0)) return null;
  const solids = [];
  for (const entity of state.entities.values()) {
    if (!entity || (!SOLIDS.has(entity.type)
      && !(entity.physicsBody?.schemaVersion === 1 && entity.physicsBody.material !== 'massline_sensor'))) continue;
    solids.push(entity);
  }
  return { player, pilotRadius, solids };
}

/**
 * A mass the pilot can actually send at the debut member: a small free body, still and
 * alive in the room, inside the reach a first read can use. `loose` widens the court to
 * any genuine rock or wreck under the throw-and-dodge ceiling; the throwable court names
 * the arena's own debris stock. Candidates sort nearest-first, entity id breaking ties —
 * same room, same seat.
 */
function debutMassAnchors(state, player, pilotRadius, solids, loose) {
  const candidates = [];
  for (const rock of state.entities.values()) {
    if (!rock?.alive || rock.collides === false || rock.physicsBody === false
      || !Number.isFinite(rock.pos?.x) || !Number.isFinite(rock.pos?.z)
      || !Number.isFinite(rock.vel?.x) || !Number.isFinite(rock.vel?.z)
      || Math.hypot(rock.vel.x, rock.vel.z) > 2) continue;
    const body = resolvePhysicsBodySpec(rock);
    if (!body?.dynamic || !(body.radius > 0 && body.radius <= 9)) continue;
    if (loose) {
      if (!['asteroid', 'wreck'].includes(rock.type) || !physicsBodyNativeReady(rock)
        || !(body.mass > 0 && body.mass <= 220)
        || PHYSICS_MATERIALS[body.material]?.ghost === true
        || body.material === 'sensor' || body.material === 'massline_sensor'
        || (Number.isFinite(rock.data?.despawnAt) && rock.data.despawnAt <= finite(state.simTime) + 30)
        || (state.player?.tether?.active && state.player.tether.targetId === rock.id)) continue;
      // The pilot's reach to it is real — a mass behind a bank is not ammunition.
      const reach = { x: rock.pos.x - player.pos.x, z: rock.pos.z - player.pos.z };
      if (solids.some((o) => o !== rock && o !== player
        && sweptDiscsOverlap(player.pos, 2, o, { horizon: 1, clearance: 2, velocity: reach }))) continue;
    } else if (rock.type !== 'asteroid' || !rock.data?.swarmArenaDebris || !(rock.radius > 0)) {
      continue;
    }
    const distance = Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z);
    if (distance < Math.max(45, pilotRadius + body.radius + 12) || distance > 120) continue;
    candidates.push({ rock, body, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance || debutIdTie(a.rock.id, b.rock.id));
  return candidates;
}

/**
 * throwable / looseMass: the member lands beyond its anchor mass, on the line from the
 * pilot through it — the acid mark and the ammunition read as one picture. The `require`
 * check keeps the seat beside its own anchor, keeps that anchor's clear throw at the
 * member, and keeps the pilot a genuine crosswise escape.
 */
function debutBeyondMass(state, player, pilotRadius, solids, radius, anchors, {
  beyond, beside, escapeSpeed,
}) {
  for (const { rock, body, distance } of anchors) {
    const ux = (rock.pos.x - player.pos.x) / distance, uz = (rock.pos.z - player.pos.z) / distance;
    const rockRadius = Math.max(finite(rock.radius), finite(body.radius));
    const proposed = { x: rock.pos.x + ux * beyond, z: rock.pos.z + uz * beyond };
    const spot = findSwarmArrival(state, proposed, radius, { clearance: 8, require: (pos) => {
      // Still beside its own anchor — a wandered seat names a different court.
      if (Math.hypot(pos.x - rock.pos.x, pos.z - rock.pos.z) > beside) return false;
      // The same stone must have a clear throw at the member — not an advertised
      // shot through another bank.
      const thrown = { x: pos.x - rock.pos.x, z: pos.z - rock.pos.z };
      if (solids.some((o) => o !== rock && sweptDiscsOverlap(rock.pos, rockRadius, o,
        { horizon: 1, clearance: 2, velocity: thrown }))) return false;
      // And the pilot keeps a genuine crosswise escape from the threat's axis.
      if (![1, -1].some((side) => solids.every((o) => o === player
        || !sweptDiscsOverlap(player.pos, pilotRadius, o, { horizon: 1, clearance: 4,
          velocity: { x: -uz * side * escapeSpeed, z: ux * side * escapeSpeed } })))) return false;
      return true;
    } });
    if (spot) return { x: spot.x, z: spot.z, anchorId: rock.id };
  }
  return null;
}

/**
 * scrapeSurface: the member arrives opposite a wall the pilot can actually scrape — a
 * native-ready, non-ghost asteroid surface in the gap band, with the pilot's hull-width
 * route to its near face already proven. The member keeps the far side so the surface
 * stays behind the pilot: wall at your back, latch in front.
 */
function debutScrapeSurface(state, player, pilotRadius, solids, radius) {
  const candidates = [];
  for (const rock of state.entities.values()) {
    if (!rock?.alive || rock.type !== 'asteroid' || rock.collides === false
      || rock.physicsBody === false || !physicsBodyNativeReady(rock)
      || (Number.isFinite(rock.data?.despawnAt) && rock.data.despawnAt <= finite(state.simTime) + 30)
      || !Number.isFinite(rock.pos?.x) || !Number.isFinite(rock.pos?.z)
      || !Number.isFinite(rock.vel?.x) || !Number.isFinite(rock.vel?.z)
      || Math.hypot(rock.vel.x, rock.vel.z) > 2) continue;
    const body = resolvePhysicsBodySpec(rock);
    if (!body || PHYSICS_MATERIALS[body.material]?.ghost === true
      || body.material === 'sensor' || body.material === 'massline_sensor'
      || !(finite(rock.radius) >= 8 && body.radius >= 8)) continue;
    const distance = Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z);
    const gap = distance - body.radius - pilotRadius;
    if (gap >= 35 && gap <= 140) candidates.push({ rock, distance, body });
  }
  candidates.sort((a, b) => a.distance - b.distance || debutIdTie(a.rock.id, b.rock.id));
  for (const { rock, distance, body } of candidates) {
    const ux = (rock.pos.x - player.pos.x) / distance, uz = (rock.pos.z - player.pos.z) / distance;
    // The pilot's hull-width scrape route to the near face is real before any seat is asked.
    const contactDistance = distance - body.radius - pilotRadius;
    const scrape = { x: ux * contactDistance, z: uz * contactDistance };
    if (solids.some((o) => o !== player && o !== rock
      && sweptDiscsOverlap(player.pos, pilotRadius, o, { horizon: 1, clearance: 4, velocity: scrape }))) continue;
    const proposed = { x: player.pos.x - ux * 76, z: player.pos.z - uz * 76 };
    const spot = findSwarmArrival(state, proposed, radius, { clearance: 8, require: (pos) => {
      // The member stays on the pilot's far side from the wall — the surface behind.
      if ((pos.x - player.pos.x) * ux + (pos.z - player.pos.z) * uz >= 0) return false;
      // And the latch's own approach is unobstructed.
      const approach = { x: player.pos.x - pos.x, z: player.pos.z - pos.z };
      if (solids.some((o) => o !== player
        && sweptDiscsOverlap(pos, radius, o, { horizon: 1, clearance: 2, velocity: approach }))) return false;
      return true;
    } });
    if (spot) return { x: spot.x, z: spot.z, anchorId: rock.id };
  }
  return null;
}

/**
 * escapeLane: the member arrives in open space on a fixed bearing fan, never hidden
 * behind a bank, with the pilot's hull-width sideways escape proven on at least one
 * side — the room you can leave is the whole read for a body that bursts or shoves.
 */
function debutEscapeLane(state, player, pilotRadius, solids, radius) {
  const heading = Number.isFinite(player.rot) ? player.rot : 0;
  for (let i = 0; i < 16; i++) {
    const angle = heading + i * Math.PI / 8;
    const proposed = { x: player.pos.x + Math.cos(angle) * 130,
      z: player.pos.z + Math.sin(angle) * 130 };
    const spot = findSwarmArrival(state, proposed, radius, { clearance: 8, require: (pos) => {
      const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (!(d > 1e-6)) return false;
      // The threat approaches in open space — it never starts hidden behind a bank.
      if (solids.some((o) => o !== player && sweptDiscsOverlap(player.pos, radius, o,
        { horizon: 1, clearance: 4, velocity: { x: dx, z: dz } }))) return false;
      const ex = dx / d, ez = dz / d;
      // A genuine crosswise escape at hull width on at least one side.
      if (![1, -1].some((side) => solids.every((o) => o === player
        || !sweptDiscsOverlap(player.pos, pilotRadius, o, { horizon: 1, clearance: 4,
          velocity: { x: -ez * side * 90, z: ex * side * 90 } })))) return false;
      return true;
    } });
    if (spot) return { x: spot.x, z: spot.z, anchorId: null };
  }
  return null;
}

/**
 * The debut's seat for the recipe `needs` names, through the same clearance/arrival search
 * every Brood body uses — extended by exactly the one check the recipe requires. Returns
 * { x, z, anchorId } (anchorId is the anchor entity's id, or null for an open-lane seat),
 * or null when the room honestly cannot satisfy the recipe — scenery is never moved or
 * manufactured to make one.
 */
export function findSwarmDebutArrival(state, need, radius) {
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const scene = debutScene(state);
  if (!scene) return null;
  const { player, pilotRadius, solids } = scene;
  switch (need) {
    case 'throwable':
      return debutBeyondMass(state, player, pilotRadius, solids, radius,
        debutMassAnchors(state, player, pilotRadius, solids, false),
        { beyond: 60, beside: 90, escapeSpeed: 65 });
    case 'looseMass':
      return debutBeyondMass(state, player, pilotRadius, solids, radius,
        debutMassAnchors(state, player, pilotRadius, solids, true),
        { beyond: 70, beside: 95, escapeSpeed: 90 });
    case 'scrapeSurface':
      return debutScrapeSurface(state, player, pilotRadius, solids, radius);
    case 'escapeLane':
      return debutEscapeLane(state, player, pilotRadius, solids, radius);
    default:
      return null;
  }
}

// First act belongs to one round of one run. New Game reuses the state object and
// Retry reuses the wave number, while wallet/phase changes replace the run object.
// The run owner's token survives those replacements and changes on each launch.
const pilotActs = new WeakMap();

function isCurrentPilotAct(act, run) {
  return act?.wave === run.wave && act.runToken === run.retireToken;
}

function liveFirstActFight(state) {
  const run = state && state.run;
  if (!run || run.kind !== 'survival'
    || (run.ruleset !== 'swarm' && run.ruleset !== 'scored')) return null;
  if (run.phase !== 'active' || !Number.isInteger(run.wave)) return null;
  return run;
}

/** True unless a live Swarm or Gauntlet round awaits its first pilot act. Other runs keep their existing admission. */
export function swarmPilotHasActed(state) {
  const run = liveFirstActFight(state);
  if (!run) return true;
  return isCurrentPilotAct(pilotActs.get(state), run);
}

export function noteSwarmPilotAction(state) {
  const run = liveFirstActFight(state);
  if (!run || isCurrentPilotAct(pilotActs.get(state), run)) return;
  pilotActs.set(state, { runToken: run.retireToken, wave: run.wave });
}

/**
 * A trigger pull, physical verb, boost, brake, or a real stick. autoFire is combat-stick mode:
 * followAutoTargetPath writes moveX/moveZ/turnIntent every tick, so those axes
 * do not count while autoFire is on. An idle pilot who left the stick on auto
 * has not acted. Input-owned drawFlightManual distinguishes real device controls
 * from those assist axes. Explicit physical verbs still count. Threshold matches
 * flight.js hasManualFlightInput.
 */
export function swarmPilotIsActing(state) {
  const input = state && state.input;
  if (!input) return false;
  if (input.fire === true) return true;
  if (input.boost || input.brake) return true;
  const actions = input.actions;
  if (actions && (actions.tetherFire || actions.tetherCut || actions.chargeThrow
    || actions.chargeDetonate || actions.dropBomb || actions.gyreSnare || actions.throwArm || actions.throwTap || actions.touchThrow
    || actions.deployWell || actions.deployRepulsor || actions.deployMassSeed
    || Math.abs(actions.reelDelta || 0) > 0.08)) return true;
  if (input.drawFlightManual === true) return true;
  if (input.autoFire) return false;
  return Math.abs(input.moveX || 0) > 0.08
    || Math.abs(input.moveZ || 0) > 0.08
    || Math.abs(input.turnIntent || 0) > 0.08;
}
