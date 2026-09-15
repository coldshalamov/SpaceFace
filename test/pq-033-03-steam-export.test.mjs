// PQ-033.03 — the Steamworks achievement export is generated from src/data/achievements.js, carries
// every API name / display name / description / hidden flag, and `--check` fails on drift.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ACHIEVEMENTS } from '../src/data/achievements.js';
import {
  EXPORT_FILES,
  checkExports,
  renderAchievementCsv,
  renderAchievementVdf,
  renderElectronTable,
  writeExports,
} from '../scripts/export-steam-achievements.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(ROOT, 'electron', 'main.cjs'));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

test('the committed exports are current: npm run check:steam:achievements passes', () => {
  const run = spawnSync(process.execPath, ['scripts/export-steam-achievements.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, new RegExp(`ok ${ACHIEVEMENTS.length} achievements`));
  console.log(`PQ-033.03 export --check: ${run.stdout.trim()}`);
});

test('--check fails on a stale, missing or out-of-date export and names the file', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pq03303-export-'));
  try {
    writeExports({ root: tmp });
    assert.equal(checkExports({ root: tmp }).ok, true);

    writeFileSync(path.join(tmp, EXPORT_FILES.csv), 'order,api_name\n1,SF_WRONG\n');
    rmSync(path.join(tmp, EXPORT_FILES.electronTable));
    const verdict = checkExports({ root: tmp });
    assert.equal(verdict.ok, false);
    assert.ok(verdict.failures.some((f) => f.includes('achievements.csv') && /stale/.test(f)), verdict.failures.join('\n'));
    assert.ok(verdict.failures.some((f) => f.includes('steamAchievements.json') && /missing/.test(f)), verdict.failures.join('\n'));

    const added = [...ACHIEVEMENTS, {
      ...ACHIEVEMENTS[0],
      id: 'brand_new_feat',
      steamApiName: 'SF_BRAND_NEW_FEAT',
      nameKey: 'achievements.brand_new_feat.name',
      descriptionKey: 'achievements.brand_new_feat.description',
    }];
    assert.equal(checkExports({ defs: added }).ok, false, 'a new definition makes the committed export stale');

    const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'export-steam-achievements.mjs'), '--check'], { cwd: tmp, encoding: 'utf8' });
    assert.equal(run.status, 0, `the CLI checks the repository files regardless of the working directory\n${run.stdout}\n${run.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('the CSV paste list and the VDF carry every name, description, hidden flag and icon file', () => {
  const rows = parseCsv(renderAchievementCsv());
  assert.deepEqual(rows[0], ['order', 'api_name', 'display_name', 'description', 'hidden', 'set_by', 'category', 'unlock_rule', 'achieved_icon', 'unachieved_icon']);
  assert.equal(rows.length, ACHIEVEMENTS.length + 1);
  ACHIEVEMENTS.forEach((def, index) => {
    const row = rows[index + 1];
    assert.equal(row[0], String(index + 1));
    assert.equal(row[1], def.steamApiName);
    assert.equal(row[2], def.name);
    assert.equal(row[3], def.description);
    assert.equal(row[4], def.hidden ? '1' : '0');
    assert.ok(row[7].length > 0, `${def.id} names its unlock rule`);
    assert.equal(row[8], `build/store/steam/achievements/${def.steamApiName}_achieved.jpg`);
    assert.equal(row[9], `build/store/steam/achievements/${def.steamApiName}_unachieved.jpg`);
  });

  const vdf = renderAchievementVdf();
  assert.equal((vdf.match(/\{/g) || []).length, (vdf.match(/\}/g) || []).length, 'balanced KeyValues braces');
  for (const def of ACHIEVEMENTS) {
    assert.ok(vdf.includes(`"api_name"\t\t"${def.steamApiName}"`), `${def.id} api name in VDF`);
    assert.ok(vdf.includes(`"english"\t\t"${def.name}"`), `${def.id} display name in VDF`);
    assert.ok(vdf.includes(`"icon"\t\t"${def.steamApiName}_achieved.jpg"`), `${def.id} achieved icon in VDF`);
    assert.ok(vdf.includes(`"icon_gray"\t\t"${def.steamApiName}_unachieved.jpg"`), `${def.id} unachieved icon in VDF`);
  }

  const table = JSON.parse(renderElectronTable());
  assert.deepEqual(table.achievements, ACHIEVEMENTS.map((def) => ({ id: def.id, apiName: def.steamApiName })));
  const loaded = require('./steamworks.cjs').loadSteamAchievementTable();
  assert.equal(loaded.size, ACHIEVEMENTS.length, 'the shell reads the generated table it ships with');
  assert.equal(loaded.get('berth_assigned'), 'SF_BERTH_ASSIGNED');
  console.log(`PQ-033.03 export: ${ACHIEVEMENTS.length} rows; hidden=${ACHIEVEMENTS.filter((d) => d.hidden).map((d) => d.steamApiName).join(',')}`);
});
