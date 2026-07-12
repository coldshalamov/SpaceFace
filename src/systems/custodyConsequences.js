// Durable world consequences for nonlethal custody transfers.
//
// surrenderRecovery owns the physical capture and payout. This listener records what was captured
// beneath the already-saved player blob, then projects the arrest into the canonical sector field.
// It never writes sector danger, credits, or reputation directly.

const CAPTURE_HISTORY_CAP = 24;
const SETTLED_ID_CAP = 128;

export const custodyConsequences = {
  name: 'custodyConsequences',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    ensureLedger(this.state);
    this._onCustody = (payload) => this._record(payload || {});
    if (this.bus && typeof this.bus.on === 'function') this.bus.on('law:custodyTransfer', this._onCustody);
  },

  newGame() {
    if (this.state && this.state.player) this.state.player.custodyLedger = freshLedger();
  },

  _record(payload) {
    if (!payload || payload.outcome !== 'custody' || payload.entityId == null) return null;
    const state = this.state;
    const entity = state.entities && state.entities.get && state.entities.get(payload.entityId);
    if (!eligible(entity, state)) return null;
    const ledger = ensureLedger(state);
    const receiptId = String(payload.id || `surrender-custody:${payload.entityId}`);
    // Core deliberately recycles entity ids. Pair the upstream receipt id with its authoritative
    // sim timestamp so a later ship reusing that id is not mistaken for a duplicate synchronous
    // custody event.
    const settlementKey = `${receiptId}@${Number(payload.t) || 0}`;
    if (ledger.settledIds.includes(settlementKey)) return null;

    const data = entity.data || {};
    const ai = data.ai || {};
    const sectorId = payload.sectorId || state.world && state.world.currentSectorId || null;
    if (!sectorId) return null;
    const offenderFactionId = entity.factionId || payload.factionId || null;
    const archetype = String(ai.archetype || data.aiArchetype || data.shipClass || entity.type || 'unknown');
    const shipClass = String(data.shipClass || entity.type || 'ship');
    const offenderType = String(data.lootTableId || archetype);
    const profileId = `${offenderFactionId || 'unknown'}:${offenderType}`;
    const profile = ledger.profiles[profileId] || {
      profileId,
      factionId: offenderFactionId,
      offenderType,
      archetype,
      shipClass,
      captureCount: 0,
      totalBountyCr: 0,
      firstCapturedAt: Number(state.simTime) || 0,
      lastCapturedAt: null,
      lastSectorId: null,
      lastStationId: null,
    };
    const bountyCr = Math.max(0, Math.round(Number(data.bountyCr) || 0));
    profile.captureCount += 1;
    profile.totalBountyCr += bountyCr;
    profile.lastCapturedAt = Number(state.simTime) || 0;
    profile.lastSectorId = sectorId;
    profile.lastStationId = payload.stationId || null;
    ledger.profiles[profileId] = profile;

    const record = {
      receiptId,
      settlementKey,
      entityId: entity.id,
      offenderFactionId,
      authorityFactionId: payload.authorityFactionId || null,
      profileId,
      offenderType,
      archetype,
      shipClass,
      bountyCr,
      stationId: payload.stationId || null,
      sectorId,
      repeatIndex: profile.captureCount,
      capturedAt: Number(state.simTime) || 0,
    };
    ledger.totalCaptured += 1;
    ledger.captures.push(record);
    if (ledger.captures.length > CAPTURE_HISTORY_CAP) ledger.captures.splice(0, ledger.captures.length - CAPTURE_HISTORY_CAP);
    ledger.settledIds.push(settlementKey);
    if (ledger.settledIds.length > SETTLED_ID_CAP) ledger.settledIds.splice(0, ledger.settledIds.length - SETTLED_ID_CAP);

    const impulse = custodyImpulse(record);
    this._emit('sectorsim:impulse', impulse);
    this._emit('custody:recorded', { ...record, worldImpulse: { ...impulse } });
    this._emit('law:custodyAcknowledged', {
      entityId: record.entityId,
      stationId: record.stationId,
      authorityFactionId: record.authorityFactionId,
      profileId,
      repeatIndex: record.repeatIndex,
      t: record.capturedAt,
    });
    this._say(record);
    if (profile.captureCount === 2) this._surfaceRepeatProfile(profile, record);
    return record;
  },

  _say(record) {
    const text = record.repeatIndex > 1
      ? `CONTROL: custody confirmed. Repeat ${record.archetype.replace(/_/g, ' ')} profile linked.`
      : 'CONTROL: custody confirmed. Hull and crew entered into the warrant ledger.';
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      return voice.say({
        channel: 'info',
        kind: 'custodyConsequences',
        id: `custodyConsequences:${record.receiptId}`,
        text,
        ttl: 3,
      });
    }
    this._emit('toast', { text, kind: 'good', ttl: 3 });
    return true;
  },

  _surfaceRepeatProfile(profile, record) {
    const label = profile.archetype.replace(/_/g, ' ');
    const headline = `Authority linked repeat ${label} captures; patrol intelligence updated.`;
    this._emit('news:headline', {
      headline,
      text: headline,
      kind: 'custody-intelligence',
      sectorId: record.sectorId,
      stationId: record.stationId,
      factionId: record.authorityFactionId,
      profileId: profile.profileId,
      captureCount: profile.captureCount,
    });
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function' && this._onCustody) this.bus.off('law:custodyTransfer', this._onCustody);
    this._onCustody = null;
  },
};

function freshLedger() {
  return { totalCaptured: 0, captures: [], profiles: {}, settledIds: [] };
}

function ensureLedger(state) {
  const player = state.player || (state.player = {});
  if (!player.custodyLedger || typeof player.custodyLedger !== 'object') player.custodyLedger = freshLedger();
  const ledger = player.custodyLedger;
  ledger.totalCaptured = Math.max(0, Math.floor(Number(ledger.totalCaptured) || 0));
  if (!Array.isArray(ledger.captures)) ledger.captures = [];
  if (!ledger.profiles || typeof ledger.profiles !== 'object' || Array.isArray(ledger.profiles)) ledger.profiles = {};
  if (!Array.isArray(ledger.settledIds)) ledger.settledIds = [];
  return ledger;
}

function eligible(entity, state) {
  if (!entity || entity.id === state.playerId || !['ship', 'drone'].includes(entity.type)) return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  if (data.isBoss || data.encounterBoss || data.missionBoss || data.aceMemory
    || ai.isBoss || ai.fanatic || ai.ace || ai.moraleImmune || ai.surrenderImmune) return false;
  const authored = [ai.archetype, ai.aiArchetype, ai.role, ai.spawnContext, ai.encounterKind, data.aiArchetype, data.role]
    .filter(Boolean).join(' ').toLowerCase();
  return !/(^|[\s_-])(boss|miniboss|fanatic)([\s_-]|$)/.test(authored)
    && !authored.includes('named_hunter')
    && !authored.includes('ace_return');
}

function custodyImpulse(record) {
  const bountyMagnitude = Math.min(0.012, record.bountyCr / 50_000);
  const repeatMagnitude = Math.min(0.008, Math.max(0, record.repeatIndex - 1) * 0.004);
  return {
    kind: 'custody_transfer',
    sectorId: record.sectorId,
    danger: -(0.012 + bountyMagnitude + repeatMagnitude),
    pricePressure: -0.003,
    factionId: record.authorityFactionId,
    influenceDelta: 0.012 + Math.min(0.012, record.repeatIndex * 0.003),
    profileId: record.profileId,
    receiptId: record.receiptId,
  };
}

export default custodyConsequences;
