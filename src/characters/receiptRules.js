// src/characters/receiptRules.js — pure rules for RECEIPT / PR-8 (row 506 / 03 §4.3).
// No state, no bus, no Math.random. The adapter hears kill events and reads positions;
// these answer: is that kill worth printing, what the receipt line says, and where the
// printer steers to keep pace with its client.

import { RECEIPT } from '../data/receipt.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** A kill prints when the player's id signed it — faction, range, and weapon don't matter
 *  to the printer. The printer refuses to file its own body or the client's. */
export function receiptPrintableKill(payload, playerId, droneId) {
  if (!payload || !Number.isFinite(payload.killerId)) return false;
  if (playerId == null || payload.killerId !== playerId) return false;
  if (payload.id === playerId || payload.id === droneId) return false;
  return true;
}

/** 4409 -> "4,409" — deterministic, no locale. */
export function receiptSerialText(n) {
  const s = String(Math.max(0, Math.floor(Number(n) || 0)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** One printed line: "Receipt 4,412: one corsair — returned to sender." Lawful kills are
 *  filed under a different heading; the printer does not judge, it itemizes. */
export function receiptLine(serial, victimClass, hostile) {
  const item = hostile ? RECEIPT.itemHostile : RECEIPT.itemInnocent;
  const noun = (typeof victimClass === 'string' && victimClass) ? victimClass : 'hull';
  return `Receipt ${receiptSerialText(serial)}: one ${noun} — ${item}.`;
}

/** Several kills in one pass print as a range: "Receipts 4,409–4,412: 4 hulls — bulk
 *  return accepted." Any lawful kill in the batch gets marked as a disputed filing. */
export function receiptBatchLine(serialLo, serialHi, count, innocents = 0) {
  const lo = receiptSerialText(serialLo), hi = receiptSerialText(serialHi);
  const disputed = innocents > 0 ? `, ${innocents === 1 ? 'one' : innocents} disputed` : '';
  return `Receipts ${lo}–${hi}: ${count} hulls${disputed} — ${RECEIPT.bulkSuffix}.`;
}

/** Where the printer wants to be: offset behind the player's motion, or just off the hull
 *  when the client is parked. Returns the steering velocity — the printer is a drone and
 *  writes its own vel on the calendar pass like every authored one-off. */
export function receiptFollowVelocity(dronePos, playerPos, playerVel) {
  if (!finiteXZ(dronePos) || !finiteXZ(playerPos)) return { x: 0, z: 0 };
  const pvx = Number(playerVel && playerVel.x) || 0;
  const pvz = Number(playerVel && playerVel.z) || 0;
  const pv = Math.hypot(pvx, pvz);
  let tx, tz;
  if (pv > 5) { // trail behind the flight vector
    tx = playerPos.x - (pvx / pv) * RECEIPT.followOffset;
    tz = playerPos.z - (pvz / pv) * RECEIPT.followOffset;
  } else {
    tx = playerPos.x;
    tz = playerPos.z + RECEIPT.followOffset; // parked: hover just off the tail
  }
  const dx = tx - dronePos.x, dz = tz - dronePos.z;
  const d = Math.hypot(dx, dz);
  if (d <= RECEIPT.followRadius) return { x: 0, z: 0 };
  const s = Math.min(RECEIPT.followSpeed, d); // don't overshoot a short gap
  return { x: (dx / d) * s, z: (dz / d) * s };
}
