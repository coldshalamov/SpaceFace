// Deterministic SP1 set-piece compiler.
//
// A set-piece run deliberately has no parallel save object. Its complete cursor lives in the
// ordinary offer/active-mission `cause`; the ordinary mission boards and receipts remain the only
// persistence authorities. These helpers are therefore pure over state + cursor/settlement.

import * as missionData from '../data/missions.js';
import { clauseById } from '../data/contractClauses.js';
import { FLAVOR_SOURCE_BY_REF } from '../data/flavor/index.generated.js';
import { UNIQUE_WRECKS, uniqueWreckById } from '../data/uniqueWrecks.js';
import { hash32 } from '../core/rng.js';

export const SET_PIECE_MISSION_SOURCE = 'setPieceMission';

const RETRY_REWARD_MULT = 0.90;
const RETRY_COLLATERAL_MULT = 0.85;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function catalog() {
  return Array.isArray(missionData.SET_PIECE_MISSIONS) ? missionData.SET_PIECE_MISSIONS : [];
}

function definitionFor(archetypeId) {
  return catalog().find((entry) => entry && entry.id === archetypeId) || null;
}

function normalizedCursor(cursor) {
  return {
    archetypeId: String(cursor && cursor.archetypeId || ''),
    startEpoch: Math.max(0, Math.trunc(Number(cursor && cursor.startEpoch) || 0)),
    stageIndex: Math.max(0, Math.trunc(Number(cursor && cursor.stageIndex) || 0)),
    branchId: cursor && cursor.branchId != null ? String(cursor.branchId) : null,
    attempt: Math.max(0, Math.trunc(Number(cursor && cursor.attempt) || 0)),
    wreckId: cursor && cursor.wreckId != null ? String(cursor.wreckId) : null,
  };
}

function saveSeed(state) {
  const metaSeed = Number(state && state.meta && state.meta.seed);
  if (Number.isFinite(metaSeed)) return metaSeed >>> 0;
  const rootSeed = Number(state && state.seed);
  return Number.isFinite(rootSeed) ? rootSeed >>> 0 : 1;
}

function chainIdFor(state, cursor) {
  const suffix = hash32(
    saveSeed(state), cursor.archetypeId, cursor.startEpoch, 'sp1-set-piece',
  ).toString(36);
  return `sp1_${cursor.archetypeId}_${cursor.startEpoch}_${suffix}`;
}

function reservedLongReadWreckIds(state) {
  const reserved = new Set();
  const inspect = (value) => {
    const cause = value && value.source === SET_PIECE_MISSION_SOURCE && value.cause;
    if (!cause || cause.archetypeId !== 'long_read') return;
    const wreckId = cause.wreckId || value.wreckId || value.params && value.params.wreckId;
    if (wreckId) reserved.add(wreckId);
  };
  for (const mission of state && state.missions && state.missions.active || []) inspect(mission);
  for (const board of Object.values(state && state.missions && state.missions.boards || {})) {
    for (const offer of board && board.slots || []) inspect(offer);
  }
  return reserved;
}

function longReadCandidates(state) {
  const bearings = state && state.player && state.player.uniqueWrecks
    && state.player.uniqueWrecks.bearings || {};
  const reserved = reservedLongReadWreckIds(state);
  return UNIQUE_WRECKS.filter((wreck) => {
    if (!wreck || reserved.has(wreck.id) || bearings[wreck.id] && bearings[wreck.id].phase === 'salvaged') {
      return false;
    }
    const source = (wreck.rumorSources || []).find((entry) => (
      entry && entry.sourceRef === wreck.bearingSourceRef
    ));
    return !!source;
  });
}

function longReadTarget(state, cursor) {
  if (cursor.wreckId) return uniqueWreckById(cursor.wreckId);
  const candidates = longReadCandidates(state);
  if (!candidates.length) return null;
  const index = hash32(
    saveSeed(state), cursor.startEpoch, cursor.archetypeId, 'long-read-wreck:v1',
  ) % candidates.length;
  return candidates[index];
}

function primaryRumorSource(wreck) {
  return wreck && (wreck.rumorSources || []).find((entry) => (
    entry && entry.sourceRef === wreck.bearingSourceRef
  )) || null;
}

