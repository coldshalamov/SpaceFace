// words-miner-ops-chips — the miner ops chips count in words, not "u".
//
// The automation panel's miner-ops chips were the last "u"-symbol holders on a spoken surface:
// "Gross cut 12 u", "Stored 4/20 u" — the same panel whose screen-reader summary already says
// "units" (words-field-counts), so sighted and blind pilots read different grammars for the same
// numbers. The chips now carry the whole word with a singular branch ("1 unit", "4/20 units");
// the Limit chip is a labeled status, not a count, and stays as it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const GROSS_CHIP = '${escapeHtml(String(readout.grossUnits))} ${Number(readout.grossUnits) === 1 ? \'unit\' : \'units\'}';
const STORED_CHIP = '${escapeHtml(String(readout.stored))}/${escapeHtml(String(readout.cap))} ${Number(readout.cap) === 1 ? \'unit\' : \'units\'}';

test('the gross-cut and stored chips carry whole unit words with a singular branch', () => {
  const source = readFileSync(new URL('../src/ui/screens/automationPanel.js', import.meta.url), 'utf8');
  assert.ok(source.includes('<span class="au-flow-k">Gross cut</span><strong>' + GROSS_CHIP + '</strong>'),
    'the gross-cut chip counts to one');
  assert.ok(source.includes('<span class="au-flow-k">Stored</span><strong>' + STORED_CHIP + '</strong>'),
    'the stored chip counts the cap');
  assert.ok(!source.includes('Gross cut</span><strong>${escapeHtml(String(readout.grossUnits))} u<'),
    'the bare "u" is gone from the gross-cut chip');
  assert.ok(!source.includes('Stored</span><strong>${escapeHtml(String(readout.stored))}/${escapeHtml(String(readout.cap))} u<'),
    'the bare "u" is gone from the stored chip');
});
