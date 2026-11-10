// INFERENCE unit — the Hawser working tug: a lockable T2 hull whose job is moving mass.
// The detector's claim was "ship defs are sparse"; the live-owner check found the real gap:
// the world already flies a packaged yard-tug body on a Mule's stats, and no player hull
// treats the Massline tow verbs as the career. This test pins the whole production seam:
// def → tech gate → lattice/kit → derived tow class → packaged body → ambient role truth.
import assert from 'node:assert/strict';
import test from 'node:test';

import { SHIPS } from '../src/data/ships.js';
import { TECH_NODES } from '../src/data/tech.js';
import { SHIP_SILHOUETTES } from '../src/data/shipSilhouettes.js';
import { PLAYER_FEEL_ENVELOPES } from '../src/data/flightFeelEnvelopes.js';
import { SHIP_RECIPES } from '../src/data/palettes.js';
import { MODULES } from '../src/data/modules.js';
import {
  SHIP_ROLE_LATTICE,
  SHIP_ROLE_PATHS,
  planHullRolePath,
  validateRoleLattice,
  findDominatedSameTierHulls,
} from '../src/data/shipRoleLattice.js';
import {
  buildSlotList,
  findMasslineHeadConflict,
  fittingsFromDefaultModules,
  getDerivedStats,
} from '../src/systems/ships.js';
import {
  heaviestHullWithin,
  shipCapabilityVerbs,
  towClassMassFor,
} from '../src/systems/shipCapabilities.js';
import { classifyBuildIdentity } from '../src/systems/buildIdentity.js';
import { TRAFFIC_ROLES } from '../src/systems/traffic.js';
import {
  isPackagedLiveWholeShipFile,
  openingFlybyNpcCatalog,
  requiresProductionWholeShipForEntity,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';

const hawser = SHIPS.find((ship) => ship.id === 'ship_hawser');

test('INFERENCE hawser: the roster row is a tow hull, not a stat ladder', () => {
  assert.ok(hawser, 'ship_hawser exists');
  assert.equal(hawser.role, 'tug');
  assert.equal(hawser.tier, 2);
  assert.equal(hawser.requiresTech, 'tech_tractor_systems',
    'the node that sells every tow module also sells the tow hull');
  assert.equal(hawser.driveId, 'drive_torch_l', 'sustained axial force is the job');
  assert.ok(hawser.cargo <= 200, 'a token hold keeps it a tool, not a hauler');
  assert.equal(hawser.slots.mining.length, 0, 'no extraction — it relocates mass, not rock');
  assert.ok(hawser.slots.utility.length >= 3, 'a deep massline bay is the point');
});

test('INFERENCE hawser: tech gate unlocks the hull at the tow-verb node', () => {
  const node = TECH_NODES.find((entry) => entry.id === 'tech_tractor_systems');
  assert.ok(node.unlocks.ships.includes('ship_hawser'));
  for (const moduleId of ['mod_tractor_beam_m', 'mod_elastic_whip_m', 'mod_frame_coupler_m']) {
    assert.ok(node.unlocks.modules.includes(moduleId), moduleId);
  }
});

test('INFERENCE hawser: lattice row, role path, and kit all land on the real slots', () => {
  const row = SHIP_ROLE_LATTICE.ship_hawser;
  assert.ok(row, 'lattice row');
  assert.equal(row.role, 'tug');
  assert.equal(row.flightClass, 'hauler');
  const path = SHIP_ROLE_PATHS.ship_hawser;
  assert.equal(path.id, 'path_yard_recovery');
  assert.match(path.signatureVerb, /under way|couple|reel/i);

  const kitIds = path.kit.flatMap((entry) => Array(entry.count).fill(entry.defId));
  const fittings = fittingsFromDefaultModules('ship_hawser', kitIds);
  assert.equal(fittings.filter(Boolean).length, kitIds.length,
    'every role-path item mounts on the hull as sold');

  // The kit is a simultaneous loadout: massline heads are mutually exclusive fittings, so the
  // authored path may carry exactly one — the frame coupler, the yard hitch.
  const moduleById = new Map(MODULES.map((m) => [m.id, m]));
  const headIds = kitIds.filter((id) => moduleById.get(id)?.mods?.masslineHeadId);
  assert.deepEqual(headIds, ['mod_frame_coupler_m'],
    'one massline head per loadout — the frame coupler is the yard hitch');
  const conflict = findMasslineHeadConflict(fittings, -1, moduleById.get('mod_tractor_beam_m'));
  assert.equal(conflict && conflict.id, 'mod_frame_coupler_m',
    'the live fitting law refuses a second head on top of the coupler');

  const plan = planHullRolePath('ship_hawser', []);
  assert.ok(plan.roleReadyCredits > hawser.price, 'kit is a real additional spend');
  assert.deepEqual(plan.missingTechIds, ['tech_tractor_systems'],
    'one research gate covers hull and tractor kit');

  const verdict = validateRoleLattice(SHIPS);
  assert.equal(verdict.ok, true, verdict.errors.join('; '));
  assert.deepEqual(findDominatedSameTierHulls(SHIPS), [],
    'the tug must not read as a dominated or dominating stat row at T2');
});

test('INFERENCE hawser: the fit screen names a tow class nothing at its tier reaches', () => {
  const derived = getDerivedStats('ship_hawser', [], { isPlayer: true, researchedNodes: [] });
  assert.ok(derived, 'derived stats resolve');
  const towT = towClassMassFor(derived);
  const heaviest = heaviestHullWithin(towT);
  assert.ok(heaviest && heaviest.mass >= 150,
    `expected the tug to put at least a Warden-class hull under way, got ${heaviest && heaviest.id} (${towT.toFixed(1)} t)`);

  // Same-law comparison: no other T2 hull approaches it.
  const t2 = SHIPS.filter((ship) => ship.tier === 2 && ship.id !== 'ship_hawser');
  for (const rival of t2) {
    const rivalDerived = getDerivedStats(rival.id, [], { isPlayer: true, researchedNodes: [] });
    const rivalTow = towClassMassFor(rivalDerived);
    assert.ok(towT > rivalTow * 1.5,
      `${rival.id} tow class ${rivalTow.toFixed(1)} t must not approach the tug's ${towT.toFixed(1)} t`);
  }

  const verbs = shipCapabilityVerbs({ derived });
  assert.match(verbs.tow.verb, /Can tow/, verbs.tow.verb);
  assert.ok(verbs.tow.hullId, 'the sentence names a roster hull');

  // The trade-off is real too: a token hold and no extraction.
  assert.ok(derived.cargoCap < getDerivedStats('ship_kestrel', [], { isPlayer: true }).cargoCap,
    'the working tug carries less than the starter — mass is the job, not freight');
});

test('INFERENCE hawser: the packaged yard-tug body serves the player hull', () => {
  const entity = { type: 'ship', data: { defId: 'ship_hawser' } };
  assert.equal(requiresProductionWholeShipForEntity(entity), true);
  const visual = wholeShipVisualForEntity(entity);
  assert.equal(visual.file, 'wholeships/yard_tug.glb');
  assert.equal(visual.assetId, 'SF_WHOLESHIP_YARD_TUG');
  assert.equal(isPackagedLiveWholeShipFile(visual.file), true,
    'the shared body is a shipped release, not an incubator body');

  // The ambient tug role and both opening flyby slots now state the same sim truth.
  assert.equal(TRAFFIC_ROLES.tug.ship, 'ship_hawser',
    'the working-tug role flies the working-tug hull');
  const flyby = openingFlybyNpcCatalog().find((slot) => slot.id === 'tug');
  assert.equal(flyby.file, 'wholeships/yard_tug.glb', 'flyby tug keeps its accepted body');

  // The dispatched tow is inside the demonstrated drag regime: a 68 t hull hauling the
  // 190 t freight lot is a 2.8x ratio, under the 4x the towing proof already dragged.
  assert.ok(hawser.mass * 4 >= 190,
    'the production tug stays inside the proven tow regime for its dispatched lot');
});

test('INFERENCE hawser: presentation registries carry the hull end to end', () => {
  assert.ok(SHIP_SILHOUETTES.ship_hawser, 'shipworks/HUD silhouette exists');
  assert.ok(PLAYER_FEEL_ENVELOPES.ship_hawser, 'player feel envelope exists');
  assert.ok(SHIP_RECIPES.ship_hawser, 'procedural recipe exists');
  const identity = classifyBuildIdentity([], { shipId: 'ship_hawser', shipDef: hawser });
  assert.equal(identity.id, 'recovery_tug',
    'a scanned Hawser reads as a recovery tug, never a generalist');
});
