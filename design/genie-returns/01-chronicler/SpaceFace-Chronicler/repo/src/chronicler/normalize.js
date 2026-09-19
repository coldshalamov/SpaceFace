import { finite, id, text, ref, refKey, FACT_EVENTS } from './schema.js';

const EVENTS = new Set(FACT_EVENTS);
const CAUSES = new Set(['generic', 'kinetic', 'explosive', 'terrain_collision', 'ship_collision']);
const SURFACES = new Set(['terrain', 'craft', 'structure']);
const ACE_TRANSITIONS = new Set(['encountered', 'fled', 'defeated', 'flung', 'returned']);
const PROOF_STAGES = new Set(['recovered', 'sold', 'law']);
const MAX_QTY = 1e12;

function entity(state, entityId) {
  return entityId != null && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(entityId) : null;
}
function nameOf(state, entityId, supplied, fallback) {
  const e = entity(state, entityId);
  return text(supplied || (e && (e.name || e.data?.name || e.data?.callsign || e.data?.label)), fallback);
}
function identity(state, entityId, supplied, playerCaused = false, fallback = 'an unknown pilot') {
  const key = id(entityId);
  const player = playerCaused || (key !== null && key === id(state.playerId));
  return { id: key, key: player ? 'player' : key, player,
    name: nameOf(state, entityId, supplied, player ? 'you' : fallback) };
}
function firstRef(...refs) { return refs.find(Boolean) || null; }
function point(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z } : null;
}
function positive(n) { return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= MAX_QTY; }
function killFacts(p, state) {
  // Match compactKillCausality's precedence. Copy only semantic scalars from presentation;
  // NEVER retain that receipt, its vectors, Three objects, or arbitrary source data.
  const receipt = p.presentation;
  const cause = [receipt?.cause, p.cause].find(c => CAUSES.has(c)) || 'generic';
  const playerCaused = typeof receipt?.playerCaused === 'boolean'
    ? receipt.playerCaused : p.killerId != null && p.killerId === state.playerId;
  const surface = SURFACES.has(receipt?.surface) ? receipt.surface
    : cause === 'terrain_collision' ? 'terrain' : cause === 'ship_collision' ? 'craft' : null;
  return { cause, playerCaused, surface };
}

/**
 * Whitelist a bus payload into a bounded JSON fact. `null` means normal filtered noise;
 * `{ invalid: true }` means a recognized, malformed receipt. No arbitrary payload spreading.
 * All observation times come from state.simTime, never from a source-supplied timestamp.
 */
