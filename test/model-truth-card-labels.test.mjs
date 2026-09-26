import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  catalogHullFacts,
  getDerivedStats,
  moduleSimMass,
  moduleSimPrice,
} from '../src/systems/ships.js';
import { liveDamageRate } from '../src/ui/station/moduleCardMetrics.js';

test('hull cards use the sim facts', () => {
  for (const ship of SHIPS) {
    const facts = catalogHullFacts(ship.id);
    const derived = getDerivedStats(ship.id, [], null);
    assert.equal(facts.price, ship.price);
    assert.equal(facts.mass, derived.operationalMass);
    assert.equal(facts.cargo, derived.cargoCap);
    assert.equal(facts.shield, derived.shieldMax);
    assert.equal(facts.hull, derived.hullMax);
    const propulsion = derived.propulsion || {};
    const speed = propulsion.combatSpeed > 0 ? propulsion.combatSpeed : (propulsion.maxSpeed || derived.maxSpeed);
    assert.equal(facts.speed, speed);
    assert.equal(facts.weapon, derived.weaponDmgMult);
  }
});

test('module cards use the mass and price the fit fold uses', () => {
  for (const mod of MODULES) {
    assert.equal(moduleSimMass(mod), Number.isFinite(Number(mod.mass)) ? Number(mod.mass) : 0);
    assert.equal(moduleSimPrice(mod), Number.isFinite(Number(mod.price)) ? Number(mod.price) : 0);
    if (mod.slotType === 'weapon') {
      const rate = liveDamageRate(mod);
      if (rate != null) {
        const dmg = Number(mod.dmg);
        const rof = Number(mod.rof);
        const expected = rof > 0 ? dmg * rof : dmg;
        assert.equal(rate, expected);
      }
    }
  }
  const weapon = WEAPONS.find((row) => Number(row.dmg) > 0 && Number(row.rof) > 0);
  assert.ok(weapon);
  assert.equal(liveDamageRate(weapon), weapon.dmg * weapon.rof);
});
