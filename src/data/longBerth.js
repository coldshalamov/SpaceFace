// Row 445 GOLD-HOME — the Long Berth: the abandoned yard tug (`worldOneOffs.js`) becomes home.
// Data-only contracts; the registered owner is src/systems/longBerth.js.

export const LONG_BERTH_ONEOFF_ID = 'oneoff_abandoned_tug';
export const LONG_BERTH_STATION_ID = 'station_long_berth';
export const LONG_BERTH_NAME = 'The Long Berth';

// How close the player must be to the tug for the claim verb to hold, and the yard radius that
// counts a released towed body as a parked trophy.
export const BERTH_CLAIM_RANGE_WU = 320;
export const BERTH_YARD_RADIUS_WU = 150;
export const BERTH_DOCK_RADIUS_WU = 90;
export const BERTH_MARKER_OFFSET_WU = 46;

// Three real stages. Each cost is charged through the economy/cargo single writers; each stage
// grants a capability the berth does not have before it — the restore is paid work, not a flag.
export const BERTH_STAGES = Object.freeze([
  Object.freeze({
    stage: 1,
    key: 'made_fast',
    label: 'Make her fast',
    verb: 'Anchor the tug, plate over the worst of her',
    cost: Object.freeze({ credits: 800 }),
    grants: Object.freeze(['berth']),
    services: Object.freeze([]),
    line: 'She stops turning. Mooring points welded, a beacon lit — she is home enough to dock.',
  }),
  Object.freeze({
    stage: 2,
    key: 'powered',
    label: 'Run the yard bus',
    verb: 'Cable her to a live bus and light the yard',
    cost: Object.freeze({ credits: 2400, cargo: Object.freeze({ cmdty_alloys: 2 }) }),
    grants: Object.freeze(['berth', 'yard']),
    services: Object.freeze([]),
    line: 'Power on the hardpoints. The yard flood lights the drift — trophies stay put under her lamps.',
  }),
  Object.freeze({
    stage: 3,
    key: 'fitted',
    label: 'Fit the berths',
    verb: 'Hang a crew berth, a pump and a patch rail',
    cost: Object.freeze({ credits: 5200, cargo: Object.freeze({ cmdty_alloys: 4, cmdty_fuel_cells: 2 }) }),
    grants: Object.freeze(['berth', 'yard', 'crew', 'refuel', 'repair']),
    services: Object.freeze(['refuel', 'repair']),
    line: 'A crew berth over the hold, fuel in the standpipe, a rail that patches scars. The Long Berth works.',
  }),
]);

export function berthStageDef(stage) {
  return BERTH_STAGES.find((row) => row.stage === stage) || null;
}

export function berthGrant(stage, key) {
  const def = berthStageDef(stage);
  return !!(def && def.grants.includes(key));
}

// Trophy eligibility: a body counts only if it was physically towed (tether:latched seen for its
// durable identity) and now sits released inside the yard radius. Kinds stay broad — boss plates,
// famous wrecks, machinery — anything the Massline can drag is fair game.
export function berthTrophyLabel(entity) {
  const d = entity && entity.data || {};
  return d.name || d.oneOffId || d.worldRecordId || `hulk ${entity.id}`;
}
