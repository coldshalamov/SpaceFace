// Living-contact classification (packet 02, design/combat-convergence/02_COMBAT_READABILITY_AND_TARGETING.md).
//
// A contact has INDEPENDENT dimensions — compressing them into one red outline is the defect this
// module exists to prevent:
//   physical   what the body is (ship / drone / fauna / structure / rock / wreck / cargo / ...)
//   relation   self | hostile | friendly | neutral          (the scanner's verdict, never team math)
//   lifecycle  alive | concussed | disabled | dying | wreck | inert     (combat/lifecycle.js owns it)
//   awareness  engaged | alerted | unaware | unknown        (from existing AI facts only; packet 04's
//                                                            per-observer states plug in via opts)
//   attack     firing | targeting | posture | none          (what it is doing about the PLAYER)
//   selected / observed / living                            (player selection; sensor truth; derived)
// A neutral worker can be alive and alert without being hostile. A wreck can be useful without being
// alive. A cloaked enemy exists in the simulation but is not on the player's sensors (observed=false
// — cloak.js's single gate), and gets no mark.
//
// PURE and TOTAL: reads state, writes nothing, draws no rng, never throws. Presentation lives in
// ui/hud.js (the contact marks) and ui/targetPanel.js (the selected-hostile readout); this file only
// answers the questions they ask.
import { isHostileToPlayer, isWreckLike } from '../systems/scanner.js';
import { LIFECYCLE, lifecycleOf } from './lifecycle.js';
import { concealedFromPlayer } from './targetIdentity.js';
import { compileAttackSpec, mergeWeaponView } from './attackSpec.js';
import { collectAttackModifiers } from '../systems/adventureMigration.js';
import { WEAPONS } from '../data/weapons.js';
import { witnessLineOfSight } from './lineOfSight.js';
import { hasBlockingPanels, interceptSegment } from './pylonShieldQuery.js';
import { PYLON_CONTACT } from './pylonShieldPolicy.js';

const WPN = new Map(WEAPONS.map((w) => [w.id, w]));

export const PHYSICAL = Object.freeze({
  SHIP: 'ship', DRONE: 'drone', FAUNA: 'fauna', STRUCTURE: 'structure', ROCK: 'rock',
  WRECK: 'wreck', CARGO: 'cargo', PROJECTILE: 'projectile', OTHER: 'other',
});
export const RELATION = Object.freeze({ SELF: 'self', HOSTILE: 'hostile', FRIENDLY: 'friendly', NEUTRAL: 'neutral' });
export const INERT = 'inert';
export const AWARENESS = Object.freeze({ ENGAGED: 'engaged', ALERTED: 'alerted', UNAWARE: 'unaware', UNKNOWN: 'unknown' });
export const ATTACK = Object.freeze({ FIRING: 'firing', TARGETING: 'targeting', POSTURE: 'posture', NONE: 'none' });

/** An on-screen hull smaller than this (px radius) is too small to read as a ship by silhouette. */
export const MARK_BELOW_PX = 18;

function physicalOf(entity) {
  if (!entity) return PHYSICAL.OTHER;
  if (isWreckLike(entity)) return PHYSICAL.WRECK;
  switch (entity.type) {
    case 'ship': return PHYSICAL.SHIP;
    case 'drone': return PHYSICAL.DRONE;
    case 'fauna': return PHYSICAL.FAUNA;
    case 'station': return PHYSICAL.STRUCTURE;
    case 'asteroid': return PHYSICAL.ROCK;
    case 'pickup': case 'payload': return PHYSICAL.CARGO;
    case 'projectile': return PHYSICAL.PROJECTILE;
    default: return PHYSICAL.OTHER;
  }
}

function relationOf(state, entity, player) {
  if (!entity || !player) return RELATION.NEUTRAL;
  if (entity.id === player.id) return RELATION.SELF;
  if (isHostileToPlayer(entity, player.team, state)) return RELATION.HOSTILE;
  if ((player.team !== 0 && entity.team === player.team) || (entity.data && entity.data.ownerId === player.id)) {
    return RELATION.FRIENDLY;
  }
  return RELATION.NEUTRAL;
}

function attackOf(entity, relation, playerId) {
  if (relation !== RELATION.HOSTILE) return ATTACK.NONE;
  const data = entity.data || {};
  const combat = data.combat || null;
  const intent = data.intent || null;
  const onPlayer = !!(combat && playerId != null && (combat.targetId === playerId || combat.lockTarget === playerId));
  if (onPlayer && intent && intent.fire) return ATTACK.FIRING;
  if (onPlayer) return ATTACK.TARGETING;
  return ATTACK.POSTURE;
}

