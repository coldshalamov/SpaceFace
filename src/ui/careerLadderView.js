// Pure career-ladder presenter (CL-UI-00).
// DOM-free view models for station rail + mission-log chip + map handoff.
// Reads registered defs + leaf state only. Never writes state, never emits bus,
// never uses Math.random / Date.now / wall clock. No debug-field leakage.

import {
  getLadderDefinition,
  listLadderDefinitions,
} from '../careers/ladders/careerLadders.js';
import {
  evaluatePrerequisites,
  LADDER_STATUS,
  STEP_STATUS,
  simTimeOf,
} from '../careers/ladders/ladderShared.js';
import { HAULER_STEP_PARAMS } from '../careers/ladders/haulerLadderDefs.js';
import { MAP_FOCUS, mapHandoffAction } from './mapAuthority.js';

const RAIL_NOTE = 'Optional. Paths never lock each other.';
const FALLBACK_OBJECTIVE = 'Continue the path.';

function resolveOriginSystem(api) {
  if (!api || typeof api !== 'object') return null;
  if (typeof api.getOfferView === 'function' && api.name === 'careerOrigins') return api;
  if (typeof api.get === 'function') {
    try {
      const system = api.get('careerOrigins');
      if (system && typeof system.getOfferView === 'function') return system;
    } catch {
      // A registry miss means the flight choice is simply unavailable.
    }
  }
  return null;
}

const NEXT_ACTION = Object.freeze({
  latent_locked: 'Finish the matching origin or keep flying.',
  latent_ready_or_offered: 'Start this professional path when ready.',
  active_with_linked_mission: 'Track the contract. Follow nav.',
  active_hunter_pursuit: 'Stay on the legal mark.',
  active_awaiting_choice: 'Choose how this closes.',
  active_hauler_lane_tax_choice: 'Pay, run, or veer — pick the lane.',
  recovering_wait: 'Wait {n}s, then retry.',
  recovering_ready: 'Retry the step.',
  completed: 'Path complete. Others stay open.',
  declined: 'Still available later. Start when ready.',
  abandoned: 'Path closed. Others stay open.',
});

const TERMINAL_BUSY = new Set([
  LADDER_STATUS.ACTIVE,
  LADDER_STATUS.COMPLETED,
  LADDER_STATUS.ABANDONED,
  LADDER_STATUS.RECOVERING,
  LADDER_STATUS.STEP_FAILED,
]);

const ABANDONABLE = new Set([
  LADDER_STATUS.ACTIVE,
  LADDER_STATUS.RECOVERING,
  LADDER_STATUS.OFFERED,
  LADDER_STATUS.STEP_FAILED,
]);

const RAIL_VISIBLE_BUSY = new Set([
  LADDER_STATUS.OFFERED,
  LADDER_STATUS.ACTIVE,
  LADDER_STATUS.RECOVERING,
  LADDER_STATUS.STEP_FAILED,
]);

// ── api resolution ────────────────────────────────────────────────────────────

function resolveSystem(api) {
  if (!api || typeof api !== 'object') return null;
  if (typeof api.getDefinition === 'function'
    || typeof api.getOfferView === 'function'
    || typeof api.getProgress === 'function'
    || typeof api.listDefs === 'function'
    || typeof api.listLadderDefinitions === 'function') {
    return api;
  }
  if (typeof api.get === 'function') {
    try {
      const sys = api.get('careerLadders');
      if (sys && typeof sys === 'object') return sys;
    } catch {
      // ignore registry misses
    }
  }
  return null;
}

function listDefs(api) {
  const sys = resolveSystem(api);
  if (sys) {
    if (typeof sys.listDefs === 'function') {
      const list = sys.listDefs();
      if (Array.isArray(list)) return list;
    }
    if (typeof sys.listLadderDefinitions === 'function') {
      const list = sys.listLadderDefinitions();
      if (Array.isArray(list)) return list;
    }
  }
  return listLadderDefinitions();
}

function defFor(careerId, api) {
  const id = String(careerId || '');
  if (!id) return null;
  const sys = resolveSystem(api);
  if (sys && typeof sys.getDefinition === 'function') {
    const d = sys.getDefinition(id);
    if (d) return d;
  }
  return getLadderDefinition(id);
}

