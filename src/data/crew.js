// Row 446 GOLD-CREW — crew aboard: up to four hires from the local station pools, each with a
// real role, a real derived-stat perk (written through player.efficiencyMods — the same additive
// multiplier seam tech unlocks use), banter about real sim events, one loyalty job each, and
// injury/loss when the hull goes down. Data-only contracts; the registered owner is
// src/systems/crew.js.

export const CREW_CAP = 4;

// Role ids are stable save keys. Perk keys must name real fields with live consumers:
//   shieldRegenMult / energyRegenMult / cargoCapMult → computeDerivedStats fold (ships.js);
//   jumpCooldownMult → driveCooldownMultiplier (world.js).
export const CREW_ROLES = Object.freeze({
  engineer: {
    label: 'Engineer',
    perk: Object.freeze({ key: 'shieldRegenMult', delta: 0.08 }),
    perkLine: 'shield weave +8%',
  },
  quartermaster: {
    label: 'Quartermaster',
    perk: Object.freeze({ key: 'cargoCapMult', delta: 0.10 }),
    perkLine: 'hold capacity +10%',
  },
  gunner: {
    label: 'Gunner',
    perk: Object.freeze({ key: 'energyRegenMult', delta: 0.08 }),
    perkLine: 'gun capacitor feed +8%',
  },
  navigator: {
    label: 'Navigator',
    perk: Object.freeze({ key: 'jumpCooldownMult', delta: -0.10 }),
    perkLine: 'jump spool cooldown −10%',
  },
});

// Loyalty jobs: each candidate carries one, keyed to real bus events the system counts.
// kind → the event stream and field the counter reads; every job is completable in play.
export const LOYALTY_JOB_KINDS = Object.freeze({
  // The crew berth is the last stage, so post-hire stage events never arrive again —
  // the engineers' seam is bringing the ship home to the yard they keep.
  berth_homecomings: { event: 'dock:docked', label: 'Bring the ship home to the Long Berth' },
  trophies:     { event: 'longBerth:trophy', label: 'Park trophies in the yard' },
  kills:        { event: 'entity:killed', label: 'Fight alongside — hulls you broke' },
  missions:     { event: 'mission:completed', label: 'Fly contracts together' },
});

