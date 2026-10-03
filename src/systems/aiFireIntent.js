import { ObjectiveKind, ContactKind, clamp, wrapAngle } from '../ai/contracts.js';
import { canFireByDoctrine } from '../ai/doctrine.js';
import { authorizeAIEngagement, isHostileForAI } from '../ai/engagementAuthority.js';
import {
  assessFriendlyFireLane,
  assessOpticSplinterReturn,
  mountFollowsAimAngle,
  opticPrismableMountTracking,
  planOpticBankShot,
} from '../ai/fireDiscipline.js';
import { GIMBAL_ARC_DEFAULT } from './ships.js';
import {
  isPdScreenActor,
  resolvePdCharge,
  selectPdInterceptTarget,
  ensurePdSaturation,
  beginPdIntercept,
  PD_SCREEN_DEFAULT_RADIUS,
} from '../ai/pdScreen.js';
import { isPlayerWanted } from './heat.js';
import { collidesFlipEpoch, indexedShipLikeScan } from '../world/livingWorldViews.js';
import { queryCombatTableRadius } from '../core/combatTable.js';
import { solveLeadAngle } from './weapons.js';
import { combatFlag } from '../data/featureFlags.js';

const RECENT_DEFENSIVE_DAMAGE_TICKS = 180;
const FIRE_WINDOW_ADMISSION = new WeakMap();
const PD_CONTACT_ID_SCRATCH = [];
const PD_TABLE_RADIUS_PAD_WU = 80;
// Perf memo for recentlyDamagedBy: the backward walk over the combat trace costs O(events in the
// 180-tick window) per armed actor per tick, and the window holds thousands of entries during a
// busy swarm wave. The memo is INCREMENTAL: a cached `false` stands while trace.nextSeq is
// unchanged (no append since it was computed — front-splice cannot fake that), and a cached
// `true` stands while its proving event is inside the window and still retained (seq above
// trace.dropped). Otherwise only the appended tail (seq above the answer's watermark) is
// rescanned. Answers are therefore always identical to a full fresh walk.
const RECENT_DAMAGE_MEMOS = new WeakMap();
const RECENT_DAMAGE_MEMO_CAP = 512;

