// CL-03 Prospector ladder FSM adapter (candidate).
// Listens to verified live authorities and drives CL-00 applyLadderSignal.
// Never writes credits/cargo/rep/heat/story — emits canonical intents only.
// Not registered in registry.js (lead integrates). Deterministic: state.simTime only.
//
// Live payload contracts only — see prospectorLadderDefs.js header for emitters.

import { isPlayerWanted } from '../../systems/heat.js';
import {
  gradeAtLeast,
  pickBestDepositAppraisal,
} from '../origins/prospectorOriginAppraisal.js';
import {
  applyLadderSignal,
  assertNoNondeterminism,
  attemptMultiplier,
  CAREER_LADDER_EVENTS,
  emitIntents,
  emitOn,
  LADDER_STATUS,
  STEP_STATUS,
  simTimeOf,
  validateLadderDefinition,
} from './ladderShared.js';
import {
  ensureCareerLaddersState,
  ensureLadderLeaf,
  getLadderLeaf,
  serializeCareerLadders,
  deserializeCareerLadders,
} from './ladderSchema.js';
import {
  clearLadderDefinitions,
  registerLadderDefinition,
  getLadderDefinition,
} from './careerLadders.js';
import {
  PROSPECTOR_LADDER_DEF,
  PROSPECTOR_LADDER_DIALOGUE,
  PROSPECTOR_LADDER_EVENTS,
  PROSPECTOR_LADDER_FAILURE,
  PROSPECTOR_LADDER_ID,
  PROSPECTOR_LADDER_LISTEN,
  PROSPECTOR_LADDER_PARAMS,
  PROSPECTOR_LADDER_PAYLOAD_KEYS,
  PROSPECTOR_LADDER_STEP_IDS,
  PROSPECTOR_ROLE_HULL_DEF_ID,
  PROSPECTOR_SKILL_PROOF_KEY,
  assertProspectorLadderCopyBudget,
} from './prospectorLadderDefs.js';

export {
  PROSPECTOR_LADDER_DEF,
  PROSPECTOR_LADDER_DIALOGUE,
  PROSPECTOR_LADDER_EVENTS,
  PROSPECTOR_LADDER_FAILURE,
  PROSPECTOR_LADDER_ID,
  PROSPECTOR_LADDER_LISTEN,
  PROSPECTOR_LADDER_PARAMS,
  PROSPECTOR_LADDER_PAYLOAD_KEYS,
  PROSPECTOR_LADDER_STEP_IDS,
  PROSPECTOR_SKILL_PROOF_KEY,
  assertProspectorLadderCopyBudget,
  assertNoNondeterminism,
  attemptMultiplier,
  validateLadderDefinition,
};

const ORE_LIKE = /^(cmdty_ore_|cmdty_silicate|cmdty_ice)/;
const ROLE_HULL_STEP_ID = 'role_hull_capstone';

function ownsRoleHull(state) {
  const owned = state && state.player && state.player.ownedShips;
  return Array.isArray(owned) && owned.some((ship) => ship && ship.defId === PROSPECTOR_ROLE_HULL_DEF_ID);
}

function reopenLegacyRoleHullCapstone(state) {
  const own = getProspectorLeaf(state);
  const rt = own && own.steps && own.steps[ROLE_HULL_STEP_ID];
  if (!own || own.status !== LADDER_STATUS.COMPLETED || !rt || rt.status !== STEP_STATUS.PENDING) {
    return own;
  }
  const priorDone = PROSPECTOR_LADDER_DEF.steps.slice(0, -1)
    .every((step) => own.steps[step.id]?.status === STEP_STATUS.DONE);
  if (!priorDone) return own;
  own.status = LADDER_STATUS.ACTIVE;
  own.stepIndex = PROSPECTOR_LADDER_DEF.steps.length - 1;
  own.stepId = ROLE_HULL_STEP_ID;
  rt.status = STEP_STATUS.ACTIVE;
  rt.attempts = Math.max(1, rt.attempts | 0);
  rt.activeSinceS = simTimeOf(state);
  return own;
}

function syncRoleHullCapstone(state, bus) {
  const own = reopenLegacyRoleHullCapstone(state);
  if (!own || own.status !== LADDER_STATUS.ACTIVE || own.stepId !== ROLE_HULL_STEP_ID) {
    return { ok: true, reason: 'inactive' };
  }
  if (!ownsRoleHull(state)) return { ok: true, reason: 'not_owned' };
  return dispatchSignal(state, bus, {
    kind: 'complete',
    receiptId: `step_done:${PROSPECTOR_LADDER_ID}:${ROLE_HULL_STEP_ID}:${PROSPECTOR_ROLE_HULL_DEF_ID}`,
  });
}

// ── definition registration (idempotent for harness re-runs) ─────────────────

let _defRegistered = false;

