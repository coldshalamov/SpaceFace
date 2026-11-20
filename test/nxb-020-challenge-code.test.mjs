// NXB-020: a challenge code reproduces the rules that wrote it — or fails
// closed as non-comparable. Never silently replays a foreign envelope.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHARE_CODE_VERSION,
  compareChallengeCodes,
  decodeRunShareCode,
  encodeRunShareCode,
  encodeShareBlock,
  runShareSpecFields,
  RUN_SHARE_PREFIX,
} from '../src/core/runShareCode.js';
import { applyRunShareCode } from '../src/ui/screens/shareCode.js';
import { ghostComparability } from '../src/systems/survivalRecords.js';

test('the same envelope round-trips seed, ruleset, and starting fit', () => {
  const code = encodeRunShareCode({
    seed: 4242,
    ruleset: 'swarm',
    arenaId: 'lagrange_crucible',
    starterId: 'hull:ship_wasp',
    hullId: 'ship_wasp',
    loadout: [{ slotIndex: 2, defId: 'mod_ram_plate' }, { slotIndex: 0, defId: 'mod_cargo_pod_m' }],
    mutators: ['mut_iron', 'mut_glass'],
  });
  assert.ok(code, 'code encodes');
  const decoded = decodeRunShareCode(code);
  assert.ok(decoded.ok, decoded.error || 'decodes');
  const fields = runShareSpecFields(decoded.spec);
  assert.equal(fields.seed, 4242);
  assert.equal(fields.ruleset, 'swarm');
  assert.equal(fields.hullId, 'ship_wasp');
  assert.deepEqual(fields.mutators, ['mut_glass', 'mut_iron'], 'mutators sort stable');
  // Slot order in the spec is canonical, not paste order.
  assert.deepEqual(fields.loadout.map((e) => e.slotIndex), [0, 2]);
});

test('mutators round-trip in stable order regardless of write order (NXI-080)', () => {
  const a = encodeRunShareCode({ seed: 7, mutators: ['mut_b', 'mut_a', 'mut_b'] });
  const b = encodeRunShareCode({ seed: 7, mutators: ['mut_a', 'mut_b'] });
  assert.equal(a, b, 'order and duplicates do not change the code');
});

test('invalid and corrupted codes fail closed before any run starts (NXI-077)', () => {
  for (const bad of ['', 'not-a-code', 'SFC1-@@@@-deadbeef', 'SFG1-AAAA-deadbeef']) {
    const res = decodeRunShareCode(bad);
    assert.equal(res.ok, false, `${JSON.stringify(bad)} rejected: ${res.error || ''}`);
  }
  // Truncated payload: checksum must catch it.
  const good = encodeRunShareCode({ seed: 9, ruleset: 'scored' });
  const truncated = good.slice(0, -12) + good.slice(-9);
  assert.equal(decodeRunShareCode(truncated).ok, false, 'truncated code rejected');
});

test('a foreign codec version is non-comparable, never silently re-versioned', () => {
  // Forge a future envelope with a valid checksum — the checksum passes; the
  // ruleset-compat check must still refuse it.
  const foreign = encodeShareBlock(RUN_SHARE_PREFIX, { v: 99, s: 7, r: 'swarm' });
  assert.ok(foreign, 'foreign code encodes');
  const res = decodeRunShareCode(foreign);
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('not comparable'), `names the incompatibility: ${res.error || ''}`);
  const applied = applyRunShareCode(foreign);
  assert.equal(applied.ok, false, 'paste path also refuses');
});

test('ordinary v2 share rejects incompatible or malformed openings', () => {
  const exact = { v: 2, s: 42, r: 'swarm', h: 'ship_hornet', k: 'hull:ship_hornet',
    a: 'helios_core', t: 'exhibition', q: ['thick_pack'], o: true };
  const good = encodeShareBlock(RUN_SHARE_PREFIX, exact);
  assert.equal(decodeRunShareCode(good).ok, true);
  for (const changed of [{ k: 'hull:ship_kestrel' }, { h: 'ship_invented' }, { a: 'arena_removed' },
    { r: 'scored' }, { t: 'purse_invented' }, { s: 0 }, { g: 0 }, { w: 'weapons_cold' }, { d: '2026-11-19' },
    { o: 'true' }, { q: ['thin_purse'] }, { q: ['unknown_threat'] }, { q: ['thick_pack', 'thick_pack'] },
    { l: [[0, 'wpn_autocannon_s']] }, { m: ['mutator_invented'] }, { m: ['no_reroll'] }]) {
    const bad = encodeShareBlock(RUN_SHARE_PREFIX, { ...exact, ...changed });
    assert.equal(applyRunShareCode(bad).ok, false, JSON.stringify(changed));
  }
  const v1 = encodeShareBlock(RUN_SHARE_PREFIX, { ...exact, v: SHARE_CODE_VERSION });
  assert.equal(compareChallengeCodes(good, v1).comparable, false);
  const otherThreat = encodeShareBlock(RUN_SHARE_PREFIX, { ...exact, q: ['fast_lane'] });
  assert.equal(compareChallengeCodes(good, otherThreat).comparable, false);
  const pact = applyRunShareCode(encodeShareBlock(RUN_SHARE_PREFIX, { ...exact, o: false, m: ['no_reroll'] }));
  assert.equal(pact.zeroScrapOpening, true);
  assert.equal(pact.openingLesson, false);
  assert.deepEqual(pact.mutators, ['no_reroll']);
});

test('a ruleset this build does not ship is non-comparable, never defaulted', () => {
  const foreign = encodeShareBlock(RUN_SHARE_PREFIX, { v: SHARE_CODE_VERSION, s: 7, r: 'league_v9' });
  const applied = applyRunShareCode(foreign);
  assert.equal(applied.ok, false);
  // The paste-path copy deliberately names the failure in player terms rather than echoing
  // the foreign ruleset id — the refusal and its non-comparable label are the contract.
  assert.ok(/rules not in this version/.test(applied.error), `names the unknown ruleset: ${applied.error || ''}`);
  assert.ok(applied.error.includes('not comparable'));
});

test('a ruleset-mismatched record is labeled, not discarded (NXI-079)', () => {
  const rules = {
    mode: 'swarm', arenaId: 'lagrange_crucible', balanceRevision: 3,
    physicsRevision: 2, scoringRevision: 1, loadoutRules: '{"ruleset":"swarm"}',
    simulationAssistProfile: 'default',
  };
  const same = ghostComparability(rules, { ...rules });
  assert.equal(same.status, 'compatible');
  const drifted = { ...rules, scoringRevision: 9 };
  const diff = ghostComparability(rules, drifted);
  assert.equal(diff.status, 'incompatible');
  assert.deepEqual(diff.mismatches, ['scoringRevision'], 'the drifted field is named');
});