export function applyAIFiringIntent(decision, state) {
  if (!decision || !state || !state.entities || typeof state.entities.get !== 'function') return;
  const entityId = decision.entityId;
  if (entityId == null || entityId === state.playerId) return;
  const e = state.entities.get(entityId);
  if (!e || e.type !== 'ship' || !e.alive) return;

  const data = e.data || (e.data = {});
  const intent = mutableIntent(data);
  const objective = decision.directive && decision.directive.objective;
  const combatDoctrine = decision.combatDoctrine || null;
  const combat = data.combat || (data.combat = {});
  // A doctrine may commit to a firing corridor (ranged disengager cue/window): the corridor's
  // anchor is the true firing lead the first tick the corridor is observed, so a steady target
  // keeps taking honest leads while a dodge can only pull the line ±capRad off it.
  const aimCommit = combatDoctrine && combatDoctrine.aimCommit
    && Number.isFinite(combatDoctrine.aimCommit.bearing) ? combatDoctrine.aimCommit : null;
  const pdActor = isPdScreenActor(e);

  // W04: pd_screen_escort policy owns target selection, but never fire authorization.
  // A null selection is an explicit saturated/unavailable result, not permission to fall back
  // to the squad directive's target.
  let targetId = objective && objective.targetId;
  if (pdActor) {
    targetId = applyPdScreenTargetPolicy(e, state, decision);
    if (targetId == null) {
      clearFire(intent, 'pd_screen_unavailable');
      return;
    }
  }

  const attack = objective && (
    objective.kind === ObjectiveKind.FOCUS
    || objective.kind === ObjectiveKind.ENGAGE
    || objective.kind === ObjectiveKind.SCREEN
  );
  const fireWindowOk = !combatDoctrine || combatDoctrine.fireWindow;
  if (!attack || targetId == null || !fireWindowOk) {
    if (!combatDoctrine || !fireWindowOk) FIRE_WINDOW_ADMISSION.delete(e);
    // The corridor anchors at the telegraph, not the shot: keep the anchor state alive through
    // the cue and pin the aim line on it, so the fire window flies the forecast the pilot saw.
    if (aimCommit && attack && targetId != null) {
      const commitTarget = state.entities.get(targetId);
      if (commitTarget && commitTarget.alive !== false) {
        committedCorridorAim(e, combat, aimCommit, commitTarget, data.weapons);
        intent.aimAngle = aimCommit.bearing;
      } else {
        combat.aimCommit = null;
      }
    } else {
      combat.aimCommit = null;
    }
    clearFire(intent);
    return;
  }
  // SF-057 bounded-search residual: the squad's merged focus can be pure memory — every member's
  // contact stale — yet targetId resolves to the LIVE entity below, so firing would aim at a
  // position nobody currently holds. The member still flies the search leg toward the last fix
  // (the objective survives; the squad vote is advisory); the gun channel alone closes until a
  // fresh sighting. A dispatched mark sustains the maneuver objective but is not a sighting —
  // fire waits for a member to actually see the target. PD screen actors resolve their own
  // track targets and are exempt.
  if (!pdActor && objective.targetObserved === false) {
    combat.aimCommit = null;
    clearFire(intent, 'target_unobserved');
    return;
  }
  // A doctrine fire window authorizes action selection; the SG-03 executor remains the canonical
  // proof that the action was actually accepted. Keep visible weapon intent closed while the
  // predictive gate is blocked so it cannot lead the corresponding action.requested event.
  if (!admittedFireWindow(e, combatDoctrine, decision.action)) {
    clearFire(intent, 'action_request_pending');
    return;
  }

  const target = state.entities.get(targetId);
  if (!target || !target.alive) {
    clearFire(intent);
    return;
  }
  const engagementTarget = pdActor ? pdEngagementTarget(state, target) : target;
  if (!engagementTarget) {
    clearFire(intent, 'pd_target_not_authorized');
    return;
  }
  const ai = data.ai || {};
  const recentlyDamaged = recentlyDamagedBy(state, e.id, engagementTarget.id);
  // Pure read this tick; both doctrine and engagement gates consume the same value.
  const playerWanted = isPlayerWanted(state);
  // SCREEN activity.targetId names the defended charge, so it is not an offensive target lock.
  // Map the selected intercept into the ordinary ENGAGE doctrine gate while preserving SCREEN
  // activity/ROE semantics and the final engagement authority below.
  const objectiveKind = pdActor ? ObjectiveKind.ENGAGE : objective && objective.kind;
  const activity = pdActor && ai.activity
    ? { ...ai.activity, targetId: null }
    : ai.activity;
  const permitted = canFireByDoctrine({
    activity,
    roe: ai.roe,
    objectiveKind,
    target: engagementTarget,
    self: e,
    wanted: playerWanted,
    recentlyDamaged,
  });
  const authorization = permitted ? authorizeAIEngagement({
    state,
    self: e,
    target: engagementTarget,
    tick: state.tick,
    objectiveReason: objective && objective.reason,
    wanted: playerWanted,
    recentlyDamaged,
  }) : null;
  if (!permitted || !authorization || !authorization.ok) {
    clearFire(intent);
    return;
  }

  let aimAngle = leadAngleFor(e, target, data.weapons);
  combat.targetId = targetId;
  combat.pdScreen = pdActor;
  if (aimCommit) {
    aimAngle = committedCorridorAim(e, combat, aimCommit, target, data.weapons);
    // A corridor only counts if a mount that follows the aim can bear it: fixed guns and beams
    // release along `rot + facing ± gimbalArc`, so a bearing outside every cone would fly the
    // clamped edge — a line the commitment never vetted. Hold and keep aiming the corridor; the
    // doctrine's faceAngle is already slewing the hull onto it. Turret/homing-only batteries
    // solve their own direction and cannot fly a corridor, so they fire their own solution.
    const corridorMount = aimConeStatus(e, data.weapons, aimAngle);
    if (corridorMount.status === 'slew') {
      clearFire(intent, 'committed_aim_off_bore');
      // Steer the mount's bore onto the corridor, not the raw bearing — for an off-axis fixed
      // mount (facingAngle ≠ 0) the hull must converge to corridor − facing or the hold never
      // closes. Same rule the optic-bank slew uses.
      intent.aimAngle = wrapAngle(aimAngle - corridorMount.facing);
      combat.opticBankId = null;
      return;
    }
  } else {
    combat.aimCommit = null;
  }
  const lane = assessFriendlyFireLane({
    shooter: e,
    target,
    aimAngle,
    entities: friendlyFireLaneEntities(state),
  });
  if (!lane.clear && target.type !== 'projectile') {
    clearFire(intent, lane.reason, lane.blockerId);
    intent.aimAngle = aimAngle;
    combat.opticBankId = null;
    return;
  }

  // Optic fire discipline: an energy volley that would prism a diamond and throw the splinter
  // ring back through the shooter or a same-team hull is refused — the lattice is terrain, not
  // scenery. Kinetic-only hulls skip the scan entirely; an empty collidable bucket keeps CLEAR.
  const splinterLane = assessOpticSplinterReturn({
    shooter: e,
    target,
    aimAngle,
    entities: opticLaneBodiesWithShelved(state),
    weapons: data.weapons,
  });
  if (!splinterLane.clear && target.type !== 'projectile') {
    clearFire(intent, splinterLane.reason, splinterLane.blockerId);
    intent.aimAngle = aimAngle;
    combat.opticBankId = null;
    return;
  }

  // Offensive half of the optic grammar: when the aimed lane dies on a body that is not the
  // target and not a prism, a reachable diamond whose replayed ring lands on the target turns
  // the wasted bolt into a fuse shot. The planner rejects any cascade that lands on the shooter
  // or a same-team hull, so a bank can never route around the refusal above — it only replaces
  // a geometrically dead lane.
  const bank = planOpticBankShot({
    shooter: e,
    target,
    aimAngle,
    entities: opticLaneBodiesWithShelved(state),
    weapons: data.weapons,
  });
  let bankAim = null;
  if (bank) {
    // A bank bearing only counts if a mount that follows the aim can actually bear it: fixed
    // guns and continuous beams release along `rot + facing ± gimbalArc`, so a bearing outside
    // the cone would fly the clamped edge — a corridor the cascade replay never vetted. Turrets
    // and homing mounts lead the target themselves and cannot fly a bank at all. While the nose
    // is still slewing onto the corridor the trigger holds; intent.aimAngle keeps turning the
    // ship so the mount's bore lands on the corridor (bank bearing minus the mount's facing —
    // for front mounts that is the bearing itself).
    const mount = opticBankMountStatus(e, data.weapons, bank.aimAngle);
    if (mount.status === 'slew') {
      combat.opticBankId = bank.opticId;
      clearFire(intent, 'optic_bank_slew', bank.opticId);
      intent.aimAngle = wrapAngle(bank.aimAngle - mount.facing);
      return;
    }
    if (mount.status === 'ready') {
      combat.opticBankId = bank.opticId;
      bankAim = bank.aimAngle;
    } else {
      combat.opticBankId = null;
    }
  } else {
    combat.opticBankId = null;
  }

  intent.fire = true;
  intent.fireBlockReason = null;
  intent.fireBlockerId = null;
  intent.aimAngle = bankAim != null ? bankAim : aimAngle;
  ai.lastAggressionTrace = aggressionTrace(decision, state, targetId, ai);
}

