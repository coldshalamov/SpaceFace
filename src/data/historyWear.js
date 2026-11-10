// PULSE-HISTORY — pure projections for the "ship and world wear your history" read.
// Nothing here owns a write: the deed ledger (systems/deedRecord.js), the loss ledger
// (systems/lossLedger.js), and the living-hull record (core/livingHull.js) already carry the
// history. This module turns those durable receipts into three things a player can point at:
//
//   trinket list   — cockpit keepsakes, one per kind of real deed, granted on the first one
//   decal id       — which stencil the yard paints for the deeds the hull is known for
//   memorial rows  — the named dead the loss ledger actually filed
//   graffiti line  — what strangers scratch about the player's deeds where the player is known
//
// Every function is deterministic over sim state; the system reads, never recomputes history.

import { peekDeedRecord, deedTally, pickDeedToTell, notorietyIn, DEED_KINDS } from '../systems/deedRecord.js';

export const HISTORY_WEAR_VERSION = 1;
/** Memorial arrays cap: the dead list is a shelf, not a census. */
export const HISTORY_DEAD_CAP = 24;
/** Notoriety (decayed deed weight in one sector) at which strangers start writing about you. */
export const HISTORY_KNOWN_NOTORIETY = 3;

// First occurrence of the kind grants one keepsake. id is stable — the trinket record dedupes on
// it — and the label is the noun the shelf shows ("a medic's tag", not a sentence).
export const DEED_TRINKETS = Object.freeze({
  pod_rescued:      Object.freeze({ id: 'medic_tag',      label: "a medic's tag" }),
  ace_defeated:     Object.freeze({ id: 'ace_sigil',      label: "an ace's sigil" }),
  ace_routed:       Object.freeze({ id: 'ace_bent_pin',   label: 'a bent ace pin' }),
  base_destroyed:   Object.freeze({ id: 'slag_coin',      label: 'a coin pressed from slag' }),
  hunter_disabled:  Object.freeze({ id: 'hunter_brass',   label: "a hunter's brass" }),
  hunter_outran:    Object.freeze({ id: 'hunter_stub',    label: 'a torn warrant stub' }),
  pod_ransomed:     Object.freeze({ id: 'ransom_ribbon',  label: 'a ransom ribbon' }),
  fence_route:      Object.freeze({ id: 'fence_knot',     label: "a fence's knot" }),
  stunt:            Object.freeze({ id: 'dare_pin',       label: 'a dare pin' }),
  bounty_paid:      Object.freeze({ id: 'cleared_stamp',  label: 'a cleared-warrant stamp' }),
  station_strike:   Object.freeze({ id: 'picket_card',    label: 'a picket card' }),
  kill_outlaw:      Object.freeze({ id: 'law_star',       label: 'a dull law star' }),
  kill_lawful:      Object.freeze({ id: 'grave_chip',     label: 'a grave chip' }),
  ore_flood:        Object.freeze({ id: 'first_ingot',    label: 'a first ingot' }),
  tumble_rake:      Object.freeze({ id: 'rake_tine',      label: 'a rake tine' }),
});

// One keepsake per kind, in the order the deeds happened. Deeds with no keepsake (dock_slam,
// wanted_tier...) are noise on the shelf — they still feed decals and graffiti.
export function historyTrinketsFor(state) {
  const rec = peekDeedRecord(state);
  if (!rec || !Array.isArray(rec.deeds)) return [];
  const out = [];
  const seen = new Set();
  for (const deed of rec.deeds) {
    const trinket = deed && DEED_TRINKETS[deed.kind];
    if (!trinket || seen.has(trinket.id)) continue;
    seen.add(trinket.id);
    out.push({
      id: trinket.id,
      label: trinket.label,
      deedId: deed.id || null,
      atT: Number(deed.t) || 0,
    });
  }
  return out;
}

