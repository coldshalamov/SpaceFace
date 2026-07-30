import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKED = /LEGACY FULL FINISH REPLAY BLOCKED/;

function run(command, args) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15_000,
  });
}

test('legacy Python and Node entry points fail closed without replay opt-in', () => {
  const commands = [
    ['python', ['tools/art/blender/revamp_full_finish.py']],
    ['python', ['tools/art/blender/gen_revamp_textures.py', 'place_station_fab']],
    ['python', ['tools/art/blender/cli_export_part.py']],
    ['python', ['tools/art/blender/write_place_evidence.py']],
    ['python', ['tools/art/blender/update_place_manifest_notes.py']],
    ['node', ['scripts/verify-full-finish-evidence.mjs']],
    ['node', ['scripts/verify-graphics-revamp-evidence.mjs']],
  ];

  for (const [command, args] of commands) {
    const result = run(command, args);
    assert.equal(result.status, 2, `${command} ${args.join(' ')}\n${result.stderr}`);
    assert.match(result.stderr, BLOCKED);
  }
});

test('explicit replay opt-in reaches non-mutating help for each direct entry point', () => {
  const commands = [
    ['python', ['tools/art/blender/revamp_full_finish.py', '--legacy-replay', '--help']],
    ['python', ['tools/art/blender/gen_revamp_textures.py', '--legacy-replay', '--help']],
    ['python', ['tools/art/blender/cli_export_part.py', '--legacy-replay', '--help']],
    ['python', ['tools/art/blender/write_place_evidence.py', '--legacy-replay', '--help']],
    ['python', ['tools/art/blender/update_place_manifest_notes.py', '--legacy-replay', '--help']],
    ['node', ['scripts/verify-full-finish-evidence.mjs', '--legacy-replay', '--help']],
    ['node', ['scripts/verify-graphics-revamp-evidence.mjs', '--legacy-replay', '--help']],
  ];

  for (const [command, args] of commands) {
    const result = run(command, args);
    assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr}`);
    assert.match(result.stdout, /historical|retired|legacy/i);
  }
});

test('historical Python helpers are conspicuously labeled and guarded wrappers propagate replay', async () => {
  const { readFile } = await import('node:fs/promises');
  const revamp = await readFile(
    new URL('../tools/art/blender/revamp_full_finish.py', import.meta.url),
    'utf8',
  );
  assert.match(revamp, /HISTORICAL \/ LEGACY REPLAY ONLY/);

  for (const script of [
    'tools/art/blender/write_place_evidence.py',
    'tools/art/blender/update_place_manifest_notes.py',
  ]) {
    const source = await readFile(new URL(`../${script}`, import.meta.url), 'utf8');
    assert.match(source, /HISTORICAL \/ LEGACY REPLAY ONLY/);
    assert.match(source, /LEGACY FULL FINISH REPLAY BLOCKED/);
  }

  for (const wrapper of [
    'tools/art/blender/run_batch_places.ps1',
    'tools/art/blender/run_remaining_places.ps1',
  ]) {
    const source = await readFile(new URL(`../${wrapper}`, import.meta.url), 'utf8');
    assert.match(
      source,
      /write_place_evidence\.py'\) '--legacy-replay' \$part/,
      `${wrapper} does not propagate the already-required replay opt-in`,
    );
  }
});

test('PowerShell legacy wrappers bind replay/help switches and fail closed unflagged', () => {
  const scripts = [
    'tools/art/blender/run_batch_places.ps1',
    'tools/art/blender/run_full_finish_bar.ps1',
    'tools/art/blender/run_remaining_places.ps1',
  ];
  const probe = [
    '$ErrorActionPreference = "Stop"',
    `$scripts = @(${scripts.map((script) => `"${script}"`).join(',')})`,
    '$results = foreach ($script in $scripts) {',
    '  $path = Join-Path (Get-Location) $script',
    '  $blocked = $false',
    '  try { & $path } catch { $blocked = $_.Exception.Message -match "LEGACY FULL FINISH REPLAY BLOCKED" }',
    '  $helpOk = $false',
    '  try {',
    '    $helpOutput = (& $path -LegacyReplay -Help 6>&1 | Out-String)',
    '    $helpOk = $helpOutput -match "historical replay only"',
    '  } catch {}',
    '  [pscustomobject]@{ script = $script; blocked = $blocked; helpOk = $helpOk }',
    '}',
    '$results | ConvertTo-Json -Compress',
  ].join('\n');
  const result = run('pwsh', ['-NoProfile', '-Command', probe]);
  assert.equal(result.status, 0, result.stderr);
  const rows = JSON.parse(result.stdout);
  assert.equal(rows.length, scripts.length);
  for (const row of rows) {
    assert.equal(row.blocked, true, `${row.script} did not fail closed`);
    assert.equal(row.helpOk, true, `${row.script} replay/help switches did not bind`);
  }
});
