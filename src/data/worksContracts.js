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
    summary: 'Rover job. Cut 10 silica crystal from a crystal body (Mk II beam). Bonus for opening 22 cells or fewer.',
    goal: { kind: 'cut', ore: 'cmdty_crystal_silica', qty: 10 },
    bonus: [{ kind: 'par', cells: 22, pct: 0.3 }],
    drillTier: 2,
  }),
  job({
    id: 'works_hyperion_deep_seam', rung: 'rover', stationId: 'station_hyperion_claim', reward_cr: 2600,
    title: 'Deep Seam', client: 'Cut Claim Outpost',
    brief: 'Titanium sits in the heart of a metallic rock, under the iron, under the copper and under most of the basalt. The outpost pays for the trip down.',
    summary: 'Rover job. Cut 6 titanium ore from the heart of a metallic rock (Mk II beam). Bonuses for breaching no gas and for opening 54 cells or fewer.',
    goal: { kind: 'cut', ore: 'cmdty_ore_titanium', qty: 6 },
    bonus: [{ kind: 'sealed', pct: 0.25 }, { kind: 'par', cells: 54, pct: 0.25 }],
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

  // ── The rest of the galaxy: boards beyond the starter belts ─────────────────────────────────
  job({
    id: 'works_coalition_two_rocks', rung: 'build', stationId: 'station_coalition', reward_cr: 1100, repeat: false,
    requires: ['works_beltout_first_claim'],
    title: 'Two Rocks on the Books', client: 'Coalition HQ Claims Desk',
    brief: 'Concord registers claims it can find again. Stake two anchored claims in Helios Prime so the desk has rocks on its chart near the home berths, not just names in a log.',
    summary: 'Building job. Hold 2 anchored claims in Helios Prime at once. A rock with only a tunnel in it does not count. The first machine you build anchors each rock.',
    goal: { kind: 'claims', qty: 2 },
  }),
  job({
    id: 'works_customs_deep_stamp', rung: 'rover', stationId: 'station_customs', reward_cr: 1350,
    title: 'Deep Stamp', client: 'Customs Gate Assay',
    brief: 'Customs keeps seizing shallow nickel and calling it deep ore. The assay desk wants nickel cut from the far side of a common rock so its stamp means something next time.',
    summary: 'Rover job. Cut 8 nickel ore by hand from deep in a common rock (Mk II beam). Shallow cuts and laser ore do not count. Bonus for breaching no gas pocket.',
    goal: { kind: 'cut', ore: 'cmdty_ore_bronzium', qty: 8, minDepth: 0.55 },
    bonus: [{ kind: 'sealed', pct: 0.3 }],
    drillTier: 2,
  }),
  job({
    id: 'works_vesta_yard_titanium', rung: 'rover', stationId: 'station_vesta_outlying_yard', reward_cr: 2100,
    title: 'Yard Titanium', client: 'Forge Outlying Yard',
    brief: 'The yard builds berths out of titanium and is short again. Titanium sits in the heart of a metallic rock, under the iron and copper, and the yard pays for the dig down.',
    summary: 'Rover job. Cut 8 titanium ore by hand from a metallic rock (Mk II beam). The laser does not count. Bonus for opening 54 cells or fewer.',
    goal: { kind: 'cut', ore: 'cmdty_ore_titanium', qty: 8 },
    bonus: [{ kind: 'par', cells: 54, pct: 0.3 }],
    drillTier: 2,
  }),
  job({
    id: 'works_depot3_hands_off', rung: 'build', stationId: 'station_depot3', reward_cr: 2900,
    requires: ['works_ceres_standing_order'],
    title: 'Hands Off at the Depot', client: 'Refuel Depot Receiving',
    brief: 'The depot burns through stores and its crews are tired of meeting every load in person. Receiving wants goods that arrive by courier pod from works of your own, with no pilot in the hold.',
    summary: 'Building job. Your own courier pods deliver 60 units to a station. Lost pods do not count. This builds on the Ceres standing order.',
    goal: { kind: 'deliver', qty: 60 },
  }),
  job({
    id: 'works_drift_cold_volatiles', rung: 'rover', stationId: 'station_drift', reward_cr: 1950,
    title: 'Cold Volatiles', client: 'Drift Market Buyers',
    brief: 'The Drift Market buys volatiles for fuel and sealant, and an ice body keeps them between its water and its gas. Bring up volatiles that did not come with a lungful of pocket gas.',
    summary: 'Rover job. Cut 12 ice volatiles by hand from an ice body (Mk II beam). Bonus for breaching no gas pocket: ice bodies are soft and full of gas, so cut around the pockets.',
    goal: { kind: 'cut', ore: 'cmdty_volatiles', qty: 12 },
    bonus: [{ kind: 'sealed', pct: 0.4 }],
    drillTier: 2,
  }),
  job({
    id: 'works_smuggler_quiet_titanium', rung: 'rover', stationId: 'station_smuggler', reward_cr: 2550,
    title: 'Quiet Titanium', client: 'A buyer at the Smuggler Den',
    brief: 'A buyer at the Den wants titanium with no claim filed and no fuss made. Cut it deep in a metallic rock where nobody watches the far side, and keep the rock sealed while you work.',
    summary: 'Rover job. Cut 6 titanium ore by hand from deep in a metallic rock (Mk II beam). Shallow cuts do not count. Bonus for breaching no gas pocket.',
    goal: { kind: 'cut', ore: 'cmdty_ore_titanium', qty: 6, minDepth: 0.6 },
    bonus: [{ kind: 'sealed', pct: 0.35 }],
    drillTier: 2,
  }),
  job({
    id: 'works_reach_long_phosphor', rung: 'rover', stationId: 'station_reach', reward_cr: 2350,
    title: 'Long Phosphor', client: 'Reach Station Optics',
    brief: 'Phosphor crystal runs deep through a crystal body in seams that cut straight down. Reach optics wants crystal that followed one seam, not a quarry pit.',
    summary: 'Rover job. Cut 8 phosphor crystal by hand from a crystal body (Mk II beam). Bonus for opening 44 cells or fewer: the seams run down, so follow one.',
    goal: { kind: 'cut', ore: 'cmdty_crystal_lumin', qty: 8 },
    bonus: [{ kind: 'par', cells: 44, pct: 0.3 }],
    drillTier: 2,
  }),
  job({
    id: 'works_io_merc_paid_picket', rung: 'yard', stationId: 'station_io_merc', reward_cr: 2100, repeat: false,
    requires: ['works_beltout_first_claim'],
    title: 'Paid Picket', client: 'Mercenary Outpost Watch',
    brief: 'The outpost sells protection and would rather sell it to rocks that already have some. Raise a turret pylon over one of your claims in the Reach and the watch adds it to the paid list.',
    summary: 'Field Build job (Shift+B). Raise a turret pylon over one of your claims in Io Reach. A sensor post does not count.',
    goal: { kind: 'defense' },
  }),
  job({
    id: 'works_expanse_platinoid', rung: 'rover', stationId: 'station_expanse', reward_cr: 4300,
    title: 'Expanse Platinoid', client: 'Expanse Refinery',
    brief: 'The refinery in the Expanse feeds on platinoid and the local exotic bodies keep it under hard rock. Bring up platinoid cut by hand and the refinery pays deep-belt money for it.',
    summary: 'Rover job. Cut 6 platinoid ore by hand from an exotic body (Mk III beam). The laser does not count. Bonus for breaching no gas pocket.',
    goal: { kind: 'cut', ore: 'cmdty_ore_platinoid', qty: 6 },
    bonus: [{ kind: 'sealed', pct: 0.3 }],
    drillTier: 3,
  }),
  job({
    id: 'works_veil_tap', rung: 'build', stationId: 'station_veil', reward_cr: 2700, repeat: false,
    requires: ['works_beltout_first_claim'],
    title: 'Veil Tap', client: 'Research Station Veil',
    brief: 'Veil studies gas it has not let loose. A gas-bearing rock is mostly pockets, so tunnel beside one without opening it and seat a tap against the sealed gas for the station to read.',
    summary: 'Building job. Install a Gas Tap touching 2 or more cells of one sealed gas pocket in a gas-bearing rock. A breached pocket does not count.',
    goal: { kind: 'install', defId: 'sm_gas_tap', contacts: { gas: 2 } },
  }),
  job({
    id: 'works_nyx_hall', rung: 'rover', stationId: 'station_nyx_march', reward_cr: 2500,
    title: 'Nyx Hall', client: 'Nyx Fence Brokers',
    brief: 'The brokers at the Fence need a hall inside a rock for goods that travel without papers. A hall is too much rock for the bit alone, so open it with bore charges and keep the rig clear.',
    summary: 'Rover job. Open 30 cells with bore charges in Nyx March. Cells bored by the bit do not count. Bonus if no blast or roof fall catches the rig.',
    goal: { kind: 'blast', qty: 30 },
    bonus: [{ kind: 'unhurt', pct: 0.3 }],
  }),
  job({
    id: 'works_hyperion_cut_supply_line', rung: 'yard', stationId: 'station_hyperion_cut', reward_cr: 2500, repeat: false,
    requires: ['works_beltout_first_claim'],
    title: 'Cut Supply Line', client: 'Cut Refinery Logistics',
    brief: 'The Cut Refinery wants two claims that can feed each other instead of one rock mined bare. Claim a second rock in the Cut and run a cargo line between the two.',
    summary: 'Field Build job (Shift+B). Join two of your claims in Hyperion Cut with a cargo line. A power tether does not count.',
    goal: { kind: 'link', linkKind: 'material' },
  }),
  job({
    id: 'works_kepler_scar_platinoid', rung: 'rover', stationId: 'station_kepler_scar', reward_cr: 4900,
    title: 'Scar Platinoid', client: 'Scar Bazaar Refiners',
    brief: 'Refiners at the Scar pay well for platinoid and ask few questions about the digging. The ore sits under basalt in an exotic body, beside gas, and tidy work is worth more than fast work there.',
    summary: 'Rover job. Cut 8 platinoid ore by hand from an exotic body (Mk III beam). Bonuses for breaching no gas pocket and for opening 40 cells or fewer.',
    goal: { kind: 'cut', ore: 'cmdty_ore_platinoid', qty: 8 },
    bonus: [{ kind: 'sealed', pct: 0.25 }, { kind: 'par', cells: 40, pct: 0.25 }],
    drillTier: 3,
  }),
  job({
    id: 'works_orcus_shadow_heart', rung: 'rover', stationId: 'station_orcus_shadow', reward_cr: 6800,
    title: 'Shadow Heart', client: 'Shadow Cache Research',
    brief: 'The cache in Orcus Shadow keeps samples from the hearts of exotic bodies, where xenium sits under basalt and beside gas. The researchers want heart ore cut by hand, with the rock around it read as found.',
    summary: 'Rover job. Cut 4 xenium by hand from the heart of an exotic body (Industrial beam). Shallow cuts and laser ore do not count. Bonus for breaching no gas pocket.',
    goal: { kind: 'cut', ore: 'cmdty_exotic_xenium', qty: 4, minDepth: 0.75 },
    bonus: [{ kind: 'sealed', pct: 0.4 }],
    drillTier: 4,
  }),
  job({
    id: 'works_haumea_rift_volatiles', rung: 'rover', stationId: 'station_haumea_rift', reward_cr: 3300,
    title: 'Rift Volatiles', client: 'Rift Observatory',
    brief: 'The observatory at the Rift burns volatiles to keep its scopes cold and its tanks full. An ice body in the Rift keeps volatiles deep, between water ice and gas, and the observatory pays for a clean cut.',
    summary: 'Rover job. Cut 14 ice volatiles by hand from deep in an ice body (Mk II beam). Shallow cuts do not count. Bonus for breaching no gas pocket.',
    goal: { kind: 'cut', ore: 'cmdty_volatiles', qty: 14, minDepth: 0.35 },
    bonus: [{ kind: 'sealed', pct: 0.35 }],
    drillTier: 2,
  }),
  job({
    id: 'works_phoebe_echo_forty_megawatts', rung: 'build', stationId: 'station_phoebe_echo', reward_cr: 5200, repeat: false,
    requires: ['works_beltout_first_claim'],
    title: 'Forty Megawatts at Phoebe', client: 'Echo Shrine Keepers',
    brief: 'The keepers at the Echo Shrine run their instruments off claim power and want one claim that can carry the whole load. Bring one claim in Phoebe Echo up to forty megawatts.',
    summary: 'Building job. One of your claims in Phoebe Echo runs on 40 MW or more. A Line Core makes 12 MW, a Gas Tap adds 8 MW for each sealed gas pocket cell it touches, a solar sail from Field Build adds 8 MW, and power sent over a tether from a second claim counts where it arrives.',
    goal: { kind: 'power', mw: 40 },
  }),
  job({
    id: 'works_proteus_two_quiet_rocks', rung: 'build', stationId: 'station_proteus', reward_cr: 3700, repeat: false,
    requires: ['works_beltout_first_claim'],
    title: 'Two Quiet Rocks', client: 'Proteus Den Fixer',
    brief: 'A fixer at the Den wants two anchored rocks in Proteus Well that nobody else has a paper claim on. Stake them, keep them yours, and the fixer pays for ground that stays quiet.',
    summary: 'Building job. Hold 2 anchored claims in Proteus Well at once. A rock with only a tunnel in it does not count. The first machine you build anchors each rock.',
    goal: { kind: 'claims', qty: 2 },
  }),
  job({
    id: 'works_triton_helium', rung: 'rover', stationId: 'station_triton', reward_cr: 3900,
    title: 'Triton Helium', client: 'Triton Wake Lab',
    brief: 'The Wake Lab draws helium-3 from the deep seams of gas-bearing rocks, where the rock is mostly pockets waiting to be opened by mistake. Bring up helium cut by hand from down in the sponge.',
    summary: 'Rover job. Cut 6 helium-3 by hand from a gas-bearing rock (Mk II beam). Bonus for breaching no gas pocket: this rock is mostly pockets, so the sealed bonus is the hard part.',
    goal: { kind: 'cut', ore: 'cmdty_gas_helium3', qty: 6 },
    bonus: [{ kind: 'sealed', pct: 0.5 }],
    drillTier: 2,
  }),
  job({
    id: 'works_sedna_three_rocks', rung: 'build', stationId: 'station_sedna', reward_cr: 5800, repeat: false,
    requires: ['works_beltout_first_claim'],
    title: 'Three Rocks in the Dark', client: 'Sedna Survey Post',
    brief: 'The survey post at Sedna charts a sector most pilots cross once and never work. Anchor three claims out there so the post has ground truth that stays put between visits.',
    summary: 'Building job. Hold 3 anchored claims in Sedna Dark at once. A rock with only a tunnel in it does not count. The first machine you build anchors each rock.',
    goal: { kind: 'claims', qty: 3 },
  }),
  job({
    id: 'works_bolus_rib_heart', rung: 'rover', stationId: 'station_bolus_rib', reward_cr: 9000,
    title: 'Rib Heart', client: 'The Swallowed Rib Survey',
    brief: 'The survey at the Rib takes samples from the one exotic body it can reach inside the Bolus. Xenium keeps to the heart there, under basalt and beside gas, and the survey pays for ore cut from that deep and no shallower.',
    summary: 'Rover job. Cut 6 xenium by hand from the heart of an exotic body (Industrial beam). Shallow cuts and laser ore do not count. Bonuses for breaching no gas pocket and for opening 66 cells or fewer.',
    goal: { kind: 'cut', ore: 'cmdty_exotic_xenium', qty: 6, minDepth: 0.8 },
    bonus: [{ kind: 'sealed', pct: 0.25 }, { kind: 'par', cells: 66, pct: 0.25 }],
    drillTier: 4,
  }),
]);

const BY_ID = new Map(WORKS_CONTRACTS.map((row) => [row.id, row]));
export const worksContractById = (id) => BY_ID.get(id) || null;

/** Rock types in a sector whose interior carries this ore. Empty means the job cannot be done there. */
export function worksRockTypesFor(sectorId, ore) {
  return (SECTOR_ROCKS.get(sectorId) || []).filter((typeId) => {
    const profile = ROCK_GEOLOGY[typeId];
    // A rock type counts only where the ore is certain to be in it: its surface ore, or a seam
    // every rock of that type carries. A seam that may be absent never gets a job marker.
    return !!profile && (profile.starter === ore
      || profile.seams.some((seam) => seam.ore === ore && Number(seam.count?.[0]) >= 1));
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
