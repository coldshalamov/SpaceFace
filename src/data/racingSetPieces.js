// Fixed race-clock schedules, identical in time trial, race and cup. Commands
// never react to the player's position, placing or chosen difficulty.
export const RACING_SET_PIECES = Object.freeze({
  circuit_helios_belt: Object.freeze({
    anchors: Object.freeze([
      Object.freeze({ id: 'quarry_hook', name: 'Quarry Hook', gateIndex: 6 }),
      Object.freeze({ id: 'return_knuckle', name: 'Return Knuckle', gateIndex: 9 }),
    ]),
    crossing: Object.freeze({ id: 'textile_workfleet', name: 'Textile workfleet crossing',
      legIndex: 10, fraction: 0.6, warningS: 8, startsAtS: 42, lateralWU: 82,
      waitBackWU: 185, waitRadiusWU: 42, hullId: 'ship_mule' }),
  }),
  circuit_tethys_tally: Object.freeze({
    anchors: Object.freeze([
      Object.freeze({ id: 'tally_pivot', name: 'Tally Pivot', gateIndex: 7 }),
      Object.freeze({ id: 'berth_hook', name: 'South Berth Hook', gateIndex: 10 }),
    ]),
    shutter: Object.freeze({ id: 'tally_customs_shutter', name: 'Tally customs shutter',
      legIndex: 6, fraction: 0.5, warningS: 8, startsAtS: 12, opensAtS: 32,
      openLateralWU: -116, closedLateralWU: -52, radiusWU: 25, mass: 600,
      maxAccelWU: 8, maxSpeedWU: 12, serviceLateralWU: 32, serviceWidthWU: 96,
      waitBackWU: 100, waitRadiusWU: 40 }),
  }),
  circuit_veil_wash: Object.freeze({
    anchors: Object.freeze([
      Object.freeze({ id: 'cold_wake_anchor', name: 'Cold Wake Anchor', gateIndex: 3 }),
      Object.freeze({ id: 'orchard_slingshot', name: 'Orchard Slingshot', gateIndex: 6 }),
    ]),
    wave: Object.freeze({ id: 'veil_shedding', name: 'Veil debris wash',
      legIndex: 6, fraction: 0.58, warningS: 8, startsAtS: 44,
      lateralWU: 76, offsetsWU: Object.freeze([-190, 0, 190]), speedWU: 42,
      waitBackWU: 390, waitRadiusWU: 46, lifetimeS: 10 }),
  }),
});

export function racingSetPieceDefinitions(courseId) { return RACING_SET_PIECES[courseId] || null; }
