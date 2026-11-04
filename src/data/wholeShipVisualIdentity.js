// Ordinary whole-ship visual identity: shared by presentation and aftermath binding.
// Pure data/selection only; special actors remain ahead of this in partsLibrary.
import { RENDER_PACKAGE_PILOTS } from '../render/renderPackageManifest.js';
import { ironKrakenProfileFor } from './ironKraken.js';

const WHOLE_SHIP_FILE_BY_DEF_ID = Object.freeze({
  'ship_kestrel': 'wholeships/kestrel.glb',
  'ship_wasp': 'wholeships/wasp_production_v1.glb',
  'ship_pelican': 'wholeships/pelican_production_v1.glb',
  'ship_mule': 'wholeships/mule_production_v1.glb',
  'ship_drifter': 'wholeships/drifter_production_v1.glb',
  'ship_hornet': 'wholeships/hornet_production_v1.glb',
  'ship_ironback': 'wholeships/ironback_production_v1.glb',
  'ship_bastion': 'wholeships/bastion_production_v1.glb',
  'ship_atlas': 'wholeships/atlas_production_v1.glb',
  'ship_ranger': 'wholeships/ranger_production_v1.glb',
  'ship_warden': 'wholeships/warden_production_v1.glb',
  'ship_colossus': 'wholeships/colossus_production_v1.glb',
  'ship_leviathan': 'wholeships/leviathan_production_v1.glb',
  // The Hawser player hull wears the accepted yard-tug body — the same packaged work
  // hull ambient tug traffic already flies. The fiction is the purchase, not a repaint.
  'ship_hawser': 'wholeships/yard_tug.glb',
  'ship_saucer': 'wholeships/saucer_production_v1.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_DEF_ID = Object.freeze({
  'ship_kestrel': 'SF_K0_KESTREL_BORROWED_TIME_V4',
  'ship_wasp': 'SF_WASP_PRODUCTION_V1',
  'ship_pelican': 'SF_PELICAN_PRODUCTION_V1',
  'ship_mule': 'SF_MULE_PRODUCTION_V1',
  'ship_drifter': 'SF_DRIFTER_PRODUCTION_V1',
  'ship_hornet': 'SF_HORNET_PRODUCTION_V1',
  'ship_ironback': 'SF_IRONBACK_PRODUCTION_V1',
  'ship_bastion': 'SF_BASTION_PRODUCTION_V1',
  'ship_atlas': 'SF_ATLAS_PRODUCTION_V1',
  'ship_ranger': 'SF_RANGER_PRODUCTION_V1',
  'ship_warden': 'SF_WARDEN_PRODUCTION_V1',
  'ship_colossus': 'SF_COLOSSUS_PRODUCTION_V1',
  'ship_leviathan': 'SF_LEVIATHAN_PRODUCTION_V1',
  'ship_hawser': 'SF_WHOLESHIP_YARD_TUG',
  'ship_saucer': 'SF_SAUCER_PRODUCTION_V1',
});
// Independent GLBs let the distance selector load detail on demand. Keep player presentation at
// LOD0 and associate traffic families with the selected visual body, never its gameplay chassis.
const WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID = Object.freeze({
  ship_kestrel: Object.freeze({
    lod0: 'wholeships/kestrel.glb',
    lod1: 'wholeships/kestrel_lod1.glb',
    lod2: 'wholeships/kestrel_lod2.glb',
  }),
  ship_wasp: Object.freeze({
    lod0: 'wholeships/wasp_production_v1.glb',
    lod1: 'wholeships/wasp_production_v1_lod1.glb',
    lod2: 'wholeships/wasp_production_v1_lod2.glb',
  }),
  ship_pelican: Object.freeze({
    lod0: 'wholeships/pelican_production_v1.glb',
    lod1: 'wholeships/pelican_production_v1_lod1.glb',
    lod2: 'wholeships/pelican_production_v1_lod2.glb',
  }),
  ship_mule: Object.freeze({
    lod0: 'wholeships/mule_production_v1.glb',
    lod1: 'wholeships/mule_production_v1_lod1.glb',
    lod2: 'wholeships/mule_production_v1_lod2.glb',
  }),
  ship_drifter: Object.freeze({
    lod0: 'wholeships/drifter_production_v1.glb',
    lod1: 'wholeships/drifter_production_v1_lod1.glb',
    lod2: 'wholeships/drifter_production_v1_lod2.glb',
  }),
  ship_hornet: Object.freeze({
    lod0: 'wholeships/hornet_production_v1.glb',
    lod1: 'wholeships/hornet_production_v1_lod1.glb',
    lod2: 'wholeships/hornet_production_v1_lod2.glb',
  }),
  ship_ironback: Object.freeze({
    lod0: 'wholeships/ironback_production_v1.glb',
    lod1: 'wholeships/ironback_production_v1_lod1.glb',
    lod2: 'wholeships/ironback_production_v1_lod2.glb',
  }),
  ship_bastion: Object.freeze({
    lod0: 'wholeships/bastion_production_v1.glb',
    lod1: 'wholeships/bastion_production_v1_lod1.glb',
    lod2: 'wholeships/bastion_production_v1_lod2.glb',
  }),
  ship_atlas: Object.freeze({
    lod0: 'wholeships/atlas_production_v1.glb',
    lod1: 'wholeships/atlas_production_v1_lod1.glb',
    lod2: 'wholeships/atlas_production_v1_lod2.glb',
  }),
  ship_ranger: Object.freeze({
    lod0: 'wholeships/ranger_production_v1.glb',
    lod1: 'wholeships/ranger_production_v1_lod1.glb',
    lod2: 'wholeships/ranger_production_v1_lod2.glb',
  }),
  ship_warden: Object.freeze({
    lod0: 'wholeships/warden_production_v1.glb',
    lod1: 'wholeships/warden_production_v1_lod1.glb',
    lod2: 'wholeships/warden_production_v1_lod2.glb',
  }),
  ship_colossus: Object.freeze({
    lod0: 'wholeships/colossus_production_v1.glb',
    lod1: 'wholeships/colossus_production_v1_lod1.glb',
    lod2: 'wholeships/colossus_production_v1_lod2.glb',
  }),
  ship_leviathan: Object.freeze({
    lod0: 'wholeships/leviathan_production_v1.glb',
    lod1: 'wholeships/leviathan_production_v1_lod1.glb',
    lod2: 'wholeships/leviathan_production_v1_lod2.glb',
  }),
  ship_saucer: Object.freeze({
    lod0: 'wholeships/saucer_production_v1.glb',
    lod1: 'wholeships/saucer_production_v1_lod1.glb',
    lod2: 'wholeships/saucer_production_v1_lod2.glb',
  }),
});
const WHOLE_SHIP_LOD_FAMILY_BY_FILE = Object.freeze(Object.fromEntries([
  ...['kilnback', 'scissorwake', 'towline_mara', 'towline_odo', 'towline_kit', 'pallet_jack', 'mothlight'].map((family) => [
    `wholeships/${family}.glb`, Object.freeze({lod0:`wholeships/${family}.glb`,lod1:`wholeships/${family}_lod1.glb`,lod2:`wholeships/${family}_lod2.glb`}),
  ]),
  ['wholeships/ilex_ark.glb', Object.freeze({lod0:'wholeships/ilex_ark.glb',lod1:'wholeships/ilex_ark_lod1.glb',lod2:'wholeships/ilex_ark_lod2.glb'})],
  ['wholeships/red_kite.glb', Object.freeze({lod0:'wholeships/red_kite.glb',lod1:'wholeships/red_kite_lod1.glb',lod2:'wholeships/red_kite_lod2.glb'})],
  ['wholeships/sable_patchwork.glb', Object.freeze({lod0:'wholeships/sable_patchwork.glb',lod1:'wholeships/sable_patchwork_lod1.glb',lod2:'wholeships/sable_patchwork_lod2.glb'})],
  ...Object.values(WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID).map((family) => [family.lod0, family]),
  ['wholeships/massline_express_liner_v1.glb', Object.freeze({
    lod0: 'wholeships/massline_express_liner_v1.glb',
    lod1: 'wholeships/massline_express_liner_v1_lod1.glb',
    lod2: 'wholeships/massline_express_liner_v1_lod2.glb',
  })],
]));
// Reach hostiles are selected by their authoritative combat archetype, not by ship def: several
// enemy roles intentionally share player-facing chassis stats while requiring different combat
// silhouettes. This presentation map changes no doctrine, hostility, movement, or damage data.
// Only files that already have a render-package pilot may be requested on the live
// empty-admission path. A remaster sibling that exists on disk but is not packaged
// fails closed and leaves a targeting lock on blank space.
const PACKAGED_LIVE_WHOLE_SHIP_FILES = new Set(RENDER_PACKAGE_PILOTS
  .filter((pilot) => pilot.sourceUrl.startsWith('assets/ships/release/parts/wholeships/'))
  .map((pilot) => pilot.sourceUrl.slice('assets/ships/release/parts/'.length)));

