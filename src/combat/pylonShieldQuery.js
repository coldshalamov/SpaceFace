// Linked Shield Pylons — the state-reading side of the one geometric fact (packet 06).
//
// Every attack path that must respect the panel (projectile sweep, beam ray, blast occlusion, chain
// hop selection) asks THIS module, never its own geometry:
//
//   interceptSegment(state, kind, sourceId, x0,z0, x1,z1, radius, opts)  -> first blocking crossing | null
//   blastOccluded(state, job, center, body, sourceId, damage)             -> boolean
//   chainBlocked(state, from, to, sourceId, exemptId)                     -> boolean
//
// They read the runtime mirror `state.shieldPylons` that src/systems/shieldPylons.js publishes
// (plain JSON-safe data, ids and numbers only; never serialized). They do NOT debit energy: an
// accepted interception is recorded in `mirror.inbox`, and the shieldPylons system drains it once
// per tick — that system is the ONE owner of shield energy and of the contact receipt.
//
// Every entry point has an allocation-free early-out when no panel is blocking, so an idle sim
// (and the 47-A golden) never pays for or sees this feature.
//
// Relation policy (documented once): hostility is the engine's own oracle (`isHostileForAI`,
// injected by the system at init so this file stays a leaf), evaluated LIVE at contact time against
// the panel owner — a relation that changes while a round is in flight changes its fate at the next
// crossing. If the attack's source entity is gone (a shooter died after firing), the source's
// last-known team (stamped on the projectile) is used with the same oracle; with no team at all the
// attack FAILS CLOSED (blocked) — it cannot be proven friendly.

import { occupantGenerationOf } from '../core/entity.js';
import {
  sweepDiscVsPanel, sweepDiscVsMovingPanel, segmentMayTouchBounds,
} from './pylonShieldGeometry.js';
import {
  PYLON_CONTACT, PYLON_RELATION, blocksContact, resolveRelation, contactEnergy,
} from './pylonShieldPolicy.js';
import { SHIELD_PYLON_DEF, PYLON_STATES } from '../data/shieldPylons.js';

const MIRROR_KEY = 'shieldPylons';
const INBOX_CAP = 256;

let hostilityOracle = null;
/** The system registers the engine's hostility oracle (state, a, b) => boolean at init. */
export function setPylonHostilityOracle(fn) { hostilityOracle = typeof fn === 'function' ? fn : null; }

/** The runtime mirror, or null when no pylon was ever deployed this run. Never creates it. */
export function pylonMirror(state) {
  const m = state && state[MIRROR_KEY];
  return m && m.schemaVersion === 1 ? m : null;
}

/** Cheap early-out for every attack path: is any panel currently able to block? */
export function hasBlockingPanels(state) {
  const m = pylonMirror(state);
  return !!m && m.blocking > 0;
}

const BLOCKING_STATES = new Set([PYLON_STATES.ACTIVE, PYLON_STATES.STRAINED]);

function endpointAlive(state, ref) {
  if (!ref) return false;
  const e = state.entities && state.entities.get(ref.id);
  if (!e || e.alive === false) return false;
  return occupantGenerationOf(e) === ref.life;
}

/** Can this pair stop an attack right now (state, remaining energy net of pending debits, live endpoints)? */
export function pairBlocking(state, pair) {
  if (!pair || !BLOCKING_STATES.has(pair.state)) return false;
  if (!(pair.energy - (pair.pending || 0) > 0)) return false;
  return endpointAlive(state, pair.a) && endpointAlive(state, pair.b);
}

/** Is `id` one of the pair's own endpoint bodies? (Endpoints are never occluded by their own panel.) */
export function isPairEndpoint(pair, id) {
  return !!pair && ((pair.a && pair.a.id === id) || (pair.b && pair.b.id === id));
}

const NO_ATTUNE = () => false;

function attunedPredicate(state, pair) {
  if (pair.ownerId !== state.playerId) return NO_ATTUNE;
  const tetherTarget = state.player && state.player.tether && state.player.tether.active
    ? state.player.tether.targetId : null;
  return (subject) => {
    const d = subject && subject.data;
    if (d && (d.gyreCore === true || d.gyreLaunched === true)) return true;
    return tetherTarget != null && subject.id === tetherTarget;
  };
}

const PSEUDO = { id: null, team: null, type: 'ship', data: null };

/**
 * Relation of an attack SOURCE (by entity id, with an optional last-known team) to the pair's
 * owner. Cached per (pair, source) for the current tick only — relations are read live.
 */
