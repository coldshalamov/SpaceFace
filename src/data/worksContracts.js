// Works contracts — station-board jobs that are done with the rover, with machines inside a rock,
// with Field Build over a belt, or in a planet's skim band. They are ordinary campaign missions:
// accept at a berth, fly to the work, do it with your own hands, get paid where the work is done.
//
// Each job has one GOAL the mission cannot finish without, and optional BONUS terms that pay extra
// for doing it well. The bonus is where the puzzle is: bring the copper up without breaching a gas
// pocket, take the ore in as few cells as the rock allows, seat the extractor against a face that
// still has ore in it. A bonus is never a fail state — a clumsy job still pays its base.
//
// Pure data and pure functions. The mission system owns progress (src/missions/worksContractRuntime.js).
import { SECTORS } from './sectors.js';
import { COMMODITIES } from './commodities.js';
import { ROCK_GEOLOGY } from '../systems/drillFieldModel.js';
import { worksObjectiveTarget } from './worksContractWords.js';

export {
  worksBonusCr, worksBonusName, worksBonusState, worksBonusTotal, worksNextStep, worksObjectiveLine,
  worksObjectiveTarget,
} from './worksContractWords.js';

export const WORKS_CONTRACT_TYPE = 'works_contract';
export const WORKS_CONTRACT_SOURCE = 'worksContract';
/** What a repeat of an already-cleared standing job pays, as a fraction of its first payment. */
export const WORKS_REPEAT_PAY = 0.6;

const STATION_SECTOR = new Map();
const STATION_NAME = new Map();
const SECTOR_ROCKS = new Map();
for (const sector of SECTORS) {
  SECTOR_ROCKS.set(sector.id, [...new Set((sector.asteroidFields || sector.fields || []).map((f) => f && f.type).filter(Boolean))]);
  for (const station of sector.stations || []) {
    STATION_SECTOR.set(station.id, sector.id);
    STATION_NAME.set(station.id, station.name);
  }
}
const COMMODITY_NAME = new Map(COMMODITIES.map((c) => [c.id, c.name]));
export const worksGoodName = (id) => COMMODITY_NAME.get(id) || 'ore';

const MACHINE_NAME = Object.freeze({
  sm_massline_core: 'Line Core',
  sm_extractor: 'Extractor',
  sm_gas_tap: 'Gas Tap',
  sm_refinery: 'Refinery',
  sm_cargo_port: 'Cargo Port',
});
export const worksMachineName = (defId) => MACHINE_NAME[defId] || 'machine';

const job = (row) => Object.freeze({ repeat: true, bonus: Object.freeze([]), requires: Object.freeze([]), ...row });

