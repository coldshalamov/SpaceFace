// A2 Ship's Ledger — pure, read-only projection over existing durable receipts, plus the row-444
// player-authored evidence board.
//
// The page projection still has no registry slot, init(), event subscriptions, or hidden writes:
// source systems remain the sole writers of everything it reads. Dock UI asks for a page and
// receives a deterministic snapshot assembled from loss, trade, wreck, encounter, title, career,
// and recovered-name state that already round-trips through saves.
//
// The one owned slice is `state.shipLedger.board` — the GOLD-LEDGER case board the player builds
// deliberately: `pins` (ordered evidence pageIds) and `links` ([a,b] unordered pairs). It is
// created lazily by the owner APIs at the bottom of this file and exists on no untouched run.

import { hash32 } from '../core/rng.js';
import { livingHullScars, livingHullRenown } from '../core/livingHull.js';
import { activeHullIdentity, activeOwnedShip } from '../data/hullIdentity.js';
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { SECTORS } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';
import { uniqueWreckById } from '../data/uniqueWrecks.js';
import { stuntAccountFor } from '../combat/stuntWitnesses.js';
import { peekDeedRecord } from './deedRecord.js';
import { deedLine } from '../data/deedPhrases.js';
import {
  SHIP_LEDGER_TEMPLATES,
  VOLS_LEDGER_ANNOTATIONS,
} from '../data/shipLedgerTemplates.js';
import {
  WRECK_CATHEDRAL_EVIDENCE_CATALOG,
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

const SESSION_SINK_EVENT = Object.freeze({
  repair: 'a repair',
  fine: 'a fine',
  insurance: 'hull insurance',
  restitution: 'restitution',
  impound: 'an impound',
  toll: 'a toll',
});

function sessionSinkEventPhrase(kind) {
  return SESSION_SINK_EVENT[kind] || 'a debit';
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
  if (input.trickId) candidate.trickId = input.trickId;
  if (input.stuntDetail) candidate.stuntDetail = input.stuntDetail;
  if (input.tokens) candidate.tokens = { ...input.tokens };
  if (input.cause) candidate.cause = text(input.cause, '');
  if (input.beat) candidate.beat = text(input.beat, '');
  return candidate;
}

function collectCandidates(state, options = {}) {
  const candidates = [];
  const seen = new Set();
  // PQ-207.00 — presence mode. The dock berth asks "does the ledger hold a fact that is not hull
  // history?" on the station's 18-frame refresh. A probe walks the same sources under the same
  // admission rules and stops at the first admitted row outside `exclude`: no candidate objects,
  // no page, and prose paid for at most the row that answers. Read-only, like every other path.
  const probe = options.probe && options.probe.exclude instanceof Set
    ? { exclude: options.probe.exclude, hit: false, done: false }
    : null;
  const seed = finite(state && state.meta && state.meta.seed, 1) >>> 0 || 1;
  const gateOpen = volsLedgerGateOpen(state);
  let observed = 0;
  const add = (input) => {
    observed++;
    if (!input || !SHIP_LEDGER_TEMPLATES[input.type] || observed > SHIP_LEDGER_MAX_SOURCE_RECORDS) return;
    if (probe) {
      if (!probe.exclude.has(input.type)) { probe.hit = true; probe.done = true; }
      return;
    }
    const candidate = makeCandidate(seed, input, gateOpen);
    if (seen.has(candidate.id)) return;
    seen.add(candidate.id);
    candidates.push(candidate);
  };
  // A probe answers as soon as it has a hit: no later source can un-file a fact, and the page
  // fields a probe never reads stay empty rather than being paid for.
  const probeResult = () => ({
    candidates,
    observed,
    gateOpen,
    evidenceConflicts: [],
    probeHit: probe.hit,
  });

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
    if (probe && probe.done) return probeResult();
  }

  const tradeLedger = sourceArray(state && state.player && state.player.tradeLedger);
  // The live economy ledger predates receipt ids. Count identical rows oldest-first so two UI
  // actions in one fixed sim tick remain two receipts instead of collapsing at the projection seam.
  // A future canonical receiptId wins immediately without changing this reader. Presence mode needs
  // no occurrence suffix, so the pre-pass does not run there.
  const tradeOccurrenceByIndex = new Map();
  const tradeOccurrenceCounts = new Map();
  if (!probe) {
    for (let index = tradeLedger.length - 1; index >= 0; index--) {
      const entry = tradeLedger[index];
      if (!entry) continue;
      const side = entry.side === 'sell' ? 'sell' : 'buy';
      const base = tradeReceiptBase(entry, side);
      const occurrence = (tradeOccurrenceCounts.get(base) || 0) + 1;
      tradeOccurrenceCounts.set(base, occurrence);
      tradeOccurrenceByIndex.set(index, occurrence);
    }
  }
  for (const [index, entry] of tradeLedger.entries()) {
    if (!entry) continue;
    const side = entry.side === 'sell' ? 'sell' : 'buy';
    const base = tradeReceiptBase(entry, side);
    const receiptIdentity = text(entry.receiptId, '')
      || (probe ? base : `${base}:occurrence-${tradeOccurrenceByIndex.get(index) || 1}`);
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
    if (probe && probe.done) return probeResult();
  }

  // PQ-155.02 — session sinks are durable economy receipts. This projector only reads them.
  // Explicit paid-for copy (not the witness bank) so a debit does not read as an encounter.
  for (const record of sourceArray(state && state.player && state.player.sessionSinks)) {
    if (!record) continue;
    const kind = text(record.kind, '');
    const cause = text(record.cause, '');
    if (!kind || !cause) continue;
    // A session sink is a witness fact by construction: presence answers on the row itself,
    // before the receipt below is built.
    if (probe) {
      observed++;
      if (observed <= SHIP_LEDGER_MAX_SOURCE_RECORDS && !probe.exclude.has('witness')) {
        probe.hit = true;
        probe.done = true;
        return probeResult();
      }
      continue;
    }
    const sourceId = text(record.id, `sink:${kind}:${record.at || 0}:${record.reason || ''}`);
    const at = Math.max(0, finite(record.at, 0));
    const credits = Math.round(Math.abs(finite(record.amount, 0))).toLocaleString('en-US');
    const event = sessionSinkEventPhrase(kind);
    const candidate = {
      id: `ledger_${hash32(seed, 'witness', sourceId).toString(36)}`,
      schemaVersion: SHIP_LEDGER_SCHEMA_VERSION,
      type: 'witness',
      sourceId,
      sourceKind: 'player.sessionSinks',
      at,
      cycle: cycleOf(at),
      cycleLabel: formatLedgerCycle(at),
      templateId: `sink.${kind}`,
      text: `Paid ${credits} cr for ${event} because of the ${cause}.`,
      hand: 'captain',
      annotationId: null,
      annotation: null,
      cause,
      beat: kind,
      tokens: {
        event,
        outcome: `because of the ${cause}`,
        cause,
        beat: kind,
        credits,
      },
    };
    observed++;
    if (observed > SHIP_LEDGER_MAX_SOURCE_RECORDS || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    candidates.push(candidate);
  }

  // FB-014 — stunt-minted salvage rights and their claims are durable economy receipts in
  // player.salvageRightsLog (stuntGrammar is the single writer); this projector only reads
  // them, exactly like the session sinks above. The prose is the ledger's own 'salvage' bank.
  if (sourceArray(state && state.player && state.player.salvageRightsLog).length) {
    const playerEntity = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    const salvageShip = text(playerEntity && playerEntity.data && playerEntity.data.shipName,
      'the hull');
    for (const record of sourceArray(state.player.salvageRightsLog)) {
      if (!record || (record.kind !== 'mint' && record.kind !== 'claim')) continue;
      const claimed = record.kind === 'claim';
      const sourceId = text(record.id, `salvage:${record.kind}:${record.at || 0}`);
      add({
        type: 'salvage',
        sourceId,
        sourceKind: 'player.salvageRightsLog',
        at: record.at,
        tokens: {
          ship: salvageShip,
          rights: Math.max(0, Math.floor(finite(record.amount, 0))),
          trick: text(record.name || record.trickId, 'a stunt'),
          verb: claimed ? 'redeemed' : 'minted',
          verbPast: claimed ? 'redeemed' : 'minted',
        },
      });
    }
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
    if (probe && probe.done) return probeResult();
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
      if (probe && probe.done) return probeResult();
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
      if (probe && probe.done) return probeResult();
    }
    if (probe && probe.done) return probeResult();
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
    if (probe && probe.done) return probeResult();
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
    if (probe && probe.done) return probeResult();
  }

  const escalationSeeds = sourceArray(state && state.encounterDirector && state.encounterDirector.escalationSeeds);
  for (const record of escalationSeeds) {
    if (!record || !record.cause || !record.beat) continue;
    const placeName = record.place && (record.place.name || record.place.zoneId || record.place.stationId)
      || 'a named place';
    add({
      type: 'witness',
      sourceId: `escalation:${record.id || record.causeId || record.cause}`,
      sourceKind: 'encounterDirector.escalationSeeds',
      at: record.arrivedAt != null ? record.arrivedAt : record.seededAt,
      cause: record.cause,
      beat: record.beat,
      tokens: {
        event: `a ${record.beat} from ${placeName}`,
        outcome: `because of the ${record.cause}`,
        cause: record.cause,
        beat: record.beat,
      },
    });
    if (probe && probe.done) return probeResult();
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
    if (probe && probe.done) return probeResult();
  }

  // FB-127 — career origin and ladder decisions are already durable story facts (the story owner
  // records them off the career outcome events); the ledger projects each fact as its own row so
  // the ship's record keeps the road taken and the road declined beside the rest of the hull's
  // history. Offered-then-declined shares one fact id, so it reads as one "road not taken" line.
  for (const fact of sourceArray(state && state.story && state.story.facts)) {
    if (!fact || fact.kind !== 'career') continue;
    const factId = text(fact.id, '');
    if (!factId) continue;
    add({
      type: 'career',
      sourceId: `career:${factId}`,
      sourceKind: 'story.facts.career',
      at: fact.atS,
      tokens: {
        career: humanizeId(factId.split(':')[1], 'an unnamed career'),
        record: text(fact.text, 'a decision kept on file'),
        citation: text(fact.citation, ''),
      },
    });
    if (probe && probe.done) return probeResult();
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
    if (probe && probe.done) return probeResult();
  }

  const stuntIncidents = sourceArray(state && state.story && state.story.titles
    && state.story.titles.stuntIncidents);
  for (const record of stuntIncidents) {
    if (!record || record.id == null) continue;
    const account=stuntAccountFor(record);
    const names=record.witnessNames||(record.witnesses||[]).filter(w=>w.sourceTicks>=6&&w.transferTicks>=6&&w.payoffTicks>=6).map(w=>text(w.name,'unnamed observer'));
    const evidence=record.visibility==='reported'
      ? `report delivered to ${(record.reportedNetworks||[]).map(n=>text(n)).join(', ') || 'a recorded network'}`
      : record.visibility==='witnessed'?`locally witnessed${names.length?` by ${names.join(', ')}`:''}; no delivered public report`
      : 'private recording; no independent witness';
    add({
      type: 'stunt',
      sourceId: `stunt:${record.id}`,
      sourceKind: 'story.titles.stuntIncidents',
      at: record.tick != null ? record.tick / 60 : record.at,
      trickId: record.trickId,
      stuntDetail: { incidentId:record.id,rootId:record.rootId,pilotId:record.pilotId,shipId:record.shipId,
        visibility:record.visibility,chain:record.chain||[],witnesses:record.witnesses||[],reports:record.reports||[],
        titleIds:record.titleIds||[],barkStatus:record.barkStatus||'unqualified',detailRetained:record.detailRetained!==false },
      tokens: {
        ship: text(record.shipName, 'the ship'),
        trick: text(record.name || record.trickId, 'a stunt'),
        target: text(record.targetName, 'the target'),
        outcome: text(record.outcome, 'faced the consequences'),
        account,
        sector: sectorName(record.sectorId),
        evidence,
      },
    });
    if (probe && probe.done) return probeResult();
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
      trickId: record && record.trickId,
    });
    if (probe && probe.done) return probeResult();
  }

  // Five physically earned Cathedral evidence pages, projected as witness-type rows carrying an
  // immutable evidencePage detail. Identity is pageId only; a higher accepted revision updates the
  // same row. The collector reads the durable receipt map and the catalog; it writes neither.
  const evidence = collectWreckCathedralEvidence(state);
  for (const item of evidence.winners) {
    const at = Math.max(0, finite(item.receipt.earnedAtS, 0));
    const pageId = item.pageId;
    if (probe) {
      observed++;
      if (observed <= SHIP_LEDGER_MAX_SOURCE_RECORDS && !probe.exclude.has('witness')) {
        probe.hit = true;
        probe.done = true;
        return probeResult();
      }
      continue;
    }
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

  // Row-444 Verge/Vale evidence pages — three facts the player earns deliberately (Kell burn,
  // Archive reading-room file, Kurtz desk ledger). Same witness shape as the Cathedral rows so
  // the archive leaf and the board treat them identically. The durable flag is the receipt;
  // the recorded story fact supplies the timestamp.
  for (const page of SHIP_LEDGER_VERGE_EVIDENCE_PAGES) {
    if (!vergeEvidenceEarned(state, page.vergeKey)) continue;
    const facts = sourceArray(state.story && state.story.facts);
    const fact = facts.find((row) => row && row.id === `verge:${page.vergeKey}`);
    const at = Math.max(0, finite(fact && fact.atS, 0));
    if (probe) {
      observed++;
      if (observed <= SHIP_LEDGER_MAX_SOURCE_RECORDS && !probe.exclude.has('witness')) {
        probe.hit = true;
        probe.done = true;
        return probeResult();
      }
      continue;
    }
    candidates.push({
      id: `ledger_evidence_${page.pageId}`,
      schemaVersion: SHIP_LEDGER_SCHEMA_VERSION,
      type: 'witness',
      sourceId: page.pageId,
      sourceKind: 'story.verge',
      at,
      cycle: cycleOf(at),
      cycleLabel: formatLedgerCycle(at),
      templateId: `evidence.${page.pageId}`,
      text: page.title,
      hand: 'captain',
      annotationId: null,
      annotation: null,
      evidencePage: {
        pageId: page.pageId,
        revision: 1,
        title: page.title,
        fragment: page.fragment,
        body: page.body,
        provenanceRef: page.provenanceRef,
        mapRef: null,
        media: null,
        earnedTick: 0,
        earnedAtS: at,
      },
    });
    observed++;
  }

  // Row-444 clue-contradiction pages — a scanner subject becomes an evidence page only once its
  // real history carries a 'contradicted' superseded reading. A filed claim alone stays a lead.
  for (const { subjectId, subject, contradicted } of contradictedClueSubjects(state)) {
    const pageId = `${SHIP_LEDGER_CLUE_PAGE_PREFIX}${subjectId}`;
    const at = Math.max(0, finite(subject.observedAt, 0));
    if (probe) {
      observed++;
      if (observed <= SHIP_LEDGER_MAX_SOURCE_RECORDS && !probe.exclude.has('witness')) {
        probe.hit = true;
        probe.done = true;
        return probeResult();
      }
      continue;
    }
    const superseded = contradicted.map((entry) => `“${text(entry.claim, 'unfiled claim')}”`).join('; ');
    candidates.push({
      id: `ledger_evidence_${pageId}`,
      schemaVersion: SHIP_LEDGER_SCHEMA_VERSION,
      type: 'witness',
      sourceId: pageId,
      sourceKind: 'signalInvestigation.clues',
      at,
      cycle: cycleOf(at),
      cycleLabel: formatLedgerCycle(at),
      templateId: `evidence.${pageId}`,
      text: `Contradicted reading — ${text(subject.claim, 'filed claim')}`,
      hand: 'captain',
      annotationId: null,
      annotation: null,
      evidencePage: {
        pageId,
        revision: 1,
        title: `Contradicted reading — ${text(subject.claim, 'filed claim')}`,
        fragment: 'A later reading contradicts the filed claim.',
        body: `Filed claim: “${text(subject.claim, 'unfiled claim')}”. Superseded readings: ${superseded}.`,
        provenanceRef: `signalInvestigation.clues/${subjectId}`,
        mapRef: null,
        media: null,
        earnedTick: 0,
        earnedAtS: at,
      },
    });
    observed++;
  }

  candidates.sort((a, b) => b.at - a.at || b.cycle - a.cycle || a.id.localeCompare(b.id));
  return { candidates, observed, gateOpen, evidenceConflicts: evidence.conflicts, probeHit: probe ? probe.hit : false };
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

// PQ-149.03 — story so far. Pure sentence over receipts already on the page: rhythm (what you
// were doing), the first cited escalation beat (what arrived), and the cause token 149.01 already
// files as `because of the ${cause}`. No writer. No dialogue tree.
const STORY_SO_FAR_PHASES = Object.freeze([
  'work', 'travel', 'curiosity', 'opportunity', 'tension', 'violence', 'aftermath', 'quiet',
]);
const STORY_SO_FAR_DOING = Object.freeze({
  work: 'ordinary work',
  travel: 'travel',
  curiosity: 'looking around',
  opportunity: 'chasing an opening',
  tension: 'holding tension',
  violence: 'fighting',
  aftermath: 'the aftermath',
  quiet: 'quiet work',
});

function storyPhaseName(value) {
  return STORY_SO_FAR_PHASES.includes(value) ? value : '';
}

function rhythmPhaseOf(state) {
  if (!isRecord(state)) return '';
  const direct = isRecord(state.sessionRhythm) ? state.sessionRhythm : null;
  const nested = isRecord(state.encounterDirector) && isRecord(state.encounterDirector.sessionRhythm)
    ? state.encounterDirector.sessionRhythm
    : null;
  if (direct && storyPhaseName(direct.phase)) return direct.phase;
  if (nested && storyPhaseName(nested.phase)) return nested.phase;
  return '';
}

function citedStoryTurns(rows, fromSeed) {
  const out = [];
  for (const row of sourceArray(rows)) {
    if (!row) continue;
    const cause = text(row.cause, '');
    const beat = text(row.beat, '');
    if (!cause || !beat) continue;
    const at = fromSeed
      ? (row.arrivedAt != null ? finite(row.arrivedAt, 0)
        : row.seededAt != null ? finite(row.seededAt, 0)
        : finite(row.at, 0))
      : finite(row.at, 0);
    out.push({ cause, beat, at: Math.max(0, at) });
  }
  return out;
}

export function formatStorySoFarProse(doing, then, so) {
  return `I was doing ${text(doing, 'ordinary work')}, then ${text(then, 'nothing turned')}, so I ${text(so, 'kept the book')}.`;
}

/**
 * Deterministic { doing, then, so, prose } from already-projected receipts.
 * A caller who only has a ledger page or a telemetry ring can use this without the sim.
 */
export function projectStorySoFar(input = {}) {
  const phase = storyPhaseName(input && input.phase) || '';
  let turns = citedStoryTurns(input && input.entries, false);
  if (!turns.length) turns = citedStoryTurns(input && input.escalations, true);
  turns.sort((a, b) => a.at - b.at || a.cause.localeCompare(b.cause) || a.beat.localeCompare(b.beat));
  const turn = turns[0] || null;
  const doing = STORY_SO_FAR_DOING[phase] || STORY_SO_FAR_DOING.work;
  const then = turn ? `a ${turn.beat} arrived` : 'nothing turned';
  const so = turn ? `carry the ${turn.beat} because of the ${turn.cause}` : 'kept the book';
  return {
    doing,
    then,
    so,
    prose: formatStorySoFarProse(doing, then, so),
    phase: phase || 'work',
    cause: turn ? turn.cause : '',
    beat: turn ? turn.beat : '',
  };
}

/**
 * Blind reader: the three retell fields from a ledger page or a story snapshot.
 * Does not read `state` or the sim.
 */
export function readStorySoFar(ledgerOrStory) {
  const story = isRecord(ledgerOrStory) && isRecord(ledgerOrStory.storySoFar)
    ? ledgerOrStory.storySoFar
    : (isRecord(ledgerOrStory) ? ledgerOrStory : null);
  if (!story) return { doing: '', then: '', so: '' };
  return {
    doing: text(story.doing, ''),
    then: text(story.then, ''),
    so: text(story.so, ''),
  };
}

/**
 * Same projection the dock UI calls via `buildShipLedger`. Read-only. No registry slot.
 */
export function renderStorySoFar(state, options = {}) {
  const entries = Array.isArray(options.entries)
    ? options.entries
    : collectCandidates(state || {}).candidates;
  const escalations = Array.isArray(options.escalations)
    ? options.escalations
    : sourceArray(state && state.encounterDirector && state.encounterDirector.escalationSeeds);
  const phase = options.phase != null ? options.phase : rhythmPhaseOf(state);
  return projectStorySoFar({ phase, entries, escalations });
}

/** Read the most repeated deed from the existing bounded record, without adding a new tally. */
export function mostCitedShipDeed(state) {
  const record = peekDeedRecord(state);
  let best = null;
  for (const deed of record && record.deeds || []) {
    if (!deed || !(deed.told > 0)) continue;
    if (!best || deed.told > best.told
      || (deed.told === best.told && (deed.t > best.t
        || (deed.t === best.t && String(deed.id).localeCompare(String(best.id)) < 0)))) best = deed;
  }
  const line = best && deedLine(best, { voice: 'neutral' });
  return line ? { sourceId: best.id, sourceKind: 'story.record.deeds', citations: best.told, text: line } : null;
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
  const storySoFar = renderStorySoFar(state, { entries: bounded });
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
    storySoFar,
    mostCitedDeed: mostCitedShipDeed(state),
  });
}

