// A2 Ship's Ledger — pure, read-only projection over existing durable receipts.
//
// This module intentionally has no registry slot, init(), event subscriptions, serializer, or
// state mutation. Source systems remain the sole writers. Dock UI asks for a page and receives a
// deterministic snapshot assembled from loss, trade, wreck, encounter, title, and recovered-name
// state that already round-trips through saves.

import { hash32 } from '../core/rng.js';
import { livingHullScars, livingHullRenown } from '../core/livingHull.js';
import { activeHullIdentity, activeOwnedShip } from '../data/hullIdentity.js';
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { SECTORS } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';
import { uniqueWreckById } from '../data/uniqueWrecks.js';
import {
  SHIP_LEDGER_TEMPLATES,
  VOLS_LEDGER_ANNOTATIONS,
} from '../data/shipLedgerTemplates.js';
import {
  WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS,
  wreckCathedralEvidenceCatalogEntry,
} from '../data/wreckCathedralEvidenceCatalog.js';

export const SHIP_LEDGER_SCHEMA_VERSION = 1;
export const SHIP_LEDGER_PAGE_SIZE = 12;
export const SHIP_LEDGER_MAX_PAGE_SIZE = 24;
export const SHIP_LEDGER_MAX_ENTRIES = 240;
export const SHIP_LEDGER_MAX_SOURCE_RECORDS = 512;
export const SHIP_LEDGER_CYCLE_SECONDS = 600;
export const VOLS_ANNOTATION_BEAT_GATE = 3;
// The Cathedral evidence projection reads one durable site record by stable id and the immutable
// presentation catalog. It writes neither — the World Site owner remains the sole writer of the
// receipt map and the catalog owner remains the sole writer of presentation copy/media.
export const SHIP_LEDGER_EVIDENCE_SITE_ID = 'world_site_wreck_cathedral';
export const SHIP_LEDGER_EVIDENCE_MAX_REVISIONS = 4;

const COMMODITY_BY_ID = new Map(COMMODITIES.map((entry) => [entry.id, entry]));
const FACTION_BY_ID = new Map((FACTION_META || []).map((entry) => [entry.id, entry]));

// PQ-142.01 — how the hull's own record reads as prose. The vocabulary is closed on both sides:
// these keys are exactly LIVING_HULL_SCAR_SURFACES / LIVING_HULL_SCAR_BANDS in core/livingHull.js,
// so a scar can never reach the page as a raw enum.
const SCAR_SURFACE_PHRASE = Object.freeze({
  weapon: 'gunfire',
  craft: 'another hull',
  terrain: 'rock',
  structure: 'station plate',
  debris: 'drifting wreckage',
  other: 'something the log did not name',
});
const SCAR_BAND_PHRASE = Object.freeze({
  graze: 'grazing',
  hard: 'hard',
  heavy: 'heavy',
  crushing: 'crushing',
});
const SHIP_BY_ID = new Map(SHIPS.map((entry) => [entry.id, entry]));
const SECTOR_BY_ID = new Map(SECTORS.map((entry) => [entry.id, entry]));
const STATION_BY_ID = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) STATION_BY_ID.set(station.id, station);
}

const ENCOUNTER_TITLES = Object.freeze({
  depth_h1_distress_from_inside: 'the distress from inside',
  depth_h2_drifting_bloom: 'first contact with the Drifting Bloom',
  depth_h3_wreck_that_knows_you: 'the wreck that knew the Tessera',
  depth_h4_love_letter_buoy: 'the love-letter buoy',
  depth_h5_corridor_massacre: 'the corridor massacre',
  depth_h6_patrol_ambush: 'the patrol ambush',
  depth_h7_spared_return: 'the spared return',
  depth_h8_echo_of_player: 'the echo of the player',
});

const PREVIOUS_CREW_ENCOUNTERS = new Set([
  'depth_h1_distress_from_inside',
  'depth_h3_wreck_that_knows_you',
]);

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function finiteInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : fallback;
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function boundedInt(value, min, max, fallback = min) {
  const number = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
  return Math.max(min, Math.min(max, number));
}

