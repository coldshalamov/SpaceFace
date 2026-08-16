// Victim-scaled hostile kill burst recipes (Arcade Core AC-01).
//
// Pure data + pure helpers. Runtime owners:
//   lootShards — rolls the burst on a player-earned hostile kill
//   mining     — materializes pickups and settles credit chips
//   visualFactory — distinct 3D credit-chip object
//
// Materials come from hull class / identity / cargo only. Kill style is ignored here
// on purpose: AC-08 will multiply credits/RP later, never materials.

export const CREDIT_CHIP_KIND = 'credit_chip';

/** Fraction of victim world velocity inherited by each erupted pickup. */
export const KILL_BURST_VEL_INHERIT = 0.4;
export const KILL_BURST_EJECT_SPEED_MIN = 16;
export const KILL_BURST_EJECT_SPEED_MAX = 38;

export const KILL_REWARD_TIER_IDS = Object.freeze(['light', 'medium', 'heavy', 'ace']);

const KILL_RESEARCH_POINTS = Object.freeze({
  light: 1,
  medium: 2,
  heavy: 3,
  ace: 5,
});

const TOKEN_SETS = Object.freeze({
  ace: Object.freeze([
    'ace', 'named', 'named_ace', 'namedace', 'elite_ace', 'ace_pilot',
  ]),
  heavy: Object.freeze([
    'gunship', 'capital', 'heavy', 'frigate', 'destroyer', 'battleship',
    'dreadnought', 'carrier', 'cruiser',
  ]),
  medium: Object.freeze([
    'brawler', 'medium', 'corvette', 'bruiser', 'striker',
  ]),
  light: Object.freeze([
    'fighter', 'drone', 'swarmer', 'scout', 'interceptor', 'light',
    'wasp', 'drone_swarm',
  ]),
});

const ACE_ID_RE = /(?:^|_)ace(?:_|$)/i;
const NAMED_ID_RE = /(?:^|_)named(?:_|$)/i;

/**
 * Per-tier burst recipe. `pickups` is how many separate physical pickups that line
 * produces; each pickup rolls qty in [qtyMin, qtyMax]. Credit chips are physical
 * currency, never cargo.
 */
export const KILL_REWARD_RECIPES = Object.freeze({
  light: Object.freeze({
    id: 'light',
    materials: Object.freeze([
      Object.freeze({
        commodityId: 'cmdty_scrap_metal', pickups: 4, qtyMin: 12, qtyMax: 18,
      }),
      Object.freeze({
        commodityId: 'cmdty_salvage_electronics', pickups: 1, qtyMin: 5, qtyMax: 5,
      }),
      Object.freeze({
        commodityId: 'cmdty_alloys', pickups: 1, qtyMin: 3, qtyMax: 3,
      }),
    ]),
    creditChips: Object.freeze({ count: 1, amountMin: 40, amountMax: 90 }),
  }),
  medium: Object.freeze({
    id: 'medium',
    materials: Object.freeze([
      Object.freeze({
        commodityId: 'cmdty_scrap_metal', pickups: 3, qtyMin: 14, qtyMax: 20,
      }),
      Object.freeze({
        commodityId: 'cmdty_salvage_electronics', pickups: 2, qtyMin: 4, qtyMax: 7,
      }),
      Object.freeze({
        commodityId: 'cmdty_alloys', pickups: 2, qtyMin: 3, qtyMax: 5,
      }),
      Object.freeze({
        commodityId: 'cmdty_munitions', pickups: 1, qtyMin: 2, qtyMax: 4,
      }),
    ]),
    creditChips: Object.freeze({ count: 2, amountMin: 60, amountMax: 120 }),
  }),
  heavy: Object.freeze({
    id: 'heavy',
    materials: Object.freeze([
      Object.freeze({
        commodityId: 'cmdty_scrap_metal', pickups: 3, qtyMin: 16, qtyMax: 22,
      }),
      Object.freeze({
        commodityId: 'cmdty_salvage_electronics', pickups: 2, qtyMin: 5, qtyMax: 8,
      }),
      Object.freeze({
        commodityId: 'cmdty_alloys', pickups: 2, qtyMin: 4, qtyMax: 7,
      }),
      Object.freeze({
        commodityId: 'cmdty_munitions', pickups: 2, qtyMin: 3, qtyMax: 6,
      }),
      Object.freeze({
        commodityId: 'cmdty_comp_hullplate', pickups: 1, qtyMin: 1, qtyMax: 2,
      }),
    ]),
    creditChips: Object.freeze({ count: 3, amountMin: 90, amountMax: 180 }),
  }),
  ace: Object.freeze({
    id: 'ace',
    materials: Object.freeze([
      Object.freeze({
        commodityId: 'cmdty_scrap_metal', pickups: 2, qtyMin: 18, qtyMax: 24,
      }),
      Object.freeze({
        commodityId: 'cmdty_salvage_electronics', pickups: 2, qtyMin: 6, qtyMax: 10,
      }),
      Object.freeze({
        commodityId: 'cmdty_alloys', pickups: 2, qtyMin: 5, qtyMax: 8,
      }),
      Object.freeze({
        commodityId: 'cmdty_munitions', pickups: 1, qtyMin: 4, qtyMax: 7,
      }),
      Object.freeze({
        commodityId: 'cmdty_classified_salvage', pickups: 1, qtyMin: 1, qtyMax: 2,
      }),
      Object.freeze({
        commodityId: 'cmdty_quantum_cores', pickups: 1, qtyMin: 1, qtyMax: 1,
      }),
    ]),
    creditChips: Object.freeze({ count: 3, amountMin: 220, amountMax: 460 }),
  }),
});

