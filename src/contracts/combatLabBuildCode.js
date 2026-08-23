// Combat Lab build code v0 — compact, checksummed, content-bound encoding of
// spaceface.combatLabSetup.v1.
//
// Format (hyphens are grouping only; decode strips whitespace and hyphens, then
// uppercases). After stripping, the wire is:
//
//   SFCR  +  version  +  contentDigest  +  payload  +  checksum
//   ^^^^     1 char      7 chars base36    variable    7 chars base36
//
// Version 1 prefix is therefore the five characters "SFCR1".
//
// contentDigest is FNV-1a (uint32, base36, 7-char padded) over a canonical
// string of every hull, weapon/module, enemy, enemy-package (with entries),
// and arena the Lab can reference. It is a pure function of content, never of
// the clock or the environment.
//
// payload is built from combatLabSetupDigestInput(setup) (schema implied by
// SFCR1, not carried as mixed-case text):
//   loadoutCount * hullId * slot * defId * … * enemyPackageId * arenaId * seed * wave
// joined with "*" and uppercased. loadoutCount is the number of slot/def pairs
// so extra/missing fields cannot be silently shifted into another column.
//
// Catalog ids reachable by a build code MUST match ^[a-z0-9_]+$. The wire is
// case-folded (encode uppercases, decode lowercases) and * is the field
// separator, so any other character class would be unencodable or round-trip
// to a different id. tokenSafe enforces that class at encode time.
//
// checksum is FNV-1a (uint32, base36, 7-char padded) over the payload string.
//
// Worked example — energy_baseline / physics_swarm / helios_core / seed 1 / wave 1:
//   SFCR1-0QYZ-CFO1-*SHI-P_KE-STRE-L*0*-WPN_-PULS-E_LA-SER_-S*PH-YSIC-S_SW-ARM*-HELI-OS_C-ORE*-1*10-7VN1-XO
// The digest segment moves whenever the Lab catalogs change — adding the Lagrange Crucible and
// Cinder Sluice arenas took it from 0U3BLV9 to 0GWHFVV, then Cryo Drift and Storm Lattice to
// 0QYZCFO, and every code minted before the current value now
// rejects with a contentDigest mismatch. That is the mechanism working, not a bug to route
// around: a code that no longer describes a reproducible setup must not silently load one.
// Readable summary:
//   Hitch ship_kestrel · Physics Swarm physics_swarm · Helios Core helios_core · seed 1 · wave 1

import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { MODULES } from '../data/modules.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import {
  COMBAT_LAB_ENEMY_PACKAGES,
  COMBAT_LAB_ARENAS,
} from '../data/combatLabSetups.js';
import {
  COMBAT_LAB_SETUP_SCHEMA,
  validateCombatLabSetup,
  normalizeCombatLabSetup,
  combatLabSetupDigestInput,
} from './combatLabSetupSchema.js';

export const COMBAT_LAB_BUILD_CODE_VERSION = 1;

const PREFIX = 'SFCR';
const DIGEST_WIDTH = 7;
const CHECKSUM_WIDTH = 7;
const FIELD_SEP = '*';
const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const ENEMY_PACKAGE_BY_ID = new Map(COMBAT_LAB_ENEMY_PACKAGES.map((pkg) => [pkg.id, pkg]));
const ARENA_BY_ID = new Map(COMBAT_LAB_ARENAS.map((arena) => [arena.id, arena]));

function fnv1aU32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function base36u32(n, width) {
  return (n >>> 0).toString(36).toUpperCase().padStart(width, '0');
}

function issue(path, message) {
  return { path, message };
}

function fail(path, message) {
  return { ok: false, value: null, issues: [issue(path, message)] };
}

