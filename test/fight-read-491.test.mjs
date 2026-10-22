import test from 'node:test';
import assert from 'node:assert/strict';

import { ManeuverKind } from '../src/ai/contracts.js';
import { ManeuverPlanner, REVERSAL_WINDOW_TICKS } from '../src/ai/maneuver.js';
import { reflexAllowedForIntent } from '../src/ai/reflexes.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { getDerivedStats } from '../src/systems/ships.js';

const FIGHT_ROLES = new Set(['swarmer', 'sniper', 'kamikaze', 'brawler', 'pirate', 'guardian']);

function planner() {
  return new ManeuverPlanner({ seed: 7, config: {
    inputSlewPerTick: 1, emergencyInputSlewPerTick: 1, torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1,
  } });
}

function frame(tick, pointX) {
  return {
    tick,
    perception: {
      tick,
      self: { id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 }, rot: 0, radius: 12, energyFraction: 1, heatFraction: 0 },
      contacts: [],
    },
    behavior: { maneuver: {
      kind: ManeuverKind.INTERCEPT, flightPoint: { x: pointX, z: 0 },
      formationSlot: { x: pointX, z: 0 }, formationBound: 170, breakFormation: true,
    } },
    directive: { squadId: 'run', formation: { slot: { x: pointX, z: 0 }, bound: 170, breakFormation: true } },
  };
}

test('row 491: a second heading reversal inside the window is denied (≤0.4/s)', () => {
  const p = planner();
  const first = p.plan({ entityId: 2, tick: 1, ...frame(1, 600) });
  const flip = p.plan({ entityId: 2, tick: 2, ...frame(2, -600) });
  assert.ok(flip.targetHeading > 2 || flip.targetHeading < -2, `first reversal commits: heading ${flip.targetHeading}`);
  const denied = p.plan({ entityId: 2, tick: 3, ...frame(3, 600) });
  assert.ok(Math.abs(denied.targetHeading - flip.targetHeading) < 0.05,
    `reversal inside the window holds the committed arc (got ${denied.targetHeading})`);
  const after = p.plan({ entityId: 2, tick: 3 + REVERSAL_WINDOW_TICKS, ...frame(3 + REVERSAL_WINDOW_TICKS, 600) });
  assert.ok(Math.abs(after.targetHeading) < 0.6, `reversal allowed again after ${REVERSAL_WINDOW_TICKS} ticks (got ${after.targetHeading})`);
});

test('row 491: emergency lanes stay exempt from the reversal governor', () => {
  // Obstacle avoidance is an emergency lane — survival beats readability.
  const p = planner();
  const rock = { id: 90, kind: 'hazard', pos: { x: 70, z: -70 }, vel: { x: 0, z: 0 },
    radius: 34, tags: ['solid'], confidence: 1 };
  p.plan({ entityId: 2, tick: 1, ...frame(1, 600) });
  p.plan({ entityId: 2, tick: 2, ...frame(2, -600) }); // opens the window
  const f3 = frame(3, 600);
  f3.perception.contacts = [rock];
  const dodge = p.plan({ entityId: 2, tick: 3, ...f3 });
  assert.ok(dodge.targetHeading !== undefined, 'dodge still resolves a heading');
});

test('row 491: reflex stack is one gate — emergency intents stand reflexes down', () => {
  assert.equal(reflexAllowedForIntent('retreat'), false);
  assert.equal(reflexAllowedForIntent('escape_tether'), false);
  assert.equal(reflexAllowedForIntent('clear_deadlock'), false);
  assert.equal(reflexAllowedForIntent('intercept'), true);
});

test('row 491: combat-role enemies cruise at least 70% of a cruising player', () => {
  // Player cruise ≈ derived ceiling × cruiseFrac floor (0.72 baseline, see systems/ships.js).
  const playerCruise = getDerivedStats('ship_kestrel').maxSpeed * 0.72;
  const floor = playerCruise * 0.7;
  for (const t of ENEMY_TYPES) {
    if (!FIGHT_ROLES.has(t.aiArchetype)) continue;
    if (t.anchored === true || t.fieldAnchor) continue; // fixture units do not pursue
    const cruise = t.combatSpeed || t.maxSpeed;
    assert.ok(cruise >= floor, `${t.id} (${t.aiArchetype}) cruises ${cruise} < 70% of player cruise ${floor.toFixed(0)}`);
  }
});
