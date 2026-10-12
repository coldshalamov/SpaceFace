// AEP PR-1 rim wave 1 (spec §5/P3, audit BP-7/BP-8 + §6 rim table) — the five rim sectors
// (Kepler Scar, Dione Lane, Rhea Cinder, Phoebe Echo, Sedna Dark) each get a complete packet:
// a sharpened way-of-life verb with a named signature toy, a camera-scale activity pocket,
// the lane contact promoted to a character (hail + memoryHook), an interactive verb on the
// sector's one-off, a discovery chain (clue POI -> hidden cache payoff), a resident fauna
// site, and the toy itself wired as a kill machine the pocket's operators work on camera.
//
// The audit's own verify line: every rim sector has >= 1 pocket, >= 1 interactive one-off,
// >= 1 chain. This census proves all of that plus the rim rule (no two neighbouring rim
// sectors share a verb, a toy, or a cast) straight off the live tables.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTOR_WAY_OF_LIFE_BY_ID } from '../src/data/sectorWayOfLife.js';
import { NAMED_LANE_CONTACTS } from '../src/data/laneContacts.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { activityPocketsForSector } from '../src/data/sectorActivityPockets.js';
import { killMachinesForSector, ALL_KILL_MACHINE_BY_ID } from '../src/data/environmentalMachinery.js';
import { alienSitesForSector } from '../src/data/alienEcology.js';
import { WEST_REGIONS_BY_ID } from '../src/data/frontierRegions/west.js';
import { NORTH_SECTORS, NORTH_ANCHORS } from '../src/data/frontierRegions/north.js';
import { SOUTH_SECTORS, SOUTH_ANCHORS } from '../src/data/frontierRegions/south.js';

const RIM_SECTORS = Object.freeze([
  'sector_kepler_scar',
  'sector_dione_lane',
  'sector_rhea_cinder',
  'sector_phoebe_echo',
  'sector_sedna_dark',
]);

// The audit's expected signature toy per rim sector (§6 table): machine id -> mouth name.
const EXPECTED_TOYS = Object.freeze({
  sector_kepler_scar: { machineId: 'kepler_capsize_winch', mouthName: 'Capsize Winch' },
  sector_dione_lane: { machineId: 'dione_lane_gate', mouthName: 'Lane Gate' },
  sector_rhea_cinder: { machineId: 'rhea_pour_gate', mouthName: 'Pour Gate' },
  sector_phoebe_echo: { machineId: 'phoebe_tuning_fork', mouthName: 'Tuning Fork' },
  sector_sedna_dark: { machineId: 'sedna_patch_gun', mouthName: 'Patch Gun' },
});

const EXPECTED_CONTACTS = Object.freeze({
  sector_kepler_scar: 'lane_ferr_surplus_gate',
  sector_dione_lane: 'lane_sable_cleared_run',
  sector_rhea_cinder: 'lane_brand_scorched_seam',
  sector_phoebe_echo: 'lane_phoebe_echo_courier',
  sector_sedna_dark: 'lane_sedna_dark_tanker',
});

function sectorCard(sectorId) {
  if (WEST_REGIONS_BY_ID[sectorId]) return WEST_REGIONS_BY_ID[sectorId].sector;
  const north = NORTH_SECTORS.find((s) => s.id === sectorId);
  if (north) return north;
  const south = SOUTH_SECTORS.find((s) => s.id === sectorId);
  if (south) return south;
  throw new Error(`No sector card for ${sectorId}`);
}

function sectorAnchorPois(sectorId) {
  if (WEST_REGIONS_BY_ID[sectorId]) return WEST_REGIONS_BY_ID[sectorId].anchors.pois || [];
  if (NORTH_ANCHORS[sectorId]) return NORTH_ANCHORS[sectorId].pois || [];
  if (SOUTH_ANCHORS[sectorId]) return SOUTH_ANCHORS[sectorId].pois || [];
  return [];
}

