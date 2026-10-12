// Wreck Court case grammar — public surface. Simulation code lives beside this file.
// Flavor and rumors are not evidence. Hypothesis support never reads them.

export {
  WRECK_COURT_CASES,
  WRECK_COURT_CASE_IDS,
  WRECK_COURT_ENTRY_CASE,
  caseDef,
  materializeCase,
} from './cases.js';

export { WRECK_COURT_VARIANTS, WRECK_COURT_VARIANT_IDS, wreckCourtVariant } from './variants.js';

export const WRECK_COURT_VERBS = Object.freeze([
  'scan',
  'position',
  'grapple',
  'release',
  'tow',
  'compare',
  'moveObstruction',
  'bringPod',
  'reconstruct',
  'file',
]);

export const WRECK_COURT_EVIDENCE = Object.freeze([
  { id: 'visual', kind: 'measurement', reads: 'shape, damage, heading, turrets, hostile code, sealed plate' },
  { id: 'spectro', kind: 'measurement', reads: 'scar material', destroys: 'volatile seals' },
  { id: 'structure', kind: 'measurement', reads: 'which face is torn, grooves, plate normal' },
  { id: 'trajectory', kind: 'measurement', reads: 'velocity at the moment of the sample' },
  { id: 'mass', kind: 'measurement', reads: 'mass, and mu when the body is a gravity source' },
  { id: 'thermal', kind: 'measurement', reads: 'temperature and a cooling age when the metal is still warm' },
  { id: 'magazine', kind: 'measurement', reads: 'rounds remaining' },
  { id: 'signal', kind: 'measurement', reads: 'transponder group shared by pieces of one hull' },
  { id: 'fuel', kind: 'measurement', reads: 'tank remaining' },
  { id: 'assay', kind: 'measurement', reads: 'declared plate versus contents, only at an assay buoy' },
  { id: 'compare', kind: 'measurement', reads: 'miss distance of two sampled trajectories' },
  { id: 'reconstruct', kind: 'measurement', reads: 'a fit: ballistic, heading rate, deflagration, ejection, gravity, or mirror' },
  { id: 'rumor', kind: 'flavor', reads: 'nothing the court will file on' },
]);

export const WRECK_COURT_FIELD_MANUAL = Object.freeze({
  polymer_coat: 'A sprayed film on a scar face. Torn metal does not make this.',
  torn_alloy: 'Metal folded or torn. The edge is the metal itself.',
  tensile_neck: 'A cable end drawn thin, then broken. A cut end is flat.',
  torch_cut: 'A flat, bright cut. Someone parted it on purpose.',
  soot: 'Radiant scorch. No hole, no fold.',
  stone: 'The rock itself.',
  folded_ore: 'A dense plate with a kiss on one face.',
  groove: 'A line gouged in a face you have to go around to see.',
  sigma: 'Trajectory miss is good to a few WU. Ages are good to a fraction of a second while the metal is warm, and blank once it has cooled to ambient. A filing inside that noise does not close.',
});

export const WRECK_COURT_SCHEMA_VERSION = 1;