export function shipLedgerGraffitiQuotes(state) {
  return buildShipLedger(state, { page: 0, pageSize: SHIP_LEDGER_MAX_PAGE_SIZE }).endgameQuotes;
}

/**
 * Cheap presence probe over the same walk `buildShipLedger` uses: true when the ledger holds at
 * least one admitted row whose type is outside `excludeTypes`. The walk stops at the first such
 * row, so a caller on a frame cadence pays for one row, not for a page. Read-only.
 *
 * The dock berth's mechanic asks this every 18 frames (PQ-207.00); building the page there cost
 * ~3.7 ms per refresh on a scarred hull with a traded ledger.
 */
export function shipLedgerHasFactOutside(state, excludeTypes) {
  const exclude = excludeTypes instanceof Set ? excludeTypes : new Set(excludeTypes || []);
  return collectCandidates(state || {}, { probe: { exclude } }).probeHit;
}

// FB-046 — the session-sink roll-up. `player.sessionSinks` is the durable 48-entry record of
// where the money went; the ledger projects each row as a witnessed debit. This is the one-line
// answer "what did this hull cost me lately" — per-kind totals from the same live records the
// entries read, never a second ledger. Read-only.
const SINK_ROLLUP_LABEL = Object.freeze({
  repair: 'repairs',
  fine: 'fines',
  insurance: 'insurance',
  restitution: 'restitution',
  impound: 'impounds',
  toll: 'tolls',
});
export function sessionSinkRollup(state) {
  const sinks = sourceArray(state && state.player && state.player.sessionSinks);
  if (!sinks.length) return null;
  const byKind = new Map();
  let total = 0;
  let count = 0;
  for (const record of sinks) {
    if (!record) continue;
    const kind = text(record.kind, '');
    const amount = Math.round(Math.abs(finite(record.amount, 0)));
    if (!kind || !(amount > 0)) continue;
    const bucket = byKind.get(kind) || { kind, label: SINK_ROLLUP_LABEL[kind] || sessionSinkEventPhrase(kind), amount: 0, count: 0 };
    bucket.amount += amount;
    bucket.count += 1;
    byKind.set(kind, bucket);
    total += amount;
    count += 1;
  }
  if (!(count > 0)) return null;
  return {
    total,
    count,
    byKind: [...byKind.values()].sort((a, b) => b.amount - a.amount || a.kind.localeCompare(b.kind)),
  };
}

