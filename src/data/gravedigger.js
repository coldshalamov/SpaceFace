// src/data/gravedigger.js — GRAVEDIGGER / UG-4, the Understory machine that
// buries wrecks into gardens (W-SHIFT row 506, 03 §4.3). Eunomia Gulf is a
// wreck field and the ground keeps its own ledger. UG-4 races you for loose
// hulls — any unmarked wreck the field gives up, it runs down and puts IN THE
// GROUND: consumed, planted, a garden bed that stands where the wreck lay.
// Three burials earns the lesson: bring a wreck to the pit at its feet and
// the ground pays you back — composting, the verb the machine was built to
// teach. 'Everything goes in the ground. Even the ground.'
export const GRAVEDIGGER = Object.freeze({
  sectorId: 'sector_eunomia_gulf',
  // The garden plot on open gulf floor (station_eunomia 640,-420; the gulf
  // spreads its wreck field west of the board).
  post: Object.freeze({ x: -300, z: 60 }),
  // The pit: post-teach, a wreck parked settled inside this ring at the robot's
  // feet is an offering the ground pays for.
  pitRadius: 95,
  // The race: any eligible wreck inside pursuit range is a body the machine
  // intends to reach first. Burying still needs the wreck settled — a hull
  // under tow or under beam is the player's, not the field's.
  pursueRadius: 900,
  buryRadius: 60,
  settleSpeed: 30,
  chaseSpeed: 74,
  // The plot: beds persist as a flag ledger of spots+serials, respawned on
  // entry the way planted lamps respawn. The plot caps; past it the ground
  // still takes offerings into the old beds.
  gardenMax: 10,
  teachAfter: 3,
  compostFee: 120,
  // story flags: the garden ledger, the serial, the lesson, the durability —
  // and the memorial ledger itself, which rides the flags bag because the save
  // envelope serializes state.story (the missions slot) and never names
  // state.gravedigger.
  gardensFlag: 'gravedigger_gardens',
  serialFlag: 'gravedigger_serial',
  taughtFlag: 'gravedigger_taught',
  goneFlag: 'gravedigger_gone',
  ledgerFlag: 'gravedigger_ledger',
  sender: 'GRAVEDIGGER / UG-4',
  callsign: 'UG-4',
  announce: 'UG-4 on the gulf floor. The wrecks belong to the ground. I only do the digging.',
  buryLine: 'IN THE GROUND.',
  teachLine: 'You chase the same wrecks I do. Fine. Bring one to my pit. Release your line, stop your beam, let it settle. The ground pays you back. Everything goes in the ground. Even the ground.',
  compostLine: 'GOOD. THE GROUND TAKES IT BACK.',
  fullLine: 'THE BEDS ARE FULL. THE GROUND STILL TAKES IT.',
  goneLine: 'UG-4 DOWN. THE GARDEN KEEPS GROWING WITHOUT HANDS.',
});