test('rim wave-1 census: every rim sector carries the full packet', () => {
  for (const sectorId of RIM_SECTORS) {
    // (a) sharpened verb + named signature toy (no 'explicitly none').
    const wol = SECTOR_WAY_OF_LIFE_BY_ID[sectorId];
    assert.ok(wol, `${sectorId}: way-of-life row exists`);
    assert.ok(wol.verb && wol.verb.length > 0, `${sectorId}: verb authored`);
    assert.equal(
      wol.signatureToy,
      EXPECTED_TOYS[sectorId].machineId,
      `${sectorId}: signatureToy wired to its machine`,
    );
    assert.equal(
      ALL_KILL_MACHINE_BY_ID[wol.signatureToy].mouth.name,
      EXPECTED_TOYS[sectorId].mouthName,
      `${sectorId}: machine mouth carries the audit's toy name`,
    );

    // (b) >= 1 camera-scale activity pocket.
    const pockets = activityPocketsForSector(sectorId);
    assert.ok(pockets.length >= 1, `${sectorId}: >= 1 activity pocket`);
    assert.ok(
      pockets.every((p) => p.actorSlots.length >= 1),
      `${sectorId}: every pocket carries actors`,
    );

    // (c) promoted lane contact: the sector's named face has a hail and a memory hook.
    const contact = NAMED_LANE_CONTACTS.find((c) => c.id === EXPECTED_CONTACTS[sectorId]);
    assert.ok(contact, `${sectorId}: named lane contact exists`);
    assert.ok(
      contact.sectorIds.includes(sectorId),
      `${sectorId}: contact is bound to this sector`,
    );
    assert.ok(contact.hail && contact.hail.length > 0, `${sectorId}: contact hails`);
    assert.ok(
      contact.memoryHook && contact.memoryHook.length > 0,
      `${sectorId}: contact carries a memory hook`,
    );

    // (d) >= 1 interactive verb on the sector's one-off (physicalBody = ropeable/shovable).
    const oneOffs = WORLD_ONE_OFFS.filter((o) => o.sectorId === sectorId);
    assert.ok(oneOffs.length >= 1, `${sectorId}: one-off exists`);
    assert.ok(
      oneOffs.some((o) => o.physicalBody && o.physicalBody.mass > 0),
      `${sectorId}: one-off is interactive (physicalBody)`,
    );

    // (e) >= 1 discovery chain: a discoverable clue POI + a hidden cache POI that pays out
    // via contents, gated on active scan, and anchored in-sector.
    const card = sectorCard(sectorId);
    const anchorPoiIds = new Set(sectorAnchorPois(sectorId).map((p) => p.id));
    const clues = card.pois.filter(
      (p) => p.discoveryPlate && !p.hidden && p.type !== 'cache' && p.scannerSignalKind,
    );
    const caches = card.pois.filter(
      (p) => p.type === 'cache' && p.hidden && p.requiresActiveScan && p.contents,
    );
    assert.ok(clues.length >= 1, `${sectorId}: >= 1 clue POI with a discovery plate`);
    assert.ok(caches.length >= 1, `${sectorId}: >= 1 hidden payoff cache`);
    assert.ok(
      clues.some((p) => anchorPoiIds.has(p.id)),
      `${sectorId}: clue POI is anchored in-sector`,
    );
    assert.ok(
      caches.some((p) => anchorPoiIds.has(p.id)),
      `${sectorId}: cache POI is anchored in-sector`,
    );

    // (f) >= 1 resident fauna site.
    const sites = alienSitesForSector(sectorId);
    assert.ok(sites.length >= 1, `${sectorId}: >= 1 alien ecology site`);
    assert.ok(
      sites.every((s) => Object.keys(s.faunaCast).length >= 1),
      `${sectorId}: every site carries a fauna cast`,
    );

    // (g) the toy system: >= 1 kill machine wired for the sector (the pocket's operators
    // work it — the anchor on each wave-1 pocket is the machine itself).
    const machines = killMachinesForSector(sectorId);
    assert.ok(machines.length >= 1, `${sectorId}: >= 1 kill machine`);
    assert.ok(
      machines.every((m) => ALL_KILL_MACHINE_BY_ID[m.id] === m),
      `${sectorId}: machines registered in the census`,
    );
    assert.ok(
      machines.every((m) => m.fields.length >= 1 && m.anvil),
      `${sectorId}: machines carry fields + anvil`,
    );
  }
});

test('rim rule: no two rim sectors share a verb, a toy, or a cast', () => {
  const verbs = RIM_SECTORS.map((s) => SECTOR_WAY_OF_LIFE_BY_ID[s].verb);
  const toys = RIM_SECTORS.map((s) => SECTOR_WAY_OF_LIFE_BY_ID[s].signatureToy);
  const contacts = RIM_SECTORS.map((s) => EXPECTED_CONTACTS[s]);
  assert.equal(new Set(verbs).size, verbs.length, 'all rim verbs are distinct');
  assert.equal(new Set(toys).size, toys.length, 'all rim toys are distinct');
  assert.equal(new Set(contacts).size, contacts.length, 'all rim contacts are distinct');
});

test('rim wave-1 one-off interactivity: the three previously-static one-offs are ropeable', () => {
  const byId = Object.fromEntries(WORLD_ONE_OFFS.map((o) => [o.id, o]));
  for (const id of ['oneoff_unbroken', 'oneoff_the_answer', 'oneoff_the_pin']) {
    assert.ok(byId[id], `${id} exists`);
    assert.ok(
      byId[id].physicalBody && byId[id].physicalBody.mass > 0,
      `${id} carries a physicalBody`,
    );
  }
});
