// B3C (wave-2 review): a singularity field's crush tick is named in Run Over's hit history.
// The combat:damage receipt carries only the origin, so the phase must ride the origin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { physicalWeaponLabelFromDamage } from '../src/combat/playerDefeat.js';

test('a crush tick reads "crush" from the origin alone; the detonation still reads "blast"', () => {
  assert.equal(physicalWeaponLabelFromDamage({ origin: { kind: 'bomb', id: 7, payloadId: 'bomb_singularity', phase: 'crush' } }), 'crush');
  assert.equal(physicalWeaponLabelFromDamage({ origin: { kind: 'bomb', id: 7, payloadId: 'bomb_singularity' } }), 'blast');
});

test('the bomb field puts its phase on the damage origin', () => {
  const src = readFileSync(new URL('../src/systems/bombs.js', import.meta.url), 'utf8');
  assert.match(src, /origin: \{ kind: 'bomb', id: bomb\.id, payloadId: def\.id, phase: crush \? 'crush' : 'tar' \}/,
    'the field tick names crush or tar on the origin the damage receipt carries');
});
