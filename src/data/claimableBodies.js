// Claimable body definitions (V2 §6 / M3). Bodies the player can claim and build on — the
// "you own a place" fantasy, scoped per the user's "abstracted base-as-node with a light visual"
// lean (NOT a Mindustry tile grid). A body is a node with module slots; modules snap on and provide
// passive bonuses. This file defines the module catalog; the runtime lives in src/systems/claims.js.
//
// DESIGN (V2 §5, §6, §8):
//   - Claimable bodies are rare, special POIs (a "Claimable Moon" type), not every planet. Scarcity
//     makes ownership meaningful (V2 §11 — build-order puzzle).
//   - Modules are the "bots-as-conveyors" answer: instead of belt tiles, you build structures that
//     the automation alphabet routes through. A Depot is a MOVE beacon; a Refinery auto-refines; a
//     Teleporter collapses a lane (V2 §8 — the milestone unlock that rewrites map geometry).
//   - Costs scale so the build ORDER is a real decision (do you sink credits into a second depot or
//     a teleporter first?).

// Module types buildable on a claimed body. Each is a passive provider when staffed/powered.
// techReq gates map onto the REAL tech tree (src/data/tech.js) — a body module is buildable only
// after the player has researched the corresponding node. (Previously these referenced three tech_
// IDs that did not exist in the tree, making every module permanently unbuildable.)
//   - Depot / Defense Battery → tech_outpost_charter (the logistics capstone that already grants
//     outpostConstruction:true; gating base structures on the "you may build outposts" node).
//   - On-Site Refinery        → tech_deep_core_mining (the industry capstone for serious refining).
//   - Quantum Teleporter      → tech_graviton_drives (the drives capstone; "rewrites the map"
//     thematically matches the drive tier that makes collapsed lanes trivial).
export const BODY_MODULES = [
  {
    id: 'mod_depot', name: 'Cargo Depot', desc: 'A dropoff point for your drones. Drones assigned a depot template route here. Stores overflow ore.',
    cost: 4500, techReq: 'tech_outpost_charter',
    slots: 1,
    effect: 'depot', // a MOVE beacon named 'depot' resolves here when built
  },
  {
    id: 'mod_refinery', name: 'On-Site Refinery', desc: 'Auto-refines raw ore into materials at a fixed rate, no station visit needed. Lighter, dearer goods to ship.',
    cost: 12000, techReq: 'tech_deep_core_mining',
    slots: 1,
    effect: 'refine', // ticks: converts ore -> refined commodity at a rate
    refineRate: 0.5,  // ore-units/sec
  },
  {
    id: 'mod_teleporter', name: 'Quantum Teleporter', desc: 'Links this body to a chosen station. Collapses your worst lane to a single jump — classic automation that rewrites the map.',
    cost: 45000, techReq: 'tech_graviton_drives',
    slots: 1,
    effect: 'teleport', // enables instant travel between body and linked station
  },
  {
    id: 'mod_throughline_sling', name: 'Throughline Sling',
    desc: 'Fabricates a permanent acceleration ring and nav relay on the clear line to this claim’s linked station. Travel Burn is amplified only while the ship remains inside that physical corridor.',
    cost: 18000, techReq: 'tech_graviton_drives',
    requiresSpec: 'spec_refinery',
    slots: 1,
    effect: 'travel_sling',
    materials: Object.freeze({
      cmdty_alloys: 12,
      cmdty_comp_circuitry: 6,
      cmdty_fuel_cells: 4,
    }),
    alignTimeS: 12,
    ceilingMult: 2,
    rampMult: 2,
    corridorRadiusWU: 240,
  },
  {
    id: 'mod_sensor_post', name: 'Sensor Post',
    desc: 'Extends discovery pulses to hidden POIs across this claim’s sector and files one free local rumor card per sector-day. It does not reveal exact positions or widen combat contact scans.',
    cost: 11000, techReq: 'tech_long_range_survey',
    slots: 1,
    effect: 'sensor_post',
  },
  {
    id: 'mod_defense', name: 'Defense Battery', desc: 'Automated turret that protects the body from raids. Required on dangerous frontier claims.',
    cost: 8000, techReq: 'tech_outpost_charter',
    slots: 1,
    effect: 'defense',
    defenseRating: 40, // reduces the body's intervention/raid risk
  },
];

