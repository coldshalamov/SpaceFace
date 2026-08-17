// BP-02.1/C3 Scan-Reveals-Loadout.
//
// Additive listener over scanner's scan:pulse seam. Writes entity.data.scanRevealed so UI can
// resolve ship contacts without scanner/HUD special cases. Plan 53 also lets this existing scan
// owner retain the bounded Codex first-scan/first-engagement record; scanner and combat remain the
// physical truth producers.
import { buildShipScanReveal, sameScanReveal } from '../data/scanReveal.js';
import { codexBestiaryEnemyId } from '../data/codexBestiary.js';
import {
  COLD_DERELICT_BLACK_BOX_SOURCE_KIND,
  normalizeColdDerelictBlackBoxReceipt,
} from '../data/coldDerelictBlackBoxes.js';

function ensureBestiary(state) {
  if (!state.story || typeof state.story !== 'object') state.story = {};
  if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
  const flags = state.story.flags;
  if (!flags.codexLore || typeof flags.codexLore !== 'object') flags.codexLore = {};
  if (!flags.codexLore.bestiary || typeof flags.codexLore.bestiary !== 'object') {
    flags.codexLore.bestiary = {};
  }
  return flags.codexLore.bestiary;
}

function ensureColdDerelictBlackBoxes(state) {
  ensureBestiary(state);
  const lore = state.story.flags.codexLore;
  if (!lore.blackBoxes || typeof lore.blackBoxes !== 'object' || Array.isArray(lore.blackBoxes)) {
    lore.blackBoxes = {};
  }
  if (!lore.blackBoxes.coldDerelict || typeof lore.blackBoxes.coldDerelict !== 'object'
    || Array.isArray(lore.blackBoxes.coldDerelict)) {
    lore.blackBoxes.coldDerelict = {};
  }
  return lore.blackBoxes.coldDerelict;
}

function aftermathMarker(state, markerId) {
  const bySector = state && state.aftermathWrecks && state.aftermathWrecks.bySector;
  if (!bySector || typeof bySector !== 'object') return null;
  for (const rows of Object.values(bySector)) {
    if (!Array.isArray(rows)) continue;
    const marker = rows.find((row) => row && row.markerId === markerId);
    if (marker) return marker;
  }
  return null;
}

function scannedAftermathWreck(state, markerId) {
  const entities = Array.isArray(state && state.entityList) ? state.entityList : [];
  return entities.find((entity) => entity && entity.alive !== false && entity.type === 'wreck'
    && entity.data && entity.data.markerId === markerId && entity.data.scanned === true) || null;
}