const FALLBACK_RECIPE = KILL_REWARD_RECIPES.light;

function asText(value) {
  return typeof value === 'string' ? value : (value == null ? '' : String(value));
}

function tokenize(value) {
  const text = asText(value).trim().toLowerCase();
  if (!text) return [];
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}

function hasToken(tokens, set) {
  for (let i = 0; i < tokens.length; i++) {
    if (set.includes(tokens[i])) return true;
  }
  return false;
}

function collectIdentityTokens(victim) {
  const data = victim && victim.data || {};
  const ai = data.ai && typeof data.ai === 'object' ? data.ai : {};
  const fields = [
    data.shipClass,
    data.role,
    data.family,
    data.silhouette,
    data.aiArchetype,
    ai.archetype,
    data.lootTableId,
    data.typeId,
    data.enemyTypeId,
    data.defId,
  ];
  const tokens = [];
  for (let i = 0; i < fields.length; i++) {
    const parts = tokenize(fields[i]);
    for (let j = 0; j < parts.length; j++) tokens.push(parts[j]);
  }
  return tokens;
}

function isNamedOrAce(victim, tokens) {
  const data = victim && victim.data || {};
  const ai = data.ai && typeof data.ai === 'object' ? data.ai : {};
  if (data.namedAceId != null || data.aceId != null || ai.namedAceId != null) return true;
  if (data.named === true || data.ace === true || data.isAce === true) return true;
  const idFields = [
    data.namedAceId, data.aceId, ai.namedAceId,
    data.lootTableId, data.typeId, data.enemyTypeId, data.defId,
  ];
  for (let i = 0; i < idFields.length; i++) {
    const text = asText(idFields[i]);
    if (text && (ACE_ID_RE.test(text) || NAMED_ID_RE.test(text))) return true;
  }
  return hasToken(tokens, TOKEN_SETS.ace);
}

function finiteMass(victim) {
  const mass = Number(victim && victim.mass);
  return Number.isFinite(mass) && mass > 0 ? mass : null;
}

/** Map a live victim onto a recipe tier. Safe fallback is light. */
export function classifyKillRewardVictim(victim) {
  const tokens = collectIdentityTokens(victim);
  if (isNamedOrAce(victim, tokens)) return 'ace';
  if (hasToken(tokens, TOKEN_SETS.heavy)) return 'heavy';
  if (hasToken(tokens, TOKEN_SETS.medium)) return 'medium';
  if (hasToken(tokens, TOKEN_SETS.light)) return 'light';

  const mass = finiteMass(victim);
  if (mass != null) {
    if (mass >= 60) return 'heavy';
    if (mass >= 20) return 'medium';
    return 'light';
  }
  return 'light';
}

export function killRewardRecipeFor(victim) {
  const tier = classifyKillRewardVictim(victim);
  return KILL_REWARD_RECIPES[tier] || FALLBACK_RECIPE;
}

/** Existing tech-tree RP granted for an admitted hostile kill. Style-neutral until AC-08. */
export function killResearchPointsForVictim(victim) {
  const tier = classifyKillRewardVictim(victim);
  return KILL_RESEARCH_POINTS[tier] || KILL_RESEARCH_POINTS.light;
}

