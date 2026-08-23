// PQ-133.05 / CRU-032 … CRU-035 — chain selection, payload traits, bridge traits.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTACK_TRAIT_BY_ID,
  validateAttackTraitCatalog,
} from '../src/data/attackTraits.js';
import {
  GRAVITY_MARK_STATUS_ID,
  STATUS_DEFS,
} from '../src/data/combatDefs.js';
import {
  compileAttackSpec,
  describeAttackMetrics,
  digestAttackSpec,
} from '../src/combat/attackSpec.js';
import {
  PROC_COSTS,
  canAct,
  createLineage,
  hasVisited,
  recordTargetHit,
  resetLineageIds,
} from '../src/combat/attackLineage.js';
import { tryBounce } from '../src/combat/attackPropagation.js';
import { selectChainTarget, tryChain } from '../src/combat/attackChain.js';
import {
  CAUSAL_CHANNEL,
  addResolvedToDistribution,
  emptyCausalDistribution,
  fieldCouplingForStatusIds,
  resolvePayload,
  statusPeriodicDamageTotal,
} from '../src/combat/attackPayload.js';

function compile(weaponId, modifiers = []) {
  const result = compileAttackSpec({ weaponId, modifiers });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.spec;
}

function lineageFor(spec, overrides = {}) {
  return createLineage({ spec, createdTick: 10, sourceEntityId: 'player', ...overrides });
}

function statusEntry(spec, statusId) {
  return (spec.payload || []).find((row) => row && row.kind === 'status' && row.statusId === statusId);
}

function field(overrides = {}) {
  return [
    { id: 'a', score: 0, pos: { x: 0, z: 0 }, statuses: [] },
    { id: 'c', score: 0, pos: { x: 90, z: 0 }, statuses: [] },
    { id: 'b', score: 0, pos: { x: 20, z: 0 }, statuses: [] },
    { id: 'd', score: 1, pos: { x: 40, z: 0 }, statuses: ['status_ionized'] },
    { id: 'e', score: 0, pos: { x: 30, z: 0 }, statuses: [] },
  ].map((row) => ({ ...row, ...(overrides[row.id] || {}) }));
}

function hopSequence(spec, candidates, opts = {}) {
  resetLineageIds(1);
  const runtime = lineageFor(spec);
  if (opts.bounceFirst) {
    const bounced = tryBounce(runtime);
    assert.equal(bounced.ok, true, JSON.stringify(bounced));
  }
  const firstId = opts.firstId || 'a';
  const first = candidates.find((row) => row.id === firstId);
  recordTargetHit(runtime, firstId, 10);
  const hops = [];
  let current = runtime;
  let from = first;
  let fail = null;
  for (;;) {
    const hop = tryChain(current, spec, {
      targetId: from.id,
      tick: 10,
      pos: from.pos,
    }, candidates);
    if (!hop.ok) {
      fail = hop;
      break;
    }
    hops.push(hop.target.id);
    current = hop.runtime;
    from = hop.target;
  }
  return { hops, runtime: current, root: runtime, fail };
}

function runDistribution(spec, opts = {}) {
  const candidates = opts.targets || field();
  resetLineageIds(3);
  const runtime = lineageFor(spec);
  if (opts.bounceFirst) {
    const bounced = tryBounce(runtime);
    assert.equal(bounced.ok, true, JSON.stringify(bounced));
  }
  const firstId = opts.firstId || 'a';
  const first = candidates.find((row) => row.id === firstId);
  recordTargetHit(runtime, firstId, 10);
  const dist = emptyCausalDistribution();
  const hops = [];
  addResolvedToDistribution(dist, resolvePayload(spec, {
    targetId: firstId,
    tetherAnchorId: opts.tetherAnchorId,
    hasBounced: runtime.hasBounced,
    generation: runtime.generation,
  }));
  let current = runtime;
  let from = first;
  for (;;) {
    const hop = tryChain(current, spec, {
      targetId: from.id,
      tick: 10,
      pos: from.pos,
    }, candidates);
    if (!hop.ok) break;
    hops.push(hop.target.id);
    addResolvedToDistribution(dist, resolvePayload(spec, {
      targetId: hop.target.id,
      tetherAnchorId: opts.tetherAnchorId,
      hasBounced: hop.runtime.hasBounced,
      generation: hop.runtime.generation,
    }));
    current = hop.runtime;
    from = hop.target;
  }
  return { dist, hops, digest: spec.digest, family: spec.presentation.family };
}

