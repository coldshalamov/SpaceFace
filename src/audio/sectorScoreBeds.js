// AL-EAR-2: outer-sector compositions, not transpositions of one loop. Every row authors a
// rhythm and contour; the existing score identity supplies mode/root/tempo and faction timbre.
import { MODES, resolveFactionColour, resolveScoreIdentity, semitoneHz } from './scoreDirector.js';

const PARTS = {
  sector_nyx_march: ['faction_quiet', [0, 0, 4, 0, 6, 4], [0, 4, 7, 12, 20, 28]],
  sector_hyperion_cut: ['faction_dmc', [4, 3, 0, 2, 4, 3, 1, 0], [0, 1.5, 3, 7, 8, 11, 14, 24]],
  sector_kepler_scar: ['faction_reach', [0, 1, 0, 4, 6, 1, 0], [0, 3, 4, 10, 17, 21, 30]],
  sector_orcus_shadow: ['faction_archive', [0, 5, 2, 6], [0, 8, 19, 27]],
  sector_rhea_cinder: ['faction_dmc', [0, 4, 3, 0, 4, 2, 3, 0], [0, 2, 4, 6, 16, 18, 22, 26]],
  sector_haumea_rift: ['faction_free', [0, 3, 4, 7, 4, 2, 3, 0, 4], [0, 2, 5, 7, 10, 13, 18, 23, 29]],
  sector_eris_margin: ['faction_quiet', [7, 6, 4, 2, 0, 4, 2, 0], [0, 2, 4, 6, 11, 17, 24, 30]],
  sector_phoebe_echo: ['faction_vael', [0, 6, 5, 6, 0], [0, 5, 12, 21, 29]],
  sector_nereid_shoal: ['faction_free', [0, 3, 4, 2, 7, 4], [0, 2.5, 6, 10.5, 18, 26.5]],
  sector_proteus_well: ['faction_quiet', [0, 0, 6], [0, 13, 25]],
  sector_triton_wake: ['faction_vael', [0, 6, 5, 0, 2, 6, 0], [0, 4, 9, 14, 18, 25, 30]],
  sector_eunomia_gulf: ['faction_understory', [0, 4, 3, 1, 0, 3, 4, 1], [0, 3, 6, 9, 16, 19, 22, 28]],
  sector_sedna_dark: ['faction_helix', [0, 7], [0, 21]],
  sector_dione_lane: ['faction_mts', [0, 2, 4, 2, 0, 4, 6, 4, 2, 0], [0, 1, 2.5, 4, 8, 12, 17, 20, 24, 30]],
  sector_the_bolus: ['faction_free', [0, 1, 3, 0, 4, 3, 1, 0, 2, 1, 0], [0, 1.5, 4, 7.5, 10, 14, 17.5, 21, 24.5, 27, 30]],
};
const WAVES = { tone: 'sine', bell: 'sine', reed: 'triangle', grit: 'sawtooth', pluck: 'triangle', glass: 'sine' };

function compose(id, [factionId, degrees, beats]) {
  const identity = resolveScoreIdentity(id);
  const faction = resolveFactionColour(factionId);
  const mode = MODES[identity.mode];
  const noteHz = degree => semitoneHz(220, identity.tonic + mode[degree % 7] + Math.floor(degree / 7) * 12);
  const bpm = 96 + identity.tempo * 3;
  const steps = degrees.map((degree, i) => Object.freeze({
    beat: beats[i], hz: noteHz(degree), duration: Math.min(2.5, ((beats[i + 1] ?? 32) - beats[i]) * 0.72),
    gain: i % 4 === faction.accent ? 0.24 : 0.16,
  }));
  const composition = Object.freeze({
    id, identity, factionId, faction, bpm, beats: 32, steps: Object.freeze(steps),
    wave: WAVES[faction.timbre] || 'sine',
  });
  const hzA = noteHz(0) / 2;
  const hzB = noteHz(4) / 2;
  const wave = composition.wave;
  const noise = faction.timbre === 'grit' ? 0.24 : faction.timbre === 'reed' ? 0.1 : 0.04;
  return Object.freeze({
    id: `bed_${id}`, label: identity.label, hzA, hzB, waveA: wave, waveB: 'sine', noise,
    tone: faction.timbre === 'grit' ? 920 : 1700, composition,
    signature: `${wave}:${hzA}:sine:${hzB}:${noise}:${bpm}:${beats.join(',')}:${degrees.join(',')}`,
    stemWeights: Object.freeze({ A: 1, B: 1, C: 1, D: 1 }),
  });
}

export const COMPOSED_SECTOR_BEDS = Object.freeze(Object.fromEntries(Object.entries(PARTS).map(([id, part]) => [id, compose(id, part)])));

function waveAt(phase, wave) {
  if (wave === 'triangle') return 1 - 4 * Math.abs((phase % 1) - 0.5);
  if (wave === 'sawtooth') return (phase % 1) * 2 - 1;
  return Math.sin(phase * Math.PI * 2);
}

// One reusable, eight-bar PCM phrase in the existing Band carrier. Integer-period pedal
// oscillations and wrapped note tails make its loop seam continuous; no external assets.
export function renderComposedSectorBedPcm(bed, options = {}) {
  const c = bed.composition;
  const sr = options.sampleRate || 16000;
  const phraseS = c.beats * 60 / c.bpm;
  const seconds = options.seconds ?? phraseS;
  const pcm = new Float32Array(Math.max(1, Math.round(seconds * sr)));
  const pedalA = Math.round(bed.hzA * phraseS) / phraseS;
  const pedalB = Math.round(bed.hzB * phraseS) / phraseS;
  for (let i = 0; i < pcm.length; i++) {
    const t = (i / sr) % phraseS;
    pcm[i] = 0.09 * waveAt(t * pedalA, bed.waveA) + 0.045 * Math.sin(t * pedalB * Math.PI * 2);
  }
  const beatS = 60 / c.bpm;
  for (const step of c.steps) {
    const length = Math.round(step.duration * beatS * sr);
    const start = Math.round(step.beat * beatS * sr);
    for (let repeat = -1; repeat * phraseS < seconds; repeat++) {
      const offset = start + Math.round(repeat * phraseS * sr);
      for (let j = 0; j < length; j++) {
        const i = offset + j;
        if (i < 0 || i >= pcm.length) continue;
        const u = j / length;
        const envelope = Math.min(1, u * 24) * Math.pow(1 - u, 2);
        // Faction timbre and accent colour the authored phrase; fundamentals stay in mode.
        pcm[i] += step.gain * envelope * waveAt(j / sr * step.hz, c.wave);
      }
    }
  }
  return pcm;
}
