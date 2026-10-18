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
  normalizeRunShareWreck,
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
import { survivalArenaById } from '../../data/survivalArenas.js';
import { SHIPS } from '../../data/ships.js';
import {
  CRUCIBLE_ARENA_ID,
  CRUCIBLE_RULESETS,
  crucibleHullSetupFor,
  crucibleSetupFor,
  crucibleStarterIdForSetup,
  normalizeCrucibleRuleset,
  normalizeSeed,
  requestCrucibleRun,
} from '../crucibleLaunch.js';

function starterKnown(starterId) {
  if (COMBAT_LAB_STARTER_PACKAGES.some((entry) => entry.id === starterId)) return true;
  // The door's bare-hull starters are legal share targets too — the code then names the hull.
  if (typeof starterId === 'string' && starterId.startsWith('hull:')) {
    return SHIPS.some((ship) => ship.id === starterId.slice(5));
  }
  return false;
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
    stake: typeof src.swarmStake === 'string' && src.swarmStake ? src.swarmStake : null,
    ...(res.wreck ? { wreck: res.wreck } : {}),
  });
}

/**
 * The door's Copy-code action as a pure step (INF-038): the pending door configuration —
 * starter, seed, arena, ruleset, mutators, challenge keys — encoded with the same envelope
 * the paste path decodes, so a copied code reproduces the intended configuration. Fails
 * closed with a reason; never a half code.
 */
export function doorRunShareCode({
  starterId, seed, arenaId, ruleset, mutators = [], dailyDateKey = null, weeklyMutatorId = null,
  stake = null,
} = {}) {
  const setup = typeof starterId === 'string' && starterId.startsWith('hull:')
    ? crucibleHullSetupFor({ hullId: starterId.slice(5), seed, arenaId, ruleset, swarmStake: stake })
    : crucibleSetupFor({ starterId, seed, arenaId, ruleset, swarmStake: stake });
  if (!setup.ok || !setup.value) {
    const reason = setup && Array.isArray(setup.issues) && setup.issues[0]
      ? setup.issues[0].message
      : 'Crucible setup invalid';
    return { ok: false, error: reason };
  }
  const code = runShareCodeForRun(
    {
      ...setup.value,
      dailyDateKey: typeof dailyDateKey === 'string' && dailyDateKey ? dailyDateKey : null,
      weeklyMutatorId: typeof weeklyMutatorId === 'string' && weeklyMutatorId ? weeklyMutatorId : null,
    },
    {
      seed: normalizeSeed(seed),
      ruleset,
      mutators: Array.isArray(mutators) ? mutators : [],
    },
  );
  if (typeof code !== 'string' || !code) return { ok: false, error: 'Code could not be written for this setup' };
  return { ok: true, code };
}

/**
 * Decode a pasted run code into the door's vocabulary. Fails closed: a code that names a starter
 * this build does not ship is unusable rather than silently different.
 */
