// WEAPON-SHOVE-IDENTITY — the shove is a product you can see.
//
// Two defects, one story: Pulse Laser M — the direct upgrade of the starter gun that authors
// "5 % of Wasp cruise per full hit" — shipped with impulsePerHit 1.2 against the S's 84 (a 70×
// drop where every sibling family steps UP), and the mass channel was invisible at the point of
// sale: no weapon def carried player-facing copy, and the outfitting rows showed only DPS,
// range, mass and draw. Proves:
//   1. the pulse upgrade steps the shove up with the damage, and no S→M family inverts the
//      impulse or tumble channel again;
//   2. every weapon whose answer includes real momentum carries a sentence; the setup tools
//      whose ping is NOT the shove keep their authored <=1 impulse (inertial shunt law);
//   3. the point-of-sale rule (shoveMetricValue) surfaces exactly the momentum that matters,
//      the user-mod contract admits the copy field, and the shipworks rows render both.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { WEAPONS, USER_WEAPON_KEYS, shoveMetricValue, SHOVE_METRIC_MIN } =
  await import('../src/data/weapons.js');

const byId = new Map(WEAPONS.map((d) => [d.id, d]));

test('pulse upgrade: M steps the shove up (126 > S 84), pinned against decimal-slip regressions', () => {
  const s = byId.get('wpn_pulse_laser_s');
  const m = byId.get('wpn_pulse_laser_m');
  assert.ok(s && m, 'both pulse sizes exist in the kit');
  assert.equal(m.impulsePerHit, 126, 'the authored pulse M shove is 126 (7.5 % of Wasp cruise)');
  assert.ok(m.impulsePerHit > s.impulsePerHit, 'the direct upgrade must not shove less than the starter');
  assert.ok(m.tumbleTorque >= s.tumbleTorque, 'tumble must not invert on the upgrade either');
  assert.ok(m.dps > s.dps, 'sanity: the upgrade still raises damage');
});

test('no S→M family inverts the mass channel', () => {
  const families = new Map();
  for (const def of WEAPONS) {
    const match = /^(wpn_[a-z0-9_]+)_([sml])$/.exec(def.id);
    if (!match) continue;
    const [, family, size] = match;
    if (!families.has(family)) families.set(family, {});
    families.get(family)[size] = def;
  }
  const compared = [];
  for (const [family, sizes] of families) {
    if (!sizes.s || !sizes.m) continue;
    compared.push(family);
    const sImpulse = Number(sizes.s.impulsePerHit) || 0;
    const mImpulse = Number(sizes.m.impulsePerHit) || 0;
    assert.ok(
      mImpulse >= sImpulse,
      `${family}: M impulse ${mImpulse} must not be less than S impulse ${sImpulse} — a shove that shrinks on the direct upgrade reads as a bug`,
    );
    const sTumble = Number(sizes.s.tumbleTorque) || 0;
    const mTumble = Number(sizes.m.tumbleTorque) || 0;
    assert.ok(mTumble >= sTumble, `${family}: M tumble must not drop below S`);
  }
  assert.ok(compared.length >= 2, `expected at least two S/M families compared, got ${compared.join(', ')}`);
});

test('every shop-reachable weapon whose answer includes real momentum carries a sentence', () => {
  // Population: the S/M catalog the outfitting chooser lists — the point of sale this unit owns.
  // Emergent-primitive lab tools and L-slot capital guns are a separate breadth pass.
  const shovers = WEAPONS.filter((d) => (d.size === 'S' || d.size === 'M') && !d.emergentPrimitive);
  assert.ok(shovers.length >= 10, `expected the S/M catalog, got ${shovers.length}`);
  for (const def of shovers) {
    if (!(Number(def.impulsePerHit) >= SHOVE_METRIC_MIN)) continue;
    assert.ok(typeof def.sentence === 'string' && def.sentence.trim().length > 12,
      `${def.id}: a shove this real needs a point-of-sale sentence`);
    assert.ok(!/[\r\n]/.test(def.sentence), `${def.id}: sentence must fit one row`);
  }
});

test('setup tools keep their authored ping impulse — their verb is not the hit', () => {
  const shunt = byId.get('wpn_inertial_shunt_s');
  assert.ok(shunt, 'inertial shunt exists');
  assert.ok(shunt.impulsePerHit <= 1, 'the shunt ping stays a ping: the payoff is the contact');
  assert.ok(typeof shunt.sentence === 'string' && /ram/i.test(shunt.sentence),
    'the shunt sentence names the ram, not a shove-per-hit');
});

test('shoveMetricValue surfaces exactly the momentum that matters', () => {
  assert.equal(shoveMetricValue(byId.get('wpn_pulse_laser_s')), 84);
  assert.equal(shoveMetricValue(byId.get('wpn_concussion_cannon_m')), 920);
  assert.equal(shoveMetricValue(byId.get('wpn_vector_mine_m')), 756);
  assert.equal(shoveMetricValue(byId.get('wpn_inertial_shunt_s')), null, 'a 1-momentum ping is not a shove metric');
  assert.equal(shoveMetricValue(byId.get('wpn_flak_turret_s')), null, 'flak fragments are not a shove metric');
  assert.equal(shoveMetricValue({ impulsePerHit: undefined }), null);
});

test('the user-mod contract admits the copy field', () => {
  assert.ok(USER_WEAPON_KEYS.has('sentence'), 'user weapons may carry their sentence');
});

test('the shipworks outfitting rows render the shove metric and the sentence', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'station', 'screens', 'shipworks.js'), 'utf8');
  assert.match(src, /shoveMetricValue\(def\)/, 'the metric rule must feed the outfitting rows');
  assert.match(src, /SHOVE/, 'the row label must say SHOVE');
  assert.match(src, /d\.sentence \? escapeHtml\(d\.sentence\)/, 'the chooser row must render the def sentence');
});