function catalogContentSource() {
  const hulls = SHIPS.map((ship) => ship.id).slice().sort();
  const defs = [...WEAPONS, ...MODULES].map((def) => def.id).slice().sort();
  const enemies = ENEMY_TYPES.map((enemy) => enemy.id).slice().sort();
  const packages = COMBAT_LAB_ENEMY_PACKAGES.map((pkg) => {
    const entries = (pkg.entries || [])
      .map((entry) => `${entry.enemyId}:${entry.count}:${entry.level}`)
      .join(',');
    return `${pkg.id}:${entries}:${pkg.maxConcurrent}:${pkg.spawnDistance}`;
  }).sort();
  const arenas = COMBAT_LAB_ARENAS.map((arena) => (
    `${arena.id}:${arena.sectorId}:${arena.spawnPos && arena.spawnPos.x}:${arena.spawnPos && arena.spawnPos.z}`
  )).sort();
  return [
    'h', hulls.join(','),
    'd', defs.join(','),
    'e', enemies.join(','),
    'p', packages.join(';'),
    'a', arenas.join(';'),
  ].join('|');
}

const CONTENT_DIGEST = base36u32(fnv1aU32(catalogContentSource()), DIGEST_WIDTH);
const VERSION_TAG = PREFIX + String(COMBAT_LAB_BUILD_CODE_VERSION);

function groupCode(raw) {
  const prefix = raw.slice(0, VERSION_TAG.length);
  const rest = raw.slice(VERSION_TAG.length);
  const parts = [prefix];
  for (let i = 0; i < rest.length; i += 4) parts.push(rest.slice(i, i + 4));
  return parts.join('-');
}

// Must stay identical to the catalog-id invariant above: ^[a-z0-9_]+$
const TOKEN_PATTERN = /^[a-z0-9_]+$/;

function tokenSafe(value) {
  return TOKEN_PATTERN.test(String(value));
}

function payloadFromDigestParts(parts) {
  if (!Array.isArray(parts) || parts.length < 6) return null;
  if (parts[0] !== COMBAT_LAB_SETUP_SCHEMA) return null;
  const hullId = parts[1];
  const tail = parts.slice(-4);
  const middle = parts.slice(2, -4);
  if (middle.length % 2 !== 0) return null;
  const tokens = [String(middle.length / 2), hullId, ...middle, ...tail];
  for (let i = 0; i < tokens.length; i++) {
    if (!tokenSafe(tokens[i])) return null;
  }
  return tokens.join(FIELD_SEP).toUpperCase();
}

function parseUnsigned(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch < 48 || ch > 57) return null;
  }
  const value = Number(text);
  if (!Number.isInteger(value)) return null;
  return value;
}

function parsePayload(payload) {
  if (typeof payload !== 'string' || payload.length === 0) {
    return fail('payload', 'payload is missing');
  }
  const tokens = payload.split(FIELD_SEP);
  if (tokens.length < 6) {
    return fail('payload', 'code is truncated');
  }
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i]) return fail('payload', 'unexpected extra or missing payload fields');
  }
  const loadoutCount = parseUnsigned(tokens[0]);
  if (loadoutCount == null || loadoutCount < 0) {
    return fail('payload', 'unexpected extra or missing payload fields');
  }
  const expected = 6 + loadoutCount * 2;
  if (tokens.length !== expected) {
    return fail('payload', 'unexpected extra or missing payload fields');
  }
  const hullId = tokens[1].toLowerCase();
  const loadout = [];
  for (let i = 0; i < loadoutCount; i++) {
    const slotToken = tokens[2 + i * 2];
    const defToken = tokens[3 + i * 2];
    const slotIndex = parseUnsigned(slotToken);
    if (slotIndex == null) {
      return fail('payload', 'unexpected extra or missing payload fields');
    }
    loadout.push({ slotIndex, defId: defToken.toLowerCase() });
  }
  const enemyPackageId = tokens[2 + loadoutCount * 2].toLowerCase();
  const arenaId = tokens[3 + loadoutCount * 2].toLowerCase();
  const seedToken = tokens[4 + loadoutCount * 2];
  const waveToken = tokens[5 + loadoutCount * 2];
  const seed = parseUnsigned(seedToken);
  const wave = parseUnsigned(waveToken);
  return {
    ok: true,
    value: {
      schema: COMBAT_LAB_SETUP_SCHEMA,
      hullId,
      loadout,
      enemyPackageId,
      arenaId,
      seed: seed == null ? seedToken : seed,
      wave: wave == null ? waveToken : wave,
    },
    issues: [],
  };
}