/**
 * Pure leaf read — never calls ensureLadderLeaf (framework hydrate is a write side-effect).
 */
function leafFor(state, careerId) {
  const ladders = state && state.careers && state.careers.ladders;
  if (!ladders || typeof ladders !== 'object') return null;
  const leaf = ladders[careerId];
  return leaf && typeof leaf === 'object' ? leaf : null;
}

/** Pure progress projection from leaf + def (mirrors progressPayload, no ensure). */
function pureProgress(leaf, def, simTime) {
  const total = def && Array.isArray(def.steps) ? def.steps.length : 0;
  let done = 0;
  if (leaf && leaf.steps && typeof leaf.steps === 'object') {
    for (const s of Object.values(leaf.steps)) {
      if (s && s.status === STEP_STATUS.DONE) done += 1;
    }
  }
  return {
    careerId: (leaf && leaf.careerId) || (def && def.careerId) || null,
    status: (leaf && leaf.status) || LADDER_STATUS.LATENT,
    stepId: leaf ? leaf.stepId : null,
    stepIndex: leaf && Number.isFinite(leaf.stepIndex) ? leaf.stepIndex : 0,
    stepsDone: done,
    stepsTotal: total,
    attemptMult: leaf && Number.isFinite(leaf.attemptMult) ? leaf.attemptMult : 1,
    nonBinding: true,
    simTime,
  };
}

/** Pure offer flags from leaf status (mirrors getLadderOfferView canAccept/canDecline). */
function pureOffer(leaf, def) {
  const status = (leaf && leaf.status) || LADDER_STATUS.LATENT;
  const canAccept = status === LADDER_STATUS.OFFERED || status === LADDER_STATUS.LATENT;
  const canDecline = status === LADDER_STATUS.OFFERED;
  return {
    careerId: def.careerId,
    title: def.title,
    status,
    stepId: leaf ? leaf.stepId : null,
    stepIndex: leaf && Number.isFinite(leaf.stepIndex) ? leaf.stepIndex : 0,
    canAccept: !!canAccept
      && status !== LADDER_STATUS.COMPLETED
      && status !== LADDER_STATUS.ACTIVE
      && status !== LADDER_STATUS.ABANDONED,
    canDecline,
    nonBinding: true,
    offerNonce: leaf && Number.isFinite(leaf.offerNonce) ? leaf.offerNonce : 0,
  };
}

/**
 * Prefer api.getOfferView when provided (live system), else pure leaf projection.
 * Never call framework getLadderOfferView — it ensureLadderLeaf-hydrates all defs.
 */
function offerViewFor(state, api, def, leaf) {
  const sys = resolveSystem(api);
  if (sys && typeof sys.getOfferView === 'function') {
    try {
      const v = sys.getOfferView(def.careerId);
      if (v && typeof v === 'object') return v;
    } catch {
      // fall through to pure
    }
  }
  return pureOffer(leaf, def);
}

function progressFor(state, api, def, leaf, simTime) {
  const sys = resolveSystem(api);
  if (sys && typeof sys.getProgress === 'function') {
    try {
      const v = sys.getProgress(def.careerId);
      if (v && typeof v === 'object') return v;
    } catch {
      // fall through to pure
    }
  }
  return pureProgress(leaf, def, simTime);
}

// ── pure copy helpers ─────────────────────────────────────────────────────────

function stepDefOf(def, stepId) {
  if (!def || !Array.isArray(def.steps) || !stepId) return null;
  return def.steps.find((s) => s && s.id === stepId) || null;
}

function currentStepDef(def, leaf, progress) {
  const stepId = (leaf && leaf.stepId)
    || (progress && progress.stepId)
    || null;
  if (stepId) {
    const found = stepDefOf(def, stepId);
    if (found) return found;
  }
  const idx = leaf && Number.isFinite(leaf.stepIndex)
    ? leaf.stepIndex
    : (progress && Number.isFinite(progress.stepIndex) ? progress.stepIndex : 0);
  if (def && Array.isArray(def.steps) && def.steps[idx]) return def.steps[idx];
  return (def && Array.isArray(def.steps) && def.steps[0]) || null;
}

