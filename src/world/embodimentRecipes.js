// World-owned cache + durable-record adapter for sectorSim embodiment intents (M2-C2/C3).
//
// sectorSim emits recipes only. This module never creates live entities and never writes
// credits/cargo/rep/hull. systems/world.js is the sole consumer and chooses when a recipe
// becomes a durable record (FULL residency promotion), preserving the world authority line.

import { sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { RECORD_KIND, stableRecordId } from './worldRecords.js';

export const WORLD_EMBODIMENT_SCHEMA_ID = 'spaceface.worldEmbodimentCache.v1';
export const SECTOR_EMBODIMENT_SCHEMA_ID = 'spaceface.sectorEmbodimentIntent.v1';
export const MAX_EMBODIMENT_INTENTS_PER_SECTOR = 32;

const RETAINED_KINDS = new Set([
  'traffic_density',
  'danger_presence',
  'market_pressure',
  'convoy_itinerary',
  'patrol_presence',
  'raid_presence',
  'intel_signal',
]);

const RECORD_KINDS = new Set([
  'convoy_itinerary',
  'patrol_presence',
  'raid_presence',
]);

export function createEmptyEmbodimentCache() {
  return {
    schemaId: WORLD_EMBODIMENT_SCHEMA_ID,
    schemaVersion: 1,
    bySector: {},
  };
}

export function normalizeEmbodimentCache(raw) {
  const out = createEmptyEmbodimentCache();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const src = raw.bySector && typeof raw.bySector === 'object' && !Array.isArray(raw.bySector)
    ? raw.bySector
    : {};
  for (const sectorId of Object.keys(src).sort()) {
    const rec = src[sectorId];
    if (!rec || typeof rec !== 'object' || !Number.isInteger(rec.epochKey)) continue;
    const intents = normalizeIntentList(rec.intents, sectorId);
    out.bySector[sectorId] = {
      epochKey: rec.epochKey,
      epochDays: finiteNumber(rec.epochDays, 0),
      digest: Number.isFinite(rec.digest) ? (rec.digest >>> 0) : 0,
      intents,
    };
  }
  return out;
}

export function serializeEmbodimentCache(cache) {
  return normalizeEmbodimentCache(cache);
}

/**
 * Consume one sectorSim event into a bounded latest-epoch cache.
 * Same-epoch partial events merge by intentId; newer epochs replace the sector snapshot.
 * Older epochs are ignored. No live entities or durable records are created here.
 */
export function consumeEmbodimentPayload(cache, payload) {
  const target = cache && cache.bySector ? cache : createEmptyEmbodimentCache();
  if (!payload || payload.schemaId !== SECTOR_EMBODIMENT_SCHEMA_ID) return { cache: target, accepted: 0 };
  if (!Number.isInteger(payload.epochKey) || !Array.isArray(payload.intents)) return { cache: target, accepted: 0 };

  const grouped = new Map();
  for (const raw of payload.intents) {
    const sectorId = raw && typeof raw.sectorId === 'string' ? raw.sectorId : null;
    if (!sectorId) continue;
    const normalized = normalizeIntent(raw, sectorId);
    if (!normalized) continue;
    if (!grouped.has(sectorId)) grouped.set(sectorId, []);
    grouped.get(sectorId).push(normalized);
  }

  let accepted = 0;
  for (const sectorId of Array.from(grouped.keys()).sort()) {
    const current = target.bySector[sectorId];
    if (current && payload.epochKey < current.epochKey) continue;
    const incoming = grouped.get(sectorId);
    let intents = incoming;
    if (current && payload.epochKey === current.epochKey) {
      const byId = new Map(current.intents.map((it) => [it.intentId, it]));
      for (const it of incoming) byId.set(it.intentId, it);
      intents = Array.from(byId.values());
    }
    intents.sort(compareIntent);
    if (intents.length > MAX_EMBODIMENT_INTENTS_PER_SECTOR) {
      intents = intents.slice(0, MAX_EMBODIMENT_INTENTS_PER_SECTOR);
    }
    target.bySector[sectorId] = {
      epochKey: payload.epochKey,
      epochDays: finiteNumber(payload.epochDays, 0),
      digest: Number.isFinite(payload.digest) ? (payload.digest >>> 0) : 0,
      intents,
    };
    accepted += incoming.length;
  }
  return { cache: target, accepted };
}

export function embodimentRecordIntents(cache, sectorId) {
  const normalized = normalizeEmbodimentCache(cache);
  const sector = normalized.bySector[sectorId];
  if (!sector) return [];
  return sector.intents.filter((it) => RECORD_KINDS.has(it.kind));
}

/** Convert one retained record-backed recipe into a normalized-record-shaped object. */
export function recordFromEmbodimentIntent(intent, opts = {}) {
  if (!intent || !RECORD_KINDS.has(intent.kind) || !intent.sectorId) return null;
  const seed = (opts.seed >>> 0) || 1;
  const sectorId = intent.sectorId;
  const kind = intent.kind === 'convoy_itinerary' ? RECORD_KIND.CONVOY : RECORD_KIND.NPC;
  const identityKey = intent.identityKey || `${intent.kind}:${intent.intentId}`;
  const expectedId = stableRecordId(seed, sectorId, kind, identityKey);
  // Re-derive locally instead of trusting an event-provided id across the authority boundary.
  const recordId = expectedId;
  const pos = deterministicRecipePosition(recordId, sectorId);
  const payload = intent.payload || {};
  const slot = Number.isFinite(payload.slot) ? payload.slot : 0;
  const base = {
    recordId,
    kind,
    sectorId,
    homeSectorId: sectorId,
    pos,
    vel: { x: 0, z: 0 },
    rot: recipeUnit(recordId, 11) * Math.PI * 2,
    angVel: 0,
    type: 'ship',
    level: 1 + Math.floor(recipeUnit(recordId, 19) * 3),
    hull: null,
    hullMax: null,
    shield: null,
    shieldMax: null,
    armorHp: null,
    armorMax: null,
    alive: true,
    outcome: 'active',
    epoch: intent.epochKey | 0,
    createdTick: opts.tick | 0,
    lastSeenTick: opts.tick | 0,
    durableReason: `sector_embodiment:${intent.kind}`,
    identityKey,
    recordSource: 'sector_embodiment',
    recipeKey: `${intent.kind}:${slot}`,
  };

  if (intent.kind === 'convoy_itinerary') {
    return {
      ...base,
      shipDefId: 'ship_mule',
      factionId: payload.preferredFactionId || opts.fallbackFactionId || 'faction_free',
      team: 2,
      trafficRole: typeof payload.role === 'string' ? payload.role : 'lane_hauler',
      trafficLabel: typeof payload.role === 'string' ? payload.role.replaceAll('_', ' ') : 'lane hauler',
      itinerary: {
        source: 'sector_embodiment',
        epochKey: intent.epochKey | 0,
        slot,
        scarcity: !!payload.scarcity,
      },
      ai: { archetype: 'fleeing_trader', passive: true },
    };
  }

  if (intent.kind === 'patrol_presence') {
    return {
      ...base,
      enemyTypeId: 'patrol_lawman',
      shipDefId: 'ship_hornet',
      factionId: 'faction_scn',
      team: 1,
      ai: { archetype: 'brawler', lawful: true },
    };
  }

  return {
    ...base,
    enemyTypeId: 'reaver_pirate',
    shipDefId: 'ship_drifter',
    factionId: 'faction_reach',
    team: 1,
    ai: { archetype: 'pirate', lawful: false },
  };
}

function normalizeIntent(raw, sectorId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schemaId !== SECTOR_EMBODIMENT_SCHEMA_ID) return null;
  if (typeof raw.intentId !== 'string' || !raw.intentId || !RETAINED_KINDS.has(raw.kind)) return null;
  if (!Number.isInteger(raw.epochKey)) return null;
  const payload = clonePlain(raw.payload);
  return {
    schemaId: SECTOR_EMBODIMENT_SCHEMA_ID,
    schemaVersion: 1,
    intentId: raw.intentId,
    sectorId,
    kind: raw.kind,
    epochKey: raw.epochKey,
    epochDays: finiteNumber(raw.epochDays, 0),
    source: 'sector_field',
    proposedRecordId: typeof raw.proposedRecordId === 'string' ? raw.proposedRecordId : null,
    proposedRecordKind: typeof raw.proposedRecordKind === 'string' ? raw.proposedRecordKind : null,
    identityKey: raw.identityKey != null ? String(raw.identityKey) : null,
    payload,
  };
}

function normalizeIntentList(raw, sectorId) {
  if (!Array.isArray(raw)) return [];
  const byId = new Map();
  for (const item of raw) {
    const intent = normalizeIntent(item, sectorId);
    if (intent) byId.set(intent.intentId, intent);
  }
  return Array.from(byId.values()).sort(compareIntent).slice(0, MAX_EMBODIMENT_INTENTS_PER_SECTOR);
}

function compareIntent(a, b) {
  return a.intentId.localeCompare(b.intentId) || a.kind.localeCompare(b.kind);
}

function clonePlain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return {}; }
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function deterministicRecipePosition(recordId, sectorId) {
  const origin = sectorGlobalOrigin(sectorId);
  const angle = recipeUnit(recordId, 3) * Math.PI * 2;
  const radius = 720 + recipeUnit(recordId, 7) * 1180;
  return {
    x: origin.x + Math.cos(angle) * radius,
    z: origin.z + Math.sin(angle) * radius,
  };
}

function recipeUnit(recordId, salt) {
  const hex = String(recordId || '').split('_').pop() || '0';
  let value = Number.parseInt(hex.slice(-8), 16) >>> 0;
  value = Math.imul(value ^ (salt >>> 0), 0x45d9f3b) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}
