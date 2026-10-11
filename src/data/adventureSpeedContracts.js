// Station-board speed jobs reuse the authored gate/crossing owner. They are ordinary campaign
// missions, not temporary circuit launches; the trip from the berth to the start is unscored.
import { courseForLevel, raceLevelById } from './raceLevels.js';

export const ADVENTURE_SPEED_SOURCE = 'adventureSpeed';

export const ADVENTURE_SPEED_CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'speed_helios_cut', levelId: 'level_textile_outbound', kind: 'escape',
    title: 'Outrun the Cut', reward_cr: 1600,
    brief: 'Helios is closing the belt for a demolition sweep. Cross the start marker to open your escape window. Each safe gate extends it; stopping too long closes the route.',
    summary: 'Belt escape. Clear each gate before the escape margin runs out. The clock starts at the first gate.',
    initialWindowS: 14, maxBankS: 20, referenceSpeed: 240, gateGraceS: 1.6,
    failureReason: 'speed_sweep_caught', failureText: 'The demolition exclusion window caught your route. Return to Helios for another run.',
  }),
  Object.freeze({
    id: 'speed_tethys_window', levelId: 'level_junction_return', kind: 'windows',
    title: 'Last Open Window', reward_cr: 1900,
    brief: 'Customs has reserved one closing corridor for an evacuation-key run. Every gate has a deadline. Cross the last marker below 240 wu/s so dispatch can complete the handoff.',
    summary: 'Beat the closing customs windows, then brake below 240 wu/s for the final marker. Timing begins at the first gate.',
    initialWindowS: 12, referenceSpeed: 220, gateGraceS: 1.8, finishSpeedLimit: 240,
    failureReason: 'speed_window_closed', failureText: 'The customs window closed before you cleared it. Tethys can issue another passage.',
  }),
  Object.freeze({
    id: 'speed_veil_wake', levelId: 'level_veil_ribbon', kind: 'wake',
    title: 'Follow the Cold Wake', reward_cr: 2100,
    brief: 'A projected pace light marks a rescue corridor through the Veil. Sit in its slipstream for a push, use the burn ring, and clear the final marker before the safe passage expires.',
    summary: 'Follow the projected pace light through the wash, then finish before the passage closes. The clock starts at the first gate.',
    initialWindowS: 16, referenceSpeed: 250, gateGraceS: 1.3, boostGateIndex: 2,
    failureReason: 'speed_passage_expired', failureText: 'The safe passage expired. Return to the Veil berth to request another rescue window.',
  }),
  Object.freeze({
    id: 'speed_helios_cold_chain', levelId: 'level_textile_outbound', kind: 'thermal',
    title: 'The Cold Chain', reward_cr: 2400, routeGateCount: 8,
    brief: 'Carry eight sealed medical packs through the belt. Radiation arrives from the west: shelter on the east side of rocks, wrecks or stations to cool the load. Boost and travel burn heat it faster. Heat above 75 damages quality and spoils real packs; deliver what survives before the corridor closes.',
    summary: 'Medical delivery. Trade a fast exposed burn for cooling behind solid cover; temperature and pack quality are shown in flight.',
    initialWindowS: 20, referenceSpeed: 100, gateGraceS: 4,
    failureReason: 'speed_cold_chain_expired', failureText: 'The medical corridor closed. The sealed load has been recalled; Helios can issue a fresh delivery.',
  }),
  Object.freeze({
    id: 'speed_tethys_lifeline', levelId: 'level_junction_return', kind: 'rescue',
    title: 'Lifeline Through the Queue', reward_cr: 2800, routeGateCount: 6,
    brief: 'A marked evacuation pod waits before the first gate. Attach the Massline and physically tow the pod through every marker. Its life-support clock starts at the first crossing. Bring both pod and ship through the final handoff below 65 wu/s; flying the route alone earns nothing.',
    summary: 'Tow the marked evacuation pod through six gates. Keep the line attached and brake both bodies below 65 wu/s at the final handoff.',
    initialWindowS: 30, referenceSpeed: 75, gateGraceS: 6, finishSpeedLimit: 65,
    failureReason: 'speed_lifeline_expired', failureText: 'The pod missed its life-support transfer window. Tethys will dispatch another rescue contract.',
  }),
  Object.freeze({
    id: 'speed_veil_listener', levelId: 'level_veil_ribbon', kind: 'listening',
    title: 'Run Quiet, Run Deep', reward_cr: 2600, routeGateCount: 8,
    brief: 'A Corsair listens along the Veil route. Ordinary thrust and coasting stay quiet; boost, travel burn and gunfire build exposure within 1600 wu. At full exposure it hunts with live weapons. Coast beyond 700 wu for eight quiet seconds to lose the search, or fight it. Clear every marker and hand off below 140 wu/s before the window closes.',
    summary: 'A real listening hunter. Choose quiet thrust and detours or expose yourself with a fast burn; slow below 140 wu/s at handoff.',
    initialWindowS: 35, referenceSpeed: 95, gateGraceS: 5, finishSpeedLimit: 140,
    failureReason: 'speed_listener_expired', failureText: 'The quiet transfer window closed. The Veil berth can arrange another run.',
  }),
]);

