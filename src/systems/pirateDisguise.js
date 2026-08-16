// BP-13/B7 Fake-Civilian-Until-Scan.
//
// Listens to the existing scanner pulse event and reveals disguised pirate traffic. Scanner/HUD
// remain unchanged; after reveal, their existing contact readers see ordinary hostile AI fields.
import { revealPirateDisguise, shouldRevealOnScan } from '../data/pirateDisguise.js';
import { FACTION_BACKROOM } from '../data/factionPlay.js';

function playerSpoofLedger(state) {
  const ledger = state?.player?.transponderSpoof;
  return ledger && typeof ledger === 'object' ? ledger : null;
}

/** Read model for the station UI. Runtime writes remain inside pirateDisguise. */
export function playerSpoofStatusForState(state, factionId = null) {
  const ledger = playerSpoofLedger(state);
  const now = Number(state?.simTime) || 0;
  const exposureUntil = factionId && ledger?.exposures
    ? Number(ledger.exposures[factionId]) || 0
    : 0;
  return {
    ready: (Number(ledger?.charges) || 0) > 0,
    charges: Math.max(0, Number(ledger?.charges) || 0),
    sourceFactionId: ledger?.sourceFactionId || null,
    exposureUntil,
    exposed: exposureUntil > now,
    exposureRemainingS: Math.max(0, exposureUntil - now),
  };
}

export const pirateDisguise = {
  name: 'pirateDisguise',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._onScanPulse = (p) => this._scan(p);
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('scan:pulse', this._onScanPulse);
    }
  },

  /** Install the one-use forged identity bought through Economy. This owner is deliberately the
   * only writer of transponderSpoof; the backroom/economy surfaces only request the install. */
  grantPlayerSpoof({ serviceId, stationId, factionId } = {}) {
    const state = this.state;
    if (!state?.player || serviceId !== FACTION_BACKROOM.serviceId || !stationId || !factionId) {
      return { ok: false, reason: 'invalid_forgery' };
    }
    const prior = playerSpoofLedger(state);
    if ((Number(prior?.charges) || 0) > 0) return { ok: false, reason: 'spoof_already_ready' };
    const sequence = Math.max(0, Number(prior?.sequence) || 0) + 1;
    state.player.transponderSpoof = {
      schemaVersion: 1,
      charges: 1,
      sequence,
      forgedAt: Number(state.simTime) || 0,
      sourceStationId: stationId,
      sourceFactionId: factionId,
      exposures: { ...(prior?.exposures || {}) },
    };
    return { ok: true, serviceId, stationId, factionId, charges: 1, sequence };
  },

  /** Resolve one real customs identity challenge. A manifest is authored for its issuing faction;
   * presenting it elsewhere, or reusing an identity already made there, is an immediate mismatch.
   * Ordinary customs penalties remain Economy/Factions/Heat-owned. */
  attemptPlayerSpoof(payload = {}) {
    const state = this.state;
    const ledger = playerSpoofLedger(state);
    if (!ledger || !(Number(ledger.charges) > 0)) return { attempted: false, reason: 'no_spoof' };
    const factionId = payload.factionId || null;
    const challengeId = payload.lawfulInspectionCaseId || payload.patrolId
      || payload.worldRecordId || payload.source || null;
    if (!factionId || !challengeId) return { attempted: false, reason: 'not_a_customs_challenge' };

    const matched = ledger.sourceFactionId === factionId;
    const alreadyExposed = playerSpoofStatusForState(state, factionId).exposed;
    ledger.charges = Math.max(0, Number(ledger.charges) - 1);
    const passed = matched && !alreadyExposed;
    const receipt = {
      attempted: true,
      passed,
      made: !passed,
      matched,
      alreadyExposed,
      factionId,
      sequence: ledger.sequence || 0,
      remainingCharges: ledger.charges,
    };
    if (passed) {
      this._emit('playerSpoof:passed', receipt);
      this._emit('toast', { text: 'Forged manifest cleared customs.', kind: 'success', ttl: 2 });
      return receipt;
    }

    if (!ledger.exposures || typeof ledger.exposures !== 'object') ledger.exposures = {};
    ledger.exposures[factionId] = Math.max(
      Number(ledger.exposures[factionId]) || 0,
      (Number(state.simTime) || 0) + FACTION_BACKROOM.madeExposureS,
    );
    receipt.exposureUntil = ledger.exposures[factionId];
    this._emit('playerSpoof:made', receipt);
    this._emit('toast', {
      text: matched ? 'Customs made the forged identity.' : 'Wrong crest. Customs is not amused.',
      kind: 'warning',
      ttl: 3,
    });
    return receipt;
  },

  hasActivePlayerExposure(factionId) {
    return playerSpoofStatusForState(this.state, factionId).exposed;
  },

  _scan(payload) {
    const state = this.state;
    const pos = payload && payload.pos;
    if (!state || !pos) return;
    const list = Array.isArray(state.entityList) ? state.entityList : [];
    for (const entity of list) {
      if (!shouldRevealOnScan(entity, pos)) continue;
      const reveal = revealPirateDisguise(entity, state, { by: 'scan' });
      if (!reveal) continue;
      this._speak(entity, reveal);
      this._emit('pirateDisguise:revealed', reveal);
    }
  },

  _speak(entity, reveal) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text: reveal.text,
        kind: 'pirateDisguise',
        ttl: 1,
        id: `pirateDisguise:${entity.id}`,
        factionId: entity.factionId,
      });
    } else {
      this._emit('toast', { text: reveal.text, kind: 'pirateDisguise', ttl: 1 });
    }
    this._emit('pirateDisguise:voice', {
      entityId: entity.id,
      situation: reveal.situation,
      text: reveal.text,
      factionId: entity.factionId,
    });
  },

  _emit(evt, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(evt, payload);
  },

  destroy() {
    if (this.bus && this._onScanPulse && typeof this.bus.off === 'function') {
      this.bus.off('scan:pulse', this._onScanPulse);
    }
    this._onScanPulse = null;
  },
};

export default pirateDisguise;
