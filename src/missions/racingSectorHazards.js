// AL-RACE-2 — pure projection of a sector's existing hazard geometry and phase into
// racing cue records. The sector's own machinery (environmentalMachinery.js) owns the
// forces, the cycle clocks, and the durable site records; this helper only READS those
// authoritative sources and shapes them into the `run.cues` records that
// racingSetPieces.js already publishes. Nothing here registers a field, spawns a
// duplicate machine, grants a reward, or writes durable site state.
//
// Cue record shape (same contract as the authored set-piece cues):
//   { id, kind: 'sectorHazard', name, gateIndex, phase, countdownS, label, hint,
//     pos: {x,z}, waitPos: {x,z}|null, waitRadiusWU: 42, entityIds: [] }
// pos/waitPos are galactic-global. waitPos stays null when neither the served
// leg nor the hazard position resolves — the course view reads a missing hold
// point as "no refuge marker", never as a marker at the world origin. Native
// `surge` projects to `active`, native `warning` to `warning`, and
// calm/shutdown/quiet to `clear`. A missing native record produces
// `unavailable`, never a fabricated active hazard.

import {
  PALLAS_REEF_GLOBAL_POS,
  pallasReefPhase,
  CINDER_SLUICE_FIELD,
  CINDER_SLUICE_SITE_ID,
  cinderSluicePhase,
  ALL_KILL_MACHINE_BY_ID,
  killMachinePhase,
  weatherVolumesForSector,
  weatherPhase,
} from '../data/environmentalMachinery.js';
import { SECTORS } from '../data/sectors.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { raceGateGlobals } from '../data/raceLevels.js';

const SECTOR_BY_ID = new Map((SECTORS || []).map((sector) => [sector && sector.id, sector]));
const PHASE_SCRATCH = {};

function projectPhase(nativePhase) {
  if (nativePhase === 'surge') return 'active';
  if (nativePhase === 'warning') return 'warning';
  if (nativePhase == null) return 'unavailable';
  return 'clear'; // calm, quiet, gather, discharge — the window to fly
}

/** waitPos: `waitBackWU` behind the served gate along its incoming leg, clamped to the leg.
 *  Gate 0 of a closed circuit inherits its incoming leg from the seam approach. */
function waitPosFor(gates, gateIndex, waitBackWU) {
  const gate = gates[gateIndex];
  let before = gates[gateIndex - 1];
  if (!before && gateIndex === 0 && gates.length > 2) {
    const first = gates[0], last = gates[gates.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) <= 1) before = gates[gates.length - 2];
  }
  if (!gate || !before) return null;
  const dx = gate.x - before.x, dz = gate.z - before.z;
  const len = Math.hypot(dx, dz) || 1;
  const back = Math.min(Number.isFinite(waitBackWU) ? waitBackWU : 200, len * 0.7);
  return { x: gate.x - (dx / len) * back, z: gate.z - (dz / len) * back };
}

function cueFor(previous, def) {
  if (previous && previous.id === def.id) return previous;
  return {
    id: def.id,
    kind: 'sectorHazard',
    // The HUD uppercases this verbatim — a def without a name falls back to its
    // id rather than shipping a non-string into a player-facing text path.
    name: typeof def.name === 'string' && def.name ? def.name : def.id,
    label: def.label || 'SECTOR HAZARD',
    hint: def.hint || '',
    gateIndex: def.gateIndex,
    phase: 'unavailable',
    countdownS: null,
    pos: { x: 0, z: 0 },
    // Null until a finite hold point or hazard position resolves; the renderer
    // skips a null hold point instead of drawing a refuge ring at the origin.
    waitPos: null,
    waitRadiusWU: 42,
    entityIds: [],
    announceWarning: false,
    _lastPhase: null,
  };
}

/**
 * Project `definitions` (a level's sectorHazards) into live cue records.
 * `params` is the race mission params (courseSectorId, nextGate, gates);
 * `previousCues` reuses prior records so the published array stays stable.
 * Returns a bounded array — one record per definition, in declaration order.
 */
