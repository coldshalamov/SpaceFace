/**
 * AEP PR-2 (P4) rim-packet census — wave 2.
 *
 * Spec §5/P4: every wave-2 rim sector ships the same packet contract as PR-1 —
 *   (a) a sharpened way-of-life verb + signatureToy,
 *   (b) one camera-scale activity pocket (exactly two actors),
 *   (c) a promoted lane contact (hail + memoryHook),
 *   (d) a physicalBody on the sector's dressing one-off (ropeable/shove-able),
 *   (e) one discovery chain (clue POI -> hidden contents cache),
 *   (f) a resident fauna site (ALIEN_SITES bound to authored zone+POI),
 *   (g) a signature kill-machine toy wired for the sector.
 * Neighbour rule (audit §6): no two neighbouring rim sectors share a verb, a toy,
 * or a fauna cast. Wave-1 sectors are not on this branch, so the rule is asserted
 * over the wave-2 set; anything adjacent to a wave-2 sector inside the set is checked.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { FRONTIER_SECTORS, FRONTIER_ANCHORS } from '../src/data/frontierRegions/index.js';
import { SECTOR_WAY_OF_LIFE_BY_ID } from '../src/data/sectorWayOfLife.js';
import { activityPocketsForSector } from '../src/data/sectorActivityPockets.js';
import { NAMED_LANE_CONTACTS } from '../src/data/laneContacts.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { killMachinesForSector } from '../src/data/environmentalMachinery.js';
import { alienSitesForSector } from '../src/data/alienEcology.js';

const WAVE2 = Object.freeze([
  // sectorId, pocketId, contactId, oneoffId, machineId, siteId, cluePoi, cachePoi
  {
    sectorId: 'sector_nyx_march', pocketId: 'nyx_burn_shift', contactId: 'lane_nineola_hush',
    oneoffId: 'oneoff_false_gate', machineId: 'nyx_paper_shredder',
    siteId: 'nyx_cutlane_drift', cluePoi: 'poi_nyx_burn_box', cachePoi: 'poi_nyx_ash_tithe',
  },
  {
    sectorId: 'sector_hyperion_cut', pocketId: 'hyperion_saw_shift', contactId: 'lane_ossa_cutrun',
    oneoffId: 'oneoff_half_cut', machineId: 'hyperion_cut_saw',
    siteId: 'hyperion_belt_ram', cluePoi: 'poi_hyperion_kerf_log', cachePoi: 'poi_hyperion_core_claim',
  },
  {
    sectorId: 'sector_orcus_shadow', pocketId: 'orcus_shelf_watch', contactId: 'lane_orcus_shadow_courier',
    oneoffId: 'oneoff_the_tide', machineId: 'orcus_dim_lamp',
    siteId: 'orcus_shelf_crabs', cluePoi: 'poi_orcus_shelf_ping', cachePoi: 'poi_orcus_annex',
  },
  {
    sectorId: 'sector_haumea_rift', pocketId: 'haumea_rift_watch', contactId: 'lane_quill_fractureline',
    oneoffId: 'oneoff_seam_light', machineId: 'fissure_cracker',
    siteId: 'haumea_fissure_graze', cluePoi: 'poi_haumea_echo_rake', cachePoi: 'poi_haumea_cold_cache',
  },
  {
    sectorId: 'sector_eris_margin', pocketId: 'eris_sweep_shift', contactId: 'lane_ash_margin_cross',
    oneoffId: 'oneoff_drift_choir', machineId: 'eris_drift_net',
    siteId: 'eris_sweep_kites', cluePoi: 'poi_eris_tally_mast', cachePoi: 'poi_eris_bolt',
  },
  {
    sectorId: 'sector_nereid_shoal', pocketId: 'nereid_sled_shift', contactId: 'lane_iva_ice_cut',
    oneoffId: 'oneoff_open_hand', machineId: 'nereid_ice_sled',
    siteId: 'nereid_shoal_leeches', cluePoi: 'poi_nereid_ice_line', cachePoi: 'poi_nereid_drift_hold',
  },
  {
    sectorId: 'sector_proteus_well', pocketId: 'proteus_well_sound', contactId: 'lane_low_well_sound',
    oneoffId: 'oneoff_double_take', machineId: 'proteus_well_bucket',
    siteId: 'proteus_well_shepherd', cluePoi: 'poi_proteus_well_ping', cachePoi: 'poi_proteus_den_stash',
  },
  {
    sectorId: 'sector_triton_wake', pocketId: 'triton_kite_watch', contactId: 'lane_triton_wake_courier',
    oneoffId: 'oneoff_watchers_tithe', machineId: 'triton_wake_kite',
    siteId: 'triton_wake_eels', cluePoi: 'poi_triton_wake_log', cachePoi: 'poi_triton_offering',
  },
  {
    sectorId: 'sector_eunomia_gulf', pocketId: 'eunomia_license_shift', contactId: 'lane_wray_license_board',
    oneoffId: 'oneoff_held_note', machineId: 'eunomia_license_stamp',
    siteId: 'eunomia_hulk_mites', cluePoi: 'poi_eunomia_wreck_writ', cachePoi: 'poi_eunomia_board_fee',
  },
]);

const SECTOR_BY_ID = Object.freeze(Object.fromEntries(FRONTIER_SECTORS.map((s) => [s.id, s])));
const CONTACT_BY_ID = Object.freeze(Object.fromEntries(NAMED_LANE_CONTACTS.map((c) => [c.id, c])));
const ONE_OFF_BY_ID = Object.freeze(Object.fromEntries(WORLD_ONE_OFFS.map((o) => [o.id, o])));

test('every wave-2 rim sector ships the full packet', () => {
  for (const row of WAVE2) {
    const sector = SECTOR_BY_ID[row.sectorId];
    assert.ok(sector, `${row.sectorId} missing from FRONTIER_SECTORS`);

    // (a) verb + signatureToy
    const wol = SECTOR_WAY_OF_LIFE_BY_ID[row.sectorId];
    assert.ok(wol?.verb?.length > 0, `${row.sectorId} missing sharpened verb`);
    assert.ok(wol?.signatureToy && wol.signatureToy !== 'explicitly none',
      `${row.sectorId} signatureToy not assigned`);

    // (b) exactly one new pocket, two actors
    const pockets = activityPocketsForSector(row.sectorId);
    const pocket = pockets.find((p) => p.id === row.pocketId);
    assert.ok(pocket, `${row.sectorId} missing pocket ${row.pocketId}`);
    assert.equal(pocket.actorSlots.length, 2, `${row.pocketId} must declare two pocket actors`);

    // (c) promoted lane contact
    const contact = CONTACT_BY_ID[row.contactId];
    assert.ok(contact, `${row.sectorId} missing contact ${row.contactId}`);
    assert.ok(contact.sectorIds.includes(row.sectorId), `${row.contactId} not routed to ${row.sectorId}`);
    assert.ok(contact.hail && contact.memoryHook, `${row.contactId} not promoted (hail/memoryHook)`);

    // (d) interactive one-off
    const oneoff = ONE_OFF_BY_ID[row.oneoffId];
    assert.ok(oneoff, `${row.sectorId} missing one-off ${row.oneoffId}`);
    assert.equal(oneoff.sectorId, row.sectorId);
    assert.ok(oneoff.physicalBody?.mass > 0, `${row.oneoffId} missing physicalBody mass`);

    // (e) discovery chain: clue POI + hidden contents cache, both placed in anchors
    const poiRows = sector.pois ?? [];
    const clue = poiRows.find((p) => p.id === row.cluePoi);
    const cache = poiRows.find((p) => p.id === row.cachePoi);
    assert.ok(clue?.requiresActiveScan && clue.manualInvestigation && clue.discoveryPlate,
      `${row.sectorId} clue POI ${row.cluePoi} missing scan/investigate contract`);
    assert.ok(cache?.hidden && cache.contents?.amount > 0,
      `${row.sectorId} cache POI ${row.cachePoi} missing hidden contents payoff`);
    const anchorPois = FRONTIER_ANCHORS[row.sectorId]?.pois ?? [];
    for (const poiId of [row.cluePoi, row.cachePoi]) {
      const anchor = anchorPois.find((p) => p.id === poiId);
      assert.ok(anchor?.pos && Number.isFinite(anchor.pos.x) && Number.isFinite(anchor.pos.z),
        `${row.sectorId} ${poiId} has no anchor placement`);
    }

    // (f) resident fauna
    const site = alienSitesForSector(row.sectorId).find((s) => s.siteId === row.siteId);
    assert.ok(site, `${row.sectorId} missing fauna site ${row.siteId}`);
    assert.ok(Object.keys(site.faunaCast).length > 0, `${row.siteId} empty faunaCast`);

    // (g) signature toy
    const machines = killMachinesForSector(row.sectorId);
    assert.ok(machines.some((m) => m.id === row.machineId),
      `${row.sectorId} missing kill machine ${row.machineId}`);
  }
});

test('neighbouring wave-2 rim sectors share no verb, toy, or cast', () => {
  const wave2Ids = new Set(WAVE2.map((r) => r.sectorId));
  const seen = new Set();
  for (const a of WAVE2) {
    const sector = SECTOR_BY_ID[a.sectorId];
    for (const bId of sector.neighbors ?? []) {
      if (!wave2Ids.has(bId)) continue; // wave-1 / core neighbours land on other branches
      const pairKey = [a.sectorId, bId].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const b = WAVE2.find((r) => r.sectorId === bId);

      assert.notEqual(SECTOR_WAY_OF_LIFE_BY_ID[a.sectorId].verb,
        SECTOR_WAY_OF_LIFE_BY_ID[bId].verb, `${a.sectorId} <-> ${bId} share a verb`);
      assert.notEqual(SECTOR_WAY_OF_LIFE_BY_ID[a.sectorId].signatureToy,
        SECTOR_WAY_OF_LIFE_BY_ID[bId].signatureToy, `${a.sectorId} <-> ${bId} share a toy`);
      assert.notEqual(a.machineId, b.machineId, `${a.sectorId} <-> ${bId} share a kill machine`);

      const castA = new Set(Object.keys(
        alienSitesForSector(a.sectorId).find((s) => s.siteId === a.siteId).faunaCast));
      const castB = new Set(Object.keys(
        alienSitesForSector(bId).find((s) => s.siteId === b.siteId).faunaCast));
      for (const species of castA) {
        assert.ok(!castB.has(species), `${a.sectorId} <-> ${bId} share fauna species ${species}`);
      }
    }
  }
});

test('wave-2 verbs, toys, and fauna casts are pairwise distinct', () => {
  const verbs = new Map();
  const toys = new Map();
  const speciesSeen = new Map();
  for (const row of WAVE2) {
    const wol = SECTOR_WAY_OF_LIFE_BY_ID[row.sectorId];
    assert.ok(!verbs.has(wol.verb), `duplicate verb across wave-2: ${wol.verb}`);
    verbs.set(wol.verb, row.sectorId);
    assert.ok(!toys.has(wol.signatureToy), `duplicate signatureToy across wave-2: ${wol.signatureToy}`);
    toys.set(wol.signatureToy, row.sectorId);
    const site = alienSitesForSector(row.sectorId).find((s) => s.siteId === row.siteId);
    for (const species of Object.keys(site.faunaCast)) {
      assert.ok(!speciesSeen.has(species),
        `fauna species ${species} in both ${speciesSeen.get(species)} and ${row.sectorId}`);
      speciesSeen.set(species, row.sectorId);
    }
  }
});
