// discoveryKnowledge.js — SF-245 sim half ("the map distinguishes a rumor from a route").
//
// One pure model of what the player has actually DISCOVERED, as knowledge — never what exists.
// Screens consume it instead of reading raw knowledge records, because the canonical records mix
// earned knowledge with world truth: a unique-wreck bearing record carries `bearingCenter`/`radius`
// (the rumor) AND `exactPos` (the answer) in the same object, and a scan-survey memory carries the
// (recycled!) entity id of the wreck that was investigated. Any surface that renders the raw record
// can leak the exact location through selection text, focus order or an invisible route line.
//
// Tiers, in earned order:
//   bearing — an approximate search region (purchased rumor, heard bearing). Never a position.
//   ping    — an unresolved scanner contact: an approximate measured fix, explicitly not exact.
//   survey  — a loss identified by deep scan: which sector, not where (provenance only).
//   resolved — a rumor the player physically confirmed: found once, exact position not re-granted.
//   exact   — the player earned the true position (unique-wreck fix). The only navigable tier.
//
// PURE and VIEW-ONLY (ARCHITECTURE §5): reads state, never mutates, never imports Three.js, no
// Math.random. Rows are built by field whitelist — a field the player has not earned cannot appear
// because it is never copied. World discovery owners stay untouched (scanReveal/scanner/uniqueWrecks
// remain the only writers; this is a consumer projection).

import { frontierRumorRecords } from '../../data/frontierRumors.js';

function pointCopy(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.z))) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

function radiusCopy(value) {
  const r = Number(value);
  return Number.isFinite(r) && r > 0 ? r : null;
}

function baseEntry(id, source, sectorId) {
  return {
    id,
    source,
    sectorId: sectorId != null ? String(sectorId) : null,
    tier: null,
    exact: false,
    center: null,
    radius: null,
    pos: null,
    label: null,
    kind: null,
    nextAction: null,
  };
}

function freezeEntry(entry) {
  for (const key of Object.keys(entry)) {
    if (entry[key] && typeof entry[key] === 'object') Object.freeze(entry[key]);
  }
  return Object.freeze(entry);
}

// ── unique-wreck bearings (state.player.uniqueWrecks, uniqueWrecks-owned) ──────────────────────
// phase 'rumored' knows a region; a fix (fixedPos) is the earned exact position. exactPos on the
// raw record is WORLD TRUTH the player has not earned until the scanner resolves it — it is never
// copied, at any phase. A post-rumor phase without fixedPos fails closed to 'bearing'.
function uniqueWreckEntries(state) {
  const bearings = state && state.player && state.player.uniqueWrecks && state.player.uniqueWrecks.bearings;
  const entries = [];
  if (!bearings || typeof bearings !== 'object') return entries;
  for (const wreckId of Object.keys(bearings).sort()) {
    const record = bearings[wreckId];
    if (!record || typeof record !== 'object') continue;
    const entry = baseEntry(`uniqueWreck:${wreckId}`, 'uniqueWreck', record.sectorId);
    entry.label = record.name != null ? String(record.name) : null;
    entry.kind = record.phase != null ? String(record.phase) : null;
    const fixedPos = pointCopy(record.fixedPos);
    if (record.phase && record.phase !== 'rumored' && fixedPos) {
      entry.tier = 'exact';
      entry.exact = true;
      entry.pos = fixedPos;
      entry.nextAction = 'navigable';
    } else {
      const center = pointCopy(record.bearingCenter);
      const radius = radiusCopy(record.radius);
      if (!center || !radius) continue; // a bearing record without a region states nothing yet
      entry.tier = 'bearing';
      entry.center = center;
      entry.radius = radius;
      entry.nextAction = 'fly the bearing ring and pulse the scanner';
    }
    entries.push(freezeEntry(entry));
  }
  return entries;
}