/**
 * Neutral fallback for optional module/equipment instance provenance (NXI-126).
 * Legacy owned modules without provenance retain full usability and resolve
 * to a neutral 'unrecorded' fallback — never flagged as stolen or given
 * fabricated acquisition dates or invented legal history.
 */
export function formatInstanceProvenance(instance) {
  if (!instance || typeof instance !== 'object') return 'unrecorded';
  const raw = instance.provenance || instance.provenanceLabel || instance.provenanceRef;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw && typeof raw === 'object') {
    if (typeof raw.label === 'string' && raw.label.trim()) return raw.label.trim();
    if (typeof raw.sourceRef === 'string' && raw.sourceRef.trim()) return raw.sourceRef.trim();
    if (typeof raw.source === 'string' && raw.source.trim()) return raw.source.trim();
  }
  return 'unrecorded';
}

/** Condition readout for a module instance: accepts a word ('worn'), a 0–1 ratio, or a
 *  percent number; returns display text ('62% condition') or '' when absent. */
export function instanceConditionText(condition) {
  if (condition == null || condition === '') return '';
  if (typeof condition === 'string') return condition.trim();
  const n = Number(condition);
  if (!Number.isFinite(n)) return '';
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return pct + '% condition';
}

/**
 * NXI-127 — one-line instance identity for Shipworks detail. Returns '' for an instance
 * with nothing recorded, so ordinary catalog units stay pristine; a recovered or worn unit
 * names itself ('recovered · 62% condition') wherever it is shown — fitted or in the hold.
 * Reads only player-owned instance records: never NPC loadout provenance.
 */
