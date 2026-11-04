// src/data/special500/spectacleLegs.js — the spectacle presentation registry.
//
// Phase 2 leg family "spectacle" (design/program/special-500/PHASE2_BUILD_BRIEF.md):
// each row maps one ratified catalog entry id to the authored visual/wire moment that
// entry's `sees` line promises. The runtime owner is src/systems/special500Spectacle.js;
// it subscribes 'special500:spectacle' (one emission per director firing) and plays this
// row's steps off state.simTime. Rendering/wire always goes through the EXISTING owner
// seams — there is no second render pipeline and no new shader code here:
//
//   lightFlash      → bus 'presentation:vfxCue' { id: 'special500.light', lights: 1 } —
//                     the vfx owner's default cue light (one distant secondary light
//                     point at the authored position). The light's colour/peak identity
//                     is the presentation owner's default cue identity; the payload
//                     cannot re-tint it. Honest scoping, not a bypass.
//   echoRing        → bus 'presentation:vfxCue' { id: 'thermal.mark', kind: 'thermalMark' }
//                     — the fields system's bloom-independent ring contract: authored
//                     colour, radius (owner clamps 1.5–160 WU), life (owner clamps
//                     0.15–4 s). One delayed radar/comms echo pulse; the delay is the
//                     step's atS.
//   lampCascade     → expanded into N lightFlash beats walking an axis (bow → stern).
//                     NOTE the honest shortfall: the authored "lamp-bus envelope
//                     sequence on one wreck package" needs Forge variant finishes on the
//                     wreck's window rows (asset work), so the cascade walks event-light
//                     points instead; the "hold dark" half of a blackout is the loop's
//                     silent remainder — additive VFX cannot darken.
//   trafficAdvisory → bus 'news:publish' — a logged advisory on the news wire (the
//                     owner surface the entry's seam names). Text-only, no motion.
//
// Accessibility: every cue payload carries flashReduced (same two-gate read of
// state.settings as bombs.js/hullBurst.js) and the vfx owner renders its reduced
// variant — this file never bypasses vfxAccessibility.
//
// Determinism: rows are frozen pure data; the system schedules every beat from
// state.simTime (loop = pure simTime modulo). No rng, no wall time.

import { zonesForSector } from '../sectorZones.js';
import { SPECIAL500_ALL } from './index.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * The template set: what each template means and the exact param contract the owner
 * seam supports. The system refuses (skips) a step whose template is not in this table.
 */
export const SPECTACLE_TEMPLATES = Object.freeze({
  lightFlash: Object.freeze({
    meaning: 'one distant secondary light point at the authored position',
    seam: "bus 'presentation:vfxCue' { id: 'special500.light', lights: 1 }",
    params: Object.freeze({
      offsetWu: 'WU along the row bearing from the anchor (finite, |x| <= 2000)',
      magnitude: 'advisory magnitude 0.1..6 (scales the cue radius read, not the light colour)',
    }),
  }),
  echoRing: Object.freeze({
    meaning: 'one delayed radar/comms echo pulse — a coloured ring at the anchor',
    seam: "bus 'presentation:vfxCue' { id: 'thermal.mark', kind: 'thermalMark' }",
    params: Object.freeze({
      color: 'authored hex colour the vfx owner renders the ring in',
      radiusWu: 'ring radius 1.5..160 WU (owner clamps)',
      lifeS: 'ring life 0.15..4 s (owner clamps)',
    }),
  }),
  lampCascade: Object.freeze({
    meaning: 'a walk of light points along the row bearing (bow to stern); expanded to lightFlash beats',
    seam: "expanded to N × 'lightFlash' beats at stepS intervals",
    params: Object.freeze({
      count: 'beats 2..6 (integer)',
      lengthWu: 'axis length 4..400 WU, centred on the anchor',
      stepS: 'seconds between beats 0.2..4',
    }),
  }),
  trafficAdvisory: Object.freeze({
    meaning: 'a logged advisory on the news wire — the world treats the moment as real',
    seam: "bus 'news:publish' { text, kind, source, sourceRef, eventId }",
    params: Object.freeze({
      text: 'the advisory line (1..400 chars, game voice)',
      source: 'wire source label (default watch-relay)',
      kind: 'news kind (default incidents)',
    }),
  }),
});

