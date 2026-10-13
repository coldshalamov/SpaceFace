// SFQ-I018: a patrol does not keep or take a target once the warrant has lapsed.
// Seed 4242. Hostility is the live engagement authority, not a stale team list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { ai } from '../src/systems/ai.js';

const SEED = 4242;
const DT = 1 / 60;

function rig({ heat, retarget, holding }) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, name: 'Pilot',
    pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull: 100, hullMax: 100,
  };
  const patrol = {
    id: 2, type: 'ship', alive: true, team: 1, name: 'Patrol',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
    hull: 100, hullMax: 100,
    data: {
      weapons: [{ dps: 12, projSpeed: 340 }],
      combat: {
        targetId: holding ? 1 : null,
        lockTarget: holding ? 1 : null,
        lockProgress: 0,
      },
      ai: {
        archetype: 'brawler',
        lawful: true,
        hostileTeams: [0],
        fsm: 'pursue',
        _retarget: retarget,
      },
    },
  };
  const state = {
    mode: 'flight', simTime: 10, tick: 600, playerId: 1, rng: mulberry32(SEED),
    entities: new Map([[1, player], [2, patrol]]),
    player: { heat },
  };
  ai.init({
    state,
    bus: { on() { return () => {}; }, emit() {} },
    helpers: {},
  });
  return { state, player, patrol };
}

test('a patrol drops a held target after the warrant lapses', () => {
  const { state, player, patrol } = rig({ heat: 0, retarget: 999, holding: true });
  ai._think(patrol, patrol.data, state, player, DT);
  assert.equal(patrol.data.combat.targetId, null);
  assert.equal(patrol.data.combat.lockTarget, null);
});

test('a patrol does not acquire a target after the warrant lapses', () => {
  const { state, player, patrol } = rig({ heat: 0, retarget: 0, holding: false });
  ai._think(patrol, patrol.data, state, player, DT);
  assert.equal(patrol.data.combat.targetId, null);
});

test('a patrol still engages while the warrant is current', () => {
  const { state, player, patrol } = rig({ heat: 0.5, retarget: 0, holding: false });
  ai._think(patrol, patrol.data, state, player, DT);
  assert.equal(patrol.data.combat.targetId, player.id);
});
