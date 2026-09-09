// PQ-136.02 — remaining packaged occupational hulls that ride existing traffic roles
// and npcJobs phase machines. One row per craft. Donor incubator names that were
// re-authored for release (liner_shuttle → apron_shuttle) are recorded here under the
// released identity, never the donor name.
//
// Literal `assets/ships/release/...` URLs are the retail bodies the live loader
// already packages. Incubator donor paths must never appear in this table.
//
// HELD BACK — packaged and loadable, but deliberately NOT fielded (no row below, so no
// traffic role, no whole-ship binding, no spawn):
//
//   volatiles_tanker  (would be role `tanker`)
//   inspection_cutter (would be role `customs`)
//
// The tanker, tug, and cutter were wired once (aef7caad) and unwired again by 8257fd9e.
// The old still review called the tanker and tug a "missing-hull kit" and sent customs back
// to the Hornet. The tanker and cutter remain held-back candidates; the tug row below is a
// bounded draft wiring for the current owner visual review, and its final admission remains
// an owner decision.
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

export const OCCUPATIONAL_JOB_KIND_BY_ROLE = Object.freeze(Object.fromEntries(
  OCCUPATIONAL_TRAFFIC_CRAFT.map((row) => [row.role, row.jobKind]),
));