export function isPackagedLiveWholeShipFile(file) {
  const token = String(file || '').replace(/\\/g, '/');
  const marker = '/wholeships/';
  const idx = token.lastIndexOf(marker);
  const relative = idx >= 0 ? token.slice(idx + 1) : token;
  return PACKAGED_LIVE_WHOLE_SHIP_FILES.has(relative);
}

function packagedLiveWholeShipFile(file) {
  const token = String(file || '').replace(/\\/g, '/');
  const marker = '/wholeships/';
  const idx = token.lastIndexOf(marker);
  const relative = idx >= 0 ? token.slice(idx + 1) : token;
  return PACKAGED_LIVE_WHOLE_SHIP_FILES.has(relative) ? relative : null;
}

// S6 faction hulls: palette + lit-trim variants of the hull the enemy already renders (same
// geometry, collider fit and sockets; tools/blender/forge/variant.py). Enemy-id keyed on purpose:
// the live entity's factionId is whatever zone or encounter fielded it, the enemy id is not.
//   patrol_lawman, customs_cutter  Concord navy Hornet interdictor (was the player's yellow Hornet)
//   quiet_ghost                    The Quiet's ink-violet Wasp (lancer_sniper and the pirate Wasp stay put)
//   choir_zealot                   Ascendant Choir plum/magenta dart (the Reach dart keeps its sodium)
//   warden_escort                  Vael teal lode (the Reach bruisers keep the oxide lode)
const WHOLE_SHIP_FILE_BY_HOSTILE_ID = Object.freeze({
  wasp_swarmer: 'wholeships/ashline_dart.glb',
  choir_zealot: 'wholeships/ashline_dart_choir.glb',
  lancer_sniper: 'wholeships/wasp_production_v1.glb',
  quiet_ghost: 'wholeships/wasp_quiet_ghost.glb',
  patrol_lawman: 'wholeships/hornet_scn_interdictor.glb',
  customs_cutter: 'wholeships/hornet_scn_interdictor.glb',
  warden_escort: 'wholeships/swarm_warden.glb',
  bruiser_brawler: 'wholeships/ashline_lode.glb',
  pd_screen_escort: 'wholeships/ashline_lode.glb',
  field_anchor_controller: 'wholeships/swarm_anchor.glb',
  reaver_pirate: 'wholeships/ashline_rig.glb',
  mine_layer_jackal: 'wholeships/swarm_jackal.glb',
  corsair_raider: 'wholeships/ashline_rig_corsair_blade.glb',
  tether_control_raider: 'wholeships/ashline_rig.glb',
  mule_trader: 'wholeships/helios_span.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_HOSTILE_ID = Object.freeze({
  wasp_swarmer: 'SF_WHOLESHIP_ASHLINE_DART',
  choir_zealot: 'SF_WHOLESHIP_ASHLINE_DART_CHOIR',
  lancer_sniper: 'SF_WASP_PRODUCTION_V1',
  quiet_ghost: 'SF_WASP_QUIET_GHOST',
  patrol_lawman: 'SF_HORNET_SCN_INTERDICTOR',
  customs_cutter: 'SF_HORNET_SCN_INTERDICTOR',
  warden_escort: 'SF_SWARM_WARDEN',
  bruiser_brawler: 'SF_WHOLESHIP_ASHLINE_LODE',
  pd_screen_escort: 'SF_WHOLESHIP_ASHLINE_LODE',
  field_anchor_controller: 'SF_SWARM_ANCHOR',
  reaver_pirate: 'SF_WHOLESHIP_ASHLINE_RIG',
  mine_layer_jackal: 'SF_SWARM_JACKAL',
  corsair_raider: 'SF_WHOLESHIP_ASHLINE_RIG_CORSAIR_BLADE',
  tether_control_raider: 'SF_WHOLESHIP_ASHLINE_RIG',
  mule_trader: 'SF_WHOLESHIP_HELIOS_SPAN',
});
const WHOLE_SHIP_FILE_BY_SILHOUETTE = Object.freeze({
  drone_swarm: 'wholeships/ashline_dart.glb',
  sniper_lance: 'wholeships/wasp_production_v1.glb',
  bruiser_armor: 'wholeships/ashline_lode.glb',
  pirate_swoop: 'wholeships/ashline_rig.glb',
  corsair_blade: 'wholeships/ashline_rig_corsair_blade.glb',
  trader_haul: 'wholeships/helios_span.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_SILHOUETTE = Object.freeze({
  drone_swarm: 'SF_WHOLESHIP_ASHLINE_DART',
  sniper_lance: 'SF_WASP_PRODUCTION_V1',
  bruiser_armor: 'SF_WHOLESHIP_ASHLINE_LODE',
  pirate_swoop: 'SF_WHOLESHIP_ASHLINE_RIG',
  corsair_blade: 'SF_WHOLESHIP_ASHLINE_RIG_CORSAIR_BLADE',
  trader_haul: 'SF_WHOLESHIP_HELIOS_SPAN',
});
const WHOLE_SHIP_FILE_BY_ASSET_REF = Object.freeze({
  enemy_reaver_interceptor: 'wholeships/ashline_rig.glb',
  enemy_reaver_skirmisher: 'wholeships/ashline_rig.glb',
  enemy_reaver_tug: 'wholeships/ashline_rig.glb',
  'asset.slice.meridian_recovery_tug': 'wholeships/yard_tug.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_ASSET_REF = Object.freeze({
  enemy_reaver_interceptor: 'SF_WHOLESHIP_ASHLINE_RIG',
  enemy_reaver_skirmisher: 'SF_WHOLESHIP_ASHLINE_RIG',
  enemy_reaver_tug: 'SF_WHOLESHIP_ASHLINE_RIG',
  'asset.slice.meridian_recovery_tug': 'SF_WHOLESHIP_YARD_TUG',
});
// Ambient civilian traffic owns a durable presentation role independent of ship-def gameplay
// stats. This keeps role silhouettes stable across rematerialization and prevents courier traffic
// (`ship_kestrel`) from ever replacing the player's K0 whole-ship body.
//
// PQ-045 npc-identity work fleet (`assets/ships/npc_work_fleet/`): four occupational families
// re-authored from the npc_activity_pack donor silhouettes so the working trades stop sharing
// one modular hull. The ore barge is deliberately NOT `hauler` — that key is the accepted
// helios_span, and a barge row under it would replace an accepted live asset in every sector.
// `ore_carrier` is its own presentationRole with its own TRAFFIC_ROLES entry; job eligibility
// gates on the separate `slot.jobKind`, never on presentationRole, so Ceres freight slots keep
// their hauler jobs intact.
const WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE = Object.freeze({
  // Traffic bodies point at the declared, packaged wholeship releases. The remaster rewired these
  // roles to *_production_v1 re-releases that were never declared in release_manifest.json nor
  // given render packages or embedded asset identity, so assetLoader failed closed on every load
  // and courier/hauler/surveyor/miner/ore_carrier/tender/salvor traffic rendered as invisible
  // zero-draw boundaries. Re-point each role here once its production body completes the release
  // pipeline (parts_manifest row + sg04 release build + pilot package).
  courier: 'wholeships/helios_lark.glb',
  miner: 'wholeships/helios_cradle.glb',
  hauler: 'wholeships/helios_span.glb',
  stormshift_collector: 'wholeships/ship_stormshift_collector_v01.glb',
  stormshift_receiver: 'wholeships/ship_stormshift_receiver_v01.glb',
  // PQ-193.07: rare Helios heavy. Additive key — do not remap hauler/Span or Atlas.
  arclight: 'wholeships/helios_arclight.glb',
  ore_carrier: 'wholeships/ore_barge.glb',
  tender: 'wholeships/repair_tender.glb',
  salvor: 'wholeships/salvage_cutter.glb',
  surveyor: 'wholeships/survey_pin.glb',
  // PQ-136.02: packaged work-fleet hulls with no recorded still-review defect. Additive
  // keys only — existing role values above stay the accepted live bodies.
  // PQ-049: Helios express selects the civic liner after its release/package proof.
  express: 'wholeships/massline_express_liner_v1.glb',
  rescue: 'wholeships/rescue_lifter.glb',
  prospector: 'wholeships/prospector_skiff.glb',
  sweeper: 'wholeships/scrap_sweeper.glb',
  shuttle: 'wholeships/apron_shuttle.glb',
  tug: 'wholeships/yard_tug.glb',
  // PQ-193.08: rare Helios extras. Additive keys — do not remap Span, Atlas, or Arclight.
  tanker: 'wholeships/volatiles_tanker.glb',
  customs: 'wholeships/inspection_cutter.glb',
  // PQ-193.01: opening smuggler / pirate publish complete Hitch-world hulls, never modular kit.
  // Chase stills vs Hitch (play_chase / close): Drifter is a complete dark hull; factory Hornet
  // reads as a pale toy (Hitch-plus fail). Pirate uses the accepted Wasp of the same combat role.
  smuggler: 'wholeships/drifter_production_v1.glb',
  pirate: 'wholeships/wasp_production_v1.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE = Object.freeze({
  // Must match the asset identity embedded in each packaged traffic body above; the record
  // resolver rejects a whole-ship load whose assetId differs from the selected role identity.
  // Verified against asset.extras.spacefaceAsset.assetId in each release GLB.
  courier: 'SF_WHOLESHIP_HELIOS_LARK',
  miner: 'SF_WHOLESHIP_HELIOS_CRADLE',
  hauler: 'SF_WHOLESHIP_HELIOS_SPAN',
  stormshift_collector: 'SF_STORMSHIFT_COLLECTOR_V01',
  stormshift_receiver: 'SF_STORMSHIFT_RECEIVER_V01',
  arclight: 'SF_WHOLESHIP_HELIOS_ARCLIGHT',
  ore_carrier: 'SF_WHOLESHIP_ORE_BARGE',
  tender: 'SF_WHOLESHIP_REPAIR_TENDER',
  salvor: 'SF_WHOLESHIP_SALVAGE_CUTTER',
  surveyor: 'SF_WHOLESHIP_SURVEY_PIN',
  express: 'SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1',
  rescue: 'SF_WHOLESHIP_RESCUE_LIFTER',
  prospector: 'SF_WHOLESHIP_PROSPECTOR_SKIFF',
  sweeper: 'SF_WHOLESHIP_SCRAP_SWEEPER',
  shuttle: 'SF_WHOLESHIP_APRON_SHUTTLE',
  tug: 'SF_WHOLESHIP_YARD_TUG',
  tanker: 'SF_WHOLESHIP_VOLATILES_TANKER',
  customs: 'SF_WHOLESHIP_INSPECTION_CUTTER',
  smuggler: 'SF_DRIFTER_PRODUCTION_V1',
  pirate: 'SF_WASP_PRODUCTION_V1',
});
// PQ-193.09: live Span/Wasp carry existing foundry faction kits. Unknown factions keep the
// unskinned body. Pirate Wasp and the player Wasp stay the accepted production hull.
const SPAN_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_dmc: Object.freeze({ file: 'wholeships/helios_span_dmc.glb', assetId: 'SF_WHOLESHIP_HELIOS_SPAN_DMC' }),
  faction_mts: Object.freeze({ file: 'wholeships/helios_span_mts.glb', assetId: 'SF_WHOLESHIP_HELIOS_SPAN_MTS' }),
  faction_reach: Object.freeze({ file: 'wholeships/helios_span_reach.glb', assetId: 'SF_WHOLESHIP_HELIOS_SPAN_REACH' }),
});
const WASP_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_free: Object.freeze({ file: 'wholeships/wasp_free_militia.glb', assetId: 'SF_WASP_FREE_MILITIA' }),
  faction_mts: Object.freeze({ file: 'wholeships/wasp_mts_escort.glb', assetId: 'SF_WASP_MTS_ESCORT' }),
  faction_scn: Object.freeze({ file: 'wholeships/wasp_scn_patrol.glb', assetId: 'SF_WASP_SCN_PATROL' }),
});
const WASP_FACTION_KIT_ROLES = Object.freeze(new Set(['patrol', 'escort']));
// S6: faction-fielded hulls whose enemy id / role is shared across factions, so the body follows the
// entity's factionId like the Span and Wasp kits. Rig hostiles fielded under the Quiet (the smuggler
// zones of Tethys Junction and Pallas Drift) and miner barges flying for the Drift Miners Collective
// (Ceres, Vesta, Charon traffic) wear their operator's paint; every other faction keeps the base hull.
const RIG_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_quiet: Object.freeze({ file: 'wholeships/ashline_rig_quiet.glb', assetId: 'SF_WHOLESHIP_ASHLINE_RIG_QUIET' }),
});
const CRADLE_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_dmc: Object.freeze({ file: 'wholeships/helios_cradle_dmc.glb', assetId: 'SF_WHOLESHIP_HELIOS_CRADLE_DMC' }),
});
// Row 514: the factions whose live ships still drew undressed player hulls get their kit
// on the hulls they actually field (src/data/factionPresence.js plans + the shipRoles in
// src/data/factions/*.js): Helix directorate couriers and the Archive reading courier ride
// Drifters; Fulfillment route haulers and the Pitborn salvage tenders/cull announcers run
// Mules; Archive censor frigates and the Verge observer prisms ride Rangers; Understory
// gardener skiffs ride the same Kestrel hull the player borrows; the Pitborn yard tender
// seen at Ashfall/Vesta/Ceres is an Ironback. The kit claims only entities carrying that
// factionId — the player entity is faction_free, so the player's own hulls stay
// production paint.
const DRIFTER_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_helix: Object.freeze({ file: 'wholeships/drifter_helix_courier.glb', assetId: 'SF_DRIFTER_HELIX_COURIER' }),
  faction_archive: Object.freeze({ file: 'wholeships/drifter_archive_censor.glb', assetId: 'SF_DRIFTER_ARCHIVE_CENSOR' }),
});
const MULE_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_fulfillment: Object.freeze({ file: 'wholeships/mule_fulfillment_hauler.glb', assetId: 'SF_MULE_FULFILLMENT_HAULER' }),
  faction_pitborn: Object.freeze({ file: 'wholeships/mule_pitborn_junk.glb', assetId: 'SF_MULE_PITBORN_JUNK' }),
});
const RANGER_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_archive: Object.freeze({ file: 'wholeships/ranger_archive_censor.glb', assetId: 'SF_RANGER_ARCHIVE_CENSOR' }),
  faction_verge_layers: Object.freeze({ file: 'wholeships/ranger_verge_surveyor.glb', assetId: 'SF_RANGER_VERGE_SURVEYOR' }),
});
const KESTREL_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_understory: Object.freeze({ file: 'wholeships/kestrel_understory_growth.glb', assetId: 'SF_KESTREL_UNDERSTORY_GROWTH' }),
});
const IRONBACK_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_pitborn: Object.freeze({ file: 'wholeships/ironback_pitborn_junk.glb', assetId: 'SF_IRONBACK_PITBORN_JUNK' }),
});
const LIVE_SPAN_FILE = 'wholeships/helios_span.glb';
const LIVE_WASP_FILE = 'wholeships/wasp_production_v1.glb';
const LIVE_RIG_FILE = 'wholeships/ashline_rig.glb';
const LIVE_CRADLE_FILE = 'wholeships/helios_cradle.glb';
const LIVE_DRIFTER_FILE = 'wholeships/drifter_production_v1.glb';
const LIVE_MULE_FILE = 'wholeships/mule_production_v1.glb';
const LIVE_RANGER_FILE = 'wholeships/ranger_production_v1.glb';
const LIVE_KESTREL_FILE = 'wholeships/kestrel.glb';
const LIVE_IRONBACK_FILE = 'wholeships/ironback_production_v1.glb';
function wholeShipSelection(file, assetId, roleId, lodFamily = null) {
  return Object.freeze({
    file,
    assetId,
    roleId,
    required: true,
    ...(lodFamily ? { lodFamily } : {}),
  });
}

