// Bumped whenever the save schema changes; migrations key off this (see src/save/migrations.js).
// v3: offscreen sector-simulation engine adds data.sectorSim (ADR-0002 / V2 §33).
// v4: SG-02 dynamic authority persists yaw-rate and rapier-dynamic backend selection.
// v5: SG-03 semantic combat state persists actions, combatants, and active attachments.
// v6: player-authored navigation intent persists route/waypoint/autoTravel across Continue.
export const CURRENT_VERSION = 6;
