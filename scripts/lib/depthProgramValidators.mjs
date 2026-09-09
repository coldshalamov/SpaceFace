const REQUIRED_KIT_ARRAYS = Object.freeze(['homeSectors', 'controls', 'shipRoles', 'illegalCommodities']);
const REQUIRED_KIT_OBJECTS = Object.freeze(['relations', 'palette', 'custom']);
const REQUIRED_KIT_STRINGS = Object.freeze(['id', 'name', 'short', 'color', 'personality', 'fleetClass', 'voiceRegister']);

export const MIN_FACTION_HUE_DISTANCE_DEG = 12;

function issue(code, path, message, severity = 'error') {
  return { code, path, message, severity };
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function normalizeHex(value) {
  return String(value || '').toUpperCase();
}

export function hexToHsl(hex) {
  if (!isHexColor(hex)) return null;
  const value = String(hex).slice(1);
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = ((b - r) / delta) + 2;
    else hue = ((r - g) / delta) + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation, lightness, chroma: delta };
}

export function circularHueDistance(a, b) {
  const raw = Math.abs(Number(a) - Number(b)) % 360;
  return Math.min(raw, 360 - raw);
}

function collisionKey(a, b) {
  return [String(a), String(b)].sort().join('|');
}

function paletteCollisionStrategyWorks(strategy, a, b, aHsl, bHsl) {
  const saturationDelta = Math.abs(aHsl.saturation - bHsl.saturation);
  const lightnessDelta = Math.abs(aHsl.lightness - bHsl.lightness);
  if (strategy === 'saturation') return saturationDelta >= 0.10;
  if (strategy === 'lightness') return lightnessDelta >= 0.15;
  if (strategy === 'role') return a.role !== b.role && (a.role !== 'primary' || b.role !== 'primary');
  if (strategy === 'pattern') return !!(a.pattern && b.pattern && String(a.pattern) !== String(b.pattern));
  if (strategy === 'low-saturation') return Math.min(aHsl.saturation, bHsl.saturation) <= 0.25;
  return false;
}

