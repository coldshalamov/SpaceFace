// Short calls with space between them. Role rhythms use different envelopes as well as pitch.
export const FAUNA_ROLE_SOUND = Object.freeze({
  drifter: 'ambient_fauna_drifter', grazer: 'ambient_fauna_grazer', hunter: 'ambient_fauna_hunter', carrier: 'ambient_fauna_carrier',
  relay: 'ambient_fauna_relay', colony: 'ambient_fauna_colony', scavenger: 'ambient_fauna_scavenger', sessile: 'ambient_fauna_sessile',
  migrant: 'ambient_fauna_migrant',
});
const ROLES = [
  ['drifter', 'sine', 720, .35, 1250], ['grazer', 'sine', 360, .6, 900],
  ['hunter', 'sawtooth', 92, .24, 380], ['carrier', 'triangle', 180, .8, 650],
  ['relay', 'sine', 1040, .5, 1800], ['colony', 'triangle', 540, .16, 1400],
  ['scavenger', 'square', 230, .12, 680], ['sessile', 'sine', 58, 1.2, 180],
  ['migrant', 'triangle', 210, 1.05, 420],
];
export const MACHINE_SOUND_IDS = Object.freeze([
  'surveyor_prism', 'custodian', 'auditor', 'witness', 'shepherd', 'mason', 'executor',
  'courier', 'conservator', 'measure', 'boundary_walker', 'appeals_clerk', 'debris_sorter', 'sleeping_jury',
]);
export const DISCOVERY_AUDIO_RECIPES = Object.freeze([
  ...ROLES.map(([role, wave, baseFreq, sustain, filterFreq], index) => ({
    id: FAUNA_ROLE_SOUND[role], category: 'ambient', type: 'oscillator', wave, baseFreq,
    duration: sustain + .22,
    gainEnvelope: { attack: .03 + index * .012, sustain, release: .18, peak: .14 },
    filterType: 'lowpass', filterFreq, lfoRate: 1.3 + index * .73, lfoDepth: .06 + index * .008,
  })),
  ...MACHINE_SOUND_IDS.map((kind, index) => ({
    id: `ambient_machine_${kind}`, category: 'ambient', type: 'oscillator',
    wave: index % 3 === 0 ? 'sine' : index % 3 === 1 ? 'triangle' : 'square',
    baseFreq: 130 + index * 53, duration: .28 + (index % 4) * .13,
    gainEnvelope: { attack: .012, sustain: .1 + (index % 4) * .13, release: .15, peak: .13 },
    filterType: 'bandpass', filterFreq: 520 + index * 110, filterQ: 1.5 + (index % 3),
    lfoRate: 3 + index * .4, lfoDepth: .025,
  })),
]);