// The local pool: each candidate lives at a real station on the early route and hails when the
// fitted crew berth exists and the player flies near. Cast-flavored picks ride the same pool —
// a ship is only ever crew once these people choose it.
export const CREW_CANDIDATES = Object.freeze([
  Object.freeze({
    id: 'crew_bram', name: 'Bram Okafor', role: 'engineer', homeStationId: 'station_ceres',
    line: 'I welded yard tugs before they let her turn. Let me keep yours honest.',
    hireLine: 'Bram finds the tool crib before his kit bag is stowed.',
    banter: Object.freeze({
      kills: 'She holds. The weld always holds — stop testing it.',
      missions: 'Contract closed. I logged the hull wear while you shook hands.',
      stages: 'Another stage welded into her. I know every plate by name now.',
    }),
    loyaltyJob: Object.freeze({ kind: 'berth_homecomings', goal: 2 }),
    loyaltyLine: 'The berth answers to my welds now. I am not leaving her.',
  }),
  Object.freeze({
    id: 'crew_yella', name: 'Yella Ndu', role: 'quartermaster', homeStationId: 'station_helios',
    line: 'Your hold is a lie told by a lazy loader. I fix lies like that.',
    hireLine: 'Yella repacks the hold before the hatch closes. It fits better.',
    banter: Object.freeze({
      kills: 'Note the scrap coordinates — I will want the plates off that.',
      missions: 'Manifest balanced. The decimals even agreed this time.',
      trophies: 'Logged, tagged, parked. The yard reads like a ledger now.',
    }),
    loyaltyJob: Object.freeze({ kind: 'trophies', goal: 2 }),
    loyaltyLine: 'Every trophy filed. I keep books other people frame.',
  }),
  Object.freeze({
    id: 'crew_marko', name: 'Marko Vane', role: 'gunner', homeStationId: 'station_beltout',
    line: 'Guns do not miss. Feed does. I keep the feed.',
    hireLine: 'Marko is already rebalancing the capacitor feeds.',
    banter: Object.freeze({
      kills: 'Clean break. The feed never sagged once.',
      missions: 'Work done. The guns stayed warm the whole run.',
      stages: 'More bus power means hotter rails. I approve.',
    }),
    loyaltyJob: Object.freeze({ kind: 'kills', goal: 5 }),
    loyaltyLine: 'Five hulls under your guns and my feed. We work.',
  }),
  Object.freeze({
    id: 'crew_isese', name: 'Isese Ro', role: 'navigator', homeStationId: 'station_tethys',
    line: 'Every toll lane is a shape. I read the shapes.',
    hireLine: 'Isese re-plots the spool tables before her bunk is warm.',
    banter: Object.freeze({
      kills: 'Debris on the nine-mark. Routing around.',
      missions: 'That is a route closed clean. Plotting the next.',
      trophies: 'The yard grows. Home has a shape now.',
    }),
    loyaltyJob: Object.freeze({ kind: 'missions', goal: 3 }),
    loyaltyLine: 'Three runs without a wasted burn. I stay.',
  }),
  Object.freeze({
    id: 'crew_paolo', name: 'Paolo Crest', role: 'engineer', homeStationId: 'station_forge',
    line: 'Forge discipline. I do not bolt what I have not measured.',
    hireLine: 'Paolo takes the engine room like he signed for it.',
    banter: Object.freeze({
      kills: 'Impact on the four-plate seam. Already re-torqued.',
      missions: 'Clean work. The engine did not even notice.',
      stages: 'She takes load now. Real load.',
    }),
    loyaltyJob: Object.freeze({ kind: 'berth_homecomings', goal: 2 }),
    loyaltyLine: 'My torque stamps are in her ribs. Where would I go?',
  }),
  Object.freeze({
    id: 'crew_ndelo', name: 'Ndelo Quist', role: 'quartermaster', homeStationId: 'station_drift',
    line: 'Ore weighs nothing if you stack it right. I stack right.',
    hireLine: 'Ndelo chalks the hold bays in the first hour.',
    banter: Object.freeze({
      kills: 'Debris worth lifting, if we circle back.',
      missions: 'Ledger balanced. Even the inspector would smile.',
      trophies: 'Room left in the yard. Bring another home.',
    }),
    loyaltyJob: Object.freeze({ kind: 'trophies', goal: 2 }),
    loyaltyLine: 'The yard list is my best ledger yet.',
  }),
  Object.freeze({
    id: 'crew_sable', name: 'Sable Renner', role: 'gunner', homeStationId: 'station_smuggler',
    line: 'Quiet berth, loud guns. That is the whole arrangement.',
    hireLine: 'Sable checks the firing safeties twice, then smiles once.',
    banter: Object.freeze({
      kills: 'They stopped moving. That is the job.',
      missions: 'Paid work is paid work.',
      stages: 'Home armor is worth more than station armor. Keep building.',
    }),
    loyaltyJob: Object.freeze({ kind: 'kills', goal: 5 }),
    loyaltyLine: 'You shoot straight enough. I sign on.',
  }),
  Object.freeze({
    id: 'crew_verity', name: 'Verity Oldman', role: 'navigator', homeStationId: 'station_customs',
    line: 'I filed routes for the customs office. Yours will be leaner.',
    hireLine: 'Verity tapes the route strips beside the helm herself.',
    banter: Object.freeze({
      kills: 'Loud lane. I am finding us a quieter one.',
      missions: 'Route closed on the numbers. Good.',
      stages: 'A home berth changes every route I plot.',
    }),
    loyaltyJob: Object.freeze({ kind: 'missions', goal: 3 }),
    loyaltyLine: 'Your lanes make sense now. So do I, aboard.',
  }),
]);

export function crewCandidate(id) {
  return CREW_CANDIDATES.find((c) => c.id === id) || null;
}

export function crewRoleLabel(role) {
  const def = CREW_ROLES[role];
  return def ? def.label : String(role || 'crew');
}
