// Row 540 (build_map §34.8) — thin-sector census.
// The twelve named thin sectors each carry their 04 throwable, hazard, resident,
// wonder and set piece on the default route; none may be "one hull is the whole
// schedule". The law wiring and the authored wonder builds belong to rows 464/450
// (this test pins data-level presence, not the live law or the finished wonder),
// and the Orphaned Shift machine-people are row 506's — the resident bar here is
// a named lane contact plus activity pockets, not the robot.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ZONES, ZONE_TYPES } from '../src/data/sectorZones.js';
import { ACTIVITY_POCKETS_BY_SECTOR } from '../src/data/sectorActivityPockets.js';
import { NAMED_LANE_CONTACTS, pickNamedLaneContact } from '../src/data/laneContacts.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';

const THIN_SECTORS = Object.freeze([
  'sector_hyperion_cut',
  'sector_rhea_cinder',
  'sector_nereid_shoal',
  'sector_kepler_scar',
  'sector_orcus_shadow',
  'sector_phoebe_echo',
  'sector_triton_wake',
  'sector_eunomia_gulf',
  'sector_sedna_dark',
  'sector_eris_margin',
  'sector_nyx_march',
  'sector_proteus_well',
]);

// The 04 "Throw" signature each thin sector must field, at minimum one of.
const THROW_SIGNATURE = Object.freeze({
  sector_hyperion_cut: ['ast_metallic', 'ast_common_rock'],      // cut ore and canyon rubble
  sector_rhea_cinder: ['ast_metallic', 'ast_rare_exotic'],       // scorched lots
  sector_nereid_shoal: ['ast_icy'],                              // ice blocks
  sector_kepler_scar: ['ast_metallic', 'ast_rare_exotic'],       // surplus crates, hull plating
  sector_orcus_shadow: ['ast_metallic'],                         // shadow debris (540 append)
  sector_phoebe_echo: ['ast_crystalline'],                       // singing crystals (540 append)
  sector_triton_wake: ['ast_metallic'],                          // wake debris (540 append)
  sector_eunomia_gulf: ['ast_metallic'],                         // licensed plate and wrecks (540 append)
  sector_sedna_dark: ['ast_metallic'],                           // dead lane buoys (540 append)
  sector_eris_margin: ['ast_metallic', 'ast_common_rock'],       // decoy pods, fence posts
  sector_nyx_march: ['ast_icy', 'ast_metallic'],                 // dead drops, sealed crates
  sector_proteus_well: ['ast_metallic', 'ast_crystalline'],      // well sediment
});

// The 540 scene appends: each thin sector's 04 set piece voiced as a sector-scoped
// lived vignette. Sectors whose 04 set piece already had a live encounter keep it
// (Nyx's "The Swap" is 702-the-swap, gated by ambush_lane + maxSecurity).
const SET_PIECE_SCENES = Object.freeze({
  sector_rhea_cinder: 'scene_scorched_convoy',   // 04: the scorched convoy run
  sector_kepler_scar: 'scene_no_weapons_brawl',  // 04: bazaar brawl, thrown objects only
  sector_triton_wake: 'scene_wake_draft',        // 04: the wake / E-09's lane
  sector_eunomia_gulf: 'scene_compost_run',      // 04: Compost Run vs the licence clock
  sector_eris_margin: 'scene_sweep_window',      // 04: run the sweep with hidden cargo
  sector_nyx_march: 'scene_dead_drop_lift',      // 04: dead drops and sealed crates
  sector_orcus_shadow: 'scene_flock_pass',       // 04: the Broken Shepherd's flock
  sector_phoebe_echo: 'scene_struck_bell',       // 04: play the broken song (E-33's lane)
});

const sectorById = new Map(SECTORS.map((s) => [s.id, s]));

function scopedEncounters(sectorId) {
  return Object.values(ENCOUNTERS).filter((e) => {
    const sids = e.sectorIds || e.gates?.sectorIds || [];
    return sids.includes(sectorId);
  });
}

