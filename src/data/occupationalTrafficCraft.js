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
//   yard_tug          (would be role `tug`)
//   inspection_cutter (would be role `customs`)
//
// These three were wired once (aef7caad) and unwired again by 8257fd9e, whose still
// reviews called the tanker and tug a "missing-hull kit" and sent customs traffic back to
// the Hornet. That is a recorded ART rejection, not an oversight, so re-fielding them is
// an owner call. They are queued for a fresh chase-camera still review and stay candidates
// — do not delete the bodies, and do not re-add rows here without that review passing.

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
]);

export const OCCUPATIONAL_JOB_KIND_BY_ROLE = Object.freeze(Object.fromEntries(
  OCCUPATIONAL_TRAFFIC_CRAFT.map((row) => [row.role, row.jobKind]),
));
