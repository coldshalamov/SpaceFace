// Bumped whenever the save schema changes; migrations key off this (see src/save/migrations.js).
// v3: offscreen sector-simulation engine adds data.sectorSim (ADR-0002 / V2 §33).
// v4: SG-02 dynamic authority persists yaw-rate and rapier-dynamic backend selection.
// v5: SG-03 semantic combat state persists actions, combatants, and active attachments.
// v6: player-authored navigation intent persists route/waypoint/autoTravel across Continue.
// v7: BP-01.1 loss-ledger provenance persists across Continue.
// v8: BP-01/C11 battle-aftermath wreck markers persist across Continue.
// v9: all persisted spatial positions use galactic-global XZ (`global_v1`).
// v10: first-dock Hauler/Hunter/Prospector origin progress persists under data.careerOrigins.
// v11: durable world-entity records (convoys/NPCs/mission targets/wrecks) under world.records.
// v12: PQ-014/SF-15/W06 live NPC job runtime persists under data.npcJobs (miner/hauler/patrol jobs).
// v13: J4 screen state memory — per-screen UI bags (tab/filter/layer/zoom/selection/scroll) under
//      data.uiScreenMemory, so the map, ship and station open where the player left them.
export const CURRENT_VERSION = 13;
