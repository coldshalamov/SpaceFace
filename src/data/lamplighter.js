// src/data/lamplighter.js — LAMPLIGHTER / LL-6, who relights the dead rim buoys
// (W-SHIFT row 506, 03 §4.3). Sedna Dark is the unlit rim — "sensors, patches, no
// fuel," and a route the dark never let anyone finish. Its lane buoys died with the
// route. LL-6 keeps the relighting: tow a dead buoy into its arms and it plants the
// relit lamp on the old lane path, one light per buoy, and the rim *stays* lit —
// planted lamps are sector furniture that survives the save and the return trip.
export const LAMPLIGHTER = Object.freeze({
  sectorId: 'sector_sedna_dark',
  // The relight post on the dark rim, south of the survey post and near the
  // unfinished route The Pin still points at (station_sedna -480,620; The Pin 700,-480).
  post: Object.freeze({ x: 200, z: -800 }),
  // Its arms: a dead buoy parked inside this ring is accepted and consumed.
  armRadius: 60,
  // The dead stock: six dead buoys drifting the rim, at deterministic bearings out
  // from the post. They are scenery until a hand moves them — durable, and a buoy
  // shot to pieces is replaced by the sector, the way a dead lane marker persists.
  deadCount: 6,
  deadScatterRadius: 900,
  deadBearingStart: 0.4,
  deadBearingStep: 0.9,
  // The lane path: six slots stepping from the post toward the unfinished route,
  // along one bearing at even spacing. Lit lamps fill slot 0,1,2... in order —
  // one slot per stocked buoy, so the sixth light is the last buoy (07 E-37).
  slotCount: 6,
  slotBearing: 0.65,
  slotSpacing: 320,
  // The robot holds the relight post; shoved off it, it walks home through the
  // impulse membrane like the bazaar's door robot (a live dynamic body — never
  // a direct vel write).
  leashRadius: 50,
  driftSpeed: 20,
  // story.flags.lamplighter_lit is a BITMASK of lit slots, not a count: a lamp
  // shot out leaves a dark hole in the record, and the next delivered buoy
  // replants the lowest dark slot. `lit` is a count in the durable ledger;
  // the slots are the seats.
  litFlag: 'lamplighter_lit',
  // Set once the last slot lights — the durable receipt that the path was
  // finished. It stays set: the rim HAVING lit is the record, even if a later
  // act of vandalism puts one lamp out.
  rimFlag: 'lamplighter_rimLit',
  // Kill the lamplighter and the rim keeps its planted lamps (they are furniture,
  // not the robot's breath) but nothing ever accepts a buoy again — durable.
  goneFlag: 'lamplighter_gone',
  sender: 'LAMPLIGHTER / LL-6',
  callsign: 'LL-6',
  announce: 'LL-6 on the rim. The lane buoys are dead and the route is dark. Tow me a buoy — any buoy — and the dark gets smaller.',
  // Canon payoff line: "One more light. The dark is smaller."
  litLine: 'One more light. The dark is smaller.',
  rimLine: 'THE RIM HOLDS. THE DARK IS SMALLER.',
  goneLine: 'LL-6 OUT. THE LIGHTS STAY. THE DARK KEEPS THE REST.',
});
