// Scar history — "hull damage states that persist across a fight" for every hull, not just the
// player's. HullScorchPool has supported persistent, target-bound scars from the start (spawn
// evicts transients first, the update loop holds a persistent mark at its fade floor, dispose
// retains them, and `resetTransientMatter` even documents "durable hull scars remain
// target-bound") — but no caller ever spawned one. Every hull you worked over therefore read
// brand-new again within a few seconds: the wave-1 glowing-wound layer cools and retires with
// its authored scorchLife, and nothing of the beating stayed on the metal.
//
// This module is the accounting for that missing aftermath layer: once a hull has absorbed
// sustained fire, its marks stop retiring — the last few hits cool to charcoal and STAY on the
// hull for the rest of the fight, exactly the way the player's own Living Hull keeps its scars.
//
// Pure decision layer: no THREE, no pools, no clock of its own, no RNG. `nowS` is the sim clock
// the presenter already reads. Slot truth (is a granted slot still OURS?) is consulted through a
// caller callback, so this file never reaches into the pool.

/** Hull hits with a scorch before the hull starts KEEPING its marks. */
export const SCAR_HISTORY_AFTER_HITS = 3;
/** Charcoal scars kept alive per hull. */
export const SCAR_HISTORY_PER_TARGET = 3;
/** Kept scars across all hulls — the 32-slot scorch pool shares them with live impact splashes. */
export const SCAR_HISTORY_GLOBAL = 10;
/** Cooling life of a kept scar: long enough to outlast any exchange, shaped like a slow burn. */
export const SCAR_HISTORY_LIFE_S = 75;
/** Bounded target book; the oldest entry retires when a new hull needs the room. */
export const SCAR_HISTORY_TARGET_CAP = 24;

export function createScarHistory() {
  return { byTarget: new Map(), kept: 0 };
}

export function resetScarHistory(book) {
  if (!book) return;
  book.byTarget.clear();
  book.kept = 0;
}

/**
 * Account one hull-scorch strike and decide whether THIS mark stays.
 *
 * `isGrantOurs(grant)` lets the book prune grants whose pool slot died or was reclaimed by
 * another hull (`slot.alive && slot.targetId === targetId` at the call site), so the kept
 * counters track real slots without a per-frame walk. The returned plan carries `grantRef` —
 * after the pool spawn succeeds, the presenter back-fills `grantRef.slot` with the slot index.
 *
 * Plan: `{ persistent, life, grantRef }` — transient strikes get the caller's own authored life.
 */
export function noteHullScorchStrike(book, targetId, nowS, isGrantOurs = null, bindingKey = null) {
  const plan = { persistent: false, life: null, grantRef: null };
  if (!book || !book.byTarget || targetId == null) return plan;
  let record = book.byTarget.get(targetId);
  // Renderer entity IDs may be reused for a new occupant. The contact mark pool already
  // binds scars to the renderer's stable entity key; reset this target's history on the same
  // identity boundary so an old hull cannot make a replacement inherit persistent status.
  if (record && record.bindingKey !== bindingKey) {
    book.kept = Math.max(0, book.kept - record.grants.length);
    book.byTarget.delete(targetId);
    record = null;
  }
  if (!record) {
    record = { hits: 0, lastAt: 0, grants: [], bindingKey };
    book.byTarget.set(targetId, record);
    // Bounded book: retire the stalest hull when a new one needs the room.
    while (book.byTarget.size > SCAR_HISTORY_TARGET_CAP) {
      let stalestKey = null;
      let stalestAt = Infinity;
      for (const [key, value] of book.byTarget) {
        if (key !== targetId && value.lastAt < stalestAt) {
          stalestAt = value.lastAt;
          stalestKey = key;
        }
      }
      if (stalestKey == null) break;
      book.kept -= book.byTarget.get(stalestKey).grants.length;
      book.byTarget.delete(stalestKey);
    }
  }
  // Grants whose slot died (retired, overwritten or handed to another hull) stop counting.
  if (typeof isGrantOurs === 'function') {
    for (let i = record.grants.length - 1; i >= 0; i--) {
      if (!isGrantOurs(record.grants[i])) {
        record.grants.splice(i, 1);
        book.kept = Math.max(0, book.kept - 1);
      }
    }
  }
  record.hits += 1;
  record.lastAt = Number.isFinite(nowS) ? nowS : record.lastAt;
  if (record.hits >= SCAR_HISTORY_AFTER_HITS
    && record.grants.length < SCAR_HISTORY_PER_TARGET
    && book.kept < SCAR_HISTORY_GLOBAL) {
    const grant = { slot: -1 };
    record.grants.push(grant);
    book.kept += 1;
    plan.persistent = true;
    plan.life = SCAR_HISTORY_LIFE_S;
    plan.grantRef = grant;
  }
  return plan;
}
