import { faction as MTS } from '../data/factions/mts.js';

const CFG = (MTS.custom && MTS.custom.spineBreak) || {};
const SPINE = (MTS.custom && MTS.custom.cargoSpine) || {};

export const SPINE_BREAK_HEAD_LINKED = 2;
export const SPINE_BREAK_TAIL_LOOSE = 4;
export const SPINE_BREAK_CONTAINER_COUNT = SPINE_BREAK_HEAD_LINKED + SPINE_BREAK_TAIL_LOOSE;
export const SPINE_BREAK_CONTAINER_VALUE_CR = 4200;
export const SPINE_BREAK_SELL_RADIUS_WU = 120;
export const SPINE_BREAK_LEAVE_RADIUS_WU = 1900;
export const SPINE_BREAK_DEADLINE_S = 300;
export const SPINE_BREAK_MAX_RETRIES = 1;

export const SPINE_BREAK_CONFIG = Object.freeze({
  feePerBox: Math.max(0, Number(CFG.recoupleFeePerContainerCr) || 120),
  recoupleGoal: Math.max(1, Math.round(Number(CFG.recoupleGoal) || 3)),
  pitbornFrac: Math.min(1, Math.max(0, Number(CFG.pitbornPriceFrac) || 0.35)),
  linkGapWu: Math.max(20, Number(SPINE.linkGapWu) || 46),
  stretchWu: Math.max(40, Number(SPINE.couplerStretchWu) || 90),
});

export function isSpineBreakOperation(mission) {
  return !!mission && mission.type === 'escort'
    && mission.storyTag === 'campaign47a:b4:operation'
    && mission.params?.bookScene === 'spine_break';
}

export function spineBreakSpineId(mission, attempt = 1) {
  return `spine_${String(mission?.id || 'mission')}_attempt_${Math.max(1, Math.floor(Number(attempt) || 1))}`;
}

// Entity occupant generations are intentionally transient across Save/Continue. These durable
// cast keys travel on the entity and in the mission manifest, then let the mission owner bind the
// freshly spawned generation without trusting a recycled numeric id by itself.
export function spineBreakTugIdentity(mission, attempt = 1) {
  return `${spineBreakSpineId(mission, attempt)}_tug`;
}

export function spineBreakContainerIdentity(mission, index, attempt = 1) {
  const slot = Math.max(0, Math.floor(Number(index) || 0));
  return `${spineBreakSpineId(mission, attempt)}_container_${slot}`;
}

/** Shared authored box layout for the ambient encounter and Book 4 mission cast.
 * The 701 encounter's cast is 2 head boxes plus 4 boxes deliberately laid beyond stretch;
 * only 3 of the 4 loose boxes need to be physically re-coupled for its success outcome.
 */
export function spineBreakContainerLayout(center, index, rng, config = SPINE_BREAK_CONFIG) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const linked = i < SPINE_BREAK_HEAD_LINKED;
  const gap = linked
    ? config.linkGapWu * (i + 1)
    : config.linkGapWu * SPINE_BREAK_HEAD_LINKED
      + config.stretchWu * 1.4 + config.linkGapWu * (i - SPINE_BREAK_HEAD_LINKED);
  const jitter = linked ? 0 : ((rng() - 0.5) * 90);
  const dir = { x: -1, z: 0 };
  return {
    linked,
    pos: { x: center.x + dir.x * gap, z: center.z + dir.z * gap + jitter },
    vel: {
      x: linked ? 0 : (rng() - 0.5) * 8,
      z: linked ? 0 : (rng() - 0.5) * 8,
    },
  };
}