/**
 * The lane gate only considers ships and drones. The live entity index is refreshed before
 * tactical AI, so use its exact ship-like view instead of rescanning asteroids, stations, FX, and
 * payloads for every armed actor. Headless/minimal states retain the complete fallback.
 */
export function friendlyFireLaneEntities(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready && Array.isArray(index.shipLike)) {
    return index.shipLike;
  }
  return state?.entityList || state?.entities;
}

const EMPTY_OPTIC_LANE_BODIES = Object.freeze([]);

/**
 * Every body a bolt or splinter could meet: the live collidable index when it is ready, else the
 * entity list in minimal states. Splinters die in any solid hull — ships included — so this is
 * deliberately broader than the ship-like friendly-lane view. A ready index without a
 * `collidables` bucket reports empty rather than touching the dense list (the firing-authority
 * tests proxy it to prove the scan stays off it).
 */
export function opticLaneBodies(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    return index.ready === true && Array.isArray(index.collidables)
      ? index.collidables
      : EMPTY_OPTIC_LANE_BODIES;
  }
  return (state && state.entityList) || (state && state.entities) || EMPTY_OPTIC_LANE_BODIES;
}

/**
 * Optic lattice cells still shelved in the compact field — a lattice prisms a real bolt whether
 * or not the player's decode disc promoted it, so the splinter refusal and the bank planner
 * must reason over field-resident cells too. Cached against `asteroidField.version` (every
 * membership mutation bumps it) so the filter is O(field rocks) once per mutation, not once
 * per armed actor per tick. Record order is insertion order — deterministic for a fixed
 * spawn/promote sequence.
 */
