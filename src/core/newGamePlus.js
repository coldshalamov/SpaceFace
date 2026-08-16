// B7 / SPEC3-32 New Run+ projection.
//
// This module is deliberately pure: it reads a validated save payload and projects the tiny
// carry-over contract. Runtime owners still perform every mutation (ships grants inventory,
// aceMemory rebuilds grudges, story stores the visible legacy receipt).
import { MODULES } from '../data/modules.js';
import { ENDGAME_CHOICES } from '../data/narrative.js';
import { PIRATE_PROMOTION_MAX_TIER, aceById } from '../data/namedAces.js';
import { WEAPONS } from '../data/weapons.js';
import { normalizeShipAppearance } from './shipAppearance.js';

export const NEW_GAME_PLUS_SCHEMA = 'spaceface.newGamePlus.v1';

const ITEM_BY_ID = new Map([...MODULES, ...WEAPONS].map((def) => [def.id, def]));
const ENDING_BY_ID = new Map(ENDGAME_CHOICES.map((ending) => [ending.id, ending]));

export function completedEndingChoiceFromStory(story) {
  const choice = String(story && story.endgameChoice || '').toUpperCase();
  if (!ENDING_BY_ID.has(choice)) return null;
  return story && story.endgameResolved === false ? null : choice;
}

export function storyFromSaveData(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.story && typeof data.story === 'object' && !Array.isArray(data.story)) return data.story;
  const missions = data.missions;
  if (!missions || typeof missions !== 'object' || Array.isArray(missions)) return null;
  if (missions.story && typeof missions.story === 'object' && !Array.isArray(missions.story)) {
    return missions.story;
  }
  if (missions.missions && missions.missions.story
      && typeof missions.missions.story === 'object' && !Array.isArray(missions.missions.story)) {
    return missions.missions.story;
  }
  return null;
}

export function completedEndingChoiceFromSaveData(data) {
  return completedEndingChoiceFromStory(storyFromSaveData(data));
}

export function buildNewGamePlusCandidate(data, source = {}) {
  const sourceEnding = completedEndingChoiceFromSaveData(data);
  if (!sourceEnding) return null;
  const ending = ENDING_BY_ID.get(sourceEnding);
  const keepsakes = ownedKeepsakeOptions(data && data.player);
  if (!keepsakes.length) return null;
  const grudges = unresolvedHunterGrudges(data && data.aceMemory);
  return {
    schema: NEW_GAME_PLUS_SCHEMA,
    sourceSlot: clean(source.slot),
    sourceSavedAt: clean(source.savedAt),
    sourceEnding,
    sourceEndingTitle: ending.title,
    keepsakes,
    grudgeCount: grudges.length,
    codexEntries: codexEntryCount(projectCodex(storyFromSaveData(data))),
  };
}

export function buildNewGamePlusOverlay(data, selection = {}, source = {}) {
  const candidate = buildNewGamePlusCandidate(data, source);
  if (!candidate) return null;
  const requested = clean(selection.keepsakeId);
  const keepsake = candidate.keepsakes.find((item) => item.defId === requested)
    || (!requested ? candidate.keepsakes[0] : null);
  if (!keepsake) return null;
  const grudges = unresolvedHunterGrudges(data && data.aceMemory);
  const story = storyFromSaveData(data);
  return {
    schema: NEW_GAME_PLUS_SCHEMA,
    sourceSlot: candidate.sourceSlot,
    sourceSavedAt: candidate.sourceSavedAt,
    sourceEnding: candidate.sourceEnding,
    sourceEndingTitle: candidate.sourceEndingTitle,
    keepsake: { ...keepsake },
    grudges,
    codex: projectCodex(story),
    cosmetics: projectCosmetics(data && data.player),
    titles: projectTitles(story),
    eliteComposition: selection.eliteComposition !== false,
  };
}

