// PQ-158.03 — composed themes. Four state themes with motifs, per-sector beds, faction stings
// via the Band. Pure data + resolver; the adaptive matrix drives authored stems. Audio is
// presentation — this file never writes sim state.

import { BAND_BED_PROFILES } from './bandBeds.js';
import { MUSIC_STEMS } from '../data/audioRecipes.js';

export const THEME_MATRIX_SEED = 15803;

export const THEME_STATES = Object.freeze(['travel', 'combat', 'station', 'wanted']);

// Huggable travel lead: rising A-minor arpeggio to the octave. A stranger can hum "A C E A".
export const TRAVEL_MOTIF = Object.freeze({
  id: 'travel_outbound',
  name: 'Outbound',
  hummable: 'A C E A',
  key: 'Am',
  bpm: 80,
  stem: 'A',
  notes: Object.freeze(['A', 'C', 'E', 'A']),
  octaves: Object.freeze([4, 5, 5, 5]),
  steps: Object.freeze([
    Object.freeze({ bar: 0, beat: 0, note: 'A', oct: 4, dur: 4 }),
    Object.freeze({ bar: 0, beat: 4, note: 'C', oct: 5, dur: 4 }),
    Object.freeze({ bar: 0, beat: 8, note: 'E', oct: 5, dur: 4 }),
    Object.freeze({ bar: 0, beat: 12, note: 'A', oct: 5, dur: 8 }),
  ]),
});

export const COMBAT_MOTIF = Object.freeze({
  id: 'combat_press',
  name: 'Press',
  hummable: 'A E A C',
  key: 'Am',
  bpm: 130,
  stem: 'C',
  notes: Object.freeze(['A', 'E', 'A', 'C']),
  octaves: Object.freeze([3, 4, 3, 4]),
});

export const STATION_MOTIF = Object.freeze({
  id: 'station_berth',
  name: 'Berth',
  hummable: 'C E G B',
  key: 'C',
  bpm: 72,
  stem: 'D',
  notes: Object.freeze(['C', 'E', 'G', 'B']),
  octaves: Object.freeze([4, 4, 4, 4]),
});

export const WANTED_MOTIF = Object.freeze({
  id: 'wanted_mark',
  name: 'Mark',
  hummable: 'A Bb A E',
  key: 'Am',
  bpm: 95,
  stem: 'B',
  notes: Object.freeze(['A', 'Bb', 'A', 'E']),
  octaves: Object.freeze([3, 3, 3, 3]),
});

export const THEME_MOTIFS = Object.freeze({
  travel: TRAVEL_MOTIF,
  combat: COMBAT_MOTIF,
  station: STATION_MOTIF,
  wanted: WANTED_MOTIF,
});

// Stem weights keyed by the four player-facing states. A=travel bed, B=tension/wanted,
// C=combat, D=station/docked. Authored, not a threat-scalar remix of one pad.
export const THEME_STEM_WEIGHTS = Object.freeze({
  travel: Object.freeze({ A: 1.0, B: 0.0, C: 0.0, D: 0.0 }),
  combat: Object.freeze({ A: 0.25, B: 0.35, C: 1.0, D: 0.0 }),
  station: Object.freeze({ A: 0.15, B: 0.1, C: 0.0, D: 1.0 }),
  wanted: Object.freeze({ A: 0.2, B: 1.0, C: 0.35, D: 0.0 }),
});

// Legacy music-state names the sequencer already understands.
export const THEME_TO_MUSIC_STATE = Object.freeze({
  travel: 'calm',
  combat: 'combat',
  station: 'docked',
  wanted: 'tense',
});

function bed(id, hzA, hzB, waveA, waveB, noise, tone, label) {
  return Object.freeze({
    id, hzA, hzB, waveA, waveB, noise, tone, label,
    signature: `${waveA}:${hzA}:${waveB}:${hzB}:${noise}:${tone}`,
  });
}

// Per-sector beds: each sector a stranger can name from the bed alone (unique hz/wave/noise).
export const SECTOR_BEDS = Object.freeze({
  sector_helios_prime: bed('bed_helios', 82.4, 164.8, 'sine', 'triangle', 0.06, 1480, 'Helios Prime'),
  sector_ceres_belt: bed('bed_ceres', 73, 110, 'triangle', 'sine', 0.22, 720, 'Ceres Belt'),
  sector_tethys_junction: bed('bed_tethys', 110, 220, 'square', 'sine', 0.14, 1840, 'Tethys Junction'),
  sector_vesta_forge: bed('bed_vesta', 55, 110, 'sawtooth', 'triangle', 0.28, 540, 'Vesta Forge'),
  sector_pallas_drift: bed('bed_pallas', 98, 147, 'triangle', 'sine', 0.1, 1240, 'Pallas Drift'),
  sector_io_reach: bed('bed_io', 65, 97.5, 'sawtooth', 'sine', 0.34, 680, 'Io Reach'),
  sector_charon_expanse: bed('bed_charon', 49, 73.5, 'sine', 'sine', 0.18, 420, 'Charon Expanse'),
  sector_sker_haven: bed('bed_sker', 72, 145, 'sawtooth', 'square', 0.48, 720, 'Sker Haven'),
  sector_veil_nebula: bed('bed_veil', 61.8, 92.7, 'sine', 'triangle', 0.08, 540, 'Veil Nebula'),
  sector_ashfall_reach: bed('bed_ashfall', 44, 88, 'sawtooth', 'sine', 0.4, 380, 'Ashfall Reach'),
});