export function ensureProspectorLadderRegistered() {
  if (_defRegistered && getLadderDefinition(PROSPECTOR_LADDER_ID)) {
    return { ok: true, already: true };
  }
  const existing = getLadderDefinition(PROSPECTOR_LADDER_ID);
  if (existing) {
    _defRegistered = true;
    return { ok: true, already: true };
  }
  const result = registerLadderDefinition(PROSPECTOR_LADDER_DEF);
  if (result.ok) _defRegistered = true;
  return result;
}

/** Test helper: drop process-local definition registry (shared with CL-00). */
export function resetProspectorLadderRegistration() {
  _defRegistered = false;
  clearLadderDefinitions();
}

// ── leaf / payload helpers ────────────────────────────────────────────────────

export function getProspectorLeaf(state) {
  ensureProspectorLadderRegistered();
  const def = getLadderDefinition(PROSPECTOR_LADDER_ID) || PROSPECTOR_LADDER_DEF;
  return ensureLadderLeaf(state, def);
}

function stepRuntime(own, stepId) {
  if (!own || !own.steps) return null;
  return own.steps[stepId] || null;
}

function ensurePayload(stepRt) {
  if (!stepRt) return null;
  if (!stepRt.payload || typeof stepRt.payload !== 'object') stepRt.payload = {};
  return stepRt.payload;
}

function isActiveStep(own, stepId) {
  return !!own
    && own.status === LADDER_STATUS.ACTIVE
    && own.stepId === stepId
    && stepRuntime(own, stepId)
    && stepRuntime(own, stepId).status === STEP_STATUS.ACTIVE;
}

function dispatchSignal(state, bus, signal, opts = {}) {
  const injected = opts && opts.ladders;
  const ladders = injected
    || (state && typeof state === 'object' ? liveLadderAuthorityByState.get(state) : null);
  if (ladders && typeof ladders.applySignal === 'function') {
    const authorityOpts = { ...opts };
    delete authorityOpts.ladders;
    return ladders.applySignal(PROSPECTOR_LADDER_ID, signal, authorityOpts);
  }
  const def = getLadderDefinition(PROSPECTOR_LADDER_ID) || PROSPECTOR_LADDER_DEF;
  const own = ensureLadderLeaf(state, def);
  const t = simTimeOf(state);
  const result = applyLadderSignal(own, def, signal, t, { state, ...opts });
  if (!result || !result.ok) return result;
  emitIntents(bus, result.intents);
  if (Array.isArray(result.events)) {
    for (const ev of result.events) {
      if (ev && ev.event) emitOn(bus, ev.event, ev.payload);
    }
  }
  return result;
}

// Ephemeral adapter binding only. Durable ladder state remains owned by the
// registered careerLadders system; this map is never serialized.
const liveLadderAuthorityByState = new WeakMap();

function noteSkillProof(state, key, delta = 1) {
  const authority = state && typeof state === 'object'
    ? liveLadderAuthorityByState.get(state)
    : null;
  if (authority && typeof authority.noteSkillProof === 'function') {
    authority.noteSkillProof(key, delta);
    return;
  }
  const ladders = ensureCareerLaddersState(state);
  if (!ladders || !ladders.__meta) return;
  if (!ladders.__meta.skillProof || typeof ladders.__meta.skillProof !== 'object') {
    ladders.__meta.skillProof = {};
  }
  const k = String(key || '');
  if (!k) return;
  ladders.__meta.skillProof[k] = (Number(ladders.__meta.skillProof[k]) || 0) + (Number(delta) || 0);
}

function entityListOf(state) {
  if (!state) return [];
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') {
    return [...state.entities.values()];
  }
  return [];
}

/**
 * Live scanner stamps scanOreGlyph / scanHighlightUntil on nearby asteroids
 * before emitting scan:completed (scanner.js:_pulse). Prefer that authority.
 */
function liveScannedAsteroids(state) {
  return entityListOf(state).filter((e) => e
    && e.type === 'asteroid'
    && e.data
    && (e.data.scanOreGlyph || e.data.scanHighlightUntil));
}

function claimBodyById(state, claimId) {
  if (!claimId || !state || !state.claims) return null;
  const bodies = Array.isArray(state.claims.bodies) ? state.claims.bodies : [];
  return bodies.find((b) => b && b.id === claimId) || null;
}

function claimOwned(state, claimId) {
  return !!claimBodyById(state, claimId);
}

function dist2(ax, az, bx, bz) {
  const dx = (Number(ax) || 0) - (Number(bx) || 0);
  const dz = (Number(az) || 0) - (Number(bz) || 0);
  return dx * dx + dz * dz;
}

/** True when kill pos is within claim defend radius of the staked body. */
function killNearClaim(state, claimId, payload, radius) {
  const body = claimBodyById(state, claimId);
  if (!body) return false;
  const pos = payload && payload.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  const r = Number(radius) || PROSPECTOR_LADDER_PARAMS.conflict.claimDefendRadius;
  return dist2(pos.x, pos.z, body.x, body.z) <= r * r;
}

function isClaimThreatShape(kindOrShape) {
  return kindOrShape === PROSPECTOR_LADDER_PARAMS.conflict.encounterShape
    || kindOrShape === 'claim_threat';
}