/** Empty-admission identity: a mapped file that is not packaged-live must not publish. */
function liveWholeShipSelection(file, assetId, roleId, lodFamily = null) {
  if (!packagedLiveWholeShipFile(file)) return null;
  // Role/archetype overrides can select a Wasp for a Hornet stat block. Faction kits do not
  // inherit the base family's LODs: changing distance must never change a ship's livery.
  return wholeShipSelection(file, assetId, roleId, lodFamily || WHOLE_SHIP_LOD_FAMILY_BY_FILE[file] || null);
}

function factionIdForVisual(entity) {
  const data = entity && entity.data || {};
  return String(entity && entity.factionId || data.factionId || '');
}

function applyFactionWholeShipKit(entity, selection) {
  if (!selection || !selection.file) return selection;
  const factionId = factionIdForVisual(entity);
  if (!factionId) return selection;
  if (selection.file === LIVE_SPAN_FILE) {
    const kit = SPAN_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
    return selection;
  }
  if (selection.file === LIVE_WASP_FILE) {
    const role = String(entity && entity.data && entity.data.trafficRole || '');
    if (!WASP_FACTION_KIT_ROLES.has(role)) return selection;
    const kit = WASP_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
  }
  if (selection.file === LIVE_RIG_FILE) {
    const kit = RIG_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
  }
  if (selection.file === LIVE_CRADLE_FILE) {
    const kit = CRADLE_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
  }
  if (selection.file === LIVE_DRIFTER_FILE) {
    const kit = DRIFTER_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
  }
  if (selection.file === LIVE_MULE_FILE) {
    const kit = MULE_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
  }
  if (selection.file === LIVE_RANGER_FILE) {
    const kit = RANGER_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
  }
  if (selection.file === LIVE_KESTREL_FILE) {
    const kit = KESTREL_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
  }
  if (selection.file === LIVE_IRONBACK_FILE) {
    const kit = IRONBACK_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
  }
  return selection;
}