export function validateFactionKitContract({
  kits = [],
  paintProfiles = {},
  factionPalettes = null,
  paletteClaims = [],
  allowedPaletteCollisions = [],
  minHueDistance = MIN_FACTION_HUE_DISTANCE_DEG,
  minChroma = 0.15,
} = {}) {
  const issues = [];
  if (!Array.isArray(kits) || kits.length === 0) {
    return [issue('faction.kits.empty', 'kits', 'Faction kits must be a non-empty array.')];
  }

  const byId = new Map();
  for (let index = 0; index < kits.length; index++) {
    const kit = kits[index];
    const path = `kits[${index}]`;
    if (!isObject(kit)) {
      issues.push(issue('faction.schema', path, 'Faction kit must be an object.'));
      continue;
    }
    for (const key of REQUIRED_KIT_STRINGS) {
      if (typeof kit[key] !== 'string' || !kit[key].trim()) {
        issues.push(issue('faction.schema', `${path}.${key}`, `${key} must be a non-empty string.`));
      }
    }
    for (const key of REQUIRED_KIT_ARRAYS) {
      if (!Array.isArray(kit[key])) issues.push(issue('faction.schema', `${path}.${key}`, `${key} must be an array.`));
    }
    for (const key of REQUIRED_KIT_OBJECTS) {
      if (!isObject(kit[key])) issues.push(issue('faction.schema', `${path}.${key}`, `${key} must be an object.`));
    }
    if (!Number.isFinite(kit.startingRep)) {
      issues.push(issue('faction.schema', `${path}.startingRep`, 'startingRep must be finite.'));
    }
    if (!isHexColor(kit.color) || !isHexColor(kit.palette && kit.palette.primary)) {
      issues.push(issue('faction.palette.invalid', `${path}.palette`, 'Faction color and palette.primary must be six-digit hex colors.'));
    } else if (normalizeHex(kit.color) !== normalizeHex(kit.palette.primary)) {
      issues.push(issue('faction.palette.mismatch', `${path}.palette.primary`, 'palette.primary must match the legacy faction color.'));
    }
    if (kit.id && byId.has(kit.id)) issues.push(issue('faction.id.duplicate', `${path}.id`, `Duplicate faction id ${kit.id}.`));
    else if (kit.id) byId.set(kit.id, kit);
    if (kit.personality && !hasOwn(paintProfiles, kit.personality)) {
      issues.push(issue('faction.paint-profile.missing', `${path}.personality`, `No PAINT_PROFILES row for ${kit.personality}.`));
    }
  }

  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i++) {
    const a = byId.get(ids[i]);
    if (!isObject(a.relations)) continue;
    for (const relatedId of Object.keys(a.relations)) {
      if (relatedId === a.id) issues.push(issue('faction.relation.self', `${a.id}.relations.${relatedId}`, 'Faction relations must omit self.'));
      else if (!byId.has(relatedId)) issues.push(issue('faction.relation.unknown', `${a.id}.relations.${relatedId}`, `Unknown faction relation ${relatedId}.`));
      const value = a.relations[relatedId];
      if (!Number.isFinite(value) || value < -1 || value > 1) {
        issues.push(issue('faction.relation.value', `${a.id}.relations.${relatedId}`, 'Relation must be finite and within [-1, 1].'));
      }
    }
    for (let j = i + 1; j < ids.length; j++) {
      const b = byId.get(ids[j]);
      const aHas = hasOwn(a.relations, b.id);
      const bHas = isObject(b.relations) && hasOwn(b.relations, a.id);
      if (!aHas) issues.push(issue('faction.relation.missing', `${a.id}.relations.${b.id}`, `Missing relation from ${a.id} to ${b.id}.`));
      if (!bHas) issues.push(issue('faction.relation.missing', `${b.id}.relations.${a.id}`, `Missing relation from ${b.id} to ${a.id}.`));
      if (aHas && bHas && Number(a.relations[b.id]) !== Number(b.relations[a.id])) {
        issues.push(issue('faction.relation.asymmetric', `${a.id}<->${b.id}`, `Relations disagree: ${a.relations[b.id]} vs ${b.relations[a.id]}.`));
      }
      if (aHas !== bHas) {
        issues.push(issue('faction.relation.asymmetric', `${a.id}<->${b.id}`, 'Relation is present in only one direction.'));
      }
    }
  }

  const claimIds = new Set();
  for (let i = 0; i < paletteClaims.length; i++) {
    const claim = paletteClaims[i];
    const path = `paletteClaims[${i}]`;
    if (!isObject(claim) || typeof claim.id !== 'string' || !claim.id || !isHexColor(claim.hex)) {
      issues.push(issue('palette.claim.invalid', path, 'Palette claim requires a unique id and six-digit hex color.'));
      continue;
    }
    if (claimIds.has(claim.id)) issues.push(issue('palette.claim.duplicate', `${path}.id`, `Duplicate palette claim ${claim.id}.`));
    claimIds.add(claim.id);
    if (claim.factionId && claim.role === 'primary' && byId.has(claim.factionId)) {
      const actual = byId.get(claim.factionId).palette.primary;
      if (normalizeHex(actual) !== normalizeHex(claim.hex)) {
        issues.push(issue('palette.claim.drift', path, `${claim.id} claims ${claim.hex}, but ${claim.factionId} uses ${actual}.`));
      }
    }
  }
  const validClaims = paletteClaims.filter((claim) => isObject(claim) && claim.id && isHexColor(claim.hex));
  const claimById = new Map(validClaims.map((claim) => [claim.id, claim]));
  for (const kit of byId.values()) {
    const primaryClaims = validClaims.filter((claim) => claim.factionId === kit.id && claim.role === 'primary');
    if (primaryClaims.length !== 1) {
      issues.push(issue('palette.claim.coverage', kit.id, `Expected exactly one primary palette claim, found ${primaryClaims.length}.`));
    }
    if (factionPalettes !== null) {
      const renderPalette = factionPalettes && factionPalettes[kit.id];
      if (!isObject(renderPalette) || !isHexColor(renderPalette.primary)) {
        issues.push(issue('faction.render-palette.missing', kit.id, `FACTION_PALETTES has no valid ${kit.id} row.`));
      } else if (normalizeHex(renderPalette.primary) !== normalizeHex(kit.palette && kit.palette.primary)) {
        issues.push(issue('faction.render-palette.mismatch', kit.id, `Render primary ${renderPalette.primary} does not match kit primary ${kit.palette && kit.palette.primary}.`));
      }
    }
  }
  const collisionAllowances = new Map();
  for (let i = 0; i < allowedPaletteCollisions.length; i++) {
    const allowance = allowedPaletteCollisions[i];
    const path = `allowedPaletteCollisions[${i}]`;
    const pair = allowance && allowance.pair;
    if (!Array.isArray(pair) || pair.length !== 2 || !claimById.has(pair[0]) || !claimById.has(pair[1])) {
      issues.push(issue('palette.collision.invalid', path, 'Allowed collision must reference exactly two existing palette claim ids.'));
      continue;
    }
    const strategies = allowance.distinguishBy;
    if (!Array.isArray(strategies) || strategies.length === 0 || typeof allowance.reason !== 'string' || !allowance.reason.trim()) {
      issues.push(issue('palette.collision.invalid', path, 'Allowed collision needs distinguishBy strategies and a reason.'));
      continue;
    }
    const key = collisionKey(pair[0], pair[1]);
    if (collisionAllowances.has(key)) {
      issues.push(issue('palette.collision.duplicate', path, `Duplicate allowed collision for ${key}.`));
      continue;
    }
    const a = claimById.get(pair[0]);
    const b = claimById.get(pair[1]);
    const aHsl = hexToHsl(a.hex);
    const bHsl = hexToHsl(b.hex);
    const distance = circularHueDistance(aHsl.hue, bHsl.hue);
    if (aHsl.chroma < minChroma || bHsl.chroma < minChroma) {
      issues.push(issue('palette.collision.unnecessary', path, `At least one claim is below the ${minChroma} chroma floor, so hue is not stable enough to waive.`));
    } else if (distance >= minHueDistance) {
      issues.push(issue('palette.collision.unnecessary', path, `Hue distance ${distance.toFixed(1)}° no longer needs an allowance.`));
    }
    const failed = strategies.filter((strategy) => !paletteCollisionStrategyWorks(strategy, a, b, aHsl, bHsl));
    if (failed.length) {
      issues.push(issue('palette.collision.invalid', path, `Unverified distinction strategies: ${failed.join(', ')}.`));
    }
    collisionAllowances.set(key, allowance);
  }
  const chromaticClaims = validClaims.filter((claim) => hexToHsl(claim.hex).chroma >= minChroma);
  for (let i = 0; i < chromaticClaims.length; i++) {
    const a = chromaticClaims[i];
    const aHsl = hexToHsl(a.hex);
    for (let j = i + 1; j < chromaticClaims.length; j++) {
      const b = chromaticClaims[j];
      if (a.factionId && b.factionId && a.factionId === b.factionId) continue;
      const bHsl = hexToHsl(b.hex);
      const distance = circularHueDistance(aHsl.hue, bHsl.hue);
      if (distance < minHueDistance && !collisionAllowances.has(collisionKey(a.id, b.id))) {
        issues.push(issue(
          'palette.hue-collision',
          `${a.id}<->${b.id}`,
          `Hue distance ${distance.toFixed(1)}° is below ${minHueDistance}° without a verified secondary distinction.`,
        ));
      }
    }
  }

  return issues;
}