export function storyNewGamePlusRecord(overlay, seed = 0) {
  if (!overlay || overlay.schema !== NEW_GAME_PLUS_SCHEMA) return null;
  const sourceEnding = String(overlay.sourceEnding || '').toUpperCase();
  const ending = ENDING_BY_ID.get(sourceEnding);
  const keepsakeDef = ITEM_BY_ID.get(overlay.keepsake && overlay.keepsake.defId);
  if (!ending || !keepsakeDef) return null;
  const grudgeCount = Array.isArray(overlay.grudges) ? overlay.grudges.length : overlay.hunterGrudgeCount;
  return {
    schema: NEW_GAME_PLUS_SCHEMA,
    sourceEnding,
    sourceEndingTitle: ending.title,
    sourceSlot: clean(overlay.sourceSlot) || null,
    sourceSavedAt: clean(overlay.sourceSavedAt) || null,
    keepsakeId: keepsakeDef.id,
    keepsakeName: keepsakeDef.name,
    hunterGrudgeCount: clampInt(grudgeCount, 0, 64),
    startedSeed: (Number(seed) >>> 0) || 1,
    codex: normalizeCodexProjection(overlay.codex),
    titles: normalizeTitlesProjection(overlay.titles),
    eliteComposition: overlay.eliteComposition !== false,
  };
}

export function normalizeStoryNewGamePlusRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const sourceEnding = String(input.sourceEnding || '').toUpperCase();
  const ending = ENDING_BY_ID.get(sourceEnding);
  const keepsakeDef = ITEM_BY_ID.get(input.keepsakeId);
  if (!ending || !keepsakeDef) return null;
  return {
    schema: NEW_GAME_PLUS_SCHEMA,
    sourceEnding,
    sourceEndingTitle: ending.title,
    sourceSlot: clean(input.sourceSlot) || null,
    sourceSavedAt: clean(input.sourceSavedAt) || null,
    keepsakeId: keepsakeDef.id,
    keepsakeName: keepsakeDef.name,
    hunterGrudgeCount: clampInt(input.hunterGrudgeCount, 0, 64),
    startedSeed: (Number(input.startedSeed) >>> 0) || 1,
    codex: normalizeCodexProjection(input.codex),
    titles: normalizeTitlesProjection(input.titles),
    eliteComposition: input.eliteComposition !== false,
  };
}

function projectCodex(story) {
  return normalizeCodexProjection(story && {
    beatIndex: story.beatIndex,
    seenComms: story.seenComms,
    graffitiShown: story.graffitiShown,
    endgameChoice: completedEndingChoiceFromStory(story),
    persistentCargo: story.persistentCargo,
    rareSpawns: story.flags && story.flags.rareSpawns,
  });
}

function normalizeCodexProjection(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const ending = String(source.endgameChoice || '').toUpperCase();
  return {
    beatIndex: clampInt(source.beatIndex, 0, 7),
    seenComms: trueKeyMap(source.seenComms, 256),
    graffitiShown: trueKeyMap(source.graffitiShown, 256),
    endgameChoice: ENDING_BY_ID.has(ending) ? ending : null,
    persistentCargo: cleanList(source.persistentCargo, 64),
    rareSpawns: normalizeRareSpawnCodex(source.rareSpawns),
  };
}

function normalizeRareSpawnCodex(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const history = (Array.isArray(source.history) ? source.history : []).slice(-32).map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const out = {};
    for (const key of ['kind', 'receiptId', 'shapeId', 'encounterId', 'blackBoxSide', 'cargoId', 'sectorId', 'zoneId', 'outcome']) {
      const value = clean(row[key]);
      if (value) out[key] = value;
    }
    if (Number.isFinite(Number(row.recoveredOrder))) out.recoveredOrder = clampInt(row.recoveredOrder, 0, 99);
    return Object.keys(out).length ? out : null;
  }).filter(Boolean);
  return { history };
}

function projectCosmetics(player) {
  const byDef = new Map();
  for (const ship of player && Array.isArray(player.ownedShips) ? player.ownedShips : []) {
    const defId = clean(ship && ship.defId);
    if (!defId || byDef.has(defId)) continue;
    byDef.set(defId, { defId, appearance: { ...normalizeShipAppearance(ship.appearance, defId) } });
    if (byDef.size >= 32) break;
  }
  return [...byDef.values()];
}