test('phase 5 traits validate and name existing statuses', () => {
  const catalog = validateAttackTraitCatalog();
  assert.equal(catalog.ok, true, JSON.stringify(catalog.issues));
  assert.ok(ATTACK_TRAIT_BY_ID.mod_ion_payload);
  assert.ok(ATTACK_TRAIT_BY_ID.mod_relay_arc);
  assert.ok(ATTACK_TRAIT_BY_ID.mod_gravity_tag);
  assert.ok(ATTACK_TRAIT_BY_ID.mod_incendiary_payload);
  assert.ok(ATTACK_TRAIT_BY_ID.mod_bank_relay);
  assert.ok(ATTACK_TRAIT_BY_ID.mod_tether_capacitor);
  assert.ok(ATTACK_TRAIT_BY_ID.mod_conductive_path);
  assert.equal(ATTACK_TRAIT_BY_ID.mod_ion_payload.payload[0].statusId, 'status_ionized');
  assert.equal(ATTACK_TRAIT_BY_ID.mod_incendiary_payload.payload[0].statusId, 'status_burning');
  assert.equal(ATTACK_TRAIT_BY_ID.mod_gravity_tag.payload[0].statusId, GRAVITY_MARK_STATUS_ID);
  assert.ok(STATUS_DEFS.some((def) => def.id === 'status_ionized'));
  assert.ok(STATUS_DEFS.some((def) => def.id === 'status_burning'));
  assert.ok(STATUS_DEFS.some((def) => def.id === GRAVITY_MARK_STATUS_ID));
});

test('payload traits compile onto an immutable spec without disturbing a bare Pulse Laser', () => {
  const bare = compile('wpn_pulse_laser_s');
  assert.equal(bare.propagation.chain, null);
  assert.equal(bare.payload.length, 1);
  assert.equal(bare.payload[0].kind, 'damage');
  assert.equal(bare.trajectory.bounces, 0);

  const ion = compile('wpn_pulse_laser_s', [['mod_ion_payload', 1]]);
  const burn = compile('wpn_pulse_laser_s', [['mod_incendiary_payload', 1]]);
  const grav = compile('wpn_pulse_laser_s', [['mod_gravity_tag', 1]]);
  assert.ok(statusEntry(ion, 'status_ionized'));
  assert.ok(statusEntry(burn, 'status_burning'));
  assert.ok(statusEntry(grav, GRAVITY_MARK_STATUS_ID));
  assert.notEqual(ion.digest, bare.digest);
  assert.notEqual(burn.digest, ion.digest);
  assert.notEqual(grav.digest, burn.digest);
  assert.equal(digestAttackSpec(ion), ion.digest);
  assert.throws(() => { ion.payload.push({ kind: 'status', statusId: 'nope' }); });
});

test('Relay Arc writes chain count, range, and the chain trigger', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_relay_arc', 1]]);
  assert.equal(spec.propagation.chain.count, 2);
  assert.equal(spec.propagation.chain.range, 110);
  assert.equal(spec.propagation.chain.requireBounce, undefined);
  assert.ok(spec.triggers.some((row) => row.event === 'entity_contact' && row.action === 'chain_if_eligible'));
  assert.ok(spec.constraints.generationMax >= 2);
  const metrics = describeAttackMetrics(spec);
  assert.equal(metrics.chainCount, 2);
  assert.equal(metrics.chainRange, 110);
});

test('bridge traits: bounce-gated chain, tether scale, ionized prerequisite', () => {
  const bank = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1], ['mod_bank_relay', 1]]);
  assert.equal(bank.propagation.chain.count, 1);
  assert.equal(bank.propagation.chain.requireBounce, true);
  assert.equal(bank.trajectory.bounces, 1);

  const tether = compile('wpn_pulse_laser_s', [['mod_tether_capacitor', 1]]);
  assert.equal(tether.costs.tetherAnchorPayloadScale, 1.5);

  const gated = compile('wpn_pulse_laser_s', [['mod_relay_arc', 1], ['mod_conductive_path', 1]]);
  assert.equal(gated.propagation.chain.prerequisiteStatus, 'status_ionized');
  assert.equal(gated.propagation.chain.count, 2);
});