// Specializations (M5 / SPEC3-F6-26): the claim's OPERATING IDENTITY. Where a module is a fitting,
// a specialization is what the base is FOR — exactly one per body, chosen deliberately, switchable
// only when site storage is empty. Each one changes real simulation behavior (claims.js ticks it),
// has a distinct input, output, and risk, and reads out honestly on the Base screen ledger.
// Prerequisite: the matching module must already be fitted (its techReq gates the identity too).
export const BODY_SPECIALIZATIONS = [
  {
    id: 'spec_refinery', name: 'Industrial Refinery', short: 'REFINERY',
    desc: 'Runs the fitted refinery as a working site. Deliver raw ore here; crews process it into refined goods you haul out. Stocked sites draw raiders in low-security space.',
    playerVerb: 'Deliver raw ore. Collect refined output.',
    consequence: 'Turns 2u raw ore into 1u refined freight at the site.',
    riskLine: 'Stored ore attracts raids in low-security space.',
    mapGlyph: '▣', mapColor: '#ffb35c',
    requiresModule: 'mod_refinery',
    cost: 9000,
    upkeepPerMin: 20,       // credits, charged through the economy writer
    inputCapU: 240,         // raw ore the site can hold
    outputCapU: 120,        // refined goods awaiting pickup
    refineRatePerS: 0.5,    // ore-units processed per second (same truth as mod_refinery)
  },
  {
    id: 'spec_relay', name: 'Trade Relay', short: 'RELAY',
    desc: 'Runs the fitted depot as a freight relay. Deposit goods; scheduled convoys haul them to the linked station and sell at the local market price less the relay fee. Convoys risk piracy in low-security space.',
    playerVerb: 'Deliver freight. The relay sells it by scheduled convoy.',
    consequence: 'Realizes linked-market prices minus a 20% handling fee.',
    riskLine: 'Convoys can be lost to piracy outside lawful space.',
    mapGlyph: '⬡', mapColor: '#39d0ff',
    requiresModule: 'mod_depot',
    cost: 7000,
    upkeepPerMin: 15,
    storeCapU: 300,         // freight the relay can hold
    dispatchEveryS: 240,    // convoy schedule
    transitS: 90,           // convoy travel time to the linked station
    convoyLoadU: 60,        // max units per convoy
    minLoadU: 20,           // don't send half-empty haulers
    saleFee: 0.2,           // the proven outpost autosell penalty (-20%)
  },
  {
    id: 'spec_bastion', name: 'Defense Bastion', short: 'BASTION',
    desc: 'Runs the fitted battery as a garrison. Warns of raids on your claims in this sector and contests them with stationed guns. Highest upkeep; produces nothing.',
    playerVerb: 'Answer raid warnings. Fight at the threatened claim.',
    consequence: 'Lends defense coverage to every owned claim in-sector.',
    riskLine: 'Produces no goods and carries the highest upkeep.',
    mapGlyph: '⬟', mapColor: '#7af7d0',
    requiresModule: 'mod_defense',
    cost: 8000,
    upkeepPerMin: 25,
    defenseBonus: 60,       // added to this body's battery rating while the garrison is active
    coverageBonus: 40,      // lent to every other claim in the same sector
    coveredLossFrac: 0.35,  // a raid that lands under coverage takes half the usual 70%
  },
];

export const BODY_SPECIALIZATION_BY_ID = new Map(BODY_SPECIALIZATIONS.map((s) => [s.id, s]));

