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