test('Gravity Tag coupling is the existing Gravity Marked multiplier', () => {
  const def = STATUS_DEFS.find((row) => row.id === GRAVITY_MARK_STATUS_ID);
  const authored = def.effects.multipliers.fieldCoupling;
  assert.equal(fieldCouplingForStatusIds([GRAVITY_MARK_STATUS_ID]), authored);
  assert.equal(authored, 1.9);
});

test('Incendiary periodic totals come from the existing Burning definition', () => {
  const expected = statusPeriodicDamageTotal('status_burning', 1);
  assert.ok(expected > 0);
  const spec = compile('wpn_pulse_laser_s', [['mod_incendiary_payload', 1]]);
  const resolved = resolvePayload(spec, { targetId: 'a', generation: 0 });
  assert.ok(resolved.tags.includes(CAUSAL_CHANNEL.STATUS));
  assert.equal(statusPeriodicDamageTotal(resolved.statuses[0].id, resolved.statuses[0].stacks), expected);
});

test('tether capacitor scales only the live anchor', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_tether_capacitor', 1]]);
  const onAnchor = resolvePayload(spec, { targetId: 'hook', tetherAnchorId: 'hook', generation: 0 });
  const offAnchor = resolvePayload(spec, { targetId: 'other', tetherAnchorId: 'hook', generation: 0 });
  assert.ok(onAnchor.total > offAnchor.total);
  assert.equal(onAnchor.scale, 1.5);
  assert.equal(offAnchor.scale, 1);
  assert.ok(onAnchor.tags.includes(CAUSAL_CHANNEL.TETHER));
  assert.equal(offAnchor.tags.includes(CAUSAL_CHANNEL.TETHER), false);
});

test('chain selection is deterministic across shuffled insertion order', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_relay_arc', 1]]);
  const candidates = field();
  const origin = { x: 0, z: 0 };
  const forward = selectChainTarget(candidates, {
    count: 1,
    sourcePos: origin,
    range: 110,
    excludeId: 'a',
    visited: new Set(['a']),
  });
  const backward = selectChainTarget([...candidates].reverse(), {
    count: 1,
    sourcePos: origin,
    range: 110,
    excludeId: 'a',
    visited: new Set(['a']),
  });
  assert.equal(forward.id, backward.id);
  assert.equal(forward.id, 'd');

  const first = hopSequence(spec, candidates);
  const second = hopSequence(spec, [...candidates].reverse());
  assert.deepEqual(first.hops, second.hops);
  assert.ok(first.hops.length >= 2);
  assert.deepEqual(first.hops, ['d', 'e']);
});

test('chain cannot revisit a target and cannot exceed remaining hops', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_relay_arc', 1]]);
  const candidates = field();
  const { hops, runtime, fail } = hopSequence(spec, candidates);
  assert.equal(fail.reason, 'no_remaining_chains');
  assert.equal(new Set(hops).size, hops.length);
  assert.equal(hops.includes('a'), false);
  assert.ok(hasVisited(runtime, 'a'));
  assert.ok(hasVisited(runtime, hops[0]));
  assert.ok(hops.length <= spec.propagation.chain.count);
  assert.equal(runtime.remaining.chains, 0);
});

test('chain refuses the closest target when it has already been visited', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_relay_arc', 1]]);
  const candidates = [
    { id: 'a', score: 0, pos: { x: 0, z: 0 }, statuses: [] },
    { id: 'b', score: 0, pos: { x: 10, z: 0 }, statuses: [] },
    { id: 'c', score: 0, pos: { x: 80, z: 0 }, statuses: [] },
  ];
  const { hops } = hopSequence(spec, candidates);
  assert.deepEqual(hops, ['b', 'c']);
  assert.equal(hops.includes('a'), false);
});