// ── success predicates ────────────────────────────────────────────────────────

function surveySuccess(payload, params) {
  const sites = Number(payload.surveyCount) || 0;
  const fair = Number(payload.fairAppraisals) || 0;
  const minSites = params.minSurveySites || 3;
  // Embodied scan path: three fair-graded survey sites.
  if (sites >= minSites && fair >= 1) return true;
  // Mission path: recon_scan completed (missions already counted 3 sector scans).
  if (payload.missionCompleted) return true;
  return false;
}

function seamSuccess(payload, params) {
  const yieldU = Number(payload.yieldU) || 0;
  const seams = Number(payload.seamHits) || 0;
  const coreOrFracture = !!(payload.richCoreHit || payload.fractureChunksHauled);
  if (yieldU < (params.yieldUnits || 8)) return false;
  if (seams < (params.seamHits || 3)) return false;
  if (params.requireCoreOrFracture && !coreOrFracture) return false;
  return true;
}

function conflictSuccess(state, payload, params) {
  if (!(Number(payload.threatsKilled) || 0) && !payload.threatResolved) return false;
  if (params.successRequiresClaimOwned) {
    if (!claimOwned(state, payload.activeClaimId)) return false;
  }
  if (params.successRequiresNotWanted && isPlayerWanted(state)) return false;
  if (payload.wantedDuring) return false;
  if (payload.lawfulKill) return false;
  return true;
}

function refinerySuccess(payload, params) {
  // Path A: on-claim refinery module built.
  if (payload.moduleBuilt === params.moduleId || payload.refinePath === params.pathA) {
    if (payload.moduleBuilt === params.moduleId) return true;
  }
  // Path B: station sell qty or bulk haul massU ≥ min.
  const sold = Number(payload.soldQty) || 0;
  const bulk = Number(payload.bulkMassU) || 0;
  if (sold + bulk >= (params.pathBMinQty || 8)) return true;
  return false;
}

// ── step handlers ─────────────────────────────────────────────────────────────

function handleSurvey(state, bus, own, event, payload) {
  const stepId = 'survey_circuit';
  if (!isActiveStep(own, stepId)) return;
  const stepRt = stepRuntime(own, stepId);
  const p = ensurePayload(stepRt);
  const params = PROSPECTOR_LADDER_PARAMS.survey;

  // Live scan:pulse is { pos } only — telemetry of pulse origin, never empty-fail.
  if (event === 'scan:pulse') {
    if (payload && payload.pos) {
      p.lastPulseX = Number(payload.pos.x) || 0;
      p.lastPulseZ = Number(payload.pos.z) || 0;
    }
    return;
  }

  if (event === 'scan:completed') {
    // Live pulse complete: { targetId, sectorId, found:{asteroids,wrecks,anomalies} }.
    // world.js may emit { targetId:null } without `found` — ignore (not a pulse survey site).
    if (!payload || !payload.found || typeof payload.found !== 'object') return;
    const found = payload.found;
    const asteroidsFound = Math.max(0, Math.floor(Number(found.asteroids) || 0));

    if (asteroidsFound <= 0) {
      p.emptyPulses = (Number(p.emptyPulses) || 0) + 1;
      const need = params.emptyPulsesToFail || 3;
      if (p.emptyPulses >= need && (Number(p.surveyCount) || 0) < params.minSurveySites) {
        dispatchSignal(state, bus, {
          kind: 'fail',
          stepId,
          code: PROSPECTOR_LADDER_FAILURE.survey_circuit.empty_pulse,
        });
      }
      return;
    }

    // Appraise from live-stamped scanned asteroids (scanner authority).
    let appraisal = null;
    const scanned = liveScannedAsteroids(state);
    if (scanned.length) appraisal = pickBestDepositAppraisal(scanned);
    // No invented grade — only count when appraisal is real.
    if (!appraisal || !appraisal.ok) {
      p.emptyPulses = (Number(p.emptyPulses) || 0) + 1;
      const need = params.emptyPulsesToFail || 3;
      if (p.emptyPulses >= need && (Number(p.surveyCount) || 0) < params.minSurveySites) {
        dispatchSignal(state, bus, {
          kind: 'fail',
          stepId,
          code: PROSPECTOR_LADDER_FAILURE.survey_circuit.empty_pulse,
        });
      }
      return;
    }

    p.emptyPulses = 0;
    p.surveyCount = (Number(p.surveyCount) || 0) + 1;
    p.appraisals = (Number(p.appraisals) || 0) + 1;
    if (gradeAtLeast(appraisal.grade, params.minAppraisalGrade)) {
      p.fairAppraisals = (Number(p.fairAppraisals) || 0) + 1;
    }
    emitOn(bus, PROSPECTOR_LADDER_EVENTS.SURVEY, {
      careerId: PROSPECTOR_LADDER_ID,
      surveyCount: p.surveyCount,
      fairAppraisals: p.fairAppraisals,
      grade: appraisal.grade,
      sectorId: payload && payload.sectorId != null ? payload.sectorId : null,
      simTime: simTimeOf(state),
    });
    if (surveySuccess(p, params)) {
      dispatchSignal(state, bus, { kind: 'complete', stepId });
    }
    return;
  }

  if (event === 'mission:accepted') {
    // Live: { missionId, type, storyTag? }
    if (payload && payload.type === params.missionType && payload.missionId != null) {
      p.missionId = payload.missionId;
    }
    return;
  }

  if (event === 'mission:completed') {
    // Live: { missionId, type, factionId, repMult }
    const type = payload && payload.type;
    const missionId = payload && payload.missionId;
    if (type === params.missionType
      || (p.missionId != null && missionId != null && missionId === p.missionId)) {
      p.missionId = missionId != null ? missionId : p.missionId;
      p.missionCompleted = true;
      p.surveyCount = Math.max(Number(p.surveyCount) || 0, params.scanTargets);
      if (surveySuccess(p, params)) {
        dispatchSignal(state, bus, { kind: 'complete', stepId });
      }
    }
    return;
  }

  if (event === 'mission:failed' || event === 'mission:expired') {
    // Live fail: { missionId, reason } — no type. Match stamped recon_scan id only.
    const missionId = payload && payload.missionId;
    if (p.missionId == null || missionId == null || missionId !== p.missionId) return;
    const reason = payload && payload.reason;
    const code = (reason === 'deadline' || event === 'mission:expired')
      ? PROSPECTOR_LADDER_FAILURE.survey_circuit.timer
      : PROSPECTOR_LADDER_FAILURE.survey_circuit.timer;
    dispatchSignal(state, bus, { kind: 'fail', stepId, code });
  }
}

