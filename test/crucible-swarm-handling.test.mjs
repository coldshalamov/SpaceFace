// PQ-135 — can the ship handle a crowd?
//
// "Does it feel good to fly" is a judgement. Three PARTS of it are not:
//
//   BREAK   can you out-run them? In a surround, "no" means there is no disengage, no
//           repositioning, and no way to cross the room to a repair cell that dropped over there.
//           Every fight becomes attrition you cannot leave.
//   TURN    can you rotate faster than they can orbit you? "No" means the swarm sits outside your
//           firing arc permanently and you never get to shoot back.
//   ABOUT   how long to turn 180 degrees — the surround case, where something is behind you.
//
// This caught a real failure on the hull this mode added: the bare Massline Rig topped out at 134
// while the Corsair Raider joining the roster at wave 10 does 147. On the hull built for throwing
// things, you could not get away from the fastest thing in the game.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SHIPS } from '../src/data/ships.js';
import { SWARM_BOSS_ROTATION, SWARM_ROSTER } from '../src/data/swarmMode.js';
import { buildSlotList, getDerivedStats, outfitBudgetForFittings } from '../src/systems/ships.js';

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((e) => [e.id, e]));

/** Every archetype a swarm run can put on the board, chaff and champions alike. */
function swarmEnemyIds() {
  const champions = SWARM_BOSS_ROTATION.flatMap((b) => b.packages.map((p) => p.enemyId));
  return [...new Set([...SWARM_ROSTER.map((r) => r.enemyId), ...champions])];
}

/** The derived flight model of a starter package, as the game builds it. */
function starterFlight(pkg) {
  const ship = SHIPS.find((s) => s.id === pkg.hullId);
  const fittings = buildSlotList(ship).map(() => null);
  for (const entry of pkg.loadout) fittings[entry.slotIndex] = entry.defId;
  return { derived: getDerivedStats(pkg.hullId, fittings), fittings };
}

test('every swarm archetype resolves, so the comparison below is over the real roster', () => {
  const ids = swarmEnemyIds();
  assert.ok(ids.length >= 12, `the roster and champions together are a real set (${ids.length})`);
  for (const id of ids) assert.ok(ENEMY_BY_ID.has(id), `${id} is a live archetype`);
});

test('BREAK: every starter hull out-runs everything the swarm can field', () => {
  const fastest = Math.max(...swarmEnemyIds().map((id) => ENEMY_BY_ID.get(id).maxSpeed));
  for (const pkg of COMBAT_LAB_STARTER_PACKAGES) {
    const { derived } = starterFlight(pkg);
    assert.ok(
      derived.maxSpeed > fastest,
      `${pkg.id} tops out at ${Math.round(derived.maxSpeed)} against a roster that reaches ${fastest} — `
      + 'there would be no disengage and no way to cross the room to a repair cell',
    );
  }
});

test('TURN: every starter hull out-turns everything the swarm can field', () => {
  const spinniest = Math.max(...swarmEnemyIds().map((id) => ENEMY_BY_ID.get(id).turnRate));
  for (const pkg of COMBAT_LAB_STARTER_PACKAGES) {
    const { derived } = starterFlight(pkg);
    assert.ok(
      derived.turnRate > spinniest,
      `${pkg.id} turns at ${derived.turnRate.toFixed(2)} against a roster that reaches ${spinniest} — `
      + 'the swarm would orbit outside its firing arc permanently',
    );
  }
});

test('ABOUT: turning to face something behind you is under a second on every hull', () => {
  // The surround case. A half-turn that takes longer than a second means anything that gets behind
  // you stays behind you, which in a room holding thirty hostiles is most of them.
  for (const pkg of COMBAT_LAB_STARTER_PACKAGES) {
    const { derived } = starterFlight(pkg);
    const halfTurnS = Math.PI / derived.turnRate;
    assert.ok(
      halfTurnS < 1.0,
      `${pkg.id} takes ${halfTurnS.toFixed(2)}s to turn about`,
    );
  }
});

test('every starter package is legal on its own hull and inside its outfit budget', () => {
  for (const pkg of COMBAT_LAB_STARTER_PACKAGES) {
    const { fittings } = starterFlight(pkg);
    const budget = outfitBudgetForFittings(pkg.hullId, fittings);
    assert.ok(budget.fits, `${pkg.id} fits its hull's outfit budget`);
  }
});

test('the rope hull carries the drive it needs, not just the rope', () => {
  // The regression this file was written for. The Massline Rig is the only ungated hull that can
  // fit the massline heads, and bare it was slower than the wave-10 Corsair.
  const rig = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === 'massline_rig');
  assert.ok(rig, 'the rope hull is still on the door');
  assert.ok(
    rig.loadout.some((l) => String(l.defId).startsWith('mod_engine_')),
    'it starts with a drive fitted',
  );
  const { derived } = starterFlight(rig);
  const fastest = Math.max(...swarmEnemyIds().map((id) => ENEMY_BY_ID.get(id).maxSpeed));
  assert.ok(derived.maxSpeed > fastest * 1.2, 'and clears the roster with room, not by a hair');
});
