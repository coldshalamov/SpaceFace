// F17 — a disabled friendly or a marked derelict heals only while a rope on it is taut.
// The player's line and a live tender's line both count. A slack line, a cut line, an enemy,
// a rock, and the player's own hull do not. A recovery wreck counts only when it is marked
// derelictHelp. Finishing the hull restores the drive the combat runtime already uses as
// "can thrust." No med-beam and no fail timer.

// Same taut test the NPC line-cut uses: a loaded/overload/capture phase, or a span that
// has reached 92% of the rest length. A short slack span does not carry repair.
export const LATCH_REPAIR_TAUT_RATIO = 0.92;
export const LATCH_REPAIR_HULL_PER_SECOND = 12;

const TAUT_PHASES = new Set(['capture', 'loaded', 'overload']);

function entityOf(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

function driveRuntime(state, entity) {
  const book = state && state.combat && state.combat.entities;
  if (!book || entity == null) return null;
  return book[String(entity.id)] || null;
}

function driveDisabled(state, entity) {
  const runtime = driveRuntime(state, entity);
  const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
  if (drive && drive.effectiveDisabled === true) return true;
  return !!(runtime && runtime.capabilities && runtime.capabilities.drive === false);
}

function isEnemy(state, target) {
  if (target.data && target.data.ai && target.data.ai.hostile === true) return true;
  const player = entityOf(state, state.playerId);
  const playerTeam = player && player.team != null ? player.team : 0;
  return target.team != null && target.team !== playerTeam && target.team !== 2;
}

export function latchRepairAllowed(state, target) {
  if (!state || !target || target.alive === false) return false;
  if (target.id === state.playerId) return false;
  if (target.data && target.data.latchRepair === false) return false;
  if (isEnemy(state, target)) return false;
  const marked = !!(target.data && (target.data.latchRepair === true || target.data.derelictHelp === true));
  if (target.type !== 'ship' && !(target.type === 'wreck' && marked)) return false;
  const player = entityOf(state, state.playerId);
  const playerTeam = player && player.team != null ? player.team : 0;
  const sameSide = target.team === playerTeam;
  const civilian = target.team === 2
    && target.data && target.data.ai && target.data.ai.passive === true;
  if (!sameSide && !civilian && !marked) return false;
  const hull = Number(target.hull);
  const hullMax = Number(target.hullMax);
  const hurt = Number.isFinite(hull) && Number.isFinite(hullMax) && hull < hullMax - 0.05;
  return hurt || driveDisabled(state, target);
}

function repairOwner(state, owner) {
  if (!owner || owner.alive === false) return false;
  if (owner.id === state.playerId) return true;
  return !!(owner.data && owner.data.trafficRole === 'tender');
}

function lineTaut(state, attachment, owner, target) {
  if (!attachment || attachment.state !== 'active' || !owner || !target) return false;
  const tether = state.player && state.player.tether;
  const phase = tether && tether.active === true && tether.attachmentId === attachment.id
    ? tether.phase
    : attachment.phase;
  if (TAUT_PHASES.has(String(phase || ''))) return true;
  const rest = Number(attachment.restLength);
  if (!(rest > 0) || !owner.pos || !target.pos) return false;
  const span = Math.hypot(owner.pos.x - target.pos.x, owner.pos.z - target.pos.z);
  return span >= rest * LATCH_REPAIR_TAUT_RATIO;
}

function freeDrive(state, target) {
  const runtime = driveRuntime(state, target);
  if (!runtime) return;
  runtime.capabilities = runtime.capabilities || {};
  runtime.capabilities.drive = true;
  if (runtime.multipliers && runtime.multipliers.movement === 0) runtime.multipliers.movement = 1;
  if (Array.isArray(runtime.blockedActionTags)) {
    runtime.blockedActionTags = runtime.blockedActionTags.filter((tag) => tag !== 'dash' && tag !== 'sling');
  }
  const drive = runtime.subsystems && runtime.subsystems.subsystem_drive;
  if (!drive) return;
  drive.effectiveDisabled = false;
  drive.destroyed = false;
  if (Number.isFinite(drive.maxHealth)) drive.health = drive.maxHealth;
}

function applyRepair(state, target, dt) {
  const hullMax = Number(target.hullMax);
  const hull = Number(target.hull);
  if (!Number.isFinite(hullMax) || hullMax <= 0 || !Number.isFinite(hull)) return 0;
  const next = Math.min(hullMax, hull + LATCH_REPAIR_HULL_PER_SECOND * dt);
  const gained = next - hull;
  target.hull = next;
  if (next >= hullMax - 0.05) freeDrive(state, target);
  return gained;
}

/**
 * One pass over live attachments. A target heals at most once per call.
 * @returns {number} hull points restored this step
 */
export function stepLatchRepair(state, dt) {
  const step = Number(dt);
  if (!(step > 0) || !state) return 0;
  const byId = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId) return 0;
  const healed = new Set();
  let gained = 0;
  for (const attachment of Object.values(byId)) {
    if (!attachment || attachment.state !== 'active') continue;
    const owner = entityOf(state, attachment.ownerId);
    const target = entityOf(state, attachment.targetId);
    if (!repairOwner(state, owner) || !latchRepairAllowed(state, target)) continue;
    if (!lineTaut(state, attachment, owner, target)) continue;
    if (healed.has(target.id)) continue;
    healed.add(target.id);
    gained += applyRepair(state, target, step);
  }
  return gained;
}
