// PQ-140.02 — four specialists, each breaking one player plan.
// Specialist catalog and pure body-launch decisions; behaviour runs through the tactical owner.
// No new hulls (PQ-050 owns form). Two plans share bruiser_armor; mass and speed separate them.
import { SCISSORWAKE } from '../data/scissorwake.js';
import { isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';

export const BODY_LAUNCH = Object.freeze({
  WINDUP_TICKS: 54,
  COOLDOWN_TICKS: 660,
  REACH_WU: 160,
  TARGET_MAX_WU: 1100,
  LAUNCH_SPEED_WU: 170,
  MAX_BODY_MASS: 400,
});

export function bodyLauncherWeaponId(entity) {
  const mounts = entity?.data?.weapons || entity?.weapons || [];
  for (const mount of mounts) {
    const id = typeof mount === 'string' ? mount : mount?.id || mount?.defId;
    if (typeof id === 'string' && id.includes('concussion')) return id;
  }
  return null;
}

// Hostility is observer-relative and is rechecked by the live owner, never guessed from team.
export function isBodyLauncherEnemy(entity) {
  return entity?.type === 'ship' && entity.alive !== false && !!entity.data?.ai
    && entity.data.ai.passive !== true && !!bodyLauncherWeaponId(entity);
}

function launchMass(body) {
  return body?.physicsBody?.mass ?? body?.mass;
}

function launchIntercept(body, player) {
  const x = player.pos.x - body.pos.x, z = player.pos.z - body.pos.z;
  const vx = player.vel?.x || 0, vz = player.vel?.z || 0;
  const speed = BODY_LAUNCH.LAUNCH_SPEED_WU;
  const a = vx * vx + vz * vz - speed * speed;
  const b = 2 * (x * vx + z * vz), c = x * x + z * z;
  let eta = Infinity;
  if (Math.abs(a) < 1e-8) {
    if (Math.abs(b) > 1e-8) eta = -c / b;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
      if (t > 0 && t < eta) eta = t;
    }
  }
  if (!(eta > 0 && eta <= 2.5)) return null;
  return { eta, x: player.pos.x + vx * eta, z: player.pos.z + vz * eta };
}

function launchCandidate(body, enemy, player) {
  if (!body || body === enemy || body.id === player.id || !body.alive || !body.pos
    || !body.vel || body.collides === false
    || !['asteroid', 'wreck', 'pod'].includes(body.type)) return null;
  const mass = launchMass(body);
  if (!(mass > 0 && mass <= BODY_LAUNCH.MAX_BODY_MASS)
    || !(Math.hypot(body.vel.x, body.vel.z) <= 60)
    || Math.hypot(body.pos.x - enemy.pos.x, body.pos.z - enemy.pos.z) > BODY_LAUNCH.REACH_WU
    || Math.hypot(body.pos.x - player.pos.x, body.pos.z - player.pos.z) > BODY_LAUNCH.TARGET_MAX_WU
    || !isDynamicPhysicsBodyEntity(body)) return null;
  return launchIntercept(body, player);
}

export function selectBodyLaunchCandidate(state, enemy, player) {
  if (!enemy?.pos || !player?.pos || enemy.alive === false || player.alive === false) return null;
  let best = null, bestEta = Infinity;
  for (const body of state.entities.values()) {
    const intercept = launchCandidate(body, enemy, player);
    if (intercept && (intercept.eta < bestEta
      || (intercept.eta === bestEta && String(body.id) < String(best.id)))) {
      best = body;
      bestEta = intercept.eta;
    }
  }
  return best;
}

/** Transient per-enemy windup. The owner authorizes the returned launch at execution time. */
export function bodyLaunchStep(rt, { state, enemy, player, tick }) {
  if (rt.phase !== 'windup') {
    if (tick < (rt.nextEligibleTick || 0)) return null;
    const body = selectBodyLaunchCandidate(state, enemy, player);
    if (!body) return null;
    Object.assign(rt, { phase: 'windup', bodyId: body.id, body, enemy, target: player,
      fireTick: tick + BODY_LAUNCH.WINDUP_TICKS });
    return { telegraph: { bodyId: body.id, fireTick: rt.fireTick } };
  }
  const body = state.entities.get(rt.bodyId);
  const intercept = enemy?.alive !== false && player?.alive !== false
    && enemy === rt.enemy && player === rt.target && body === rt.body
    && launchCandidate(body, enemy, player);
  if (!intercept) {
    Object.assign(rt, { phase: 'idle', bodyId: null, body: null, nextEligibleTick: tick + 180 });
    return { cancel: true };
  }
  if (tick < rt.fireTick) return null;
  const dx = intercept.x - body.pos.x, dz = intercept.z - body.pos.z;
  const scale = BODY_LAUNCH.LAUNCH_SPEED_WU / Math.hypot(dx, dz);
  const mass = launchMass(body);
  Object.assign(rt, { phase: 'idle', bodyId: null, body: null,
    nextEligibleTick: tick + BODY_LAUNCH.COOLDOWN_TICKS });
  return { launch: { bodyId: body.id, impulse: {
    x: mass * (dx * scale - body.vel.x), z: mass * (dz * scale - body.vel.z),
  } } };
}

