// Durable world consequences for nonlethal custody transfers.
//
// surrenderRecovery owns the physical capture and payout. This listener records what was captured
// beneath the already-saved player blob, then projects the arrest into the canonical sector field.
// It never writes sector danger, credits, or reputation directly.
import { hash32 } from '../core/rng.js';

const CAPTURE_HISTORY_CAP = 24;
const SETTLED_ID_CAP = 128;
const INTEL_MILESTONES = Object.freeze([2, 4, 7]);
const NETWORK_PREFIX = Object.freeze(['Red', 'Black', 'Ash', 'Cinder', 'Hollow', 'Broken']);
const NETWORK_NOUN = Object.freeze(['Latch', 'Wake', 'Ledger', 'Spur', 'Beacon', 'Hook']);
const NETWORK_KIND = Object.freeze(['Network', 'Crew', 'Ring', 'Syndicate']);

export const custodyConsequences = {
  name: 'custodyConsequences',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    const ledger = ensureLedger(this.state);
    // Existing saves may already contain repeat capture profiles from the capture-ledger packet.
    // Schedule their first unapplied milestone instead of requiring one more arrest to wake it up.
    for (const profile of Object.values(ledger.profiles)) scheduleIntel(profile, currentDay(this.state));
    this._onCustody = (payload) => this._record(payload || {});
    this._onDayTick = (payload) => this._matureIntel(payload || {});
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('law:custodyTransfer', this._onCustody);
      this.bus.on('day:tick', this._onDayTick);
    }
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
      lastAuthorityFactionId: null,
      pendingIntelMilestone: null,
      pendingIntelDay: null,
      appliedIntelMilestone: 0,
      networkName: null,
    };
    normalizeProfile(profile);
    const bountyCr = Math.max(0, Math.round(Number(data.bountyCr) || 0));
    profile.captureCount += 1;
    profile.totalBountyCr += bountyCr;
    profile.lastCapturedAt = Number(state.simTime) || 0;
    profile.lastSectorId = sectorId;
    profile.lastStationId = payload.stationId || null;
    profile.lastAuthorityFactionId = payload.authorityFactionId || null;
    scheduleIntel(profile, currentDay(state));
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
    return record;
  },

  _matureIntel(payload) {
    const ledger = ensureLedger(this.state);
    const day = Number.isFinite(Number(payload.days))
      ? Math.max(0, Math.floor(Number(payload.days)))
      : currentDay(this.state);
    const matured = [];
    for (const profileId of Object.keys(ledger.profiles).sort()) {
      const profile = normalizeProfile(ledger.profiles[profileId]);
      const milestone = profile.pendingIntelMilestone;
      if (!milestone || day < profile.pendingIntelDay) continue;
      profile.networkName = profile.networkName || networkNameFor(this.state, profile.profileId);
      profile.appliedIntelMilestone = milestone;
      profile.pendingIntelMilestone = null;
      profile.pendingIntelDay = null;
      const intel = {
        profileId: profile.profileId,
        networkName: profile.networkName,
        factionId: profile.factionId,
        authorityFactionId: profile.lastAuthorityFactionId || null,
        sectorId: profile.lastSectorId,
        stationId: profile.lastStationId,
        offenderType: profile.offenderType,
        archetype: profile.archetype,
        captureCount: profile.captureCount,
        milestone,
        day,
      };
      const impulse = intelligenceImpulse(intel);
      this._emit('pirateRumor:counterIntel', { ...intel, worldImpulse: { ...impulse } });
      this._emit('sectorsim:impulse', impulse);
      this._surfaceRepeatProfile(profile, intel);
      matured.push(intel);
      scheduleIntel(profile, day);
    }
    return matured;
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

  _surfaceRepeatProfile(profile, intel) {
    const headline = `Custody interviews linked the ${profile.networkName} repeat-offender profile; patrol intelligence updated.`;
    this._emit('news:headline', {
      headline,
      text: headline,
      kind: 'custody-intelligence',
      sectorId: intel.sectorId,
      stationId: intel.stationId,
      factionId: intel.authorityFactionId,
      profileId: profile.profileId,
      captureCount: profile.captureCount,
      networkName: profile.networkName,
      milestone: intel.milestone,
    });
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onCustody) this.bus.off('law:custodyTransfer', this._onCustody);
      if (this._onDayTick) this.bus.off('day:tick', this._onDayTick);
    }
    this._onCustody = this._onDayTick = null;
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
  for (const profile of Object.values(ledger.profiles)) normalizeProfile(profile);
  if (!Array.isArray(ledger.settledIds)) ledger.settledIds = [];
  return ledger;
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object') return profile;
  profile.captureCount = Math.max(0, Math.floor(Number(profile.captureCount) || 0));
  profile.appliedIntelMilestone = Math.max(0, Math.floor(Number(profile.appliedIntelMilestone) || 0));
  profile.pendingIntelMilestone = Number.isFinite(Number(profile.pendingIntelMilestone))
    ? Math.max(0, Math.floor(Number(profile.pendingIntelMilestone))) || null : null;
  profile.pendingIntelDay = Number.isFinite(Number(profile.pendingIntelDay))
    ? Math.max(0, Math.floor(Number(profile.pendingIntelDay))) : null;
  profile.networkName = profile.networkName || null;
  return profile;
}

function currentDay(state) {
  if (Number.isFinite(Number(state && state.days))) return Math.max(0, Math.floor(Number(state.days)));
  return Math.max(0, Math.floor((Number(state && state.simTime) || 0) / 600));
}

function scheduleIntel(profile, day) {
  if (!profile || profile.pendingIntelMilestone) return false;
  const applied = Math.max(0, profile.appliedIntelMilestone | 0);
  const milestone = INTEL_MILESTONES.find((value) => value > applied && profile.captureCount >= value) || null;
  if (!milestone) return false;
  profile.pendingIntelMilestone = milestone;
  profile.pendingIntelDay = Math.max(0, Math.floor(Number(day) || 0)) + 1;
  return true;
}

function networkNameFor(state, profileId) {
  const seed = state && state.meta && state.meta.seed || 1;
  const pick = (list, salt) => list[hash32(seed, profileId, salt) % list.length];
  return `${pick(NETWORK_PREFIX, 'prefix')} ${pick(NETWORK_NOUN, 'noun')} ${pick(NETWORK_KIND, 'kind')}`;
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

function intelligenceImpulse(intel) {
  const magnitude = Math.min(0.032, 0.012 + intel.milestone * 0.0025);
  return {
    kind: 'custody_intelligence',
    sectorId: intel.sectorId,
    danger: -magnitude,
    pricePressure: -0.004,
    factionId: intel.authorityFactionId,
    influenceDelta: Math.min(0.04, 0.014 + intel.milestone * 0.003),
    profileId: intel.profileId,
    milestone: intel.milestone,
    networkName: intel.networkName,
  };
}

export default custodyConsequences;
