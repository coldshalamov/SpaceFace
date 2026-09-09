// B7 / SPEC3-32 New Run+ projection.
//
// This module is deliberately pure: it reads a validated save payload and projects the tiny
// carry-over contract. Runtime owners still perform every mutation (ships grants inventory,
// aceMemory rebuilds grudges, story stores the visible legacy receipt).
import { MODULES } from '../data/modules.js';
import { ENDGAME_CHOICES } from '../data/narrative.js';
import { PIRATE_PROMOTION_MAX_TIER, aceById } from '../data/namedAces.js';
import { WEAPONS } from '../data/weapons.js';

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
  return {
    schema: NEW_GAME_PLUS_SCHEMA,
    sourceSlot: candidate.sourceSlot,
    sourceSavedAt: candidate.sourceSavedAt,
    sourceEnding: candidate.sourceEnding,
    sourceEndingTitle: candidate.sourceEndingTitle,
    keepsake: { ...keepsake },
    grudges,
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
  };
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
