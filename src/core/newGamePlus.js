// B7 / SPEC3-32 New Run+ projection.
//
// This module is deliberately pure: it reads a validated save payload and projects the tiny
// carry-over contract. Runtime owners still perform every mutation (ships grants inventory,
// aceMemory rebuilds grudges, titles restore leftover titles, story stores the visible
// leftover receipt and leftover postEnding flags).
import { livingHullScars, normalizeHullScar } from './livingHull.js';
import { MODULES } from '../data/modules.js';
import { ENDGAME_CHOICES } from '../data/narrative.js';
import { PIRATE_PROMOTION_MAX_TIER, aceById } from '../data/namedAces.js';
import { TITLES, TITLES_SEEN_LIMIT } from '../data/titles.js';
import { WEAPONS } from '../data/weapons.js';
import { endingDef } from '../story/endings/endingDefs.js';
import {
  createPostEndingContinuity,
  normalizePostEndingContinuity,
} from '../story/endings/resolve.js';

export const NEW_GAME_PLUS_SCHEMA = 'spaceface.newGamePlus.v1';
const TITLE_BY_ID = new Map(TITLES.map((def) => [def.id, def]));
const TITLE_BY_NAME = new Map(TITLES.map((def) => [String(def.title || '').toLowerCase(), def]));
const LIVING_HULL_SCAR_CARRY_MAX = 24;
const WORLD_FACT_FLAG_MAX = 16;

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
  const scars = leftoverLivingHullScars(data);
  const titles = leftoverEarnedTitles(storyFromSaveData(data));
  const worldFacts = leftoverPostEndingWorldFacts(storyFromSaveData(data), sourceEnding);
  return {
    schema: NEW_GAME_PLUS_SCHEMA,
    sourceSlot: clean(source.slot),
    sourceSavedAt: clean(source.savedAt),
    sourceEnding,
    sourceEndingTitle: ending.title,
    keepsakes,
    grudgeCount: grudges.length,
    scarCount: scars.length,
    titleCount: titles.length,
    worldFactCount: worldFacts ? 1 : 0,
    worldFactTitle: worldFacts && worldFacts.title || '',
  };
}