// Authored claim sites across the canonical 24-region galaxy (SPEC3-F6-26).
//
// These are deliberately scarce rather than one-per-sector: Helios never sells land, quiet trade
// corridors keep their established ownership, and the deepest regions carry the three L-class
// stakes. Every site reuses an existing place landmark and the existing claim interaction; this is
// world content, not a second base system or a renderer special case. The two original sites retain
// their stable ids/positions for save compatibility. `applyClaimableBodySites()` overlays those
// records and appends the rest after sector anchors have been applied.
// Authored micro-histories for the 15 claim sites — what each body was FOR, and why its claim
// died or survived. `title`/`body` use the same discoveryPlate shape as every sectors.js plate
// (arrival plate popup shows the title; the codex journal carries the body); `why` is the
// one-line identity the Base screen keeps once the body is claimed. Keyed by site id so the
// CLAIMABLE_BODY_SITES rows — and the save-compat ids/positions they carry — stay untouched.
const SITE_HISTORIES = Object.freeze({
  poi_claim_rookery: Object.freeze({
    title: 'Rookery Prospect — Staked Twice, Worked Once',
    body: 'A DMC survey stake from the first belt rush, re-flagged when Ceres Refinery opened '
      + 'intake. The rig log shows one shift cut and one pay-out before the crew walked to a '
      + 'richer seam; the on-site scale still reads the last tare.',
    why: 'A first-rush DMC survey stake, worked one shift and walked off when the seam thinlined. '
      + 'Your flag is the third on this rock.',
  }),
  poi_claim_kilnside: Object.freeze({
    title: 'Kilnside Lease — the Foundry\u2019s Slag-Kill',
    body: 'Leased by Forge Foundry as a slag-kill: reject alloy fused here and tipped over the '
      + 'crystal field\u2019s rim. Closed the shift the radiation pocket crept inside tolerance. '
      + 'The kiln crew that tended it sings shifts at the refuel depot now.',
    why: 'The foundry\u2019s slag-kill, closed when the radiation pocket crept inside tolerance. '
      + 'The kiln bed still runs warm to the touch.',
  }),
  poi_claim_drift_nine: Object.freeze({
    title: 'Drift Claim Nine — Ninth Stake on the Same Rock',
    body: 'The registry lists eight earlier stakes on this body, each lapsed for unpaid fees. '
      + 'Nine held longer because its filer ran it as a dead drop for the Smuggler Den — the '
      + 'manifest says ore, and the assay bench says packing foam.',
    why: 'Ninth stake on a body eight owners lapsed out of. The last filer declared ore and '
      + 'shipped nothing of the kind.',
  }),
  poi_claim_pallas: Object.freeze({
    title: 'Pallas Industrial Moon — Foreclosed Mid-Shift',
    body: 'A Free collective built the seamed moon out as a full extraction floor: hab ring, ore '
      + 'lifts, union boards. Foreclosed mid-shift when the Collective defaulted on its mercenary '
      + 'escort contract. The boards still carry the last rotation; the lifts were left loaded.',
    why: 'A Free collective extraction floor foreclosed over an unpaid escort contract. The ore '
      + 'lifts were left loaded mid-shift.',
  }),
  poi_colony: Object.freeze({
    title: 'Abandoned Mining Colony — Evacuated, Not Wrecked',
    body: 'Charon\u2019s deep-belt intake town: conveyor barges, family bunks, a school roster '
      + 'pinned in the office. Evacuated in one convoy the day the radiation lane drifted across '
      + 'the field. Nothing was destroyed; everything was left. The snapped tether below is theirs.',
    why: 'A deep-belt company town, walked away from in one convoy when the radiation lane '
      + 'drifted. Nothing wrecked, everything left.',
  }),
  poi_claim_morrow: Object.freeze({
    title: 'Morrow Freehold — the Claim That Paid Its Vouch',
    body: 'An independent family freehold in the one sector where ownership is a rumor the Reach '
      + 'permits, because Morrow paid the Bazaar\u2019s vouch-price quarterly, on time, in unmarked '
      + 'plate. The last quarter came in short; the freehold was chartered out the same week.',
    why: 'A family freehold that survived Sker by paying the Reach\u2019s vouch-price quarterly. '
      + 'The last payment came in short.',
  }),
  poi_claim_lacuna: Object.freeze({
    title: 'Lacuna Survey Moon — the Array Outlasted the Crew',
    body: 'Free surveyors moored this platform to triangulate the Resonance Obelisk through the '
      + 'murk. The array still pings on schedule; the crew recall order predates the last three. '
      + 'Station Veil keeps the lease current rather than walk the data out by hand.',
    why: 'A Free survey platform ranged on the Resonance Obelisk. The array still pings; the '
      + 'crew was recalled and never argued.',
  }),
  poi_claim_cinder_crown: Object.freeze({
    title: 'Cinder Crown — Fused by the Roaming Burn',
    body: 'A Vael salvage stake on the highest rock in the Reach, filed to stage vault recovery '
      + 'clear of the Iron Maw. The Roaming Burn crossed the claim on its third circuit and fused '
      + 'the crown glass to this depth. The stake was never withdrawn; nobody came back to '
      + 'withdraw it.',
    why: 'A Vael vault-recovery stake fused glassy when the Roaming Burn crossed it. Never '
      + 'withdrawn — nobody returned to withdraw it.',
  }),
  poi_claim_blackglass: Object.freeze({
    title: 'Blackglass Lease — Paper Ends at the Fence',
    body: 'A Quiet cutting front on the march\u2019s black ice, glass-sheared rock sold at the '
      + 'Nyx Fence with no origin line on the docket. Lapsed the week the Cut-Runner went down in '
      + 'the nebula carrying the lease-holder\u2019s only crew. The paper ends where the fence '
      + 'begins.',
    why: 'A Quiet cutting front on black ice, sold at the Fence with no origin line. Lapsed the '
      + 'week its only crew went down in the nebula.',
  }),
  poi_claim_cutwater: Object.freeze({
    title: 'Cutwater Anchorage — Mooring Rings, Empty Now',
    body: 'The cut\u2019s first anchorage: tie-up rings, an assay scale, bunks for four crews. '
      + 'Consolidated into the Cut Claim Outpost the season the Caved Shaft took its drift crew. '
      + 'The rings are still sized for haulers nobody moors anymore.',
    why: 'The cut\u2019s old crew anchorage, consolidated into the Claim Outpost after the Caved '
      + 'Shaft. Its rings still fit haulers nobody moors.',
  }),
  poi_claim_scarline: Object.freeze({
    title: 'Scarline Hold — Eleven Owners, Never Abandoned',
    body: 'A salvage hold filed straight down the Void-Reach\u2019s debris scar, worked by crews '
      + 'that give the Bazaar first pick of every plate. It has changed hands eleven times without '
      + 'once being abandoned — under the Flight Deck\u2019s launch rails, ownership is whoever '
      + 'the stalls vouch for.',
    why: 'A salvage hold worked down the Void-Reach\u2019s debris scar: eleven owners, never once '
      + 'abandoned. First pick still goes to the Bazaar stalls.',
  }),
  poi_claim_emberwake: Object.freeze({
    title: 'Emberwake Plot — the Assay Burned With It',
    body: 'A corner-lot prospect staked off the Cinder Claim, worked until a radiation flare '
      + 'crossed the plot and took its timbers and its assay office in the same hour. The Claim '
      + 'bought ore trucks after; nobody re-filed the corner lot.',
    why: 'A corner-lot prospect burned over by a radiation flare — timbers and assay records in '
      + 'the same hour. Never re-filed.',
  }),
  poi_claim_shoal_exchange: Object.freeze({
    title: 'Shoal Exchange Rock — Ore Moves Same-Shift',
    body: 'A barged-in exchange pad where independent ice crews and the Shoal Claim settle on one '
      + 'scale, same shift, under the Collective\u2019s standing cut. It has outlived two '
      + 'waystation managers and every attempt to move the trade indoors — the scale on the rock '
      + 'is the only referee both sides accept.',
    why: 'The shoal\u2019s neutral ore exchange: ice crews and the Claim settle on one scale, '
      + 'under the Collective\u2019s cut. Outlived every attempt to move it indoors.',
  }),
  poi_claim_wayline: Object.freeze({
    title: 'Wayline Charter — the Stop Before the Toll Plate',
    body: 'A chartered staging berth on the southern freight lane, where convoys formed up before '
      + 'Dione Customs read their plates. Lapsed when the Concord moved the scan line half a lane '
      + 'inward and the convoys formed at the Exchange instead. The charter clock still runs, on '
      + 'paper.',
    why: 'A chartered convoy berth overtaken when Concord moved the scan line inward. Convoys '
      + 'form at the Exchange now; the charter clock still runs on paper.',
  }),
  poi_claim_far_ledger: Object.freeze({
    title: 'Far Ledger — the Rim Files Its Own Record',
    body: 'A plinth on the dark rim where far-rim captains file claims the registries won\u2019t '
      + 'take: plates, bearers, debts, scratched in hull-mark. The Vael survey post reads it and '
      + 'never amends it. Every entry is honored, for the plain reason that no one has survived '
      + 'dishonoring one.',
    why: 'The rim\u2019s unofficial claim record — captains file what registries won\u2019t take, '
      + 'scratched in hull-mark. Read by the survey post, amended by no one.',
  }),
});

