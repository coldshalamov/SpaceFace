// Share-code glue (PQ-160.02): the door and the results sheet speak in codes and ghost blocks,
// never a service.
//
// `src/core/runShareCode.js` owns the envelope codec. This module owns the game-domain mapping:
// which fields a launched run carries, how a ghost tape becomes an `SFG1-` block, and how an
// imported block lands in the local crucible profile so the existing Ghost race offer — and the
// translucent hull presentation — pick it up unchanged.

import {
  GHOST_SHARE_PREFIX,
  decodeRunShareCode,
  decodeShareBlock,
  encodeRunShareCode,
  encodeShareBlock,
  runShareSpecFields,
} from '../../core/runShareCode.js';
import {
  canonicalGhostTape,
  ghostHash,
  lastGhostForSeed,
  lastGhostRowByHash,
  loadCrucibleMeta,
  saveCrucibleMeta,
} from '../../systems/survivalRecords.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../../data/combatLabSetups.js';
import {
  CRUCIBLE_ARENA_ID,
  crucibleStarterIdForSetup,
  normalizeCrucibleRuleset,
  normalizeSeed,
} from '../crucibleLaunch.js';

function starterKnown(starterId) {
  return COMBAT_LAB_STARTER_PACKAGES.some((entry) => entry.id === starterId);
}

/**
 * The code for a finished (or remembered) run. `setup` is a lastCrucibleSetup()-shaped launch
 * record; `result` is a survivalResults summary. Either may be missing — the code keeps whatever
 * is real. Returns null without a remembered launch — a seed-only code cannot promise the build.
 */
export function runShareCodeForRun(setup, result, { ghostHash = null } = {}) {
  const hasSetup = setup && typeof setup === 'object' && Number.isInteger(setup.seed);
  if (!hasSetup) return null;
  const src = setup;
  const res = result && typeof result === 'object' ? result : {};
  const rawSeed = Number.isInteger(res.seed) ? res.seed : src.seed;
  if (!Number.isInteger(rawSeed)) return null;
  return encodeRunShareCode({
    seed: normalizeSeed(rawSeed),
    ruleset: normalizeCrucibleRuleset(res.ruleset || src.ruleset),
    arenaId: (typeof res.arenaId === 'string' && res.arenaId)
      || (typeof src.arenaId === 'string' && src.arenaId)
      || CRUCIBLE_ARENA_ID,
    // No remembered launch means no known build — never fabricate the default starter into a code.
    starterId: hasSetup ? crucibleStarterIdForSetup(src) : null,
    hullId: typeof src.hullId === 'string' ? src.hullId : null,
    loadout: Array.isArray(src.loadout) ? src.loadout : [],
    mutators: Array.isArray(res.mutators) ? res.mutators : [],
    dailyDateKey: typeof src.dailyDateKey === 'string' ? src.dailyDateKey : null,
    weeklyMutatorId: typeof src.weeklyMutatorId === 'string' ? src.weeklyMutatorId : null,
    ghostHash: Number.isInteger(ghostHash) ? ghostHash : null,
  });
}

/**
 * Decode a pasted run code into the door's vocabulary. Fails closed: a code that names a starter
 * this build does not ship is unusable rather than silently different.
 */
export function applyRunShareCode(code) {
  const decoded = decodeRunShareCode(code);
  if (!decoded.ok) return { ok: false, error: decoded.error };
  const fields = runShareSpecFields(decoded.spec);
  const starterId = fields.starterId && starterKnown(fields.starterId)
    ? fields.starterId
    : null;
  if (!starterId) {
    return {
      ok: false,
      error: fields.starterId
        ? `starter build "${fields.starterId}" is not in this version`
        : 'code carries no starter build',
    };
  }
  return {
    ok: true,
    seed: normalizeSeed(fields.seed),
    ruleset: normalizeCrucibleRuleset(fields.ruleset),
    arenaId: fields.arenaId || CRUCIBLE_ARENA_ID,
    starterId,
    hullId: fields.hullId,
    loadout: fields.loadout,
    mutators: fields.mutators,
    dailyDateKey: fields.dailyDateKey,
    weeklyMutatorId: fields.weeklyMutatorId,
    ghostHash: fields.ghostHash,
  };
}