function awarenessOf(entity, relation, attack, playerId, opts) {
  if (opts && typeof opts.awarenessOf === 'function') {
    const given = opts.awarenessOf(entity);
    if (given) return given;
  }
  if (attack === ATTACK.FIRING || attack === ATTACK.TARGETING) return AWARENESS.ENGAGED;
  const ai = entity.data && entity.data.ai;
  if (!ai) return AWARENESS.UNKNOWN;
  if (ai.huntPlayer || ai.forcePlayerTarget || (playerId != null && ai.retaliationTargetId === playerId)) return AWARENESS.ALERTED;
  return relation === RELATION.HOSTILE ? AWARENESS.UNAWARE : AWARENESS.UNKNOWN;
}

/**
 * Classify one contact into its independent dimensions. `out` is reused when given (the HUD
 * classifies every overlay tick). `opts`: { selectedId, awarenessOf(entity) }.
 */
export function classifyContact(state, entity, out = {}, opts = null) {
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
  const physical = physicalOf(entity);
  const relation = relationOf(state, entity, player);
  let lifecycle = INERT;
  if (physical === PHYSICAL.WRECK) lifecycle = lifecycleOf(state, entity);
  else if (physical === PHYSICAL.SHIP || physical === PHYSICAL.DRONE || physical === PHYSICAL.FAUNA) {
    lifecycle = lifecycleOf(state, entity);
  }
  const alive = !!entity && entity.alive !== false;
  const living = alive
    && (physical === PHYSICAL.SHIP || physical === PHYSICAL.DRONE || physical === PHYSICAL.FAUNA)
    && (lifecycle === LIFECYCLE.ALIVE || lifecycle === LIFECYCLE.CONCUSSED || lifecycle === LIFECYCLE.DISABLED);
  const attack = living ? attackOf(entity, relation, state && state.playerId) : ATTACK.NONE;
  const selectedId = opts && opts.selectedId !== undefined
    ? opts.selectedId
    : (state && state.player ? state.player.targetId : null);
  out.physical = physical;
  out.relation = relation;
  out.lifecycle = lifecycle;
  out.living = living;
  out.attack = attack;
  out.awareness = living ? awarenessOf(entity, relation, attack, state && state.playerId, opts) : AWARENESS.UNKNOWN;
  out.selected = !!entity && selectedId != null && entity.id === selectedId;
  out.observed = !concealedFromPlayer(state, entity);
  return out;
}

/**
 * The minimal contact mark for a living, observed, non-selected contact — or null when none is
 * needed. Shape carries relation (never colour alone); the lifecycle and the attack posture are
 * variants of the same shape, not new symbols. Wrecks, rocks, cargo and structures never get one:
 * the mark is the claim "this is alive".
 */
export function contactMark(cls, hullPixelRadius) {
  if (!cls || !cls.living || !cls.observed || cls.selected) return null;
  if (cls.relation === RELATION.SELF) return null;
  if (Number.isFinite(hullPixelRadius) && hullPixelRadius >= MARK_BELOW_PX) return null;
  // The radar's IFF shape vocabulary (ui/accessibility.js SEMANTIC_PALETTE): hostile triangle,
  // friendly diamond, neutral square — one language across the radar, the roster and the world.
  const shape = cls.relation === RELATION.HOSTILE ? 'triangle'
    : cls.relation === RELATION.FRIENDLY ? 'diamond' : 'square';
  const variant = cls.lifecycle === LIFECYCLE.DISABLED || cls.lifecycle === LIFECYCLE.CONCUSSED
    ? 'down'
    : (cls.attack === ATTACK.FIRING || cls.attack === ATTACK.TARGETING) ? 'on-you' : 'plain';
  return { shape, variant, relation: cls.relation };
}

// ---- status relevance --------------------------------------------------------------------------
// A status is worth a chip only when it explains a decision. "ARC READY" on an ionized hull is a
// promise the player's guns can keep ONLY if a fitted attack actually chains off that status.
const EXPLOIT_LABEL = Object.freeze({ status_ionized: 'ARC READY' });
const exploitCache = new WeakMap(); // state -> { key, ids }

/**
 * The status ids the player's FITTED attacks can exploit (a compiled spec's chain
 * `prerequisiteStatus`). Cached per fitted-weapon + modifier signature.
 */
export function fittedExploitedStatuses(state) {
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
  const weapons = player && player.data && Array.isArray(player.data.weapons) ? player.data.weapons : null;
  const ids = new Set();
  if (!weapons) return ids;
  let key = '';
  const defs = [];
  for (const w of weapons) {
    const def = w ? WPN.get(w.defId || w.id) : null;
    defs.push(def);
    key += `${w ? (w.defId || w.id) : ''};`;
    if (def) key += collectAttackModifiers(state, player, def).map((row) => `${row[0]}:${row[1]}`).join(',') + '|';
  }
  const cached = exploitCache.get(state);
  if (cached && cached.key === key) return cached.ids;
  for (let i = 0; i < weapons.length; i += 1) {
    const w = weapons[i];
    const def = defs[i];
    if (!w || !def) continue;
    const compiled = compileAttackSpec({ weapon: mergeWeaponView(w, def), modifiers: collectAttackModifiers(state, player, def) });
    const chain = compiled && compiled.spec && compiled.spec.propagation && compiled.spec.propagation.chain;
    if (chain && chain.prerequisiteStatus && Number(chain.count) > 0) ids.add(chain.prerequisiteStatus);
  }
  exploitCache.set(state, { key, ids });
  return ids;
}