const BY_ID = new Map(ADVENTURE_SPEED_CONTRACTS.map(row => [row.id, row]));
const round = value => Math.round(value * 100) / 100;

/** Fresh mission payload each time: mutable race/pressure state never leaks back into the catalog. */
export function adventureSpeedOfferFor(id) {
  const row = BY_ID.get(id);
  if (!row) return null;
  const level = raceLevelById(row.levelId), course = courseForLevel(row.levelId);
  if (!level || !course) return null;
  // Drop the two closing approach gates. An escape ends across the sector, without demanding a
  // return lap into the place the pilot just escaped. Geometry and terrain remain the real circuit.
  const gates = course.gates.slice(0, row.routeGateCount || -2).map(gate => ({ x: gate.x, z: gate.z }));
  const legBudgetsS = [0], gateDeadlinesS = [0];
  let length = 0, time = row.initialWindowS;
  for (let i = 1; i < gates.length; i++) {
    const distance = Math.hypot(gates[i].x - gates[i - 1].x, gates[i].z - gates[i - 1].z);
    length += distance;
    const budget = distance / row.referenceSpeed + row.gateGraceS;
    legBudgetsS.push(round(budget));
    time += budget;
    gateDeadlinesS.push(round(time));
  }
  const params = {
    adventureSpeedId: row.id,
    adventureSpeed: {
      kind: row.kind, initialWindowS: row.initialWindowS, maxBankS: row.maxBankS || 0,
      legBudgetsS, gateDeadlinesS, totalWindowS: round(time),
      finishSpeedLimit: row.finishSpeedLimit || 0,
      failureReason: row.failureReason, failureText: row.failureText,
    },
    adventureSpeedHint: 'Reach the start marker. The pressure clock begins when you cross it.',
    racingContractId: row.id, racingKind: row.kind === 'wake' ? 'draft' : 'adventure',
    levelId: level.id, terrain: level.terrain, courseId: `adventure_${row.id}`, courseName: row.title,
    courseKind: 'sprint', courseRevision: 1, courseSectorId: level.sectorId,
    closedCircuit: false, laps: 1, gates, gateRadiusWU: course.gateRadiusWU,
    courseLengthWU: round(length), recordS: Math.max(12, Math.round(length / 360)),
    bandCapsS: [Math.max(14, Math.round(time * 0.65)), Math.round(time)],
    nextGate: 0, gridHoldS: 0, raceLease: true,
    gridLine: 'Fly to the start marker. Crossing it begins the timed passage.',
  };
  if (row.kind === 'thermal') {
    params.cmdtyId = 'cmdty_medical'; params.qty = 8;
    params.adventureSpeed.thermal = { units: 8, startTemperature: 20, safeTemperature: 75,
      exposedHeatPerS: 1.5, burnHeatPerS: 5, coolingPerS: 12, qualityLossPerS: 4,
      shelterReachWU: 180, radiationDirection: { x: 1, z: 0 } };
    params.adventureSpeedHint = 'Eight sealed medical packs aboard. Reach the start; east sides of solid cover cool the load.';
    params.raceLease = false;
  }
  if (row.kind === 'rescue') {
    params.adventureSpeed.rescue = { podMass: 40, podRadius: 9, podHull: 180, minTowedWU: 30 };
    params.adventureSpeedHint = 'Find the marked evacuation pod before gate 1. Attach the Massline and tow it through the route.';
    params.raceLease = false;
  }
  if (row.kind === 'listening') {
    params.adventureSpeed.listener = { enemyTypeId: 'corsair_raider', hearingRangeWU: 1600,
      boostExposurePerS: 40, weaponExposurePerS: 70, quietDecayPerS: 16,
      loseRangeWU: 700, quietSearchS: 8 };
    params.adventureSpeedHint = 'Reach the start. Ordinary thrust is quiet; boost and gunfire give the listener your position.';
    params.raceLease = false;
  }
  if (Number.isInteger(row.boostGateIndex)) params.boostGateIndex = row.boostGateIndex;
  return {
    id: `offer_${row.id}`, source: ADVENTURE_SPEED_SOURCE, type: 'race',
    stationId: level.stationId, destStationId: level.stationId, destSectorId: level.sectorId,
    title: row.title, brief: row.brief, summary: row.summary,
    reward_cr: row.reward_cr, time_limit_s: 900, duration_s: 900, collateral_cr: 0,
    riskTier: 0, preloadedCargo: row.kind === 'thermal', distance: Math.round(length), params,
    storyTag: `speed:${row.id}`,
    cause: { tag: 'race', fingerprint: `speed:${row.id}`, levelId: level.id, terrain: level.terrain },
  };
}

export function adventureSpeedOffersForStation(stationId) {
  return ADVENTURE_SPEED_CONTRACTS
    .filter(row => raceLevelById(row.levelId)?.stationId === stationId)
    .map(row => adventureSpeedOfferFor(row.id));
}
