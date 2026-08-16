// Authored reputation-play tuning shared by the existing owner systems.
// No runtime state lives here: factions gates access, missions shapes boards, Economy moves
// credits, and pirateDisguise owns the player's one-use forged identity.

export const FACTION_BACKROOM = Object.freeze({
  serviceId: 'forged_manifest',
  label: 'Forged Manifest + Ghost Transponder',
  minRep: 150,
  price: 3200,
  madeExposureS: 180,
});

export const FACTION_MISSION_DOCTRINES = Object.freeze({
  faction_scn: Object.freeze(['escort', 'patrol_clear', 'bounty_hunt', 'recon_scan']),
  faction_mts: Object.freeze(['cargo_delivery', 'bulk_trade', 'escort', 'passenger_transport']),
  faction_dmc: Object.freeze(['mining_quota', 'salvage_retrieval', 'patrol_clear']),
  faction_reach: Object.freeze(['bounty_hunt', 'smuggling_run', 'salvage_retrieval']),
  faction_quiet: Object.freeze(['smuggling_run', 'recon_scan', 'bounty_hunt']),
  faction_vael: Object.freeze(['recon_scan', 'salvage_retrieval', 'passenger_transport']),
  faction_free: Object.freeze(['cargo_delivery', 'escort', 'salvage_retrieval']),
  faction_choir: Object.freeze(['passenger_transport', 'escort', 'recon_scan']),
});

/** Accepted standing makes the faction's own work materially more likely. Neutral boards retain
 * their physical-station mix, while higher standing deepens identity without scaling mission stats. */
export function factionMissionDoctrineMultiplier(factionId, missionType, rep) {
  const signature = FACTION_MISSION_DOCTRINES[factionId];
  if (!signature || !signature.includes(missionType) || !(Number(rep) >= 30)) return 1;
  const loyalty = Math.max(0, Math.min(1, (Number(rep) - 30) / 370));
  // This must outrank the station-profile loyalty boost already present in the board recommender;
  // otherwise a friendly trade hub becomes "more trade hub" instead of more recognizably SCN/MTS.
  return 3.25 + loyalty * 2.25;
}