function haulerParams(stepId) {
  if (!stepId) return null;
  return HAULER_STEP_PARAMS[stepId] || null;
}

/** Objective resolution order from the integration contract. */
export function resolveObjective(stepDef, careerId = null) {
  if (!stepDef) return FALLBACK_OBJECTIVE;
  if (typeof stepDef.objective === 'string' && stepDef.objective.trim()) {
    return stepDef.objective.trim();
  }
  if (stepDef.objective && typeof stepDef.objective === 'object') {
    const pv = stepDef.objective.playerVisible;
    if (typeof pv === 'string' && pv.trim()) return pv.trim();
  }
  if (stepDef.dialogue && typeof stepDef.dialogue.acceptLine === 'string'
    && stepDef.dialogue.acceptLine.trim()) {
    return stepDef.dialogue.acceptLine.trim();
  }
  if (careerId === 'hauler' || (stepDef.params && stepDef.params.acceptLine)) {
    const p = stepDef.params || haulerParams(stepDef.id);
    if (p && typeof p.acceptLine === 'string' && p.acceptLine.trim()) {
      return p.acceptLine.trim();
    }
  }
  const hp = haulerParams(stepDef.id);
  if (hp && typeof hp.acceptLine === 'string' && hp.acceptLine.trim()) {
    return hp.acceptLine.trim();
  }
  return FALLBACK_OBJECTIVE;
}

function resolveTeach(stepDef) {
  if (!stepDef) return null;
  if (typeof stepDef.teach === 'string' && stepDef.teach.trim()) return stepDef.teach.trim();
  if (stepDef.objective && typeof stepDef.objective === 'object'
    && typeof stepDef.objective.teach === 'string' && stepDef.objective.teach.trim()) {
    return stepDef.objective.teach.trim();
  }
  const p = stepDef.params || haulerParams(stepDef.id);
  if (p && typeof p.teach === 'string' && p.teach.trim()) return p.teach.trim();
  return null;
}

function tutorialHintsEnabled(state) {
  const g = state && state.settings && state.settings.gameplay;
  if (!g || typeof g !== 'object') return true;
  return g.tutorialHints !== false;
}

function unlockPrereqs(def) {
  if (!def) return [];
  if (Array.isArray(def.unlockPrerequisites) && def.unlockPrerequisites.length) {
    return def.unlockPrerequisites;
  }
  const first = def.steps && def.steps[0];
  if (first && Array.isArray(first.prerequisites)) return first.prerequisites;
  return [];
}

function humanizePrereq(prereq, careerId) {
  if (!prereq || typeof prereq !== 'object') return null;
  const type = prereq.type;
  if (type === 'or') {
    const any = Array.isArray(prereq.any) ? prereq.any : [];
    const labels = any.map((p) => humanizePrereq(p, careerId)).filter(Boolean);
    if (labels.length === 0) return NEXT_ACTION.latent_locked;
    if (labels.length === 1) return labels[0];
    return 'Finish the matching origin or keep flying.';
  }
  if (type === 'and') {
    const all = Array.isArray(prereq.all) ? prereq.all : [];
    const labels = all.map((p) => humanizePrereq(p, careerId)).filter(Boolean);
    return labels[0] || NEXT_ACTION.latent_locked;
  }
  if (type === 'originCompleted' || type === 'originStatus') {
    const id = prereq.careerId || careerId || 'career';
    return `Complete the ${id} origin first.`;
  }
  if (type === 'skillProof') {
    return 'Build more field experience.';
  }
  if (type === 'ladderStepDone') {
    return 'Finish the previous step first.';
  }
  if (type === 'never') return 'Not available.';
  return NEXT_ACTION.latent_locked;
}

function prereqLabelFor(state, def, prereqMet) {
  if (prereqMet) return null;
  const list = unlockPrereqs(def);
  if (!list.length) return NEXT_ACTION.latent_locked;
  // Prefer a single readable unlock reason (first prereq group).
  return humanizePrereq(list[0], def.careerId) || NEXT_ACTION.latent_locked;
}