export function instanceIdentityText(instance) {
  if (!instance || typeof instance !== 'object') return '';
  const bits = [];
  const prov = formatInstanceProvenance(instance);
  if (prov !== 'unrecorded') bits.push(prov);
  const cond = instanceConditionText(instance.condition);
  if (cond) bits.push(cond);
  return bits.join(' · ');
}

// ── GOLD-LEDGER (row 444) — the player-authored evidence board ────────────────────────────
//
// `state.shipLedger.board = { pins:[pageId…], links:[[a,b]…] }` is owned here and created lazily:
// the APIs below validate BEFORE `state.shipLedger` exists, so an untouched run never grows the
// key. Pins hold ordered admissible evidence pageIds; links hold canonical [a,b] pairs (sorted,
// deduped). Admissibility is earned-only — a page is pinnable only when a real acquisition route
// already surfaced it as a ledger evidence page:
//   • the five Wreck Cathedral receipts      (collectWreckCathedralEvidence — durable site record)
//   • the three Vale/Verge evidence facts     (state.story.verge.evidence — earned via Kell burn,
//                                             the Archive reading-room file, and the Kurtz desk)
//   • scanner contradiction history           (state.signalInvestigation.clues — a subject whose
//                                             superseded readings hold a 'contradicted' verdict)
// Catalog presence or hidden data alone admits nothing.

