// NXI-064 — the capital opening closes on real subsystem recovery, not a presentation timeout.
// Engagement authority reads the live weapon-battery row every call: a dead battery denies for
// as long as it is dead (no timer lets a delayed VFX frame or slow-motion stretch close the
// window early), and the instant the subsystem actually comes back the same tick re-authorizes
// (a lagging presentation cannot hold the window open either). Renderer-flavored fields on the
// entity are never consulted — attack authorization is owned by simulation state alone.
import test from 'node:test';
import assert from 'node:assert/strict';

import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';

const SEED = 4242;

function makeState(tick, simTime) {
  return { tick, simTime, entities: new Map(), entityList: [], rng: { seed: SEED } };
}

function makeCapital() {
  return {
    id: 'maw', alive: true, pos: { x: 0, z: 0 }, team: 1,
    data: {
      subsystems: { subsystem_weapon: { effectiveDisabled: false, destroyed: false } },
      ai: {
        passive: false,
        motive: 'raid',
        engagementTrigger: 'player_attack',
        zoneId: 'lane',
        approachTelegraph: 'broadside_charge',
        combatDoctrineId: 'capital_broadside',
        roe: 'weapons_free',
        noFireResponseWindowS: 1,
        activity: { kind: 'attack_run', startedTick: 0 },
      },
    },
  };
}

const TARGET = { id: 'pilot', alive: true, pos: { x: 200, z: 0 }, team: 0 };

function authorize(self, tick, simTime) {
  return authorizeAIEngagement({
    state: makeState(tick, simTime),
    self,
    target: TARGET,
    tick,
    objectiveReason: 'combat_doctrine:capital_broadside:broadside_fire',
    hostile: true,
    wanted: true,
  });
}

function disableBattery(self) {
  self.data.subsystems.subsystem_weapon.effectiveDisabled = true;
  self.data.subsystems.subsystem_weapon.destroyed = true;
}

function restoreBattery(self) {
  self.data.subsystems.subsystem_weapon.effectiveDisabled = false;
  self.data.subsystems.subsystem_weapon.destroyed = false;
}

test('NXI-064: the attack window tracks live subsystem recovery, never a presentation timer', () => {
  const self = makeCapital();

  // Neighboring success first: a healthy battery inside the fire phase authorizes normally.
  assert.equal(authorize(self, 4000, 4000).ok, true, 'a live battery in the fire phase may fire');

  // The battery dies — the opening denies fire.
  disableBattery(self);
  const denied = authorize(self, 4000, 4000);
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'capital_subsystem_opening');

  // No presentation timeout closes it: long after any slow-motion or VFX delay would have
  // elapsed, the still-dead battery still denies. The verdict is identical at every tick.
  for (const [tick, simTime] of [[4060, 4060], [50000, 50000], [400000, 400000]]) {
    const late = authorize(self, tick, simTime);
    assert.equal(late.ok, false, `tick ${tick}: a dead battery does not age back into a live one`);
    assert.equal(late.reason, 'capital_subsystem_opening');
  }

  // Presentation-shaped fields on the entity cannot reopen it either: the authority reads the
  // subsystem row, not renderer bookkeeping.
  self.data.openingPresentation = { vfxElapsedS: 9999, slowMo: false, openingShown: true };
  self.data.vfx = { batteryRestoredCuePlayed: true };
  const decorated = authorize(self, 400000, 400000);
  assert.equal(decorated.ok, false, 'presentation flags cannot reopen a dead battery');
  assert.equal(decorated.reason, 'capital_subsystem_opening');

  // Real recovery authorizes the same tick — a delayed VFX frame cannot hold the window open.
  restoreBattery(self);
  const recovered = authorize(self, 400000, 400000);
  assert.equal(recovered.ok, true, 'the instant the battery lives again, fire is authorized');

  // And a fresh disable denies again — the gate follows the row both ways, forever.
  disableBattery(self);
  const redenied = authorize(self, 400001, 400001);
  assert.equal(redenied.ok, false);
  assert.equal(redenied.reason, 'capital_subsystem_opening');
});

test('NXI-064: the subsystem-fraction channel answers the same live-state rule', () => {
  const self = makeCapital();
  delete self.data.subsystems; // the fraction channel alone drives the same gate
  self.subsystemFractions = { subsystem_weapon: 0 };
  const denied = authorize(self, 4000, 4000);
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'capital_subsystem_opening');
  for (const tick of [4100, 40000]) {
    assert.equal(authorize(self, tick, tick).ok, false,
      `tick ${tick}: a zeroed battery fraction does not expire into a live one`);
  }
  self.subsystemFractions.subsystem_weapon = 0.5;
  assert.equal(authorize(self, 40000, 40000).ok, true,
    'a repaired fraction re-authorizes immediately');
});
