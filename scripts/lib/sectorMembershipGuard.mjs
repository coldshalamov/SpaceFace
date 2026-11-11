// W125/F1 — sector-membership coverage guard (shared library).
//
// entityIndex.bySectorId buckets every indexed entity under its canonical sector claim
// (homeSectorId || data.homeSectorId || data.sectorId, or null = global). Spawn literals
// index for free at append — but a POST-APPEND write to those fields silently strands the
// entity in its old bucket: sector-scoped rosters/caches then answer stale membership.
// Post-append restamps must funnel through syncEntitySectorMembership (src/core/coreSystem.js)
// immediately after the write.
//
// The guard scans simulation-owner dirs for entity-shaped receivers writing homeSectorId
// or data.homeSectorId/data.sectorId. Any file with such a site must appear in
// ALLOWED_SECTOR_RESTAMP_FILES (with its rationale) AND call the funnel somewhere —
// an allowlisted file that loses the call is flagged separately.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Live-entity receiver names. Spec/record/cache/row builders (spec, canonicalSpec,
// carrierSpec, rec, row, zone, item, marker, def, wp, gatePulse, faunaCache, r, ...)
// write the same fields on non-entity rows pre-append — they index free and are not
// receivers here. The bare `d`/`data` alternative catches `const d = e.data` aliases;
// its (?<![\w.]) head keeps `spec.data.sectorId =` spec builders from flagging.
const SECTOR_RESTAMP = /(?<![\w.])(?:e|ent|entity|a|c|actor|cargo|target)\s*\.\s*(?:data\s*\.\s*)?(?:homeSectorId|sectorId)\s*=[^=>]|(?<![\w.])(?:d|data)\s*\.\s*(?:homeSectorId|sectorId)\s*=[^=>]/;

export const SECTOR_MEMBERSHIP_SCAN_DIRS = Object.freeze([
  'src/systems',
  'src/core',
  'src/ai',
  'src/combat',
  'src/world',
]);

// Files that restamp a live entity's sector claim post-append. Every entry must also
// contain a syncEntitySectorMembership( call — the funnel that re-keys bySectorId.
export const ALLOWED_SECTOR_RESTAMP_FILES = new Map([
  ['src/systems/traffic.js', 'lane assignment, authored/durable cast adoption, helios starters'],
  ['src/systems/factionPresence.js', 'ceres tender adoption re-stamps canonical sector on live entity'],
  ['src/systems/world.js', 'kill-capture durable stamp, _stampHomeSector helper, rematerialize re-bind'],
  ['src/systems/worldSiteRuntime.js', 'site component updateExisting restamps manifest sector'],
  ['src/systems/uniqueWrecks.js', 'authored-wreck bind stamps def.sectorId on live entity'],
  ['src/systems/aftermathWrecks.js', 'adopted mining-body wreck gets marker sector post-append'],
  ['src/systems/mothlight.js', 'tender bind stamps home sector on live entity'],
  ['src/systems/palletJack.js', 'begin() stamps actor+cargo; escape restamps both to route endpoint'],
  ['src/world/asteroidField.js', 'promoted rock gets record homeSectorId post-spawn'],
  ['src/world/spillVultures.js', 'spill-vulture skiff stamps its spawn sector post-spawn, then funnels'],
  ['src/world/farActorTable.js', 'promoted far actor gets record homeSectorId post-spawn'],
  ['src/systems/npcJobsRuntime.js', 'occupational scavenger/target adoption stamps ceres sector'],
  ['src/world/worldRecords.js', 'bindEntityToRecord restamps record sector — callers funnel'],
  ['src/systems/lastArgument.js', 'siege-ark bind stamps boss home sector on live entity'],
  ['src/systems/missionSpawningOps.js', 'mission-target pin stamps home/data sector then funnels'],
  ['src/systems/scavengerOccupationSwitch.js', 'occupation-switch adoption stamps canonical home sector'],
  ['src/systems/trafficEscortOps.js', 'manifest fill only; the carrier home sector was stamped at spawn'],
  ['src/systems/faction_pitborn.js', 'normalizeClaim restamps a claim record (c), not an indexed entity'],
  ['src/systems/faction_verge.js', 'normalizeListing restamps a listing record (l), not an indexed entity'],
]);

// Files whose restamps are funneled by their CALLER, or whose write cannot change the
// canonical bucket because the indexed home sector is already stamped and synced. The
// rationale is part of the contract: a new file belongs in the allowlist only with a reason.
export const SECTOR_RESTAMP_FUNNEL_EXEMPT = new Map([
  ['src/world/worldRecords.js', 'bindEntityToRecord keeps its signature; world._rematerializeDurableActor re-keys the lane immediately after calling it'],
  ['src/systems/trafficEscortOps.js', '_assignManifest only fills data.sectorId when null; traffic spawn already stamped homeSectorId and indexed it'],
  ['src/systems/scavengerOccupationSwitch.js', 'the later data.sectorId write is descriptive; the canonical homeSectorId was stamped and synced earlier in the adoption'],
  ['src/systems/faction_pitborn.js', 'claim-record normalizer, not an indexed entity'],
  ['src/systems/faction_verge.js', 'listing-record normalizer, not an indexed entity'],
]);

/**
 * Scan relDir (relative to root) for entity-shaped sector restamps.
 * Returns [{ rel, line }].
 */
export function scanSectorRestampSites(root, relDir) {
  const out = [];
  const abs = resolve(root, relDir);
  try {
    walk(abs, (file) => {
      if (!/\.(js|mjs)$/.test(file)) return;
      const rel = relative(root, file).replace(/\\/g, '/');
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
        const code = lines[i].replace(/\/\/.*$/, '');
        if (SECTOR_RESTAMP.test(code)) out.push({ rel, line: i + 1 });
      }
    });
  } catch (err) {
    if (err && err.code === 'ENOENT') return out;
    throw err;
  }
  return out;
}

/**
 * Coverage violations across the scan dirs: a restamp file not allowlisted, or an
 * allowlisted file that no longer calls the funnel.
 * Returns [{ rel, line, reason }].
 */
export function sectorMembershipViolations(root, dirs = SECTOR_MEMBERSHIP_SCAN_DIRS) {
  const out = [];
  const hits = new Map();
  for (const dir of dirs) {
    for (const site of scanSectorRestampSites(root, dir)) {
      if (!hits.has(site.rel)) hits.set(site.rel, site);
    }
  }
  for (const site of hits.values()) {
    if (!ALLOWED_SECTOR_RESTAMP_FILES.has(site.rel)) {
      out.push({ ...site, reason: 'restamp file not in ALLOWED_SECTOR_RESTAMP_FILES' });
      continue;
    }
    const text = readFileSync(resolve(root, site.rel), 'utf8');
    if (!SECTOR_RESTAMP_FUNNEL_EXEMPT.has(site.rel)
        && !/syncEntitySectorMembership\s*\(/.test(text)) {
      out.push({ ...site, reason: 'allowlisted restamp file lost its syncEntitySectorMembership funnel' });
    }
  }
  // An allowlist row for a file that no longer restamps is stale bookkeeping.
  for (const rel of ALLOWED_SECTOR_RESTAMP_FILES.keys()) {
    if (hits.has(rel)) continue;
    try { readFileSync(resolve(root, rel), 'utf8'); }
    catch { continue; }
    out.push({ rel, line: 0, reason: 'stale allowlist row — file no longer restamps the sector claim' });
  }
  return out;
}

function walk(dir, visit) {
  for (const ent of readdirSync(dir)) {
    const abs = join(dir, ent);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, visit);
    else visit(abs);
  }
}
