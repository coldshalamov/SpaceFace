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
    } else if (entity.shield > previousShield + 1.0) {
      uniforms.uFlash.value = Math.max(uniforms.uFlash.value, 0.28);
    }
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
