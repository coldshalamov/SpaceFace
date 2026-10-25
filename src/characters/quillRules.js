// src/characters/quillRules.js — pure rules for QUILL / AR-3 (row 506 / 03 §4.3).
// No state, no bus, no Math.random. The adapter censuses the rim each calendar
// pass; these answer: is this wreck a log worth copying, and is it settled inside
// the read ring.

import { QUILL } from '../data/quill.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** Is this a log the drone will copy: a wreck body whose manifest a scanner has
 *  resolved (data.scanRevealed, or the law's wreck-provenance markerId), parked
 *  settled inside the read ring, and never before copied — the quillCopied stamp
 *  rides the hull, so one wreck is one page no matter whose drone reads it or
 *  how many sectors it crosses between copies. QUILL's own machinery, dead
 *  bodies, and non-wreck types never count. */
export function quillCopyable(entity, post = QUILL.post, readRadius = QUILL.readRadius) {
  if (!entity || entity.alive === false) return false;
  if (entity.type !== 'wreck') return false;
  const d = entity.data || {};
  if (d.quill === true || d.quillCopied === true) return false;
  const logged = d.scanRevealed || d.markerId || (d.provenance && d.provenance.markerId);
  if (!logged) return false;
  if (!finiteXZ(entity.pos) || !finiteXZ(post)) return false;
  const speed = finiteXZ(entity.vel) ? Math.hypot(entity.vel.x, entity.vel.z) : 0;
  if (speed > QUILL.readSpeed) return false;
  return Math.hypot(entity.pos.x - post.x, entity.pos.z - post.z) <= readRadius;
}

/** The sealed page index a copy count opens next — pages come out in order and
 *  the Archive runs out after the last. -1 when every page is already open. */
export function quillNextSecret(copiedCount, secrets = QUILL.secrets) {
  const i = Math.floor(Number(copiedCount));
  return Number.isInteger(i) && i >= 0 && i < secrets.length ? i : -1;
}

/** The page text at an index, or null past the end. */
export function quillSecretAt(index, secrets = QUILL.secrets) {
  const i = Math.floor(Number(index));
  return Number.isInteger(i) && i >= 0 && i < secrets.length ? secrets[i] : null;
}

/** Station-keeping: the drone holds its drift by the tithe; pushed off, it walks
 *  home through the impulse membrane — a delta-v for the caller to queue as
 *  mass·dv, never a vel write (same membrane the lamplighter and bouncer ride). */
export function quillDriftHome(entity, post = QUILL.post, leash = QUILL.leashRadius, speed = QUILL.driftSpeed) {
  if (!finiteXZ(entity?.pos) || !finiteXZ(post)) return null;
  const vx = finiteXZ(entity.vel) ? entity.vel.x : 0;
  const vz = finiteXZ(entity.vel) ? entity.vel.z : 0;
  const dx = post.x - entity.pos.x, dz = post.z - entity.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > leash) return { x: (dx / d) * speed - vx, z: (dz / d) * speed - vz };
  if (d < leash * 0.5 && (vx !== 0 || vz !== 0)) return { x: -vx, z: -vz };
  return null;
}
