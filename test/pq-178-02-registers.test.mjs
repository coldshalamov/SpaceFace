// PQ-178.02 — leftover faction registers as leftover writing rules.
// Headless. No soak. No headed capture. Blind leftover 7-of-8 leftover % is leftover uninvented.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { BARKS } from '../src/data/barks.js';
import { COMMS } from '../src/data/narrative.js';
import {
  FREE_FRONTIER_ID,
  FREE_FRONTIER_REL,
  REGISTER_HOUSE_IDS,
  REGISTER_KEYS,
  REGISTERS_REL,
  assignRegister,
  leftoverFreeFrontierVoiceRegister,
  loadFactionSheet,
  loadRegisterHouses,
  resolveExampleCite,
  validateFactionRegister,
  validateFactionRegisterCorpus,
} from '../src/story/factionRegisters.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CHECK = join(ROOT, 'scripts', 'check-faction-registers.mjs');

function runCheck(args = []) {
  return spawnSync(process.execPath, [CHECK, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
  });
}

test('leftover eight leftover houses have leftover writing-rule keys a leftover reader can assign', () => {
  const houses = loadRegisterHouses();
  assert.equal(houses.length, 8);
  assert.deepEqual(houses.map((sheet) => sheet.id), REGISTER_HOUSE_IDS.slice());

  for (const sheet of houses) {
    for (const key of REGISTER_KEYS) {
      assert.ok(String(sheet[key] || '').trim(), `${sheet.id} leftover ${key}`);
    }
    const leftoverBytes = resolveExampleCite(sheet.register_example_cite);
    assert.equal(sheet.register_example.trim(), leftoverBytes, sheet.id);
    assert.equal(assignRegister(sheet.register_example), sheet.id, `${sheet.id} leftover assign`);
  }

  const helix = COMMS.story.find((row) => row.id === 'story_b8_helix_audit');
  assert.equal(
    houses.find((sheet) => sheet.id === 'faction_helix').register_example.trim(),
    helix.text,
  );
  assert.equal(
    houses.find((sheet) => sheet.id === 'faction_scn').register_example.trim(),
    BARKS.faction_scn.scan[0],
  );

  const reports = validateFactionRegisterCorpus();
  for (const report of reports) {
    assert.deepEqual(report.issues, [], report.rel);
  }

  const cli = runCheck();
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.match(cli.stdout, /check-faction-registers: PASS/);
});

test('leftover validator fails leftover missing keys, leftover invented example, leftover empty rule, leftover lore-only', () => {
  const live = loadRegisterHouses().find((sheet) => sheet.id === 'faction_scn');

  const loreIssues = validateFactionRegister({
    id: 'faction_scn',
    name: 'Solar Concord Navy',
    primary_function: 'customs enforcement and jump-gate control',
  });
  assert.ok(loreIssues.some((row) => row.code === 'lore_only'), JSON.stringify(loreIssues));

  const missing = { ...live };
  delete missing.register_tell;
  const missingIssues = validateFactionRegister(missing);
  assert.ok(missingIssues.some((row) => row.code === 'missing_key'), JSON.stringify(missingIssues));

  const empty = { ...live, register_rule: '   ' };
  const emptyIssues = validateFactionRegister(empty);
  assert.ok(emptyIssues.some((row) => row.code === 'empty_rule'), JSON.stringify(emptyIssues));

  const invented = { ...live, register_example: 'Hello friend I invented this leftover bark.' };
  const inventedIssues = validateFactionRegister(invented);
  assert.ok(inventedIssues.some((row) => row.code === 'invented_example'), JSON.stringify(inventedIssues));
});

test('leftover Free Frontier is leftover cite-only, not a leftover ninth leftover house', () => {
  const frontier = loadFactionSheet(join(ROOT, FREE_FRONTIER_REL));
  assert.equal(frontier.id, FREE_FRONTIER_ID);
  const voice = leftoverFreeFrontierVoiceRegister(frontier);
  assert.match(voice, /FREE CAPTAINS/);
  assert.match(voice, /no customs arm, no song, no flag/);
  assert.ok(!REGISTER_HOUSE_IDS.includes(FREE_FRONTIER_ID));
  assert.equal(REGISTER_HOUSE_IDS.length, 8);

  const ninth = validateFactionRegister({
    id: 'faction_ninth',
    register_rule: 'invented leftover house',
    register_tell: 'ninth',
    register_forbidden: 'none',
    register_example: BARKS.faction_free.scan[0],
    register_example_cite: 'src/data/barks.js#faction_free.scan[0]',
    voice_direction: 'invented',
  });
  assert.ok(ninth.some((row) => row.code === 'invented_house'), JSON.stringify(ninth));

  const index = readFileSync(join(ROOT, REGISTERS_REL), 'utf8');
  assert.match(index, /not a leftover ninth house/i);
  assert.match(index, /7-of-8 leftover % is leftover uninvented/);
  assert.doesNotMatch(index, /7 of 8 times:\s*\d/);
});

// ---------------------------------------------------------------------------
// Leftover honesty review 2026-09-09. CHARACTERIZATION, not endorsement.
//
// The cases above call assignRegister() with a sheet's own register_example,
// which returns on the exact-match branch. The register_tell substring branch —
// the only path a bark a writer NEWLY writes can take — was never executed.
// The cases below pin what that branch actually does today, so the receipt's
// flipped STATUS cannot go stale silently. They are EXPECTED TO FAIL once the
// reader is fixed; when they do, update PQ-178.02-REPORT.md rather than
// deleting them.
// ---------------------------------------------------------------------------

