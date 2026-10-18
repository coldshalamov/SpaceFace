// LG-STARTER-JOBS (row 280). Three opening chains, one per starter hull, posted on the
// ordinary Helios board. Each step pays only when that hull's own fit is aboard: the Hitch
// swings, the Pelican winches, the Wasp rams. Another hull can read the row and still be
// refused at accept.

export const STARTER_JOBS = Object.freeze([
  Object.freeze({
    id: 'starter_hitch',
    shipId: 'ship_kestrel',
    requiredModule: 'mod_drill_amp',
    steps: Object.freeze([
      Object.freeze({ step: 1, type: 'mining_quota', title: 'Hold the rich core and cut the beacon rock', cmdtyId: 'cmdty_ore_iron', qty: 2, rewardCr: 420 }),
      Object.freeze({ step: 2, type: 'mining_quota', title: 'Hold the rich core and cut the second seam', cmdtyId: 'cmdty_ore_iron', qty: 2, rewardCr: 640 }),
    ]),
  }),
  Object.freeze({
    id: 'starter_pelican',
    shipId: 'ship_pelican',
    requiredModule: 'mod_winch_hd',
    steps: Object.freeze([
      Object.freeze({ step: 1, type: 'tow_recovery', title: 'Tow the yard buoy home', rewardCr: 520 }),
      Object.freeze({ step: 2, type: 'tow_recovery', title: 'Tow the second buoy home', rewardCr: 760 }),
    ]),
  }),
  Object.freeze({
    id: 'starter_wasp',
    shipId: 'ship_wasp',
    requiredModule: 'mod_ram_plate',
    steps: Object.freeze([
      Object.freeze({ step: 1, type: 'bounty_hunt', title: 'Ram the gate runner', runnerName: 'Nim Gatecut', rewardCr: 480 }),
      Object.freeze({ step: 2, type: 'bounty_hunt', title: 'Ram the second runner', runnerName: 'Joss Wire', rewardCr: 720 }),
    ]),
  }),
]);

export function starterJobForShip(shipId) {
  return STARTER_JOBS.find((job) => job.shipId === shipId) || null;
}

export function starterJobStepsDone(state, jobId) {
  const bag = state && state.missions && state.missions.starterJobStep;
  const n = bag && bag[jobId];
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function nextStarterStep(state, shipId) {
  const job = starterJobForShip(shipId);
  if (!job) return null;
  const step = job.steps[starterJobStepsDone(state, job.id)];
  return step ? { job, step } : null;
}

export function activeOwnedShip(state) {
  const player = state && state.player;
  if (!player || !Array.isArray(player.ownedShips) || !player.ownedShips.length) return null;
  const index = Number.isInteger(player.activeShipIndex) ? player.activeShipIndex : 0;
  return player.ownedShips[index] || player.ownedShips[0] || null;
}

export function shipCarriesModule(ship, moduleId) {
  return !!(ship && Array.isArray(ship.fittings) && ship.fittings.includes(moduleId));
}

/** The Wasp opening writ is a ram. Null for every other contract. */
export function starterRamSentence(params) {
  if (!params || params.requiredModule !== 'mod_ram_plate') return null;
  const who = typeof params.markName === 'string' && params.markName
    ? params.markName
    : 'the runner';
  return `Ram ${who} — guns do not count`;
}

/** What the runner says when the Wasp closes. Null for every other writ. */
export function starterRamHail(params) {
  if (!starterRamSentence(params)) return null;
  return 'Put the plate on this hull. A gun is just noise.';
}

/**
 * True when a kill receipt is the Ram Plate. The live combat kill publishes the
 * plate on `presentation.impactLink.tag` and drops `weaponId` from that frozen
 * link. A hand-emitted `weaponId` / `tag` still counts so older proofs stay valid.
 * A tow-flail tag does not.
 */
export function starterRamKill(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const presentation = payload.presentation && typeof payload.presentation === 'object'
    ? payload.presentation
    : null;
  const link = presentation && presentation.impactLink && typeof presentation.impactLink === 'object'
    ? presentation.impactLink
    : null;
  const names = [
    payload.weaponId,
    payload.tag,
    presentation && presentation.weaponId,
    payload.provenance && payload.provenance.weaponId,
    payload.provenance && payload.provenance.tag,
    link && link.weaponId,
    link && link.tag,
  ];
  for (const name of names) {
    if (name === 'mod_ram_plate' || name === 'ram_plate') return true;
  }
  return false;
}
