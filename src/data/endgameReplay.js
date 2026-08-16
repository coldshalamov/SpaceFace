// Plan 57 endgame challenge and deterministic-run data.
//
// This module is pure. It defines the two post-ending challenge sectors, three legendary rumors,
// bounded replay state, and stable hashes. Runtime owners still spawn encounters, grant credits,
// install cargo, and persist saves.
import { hash32 } from '../core/rng.js';

export const ENDGAME_REPLAY_SCHEMA = 'spaceface.endgameReplay.v1';
export const SEEDED_RUN_SCHEMA = 'spaceface.seededRun.v1';
export const SEEDED_LEADERBOARD_KEY = 'sf.seededRuns.v1';
export const SEEDED_LEADERBOARD_LIMIT = 10;
export const SEEDED_SPAWN_TOKEN_LIMIT = 96;

export const CAPSTONE_REWARD = Object.freeze({
  id: 'personal_capstone_lattice',
  cargoId: 'cmdty_personal_capstone_lattice',
  name: 'CAPSTONE LATTICE',
  credits: 18_000,
});

const CHALLENGE_SECTORS = Object.freeze([
  Object.freeze({
    id: 'challenge_ashfall_gauntlet',
    sectorId: 'sector_ashfall_reach',
    sectorName: 'Ashfall Reach',
    title: 'Ashfall Gauntlet',
    hazardLine: 'radiation and debris crossfire',
    recipes: Object.freeze([
      Object.freeze({ id: 'static-carrier', specialist: 'specialist_jammer_wing', elite: 'heavy_carrier_lite_screen', label: 'Jammer ridge / Carrier screen' }),
      Object.freeze({ id: 'anchor-gunship', specialist: 'field_anchor_controller', elite: 'heavy_gunship_turret_boat', label: 'Anchor controller / Turret boat' }),
      Object.freeze({ id: 'tender-carrier', specialist: 'specialist_repair_tender', elite: 'heavy_carrier_lite_screen', label: 'Repair tender / Carrier screen' }),
    ]),
  }),
  Object.freeze({
    id: 'challenge_phoebe_crucible',
    sectorId: 'sector_phoebe_echo',
    sectorName: 'Phoebe Echo',
    title: 'Phoebe Crucible',
    hazardLine: 'radiation and debris convergence',
    recipes: Object.freeze([
      Object.freeze({ id: 'harrier-carrier', specialist: 'specialist_harrier_kite', elite: 'heavy_carrier_lite_screen', label: 'Harrier long turn / Carrier screen' }),
      Object.freeze({ id: 'tender-gunship', specialist: 'specialist_repair_tender', elite: 'heavy_gunship_turret_boat', label: 'Repair tender / Turret boat' }),
      Object.freeze({ id: 'jammer-anchor', specialist: 'specialist_jammer_wing', elite: 'field_anchor_controller', label: 'Jammer ridge / Anchor controller' }),
    ]),
  }),
]);

export const ENDGAME_CHALLENGE_SECTORS = CHALLENGE_SECTORS;
export const ENDGAME_CHALLENGE_BY_SECTOR = new Map(CHALLENGE_SECTORS.map((entry) => [entry.sectorId, entry]));

export const LEGENDARY_HUNTS = Object.freeze([
  Object.freeze({
    id: 'legendary_capital_hulk',
    title: 'The Gun That Forgot the War',
    targetName: 'pre-cataclysm capital hulk',
    sectorId: 'sector_sedna_dark',
    sectorName: 'Sedna Dark',
    shapeId: 'legendary_capital_hulk',
    rumor: 'A pre-cataclysm capital hulk is cold on every band except its fire-control spine. It still shoots.',
  }),
  Object.freeze({
    id: 'legendary_ace_crew',
    title: 'Two Names on One Burn',
    targetName: 'ace crews rendezvous',
    sectorId: 'sector_orcus_shadow',
    sectorName: 'Orcus Shadow',
    shapeId: 'rare_aces_rendezvous',
    rumor: 'Two named ace crews are trading hardware inside the Orcus interference. Interrupting the exchange means fighting both crews.',
  }),
  Object.freeze({
    id: 'legendary_gold_wings',
    title: 'Three Wings, One Gold Core',
    targetName: 'gold asteroid claim war',
    sectorId: 'sector_haumea_rift',
    sectorName: 'Haumea Rift',
    shapeId: 'rare_gold_asteroid',
    rumor: 'A gold asteroid assay reached three pirate wings at once. The core is real; so are all three claim formations.',
  }),
]);

