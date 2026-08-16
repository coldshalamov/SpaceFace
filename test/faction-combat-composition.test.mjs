import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  FACTION_DOCTRINES,
  factionCombatSignatureFor,
  factionCompositionWeight,
} from '../src/data/factionDoctrines.js';
import { FACTION_KITS } from '../src/data/factions/index.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { planEncounterShape } from '../src/systems/encounterDirector.js';

const ZONE = Object.freeze({
  id: 'zone_faction_composition_fixture',
  name: 'Faction Composition Fixture',
  type: 'derelict_field',
  center: Object.freeze({ x: 0, z: 0 }),
  radius: 220,
  levelBand: Object.freeze([3, 3]),
});

function shapeForFaction(factionId, anchorArchetype = null) {
  return {
    id: `faction_composition_${factionId}`,
    tier: 'minor',
    deck: 'combat',
    script: 'ambush',
    factionId,
    squad: {
      archetypes: ['pd_screen_escort', 'field_anchor_controller'],
      ...(anchorArchetype ? { anchorArchetype } : {}),
      size: [4, 4],
      doctrine: 'scavenger',
      formation: 'wedge',
      team: 1,
    },
  };
}

function compositionCounts(factionId) {
  const counts = new Map();
  const shape = shapeForFaction(factionId);
  for (let seed = 1; seed <= 256; seed++) {
    const rng = mulberry32(hash32(seed, factionId, 'plan17-composition'));
    const item = planEncounterShape(shape, ZONE, 'sector_pallas_drift', 0, seed, rng);
    for (const ship of item.ships) counts.set(ship.archetype, (counts.get(ship.archetype) || 0) + 1);
  }
  return counts;
}

test('every live faction doctrine owns a complete colorblind-redundant combat signature', () => {
  assert.deepEqual(new Set(Object.keys(FACTION_DOCTRINES)), new Set(FACTION_KITS.map((kit) => kit.id)));
  for (const kit of FACTION_KITS) {
    const signature = factionCombatSignatureFor(kit.id);
    assert.ok(signature, `${kit.id} has a combat signature`);
    assert.ok(signature.preferredMassClasses.length > 0, `${kit.id} has mass preferences`);
    assert.ok(signature.preferredWeaponFamilies.length > 0, `${kit.id} has weapon preferences`);
    assert.equal(typeof signature.signatureBehavior, 'string');
    assert.equal(typeof signature.signatureSpecialist, 'string');
    assert.equal(typeof signature.retreatDiscipline, 'string');
    assert.equal(signature.paletteClaim.factionId, kit.id);
    assert.equal(signature.paletteClaim.exclusivePerScene, true);
    assert.deepEqual(signature.paletteClaim.redundantReads, ['silhouette', 'iff_glyph']);
    assert.ok(Object.isFrozen(signature));
  }
});

test('composition scoring makes signature specialists and matching weapon/mass families load-bearing', () => {
  const pd = { id: 'pd_screen_escort', massClass: 'medium', weaponFamilies: ['kinetic', 'pd'] };
  const anchor = { id: 'field_anchor_controller', massClass: 'heavy', weaponFamilies: ['kinetic', 'pd'] };
  assert.ok(
    factionCompositionWeight('faction_scn', pd) > factionCompositionWeight('faction_scn', anchor),
    'Concord prefers its medium PD screen over the pirate anchor',
  );
  assert.ok(
    factionCompositionWeight('faction_reach', anchor) > factionCompositionWeight('faction_reach', pd),
    'Reach prefers its signature anchor despite the same authored candidate pool',
  );
});

test('swapping only faction data materially changes a polymorphic production wing', () => {
  const concord = compositionCounts('faction_scn');
  const reach = compositionCounts('faction_reach');
  const concordPd = concord.get('pd_screen_escort') || 0;
  const concordAnchor = concord.get('field_anchor_controller') || 0;
  const reachPd = reach.get('pd_screen_escort') || 0;
  const reachAnchor = reach.get('field_anchor_controller') || 0;

  assert.equal(concordPd + concordAnchor, 1024);
  assert.equal(reachPd + reachAnchor, 1024);
  assert.ok(concordPd > concordAnchor * 1.45, `Concord PD ${concordPd} vs anchor ${concordAnchor}`);
  assert.ok(reachAnchor > reachPd * 1.45, `Reach anchor ${reachAnchor} vs PD ${reachPd}`);

  const concordActor = makeEnemySpawnSpec('lancer_sniper', 3, { x: 0, z: 0 }, {
    factionId: 'faction_scn', doctrineSeed: 77,
  });
  const reachActor = makeEnemySpawnSpec('lancer_sniper', 3, { x: 0, z: 0 }, {
    factionId: 'faction_reach', doctrineSeed: 77,
  });
  const concordBehavior = concordActor.data.ai.factionPresenceDoctrine;
  const reachBehavior = reachActor.data.ai.factionPresenceDoctrine;
  assert.notEqual(concordBehavior.liveFormation, reachBehavior.liveFormation);
  assert.ok(concordBehavior.preferredRange > reachBehavior.preferredRange + 120);
  assert.ok(concordBehavior.retreatHullFraction > reachBehavior.retreatHullFraction + 0.1);
});

test('an authored identity anchor remains exact while only open companion slots are weighted', () => {
  const shape = shapeForFaction('faction_scn', 'jammer_specialist');
  for (let seed = 1; seed <= 32; seed++) {
    const item = planEncounterShape(
      shape,
      ZONE,
      'sector_pallas_drift',
      0,
      seed,
      mulberry32(hash32(seed, 'plan17-anchor')),
    );
    assert.equal(item.ships[0].archetype, 'jammer_specialist');
    assert.equal(item.ships[0].compositionRole, 'identity_anchor');
    assert.ok(item.ships.slice(1).every((ship) => ship.compositionRole === 'light'));
  }
});