export const SPECTACLE_TEMPLATE_IDS = Object.freeze(Object.keys(SPECTACLE_TEMPLATES));

// One spectacle row per catalog entry id. Fields:
//   title     display title (echoes the catalog entry)
//   anchor    where the moment lives: { sectorId, zoneId } (static zone data) or
//             { sectorId, poiId } / { sectorId, stationId } (world-materialized)
//   bearingRad  sector-frame direction of the row's axis (lane crossing, keel line)
//   loopS     0 = play once per firing; > 0 = the whole row repeats on a pure
//             simTime modulo of this many seconds (steps sit inside the lit window,
//             the remainder holds dark)
//   spanS     authored length of the lit window (validator: every step fits inside)
//   steps     [{ atS, template, params }] — atS within the lit window; expanded
//             templates (lampCascade) are expanded by the runtime owner.
const ROWS = {
  // SP1-101 — The Scheduled Ghost. The convoy that no longer exists crosses the
  // sector's patrolled corridor on its seeded schedule (calendar dayOfYear 13, a
  // 15 s window, re-armed yearly): sensors paint once (echo ring), three running
  // lights walk the lane, and the advisory board logs the arrival it cannot see.
  // Charon Expanse has no patrol_corridor-typed zone; the Cinder Refinery approach
  // is the sector's only patrolled corridor (P.patrol presence), so the ghost
  // crosses that lane.
  'SP1-101': Object.freeze({
    title: 'The Scheduled Ghost',
    anchor: Object.freeze({ sectorId: 'sector_charon_expanse', zoneId: 'zone_charon_refinery' }),
    bearingRad: 0.9,
    loopS: 0,
    spanS: 8,
    steps: Object.freeze([
      Object.freeze({ atS: 0.4, template: 'echoRing', params: Object.freeze({ color: '#8fe0a8', radiusWu: 90, lifeS: 2.2 }) }),
      Object.freeze({ atS: 1.6, template: 'lightFlash', params: Object.freeze({ offsetWu: -36, magnitude: 1 }) }),
      Object.freeze({ atS: 3.2, template: 'lightFlash', params: Object.freeze({ offsetWu: 0, magnitude: 1 }) }),
      Object.freeze({ atS: 4.8, template: 'lightFlash', params: Object.freeze({ offsetWu: 36, magnitude: 1 }) }),
      Object.freeze({
        atS: 6.0,
        template: 'trafficAdvisory',
        params: Object.freeze({
          source: 'charon-traffic',
          text: "TRAFFIC ADVISORY · Cinder Refinery approach — nine-hull convoy crossing the lane, line astern. Arrivals logged; right-of-way granted. No transponder, no hulls on scan. The board thanks the convoy for its cooperation and notes, for the record: it has never been late.",
        }),
      }),
    ]),
  }),

  // SP3-127 — The Echo Wreck. One hull in the Cruiser Graveyard replays its final
  // minute in light only, on a clean 60 s cycle: the scan sweep (a wide cold ring),
  // a panic of strobes, a cascade walking the keel bow to stern — then forty dark
  // seconds (the loop's silent remainder) before it starts over. The authored
  // lamp-bus envelope on the wreck package needs Forge variant finishes on the
  // wreck's window rows, so the cascade walks event-light points; the zone centre
  // of the Graveyard stands in for the seeded hull's scatter position.
  'SP3-127': Object.freeze({
    title: 'The Echo Wreck',
    anchor: Object.freeze({ sectorId: 'sector_io_reach', zoneId: 'zone_io_derelict' }),
    bearingRad: 2.4,
    loopS: 60,
    spanS: 20,
    steps: Object.freeze([
      Object.freeze({ atS: 0.6, template: 'echoRing', params: Object.freeze({ color: '#7ec8e8', radiusWu: 160, lifeS: 3.6 }) }),
      Object.freeze({ atS: 6.4, template: 'lightFlash', params: Object.freeze({ offsetWu: -18, magnitude: 1 }) }),
      Object.freeze({ atS: 7.8, template: 'lightFlash', params: Object.freeze({ offsetWu: 22, magnitude: 1 }) }),
      Object.freeze({ atS: 8.7, template: 'lightFlash', params: Object.freeze({ offsetWu: -6, magnitude: 1 }) }),
      Object.freeze({ atS: 9.4, template: 'lightFlash', params: Object.freeze({ offsetWu: 10, magnitude: 1 }) }),
      Object.freeze({ atS: 12.0, template: 'lampCascade', params: Object.freeze({ count: 4, lengthWu: 96, stepS: 1.4 }) }),
    ]),
  }),
};