export const scanReveal = {
  name: 'scanReveal',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._onScanPulse = (payload) => this._scan(payload || {});
    this._onShipRevealed = (payload) => this._recordScan(payload || {});
    this._onCombatDamage = (payload) => this._recordEngagement(payload || {});
    this._onEntityKilled = (payload) => this._recordDefeat(payload || {});
    this._onLootCollected = (payload) => this._recordColdDerelictBlackBox(payload || {});
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('scan:pulse', this._onScanPulse);
      this.bus.on('scan:shipRevealed', this._onShipRevealed);
      this.bus.on('combat:damage', this._onCombatDamage);
      this.bus.on('entity:killed', this._onEntityKilled);
      this.bus.on('loot:collected', this._onLootCollected);
    }
  },

  _scan(payload) {
    const state = this.state;
    const origin = payload && payload.pos;
    if (!state || !origin) return;
    const playerId = state.playerId;
    const list = Array.isArray(state.entityList) ? state.entityList : [];
    for (const entity of list) {
      if (!entity || entity.id === playerId) continue;
      const data = entity.data || (entity.data = {});
      const reveal = buildShipScanReveal(entity, state, {
        origin,
        now: state.simTime || 0,
        previous: data.scanRevealed || null,
      });
      if (!reveal) continue;
      if (sameScanReveal(data.scanRevealed, reveal)) {
        data.scanRevealed = { ...reveal, revealedAt: data.scanRevealed.revealedAt };
        continue;
      }
      data.scanRevealed = reveal;
      if (this.bus && typeof this.bus.emit === 'function') this.bus.emit('scan:shipRevealed', reveal);
    }
  },

  _enemyForEntityId(entityId) {
    const entity = this.state && this.state.entities && this.state.entities.get
      ? this.state.entities.get(entityId) || null
      : null;
    const enemyTypeId = codexBestiaryEnemyId(entity);
    return enemyTypeId ? { entity, enemyTypeId } : null;
  },

  _recordScan(payload) {
    const resolved = this._enemyForEntityId(payload.entityId);
    if (!resolved) return false;
    const rows = ensureBestiary(this.state);
    const previous = rows[resolved.enemyTypeId] && typeof rows[resolved.enemyTypeId] === 'object'
      ? rows[resolved.enemyTypeId]
      : {};
    if (Number.isFinite(previous.scannedAt)) return false;
    rows[resolved.enemyTypeId] = {
      ...previous,
      scannedAt: Number.isFinite(payload.revealedAt) ? payload.revealedAt : (this.state.simTime || 0),
    };
    this.bus?.emit?.('codex:bestiaryUpdated', {
      enemyTypeId: resolved.enemyTypeId,
      stage: 'scanned',
      entityId: resolved.entity.id,
    });
    return true;
  },

  _recordEngagement(payload) {
    if (!this.state || payload.attackerId !== this.state.playerId || !(Number(payload.applied) > 0)) return false;
    const resolved = this._enemyForEntityId(payload.targetId);
    if (!resolved) return false;
    const rows = ensureBestiary(this.state);
    const previous = rows[resolved.enemyTypeId] && typeof rows[resolved.enemyTypeId] === 'object'
      ? rows[resolved.enemyTypeId]
      : {};
    if (Number.isFinite(previous.engagedAt)) return false;
    rows[resolved.enemyTypeId] = { ...previous, engagedAt: this.state.simTime || 0 };
    this.bus?.emit?.('codex:bestiaryUpdated', {
      enemyTypeId: resolved.enemyTypeId,
      stage: 'engaged',
      entityId: resolved.entity.id,
    });
    return true;
  },

  _recordDefeat(payload) {
    if (!this.state || payload.killerId !== this.state.playerId) return false;
    const resolved = this._enemyForEntityId(payload.id);
    if (!resolved) return false;
    const rows = ensureBestiary(this.state);
    const previous = rows[resolved.enemyTypeId] && typeof rows[resolved.enemyTypeId] === 'object'
      ? rows[resolved.enemyTypeId]
      : {};
    const defeats = Math.min(999, Math.max(0, Math.floor(Number(previous.defeats) || 0)) + 1);
    rows[resolved.enemyTypeId] = {
      ...previous,
      engagedAt: Number.isFinite(previous.engagedAt) ? previous.engagedAt : (this.state.simTime || 0),
      defeatedAt: this.state.simTime || 0,
      defeats,
    };
    this.bus?.emit?.('codex:bestiaryUpdated', {
      enemyTypeId: resolved.enemyTypeId,
      stage: 'defeated',
      entityId: resolved.entity.id,
      defeats,
    });
    return true;
  },

  _recordColdDerelictBlackBox(payload) {
    if (!this.state || payload.collectorId !== this.state.playerId || !(Number(payload.amount) > 0)
      || payload.kind !== 'cargo' || payload.commodityId !== 'cmdty_salvage_electronics') return false;
    const source = payload.lotSource;
    if (!source || source.sourceKind !== COLD_DERELICT_BLACK_BOX_SOURCE_KIND) return false;
    const markerId = typeof source.recordId === 'string' ? source.recordId : null;
    const expectedIdentity = markerId ? `cold-derelict-black-box:${markerId}` : null;
    if (!markerId || source.lotId !== expectedIdentity || source.provenanceId !== expectedIdentity) return false;

    const pickup = payload.pickupId != null && this.state.entities && this.state.entities.get
      ? this.state.entities.get(payload.pickupId) : null;
    if (!pickup || !pickup.data || pickup.data.coldDerelictBlackBox !== true
      || pickup.data.coldDerelictMarkerId !== markerId) return false;
    const marker = aftermathMarker(this.state, markerId);
    const boarding = marker && marker.coldDerelictBoarding;
    if (!marker || !boarding || boarding.phase !== 'extracted' || boarding.outcome !== 'black_box'
      || boarding.blackBoxPickupId == null || !scannedAftermathWreck(this.state, markerId)) return false;

    const rows = ensureColdDerelictBlackBoxes(this.state);
    if (rows[markerId]) return false;
    const receipt = normalizeColdDerelictBlackBoxReceipt({
      sourceKind: source.sourceKind,
      markerId,
      lotId: source.lotId,
      provenanceId: source.provenanceId,
      sectorId: marker.sectorId,
      zoneId: marker.zoneId,
      zoneName: marker.zoneName,
      victimClass: marker.victimClass,
      victimLabel: marker.victimLabel,
      victimFactionId: marker.victimFactionId,
      confirmedKillerTrack: marker.killerId != null,
      lossTick: marker.tick,
      lostAt: marker.t,
      recoveredAt: this.state.simTime || 0,
    });
    if (!receipt) return false;
    rows[markerId] = { ...receipt };
    this.bus?.emit?.('codex:blackBoxRecovered', {
      sourceKind: receipt.sourceKind,
      markerId: receipt.markerId,
      lotId: receipt.lotId,
      sectorId: receipt.sectorId,
      zoneId: receipt.zoneId,
    });
    return true;
  },

  destroy() {
    if (this.bus && this._onScanPulse && typeof this.bus.off === 'function') {
      this.bus.off('scan:pulse', this._onScanPulse);
      this.bus.off('scan:shipRevealed', this._onShipRevealed);
      this.bus.off('combat:damage', this._onCombatDamage);
      this.bus.off('entity:killed', this._onEntityKilled);
      this.bus.off('loot:collected', this._onLootCollected);
    }
    this._onScanPulse = null;
    this._onShipRevealed = null;
    this._onCombatDamage = null;
    this._onEntityKilled = null;
    this._onLootCollected = null;
  },
};

export default scanReveal;
