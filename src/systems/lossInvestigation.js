// lossInvestigation.js - BP-12 packet CONVOY_LOSS_INVESTIGATION.
//
// A read layer over BP-01.1's loss ledger and the shipped salvage communicator loop. It never
// manufactures losses and never spawns content. When salvage places derelict-field points in a
// sector with a recorded loss, one existing point is promoted into a communicator and its outgoing
// salvage offer is provenance-stamped with the loss that actually happened.

import { hash32 } from '../core/rng.js';
import { latestLossFor } from './lossLedger.js';
import { wreckMissionById } from '../data/wreckMissions.js';
import { MISSION_TUNING } from '../data/missions.js';
import { buildSetPieceMissionOffers } from './setPieceMissionOffers.js';

const INVESTIGATION_TEMPLATES = ['wm_manifest_run', 'wm_blackbox_attacker'];

const FACTION_LABEL = {
  faction_concord: 'Concord',
  faction_scn: 'Concord',
  faction_reach: 'Reach',
  faction_drift: 'Drift',
  faction_dmc: 'DMC',
  faction_quiet: 'the Quiet',
  faction_mts: 'MTS',
};

function ensureState(state) {
  if (!state) return null;
  if (!state.lossInvestigation || typeof state.lossInvestigation !== 'object') {
    state.lossInvestigation = { promotedBySector: {}, promotedByPoint: {}, hearingByLoss: {} };
  }
  const own = state.lossInvestigation;
  if (!own.promotedBySector || typeof own.promotedBySector !== 'object') own.promotedBySector = {};
  if (!own.promotedByPoint || typeof own.promotedByPoint !== 'object') own.promotedByPoint = {};
  // FB-041: lossId → the hearing offer this case minted. Durable binding so a promotion can
  // only ever offer one hearing, and the chain's terminal transition can close the entry.
  if (!own.hearingByLoss || typeof own.hearingByLoss !== 'object') own.hearingByLoss = {};
  return own;
}

function sectorName(state, sectorId) {
  const sec = state && state.world && state.world.sectors && state.world.sectors[sectorId];
  return (sec && sec.name) || sectorId || 'unknown space';
}

function factionLabel(factionId) {
  return FACTION_LABEL[factionId] || 'local';
}

function lossNoun(loss) {
  if (!loss) return 'asset';
  if (loss.kind === 'outpost') return 'outpost';
  if (loss.kind === 'fleet') return 'fleet vessel';
  if (loss.kind === 'drone') return 'mining drone';
  return 'hauler';
}

function chooseTemplate(seed, sectorId, lossId) {
  const idx = hash32(seed || 1, sectorId || '', lossId || '', 'lossInvestigation') % INVESTIGATION_TEMPLATES.length;
  return INVESTIGATION_TEMPLATES[idx] || INVESTIGATION_TEMPLATES[0];
}

function pointChoice(seed, sectorId, lossId, candidates) {
  if (!candidates.length) return null;
  const idx = hash32(seed || 1, sectorId || '', lossId || '', 'lossInvestigationPoint') % candidates.length;
  return candidates[idx] || candidates[0];
}

function overlayFor(state, loss, templateId) {
  const template = wreckMissionById(templateId) || wreckMissionById(INVESTIGATION_TEMPLATES[0]);
  const sName = sectorName(state, loss.sectorId);
  const faction = factionLabel(loss.factionId);
  const asset = loss.assetId || loss.kind || 'unknown contact';
  const noun = lossNoun(loss);
  const headline = `${faction} ${noun} ${asset} went dark near ${sName}`;
  const caseLabel = `the ${faction} ${noun} ${asset} lost near ${sName}`;
  return {
    template,
    title: template ? template.title : 'Investigate the Lost Convoy',
    giver: 'Drifting investigation beacon',
    log: `${headline}. The recorder still has a clean vector; recover it before the field goes cold.`,
    summary: `Investigate the ${headline} and recover evidence from the wreck.`,
    metadata: {
      lossId: loss.lossId,
      sectorId: loss.sectorId,
      assetId: loss.assetId || null,
      factionId: loss.factionId || null,
      kind: loss.kind || 'trader',
      simDay: loss.simDay,
      wreckMissionId: template ? template.id : templateId,
      caseLabel,
    },
  };
}