export function ensureSpineBreakWorksite(mission) {
  if (!isSpineBreakOperation(mission)) return null;
  mission.params = mission.params || {};
  mission.objectiveTarget = SPINE_BREAK_CONFIG.recoupleGoal;
  let worksite = mission.params.spineBreakWorksite;
  if (!worksite || worksite.version !== 1) {
    worksite = mission.params.spineBreakWorksite = {
      version: 1,
      attempt: 1,
      retries: 0,
      spineId: spineBreakSpineId(mission, 1),
      tugIdentity: spineBreakTugIdentity(mission, 1),
      status: 'active',
      tugId: null,
      tugGeneration: null,
      containers: [],
      attemptHistory: [],
      lostIndices: [],
      stolenIndices: [],
    };
  }
  worksite.attempt = Math.max(1, Math.floor(Number(worksite.attempt) || 1));
  worksite.retries = Math.max(0, Math.floor(Number(worksite.retries) || 0));
  worksite.spineId = typeof worksite.spineId === 'string' && worksite.spineId
    ? worksite.spineId : spineBreakSpineId(mission, worksite.attempt);
  worksite.tugIdentity = spineBreakTugIdentity(mission, worksite.attempt);
  worksite.status = typeof worksite.status === 'string' ? worksite.status : 'active';
  worksite.tugId = worksite.tugId == null ? null : worksite.tugId;
  worksite.tugGeneration = worksite.tugGeneration == null ? null : worksite.tugGeneration;
  worksite.containers = Array.isArray(worksite.containers)
    ? worksite.containers.filter((row) => row && Number.isInteger(row.index)
      && row.index >= 0 && row.index < SPINE_BREAK_CONTAINER_COUNT
      && row.attempt === worksite.attempt && row.spineId === worksite.spineId
      && row.id != null
      && (row.identity == null || row.identity === spineBreakContainerIdentity(mission, row.index, worksite.attempt))).map((row) => ({
      index: row.index, id: row.id,
      generation: row.generation == null ? null : row.generation,
      identity: spineBreakContainerIdentity(mission, row.index, worksite.attempt),
      attempt: row.attempt, spineId: row.spineId,
    })) : [];
  worksite.attemptHistory = Array.isArray(worksite.attemptHistory)
    ? worksite.attemptHistory.slice(-SPINE_BREAK_MAX_RETRIES - 1) : [];
  worksite.lostIndices = Array.isArray(worksite.lostIndices)
    ? [...new Set(worksite.lostIndices.filter(Number.isInteger).map(Number))] : [];
  worksite.stolenIndices = Array.isArray(worksite.stolenIndices)
    ? [...new Set(worksite.stolenIndices.filter(Number.isInteger).map(Number))] : [];
  return worksite;
}

export function noteSpineBreakDisposition(mission, index, kind) {
  const worksite = ensureSpineBreakWorksite(mission);
  const i = Math.floor(Number(index));
  if (!worksite || i < 0 || i >= SPINE_BREAK_CONTAINER_COUNT) return false;
  const key = kind === 'stolen' ? 'stolenIndices' : kind === 'lost' ? 'lostIndices' : null;
  if (!key) return false;
  const other = key === 'stolenIndices' ? 'lostIndices' : 'stolenIndices';
  worksite[other] = worksite[other].filter((slot) => slot !== i);
  if (!worksite[key].includes(i)) worksite[key].push(i);
  worksite[key].sort((a, b) => a - b);
  return true;
}

export function spineBreakContainers(state, mission) {
  if (!isSpineBreakOperation(mission)) return [];
  const worksite = ensureSpineBreakWorksite(mission);
  const missionId = String(mission.id);
  const rows = Array.isArray(state?.entityList) ? state.entityList : [];
  const known = new Map(worksite.containers.map((row) => [row.index, row]));
  return rows.filter((entity) => {
    if (!entity || entity.alive === false || entity.type !== 'payload') return false;
    const data = entity.data || {};
    if (data.spineBreakContainer !== true
      || String(data.spineBreakMissionId) !== missionId
      || Number(data.spineBreakAttempt) !== worksite.attempt
      || (data.spineId !== worksite.spineId
        && !(data.spineLoose === true && data.lostFromSpineId === worksite.spineId))
      || data.spineBreakIdentity !== spineBreakContainerIdentity(mission, data.spineBreakIndex, worksite.attempt)
      || data.spineBreakTugIdentity !== worksite.tugIdentity
      || data.spineBreakTugId !== worksite.tugId
      || data.spineBreakTugGeneration !== worksite.tugGeneration) return false;
    const row = known.get(Number(data.spineBreakIndex));
    return !row || (row.id === entity.id
      && row.identity === entity.data.spineBreakIdentity
      && (row.generation == null || row.generation === entity.occupantGeneration));
  });
}

export function spineBreakOutcome(state, mission) {
  const worksite = ensureSpineBreakWorksite(mission);
  if (!worksite) return { status: 'unrelated', recoupled: 0, goal: 0, remaining: 0 };
  const live = spineBreakContainers(state, mission);
  const recoupled = live.filter((entity) => entity.data?.authoredLoose === true
    && entity.data?.spineLoose === false
    && entity.data?.spineId === worksite.spineId
    && entity.data?.spineBreakAttempt === worksite.attempt).length;
  const goal = SPINE_BREAK_CONFIG.recoupleGoal;
  const lost = new Set([...worksite.lostIndices, ...worksite.stolenIndices]);
  const available = live.filter((entity) => {
    const data = entity.data || {};
    return data.authoredLoose === true
      && data.spineBreakIndex != null
      && !lost.has(data.spineBreakIndex)
      && (data.spineLoose === true || data.spineLoose == null)
      && data.spineBreakAttempt === worksite.attempt
      && (data.spineId === worksite.spineId
        || (data.spineLoose === true && data.lostFromSpineId === worksite.spineId));
  }).length;
  const possible = recoupled + available;
  return {
    status: recoupled >= goal ? 'spine_recoupled' : possible < goal ? 'unrecoverable' : 'pending',
    recoupled,
    goal,
    remaining: Math.max(0, goal - recoupled),
    liveCount: live.length,
    possible,
  };
}