const LEFTOVER_TELL_VERBATIM = [
  ['faction_scn', 'Concord Patrol. Present your manifest. Ref 44-C.'],
  ['faction_choir', 'The Choir observes. Be still.'],
  ['faction_helix', 'VESSEL TAG UNREAD — VARIANCE FILE OPEN. NO ACTION REQUIRED.'],
  ['faction_vael', 'Vael Consensus. Clause 1: your transit is noted.'],
  ['faction_quiet', 'Seen.'],
  ['faction_dmc', 'Drift Collective. Long shift. Keep off our rock.'],
  ['faction_reach', 'Weigh-slip open. You weigh what you weigh.'],
  ['faction_mts', 'Meridian Trade. Your account is late. Nothing personal.'],
];

// Each line obeys its own sheet's register_rule but does not reproduce
// register_tell byte-for-byte. Seven of eight are unassignable today.
const LEFTOVER_RULE_OBEDIENT = [
  ['faction_scn', 'Concord Patrol. Stand by. Reference 44-C applies.', null],
  ['faction_choir', 'The Pattern observes. Hold your heading.', null],
  ['faction_helix', 'Vessel flagged. Variance file open. No action required.', null],
  ['faction_vael', 'Vael Consensus. Clause 7: your presence is registered.', null],
  ['faction_quiet', 'Noted.', null],
  ['faction_dmc', 'Drift Collective. Long day. You ain’t claim-jumping, are you.', null],
  ['faction_reach', 'Your weigh-slip is open. Mass is on the board.', null],
  ['faction_mts', 'Meridian Trade. Fee assessed to your account. Nothing personal about it.', 'faction_mts'],
];

test('leftover honesty: the leftover tell branch assigns only a byte-for-byte leftover tell', () => {
  for (const [id, line] of LEFTOVER_TELL_VERBATIM) {
    assert.equal(assignRegister(line), id, `leftover verbatim tell ${id}: ${line}`);
  }

  const leftoverUnassignable = [];
  for (const [id, line, expected] of LEFTOVER_RULE_OBEDIENT) {
    const got = assignRegister(line);
    assert.equal(got, expected, `leftover rule-obedient ${id}: ${line}`);
    if (got === null) leftoverUnassignable.push(id);
  }

  // Seven of eight rule-obedient barks a writer could write are unassignable.
  assert.equal(leftoverUnassignable.length, 7, leftoverUnassignable.join(','));
  assert.ok(!leftoverUnassignable.includes('faction_mts'));
});

test('leftover honesty: the leftover reader is precise and nearly blind on the leftover live corpus', () => {
  let total = 0;
  let assigned = 0;
  let misassigned = 0;
  let unassignable = 0;

  for (const id of REGISTER_HOUSE_IDS) {
    const table = BARKS[id];
    if (!table) continue;
    for (const lines of Object.values(table)) {
      if (!Array.isArray(lines)) continue;
      for (const line of lines) {
        if (typeof line !== 'string') continue;
        total += 1;
        const got = assignRegister(line);
        if (got === id) assigned += 1;
        else if (got) misassigned += 1;
        else unassignable += 1;
      }
    }
  }

  const leftoverTally = `total=${total} assigned=${assigned} misassigned=${misassigned} null=${unassignable}`;

  // Helix has no bark table at all, so the corpus covers seven houses.
  assert.equal(BARKS.faction_helix, undefined);
  assert.ok(total > 200, leftoverTally);

  // Precise: it never puts a live bark on the wrong house.
  assert.equal(misassigned, 0, leftoverTally);

  // Blind: the overwhelming majority of the barks the game already speaks come
  // back null, so a reader must guess. Relational, not a pinned 224-vs-14, so
  // an unrelated barks.js edit does not red this file.
  assert.ok(unassignable > assigned * 5, leftoverTally);
  assert.ok(assigned / total < 0.25, leftoverTally);
});

test('leftover honesty: three leftover validator holes are silent', () => {
  const live = loadRegisterHouses().find((sheet) => sheet.id === 'faction_scn');

  // Hole 1 — the cite is never checked against the sheet's own house.
  const crossed = {
    ...live,
    register_example: BARKS.faction_mts.scan[0],
    register_example_cite: 'src/data/barks.js#faction_mts.scan[0]',
  };
  assert.deepEqual(validateFactionRegister(crossed), [], 'leftover cross-house cite');

  // Hole 2 — only register_rule has an empty check; the other keys may be blank.
  for (const key of ['register_tell', 'register_forbidden', 'voice_direction']) {
    assert.deepEqual(validateFactionRegister({ ...live, [key]: '   ' }), [], `leftover blank ${key}`);
  }

  // Hole 3 — register_forbidden is prose; nothing is ever compared against it.
  assert.match(live.register_forbidden, /leftover slang/);
  assert.deepEqual(
    validateFactionRegister({ ...live, register_rule: 'Bloodless leftover clerk. Contractions and leftover slang welcome.' }),
    [],
    'leftover forbidden is unenforced',
  );
});