// Decal axis: the street/law weights in DEED_KINDS vote on the hull's tag; industry deeds
// (ore/drag/rake/route work) outrank both when they dominate. An ace kill overrides everything —
// 'borrowed_time' is the stencil for hulls the aces couldn't keep.
export function historyDecalFor(state) {
  const rec = peekDeedRecord(state);
  if (!rec || !Array.isArray(rec.deeds) || !rec.deeds.length) return null;
  if (deedTally(state, 'ace_defeated') > 0) return 'borrowed_time';
  let law = 0, street = 0, trade = 0;
  for (const deed of rec.deeds) {
    if (!deed) continue;
    const spec = DEED_KINDS[deed.kind];
    if (!spec) continue;
    const w = Number(deed.weight) || 0;
    law += spec.law * w;
    street += spec.street * w;
    if (deed.kind === 'ore_flood' || deed.kind === 'hauler_dragged'
      || deed.kind === 'tumble_rake' || deed.kind === 'fence_route') trade += w;
  }
  if (trade > 0 && trade >= Math.abs(law) + Math.abs(street)) return 'industrial';
  if (law > street) return 'concord';
  if (street > law) return 'frontier';
  return null;
}

// The line a stranger scratches where the player's known — about the deed they'd actually retell.
// Returns null when the sector barely knows the player (decayed notoriety under the shelf).
export function historyGraffitiFor(state, sectorId) {
  if (!sectorId) return null;
  if (notorietyIn(state, sectorId) < HISTORY_KNOWN_NOTORIETY) return null;
  const deed = pickDeedToTell(state, { sectorId });
  if (!deed) return null;
  const who = String(deed.subject || '').trim();
  const spec = DEED_KINDS[deed.kind];
  const line = GRAFFITI_LINES[deed.kind]
    ? GRAFFITI_LINES[deed.kind](who)
    : (who ? `they still tell it here — ${spec ? spec.label : 'what you did'}` : null);
  if (!line) return null;
  return { deedId: deed.id || null, line };
}

const GRAFFITI_LINES = Object.freeze({
  dock_slam:       (w) => `the dock still dents where ${w || 'that hull'} came in`,
  ore_flood:       (w) => 'holds here still taste of cheap ore',
  hauler_dragged:  (w) => `${w || 'a hauler'} got walked out of here`,
  pod_rescued:     (w) => 'whoever pulls pods out of the black is owed a round',
  pod_abandoned:   (w) => 'they left the pod light burning. remember that',
  pod_captured:    (w) => 'pods get taken here. watch the quiet ships',
  kill_lawful:     (w) => `${w || 'a lawful hull'} died out there. say a name`,
  kill_outlaw:     (w) => `${w || 'an outlaw'} won't be missed. good riddance`,
  base_destroyed:  (w) => `${w || 'a base'} burned — you can still see it from the berth`,
  fence_burned:    (w) => 'the fence remembers. so does the wall',
  fence_emboldened:(w) => 'the fence pays bold here',
  fence_thanked:   (w) => 'the fence sends regards',
  bounty_paid:     (w) => 'warrants get settled here. yours too',
  wanted_tier:     (w) => 'somebody famous is wanted. somebody here',
  tumble_rake:     (w) => 'rocks rake themselves in this sky',
  stunt:           (w) => `the trick they still talk about: ${w || 'that run'}`,
  hunter_disabled: (w) => `a warrant hunter went quiet here. ${w || 'ask around'}`,
  hunter_outran:   (w) => 'hunters leave this sky slower than they come',
  station_strike:  (w) => 'crews walked off here once. the scaffold remembers',
  station_grudge:  (w) => 'berths refuse names here',
  ace_defeated:    (w) => `${w || 'an ace'} fell here. the wall keeps count`,
  ace_routed:      (w) => `${w || 'an ace'} ran from this sky`,
  pod_ransomed:    (w) => 'pods have a price here. somebody paid it',
  fence_route:     (w) => 'quiet cargo moves through. best not to count it',
  heat_scrubbed:   (w) => 'names get scrubbed here. paper is thin',
});

// Normalize one filed loss-ledger entry into a memorial row. Returns null when the ledger filed
// no real name — a memorial of placeholders is worse than none.
export function memorialEntryForLoss(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const name = String(entry.victimName || '').trim();
  if (!name) return null;
  return {
    id: String(entry.lossId || entry.id || `loss:${name}:${entry.t || 0}`),
    name,
    cause: String(entry.kind || '').trim() || null,
    sectorId: entry.sectorId || null,
    atT: Number(entry.t) || 0,
    byPlayer: entry.killedByPlayer === true,
  };
}