/** Select ordinary families only; callers own any special-actor precedence. */
export function ordinaryWholeShipVisualForEntity(entity, options = {}) {
  const data = entity && entity.data || {};
  const hostileId = String(data.lootTableId || '');
  const hostileFile = WHOLE_SHIP_FILE_BY_HOSTILE_ID[hostileId];
  if (hostileFile) {
    return applyFactionWholeShipKit(entity, liveWholeShipSelection(
      hostileFile, WHOLE_SHIP_ASSET_ID_BY_HOSTILE_ID[hostileId], hostileId,
    ));
  }
  const silhouette = String(data.silhouette || '');
  const silhouetteFile = WHOLE_SHIP_FILE_BY_SILHOUETTE[silhouette];
  if (silhouetteFile) {
    return applyFactionWholeShipKit(entity, liveWholeShipSelection(
      silhouetteFile,
      WHOLE_SHIP_ASSET_ID_BY_SILHOUETTE[silhouette],
      silhouette,
    ));
  }
  const assetRef = String(data.assetRef || '');
  const assetRefFile = WHOLE_SHIP_FILE_BY_ASSET_REF[assetRef];
  if (assetRefFile) {
    return applyFactionWholeShipKit(entity, liveWholeShipSelection(
      assetRefFile,
      WHOLE_SHIP_ASSET_ID_BY_ASSET_REF[assetRef],
      assetRef,
    ));
  }
  // The dedicated cradle belongs to the authored receiving worker. An ordinary
  // hauler with a copied/stale role cannot change silhouette through that tag alone.
  const requestedTrafficRole = String(data.trafficRole || '');
  const trafficRole = requestedTrafficRole === 'stormshift_receiver'
    && !(data.worldRecordId && data.itinerary?.kind === 'anvil_work' && data.itinerary.role === 'receiver')
    ? 'hauler' : requestedTrafficRole;
  const trafficFile = WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE[trafficRole];
  if (trafficFile) {
    return applyFactionWholeShipKit(entity, liveWholeShipSelection(
      trafficFile,
      WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE[trafficRole],
      trafficRole,
    ));
  }
  if (options.requiredWholeShip !== true) return null;
  const defId = data.defId || data.hullDefId;
  const file = WHOLE_SHIP_FILE_BY_DEF_ID[defId];
  return applyFactionWholeShipKit(entity, file ? liveWholeShipSelection(
    file,
    WHOLE_SHIP_ASSET_ID_BY_DEF_ID[defId],
    defId,
    WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID[defId] || null,
  ) : null);
}