function statusLabelOf(status, prereqMet) {
  switch (status) {
    case LADDER_STATUS.LATENT:
      return prereqMet ? 'available' : 'locked';
    case LADDER_STATUS.OFFERED:
      return 'offered';
    case LADDER_STATUS.ACTIVE:
      return 'active';
    case LADDER_STATUS.STEP_FAILED:
      return 'failed';
    case LADDER_STATUS.RECOVERING:
      return 'recovering';
    case LADDER_STATUS.COMPLETED:
      return 'complete';
    case LADDER_STATUS.DECLINED:
      return 'passed';
    case LADDER_STATUS.ABANDONED:
      return 'abandoned';
    default:
      return String(status || 'locked');
  }
}

function recoveryModel(leaf, stepDef, status, simTime) {
  const readyAt = leaf && Number.isFinite(leaf.recoverReadyAtS)
    ? leaf.recoverReadyAtS
    : null;
  const inRecovery = status === LADDER_STATUS.RECOVERING
    || status === LADDER_STATUS.STEP_FAILED;
  let secondsLeft = 0;
  if (inRecovery && readyAt != null) {
    secondsLeft = Math.max(0, Math.ceil(readyAt - simTime));
  }
  const ready = inRecovery && (readyAt == null || simTime >= readyAt);
  const hint = (stepDef && stepDef.recovery && stepDef.recovery.hint)
    || (stepDef && stepDef.dialogue && stepDef.dialogue.recoveryLine)
    || null;
  return {
    ready: !!ready,
    readyAtS: readyAt,
    secondsLeft,
    hint: typeof hint === 'string' ? hint : null,
  };
}

function failureLineOf(stepDef, recovery) {
  if (stepDef && stepDef.dialogue && typeof stepDef.dialogue.failLine === 'string') {
    return stepDef.dialogue.failLine;
  }
  if (recovery && recovery.hint) return recovery.hint;
  if (stepDef && stepDef.dialogue && typeof stepDef.dialogue.recoveryLine === 'string') {
    return stepDef.dialogue.recoveryLine;
  }
  return null;
}

function choiceLabelFromDef(def, stepId, choiceId) {
  const step = stepDefOf(def, stepId);
  if (!step || !Array.isArray(step.choices)) return null;
  const ch = step.choices.find((c) => c && c.id === choiceId);
  return ch && typeof ch.label === 'string' ? ch.label : null;
}

/** Last history entry → readable receipt (never raw receipt ids). */
function receiptLineOf(leaf, def) {
  if (!leaf || !Array.isArray(leaf.history) || leaf.history.length === 0) return null;
  const entry = leaf.history[leaf.history.length - 1];
  if (!entry || typeof entry !== 'object') return null;
  const kind = String(entry.kind || '');
  if (kind === 'choice') {
    const label = choiceLabelFromDef(def, entry.stepId, entry.choiceId);
    return label ? `Chose ${label}.` : 'Choice made.';
  }
  if (kind === 'step_done') return 'Step complete.';
  if (kind === 'step_failed') return 'Step failed.';
  if (kind === 'recovered') return 'Retry armed.';
  if (kind === 'abandoned') return 'Path closed.';
  if (kind === 'completed' || kind === 'ladder_completed') return 'Path complete.';
  if (kind === 'accepted') return 'Path started.';
  if (kind === 'declined') return 'Path passed.';
  if (kind === 'offered') return null;
  // Unknown kinds: surface a generic line without dumping payloads.
  if (kind) return 'Progress recorded.';
  return null;
}

function stepChoiceUnresolved(leaf, stepDef) {
  if (!stepDef || !Array.isArray(stepDef.choices) || stepDef.choices.length === 0) {
    return false;
  }
  const rt = leaf && leaf.steps && leaf.steps[stepDef.id];
  if (rt && rt.choiceId) return false;
  return true;
}

function buildChoices(leaf, stepDef, status) {
  if (status !== LADDER_STATUS.ACTIVE) return [];
  if (!stepChoiceUnresolved(leaf, stepDef)) return [];
  return stepDef.choices.map((ch) => ({
    id: String(ch.id),
    label: String(ch.label || ch.id),
    enabled: true,
  }));
}

function findLinkedMission(state, careerId) {
  const active = state && state.missions && Array.isArray(state.missions.active)
    ? state.missions.active
    : [];
  for (const m of active) {
    if (!m || typeof m !== 'object') continue;
    if (m.ladderCareer === careerId) return m;
  }
  return null;
}