export const SHIP_LEDGER_BOARD_SCHEMA_VERSION = 1;
export const SHIP_LEDGER_BOARD_MAX_PINS = 32;
export const SHIP_LEDGER_BOARD_MAX_LINKS = 64;

export const SHIP_LEDGER_BOARD_CASE_CATHEDRAL = 'wreck_cathedral';
export const SHIP_LEDGER_BOARD_CASE_VERGE = 'verge_vale';
export const SHIP_LEDGER_BOARD_CASE_CLUE = 'clue_book';

// The Vale case thread. pageIds are stable, dotted like the Cathedral ids; `vergeKey` is the exact
// evidence flag `_maybeResolveVergeEvidenceTrail` requires (story.js), so the board chain reuses
// that requirement verbatim instead of paraphrasing it.
export const SHIP_LEDGER_VERGE_EVIDENCE_PAGES = Object.freeze([
  Object.freeze({
    pageId: 'verge.kell_paper_trail',
    vergeKey: 'kellPaperTrail',
    caseId: SHIP_LEDGER_BOARD_CASE_VERGE,
    title: 'The Kell Paper Trail',
    fragment: 'A burned contact left a paper trail.',
    body: 'Wraith Kell’s burned paper trail — the payment chain that ends at Director Vale’s office.',
    provenanceRef: 'verge/kellPaperTrail',
  }),
  Object.freeze({
    pageId: 'verge.archive_file',
    vergeKey: 'archiveFile',
    caseId: SHIP_LEDGER_BOARD_CASE_VERGE,
    title: 'The Gate Revocation File',
    fragment: 'A sealed archive file names the gate order.',
    body: 'The Archive reading room’s recovered file — Vale’s own revocation paperwork, filed nowhere official.',
    provenanceRef: 'verge/archiveFile',
  }),
  Object.freeze({
    pageId: 'verge.kurtz_ledger',
    vergeKey: 'kurtzLedger',
    caseId: SHIP_LEDGER_BOARD_CASE_VERGE,
    title: 'The Kurtz Ledger',
    fragment: 'A desk ledger keeps the real counterparties.',
    body: 'The Kurtz figure’s desk ledger — beneficiary, counterparties, and the transponder that ties them.',
    provenanceRef: 'verge/kurtzLedger',
  }),
]);

