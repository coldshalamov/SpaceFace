// BP-13/B14 Ambush Signatures.
//
// Thin backend layer over encounterDirector pending plans. It places deterministic passive tell
// records before ambushes fire and reveals them through the existing scan:pulse event.
import { hash32, mulberry32 } from '../core/rng.js';
import {
  ambushSignatureForShape as signatureForShape,
  hasAmbushSignature,
} from '../data/ambushSignatures.js';
import { zonesForSector } from '../data/sectorZones.js';

export { ambushSignatureForShape } from '../data/ambushSignatures.js';

export const AMBUSH_SIGNATURE_SCAN_RADIUS = 1200;
const STATE_VERSION = 1;

export const ambushSignatures = {
  name: 'ambushSignatures',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._subs = [];
    ensureState(this.state);
    this._listen('scan:pulse', (p) => this._onScanPulse(p));
    // Continuous free-flight membership handoff (M2-C1): keep active ambush tells so scan
    // reveals survive Voronoi edges. Hard wipe only on intentional jump / load / non-continuous exit.
    this._listen('sector:exit', (p) => {
      if (p && (p.continuous || p.noTeleport)) return;
      if (this.state) this.state.ambushSignatures = freshState();
    });
  },

  newGame() {
    if (this.state) this.state.ambushSignatures = freshState();
  },

  update(_dt, state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    this.state = state;
    syncPendingTells(state);
  },

  destroy() {
    for (const off of this._subs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._subs = [];
  },

  _listen(evt, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(evt, fn);
    if (typeof off === 'function') this._subs.push(off);
  },

  _onScanPulse(payload) {
    if (!this.state) return;
    const origin = payload && payload.pos;
    if (!origin) return;
    const sectorId = currentSectorId(this.state);
    const own = ensureState(this.state);
    const now = this.state.simTime || 0;
    for (const tell of Object.values(own.tells)) {
      if (!tell || tell.sectorId !== sectorId || tell.scanned || tell.active === false) continue;
      const d = Math.hypot((tell.pos.x || 0) - (origin.x || 0), (tell.pos.z || 0) - (origin.z || 0));
      if (d > AMBUSH_SIGNATURE_SCAN_RADIUS) continue;
      tell.scanned = true;
      tell.scannedAt = now;
      tell.revealUntil = now + 45;
      const event = {
        tellId: tell.id,
        encounterId: tell.encounterId,
        shapeId: tell.shapeId,
        signatureId: tell.signatureId,
        label: tell.label,
        hint: tell.hint,
        sectorId: tell.sectorId,
        zoneId: tell.zoneId,
        zoneName: tell.zoneName,
        pos: { x: tell.pos.x, z: tell.pos.z },
      };
      own.lastScan = event;
      emit(this.bus, 'ambushSignature:scanned', event);
    }
  },
};

export function activeAmbushSignatureTells(state) {
  const own = state && state.ambushSignatures;
  if (!own || !own.tells) return [];
  return Object.values(own.tells)
    .filter((tell) => tell && tell.active !== false)
    .map(cloneTell)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function ambushSignaturesMissingTells(state) {
  const pending = pendingPlans(state);
  const tells = new Set(activeAmbushSignatureTells(state).map((tell) => tell.encounterId));
  const missing = [];
  for (const item of pending) {
    const shapeId = shapeOf(item);
    if (!hasAmbushSignature(shapeId)) continue;
    if (!tells.has(item.encounterId)) missing.push({
      encounterId: item.encounterId,
      shapeId,
      zoneId: item.zoneId || null,
    });
  }
  return missing;
}

function syncPendingTells(state) {
  const own = ensureState(state);
  const liveTellIds = new Set();
  for (const item of pendingPlans(state)) {
    const shapeId = shapeOf(item);
    const signature = signatureForShape(shapeId);
    if (!signature || !item.encounterId) continue;
    const sectorId = item.sectorId || currentSectorId(state);
    const zone = resolveZone(sectorId, item);
    if (!sectorId || !zone) continue;
    const id = tellIdFor(item);
    liveTellIds.add(id);
    const existing = own.tells[id];
    if (existing) {
      existing.active = true;
      existing.lastSeenAt = state.simTime || 0;
      continue;
    }
    own.tells[id] = makeTell(state, item, signature, sectorId, zone, id);
  }
  for (const [id, tell] of Object.entries(own.tells)) {
    if (!liveTellIds.has(id)) tell.active = false;
  }
}

function makeTell(state, item, signature, sectorId, zone, id) {
  const pos = tellPosition(state, item, zone);
  return {
    id,
    encounterId: item.encounterId,
    shapeId: shapeOf(item),
    signatureId: signature.id,
    label: signature.label,
    hint: signature.hint,
    sectorId,
    zoneId: zone.id,
    zoneName: zone.name || item.zoneName || zone.id,
    pos,
    radius: 18,
    active: true,
    scanned: false,
    createdAt: state.simTime || 0,
    lastSeenAt: state.simTime || 0,
  };
}

function tellPosition(state, item, zone) {
  const center = item.zoneCenter || zone.center || { x: 0, z: 0 };
  const zoneRadius = Math.max(120, Math.min(item.zoneRadius || zone.radius || 360, 520));
  const seed = hash32(state.meta && state.meta.seed, item.encounterId, shapeOf(item), 'ambushSignature');
  const rng = mulberry32(seed);
  const angle = rng() * Math.PI * 2;
  const radius = zoneRadius * (0.35 + rng() * 0.25);
  return {
    x: Number((center.x + Math.cos(angle) * radius).toFixed(3)),
    z: Number((center.z + Math.sin(angle) * radius).toFixed(3)),
  };
}

function tellIdFor(item) {
  return `ambushTell:${item.encounterId}`;
}

function pendingPlans(state) {
  const pending = state && state.encounterDirector && state.encounterDirector.pending;
  return Array.isArray(pending) ? pending : [];
}

function shapeOf(item) {
  return item && (item.shapeId || item.kind || item.shape) || null;
}

function resolveZone(sectorId, item) {
  if (!sectorId) return null;
  if (item.zoneId) {
    const found = zonesForSector(sectorId).find((zone) => zone.id === item.zoneId);
    if (found) return found;
  }
  if (item.zoneCenter) {
    return {
      id: item.zoneId || `${item.encounterId}:zone`,
      name: item.zoneName || item.zoneId || 'ambush lane',
      center: item.zoneCenter,
      radius: item.zoneRadius || 360,
    };
  }
  return null;
}

function currentSectorId(state) {
  return state && state.world && state.world.currentSectorId || null;
}

function freshState() {
  return { schemaVersion: STATE_VERSION, tells: {}, lastScan: null };
}

function ensureState(state) {
  if (!state.ambushSignatures || typeof state.ambushSignatures !== 'object') state.ambushSignatures = freshState();
  if (!state.ambushSignatures.tells || typeof state.ambushSignatures.tells !== 'object') state.ambushSignatures.tells = {};
  state.ambushSignatures.schemaVersion = STATE_VERSION;
  return state.ambushSignatures;
}

function cloneTell(tell) {
  return {
    ...tell,
    pos: tell && tell.pos ? { x: tell.pos.x, z: tell.pos.z } : { x: 0, z: 0 },
  };
}

function emit(bus, evt, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(evt, payload);
}

export default ambushSignatures;
