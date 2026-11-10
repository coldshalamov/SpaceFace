#!/usr/bin/env node
// Refresh only explicitly selected existing pilots after their release GLBs were rebuilt.
// This does not generate packages or alter the release manifest.
// node scripts/refresh-render-package-pilots.mjs --only=repair-tender,wholeship_rescue_lifter
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivePilotSemanticManifest } from './build-render-package-pilots.mjs';
import { readGlbJson } from './lib/renderPackageRuntimeTable.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'assets/ships/render-packages/pilots.json';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function selectPilots(pilots, requested) {
  if (!Array.isArray(requested) || !requested.length) throw new Error('An explicit non-empty --only selection is required.');
  const selected = new Set();
  for (const raw of requested) {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('Empty pilot selection.');
    const id = raw.trim();
    const matches = pilots.filter((p) => [p.key, p.assetId, p.releaseAssetId, p.runtimeAssetId].includes(id));
    if (matches.length !== 1) throw new Error(`${matches.length ? 'Ambiguous' : 'Unknown'} pilot ${id}.`);
    if (selected.has(matches[0].key)) throw new Error(`Duplicate pilot selection ${id}.`);
    selected.add(matches[0].key);
  }
  return pilots.filter((pilot) => selected.has(pilot.key));
}

export function refreshedRootBinding(pilot, json) {
  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene?.nodes;
  if (!Array.isArray(roots) || !roots.length) throw new Error(`${pilot.key}: released GLB has no active scene roots.`);
  if (new Set(roots).size !== roots.length || roots.some((index) => !Number.isInteger(index) || !json.nodes?.[index])) {
    throw new Error(`${pilot.key}: invalid active scene root indices.`);
  }
  // A named descendant cannot cover new siblings, even if that old name still exists.
  // Scene bindings already cover the complete active graph, so keep them when valid.
  if (roots.length !== 1 || pilot.sceneRoot === true) return { sceneRoot: true };
  const name = json.nodes[roots[0]].name;
  const unique = name && json.nodes.filter((node) => node.name === name).length === 1;
  return unique ? { rootNode: name } : { sceneRoot: true };
}

export async function refreshRenderPackagePilots(options = {}) {
  const repoRoot = resolve(options.repoRoot || REPO_ROOT);
  const manifestPath = resolve(repoRoot, options.manifestPath || MANIFEST);
  const original = await readFile(manifestPath);
  const manifest = JSON.parse(original);
  if (manifest.schema !== 'spaceface.renderPackagePilots.v1' || !Array.isArray(manifest.pilots) || !manifest.releaseManifest) {
    throw new Error('Unsupported or incomplete render-package pilot manifest.');
  }
  const pilots = selectPilots(manifest.pilots, options.onlyIds || options.onlyKeys);
  const releasePath = resolve(repoRoot, manifest.releaseManifest);
  const releaseBytes = await readFile(releasePath);
  const release = JSON.parse(releaseBytes);
  const updates = new Map();
  const observed = [];
  for (const pilot of pilots) {
    const rows = (release.assets || []).filter((row) => row.id === pilot.releaseAssetId);
    if (rows.length !== 1 || rows[0].release !== pilot.sourceUrl) {
      throw new Error(`${pilot.key}: missing, duplicate, or mismatched release manifest binding.`);
    }
    const sourcePath = resolve(repoRoot, pilot.sourceUrl);
    const bytes = await readFile(sourcePath);
    const digest = sha256(bytes);
    if (rows[0].releaseSha256 !== digest || rows[0].releaseBytes !== bytes.length) {
      throw new Error(`${pilot.key}: release manifest does not match exact released GLB bytes; rebuild release metadata first.`);
    }
    const next = { ...pilot, releaseSha256: digest, releaseBytes: bytes.length };
    const binding = refreshedRootBinding(pilot, readGlbJson(bytes));
    if (binding.sceneRoot) { delete next.rootNode; next.sceneRoot = true; }
    else { delete next.sceneRoot; next.rootNode = binding.rootNode; }
    // Use the real compiler's semantic/identity rules, rather than accepting a root
    // that looks syntactically valid but cannot compile the exact released asset.
    await derivePilotSemanticManifest(next, sourcePath);
    updates.set(pilot.key, next);
    observed.push({ path: sourcePath, bytes });
  }
  const changes = pilots.filter((p) => JSON.stringify(p) !== JSON.stringify(updates.get(p.key))).map((p) => ({
    key: p.key, before: { releaseSha256: p.releaseSha256, releaseBytes: p.releaseBytes,
      ...(p.sceneRoot ? { sceneRoot: true } : { rootNode: p.rootNode }) },
    after: { releaseSha256: updates.get(p.key).releaseSha256, releaseBytes: updates.get(p.key).releaseBytes,
      ...(updates.get(p.key).sceneRoot ? { sceneRoot: true } : { rootNode: updates.get(p.key).rootNode }) },
  }));
  // Preserve every unselected row and its position. No coverage generation/pruning.
  manifest.pilots = manifest.pilots.map((p) => updates.get(p.key) || p);
  if (changes.length && options.dryRun !== true) {
    for (const input of [{ path: manifestPath, bytes: original }, { path: releasePath, bytes: releaseBytes }, ...observed]) {
      if (!(await readFile(input.path)).equals(input.bytes)) throw new Error(`Input changed during refresh: ${input.path}; no manifest written.`);
    }
    const temporary = `${manifestPath}.${randomUUID()}.refreshing`;
    try {
      await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
      // Check immediately before the single-file atomic publish as well.
      if (!(await readFile(manifestPath)).equals(original)) throw new Error('Pilot manifest changed before publish; no manifest written.');
      await rename(temporary, manifestPath);
    } finally { await rm(temporary, { force: true }); }
  }
  return { selected: pilots.map((p) => p.key), changes, written: changes.length > 0 && options.dryRun !== true };
}

export function parseRefreshArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') { options.dryRun = true; continue; }
    if (arg === '--only' || arg.startsWith('--only=')) {
      if (options.onlyIds) throw new Error('Duplicate --only argument.');
      const value = arg === '--only' ? argv[++i] : arg.slice(7);
      if (typeof value !== 'string' || value.startsWith('--')) throw new Error('--only requires pilot IDs or keys.');
      options.onlyIds = value.split(','); continue;
    }
    throw new Error(`Unknown argument ${arg}.`);
  }
  if (!options.onlyIds) throw new Error('An explicit --only selection is required.');
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await refreshRenderPackagePilots(parseRefreshArgs(process.argv.slice(2))), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