export const SPECIALIST_PLANS = Object.freeze([
  Object.freeze({
    id: 'tether_cutter',
    enemyId: 'tether_control_raider',
    doctrineId: 'tether_control_raider',
    silhouette: 'corsair_blade',
    playerPlan: 'keep a loaded Massline on a rock',
    verb: 'cut_line',
    telegraphKind: 'attach_spool',
    cutRangeWu: 180,
    // SF-046 committed pass (PB-TAC-A): the blade commits once at the spool telegraph — a
    // snapshot of the rope's anchor and bearing — and may only cut that committed geometry.
    // Swinging the line's angle past sweepToleranceRad (or re-anchoring) turns the pass into
    // a miss and the blade into a vulnerable recovery. 45t spans the doctrine's own clock
    // (spool 30t + attach window 15t).
    commitTicks: 45,
    sweepToleranceRad: 0.6,
    missRecoveryTicks: 120,
  }),
  Object.freeze({
    id: 'field_disruptor',
    enemyId: 'quiet_ghost',
    doctrineId: 'ranged_disengager',
    silhouette: 'sniper_lance',
    playerPlan: 'park a well or cone and fight inside it',
    verb: 'disrupt_field',
    telegraphKind: 'weapon_charge',
    disruptRangeWu: 780,
    // SF-047 committed working interval (PB-TAC-B): the ghost acquires at the weapon_charge
    // telegraph and must hold that spot, unhit, for the whole wind-up before the collapse may
    // land in the fire window. 36t spans the doctrine's own clock (charge_cue 30t + the first
    // beats of the 18t fire window).
    disruptWorkTicks: 36,
    disruptHoldRadiusWu: 120,
  }),
  Object.freeze({
    id: 'anchor',
    enemyId: 'field_anchor_controller',
    doctrineId: 'field_anchor_controller',
    silhouette: 'bruiser_armor',
    playerPlan: 'kite freely around the room',
    verb: 'snare_field',
    telegraphKind: 'field_spool',
  }),
  Object.freeze({
    id: 'cargo_protector',
    enemyId: 'warden_escort',
    doctrineId: 'escort_screen',
    silhouette: 'bruiser_armor',
    playerPlan: 'snipe the mule / pack without fighting the screen',
    verb: 'ward_screen',
    telegraphKind: 'engine_flare',
  }),
  // The kamikaze dart is deliberately NOT a row here. These plans are counterplay VERBS the
  // applySpecialistCounterplay dispatcher owns (cut_line / disrupt_field / snare_field /
  // ward_screen) — the dart has no verb to dispatch: its counterplay is physical (shove it,
  // sling it, kill it before it arrives) and its blast is owned by impulseCharges. Its
  // plan-level integration is the combat doctrine, detonator_run, resolved like any other
  // doctrine by the tactical stack.
]);

// A named realization of the cutter verb, rather than a fifth detach authority.
const SCISSORWAKE_PLAN = Object.freeze({ ...SPECIALIST_PLANS[0],
  id: 'scissorwake', enemyId: SCISSORWAKE.enemyId, doctrineId: SCISSORWAKE.doctrineId,
  engineeredPass: true, cutRangeWu: SCISSORWAKE.acquireRangeWu,
  commitTicks: SCISSORWAKE.windupTicks + SCISSORWAKE.passTicks,
  missRecoveryTicks: SCISSORWAKE.recoveryTicks,
});

export function specialistPlanById(id) {
  if (id === SCISSORWAKE_PLAN.id) return SCISSORWAKE_PLAN;
  return SPECIALIST_PLANS.find((row) => row.id === id) || null;
}

export function specialistPlanByEnemyId(enemyId) {
  if (enemyId === SCISSORWAKE.enemyId) return SCISSORWAKE_PLAN;
  return SPECIALIST_PLANS.find((row) => row.enemyId === enemyId) || null;
}

export function specialistPlanByDoctrine(doctrineId) {
  if (doctrineId === SCISSORWAKE.doctrineId) return SCISSORWAKE_PLAN;
  return SPECIALIST_PLANS.find((row) => row.doctrineId === doctrineId) || null;
}

/**
 * PQ-030.02 blind-reviewer path: name the threat from silhouette + telegraph + verb
 * only — never from the plan id. The corsair-blade / attach-spool / cut-line read
 * uniquely names the tether-cutter.
 */
export function nameThreatFromVisibleRead(visible = {}) {
  const silhouette = visible.silhouette;
  const telegraphKind = visible.telegraphKind;
  const verb = visible.verb;
  const hits = SPECIALIST_PLANS.filter((row) => (
    row.silhouette === silhouette
    && row.telegraphKind === telegraphKind
    && row.verb === verb
  ));
  if (hits.length !== 1) return null;
  if (hits[0].id !== 'tether_cutter') return null;
  return 'corsair blade spools a Massline and cuts your taut line';
}

/** Silhouette-only read. corsair_blade is unique among specialist plans. */
export function nameThreatFromSilhouetteAlone(silhouette) {
  const hits = SPECIALIST_PLANS.filter((row) => row.silhouette === silhouette);
  if (hits.length !== 1 || hits[0].id !== 'tether_cutter') return null;
  return nameThreatFromVisibleRead({
    silhouette: hits[0].silhouette,
    telegraphKind: hits[0].telegraphKind,
    verb: hits[0].verb,
  });
}