// ── purchased frontier rumors (state.world.frontierRumors, world-owned) ────────────────────────
// A card is knowledge, not navigation authority: while unresolved it is a search circle only.
// Resolution means the player physically confirmed the target — it upgrades to 'resolved' but the
// rumor record never re-grants a coordinate, so neither does this row.
function frontierRumorEntries(state) {
  const entries = [];
  for (const record of frontierRumorRecords(state)) {
    if (!record || typeof record !== 'object') continue;
    const entry = baseEntry(`rumor:${record.id}`, 'frontierRumor', record.sectorId);
    entry.label = record.kindLabel != null ? String(record.kindLabel) : null;
    entry.kind = record.kind != null ? String(record.kind) : null;
    if (record.phase === 'resolved' || record.phase === 'contacted') {
      entry.tier = 'resolved';
      entry.nextAction = 'confirmed — the find is on your record';
    } else {
      const center = pointCopy(record.bearingCenter);
      const radius = radiusCopy(record.radius);
      if (!center || !radius) continue;
      entry.tier = 'bearing';
      entry.center = center;
      entry.radius = radius;
      entry.nextAction = 'search the ring; the card does not set a waypoint';
    }
    entries.push(freezeEntry(entry));
  }
  return entries;
}

// ── surveyed losses (state.scanReveal, scanReveal-owned) ───────────────────────────────────────
// A deep read identified the loss behind a wreck: sector and time are knowledge; the stored
// entityId is a recycled sim id, not a place — provenance is dropped, never exposed.
function surveyEntries(state) {
  const investigated = state && state.scanReveal && state.scanReveal.investigated;
  const entries = [];
  if (!investigated || typeof investigated !== 'object') return entries;
  for (const lossId of Object.keys(investigated).sort()) {
    const record = investigated[lossId];
    if (!record || typeof record !== 'object') continue;
    const entry = baseEntry(`survey:${lossId}`, 'survey', record.sectorId);
    entry.tier = 'survey';
    entry.kind = 'surveyed_loss';
    entry.nextAction = 'identified and charted';
    entries.push(freezeEntry(entry));
  }
  return entries;
}

// ── unresolved scan pings (state.world.scanPings, scanner-owned) ───────────────────────────────
// The scanner's unknown-contact marks: an approximate measured fix the player earned by pulsing.
// It draws as a question-mark mark, never as an exact target.
function pingEntries(state) {
  const buckets = state && state.world && state.world.scanPings;
  const entries = [];
  if (!buckets || typeof buckets !== 'object') return entries;
  for (const sectorId of Object.keys(buckets).sort()) {
    const list = buckets[sectorId];
    if (!Array.isArray(list)) continue;
    for (const ping of list) {
      if (!ping || typeof ping !== 'object' || ping.id == null) continue;
      const pos = pointCopy(ping.pos);
      if (!pos) continue;
      const entry = baseEntry(`ping:${sectorId}:${ping.id}`, 'ping', sectorId);
      entry.tier = 'ping';
      entry.exact = false;
      entry.pos = pos;
      entry.kind = ping.kind != null ? String(ping.kind) : 'unknown';
      entry.label = 'Unresolved contact';
      entry.nextAction = 'close with the contact and scan to identify';
      entries.push(freezeEntry(entry));
    }
  }
  return entries;
}

// ── knowledge projection ───────────────────────────────────────────────────────────────────────
/**
 * discoveryKnowledge(state) -> { entries }
 *
 * Every entry is what the player has EARNED about one discovery, in map-ready form. The projection
 * never enumerates world truth: an undiscovered wreck, rumor target or loss appears nowhere. Rows
 * are frozen and carry no field outside the whitelist — in particular no `exactPos`, no raw
 * entityId, and no position on any sub-exact tier.
 */
export function discoveryKnowledge(state) {
  const entries = [
    ...uniqueWreckEntries(state),
    ...frontierRumorEntries(state),
    ...surveyEntries(state),
    ...pingEntries(state),
  ];
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return Object.freeze({ entries: Object.freeze(entries) });
}

/**
 * canNavigateToKnowledge(entry) — true only when the canonical knowledge supports exact
 * navigation: an earned position (fixed unique wreck). Bearing, ping and survey rows are
 * actionable but explicitly incomplete; a screen may draw the region or mark and never a precise
 * navigable marker from them.
 */
export function canNavigateToKnowledge(entry) {
  return !!entry && entry.tier === 'exact' && !!entry.pos;
}

/**
 * knowledgeById(state, id) -> entry | null — the single-entry read for selection panels.
 */
export function knowledgeById(state, id) {
  if (typeof id !== 'string' || !id) return null;
  return discoveryKnowledge(state).entries.find((entry) => entry.id === id) || null;
}