function shelvedOpticLaneRecords(state) {
  const field = state && state.world && state.world.asteroidField;
  if (!field || !Array.isArray(field.rocks)) return EMPTY_OPTIC_LANE_BODIES;
  const cache = field._opticLaneCache;
  if (cache && cache.version === field.version) return cache.records;
  const records = field.rocks.filter((rec) => !!rec
    && rec.alive !== false
    && rec.data
    && typeof rec.data.opticMaterial === 'string');
  field._opticLaneCache = { version: field.version, records };
  return records;
}

/**
 * The optic callsites' lane view: promoted collidables (index order) followed by shelved optic
 * records (record order), replayable and allocation-free — shelved records already carry the
 * {id, pos, radius, collides, data} shape the lane scans consume. The wrapper is pooled per
 * state: fireDiscipline's flat-corpus scratch is WeakMap-keyed on the iterable's identity and
 * two identical callsites fire per armed shooter per tick — a fresh wrapper would defeat that
 * scratch and double the per-tick allocs the lane cache exists to kill.
 */
const OPTIC_SHELVED_WRAPPER = new WeakMap();

export function opticLaneBodiesWithShelved(state) {
  const live = opticLaneBodies(state);
  const shelved = shelvedOpticLaneRecords(state);
  const keyable = state && typeof state === 'object';
  if (!shelved.length && !keyable) return live;
  let cached = keyable ? OPTIC_SHELVED_WRAPPER.get(state) : null;
  if (!cached || cached.live !== live || cached.shelved !== shelved) {
    cached = {
      live,
      shelved,
      // Corpus-validity signature consumed by fireDiscipline's per-tick flat-corpus memo:
      // identical while the tick and both membership versions hold — i.e., across the whole
      // tactical pass. Reads the live handles rather than captured ones so a swapped index
      // object still reports its own version.
      sig: () => {
        const index = state && state.entityIndex;
        const field = state && state.world && state.world.asteroidField;
        // collidesFlipEpoch folds in post-spawn collides flips — the corpus member predicate
        // reads e.collides, and a flip bumps only the epoch, not index/field versions.
        return `${(state && state.tick) | 0}:${(index && Number(index.version)) || 0}:${(field && Number(field.version)) || 0}:${collidesFlipEpoch()}`;
      },
      values() {
        return (function* () {
          if (Array.isArray(live)) yield* live;
          else if (live && typeof live.values === 'function') yield* live.values();
          yield* shelved;
        })();
      },
    };
    if (keyable) OPTIC_SHELVED_WRAPPER.set(state, cached);
  }
  return cached;
}

/**
 * Can a planned bank bearing be realized by a mount that follows the ship's aim angle?
 * Fixed guns and beams release along `rot + facing ± gimbalArc` (weapons.js `_hardpointDir`),
 * so 'ready' requires the bearing inside some optic-capable mount's cone. Turret and homing
 * mounts resolve their own direction from the locked target — they cannot fly a corridor at
 * all — so a ship without an aim-following energy mount answers 'none'. When an aim-following
 * mount exists but the nose has not slewed onto the bearing, the answer is 'slew' and the
 * caller holds fire: flightV3 turns the ship toward intent.aimAngle whether or not it fires.
 */
function opticBankMountStatus(shooter, weapons, aimAngle) {
  return mountConeStatus(shooter, weapons, aimAngle, (w) => {
    const tracking = opticPrismableMountTracking(w);
    return tracking != null && w.facing !== 'turret'
      && tracking !== 'auto_turret' && tracking !== 'homing';
  });
}

/**
 * Can any aim-following mount (fixed gun or beam — see mountFollowsAimAngle) bear this angle?
 * 'ready' means a cone covers it, 'slew' means the nose has not come around yet, 'none' means the
 * battery solves its own directions and aimAngle never reaches a barrel.
 */
function aimConeStatus(shooter, weapons, aimAngle) {
  return mountConeStatus(shooter, weapons, aimAngle, mountFollowsAimAngle);
}

/**
 * The corridor anchor is the true firing lead the first tick the corridor is observed — a steady
 * target keeps taking real leads inside ±capRad, while a dodge reads as a divergent fresh
 * solution and the aim stays pinned on the stale corridor instead of re-tracking.
 */
