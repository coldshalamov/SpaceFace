// Scanner pulse system (GDD 2.0 §7.4).
//
// Consumes the locked input edge `state.input.actions.scanPulse` and annotates live entities with
// plain data fields that UI/render layers can read. No RNG; all durations are simTime-based.
import { ASTEROIDS } from '../data/mining.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';

const PULSE_COOLDOWN_S = 8;
const NEAR_SCAN_RADIUS = 1200;
const HIDDEN_POI_RADIUS = 2000;
const ASTEROID_HIGHLIGHT_S = 20;
const PINGED_S = 45;

const ASTEROID_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const ORE_GLYPH_BY_TAG = Object.freeze({
  common: 'Si',
  metal: 'Fe',
  ice: 'H2O',
  gas: 'Gas',
  crystal: 'Cr',
  exotic: 'Xe',
  rare: 'Xe',
});

function pos2(pos) {
  return { x: Number(pos && pos.x) || 0, z: Number(pos && pos.z) || 0 };
}

function dist(posA, posB) {
  return Math.hypot((posA.x || 0) - (posB.x || 0), (posA.z || 0) - (posB.z || 0));
}

function oreGlyphForAsteroid(entity) {
  const typeId = entity && entity.data && entity.data.typeId;
  const def = ASTEROID_BY_ID.get(typeId);
  const table = def && def.oreTable;
  let bestOre = null;
  let bestWeight = -1;
  if (table) {
    for (const oreId in table) {
      if (table[oreId] > bestWeight) {
        bestOre = oreId;
        bestWeight = table[oreId];
      }
    }
  }
  if (bestOre) {
    if (bestOre.includes('ice')) return 'H2O';
    if (bestOre.includes('gas')) return 'Gas';
    if (bestOre.includes('crystal')) return 'Cr';
    if (bestOre.includes('exotic')) return 'Xe';
    if (bestOre.includes('ore')) return 'Fe';
  }
  const tags = def && def.oreTable ? Object.keys(def.oreTable).join(' ') : String(typeId || '');
  for (const tag in ORE_GLYPH_BY_TAG) if (tags.includes(tag)) return ORE_GLYPH_BY_TAG[tag];
  return 'Ore';
}

function isWreckLike(entity) {
  const data = entity && entity.data || {};
  return entity && (
    entity.type === 'wreck' ||
    data.poiType === 'wreck' ||
    data.kind === 'wreck' ||
    data.kind === 'derelict' ||
    data.salvage === true
  );
}

// Weak-point callout resolved on a wreck scan. Deterministic from the entity id so a re-scan (or a
// second look at the same derelict this session) names the same subsystem — no per-frame flicker.
const WEAK_POINTS = ['REACTOR CORE', 'FUEL CELLS', 'MAGAZINE', 'SHIELD NODE', 'CARGO SEAL', 'DRIVE COIL'];
function weakPointFor(entity) {
  const id = entity && entity.id != null ? String(entity.id) : '0';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
  return WEAK_POINTS[h % WEAK_POINTS.length];
}

// Turn a wreck's salvage contents into a compact manifest [{ id, qty }] the contacts strip resolves
// from the "??? UNSCANNED" ghost once a scan pulse lands. Reads salvagePool (id→units) + any loot.
function buildWreckManifest(entity) {
  const out = [];
  const pool = entity && entity.data && entity.data.salvagePool;
  if (pool && typeof pool === 'object') {
    for (const id in pool) {
      const qty = Math.round(Number(pool[id]) || 0);
      if (qty > 0) out.push({ id, qty });
    }
  }
  const loot = entity && entity.data && entity.data.loot;
  if (Array.isArray(loot)) {
    for (const item of loot) {
      if (!item) continue;
      const id = item.commodityId || item.id;
      const qty = Math.round(Number(item.amount != null ? item.amount : item.qty) || 0);
      if (id && qty > 0) out.push({ id, qty });
    }
  }
  return out;
}

function isCargoLike(entity) {
  const data = entity && entity.data || {};
  return entity && (
    entity.type === 'cargo' ||
    entity.type === 'pickup' ||
    data.kind === 'cargo' ||
    data.commodityId
  );
}

function isAnomalyLike(entity) {
  const data = entity && entity.data || {};
  return entity && (entity.type === 'anomaly' || data.poiType === 'anomaly');
}

function ensurePingBucket(state, sectorId) {
  if (!state.world.scanPings || typeof state.world.scanPings !== 'object') state.world.scanPings = {};
  const list = state.world.scanPings[sectorId];
  if (Array.isArray(list)) return list;
  state.world.scanPings[sectorId] = [];
  return state.world.scanPings[sectorId];
}

function upsertUnknownPing(state, sectorId, ping) {
  const list = ensurePingBucket(state, sectorId);
  const existing = list.find((item) => item && item.id === ping.id);
  if (existing) {
    existing.pos = pos2(ping.pos);
    existing.kind = 'unknown';
    return false;
  }
  list.push({ id: ping.id, pos: pos2(ping.pos), kind: 'unknown' });
  return true;
}