/** Existing wreck handoff, with an optional render selector for special actors. */
export function wholeHulkVisualForEntity(entity, select = ordinaryWholeShipVisualForEntity) {
  const data = entity?.data || {};
  const visual = data.hulkVisual && typeof data.hulkVisual === 'object'
    ? data.hulkVisual : (data.hulkOfDefId ? { defId: data.hulkOfDefId } : null);
  return visual ? select({ type: 'ship', factionId: data.hulkFactionId || null, data: visual },
    { requiredWholeShip: true }) : null;
}

const CANONICAL_HULK_DEF_BY_FILE = new Map([
  ...Object.entries(WHOLE_SHIP_FILE_BY_DEF_ID).map(([id, file]) => [file, id]),
  ['wholeships/helios_span.glb', 'traffic:hauler'],
]);
export const WRECK_HULK_COLLISION_PROFILE = 'wreck-hulk:packaged-fit-v1';
export const MULE_SITE_COLLISION_PROFILE = 'warm-freighter:mule:packaged-fit-v1';
const HULK_PROXY_ID_BY_FILE = new Map([...CANONICAL_HULK_DEF_BY_FILE]
  .map(([file, id]) => [file, `${WRECK_HULK_COLLISION_PROFILE}:${id}`]));
const HULK_SELECTION_CACHE = new WeakMap();
export function canonicalWholeHulkDefId(file) {
  return CANONICAL_HULK_DEF_BY_FILE.get(file) || null;
}

