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
});

export function racingSetPieceDefinitions(courseId) { return RACING_SET_PIECES[courseId] || null; }
