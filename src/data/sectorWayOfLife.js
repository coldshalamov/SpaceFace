// src/data/sectorWayOfLife.js — PQ-153.00 confirmation table.
//
// Six of the ten authored core sectors. A way of life is verbs, rhythm, law,
// crime, ships, structures, hazard geometry, a landmark, and one toy that is
// best there — not a palette class. Ids are existing CORE_SECTORS keys only.
// This file does not rewrite sectors.js identities.
//
// The owner may swap any of the last three names (Vesta / Pallas / Sker).
// That is a later data edit, not a blocker for this confirmation.
//
// Pure data + lookup. No UI, no Math.random, no runtime side effects.

export const WAY_OF_LIFE_COLUMNS = Object.freeze([
  'verb',
  'rhythm',
  'law',
  'crime',
  'ships',
  'structures',
  'hazardGeometry',
  'landmark',
  'signatureToy',
]);

export const WAY_OF_LIFE_SECTOR_IDS = Object.freeze([
  'sector_helios_prime',
  'sector_ceres_belt',
  'sector_tethys_junction',
  'sector_vesta_forge',
  'sector_pallas_drift',
  'sector_sker_haven',
]);

/** First three are locked by the owner. Last three are proposed and swappable by name. */
export const WAY_OF_LIFE_OWNER_LOCKED_COUNT = 3;

function row(input) {
  return Object.freeze({
    id: input.id,
    name: input.name,
    sentence: input.sentence,
    verb: input.verb,
    rhythm: input.rhythm,
    law: input.law,
    crime: input.crime,
    ships: input.ships,
    structures: input.structures,
    hazardGeometry: input.hazardGeometry,
    landmark: input.landmark,
    signatureToy: input.signatureToy,
  });
}

