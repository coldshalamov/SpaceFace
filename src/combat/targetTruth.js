// Target truth — ONE projection answering "what am I pointing at, what is selected, and what will
// my guns actually address?" (packet 02, design/combat-convergence/02_COMBAT_READABILITY_AND_TARGETING.md).
//
// It READS; it owns no state and invents no competing "combatTarget". The facts keep their writers:
//   state.player.targetId        the player's SELECTION (UI/input-owned; also seeds Massline throws)
//   state.player.tether.targetId what the Massline is physically attached to
//   resolvePlayerGunTarget()     the one authoritative gun-target resolver (combat/autoTargetMode.js)
//   state.input.aimWorld         the cursor's world point — manual ballistic aim stays authoritative
// Identity is generation-safe (targetIdentity.js: a recycled id retires the bracket and falls back
// to free aim, it never inherits) and sensor-truthful (a cloak-hidden hull gets no bracket, only an
// expiring last-known mark). Positions are global XZ so a floating-origin rebase moves nothing.
//
// REASON — why the effective gun target is what it is. Exactly one holds:
//   'line-target' a hostile ship/drone is on the player's Massline. A line on a hostile IS the firing
//                 solution while it is attached (weapons.js overrides aim with the tether solve, at
//                 ANY assist strength), so the cursor is NOT authoritative and the effective target
//                 may be a different hull than the selection. This is the case that must be labelled.
//   'assist'      no line; assist is on (not disabled, strength > 0) and a live, observed hostile is
//                 selected: tickAutoTarget corrects aim onto it. effective == selection.
//   'selection'   a live, observed hostile is selected but NOTHING corrects aim (assist off or the
//                 free-aim kill-switch). The selection is an information focus: it must never
//                 silently enable aim correction or firing. effective = null, the cursor decides.
//   'free-aim'    no hostile claims the guns: nothing selected, or the selection is a friendly /
//                 neutral / rock / cargo (information only), dead, dying, recycled, or unobserved.
//
// manualAimAuthoritative is the player-facing promise "moving the mouse still matters": false only
// when something is genuinely overriding the cursor (a hostile on the line, or aim correction > 0).
import {
  playerLeadSpeed,
  resolvePlayerGunTarget,
  tetheredGunTarget,
  targetAssistScale,
} from './autoTargetMode.js';
import { solveTetherLeadSolution, orbitalConstraintState } from './tetherFireControl.js';
import {
  concealedFromPlayer,
  ensureBound,
  lastKnownMark,
  noteSelectionObserved,
  selectionIsRecycled,
} from './targetIdentity.js';
import { resolveWorldPresentationEntity } from '../world/presentationSources.js';
import { LIFECYCLE, lifecycleOf } from './lifecycle.js';

export const TARGET_REASON = Object.freeze({
  LINE_TARGET: 'line-target',
  ASSIST: 'assist',
  SELECTION: 'selection',
  FREE_AIM: 'free-aim',
});

/** The selection's standing, independent of whether it is hostile. */
export const SELECTION_STATUS = Object.freeze({
  NONE: 'none',
  LIVE: 'live',
  DEAD: 'dead',
  DYING: 'dying',          // an irreversibly failing hull (packet 08 lifecycle): no bracket, no affordances
  RECYCLED: 'recycled',
  CONCEALED: 'concealed',
});

/**
 * A reusable projection record (the HUD projects every frame; nothing here allocates per call).
 * All fields are overwritten by projectTargetTruth.
 */
export function createTargetTruth() {
  return {
    cursorAimPoint: null,         // {x,z} world point under the cursor / aim, or null
    selectedId: null,             // live, observed, identity-true selection (any kind), or null
    selectedStatus: SELECTION_STATUS.NONE,
    effectiveGunTargetId: null,   // the hull the guns' solution is corrected onto, or null
    reason: TARGET_REASON.FREE_AIM,
    manualAimAuthoritative: true,
    divergent: false,             // effective target exists and is not the selection
    tetherTargetId: null,         // hostile on the line that owns the guns, or null
    leadTargetId: null,           // where the lead pip belongs: effective, else a selected hostile
    assistScale: 0,               // 0..1 aim correction actually applied (0 when assist is off)
    lastKnown: null,              // {id,x,z,ageS,expiresInS} while an unobserved mark lives, or null
    _aim: { x: 0, z: 0 },
    _mark: { id: null, x: 0, z: 0, ageS: 0, expiresInS: 0 },
  };
}