export const WORKS_CONTRACTS = Object.freeze([
  // ── The rover: the pick of the rock ────────────────────────────────────────────────────────────
  job({
    id: 'works_helios_first_cut', rung: 'rover', stationId: 'station_helios', reward_cr: 450,
    title: 'First Cut', client: 'Helios Assay Office',
    brief: 'The assay office wants iron that came out of one seam, not swept up by a beam. Fly up to a rock, press B to set the rover down, and dig to the iron yourself.',
    summary: 'Rover job. Cut 4 iron ore by hand from any Helios rock. The laser does not count.',
    goal: { kind: 'cut', ore: 'cmdty_ore_iron', qty: 4 },
  }),
  job({
    id: 'works_beltout_light_touch', rung: 'rover', stationId: 'station_beltout', reward_cr: 700,
    title: 'Light Touch', client: 'Belt Outpost Survey',
    brief: 'The survey is going to stand machines in this rock later and every hole you leave is a face they cannot use. Bring up 10 iron and open as little rock as you can.',
    summary: 'Rover job. Cut 10 iron ore. Bonus for opening 24 cells or fewer: survey first, then dig straight to the seam.',
    goal: { kind: 'cut', ore: 'cmdty_ore_iron', qty: 10 },
    bonus: [{ kind: 'par', cells: 24, pct: 0.6 }],
  }),
  job({
    id: 'works_ceres_kroll_copper', rung: 'rover', stationId: 'station_ceres', reward_cr: 1500,
    title: 'Kroll’s Copper', client: 'Kroll, Ceres Refinery',
    brief: 'Kroll is short of copper and tired of buying it mixed with iron he has to pay to smelt off. A metallic rock keeps its copper under the iron. Go down and get it.',
    summary: 'Rover job. Cut 8 copper ore from a metallic rock. Copper needs a Mk II beam on the rig. Bonus for breaching no gas pocket.',
    goal: { kind: 'cut', ore: 'cmdty_ore_copper', qty: 8 },
    bonus: [{ kind: 'sealed', pct: 0.3 }],
    drillTier: 2,
  }),
  job({
    id: 'works_nereid_clean_water', rung: 'rover', stationId: 'station_nereid_claim', reward_cr: 1200,
    title: 'Clean Water', client: 'Shoal Claim',
    brief: 'An ice body is mostly water and the rest is gas waiting for somebody careless. The claim wants water it does not have to scrub.',
    summary: 'Rover job. Cut 14 water ice from an ice body. Bonus for breaching no gas pocket: ice bodies are full of them.',
    goal: { kind: 'cut', ore: 'cmdty_ice_water', qty: 14 },
    bonus: [{ kind: 'sealed', pct: 0.4 }],
  }),
  job({
    id: 'works_forge_long_crystal', rung: 'rover', stationId: 'station_forge', reward_cr: 1700,
    title: 'Long Crystal', client: 'Forge Foundry Optics',
    brief: 'Crystal runs down through a crystal body in long clean seams. Follow one seam instead of quarrying the rock and the foundry pays for the tidy work.',
    summary: 'Rover job. Cut 10 silica crystal from a crystal body (Mk II beam). Bonus for opening 34 cells or fewer.',
    goal: { kind: 'cut', ore: 'cmdty_crystal_silica', qty: 10 },
    bonus: [{ kind: 'par', cells: 34, pct: 0.3 }],
    drillTier: 2,
  }),
  job({
    id: 'works_hyperion_deep_seam', rung: 'rover', stationId: 'station_hyperion_claim', reward_cr: 2600,
    title: 'Deep Seam', client: 'Cut Claim Outpost',
    brief: 'Titanium sits in the heart of a metallic rock, under the iron, under the copper and under most of the basalt. The outpost pays for the trip down.',
    summary: 'Rover job. Cut 6 titanium ore from the heart of a metallic rock (Mk II beam). Bonuses for breaching no gas and for opening 70 cells or fewer.',
    goal: { kind: 'cut', ore: 'cmdty_ore_titanium', qty: 6 },
    bonus: [{ kind: 'sealed', pct: 0.25 }, { kind: 'par', cells: 70, pct: 0.25 }],
    drillTier: 2,
  }),
  job({
    id: 'works_rhea_furnace_hall', rung: 'rover', stationId: 'station_rhea_cinder', reward_cr: 2200,
    title: 'Room for a Furnace', client: 'Cinder Claim',
    brief: 'The claim needs a hall, and a hall is too much rock to bore a cell at a time. Arm bore charges (R), step out of the pattern, and open it up.',
    summary: 'Rover job. Open 24 cells with bore charges. Bonus if no blast or roof fall catches the rig.',
    goal: { kind: 'blast', qty: 24 },
    bonus: [{ kind: 'unhurt', pct: 0.3 }],
  }),

  // ── Building inside the rock: the layout puzzle ───────────────────────────────────────────────
  job({
    id: 'works_beltout_first_claim', rung: 'build', stationId: 'station_beltout', reward_cr: 800, repeat: false,
    title: 'Stake Your First Claim', client: 'Belt Outpost Claims Desk',
    brief: 'The outpost fronts the parts for one working claim. Dig a short tunnel, press B to build, seat the Line Core in a side bay and an Extractor beside it against rock you have not dug.',
    summary: 'Building job. The parts are loaded when you accept. Install a Line Core and an Extractor inside any Ceres rock. The rock is yours afterwards.',
    goal: { kind: 'installSet', defs: ['sm_massline_core', 'sm_extractor'] },
    kit: { cmdty_regocrete: 4, cmdty_control_unit: 2, cmdty_refined_metals: 1 },
  }),
  job({
    id: 'works_ceres_fat_face', rung: 'build', stationId: 'station_ceres', reward_cr: 1400, repeat: false,
    requires: ['works_beltout_first_claim'],
    title: 'A Fat Face', client: 'Kroll, Ceres Refinery',
    brief: 'An extractor is worth exactly the rock it touches. Kroll will buy from a claim whose extractor sits against six solid faces with ore in at least one of them.',
    summary: 'Building job. Install an Extractor touching 6 or more solid cells, at least 1 of them an ore vein. Dig one way in and leave the rest of the ring alone.',
    goal: { kind: 'install', defId: 'sm_extractor', contacts: { solid: 6, ore: 1 } },
  }),
  job({
    id: 'works_forge_gaslight', rung: 'build', stationId: 'station_forge', reward_cr: 1800, repeat: false,
    requires: ['works_beltout_first_claim'],
    title: 'Gaslight', client: 'Forge Foundry Power',
    brief: 'A gas pocket you breach is a hole. A gas pocket you tap is a generator that never needs fuel. Tunnel up beside one without opening it and seat a tap against it.',
    summary: 'Building job. Install a Gas Tap touching 2 or more cells of one sealed gas pocket.',
    goal: { kind: 'install', defId: 'sm_gas_tap', contacts: { gas: 2 } },
  }),
  job({
    id: 'works_ceres_standing_order', rung: 'build', stationId: 'station_ceres', reward_cr: 2400,
    requires: ['works_ceres_fat_face'],
    title: 'Standing Order', client: 'Ceres Refinery Receiving',
    brief: 'Receiving will take anything your works send, as long as it arrives without you carrying it. That means a powered Cargo Port, goods set to Ship, and a courier that gets there.',
    summary: 'Building job. Your own courier pods deliver 40 units to a station. Lost pods do not count.',
    goal: { kind: 'deliver', qty: 40 },
  }),

  // ── Field Build: the belt outside ─────────────────────────────────────────────────────────────
  job({
    id: 'works_beltout_supply_line', rung: 'yard', stationId: 'station_beltout', reward_cr: 2000, repeat: false,
    requires: ['works_beltout_first_claim'],
    title: 'Line of Supply', client: 'Belt Outpost Claims Desk',
    brief: 'One rock never has everything. Claim a second rock, open Field Build over the belt and run a cargo line between the two so one can feed the other.',
    summary: 'Field Build job (Shift+B). Join two of your claims with a cargo line.',
    goal: { kind: 'link', linkKind: 'material' },
  }),
  job({
    id: 'works_hyperion_picket', rung: 'yard', stationId: 'station_hyperion_claim', reward_cr: 1600, repeat: false,
    requires: ['works_beltout_first_claim'],
    title: 'Picket', client: 'Cut Claim Outpost',
    brief: 'A claim worth robbing gets robbed. The outpost pays the first pylon on any claim in the Cut, because a defended neighbour is a quieter night for everyone.',
    summary: 'Field Build job (Shift+B). Raise a turret pylon over one of your claims.',
    goal: { kind: 'defense' },
  }),

  // ── The planet: work the bands ────────────────────────────────────────────────────────────────
  job({
    id: 'works_tethys_skim', rung: 'planet', stationId: 'station_tethys', reward_cr: 1300,
    title: 'Skim Run', client: 'Tethys Fuel Exchange',
    brief: 'The Anvil gives hydrogen to anyone who flies its outer air with the scoop open. Hold the skim band, keep your speed up, and pull out before the hull starts to cook.',
    summary: 'Planet job. Scoop 20 hydrogen from the Anvil’s skim band. The scoop gathers by distance flown, not by time spent.',
    goal: { kind: 'skim', commodityId: 'cmdty_gas_hydrogen', qty: 20 },
  }),
  job({
    id: 'works_tethys_storm_draw', rung: 'planet', stationId: 'station_tethys', reward_cr: 2600,
    requires: ['works_tethys_skim'],
    title: 'Storm Draw', client: 'Tethys Fuel Exchange',
    brief: 'Helium-3 is only in the storm band, a short step below the skim and a long way hotter. Dip, draw, climb out, cool, and go again.',
    summary: 'Planet job. Scoop 10 helium-3 from the Anvil’s storm band. Heat builds fast there: work it in short dips.',
    goal: { kind: 'skim', commodityId: 'cmdty_gas_helium3', qty: 10 },
  }),
]);