function handleSeam(state, bus, own, event, payload) {
  const stepId = 'seam_fracture_mastery';
  if (!isActiveStep(own, stepId)) return;
  const stepRt = stepRuntime(own, stepId);
  const p = ensurePayload(stepRt);
  const params = PROSPECTOR_LADDER_PARAMS.seam;

  if (event === 'mining:yield') {
    // Live: { commodityId, qty, pos?, minerId, richCore? }
    if (payload && payload.minerId != null && state.playerId != null
      && payload.minerId !== state.playerId) {
      return;
    }
    const qty = Math.max(0, Number(payload && payload.qty) || 0);
    p.yieldU = (Number(p.yieldU) || 0) + qty;
    if (payload && payload.richCore) p.richCoreHit = true;
    if (qty > 0) noteSkillProof(state, PROSPECTOR_SKILL_PROOF_KEY, qty);
    emitOn(bus, PROSPECTOR_LADDER_EVENTS.SEAM, {
      careerId: PROSPECTOR_LADDER_ID,
      yieldU: p.yieldU,
      seamHits: p.seamHits,
      simTime: simTimeOf(state),
    });
    if (seamSuccess(p, params)) {
      dispatchSignal(state, bus, { kind: 'complete', stepId });
    }
    return;
  }

  if (event === 'mining:seamHit') {
    // Live: { asteroidId }
    p.seamHits = (Number(p.seamHits) || 0) + 1;
    if (seamSuccess(p, params)) {
      dispatchSignal(state, bus, { kind: 'complete', stepId });
    }
    return;
  }

  if (event === 'mining:richCoreExposed' || event === 'mining:richCoreCompleted') {
    p.richCoreHit = true;
    if (seamSuccess(p, params)) {
      dispatchSignal(state, bus, { kind: 'complete', stepId });
    }
    return;
  }

  if (event === 'mining:richCoreFizzle') {
    p.richCoreFizzle = true;
    if (params.requireCoreOrFracture
      && !p.fractureChunksHauled
      && !p.richCoreHit
      && (Number(p.yieldU) || 0) >= params.yieldUnits
      && (Number(p.seamHits) || 0) >= params.seamHits) {
      dispatchSignal(state, bus, {
        kind: 'fail',
        stepId,
        code: PROSPECTOR_LADDER_FAILURE.seam_fracture_mastery.core_miss,
      });
    }
    return;
  }

  if (event === 'tether:latched') {
    // Live: { targetId, type } — latch during seam step counts as haul practice.
    p.fractureChunksHauled = (Number(p.fractureChunksHauled) || 0) + 1;
    if (seamSuccess(p, params)) {
      dispatchSignal(state, bus, { kind: 'complete', stepId });
    }
    return;
  }

  if (event === 'tether:broke') {
    p.lineParted = (Number(p.lineParted) || 0) + 1;
    return;
  }

  if (event === 'cargo:full') {
    // Live: { commodityId }
    p.holdJammed = true;
    if ((Number(p.yieldU) || 0) < params.yieldUnits) {
      dispatchSignal(state, bus, {
        kind: 'fail',
        stepId,
        code: PROSPECTOR_LADDER_FAILURE.seam_fracture_mastery.hold_jammed,
      });
    }
    return;
  }

  if (event === 'weapons:vent') {
    // Telemetry only: weapon overheat vent ≠ WANTED heat (heat.js).
    p.ventCount = (Number(p.ventCount) || 0) + 1;
  }
}