export function challengeRecipeFor(seed, sectorId, roll = 0, eliteComposition = true) {
  const challenge = ENDGAME_CHALLENGE_BY_SECTOR.get(sectorId);
  if (!challenge) return null;
  const index = hash32(Number(seed) >>> 0, challenge.id, Math.max(0, Math.floor(Number(roll) || 0)), 'challenge-recipe')
    % challenge.recipes.length;
  const recipe = challenge.recipes[index];
  return Object.freeze({
    challengeId: challenge.id,
    sectorId: challenge.sectorId,
    sectorName: challenge.sectorName,
    title: challenge.title,
    hazardLine: challenge.hazardLine,
    roll: Math.max(0, Math.floor(Number(roll) || 0)),
    recipeId: recipe.id,
    label: recipe.label,
    shapeIds: eliteComposition ? Object.freeze([recipe.specialist, recipe.elite]) : Object.freeze([recipe.specialist]),
    eliteComposition: eliteComposition !== false,
  });
}

export function stableReplayHash(seed, ...parts) {
  return hash32(Number(seed) >>> 0, ...parts.map(stablePart)).toString(16).padStart(8, '0');
}

export function initialWorldHash(seed, eliteComposition = true) {
  const challengeRecipes = CHALLENGE_SECTORS.map((entry) => {
    const recipe = challengeRecipeFor(seed, entry.sectorId, 0, eliteComposition);
    return `${entry.sectorId}:${recipe && recipe.recipeId}`;
  });
  const huntRoutes = LEGENDARY_HUNTS.map((hunt) => `${hunt.id}:${hunt.sectorId}:${hunt.shapeId}`);
  return stableReplayHash(seed, 'world', eliteComposition !== false ? 'elite' : 'flat', challengeRecipes, huntRoutes);
}

export function spawnHashFor(seed, worldHash, tokens = []) {
  const bounded = normalizeSpawnTokens(tokens);
  return stableReplayHash(seed, 'spawn', worldHash, bounded);
}

export function freshEndgameReplayState(seed, options = {}) {
  const eliteComposition = options.eliteComposition !== false;
  const challenges = {};
  for (const entry of CHALLENGE_SECTORS) {
    const recipe = challengeRecipeFor(seed, entry.sectorId, 0, eliteComposition);
    challenges[entry.sectorId] = {
      challengeId: entry.id,
      roll: 0,
      status: 'locked',
      recipeId: recipe.recipeId,
      pendingEncounterIds: [],
      completedEncounterIds: [],
      completions: 0,
      rewardCount: 0,
    };
  }
  const hunts = Object.fromEntries(LEGENDARY_HUNTS.map((hunt) => [hunt.id, {
    status: 'locked',
    encounterId: null,
    outcome: null,
  }]));
  return {
    schema: ENDGAME_REPLAY_SCHEMA,
    active: false,
    eliteComposition,
    challenges,
    hunts,
    seededRun: freshSeededRunState(seed, options.seededRun === true, eliteComposition),
  };
}

export function freshSeededRunState(seed, enabled = false, eliteComposition = true) {
  const normalizedSeed = (Number(seed) >>> 0) || 1;
  const worldHash = initialWorldHash(normalizedSeed, eliteComposition);
  return {
    schema: SEEDED_RUN_SCHEMA,
    enabled: enabled === true,
    seed: normalizedSeed,
    eliteComposition: eliteComposition !== false,
    score: 0,
    chains: 0,
    spawnTokens: [],
    worldHash,
    spawnHash: spawnHashFor(normalizedSeed, worldHash, []),
    finalized: false,
    outcome: null,
  };
}

export function normalizeEndgameReplayState(input, seed, options = {}) {
  const fresh = freshEndgameReplayState(seed, options);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fresh;
  fresh.active = input.active === true;
  fresh.eliteComposition = input.eliteComposition !== false;
  for (const entry of CHALLENGE_SECTORS) {
    const source = input.challenges && input.challenges[entry.sectorId];
    if (!source || typeof source !== 'object') continue;
    const roll = clampInt(source.roll, 0, 9999);
    const recipe = challengeRecipeFor(seed, entry.sectorId, roll, fresh.eliteComposition);
    fresh.challenges[entry.sectorId] = {
      challengeId: entry.id,
      roll,
      status: ['locked', 'ready', 'active', 'completed'].includes(source.status) ? source.status : 'locked',
      recipeId: recipe.recipeId,
      pendingEncounterIds: cleanIds(source.pendingEncounterIds, 4),
      completedEncounterIds: cleanIds(source.completedEncounterIds, 8),
      completions: clampInt(source.completions, 0, 9999),
      rewardCount: clampInt(source.rewardCount, 0, 9999),
    };
  }
  for (const hunt of LEGENDARY_HUNTS) {
    const source = input.hunts && input.hunts[hunt.id];
    if (!source || typeof source !== 'object') continue;
    fresh.hunts[hunt.id] = {
      status: ['locked', 'rumored', 'active', 'completed'].includes(source.status) ? source.status : 'locked',
      encounterId: clean(source.encounterId) || null,
      outcome: clean(source.outcome) || null,
    };
  }
  fresh.seededRun = normalizeSeededRunState(input.seededRun, seed, fresh.eliteComposition);
  return fresh;
}