const SHIP_LEDGER_CLUE_PAGE_PREFIX = 'clue.';

function boardPageId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && !/\s/.test(id) ? id : '';
}

function vergeEvidenceEarned(state, vergeKey) {
  const verge = state && state.story && state.story.verge;
  const evidence = verge && isRecord(verge.evidence) ? verge.evidence : {};
  return evidence[vergeKey] === true;
}

function clueBookSubjects(state) {
  const clues = state && state.signalInvestigation && state.signalInvestigation.clues;
  const subjects = clues && isRecord(clues.subjects) ? clues.subjects : {};
  return subjects;
}

// A clue subject is board-admissible only once its real acquisition history carries a
// 'contradicted' superseded reading — a filed claim alone is a lead, not evidence.
function contradictedClueSubjects(state) {
  const subjects = clueBookSubjects(state);
  const out = [];
  for (const subjectId of Object.keys(subjects)) {
    const subject = subjects[subjectId];
    if (!subject || !text(subject.claim, '')) continue;
    const contradicted = sourceArray(subject.history)
      .filter((entry) => entry && entry.status === 'contradicted' && text(entry.claim, ''));
    if (contradicted.length) out.push({ subjectId, subject, contradicted });
  }
  return out;
}

/**
 * The set of pageIds the board will admit right now: every evidence page a real acquisition route
 * already surfaced. Returns a Map of pageId → { pageId, caseId, title }. Read-only.
 */
export function admissibleLedgerEvidence(state) {
  const out = new Map();
  for (const item of collectWreckCathedralEvidence(state).winners) {
    out.set(item.pageId, {
      pageId: item.pageId,
      caseId: SHIP_LEDGER_BOARD_CASE_CATHEDRAL,
      title: item.catalog.title,
    });
  }
  for (const page of SHIP_LEDGER_VERGE_EVIDENCE_PAGES) {
    if (vergeEvidenceEarned(state, page.vergeKey)) {
      out.set(page.pageId, { pageId: page.pageId, caseId: page.caseId, title: page.title });
    }
  }
  for (const { subjectId, subject } of contradictedClueSubjects(state)) {
    const pageId = `${SHIP_LEDGER_CLUE_PAGE_PREFIX}${subjectId}`;
    out.set(pageId, {
      pageId,
      caseId: SHIP_LEDGER_BOARD_CASE_CLUE,
      title: `Contradicted reading — ${text(subject.claim, 'filed claim')}`,
    });
  }
  return out;
}

// A "known" page id is one the ledger could ever surface — the distinction between an unknown
// pageId (refuse: the ledger knows no such page) and a real page the run simply has not earned
// (refuse: not earned yet). Catalog/verge ids are enumerable; clue pages are open-shaped.
function knownEvidencePageId(pageId) {
  if (Object.hasOwn(WRECK_CATHEDRAL_EVIDENCE_CATALOG, pageId)) return true;
  if (SHIP_LEDGER_VERGE_EVIDENCE_PAGES.some((page) => page.pageId === pageId)) return true;
  if (pageId.startsWith(SHIP_LEDGER_CLUE_PAGE_PREFIX) && pageId.length > SHIP_LEDGER_CLUE_PAGE_PREFIX.length) {
    return true;
  }
  return false;
}

/**
 * The full detail object for one admissible page — the same shape evidence rows carry, so the
 * panel can open a pinned page even when its row lives on another archive leaf. Read-only;
 * returns null for unearned or unknown ids.
 */
