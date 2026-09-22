// PQ-178.02 — faction registers as writing rules with voice direction.
// Headless. No soak. No headed capture. A human playtest percentage stays uninvented.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { BARKS } from '../src/data/barks.js';
import { COMMS } from '../src/data/narrative.js';
import {
  BLIND_PROOF_SEED,
  FREE_FRONTIER_ID,
  FREE_FRONTIER_REL,
  REGISTER_HOUSE_IDS,
  REGISTER_KEYS,
  REGISTERS_REL,
  assignRegister,
  freeFrontierVoiceRegister,
  liveHouseLines,
  loadFactionSheet,
  loadRegisterHouses,
  normalizeLine,
  parseKeyList,
  resolveExampleCite,
  scanHouseTableForForbidden,
  scoreHouse,
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

// Eight fresh barks, one per house, written from the rule on the sheet. Each
// carries its own tell and none of its own forbidden terms. Seed 17802.
const BLIND_PROBES = Object.freeze([
  ['faction_scn', 'Checkpoint ahead. Present your manifest or be cited. Ref 44-C.'],
  ['faction_choir', 'The Pattern holds. The chorus receives the corrected.'],
  ['faction_helix', 'VESSEL UNLOGGED \u2014 VARIANCE FILE OPEN. NO ACTION REQUIRED.'],
  ['faction_vael', 'Clause 4: this-vessel records your answer in the accord.'],
  ['faction_quiet', 'Seen. Say nothing.'],
  ['faction_dmc', "Drift rig. Long shift. You ain't on this claim."],
  ['faction_reach', 'Weigh-slip stays open. The tonnage decides the crossing.'],
  ['faction_mts', 'Meridian desk. That is a fee against your account. Nothing personal.'],
]);

function corpusLines() {
  const out = [];
  for (const id of REGISTER_HOUSE_IDS) {
    for (const row of liveHouseLines(id)) out.push(row.line);
  }
  const helix = COMMS.story.find((row) => row.id === 'story_b8_helix_audit');
  if (helix) out.push(helix.text);
  return out;
}

test('eight houses carry writing-rule keys a reader can assign', () => {
  const houses = loadRegisterHouses();
  assert.equal(houses.length, 8);
  assert.deepEqual(houses.map((sheet) => sheet.id), REGISTER_HOUSE_IDS.slice());

  for (const sheet of houses) {
    for (const key of REGISTER_KEYS) {
      assert.ok(String(sheet[key] || '').trim(), `${sheet.id} ${key}`);
    }
    const sourceBytes = resolveExampleCite(sheet.register_example_cite);
    assert.equal(sheet.register_example.trim(), sourceBytes, sheet.id);
    assert.equal(assignRegister(sheet.register_example), sheet.id, `${sheet.id} assign`);
    // The example demonstrates its own rule: a tell present, no forbidden term.
    assert.ok(scoreHouse(sheet, sheet.register_example) > 0, `${sheet.id} example misses tell`);
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

test('validator fails lore-only, missing and empty keys, invented and cross-house examples', () => {
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

  for (const key of ['register_tell', 'register_forbidden', 'voice_direction']) {
    const blanked = validateFactionRegister({ ...live, [key]: '   ' });
    assert.ok(blanked.some((row) => row.code === 'empty_key'), `blank ${key}: ${JSON.stringify(blanked)}`);
  }

  const invented = { ...live, register_example: 'Hello friend I invented this bark.' };
  const inventedIssues = validateFactionRegister(invented);
  assert.ok(inventedIssues.some((row) => row.code === 'invented_example'), JSON.stringify(inventedIssues));

  const crossed = {
    ...live,
    register_example: BARKS.faction_mts.scan[0],
    register_example_cite: 'src/data/barks.js#faction_mts.scan[0]',
  };
  const crossedIssues = validateFactionRegister(crossed);
  assert.ok(crossedIssues.some((row) => row.code === 'cross_house_cite'), JSON.stringify(crossedIssues));

  const mtsLive = loadRegisterHouses().find((sheet) => sheet.id === 'faction_mts');
  const tellLess = { ...mtsLive, register_tell: 'phrase no bark uses\nanother unused phrase' };
  const tellLessIssues = validateFactionRegister(tellLess);
  assert.ok(tellLessIssues.some((row) => row.code === 'example_misses_tell'), JSON.stringify(tellLessIssues));

  const foul = { ...mtsLive, register_forbidden: 'account\npattern' };
  const foulIssues = validateFactionRegister(foul);
  assert.ok(foulIssues.some((row) => row.code === 'forbidden_in_example'), JSON.stringify(foulIssues));
});

test('Free Frontier is cite-only, not a ninth house', () => {
  const frontier = loadFactionSheet(join(ROOT, FREE_FRONTIER_REL));
  assert.equal(frontier.id, FREE_FRONTIER_ID);
  const voice = freeFrontierVoiceRegister(frontier);
  assert.match(voice, /FREE CAPTAINS/);
  assert.match(voice, /no customs arm, no song, no flag/);
  assert.ok(!REGISTER_HOUSE_IDS.includes(FREE_FRONTIER_ID));
  assert.equal(REGISTER_HOUSE_IDS.length, 8);

  const ninth = validateFactionRegister({
    id: 'faction_ninth',
    register_rule: 'invented house',
    register_tell: 'ninth',
    register_forbidden: 'none',
    register_example: BARKS.faction_free.scan[0],
    register_example_cite: 'src/data/barks.js#faction_free.scan[0]',
    voice_direction: 'invented',
  });
  assert.ok(ninth.some((row) => row.code === 'invented_house'), JSON.stringify(ninth));

  // The index quotes the sheet bytes; it invents no playtest percentage.
  const index = readFileSync(join(ROOT, REGISTERS_REL), 'utf8');
  assert.match(index, /not a ninth house/i);
  assert.ok(index.includes(voice), 'index voice_register quote must match sheet bytes');
  assert.match(index, /uninvented/);
  assert.doesNotMatch(index, /playtest[^.]{0,40}\d+\s*%/i);
});

test(`seed ${BLIND_PROOF_SEED}: eight fresh rule-obedient barks assign 8/8 with none wrong`, () => {
  const houses = loadRegisterHouses();
  const byId = Object.fromEntries(houses.map((sheet) => [sheet.id, sheet]));
  const corpus = new Set(corpusLines().map((line) => line.trim()));
  const examples = new Set(houses.map((sheet) => sheet.register_example.trim()));
  assert.equal(BLIND_PROBES.length, 8);

  const named = [];
  for (const [id, line] of BLIND_PROBES) {
    const sheet = byId[id];
    // Fresh: the probe is a bark a writer newly writes, not a stored line.
    assert.ok(!corpus.has(line.trim()), `${id} probe repeats the corpus: ${line}`);
    assert.ok(!examples.has(line.trim()), `${id} probe repeats an example: ${line}`);
    // Rule-obedient: carries its own tell, none of its own forbidden terms.
    const normalized = normalizeLine(line);
    const tells = parseKeyList(sheet.register_tell).map(normalizeLine).filter(Boolean);
    assert.ok(tells.some((tell) => normalized.includes(tell)), `${id} probe carries no tell: ${line}`);
    const forbidden = parseKeyList(sheet.register_forbidden).map(normalizeLine).filter(Boolean);
    assert.ok(!forbidden.some((term) => normalized.includes(term)), `${id} probe uses a forbidden term: ${line}`);
    const got = assignRegister(line, houses);
    assert.equal(got, id, `${id} probe assigned ${got}: ${line}`);
    named.push(got);
  }
  assert.equal(new Set(named).size, 8);
  console.log(`[pq-178.02 blind] seed=${BLIND_PROOF_SEED} named=${named.join(',')}`);
});

test(`seed ${BLIND_PROOF_SEED}: live corpus sweep assigns with zero misassigned`, () => {
  const houses = loadRegisterHouses();
  let total = 0;
  let assigned = 0;
  let misassigned = 0;
  let unassignable = 0;

  for (const id of REGISTER_HOUSE_IDS) {
    for (const row of liveHouseLines(id)) {
      total += 1;
      const got = assignRegister(row.line, houses);
      if (got === id) assigned += 1;
      else if (got) misassigned += 1;
      else unassignable += 1;
    }
  }

  const tally = `total=${total} assigned=${assigned} misassigned=${misassigned} null=${unassignable}`;
  console.log(`[pq-178.02 corpus] seed=${BLIND_PROOF_SEED} ${tally}`);

  // Helix has no bark table; its register rests on its cited narrative comm.
  assert.equal(BARKS.faction_helix, undefined);
  assert.ok(total > 200, tally);

  // Precise: never puts a live bark on the wrong house.
  assert.equal(misassigned, 0, tally);

  // Not blind: the overwhelming majority of live barks resolve. Relational so
  // corpus growth does not red this file; the 8/8 probe gate above is the bar.
  assert.ok(assigned / total >= 0.75, tally);

  // No house speaks its own forbidden terms.
  for (const sheet of houses) {
    assert.deepEqual(scanHouseTableForForbidden(sheet), [], sheet.id);
  }
});

test('bare fragments abstain rather than guess', () => {
  const houses = loadRegisterHouses();
  for (const line of ['Gone.', 'Later.', 'Not today.']) {
    assert.equal(assignRegister(line, houses), null, line);
  }
});