export const SPECTACLE_LEGS = Object.freeze(ROWS);

/** Numeric bounds per template param; everything here must stay owner-clamp-compatible. */
const PARAM_BOUNDS = Object.freeze({
  lightFlash: Object.freeze({ offsetWu: [-2000, 2000], magnitude: [0.1, 6] }),
  echoRing: Object.freeze({ radiusWu: [1.5, 160], lifeS: [0.15, 4] }),
  lampCascade: Object.freeze({ count: [2, 6], lengthWu: [4, 400], stepS: [0.2, 4] }),
});

/**
 * Validate the registry against the live catalog. Returns human-readable problems
 * (empty = valid): every row id is a live spectacle-channel catalog entry, every
 * template is known, every numeric param is finite inside its owner bounds, anchors
 * name real zones, and every step fits the row's lit window.
 */
export function validateSpectacleLegs(entries = SPECIAL500_ALL) {
  const problems = [];
  const byId = new Map(Array.isArray(entries) ? entries.map((e) => [e.id, e]) : []);
  for (const [id, row] of Object.entries(SPECTACLE_LEGS)) {
    const entry = byId.get(id);
    if (!entry) { problems.push(`${id}: row has no catalog entry`); continue; }
    if (entry.dormant) problems.push(`${id}: row on a dormant entry`);
    if (entry.channel !== 'spectacle') problems.push(`${id}: catalog channel is ${entry.channel}, not spectacle`);
    if (entry.sectors && entry.sectors.length && !entry.sectors.includes(row.anchor && row.anchor.sectorId)) {
      problems.push(`${id}: anchor sector ${row.anchor && row.anchor.sectorId} outside the entry's sectors`);
    }
    const anchor = row.anchor || {};
    const zoneIds = new Set(zonesForSector(anchor.sectorId).map((z) => z && z.id));
    if (anchor.zoneId && !zoneIds.has(anchor.zoneId)) problems.push(`${id}: anchor zone ${anchor.zoneId} does not exist in ${anchor.sectorId}`);
    if (!Number.isFinite(row.bearingRad)) problems.push(`${id}: bearingRad not finite`);
    if (!(Number.isFinite(row.loopS) && row.loopS >= 0)) problems.push(`${id}: loopS must be >= 0`);
    if (!(Number.isFinite(row.spanS) && row.spanS > 0)) problems.push(`${id}: spanS must be > 0`);
    if (!Array.isArray(row.steps) || !row.steps.length) { problems.push(`${id}: no steps`); continue; }
    for (const step of row.steps) {
      const at = `${id}@${step && step.atS}`;
      if (!Number.isFinite(step.atS) || step.atS < 0) { problems.push(`${at}: atS out of range`); continue; }
      if (step.atS > row.spanS) problems.push(`${at}: step outside the lit window`);
      if (row.loopS > 0 && row.loopS <= row.spanS) problems.push(`${id}: loopS must exceed the lit window (the dark half is the remainder)`);
      if (!SPECTACLE_TEMPLATES[step.template]) { problems.push(`${at}: unknown template ${step.template}`); continue; }
      const p = step.params || {};
      if (step.template === 'trafficAdvisory') {
        const text = String(p.text || '');
        if (!text.trim() || text.length > 400) problems.push(`${at}: advisory text 1..400 chars`);
        if (p.source != null && !String(p.source).trim()) problems.push(`${at}: empty advisory source`);
      } else {
        for (const [key, [lo, hi]] of Object.entries(PARAM_BOUNDS[step.template] || {})) {
          const v = p[key];
          if (!Number.isFinite(v) || v < lo || v > hi) problems.push(`${at}: ${key} ${v} outside ${lo}..${hi}`);
        }
        if (step.template === 'lampCascade' && !(Number.isInteger(p.count) && p.count >= 2)) {
          problems.push(`${at}: cascade count must be an integer >= 2`);
        }
      }
      if (step.template === 'echoRing' && !HEX_COLOR.test(String(p.color || ''))) {
        problems.push(`${at}: echoRing needs a #rrggbb colour`);
      }
    }
  }
  return problems;
}