/**
 * Chips for statuses the player can act on. Duration comes from the simulation (expiresTick), never
 * from the presentation clock. Returns [] when nothing is exploitable — never a decorative chip.
 */
export function exploitableStatusChips(state, target) {
  const runtime = state && state.combat && state.combat.entities && target
    ? state.combat.entities[String(target.id)] : null;
  if (!runtime || !runtime.statuses) return [];
  const exploited = fittedExploitedStatuses(state);
  if (exploited.size === 0) return [];
  const tick = (state.tick | 0);
  const chips = [];
  for (const id of exploited) {
    const label = EXPLOIT_LABEL[id];
    const active = runtime.statuses[id];
    if (!label || !active || !Number.isFinite(active.expiresTick) || active.expiresTick <= tick) continue;
    chips.push({ id, label, secondsLeft: Math.max(0, (active.expiresTick - tick) / 60) });
  }
  return chips;
}

// ---- denial at the point of intent -------------------------------------------------------------
export const DENIAL = Object.freeze({
  UNOBSERVED: 'unobserved',
  OUT_OF_RANGE: 'out-of-range',
  BLOCKED: 'blocked',
  NO_LOCK: 'no-lock',
  PROTECTED_CARGO: 'protected-cargo',
  TOO_LARGE: 'too-large',
});

const DENIAL_TEXT = Object.freeze({
  [DENIAL.UNOBSERVED]: 'unobserved',
  [DENIAL.OUT_OF_RANGE]: 'out of range',
  [DENIAL.BLOCKED]: 'blocked',
  [DENIAL.NO_LOCK]: 'no lock',
  [DENIAL.PROTECTED_CARGO]: 'protected cargo',
  [DENIAL.TOO_LARGE]: 'too large',
});

/** Player-facing words for a denial reason ('' for none/unknown). */
export function denialText(reason) {
  return DENIAL_TEXT[reason] || '';
}

/**
 * The FIRST reason an intent is refused, in the order the player can fix them: they cannot act on
 * what their sensors do not hold, then range, line, lock, then the target's own refusal. The owner
 * of each fact supplies it; this function owns the vocabulary and the order, and the one fact that
 * lives here — sensor truth.
 *   facts: { distance, range, blocked, requiresLock, hasLock, protectedCargo, tooLarge }
 */
export function intentDenial(state, entity, facts = null) {
  if (entity && concealedFromPlayer(state, entity)) return DENIAL.UNOBSERVED;
  const f = facts || {};
  if (Number.isFinite(f.range) && Number.isFinite(f.distance) && f.distance > f.range) return DENIAL.OUT_OF_RANGE;
  if (f.blocked === true) return DENIAL.BLOCKED;
  if (f.requiresLock === true && f.hasLock !== true) return DENIAL.NO_LOCK;
  if (f.protectedCargo === true) return DENIAL.PROTECTED_CARGO;
  if (f.tooLarge === true) return DENIAL.TOO_LARGE;
  return null;
}

/**
 * Is the straight shot from `shooter` to `target` blocked right now — by a body on the line (the
 * shared line-of-sight witness every observer uses) or by a shield panel that is hostile to the
 * shooter (the same intercept the projectile sweep, the beam ray and the blast occluder read)?
 * The shooter's OWN panel never blocks its shots, and a panel never occludes its own endpoints.
 * Returns { reason: DENIAL.BLOCKED, by: 'body' | 'shield-panel' } or null. Prediction, not
 * confirmation: a hit, a block or a shield break is only ever announced from accepted sim events.
 */
export function gunLineDenial(state, shooter, target) {
  if (!state || !shooter || !shooter.pos || !target || !target.pos) return null;
  if (hasBlockingPanels(state)) {
    const hit = interceptSegment(state, PYLON_CONTACT.PROJECTILE, shooter.id,
      shooter.pos.x, shooter.pos.z, target.pos.x, target.pos.z, 0,
      { fallbackTeam: shooter.team, exemptId: target.id });
    if (hit) return { reason: DENIAL.BLOCKED, by: 'shield-panel' };
  }
  if (!witnessLineOfSight(state, shooter, target.pos, [target.id])) {
    return { reason: DENIAL.BLOCKED, by: 'body' };
  }
  return null;
}