/* ------------------------------------------------------------------------- *
 * Ghost share blocks — the pose tape as a paste-able/file-able text block.
 * Canonicalization and the content hash stay owned by survivalRecords; this is the envelope.
 * ------------------------------------------------------------------------- */

export function ghostShareTextForTape(tape) {
  const canonical = canonicalGhostTape(tape);
  if (!canonical.frames.length) return null;
  return encodeShareBlock(GHOST_SHARE_PREFIX, {
    v: 1,
    hash: ghostHash(canonical).toString(16).padStart(8, '0'),
    tape: canonical,
  });
}

/** Decode a ghost block and verify the embedded content hash. */
export function decodeGhostShareText(text) {
  const res = decodeShareBlock(text, GHOST_SHARE_PREFIX);
  if (!res.ok) return { ok: false, error: res.error || 'invalid ghost code' };
  const payload = res.payload;
  const tape = canonicalGhostTape(payload && payload.tape);
  if (!tape.frames.length) return { ok: false, error: 'ghost code carries no frames' };
  const hash = ghostHash(tape);
  const claimed = typeof payload.hash === 'string' ? parseInt(payload.hash, 16) >>> 0 : null;
  if (claimed == null || claimed !== hash) {
    return { ok: false, error: 'ghost hash mismatch — the tape is corrupted or truncated' };
  }
  return { ok: true, tape, hash };
}

/**
 * Import a ghost block into the local crucible profile. Same row shape `migrateGhostRow`
 * produces, so the Ghost race offer and pose playback see it unchanged.
 */
export function importGhostShareText(text, storage) {
  const decoded = decodeGhostShareText(text);
  if (!decoded.ok) return decoded;
  const profile = loadCrucibleMeta(storage);
  const ghosts = profile.ghosts && typeof profile.ghosts === 'object' ? profile.ghosts : { byHash: {} };
  const byHash = ghosts.byHash && typeof ghosts.byHash === 'object' ? ghosts.byHash : {};
  const already = !!byHash[String(decoded.hash)];
  if (!already) {
    let recordedAt = null;
    try { recordedAt = new Date().toISOString(); } catch { recordedAt = null; }
    byHash[String(decoded.hash)] = {
      hash: decoded.hash,
      seed: decoded.tape.seed,
      hullId: decoded.tape.hullId,
      frameCount: decoded.tape.frames.length,
      frames: decoded.tape.frames,
      recordedAt,
    };
    profile.ghosts = { ...ghosts, byHash };
    saveCrucibleMeta(profile, storage);
  }
  return {
    ok: true,
    hash: decoded.hash,
    seed: decoded.tape.seed,
    frameCount: decoded.tape.frames.length,
    alreadyPresent: already,
  };
}

/** The share block for the machine's recorded ghost of a run — by hash, else newest for the seed. */
export function ghostShareForRun(profile, { seed = null, hash = null } = {}) {
  const src = profile && typeof profile === 'object' ? profile : null;
  if (!src) return null;
  let row = null;
  if (Number.isInteger(hash)) row = lastGhostRowByHash(src, hash);
  if (!row && Number.isInteger(seed)) row = lastGhostForSeed(src, seed);
  if (!row) {
    const ghosts = src.ghosts && src.ghosts.byHash;
    const last = ghosts && Number.isInteger(src.ghosts.lastHash)
      ? ghosts[String(src.ghosts.lastHash)]
      : null;
    row = last || null;
  }
  if (!row) return null;
  return {
    hash: Number.isInteger(row.hash) ? row.hash >>> 0 : ghostHash(row),
    seed: row.seed,
    text: ghostShareTextForTape(row),
  };
}

/* ---- file export helper: a data-URI href any Chromium host can download ---- */

/** `data:` URI for a plain-text share artifact. Null when the text cannot encode. */
export function shareTextHref(text) {
  try {
    return 'data:text/plain;charset=utf-8,' + encodeURIComponent(String(text));
  } catch {
    return null;
  }
}
