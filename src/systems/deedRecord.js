// THE WORLD REMEMBERS — the Record.
//
// One durable ledger of what the player actually did, fed by the receipts other owners already
// sign (economy's dock slam, sectorSim's ore flood, survivorPod's outcomes, combat's kills, heat's
// WANTED crossings, the deniable-job aftermath, the field's dragged haulers). Nothing here writes
// credits, heat, reputation, cargo, or spawns: this module records, and other systems read.
//
// Readers (hunters, fences, stations, rivalry, gossip, the Codex) ask three questions:
//   deedsFor(state, filter)        — what happened here / to this faction, newest first
//   notorietyIn(state, sectorId)   — how loud the player's crimes are in one sector, decayed
//   standingWith(state, factionId) — how one faction weighs the whole record (law or street axis)
//   pickDeedToTell(state, opts)    — the one deed a given speaker would bring up right now
//
// The record lives under state.story (already saved whole) and is created lazily, so a game in
// which nothing noteworthy happened carries no `record` key and the golden save shape is unchanged.
// No update loop, no RNG: every pick is hash32 over the save seed and the deed id.

import { hash32 } from '../core/rng.js';
import { LAWFUL_STATION_FACTIONS } from '../data/factions/index.js';
import { wantedTierFor, WANTED_TIER } from './heat.js';

export const DEED_RECORD_VERSION = 1;
export const DEED_CAP = 64;
/** Age at which a deed weighs half as much to notoriety/standing readers (sim seconds). */
export const DEED_HALF_LIFE_S = 1800;

// Per kind: how law-abiding factions read it (`law`), how outlaws read it (`street`), and the
// default weight. Weight is the loudness of one instance; readers multiply by axis sign.
export const DEED_KINDS = Object.freeze({
  dock_slam:       Object.freeze({ law: -1, street: 0,  weight: 2, label: 'Dock slam' }),
  ore_flood:       Object.freeze({ law: 0,  street: 0,  weight: 1, label: 'Ore flood' }),
  hauler_dragged:  Object.freeze({ law: -1, street: 1,  weight: 2, label: 'Hauler dragged' }),
  pod_rescued:     Object.freeze({ law: 1,  street: 0,  weight: 3, label: 'Survivors rescued' }),
  pod_abandoned:   Object.freeze({ law: -1, street: 0,  weight: 2, label: 'Survivors abandoned' }),
  pod_captured:    Object.freeze({ law: -1, street: 0,  weight: 1, label: 'Survivors taken' }),
  kill_lawful:     Object.freeze({ law: -1, street: 1,  weight: 3, label: 'Lawful hull destroyed' }),
  kill_outlaw:     Object.freeze({ law: 1,  street: -1, weight: 2, label: 'Outlaw hull destroyed' }),
  base_destroyed:  Object.freeze({ law: -1, street: 1,  weight: 4, label: 'Base destroyed' }),
  fence_burned:    Object.freeze({ law: 0,  street: -1, weight: 2, label: 'Fence burned' }),
  fence_emboldened:Object.freeze({ law: 0,  street: 1,  weight: 1, label: 'Fence emboldened' }),
  fence_thanked:   Object.freeze({ law: 0,  street: 1,  weight: 1, label: 'Fence thanked' }),
  bounty_paid:     Object.freeze({ law: 1,  street: -1, weight: 2, label: 'Bounty settled' }),
  wanted_tier:     Object.freeze({ law: -1, street: 1,  weight: 2, label: 'Warrant raised' }),
  tumble_rake:     Object.freeze({ law: 0,  street: 1,  weight: 1, label: 'Tumble rake' }),
  stunt:           Object.freeze({ law: 0,  street: 1,  weight: 1, label: 'Stunt' }),
  // THE WORLD REMEMBERS consumers that sign their own receipts:
  hunter_disabled: Object.freeze({ law: -1, street: 1,  weight: 3, label: 'Warrant hunter disabled' }),
  hunter_outran:   Object.freeze({ law: 0,  street: 1,  weight: 1, label: 'Warrant hunter outran' }),
  station_strike:  Object.freeze({ law: -1, street: 0,  weight: 2, label: 'Crews walked off' }),
  station_grudge:  Object.freeze({ law: -1, street: 0,  weight: 2, label: 'Berth refused' }),
  ace_defeated:    Object.freeze({ law: 1,  street: -1, weight: 4, label: 'Named ace defeated' }),
  ace_routed:      Object.freeze({ law: 0,  street: -1, weight: 2, label: 'Named ace routed' }),
  pod_ransomed:    Object.freeze({ law: -1, street: 1,  weight: 3, label: 'Survivors ransomed' }),
  fence_route:     Object.freeze({ law: 0,  street: 1,  weight: 3, label: 'Fence route run' }),
  heat_scrubbed:   Object.freeze({ law: 0,  street: 1,  weight: 1, label: 'Paper scrubbed' }),
});

