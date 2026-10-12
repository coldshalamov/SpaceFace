// AEP U1 (spec §3.5, scope card §5/U1) — NPC-path unit roster registrations.
//
// Pins the whole contract: every roster unit has a real TRAFFIC_ROLES def at ambient
// weight 0 (fixture-owned, never rolled), a released hull binding resolvable through
// wholeShipVisualForEntity, a NPC_UNIT_CRAFT craft row riding the declared npcJobs kind,
// a sector gate with the stated service/security clauses, and a resolvable placement
// anchor in every gated sector — a unit whose hook can't resolve is exactly the unwired
// placement this program forbids.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NPC_UNITS,
  NPC_UNIT_ROLES,
  NPC_UNIT_PLACEMENT_KINDS,
  npcUnitsForSector,
  npcUnitByRole,
} from '../src/data/npcUnitRoster.js';
import {
  NPC_UNIT_CRAFT,
  OCCUPATIONAL_JOB_KIND_BY_ROLE,
} from '../src/data/occupationalTrafficCraft.js';
import { TRAFFIC_ROLES, trafficRoleMixForSector } from '../src/systems/traffic.js';
import { wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
import { SECTORS } from '../src/data/sectors.js';
import { AUTHORED_PLACE_ZONES } from '../src/data/authoredPlaces.js';
import cordon from '../src/data/encounters/600-quarantine-cordon.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_UNITS = [
  'npc_customs_interceptor',
  'npc_fuel_tender',
  'npc_courier_relay',
  'npc_media_drone',
  'npc_quarantine_corvette',
  'npc_diplomat_yacht',
];

test('U1: all six spec §3.5 units are registered with complete rows', () => {
  assert.equal(NPC_UNITS.length, 6);
  const ids = new Set();
  const roles = new Set();
  for (const unit of NPC_UNITS) {
    assert.ok(unit.unitId, 'unitId required');
    assert.ok(!ids.has(unit.unitId), `duplicate unitId ${unit.unitId}`);
    assert.ok(!roles.has(unit.role), `duplicate role ${unit.role}`);
    ids.add(unit.unitId); roles.add(unit.role);
    assert.ok(unit.craftId, `${unit.unitId} needs a craftId`);
    assert.ok(unit.jobKind, `${unit.unitId} needs a jobKind`);
    assert.ok(NPC_UNIT_PLACEMENT_KINDS.includes(unit.placement.kind),
      `${unit.unitId} placement kind must be a real hook kind`);
    assert.ok(Array.isArray(unit.gate.sectorIds) && unit.gate.sectorIds.length > 0,
      `${unit.unitId} needs an explicit sector gate`);
    assert.equal(typeof unit.whyHere, 'string', `${unit.unitId} needs its stated why-here`);
    assert.equal(typeof unit.behaviorOwner, 'string', `${unit.unitId} needs a behavior owner`);
  }
  for (const id of EXPECTED_UNITS) assert.ok(ids.has(id), `missing roster unit ${id}`);
});

test('U1: every unit role has a TRAFFIC_ROLES def at ambient weight 0', () => {
  for (const unit of NPC_UNITS) {
    const def = TRAFFIC_ROLES[unit.role];
    assert.ok(def, `${unit.role} must exist in TRAFFIC_ROLES`);
    assert.equal(def.weight, 0, `${unit.role} must be fixture-owned (weight 0), never ambient`);
    assert.equal(def.team, 2, `${unit.role} is civilian-side traffic`);
    assert.equal(typeof def.label, 'string', `${unit.role} needs a display label`);
  }
  // Lawful hulls carry the flag the law gate reads; civilians do not.
  assert.equal(TRAFFIC_ROLES.customs_interceptor.lawful, true);
  assert.equal(TRAFFIC_ROLES.quarantine_corvette.lawful, true);
  assert.notEqual(TRAFFIC_ROLES.diplomat_yacht.lawful, true);
  // No gated sector's ambient mix may draw a U1 role.
  for (const sector of SECTORS) {
    const mix = trafficRoleMixForSector(sector);
    for (const role of NPC_UNIT_ROLES) {
      assert.ok(!(mix[role] > 0), `${sector.id} ambient mix must not draw ${role}`);
    }
  }
});

test('U1: every unit has a NPC_UNIT_CRAFT row riding the declared npcJobs kind', () => {
  for (const unit of NPC_UNITS) {
    const craft = NPC_UNIT_CRAFT.find((row) => row.unitId === unit.unitId);
    assert.ok(craft, `${unit.unitId} needs a NPC_UNIT_CRAFT row`);
    assert.equal(craft.role, unit.role);
    assert.equal(craft.craftId, unit.craftId);
    assert.equal(craft.jobKind, unit.jobKind);
    assert.equal(OCCUPATIONAL_JOB_KIND_BY_ROLE[unit.role], unit.jobKind,
      `${unit.role} must map to ${unit.jobKind} in OCCUPATIONAL_JOB_KIND_BY_ROLE`);
    assert.ok(craft.releaseUrl.endsWith(craft.file),
      `${unit.craftId} releaseUrl must point at its packaged file`);
    assert.ok(existsSync(path.join(ROOT, craft.releaseUrl)),
      `${unit.craftId} release GLB must exist on disk: ${craft.releaseUrl}`);
  }
});

test('U1: every unit role resolves a packaged whole-ship visual', () => {
  for (const unit of NPC_UNITS) {
    const craft = NPC_UNIT_CRAFT.find((row) => row.unitId === unit.unitId);
    const visual = wholeShipVisualForEntity({ data: { trafficRole: unit.role } });
    assert.ok(visual, `${unit.role} must resolve a whole-ship visual`);
    assert.equal(visual.file, craft.file, `${unit.role} visual file must match its craft row`);
    assert.equal(visual.assetId, craft.assetId,
      `${unit.role} visual assetId must match the GLB-embedded identity`);
  }
});