function text(value, fallback = 'unfiled') {
  const out = String(value == null ? fallback : value).replace(/\s+/g, ' ').trim();
  return out || fallback;
}

function humanizeId(value, fallback = 'unnamed') {
  return text(value, fallback)
    .replace(/^(?:cmdty|sector|station|ship|wreck|depth)_/, '')
    // Dotted ids ("news.tragedy_at_helios") are filenames, not prose; a raw dot in a
    // sentence reads as a formatting bug in the ledger line.
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sectorName(id) {
  const entry = id && SECTOR_BY_ID.get(id);
  return entry && entry.name || humanizeId(id, 'unknown space');
}

function stationName(id) {
  const entry = id && STATION_BY_ID.get(id);
  return entry && entry.name || humanizeId(id, 'an unnamed port');
}

function commodityName(id) {
  const entry = id && COMMODITY_BY_ID.get(id);
  return entry && entry.name || humanizeId(id, 'unlisted cargo');
}

function factionName(id) {
  const entry = id && FACTION_BY_ID.get(id);
  return entry && (entry.short || entry.name) || humanizeId(id, 'somebody on the channel');
}

function shipName(entry) {
  const retainedIdentity = entry && (entry.victimCallsign || entry.victimName);
  if (retainedIdentity) return text(retainedIdentity, 'an unnamed hull');
  const def = entry && entry.shipDefId && SHIP_BY_ID.get(entry.shipDefId);
  if (def && def.name) return def.name;
  if (entry && entry.assetId) return humanizeId(entry.assetId, 'an unnamed hull');
  return humanizeId(entry && entry.kind, 'an unnamed hull');
}

function cycleOf(t) {
  return Math.max(0, Math.floor(finite(t, 0) / SHIP_LEDGER_CYCLE_SECONDS) + 1);
}

export function formatLedgerCycle(t) {
  return `CYCLE ${String(cycleOf(t)).padStart(4, '0')}`;
}

function fillTemplate(template, tokens) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => text(tokens[key], 'unfiled'));
}

function sourceArray(value) {
  return Array.isArray(value) ? value : [];
}

