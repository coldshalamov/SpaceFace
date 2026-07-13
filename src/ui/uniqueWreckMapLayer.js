// src/ui/uniqueWreckMapLayer.js — pure read projection for R1 unique-wreck bearings.
//
// The durable system owns state.player.uniqueWrecks. This module only projects knowledge the
// player has actually read into the unified map. In particular, a rumored bearing never exposes
// exactPos: the map gets a fuzzy center/radius until an in-sector scan writes fixedPos.

const KNOWN_PHASES = new Set(['rumored', 'fixed', 'decision', 'salvaged']);
const FALLBACK_NAME = 'Wreck Bearing';

function finitePoint(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

function safeName(value) {
  const text = String(value || '').replace(/\?+/g, '').replace(/\s+/g, ' ').trim();
  return text || FALLBACK_NAME;
}

function bearingRecords(state) {
  const bearings = state && state.player && state.player.uniqueWrecks
    && state.player.uniqueWrecks.bearings;
  if (!bearings || typeof bearings !== 'object') return [];
  if (typeof bearings.values === 'function') return Array.from(bearings.values());
  return Object.values(bearings);
}

function phaseLanguage(phase, name, receipt) {
  if (phase === 'rumored') return {
    statusLabel: 'SEARCH AREA',
    objective: `Search the amber ring for ${name}. Pulse scanner to resolve it.`,
    detail: 'Approximate bearing only. The exact wreck remains unknown.',
  };
  if (phase === 'fixed') return {
    statusLabel: 'WRECK FIXED',
    objective: `Set the amber bearing. Reach and recover ${name}.`,
    detail: 'Named physical wreck fixed by scanner.',
  };
  if (phase === 'decision') return {
    statusLabel: 'RECOVERY DECISION',
    objective: `Choose whether to claim or hand over ${name}.`,
    detail: 'Recovery complete. Named rewards remain withheld until you choose.',
  };
  return {
    statusLabel: 'OUTCOME RECORDED',
    objective: receipt?.title || `${name} recovery closed.`,
    detail: receipt?.detail || 'Recovery choice saved. No duplicate collection.',
  };
}

/**
 * Return map-safe unique-wreck knowledge for one sector.
 *
 * Rumored records expose only {center,radius}; fixed/salvaged records may additionally expose the
 * durable global_v1 fixed point and a canonical galaxyMap course target. The returned objects are
 * fresh clones, so canvas/model consumers cannot mutate save state by accident.
 */
export function uniqueWreckMapReadouts(state, sectorId = null) {
  const wantedSector = sectorId == null ? null : String(sectorId);
  const rows = [];

  for (const record of bearingRecords(state)) {
    if (!record || typeof record !== 'object') continue;
    const wreckId = String(record.wreckId || '').trim();
    const recordSectorId = String(record.sectorId || '').trim();
    const phase = String(record.phase || '').trim();
    const center = finitePoint(record.bearingCenter);
    const radius = Number(record.radius);
    if (!wreckId || !recordSectorId || !KNOWN_PHASES.has(phase) || !center || !(radius > 0)) continue;
    if (wantedSector && recordSectorId !== wantedSector) continue;

    const name = safeName(record.name);
    const fixedPos = phase === 'rumored' ? null : finitePoint(record.fixedPos);
    const courseTarget = phase === 'fixed' && fixedPos ? {
      kind: 'bearing',
      id: wreckId,
      name,
      x: fixedPos.x,
      z: fixedPos.z,
    } : null;

    const language = phaseLanguage(phase, name, record.rewardReceipt);
    rows.push({
      wreckId,
      name,
      sectorId: recordSectorId,
      phase,
      coordSpace: 'global_v1',
      center,
      radius,
      fixedPos,
      courseTarget,
      ...language,
    });
  }

  return rows.sort((a, b) => a.wreckId.localeCompare(b.wreckId));
}

export default uniqueWreckMapReadouts;