function nextActionOf({
  status,
  prereqMet,
  recovery,
  choices,
  careerId,
  stepId,
  linkedMission,
}) {
  if (status === LADDER_STATUS.COMPLETED) return NEXT_ACTION.completed;
  if (status === LADDER_STATUS.ABANDONED) return NEXT_ACTION.abandoned;
  if (status === LADDER_STATUS.DECLINED) return NEXT_ACTION.declined;
  if (status === LADDER_STATUS.LATENT && !prereqMet) return NEXT_ACTION.latent_locked;
  if (status === LADDER_STATUS.LATENT || status === LADDER_STATUS.OFFERED) {
    return NEXT_ACTION.latent_ready_or_offered;
  }
  if (status === LADDER_STATUS.RECOVERING || status === LADDER_STATUS.STEP_FAILED) {
    if (recovery && recovery.ready) return NEXT_ACTION.recovering_ready;
    const n = recovery ? recovery.secondsLeft : 0;
    return NEXT_ACTION.recovering_wait.replace('{n}', String(n));
  }
  if (status === LADDER_STATUS.ACTIVE) {
    if (choices && choices.length > 0) {
      if (careerId === 'hauler' && stepId === 'risk_lane_tax') {
        return NEXT_ACTION.active_hauler_lane_tax_choice;
      }
      return NEXT_ACTION.active_awaiting_choice;
    }
    if (careerId === 'hunter') return NEXT_ACTION.active_hunter_pursuit;
    if (linkedMission) return NEXT_ACTION.active_with_linked_mission;
    return NEXT_ACTION.active_with_linked_mission;
  }
  return NEXT_ACTION.latent_ready_or_offered;
}

function cardVisible(status, prereqMet) {
  if (RAIL_VISIBLE_BUSY.has(status)) return true;
  if (status === LADDER_STATUS.LATENT || status === LADDER_STATUS.DECLINED) {
    return !!prereqMet;
  }
  if (status === LADDER_STATUS.COMPLETED) return true; // collapsed chip allowed
  return false;
}

function attemptMultLabelOf(attemptMult) {
  const m = Number(attemptMult);
  if (!Number.isFinite(m) || m >= 1) return null;
  // Player-facing only — no raw table dump.
  const shown = Math.round(m * 100) / 100;
  return `Pay reduced (×${shown})`;
}

function stripDebug(card) {
  // Defensive: never let debug keys leak even if a caller spreads leaf data.
  const forbidden = [
    'rngSeed',
    'receipts',
    'skillProof',
    'ignorePrereqs',
    'force',
    'orphan',
    'payload',
    'flags',
  ];
  for (const k of forbidden) {
    if (k in card) delete card[k];
  }
  return card;
}

// ── map handoff ───────────────────────────────────────────────────────────────

function currentSectorId(state) {
  return (state && state.world && state.world.currentSectorId) || null;
}

function stepDest(stepDef, careerId) {
  const p = (stepDef && stepDef.params) || haulerParams(stepDef && stepDef.id) || {};
  const stationId = p.destStationId || p.originStationId || null;
  const sectorId = p.destSectorId || p.originSectorId || p.sectorId || p.claimSectorId || null;
  return { stationId, sectorId, pos: null };
}

/**
 * Map handoff for a career ladder step. Uses mapAuthority shapes only.
 * @returns {object|null} mapHandoffAction result or null
 */