export function relationOfSource(state, pair, sourceId, fallbackTeam = null) {
  const m = pylonMirror(state);
  const owner = state.entities && state.entities.get(pair.ownerId);
  if (!owner || owner.alive === false) return PYLON_RELATION.UNKNOWN;
  const tick = state.tick | 0;
  let cache = m && m.relCache;
  if (m) {
    if (!cache || m.relCacheTick !== tick) { cache = m.relCache = new Map(); m.relCacheTick = tick; }
    const hitKey = `${pair.id}|${sourceId}`;
    if (sourceId != null && cache.has(hitKey)) return cache.get(hitKey);
  }
  let subject = sourceId != null && state.entities ? state.entities.get(sourceId) : null;
  if (subject && subject.alive === false && fallbackTeam != null) subject = null;
  if (!subject && sourceId != null && fallbackTeam != null) {
    PSEUDO.id = sourceId; PSEUDO.team = fallbackTeam; PSEUDO.data = {};
    subject = PSEUDO;
  }
  let relation = PYLON_RELATION.UNKNOWN;
  if (subject) {
    relation = resolveRelation(subject, {
      owner,
      isHostile: hostilityOracle ? (o, s) => hostilityOracle(state, o, s) : null,
      isAttuned: attunedPredicate(state, pair),
    });
    // With no oracle registered nothing can prove a source friendly or hostile: fail closed.
    if (!hostilityOracle && relation !== PYLON_RELATION.OWNER && relation !== PYLON_RELATION.ALLY) {
      relation = PYLON_RELATION.UNKNOWN;
    }
  }
  if (m && sourceId != null) m.relCache.set(`${pair.id}|${sourceId}`, relation);
  return relation;
}

/** Relation of a physical BODY (a hull or loose debris) to the pair's owner. */
export function relationOfBody(state, pair, body) {
  const owner = state.entities && state.entities.get(pair.ownerId);
  if (!owner || owner.alive === false) return PYLON_RELATION.UNKNOWN;
  return resolveRelation(body, {
    owner,
    isHostile: hostilityOracle ? (o, s) => hostilityOracle(state, o, s) : null,
    isAttuned: attunedPredicate(state, pair),
  });
}

/** Record an accepted interception for the system's single debit. Bounded; never throws. */
export function recordPanelContact(state, pair, kind, amount, point, normal, extra = null) {
  const m = pylonMirror(state);
  if (!m || !pair) return false;
  if (m.inbox.length >= INBOX_CAP) m.inbox.shift();
  const rec = {
    pairId: pair.id,
    kind,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    x: point ? point.x : 0,
    z: point ? point.z : 0,
    nx: normal ? normal.nx : 0,
    nz: normal ? normal.nz : 0,
    tick: state.tick | 0,
  };
  if (extra) {
    if (extra.sourceId != null) rec.sourceId = extra.sourceId;
    if (extra.bodyId != null) rec.bodyId = extra.bodyId;
  }
  m.inbox.push(rec);
  pair.pending = (pair.pending || 0) + rec.amount;
  return true;
}

const HIT = {
  pair: null, pairId: null, kind: '', t: 0, x: 0, z: 0, cx: 0, cz: 0, nx: 0, nz: 1,
  side: 0, part: '', startInside: false,
};
const SWEEP = { t: 0, cx: 0, cz: 0, x: 0, z: 0, nx: 0, nz: 1, side: 0, startInside: false, part: '' };

function sweepPair(pair, x0, z0, x1, z1, radius) {
  return pair.moving
    ? sweepDiscVsMovingPanel(SWEEP, pair.prevPanel, pair.panel, x0, z0, x1, z1, radius)
    : sweepDiscVsPanel(SWEEP, pair.panel, x0, z0, x1, z1, radius);
}

/**
 * The first blocking panel crossing along (x0,z0)->(x1,z1) for an attack of `kind` whose source is
 * `sourceId`. Returns a SHARED scratch record (valid until the next call) or null:
 *   { pair, pairId, kind, t, x, z, cx, cz, nx, nz, side, part }
 * `t` is the fraction along the path; (x,z) is the contact on the panel surface; (nx,nz) points
 * back at the attacker's side. `opts`: { fallbackTeam, exemptId, ignoreStartInside }.
 */