/** New Run+ line on the leftover New Game sheet. HUD leftover uses its own LEGACY clauses. */
export function leftoverNewRunLine(candidate) {
  if (!candidate || candidate.schema !== NEW_GAME_PLUS_SCHEMA) return '';
  const grudgeCount = clampInt(candidate.grudgeCount, 0, 64);
  const scarCount = clampInt(candidate.scarCount, 0, LIVING_HULL_SCAR_CARRY_MAX);
  const titleCount = clampInt(candidate.titleCount, 0, TITLES_SEEN_LIMIT);
  const clauses = [
    clean(candidate.sourceEndingTitle),
    'keep one item',
    `${grudgeCount} unresolved hunter ${grudgeCount === 1 ? 'grudge' : 'grudges'}`,
  ];
  if (scarCount) clauses.push(`${scarCount} ${scarCount === 1 ? 'scar' : 'scars'}`);
  if (titleCount) clauses.push(`${titleCount} ${titleCount === 1 ? 'title' : 'titles'}`);
  const fact = clean(candidate.worldFactTitle);
  if (fact) clauses.push(fact);
  return clauses.filter(Boolean).join(' · ');
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
    scars: leftoverLivingHullScars(data),
    titles: leftoverEarnedTitles(story),
    worldFacts: leftoverPostEndingWorldFacts(story, candidate.sourceEnding),
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
    scars: leftoverScarList(overlay.scars),
    titles: leftoverTitleList(overlay.titles),
    worldFacts: leftoverWorldFactsRecord(overlay.worldFacts, sourceEnding),
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
    scars: leftoverScarList(input.scars),
    titles: leftoverTitleList(input.titles),
    worldFacts: leftoverWorldFactsRecord(input.worldFacts, sourceEnding),
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

function leftoverLivingHullScars(data) {
  const seen = new Set();
  const out = [];
  const hulls = leftoverHullSources(data);
  for (const hull of hulls) {
    for (const raw of livingHullScars(hull)) {
      const scar = leftoverScarRecord(raw);
      if (!scar || seen.has(scar.id)) continue;
      seen.add(scar.id);
      out.push(scar);
      if (out.length >= LIVING_HULL_SCAR_CARRY_MAX) return out;
    }
  }
  return out;
}

function leftoverHullSources(data) {
  const out = [];
  const player = data && data.player;
  const owned = player && Array.isArray(player.ownedShips) ? player.ownedShips : [];
  const active = owned[player && Number.isInteger(player.activeShipIndex) ? player.activeShipIndex : 0]
    || owned[0];
  if (active && active.livingHull) out.push(active.livingHull);
  for (const ship of owned) {
    if (ship && ship !== active && ship.livingHull) out.push(ship.livingHull);
  }
  const entity = data && data.entities && data.entities.player;
  if (entity && entity.data && entity.data.livingHull) out.push(entity.data.livingHull);
  return out;
}

function leftoverScarRecord(raw) {
  const scar = normalizeHullScar(raw);
  if (!scar) return null;
  return {
    id: scar.id,
    cause: scar.cause,
    surface: scar.surface,
    band: scar.band,
    facing: scar.facing,
    atT: scar.atT,
    tick: scar.tick,
    patchedAtT: scar.patchedAtT,
  };
}

function leftoverScarList(input) {
  if (!Array.isArray(input) || !input.length) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const scar = leftoverScarRecord(raw);
    if (!scar || seen.has(scar.id)) continue;
    seen.add(scar.id);
    out.push(scar);
    if (out.length >= LIVING_HULL_SCAR_CARRY_MAX) break;
  }
  return out;
}

function leftoverEarnedTitles(story) {
  const seen = new Set();
  const out = [];
  const titles = story && story.titles && typeof story.titles === 'object' ? story.titles : null;
  const byId = titles && titles.byId && typeof titles.byId === 'object' ? titles.byId : {};
  for (const raw of Array.isArray(story && story.titlesSeen) ? story.titlesSeen : []) {
    const title = leftoverTitleRecord(raw, byId);
    if (!title || seen.has(title.id)) continue;
    seen.add(title.id);
    out.push(title);
    if (out.length >= TITLES_SEEN_LIMIT) return out;
  }
  for (const id of Object.keys(byId).sort()) {
    const title = leftoverTitleRecord(byId[id], byId);
    if (!title || seen.has(title.id)) continue;
    seen.add(title.id);
    out.push(title);
    if (out.length >= TITLES_SEEN_LIMIT) break;
  }
  return out;
}

function leftoverTitleRecord(raw, byId = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const authored = leftoverAuthoredTitle(raw.id || raw.titleId || raw.title);
  const titleId = authored && authored.id
    || clean(raw.id || raw.titleId)
    || (raw.trickId ? `title_${clean(raw.trickId)}` : '');
  const titleName = authored && authored.title
    || clean(raw.title)
    || (raw.trickId ? clean(raw.trickId).replace(/_/g, ' ') : '');
  const holderKey = clean(raw.holderKey);
  if (!titleId || !titleName || !holderKey) return null;
  const live = byId && byId[titleId];
  const status = live && live.status === 'held' ? 'held' : 'seen';
  const record = {
    id: titleId,
    title: titleName,
    holderKey,
    status,
  };
  const trickId = clean(raw.trickId || (live && live.trickId));
  if (trickId) record.trickId = trickId;
  return record;
}

function leftoverAuthoredTitle(value) {
  const id = clean(value);
  if (TITLE_BY_ID.has(id)) return TITLE_BY_ID.get(id);
  return TITLE_BY_NAME.get(id.toLowerCase()) || null;
}