export function ledgerEvidenceDetail(state, pageId) {
  const id = boardPageId(pageId);
  if (!id || !admissibleLedgerEvidence(state).has(id)) return null;
  for (const item of collectWreckCathedralEvidence(state).winners) {
    if (item.pageId !== id) continue;
    return {
      pageId: id,
      revision: item.catalog.revision,
      title: item.catalog.title,
      fragment: item.catalog.fragment,
      body: item.catalog.body,
      provenanceRef: item.catalog.provenanceRef,
      mapRef: item.catalog.mapRef,
      media: item.catalog.media,
      earnedTick: finiteInt(item.receipt.earnedTick),
      earnedAtS: Math.max(0, finite(item.receipt.earnedAtS, 0)),
    };
  }
  const vergePage = SHIP_LEDGER_VERGE_EVIDENCE_PAGES.find((page) => page.pageId === id);
  if (vergePage) {
    // The durable timestamp is the recorded story fact (`verge:<key>`), not the flag itself.
    const facts = sourceArray(state && state.story && state.story.facts);
    const fact = facts.find((row) => row && row.id === `verge:${vergePage.vergeKey}`);
    const at = Math.max(0, finite(fact && fact.atS, 0));
    return {
      pageId: vergePage.pageId,
      revision: 1,
      title: vergePage.title,
      fragment: vergePage.fragment,
      body: vergePage.body,
      provenanceRef: vergePage.provenanceRef,
      mapRef: null,
      media: null,
      earnedTick: 0,
      earnedAtS: at,
    };
  }
  if (id.startsWith(SHIP_LEDGER_CLUE_PAGE_PREFIX)) {
    const subjectId = id.slice(SHIP_LEDGER_CLUE_PAGE_PREFIX.length);
    const subject = clueBookSubjects(state)[subjectId];
    if (!subject) return null;
    const contradicted = sourceArray(subject.history)
      .filter((entry) => entry && entry.status === 'contradicted' && text(entry.claim, ''));
    if (!contradicted.length) return null;
    const at = Math.max(0, finite(subject.observedAt, 0));
    const superseded = contradicted.map((entry) => `“${text(entry.claim, 'unfiled claim')}”`).join('; ');
    return {
      pageId: id,
      revision: 1,
      title: `Contradicted reading — ${text(subject.claim, 'filed claim')}`,
      fragment: 'A later reading contradicts the filed claim.',
      body: `Filed claim: “${text(subject.claim, 'unfiled claim')}”. Superseded readings: ${superseded}.`,
      provenanceRef: `signalInvestigation.clues/${subjectId}`,
      mapRef: null,
      media: null,
      earnedTick: 0,
      earnedAtS: at,
    };
  }
  return null;
}

/** Display title for a board chip: admissible title when earned, catalog title when merely known. */
export function ledgerEvidencePageTitle(state, pageId) {
  const id = boardPageId(pageId);
  const admissible = id && admissibleLedgerEvidence(state).get(id);
  if (admissible) return admissible.title;
  const catalog = id && WRECK_CATHEDRAL_EVIDENCE_CATALOG[id];
  if (catalog) return catalog.title;
  const vergePage = id && SHIP_LEDGER_VERGE_EVIDENCE_PAGES.find((page) => page.pageId === id);
  if (vergePage) return vergePage.title;
  return id || 'unfiled page';
}

/** Live board read — never creates the key. Returns null on untouched runs. */
export function shipLedgerBoard(state) {
  const own = state && state.shipLedger;
  const board = own && isRecord(own.board) ? own.board : null;
  if (!board) return null;
  const pins = Array.isArray(board.pins) ? board.pins : [];
  const links = Array.isArray(board.links) ? board.links : [];
  return { pins, links };
}

function ensureLedgerBoard(state) {
  if (!isRecord(state.shipLedger)) state.shipLedger = {};
  if (!isRecord(state.shipLedger.board)) state.shipLedger.board = { pins: [], links: [] };
  if (!Array.isArray(state.shipLedger.board.pins)) state.shipLedger.board.pins = [];
  if (!Array.isArray(state.shipLedger.board.links)) state.shipLedger.board.links = [];
  return state.shipLedger.board;
}

function boardResult(ok, reason) {
  return { ok, reason: ok ? '' : text(reason, 'The ledger refuses that.') };
}

function canonicalLinkPair(a, b) {
  const aId = boardPageId(a);
  const bId = boardPageId(b);
  if (!aId || !bId || aId === bId) return null;
  return aId < bId ? [aId, bId] : [bId, aId];
}

function linkPairEquals(link, pair) {
  return Array.isArray(link) && link.length === 2 && link[0] === pair[0] && link[1] === pair[1];
}

/**
 * Pin one earned evidence page to the board. Refuses with a specific player-facing reason for an
 * unknown pageId, a real page the run has not earned, a duplicate pin, and a full board.
 */
export function pinEvidence(state, pageId) {
  const id = boardPageId(pageId);
  if (!id || !knownEvidencePageId(id)) return boardResult(false, 'The ledger knows no such page.');
  if (!admissibleLedgerEvidence(state).has(id)) {
    return boardResult(false, 'That evidence has not been earned — the board only takes what was actually found.');
  }
  const board = shipLedgerBoard(state);
  if (board && board.pins.includes(id)) return boardResult(false, 'That page is already on the board.');
  if (board && board.pins.length >= SHIP_LEDGER_BOARD_MAX_PINS) {
    return boardResult(false, 'The board is full — unpin something first.');
  }
  ensureLedgerBoard(state).pins.push(id);
  return boardResult(true);
}

/** Remove a pin and every thread tied to it. Refuses when the page is not on the board. */
export function unpinEvidence(state, pageId) {
  const id = boardPageId(pageId);
  if (!id || !knownEvidencePageId(id)) return boardResult(false, 'The ledger knows no such page.');
  const view = shipLedgerBoard(state);
  if (!view || !view.pins.includes(id)) return boardResult(false, 'That page is not on the board.');
  // Mutate the live board — shipLedgerBoard() returns a read view, so reassignments land here.
  const board = state.shipLedger.board;
  board.pins = board.pins.filter((pin) => pin !== id);
  board.links = board.links.filter((link) => !(Array.isArray(link) && (link[0] === id || link[1] === id)));
  return boardResult(true);
}

/**
 * Tie two pinned pages. Refuses (state unchanged) for unknown ids, unearned pages, pages not on
 * the board, a self-link, a duplicate link, and pages that share no case thread.
 */