function finiteXZ(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

function selectionEntity(state, id) {
  const live = state.entities && typeof state.entities.get === 'function' ? state.entities.get(id) : null;
  if (live) return live;
  return resolveWorldPresentationEntity(state, id);
}

/**
 * Project the player's targeting truth into `out` (allocated by createTargetTruth) and return it.
 * Pure with respect to GameState; refreshes only the runtime identity/last-known memory.
 */
export function projectTargetTruth(state, out = createTargetTruth()) {
  out.cursorAimPoint = null;
  out.selectedId = null;
  out.selectedStatus = SELECTION_STATUS.NONE;
  out.effectiveGunTargetId = null;
  out.reason = TARGET_REASON.FREE_AIM;
  out.manualAimAuthoritative = true;
  out.divergent = false;
  out.tetherTargetId = null;
  out.leadTargetId = null;
  out.assistScale = 0;
  out.lastKnown = null;
  if (!state || typeof state !== 'object') return out;

  const aim = state.input && state.input.aimWorld;
  if (finiteXZ(aim)) {
    out._aim.x = aim.x; out._aim.z = aim.z;
    out.cursorAimPoint = out._aim;
  }

  const inp = state.input;
  const scale = targetAssistScale(state);
  const assistOn = !(inp && inp.targetAssistDisabled === true) && scale > 0;
  out.assistScale = assistOn ? scale : 0;

  // ---- the selection, judged on identity and sensors ------------------------------------------
  const selId = state.player && state.player.targetId != null ? state.player.targetId : null;
  ensureBound(state);
  if (selId != null) {
    const sel = selectionEntity(state, selId);
    if (!sel || sel.alive === false) {
      out.selectedStatus = SELECTION_STATUS.DEAD;
    } else if (selectionIsRecycled(state, sel)) {
      out.selectedStatus = SELECTION_STATUS.RECYCLED;
    } else if (sel.type === 'wreck' && lifecycleOf(state, sel) === LIFECYCLE.DYING) {
      out.selectedStatus = SELECTION_STATUS.DYING;
    } else if (concealedFromPlayer(state, sel)) {
      out.selectedStatus = SELECTION_STATUS.CONCEALED;
      noteSelectionObserved(state, sel, true);
    } else {
      out.selectedStatus = SELECTION_STATUS.LIVE;
      out.selectedId = selId;
      noteSelectionObserved(state, sel, false);
    }
  }
  const mark = lastKnownMark(state, out._mark);
  if (mark && mark.id !== out.selectedId) out.lastKnown = mark;

  // ---- who owns the guns: the ONE resolver, then judge how it reaches the aim -----------------
  const gun = resolvePlayerGunTarget(state);
  const tether = tetheredGunTarget(state);
  if (tether && gun === tether) {
    out.tetherTargetId = tether.id;
    out.effectiveGunTargetId = tether.id;
    out.reason = TARGET_REASON.LINE_TARGET;
    out.manualAimAuthoritative = false;
    out.leadTargetId = tether.id;
  } else if (gun) {
    out.leadTargetId = gun.id;
    if (assistOn) {
      out.effectiveGunTargetId = gun.id;
      out.reason = TARGET_REASON.ASSIST;
      out.manualAimAuthoritative = false;
    } else {
      out.reason = TARGET_REASON.SELECTION; // information focus: the cursor still decides
    }
  }
  out.divergent = out.effectiveGunTargetId != null && out.effectiveGunTargetId !== out.selectedId;
  return out;
}

const _victim = { pos: null, vel: null, mass: 1 };
const _shooter = { pos: null, vel: null, mass: 1 };
const _zeroVel = Object.freeze({ x: 0, z: 0 });

/**
 * The lead pip's solution for the hull the Massline addresses, in gunnery.leadSolution's shape
 * ({valid, angle, x, z, dist}). It is the SAME constrained solve weapons.js fires with
 * (tetherFireControl.solveTetherLeadSolution), so the pip never describes a linear lead over a
 * circular orbit the guns will not honour.
 */
export function tetherLeadSolution(shooter, target, projSpeed) {
  if (!shooter || !shooter.pos || !target || !target.pos) {
    return { valid: false, angle: 0, x: 0, z: 0, dist: 0 };
  }
  _shooter.pos = shooter.pos; _shooter.vel = shooter.vel || _zeroVel; _shooter.mass = shooter.mass;
  _victim.pos = target.pos; _victim.vel = target.vel || _zeroVel; _victim.mass = target.mass;
  const speed = Number.isFinite(projSpeed) && projSpeed > 0 ? projSpeed : 360;
  const angle = solveTetherLeadSolution(_shooter, _victim, speed, {
    taut: orbitalConstraintState(_shooter, _victim).constrained,
  }).angle;
  const dx = target.pos.x - shooter.pos.x;
  const dz = target.pos.z - shooter.pos.z;
  const dist = Math.hypot(dx, dz);
  if (!(dist > 1e-3)) return { valid: false, angle, x: target.pos.x, z: target.pos.z, dist: 0 };
  return { valid: true, angle, x: shooter.pos.x + Math.cos(angle) * dist, z: shooter.pos.z + Math.sin(angle) * dist, dist };
}

/**
 * The pip's solution for the hull the Massline addresses, at the speed the FIRE PATH solves it with
 * (autoTargetMode.playerLeadSpeed — the first mount carrying a projectile speed, the same rule as
 * weapons._playerProjectileSpeed). In a mixed battery that speed is not the pip's gun-only speed,
 * and the pip must describe the angle the guns actually take for the line.
 */
export function lineLeadSolution(state, shooter, target) {
  return tetherLeadSolution(shooter, target, playerLeadSpeed(state));
}