function serializableClause(clauseId) {
  const clause = clauseById(clauseId);
  if (!clause) return null;
  return {
    id: clause.id,
    event: clause.event,
    label: clause.label,
    prose: clause.prose,
    rewardMult: clause.rewardMult,
  };
}

function textFor(ref, fallback) {
  const row = ref && FLAVOR_SOURCE_BY_REF[ref];
  return row && typeof row.text === 'string' && row.text.trim() ? row.text.trim() : fallback;
}

function chartBrief(text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  return line.length <= 90 ? line : `${line.slice(0, 87).trimEnd()}...`;
}

function stageAt(definition, cursor) {
  const common = Array.isArray(definition.commonStages) ? definition.commonStages : [];
  if (cursor.stageIndex < common.length) {
    return [{ stage: common[cursor.stageIndex], branch: null }];
  }
  const branchStageIndex = cursor.stageIndex - common.length;
  const branches = Array.isArray(definition.branches) ? definition.branches : [];
  if (cursor.branchId == null) {
    // The only unselected branch cursor is the authored choice moment. Returning both first branch
    // stages makes the choice visible as two normal board rows without inventing run state.
    if (branchStageIndex !== 0) return [];
    return branches
      .filter((branch) => branch && Array.isArray(branch.stages) && branch.stages[0])
      .map((branch) => ({ stage: branch.stages[0], branch }));
  }
  const branch = branches.find((candidate) => candidate && candidate.id === cursor.branchId);
  const stage = branch && Array.isArray(branch.stages) ? branch.stages[branchStageIndex] : null;
  return stage ? [{ stage, branch }] : [];
}

function witnessFor(state, definition, cursor, chainId) {
  const witnesses = Array.isArray(definition && definition.witnesses) ? definition.witnesses : [];
  if (!witnesses.length) return null;
  const witness = witnesses[hash32(saveSeed(state), chainId, 'witness') % witnesses.length];
  const refs = Array.isArray(witness && witness.travelLineRefs) ? witness.travelLineRefs : [];
  const travelRef = refs.length ? refs[cursor.stageIndex % refs.length] : null;
  return witness ? {
    witnessId: witness.id,
    witnessName: witness.displayName || witness.id,
    travelLineRef: travelRef,
    travelLineText: textFor(
      travelRef,
      `${witness.displayName || 'The witness'} watches the route and asks who will be allowed to keep its receipt.`,
    ),
  } : null;
}

