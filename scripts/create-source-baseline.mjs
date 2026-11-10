#!/usr/bin/env node
// Create an immutable, probe-only source overlay from one frozen git commit.
// The output belongs under .devshots/ and embeds either explicitly named runtime files or,
// with --all-runtime, index.html + vendor/three.module.js + the complete src/**/*.{js,json},
// scripts/lib runtime and styles trees.
// Assets, node_modules, and every other unlisted working-tree file stay outside the capture.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readGitCatFileBatch } from './lib/gitCatFileBatch.mjs';

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

const ALL_RUNTIME_PATH_POLICY = 'index.html + vendor/three.module.js + src/**/*.{js,json} + scripts/lib/**/*.{js,mjs,cjs} + styles/**/*';
const SOURCE_RUNTIME_EXTENSIONS = Object.freeze(new Set(['.js', '.json']));
const SCRIPT_RUNTIME_EXTENSIONS = Object.freeze(new Set(['.js', '.mjs', '.cjs']));

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
  console.error('Usage: node scripts/create-source-baseline.mjs [--working-tree] [--all-runtime | --path=index.html --path=src/main.js] [--paths-file=owned.txt] [--commit=HEAD] [--out=.devshots/source-baselines/name.json]');
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

function listTrackedPathsAtCommit(commit, prefix, include = () => true) {
  const listing = execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', commit, '--', prefix], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  });
  return String(listing || '').split('\0')
    .map((relativePath) => relativePath.replace(/\\/g, '/'))
    .filter((relativePath) => relativePath.startsWith(`${prefix}/`) && include(relativePath))
    .sort();
}

function listSrcRuntimePathsAtCommit(commit) {
  return listTrackedPathsAtCommit(commit, 'src', (relativePath) =>
    SOURCE_RUNTIME_EXTENSIONS.has(path.extname(relativePath).toLowerCase()));
}

function listScriptRuntimePathsAtCommit(commit) {
  return listTrackedPathsAtCommit(commit, 'scripts/lib', (relativePath) =>
    SCRIPT_RUNTIME_EXTENSIONS.has(path.extname(relativePath).toLowerCase()));
}

function listStylesPathsAtCommit(commit) {
  return listTrackedPathsAtCommit(commit, 'styles');
}

async function listWorkingTreePaths(prefix, include = () => true) {
  const trackedListing = execFileSync('git', ['ls-files', '-z', '--', prefix], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  });
  const paths = new Set(String(trackedListing || '').split('\0')
    .map((relativePath) => relativePath.replace(/\\/g, '/'))
    .filter((relativePath) => relativePath.startsWith(`${prefix}/`) && include(relativePath)));
  const walk = async (relativeDirectory) => {
    let entries;
    try {
      entries = await readdir(path.join(ROOT, relativeDirectory), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory.replace(/\\/g, '/'), entry.name);
      if (entry.isDirectory()) {
        await walk(relativePath);
      } else if (entry.isFile() && include(relativePath)) {
        paths.add(relativePath);
      }
    }
  };
  await walk(prefix);
  return [...paths].sort();
}

async function listScriptRuntimePathsAtWorkingTree() {
  return listWorkingTreePaths('scripts/lib', (relativePath) =>
    SCRIPT_RUNTIME_EXTENSIONS.has(path.extname(relativePath).toLowerCase()));
}

async function listStylesPathsAtWorkingTree() {
  return listWorkingTreePaths('styles');
}

function bytesAtWorkingTree(relativePath) {
  return readFileSync(path.join(ROOT, relativePath));
}

