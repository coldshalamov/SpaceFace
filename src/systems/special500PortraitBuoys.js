// src/systems/special500PortraitBuoys.js — SP1-193 "The Portrait Buoys" (vendor leg runtime).
//
// The corridor line is permanent world furniture: every visit to one of the six corridor
// sectors rebuilds the same authored buoy line (src/data/special500/portraitBuoyLine.js)
// through the standard story-prop entity contract the claim-beacon owner uses (type 'beacon',
// parentType 'story_prop' — the renderer's route-nav buoy body, tetherable, scannable). Fame
// is read from the deed record (deedsFor — the only fame ledger that exists), so the line's
// deed frames are your record made visible: one frame per famous deed in that sector, in
// weight order, and the newest frame is always your own hull — half-finished, still wet,
// until the painter's commission (payment in a story, settled through markTold) finishes it.
//
// Single writers: this system spawns only its own buoy entities (helpers.spawnEntity /
// helpers.removeEntity, the same helper contract as beacons.js) and writes exactly one plain
// story flag, `portrait_commissioned`, through the commission verb. Determinism: sector
// changes are runtime bookkeeping, the composition reads saved state (deed record + the
// commission flag) and the shared weather function of the world day — no rng, no wall time.
// Transient entities never serialize: a Continue rebuilds the line from the same reads.

import { deedsFor, markTold, pickDeedToTell } from './deedRecord.js';
import {
  PORTRAIT_BUOY_KIND,
  PORTRAIT_BUOY_SECTORS,
  PORTRAIT_DEED_FRAME_CAP,
  PORTRAIT_PAINTER,
  shroudWeather,
} from '../data/special500/portraitBuoyLine.js';

const COMMISSIONED_FLAG = PORTRAIT_PAINTER.commissionFlag;
const LINE_STEP_WU = 150;

const RUNTIME = new WeakMap();

function runtime(state) {
  let rt = RUNTIME.get(state);
  if (!rt) {
    rt = { lastSectorId: null, lineSectorId: null, entityIds: [] };
    RUNTIME.set(state, rt);
  }
  return rt;
}

function currentSectorId(state) {
  const w = state && state.world;
  return (w && w.currentSectorId) || (state && state.player && state.player.sectorId) || null;
}

function sectorRow(sectorId) {
  return PORTRAIT_BUOY_SECTORS.find((row) => row.sectorId === sectorId) || null;
}

/**
 * The line's shroud composition for a sector, in hang order: the sector's two authored
 * frames (working pilots, dead pilots), then the record's famous hulls for that sector in
 * weight order (fame made visible), then the newest frame — the player's own hull. Every
 * caption carries the corridor's shared weather for the world day.
 */
export function composeShroudLine(state, sectorId, now = state && state.simTime) {
  const row = sectorRow(sectorId);
  if (!row) return [];
  const dayIndex = Math.floor((Number(now) || 0) / 600);
  const weather = shroudWeather(dayIndex);
  const shrouds = row.baseShrouds.map((caption, i) => ({
    kind: 'base',
    index: i,
    caption: `SHROUD — ${caption} · ${weather}`,
  }));
  // Fame read: this sector's deeds, weight order (newest first breaks ties — the record's
  // own order), capped at the authored line's extension room.
  const famous = deedsFor(state, { sectorId, limit: PORTRAIT_DEED_FRAME_CAP })
    .slice()
    .sort((a, b) => (b.weight | 0) - (a.weight | 0));
  for (const deed of famous) {
    shrouds.push({
      kind: 'deed',
      deedId: deed.id,
      caption: `SHROUD — the hull from the ${deedLabel(deed)} · ${weather}`,
    });
  }
  const commissioned = !!((state.story && state.story.flags || {})[COMMISSIONED_FLAG]);
  shrouds.push({
    kind: 'own',
    commissioned,
    caption: commissioned
      ? `SHROUD — your hull, finished and signed nobody, drying in the cold · ${weather}`
      : `SHROUD — your hull, half-finished on its frame, the paint still wet · ${weather}`,
  });
  return shrouds;
}

function deedLabel(deed) {
  const data = deed || {};
  const detail = String(data.subject || data.detail || '').trim();
  const kind = String(data.kind || '').replace(/_/g, ' ');
  return detail ? `${kind} (${detail})` : kind;
}

/** Sector-local position for shroud `i`: the authored frames, then the line's extension. */
function positionFor(row, index) {
  const buoys = row.buoys;
  if (index < buoys.length) return buoys[index];
  const last = buoys[buoys.length - 1];
  const first = buoys[0];
  const dx = last.x - first.x;
  const dz = last.z - first.z;
  const len = Math.hypot(dx, dz) || 1;
  const steps = index - buoys.length + 1;
  return {
    x: Math.round(last.x + (dx / len) * LINE_STEP_WU * steps),
    z: Math.round(last.z + (dz / len) * LINE_STEP_WU * steps),
  };
}

