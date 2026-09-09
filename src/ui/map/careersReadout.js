// src/ui/map/careersReadout.js — the NPC career roster, as a pure model for THE CHART.
//
// WHY THIS EXISTS
// ---------------
// CANONICAL_BUILD_MAP §11.11 inhibitor #1, measured: `state.npcJobs` — the career simulation that
// runs haulers, miners, salvors, surveyors, patrols and tenders across the pockets — is written by
// npcJobsRuntime and read by ZERO UI files. The sim was invisible. This module is the read half:
// it joins `state.npcJobs.byId` (the runtime's entries) with the live entity table and the entity
// resolver, and produces the roster the Chart's Careers tab renders — role, place, and a door into
// the worker's hull, faction and sector.
//
// ─── THE THREE RULES THIS MODULE EXISTS TO ENFORCE ────────────────────────────────────────────
//
// 1. **READ-ONLY.** npcJobsRuntime is the SINGLE WRITER of state.npcJobs (its own header says so).
//    This module never mutates state, never emits, never calls a system. It reads `byId`, the
//    entity table and the frozen catalogues — nothing else. If a value is not on a record, it is
//    not displayed.
//
// 2. **THE UI NEVER INVENTS (grammar §1).** Roles and phases render through phrase banks keyed by
//    the kernel's own frozen enums (`NPC_JOB_KIND`, `NPC_JOB_PHASE`). An unknown kind or phase has
//    no bank entry and renders NOTHING — the same discipline as causeLedger's "unknown tag renders
//    NOTHING". Place names come from the job's own route records; doors come from entityResolver,
//    which refuses unknown refs. No sentence is composed by concatenation.
//
// 3. **ALL FOUR DATA STATES, EACH NAMING WHAT WOULD FILL THE PANE (grammar §12 item 9).** The
//    roster is synchronous off state, so the states map onto the honest moments:
//      denied  — no pocket in frame (no selection, no current sector): the pane cannot even name
//                a scope. Names what fills it: a sector in view.
//      loading — state.npcJobs has not stood up yet (fresh boot, before the runtime's first pass).
//                Names what fills it: the career ledger starting as sectors activate.
//      empty   — the ledger exists and no career works this pocket. Names what fills it: working
//                hulls taking jobs here.
//      error   — records the kernel itself marked corrupt. Counted and said aloud, never silently
//                dropped; a corrupt record is not a worker and never joins the roster.
//
// PURITY — no DOM, no canvas, no import of galaxyMap.js, no module-level mutable state, inputs
// never mutated. Unit-testable under `node --test` with no browser. Deliberately NOT reachable
// from `scripts/sf-sim.mjs`'s import graph, so it is structurally incapable of moving the 47a
// golden.

import { NPC_JOB_KIND, NPC_JOB_PHASE } from '../../systems/npcJobs.js';
import { entityExists, entityLabel, entitySpanHtml } from '../entityResolver.js';

// ─── Phrase banks (enumerated; keyed by the kernel's frozen vocabularies) ──────────────────────
// Derived from the enums so the bank cannot outlive its vocabulary: every key is computed from
// NPC_JOB_KIND / NPC_JOB_PHASE at module load. A kind or phase added to the kernel without a bank
// entry here renders nothing — which is exactly the loud silence a review can catch.

const ROLE_PHRASES = {
  [NPC_JOB_KIND.MINER]: 'Miner',
  [NPC_JOB_KIND.HAULER]: 'Hauler',
  [NPC_JOB_KIND.PATROL]: 'Patrol',
  [NPC_JOB_KIND.SURVEYOR]: 'Surveyor',
  [NPC_JOB_KIND.SALVOR]: 'Salvor',
  [NPC_JOB_KIND.TENDER]: 'Tender',
};