export function buildLadderMapAction(state, careerId, api = null) {
  const id = String(careerId || '');
  if (!id || !state) return null;
  const def = defFor(id, api);
  if (!def) return null;
  const leaf = leafFor(state, id);
  const simTime = simTimeOf(state);
  const progress = progressFor(state, api, def, leaf, simTime);
  const stepDef = currentStepDef(def, leaf, progress);
  if (!stepDef) return null;

  const status = (leaf && leaf.status)
    || (progress && progress.status)
    || LADDER_STATUS.LATENT;
  // Map CTAs matter for active / recovering / failed / offered paths.
  if (status === LADDER_STATUS.LATENT && !evaluatePrerequisites(state, unlockPrereqs(def), { careerId: id })) {
    return null;
  }
  if (status === LADDER_STATUS.ABANDONED) return null;

  const linked = findLinkedMission(state, id);
  const dest = stepDest(stepDef, id);
  const sectorId = (linked && (linked.destSectorId || linked.sectorId))
    || dest.sectorId
    || currentSectorId(state);
  const stationId = (linked && linked.destStationId)
    || dest.stationId
    || null;
  const missionId = linked && linked.id ? String(linked.id) : null;
  const pos = (linked && linked.pos && typeof linked.pos === 'object')
    ? linked.pos
    : null;
  const source = `careerLadder:${id}`;
  const stepTitle = stepDef.title || stepDef.id || 'objective';
  const cur = currentSectorId(state);

  if (id === 'hauler') {
    const sameSector = sectorId && cur && sectorId === cur;
    const focus = sameSector || !sectorId ? MAP_FOCUS.LOCAL : MAP_FOCUS.GALAXY;
    return mapHandoffAction({
      focus,
      label: focus === MAP_FOCUS.LOCAL ? 'LOCAL MAP' : 'STAR MAP',
      title: `Open map for ${stepTitle}`,
      body: 'Show the ladder destination and nearby contacts.',
      missionId,
      sectorId: sectorId || null,
      stationId,
      pos,
      source,
    });
  }

  // Hunter / prospector default to local sector focus.
  return mapHandoffAction({
    focus: MAP_FOCUS.LOCAL,
    label: 'LOCAL MAP',
    title: `Open map for ${stepTitle}`,
    body: id === 'hunter'
      ? 'Show the live mark and nearby contacts.'
      : 'Show survey or claim markers nearby.',
    missionId,
    sectorId: sectorId || cur || null,
    stationId,
    pos,
    source,
  });
}

// ── card builder ──────────────────────────────────────────────────────────────

function buildCard(state, def, api, simTime) {
  if (!def || !def.careerId) return null;
  const careerId = String(def.careerId);
  const leaf = leafFor(state, careerId);
  const progress = progressFor(state, api, def, leaf, simTime) || {};
  const offer = offerViewFor(state, api, def, leaf);

  // Orphan / missing title+objective: hide rather than dump debug.
  if (progress && progress.orphan && !def.title) return null;

  const status = (leaf && leaf.status)
    || (progress && progress.status)
    || LADDER_STATUS.LATENT;

  const prereqs = unlockPrereqs(def);
  const prereqMet = evaluatePrerequisites(state, prereqs, { careerId });
  const visible = cardVisible(status, prereqMet);
  if (!visible) return null;

  const stepDef = currentStepDef(def, leaf, progress);
  const stepId = (leaf && leaf.stepId)
    || (progress && progress.stepId)
    || (stepDef && stepDef.id)
    || null;
  const stepIndex = Number.isFinite(leaf && leaf.stepIndex)
    ? leaf.stepIndex
    : (Number.isFinite(progress.stepIndex) ? progress.stepIndex : 0);
  const stepsDone = Number.isFinite(progress.stepsDone) ? progress.stepsDone : 0;
  const stepsTotal = Number.isFinite(progress.stepsTotal)
    ? progress.stepsTotal
    : (Array.isArray(def.steps) ? def.steps.length : 0);
  const stepTitle = (stepDef && stepDef.title) || null;
  const displayStep = stepsTotal > 0
    ? Math.min(stepsTotal, Math.max(1, (Number(stepIndex) || 0) + 1))
    : 0;
  const progressLabel = stepTitle
    ? `Step ${displayStep}/${stepsTotal} · ${stepTitle}`
    : (stepsTotal > 0 ? `Step ${stepsDone}/${stepsTotal}` : null);

  const recovery = recoveryModel(leaf, stepDef, status, simTime);
  const choices = buildChoices(leaf, stepDef, status);
  const linkedMission = findLinkedMission(state, careerId);
  const attemptMult = (leaf && Number.isFinite(leaf.attemptMult))
    ? leaf.attemptMult
    : (Number.isFinite(progress.attemptMult) ? progress.attemptMult : 1);

  const canAccept = prereqMet
    && !TERMINAL_BUSY.has(status)
    && (
      (offer && offer.canAccept)
      || status === LADDER_STATUS.DECLINED
      || status === LADDER_STATUS.LATENT
      || status === LADDER_STATUS.OFFERED
    );

  const canDecline = !!(offer && offer.canDecline);
  const canRecover = (status === LADDER_STATUS.RECOVERING
    || status === LADDER_STATUS.STEP_FAILED)
    && recovery.ready;
  const canAbandon = ABANDONABLE.has(status);
  const canChoose = choices.length > 0
    && status === LADDER_STATUS.ACTIVE
    && stepChoiceUnresolved(leaf, stepDef);

  const failureLine = (status === LADDER_STATUS.RECOVERING
    || status === LADDER_STATUS.STEP_FAILED)
    ? failureLineOf(stepDef, recovery)
    : null;

  const collapsed = status === LADDER_STATUS.COMPLETED;

  const card = {
    careerId,
    title: String(def.title || careerId),
    status,
    statusLabel: statusLabelOf(status, prereqMet),
    stepId,
    stepTitle,
    stepIndex,
    stepsDone,
    stepsTotal,
    progressLabel,
    objective: resolveObjective(stepDef, careerId),
    teach: tutorialHintsEnabled(state) ? resolveTeach(stepDef) : null,
    prereqLabel: prereqLabelFor(state, def, prereqMet),
    prereqMet: !!prereqMet,
    failureLine,
    recovery,
    attemptMultLabel: attemptMultLabelOf(attemptMult),
    choices,
    receiptLine: receiptLineOf(leaf, def),
    nextAction: nextActionOf({
      status,
      prereqMet,
      recovery,
      choices,
      careerId,
      stepId,
      linkedMission,
    }),
    mapAction: buildLadderMapAction(state, careerId, api),
    canAccept: !!canAccept,
    canDecline,
    canRecover: !!canRecover,
    canAbandon: !!canAbandon,
    canChoose: !!canChoose,
    visible: true,
    collapsed: !!collapsed,
    nonBinding: true,
    linkedMissionId: linkedMission && linkedMission.id ? String(linkedMission.id) : null,
  };

  return stripDebug(card);
}