const WANTED_TIER_WEIGHT = Object.freeze({
  [WANTED_TIER.SCAN]: 1,
  [WANTED_TIER.BOUNTY]: 2,
  [WANTED_TIER.NETS]: 3,
  [WANTED_TIER.IMPOUND]: 4,
});
const WANTED_TIER_RANK = Object.freeze({
  [WANTED_TIER.NONE]: 0,
  [WANTED_TIER.SCAN]: 1,
  [WANTED_TIER.BOUNTY]: 2,
  [WANTED_TIER.NETS]: 3,
  [WANTED_TIER.IMPOUND]: 4,
});

// ── state ────────────────────────────────────────────────────────────────────────────────────

function freshRecord() {
  return { schemaVersion: DEED_RECORD_VERSION, deeds: [], tallies: {}, seq: 0 };
}

/** Lazy accessor: creates `state.story.record` on first write. Readers use peekRecord instead. */
export function ensureDeedRecord(state) {
  const story = state.story || (state.story = { flags: {} });
  if (!story.record || typeof story.record !== 'object' || Array.isArray(story.record)) {
    story.record = freshRecord();
  }
  const record = story.record;
  record.schemaVersion = DEED_RECORD_VERSION;
  if (!Array.isArray(record.deeds)) record.deeds = [];
  if (!record.tallies || typeof record.tallies !== 'object') record.tallies = {};
  if (!Number.isInteger(record.seq) || record.seq < 0) record.seq = 0;
  return record;
}

/** Read-only accessor: never creates the key. */
export function peekDeedRecord(state) {
  const record = state && state.story && state.story.record;
  return record && typeof record === 'object' && Array.isArray(record.deeds) ? record : null;
}

function finite(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }

function isLawfulFaction(factionId) {
  return !!factionId && LAWFUL_STATION_FACTIONS.has(factionId);
}

// ── writer ───────────────────────────────────────────────────────────────────────────────────

/**
 * Record one deed. Returns the stored deed, or null when the kind is unknown / the id repeats.
 * payload: { kind, id?, weight?, sectorId?, factionId?, stationId?, subject?, detail?, t?, tick? }
 */
export function recordDeed(state, payload = {}) {
  const kind = String(payload.kind || '');
  const spec = DEED_KINDS[kind];
  if (!spec || !state) return null;
  const record = ensureDeedRecord(state);
  const tick = Number.isInteger(payload.tick) ? payload.tick : (state.tick | 0);
  const t = Number.isFinite(payload.t) ? Number(payload.t) : finite(state.simTime, tick / 60);
  const explicitId = payload.id != null ? String(payload.id) : null;
  if (explicitId && record.deeds.some((d) => d.id === explicitId)) return null;
  record.seq += 1;
  const id = explicitId || `${kind}:${tick}:${record.seq}`;
  const deed = {
    id,
    kind,
    t,
    tick,
    sectorId: payload.sectorId || null,
    factionId: payload.factionId || null,
    stationId: payload.stationId || null,
    weight: Math.max(0.25, Math.min(8, finite(payload.weight, spec.weight))),
    subject: payload.subject != null ? String(payload.subject) : null,
    detail: payload.detail && typeof payload.detail === 'object' ? { ...payload.detail } : null,
    told: 0,
  };
  record.deeds.push(deed);
  record.tallies[kind] = (record.tallies[kind] | 0) + 1;
  compact(record);
  return deed;
}