const PHASE_PHRASES = {
  [NPC_JOB_PHASE.COMMISSION]: 'Commissioning',
  [NPC_JOB_PHASE.DEPART]: 'Departing',
  [NPC_JOB_PHASE.TRANSIT]: 'In transit',
  [NPC_JOB_PHASE.APPROACH]: 'Approaching',
  [NPC_JOB_PHASE.WORK]: 'Working',
  [NPC_JOB_PHASE.LOAD]: 'Loading',
  [NPC_JOB_PHASE.UNLOAD]: 'Unloading',
  [NPC_JOB_PHASE.RETURN]: 'Returning',
  [NPC_JOB_PHASE.HOLD]: 'Holding the beat',
  [NPC_JOB_PHASE.FLEE]: 'Fleeing',
  [NPC_JOB_PHASE.COMPLETE]: 'Run complete',
};

const ROLE_ORDER = Object.values(NPC_JOB_KIND);

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Authored waypoint labels are snake_case ids (`seam_miner_ore_face`). The resolver renders
 *  catalogue fields the same way (`replace(/_/g, ' ')`); this adds word capitalisation so a route
 *  label reads as a place, not a debug key. It changes FORM only — never content. */
function placeLabel(label) {
  return String(label).replace(/_/g, ' ')
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/**
 * A route waypoint's `targetRef` names live world authority (`station:station_ceres:service-berth`,
 * `dest:station_ceres`, `field:slot:…`). Only the two forms that name a STATION can become a door
 * the resolver understands: `station:<id>…` (a berth at that station) and `dest:<stationId>` (that
 * station as the destination — the pockets module documents it as live station authority). The
 * sub-segment after a second colon is a berth/clast detail, not the station. Everything else
 * (`field:`, `object:`, `activity:`, `actor:`, `world-site:`) has no dossier type and yields null.
 * The candidate must still resolve, or there is no door.
 */
function stationRefFromTargetRef(ref) {
  if (typeof ref !== 'string') return null;
  const cut = ref.indexOf(':');
  if (cut < 1) return null;
  const type = ref.slice(0, cut);
  if (type !== 'station' && type !== 'dest') return null;
  const stationId = ref.slice(cut + 1).split(':')[0];
  if (!stationId) return null;
  const candidate = 'station:' + stationId;
  return entityExists(candidate) ? candidate : null;
}

/** The live entity carrying this job, or null. Virtual entries (entityId cleared on sector exit)
 *  keep their job in the ledger and still work the pocket; they simply carry no hull or faction
 *  doors, and those lines render nothing rather than guessing. */
function liveEntityOf(state, entry) {
  if (!entry || entry.entityId == null || !state || !state.entities || typeof state.entities.get !== 'function') {
    return null;
  }
  const entity = state.entities.get(entry.entityId);
  return entity && entity.alive !== false ? entity : null;
}

function careerRow(state, jobId, entry) {
  const job = entry && entry.job;
  if (!job) return null; // a shape the runtime never writes: not a worker, not an error, nothing
  if (job.corrupt === true) return { corrupt: true, jobId };
  const role = ROLE_PHRASES[job.kind];
  if (!role) return { corrupt: false, jobId }; // unknown kind: no honest role, never listed

  const entity = liveEntityOf(state, entry);
  const data = (entity && entity.data) || null;

  // Doors. Each is a resolver ref the resolver itself must vouch for; entityLabel returning null
  // means the catalogue has no such record, and that door renders nothing (never a raw id).
  const factionRef = data && data.factionId ? 'faction:' + data.factionId : null;
  const hullRef = data && data.defId ? 'hull:' + data.defId : null;

  // Place. The station door comes from the route's own targetRefs; the work-site text is the
  // current waypoint's authored label — where the worker is RIGHT NOW, kind-agnostically.
  const stationRefs = [];
  for (const waypoint of Array.isArray(job.route) ? job.route : []) {
    const ref = waypoint && stationRefFromTargetRef(waypoint.targetRef);
    if (ref && !stationRefs.includes(ref)) stationRefs.push(ref);
  }
  const currentWaypoint = Array.isArray(job.route) && Number.isInteger(job.routeIndex)
    ? job.route[job.routeIndex]
    : null;
  const siteLabel = currentWaypoint && currentWaypoint.label ? placeLabel(currentWaypoint.label) : null;

  return {
    corrupt: false,
    jobId: String(job.id || jobId),
    kind: job.kind,
    role,
    phasePhrase: PHASE_PHRASES[job.phase] || null,
    loopCount: Number.isInteger(job.loopCount) ? job.loopCount : 0,
    stationRefs,
    siteLabel,
    hullRef: hullRef && entityLabel(hullRef) ? hullRef : null,
    factionRef: factionRef && entityLabel(factionRef) ? factionRef : null,
    workerName: data && typeof data.name === 'string' && data.name ? data.name : null,
  };
}

/**
 * careersForSector(state, sectorId) -> frozen roster record.
 *
 * status  'denied' | 'loading' | 'empty' | 'error' | 'ready'
 * reason  the data-state sentence for the non-ready statuses (ready carries a count phrase)
 * rows    the workers, ordered by trade then id — stable across ticks so the panel does not shuffle
 * corruptCount  records the kernel marked corrupt; said aloud, never listed as workers
 */
export function careersForSector(state, sectorId) {
  if (!sectorId) {
    return Object.freeze({
      status: 'denied', sectorId: null, rows: [], corruptCount: 0,
      reason: 'No pocket in frame — select a sector to read who works it.',
    });
  }
  const byId = state && state.npcJobs && state.npcJobs.byId;
  if (!byId || typeof byId !== 'object') {
    return Object.freeze({
      status: 'loading', sectorId, rows: [], corruptCount: 0,
      reason: 'Career ledger not started — working hulls begin taking jobs as sectors activate.',
    });
  }

  const rows = [];
  let corruptCount = 0;
  for (const jobId of Object.keys(byId)) {
    const entry = byId[jobId];
    if (!entry || entry.sectorId !== sectorId) continue;
    const row = careerRow(state, jobId, entry);
    if (!row) continue;
    if (row.corrupt) { corruptCount += 1; continue; }
    if (row.role) rows.push(row);
  }
  rows.sort((a, b) => {
    const ka = ROLE_ORDER.indexOf(a.kind);
    const kb = ROLE_ORDER.indexOf(b.kind);
    if (ka !== kb) return (ka < 0 ? 99 : ka) - (kb < 0 ? 99 : kb);
    return a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0;
  });

  if (!rows.length && corruptCount) {
    return Object.freeze({
      status: 'error', sectorId, rows: [], corruptCount,
      reason: `${corruptCount} career record${corruptCount > 1 ? 's' : ''} unreadable — the pocket's working hulls will list as their records recover.`,
    });
  }
  if (!rows.length) {
    return Object.freeze({
      status: 'empty', sectorId, rows: [], corruptCount: 0,
      reason: 'No careers on record here — working hulls take jobs when this pocket is active.',
    });
  }
  return Object.freeze({
    status: 'ready', sectorId, rows, corruptCount,
    reason: `${rows.length} career${rows.length > 1 ? 's' : ''} at work in this pocket.`,
  });
}

/** Availability sentence for the tab strip, in the contract every other tab already uses
 *  (`available` + a `reason` in BOTH states — check:map-information-depth §9 pins this). */
export function careersTabAvailability(state, sectorId) {
  const roster = careersForSector(state, sectorId);
  return Object.freeze({ available: roster.status === 'ready', reason: roster.reason, roster });
}

function doorSpan(ref, escapedFallback) {
  const label = entityLabel(ref);
  if (!label) return escapedFallback || '';
  return entitySpanHtml(ref, escapeHtml(label));
}

/** One worker row. State rides on `data-career-phase` so the row never depends on colour alone;
 *  figures bind the DATA face (grammar §3, Phase-0 ruling: every figure binds --sf-data-face). */
function careerRowHtml(row) {
  const place = []
    .concat(row.stationRefs.map((ref) => doorSpan(ref, null)))
    .concat(row.siteLabel ? [escapeHtml(row.siteLabel)] : [])
    .filter(Boolean)
    .join(' · ');
  const who = []
    .concat(row.workerName ? [escapeHtml(row.workerName)] : [])
    .concat(row.hullRef ? [doorSpan(row.hullRef, null)] : [])
    .concat(row.factionRef ? [doorSpan(row.factionRef, null)] : [])
    .filter(Boolean)
    .join(' · ');
  const phase = row.phasePhrase ? `<span class="gm-career__phase">${escapeHtml(row.phasePhrase)}</span>` : '';
  return `
      <div class="gm-career" data-career-kind="${escapeHtml(row.kind)}"${row.phasePhrase ? ` data-career-phase="${escapeHtml(row.phasePhrase)}"` : ''}>
        <div class="gm-career__head">
          <span class="gm-career__role">${escapeHtml(row.role)}</span>
          ${phase}
          <span class="gm-career__fig">${row.loopCount} circuit${row.loopCount === 1 ? '' : 's'}</span>
        </div>
        ${place ? `<div class="gm-career__place">${place}</div>` : ''}
        ${who ? `<div class="gm-career__who">${who}</div>` : ''}
      </div>`;
}

/**
 * careersTabHtml(state, sectorId) — the full tab body, all four data states included. Pure string;
 * the Chart injects it through the same innerHTML path every other tab uses, where the shared
 * entity-drawer delegation on #screens already turns every data-entity door into a dossier.
 */
export function careersTabHtml(state, sectorId) {
  const roster = careersForSector(state, sectorId);
  if (roster.status !== 'ready') {
    const title = { denied: 'Careers', loading: 'Careers', empty: 'Careers', error: 'Careers' }[roster.status] || 'Careers';
    return `<div class="gm-ins-section"><div class="gm-ins-title">${title}</div>
      <div class="gm-ins-note">${escapeHtml(roster.reason)}</div></div>`;
  }
  const sectorLabel = entityLabel('sector:' + roster.sectorId);
  const sectorDoor = sectorLabel
    ? entitySpanHtml('sector:' + roster.sectorId, escapeHtml(sectorLabel))
    : escapeHtml(roster.sectorId);
  const corruptLine = roster.corruptCount
    ? `<div class="gm-ins-note">${escapeHtml(
      `${roster.corruptCount} career record${roster.corruptCount > 1 ? 's' : ''} unreadable — not listed.`)}</div>`
    : '';
  return `
      <div class="gm-ins-section">
        <div class="gm-ins-kind">Working the pocket</div>
        <div class="gm-ins-target-name">${sectorDoor}</div>
        <div class="gm-ins-row"><span>Careers</span><span class="gm-ins-row-val gm-fig">${roster.rows.length} on record</span></div>
      </div>
      <div class="gm-ins-section">
        <div class="gm-ins-title">Who is working here</div>
        ${roster.rows.map(careerRowHtml).join('')}
        ${corruptLine}
      </div>`;
}

/**
 * The one-line Overview presence: the pocket's trades at a glance, so the player sees WHO is
 * working here the moment the Chart opens, with the door to the pocket itself. Rendered by the
 * Chart only when the roster is ready; every other state stays on the Careers tab's own reason.
 */
export function careersOverviewLineHtml(state, sectorId) {
  const roster = careersForSector(state, sectorId);
  if (roster.status !== 'ready' || !roster.rows.length) return '';
  const trades = [];
  for (const row of roster.rows) {
    if (!trades.includes(row.role)) trades.push(row.role);
  }
  const sectorLabel = entityLabel('sector:' + roster.sectorId);
  const door = sectorLabel
    ? entitySpanHtml('sector:' + roster.sectorId, escapeHtml(sectorLabel))
    : escapeHtml(roster.sectorId);
  return `
      <div class="gm-ins-section">
        <div class="gm-ins-title">Working this pocket</div>
        <div class="gm-career__place">${door} · ${escapeHtml(trades.join(' · '))}</div>
        <div class="gm-ins-note">${roster.rows.length} career${roster.rows.length > 1 ? 's' : ''} on record — the Careers tab lists role, place and each worker.</div>
      </div>`;
}