function committedCorridorAim(e, combat, commit, target, weapons) {
  const fresh = leadAngleFor(e, target, weapons);
  const prior = combat.aimCommit;
  const anchor = prior && prior.bearing === commit.bearing && Number.isFinite(prior.anchor)
    ? prior.anchor
    : fresh;
  combat.aimCommit = { bearing: commit.bearing, anchor };
  const cap = Number.isFinite(commit.capRad) ? Math.abs(commit.capRad) : 0;
  return wrapAngle(anchor + clamp(wrapAngle(fresh - anchor), -cap, cap));
}

function mountConeStatus(shooter, weapons, aimAngle, canFollow) {
  const rot = Number(shooter.rot) || 0;
  let followable = false;
  let bestFacing = 0;
  let bestErr = Infinity;
  for (const w of weapons || []) {
    if (!canFollow(w)) continue;
    followable = true;
    const facing = Number(w.facingAngle) || 0;
    const arc = Number.isFinite(w.gimbalArc) ? w.gimbalArc : GIMBAL_ARC_DEFAULT;
    const err = Math.abs(wrapAngle(aimAngle - (rot + facing)));
    if (err <= arc) return { status: 'ready', facing };
    if (err < bestErr) { bestErr = err; bestFacing = facing; }
  }
  // On 'slew' the caller steers `aim − facing` so the mount's bore — not the raw bearing —
  // ends up on the corridor; front mounts keep facing 0, so that is the bearing itself.
  return { status: followable ? 'slew' : 'none', facing: bestFacing };
}

/**
 * Apply PD screen target policy. Returns targetId or null.
 * Records selection on entity.data.pdScreenRuntime for inspection / saturation.
 */
export function applyPdScreenTargetPolicy(entity, state, decision = null) {
  if (!entity || !isPdScreenActor(entity)) return null;
  const tick = Number.isInteger(state && state.tick) ? state.tick : 0;
  const sat = ensurePdSaturation(entity);
  const charge = resolvePdCharge(entity, state, decision && decision.perception);
  const contacts = collectPdContacts(entity, state, charge);
  const selected = selectPdInterceptTarget({
    self: entity,
    charge,
    contacts,
    screenRadius: (entity.data && entity.data.pdScreenRadius) || PD_SCREEN_DEFAULT_RADIUS,
    saturation: sat,
    tick,
  });
  const runtime = entity.data.pdScreenRuntime;
  if (!selected) {
    runtime.lastTargetId = null;
    runtime.lastScore = null;
    return null;
  }
  if (runtime.lastTargetId !== selected.targetId) {
    beginPdIntercept(sat, tick);
  }
  runtime.lastTargetId = selected.targetId;
  runtime.lastScore = selected.score;
  runtime.lastKind = selected.kind;
  runtime.inside = selected.inside;
  runtime.chargeId = charge && charge.id;
  return selected.targetId;
}

function collectPdContacts(self, state, charge) {
  const out = [];
  const table = state && state.combatTable;
  const useTable = !!(table && table.tick === (state.tick | 0) && table.count > 0 && self && self.pos
    && state.entities && typeof state.entities.get === 'function');
  if (useTable) {
    const origin = (charge && charge.pos) || self.pos;
    const radius = ((self.data && self.data.pdScreenRadius) || PD_SCREEN_DEFAULT_RADIUS)
      + PD_TABLE_RADIUS_PAD_WU;
    queryCombatTableRadius(table, origin.x, origin.z, radius, PD_CONTACT_ID_SCRATCH);
    for (let i = 0; i < PD_CONTACT_ID_SCRATCH.length; i++) {
      considerPdContact(self, state, charge, state.entities.get(PD_CONTACT_ID_SCRATCH[i]), out);
    }
    return out;
  }
  const index = state.entityIndex;
  const ships = indexedShipLikeScan(state);
  const projectiles = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.projectiles)
    ? index.projectiles
    : (state.entityList || []);
  const lists = [projectiles, ships];
  for (let b = 0; b < lists.length; b++) {
    const list = lists[b];
    if (!list) continue;
    for (let i = 0; i < list.length; i++) considerPdContact(self, state, charge, list[i], out);
  }
  return out;
}