// The case-file phrase the hearing's verdict names: "the MTS hauler X lost near Vesta Forge".
function lossCaseLabel(state, rec) {
  const sName = sectorName(state, rec.sectorId);
  const faction = factionLabel(rec.factionId);
  const asset = rec.assetId || rec.kind || 'unknown contact';
  return `the ${faction} ${lossNoun(rec)} ${asset} lost near ${sName}`;
}

function entityForPoint(state, point) {
  if (!state || !point || point.entityId == null || !state.entities) return null;
  if (typeof state.entities.get === 'function') return state.entities.get(point.entityId) || null;
  return state.entities[point.entityId] || null;
}

export const lossInvestigation = {
  name: 'lossInvestigation',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    ensureState(this._state);
    this._onPlaced = (p) => this._promoteSector(p && p.sectorId);
    this._onSectorEnter = (p) => this._promoteSector(p && p.sectorId);
    this._onMissionOffered = (offer) => this._stampOffer(offer);
    this._onPromoted = (rec) => this._offerHearing(rec);
    this._onSetPieceTransition = (p) => this._closeHearing(p);
    this._onNewGame = () => this.newGame();
    if (this._bus && this._bus.on) {
      this._bus.on('salvage:placed', this._onPlaced);
      this._bus.on('sector:enter', this._onSectorEnter);
      this._bus.on('mission:offered', this._onMissionOffered);
      this._bus.on('lossInvestigation:promoted', this._onPromoted);
      this._bus.on('mission:setPieceTransition', this._onSetPieceTransition);
      this._bus.on('game:newGame', this._onNewGame);
      this._bus.on('save:loaded', this._onNewGame);
    }
  },

  newGame() {
    if (this._state) {
      this._state.lossInvestigation = { promotedBySector: {}, promotedByPoint: {}, hearingByLoss: {} };
    }
  },

  _promoteSector(sectorId) {
    const state = this._state;
    if (!state || !sectorId) return null;
    const loss = latestLossFor(state, sectorId);
    if (!loss || !loss.lossId) return null;
    const own = ensureState(state);
    const existing = own.promotedBySector[sectorId];
    if (existing && existing.lossId === loss.lossId) return existing;

    const points = (state.salvage && Array.isArray(state.salvage.points)) ? state.salvage.points : [];
    const candidates = points.filter((p) => p && p.sectorId === sectorId && !p.offered);
    if (!candidates.length) return null;

    const seed = state.meta && state.meta.seed;
    const point = pointChoice(seed, sectorId, loss.lossId, candidates);
    if (!point) return null;
    const templateId = chooseTemplate(seed, sectorId, loss.lossId);
    const overlay = overlayFor(state, loss, templateId);

    point.isCommunicator = true;
    point.wreckMissionId = overlay.metadata.wreckMissionId;
    point.lossInvestigation = { ...overlay.metadata };

    const ent = entityForPoint(state, point);
    if (ent && ent.data) {
      ent.data.parentType = 'communicator';
      ent.data.isCommunicator = true;
      ent.data.wreckMissionId = point.wreckMissionId;
      ent.data.scanLabel = 'Loss Investigation Communicator';
      ent.data.lossInvestigation = { ...overlay.metadata };
    }

    const rec = {
      ...overlay.metadata,
      salvagePointId: point.id,
      entityId: point.entityId == null ? null : point.entityId,
      zoneId: point.zoneId || null,
      title: overlay.title,
      summary: overlay.summary,
      log: overlay.log,
      giver: overlay.giver,
    };
    own.promotedBySector[sectorId] = rec;
    own.promotedByPoint[point.id] = rec;
    // The promoted event is the court-path seam: the listener below answers it with exactly one
    // loss-bound `hearing` set-piece offer through the ordinary mission:offered contract.
    if (this._bus && this._bus.emit) this._bus.emit('lossInvestigation:promoted', { ...rec });
    return rec;
  },

  /**
   * FB-041 — a promoted loss investigation offers the authored `hearing` set piece bound to that
   * loss id, exactly once. The offer goes through the ordinary `mission:offered` adoption seam —
   * the same contract lossLedger's ghost-convoy bounty already uses — so missions stays the only
   * mission writer and owns boarding, dedupe, acceptance, and settlement. The loss rides the
   * chain as `cause.lossId`/`cause.lossLabel`, so the terminal verdict receipt names the real
   * case; a loss that never promoted (never investigated) never reaches this code path.
   */
  _offerHearing(rec) {
    const state = this._state;
    if (!state || !rec || !rec.lossId || !rec.sectorId) return null;
    const own = ensureState(state);
    const existing = own.hearingByLoss[rec.lossId];
    if (existing) return existing;

    // Same epoch math as missions._epoch — the loss-bound chain lands in the epoch that
    // actually heard the promotion, not a synthetic one.
    const cfg = (state.missions && state.missions.config) || MISSION_TUNING;
    const refreshSec = Number(cfg && cfg.refreshSec) || 600;
    const startEpoch = Math.max(0, Math.floor((state.simTime || 0) / refreshSec));
    const lossLabel = rec.caseLabel || lossCaseLabel(state, rec);
    const offer = (buildSetPieceMissionOffers(state, {
      archetypeId: 'hearing',
      startEpoch,
      stageIndex: 0,
      branchId: null,
      attempt: 0,
      lossId: rec.lossId,
      lossLabel,
    }) || [])[0] || null;
    if (!offer) return null;

    const row = {
      lossId: rec.lossId,
      sectorId: rec.sectorId,
      offerId: offer.id,
      stationId: offer.stationId || null,
      chainId: offer.cause && offer.cause.chainId || null,
      fingerprint: offer.cause && offer.cause.fingerprint || null,
      lossLabel,
      offeredAt: state.simTime || 0,
      closed: false,
      outcome: null,
      missionId: null,
      closedAt: null,
    };

    // This system's slice is session state; the loss ledger and mission receipts are the durable
    // record. On a re-promotion (Continue, replay, duplicate promoted event) the chain may already
    // be live, posted, or settled — record the binding but do not emit a row the owner refuses.
    const hasLossId = (value) => !!(value && value.cause && value.cause.lossId === rec.lossId);
    const liveOrPosted = (state.missions && state.missions.active || []).some(hasLossId)
      || Object.values(state.missions && state.missions.boards || {}).some((board) => (
        (board && board.slots || []).some(hasLossId)
      ));
    const settled = !!row.fingerprint
      && (state.missions && state.missions.receipts || []).some((receipt) => (
        receipt && receipt.causeFingerprint === row.fingerprint
      ));
    // The ledger's durable verdict annotation survives saves where this slice does not.
    const ledgerEntries = state.lossLedger && Array.isArray(state.lossLedger.entries)
      ? state.lossLedger.entries : [];
    const priorVerdict = ledgerEntries.find((entry) => (
      entry && entry.lossId === rec.lossId && entry.hearingResolution
    ));
    if (priorVerdict && priorVerdict.hearingResolution) {
      row.closed = true;
      row.outcome = priorVerdict.hearingResolution.outcome || 'completed';
      row.missionId = priorVerdict.hearingResolution.missionId || null;
      row.closedAt = priorVerdict.hearingResolution.closedAt != null
        ? priorVerdict.hearingResolution.closedAt : null;
    }
    own.hearingByLoss[rec.lossId] = row;
    if (liveOrPosted || settled || row.closed) {
      row.reused = true;
      return row;
    }

    offer.lossInvestigation = {
      lossId: rec.lossId,
      sectorId: rec.sectorId,
      assetId: rec.assetId || null,
      factionId: rec.factionId || null,
      kind: rec.kind || null,
      simDay: rec.simDay != null ? rec.simDay : null,
    };
    if (this._bus && this._bus.emit) this._bus.emit('mission:offered', offer);
    return row;
  },

  /**
   * FB-041 closure — the chain's public receipt channel is `mission:setPieceTransition`. Only a
   * TERMINAL transition (status 'completed' — the route finished or terminally failed) closes
   * the loss entry; 'advanced'/'branch_available'/'retry' beats leave it open. The verdict is
   * written back onto the promoted record and annotated additively on the ledger entry (the same
   * read-then-enrich discipline the ledger applies to wreck entities), so the loss entry itself
   * carries the hearing's outcome across saves.
   */
  _closeHearing(p) {
    const state = this._state;
    if (!state || !p || p.archetypeId !== 'hearing' || !p.chainId || p.status !== 'completed') return;
    const own = ensureState(state);
    const row = Object.values(own.hearingByLoss || {}).find((entry) => (
      entry && entry.chainId === p.chainId
    ));
    if (!row || row.closed) return;
    row.closed = true;
    row.outcome = p.outcome || 'completed';
    row.missionId = p.missionId || null;
    row.closedAt = state.simTime || 0;

    const rec = own.promotedBySector[row.sectorId]
      || Object.values(own.promotedByPoint || {}).find((entry) => entry && entry.lossId === row.lossId)
      || null;
    if (rec) {
      rec.hearingChainId = row.chainId;
      rec.hearingOutcome = row.outcome;
      rec.hearingClosedAt = row.closedAt;
      rec.closed = true;
    }

    const entries = state.lossLedger && Array.isArray(state.lossLedger.entries)
      ? state.lossLedger.entries : [];
    const loss = entries.find((entry) => entry && entry.lossId === row.lossId);
    if (loss && !loss.hearingResolution) {
      loss.hearingResolution = {
        chainId: row.chainId,
        missionId: row.missionId,
        outcome: row.outcome,
        closedAt: row.closedAt,
      };
    }
    if (this._bus && this._bus.emit) {
      this._bus.emit('lossInvestigation:closed', {
        lossId: row.lossId,
        sectorId: row.sectorId,
        chainId: row.chainId,
        missionId: row.missionId,
        outcome: row.outcome,
      });
    }
  },

  _stampOffer(offer) {
    const state = this._state;
    if (!state || !offer || offer.source !== 'salvage' || !offer.salvagePointId) return;
    const own = ensureState(state);
    const rec = own.promotedByPoint[offer.salvagePointId];
    if (!rec) return;
    const template = wreckMissionById(rec.wreckMissionId);
    offer.wreckMissionId = rec.wreckMissionId;
    offer.type = template ? template.type : offer.type;
    offer.title = rec.title || offer.title;
    offer.giver = rec.giver || offer.giver;
    offer.log = rec.log || offer.log;
    offer.summary = rec.summary || offer.summary;
    offer.reward_cr = template && template.reward_cr ? Math.max(offer.reward_cr || 0, template.reward_cr) : (offer.reward_cr || 0);
    offer.choice = template && template.choice ? template.choice : (offer.choice || null);
    offer.tag = offer.tag || (template && template.tag) || 'wreck_salvage';
    offer.lossInvestigation = {
      lossId: rec.lossId,
      sectorId: rec.sectorId,
      assetId: rec.assetId,
      factionId: rec.factionId,
      kind: rec.kind,
      simDay: rec.simDay,
    };
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onPlaced) this._bus.off('salvage:placed', this._onPlaced);
      if (this._onSectorEnter) this._bus.off('sector:enter', this._onSectorEnter);
      if (this._onMissionOffered) this._bus.off('mission:offered', this._onMissionOffered);
      if (this._onPromoted) this._bus.off('lossInvestigation:promoted', this._onPromoted);
      if (this._onSetPieceTransition) this._bus.off('mission:setPieceTransition', this._onSetPieceTransition);
      if (this._onNewGame) this._bus.off('game:newGame', this._onNewGame);
      if (this._onNewGame) this._bus.off('save:loaded', this._onNewGame);
    }
    this._onPlaced = null;
    this._onSectorEnter = null;
    this._onMissionOffered = null;
    this._onPromoted = null;
    this._onSetPieceTransition = null;
    this._onNewGame = null;
  },
};

export default lossInvestigation;
