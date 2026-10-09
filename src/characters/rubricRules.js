/** RUBRIC pure rules: stillness, target scoring, the truth composer, the register lint and the
 * hover servo. No state, no events, no randomness except hash32 (so the 47-A goldens and every
 * save stay reproducible). Shared by the live system, its tests and the playable bench. */
import { hash32 } from '../core/rng.js';
import { occupantGenerationOf } from '../core/entity.js';
import { RUBRIC as C, RUBRIC_TRUTH as T } from '../data/rubric.js';

export const finiteXZ = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const speedOf = e => (finiteXZ(e?.vel) ? Math.hypot(e.vel.x, e.vel.z) : Infinity);
export const spinOf = e => (Number.isFinite(e?.angVel) ? Math.abs(e.angVel) : 0);
export const SIM_DAY_S = 600;

// ---------- the register lint -------------------------------------------------------------
// Words that name an emotional state, performance or irony. A Rubric line may state a measurement,
// an act or a record. It may not state how the marker is doing.
const FORBIDDEN = ['feel', 'felt', 'sorry', 'sad', 'happy', 'glad', 'afraid', 'fear', 'scared', 'angry', 'mad',
  'love', 'hate', 'hope', 'wish', 'proud', 'ashamed', 'shame', 'guilt', 'lonely', 'alone', 'regret', 'grief',
  'mourn', 'please', 'thank', 'sadly', 'unfortunately', 'ironic', 'ironically', 'funny', 'joke', 'lol', 'haha'];
const FORBIDDEN_RE = new RegExp(`\\b(?:${FORBIDDEN.join('|')})\\b`, 'i');

/** Returns the list of register violations in a line (empty array = the line passes). */
export function violatesRegister(text) {
  const out = [];
  if (typeof text !== 'string' || !text.trim()) return ['empty'];
  if (/[!?]/.test(text)) out.push('exclamation-or-question');
  if (/\.{3}|…/.test(text)) out.push('ellipsis');
  if (/[\u{1F000}-\u{1FFFF}☀-➿]/u.test(text)) out.push('emoji');
  if (/\bI (?:am|was) (?!HM-11\b)/i.test(text) && /\bI (?:am|was) (?:sad|happy|glad|afraid|scared|angry|tired|lonely|proud|sorry)\b/i.test(text)) out.push('names-own-state');
  const bad = text.match(FORBIDDEN_RE);
  if (bad) out.push(`forbidden-word:${bad[0].toLowerCase()}`);
  if (text.length > 220) out.push('too-long');
  return out;
}

// ---------- stillness ---------------------------------------------------------------------
/** A hull is markable only at rest in the sector frame: low speed AND low spin. */
export function stillness(e) {
  const speed = speedOf(e), spin = spinOf(e);
  return { speed, spin, speedOk: speed <= C.stillSpeed, spinOk: spin <= C.stillSpin,
    still: speed <= C.stillSpeed && spin <= C.stillSpin };
}

/** The attachment kernel is authoritative for "the player holds a line on this body". */
export function playerHoldsLine(state, body) {
  const rows = state?.combat?.attachments?.byId;
  const player = state?.entities?.get(state.playerId);
  if (!rows || !body?.alive || !player?.alive || state.entities.get(body.id) !== body) return false;
  for (const key of Object.keys(rows)) {
    const a = rows[key];
    if (a?.state === 'active' && a.ownerId === state.playerId && a.targetId === body.id
      && (a.ownerGeneration == null || a.ownerGeneration === occupantGenerationOf(player))
      && (a.targetGeneration == null || a.targetGeneration === occupantGenerationOf(body))) return true;
  }
  return false;
}

// ---------- hover servo -------------------------------------------------------------------
/** Hull F-41 swings round a slack mooring at constant speed (swingRadius * swingRate WU/s). That
 * speed is deliberately above stillSpeed: left alone the filing never holds still, so it takes a
 * hand on a line to bring it to rest. */
export function mooringGoal(time, anchor, out = {}) {
  out.x = anchor.x + Math.cos(time * C.swingRate) * C.swingRadius;
  out.z = anchor.z + 24 + Math.sin(time * C.swingRate) * C.swingRadius;
  return out;
}