// Keep the loud and the untold; drop the quiet deed that has already been repeated.
function compact(record) {
  while (record.deeds.length > DEED_CAP) {
    let dropAt = 0;
    let dropScore = Infinity;
    for (let i = 0; i < record.deeds.length; i++) {
      const d = record.deeds[i];
      const score = d.weight * (d.told > 0 ? 0.5 : 1) + i * 0.01; // older (low i) loses ties
      if (score < dropScore) { dropScore = score; dropAt = i; }
    }
    record.deeds.splice(dropAt, 1);
  }
}

/** A speaker repeated this deed: it gets quieter for the next pick and marks who told it. */
export function markTold(state, deedId, opts = {}) {
  const record = peekDeedRecord(state);
  if (!record) return null;
  const deed = record.deeds.find((d) => d.id === deedId);
  if (!deed) return null;
  deed.told = (deed.told | 0) + 1;
  deed.toldAt = finite(state.simTime, 0);
  if (opts.by) deed.toldBy = String(opts.by);
  return deed;
}

/**
 * A non-speaking surface (the news wire, the Codex) showed this deed. Saved with the record so a
 * load does not re-run the headline; does not count as told (gossip still owes the player a mouth).
 */
export function markNoted(state, deedId, channel = 'news') {
  const record = peekDeedRecord(state);
  if (!record) return null;
  const deed = record.deeds.find((d) => d.id === deedId);
  if (!deed) return null;
  if (!deed.noted || typeof deed.noted !== 'object') deed.noted = {};
  deed.noted[String(channel)] = finite(state.simTime, 0);
  return deed;
}

export function wasNoted(deed, channel = 'news') {
  return !!(deed && deed.noted && typeof deed.noted === 'object' && deed.noted[String(channel)] != null);
}

// ── readers ──────────────────────────────────────────────────────────────────────────────────

function decay(deed, now) {
  const age = Math.max(0, finite(now, 0) - finite(deed.t, 0));
  return Math.pow(0.5, age / DEED_HALF_LIFE_S);
}

/** Deeds newest first, filtered. { sectorId, factionId, stationId, kinds, limit, untoldOnly } */
export function deedsFor(state, filter = {}) {
  const record = peekDeedRecord(state);
  if (!record) return [];
  const kinds = filter.kinds ? new Set(filter.kinds) : null;
  const out = [];
  for (let i = record.deeds.length - 1; i >= 0; i--) {
    const d = record.deeds[i];
    if (filter.sectorId && d.sectorId !== filter.sectorId) continue;
    if (filter.factionId && d.factionId !== filter.factionId) continue;
    if (filter.stationId && d.stationId !== filter.stationId) continue;
    if (kinds && !kinds.has(d.kind)) continue;
    if (filter.untoldOnly && d.told > 0) continue;
    out.push(d);
    if (filter.limit && out.length >= filter.limit) break;
  }
  return out;
}

/** Decayed sum of the player's crimes (law < 0 kinds) in one sector. 0 when quiet. */
export function notorietyIn(state, sectorId, now = state && state.simTime) {
  const record = peekDeedRecord(state);
  if (!record || !sectorId) return 0;
  let sum = 0;
  for (const d of record.deeds) {
    if (d.sectorId !== sectorId) continue;
    const spec = DEED_KINDS[d.kind];
    if (!spec || spec.law >= 0) continue;
    sum += d.weight * decay(d, now);
  }
  return Math.round(sum * 100) / 100;
}