function handleClaimStake(state, bus, own, event, payload) {
  const stepId = 'claim_stake';
  if (!isActiveStep(own, stepId)) return;
  const stepRt = stepRuntime(own, stepId);
  const p = ensurePayload(stepRt);

  if (event === 'claim:claimed') {
    // Live: { body } with body.id
    const body = payload && (payload.body || payload);
    const id = body && body.id;
    if (id) {
      p.activeClaimId = id;
      // Top-level leaf field survives migrateLadderInstance (flags are force-reset).
      own.activeClaimId = id;
      emitOn(bus, PROSPECTOR_LADDER_EVENTS.CLAIM, {
        careerId: PROSPECTOR_LADDER_ID,
        claimId: id,
        simTime: simTimeOf(state),
      });
      dispatchSignal(state, bus, { kind: 'complete', stepId });
    }
  }
}

function ensureConflictClaimId(own, p) {
  if (!p.activeClaimId && own.activeClaimId) {
    p.activeClaimId = own.activeClaimId;
  }
  if (!p.activeClaimId) {
    const prev = stepRuntime(own, 'claim_stake');
    if (prev && prev.payload && prev.payload.activeClaimId) {
      p.activeClaimId = prev.payload.activeClaimId;
      own.activeClaimId = p.activeClaimId;
    }
  }
}

function handleConflict(state, bus, own, event, payload) {
  const stepId = 'claim_conflict';
  if (!isActiveStep(own, stepId)) return;
  const stepRt = stepRuntime(own, stepId);
  const p = ensurePayload(stepRt);
  const params = PROSPECTOR_LADDER_PARAMS.conflict;
  ensureConflictClaimId(own, p);

  // Live claim_threat telegraph/spawn — stamp threat evidence before kills count.
  if (event === 'encounter:spawned') {
    // Live: { encounterId, kind, squadId, sectorId, zoneId, count }
    if (payload && isClaimThreatShape(payload.kind)) {
      p.threatReceiptId = payload.encounterId != null ? payload.encounterId : p.threatReceiptId;
      p.threatActive = true;
    }
    return;
  }

  if (event === 'encounter:resolved' || event === 'encounter:receipt') {
    // Live resolved: { encounterId, shape, kind, outcome, … }
    // Live receipt:  { encounterId, shape, outcome, text, t }
    const shape = payload && (payload.shape || payload.kind);
    if (!payload || !isClaimThreatShape(shape)) return;
    if (p.threatReceiptId != null && payload.encounterId != null
      && payload.encounterId !== p.threatReceiptId) {
      // Different encounter — ignore.
      return;
    }
    if (payload.encounterId != null) p.threatReceiptId = payload.encounterId;
    if (payload.outcome === 'defended') {
      p.threatActive = false;
      p.threatResolved = true;
      emitOn(bus, PROSPECTOR_LADDER_EVENTS.CONFLICT, {
        careerId: PROSPECTOR_LADDER_ID,
        outcome: 'defended',
        threatReceiptId: p.threatReceiptId,
        simTime: simTimeOf(state),
      });
      if (conflictSuccess(state, p, params)) {
        dispatchSignal(state, bus, { kind: 'complete', stepId });
      }
    } else if (payload.outcome === 'ignored' || payload.outcome === 'picked'
      || (typeof payload.outcome === 'string' && payload.outcome.startsWith('aborted'))) {
      p.threatActive = false;
    }
    return;
  }

  if (event === 'heat:changed') {
    // Live: { value, level, zone, reason }
    if (isPlayerWanted(state)) {
      p.wantedDuring = true;
      dispatchSignal(state, bus, {
        kind: 'fail',
        stepId,
        code: PROSPECTOR_LADDER_FAILURE.claim_conflict.heat_spiked,
      });
    }
    return;
  }

  // Player death is player:death — combat never emits entity:killed for the player.
  if (event === 'player:death') {
    dispatchSignal(state, bus, {
      kind: 'fail',
      stepId,
      code: PROSPECTOR_LADDER_FAILURE.claim_conflict.player_destroyed,
    });
    return;
  }

  if (event === 'entity:killed') {
    // Live: { id, killerId, type, pos, factionId, factionLawful, bountyCr, lootTableId, victimClass }
    const killerId = payload && payload.killerId;
    const playerId = state && state.playerId;
    const playerKilled = killerId != null && playerId != null && killerId === playerId;
    if (!playerKilled) return;

    const lawful = !!(payload && payload.factionLawful);
    if (lawful) {
      p.lawfulKill = true;
      dispatchSignal(state, bus, {
        kind: 'fail',
        stepId,
        code: PROSPECTOR_LADDER_FAILURE.claim_conflict.lawful_kill,
      });
      return;
    }

    // Threat kill only counts with live claim_threat evidence OR kill near claim body.
    const nearClaim = killNearClaim(state, p.activeClaimId, payload, params.claimDefendRadius);
    const threatEvidence = !!p.threatActive || !!p.threatReceiptId;
    if (!threatEvidence && !nearClaim) {
      // Random open-space kill is not claim defense.
      return;
    }

    p.threatsKilled = (Number(p.threatsKilled) || 0) + 1;
    if ((Number(p.threatsKilled) || 0) >= (params.threatsRequired || 1)) {
      p.threatResolved = true;
    }
    emitOn(bus, PROSPECTOR_LADDER_EVENTS.CONFLICT, {
      careerId: PROSPECTOR_LADDER_ID,
      threatsKilled: p.threatsKilled,
      simTime: simTimeOf(state),
    });
    if (conflictSuccess(state, p, params)) {
      dispatchSignal(state, bus, { kind: 'complete', stepId });
    }
    return;
  }

  if (event === 'dock:docked') {
    // Live: { stationId } — docking away mid-defense abandons claim radius.
    if (p.threatActive || p.threatReceiptId) {
      if (!p.threatResolved && (Number(p.threatsKilled) || 0) < (params.threatsRequired || 1)) {
        dispatchSignal(state, bus, {
          kind: 'fail',
          stepId,
          code: PROSPECTOR_LADDER_FAILURE.claim_conflict.abandoned_claim_radius,
        });
      }
    }
  }
}