export const scanner = {
  name: 'scanner',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._scratch = [];
    this._cooldownUntil = 0;
  },

  update(_dt, state) {
    if (state.mode !== 'flight') return;
    const actions = state.input && state.input.actions;
    if (!actions?.scanPulse) return;
    actions.scanPulse = false;

    const now = state.simTime || 0;
    if (now < this._cooldownUntil) return;

    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!player || !player.alive) return;

    this._cooldownUntil = now + PULSE_COOLDOWN_S;
    this._pulse(state, player, now);
  },

  _pulse(state, player, now) {
    const sectorId = state.world && state.world.currentSectorId || null;
    const origin = pos2(player.pos);
    const found = { asteroids: 0, wrecks: 0, anomalies: 0 };
    const candidates = queryNearbyEntities(state, origin, NEAR_SCAN_RADIUS, this._scratch, state.entityList);

    this.bus.emit('scan:pulse', { pos: origin });

    for (const entity of candidates) {
      if (!entity || !entity.alive || entity.id === player.id || !entity.pos) continue;
      if (dist(origin, entity.pos) > NEAR_SCAN_RADIUS) continue;
      const data = entity.data || (entity.data = {});
      if (entity.type === 'asteroid') {
        data.scanHighlightUntil = now + ASTEROID_HIGHLIGHT_S;
        data.scanOreGlyph = oreGlyphForAsteroid(entity);
        found.asteroids++;
      } else if (isWreckLike(entity)) {
        data.pingedUntil = now + PINGED_S;
        // Scan-resolve the derelict: the strip's "??? UNSCANNED" ghost fills in with a manifest +
        // a weak-point callout (GDD 2.0 §7.4 "scanning resolves the outline into a manifest").
        data.scanned = true;
        data.manifest = buildWreckManifest(entity);
        if (!data.weakPoint) data.weakPoint = weakPointFor(entity);
        found.wrecks++;
      } else if (isCargoLike(entity)) {
        data.pingedUntil = now + PINGED_S;
      } else if (isAnomalyLike(entity)) {
        data.pingedUntil = now + PINGED_S;
        found.anomalies++;
      }
    }

    if (sectorId) this._pingHiddenPois(state, sectorId, origin);
    this.bus.emit('scan:completed', { targetId: null, sectorId, found });
  },

  _pingHiddenPois(state, sectorId, origin) {
    const active = state.world && state.world.activeSector;
    for (const poi of active && active.pois || []) {
      if (!poi || !(poi.hidden || poi.type === 'anomaly')) continue;
      const entity = state.entities && state.entities.get && state.entities.get(poi.id);
      const pos = entity && entity.pos || poi.pos;
      if (!pos || dist(origin, pos) > HIDDEN_POI_RADIUS) continue;
      upsertUnknownPing(state, sectorId, {
        id: poi.poiId || `poi_${poi.id}`,
        pos,
        kind: 'unknown',
      });
    }
  },
};

// ── Contact classification (Radar & Contacts — on-demand threat list) ────────────────────────
// Pure, allocation-free readers the HUD contacts strip (hud.js updateOverview) uses to turn a live
// entity into an at-a-glance threat readout: a mass-based tier, a one-word state, and a
// scanned/unscanned gate for derelicts. Kept next to the scan pulse that resolves them so the
// "what is this contact" logic has a single home (goal: "Lives in radar.js and scanner.js").

const THREAT_MASS_TIERS = [300, 1200, 4000]; // mass thresholds for tier 1 / 2 / 3

export function contactMass(e) {
  if (!e) return 0;
  if (typeof e.mass === 'number') return e.mass;
  return (e.data && typeof e.data.mass === 'number') ? e.data.mass : 0;
}

// 0..3 threat tier. Mass sets the base ("how much hull is pointed at you"); a hostile contact is
// floored at tier 1 so even a light interceptor reads as a live threat (the "+ faction" term).
export function contactThreatTier(e, hostile) {
  const m = contactMass(e);
  let tier = 0;
  for (let i = 0; i < THREAT_MASS_TIERS.length; i++) if (m >= THREAT_MASS_TIERS[i]) tier = i + 1;
  if (hostile && tier < 1) tier = 1;
  return tier;
}

// One-word contact state for the strip. Derelicts read DERELICT; player-aligned ships WINGMAN/ALLY;
// opposing ships resolve to HOSTILE / PATROL / TRADER / MINER via AI signals, with a plain team
// fallback so a contact never renders blank (respects the "one word" contract).
export function contactStateWord(e, playerTeam, state) {
  if (isWreckLike(e)) return 'DERELICT';
  const playerId = state && state.playerId;
  if (e.team === 0 && e.id !== playerId) return (e.data && e.data.isWingman) ? 'WINGMAN' : 'ALLY';
  const ai = e.data && e.data.ai;
  const combat = e.data && e.data.combat;
  const targetsPlayer = !!(combat && playerId != null && combat.targetId === playerId);
  const attacking = !!(ai && (ai.fsm === 'attack' || ai.fsm === 'pursue' || ai.fsm === 'strafe'));
  if (attacking || targetsPlayer) return 'HOSTILE';
  if (ai) {
    if (ai.lawful) return 'PATROL';
    if (ai.passive) return 'TRADER';
    const arch = String(ai.archetype || '');
    if (arch.includes('min')) return 'MINER';
    if (arch.includes('trad')) return 'TRADER';
  }
  if (e.team !== playerTeam && e.team !== 0) return 'HOSTILE';
  return 'NEUTRAL';
}

// Has a derelict/wreck been scan-resolved (manifest known)? Unscanned wrecks show only a ghost
// outline in the strip; a scan pulse fills in the manifest + weak point.
export function wreckScanned(e) {
  return !!(e && e.data && e.data.scanned);
}

export { isWreckLike };