export const special500PortraitBuoys = {
  name: 'special500PortraitBuoys',

  init(ctx) {
    this.helpers = ctx.helpers || {};
    this.bus = ctx.bus;
    this.state = ctx.state || null;
    this._off = [
      this.bus.on('ui:talkContact', (payload) => this._onTalkContact(payload || {})),
    ].filter((off) => typeof off === 'function');
  },

  destroy() {
    for (const off of this._off || []) {
      try { off(); } catch (_) { /* cleanup must not throw */ }
    }
    this._off = [];
  },

  update(dt, state) {
    if (!state) return;
    this.state = state;
    const rt = runtime(state);
    const sector = currentSectorId(state);
    if (!sector) return;
    if (sector === rt.lastSectorId) return;
    rt.lastSectorId = sector;
    // The line is rebuilt, not persisted: a sector change despawns whatever this system
    // spawned last, and the corridor sectors get the authored line back, composed from
    // the reads that are true now.
    this._despawnLine(state, rt);
    const row = sectorRow(sector);
    if (!row) return;
    this._spawnLine(state, rt, row);
  },

  _despawnLine(state, rt) {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    for (const id of rt.entityIds.splice(0)) {
      if (id == null || typeof removeEntity !== 'function') continue;
      removeEntity(id);
    }
    rt.lineSectorId = null;
  },

  _spawnLine(state, rt, row) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    const shrouds = composeShroudLine(state, row.sectorId);
    rt.lineSectorId = row.sectorId;
    if (typeof spawnEntity !== 'function') return; // focused harnesses: record-only
    shrouds.forEach((shroud, i) => {
      const pos = positionFor(row, i);
      const ent = spawnEntity({
        type: 'beacon',
        pos: { x: pos.x, z: pos.z },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          scanLabel: shroud.caption,
          storyPropKind: PORTRAIT_BUOY_KIND,
          portraitBuoy: true,
          portraitSectorId: row.sectorId,
          portraitFrame: shroud.kind,
          tetherable: true,
          // The tether gate's real field (src/systems/tetherGameplay.js reads
          // data.masslineTetherable); `tetherable` above stays descriptive metadata.
          masslineTetherable: true,
        },
      });
      if (ent && ent.id != null) rt.entityIds.push(ent.id);
    });
  },

  // ── the commission: payment in a story ──────────────────────────────────────────────────
  // The bar contact (src/ui/station/barContacts.js canonical row) offers the verb; the sim
  // settles it: the painter takes the record's best untold story (pickDeedToTell — the same
  // read every bar gossip uses), tells it, and the newest frame gets finished. No credits
  // move: the painter refuses payment in anything but a good story.
  _onTalkContact({ canonicalKey, stationId, choiceId }) {
    const state = this.state || null;
    if (!state) return null;
    if (canonicalKey !== PORTRAIT_PAINTER.contactKey
      || stationId !== PORTRAIT_PAINTER.stationId
      || choiceId !== PORTRAIT_PAINTER.commissionChoiceId) return null;
    const ui = state.ui || {};
    const dockedAt = ui.docked !== false && typeof ui.dockedStationId === 'string' ? ui.dockedStationId : null;
    if (dockedAt !== PORTRAIT_PAINTER.stationId) return null;

    const flags = (state.story && state.story.flags) || {};
    const now = Number(state.simTime) || 0;
    if (flags[COMMISSIONED_FLAG]) {
      this.bus.emit('special500:portraitCommission', { outcome: 'already', stationId, at: now });
      return { outcome: 'already' };
    }
    const deed = pickDeedToTell(state, {
      sectorId: PORTRAIT_PAINTER.sectorId,
      speakerFactionId: PORTRAIT_PAINTER.factionId,
      now,
    }) || pickDeedToTell(state, { speakerFactionId: PORTRAIT_PAINTER.factionId, now });
    if (!deed) {
      // No story worth the canvas yet: the painter does not take the job.
      this.bus.emit('special500:portraitCommission', { outcome: 'no_story', stationId, at: now });
      return { outcome: 'no_story' };
    }
    markTold(state, deed.id, { by: PORTRAIT_PAINTER.name.toLowerCase() });
    if (!state.story) state.story = { flags: {} };
    if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
    state.story.flags[COMMISSIONED_FLAG] = now;
    this.bus.emit('special500:portraitCommission', {
      outcome: 'settled', stationId, at: now, deedId: deed.id, deedKind: deed.kind,
    });
    this.bus.emit('comms:log', {
      from: PORTRAIT_PAINTER.name,
      text: 'Vesper took the story at face value — the whole thing, the parts you did not say too. '
        + 'The half-finished frame came down off the buoy line that night and went back up finished. '
        + 'Nobody signed it.',
      kind: 'special500',
    });
    return { outcome: 'settled', deedId: deed.id };
  },
};