function considerPdContact(self, state, charge, e, out) {
  if (!e || !e.alive || e.id === self.id) return;
  if (charge && e.id === charge.id) return;
  if (e.type === 'projectile') {
    // A projectile is hostile only through its live owner's authored hostility. Team mismatch
    // and ownerless ordnance cannot broaden the final engagement authority.
    const owner = e.ownerId != null && state.entities ? state.entities.get(e.ownerId) : null;
    if (!owner || !owner.alive || !isHostileForAI(state, self, owner)) return;
    out.push({
      id: e.id,
      kind: ContactKind.PROJECTILE,
      pos: e.pos,
      vel: e.vel,
      alive: true,
      valid: true,
      visible: true,
      hostile: true,
      threat: 0.9,
    });
    return;
  }
  if (e.type !== 'ship' && e.type !== 'drone') return;
  if (e.team != null && self.team != null && e.team === self.team) return;
  if (!isHostileForAI(state, self, e)) return;
  out.push({
    id: e.id,
    kind: ContactKind.SHIP,
    pos: e.pos,
    vel: e.vel,
    alive: true,
    valid: true,
    visible: true,
    hostile: true,
    threat: 0.6,
  });
}

function pdEngagementTarget(state, fireTarget) {
  if (!fireTarget || fireTarget.alive === false) return null;
  if (fireTarget.type !== 'projectile') return fireTarget;
  if (fireTarget.ownerId == null || !state || !state.entities) return null;
  const owner = state.entities.get(fireTarget.ownerId);
  return owner && owner.alive ? owner : null;
}

function aggressionTrace(decision, state, targetId, ai) {
  const objective = decision && decision.directive && decision.directive.objective || {};
  const combatDoctrine = decision && decision.combatDoctrine || {};
  const doctrineId = String(combatDoctrine.doctrineId || ai.combatDoctrineId || '');
  const reason = String(objective.reason || '');
  const prefix = doctrineId ? `combat_doctrine:${doctrineId}:` : '';
  const doctrinePhase = String(combatDoctrine.phase || (prefix && reason.startsWith(prefix) ? reason.slice(prefix.length) : ''));
  return Object.freeze({
    tick: Number.isInteger(state && state.tick) ? state.tick : 0,
    targetId,
    motive: String(ai.motive),
    engagementTrigger: String(ai.engagementTrigger),
    zoneId: String(ai.zoneId),
    approachTelegraph: String(ai.approachTelegraph),
    noFireResponseWindowS: Number(ai.noFireResponseWindowS),
    tactic: String(decision && decision.directive && decision.directive.tactic || ''),
    doctrineId,
    doctrinePhase,
  });
}

export function clearAIFiringIntent(intent, reason = null, blockerId = null) {
  clearFire(intent, reason, blockerId);
}

function clearFire(intent, reason = null, blockerId = null) {
  intent.fire = false;
  intent.fireBlockReason = reason;
  intent.fireBlockerId = blockerId;
}

function admittedFireWindow(entity, doctrine, action) {
  if (!doctrine) return true;
  let runtime = FIRE_WINDOW_ADMISSION.get(entity);
  // The identity key is compared field-by-field instead of being rebuilt as a template string
  // every call; the four stringified fields are exactly the segments the old key joined.
  const doctrineId = String(doctrine.doctrineId || '');
  const cycle = String(doctrine.cycle || 0);
  const phase = String(doctrine.phase || '');
  const phaseStartedTick = String(doctrine.phaseStartedTick ?? '');
  if (!runtime
    || runtime.doctrineId !== doctrineId
    || runtime.cycle !== cycle
    || runtime.phase !== phase
    || runtime.phaseStartedTick !== phaseStartedTick) {
    runtime = { doctrineId, cycle, phase, phaseStartedTick, admitted: false };
    FIRE_WINDOW_ADMISSION.set(entity, runtime);
  }
  if (action && action.actionId) runtime.admitted = true;
  return runtime.admitted;
}

function mutableIntent(data) {
  const current = data.intent;
  if (!current || Object.isFrozen(current)) {
    data.intent = current && typeof current === 'object' ? { ...current } : {};
  }
  return data.intent;
}