/** Conservative exclusion of geometry owned by another wreck path. */
export function hasWholeHulkGeometry(entity) {
  const data = entity?.data;
  return entity?.type === 'wreck' && !!data && !data.fracturePiece
    && !data.fractureVisual?.partId && !data.collisionTearOff && !data.arenaShardOf
    && !data.orchardId && !data.lastShiftSiteId && !data.worldSiteStructural
    && !data.ceresWorkfleetPlace && !data.placeId
    && !ironKrakenProfileFor(data.hulkVisual?.lootTableId || data.hulkVisual?.enemyTypeId);
}

/** The owner stamps this only after applying a qualified physical profile.
 * Facades transport the strings; an available live body must agree as well. */
export function isPhysicsBoundWholeHulk(entity) {
  if (!hasWholeHulkGeometry(entity) || entity.alive === false
    || entity.collides === false || entity.physicsBody === false) return false;
  const data = entity.data, profile = data.hulkCollisionProfile;
  if (profile !== WRECK_HULK_COLLISION_PROFILE && profile !== MULE_SITE_COLLISION_PROFILE) return false;
  const file = data.hulkCollisionFile;
  if (!canonicalWholeHulkDefId(file)) return false;
  // Render hot path: compare scalar identity fields, allocating only on a real
  // identity change. In-place edits to the same data/visual shell invalidate too.
  const visual = data.hulkVisual && typeof data.hulkVisual === 'object' ? data.hulkVisual : null;
  const source = visual || data;
  const defId = visual ? visual.defId : data.hulkOfDefId;
  let selected = HULK_SELECTION_CACHE.get(entity);
  if (!selected || selected.visual !== visual || selected.defId !== defId
    || selected.hullDefId !== source.hullDefId || selected.lootTableId !== source.lootTableId
    || selected.silhouette !== source.silhouette || selected.assetRef !== source.assetRef
    || selected.trafficRole !== source.trafficRole || selected.faction !== data.hulkFactionId
    || selected.worldRecordId !== source.worldRecordId
    || selected.jobKind !== source.itinerary?.kind || selected.jobRole !== source.itinerary?.role) {
    selected = { visual, defId, hullDefId: source.hullDefId, lootTableId: source.lootTableId,
      silhouette: source.silhouette, assetRef: source.assetRef, trafficRole: source.trafficRole,
      faction: data.hulkFactionId, worldRecordId: source.worldRecordId,
      jobKind: source.itinerary?.kind, jobRole: source.itinerary?.role,
      file: wholeHulkVisualForEntity(entity)?.file };
    HULK_SELECTION_CACHE.set(entity, selected);
  }
  if (selected.file !== file) return false;
  if (profile === MULE_SITE_COLLISION_PROFILE && file !== WHOLE_SHIP_FILE_BY_DEF_ID.ship_mule) return false;
  const body = entity.physicsBody;
  return !body || body.useMeasuredSkin !== false && body.shape === 'compound' && body.collisionProxyManifest?.id === (
    profile === MULE_SITE_COLLISION_PROFILE ? profile : HULK_PROXY_ID_BY_FILE.get(file));
}