export const DEFAULT_SECTOR_BED = bed('bed_void', 70, 140, 'sine', 'sine', 0.12, 900, 'Open void');

function sting(factionId, profileKey, hz, wave, label) {
  return Object.freeze({
    factionId,
    profileKey,
    profile: BAND_BED_PROFILES[profileKey] || null,
    hz,
    wave,
    label,
    signature: `${profileKey}:${hz}:${wave}`,
  });
}

// Faction identity through the Band: one sting per code faction, unique hz+profile.
export const FACTION_STINGS = Object.freeze({
  faction_scn: sting('faction_scn', 'civil_service', 196, 'square', 'Concord'),
  faction_mts: sting('faction_mts', 'routing_loop', 247, 'triangle', 'Meridian'),
  faction_dmc: sting('faction_dmc', 'frontier_ballad', 165, 'triangle', 'Drift'),
  faction_reach: sting('faction_reach', 'pirate_roast', 139, 'sawtooth', 'Reach'),
  faction_quiet: sting('faction_quiet', 'numbers_station', 440, 'sine', 'Quiet'),
  faction_choir: sting('faction_choir', 'harmonic_drone', 330, 'sine', 'Choir'),
  faction_free: sting('faction_free', 'investigative', 220, 'triangle', 'Frontier'),
  faction_vael: sting('faction_vael', 'landmark_override', 82, 'sine', 'Vael'),
});

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function resolveSectorBed(sectorId) {
  if (sectorId && SECTOR_BEDS[sectorId]) return SECTOR_BEDS[sectorId];
  const id = String(sectorId || '');
  if (!id) return DEFAULT_SECTOR_BED;
  // Unknown sector: still unique so a blind listen does not collapse to the void bed.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  const hzA = 48 + (h % 80);
  const hzB = hzA * (h & 1 ? 1.5 : 2);
  const waves = ['sine', 'triangle', 'sawtooth', 'square'];
  return bed(`bed_${id}`, hzA, hzB, waves[h % 4], waves[(h >>> 3) % 4], 0.08 + ((h >>> 8) % 40) / 100, 400 + (h % 1400), id);
}

export function resolveFactionSting(factionId) {
  if (factionId && FACTION_STINGS[factionId]) return FACTION_STINGS[factionId];
  return null;
}

export function resolveThemeState(input = {}) {
  if (input.docked || input.station) return 'station';
  if (input.wanted) return 'wanted';
  if (input.inCombat || clamp01(input.threat) >= 0.6) return 'combat';
  return 'travel';
}

/**
 * Adaptive matrix: game presentation snapshot → authored stem weights, motif, per-sector bed,
 * optional faction sting. Pure.
 */
export function resolveThemeMatrix(input = {}) {
  const state = THEME_STATES.includes(input.state) ? input.state : resolveThemeState(input);
  const motif = THEME_MOTIFS[state];
  const stemWeights = THEME_STEM_WEIGHTS[state];
  const bedRow = resolveSectorBed(input.sectorId);
  const stingRow = resolveFactionSting(input.factionId);
  const stem = MUSIC_STEMS.find((row) => row && (row.id === `stem_${motif.stem.toLowerCase()}` || row.label))
    || MUSIC_STEMS[0];
  return Object.freeze({
    schema: 'spaceface.themeMatrix.v1',
    seed: THEME_MATRIX_SEED,
    state,
    musicState: THEME_TO_MUSIC_STATE[state],
    motif,
    stemWeights,
    stemId: motif.stem,
    stemDef: stem,
    bed: bedRow,
    sting: stingRow,
    hummable: motif.hummable,
  });
}

const NOTE_INDEX = Object.freeze({
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
});

export function intervalSignature(notes) {
  const idx = (Array.isArray(notes) ? notes : []).map((n) => NOTE_INDEX[n]);
  if (idx.some((v) => v == null) || idx.length < 2) return '';
  const out = [];
  for (let i = 1; i < idx.length; i += 1) out.push((idx[i] - idx[0] + 12) % 12);
  return out.join(',');
}

/** Blind listen: name the state from the interval shape, never from the hummable label. */
export function identifyThemeFromIntervals(signature) {
  const wanted = String(signature || '');
  for (const state of THEME_STATES) {
    if (intervalSignature(THEME_MOTIFS[state].notes) === wanted) return state;
  }
  return null;
}

/** Blind listen: name the sector from hz/wave signature, never from the label. */
export function identifySectorBedFromSignature(signature) {
  const wanted = String(signature || '');
  for (const [sectorId, row] of Object.entries(SECTOR_BEDS)) {
    if (row.signature === wanted) return sectorId;
  }
  return null;
}

export function themeMotifsAreDistinct() {
  const phrases = THEME_STATES.map((s) => THEME_MOTIFS[s].hummable);
  const signatures = Object.values(SECTOR_BEDS).map((b) => b.signature);
  const stings = Object.values(FACTION_STINGS).map((s) => s.signature);
  return {
    motifs: new Set(phrases).size === phrases.length,
    beds: new Set(signatures).size === signatures.length,
    stings: new Set(stings).size === stings.length,
  };
}