/**
 * How one faction weighs the record: positive = they think well of the player. Lawful station
 * factions read the law axis, everyone else the street axis. Deeds done to that faction count
 * fully; the rest of the record counts at a quarter (reputation travels, but thinner).
 */
export function standingWith(state, factionId, now = state && state.simTime) {
  const record = peekDeedRecord(state);
  if (!record || !factionId) return 0;
  const axis = isLawfulFaction(factionId) ? 'law' : 'street';
  let sum = 0;
  for (const d of record.deeds) {
    const spec = DEED_KINDS[d.kind];
    if (!spec || spec[axis] === 0) continue;
    const share = d.factionId === factionId ? 1 : 0.25;
    sum += spec[axis] * d.weight * share * decay(d, now);
  }
  return Math.round(sum * 100) / 100;
}

/**
 * The one deed a speaker would bring up. Loud, untold, local, and about the speaker's own people
 * win; ties break by hash32(seed, deed.id) so the same world tells the same story.
 * opts: { speakerFactionId, sectorId, seed, now, kinds, minWeight }
 */
export function pickDeedToTell(state, opts = {}) {
  const record = peekDeedRecord(state);
  if (!record || record.deeds.length === 0) return null;
  const now = Number.isFinite(opts.now) ? opts.now : finite(state.simTime, 0);
  const seed = finite(opts.seed, finite(state.meta && state.meta.seed, 0));
  const kinds = opts.kinds ? new Set(opts.kinds) : null;
  const minWeight = finite(opts.minWeight, 0);
  const axis = opts.speakerFactionId && !isLawfulFaction(opts.speakerFactionId) ? 'street' : 'law';
  let best = null;
  let bestScore = -Infinity;
  for (const d of record.deeds) {
    if (kinds && !kinds.has(d.kind)) continue;
    if (d.weight < minWeight) continue;
    const spec = DEED_KINDS[d.kind];
    if (!spec) continue;
    // A speaker only brings up what their side has an opinion about (or a pure feat).
    const cares = spec[axis] !== 0 || (spec.law === 0 && spec.street === 0);
    if (!cares) continue;
    let score = d.weight * decay(d, now);
    score *= d.told > 0 ? 1 / (1 + d.told) : 2;
    if (opts.sectorId && d.sectorId === opts.sectorId) score *= 1.5;
    if (opts.speakerFactionId && d.factionId === opts.speakerFactionId) score *= 1.5;
    score += (hash32(seed, d.id, 'deed-tell') % 1000) / 1e6;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** How a speaker of this faction feels about a deed: 'grievance' | 'praise' | 'neutral'. */
export function deedToneFor(deed, speakerFactionId) {
  const spec = deed && DEED_KINDS[deed.kind];
  if (!spec) return 'neutral';
  const axis = speakerFactionId && !isLawfulFaction(speakerFactionId) ? 'street' : 'law';
  if (spec[axis] < 0) return 'grievance';
  if (spec[axis] > 0) return 'praise';
  return 'neutral';
}

export function deedTally(state, kind) {
  const record = peekDeedRecord(state);
  if (!record) return 0;
  return kind ? (record.tallies[kind] | 0) : record.deeds.length;
}

// ── the system: listeners only ───────────────────────────────────────────────────────────────

export const deedRecord = {
  name: 'deedRecord',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.registry = ctx.registry || null;
    this._subs = [];
    this._listen('wreckCourt:ruled', p => {
      if (!this.registry?.get('wreckCourt')?.verifyInsuranceRuling(p)) return;
      const claim = p.ruling.insurance;
      recordDeed(this.state, { kind: claim.fraud ? 'wanted_tier' : 'stunt',
        id: p.receiptId, sectorId: this._here(), factionId: claim.factionId, subject: claim.name,
        detail: { insurance: true, fraud: claim.fraud, accusedId: claim.fraud ? this.state.playerId : claim.accusedId, tier: 'nets' } });
    });
    this._listen('station:slammed', (p) => this._onSlammed(p));
    this._listen('economy:oreFlood', (p) => this._onOreFlood(p));
    this._listen('well:haulerDragged', (p) => this._onHaulerDragged(p));
    this._listen('survivorPod:rescued', (p) => this._onPod('rescued', p));
    this._listen('survivorPod:captured', (p) => this._onPod('captured', p));
    this._listen('survivorPod:abandoned', (p) => this._onPod('abandoned', p));
    this._listen('entity:killed', (p) => this._onKilled(p));
    this._listen('combat:baseDestroyed', (p) => this._onBaseDestroyed(p));
    this._listen('deniable:fenceBurned', (p) => this._onFence('fence_burned', p));
    this._listen('deniable:fenceEmboldened', (p) => this._onFence('fence_emboldened', p));
    this._listen('deniable:fenceThanked', (p) => this._onFence('fence_thanked', p));
    this._listen('bounty:cleared', (p) => this._onBountyCleared(p));
    this._listen('heat:changed', (p) => this._onHeatChanged(p));
    this._listen('combat:tumbleRake', (p) => this._onTumbleRake(p));
    this._listen('stunt:salvageRights', (p) => this._onStunt(p));
    this._listen('warrant:hunterDisabled', (p) => this._onHunterDisabled(p));
    this._listen('warrant:hunterEscaped', (p) => this._onHunterEscaped(p));
    this._listen('station:strike', (p) => this._onStationCondition('station_strike', p));
    this._listen('station:grudge', (p) => this._onStationCondition('station_grudge', p));
    this._listen('aceMemory:transition', (p) => this._onAceTransition(p));
    this._listen('survivorPod:ransomed', (p) => this._onPod('ransomed', p));
    this._listen('fence:routeCompleted', (p) => this._onFenceReceipt('fence_route', p));
    this._listen('fence:scrubbed', (p) => this._onFenceReceipt('heat_scrubbed', p));
  },

  destroy() {
    if (Array.isArray(this._subs)) {
      for (const off of this._subs) { try { off(); } catch (_) { /* cleanup never throws */ } }
      this._subs.length = 0;
    }
    this.state = null;
    this.bus = null;
  },

  _listen(evt, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(evt, fn);
    if (typeof off === 'function') this._subs.push(off);
  },

  _here() {
    const w = this.state && this.state.world;
    return (w && w.currentSectorId) || null;
  },

  _isPlayer(id) {
    return id != null && this.state && id === this.state.playerId;
  },

  _onSlammed(p) {
    if (!p || !this._isPlayer(p.actorId)) return;
    recordDeed(this.state, {
      kind: 'dock_slam',
      sectorId: p.sectorId || this._here(),
      factionId: p.factionId || null,
      stationId: p.stationId || null,
      weight: 2 + Math.min(2, finite(p.fineCr, 0) / 1000),
      subject: p.stationId || null,
      detail: { fineCr: finite(p.fineCr, 0), mass: Math.round(finite(p.mass, 0)) },
      tick: p.tick,
    });
  },

  _onOreFlood(p) {
    if (!p || p.byPlayer !== true) return;
    recordDeed(this.state, {
      kind: 'ore_flood',
      sectorId: p.sectorId || this._here(),
      weight: 1 + Math.min(2, finite(p.yieldU, 0) / 20),
      subject: p.commodityId || null,
      detail: { yieldU: finite(p.yieldU, 0), commodityId: p.commodityId || null },
      tick: p.tick,
    });
  },

  _onHaulerDragged(p) {
    if (!p || !this._isPlayer(p.actorId)) return;
    recordDeed(this.state, {
      kind: 'hauler_dragged',
      sectorId: p.sectorId || this._here(),
      factionId: p.factionId || null,
      stationId: p.destStationId || null,
      subject: p.haulerId != null ? String(p.haulerId) : null,
      detail: { deflectionWu: finite(p.deflectionWu, 0) },
    });
  },

  _onPod(outcome, p) {
    if (!p) return;
    if (outcome === 'rescued' && p.playerAnswered !== true) return;
    if (outcome === 'abandoned' && p.playerLeftIt !== true) return;
    const kind = outcome === 'rescued' ? 'pod_rescued'
      : outcome === 'captured' ? 'pod_captured'
        : outcome === 'ransomed' ? 'pod_ransomed'
          : 'pod_abandoned';
    recordDeed(this.state, {
      kind,
      id: p.id ? `pod:${outcome}:${p.id}` : undefined,
      sectorId: p.sectorId || this._here(),
      factionId: p.factionId || null,
      stationId: outcome === 'ransomed' ? (p.stationId || null) : null,
      subject: p.victimId != null ? String(p.victimId) : null,
      detail: outcome === 'captured' ? { captorFactionId: p.captorFactionId || null }
        : outcome === 'ransomed' ? { fenceFactionId: p.authorityFactionId || null } : null,
      t: p.t,
    });
  },

  _onFenceReceipt(kind, p) {
    if (!p || !p.fenceId) return;
    recordDeed(this.state, {
      kind,
      id: kind === 'fence_route' ? `fence_route:${p.fenceId}:${Number.isFinite(p.tick) ? p.tick : (this.state.tick | 0)}` : undefined,
      sectorId: p.sectorId || this._here(),
      factionId: p.factionId || null,
      stationId: p.stationId || null,
      subject: p.fenceName || p.fenceId,
      detail: kind === 'fence_route'
        ? { fenceId: p.fenceId, reward: p.reward ? { ...p.reward } : null }
        : { fenceId: p.fenceId, costCr: finite(p.costCr, 0), cooled: finite(p.cooled, 0) },
      tick: p.tick,
    });
  },

  _onKilled(p) {
    if (!p || !this._isPlayer(p.killerId) || this._isPlayer(p.id)) return;
    if (p.type && p.type !== 'ship') return;
    const lawful = p.factionLawful === true || isLawfulFaction(p.factionId);
    const hostile = p.targetHostileToPlayer === true;
    // A lawful hull shot down is the crime; a hostile outlaw is the civic deed. A neutral
    // non-lawful hull (a trader of an independent house) still reads as a crime to the law.
    const kind = lawful || !hostile ? 'kill_lawful' : 'kill_outlaw';
    recordDeed(this.state, {
      kind,
      sectorId: this._here(),
      factionId: p.factionId || null,
      subject: p.victimClass || null,
      detail: { victimId: p.id != null ? String(p.id) : null, hostile },
    });
  },

  _onBaseDestroyed(p) {
    if (!p || !this._isPlayer(p.killerId)) return;
    recordDeed(this.state, {
      kind: 'base_destroyed',
      sectorId: p.sectorId || this._here(),
      factionId: p.factionId || null,
      stationId: p.stationId || null,
      subject: p.type || p.stationType || null,
    });
  },

  _onFence(kind, p) {
    if (!p) return;
    recordDeed(this.state, {
      kind,
      sectorId: p.sectorId || this._here(),
      factionId: p.factionId || null,
      stationId: p.stationId || null,
      subject: p.stationId || null,
      tick: p.tick,
    });
  },

  _onBountyCleared(p) {
    recordDeed(this.state, {
      kind: 'bounty_paid',
      sectorId: this._here(),
      weight: 2 + Math.min(2, finite(p && p.amount, 0) / 2000),
      detail: { amount: finite(p && p.amount, 0) },
    });
  },

  _onHeatChanged(p) {
    if (!p || !p.tier) return;
    const prevTier = wantedTierFor(finite(p.previousValue, 0));
    const from = WANTED_TIER_RANK[prevTier] | 0;
    const to = WANTED_TIER_RANK[p.tier] | 0;
    if (to <= from || to < WANTED_TIER_RANK[WANTED_TIER.BOUNTY]) return;
    recordDeed(this.state, {
      kind: 'wanted_tier',
      sectorId: this._here(),
      weight: WANTED_TIER_WEIGHT[p.tier] || 2,
      subject: p.tier,
      detail: { tier: p.tier, reason: p.reason || null },
    });
  },

  _onTumbleRake(p) {
    if (!p || !this._isPlayer(p.hullId)) return;
    const victims = Array.isArray(p.victims) ? p.victims.length : 0;
    if (victims <= 0) return;
    recordDeed(this.state, {
      kind: 'tumble_rake',
      sectorId: this._here(),
      factionId: p.factionId || null,
      weight: 1 + Math.min(2, (victims - 1) * 0.5),
      detail: { victims },
      tick: p.tick,
    });
  },

  _onHunterDisabled(p) {
    if (!p || p.byPlayer !== true || !p.hunterId) return;
    recordDeed(this.state, {
      kind: 'hunter_disabled',
      sectorId: p.sectorId || this._here(),
      factionId: p.factionId || null,
      weight: p.licensed === true ? 3 : 2,
      subject: p.name || p.hunterId,
      detail: { hunterId: p.hunterId, licensed: p.licensed === true, grievance: p.grievance || null, tier: p.tier || null },
    });
  },

  _onHunterEscaped(p) {
    if (!p || !p.hunterId) return;
    recordDeed(this.state, {
      kind: 'hunter_outran',
      sectorId: p.sectorId || this._here(),
      subject: p.name || p.hunterId,
      detail: { hunterId: p.hunterId, tier: p.tier || null },
      tick: p.tick,
    });
  },

  _onStationCondition(kind, p) {
    if (!p || !p.stationId) return;
    if (kind === 'station_strike' && p.actorId != null && !this._isPlayer(p.actorId)) return;
    recordDeed(this.state, {
      kind,
      id: `${kind}:${p.stationId}:${Number.isFinite(p.tick) ? p.tick : (this.state.tick | 0)}`,
      sectorId: p.sectorId || this._here(),
      factionId: p.factionId || null,
      stationId: p.stationId,
      subject: p.stationId,
      detail: kind === 'station_strike'
        ? { kills: p.kills | 0, victimRole: p.victimRole || null }
        : { slams: p.slams | 0, untilPaidCr: finite(p.untilPaidCr, 0) },
      tick: p.tick,
    });
  },

  _onAceTransition(p) {
    if (!p || !p.aceId) return;
    const kind = p.transition === 'defeated' ? 'ace_defeated' : p.transition === 'fled' ? 'ace_routed' : null;
    if (!kind) return;
    const rec = p.record || {};
    recordDeed(this.state, {
      kind,
      // One deed per ace per arc beat: a second flee is a louder story, not a duplicate.
      id: `${kind}:${p.aceId}:${rec.fleeCount | 0}`,
      sectorId: rec.lastSectorId || this._here(),
      factionId: p.factionId || rec.factionId || null,
      weight: kind === 'ace_routed' ? 2 + Math.min(2, (rec.fleeCount | 0) * 0.5) : 4,
      subject: p.aceName || p.aceId,
      detail: { aceId: p.aceId, crew: p.crew || null, returnTier: rec.returnTier | 0 },
    });
  },

  _onStunt(p) {
    if (!p || !p.trickId) return;
    const rarity = String(p.rarity || 'common');
    const weight = rarity === 'legendary' ? 3 : rarity === 'rare' ? 2 : 1;
    recordDeed(this.state, {
      kind: 'stunt',
      sectorId: this._here(),
      weight,
      subject: p.name || p.trickId,
      detail: { trickId: p.trickId, rarity },
      tick: p.tick,
    });
  },
};