test('chain spends the shared proc budget and stops when it cannot pay', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_relay_arc', 1]]);
  const runtime = lineageFor(spec);
  runtime.budget.remaining = PROC_COSTS.chain;
  recordTargetHit(runtime, 'a', 10);
  const candidates = field();
  const first = tryChain(runtime, spec, { targetId: 'a', tick: 10, pos: { x: 0, z: 0 } }, candidates);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(runtime.budget.remaining, 0);
  const second = tryChain(first.runtime, spec, {
    targetId: first.target.id,
    tick: 10,
    pos: first.target.pos,
  }, candidates);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'proc_budget');
  assert.equal(canAct(first.runtime, 'chain_if_eligible'), true);
  assert.equal(canAct(first.runtime, 'split'), false);
});

test('Bank Relay refuses a direct hit and hops after a bounce', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1], ['mod_bank_relay', 1]]);
  const candidates = field();
  const direct = hopSequence(spec, candidates);
  assert.equal(direct.hops.length, 0);
  assert.equal(direct.fail.reason, 'requires_bounce');
  const bounced = hopSequence(spec, candidates, { bounceFirst: true });
  assert.equal(bounced.hops.length, 1);
  assert.equal(bounced.runtime.hasBounced, true);
});

test('Conductive Path hops only to Ionized targets', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_relay_arc', 1], ['mod_conductive_path', 1]]);
  const candidates = field();
  const { hops } = hopSequence(spec, candidates);
  assert.deepEqual(hops, ['d']);
});

test('exit gate: three Pulse Laser identities have distinct digests and causal distributions', () => {
  const ionCircuit = compile('wpn_pulse_laser_s', [['mod_ion_payload', 1], ['mod_relay_arc', 1]]);
  const bankRelay = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1], ['mod_bank_relay', 1]]);
  const furnace = compile('wpn_pulse_laser_s', [['mod_incendiary_payload', 1]]);

  const forms = [ionCircuit, bankRelay, furnace];
  for (const spec of forms) {
    assert.ok(spec.digest.startsWith('atk_'));
    assert.equal(digestAttackSpec(spec), spec.digest);
    assert.equal(compileAttackSpec({
      weaponId: spec.sourceWeaponId,
      modifiers: spec === ionCircuit
        ? [['mod_ion_payload', 1], ['mod_relay_arc', 1]]
        : spec === bankRelay
          ? [['mod_bank_shot', 1], ['mod_bank_relay', 1]]
          : [['mod_incendiary_payload', 1]],
    }).spec.digest, spec.digest);
  }
  const digests = new Set(forms.map((spec) => spec.digest));
  assert.equal(digests.size, 3);

  const ionRun = runDistribution(ionCircuit);
  const bankRun = runDistribution(bankRelay, { bounceFirst: true });
  const burnRun = runDistribution(furnace);

  assert.ok(ionRun.dist.CHAIN > 0, `ion circuit chain ${JSON.stringify(ionRun.dist)}`);
  assert.ok(ionRun.dist.DIRECT > 0);
  assert.equal(bankRun.dist.DIRECT, 0);
  assert.ok(bankRun.dist.BANK > 0);
  assert.ok(bankRun.dist.CHAIN > 0);
  assert.equal(burnRun.dist.CHAIN, 0);
  assert.ok(burnRun.dist.STATUS > 0);
  assert.ok(burnRun.dist.DIRECT > 0);

  assert.notEqual(JSON.stringify(ionRun.dist), JSON.stringify(bankRun.dist));
  assert.notEqual(JSON.stringify(bankRun.dist), JSON.stringify(burnRun.dist));
  assert.notEqual(JSON.stringify(ionRun.dist), JSON.stringify(burnRun.dist));

  console.log('PQ-133.05 build identities:');
  for (const row of [
    { name: 'Ion Circuit', spec: ionCircuit, run: ionRun },
    { name: 'Bank Relay', spec: bankRelay, run: bankRun },
    { name: 'Incendiary', spec: furnace, run: burnRun },
  ]) {
    const metrics = describeAttackMetrics(row.spec);
    console.log(
      `  ${row.name} ${row.spec.digest} family=${metrics.family} hops=${row.run.hops.join('>') || 'none'} dist=${JSON.stringify(row.run.dist)}`,
    );
  }
});