function buildOffer(state, definition, cursor, stage, branch, wreck = null) {
  const chainId = chainIdFor(state, cursor);
  const branchId = branch ? branch.id : null;
  const branchKey = branchId || 'common';
  const stageFingerprint = `${chainId}:${cursor.stageIndex}:${branchKey}`;
  const fingerprint = `${stageFingerprint}:attempt:${cursor.attempt}`;
  const retrying = cursor.attempt > 0;
  const rewardCr = Math.max(1, Math.round(
    (Number(stage.rewardCr) || 0) * (retrying ? RETRY_REWARD_MULT : 1),
  ));
  const collateralCr = Math.max(0, Math.round(
    (Number(stage.collateralCr) || 0) * (retrying ? RETRY_COLLATERAL_MULT : 1),
  ));
  const existingBearing = wreck && state && state.player && state.player.uniqueWrecks
    && state.player.uniqueWrecks.bearings && state.player.uniqueWrecks.bearings[wreck.id];
  const knownRumorOpening = definition.id === 'long_read' && cursor.stageIndex === 0 && !!existingBearing;
  const title = knownRumorOpening
    ? `Reconcile the Known Bearing: ${wreck.name}`
    : stage.title || `${definition.title}: ${String(stage.id || 'stage').replace(/_/g, ' ')}`;
  const instructionFallback = `${definition.title} posts ${title} as the next recorded obligation in the chain.`;
  const clauses = (Array.isArray(stage.clauseIds) ? stage.clauseIds : [])
    .map(serializableClause)
    .filter(Boolean);
  const witness = witnessFor(state, definition, cursor, chainId);
  const source = primaryRumorSource(wreck);
  const summary = knownRumorOpening
    ? `${wreck.name} is already in your ledger. Reconcile its bearing and proceed to recovery.`
    : textFor(stage.instructionRef, instructionFallback);
  const brief = chartBrief(summary);
  const params = clone(stage.params || {});
  if (wreck) {
    params.wreckId = wreck.id;
    params.wreckName = wreck.name;
    params.sourceRef = wreck.bearingSourceRef;
    params.channelId = source && source.channelId || null;
    params.complicationKinds = (wreck.complications || []).map((entry) => entry && entry.kind).filter(Boolean);
    params.hasReactorComplication = !!wreck.reactor;
    params.hasHazardComplication = !!(wreck.hazardContext
      && ((wreck.hazardContext.hazardTypes || []).length || wreck.hazardContext.approachGate));
    if (knownRumorOpening) {
      params.rumorAlreadyKnown = true;
      params.rumorPurchased = true;
      params.bearingFixed = existingBearing.phase === 'fixed'
        || existingBearing.phase === 'decision' || existingBearing.phase === 'salvaged';
    }
  }
  const cause = {
    tag: 'sp1-set-piece',
    chainId,
    archetypeId: definition.id,
    startEpoch: cursor.startEpoch,
    stageIndex: cursor.stageIndex,
    stageId: stage.id,
    branchId,
    branchLabel: branch && branch.label || null,
    attempt: cursor.attempt,
    stageFingerprint,
    fingerprint,
    house: stage.house || definition.house || definition.title || 'Contract House',
    instructionRef: stage.instructionRef || null,
    successRef: stage.successRef || null,
    failureRef: stage.failureRef || null,
    recoveryRef: stage.recoveryRef || null,
    travelRef: stage.travelRef || stage.travelLineRef || stage.enRouteRef
      || witness && witness.travelLineRef || null,
    travelText: witness && witness.travelLineText || null,
    witnessId: witness && witness.witnessId || null,
    witnessName: witness && witness.witnessName || null,
    wreckId: wreck && wreck.id || null,
    wreckName: wreck && wreck.name || null,
    sourceRef: wreck && wreck.bearingSourceRef || null,
    channelId: source && source.channelId || null,
  };
  const offer = {
    id: `offer_${fingerprint.replace(/[^a-zA-Z0-9_-]+/g, '_')}`,
    type: stage.type,
    stationId: stage.boardStationId,
    factionId: stage.factionId,
    params,
    reward_cr: rewardCr,
    collateral_cr: collateralCr,
    riskTier: Math.trunc(Number(stage.riskTier) || 0),
    destStationId: stage.destStationId || null,
    destSectorId: wreck && cursor.stageIndex < 2 ? wreck.sectorId : stage.destSectorId,
    distance: Math.max(0, Number(stage.distance) || 0),
    title,
    summary,
    brief,
    stageId: stage.id,
    stepBriefs: { [stage.id]: brief },
    source: SET_PIECE_MISSION_SOURCE,
    preloadedCargo: !!stage.preloadedCargo,
    upfrontCostCr: retrying || knownRumorOpening
      ? 0 : Math.max(0, Math.round(Number(stage.upfrontCostCr) || 0)),
    cause,
  };
  if (wreck) {
    offer.sourceRef = wreck.bearingSourceRef;
    offer.wreckId = wreck.id;
    offer.channelId = source && source.channelId || null;
  }
  if (Number.isFinite(Number(stage.durationS)) && Number(stage.durationS) > 0) {
    offer.duration_s = Math.max(1, Math.round(Number(stage.durationS)));
  }
  if (clauses.length) offer.clauses = clauses;
  return offer;
}

