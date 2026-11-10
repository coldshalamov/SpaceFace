// src/characters/kesslerRules.js — pure rules for Kessler's scale (row 542 / 06 B1).
// No state, no bus, no Math.random. The adapter reads settled bodies; these answer:
// is this a weighable pod, is it at rest on the plate, and what does the thumbed plate
// say versus the pod's own stamp.

import { KESSLER_SCALE } from '../data/kessler.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** A jettisoned cargo pod is the deck's freight — the body the pilot sets down to weigh.
 *  Wrecks, drones and authored bodies are not cargo; a pod already read this visit is
 *  not re-weighed. */
export function kesslerPodEligible(entity) {
  if (!entity || entity.alive === false) return false;
  const d = entity.data || {};
  if (d.payloadType !== 'jettisoned_cargo' && d.jettisonedCargo !== true) return false;
  if (d.kesslerRead === true) return false;
  return Number.isFinite(entity.mass) && entity.mass > 0;
}

/** Arrival law, same as every cradle: inside the deck ring AND at rest. */
export function kesslerReadCheck(entity, pad = KESSLER_SCALE.pad, padRadius = KESSLER_SCALE.padRadius, restSpeed = KESSLER_SCALE.restSpeed) {
  const pos = entity && entity.pos;
  if (!finiteXZ(pos) || !finiteXZ(pad)) return { inZone: false, speed: Infinity, arrived: false };
  const vel = entity && entity.vel;
  const speed = finiteXZ(vel) ? Math.hypot(vel.x, vel.z) : Infinity;
  const inZone = Math.hypot(pos.x - pad.x, pos.z - pad.z) <= padRadius;
  return { inZone, speed, arrived: inZone && speed <= restSpeed };
}

/** What the thumbed plate reports: skimmed truth, resolved to a tenth. */
export function kesslerPlateRead(mass, factor = KESSLER_SCALE.plateFactor) {
  const m = Number.isFinite(mass) && mass > 0 ? mass : 0;
  return Math.round(m * factor * 10) / 10;
}

/** The honest mass the pod stamps — its physics mass, resolved to a tenth. */
export function kesslerTrueRead(mass) {
  const m = Number.isFinite(mass) && mass > 0 ? mass : 0;
  return Math.round(m * 10) / 10;
}

/** A variance the desk cannot explain away: the plate short by more than rounding. */
export function kesslerVarianceSeen(plateRead, trueRead) {
  return Number.isFinite(plateRead) && Number.isFinite(trueRead)
    && trueRead > 0 && (trueRead - plateRead) >= 0.1;
}