function recentlyDamagedBy(state, entityId, targetId) {
  const tick = Number.isInteger(state && state.tick) ? state.tick : 0;
  const trace = state.combat && state.combat.trace;
  const events = trace && Array.isArray(trace.events) ? trace.events : [];
  // nextSeq only moves on appendCombatTrace, so it is an exact "any append since" watermark even
  // when capacity splice keeps events.length pinned; dropped counts front-evicted events, so a
  // retained proof is exactly `proofSeq > dropped`. An events.length sentinel can do neither —
  // at capacity it stays constant while content shifts and cannot see eviction at all.
  const nextSeq = trace && Number.isInteger(trace.nextSeq) ? trace.nextSeq : null;
  const dropped = trace && Number.isInteger(trace.dropped) ? trace.dropped : 0;
  let memo = RECENT_DAMAGE_MEMOS.get(state);
  if (!memo || memo.events !== events) {
    memo = { events, byPair: new Map() };
    RECENT_DAMAGE_MEMOS.set(state, memo);
  }
  let perTarget = memo.byPair.get(entityId);
  if (!perTarget) {
    perTarget = new Map();
    if (memo.byPair.size < RECENT_DAMAGE_MEMO_CAP) memo.byPair.set(entityId, perTarget);
  }
  const entry = perTarget.get(targetId);
  if (entry) {
    if (entry.answer) {
      // A `true` holds until the proving event ages out of the window — and only while the
      // proof is still retained; a fresh walk cannot find an evicted event.
      if (tick <= entry.untilTick && entry.proofSeq > dropped) return true;
    } else if (entry.seq === nextSeq) {
      return false;
    }
  }
  // Scan the appended delta: events with seq >= entry.seq are exactly the post-answer tail.
  // Everything below is covered by the stored answer — a `false` found no in-window proof there
  // (events only age further out), and the newest in-window match is always the recorded proof,
  // so no older match below can outlive it.
  const coveredSeq = entry && Number.isInteger(entry.seq) ? entry.seq : -Infinity;
  let result = false;
  let resultUntilTick = -1;
  let resultProofSeq = -1;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (!event) continue;
    if (Number.isInteger(event.seq) && event.seq < coveredSeq) break;
    const eventTick = Number.isInteger(event.tick) ? event.tick : tick;
    if (tick - eventTick > RECENT_DEFENSIVE_DAMAGE_TICKS) break;
    if (event.kind !== 'damage.routed') continue;
    if (event.targetId === entityId && (targetId == null || event.attackerId === targetId)) {
      result = true;
      resultUntilTick = eventTick + RECENT_DEFENSIVE_DAMAGE_TICKS;
      resultProofSeq = Number.isInteger(event.seq) ? event.seq : -1;
      break;
    }
  }
  if (!result && entry && entry.answer && tick <= entry.untilTick && entry.proofSeq > dropped) {
    // The stored proof is still retained and inside the window and the tail held no newer
    // proof — the old `true` stands.
    result = true;
    resultUntilTick = entry.untilTick;
    resultProofSeq = entry.proofSeq;
  }
  perTarget.set(targetId, result
    ? { answer: true, seq: nextSeq, untilTick: resultUntilTick, proofSeq: resultProofSeq }
    : { answer: false, seq: nextSeq, untilTick: -1, proofSeq: -1 });
  return result;
}

function leadAngleFor(shooter, tgt, weapons) {
  // Mounted NPC guns launch the same aim-true projectiles as the player's guns. The old
  // relative-velocity direction compensated shooter motion twice and missed by whole hulls.
  if (!combatFlag('momentumInherit')) return solveLeadAngle(shooter, tgt, bestProjSpeed(weapons));
  const px = tgt.pos.x - shooter.pos.x;
  const pz = tgt.pos.z - shooter.pos.z;
  const rvx = (tgt.vel.x || 0) - (shooter.vel.x || 0);
  const rvz = (tgt.vel.z || 0) - (shooter.vel.z || 0);
  const projSpeed = bestProjSpeed(weapons);
  let t = 0;
  for (let i = 0; i < 2; i++) {
    const aimx = px + rvx * t;
    const aimz = pz + rvz * t;
    const dist = Math.hypot(aimx, aimz);
    t = dist / Math.max(1, projSpeed);
  }
  const aimx = px + rvx * t;
  const aimz = pz + rvz * t;
  return Math.atan2(aimz, aimx);
}

function bestProjSpeed(weapons) {
  if (!weapons || !weapons.length) return 300;
  let best = 0;
  for (const w of weapons) {
    const s = w && w.projSpeed;
    if (Number.isFinite(s) && s > best) best = s;
  }
  return best > 0 ? best : 300;
}
