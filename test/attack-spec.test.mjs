// CRU-019 / CRU-020 — AttackSpec schema, compiler, digest, exit gate.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTACK_TRAITS,
  ATTACK_TRAIT_BY_ID,
  formatTraitText,
  validateAttackTrait,
  validateAttackTraitCatalog,
} from '../src/data/attackTraits.js';
import {
  attackSpecNeedsRuntime,
  compileAttackSpec,
  describeAttackMetrics,
  digestAttackSpec,
  mergeWeaponView,
} from '../src/combat/attackSpec.js';

function issuePaths(result) {
  return (result.issues || []).map((entry) => entry && entry.path);
}

function assertIssuePath(result, path) {
  assert.equal(result.ok, false, `expected rejection for ${path}`);
  assert.ok(
    issuePaths(result).includes(path),
    `expected issue path ${path}, got ${JSON.stringify(result.issues)}`,
  );
}

function cloneTrait(overrides = {}) {
  const base = ATTACK_TRAITS[0];
  return structuredClone({ ...base, ...overrides });
}

function assertDeepFrozen(value, path = '$') {
  if (value == null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value), `expected frozen at ${path}`);
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertDeepFrozen(item, `${path}[${i}]`));
    return;
  }
  for (const key of Object.keys(value)) {
    assertDeepFrozen(value[key], `${path}.${key}`);
  }
}

test('authored trait catalog validates and is frozen', () => {
  const result = validateAttackTraitCatalog();
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assertDeepFrozen(ATTACK_TRAITS);
  assert.ok(ATTACK_TRAIT_BY_ID.mod_twin_mount);
  assert.ok(ATTACK_TRAIT_BY_ID.mod_piercing_core);
  assert.ok(ATTACK_TRAIT_BY_ID.mod_forked_core);
  assert.ok(ATTACK_TRAIT_BY_ID.mod_bank_shot);
});

test('trait schema rejects representative invalid cases', () => {
  assertIssuePath(validateAttackTrait(null), '');
  assertIssuePath(validateAttackTrait(cloneTrait({ id: 'twin' })), 'id');
  assertIssuePath(validateAttackTrait(cloneTrait({ maxRank: 0 })), 'maxRank');
  assertIssuePath(validateAttackTrait(cloneTrait({ tier: 'legendary' })), 'tier');
  assertIssuePath(validateAttackTrait(cloneTrait({ family: 'soup' })), 'family');
  assertIssuePath(validateAttackTrait(cloneTrait({ schemaVersion: 2 })), 'schemaVersion');
  assertIssuePath(validateAttackTrait(cloneTrait({
    stack: [{ mode: 'explode', target: 'emitter.rootCount', perRank: 1 }],
  })), 'stack[0].mode');
  assertIssuePath(validateAttackTrait(cloneTrait({
    stack: [{ mode: 'add', target: 'secret.field', perRank: 1 }],
  })), 'stack[0].target');
  assertIssuePath(validateAttackTrait(cloneTrait({
    compatibility: { emitters: ['laser'], trajectories: ['straight'] },
  })), 'compatibility.emitters[0]');
  assertIssuePath(validateAttackTrait(cloneTrait({
    inheritance: { rootSiblings: true, splitChildren: 'maybe', chainChildren: false },
  })), 'inheritance.splitChildren');
  assertIssuePath(validateAttackTrait(cloneTrait({
    text: { summary: '' },
  })), 'text.summary');
  assertIssuePath(validateAttackTraitCatalog([
    ATTACK_TRAITS[0],
    { ...ATTACK_TRAITS[0] },
  ]), '[1].id');
});

test('trait text substitutes rank', () => {
  const trait = ATTACK_TRAIT_BY_ID.mod_piercing_core;
  assert.equal(formatTraitText(trait, 2).includes('2'), true);
});

test('compiler is a pure digest: same inputs twice are equal', () => {
  const input = {
    weaponId: 'wpn_pulse_laser_s',
    modifiers: [['mod_twin_mount', 1], ['mod_piercing_core', 1]],
  };
  const a = compileAttackSpec(input);
  const b = compileAttackSpec(structuredClone(input));
  assert.equal(a.ok, true, JSON.stringify(a.issues));
  assert.equal(b.ok, true);
  assert.equal(a.spec.digest, b.spec.digest);
  assert.deepEqual(describeAttackMetrics(a.spec), describeAttackMetrics(b.spec));
  assert.equal(digestAttackSpec(a.spec), a.spec.digest);
});

