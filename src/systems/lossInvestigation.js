// lossInvestigation.js - BP-12 packet CONVOY_LOSS_INVESTIGATION.
//
// A read layer over BP-01.1's loss ledger and the shipped salvage communicator loop. It never
// manufactures losses and never spawns content. When salvage places derelict-field points in a
// sector with a recorded loss, one existing point is promoted into a communicator and its outgoing
// salvage offer is provenance-stamped with the loss that actually happened.

import { hash32 } from '../core/rng.js';
import { latestLossFor } from './lossLedger.js';
import { wreckMissionById } from '../data/wreckMissions.js';

const INVESTIGATION_TEMPLATES = ['wm_manifest_run', 'wm_blackbox_attacker'];

const FACTION_LABEL = {
  faction_concord: 'Concord',
  faction_reach: 'Reach',
  faction_drift: 'Drift',
  faction_quiet: 'the Quiet',
  faction_mts: 'MTS',
};

function ensureState(state) {
  if (!state) return null;
  if (!state.lossInvestigation || typeof state.lossInvestigation !== 'object') {
    state.lossInvestigation = { promotedBySector: {}, promotedByPoint: {} };
  }
  const own = state.lossInvestigation;
  if (!own.promotedBySector || typeof own.promotedBySector !== 'object') own.promotedBySector = {};
  if (!own.promotedByPoint || typeof own.promotedByPoint !== 'object') own.promotedByPoint = {};
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
    },
  };
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
    this._onNewGame = () => this.newGame();
    if (this._bus && this._bus.on) {
      this._bus.on('salvage:placed', this._onPlaced);
      this._bus.on('sector:enter', this._onSectorEnter);
      this._bus.on('mission:offered', this._onMissionOffered);
      this._bus.on('game:newGame', this._onNewGame);
      this._bus.on('save:loaded', this._onNewGame);
    }
  },

  newGame() {
    if (this._state) this._state.lossInvestigation = { promotedBySector: {}, promotedByPoint: {} };
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
    if (this._bus && this._bus.emit) this._bus.emit('lossInvestigation:promoted', { ...rec });
    return rec;
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
      if (this._onNewGame) this._bus.off('game:newGame', this._onNewGame);
      if (this._onNewGame) this._bus.off('save:loaded', this._onNewGame);
    }
    this._onPlaced = null;
    this._onSectorEnter = null;
    this._onMissionOffered = null;
    this._onNewGame = null;
  },
};

export default lossInvestigation;
