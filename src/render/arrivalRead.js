// Drop-in arrival read (inf-drop-in-read) — the pure decision layer.
//
// The player story: when a fresh wing drops into the sector mid-session, the picture says so —
// a hard arrival flash where they came in, a wake still streaming down the lane they flew in on,
// and a brake flare as the drive kills the ingress speed, all in the arriving faction's tint.
// When nothing arrives, nothing flashes. Reinforcement squads already arrive THROUGH a lane
// (SF-053: nose and velocity carry them inbound), but presentation never read that truth: a
// squad materialized out of a generic scale ramp, indistinguishable from any other pop-in.
//
// This module owns the eligibility and shape decisions; the vfx adapter owns spawning. Pure
// function of the spawn truth: no Three.js, no GameState, no rng, no wall time. The caller
// stamps the beat in sim time and the sprite pools age on the presentation clock, so a frozen
// sim freezes the read exactly like every other effect.
//
// The context list is the honest gate: only spawn contexts whose producers mean "arrived from
// elsewhere mid-session" dress the beat. World population, tutorial dressing, convoy/worker
// traffic and routine escorts spawn without it and stay silent.

/** Producers that stamp data.ai.spawnContext with a mid-session drop-in meaning. */
export const ARRIVAL_READ_CONTEXTS = Object.freeze([
  'sg06_reinforcement',      // aiEncounter SF-053: squads through resolved ingress lanes
  'intervention_jumper',     // intervention.js: a hull ripping out of its transit near the player
  'intervention_guard',      // intervention.js: the guard wing that comes with it
  'counterweight_pressure',  // heistFacilities: a pressure wave arriving at a site
  'opportunist',             // memorialThief: a scavenger drifting onto a live cache
  'nursery_claim_defense',   // claims: raiders arriving at a worked nursery claim
  'nursery_claim_crew',      // claims: the crew arriving with it
]);

/** Camera-relevance band around the pilot, in world units. */
export const ARRIVAL_MIN_WU = 70;
export const ARRIVAL_MAX_WU = 1500;

/**
 * Spawns inside this window after a sector enter / load are world materialization, not
 * arrivals — the picture must not flash the whole neighborhood at sector load.
 */
export const ARRIVAL_GRACE_S = 2.5;

/** At or above this spawn speed the wake rides the velocity; below it, the nose heading. */
export const ARRIVAL_INGRESS_SPEED_WU = 25;

// Beat shape. Reduced motion halves counts and gain; it never silences (beacon-lamp floor law).
export const ARRIVAL_WAKE_COUNT_FULL = 12;
export const ARRIVAL_WAKE_COUNT_REDUCED = 5;
export const ARRIVAL_SHEETS_FULL = 2;
export const ARRIVAL_SHEETS_REDUCED = 1;
export const ARRIVAL_FLASH_LIFE_S = 0.5;
export const ARRIVAL_SHEET_LIFE_S = 0.42;
export const ARRIVAL_BRAKE_LIFE_S = 0.6;
export const ARRIVAL_STREAK_LIFE_S = 0.7;
export const ARRIVAL_BRAKE_OP_FULL = 0.55;
export const ARRIVAL_BRAKE_OP_REDUCED = 0.3;
export const ARRIVAL_WAKE_SPEED_FULL = 30;
export const ARRIVAL_WAKE_SPEED_REDUCED = 16;

const ARRIVAL_CONTEXT_SET = new Set(ARRIVAL_READ_CONTEXTS);

/** The spawn context that earns a drop-in read, or null. */
export function arrivalReadContextOf(entity) {
  const context = entity && entity.data && entity.data.ai && entity.data.ai.spawnContext;
  return (typeof context === 'string' && ARRIVAL_CONTEXT_SET.has(context)) ? context : null;
}

/**
 * Decide whether one `entity:spawned` payload is a readable drop-in, and the beat's shape.
 *
 * `entity` is the fresh ship from the bus payload. `opts`:
 *   simTime          presented sim clock
 *   sectorEnteredAtT sim time the sector was entered / game loaded / save restored (grace origin)
 *   playerPos        {x,z} of the pilot — the camera reference; null fails closed (no read)
 *   playerId         the player entity id, excluded from its own arrival
 *   reducedMotion    accessibility profile
 *
 * Returns null for everything that is not a readable drop-in, else a plan:
 *   { context, x, z, headingRad, speedWu, radius,
 *     wakeCount, wakeSpeed, sheets, brakeOpacity } — world-space XZ, radians, world units.
 */
export function arrivalReadForSpawn(entity, opts = {}) {
  if (!entity || entity.type !== 'ship' || entity.alive === false) return null;
  if (opts.playerId != null && entity.id === opts.playerId) return null;
  const context = arrivalReadContextOf(entity);
  if (!context) return null;

  const simTime = Number(opts.simTime);
  const enteredAt = Number(opts.sectorEnteredAtT);
  if (Number.isFinite(simTime) && Number.isFinite(enteredAt)
    && simTime - enteredAt < ARRIVAL_GRACE_S) {
    return null; // world materialization at load, not an arrival
  }

  const playerPos = opts.playerPos;
  if (!playerPos || !Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.z)) return null;
  const pos = entity.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  const d = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
  if (!(d >= ARRIVAL_MIN_WU && d <= ARRIVAL_MAX_WU)) return null;

  const vel = entity.vel;
  const speedWu = vel && Number.isFinite(vel.x) && Number.isFinite(vel.z)
    ? Math.hypot(vel.x, vel.z)
    : 0;
  let headingRad;
  if (speedWu >= ARRIVAL_INGRESS_SPEED_WU) {
    headingRad = Math.atan2(vel.z, vel.x);
  } else {
    // A slow drop-in (the intervention jumper tears out at a stand) still has a nose.
    const rot = Number(entity.rot);
    headingRad = Number.isFinite(rot) ? rot : 0;
  }

  const reduced = opts.reducedMotion === true;
  const radius = Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : 6;

  return {
    context,
    x: pos.x,
    z: pos.z,
    headingRad,
    speedWu,
    radius,
    wakeCount: reduced ? ARRIVAL_WAKE_COUNT_REDUCED : ARRIVAL_WAKE_COUNT_FULL,
    wakeSpeed: reduced ? ARRIVAL_WAKE_SPEED_REDUCED : ARRIVAL_WAKE_SPEED_FULL,
    sheets: reduced ? ARRIVAL_SHEETS_REDUCED : ARRIVAL_SHEETS_FULL,
    brakeOpacity: reduced ? ARRIVAL_BRAKE_OP_REDUCED : ARRIVAL_BRAKE_OP_FULL,
  };
}