export const SECTOR_WAY_OF_LIFE = Object.freeze([
  row({
    id: 'sector_helios_prime',
    name: 'Helios Prime',
    sentence: 'The harbour: law, tutorial, calm.',
    verb: 'Dock, trade, and learn. Ships come here to sell and to pick over what died.',
    rhythm: 'A trade hub\'s day — mostly moving, punctuated by short work. Licensed traffic on the freight spine.',
    law: 'Concord beat. A uniformed hull flies a standing route. No hostile spawns (enemyDensity 0).',
    crime: 'Quiet at the door. Trouble, if any, is out on the lane — not at Helios Station.',
    ships: 'Pelicans and bastions: licensed traders, a salvor, a beat patrol.',
    structures: 'Helios Station, Coalition HQ, the tutorial beacon, the Candle Fleet, the freight spine.',
    hazardGeometry: 'None. The harbour is calm water — the starter seam is a classroom, not a fight.',
    landmark: 'Helios Station (station_helios); the Candle Fleet memorial (poi_memorial).',
    signatureToy: 'The sanctioned claim — mine the starter seam without being hunted.',
  }),
  row({
    id: 'sector_ceres_belt',
    name: 'Ceres Belt',
    sentence: 'The working belt: mining, haulers, the Cathedral.',
    verb: 'Haul ore and tend the yard. Ships come here to deliver rock and service the machinery.',
    rhythm: 'A yard\'s day — load, cross, unload, repeat. Hands on cargo.',
    law: 'Collective watch. An SCN hull stands off the refinery (overseen, not patrolled).',
    crime: 'Quiet at the yard. Reach skiffs wait in the belt-shadow for loaded haulers.',
    ships: 'Mules, ironbacks, and tenders: haulers and a service tug.',
    structures: 'Ceres Refinery, Belt Outpost, Throughline Weigh, the Cinder Sluice.',
    hazardGeometry: 'Dense-asteroid yard plus the Cinder Sluice current — time the calm or ride the surge.',
    landmark: 'Wreck Cathedral (world_site_wreck_cathedral).',
    signatureToy: 'Industrial beam and haul-and-weigh — cut rock, sell ore, work the sluice.',
  }),
  row({
    id: 'sector_tethys_junction',
    name: 'Tethys Junction',
    sentence: 'The trade hub: traffic, customs, the black market.',
    verb: 'Transit, scan, deal. Convoys change hands under the live board.',
    rhythm: 'Convoy pulse, customs stop, then the quiet cache off the lanes.',
    law: 'Concord Customs Gate. Everything transits; nothing transits unread.',
    crime: 'The Quiet Cache — contraband off the exchange, away from Meridian eyes.',
    ships: 'Haulers, couriers, customs cutters, and the occasional smuggler.',
    structures: 'Tethys Trade Hub, Customs Gate, the weigh-slip buoy, the customs log relay.',
    hazardGeometry: 'The Anvil — a planetary gravity well on the southern approach (zone_tethys_anvil).',
    landmark: 'Tethys Trade Hub (station_tethys); The Anvil on the rim.',
    signatureToy: 'Customs versus the black market — scan the freight or slip it.',
  }),
  row({
    id: 'sector_vesta_forge',
    name: 'Vesta Forge',
    sentence: 'The foundry: furnace hazards, industry.',
    verb: 'Fabricate. Ore in, modules out.',
    rhythm: 'Feedstock around the clock. Haulers shuttle seams to the foundry lines.',
    law: 'Collective foundry watch. A light patrol holds the fab approach.',
    crime: 'Scavengers on the dead freighter at the sector edge. Manifest never recovered.',
    ships: 'Ore haulers and foundry tenders.',
    structures: 'Forge Foundry, Refuel Depot, the Slag-Choir Relay.',
    hazardGeometry: 'Foundry heat: slag radiation, a storm lane, and a radiation belt that moves mass.',
    landmark: 'Forge Foundry (station_forge).',
    signatureToy: 'Module craft and the slag-run — bring alloy, leave with fittings, survive the glow.',
  }),
  row({
    id: 'sector_pallas_drift',
    name: 'Pallas Drift',
    sentence: 'The debris reef: wrecks, scavengers, reef pinball.',
    verb: 'Scavenge and smuggle.',
    rhythm: 'Thin traffic, wreck work, then the reef surge.',
    law: 'Thin Meridian oversight. Open board, thin memory.',
    crime: 'The Quiet run the Smuggler Den. Reach stages the Sker-run ambush on the wreck.',
    ships: 'Scavengers, smugglers, and Reach raiders.',
    structures: 'Drift Market, Smuggler Den, pirate wreckage, the hidden cache.',
    hazardGeometry: 'Debris-reef current — a cone of loose mass; one slam pinballs the string.',
    landmark: 'The Quiessence (poi_quiessence).',
    signatureToy: 'Reef pinball — slam one body so the rest go.',
  }),
  row({
    id: 'sector_sker_haven',
    name: 'Sker Haven',
    sentence: 'The outlaw port: the wanted loop\'s home, corrupt docks.',
    verb: 'Fence, refit, hunt.',
    rhythm: 'No licensed traffic. Gate-camp first, then the bazaar if you are vouched.',
    law: 'Reach hospitality — vouched for or cargo. Security is a rumour (0.08).',
    crime: 'The port itself. Stolen cargo, press-gang seams, bounty wrecks.',
    ships: 'Raiders and press-gang miners. No civilian schedule.',
    structures: 'Sker Bazaar (rep-gated), the Reach gate-camp, the bounty wrecks.',
    hazardGeometry: 'Dense-asteroid approaches and a bounty wreck field. Jump in is a scan, then a swarm.',
    landmark: 'Sker Bazaar (station_sker).',
    signatureToy: 'The wanted loop — dock hot, buy a name, leave hotter.',
  }),
]);

export const SECTOR_WAY_OF_LIFE_BY_ID = Object.freeze(
  Object.fromEntries(SECTOR_WAY_OF_LIFE.map((entry) => [entry.id, entry])),
);

export function getSectorWayOfLife(sectorId) {
  return (sectorId && SECTOR_WAY_OF_LIFE_BY_ID[sectorId]) || null;
}