export {
  WHOLE_SHIP_FILE_BY_DEF_ID,
  WHOLE_SHIP_ASSET_ID_BY_DEF_ID,
  WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID,
  WHOLE_SHIP_LOD_FAMILY_BY_FILE,
  PACKAGED_LIVE_WHOLE_SHIP_FILES,
  packagedLiveWholeShipFile,
  WHOLE_SHIP_FILE_BY_HOSTILE_ID,
  WHOLE_SHIP_ASSET_ID_BY_HOSTILE_ID,
  WHOLE_SHIP_FILE_BY_SILHOUETTE,
  WHOLE_SHIP_ASSET_ID_BY_SILHOUETTE,
  WHOLE_SHIP_FILE_BY_ASSET_REF,
  WHOLE_SHIP_ASSET_ID_BY_ASSET_REF,
  WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE,
  WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE,
  SPAN_FACTION_KIT_BY_FACTION,
  WASP_FACTION_KIT_BY_FACTION,
  WASP_FACTION_KIT_ROLES,
  RIG_FACTION_KIT_BY_FACTION,
  CRADLE_FACTION_KIT_BY_FACTION,
  DRIFTER_FACTION_KIT_BY_FACTION,
  MULE_FACTION_KIT_BY_FACTION,
  RANGER_FACTION_KIT_BY_FACTION,
  KESTREL_FACTION_KIT_BY_FACTION,
  IRONBACK_FACTION_KIT_BY_FACTION,
  LIVE_SPAN_FILE,
  LIVE_WASP_FILE,
  LIVE_RIG_FILE,
  LIVE_CRADLE_FILE,
  LIVE_DRIFTER_FILE,
  LIVE_MULE_FILE,
  LIVE_RANGER_FILE,
  LIVE_KESTREL_FILE,
  LIVE_IRONBACK_FILE,
  wholeShipSelection,
  liveWholeShipSelection,
  factionIdForVisual,
  applyFactionWholeShipKit
};
