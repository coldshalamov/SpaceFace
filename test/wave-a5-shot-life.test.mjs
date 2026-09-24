import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../src/data/weapons.js';

test('Wave A5: small and medium shots live >= 0.7s on screen', () => {
  const smallAndMedium = WEAPONS.filter(
    (w) => (w.size === 'S' || w.size === 'M') && Number.isFinite(w.projSpeed) && w.projSpeed > 0 && w.range > 0
  );

  assert.ok(smallAndMedium.length >= 20, `expected at least 20 small/medium projectile weapons, got ${smallAndMedium.length}`);

  const results = [];
  for (const w of smallAndMedium) {
    const lifetime = w.range / w.projSpeed;
    results.push({
      id: w.id,
      name: w.name,
      size: w.size,
      range: w.range,
      projSpeed: w.projSpeed,
      lifetimeSeconds: Number(lifetime.toFixed(3)),
    });

    assert.ok(
      lifetime >= 0.70 - 1e-4,
      `weapon ${w.id} (${w.name}, size ${w.size}) has projectile life ${lifetime.toFixed(3)}s < 0.7s (range=${w.range}, speed=${w.projSpeed})`
    );
  }

  // Print proof report with range and time-to-exit
  console.log('--- Wave A5 Small & Medium Weapon Lifetimes ---');
  for (const r of results) {
    console.log(`  ${r.id} (${r.size}): range=${r.range}wu, speed=${r.projSpeed}wu/s, time-to-exit=${r.lifetimeSeconds}s`);
  }
});

test('Wave A5: wpn_bank_stream_m damage, rof, and impulse preserved', () => {
  const bank = WEAPONS.find((w) => w.id === 'wpn_bank_stream_m');
  assert.ok(bank, 'wpn_bank_stream_m must exist in weapons catalog');
  assert.equal(bank.dmg, 5.14, 'dmg unchanged');
  assert.equal(bank.rof, 14, 'rof unchanged');
  assert.equal(bank.dps, 71.96, 'dps unchanged');
  assert.equal(bank.impulsePerHit, 12, 'impulsePerHit unchanged');
  assert.equal(bank.tumbleTorque, 1.2, 'tumbleTorque unchanged');
  assert.ok(bank.range / bank.projSpeed >= 0.70, 'lifetime >= 0.70s');
});