export const CLAIMABLE_BODY_SITES = Object.freeze([
  claimSite('sector_ceres_belt', 'poi_claim_rookery', 'Rookery Prospect', 'S', -1900, 1100, 'place_asteroid_rock_a'),
  claimSite('sector_vesta_forge', 'poi_claim_kilnside', 'Kilnside Lease', 'S', 1650, 1350, 'place_asteroid_rock_a'),
  claimSite('sector_pallas_drift', 'poi_claim_drift_nine', 'Drift Claim Nine', 'M', -2050, 1250, 'place_asteroid_seamed'),
  claimSite('sector_io_reach', 'poi_claim_pallas', 'Pallas Industrial Moon', 'M', 320, 1280, 'place_asteroid_seamed'),
  claimSite('sector_charon_expanse', 'poi_colony', 'Abandoned Mining Colony', 'S', -620, 1420, 'place_conveyor_barge'),
  claimSite('sector_sker_haven', 'poi_claim_morrow', 'Morrow Freehold', 'M', 2100, -1450, 'place_asteroid_rock_b'),
  claimSite('sector_veil_nebula', 'poi_claim_lacuna', 'Lacuna Survey Moon', 'L', -2300, 1700, 'place_asteroid_rock_c'),
  claimSite('sector_ashfall_reach', 'poi_claim_cinder_crown', 'Cinder Crown', 'L', 2500, -1900, 'place_asteroid_rock_c'),
  claimSite('sector_nyx_march', 'poi_claim_blackglass', 'Blackglass Lease', 'S', -1700, -1500, 'place_asteroid_rock_a'),
  claimSite('sector_hyperion_cut', 'poi_claim_cutwater', 'Cutwater Anchorage', 'M', 1800, -1200, 'place_asteroid_seamed'),
  claimSite('sector_kepler_scar', 'poi_claim_scarline', 'Scarline Hold', 'M', -2200, 900, 'place_asteroid_rock_b'),
  claimSite('sector_rhea_cinder', 'poi_claim_emberwake', 'Emberwake Plot', 'S', 1900, 1600, 'place_asteroid_rock_a'),
  claimSite('sector_nereid_shoal', 'poi_claim_shoal_exchange', 'Shoal Exchange Rock', 'M', -1800, 1250, 'place_asteroid_seamed'),
  claimSite('sector_dione_lane', 'poi_claim_wayline', 'Wayline Charter', 'S', 1500, -950, 'place_asteroid_rock_a'),
  claimSite('sector_sedna_dark', 'poi_claim_far_ledger', 'Far Ledger', 'L', -2600, -1700, 'place_asteroid_rock_c'),
]);