export function applyRunShareCode(code) {
  const decoded = decodeRunShareCode(code);
  if (!decoded.ok) return { ok: false, error: 'This run code could not be read. Use a complete code from this version of the game.' };
  const fields = runShareSpecFields(decoded.spec);
  // NXB-020: a ruleset this build does not ship is a different game — the attempt is
  // not comparable. Normalizing it to the default ruleset would silently replay the
  // challenge under new rules, which is exactly what the envelope must not do.
  if (fields.ruleset && !CRUCIBLE_RULESETS.includes(fields.ruleset)) {
    return { ok: false, error: 'This run uses rules not in this version — the attempt is not comparable.' };
  }
  let starterId = fields.starterId && starterKnown(fields.starterId)
    ? fields.starterId
    : null;
  // A code written before starter ids learned 'hull:' still carries the hull it launched: the
  // bare-hull starter is re-derivable from `h` + an empty `l`.
  if (!starterId && fields.hullId && fields.loadout.length === 0
    && SHIPS.some((ship) => ship.id === fields.hullId)) {
    starterId = `hull:${fields.hullId}`;
  }
  if (!starterId) {
    return {
      ok: false,
      error: 'This starter build is not in this version.',
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
    stake: fields.stake,
    ...(fields.wreck ? { wreck: fields.wreck } : {}),
  };
}

/** The wreck rides the native New Game command beside the closed combat-lab setup schema. */
export function requestSharedCrucibleRun(bus, setup, ruleset) {
  if (setup?.wreck == null) return requestCrucibleRun(bus, setup, ruleset);
  const wreck = normalizeRunShareWreck(setup.wreck);
  if (!wreck) return false;
  return requestCrucibleRun({
    emit(event, payload) {
      return bus.emit(event, event === 'game:new' ? { ...payload, wreck } : payload);
    },
  }, setup, ruleset);
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

/* ---- the finished run as one pasteable line (INF: results Copy result) ---- */

const RAW_ID_WORD = /^[a-z0-9]+(?:[_-][a-z0-9]+)+$|[a-z][A-Z]/;
const SUMMARY_VERB_LIMIT = 4;

/** 1234 -> "1.2K", 1_200_000 -> "1.2M": a score read out loud, not a column of digits. */
function compactCount(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (n < 1000) return String(n);
  const units = [[1e3, 'K'], [1e6, 'M'], [1e9, 'B']];
  let i = n >= 1e9 ? 2 : n >= 1e6 ? 1 : 0;
  let scaled = Math.round((n / units[i][0]) * 10) / 10;
  // 999_950 rounds to 1000K: that is 1M, not a four-digit K.
  if (scaled >= 1000 && i < units.length - 1) { i += 1; scaled = Math.round((n / units[i][0]) * 10) / 10; }
  return `${scaled >= 100 ? Math.round(scaled) : scaled}${units[i][1]}`;
}

/** The arena's authored name, or '' - an id never reaches a pasted line. */
function arenaWordFor(arenaId) {
  const arena = survivalArenaById(arenaId);
  const label = arena && typeof arena.label === 'string' ? arena.label.trim() : '';
  return label && label !== arenaId && !RAW_ID_WORD.test(label) ? label : '';
}

/** The draft verbs the run took, in order, each once - authored words only. */
function pickVerbsFor(picks) {
  const seen = new Set();
  const out = [];
  for (const pick of Array.isArray(picks) ? picks : []) {
    const verb = pick && typeof pick.verb === 'string' ? pick.verb.trim() : '';
    if (!verb || RAW_ID_WORD.test(verb) || seen.has(verb.toLowerCase())) continue;
    seen.add(verb.toLowerCase());
    out.push(verb);
    if (out.length >= SUMMARY_VERB_LIMIT) break;
  }
  return out;
}

/**
 * The settled result as ONE line a player can post: where, how far, the seed, the build, and the
 * run code that reproduces it. Pure - reads only the summary survivalResults already published.
 * With no round to report the line has nothing to say beyond the code, so it IS the code (null
 * when there is neither). Never wraps: no newline, no raw ids.
 */
export function runShareSummary(result, { code = null } = {}) {
  const runCode = typeof code === 'string' && code.trim() ? code.trim() : null;
  const res = result && typeof result === 'object' ? result : null;
  const reached = res ? Math.max(Number(res.deepestWave) || 0, Number(res.wave) || 0) : 0;
  if (!res || reached < 1) return runCode;
  const swarm = res.ruleset === 'swarm';
  const parts = ['SpaceFace Crucible'];
  const arena = arenaWordFor(res.arenaId);
  if (arena) parts.push(arena);
  const score = Math.max(0, Math.floor(Number(res.score) || 0));
  const chain = Math.max(0, Math.floor(Number(res.bestChain) || 0));
  const figures = [`${swarm ? 'Round' : 'Wave'} ${reached}`];
  if (swarm && chain > 0) figures.push(`chain x${chain}`);
  if (score > 0) figures.push(`score ${compactCount(score)}`);
  parts.push(figures.join(', '));
  if (Number.isInteger(res.seed)) parts.push(`seed ${res.seed}`);
  const verbs = pickVerbsFor(res.picks);
  if (verbs.length) parts.push(`build: ${verbs.join(', ')}`);
  if (runCode) parts.push(`code ${runCode}`);
  return parts.join(' - ').replace(/\s*[\r\n]+\s*/g, ' ');
}

/**
 * Best-effort clipboard write. Resolves true only when the host accepted the text; false for no
 * clipboard, empty text, or a refusal (permissions, focus) - the caller then falls back to a
 * field the player can select. Never throws, never a service.
 */
export function copyShareText(text, clipboard = (typeof navigator !== 'undefined' ? navigator.clipboard : null)) {
  return new Promise((resolve) => {
    try {
      if (typeof text !== 'string' || !text || !clipboard || typeof clipboard.writeText !== 'function') {
        resolve(false);
        return;
      }
      Promise.resolve(clipboard.writeText(text)).then(() => resolve(true), () => resolve(false));
    } catch {
      resolve(false);
    }
  });
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