/** Compile one ordinary offer, or the two ordinary sibling offers at the authored choice point. */
export function buildSetPieceMissionOffers(state, rawCursor) {
  let cursor = normalizedCursor(rawCursor);
  const definition = definitionFor(cursor.archetypeId);
  if (!definition) return [];
  const wreck = definition.id === 'long_read' ? longReadTarget(state, cursor) : null;
  if (definition.id === 'long_read' && !wreck) return [];
  if (wreck && !cursor.wreckId) cursor = { ...cursor, wreckId: wreck.id };
  let rows = stageAt(definition, cursor);
  const bearing = wreck && state && state.player && state.player.uniqueWrecks
    && state.player.uniqueWrecks.bearings
    && state.player.uniqueWrecks.bearings[wreck.id];
  const branchChoiceIndex = Array.isArray(definition.commonStages) ? definition.commonStages.length : 0;
  if (definition.id === 'long_read' && cursor.stageIndex >= branchChoiceIndex
    && bearing && bearing.phase === 'salvaged' && bearing.choiceId) {
    rows = rows.filter(({ stage }) => (
      stage && stage.params && stage.params.wreckChoiceId === bearing.choiceId
    ));
  }
  return rows.map(({ stage, branch }) => (
    buildOffer(state, definition, cursor, stage, branch, wreck)
  ));
}

function receiptFor(definition, stage, cause, settlement, offers) {
  const completed = settlement.outcome === 'completed';
  const fallback = completed
    ? `${definition.title} records ${stage.title || stage.id} complete and closes this part of the file.`
    : `${definition.title} records ${stage.title || stage.id} unresolved under ${settlement.reason || settlement.outcome}.`;
  const houseText = textFor(completed ? stage.successRef : stage.failureRef, fallback);
  const recoveryText = completed || offers.length === 0 ? null : textFor(
    stage.recoveryRef,
    `${definition.title} leaves one reduced-stake recovery posting open for the same obligation.`,
  );
  const nextStationIds = [...new Set(offers.map((offer) => offer.stationId).filter(Boolean))];
  return {
    chainId: cause.chainId,
    archetypeId: cause.archetypeId,
    stageIndex: cause.stageIndex,
    stageId: cause.stageId || stage.id,
    branchId: cause.branchId || null,
    attempt: cause.attempt,
    house: cause.house || definition.house || null,
    outcome: settlement.outcome,
    reason: settlement.reason || null,
    houseText,
    recoveryText,
    nextStationId: nextStationIds.length === 1 ? nextStationIds[0] : null,
    nextStationIds,
    wreckId: cause.wreckId || null,
  };
}

/**
 * Compile settlement into the next normal board offer(s). Failure/expiry/abandon gets exactly one
 * reduced-pay retry; a failed recovery resolves terminally instead of opening an infinite loop.
 */
export function advanceSetPieceMission(state, settledMission, rawSettlement) {
  const cause = settledMission && settledMission.cause;
  const settlement = {
    outcome: String(rawSettlement && rawSettlement.outcome || 'failed'),
    reason: rawSettlement && rawSettlement.reason || null,
  };
  const definition = definitionFor(cause && cause.archetypeId);
  if (!definition || !cause || cause.chainId == null) {
    return { status: 'completed', offers: [], receipt: null };
  }
  const cursor = normalizedCursor(cause);
  const located = stageAt(definition, cursor);
  const selected = located.find((row) => (
    (row.branch && row.branch.id || null) === (cause.branchId || null)
  )) || located[0];
  const stage = selected && selected.stage;
  if (!stage) return { status: 'completed', offers: [], receipt: null };

  let status = 'completed';
  let offers = [];
  if (settlement.outcome === 'completed') {
    const nextCursor = {
      archetypeId: cause.archetypeId,
      startEpoch: cause.startEpoch,
      stageIndex: cause.stageIndex + 1,
      branchId: cause.branchId || null,
      attempt: 0,
      wreckId: cause.wreckId || null,
    };
    offers = buildSetPieceMissionOffers(state, nextCursor);
    if (offers.length === 2) status = 'branch_available';
    else if (offers.length === 1) status = 'advanced';
  } else if ((cause.attempt | 0) === 0) {
    offers = buildSetPieceMissionOffers(state, {
      archetypeId: cause.archetypeId,
      startEpoch: cause.startEpoch,
      stageIndex: cause.stageIndex,
      branchId: cause.branchId || null,
      attempt: 1,
      wreckId: cause.wreckId || null,
    });
    status = offers.length ? 'retry' : 'completed';
  }
  return {
    status,
    offers,
    receipt: receiptFor(definition, stage, cause, settlement, offers),
  };
}

export default {
  SET_PIECE_MISSION_SOURCE,
  buildSetPieceMissionOffers,
  advanceSetPieceMission,
};