function sourceObjectValues(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.values(value) : [];
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function templateFor(seed, type, sourceId) {
  const bank = SHIP_LEDGER_TEMPLATES[type] || [];
  if (!bank.length) return { id: `${type}.missing`, text: 'Record unavailable.' };
  return bank[hash32(seed, type, sourceId) % bank.length];
}

function volsAnnotationFor(seed, sourceId) {
  return VOLS_LEDGER_ANNOTATIONS[hash32(seed, 'vols-ledger-hand', sourceId) % VOLS_LEDGER_ANNOTATIONS.length];
}

// ---- Wreck Cathedral evidence collector (pure, read-only) ----
//
// The live receipt source is a direct-keyed map (at most one receipt per pageId) rebuilt by the
// World Site kernel on every normalize. The revision selector below is therefore defensive: it
// accepts a bounded list of candidates, validates each, and selects the highest valid revision
// independent of array order. A conflict (same top revision, differing payloads) is NEVER resolved
// by last-write, array order, display text, wall time, or host — the page is omitted instead.

function evidenceCandidateKey(receipt) {
  // Canonical, host-independent identity for byte-equivalence comparison.
  return JSON.stringify({
    receiptId: text(receipt.receiptId, ''),
    pageId: text(receipt.pageId, ''),
    revision: finiteInt(receipt.revision),
    earnedTick: finiteInt(receipt.earnedTick),
    earnedAtS: finite(receipt.earnedAtS, 0),
    siteRecordId: text(receipt.siteRecordId, ''),
    componentId: text(receipt.componentId, ''),
    operationId: text(receipt.operationId, ''),
    operationReceiptId: text(receipt.operationReceiptId, ''),
    stateFrom: text(receipt.stateFrom, ''),
    stateTo: text(receipt.stateTo, ''),
    provenanceRef: text(receipt.provenanceRef, ''),
    catalogRevision: finiteInt(receipt.catalogRevision),
  });
}

function validEvidenceCandidate(receipt) {
  if (!isRecord(receipt)) return null;
  if (!Number.isFinite(Number(receipt.revision)) || Number(receipt.revision) < 0) return null;
  if (!Number.isFinite(Number(receipt.earnedTick)) || Number(receipt.earnedTick) < 0) return null;
  if (!Number.isFinite(Number(receipt.earnedAtS)) || Number(receipt.earnedAtS) < 0) return null;
  if (!text(receipt.provenanceRef, '')) return null;
  if (!Number.isFinite(Number(receipt.catalogRevision)) || Number(receipt.catalogRevision) < 0) return null;
  return receipt;
}

/**
 * Bounded revision selector for one evidence page. Accepts up to
 * SHIP_LEDGER_EVIDENCE_MAX_REVISIONS candidate receipts, validates each, and selects the highest
 * valid revision independent of array order. Byte-equivalent winners collapse to one; same-revision
 * winners that differ are a conflict (no winner, diagnostic emitted).
 * @returns {{ winner: object|null, conflict: boolean, diagnostic: object|null }}
 */
export function selectEvidenceWinner(candidates) {
  const input = Array.isArray(candidates) ? candidates.slice(0, SHIP_LEDGER_EVIDENCE_MAX_REVISIONS) : [];
  const valid = [];
  for (const candidate of input) {
    const receipt = validEvidenceCandidate(candidate);
    if (receipt) valid.push(receipt);
  }
  if (!valid.length) return { winner: null, conflict: false, diagnostic: null };
  // Highest valid revision, independent of arrival/array order.
  let top = valid[0];
  for (const receipt of valid) if (finiteInt(receipt.revision) > finiteInt(top.revision)) top = receipt;
  const topRevision = finiteInt(top.revision);
  const winners = valid.filter((receipt) => finiteInt(receipt.revision) === topRevision);
  // Collapse byte-equivalent duplicate winners to one.
  const firstKey = evidenceCandidateKey(winners[0]);
  const allEquivalent = winners.every((receipt) => evidenceCandidateKey(receipt) === firstKey);
  if (!allEquivalent) {
    return {
      winner: null,
      conflict: true,
      diagnostic: {
        pageId: text(top.pageId, ''),
        revision: topRevision,
        candidateCount: winners.length,
        reason: 'same-revision-conflict',
      },
    };
  }
  return { winner: winners[0], conflict: false, diagnostic: null };
}

/**
 * Direct-keyed collector over the Cathedral evidence receipts. Reads one site record by stable id
 * and the immutable catalog; writes neither. Returns validated winners plus conflict diagnostics.
 * Identity is pageId only — a higher accepted revision updates the same row.
 */
export function collectWreckCathedralEvidence(state) {
  const sites = state && state.sites;
  const worldById = sites && isRecord(sites.worldById) ? sites.worldById : null;
  const site = worldById && isRecord(worldById[SHIP_LEDGER_EVIDENCE_SITE_ID])
    ? worldById[SHIP_LEDGER_EVIDENCE_SITE_ID] : null;
  const map = site && isRecord(site.evidenceReceiptsByPageId) ? site.evidenceReceiptsByPageId : {};
  const winners = [];
  const conflicts = [];
  for (const pageId of WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS) {
    const receipt = map[pageId];                 // direct property lookup, no scan
    const candidates = receipt ? [receipt] : []; // at most one per page (defensive)
    const result = selectEvidenceWinner(candidates);
    if (result.conflict) { conflicts.push(result.diagnostic); continue; }
    if (!result.winner) continue;
    const catalog = wreckCathedralEvidenceCatalogEntry(pageId, finiteInt(result.winner.catalogRevision));
    if (!catalog) continue;                       // catalog revision mismatch → not presentable
    winners.push({ pageId, receipt: result.winner, catalog });
  }
  return { winners, conflicts };
}

export function volsLedgerGateOpen(state) {
  const story = state && state.story || {};
  const flags = story.flags && typeof story.flags === 'object' ? story.flags : {};
  const beatOpen = finite(story.beatIndex, 0) >= VOLS_ANNOTATION_BEAT_GATE;
  if (!beatOpen) return false;
  if (flags.volsEchoUnlocked || flags.volsBlackBoxRecovered || flags.volsMaydayGhost
    || flags.volsLetterRead || flags.volsLetterCarried || flags.volsHandGraffiti) return true;
  const completed = story.depthProgramEncounters && story.depthProgramEncounters.completed;
  return !!(completed && (completed.depth_h1_distress_from_inside || completed.depth_h3_wreck_that_knows_you));
}

function recoveredNames(state) {
  const story = state && state.story || {};
  // G6/Senna is an upstream dependency. Accept one explicit future durable receipt contract rather
  // than guessing across generic story/player flags, where an unrelated boolean or display string
  // could make the ledger claim Senna recovered a name she never did.
  const candidates = sourceArray(story.recoveredNames);
  const out = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const name = typeof candidate === 'string' ? candidate : candidate && candidate.name;
    const clean = text(name, '');
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    out.push(typeof candidate === 'object' ? candidate : { name: clean });
  }
  return out;
}

