// BP-02.1/C3 Scan-Reveals-Loadout.
//
// Additive listener over scanner's scan:pulse seam. Writes entity.data.scanRevealed so UI can
// resolve ship contacts without scanner/HUD special cases. Plan 53 also lets this existing scan
// owner retain the bounded Codex first-scan/first-engagement record; scanner and combat remain the
// physical truth producers.
import { buildShipScanReveal, sameScanReveal } from '../data/scanReveal.js';
import { codexBestiaryEnemyId } from '../data/codexBestiary.js';

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

export const scanReveal = {
  name: 'scanReveal',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._onScanPulse = (payload) => this._scan(payload || {});
    this._onShipRevealed = (payload) => this._recordScan(payload || {});
    this._onCombatDamage = (payload) => this._recordEngagement(payload || {});
    this._onEntityKilled = (payload) => this._recordDefeat(payload || {});
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('scan:pulse', this._onScanPulse);
      this.bus.on('scan:shipRevealed', this._onShipRevealed);
      this.bus.on('combat:damage', this._onCombatDamage);
      this.bus.on('entity:killed', this._onEntityKilled);
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

  destroy() {
    if (this.bus && this._onScanPulse && typeof this.bus.off === 'function') {
      this.bus.off('scan:pulse', this._onScanPulse);
      this.bus.off('scan:shipRevealed', this._onShipRevealed);
      this.bus.off('combat:damage', this._onCombatDamage);
      this.bus.off('entity:killed', this._onEntityKilled);
    }
    this._onScanPulse = null;
    this._onShipRevealed = null;
    this._onCombatDamage = null;
    this._onEntityKilled = null;
  },
};

export default scanReveal;