/**
 * Encode a Combat Lab setup as a compact, checksummed build code.
 *
 * Returns a grouped uppercase string, or null ONLY when `setup` fails
 * `validateCombatLabSetup`. A schema-valid setup is always encodable; if the
 * codec still cannot build a payload, this throws (codec bug) instead of
 * returning a silent null.
 */
export function encodeCombatLabBuildCode(setup) {
  const checked = validateCombatLabSetup(setup);
  if (!checked.ok) return null;
  const payload = payloadFromDigestParts(combatLabSetupDigestInput(checked.value));
  if (payload == null) {
    throw new Error(
      'combatLabBuildCode: schema-valid setup failed to encode (codec bug); '
      + 'a payload token was empty or not ^[a-z0-9_]+$',
    );
  }
  const checksum = base36u32(fnv1aU32(payload), CHECKSUM_WIDTH);
  return groupCode(VERSION_TAG + CONTENT_DIGEST + payload + checksum);
}

export function decodeCombatLabBuildCode(code) {
  try {
    if (typeof code !== 'string') {
      return fail('code', 'code must be a string');
    }
    if (code.length === 0) {
      return fail('code', 'code is empty');
    }
    const raw = code.replace(/[\s-]/g, '').toUpperCase();
    if (raw.length === 0) {
      return fail('code', 'code is whitespace only');
    }
    if (raw.length < VERSION_TAG.length + DIGEST_WIDTH + CHECKSUM_WIDTH) {
      return fail('code', 'code is truncated');
    }
    if (raw.slice(0, PREFIX.length) !== PREFIX) {
      return fail('code', 'wrong prefix');
    }
    const versionChar = raw.slice(PREFIX.length, VERSION_TAG.length);
    if (versionChar !== String(COMBAT_LAB_BUILD_CODE_VERSION)) {
      return fail('code', 'unsupported build-code version');
    }
    const digest = raw.slice(VERSION_TAG.length, VERSION_TAG.length + DIGEST_WIDTH);
    const checksum = raw.slice(-CHECKSUM_WIDTH);
    const payload = raw.slice(VERSION_TAG.length + DIGEST_WIDTH, raw.length - CHECKSUM_WIDTH);
    if (payload.length === 0) {
      return fail('code', 'code is truncated');
    }
    const expectedChecksum = base36u32(fnv1aU32(payload), CHECKSUM_WIDTH);
    if (checksum !== expectedChecksum) {
      return fail('checksum', 'checksum mismatch');
    }
    if (digest !== CONTENT_DIGEST) {
      return fail('contentDigest', 'content digest does not match current Lab catalogs');
    }
    const parsed = parsePayload(payload);
    if (!parsed.ok) return parsed;
    const checked = validateCombatLabSetup(parsed.value);
    if (!checked.ok) {
      return { ok: false, value: null, issues: checked.issues };
    }
    return { ok: true, value: checked.value, issues: [] };
  } catch (err) {
    return fail('', String(err && err.message ? err.message : err));
  }
}

export function describeCombatLabBuildCode(setup) {
  const value = normalizeCombatLabSetup(setup);
  const hull = SHIP_BY_ID.get(value.hullId);
  const hullName = hull && hull.name ? hull.name : value.hullId;
  const enemy = ENEMY_PACKAGE_BY_ID.get(value.enemyPackageId);
  const enemyName = enemy && enemy.label ? enemy.label : value.enemyPackageId;
  const arena = ARENA_BY_ID.get(value.arenaId);
  const arenaName = arena && arena.label ? arena.label : value.arenaId;
  const summary = `${hullName} ${value.hullId} · ${enemyName} ${value.enemyPackageId} · ${arenaName} ${value.arenaId} · seed ${value.seed} · wave ${value.wave}`;
  if (summary.length <= 120) return summary;
  return `${value.hullId} · ${value.enemyPackageId} · ${value.arenaId} · seed ${value.seed} · wave ${value.wave}`;
}