function titleRecords(state) {
  const story = state && state.story || {};
  // S4/Thunderchild is also upstream. The future title owner gets one durable receipt array; the
  // projector must not infer a sighting from ad-hoc flags or a similarly named player property.
  return [...sourceArray(story.titlesSeen)].sort((a, b) => {
    const at = (record) => typeof record === 'object' && record
      ? finite(record.seenAt == null ? record.at : record.seenAt, 0)
      : 0;
    return at(b) - at(a);
  });
}

function tradeReceiptBase(entry, side) {
  return `trade:${entry.seenAt || 0}:${entry.stationId || ''}:${entry.commodityId || ''}`
    + `:${side}:${entry.qty || 0}:${entry.total || 0}`;
}

function makeCandidate(seed, input, gateOpen) {
  const sourceId = text(input.sourceId, `${input.type}:unknown`);
  const template = templateFor(seed, input.type, sourceId);
  const annotationTemplate = gateOpen && input.aboutPreviousCrew
    ? volsAnnotationFor(seed, sourceId)
    : null;
  const at = Math.max(0, finite(input.at, 0));
  const candidate = {
    id: `ledger_${hash32(seed, input.type, sourceId).toString(36)}`,
    schemaVersion: SHIP_LEDGER_SCHEMA_VERSION,
    type: input.type,
    sourceId,
    sourceKind: input.sourceKind || input.type,
    at,
    cycle: cycleOf(at),
    cycleLabel: formatLedgerCycle(at),
    templateId: template.id,
    text: fillTemplate(template.text, input.tokens || {}),
    hand: annotationTemplate ? 'vols' : 'captain',
    annotationId: annotationTemplate && annotationTemplate.id || null,
    annotation: annotationTemplate && annotationTemplate.text || null,
  };
  if (input.type === 'loss') candidate.playerCaused = input.playerCaused === true;
  return candidate;
}