/** Bounded critically-damped servo. Returns a delta-v (never a position write) or null. */
export function boundedServo(entity, goal, dt, out = {}, accelCap = C.maxAccel, speedCap = C.maxSpeed, goalVel = null) {
  if (!finiteXZ(entity?.pos) || !finiteXZ(entity?.vel) || !finiteXZ(goal)
      || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) return null;
  const gvx = goalVel?.x || 0, gvz = goalVel?.z || 0;
  let ax = (goal.x - entity.pos.x) * 1.7 + (gvx - entity.vel.x) * 2.4;
  let az = (goal.z - entity.pos.z) * 1.7 + (gvz - entity.vel.z) * 2.4;
  const n = Math.hypot(ax, az), scale = n > accelCap ? accelCap / n : 1;
  ax *= scale; az *= scale;
  let vx = entity.vel.x + ax * dt, vz = entity.vel.z + az * dt;
  const vn = Math.hypot(vx, vz);
  if (vn > speedCap) { const k = speedCap / vn; vx *= k; vz *= k; }
  out.x = vx - entity.vel.x; out.z = vz - entity.vel.z;
  return out;
}

/** Where the marker hovers to work a hull: on the side it approached from, inside arm reach. */
export function workPoint(marker, hull, out = {}) {
  const dx = marker.pos.x - hull.pos.x, dz = marker.pos.z - hull.pos.z, n = Math.hypot(dx, dz) || 1;
  const standoff = (hull.radius || 8) + C.reach * 0.4;
  out.x = hull.pos.x + dx / n * standoff;
  out.z = hull.pos.z + dz / n * standoff;
  return out;
}

