// Spectrum measurement constants.
//
// Game-scale approximation (do not describe this as radio Doppler):
// Ship speeds in SpaceFace are tens of world-units per second. Electromagnetic
// Doppler is v/c. If 1 WU is 1 km, then 100 WU/s is about 3e-4 c, and a radio
// carrier would shift by a fraction of a part per thousand — not a cue a pilot
// can fly. Spectrum reports a kinematic tone instead: the bearing rate and the
// range-rate residual after the ship's own motion is removed, in WU/s.
// Occlusion is a disk on the XZ plane. Multipath is a 2D line-mirror reflection.
// Echo delay uses a survey speed of 4000 WU/s, not light speed, so extra path
// length is a readable fraction of a second. Jamming widens bearing tolerance.
// False signals fail a geometric or kinematic consistency check. They are not
// dice rolls.

export const SPECTRUM_SCHEMA = 1;

// Massline throw and the scanner's own investigation numbers. Spectrum reuses
// them so a tow or a close pass is the same distance the ship already uses.
export const TOW_RANGE_WU = 390;
export const PAYOFF_RADIUS_WU = 150;
export const BRAKE_HOLD_WU_S = 8;
export const MIN_BASELINE_WU = 350;
export const MIN_BEARING_DELTA_DEG = 8;
export const REQUIRED_PINGS = 3;
export const SCANNER_GATE_PINGS = 6;

export const SAMPLE_CAP = 8;
export const TRACK_CAP = 8;
export const LOG_CAP = 24;

// Cross-track tolerance of one clean bearing, in world units. The solver weighs
// a ray by 1/sigma^2. This is uncertainty, not a random perturbation of the ray.
export const SIGMA_WU = 48;
export const VELOCITY_PRIOR_WU_S = 40;
export const REVEAL_AREA_WU2 = 42000;
export const MIN_AREA_WU2 = 600;

export const JAM_REJECT = 0.5;
export const AUDIBLE = 0.08;
export const BEARING_SPLIT_DEG = 14;
export const ECHO_POWER = 0.55;
export const SURVEY_SPEED_WU_S = 4000;
export const RAY_TICK_WU = 160;

export const DRIFT_SPEED_WU_S = 7;
export const MANEUVER_SPEED_WU_S = 34;
export const RECORDING_GAP_WU_S = 12;
export const BACKTRACK_AGREE_WU = 80;
export const DWELL_SPEED_WU_S = 8;

export const SPECTRUM_APPROXIMATION =
  'Kinematic tone in WU/s, not electromagnetic Doppler (v/c is negligible at ship speed). '
  + 'Occlusion is an XZ disk. Multipath is a 2D mirror. Echo delay uses a 4000 WU/s survey '
  + 'speed, not light speed. Jamming widens tolerance. Decoys fail geometry or motion checks.';
