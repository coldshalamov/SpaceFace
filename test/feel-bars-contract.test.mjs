// PQ-186.00 "Bars as checks" — the coverage contract between FEEL_CONTRACT §B and the checks.
// Law: one check per FEEL_CONTRACT bar the lab can reach, and the check's assertion message is
// the bar's sentence. This test makes both halves fail-closed:
//   1. A bar added to the contract without a check (or without a recorded unreachable reason)
//      turns this test red.
//   2. A check whose file stops quoting its bar's sentence turns this test red — so the message
//      cannot silently drift away from the law it serves.
// It also pins the §7 injection proof: injecting the retired governor brake must turn B1 red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { FEEL_BARS } from '../scripts/lib/bench/feelBars.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONTRACT_PATH = fileURLToPath(new URL('../design/FEEL_CONTRACT.md', import.meta.url));
const PACKAGE_PATH = fileURLToPath(new URL('../package.json', import.meta.url));

const contractText = readFileSync(CONTRACT_PATH, 'utf8');
const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));

/** Normalize contract prose so a quote matches across line wraps and markdown emphasis. */
function normalize(text) {
  return String(text)
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse the §B bar table: | **Bn Title** | statement | live value | scenario | status | */
function parseContractBars(text) {
  const section = text.split('## B. The bars')[1]?.split('## C.')[0];
  assert.ok(section, 'FEEL_CONTRACT.md must keep its "## B. The bars" section');
  const bars = new Map();
  for (const line of section.split('\n')) {
    const match = line.match(/^\|\s*\*\*(B\d+)\b(.*)\*\*\s*\|/);
    if (!match) continue;
    const cells = line.split('|').map((cell) => cell.trim()).filter((cell) => cell.length > 0);
    // cells: [**Bn Title**, statement, live value, scenario, status] — the trailing three columns
    // prove the row is a complete §B row even though only the statement is quoted by checks.
    assert.ok(cells.length >= 5, `bar row for ${match[1]} must carry all five §B columns`);
    const statement = normalize(cells[1]).replace(/\(Rewritten[^)]*\)\s*$/u, '').trim();
    bars.set(match[1], {
      id: match[1],
      statement,
    });
  }
  return bars;
}

const contractBars = parseContractBars(contractText);

// The registry and the law must name the same bars — a bar that exists on only one side is a
// bar that can silently stop being checked.
test('FEEL_BARS and the FEEL_CONTRACT §B table name exactly the same bars', () => {
  const registryIds = FEEL_BARS.map((bar) => bar.id).sort();
  const contractIds = [...contractBars.keys()].sort();
  assert.deepEqual(contractIds, registryIds,
    'a bar in FEEL_CONTRACT §B must have a FEEL_BARS registry entry, and vice versa');
});

// Every bar must either be checked (its sentence quoted in a wired check file) or recorded as
// unreachable with the reason the lab cannot reach it. No third state.
const CHECKED_BARS = {
  B1: { files: ['test/feel-regression.test.mjs', 'scripts/lib/feelRegression.mjs'], mode: 'statement' },
  B2: { files: ['test/fun-bench-flight-scenarios.test.mjs'], mode: 'statement' },
  B3: { files: ['test/fun-bench-flight-scenarios.test.mjs'], mode: 'statement' },
  B4: { files: ['test/feel-shove-bars.test.mjs'], mode: 'statement' },
  B5: { files: ['test/feel-shove-bars.test.mjs'], mode: 'statement' },
  B6: { files: ['test/terrain-slam.test.mjs'], mode: 'statement' },
  B7: { files: ['test/rope-swing-release.test.mjs'], mode: 'statement' },
  B8: { files: ['test/draw-to-fly-stroke-speed.test.mjs'], mode: 'statement' },
  B9: { files: ['test/feel-collision-impact.test.mjs'], mode: 'first-sentence' },
  B10: { files: ['test/world-reaction-bars.test.mjs'], mode: 'statement' },
  B11: { files: ['test/hitstun-curve.test.mjs'], mode: 'statement' },
  B13: { files: ['test/knock-budget.test.mjs'], mode: 'statement' },
};

const UNREACHABLE_BARS = {
  B12: { reason: 'the PQ-141 60-second proof scenario does not exist yet' },
};

test('every reachable bar has a check whose assertion message is the bar sentence, wired into smoke', () => {
  const smokeScript = packageJson.scripts['check:feel:scenarios'] || '';
  for (const bar of FEEL_BARS) {
    const contract = contractBars.get(bar.id);
    assert.ok(contract, `${bar.id} must exist in the parsed contract table`);
    const checked = CHECKED_BARS[bar.id];
    if (!checked) {
      const unreachable = UNREACHABLE_BARS[bar.id];
      assert.ok(unreachable,
        `${bar.id} has neither a check nor a recorded unreachable reason — write the check or record why the lab cannot reach it`);
      assert.equal(bar.benchReachable, false,
        `${bar.id} is recorded unreachable but the registry says benchReachable=${bar.benchReachable}`);
      assert.ok(bar.unreachableReason && bar.unreachableReason.length > 0,
        `${bar.id} needs a non-empty unreachableReason in FEEL_BARS`);
      continue;
    }
    // The bar must be quoted in a wired file. B1's statement lives in the shared guard module.
    const quoted = checked.files.some((file) => {
      const path = fileURLToPath(new URL(`../${file}`, import.meta.url));
      if (!existsSync(path)) return false;
      const source = readFileSync(path, 'utf8');
      const needle = checked.mode === 'first-sentence'
        ? contract.statement.split(/(?<=\.)\s/)[0]
        : contract.statement;
      return normalize(source).includes(needle);
    });
    assert.ok(quoted,
      `${bar.id}'s check must quote its FEEL_CONTRACT sentence ("${contract.statement.slice(0, 60)}…") in ${checked.files.join(' or ')}`);
    // The check must actually run in smoke: at least one quoting file is in check:feel:scenarios.
    const wired = checked.files.some((file) => smokeScript.includes(file));
    assert.ok(wired,
      `${bar.id}'s check file must be listed in package.json check:feel:scenarios (it runs via check:all:smoke)`);
  }
});

test('no checked bar is missing from the reachable set and no unreachable bar claims a check', () => {
  for (const bar of FEEL_BARS) {
    const checked = CHECKED_BARS[bar.id];
    if (bar.benchReachable) {
      assert.ok(checked, `${bar.id} is bench-reachable, so it must have a check (CHECKED_BARS)`);
    } else {
      assert.ok(!checked || bar.id === 'B9',
        `${bar.id} is not bench-reachable; only B9 carries a wired kernel instrument instead of a bench check`);
    }
  }
});

// §7: inject a failure and watch the check go red. The retired governor brake (automatic
// counter-thrust above the cap) must still turn B1 red, and the proof must speak B1's sentence.
test('the B1 injection proof exists: the retired governor brake turns the earned-speed guard red', () => {
  const source = readFileSync(fileURLToPath(new URL('../test/feel-regression.test.mjs', import.meta.url)), 'utf8');
  assert.match(source, /retired governor/i,
    'the injection test must name the retired governor counter-thrust it re-creates');
  assert.ok(normalize(source).includes('Only the brake spends it'),
    'the injection test must fail with B1\'s own sentence');
  assert.match(source, /assert\.throws/,
    'the injection must be observed through the guard failing, not asserted directly');
});