// ---------- the truth composer ------------------------------------------------------------
const pick = (list, seed, salt) => list[hash32(seed, salt) % list.length];
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const trimLabel = (v, max = 28) => String(v || '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, max);

const humanize = (id, max = 40) => String(id || '').replace(/^(?:manifest|cmdty|ship|faction|role)_/i, '')
  .replace(/_/g, ' ').replace(/[^ -~]/g, '').trim().toLowerCase().slice(0, max);

/** Top salvage-pool lines of a wreck: [{label, n}] — the hold as the sim actually recorded it. */
export function poolLines(pool, limit = 2) {
  if (!pool || typeof pool !== 'object') return [];
  return Object.entries(pool).filter(([, n]) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit)
    .map(([id, n]) => ({ label: humanize(id, 24), n: Math.floor(n) })).filter(r => r.label);
}

/** Read what the sim actually recorded about a wreck. Returns plain facts; never writes.
 * Two provenance shapes exist on a wreck (lossLedger's ledger shape and the aftermath marker
 * shape), so the aftermath clone is read first and `data.provenance` second. */
export function truthFacts(wreck, state, now = state?.simTime || 0) {
  const d = wreck?.data || {};
  const am = d.aftermath && typeof d.aftermath === 'object' ? d.aftermath : null;
  const prov = d.provenance && typeof d.provenance === 'object' ? d.provenance : {};
  const playerId = state?.playerId;
  const killerId = am?.killerId ?? prov.killerId ?? null;
  const isPlayerHull = !!(d.playerWreck || am?.playerWreck || prov.source === 'player_wreck');
  const byPlayer = !isPlayerHull && killerId != null && killerId === playerId;
  let killerLabel = '';
  if (killerId != null && !byPlayer) {
    const k = state?.entities?.get?.(killerId);
    killerLabel = trimLabel(k?.name || k?.data?.callsign || k?.data?.defId || '');
  }
  const ledger = prov.lossId != null || prov.kind != null;
  let cause = 'u';
  if (isPlayerHull) cause = 'y';
  else if (byPlayer) cause = 'p';
  else if (killerId != null) cause = 'o';
  else if (ledger) cause = 'l';
  const fi = am?.freightIdentity || prov.freightIdentity || null;
  const freight = trimLabel(humanize(fi && (fi.role || fi.manifestId) || prov.cargoHint || ''), 40);
  const killedAt = Number.isFinite(d.killedAt) ? d.killedAt : (Number.isFinite(am?.t) ? am.t : null);
  const wreckClass = d.wreckClass || am?.wreckClass || 'debris';
  return {
    key: String(d.markerId || am?.markerId || prov.markerId || ''), cause, killerLabel, freight,
    label: isPlayerHull ? 'Pilot hull' : trimLabel(am?.victimLabel || prov.victimLabel || d.wreckClassLabel || 'Hull'),
    wreckClass, restricted: d.parentType === 'military' || wreckClass === 'military',
    pool: poolLines(d.salvagePool),
    ageSeconds: killedAt == null ? null : Math.max(0, now - killedAt),
    isPlayerHull, byPlayer,
  };
}

/** Strike style is a SHAPE, never a color alone: 1 single line, 2 double line (the hand is known),
 * 3 broken line (cause unlogged). Accessibility: the grammar survives monochrome. */
export function markStyle(facts) {
  if (facts.cause === 'p' || facts.cause === 'y') return 2;
  if (facts.cause === 'u') return 3;
  return 1;
}

/** One flat paragraph, ≤ markTextMax chars, seeded by (run seed, marker key). Same wreck → same
 * words on every load. */
export function truthLine(facts, seedBase = 1) {
  const seed = hash32(seedBase >>> 0, facts.key || facts.label, 'rubric-truth');
  const parts = [`${facts.label}.`];
  const killer = facts.killerLabel || 'unlogged';
  if (facts.cause === 'y') {
    parts.push(facts.killerLabel ? fill(pick(T.causeYourHull, seed, 'c'), { killer }) : pick(T.causeYourHullUnnamed, seed, 'c'));
  } else if (facts.cause === 'p') parts.push(pick(T.causePlayer, seed, 'c'));
  else if (facts.cause === 'o') {
    parts.push(facts.killerLabel ? fill(pick(T.causeOther, seed, 'c'), { killer }) : pick(T.causeOtherUnnamed, seed, 'c'));
  }
  else if (facts.cause === 'l') parts.push(pick(T.causeLedger, seed, 'c'));
  else parts.push(pick(T.causeUnknown, seed, 'c'));
  if (facts.isPlayerHull) parts.push(T.holdScoured);
  else if (facts.freight) parts.push(fill(pick(T.carried, seed, 'h'), { freight: facts.freight }));
  else if (facts.pool && facts.pool.length) {
    parts.push(`Hold: ${facts.pool.map(r => `${r.label} x${r.n}`).join(', ')}.`);
  } else {
    const lean = facts.wreckClass === 'fresh' ? 'intact' : facts.wreckClass === 'military' ? 'arms'
      : facts.wreckClass === 'ancient' ? 'thin' : 'scrap';
    parts.push(T.holdLean[lean] || T.holdNone);
  }
  if (facts.ageSeconds != null) {
    const mins = Math.floor(facts.ageSeconds / 60);
    if (facts.ageSeconds >= SIM_DAY_S) parts.push(fill(pick(T.ageDays, seed, 'a'), { n: Math.floor(facts.ageSeconds / SIM_DAY_S),
      unit: Math.floor(facts.ageSeconds / SIM_DAY_S) === 1 ? 'day' : 'days' }));
    else if (mins >= 1) parts.push(fill(pick(T.ageMinutes, seed, 'a'), { n: mins }));
    else parts.push(T.ageFresh);
  }
  parts.push(facts.restricted ? T.legalRestricted : T.legalOpen);
  let text = parts.join(' ');
  if (text.length > C.markTextMax) text = parts.filter((_, i) => i !== 3).join(' ').slice(0, C.markTextMax);
  return text;
}

// ---------- target scoring ----------------------------------------------------------------
/** Higher is better. The player's own work and the player's own hull outrank everything: the
 * honest narrator marks what you did first. */
export function scoreTarget(wreck, facts, origin, held, tagged) {
  if (!wreck?.alive || !finiteXZ(wreck.pos) || tagged) return -Infinity;
  const d = distanceXZ(wreck.pos, origin);
  if (d > C.workRadius) return -Infinity;
  let s = 100 - d * 0.04;
  if (facts.isPlayerHull) s += 150;
  else if (facts.byPlayer) s += 100;
  if (held) s += 220;
  const sp = speedOf(wreck);
  // A hull running at speed is not worth a chase unless somebody already has a line on it.
  if (!held) s -= Math.min(90, Math.max(0, sp - C.stillSpeed) * 1.4);
  if (facts.ageSeconds != null) s += clamp(40 - facts.ageSeconds / 30, 0, 40);
  return s;
}

/** True when a hostile ship is inside `range` of `pos`. `isHostile` is injected (scanner's
 * isHostileToPlayer in the live system) so this module stays free of runtime imports. */
export function hostileNear(state, pos, range, isHostile) {
  for (const e of state?.entityList || []) {
    if (!e?.alive || (e.type !== 'ship' && e.type !== 'drone') || e.id === state.playerId) continue;
    if (e.data?.rubricPart) continue;
    if (!finiteXZ(e.pos) || distanceXZ(e.pos, pos) > range) continue;
    if (isHostile(e, 0, state)) return e;
  }
  return null;
}
