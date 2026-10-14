#!/usr/bin/env node
// Create an immutable, probe-only source overlay from one frozen git commit.
// The output belongs under .devshots/ and embeds only explicitly named runtime files;
// assets, node_modules, and every unlisted working-tree file stay outside the overlay.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { normalizeSourceOverlayPath, sourceOverlayDigest } = createRequire(import.meta.url)('./lib/gameServer.cjs');

// Historical performance write set. Keep this list deliberately explicit: the baseline is meant
// to pin the files owned by the performance campaign while every other source, asset, and package
// remains the current checkout. A path absent from the frozen commit is recorded and skipped.
const DEFAULT_PERFORMANCE_PATHS = Object.freeze([
  'index.html',
  'src/core/physicsAuthority.js',
  'src/core/presentationRunner.js',
  'src/core/sg02DynamicBodyOwner.js',
  'src/core/simLaneMain.js',
  'src/core/wholeSimBrowserWorker.js',
  'src/core/simulationRunner.js',
  'src/data/lookMoods.js',
  'src/render/clearanceQuery.js',
  'src/render/illustratedSurface.js',
  'src/render/look.js',
  'src/render/partsLibrary.js',
  'src/render/renderer.js',
  'src/render/rigidOpaqueBatchPolicy.js',
  'src/render/vfx.js',
  'src/render/vfx/effectsCause.js',
  'src/systems/missions.js',
  'src/systems/survivalWave.js',
  'src/ui/radar.js',
  'src/ui/screenManager.js',
  'src/ui/screens/flightFootage.js',
  'src/ui/station/screens/market.js',
  'src/world/activityRuntime.js',
]);

function value(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function allValues(name) {
  const prefix = `${name}=`;
  return process.argv.filter((arg) => arg.startsWith(prefix)).map((arg) => arg.slice(prefix.length));
}

function usage(message) {
  if (message) console.error(`create-source-baseline: ${message}`);
  console.error('Usage: node scripts/create-source-baseline.mjs [--path=index.html --path=src/main.js] [--paths-file=owned.txt] [--commit=HEAD] [--out=.devshots/source-baselines/name.json]');
  process.exitCode = 2;
  return null;
}

function repoRelative(valueToNormalize) {
  const raw = String(valueToNormalize || '').trim().replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) return null;
  const normalized = path.posix.normalize(raw);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return null;
  return normalizeSourceOverlayPath(normalized);
}

function frozenCommit(ref) {
  const result = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
    cwd: ROOT, encoding: 'utf8', windowsHide: true,
  }).trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(result)) throw new Error(`git did not return a full commit for ${ref}`);
  return result;
}

function bytesAtCommit(commit, relativePath) {
  return execFileSync('git', ['show', `${commit}:${relativePath}`], {
    cwd: ROOT, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
}

const commitRef = value('--commit') || 'HEAD';
const outputArg = value('--out');
const name = value('--name') || `baseline-${commitRef.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase().slice(0, 32)}`;
const output = path.resolve(ROOT, outputArg || path.join('.devshots', 'source-baselines', `${name}.json`));
const outputRel = path.relative(ROOT, output).replace(/\\/g, '/');
if (!outputRel.startsWith('.devshots/') || outputRel.includes('/../') || outputRel === '.devshots') {
  usage('--out must remain inside the ignored .devshots directory');
} else {
  const direct = allValues('--path');
  const fromFile = value('--paths-file');
  let fileList = [...direct];
  if (fromFile) {
    const file = path.resolve(ROOT, fromFile);
    const text = await readFile(file, 'utf8');
    fileList.push(...text.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean));
  }
  const usingDefaultPaths = fileList.length === 0;
  if (usingDefaultPaths) fileList = [...DEFAULT_PERFORMANCE_PATHS];
  const normalizedPaths = fileList.map(repoRelative);
  if (!normalizedPaths.length || normalizedPaths.some((entry) => !entry)) usage('at least one allowed source path is required');
  else {
    const uniquePaths = [...new Set(normalizedPaths)].sort();
    if (uniquePaths.length !== normalizedPaths.length) usage('duplicate source paths are not allowed');
    else {
      try {
        const sourceCommit = frozenCommit(commitRef);
        const missingPaths = [];
        const presentPaths = uniquePaths.filter((relativePath) => {
          try {
            execFileSync('git', ['cat-file', '-e', `${sourceCommit}:${relativePath}`], {
              cwd: ROOT, stdio: 'ignore', windowsHide: true,
            });
            return true;
          } catch (error) {
            if (!usingDefaultPaths) throw new Error(`source path is absent at ${sourceCommit}: ${relativePath}`);
            missingPaths.push(relativePath);
            return false;
          }
        });
        if (!presentPaths.length) throw new Error('none of the requested source paths exist at the frozen commit');
        const files = presentPaths.map((relativePath) => {
          const body = bytesAtCommit(sourceCommit, relativePath);
          const sha256 = createHash('sha256').update(body).digest('hex');
          return {
            path: relativePath,
            bytes: body.length,
            sha256,
            contentBase64: body.toString('base64'),
          };
        });
        const manifest = {
          schema: 'spaceface.sourceBaseline.v1',
          sourceCommit,
          sourceOverlayDigest: sourceOverlayDigest(files),
          requestedPaths: uniquePaths,
          omittedPaths: missingPaths,
          createdAt: new Date().toISOString(),
          files,
        };
        await mkdir(path.dirname(output), { recursive: true });
        const temporary = `${output}.tmp-${process.pid}`;
        await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        await rename(temporary, output);
        console.log(JSON.stringify({
          manifest: output,
          sourceCommit,
          sourceOverlayDigest: manifest.sourceOverlayDigest,
          fileCount: files.length,
          totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        }, null, 2));
      } catch (error) {
        console.error(`create-source-baseline: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
}