function collectCandidates(state) {
  const candidates = [];
  const seen = new Set();
  const seed = finite(state && state.meta && state.meta.seed, 1) >>> 0 || 1;
  const gateOpen = volsLedgerGateOpen(state);
  let observed = 0;
  const add = (input) => {
    observed++;
    if (!input || !SHIP_LEDGER_TEMPLATES[input.type] || observed > SHIP_LEDGER_MAX_SOURCE_RECORDS) return;
    const candidate = makeCandidate(seed, input, gateOpen);
    if (seen.has(candidate.id)) return;
    seen.add(candidate.id);
    candidates.push(candidate);
  };

  for (const entry of sourceArray(state && state.lossLedger && state.lossLedger.entries)) {
    if (!entry) continue;
    add({
      type: 'loss',
      sourceId: entry.lossId || `${entry.source || 'loss'}:${entry.assetId || ''}:${entry.t || 0}`,
      sourceKind: entry.source || 'lossLedger',
      at: entry.t,
      playerCaused: entry.killedByPlayer === true,
      tokens: {
        ship: shipName(entry),
        sector: sectorName(entry.sectorId),
        cargo: humanizeId(entry.cargoHint, 'the listed cargo'),
      },
    });
  }

  const tradeLedger = sourceArray(state && state.player && state.player.tradeLedger);
  // The live economy ledger predates receipt ids. Count identical rows oldest-first so two UI
  // actions in one fixed sim tick remain two receipts instead of collapsing at the projection seam.
  // A future canonical receiptId wins immediately without changing this reader.
  const tradeOccurrenceByIndex = new Map();
  const tradeOccurrenceCounts = new Map();
  for (let index = tradeLedger.length - 1; index >= 0; index--) {
    const entry = tradeLedger[index];
    if (!entry) continue;
    const side = entry.side === 'sell' ? 'sell' : 'buy';
    const base = tradeReceiptBase(entry, side);
    const occurrence = (tradeOccurrenceCounts.get(base) || 0) + 1;
    tradeOccurrenceCounts.set(base, occurrence);
    tradeOccurrenceByIndex.set(index, occurrence);
  }
  for (const [index, entry] of tradeLedger.entries()) {
    if (!entry) continue;
    const side = entry.side === 'sell' ? 'sell' : 'buy';
    const base = tradeReceiptBase(entry, side);
    const receiptIdentity = text(entry.receiptId, '')
      || `${base}:occurrence-${tradeOccurrenceByIndex.get(index) || 1}`;
    add({
      type: 'trade',
      sourceId: receiptIdentity,
      sourceKind: 'player.tradeLedger',
      at: entry.seenAt,
      tokens: {
        verb: side === 'sell' ? 'Sold' : 'Bought',
        verbPast: side === 'sell' ? 'sold' : 'bought',
        qty: Math.max(0, Math.floor(finite(entry.qty, 0))),
        commodity: commodityName(entry.commodityId),
        station: stationName(entry.stationId),
        credits: Math.round(Math.abs(finite(entry.total, 0))).toLocaleString('en-US'),
      },
    });
  }

  const bearings = sourceObjectValues(state && state.player && state.player.uniqueWrecks
    && state.player.uniqueWrecks.bearings);
  for (const record of bearings) {
    if (!record || !record.wreckId) continue;
    const def = uniqueWreckById(record.wreckId);
    const wreck = record.name || def && def.name || humanizeId(record.wreckId, 'an unnamed wreck');
    const sector = sectorName(record.sectorId || def && def.sectorId);
    add({
      type: 'rumor',
      sourceId: `rumor:${record.wreckId}:${record.sourceRef || ''}`,
      sourceKind: record.channelId || 'uniqueWreck.rumor',
      at: record.heardAtS,
      tokens: { wreck, sector, source: humanizeId(record.sourceRef || record.channelId, 'an unnamed source') },
    });
    if (record.fixedAtS != null || ['fixed', 'decision', 'salvaged'].includes(record.phase)) {
      add({
        type: 'bearing',
        sourceId: `bearing:${record.wreckId}`,
        sourceKind: 'uniqueWreck.bearing',
        at: record.fixedAtS == null ? record.heardAtS : record.fixedAtS,
        tokens: { wreck, sector, radius: Math.max(0, Math.round(finite(record.radius, 0))) },
      });
    }
    if (record.phase === 'salvaged' || record.salvagedAtS != null || record.rewardReceipt) {
      add({
        type: 'unique',
        sourceId: `unique:${record.wreckId}:${record.choiceId || 'resolved'}`,
        sourceKind: 'uniqueWreck.salvaged',
        at: record.salvagedAtS == null ? record.resolvedAtS : record.salvagedAtS,
        tokens: {
          wreck,
          choice: humanizeId(record.choiceId, 'a choice kept off the public file'),
          outcome: humanizeId(record.outcome, 'settled'),
        },
      });
    }
  }

  // PQ-142.01 — the hull the player is flying reads its own history into the same archive. The
  // living-hull record is durable and owned by systems/ships.js; this projector only reads it, and
  // it reads the ACTIVE berth so the page is about the ship under you, not a hull in storage.
  const activeHull = activeOwnedShip(state);
  if (activeHull) {
    const identity = activeHullIdentity(state);
    const hullName = identity && identity.name || 'this hull';
    for (const scar of livingHullScars(activeHull.livingHull)) {
      const patched = scar.patchedAtT != null;
      add({
        type: patched ? 'patch' : 'scar',
        sourceId: `${patched ? 'patch' : 'scar'}:${scar.id}`,
        sourceKind: 'player.livingHull.scars',
        at: patched ? scar.patchedAtT : scar.atT,
        tokens: {
          band: SCAR_BAND_PHRASE[scar.band] || 'marked',
          facing: scar.facing,
          what: SCAR_SURFACE_PHRASE[scar.surface] || SCAR_SURFACE_PHRASE.other,
        },
      });
    }
    for (const act of livingHullRenown(activeHull.livingHull)) {
      add({
        type: 'renown',
        sourceId: `renown:${act.id}`,
        sourceKind: 'player.livingHull.renown',
        at: act.atT,
        tokens: {
          ship: hullName,
          faction: factionName(act.factionId),
          sector: sectorName(act.sectorId),
        },
      });
    }
  }

  const vestaCache = state && state.world && state.world.vestaOreCache;
  const vestaReceipt = vestaCache && vestaCache.receipt;
  if (vestaReceipt && vestaReceipt.id && vestaCache.recordId) {
    add({
      type: 'unique',
      sourceId: vestaReceipt.id,
      sourceKind: 'world.vestaOreCache',
      at: vestaReceipt.resolvedAt,
      tokens: {
        wreck: 'Shift-End Ore Cache',
        choice: humanizeId(vestaReceipt.choiceId, 'recorded'),
        outcome: humanizeId(vestaReceipt.outcome, 'recorded'),
      },
    });
  }

  const pallasCache = state && state.world && state.world.pallasHiddenCache;
  const pallasReceipt = pallasCache && pallasCache.receipt;
  if (pallasReceipt && pallasReceipt.id && pallasCache.recordId) {
    add({
      type: 'unique',
      sourceId: pallasReceipt.id,
      sourceKind: 'world.pallasHiddenCache',
      at: pallasReceipt.resolvedAt,
      tokens: {
        wreck: 'Black-Wake Weapons Cache',
        choice: humanizeId(pallasReceipt.choiceId, 'recorded'),
        outcome: humanizeId(pallasReceipt.outcome, 'recorded'),
      },
    });
  }

  const encounterHistory = sourceArray(state && state.story && state.story.depthProgramEncounters
    && state.story.depthProgramEncounters.history);
  for (const [index, record] of encounterHistory.entries()) {
    if (!record || !record.shapeId) continue;
    add({
      type: 'witness',
      sourceId: `witness:${record.shapeId}:${record.tick == null ? index : record.tick}:${record.outcome || ''}`,
      sourceKind: 'story.depthProgramEncounters',
      at: record.at,
      aboutPreviousCrew: PREVIOUS_CREW_ENCOUNTERS.has(record.shapeId),
      tokens: {
        event: ENCOUNTER_TITLES[record.shapeId] || humanizeId(record.shapeId, 'an unfiled encounter'),
        outcome: humanizeId(record.outcome, 'unresolved'),
      },
    });
  }

  // Named dead are the smallest and most important receipt family. Project them before the future
  // title stream so a long succession history cannot starve Senna's recovered name at the source cap.
  for (const record of recoveredNames(state)) {
    add({
      type: 'name',
      sourceId: `senna-name:${record.id || record.name}`,
      sourceKind: 'story.recoveredNames',
      at: record.recoveredAt == null ? record.at : record.recoveredAt,
      tokens: { name: text(record.name, 'an unnamed dead') },
    });
  }

  for (const record of titleRecords(state)) {
    const title = typeof record === 'string' ? record : record && (record.title || record.name);
    if (!title) continue;
    add({
      type: 'title',
      sourceId: `title:${typeof record === 'object' && record.id || title}`,
      sourceKind: 'story.titlesSeen',
      at: typeof record === 'object' ? record.seenAt == null ? record.at : record.seenAt : 0,
      tokens: { title: text(title) },
    });
  }

  // Five physically earned Cathedral evidence pages, projected as witness-type rows carrying an
  // immutable evidencePage detail. Identity is pageId only; a higher accepted revision updates the
  // same row. The collector reads the durable receipt map and the catalog; it writes neither.
  const evidence = collectWreckCathedralEvidence(state);
  for (const item of evidence.winners) {
    const at = Math.max(0, finite(item.receipt.earnedAtS, 0));
    const pageId = item.pageId;
    candidates.push({
      id: `ledger_evidence_${pageId}`,
      schemaVersion: SHIP_LEDGER_SCHEMA_VERSION,
      type: 'witness',
      sourceId: pageId,
      sourceKind: 'worldSite.evidence',
      at,
      cycle: cycleOf(at),
      cycleLabel: formatLedgerCycle(at),
      templateId: `evidence.${pageId}`,
      text: item.catalog.title,
      hand: 'captain',
      annotationId: null,
      annotation: null,
      evidencePage: {
        pageId,
        revision: item.catalog.revision,
        title: item.catalog.title,
        fragment: item.catalog.fragment,
        body: item.catalog.body,
        provenanceRef: item.catalog.provenanceRef,
        mapRef: item.catalog.mapRef,
        media: item.catalog.media,
        earnedTick: finiteInt(item.receipt.earnedTick),
        earnedAtS: at,
      },
    });
    observed++;
  }

  candidates.sort((a, b) => b.at - a.at || b.cycle - a.cycle || a.id.localeCompare(b.id));
  return { candidates, observed, gateOpen, evidenceConflicts: evidence.conflicts };
}

