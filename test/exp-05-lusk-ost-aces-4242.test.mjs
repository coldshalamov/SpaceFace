// EXP-05 — a Concord ace and a Helix ace. Lusk's return uses the lawful cutter,
// so a clean pilot is not her target. Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RIVAL_ACES,
  aceById,
  returnCrewForAce,
} from '../src/data/namedAces.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';

const SEED = 4242;

function returnSpec(ace) {
  const crew = returnCrewForAce(ace, 1);
  const boss = crew.find((ship) => ship.role === 'boss');
  aceMemory.state = {
    tick: 0,
    simTime: 0,
    seed: SEED,
    playerId: 1,
    entities: {
      get(id) {
        return id === 1 ? { id: 1, pos: { x: 0, z: 0 }, team: 0 } : null;
      },
    },
    world: { currentSectorId: 'sector_dione_lane' },
    aceMemory: {},
  };
  return aceMemory._returnShipSpec(ace, { returnTier: 1, returnSeed: SEED }, `exp05:${ace.id}`, boss, 0, null);
}

function asEntity(spec) {
  return {
    id: 9,
    type: 'ship',
    team: spec.team,
    factionId: spec.factionId,
    alive: true,
    data: spec.data,
  };
}

test('seed 4242: Lusk and Ost are rivals on the authored hulls', () => {
  const lusk = RIVAL_ACES.ace_petra_lusk;
  const ost = RIVAL_ACES.ace_mael_ost;
  assert.equal(aceById('ace_petra_lusk'), lusk);
  assert.equal(lusk.name, 'Commander Petra Lusk');
  assert.equal(lusk.crew, 'Relief Watch 9');
  assert.equal(lusk.factionId, 'faction_scn');
  assert.equal(lusk.role, 'rival');
  assert.equal(lusk.gimmickTag, 'duelist');
  assert.equal(lusk.returnArchetype, 'customs_cutter');
  assert.equal(lusk.escortArchetype, 'patrol_lawman');
  assert.equal(lusk.baseReturnLevel, 5);
  assert.equal(lusk.signatureBark, 'RELIEF WATCH: hold for weight. I will not ask twice.');
  assert.equal(ost.name, 'Adjudicator Mael Ost');
  assert.equal(ost.crew, 'Adjudication 44-C');
  assert.equal(ost.factionId, 'faction_helix');
  assert.equal(ost.role, 'rival');
  assert.equal(ost.gimmickTag, 'masked-disengager');
  assert.equal(ost.returnArchetype, 'customs_cutter');
  assert.equal(ost.escortArchetype, 'corsair_raider');
  assert.equal(ost.baseReturnLevel, 6);
  assert.match(ost.signatureBark, /ADJUDICATION 44-C/);

  const luskCrew = returnCrewForAce(lusk, 1);
  assert.equal(luskCrew[0].archetype, 'customs_cutter');
  assert.ok(luskCrew.slice(1).every((ship) => ship.archetype === 'patrol_lawman'));
  const ostCrew = returnCrewForAce(ost, 1);
  assert.equal(ostCrew[0].archetype, 'customs_cutter');
  assert.ok(ostCrew.slice(1).every((ship) => ship.archetype === 'corsair_raider'));
});

test('seed 4242: Lusk\'s return hull stays lawful and ignores a clean pilot', () => {
  const lusk = aceById('ace_petra_lusk');
  const spec = returnSpec(lusk);
  assert.equal(spec.factionId, 'faction_scn');
  assert.equal(spec.data.ai.lawful, true);
  assert.equal(spec.data.ai.roe, 'lawful_wanted_only');
  assert.equal(spec.data.ai.forcePlayerTarget, true, 'the return still marks the player as the person she is watching');
  const entity = asEntity(spec);
  const clean = { seed: SEED, playerId: 1, player: { heat: 0 } };
  const wanted = { seed: SEED, playerId: 1, player: { heat: 0.15 } };
  assert.equal(isHostileToPlayer(entity, 0, clean), false);
  assert.equal(isHostileToPlayer(entity, 0, wanted), true);

  const escort = returnCrewForAce(lusk, 1).find((ship) => ship.role === 'escort');
  aceMemory.state.tick = 1;
  const escortSpec = aceMemory._returnShipSpec(
    lusk, { returnTier: 1, returnSeed: SEED }, 'exp05:lusk-escort', escort, 1, null,
  );
  assert.equal(escortSpec.data.ai.lawful, true, 'her patrol escort is a lawful hull too');
  assert.equal(isHostileToPlayer(asEntity(escortSpec), 0, clean), false);
});