export function projectRacingSectorHazards(state, params, definitions, previousCues) {
  const out = [];
  if (!Array.isArray(definitions) || definitions.length === 0) return out;
  const sectorId = params && params.courseSectorId;
  const simTime = Number(state && state.simTime) || 0;
  const gates = raceGateGlobals(params);
  const sector = SECTOR_BY_ID.get(sectorId) || null;
  const player = state && state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null;
  const previousById = new Map((previousCues || []).map((cue) => [cue.id, cue]));
  const seen = new Set();
  for (let i = 0; i < definitions.length; i++) {
    const def = definitions[i];
    // One record per def id — a repeated id would alias the same cue twice.
    if (!def || typeof def.id !== 'string' || seen.has(def.id)) continue;
    seen.add(def.id);
    const cue = cueFor(previousById.get(def.id), def);
    let pos = null;
    let phase = 'unavailable';
    let countdownS = null;
    if (def.kind === 'pallasReef') {
      const p = pallasReefPhase(simTime, PHASE_SCRATCH);
      pos = PALLAS_REEF_GLOBAL_POS;
      phase = projectPhase(p.phase);
      countdownS = Number.isFinite(p.remainingS) ? p.remainingS : null;
    } else if (def.kind === 'weatherVolume') {
      const volume = sectorId
        ? weatherVolumesForSector(sectorId).find((row) => row.id === def.volumeId)
        : null;
      if (volume) {
        const p = weatherPhase(volume, simTime, PHASE_SCRATCH);
        pos = volume.globalPos;
        phase = projectPhase(p.phase);
        countdownS = Number.isFinite(p.remainingS) ? p.remainingS : null;
      }
    } else if (def.kind === 'cinderSluice') {
      const record = state && state.sites && state.sites.worldById
        ? state.sites.worldById[CINDER_SLUICE_SITE_ID] : null;
      pos = CINDER_SLUICE_FIELD.center;
      if (record) {
        const p = cinderSluicePhase(record, simTime, PHASE_SCRATCH);
        phase = projectPhase(p.phase);
        countdownS = Number.isFinite(p.remainingS) ? p.remainingS : null;
      }
    } else if (def.kind === 'killMachine') {
      const machine = ALL_KILL_MACHINE_BY_ID[def.machineId];
      if (machine) {
        const p = killMachinePhase(machine, simTime, PHASE_SCRATCH);
        pos = machine.globalPos;
        phase = projectPhase(p.phase);
        countdownS = Number.isFinite(p.remainingS) ? p.remainingS : null;
      }
    } else if (def.kind === 'staticZone') {
      const zone = sector && Array.isArray(sector.hazards) ? sector.hazards[def.zoneIndex] : null;
      if (zone && Number.isFinite(zone.radius)) {
        const center = zone.center || zone.pos;
        if (center && Number.isFinite(center.x) && Number.isFinite(center.z)) {
          pos = sectorLocalToGlobalForSector({ x: center.x, z: center.z }, sectorId);
          // Static zones have no cycle; they matter only on their associated leg.
          const near = player && player.pos
            && Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z) <= zone.radius + 200;
          phase = near ? 'active' : 'clear';
        }
      }
    }
    cue.phase = phase;
    cue.countdownS = countdownS;
    // Phase truth stands apart from position truth: a machinery phase still
    // projects even when its source yields no finite point, but a non-finite
    // point is never written into the published record or the hold fallback.
    const finitePos = pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? pos : null;
    if (finitePos) { cue.pos.x = finitePos.x; cue.pos.z = finitePos.z; }
    // An uncomputable hold point inherits the hazard position, never the world origin.
    const waitPos = waitPosFor(gates, def.gateIndex, def.waitBackWU) || finitePos;
    if (waitPos && Number.isFinite(waitPos.x) && Number.isFinite(waitPos.z)) {
      if (!cue.waitPos) cue.waitPos = { x: 0, z: 0 };
      cue.waitPos.x = waitPos.x; cue.waitPos.z = waitPos.z;
    }
    // Transition bookkeeping: the owner announces each entry into `warning` once.
    cue.announceWarning = phase === 'warning' && cue._lastPhase !== 'warning';
    cue._lastPhase = phase;
    out.push(cue);
  }
  return out;
}
