// PQ-136.02 — remaining packaged occupational hulls that ride existing traffic roles
// and npcJobs phase machines. One row per craft. Donor incubator names that were
// re-authored for release (liner_shuttle → apron_shuttle) are recorded here under the
// released identity, never the donor name.
//
// Literal `assets/ships/release/...` URLs are the retail bodies the live loader
// already packages. Incubator donor paths must never appear in this table.
//
// Helios fixtures, not ambient-mix rows. The volatiles tanker (role `tanker`) and the
// inspection cutter (role `customs`) are already spawned on Helios. They stay OUT of
// OCCUPATIONAL_TRAFFIC_CRAFT so they never enter the weighted mix. Their job light is an
// existing signature profile (see FIELD_JOB_SIGNATURE_CRAFT) — heavy burn / clean burn for
// the tanker, the pin sweep for the cutter. No profile is invented per hull.
//
// The tug row below is a bounded draft wiring; its final admission remains an owner decision.
//
// The draft yard-tug behavior uses the existing hauler job/economy path. Its physical tow
// attachment remains a separate combat/tether owner seam; the role still carries a real
// finite freight manifest while that seam is completed.

export const OCCUPATIONAL_TRAFFIC_CRAFT = Object.freeze([
  Object.freeze({
    craftId: 'rescue_lifter',
    role: 'rescue',
    file: 'wholeships/rescue_lifter.glb',
    assetId: 'SF_WHOLESHIP_RESCUE_LIFTER',
    jobKind: 'tender',
    releaseUrl: 'assets/ships/release/parts/wholeships/rescue_lifter.glb',
  }),
  Object.freeze({
    craftId: 'prospector_skiff',
    role: 'prospector',
    file: 'wholeships/prospector_skiff.glb',
    assetId: 'SF_WHOLESHIP_PROSPECTOR_SKIFF',
    jobKind: 'miner',
    releaseUrl: 'assets/ships/release/parts/wholeships/prospector_skiff.glb',
  }),
  Object.freeze({
    craftId: 'scrap_sweeper',
    role: 'sweeper',
    file: 'wholeships/scrap_sweeper.glb',
    assetId: 'SF_WHOLESHIP_SCRAP_SWEEPER',
    jobKind: 'miner',
    releaseUrl: 'assets/ships/release/parts/wholeships/scrap_sweeper.glb',
  }),
  Object.freeze({
    craftId: 'apron_shuttle',
    role: 'shuttle',
    file: 'wholeships/apron_shuttle.glb',
    assetId: 'SF_WHOLESHIP_APRON_SHUTTLE',
    jobKind: 'hauler',
    releaseUrl: 'assets/ships/release/parts/wholeships/apron_shuttle.glb',
  }),
  Object.freeze({
    craftId: 'yard_tug',
    role: 'tug',
    file: 'wholeships/yard_tug.glb',
    assetId: 'SF_WHOLESHIP_YARD_TUG',
    jobKind: 'hauler',
    releaseUrl: 'assets/ships/release/parts/wholeships/yard_tug.glb',
  }),
]);

// Profile ids are keys of NPC_JOB_SIGNATURE_PROFILES. jobKind is the existing phase machine
// the hull already rides: hauler for the tanker, patrol for the cutter (the pin sweep).
export const FIELD_JOB_SIGNATURE_CRAFT = Object.freeze([
  Object.freeze({
    craftId: 'volatiles_tanker',
    role: 'tanker',
    jobKind: 'hauler',
    loadedProfileId: 'heavy_burn',
    emptyProfileId: 'clean_burn',
  }),
  Object.freeze({
    craftId: 'inspection_cutter',
    role: 'customs',
    jobKind: 'patrol',
    profileId: 'on_the_pin',
  }),
]);

export const OCCUPATIONAL_JOB_KIND_BY_ROLE = Object.freeze({
  ...Object.fromEntries(OCCUPATIONAL_TRAFFIC_CRAFT.map((row) => [row.role, row.jobKind])),
  ...Object.fromEntries(FIELD_JOB_SIGNATURE_CRAFT.map((row) => [row.role, row.jobKind])),
});
