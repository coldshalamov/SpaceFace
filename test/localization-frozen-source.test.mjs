import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildLocalizationInventory, readGitLocalizationSource } from '../scripts/lib/localizationInventory.mjs';

test('Git extraction pins configuration and blobs while live extraction sees working changes', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'sf-locale-git-'));
  const git = (...args) => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
  const put = async (name, contents) => {
    const file = path.join(rootDir, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  };
  try {
    git('init', '-q');
    const surfaces = { roots: ['src/ui'], extensions: ['.js'], excludes: ['src/ui/hidden'] };
    const exemptions = { exemptions: [] };
    await put('scripts/localization-surfaces.json', JSON.stringify(surfaces));
    await put('scripts/localization-exemptions.json', JSON.stringify(exemptions));
    await put('src/ui/view.js', "const card = { title: 'Original title' };\n");
    await put('src/ui/hidden/private.js', "const card = { title: 'Excluded title' };\n");
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    const commit = git('rev-parse', 'HEAD');
    await put('src/ui/view.js', "\nconst card = { title: 'Changed title' };\n");
    await put('src/ui/new.js', "const card = { title: 'Untracked title' };\n");
    await put('scripts/localization-surfaces.json', JSON.stringify({ ...surfaces, excludes: [] }));

    const frozen = readGitLocalizationSource(rootDir, commit.slice(0, 12));
    const frozenInventory = await buildLocalizationInventory({ rootDir, ...frozen });
    const liveSurfaces = JSON.parse(await readFile(path.join(rootDir, 'scripts/localization-surfaces.json'), 'utf8'));
    const live = await buildLocalizationInventory({ rootDir, surfaces: liveSurfaces, exemptions });
    assert.equal(frozen.commit, commit);
    assert.deepEqual(frozenInventory.entries.map(e => [e.message, e.line]), [['Original title', 1]]);
    assert.deepEqual(live.entries.map(e => e.message).sort(), ['Changed title', 'Excluded title', 'Untracked title']);
  } finally { await rm(rootDir, { recursive: true, force: true }); }
});
