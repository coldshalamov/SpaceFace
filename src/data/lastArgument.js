// The Last Argument. Authored constants and deterministic occurrence policy; no runtime imports.
export const LAST_ARGUMENT = Object.freeze({
  enemyId: 'last_argument', scoreId: 'capital_boss_last_argument',
  encounterId: 'last_argument_passage', fightPrefix: 'last-argument:',
  assetId: 'SF_SHIP_LAST_ARGUMENT', file: 'wholeships/last_argument.glb',
  radius: 190, mass: 18000, hull: 3600, shield: 450,
  maxSpeed: 28, accel: 4.2, maxYawRate: 0.105,
  earliestSeconds: 1200, firstDelayMin: 120, firstDelaySpan: 240,
  cooldownMin: 1800, cooldownSpan: 600, retrySeconds: 12,
  encounterSeconds: 420, retreatWarningSeconds: 15,
  engageRadius: 1200, suspendRadius: 1600, placementRadius: 1050,
  stationClearance: 850, bodyClearance: 48,
  sectors: Object.freeze(['sector_sker_haven', 'sector_charon_expanse', 'sector_ashfall_reach']),
});

// Separate hash stream: adding the encounter cannot reshuffle mining, traffic or wave RNG.
export function lastArgumentHash(seed, ordinal = 0, salt = '') {
  let h = (Number(seed) >>> 0) ^ Math.imul((ordinal >>> 0) + 1, 0x9e3779b1);
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b); return (h ^ (h >>> 16)) >>> 0;
}
export function firstLastArgumentAt(seed) {
  return LAST_ARGUMENT.earliestSeconds + LAST_ARGUMENT.firstDelayMin
    + lastArgumentHash(seed, 0, 'first') % (LAST_ARGUMENT.firstDelaySpan + 1);
}
export function lastArgumentCooldown(seed, ordinal) {
  return LAST_ARGUMENT.cooldownMin + lastArgumentHash(seed, ordinal, 'cooldown')
    % (LAST_ARGUMENT.cooldownSpan + 1);
}
export function freshLastArgumentState(seed = 1) {
  return { version: 1, ordinal: 0, nextAt: firstLastArgumentAt(seed), active: null,
    lastOutcome: null, sightings: 0, defeats: 0 };
}
const finite = (n, fallback = 0) => Number.isFinite(n) && n >= 0 ? n : fallback;
export function normalizeLastArgumentState(raw, seed = 1) {
  const clean = freshLastArgumentState(seed);
  if (!raw || raw.version !== 1) return clean;
  clean.ordinal = Math.min(1000000, Math.floor(finite(raw.ordinal)));
  clean.nextAt = Math.max(LAST_ARGUMENT.earliestSeconds, finite(raw.nextAt, clean.nextAt));
  clean.sightings = Math.min(1000000, Math.floor(finite(raw.sightings)));
  clean.defeats = Math.min(clean.sightings, Math.floor(finite(raw.defeats)));
  clean.lastOutcome = ['destroyed', 'departed', 'escaped', 'aborted'].includes(raw.lastOutcome) ? raw.lastOutcome : null;
  const a = raw.active;
  if (a && typeof a.key === 'string' && /^last-argument:[a-zA-Z0-9:.-]{1,100}$/.test(a.key)
      && LAST_ARGUMENT.sectors.includes(a.sectorId) && Number.isFinite(a.startedAt) && a.startedAt >= 0) {
    clean.active = { key: a.key, sectorId: a.sectorId, startedAt: a.startedAt,
      deadlineAt: a.startedAt + LAST_ARGUMENT.encounterSeconds,
      warningSent: a.warningSent === true, killed: a.killed === true,
      bossId: typeof a.bossId === 'number' || typeof a.bossId === 'string' ? a.bossId : null };
  }
  return clean;
}
export function lastArgumentEligibility(own, observation) {
  if (!observation || !Number.isFinite(observation.now)) return 'invalid-clock';
  if (own.active) return 'already-active';
  if (observation.now < own.nextAt) return 'cooldown';
  if (!observation.alive || !observation.flight || observation.docked || observation.survival) return 'not-in-flight';
  if (!LAST_ARGUMENT.sectors.includes(observation.sectorId)) return 'wrong-sector';
  if (observation.otherCapital) return 'capital-occupied';
  return null;
}
export function commitLastArgumentArrival(own, seed, now, sectorId, bossId) {
  if (own.active || !Number.isFinite(now) || now < own.nextAt || !LAST_ARGUMENT.sectors.includes(sectorId)) return null;
  const ordinal = own.ordinal + 1;
  const key = `${LAST_ARGUMENT.fightPrefix}${Number(seed) >>> 0}:${ordinal}`;
  own.ordinal = ordinal; own.sightings++;
  own.active = { key, sectorId, bossId, startedAt: now,
    deadlineAt: now + LAST_ARGUMENT.encounterSeconds, warningSent: false, killed: false };
  // Admission, not a request or death, consumes the occurrence. Reload cannot reroll it.
  own.nextAt = now + lastArgumentCooldown(seed, ordinal);
  return own.active;
}
export function settleLastArgument(own, key, outcome) {
  if (!own.active || own.active.key !== key) return false;
  const killed = own.active.killed === true;
  own.lastOutcome = killed ? 'destroyed' : (['departed', 'escaped', 'aborted'].includes(outcome) ? outcome : 'escaped');
  if (killed) own.defeats++;
  own.active = null;
  return true;
}

export const LAST_ARGUMENT_ENEMY = Object.freeze({
  id: LAST_ARGUMENT.enemyId, name: 'The Last Argument', shipId: 'ship_leviathan',
  silhouette: 'last_argument', factionId: 'faction_reach', aiArchetype: 'miniboss_capital',
  combatDoctrineId: 'capital_broadside', levelRange: [1, 1],
  hull: LAST_ARGUMENT.hull, armor: 340, armorFlat: 2,
  shield: LAST_ARGUMENT.shield, shieldRegen: 0, shieldRegenCapable: false,
  cap: 600, capRegen: 0, maxSpeed: LAST_ARGUMENT.maxSpeed,
  accel: LAST_ARGUMENT.accel, turnRate: LAST_ARGUMENT.maxYawRate,
  collisionRadius: LAST_ARGUMENT.radius, mass: LAST_ARGUMENT.mass,
  // The score owns every attack. A fallback fighter gun must never leak through the intro.
  weapons: [], rareSpecialist: true, physicalClass: 'terrain', shipClass: 'capital',
  aiDoctrine: { defaultActivity: 'attack_run', roe: 'weapons_free', preferredRange: 620, leashRadius: 1700 },
  directionalArmor: { frontArcDeg: 82, frontMult: 0.65, rearArcDeg: 76, rearMult: 1.45 },
  bountyCr: 4200,
  telegraph: { bark: 'warn', cue: 'broadside_charge',
    line: 'SIEGE ARK. The side batteries commit. Break their housings; cross the bow before the spine fires.' },
  counterHint: 'break_flank_banks_cross_locked_spine_use_cover',
  behavior: 'rare slow siege ark; alternating destructible flank batteries, committed spine cannon, exposed stern and finite departure',
  loot: { creditsRange: [900, 1500], drops: [
    { id: 'cmdty_alloys', chance: 1, qtyRange: [8, 14] },
    { id: 'cmdty_electronics', chance: 0.8, qtyRange: [3, 6] },
  ] },
});