const BY_ID = new Map(WORKS_CONTRACTS.map((row) => [row.id, row]));
export const worksContractById = (id) => BY_ID.get(id) || null;

/** Rock types in a sector whose interior carries this ore. Empty means the job cannot be done there. */
export function worksRockTypesFor(sectorId, ore) {
  return (SECTOR_ROCKS.get(sectorId) || []).filter((typeId) => {
    const profile = ROCK_GEOLOGY[typeId];
    return !!profile && (profile.starter === ore || profile.seams.some((seam) => seam.ore === ore));
  });
}

const completedCount = (state, id) => Number(state?.story?.flags?.worksContracts?.[id]) || 0;

/** Open when every job it builds on has been done at least once, and a one-off has not been done. */
export function worksContractOpen(state, row) {
  if (!row) return false;
  if (row.repeat === false && completedCount(state, row.id) > 0) return false;
  return row.requires.every((id) => completedCount(state, id) > 0);
}

/** A fresh mission payload each time: live progress never leaks back into the catalog. */
export function worksOfferFor(id, state = null) {
  const row = BY_ID.get(id);
  if (!row) return null;
  const sectorId = STATION_SECTOR.get(row.stationId);
  if (!sectorId) return null;
  const repeats = completedCount(state, row.id);
  const reward = Math.round(row.reward_cr * (repeats > 0 ? WORKS_REPEAT_PAY : 1) / 10) * 10;
  return {
    id: `offer_${row.id}`, source: WORKS_CONTRACT_SOURCE, type: WORKS_CONTRACT_TYPE,
    stationId: row.stationId, destStationId: row.stationId, destSectorId: sectorId,
    title: row.title, brief: row.brief, summary: row.summary,
    description: row.brief,
    reward_cr: reward, collateral_cr: 0, riskTier: 0,
    giverId: null, clientName: row.client,
    params: {
      works: {
        id: row.id, rung: row.rung,
        goal: JSON.parse(JSON.stringify(row.goal)),
        bonus: row.bonus.map((term) => ({ ...term })),
        baseRewardCr: reward,
        cells: 0, breaches: 0, hurt: 0, installed: [],
        rockTypes: row.goal.kind === 'cut' ? worksRockTypesFor(sectorId, row.goal.ore) : [],
        // Names are written here so the words module needs no catalog (worksContractWords.js).
        goodName: row.goal.ore ? worksGoodName(row.goal.ore)
          : row.goal.commodityId ? worksGoodName(row.goal.commodityId) : null,
        rockName: row.goal.kind === 'cut'
          ? ((types) => (types.length === 1 ? ROCK_GEOLOGY[types[0]].label.toLowerCase() : null))(worksRockTypesFor(sectorId, row.goal.ore))
          : null,
        machineNames: Object.fromEntries((row.goal.defs || (row.goal.defId ? [row.goal.defId] : []))
          .map((defId) => [defId, worksMachineName(defId)])),
        ...(row.kit ? { kit: { ...row.kit } } : {}),
        ...(row.drillTier ? { drillTier: row.drillTier } : {}),
      },
    },
    storyTag: `works:${row.id}`,
    cause: { tag: 'works', fingerprint: `works:${row.id}`, line: row.client },
  };
}

export function worksOffersForStation(stationId, state = null) {
  return WORKS_CONTRACTS.filter((row) => row.stationId === stationId && worksContractOpen(state, row))
    .map((row) => worksOfferFor(row.id, state)).filter(Boolean);
}

/** Catalog self-check for tests and the data lint: every cut job can be done where it is posted. */
export function validateWorksContracts() {
  const errors = [];
  for (const row of WORKS_CONTRACTS) {
    const sectorId = STATION_SECTOR.get(row.stationId);
    if (!sectorId) { errors.push(`${row.id}: station ${row.stationId} is not on the map`); continue; }
    if (row.goal.kind === 'cut' && !worksRockTypesFor(sectorId, row.goal.ore).length) {
      errors.push(`${row.id}: no rock in ${sectorId} carries ${row.goal.ore}`);
    }
    for (const need of row.requires) if (!BY_ID.has(need)) errors.push(`${row.id}: requires unknown job ${need}`);
    if (!(row.reward_cr > 0)) errors.push(`${row.id}: no reward`);
  }
  return errors;
}

export const worksStationName = (stationId) => STATION_NAME.get(stationId) || 'the station';