test('W-540: all twelve thin sectors are live sector cards', () => {
  for (const id of THIN_SECTORS) {
    assert.ok(sectorById.has(id), `missing sector card ${id}`);
  }
});

test('W-540: throwable — every thin sector fields its 04 signature ammunition', () => {
  for (const id of THIN_SECTORS) {
    const sector = sectorById.get(id);
    const fields = sector.fields || [];
    assert.ok(fields.length >= 1, `${id} has no asteroid field`);
    for (const f of fields) {
      assert.ok(f.center && Number.isFinite(f.center.x) && Number.isFinite(f.center.z),
        `${id}/${f.id} needs an anchored center to spawn bodies`);
    }
    const types = new Set(fields.map((f) => f.type));
    const want = THROW_SIGNATURE[id];
    assert.ok(want.some((t) => types.has(t)),
      `${id} lacks its 04 throw signature (has ${[...types].join('/')}, wants one of ${want.join('/')})`);
  }
});

test('W-540: hazard — every thin sector has a hazard volume or hazard-typed zone', () => {
  for (const id of THIN_SECTORS) {
    const sector = sectorById.get(id);
    const volumes = sector.hazards || [];
    const zones = SECTOR_ZONES[id] || [];
    const hazardZones = zones.filter((z) => ZONE_TYPES[z.type]?.hazard);
    assert.ok(volumes.length >= 1 || hazardZones.length >= 1,
      `${id} has no hazard volume and no hazard-typed zone`);
  }
});

test('W-540: resident — every thin sector resolves a named contact and carries activity pockets', () => {
  for (const id of THIN_SECTORS) {
    const contact = pickNamedLaneContact(id, 4242);
    assert.ok(contact, `${id} resolves no named lane contact`);
    assert.ok(typeof contact.name === 'string' && contact.name.length > 0, `${id} contact unnamed`);
    const pockets = ACTIVITY_POCKETS_BY_SECTOR[id] || [];
    assert.ok(pockets.length >= 1, `${id} has no activity pockets`);
    const zones = SECTOR_ZONES[id] || [];
    assert.ok(zones.length >= 1, `${id} has no named zones`);
  }
});

test('W-540: wonder — every thin sector has a landmark or a world one-off on the route', () => {
  const oneOffs = Array.isArray(WORLD_ONE_OFFS) ? WORLD_ONE_OFFS : Object.values(WORLD_ONE_OFFS);
  for (const id of THIN_SECTORS) {
    const sector = sectorById.get(id);
    const landmarkPoi = (sector.pois || []).some((p) => p.landmark);
    const landmarkStation = (sector.stations || []).some((st) => st.landmark);
    const oneOff = oneOffs.some((w) => (w.sectorId || w.sectorIds?.[0]) === id);
    assert.ok(landmarkPoi || landmarkStation || oneOff,
      `${id} has no landmark poi, landmark station, or world one-off`);
  }
});

test('W-540: set piece — no thin sector is one hull for the whole schedule', () => {
  for (const id of THIN_SECTORS) {
    const scoped = scopedEncounters(id);
    assert.ok(scoped.length >= 2,
      `${id} has ${scoped.length} sector-scoped set piece (${scoped.map((e) => e.id).join(', ') || 'none'})`);
  }
});

test('W-540: the 540 scene appends register and gate to their authored sector', () => {
  for (const [sectorId, encounterId] of Object.entries(SET_PIECE_SCENES)) {
    const e = ENCOUNTERS[encounterId];
    assert.ok(e, `${encounterId} is not in the encounter catalog`);
    assert.equal(e.livedVignette, true, `${encounterId} must be a lived vignette`);
    assert.ok((e.sectorIds || []).includes(sectorId), `${encounterId} must scope to ${sectorId}`);
    assert.ok(e.shape && e.shape.situation && e.shape.place && e.shape.twist && e.shape.actor,
      `${encounterId} must carry a complete shape grammar`);
  }
});