export function normalizeSeededRunState(input, seed, eliteComposition = true) {
  const fresh = freshSeededRunState(seed, input && input.enabled === true, eliteComposition);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fresh;
  const tokens = normalizeSpawnTokens(input.spawnTokens);
  fresh.score = clampInt(input.score, 0, 999_999_999);
  fresh.chains = clampInt(input.chains, 0, 999_999);
  fresh.spawnTokens = tokens;
  fresh.worldHash = initialWorldHash(fresh.seed, fresh.eliteComposition);
  fresh.spawnHash = spawnHashFor(fresh.seed, fresh.worldHash, tokens);
  fresh.finalized = input.finalized === true;
  fresh.outcome = clean(input.outcome) || null;
  return fresh;
}

export function appendSeededSpawnToken(run, token) {
  if (!run || run.enabled !== true || run.finalized === true) return run;
  const normalized = clean(token);
  if (!normalized) return run;
  run.spawnTokens = normalizeSpawnTokens([...(run.spawnTokens || []), normalized]);
  run.spawnHash = spawnHashFor(run.seed, run.worldHash, run.spawnTokens);
  return run;
}

export function readSeededLeaderboard(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function') return [];
  let parsed;
  try { parsed = JSON.parse(storage.getItem(SEEDED_LEADERBOARD_KEY) || '[]'); } catch (_) { return []; }
  return normalizeLeaderboard(parsed);
}

export function commitSeededLeaderboard(run, storage = globalThis.localStorage) {
  if (!run || run.enabled !== true || !run.worldHash || !run.spawnHash) return [];
  const record = {
    seed: (Number(run.seed) >>> 0) || 1,
    worldHash: clean(run.worldHash),
    spawnHash: clean(run.spawnHash),
    score: clampInt(run.score, 0, 999_999_999),
    chains: clampInt(run.chains, 0, 999_999),
    outcome: clean(run.outcome) || 'complete',
  };
  const prior = readSeededLeaderboard(storage);
  const fingerprint = leaderboardFingerprint(record);
  const withoutSame = prior.filter((entry) => leaderboardFingerprint(entry) !== fingerprint);
  const next = normalizeLeaderboard([...withoutSame, record]);
  if (storage && typeof storage.setItem === 'function') {
    try { storage.setItem(SEEDED_LEADERBOARD_KEY, JSON.stringify(next)); } catch (_) { /* optional profile surface */ }
  }
  return next;
}

function normalizeLeaderboard(input) {
  const rows = [];
  for (const row of Array.isArray(input) ? input : []) {
    if (!row || typeof row !== 'object') continue;
    const worldHash = clean(row.worldHash);
    const spawnHash = clean(row.spawnHash);
    if (!worldHash || !spawnHash) continue;
    rows.push({
      seed: (Number(row.seed) >>> 0) || 1,
      worldHash,
      spawnHash,
      score: clampInt(row.score, 0, 999_999_999),
      chains: clampInt(row.chains, 0, 999_999),
      outcome: clean(row.outcome) || 'complete',
    });
  }
  rows.sort((a, b) => b.score - a.score || b.chains - a.chains || a.seed - b.seed
    || a.worldHash.localeCompare(b.worldHash) || a.spawnHash.localeCompare(b.spawnHash));
  return rows.slice(0, SEEDED_LEADERBOARD_LIMIT);
}

function leaderboardFingerprint(row) {
  return `${row.seed}:${row.worldHash}:${row.spawnHash}:${row.outcome}`;
}

function normalizeSpawnTokens(tokens) {
  return cleanIds(tokens, SEEDED_SPAWN_TOKEN_LIMIT);
}

function cleanIds(values, limit) {
  return (Array.isArray(values) ? values : []).map(clean).filter(Boolean).slice(-limit);
}

function stablePart(value) {
  if (Array.isArray(value)) return `[${value.map(stablePart).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${key}:${stablePart(value[key])}`).join(',')}}`;
  }
  return String(value == null ? '' : value);
}

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, 240);
}

function clampInt(value, min, max) {
  const n = Math.floor(Number(value));
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}