const CLAIM_SITES_BY_SECTOR = new Map();
for (const site of CLAIMABLE_BODY_SITES) {
  const bucket = CLAIM_SITES_BY_SECTOR.get(site.sectorId) || [];
  bucket.push(site);
  CLAIM_SITES_BY_SECTOR.set(site.sectorId, bucket);
}

/** Add/overlay authored claim POIs without mutating frozen frontier records. */
export function applyClaimableBodySites(sector) {
  if (!sector) return sector;
  const sites = CLAIM_SITES_BY_SECTOR.get(sector.id);
  if (!sites || !sites.length) return sector;
  const byId = new Map(sites.map((site) => [site.id, site]));
  const pois = (sector.pois || []).map((poi) => {
    const site = byId.get(poi.id);
    if (!site) return poi;
    byId.delete(poi.id);
    return { ...poi, ...site, pos: { ...site.pos } };
  });
  for (const site of byId.values()) pois.push({ ...site, pos: { ...site.pos } });
  return { ...sector, pois };
}

function claimSite(sectorId, id, name, size, x, z, landmarkGlb) {
  const history = SITE_HISTORIES[id] || {};
  return Object.freeze({
    sectorId,
    id,
    type: 'colony',
    name,
    claimable: true,
    size,
    pos: Object.freeze({ x, z }),
    landmark: true,
    landmarkGlb,
    visualRadius: size === 'L' ? 32 : size === 'M' ? 26 : 20,
    // Authored identity (INFERENCE): the arrival plate carries the site's micro-history in the
    // same { title, body } shape sectors.js plates use; `why` is the Base screen's why-line.
    // Falling back to the bare name keeps an unauthored future site at today's behavior.
    discoveryPlate: Object.freeze({
      title: history.title || name,
      body: history.body || '',
    }),
    why: history.why || '',
  });
}

// A claimable body's total module slots (so you choose which 3-4 modules to fit). Small bodies = 2
// slots (a frontier mining claim), large = 4 (an industrial moon). Forces build-order decisions.
export const BODY_SLOTS_BY_SIZE = { S: 2, M: 3, L: 4 };

// The base cost to CLAIM a body (survey + flag). Cheap enough to be a mid-game milestone, dear
// enough that you don't claim everything you see.
export const CLAIM_COST = 15000;

export const BODY_MODULE_BY_ID = new Map(BODY_MODULES.map((m) => [m.id, m]));

export function claimSensorPostActive(state, sectorId = null) {
  const wantedSector = sectorId || (state && state.world && state.world.currentSectorId);
  if (!wantedSector) return false;
  const bodies = state && state.claims && state.claims.bodies;
  return Array.isArray(bodies) && bodies.some((body) => body && body.owned !== false
    && body.sectorId === wantedSector
    && Array.isArray(body.modules)
    && body.modules.includes('mod_sensor_post'));
}