function handleRefinery(state, bus, own, event, payload) {
  const stepId = 'refinery_sector_consequence';
  if (!isActiveStep(own, stepId)) return;
  const stepRt = stepRuntime(own, stepId);
  const p = ensurePayload(stepRt);
  const params = PROSPECTOR_LADDER_PARAMS.refinery;

  if (event === 'claim:moduleBuilt') {
    // Live: { bodyId, modId }
    const modId = payload && (payload.modId || payload.moduleId);
    if (modId === params.moduleId) {
      p.moduleBuilt = modId;
      p.refinePath = params.pathA;
      emitOn(bus, PROSPECTOR_LADDER_EVENTS.REFINE, {
        careerId: PROSPECTOR_LADDER_ID,
        path: params.pathA,
        modId,
        simTime: simTimeOf(state),
      });
      if (refinerySuccess(p, params)) {
        dispatchSignal(state, bus, { kind: 'complete', stepId });
      }
    }
    return;
  }

  if (event === 'economy:tradeCompleted') {
    // Live: { stationId, commodityId, side, qty, unitAvg, total, … }
    const side = payload && payload.side;
    const commodityId = payload && payload.commodityId;
    const qty = Math.max(0, Number(payload && payload.qty) || 0);
    if (side === 'sell' && commodityId && ORE_LIKE.test(String(commodityId))) {
      p.soldQty = (Number(p.soldQty) || 0) + qty;
      p.refinePath = p.refinePath || params.pathB;
      emitOn(bus, PROSPECTOR_LADDER_EVENTS.REFINE, {
        careerId: PROSPECTOR_LADDER_ID,
        path: params.pathB,
        soldQty: p.soldQty,
        simTime: simTimeOf(state),
      });
      if (refinerySuccess(p, params)) {
        dispatchSignal(state, bus, { kind: 'complete', stepId });
      }
    }
    return;
  }

  if (event === 'mining:bulkHaulDelivered') {
    // Live: { stationId, chunkId, massU, commodityId, basePrice, gross, fee, credits }
    // massU is the real quantity field — not qty/units.
    const massU = Math.max(0, Number(payload && payload.massU) || 0);
    p.bulkMassU = (Number(p.bulkMassU) || 0) + massU;
    p.refinePath = p.refinePath || params.pathB;
    if (refinerySuccess(p, params)) {
      dispatchSignal(state, bus, { kind: 'complete', stepId });
    }
    return;
  }

  if (event === 'fieldDepletion:changed') {
    // Live: { fieldId, sectorId, depleted, richnessMult, extractedU, destroyedCount, reason }
    // No `refined` field — never invent one. Telemetry only; not a success gate alone.
    // NPC barges change the shared field for everyone, but their cut is not the player's skill
    // proof. Keep world/presentation consumers informed while leaving this personal log untouched.
    if (payload && payload.source === 'traffic_npc_job') return;
    p.fieldTouched = true;
    if (payload && payload.fieldId != null) p.fieldId = payload.fieldId;
    if (payload && payload.extractedU != null) {
      p.fieldExtractedU = Number(payload.extractedU) || 0;
    }
  }
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Route a live bus event into the active step handler.
 * Safe no-op when ladder is latent/offered/done or wrong step.
 */
export function applyProspectorLadderEvent(state, bus, event, payload = {}) {
  if (!state || !event) return { ok: false, reason: 'missing' };
  ensureProspectorLadderRegistered();
  const own = getProspectorLeaf(state);
  if (!own) return { ok: false, reason: 'no_leaf' };
  if (own.status !== LADDER_STATUS.ACTIVE && own.status !== LADDER_STATUS.RECOVERING) {
    // Still track skill proof on yield for soft unlock even when ladder latent.
    if (event === 'mining:yield') {
      const qty = Math.max(0, Number(payload && payload.qty) || 0);
      if (qty > 0
        && (payload.minerId == null || state.playerId == null || payload.minerId === state.playerId)) {
        noteSkillProof(state, PROSPECTOR_SKILL_PROOF_KEY, qty);
      }
    }
    return { ok: true, reason: 'inactive' };
  }

  switch (own.stepId) {
    case 'survey_circuit':
      handleSurvey(state, bus, own, event, payload);
      break;
    case 'seam_fracture_mastery':
      handleSeam(state, bus, own, event, payload);
      break;
    case 'claim_stake':
      handleClaimStake(state, bus, own, event, payload);
      break;
    case 'claim_conflict':
      handleConflict(state, bus, own, event, payload);
      break;
    case 'refinery_sector_consequence':
      handleRefinery(state, bus, own, event, payload);
      break;
    case ROLE_HULL_STEP_ID:
      if (event === 'ship:purchased' && payload.defId === PROSPECTOR_ROLE_HULL_DEF_ID) {
        syncRoleHullCapstone(state, bus);
      }
      break;
    default:
      break;
  }
  return { ok: true, stepId: own.stepId, status: own.status };
}

export function offerProspectorLadder(state, bus, opts = {}) {
  ensureProspectorLadderRegistered();
  return dispatchSignal(state, bus, { kind: 'offer', ...opts }, opts);
}

export function acceptProspectorLadder(state, bus, opts = {}) {
  ensureProspectorLadderRegistered();
  // Auto-offer from latent for station-rail convenience (mirrors careerLadders.accept).
  const own = getProspectorLeaf(state);
  if (own && (own.status === LADDER_STATUS.LATENT || own.status === LADDER_STATUS.DECLINED)) {
    dispatchSignal(state, bus, {
      kind: 'offer',
      force: own.status === LADDER_STATUS.DECLINED,
      ignorePrereqs: !!opts.ignorePrereqs,
    }, opts);
  }
  return dispatchSignal(state, bus, {
    kind: 'accept',
    allowFromLatent: true,
    ignorePrereqs: !!opts.ignorePrereqs,
    ...opts,
  }, opts);
}

export function declineProspectorLadder(state, bus) {
  return dispatchSignal(state, bus, { kind: 'decline' });
}

export function abandonProspectorLadder(state, bus) {
  return dispatchSignal(state, bus, { kind: 'abandon' });
}

export function recoverProspectorLadder(state, bus, opts = {}) {
  return dispatchSignal(state, bus, { kind: 'recover', ...opts }, opts);
}

export function failProspectorLadderStep(state, bus, code, opts = {}) {
  return dispatchSignal(state, bus, { kind: 'fail', code, ...opts }, opts);
}

export function completeProspectorLadderStep(state, bus, opts = {}) {
  return dispatchSignal(state, bus, { kind: 'complete', ...opts }, opts);
}

export function getProspectorLadderProgress(state) {
  ensureProspectorLadderRegistered();
  const def = getLadderDefinition(PROSPECTOR_LADDER_ID) || PROSPECTOR_LADDER_DEF;
  const own = getProspectorLeaf(state);
  if (!own) return null;
  const stepDef = def.steps.find((s) => s.id === own.stepId) || null;
  return {
    careerId: PROSPECTOR_LADDER_ID,
    status: own.status,
    stepId: own.stepId,
    stepIndex: own.stepIndex,
    objective: stepDef ? stepDef.objective : null,
    attemptMult: own.attemptMult,
    nonBinding: true,
    exclusive: false,
    blocksOtherCareers: false,
    payload: own.stepId && own.steps[own.stepId]
      ? { ...(own.steps[own.stepId].payload || {}) }
      : {},
    stepsDone: Object.values(own.steps || {}).filter((s) => s && s.status === STEP_STATUS.DONE).length,
    stepsTotal: PROSPECTOR_LADDER_STEP_IDS.length,
    simTime: simTimeOf(state),
  };
}

/** Flatten all listen events for bus subscription. */
export function listProspectorLadderListenEvents() {
  const set = new Set();
  for (const stepId of PROSPECTOR_LADDER_STEP_IDS) {
    const list = PROSPECTOR_LADDER_LISTEN[stepId] || [];
    for (const e of list) set.add(e);
  }
  return Array.from(set);
}

/**
 * Candidate system object — lead may register later.
 * Owns only bus subscriptions + ladder leaf progress (via CL-00 helpers).
 */
export function createProspectorLadderSystem(opts = {}) {
  return {
    name: 'prospectorLadder',
    state: null,
    bus: null,
    ladders: opts.ladders || null,
    _subs: null,

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      const viaRegistry = ctx.registry && typeof ctx.registry.get === 'function'
        ? ctx.registry.get('careerLadders')
        : null;
      this.ladders = (ctx.ladders && typeof ctx.ladders.applySignal === 'function')
        ? ctx.ladders
        : (viaRegistry && typeof viaRegistry.applySignal === 'function')
          ? viaRegistry
          : (this.ladders && typeof this.ladders.applySignal === 'function')
            ? this.ladders
            : null;
      ensureProspectorLadderRegistered();
      if (this.state && this.ladders) {
        liveLadderAuthorityByState.set(this.state, this.ladders);
        if (typeof this.ladders.getProgress === 'function') {
          this.ladders.getProgress(PROSPECTOR_LADDER_ID);
        }
      }
      this._subs = [];
      for (const event of listProspectorLadderListenEvents()) {
        this._listen(event, (payload) => {
          if (!this.ladders) return;
          applyProspectorLadderEvent(this.state, this.bus, event, payload || {});
        });
      }
      // Soft offer after origin complete (non-binding).
      this._listen('origin:prospector:completed', () => {
        if (!this.state || !this.ladders) return;
        const own = this.ladders.getProgress(PROSPECTOR_LADDER_ID);
        if (own && own.status === LADDER_STATUS.LATENT) {
          this.ladders.offer(PROSPECTOR_LADDER_ID);
        }
      });
      this._listen('save:loaded', () => syncRoleHullCapstone(this.state, this.bus));
      this._listen(CAREER_LADDER_EVENTS.STEP_ACTIVE, (p) => {
        if (p && p.careerId === PROSPECTOR_LADDER_ID && p.stepId === ROLE_HULL_STEP_ID) {
          syncRoleHullCapstone(this.state, this.bus);
        }
      });
      syncRoleHullCapstone(this.state, this.bus);
    },

    newGame() {
      // Scratch-only adapter reset. careerLadders.newGame owns durable leaves
      // and runs before this composite in registry order.
      return { ok: true, reason: 'framework_owned' };
    },

    update(_dt, state) {
      if (state) this.state = state;
      if (!this.state) return;
      const own = getLadderLeaf(this.state, PROSPECTOR_LADDER_ID);
      if (!own) return;
      const t = simTimeOf(this.state);
      // Recovery ready progress (no auto-accept — player/system must recover).
      if (own.status === LADDER_STATUS.RECOVERING
        && Number.isFinite(own.recoverReadyAtS)
        && t >= own.recoverReadyAtS) {
        if (!own.flags) own.flags = {};
        if (!own.flags._recoverReadyEmitted) {
          own.flags._recoverReadyEmitted = true;
          emitOn(this.bus, CAREER_LADDER_EVENTS.PROGRESS, {
            careerId: PROSPECTOR_LADDER_ID,
            status: own.status,
            stepId: own.stepId,
            recoverReady: true,
            nonBinding: true,
            simTime: t,
          });
        }
      }
    },

    serialize() {
      ensureProspectorLadderRegistered();
      return serializeCareerLadders(this.state, {
        list: () => [getLadderDefinition(PROSPECTOR_LADDER_ID) || PROSPECTOR_LADDER_DEF],
        get: (id) => (id === PROSPECTOR_LADDER_ID
          ? (getLadderDefinition(PROSPECTOR_LADDER_ID) || PROSPECTOR_LADDER_DEF)
          : null),
      });
    },

    deserialize(blob) {
      ensureProspectorLadderRegistered();
      return deserializeCareerLadders(this.state, blob, {
        getDef: (id) => (id === PROSPECTOR_LADDER_ID
          ? (getLadderDefinition(PROSPECTOR_LADDER_ID) || PROSPECTOR_LADDER_DEF)
          : null),
      });
    },

    offer(opts) {
      return this.ladders
        ? this.ladders.offer(PROSPECTOR_LADDER_ID, opts)
        : { ok: false, reason: 'no_ladders' };
    },
    accept(opts) {
      return this.ladders
        ? this.ladders.accept(PROSPECTOR_LADDER_ID, opts)
        : { ok: false, reason: 'no_ladders' };
    },
    decline() {
      return this.ladders
        ? this.ladders.decline(PROSPECTOR_LADDER_ID)
        : { ok: false, reason: 'no_ladders' };
    },
    abandon() {
      return this.ladders
        ? this.ladders.abandon(PROSPECTOR_LADDER_ID)
        : { ok: false, reason: 'no_ladders' };
    },
    recover(opts) {
      return this.ladders
        ? this.ladders.recover(PROSPECTOR_LADDER_ID, opts)
        : { ok: false, reason: 'no_ladders' };
    },
    getProgress() {
      return this.ladders
        ? this.ladders.getProgress(PROSPECTOR_LADDER_ID)
        : getProspectorLadderProgress(this.state);
    },

    destroy() {
      if (this.state && liveLadderAuthorityByState.get(this.state) === this.ladders) {
        liveLadderAuthorityByState.delete(this.state);
      }
      for (const off of this._subs || []) {
        try { off(); } catch (_) { /* best-effort */ }
      }
      this._subs = [];
    },

    _listen(event, handler) {
      if (!this.bus || typeof this.bus.on !== 'function') return;
      const off = this.bus.on(event, handler);
      if (typeof off === 'function') this._subs.push(off);
    },
  };
}

/** Singleton candidate instance (mirrors origin export style). */
export const prospectorLadder = createProspectorLadderSystem();

export default prospectorLadder;
