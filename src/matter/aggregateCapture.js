// The merge step of a capture, shared by Gyre Snare and the Pull collector (packet 05: "extract only
// the reusable pure calculations/transaction seam that the two owners actually need").
//
// A capture is a representation transaction (see createCaptureLedger in ./aggregateMass.js): the
// caller RESERVES a ticket first; `planMeal` then computes everything the merge will do WITHOUT
// touching the world; `applyMeal` performs the mutation through the existing owners — the physics
// membrane (queuePhysicsImpulse / queuePhysicsTorqueImpulse), the authored body record
// (syncDerivedPhysicsMass) and the entity remover — and commits the ticket. After `applyMeal` the
// core is authoritative; the consumed body no longer collides or pays a reward on its own.
//
// What the tools add on top (the Gyre lash tether, the collector's emitter anchor) is an EXTERNAL
// holder: the flinch the core takes is a declared tool impulse, not conserved momentum. The exact
// inelastic-merge numbers live in aggregateMass.mergeBodies / mergeImpulse and are what the tests
// hold the physical state to.
//
// No Three.js, no bus, no rng.

import { queuePhysicsImpulse, queuePhysicsTorqueImpulse, syncDerivedPhysicsMass } from '../core/physicsAuthority.js';
import { grownRadius } from './aggregateMass.js';
import { matterMass, matterRadius } from './aggregateEligibility.js';

const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);

/**
 * What merging `meal` into `core` does, as numbers. `agg` = { mass, radius } is the aggregate BEFORE
 * the meal; `geom` = { dx, dz, dist } the core-minus-meal offset at contact; `tuning` carries
 * { absorbKnockPerMass, absorbKnockFloor, absorbKnockSpeedRef }.
 */
export function planMeal(core, meal, agg, geom, tuning, maxRadius, out = {}) {
  const em = matterMass(meal);
  const er = matterRadius(meal);
  const mass = agg.mass + em;
  const radius = grownRadius(agg.radius, er, 1, maxRadius);
  // The grown aggregate's inertia — one number for the meal's angular momentum and the physics rebuild.
  const inertia = Math.max(8, Math.round(mass * radius * radius * 0.4));
  const { dx, dz, dist } = geom;
  const live = dist > 1e-4;
  out.em = em; out.er = er; out.mass = mass; out.radius = radius; out.inertia = inertia;
  out.nx = live ? -dx / dist : 0;
  out.nz = live ? -dz / dist : 0;
  out.knockX = 0; out.knockZ = 0; out.dOmega = 0;
  if (live) {
    // Mass-proportional impulse alone shrugs to nothing at the climax (40 t into 2400 t ≈ 0.05 wu/s),
    // so a Δv floor keeps big meals felt on big balls; the closing speed along the approach grades it,
    // clamped so a railgun-fast meal cannot detonate the holder (≤ 2.5× the authored).
    const relX = finite(meal.vel && meal.vel.x) - finite(core.vel && core.vel.x);
    const relZ = finite(meal.vel && meal.vel.z) - finite(core.vel && core.vel.z);
    const closing = Math.max(0, relX * (dx / dist) + relZ * (dz / dist));
    const speedK = 1 + Math.min(1.5, closing / Math.max(1, tuning.absorbKnockSpeedRef));
    const knock = Math.max(em * tuning.absorbKnockPerMass, matterMass(core) * tuning.absorbKnockFloor) * speedK;
    out.knockX = (dx / dist) * knock;
    out.knockZ = (dz / dist) * knock;
    // The meal's ANGULAR momentum lands too: Δω = L / I with L ≈ m·v_t·d, the lever arm the CONTACT
    // distance. v_t rides the funnel's own co-rotating tangent (dz, −dx)/dist so a meal arriving with
    // the vortex deposits +spin. Capped so a railgun meal quickens, not spins out.
    const tangential = relX * (dz / dist) - relZ * (dx / dist);
    out.dOmega = Math.max(-0.5, Math.min(0.5, em * tangential * dist / inertia));
  }
  return out;
}

/**
 * Perform a planned merge. The reservation `ticket` (from the owner's ledger) commits the instant the
 * meal is gone from the world. `ctx` = { helpers, evidence, ledger, markVisual }.
 */
export function applyMeal(ctx, core, meal, plan, ticket) {
  if (plan.knockX !== 0 || plan.knockZ !== 0) {
    queuePhysicsImpulse(core, { x: plan.knockX, y: 0, z: plan.knockZ }, ctx.evidence);
  }
  if (Math.abs(plan.dOmega) > 1e-3) {
    queuePhysicsTorqueImpulse(core, { x: 0, y: plan.inertia * plan.dOmega, z: 0 }, ctx.evidence);
  }
  if (ctx.helpers && ctx.helpers.removeEntity) ctx.helpers.removeEntity(meal.id);
  else meal.alive = false;
  // The meal is gone from the world: the core is authoritative now.
  if (ctx.ledger && ticket) ctx.ledger.commit(ticket);
  // Grow the AUTHORED body record (mass/inertia/radius + revision bump → the physics owner rebuilds
  // the body with the new spec). `=== false` is an authored opt-out (no rapier body to grow).
  if (core.physicsBody !== false) syncDerivedPhysicsMass(core, plan.mass, plan.inertia, plan.radius);
  // The HEART visibly grows too: entity.radius is what the presenters scale the mesh off.
  if (!finite(core.radius) || core.radius < plan.radius) {
    core.radius = plan.radius;
    if (ctx.markVisual) ctx.markVisual(core);
  }
}
