// FB-030 — Pallas Drift's work loop. Four handoffs, in order, inside twenty minutes.
// The cast hulls drift at a working speed. Nothing in the sector is teleported.

export const PALLAS_WORK_SECTOR_ID = 'sector_pallas_drift';
export const PALLAS_HANDOFF_ORDER = Object.freeze([
  'miner_to_hauler',
  'hauler_to_hub',
  'ambush',
  'escort',
]);

const LEGS_WU = Object.freeze([720, 860, 640, 540]);
const SPEED_WU_PER_S = 36;
const SLOT_IDS = Object.freeze([
  'pallas_seam_miner',
  'pallas_seam_surveyor',
  'pallas_hub_hauler',
  'pallas_hub_tender',
  'pallas_ambush_hauler',
  'pallas_ambush_escort',
  'pallas_grave_salvor',
  'pallas_grave_patrol',
]);

function freshLoop(seed) {
  return {
    seed,
    phase: 0,
    progressWU: 0,
    order: [],
    ambushOpen: false,
    escortAnswered: false,
  };
}

function pallasHulls(state) {
  const list = state && state.traffic && state.traffic.freighters;
  if (!Array.isArray(list) || !state.entities || typeof state.entities.get !== 'function') return [];
  const out = [];
  for (const rec of list) {
    const entity = rec && state.entities.get(rec.id);
    if (!entity || entity.alive === false || !entity.data) continue;
    if (!SLOT_IDS.includes(entity.data.activityActorSlotId)) continue;
    out.push(entity);
  }
  return out;
}

function nudge(entity, dt, phase) {
  if (!entity.pos) entity.pos = { x: 0, z: 0 };
  const angle = (phase + 1) * 0.7;
  const step = SPEED_WU_PER_S * dt;
  entity.pos.x += Math.cos(angle) * step;
  entity.pos.z += Math.sin(angle) * step;
  entity.data.pallasWorkStepWU = (Number(entity.data.pallasWorkStepWU) || 0) + step;
}

function markHandoff(state, loop, name) {
  loop.order.push(name);
  const hulls = pallasHulls(state);
  if (name === 'ambush') {
    loop.ambushOpen = true;
    for (const entity of hulls) {
      if (entity.data.activityActorSlotId !== 'pallas_ambush_hauler') continue;
      entity.data.ai = entity.data.ai || {};
      entity.data.ai.passive = false;
      entity.data.pallasAmbushOpen = true;
    }
  }
  if (name === 'escort') {
    loop.escortAnswered = true;
    for (const entity of hulls) {
      if (entity.data.activityActorSlotId !== 'pallas_ambush_escort') continue;
      entity.data.pallasEscortClosing = true;
    }
  }
}

/** Advance the authored Pallas handoffs. Returns the loop, or null off-sector. */
export function stepPallasWorkLoop(state, dt) {
  if (!state || !state.world || state.world.currentSectorId !== PALLAS_WORK_SECTOR_ID) return null;
  if (!state.traffic) state.traffic = { freighters: [] };
  const seed = state.meta && state.meta.seed;
  let loop = state.traffic.pallasWorkLoop;
  if (!loop || loop.seed !== seed) loop = state.traffic.pallasWorkLoop = freshLoop(seed);
  if (loop.order.length >= PALLAS_HANDOFF_ORDER.length) return loop;
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  loop.progressWU += SPEED_WU_PER_S * step;
  for (const entity of pallasHulls(state)) nudge(entity, step, loop.phase);
  const leg = LEGS_WU[loop.phase] || LEGS_WU[LEGS_WU.length - 1];
  if (loop.progressWU + 1e-6 >= leg) {
    markHandoff(state, loop, PALLAS_HANDOFF_ORDER[loop.phase]);
    loop.progressWU = 0;
    loop.phase += 1;
  }
  return loop;
}