export function normalizeFact(event, p, state) {
  if (!EVENTS.has(event)) return null;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { invalid: true };
  const t = Math.max(0, finite(state.simTime));
  const tick = Number.isSafeInteger(state.tick) ? Math.max(0, state.tick) : Math.round(t * 60);
  const currentSectorId = id(state.world?.currentSectorId);
  const sectorId = id(p.sectorId) || (event.startsWith('aceMemory:') ? id(p.record?.lastSectorId) : null) || currentSectorId;
  const common = {
    event, stage: '', t, tick,
    sectorId, sectorName: text(p.sectorName || (sectorId === currentSectorId ? state.world?.activeSector?.name : '')),
    zoneId: id(p.zoneId), zoneName: text(p.zoneName),
    stationId: id(p.stationId), stationName: text(p.stationName),
    factionId: id(p.factionId || p.victimFactionId),
    visibility: ['private', 'player'].includes(p.visibility) ? p.visibility : 'public',
    actor: identity(state, p.actorId), subject: null,
    externalId: id(p.receiptId || p.eventId),
    provides: [], parent: null, group: null,
    details: {}, dedupe: '',
  };
  const f = common;
  switch (event) {
    case 'entity:killed': {
      const victim = p.id ?? p.victimId;
      if (id(victim) === null) return { invalid: true };
      const k = killFacts(p, state);
      f.stage = 'kill';
      f.actor = identity(state, p.killerId, p.killerName, k.playerCaused);
      // Explicit false on a physics receipt must override killerId fallback for PLAYER credit.
      f.actor.player = k.playerCaused;
      f.actor.key = k.playerCaused ? 'player' : id(p.killerId);
      if (!k.playerCaused && id(p.killerId) === id(state.playerId)) f.actor.name = text(p.killerName, 'an uncredited impact');
      f.subject = identity(state, victim, p.victimName || p.victimLabel, false, 'an unnamed ship');
      f.provides = [ref('death', victim)];
      f.group = id(p.encounterId) ? `encounter:${id(p.encounterId)}` : null;
      f.details = { ...k, victimClass: text(p.victimClass, 'ship', 48),
        factionLawful: p.factionLawful === true, pos: point(p.pos) };
      f.dedupe = `kill:${JSON.stringify([id(victim), id(p.killId) || f.externalId || tick])}`;
      break;
    }
    case 'aftermathWreck:recorded':
    case 'loot:manifestPayload': {
      const marker = event === 'aftermathWreck:recorded';
      const object = marker ? p.markerId : p.payloadId;
      if (id(object) === null) return { invalid: true };
      f.stage = 'aftermath';
      f.actor = identity(state, p.killerId, p.killerName);
      f.subject = identity(state, p.victimId, p.victimLabel || p.victimName, false, 'an unnamed ship');
      f.provides = [ref(marker ? 'marker' : 'wreck', object)];
      f.parent = ref('death', p.victimId);
      f.group = id(p.encounterId) ? `encounter:${id(p.encounterId)}` : null;
      f.details = { markerId: marker ? id(object) : null, wreckId: marker ? null : id(object),
        victimId: id(p.victimId), sourceKind: marker ? 'wreck' : 'manifest', pos: point(p.pos) };
      f.dedupe = `${event}:${id(object)}`;
      break;
    }
    case 'aftermathWreck:spawned': {
      if (id(p.entityId) === null || id(p.markerId) === null) return { invalid: true };
      f.stage = 'binding';
      f.parent = ref('marker', p.markerId);
      f.provides = [ref('wreck', p.entityId)];
      f.details = { markerId: id(p.markerId), wreckId: id(p.entityId) };
      f.dedupe = `binding:${JSON.stringify([p.markerId, id(p.entityId)])}`;
      break;
    }
    case 'salvage:completed': {
      if (id(p.wreckId) === null && id(p.markerId) === null) return { invalid: true };
      f.stage = 'salvage';
      f.actor = identity(state, p.actorId ?? state.playerId);
      f.parent = firstRef(ref('marker', p.markerId), ref('wreck', p.wreckId));
      // These aliases deliberately allow a recovery receipt to choose a processed wreck rather
      // than the earlier unprocessed marker. Stage restrictions in the ledger prevent cycles.
      f.provides = [ref('marker', p.markerId), ref('wreck', p.wreckId)].filter(Boolean);
      // `loot` in stock mining is the FINAL DRAIN BATCH, not total salvage or collected cargo.
      // Do not count it as acquired cargo. This fact asserts processing completion only.
      f.details = { markerId: id(p.markerId), wreckId: id(p.wreckId) };
      f.dedupe = `salvage:${id(p.markerId) || id(p.wreckId)}`;
      break;
    }
    case 'chronicler:provenance': {
      if (!PROOF_STAGES.has(p.stage) || !id(p.receiptId) || !p.source
        || !ref(p.source.kind, p.source.id) || id(p.actorId) === null) return { invalid: true };
      if (p.stage !== 'law' && (!id(p.commodityId) || !positive(p.qty))) return { invalid: true };
      if (p.stage === 'sold' && (!id(p.stationId) || !Number.isFinite(p.total) || p.total < 0 || p.total > MAX_QTY)) {
        return { invalid: true };
      }
      // Recovery must identify an actual wreck/marker. A sale must identify a recovery RECEIPT.
      // Legal causality must identify the receipt which the authoritative law owner validated.
      const allowed = p.stage === 'recovered' ? ['marker', 'wreck'] : ['receipt'];
      if (!allowed.includes(p.source.kind)) return { invalid: true };
      f.stage = p.stage;
      f.externalId = id(p.receiptId);
      f.actor = identity(state, p.actorId, p.actorName);
      f.parent = ref(p.source.kind, p.source.id);
      f.details = { commodityId: id(p.commodityId), qty: finite(p.qty), total: finite(p.total),
        kind: text(p.kind, p.stage === 'law' ? 'legal action' : p.stage, 64) };
      if (p.stage === 'sold') f.group = `transaction:${f.externalId}`;
      f.dedupe = `receipt:${f.externalId}`;
      break;
    }
    case 'economy:tradeCompleted': {
      if (p.side !== 'sell') return null;
      if (!id(p.commodityId) || !id(p.stationId) || !positive(p.qty)
        || !Number.isFinite(p.total) || p.total < 0) return { invalid: true };
      f.stage = 'trade';
      if (f.externalId) f.group = `transaction:${f.externalId}`;
      f.actor = identity(state, p.actorId ?? state.playerId);
      f.details = { commodityId: id(p.commodityId), qty: p.qty, total: p.total,
        provenanceMissing: true };
      // Unproven native sales remain independent. No FIFO guess, commodity coincidence, or
      // "last wreck" heuristic is allowed to transform this into a recovered-cargo sale.
      f.dedupe = f.externalId ? `trade:${f.externalId}`
        : `trade:${JSON.stringify([tick, f.stationId, f.details])}`;
      break;
    }
    case 'aceMemory:transition':
    case 'aceMemory:returnSpawned': {
      const aceId = id(p.aceId);
      const transition = event === 'aceMemory:returnSpawned' ? 'returned' : p.transition;
      if (!aceId || !ACE_TRANSITIONS.has(transition)) return null;
      f.stage = 'ace';
      f.actor = identity(state, state.playerId);
      f.subject = { id: aceId, key: `ace:${aceId}`, player: false, name: text(p.aceName || p.name, aceId) };
      f.group = `ace:${aceId}`;
      f.details = { transition, aceId, crew: text(p.crew),
        count: Math.max(0, finite(p.record?.encounterCount)),
        returnTier: Math.max(0, finite(p.returnTier ?? p.tier ?? p.record?.returnTier)) };
      f.dedupe = `ace:${JSON.stringify([aceId, transition, f.externalId || tick, f.details.count])}`;
      break;
    }
    case 'distress:rescued': {
      f.stage = 'rescue';
      f.actor = identity(state, p.rescuerId ?? p.actorId ?? state.playerId);
      const target = p.targetId ?? p.shipId ?? p.entityId ?? p.id ?? p.distressId;
      f.subject = identity(state, target, p.name || p.shipName, false, 'a ship in distress');
      f.details = { encounterId: id(p.encounterId) };
      f.dedupe = `rescue:${f.externalId || id(p.distressId) || JSON.stringify([id(target), tick])}`;
      break;
    }
    case 'heat:changed': {
      if (!Number.isFinite(p.level) || !Number.isFinite(p.value)) return { invalid: true };
      const level = Math.max(0, Math.min(5, Math.floor(p.level)));
      const previous = Number.isFinite(p.previousLevel) ? Math.max(0, Math.min(5, Math.floor(p.previousLevel)))
        : p.previousValue >= (p.threshold ?? 0.15) ? Math.max(1, Math.ceil(p.previousValue * 5)) : 0;
      if (level === previous && !p.wantedCrossed) return null;
      f.stage = 'wanted';
      f.actor = identity(state, state.playerId);
      f.details = { level, previousLevel: previous, reason: text(p.reason, 'status change', 120),
        tier: text(p.tier, level ? 'wanted' : 'none', 32), cleared: level === 0 };
      f.dedupe = `wanted:${JSON.stringify([tick, level, previous, f.details.reason])}`;
      break;
    }
    case 'contraband:scanned': {
      if (p.found !== true) return null;
      f.stage = 'scan'; f.actor = identity(state, state.playerId);
      f.details = { found: true };
      f.dedupe = f.externalId ? `scan:${f.externalId}` : `scan:${JSON.stringify([tick, p.scannerId ?? null])}`;
      break;
    }
    case 'salvage:reactorVented':
    case 'salvage:reactorTowedClear':
    case 'salvage:reactorBurst': {
      const wreck = id(p.wreckId ?? p.targetId);
      if (!wreck) return { invalid: true };
      f.stage = 'reactor';
      f.actor = identity(state, p.actorId ?? state.playerId);
      f.parent = ref('wreck', wreck);
      f.details = { outcome: event.split(':')[1], wreckId: wreck };
      f.dedupe = `${event}:${wreck}`;
      break;
    }
    case 'aftermath:causeRecorded': {
      const key = id(p.fingerprint || p.causeId);
      if (!key) return { invalid: true };
      f.stage = 'cause';
      f.provides = [ref('cause', key)];
      f.group = id(p.encounterId) ? `encounter:${id(p.encounterId)}` : null;
      f.details = { kind: text(p.consequenceKind, 'aftermath', 64) };
      f.dedupe = `cause:${key}`;
      break;
    }
    case 'aftermath:remedied': {
      const key = id(p.fingerprint || p.causeId);
      if (!key) return { invalid: true };
      f.stage = 'remedy';
      f.parent = ref('cause', key);
      f.actor = identity(state, p.actorId ?? state.playerId);
      f.details = { missionId: id(p.missionId), kind: text(p.consequenceKind, 'aftermath', 64) };
      f.dedupe = `remedy:${JSON.stringify([key, f.details.missionId])}`;
      break;
    }
    default: return null;
  }
  f.provides = f.provides.filter(Boolean);
  if (f.externalId) f.provides.push(ref('receipt', f.externalId));
  f.provides = f.provides.filter((r, i, all) => all.findIndex(x => refKey(x) === refKey(r)) === i);
  return f;
}