function leftoverTitleList(input) {
  if (!Array.isArray(input) || !input.length) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const title = leftoverTitleRecord(raw);
    if (!title || seen.has(title.id)) continue;
    seen.add(title.id);
    out.push(title);
    if (out.length >= TITLES_SEEN_LIMIT) break;
  }
  return out;
}

function leftoverPostEndingWorldFacts(story, sourceEnding) {
  const endingId = String(sourceEnding || (story && story.endgameChoice) || '').toUpperCase();
  const def = endingDef(endingId);
  if (!def || !def.continuity) return null;
  const continuity = normalizePostEndingContinuity(story && story.postEnding)
    || createPostEndingContinuity(def.id, 0, 0);
  if (!continuity || continuity.choiceId !== def.id) return null;
  const flags = leftoverEndingFlags(story && story.flags, def);
  return leftoverWorldFactsRecord({
    endingId: def.id,
    sandboxMode: continuity.sandboxMode || def.sandboxMode || null,
    directiveId: continuity.directiveId || def.continuity.id,
    title: continuity.title || def.continuity.title,
    replayHookId: continuity.replayHookId || def.continuity.replayHookId,
    flags,
  }, def.id);
}

function leftoverEndingFlags(flags, def) {
  const out = [];
  const seen = new Set();
  const authored = new Set(leftoverAuthoredEndingFlags(def));
  const bag = flags && typeof flags === 'object' && !Array.isArray(flags) ? flags : {};
  for (const key of leftoverAuthoredEndingFlags(def)) {
    if (bag[key] === true || bag[camelFlag(key)] === true) leftoverPushFlag(out, seen, key);
  }
  for (const key of Object.keys(bag).sort()) {
    if (bag[key] !== true) continue;
    const snake = leftoverSnakeFlag(key);
    if (!authored.has(snake) && !authored.has(key)) continue;
    leftoverPushFlag(out, seen, authored.has(key) ? key : snake);
  }
  return out;
}

function leftoverAuthoredEndingFlags(def) {
  const out = [];
  const intents = def && def.consequenceIntents;
  for (const flag of intents && Array.isArray(intents.flags) ? intents.flags : []) {
    if (typeof flag === 'string' && flag) out.push(flag);
  }
  if (intents && intents.identityErased) out.push('identity_erased');
  if (intents && intents.stayedAtAshfall) out.push('stayed_at_ashfall');
  if (intents && intents.contract47bPending) out.push('contract_47b_pending');
  return out;
}

function leftoverWorldFactsRecord(input, sourceEnding) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const endingId = String(input.endingId || sourceEnding || '').toUpperCase();
  const def = endingDef(endingId);
  if (!def || !def.continuity) return null;
  const authored = new Set(leftoverAuthoredEndingFlags(def));
  const flags = [];
  const seen = new Set();
  for (const raw of Array.isArray(input.flags) ? input.flags : []) {
    const flag = leftoverSnakeFlag(raw);
    if (!authored.has(flag)) continue;
    leftoverPushFlag(flags, seen, flag);
  }
  const directiveId = clean(input.directiveId) || def.continuity.id;
  const title = clean(input.title) || def.continuity.title;
  const replayHookId = clean(input.replayHookId) || def.continuity.replayHookId;
  if (directiveId !== def.continuity.id) return null;
  return {
    endingId: def.id,
    sandboxMode: clean(input.sandboxMode) || def.sandboxMode || null,
    directiveId,
    title,
    replayHookId,
    flags,
  };
}

function leftoverPushFlag(out, seen, flag) {
  if (!flag || seen.has(flag) || out.length >= WORLD_FACT_FLAG_MAX) return;
  seen.add(flag);
  out.push(flag);
}

function leftoverSnakeFlag(value) {
  return clean(value).replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`).replace(/^_/, '');
}

function camelFlag(value) {
  return clean(value).replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
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
