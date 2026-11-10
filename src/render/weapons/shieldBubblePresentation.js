/**
 * Per-entity shield bubble presentation (flash decay + shell clock + visibility).
 *
 * Quiet flight still paid setShieldShellClock + Math.pow flash decay every syncEntityViews
 * pass for every ship with a shieldBubble, even while the bubble was not presentable
 * (flash cold, no contact, no collapse). Production quiet-latches that path; wakes on
 * shield value change, shield contact, or collapse. Soft-GPU fps not claimed.
 *
 * Picture contract ON: latched bubbles are already hidden; shell clock only matters while
 * presentable. Bench toggle restores always-update for A/B.
 */

import { setShieldShellClock } from './shieldShell.js';
import { hasShieldContact } from './shieldContacts.js';

/** Match renderer.js shouldPresentShieldBubble epsilon. */
export const SHIELD_BUBBLE_PRESENTATION_EPSILON = 0.015;

/** Bench A/B: production default ON. */
let SHIELD_BUBBLE_QUIET_LATCH = true;

export function setShieldBubbleQuietLatchForBench(enabled) {
  SHIELD_BUBBLE_QUIET_LATCH = enabled !== false;
}

export function getShieldBubbleQuietLatchForBench() {
  return SHIELD_BUBBLE_QUIET_LATCH !== false;
}

export function shouldPresentShieldBubble(shield, flash, hasContact = false, collapseTime = 0) {
  return (Number(shield) > 0 || collapseTime > 0)
    && (Number(flash) > SHIELD_BUBBLE_PRESENTATION_EPSILON || Boolean(hasContact) || collapseTime > 0);
}

/**
 * Re-online read ("shield feedback on contact" — the contact nobody could see).
 *
 * A shell that BREAKS gets the tear and a hit gets the bite, but the moment a broken shield came
 * BACK was deliberately silent: you learned your shield was up again by taking the next hit on
 * the hull. The DOWN -> UP transition is not passive bookkeeping — it is the shell powering back
 * on — so it now runs ONE soft re-knit sweep through the existing shell lattice: `uFlash` set
 * below the 1.0 rupture band and below a hit's 0.8 punch, so the welded seams charge and the
 * shell is briefly presentable again before the quiet latch takes it back. Still silent:
 * gradual mid-regeneration charging (0.1 -> 0.2 with no transition through zero) never shows a
 * ghost sphere, and a shell built cold with its shield already up (first sync) never pulses.
 */
export const SHIELD_REKNIT_FLASH = 0.62;

/** Pure transition decision: the flash a DOWN -> UP shield transition earns, else 0. */
export function shieldReknitFlashForTransition(previousShield, shield) {
  // An unknown previous sample (null/undefined/non-number) is not "was down" — it is "no
  // history", so it cannot claim a re-online and fails closed to 0.
  const prev = typeof previousShield === 'number' ? previousShield : NaN;
  const next = typeof shield === 'number' ? shield : NaN;
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return 0;
  return prev <= 0 && next > 0 ? SHIELD_REKNIT_FLASH : 0;
}

/**
 * Update one entity's fallback shieldBubble mesh presentation.
 * Returns true when the quiet latch skipped the heavy path this call.
 */
export function updateEntityShieldBubblePresentation(entity, shieldBubble, now, simTime, motionReduce = false, frameDt = null) {
  if (!entity || !shieldBubble || !shieldBubble.material || !shieldBubble.material.uniforms) {
    return false;
  }
  const userData = shieldBubble.userData || (shieldBubble.userData = {});

  if (SHIELD_BUBBLE_QUIET_LATCH && userData._sfShieldQuietLatched) {
    if (
      entity.shield === userData._prevShield
      && (userData._collapseTimer || 0) <= 0
      && !hasShieldContact(entity.id)
    ) {
      return true;
    }
    userData._sfShieldQuietLatched = false;
  }

  const uniforms = shieldBubble.material.uniforms;
  const previousShield = userData._prevShield != null ? userData._prevShield : entity.shield;
  const previousFlashTime = userData._prevFlashT != null ? userData._prevFlashT : now;
  // The caller may hand the time-effects-scaled frame delta (renderer.js presFrameDt): under a hard
  // freeze it is 0, which holds uFlash still instead of decaying on the wall clock.
  const dt = frameDt != null
    ? Math.min(0.1, Math.max(0, frameDt))
    : Math.min(0.1, Math.max(0.001, now - previousFlashTime));
  userData._prevFlashT = now;

  setShieldShellClock(shieldBubble.material, simTime, motionReduce === true);

  const up = entity.shield > 0;
  let flash = 0;

  if (userData._collapseTimer == null) userData._collapseTimer = 0;

  if (up) {
    if (entity.shield < previousShield - 0.5) {
      uniforms.uFlash.value = Math.min(1.0, uniforms.uFlash.value + 0.8);
    }
    // Re-online: the shell was DOWN and is back (the recharge completing through zero). One soft
    // re-knit sweep, never overriding a hotter in-flight read (a bite that landed this frame).
    const reknit = shieldReknitFlashForTransition(previousShield, entity.shield);
    if (reknit > 0 && uniforms.uFlash.value < reknit) {
      uniforms.uFlash.value = reknit;
    }
    // Mid-regeneration charging stays silent: the bubble belongs to impact/collapse/re-online
    // response, not passive shield bookkeeping, so a healthy regenerating ship shows no ghost sphere.
    uniforms.uFlash.value *= Math.pow(0.05, dt);
    flash = uniforms.uFlash.value;
    userData._collapseTimer = 0;
  } else {
    if (previousShield > 0) {
      userData._collapseTimer = 0.32;
      uniforms.uFlash.value = 2.4;
    }
    if (userData._collapseTimer > 0) {
      userData._collapseTimer -= dt;
      uniforms.uFlash.value *= Math.pow(0.1, dt);
      flash = uniforms.uFlash.value;
    }
  }
  userData._prevShield = entity.shield;

  const visible = shouldPresentShieldBubble(
    entity.shield,
    flash,
    hasShieldContact(entity.id),
    userData._collapseTimer,
  );
  if (shieldBubble.visible !== visible) shieldBubble.visible = visible;

  if (
    SHIELD_BUBBLE_QUIET_LATCH
    && !visible
    && flash <= SHIELD_BUBBLE_PRESENTATION_EPSILON
    && (userData._collapseTimer || 0) <= 0
    && !hasShieldContact(entity.id)
  ) {
    userData._sfShieldQuietLatched = true;
  }

  return false;
}

/** Swarm-only shell. A full-radius disk covers the ship on every contact. */
export function swarmCombatShieldRadius(entityRadius) {
  const r = Number(entityRadius);
  const body = Number.isFinite(r) && r > 0 ? r : 2;
  return Math.max(1.5, body * 0.42);
}