const commitRef = value('--commit') || 'HEAD';
const workingTree = process.argv.includes('--working-tree');
const allRuntime = process.argv.includes('--all-runtime');
const outputArg = value('--out');
const name = value('--name') || `baseline-${commitRef.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase().slice(0, 32)}`;
const output = path.resolve(ROOT, outputArg || path.join('.devshots', 'source-baselines', `${name}.json`));
const outputRel = path.relative(ROOT, output).replace(/\\/g, '/');
if (!outputRel.startsWith('.devshots/') || outputRel.includes('/../') || outputRel === '.devshots') {
  usage('--out must remain inside the ignored .devshots directory');
} else if (workingTree && value('--commit') && value('--commit') !== 'HEAD') {
  usage('--working-tree requires --commit=HEAD when a commit is supplied');
} else {
  const direct = allValues('--path');
  const fromFile = value('--paths-file');
  if (allRuntime && (direct.length > 0 || fromFile)) {
    usage('--all-runtime cannot be combined with --path or --paths-file');
  } else {
    try {
      const sourceCommit = frozenCommit(commitRef);
      let fileList = [...direct];
      if (fromFile) {
        const file = path.resolve(ROOT, fromFile);
        const text = await readFile(file, 'utf8');
        fileList.push(...text.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean));
      }
      const usingDefaultPaths = fileList.length === 0 && !allRuntime;
      if (allRuntime) {
        fileList = [
          'index.html',
          'vendor/three.module.js',
          ...(workingTree
            ? await listWorkingTreePaths('src', (relativePath) =>
              SOURCE_RUNTIME_EXTENSIONS.has(path.extname(relativePath).toLowerCase()))
            : listSrcRuntimePathsAtCommit(sourceCommit)),
          ...(workingTree ? await listScriptRuntimePathsAtWorkingTree() : listScriptRuntimePathsAtCommit(sourceCommit)),
          ...(workingTree ? await listStylesPathsAtWorkingTree() : listStylesPathsAtCommit(sourceCommit)),
        ];
      } else if (usingDefaultPaths) {
        fileList = [...DEFAULT_PERFORMANCE_PATHS];
      }
      const normalizedPaths = fileList.map(repoRelative);
      if (!normalizedPaths.length || normalizedPaths.some((entry) => !entry)) {
        usage('at least one allowed source path is required');
      } else {
        const uniquePaths = [...new Set(normalizedPaths)].sort();
        if (uniquePaths.length !== normalizedPaths.length) {
          usage('duplicate source paths are not allowed');
        } else {
          const missingPaths = [];
          let presentPaths;
          let historicalBodies = null;
          let historicalBodyByPath = null;
          if (workingTree) {
            presentPaths = uniquePaths.filter((relativePath) => {
              if (existsSync(path.join(ROOT, relativePath))) return true;
              if (allRuntime) {
                missingPaths.push(relativePath);
                return false;
              }
              if (!usingDefaultPaths) throw new Error(`source path is absent in the working tree: ${relativePath}`);
              missingPaths.push(relativePath);
              return false;
            });
          } else {
            historicalBodies = await readGitCatFileBatch(sourceCommit, uniquePaths, { cwd: ROOT });
            historicalBodyByPath = new Map(uniquePaths.map((relativePath, index) => [
              relativePath, historicalBodies[index],
            ]));
            presentPaths = [];
            for (let i = 0; i < uniquePaths.length; i++) {
              if (historicalBodies[i] !== null) {
                presentPaths.push(uniquePaths[i]);
              } else if (usingDefaultPaths) {
                missingPaths.push(uniquePaths[i]);
              } else {
                throw new Error(`source path is absent at ${sourceCommit}: ${uniquePaths[i]}`);
              }
            }
          }
          if (!presentPaths.length) throw new Error('none of the requested source paths exist at the frozen commit');
          const files = presentPaths.map((relativePath) => {
            const body = workingTree
              ? bytesAtWorkingTree(relativePath)
              : historicalBodyByPath.get(relativePath);
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
            sourceMode: allRuntime
              ? (workingTree ? 'working-tree-all-runtime' : 'git-commit-all-runtime')
              : (workingTree ? 'working-tree' : 'git-commit'),
            workingTree,
            captureScope: allRuntime ? 'all-runtime' : 'performance-paths',
            runtimePathPolicy: allRuntime
              ? ALL_RUNTIME_PATH_POLICY
              : 'explicit performance path set',
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
            sourceMode: manifest.sourceMode,
            captureScope: manifest.captureScope,
            sourceOverlayDigest: manifest.sourceOverlayDigest,
            fileCount: files.length,
            totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
          }, null, 2));
        }
      }
    } catch (error) {
      console.error(`create-source-baseline: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
