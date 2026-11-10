// Fixed race-clock schedules, identical in time trial, race and cup. Commands
// never react to the player's position, placing or chosen difficulty.

// Pilot-decision geometry for a rival's real rope swing: how far back from the
// served checkpoint the latch may happen, how far along the outgoing leg the
// rope is held, and the hard hold ceiling. The standard tether's own reach,
// spring, capture and break behavior stay in the combat attachment authority.
const RIVAL_LINE = Object.freeze({ entryBackWU: 180, releaseAheadWU: 60, maxHoldS: 4 });
// Per-anchor override: a swing pays only when its geometry matches the apex it serves —
// a tight hairpin wants the rope held farther down the outgoing leg than a sweeper does.
// Falls back to RIVAL_LINE fieldwise so a partial override still reads the shared shape.
const anchor = (id, name, gateIndex, line = null) => Object.freeze({ id, name, gateIndex,
  rivalLine: line ? Object.freeze({ ...RIVAL_LINE, ...line }) : RIVAL_LINE });
const rivalAnchors = (mira, rook, sable) => Object.freeze({
  mira: Object.freeze(mira), rook: Object.freeze(rook), sable: Object.freeze(sable),
});

export const RACING_SET_PIECES = Object.freeze({
  circuit_helios_belt: Object.freeze({
    anchors: Object.freeze([
      anchor('quarry_hook', 'Quarry Hook', 6),
      anchor('return_knuckle', 'Return Knuckle', 9),
    ]),
    rivalAnchors: rivalAnchors(
      ['quarry_hook', 'return_knuckle'],
      ['return_knuckle', 'quarry_hook'],
      ['return_knuckle', 'quarry_hook'],
    ),
    crossing: Object.freeze({ id: 'textile_workfleet', name: 'Textile workfleet crossing',
      legIndex: 10, fraction: 0.6, warningS: 8, startsAtS: 42, lateralWU: 82,
      waitBackWU: 185, waitRadiusWU: 42, hullId: 'ship_mule' }),
  }),
  circuit_tethys_tally: Object.freeze({
    anchors: Object.freeze([
      anchor('tally_pivot', 'Tally Pivot', 7),
      anchor('berth_hook', 'South Berth Hook', 10),
    ]),
    rivalAnchors: rivalAnchors(
      ['tally_pivot', 'berth_hook'],
      ['berth_hook', 'tally_pivot'],
      ['tally_pivot', 'berth_hook'],
    ),
    shutter: Object.freeze({ id: 'tally_customs_shutter', name: 'Tally customs shutter',
      legIndex: 6, fraction: 0.5, warningS: 8, startsAtS: 12, opensAtS: 32,
      openLateralWU: -116, closedLateralWU: -52, radiusWU: 25, mass: 600,
      maxAccelWU: 8, maxSpeedWU: 12, serviceLateralWU: 32, serviceWidthWU: 96,
      waitBackWU: 100, waitRadiusWU: 40 }),
  }),
  circuit_veil_wash: Object.freeze({
    anchors: Object.freeze([
      anchor('cold_wake_anchor', 'Cold Wake Anchor', 3, { entryBackWU: 220, releaseAheadWU: 180, maxHoldS: 7 }),
      anchor('orchard_slingshot', 'Orchard Slingshot', 6, { entryBackWU: 220, releaseAheadWU: 180, maxHoldS: 7 }),
    ]),
    rivalAnchors: rivalAnchors(
      ['cold_wake_anchor', 'orchard_slingshot'],
      ['orchard_slingshot', 'cold_wake_anchor'],
      ['cold_wake_anchor', 'orchard_slingshot'],
    ),
    wave: Object.freeze({ id: 'veil_shedding', name: 'Veil debris wash',
      legIndex: 6, fraction: 0.58, warningS: 8, startsAtS: 44,
      lateralWU: 76, offsetsWU: Object.freeze([-190, 0, 190]), speedWU: 42,
      waitBackWU: 390, waitRadiusWU: 46, lifetimeS: 10 }),
  }),

  // ── AL-RACE-2 sector circuits — two named rope anchors per course plus each
  // rival's anchor ordering. Sector hazard cues are projected live by
  // missions/racingSectorHazards.js; only physical anchors live here.
  circuit_pallas_reef: Object.freeze({
    anchors: Object.freeze([
      // Gate 7's ~90° bank out of the reef mouth, and gate 9's high return hook.
      anchor('surge_knuckle', 'Surge Knuckle', 7),
      anchor('calmwater_hook', 'Calmwater Hook', 9),
    ]),
    rivalAnchors: rivalAnchors(
      ['surge_knuckle', 'calmwater_hook'],
      ['calmwater_hook', 'surge_knuckle'],
      ['surge_knuckle', 'calmwater_hook'],
    ),
  }),
  circuit_vesta_furnace: Object.freeze({
    anchors: Object.freeze([
      // Gate 8 exits the storm sheet; gate 9 is the foundry hairpin — hold the
      // rope longer down the return leg than the shared line allows.
      anchor('sheet_hook', 'Sheet Hook', 8),
      anchor('furnace_pivot', 'Furnace Pivot', 9, { releaseAheadWU: 200, maxHoldS: 6 }),
    ]),
    rivalAnchors: rivalAnchors(
      ['sheet_hook', 'furnace_pivot'],
      ['furnace_pivot', 'sheet_hook'],
      ['sheet_hook', 'furnace_pivot'],
    ),
  }),
  circuit_ceres_sluice: Object.freeze({
    anchors: Object.freeze([
      // Gate 6 sits mid-cone; gate 8 is the sluice-mouth hairpin reversal.
      anchor('current_hook', 'Current Hook', 6),
      anchor('sluice_pivot', 'Sluice Pivot', 8, { releaseAheadWU: 200, maxHoldS: 6 }),
    ]),
    rivalAnchors: rivalAnchors(
      ['current_hook', 'sluice_pivot'],
      ['sluice_pivot', 'current_hook'],
      ['current_hook', 'sluice_pivot'],
    ),
  }),
  circuit_haumea_fissure: Object.freeze({
    anchors: Object.freeze([
      // Gate 5 shoulders the fissure cracker; gate 8 banks the south descent.
      anchor('fissure_hook', 'Fissure Hook', 5),
      anchor('blue_ice_pivot', 'Blue Ice Pivot', 8),
    ]),
    rivalAnchors: rivalAnchors(
      ['fissure_hook', 'blue_ice_pivot'],
      ['blue_ice_pivot', 'fissure_hook'],
      ['fissure_hook', 'blue_ice_pivot'],
    ),
  }),
  circuit_kepler_scar: Object.freeze({
    anchors: Object.freeze([
      // Gate 4 tops the debris arc; gate 5 reverses into the scar descent.
      anchor('debris_hook', 'Debris Hook', 4),
      anchor('scar_pivot', 'Scar Pivot', 5, { releaseAheadWU: 200, maxHoldS: 6 }),
    ]),
    rivalAnchors: rivalAnchors(
      ['debris_hook', 'scar_pivot'],
      ['scar_pivot', 'debris_hook'],
      ['debris_hook', 'scar_pivot'],
    ),
  }),
  circuit_sker_wreckrun: Object.freeze({
    anchors: Object.freeze([
      // Gates 5-6 are the Throne pass inside the east approach bank.
      anchor('wreck_pivot', 'Wreck Pivot', 5),
      anchor('throne_hook', 'Throne Hook', 6),
    ]),
    rivalAnchors: rivalAnchors(
      ['wreck_pivot', 'throne_hook'],
      ['throne_hook', 'wreck_pivot'],
      ['wreck_pivot', 'throne_hook'],
    ),
  }),
});

export function racingSetPieceDefinitions(courseId) { return RACING_SET_PIECES[courseId] || null; }