export function isCreditChipItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.kind === CREDIT_CHIP_KIND || item.kind === 'credits') return true;
  return item.commodityId == null && Number(item.credits) > 0;
}

export function isCreditChipPickup(data) {
  return isCreditChipItem(data);
}

function rollInclusive(rng, min, max) {
  const lo = Math.floor(Number(min));
  const hi = Math.floor(Number(max));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 0;
  if (hi <= lo) return Math.max(0, lo);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function victimGrantKey(victim) {
  const data = victim && victim.data || {};
  if (data.worldRecordId != null) return `wr:${data.worldRecordId}`;
  if (data.identityKey != null) return `id:${data.identityKey}`;
  if (data.stableId != null) return `st:${data.stableId}`;
  if (data.spawnKey != null) return `sp:${data.spawnKey}`;
  if (victim && victim.id != null) return `ent:${victim.id}`;
  return 'ent:unknown';
}

function pushMaterialLine(items, rng, line) {
  const pickups = Math.max(0, Math.floor(Number(line.pickups) || 0));
  for (let i = 0; i < pickups; i++) {
    const qty = rollInclusive(rng, line.qtyMin, line.qtyMax);
    if (qty <= 0) continue;
    items.push({ commodityId: line.commodityId, qty });
  }
}

function pushCreditChips(items, rng, spec, grantKey) {
  const count = Math.max(0, Math.floor(Number(spec && spec.count) || 0));
  for (let i = 0; i < count; i++) {
    const credits = rollInclusive(rng, spec.amountMin, spec.amountMax);
    if (credits <= 0) continue;
    items.push({
      kind: CREDIT_CHIP_KIND,
      credits,
      amount: credits,
      grantReason: `kill:credit_chip:${grantKey}:${i}`,
    });
  }
}

function cargoLinesFromVictim(victim) {
  const data = victim && victim.data || {};
  const lines = [];
  const hold = (data.cargo && data.cargo.items) || (victim && victim.cargo && victim.cargo.items);
  if (hold && typeof hold === 'object' && !Array.isArray(hold)) {
    const ids = Object.keys(hold);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (typeof id !== 'string' || !id.startsWith('cmdty_')) continue;
      const qty = Math.floor(Number(hold[id]) || 0);
      if (qty > 0) lines.push({ commodityId: id, qty });
    }
  }
  const manifest = data.cargoManifest;
  if (manifest && Array.isArray(manifest.lines)) {
    for (let i = 0; i < manifest.lines.length; i++) {
      const line = manifest.lines[i];
      if (!line || typeof line.commodityId !== 'string') continue;
      if (!line.commodityId.startsWith('cmdty_')) continue;
      const qty = Math.floor(Number(line.qty) || 0);
      if (qty > 0) lines.push({ commodityId: line.commodityId, qty });
    }
  }
  return lines;
}

const MAX_CARGO_SPILL_PICKUPS = 4;

function pushCargoSpill(items, rng, victim) {
  const lines = cargoLinesFromVictim(victim);
  let spilled = 0;
  for (let i = 0; i < lines.length && spilled < MAX_CARGO_SPILL_PICKUPS; i++) {
    const line = lines[i];
    const keep = Math.max(1, Math.floor(line.qty * (0.5 + rng() * 0.5)));
    const qty = Math.min(line.qty, keep);
    if (qty <= 0) continue;
    items.push({ commodityId: line.commodityId, qty });
    spilled += 1;
  }
}

/**
 * Deterministic burst items for one victim. `rng` must be a victim-local stream —
 * never the shared sim RNG. Style metadata on the victim is not read.
 */
export function rollKillRewardItems(rng, victim) {
  const recipe = killRewardRecipeFor(victim);
  const items = [];
  const materials = recipe.materials || [];
  for (let i = 0; i < materials.length; i++) {
    pushMaterialLine(items, rng, materials[i]);
  }
  pushCargoSpill(items, rng, victim);
  pushCreditChips(items, rng, recipe.creditChips, victimGrantKey(victim));
  return items;
}

export function materialItemsOf(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && item.commodityId && !isCreditChipItem(item)) out.push(item);
  }
  return out;
}

export function creditChipItemsOf(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    if (isCreditChipItem(items[i])) out.push(items[i]);
  }
  return out;
}