export function validateUniqueLootContract({
  wrecks = [],
  rumors = [],
  channels = [],
  stationInventoryIds = [],
  sourceIndex = null,
  requireAuthored = false,
  allowEmpty = false,
} = {}) {
  const issues = [];
  const wreckList = Array.isArray(wrecks) ? wrecks : Object.values(wrecks || {});
  const rumorList = Array.isArray(rumors) ? rumors : Object.values(rumors || {});
  const rumorById = new Map(rumorList.filter((rumor) => rumor && rumor.id).map((rumor) => [rumor.id, rumor]));
  const channelSet = new Set(channels || []);
  const inventorySet = new Set(stationInventoryIds || []);
  const drops = new Map();
  const wreckIds = new Set();
  const rumorIds = new Set();
  const inlineRumorIds = new Set();

  if (wreckList.length === 0 && !allowEmpty) {
    issues.push(issue('unique.manifest.empty', 'wrecks', 'Unique-wreck manifest is empty without an explicit pre-content allowance.'));
  }

  for (const wreck of wreckList) {
    const wreckId = wreck && wreck.id ? String(wreck.id) : '<unknown>';
    if (wreckIds.has(wreckId)) issues.push(issue('unique.wreck.duplicate', wreckId, `Duplicate unique wreck id ${wreckId}.`));
    wreckIds.add(wreckId);
    const rawDrops = Array.isArray(wreck && wreck.uniqueDrops)
      ? wreck.uniqueDrops
      : (wreck && wreck.uniqueDropId ? [wreck.uniqueDropId] : []);
    const dropIds = rawDrops.map((drop) => String(isObject(drop) ? drop.id || '' : drop)).filter(Boolean);
    if (dropIds.length === 0) {
      issues.push(issue('unique.drop.missing', `${wreckId}.uniqueDrops`, 'Unique wreck must declare at least one unique drop.'));
    }
    for (const dropId of dropIds) {
      if (drops.has(dropId)) issues.push(issue('unique.drop.duplicate', dropId, `Unique drop is shared by ${drops.get(dropId)} and ${wreckId}.`));
      drops.set(dropId, wreckId);
      if (inventorySet.has(dropId)) {
        issues.push(issue('unique.station-inventory', `${wreckId}.uniqueDrops`, `${dropId} appears in station inventory.`));
      }
    }
    const rawSources = Array.isArray(wreck && wreck.rumorSources)
      ? wreck.rumorSources
      : (Array.isArray(wreck && wreck.rumorIds) ? wreck.rumorIds : []);
    if (rawSources.length === 0) issues.push(issue('unique.rumor.missing', `${wreckId}.rumorSources`, 'Unique wreck needs at least one wired rumor source.'));
    for (const source of rawSources) {
      const rumorId = String(isObject(source) ? source.id || '' : source);
      if (!rumorId) {
        issues.push(issue('unique.rumor.invalid', `${wreckId}.rumorSources`, 'Rumor source requires an id.'));
        continue;
      }
      if (inlineRumorIds.has(rumorId)) issues.push(issue('unique.rumor.duplicate', rumorId, `Duplicate rumor id ${rumorId}.`));
      inlineRumorIds.add(rumorId);
      const rumor = rumorById.get(rumorId) || (isObject(source) ? source : null);
      if (!rumor) {
        issues.push(issue('unique.rumor.missing', `${wreckId}.rumorSources.${rumorId}`, `Rumor ${rumorId} is not registered.`));
        continue;
      }
      if (rumor.wreckId && rumor.wreckId !== wreckId) {
        issues.push(issue('unique.rumor.wreck', rumorId, `Rumor points to ${rumor.wreckId || '<none>'}, expected ${wreckId}.`));
      }
      const channelId = rumor.channelId || rumor.channel;
      if (!channelSet.has(channelId)) {
        issues.push(issue('unique.rumor.channel', `${rumorId}.channelId`, `Unknown rumor channel ${channelId || '<none>'}.`));
      }
      if (isObject(source)) {
        const status = source.status;
        if (status && !['reserved', 'authored', 'wired'].includes(status)) {
          issues.push(issue('unique.rumor.source-status', `${rumorId}.status`, `Unknown rumor status ${status}.`));
        }
        if (requireAuthored && !['authored', 'wired'].includes(status)) {
          issues.push(issue('unique.rumor.source-status', `${rumorId}.status`, 'Rumor copy must be authored or wired.'));
        }
        if (sourceIndex !== null && (requireAuthored || ['authored', 'wired'].includes(status))) {
          const sourceRef = source.sourceRef;
          const authored = sourceRef && sourceIndex[sourceRef];
          if (!authored) {
            issues.push(issue('unique.rumor.source-unresolved', `${rumorId}.sourceRef`, `No authored flavor source resolves ${sourceRef || '<none>'}.`));
          } else {
            if (authored.id !== rumorId) {
              issues.push(issue('unique.rumor.source-id', sourceRef, `Authored source id ${authored.id || '<none>'} does not match ${rumorId}.`));
            }
            if (authored.wreckId !== wreckId) {
              issues.push(issue('unique.rumor.source-wreck', sourceRef, `Authored source points to ${authored.wreckId || '<none>'}, expected ${wreckId}.`));
            }
            if (wreck.programSlot && authored.programSlot !== wreck.programSlot) {
              issues.push(issue('unique.rumor.source-slot', sourceRef, `Authored source uses ${authored.programSlot || '<none>'}, expected ${wreck.programSlot}.`));
            }
            if (authored.channelId !== channelId) {
              issues.push(issue('unique.rumor.source-channel', sourceRef, `Authored source uses ${authored.channelId || '<none>'}, expected ${channelId || '<none>'}.`));
            }
          }
        }
      }
    }
  }

  for (const rumor of rumorList) {
    if (!rumor || !rumor.id) {
      issues.push(issue('unique.rumor.invalid', 'rumors', 'Rumor requires an id.'));
      continue;
    }
    if (rumorIds.has(rumor.id)) issues.push(issue('unique.rumor.duplicate', rumor.id, `Duplicate rumor id ${rumor.id}.`));
    rumorIds.add(rumor.id);
    if (!wreckIds.has(rumor.wreckId)) issues.push(issue('unique.rumor.orphan', rumor.id, `Rumor points to unknown wreck ${rumor.wreckId || '<none>'}.`));
    const channelId = rumor.channelId || rumor.channel;
    if (!channelSet.has(channelId)) {
      issues.push(issue('unique.rumor.channel', `${rumor.id}.channelId`, `Unknown rumor channel ${channelId || '<none>'}.`));
    }
  }
  return issues;
}

export function validateBlurbEntries(entries = []) {
  const issues = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = typeof entries[index] === 'string' ? { id: String(index), text: entries[index] } : entries[index];
    const id = entry && entry.id != null ? String(entry.id) : String(index);
    const text = entry && typeof entry.text === 'string' ? entry.text.trim() : '';
    if (!text) {
      issues.push(issue('blurb.text', id, 'Scoped blurb/comms entry must contain text.'));
      continue;
    }
    if (/[\r\n\u2028\u2029]/u.test(text)) {
      issues.push(issue('blurb.layout', id, 'Scoped blurb/comms text must fit its inline surface without authored line breaks.'));
    }
    if (/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f\ufffd]/u.test(text)) {
      issues.push(issue('blurb.characters', id, 'Scoped blurb/comms text contains an unsafe control or replacement character.'));
    }
  }
  return issues;
}

export function formatValidationIssues(issues) {
  return issues.map((entry) => `[${entry.severity || 'error'}:${entry.code}] ${entry.path}: ${entry.message}`).join('\n');
}