function projectTitles(story) {
  const source = story && story.titles && story.titles.playerDeeds;
  return normalizeTitlesProjection({ playerDeeds: source });
}

function normalizeTitlesProjection(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const raw = source.playerDeeds && typeof source.playerDeeds === 'object' ? source.playerDeeds : {};
  const earnedById = {};
  const ids = Object.keys(raw.earnedById && typeof raw.earnedById === 'object' ? raw.earnedById : {})
    .sort().slice(0, 64);
  for (const id of ids) {
    const row = raw.earnedById[id];
    if (!row || typeof row !== 'object') continue;
    earnedById[id] = {
      id: clean(row.id || id),
      title: clean(row.title),
      description: clean(row.description),
      earnedTick: clampInt(row.earnedTick, 0, 0x7fffffff),
      receiptId: clean(row.receiptId),
      source: clean(row.source),
    };
  }
  const order = cleanList(raw.order, 64).filter((id) => earnedById[id]);
  return { playerDeeds: { earnedById, order, processedReceiptIds: cleanList(raw.processedReceiptIds, 128) } };
}

function codexEntryCount(codex) {
  return clampInt(codex && codex.beatIndex, 0, 7) + 1
    + Object.keys(codex && codex.seenComms || {}).length
    + Object.keys(codex && codex.graffitiShown || {}).length
    + (codex && codex.persistentCargo || []).length
    + (codex && codex.rareSpawns && codex.rareSpawns.history || []).length;
}

function trueKeyMap(input, limit) {
  const out = {};
  for (const key of Object.keys(input && typeof input === 'object' ? input : {}).sort()) {
    if (input[key] !== true) continue;
    const id = clean(key);
    if (id) out[id] = true;
    if (Object.keys(out).length >= limit) break;
  }
  return out;
}

function cleanList(input, limit) {
  return (Array.isArray(input) ? input : []).map(clean).filter(Boolean).slice(-limit);
}

function ownedKeepsakeOptions(player) {
  const owned = new Set();
  for (const item of player && Array.isArray(player.moduleInventory) ? player.moduleInventory : []) {
    if (item && ITEM_BY_ID.has(item.defId)) owned.add(item.defId);
  }
  for (const ship of player && Array.isArray(player.ownedShips) ? player.ownedShips : []) {
    for (const defId of ship && Array.isArray(ship.fittings) ? ship.fittings : []) {
      if (ITEM_BY_ID.has(defId)) owned.add(defId);
    }
  }
  return [...owned]
    .map((defId) => ITEM_BY_ID.get(defId))
    .sort((a, b) => Number(b.unique === true) - Number(a.unique === true)
      || finite(b.tier) - finite(a.tier)
      || String(a.name || a.id).localeCompare(String(b.name || b.id)))
    .map((def) => ({
      defId: def.id,
      name: def.name || def.id,
      slotType: def.slotType || 'module',
      size: def.size || null,
      tier: clampInt(def.tier, 0, 99),
      unique: def.unique === true,
    }));
}

function unresolvedHunterGrudges(memory) {
  const out = [];
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return out;
  const records = memory.aces && typeof memory.aces === 'object' ? memory.aces : memory;
  for (const aceId of Object.keys(records).sort()) {
    const rec = records[aceId];
    if (!aceById(aceId) || !rec || typeof rec !== 'object') continue;
    if (rec.fled !== true || rec.defeated === true) continue;
    out.push({
      aceId,
      returnTier: clampInt(rec.returnTier, 1, PIRATE_PROMOTION_MAX_TIER),
      fleeCount: clampInt(rec.fleeCount, 1, 999),
      encounterCount: clampInt(rec.encounterCount, 1, 999),
    });
  }
  return out;
}

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampInt(value, min, max) {
  const n = Math.floor(finite(value));
  return Math.max(min, Math.min(max, n));
}
