// Wreck aftermath states: a fresh kill burns, then cools into a cold husk.
//
// The simulation already publishes the kill-time truth on wreck entities (`data.killedAt`,
// `data.bornAt`, `data.debrisHotT0`); until now the render pass never read it, so every wreck —
// one split seconds ago or an ancient graveyard husk — vented the same cold pale gas forever.
// This module is the decision layer only (no THREE, no pools): it resolves a wreck's time since
// death from the sim's own stamps and shapes the burn/smoke/vent envelopes the wisp cadence
// draws. Presentation only: reads sim state, writes nothing. A wreck with no kill stamp is
// authored set dressing and stays cold — only the sim's own dead burn.

const num = (v) => (Number.isFinite(v) ? v : 0);

/** Seconds after death with open flame at the breach. */
export const WRECK_BURN_S = 38;
/** Seconds after death by which the last ember has cooled. */
export const WRECK_COOL_S = 150;

/**
 * Seconds since this wreck died, from the sim's own kill-time stamps (`killedAt` / `bornAt` /
 * `debrisHotT0` — the latest wins). Returns -1 when the wreck carries no stamp: the render pass
 * treats that as authored set dressing and keeps it cold. Never mutates `data`.
 */
export function resolveWreckAgeS(data, nowS) {
  const now = num(nowS);
  const d = data || null;
  if (!d) return -1;
  let birth = -Infinity;
  // A kill at sim-time zero is valid. By contrast, bornAt: 0 is the default on authored
  // set dressing, so only a positive bornAt can stand alone as a wreck-age stamp.
  if (Number.isFinite(d.killedAt)) birth = Math.max(birth, d.killedAt);
  if (Number.isFinite(d.bornAt) && d.bornAt > 0) birth = Math.max(birth, d.bornAt);
  // Zero is meaningful for the explicit capital-hot stamp, whose producer supplies the flag
  // and timestamp together. A default zero without that ownership marker is not a hot stamp.
  if (Number.isFinite(d.debrisHotT0)
    && (d.debrisHotT0 > 0 || (d.debrisHotT0 === 0 && d.capitalDebris === true))) {
    birth = Math.max(birth, d.debrisHotT0);
  }
  if (birth === -Infinity) return -1;
  return Math.max(0, now - birth);
}

function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Aftermath picture of one wreck `ageS` seconds after death (pass -1 for an unstamped wreck).
 * Writes {burn, smoke, vent} into `out` and returns it. All channels are 0..1 gains:
 *   burn  — open flame at the breach: full through WRECK_BURN_S, then a smooth decay to cold
 *           by WRECK_COOL_S (a fire does not snap off; it gutters out).
 *   smoke — dark smoke: follows the flame but outlives it as the hot metal smokes itself out;
 *           gone by WRECK_COOL_S.
 *   vent  — the pressure vent that was always drawn: the one cold constant of a dead hull.
 */
export function wreckBurnPicture(ageS, out) {
  const age = num(ageS);
  if (age < 0) {
    out.burn = 0;
    out.smoke = 0;
    out.vent = 1;
    return out;
  }
  let burn;
  if (age < WRECK_BURN_S) {
    burn = 1;
  } else if (age >= WRECK_COOL_S) {
    burn = 0;
  } else {
    const u = (age - WRECK_BURN_S) / (WRECK_COOL_S - WRECK_BURN_S);
    burn = 1 - smoothstep01(u);
  }
  const smokeTail = age >= WRECK_COOL_S ? 0 : 1 - age / WRECK_COOL_S;
  out.burn = burn;
  out.smoke = Math.max(0.85 * burn, 0.35 * smokeTail);
  out.vent = 1;
  return out;
}