export function linkEvidence(state, a, b) {
  const aId = boardPageId(a);
  const bId = boardPageId(b);
  if (!aId || !bId) return boardResult(false, 'The ledger knows no such page.');
  if (!knownEvidencePageId(aId) || !knownEvidencePageId(bId)) {
    return boardResult(false, 'The ledger knows no such page.');
  }
  if (aId === bId) return boardResult(false, 'A page cannot tie to itself.');
  const admissible = admissibleLedgerEvidence(state);
  if (!admissible.has(aId) || !admissible.has(bId)) {
    return boardResult(false, 'That evidence has not been earned — the board only takes what was actually found.');
  }
  const board = shipLedgerBoard(state);
  if (!board || !board.pins.includes(aId) || !board.pins.includes(bId)) {
    return boardResult(false, 'Pin both pages to the board first.');
  }
  const pair = canonicalLinkPair(aId, bId);
  if (board.links.some((link) => linkPairEquals(link, pair))) {
    return boardResult(false, 'Those two are already tied.');
  }
  if (board.links.length >= SHIP_LEDGER_BOARD_MAX_LINKS) {
    return boardResult(false, 'The board cannot hold more thread — cut something first.');
  }
  if (admissible.get(aId).caseId !== admissible.get(bId).caseId) {
    return boardResult(false, 'The board cannot tie those together — they share no case thread.');
  }
  board.links.push(pair);
  return boardResult(true);
}

/** Cut one existing thread. Refuses when no thread joins the pair. */
export function unlinkEvidence(state, a, b) {
  const pair = canonicalLinkPair(a, b);
  const board = shipLedgerBoard(state);
  if (!pair || !board) return boardResult(false, 'There is no thread between those pages.');
  const index = board.links.findIndex((link) => linkPairEquals(link, pair));
  if (index < 0) return boardResult(false, 'There is no thread between those pages.');
  board.links.splice(index, 1);
  return boardResult(true);
}

/**
 * True when the three Verge evidence pages are tied into ONE connected chain on the board —
 * the deliberate player-submitted shape the Vale trail resolves on. Read-only; the story owner
 * re-checks its own revealed/evidence/revoked requirements on top of this.
 */
export function vergeEvidenceLinked(state) {
  const board = shipLedgerBoard(state);
  if (!board || board.links.length < 2) return false;
  const wanted = SHIP_LEDGER_VERGE_EVIDENCE_PAGES.map((page) => page.pageId);
  const parent = new Map();
  const root = (id) => {
    let r = parent.get(id);
    if (r === undefined) return id;
    while (r !== parent.get(r)) r = parent.get(r);
    return r;
  };
  for (const link of board.links) {
    if (!Array.isArray(link) || link.length !== 2) continue;
    const aId = boardPageId(link[0]);
    const bId = boardPageId(link[1]);
    if (!aId || !bId) continue;
    if (!parent.has(aId)) parent.set(aId, aId);
    if (!parent.has(bId)) parent.set(bId, bId);
    const ra = root(aId);
    const rb = root(bId);
    if (ra !== rb) parent.set(ra, rb);
  }
  if (!wanted.every((pageId) => parent.has(pageId))) return false;
  const first = root(wanted[0]);
  return wanted.every((pageId) => root(pageId) === first);
}

/**
 * Lazy serializer: absent board → `undefined` (the envelope slot can stay empty on untouched
 * runs — no new key). Present board → a plain JSON-safe `{ schemaVersion, board }`.
 */
export function serializeShipLedgerBoard(state) {
  const board = shipLedgerBoard(state);
  if (!board) return undefined;
  return {
    schemaVersion: SHIP_LEDGER_BOARD_SCHEMA_VERSION,
    board: {
      pins: board.pins.map((pin) => String(pin)),
      links: board.links
        .filter((link) => Array.isArray(link) && link.length === 2)
        .map((link) => [String(link[0]), String(link[1])]),
    },
  };
}

/**
 * Restore the board from serialized input. Missing/absent `board` leaves `state.shipLedger`
 * untouched (old saves stay lazy). Present input is validated: pins are nonempty string ids
 * (deduped, capped), links are canonical string pairs whose endpoints are pinned, with
 * self-links, duplicates, and malformed rows dropped rather than trusted.
 */
export function deserializeShipLedgerBoard(data, state) {
  if (!isRecord(data) || !Object.hasOwn(data, 'board')) return false;
  if (!isRecord(state)) return false;
  const raw = isRecord(data.board) ? data.board : {};
  const pins = [];
  for (const candidate of sourceArray(raw.pins)) {
    const id = boardPageId(candidate);
    if (!id || pins.includes(id)) continue;
    pins.push(id);
    if (pins.length >= SHIP_LEDGER_BOARD_MAX_PINS) break;
  }
  const pinned = new Set(pins);
  const links = [];
  for (const candidate of sourceArray(raw.links)) {
    const pair = Array.isArray(candidate)
      ? canonicalLinkPair(candidate[0], candidate[1])
      : isRecord(candidate)
        ? canonicalLinkPair(candidate.a, candidate.b)
        : null;
    if (!pair) continue;
    if (!pinned.has(pair[0]) || !pinned.has(pair[1])) continue;
    if (links.some((link) => linkPairEquals(link, pair))) continue;
    links.push(pair);
    if (links.length >= SHIP_LEDGER_BOARD_MAX_LINKS) break;
  }
  const board = ensureLedgerBoard(state);
  board.pins = pins;
  board.links = links;
  return true;
}

/** Chunked-lane twin of deserializeShipLedgerBoard — one bounded section, one yield label. */
export function *deserializeShipLedgerBoardChunked(data, state) {
  deserializeShipLedgerBoard(data, state);
  yield 'shipLedger:board';
}

export default buildShipLedger;