/**
 * Station ladder rail model (pure).
 * @returns {{ nonBinding: true, visible: boolean, note: string, cards: object[] }}
 */
export function buildLadderRailModel(state, api = null) {
  const simTime = simTimeOf(state);
  const defs = listDefs(api);
  if (!Array.isArray(defs) || defs.length === 0) {
    return {
      nonBinding: true,
      visible: false,
      note: RAIL_NOTE,
      cards: [],
    };
  }

  const cards = [];
  for (const def of defs) {
    const card = buildCard(state, def, api, simTime);
    if (card) cards.push(card);
  }

  return {
    nonBinding: true,
    visible: cards.length > 0,
    note: RAIL_NOTE,
    cards,
  };
}

/**
 * Mission Log career chip model (pure, read-only).
 * Surfaces busy / completed ladder cards for the log strip.
 * @returns {{ nonBinding: true, visible: boolean, chips: object[], primary: object|null }}
 */
export function buildMissionLogCareerChip(state, api = null) {
  const rail = buildLadderRailModel(state, api);
  const chips = [];
  for (const card of rail.cards) {
    if (!card) continue;
    const st = card.status;
    if (
      st === LADDER_STATUS.OFFERED
      || st === LADDER_STATUS.ACTIVE
      || st === LADDER_STATUS.RECOVERING
      || st === LADDER_STATUS.STEP_FAILED
      || st === LADDER_STATUS.COMPLETED
    ) {
      chips.push({
        careerId: card.careerId,
        title: card.title,
        stepTitle: card.stepTitle,
        objective: card.objective,
        progressLabel: card.progressLabel,
        stepsDone: card.stepsDone,
        stepsTotal: card.stepsTotal,
        status: card.status,
        statusLabel: card.statusLabel,
        nextAction: card.nextAction,
        failureLine: card.failureLine,
        recovery: card.recovery,
        mapAction: card.mapAction,
        choices: card.choices,
        canChoose: card.canChoose,
        canRecover: card.canRecover,
        canAbandon: card.canAbandon,
        receiptLine: card.receiptLine,
        collapsed: card.collapsed,
        nonBinding: true,
        linkedMissionId: card.linkedMissionId,
      });
    }
  }

  // Prefer active / recovering over offered / completed for primary chip.
  const priority = {
    [LADDER_STATUS.ACTIVE]: 0,
    [LADDER_STATUS.RECOVERING]: 1,
    [LADDER_STATUS.STEP_FAILED]: 2,
    [LADDER_STATUS.OFFERED]: 3,
    [LADDER_STATUS.COMPLETED]: 4,
  };
  chips.sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));

  return {
    nonBinding: true,
    visible: chips.length > 0,
    chips,
    primary: chips[0] || null,
  };
}