export function interceptSegment(state, kind, sourceId, x0, z0, x1, z1, radius = 0, opts = null) {
  const m = pylonMirror(state);
  if (!m || !(m.blocking > 0)) return null;
  let found = false;
  const pairs = m.pairs;
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (!pairBlocking(state, pair)) continue;
    if (!segmentMayTouchBounds(pair.bounds, x0, z0, x1, z1, radius)) continue;
    if (opts && opts.exemptId != null && isPairEndpoint(pair, opts.exemptId)) continue;
    const relation = relationOfSource(state, pair, sourceId, opts ? opts.fallbackTeam : null);
    if (!blocksContact(kind, relation)) continue;
    if (!sweepPair(pair, x0, z0, x1, z1, radius)) continue;
    if (SWEEP.startInside && opts && opts.ignoreStartInside) continue;
    if (found && !(SWEEP.t < HIT.t)) continue;
    found = true;
    HIT.pair = pair; HIT.pairId = pair.id; HIT.kind = kind;
    HIT.t = SWEEP.t; HIT.x = SWEEP.x; HIT.z = SWEEP.z; HIT.cx = SWEEP.cx; HIT.cz = SWEEP.cz;
    HIT.nx = SWEEP.nx; HIT.nz = SWEEP.nz; HIT.side = SWEEP.side; HIT.part = SWEEP.part;
    HIT.startInside = SWEEP.startInside;
  }
  return found ? HIT : null;
}

/**
 * Shield points an interception of `kind` should cost, from the attack's own facts. `info`:
 * { damage, baseImpulse, mass, dv }. Beams pay exactly their per-tick damage (no floor); every
 * discrete contact pays at least the minimum so a chip shot is never free.
 */
export function interceptEnergy(kind, info) {
  const e = contactEnergy(kind, info, SHIELD_PYLON_DEF);
  return e;
}

/** A projectile-style interception: record the single debit and return the contact for the caller. */
export function acceptIntercept(state, hit, kind, info, sourceId = null) {
  if (!hit || !hit.pair) return null;
  recordPanelContact(state, hit.pair, kind, interceptEnergy(kind, info),
    { x: hit.x, z: hit.z }, { nx: hit.nx, nz: hit.nz }, { sourceId });
  return hit;
}

/**
 * Is `body` shielded from a blast centred at `center` whose source is `sourceId`? True when the
 * straight path centre->body crosses a panel that blocks that source. A centre INSIDE a footprint
 * (an explosion on the wall) is not occluded by that wall, and a pair's own endpoints are never
 * occluded by their own panel. The first occlusion by each pair per blast job records ONE debit
 * (`job.pylonDebited`), however many bodies the blast would have reached.
 */
export function blastOccluded(state, job, center, body, sourceId, damage = 0, baseImpulse = 0) {
  const m = pylonMirror(state);
  if (!m || !(m.blocking > 0) || !center || !body || !body.pos) return false;
  const bx = body.pos.x; const bz = body.pos.z;
  const hit = interceptSegment(state, PYLON_CONTACT.BLAST, sourceId, center.x, center.z, bx, bz, 0,
    { exemptId: body.id, ignoreStartInside: true, fallbackTeam: job && job.sourceTeam != null ? job.sourceTeam : null });
  if (!hit) return false;
  const debited = job && (job.pylonDebited || (job.pylonDebited = new Set()));
  if (!debited || !debited.has(hit.pairId)) {
    if (debited) debited.add(hit.pairId);
    recordPanelContact(state, hit.pair, PYLON_CONTACT.BLAST,
      interceptEnergy(PYLON_CONTACT.BLAST, { damage, baseImpulse }),
      { x: hit.x, z: hit.z }, { nx: hit.nx, nz: hit.nz }, { sourceId });
  }
  return true;
}

/** Would a chain/arc hop from `from` to `to` cross a panel that blocks `sourceId`? (selection filter; no debit) */
export function chainBlocked(state, from, to, sourceId, exemptId = null, fallbackTeam = null) {
  const m = pylonMirror(state);
  if (!m || !(m.blocking > 0) || !from || !to) return false;
  return interceptSegment(state, PYLON_CONTACT.CHAIN, sourceId, from.x, from.z, to.x, to.z, 0,
    { exemptId, ignoreStartInside: true, fallbackTeam }) !== null;
}

/** Total damage a projectile carries (its packet channels, else the legacy scalar), for the energy debit. */
export function projectileDamageOf(proj) {
  const d = proj && proj.data;
  if (!d) return 0;
  const packet = d.damagePacket || d.packet;
  if (packet && packet.channels && typeof packet.channels === 'object') {
    let sum = 0;
    for (const key of Object.keys(packet.channels)) {
      const v = Number(packet.channels[key]);
      if (Number.isFinite(v) && v > 0) sum += v;
    }
    if (sum > 0) return sum;
  }
  const scalar = Number(d.damage);
  return Number.isFinite(scalar) && scalar > 0 ? scalar : 0;
}

export { PYLON_CONTACT, PYLON_RELATION };