test('U1: sector gates admit exactly the spec §3.5 homes', () => {
  const at = (sectorId) => npcUnitsForSector(sectorId, SECTORS.find((s) => s.id === sectorId)).map((u) => u.unitId).sort();
  assert.deepEqual(at('sector_charon_expanse'), ['npc_fuel_tender', 'npc_quarantine_corvette'].sort());
  assert.deepEqual(at('sector_pallas_drift'), ['npc_fuel_tender']);
  assert.deepEqual(at('sector_io_reach'), ['npc_courier_relay', 'npc_fuel_tender'].sort());
  assert.deepEqual(at('sector_tethys_junction'),
    ['npc_customs_interceptor', 'npc_media_drone', 'npc_diplomat_yacht'].sort());
  assert.deepEqual(at('sector_dione_lane'), ['npc_courier_relay', 'npc_customs_interceptor'].sort());
  assert.deepEqual(at('sector_helios_prime'),
    ['npc_customs_interceptor', 'npc_diplomat_yacht', 'npc_media_drone'].sort());
  assert.deepEqual(at('sector_veil_nebula'), ['npc_diplomat_yacht']);
  assert.deepEqual(at('sector_ceres_belt'), ['npc_media_drone']);
  // The security clause is real, not decorative: a hotter sector with refuel stays empty.
  assert.equal(npcUnitsForSector('sector_ceres_belt', { id: 'sector_ceres_belt', security: 0.72 })
    .some((u) => u.unitId === 'npc_fuel_tender'), false);
});

test('U1: placement anchors resolve in every gated sector', () => {
  const sectorOf = (id) => SECTORS.find((s) => s.id === id);
  for (const unit of NPC_UNITS) {
    for (const sectorId of unit.gate.sectorIds) {
      const sector = sectorOf(sectorId);
      assert.ok(sector, `gated sector ${sectorId} must exist`);
      const placement = unit.placement;
      if (placement.kind === 'job-site') {
        const station = (sector.stations || []).find((st) =>
          (!placement.stationService || (st.services || []).includes(placement.stationService))
          && (!placement.stationFactionId || st.factionId === placement.stationFactionId));
        const fallback = !station && placement.fallbackStationType
          ? (sector.stations || []).find((st) =>
              st.type === placement.fallbackStationType
              && (!placement.stationFactionId || st.factionId === placement.stationFactionId))
          : null;
        const anchored = station || fallback;
        assert.ok(anchored,
          `${unit.unitId} job-site needs a ${placement.stationService} station (or ${placement.fallbackStationType} fallback) in ${sectorId}`);
        if (station && placement.stationService) {
          assert.ok((station.services || []).includes(placement.stationService),
            `${unit.unitId} anchor station must offer ${placement.stationService}`);
        }
      } else if (placement.kind === 'zone-orbit') {
        const anchor = (unit.anchorBySector || {})[sectorId] || placement;
        if (anchor.zoneId) {
          const zone = (AUTHORED_PLACE_ZONES[sectorId] || []).find((z) => z.id === anchor.zoneId);
          assert.ok(zone && zone.center, `${unit.unitId} zone ${anchor.zoneId} must exist in ${sectorId}`);
        } else if (anchor.stationId) {
          assert.ok((sector.stations || []).some((st) => st.id === anchor.stationId),
            `${unit.unitId} station anchor ${anchor.stationId} must exist in ${sectorId}`);
        } else {
          assert.fail(`${unit.unitId} zone-orbit needs a zoneId or stationId anchor in ${sectorId}`);
        }
      } else if (placement.kind === 'lane') {
        const lane = unit.laneBySector && unit.laneBySector[sectorId];
        const endpoints = lane ? [lane.from, lane.to] : (sector.stations || []).slice(0, 2).map((st) => st.id);
        assert.ok(endpoints.length >= 2, `${unit.unitId} lane needs two endpoints in ${sectorId}`);
        const ids = new Set([
          ...(sector.stations || []).map((st) => st.id),
          ...(sector.pois || []).map((p) => p.id),
        ]);
        for (const id of endpoints) {
          assert.ok(ids.has(id), `${unit.unitId} lane endpoint ${id} must exist in ${sectorId}`);
        }
      }
    }
  }
});

test('U1: quarantine corvette owns its encounter hook', () => {
  const unit = npcUnitByRole('quarantine_corvette');
  assert.equal(unit.encounterId, 'quarantine_cordon');
  assert.equal(cordon.id, 'quarantine_cordon');
  assert.deepEqual(cordon.gates.sectorIds, ['sector_charon_expanse'],
    'cordon encounter shares the corvette sector gate');
  assert.equal(cordon.squad.archetypes[0], 'customs_cutter',
    'cordon squad rides the same inspection-cutter hull family');
});

test('U1: service/faction gate clauses are the stated ones', () => {
  const interceptor = npcUnitByRole('customs_interceptor');
  assert.equal(interceptor.placement.stationService, 'scan');
  assert.equal(interceptor.placement.stationFactionId, 'faction_scn');
  const tender = npcUnitByRole('fuel_tender');
  assert.equal(tender.placement.stationService, 'refuel');
  assert.equal(tender.gate.service, 'refuel');
  assert.ok(tender.gate.maxSecurity < 0.7, 'fuel tender stays a low-security-lane unit');
});