/**
 * In-flight origin choice model. This is deliberately separate from the post-origin ladder rail:
 * it presents the three authored starts in Mission Log without giving the UI progression writes.
 */
export function buildMissionLogOriginChoiceModel(state, api = null) {
  const system = resolveOriginSystem(api);
  if (!system) return { nonBinding: true, visible: false, primaryCareerId: null, cards: [] };
  let view;
  try {
    view = system.getOfferView();
  } catch {
    view = null;
  }
  if (!view || !Array.isArray(view.offers)) {
    return { nonBinding: true, visible: false, primaryCareerId: null, cards: [] };
  }

  const recoveringStatuses = new Set(['declined', 'recovering', 'step_failed']);
  // Once a contract owns focus, its ordinary mission card is the clearest surface. Only a failed
  // focused contract remains here so the player can explicitly reissue it without docking.
  const focused = view.focusedCareerId || null;
  const cards = view.offers
    .filter((offer) => {
      if (!offer) return false;
      if (focused) {
        return offer.careerId === focused
          && (!!offer.canAccept || !!offer.canChoose || recoveringStatuses.has(offer.status));
      }
      return !!offer.canAccept || !!offer.canChoose || !!offer.canDecline
        || recoveringStatuses.has(offer.status);
    })
    .map((offer) => {
      const recovering = recoveringStatuses.has(offer.status);
      const kit = offer.upgradeKit || null;
      const choices = Array.isArray(offer.choices) ? offer.choices.map((choice) => ({ ...choice })) : [];
      const selected = choices.find((choice) => choice.selected) || null;
      const choiceSummary = choices.length
        ? choices.map((choice) => `${choice.label}: ${choice.summary}`).join(' · ')
        : null;
      return {
        originChoice: true,
        careerId: offer.careerId,
        title: offer.title,
        status: offer.status,
        statusLabel: offer.choiceRequired ? 'CHOOSE SERVICE'
          : (offer.canAccept ? 'AVAILABLE' : (recovering ? 'REISSUE' : String(offer.status || ''))),
        stepTitle: offer.stepTitle
          || `${String(offer.lane || 'career').toUpperCase()} ORIGIN`,
        objective: offer.line,
        nextAction: offer.choiceRequired
          ? 'Choose high-pay bonded express or the safer open manifest.'
          : (recovering
          ? 'Reissue the same first contract. Progress is not skipped.'
          : (selected
            ? `${selected.label} selected. Start the physical freight contract.`
            : (focused
            ? `Continue the ${offer.title} path with its next physical contract.`
            : `Choose this start to ${offer.verb || 'begin'} through a real contract now.`))),
        receiptLine: selected
          ? `${selected.label} is saved. ${selected.summary}.`
          : (kit
          ? `Primary start issues ${kit.label} immediately; other paths remain open.`
          : 'Other paths remain open.'),
        progressLabel: Number.isFinite(offer.stepIndex) && Number.isFinite(offer.stepCount)
          ? `Contract ${offer.stepIndex + 1}/${offer.stepCount}` : null,
        choices,
        canChoose: !!offer.canChoose,
        choiceAction: 'originChoose',
        choiceSummary,
        selectedChoiceId: offer.selectedChoiceId || null,
        verb: offer.verb || null,
        upgradeKit: kit,
        nonBinding: true,
        canOriginAccept: !!offer.canAccept,
        originAcceptLabel: offer.acceptLabel || null,
        canOriginDecline: !!offer.canDecline,
        canOriginRecover: recovering,
      };
    });

  return {
    nonBinding: true,
    visible: cards.length > 0,
    primaryCareerId: view.primaryCareerId || null,
    cards,
  };
}