test('compiled AttackSpec is immutable and carries A.4 fields', () => {
  const { ok, spec } = compileAttackSpec({
    weaponId: 'wpn_pulse_laser_s',
    modifiers: [['mod_twin_mount', 1]],
  });
  assert.equal(ok, true);
  assertDeepFrozen(spec);
  assert.equal(spec.schemaVersion, 1);
  assert.equal(typeof spec.digest, 'string');
  assert.ok(spec.digest.startsWith('atk_'));
  assert.equal(spec.sourceWeaponId, 'wpn_pulse_laser_s');
  assert.equal(spec.emitter.kind, 'bolt');
  assert.equal(spec.emitter.rootCount, 2);
  assert.equal(spec.trajectory.kind, 'straight');
  assert.equal(spec.propagation.pierce, 0);
  assert.ok(Array.isArray(spec.payload));
  assert.ok(Array.isArray(spec.triggers));
  assert.equal(spec.constraints.lineageProcBudget, 12);
  assert.equal(spec.constraints.generationMax, 1);
  assert.equal(spec.constraints.childMax, 8);
  assert.throws(() => { spec.emitter.rootCount = 99; });
});

test('incompatible traits are refused and do not leak onto a beam', () => {
  const result = compileAttackSpec({
    weaponId: 'wpn_beam_laser_m',
    modifiers: [['mod_twin_mount', 1]],
    strict: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.spec, null);
  assert.ok(
    issuePaths(result).some((path) => path.includes('emitters') || path.includes('forbids')),
    `expected emitter/forbid incompatibility, got ${JSON.stringify(result.issues)}`,
  );
});

test('unknown trait and current draft weapon records do not crash compile', () => {
  const result = compileAttackSpec({
    weaponId: 'wpn_pulse_laser_s',
    modifiers: [
      { kind: 'weapon', defId: 'wpn_autocannon_s', verb: 'Volume' },
      ['mod_does_not_exist', 1],
      ['mod_twin_mount', 1],
    ],
  });
  assert.equal(result.spec.emitter.rootCount, 2);
  assert.ok(result.issues.some((item) => item.message.includes('unknown trait')));
});

test('armorPierce is not body pierce', () => {
  const { spec } = compileAttackSpec({ weaponId: 'wpn_autocannon_s' });
  assert.equal(spec.propagation.pierce, 0);
  assert.equal(attackSpecNeedsRuntime(spec), false);
});

test('exit gate: Pulse Laser + Autocannon produce >=3 distinct legal compiled forms', () => {
  const forms = [
    compileAttackSpec({ weaponId: 'wpn_pulse_laser_s' }),
    compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [['mod_twin_mount', 1]] }),
    compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [['mod_forked_core', 1]] }),
    compileAttackSpec({
      weaponId: 'wpn_autocannon_s',
      modifiers: [['mod_piercing_core', 2]],
    }),
  ];
  for (const form of forms) {
    assert.equal(form.ok, true, JSON.stringify(form.issues));
    assert.ok(form.spec.digest.startsWith('atk_'));
    assertDeepFrozen(form.spec);
  }
  const digests = forms.map((form) => form.spec.digest);
  const unique = new Set(digests);
  assert.ok(unique.size >= 3, `expected >=3 distinct digests, got ${[...unique].join(', ')}`);

  const repeat = forms.map((form) => compileAttackSpec({
    weaponId: form.spec.sourceWeaponId,
    modifiers: form.stacks,
  }));
  for (let i = 0; i < forms.length; i++) {
    assert.equal(repeat[i].spec.digest, forms[i].spec.digest);
    assert.deepEqual(describeAttackMetrics(repeat[i].spec), describeAttackMetrics(forms[i].spec));
  }

  const pulseDirect = describeAttackMetrics(forms[0].spec);
  const pulseTwin = describeAttackMetrics(forms[1].spec);
  const pulseSplit = describeAttackMetrics(forms[2].spec);
  const autoPierce = describeAttackMetrics(forms[3].spec);
  assert.equal(pulseDirect.rootCount, 1);
  assert.equal(pulseTwin.rootCount, 2);
  assert.ok(pulseTwin.heatScale > pulseDirect.heatScale);
  assert.ok(pulseTwin.payloadTotal < pulseDirect.payloadTotal);
  assert.equal(pulseSplit.splitCount, 2);
  assert.equal(autoPierce.pierce, 2);
  assert.equal(autoPierce.sourceWeaponId, 'wpn_autocannon_s');

  console.log('PQ-133.03 compiled forms:');
  for (const form of forms) {
    const metrics = describeAttackMetrics(form.spec);
    console.log(`  ${metrics.sourceWeaponId} ${metrics.family} ${metrics.digest} roots=${metrics.rootCount} pierce=${metrics.pierce} split=${metrics.splitCount} budget=${metrics.lineageProcBudget}`);
  }
});

test('mergeWeaponView prefers instance damage without mutating the def', () => {
  const def = { id: 'wpn_pulse_laser_s', dmg: 8, damageType: 'energy', projSpeed: 320, spreadDeg: 0.6 };
  const merged = mergeWeaponView({ dmg: 9, defId: 'wpn_pulse_laser_s' }, def);
  assert.equal(merged.dmg, 9);
  assert.equal(def.dmg, 8);
});