function quoteCandidates(entries, enabled) {
  if (!enabled) return [];
  return entries
    .filter((entry) => entry.type !== 'trade' && entry.type !== 'rumor')
    .slice(0, 4)
    .map((entry) => ({
      id: `ledger-quote:${entry.id}`,
      sourceEntryId: entry.id,
      set: 'ledger_quote',
      text: entry.text.toUpperCase(),
    }));
}

/**
 * Build one bounded ledger page without writing to `state` or any source slice.
 * Page 0 is newest; older entries live in archive pages. The UI never receives more than 24 rows.
 */
export function buildShipLedger(state, options = {}) {
  const pageSize = boundedInt(options.pageSize, 1, SHIP_LEDGER_MAX_PAGE_SIZE, SHIP_LEDGER_PAGE_SIZE);
  const { candidates, observed, gateOpen, evidenceConflicts } = collectCandidates(state || {});
  const bounded = candidates.slice(0, SHIP_LEDGER_MAX_ENTRIES);
  const pageCount = Math.max(1, Math.ceil(bounded.length / pageSize));
  const page = boundedInt(options.page, 0, pageCount - 1, 0);
  const start = page * pageSize;
  const story = state && state.story || {};
  const flags = story.flags && typeof story.flags === 'object' ? story.flags : {};
  const endgameOpen = !!(story.endgameResolved || story.endgameChoice || flags.sandboxContinued);
  return deepFreeze({
    schemaVersion: SHIP_LEDGER_SCHEMA_VERSION,
    page,
    pageSize,
    pageCount,
    total: bounded.length,
    observed,
    archiveCount: Math.max(0, bounded.length - pageSize),
    truncatedCount: Math.max(0, observed - bounded.length),
    hasNewer: page > 0,
    hasOlder: page + 1 < pageCount,
    volsAnnotationOpen: gateOpen,
    entries: bounded.slice(start, start + pageSize),
    evidenceConflicts,
    endgameQuotes: quoteCandidates(bounded, endgameOpen),
  });
}

export function shipLedgerGraffitiQuotes(state) {
  return buildShipLedger(state, { page: 0, pageSize: SHIP_LEDGER_MAX_PAGE_SIZE }).endgameQuotes;
}

export default buildShipLedger;
