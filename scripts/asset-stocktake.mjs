#!/usr/bin/env node
// Descriptive asset inventory. Existing manifests and runtime maps remain the authority.
// This command inventories file presence and light GLB metadata; it does not assess visual quality.
import {
  closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync,
  readdirSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EVERYDAY_SPACE_KIT_LEGAL_MODELS } from '../src/data/everydaySpaceKitDressing.js';
import { WRECK_AFTERMATH_MODELS } from '../src/data/wreckAftermathDressing.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = resolve(ROOT, 'design/program/asset-experience');
const JSON_OUT = resolve(OUTPUT_DIR, 'ASSET_STOCKTAKE.json');
const MD_OUT = resolve(OUTPUT_DIR, 'ASSET_STOCKTAKE.md');
const MEDIA_EXTENSIONS = new Set([
  '.glb', '.gltf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ktx2',
  '.mp3', '.ogg', '.wav', '.m4a', '.flac', '.opus', '.mp4', '.webm', '.avif',
]);
const ASSET_REFERENCE_RE = /assets\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp|gif|mp4|webm|ogg|wav|mp3|aac|m4a|flac|opus|glb|gltf|ktx2|svg|json)/g;
const IGNORED_MANIFESTS = new Set([
  'assets/ships/parts/parts_manifest.json',
  'assets/ships/release/release_manifest.json',
]);
const KNOWN_AUTHORITIES = Object.freeze([
  { path: 'assets/ships/parts/parts_manifest.json', role: 'source lifecycle and runtime slots' },
  { path: 'assets/ships/release/release_manifest.json', role: 'source-to-release rows and declared byte counts' },
  { path: 'src/render/renderPackageManifest.js', role: 'runtime render-package source routes' },
  { path: 'src/data/modelTruthCensus.json', role: 'live solid GLB census' },
  { path: 'scripts/lib/releasePackaging.mjs', role: 'release copy roots and projection rules' },
]);
const ASSET_FAMILY_GUIDANCE = Object.freeze([
  {
    id: 'physical-world',
    roots: ['ships', 'works', 'models', 'places', 'characters', 'wreck-court', 'reactive-matter', 'spectrum'],
    firstReuse: 'Compose a playable job from the existing hull, station, worksite, asset-bank and aftermath owners. Use registered motion banks for actor state.',
    upgradeWhen: 'Add or repair the smallest silhouette, collider, interaction anchor or readable state the live scene cannot supply.',
  },
  {
    id: 'interface-and-identity',
    roots: ['ui', 'portraits', 'brand', 'intro', 'store'],
    firstReuse: 'Use ORRERY surfaces, portrait and faction registries, Codex plates, existing icons, fonts and screen backdrops.',
    upgradeWhen: 'Repair a real live-screen gap or stale derivative; keep controls usable when optional media is absent.',
  },
  {
    id: 'audio',
    roots: ['audio'],
    firstReuse: 'Connect existing arrival, work, impact, comms, voice and music assets to the scene action and its aftermath.',
    upgradeWhen: 'Add only a missing causal transition or voice line; preserve speech priority and sound settings.',
  },
  {
    id: 'space-and-cinematics',
    roots: ['background', 'cinematics'],
    firstReuse: 'Reuse the sector sky, surface and intro media that already orient the player and establish the place.',
    upgradeWhen: 'Correct a visible scale, depth, repetition or story-state mismatch in its actual route.',
  },
  {
    id: 'effects',
    roots: ['fx', 'vfx'],
    firstReuse: 'Use the existing renderer and VFX owners for readable thrust, impact, fracture and environmental response.',
    upgradeWhen: 'Add the missing causal cue while preserving authored quality and reduced-motion behavior.',
  },
  {
    id: 'references-and-production',
    roots: ['third_party', 'reference', 'concept', 'animation-references', 'incubator'],
    firstReuse: 'Keep donor art, editable sources, release output and evidence attached to their current purpose and provenance.',
    upgradeWhen: 'Promote a specific needed component through its existing manifest and runtime owner.',
  },
]);

function rel(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/');
}

function fromRepoPath(pathValue) {
  const normalized = String(pathValue || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null;
  const absolute = resolve(ROOT, normalized);
  const local = relative(ROOT, absolute).replace(/\\/g, '/');
  if (local === '..' || local.startsWith('../')) return null;
  return rel(absolute);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolve(ROOT, filePath), 'utf8'));
}

function walkFiles(directory, output = []) {
  if (!existsSync(directory)) return output;
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    const stat = lstatSync(fullPath);
    if (stat.isDirectory() && !stat.isSymbolicLink()) walkFiles(fullPath, output);
    else output.push({ path: rel(fullPath), absolutePath: fullPath, stat });
  }
  return output;
}

function addToMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  const rows = map.get(key);
  if (!rows.some((row) => JSON.stringify(row) === JSON.stringify(value))) rows.push(value);
}

function stripComments(source) {
  const noBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlocks.split('\n').map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return '';
    const comment = line.indexOf('//');
    return comment >= 0 ? line.slice(0, comment) : line;
  }).join('\n');
}

function assetFamily(assetPath) {
  const parts = assetPath.split('/');
  const directories = parts.slice(1, -1);
  if (assetPath.startsWith('assets/ships/release/parts/')) return 'ships/release/' + (parts[4] || 'other');
  if (assetPath.startsWith('assets/ships/parts/')) return 'ships/source/' + (parts[3] || 'other');
  if (assetPath.startsWith('assets/ships/release/render-packages/')) return 'ships/render-packages/' + (parts[4] || 'other');
  if (assetPath.startsWith('assets/ships/')) return 'ships/' + (directories[1] || 'root');
  if (assetPath.startsWith('assets/works/')) return 'works/' + (directories[1] || 'root');
  if (assetPath.startsWith('assets/ui/generated/')) return 'ui/generated/' + (directories[2] || 'root');
  if (assetPath.startsWith('assets/background/')) return 'background/' + (directories[1] || 'root');
  return directories.length ? directories.slice(0, Math.min(directories.length, 3)).join('/') : 'root';
}

function assetRoot(assetPath) {
  const parts = assetPath.split('/');
  return parts.length > 2 ? parts[1] : 'root';
}

function lexicalClass(assetPath) {
  const lower = assetPath.toLowerCase();
  if (/(^|\/)(evidence|captures?|screenshots?|reports?)(\/|$)/.test(lower)) return 'evidence';
  if (/(^|\/)(concept|reference|third_party|animation-references)(\/|$)/.test(lower)) return 'reference';
  if (/(^|\/)(legacy|archive|archived|superseded|retired|old)(\/|$)/.test(lower)
      || /(?:^|[_-])(legacy|archived|superseded|retired)(?:[_-]|\.)/.test(basename(lower))) return 'legacy';
  if (/(^|\/)(source|sources|forge|preview|incubator|foundry|candidates?)(\/|$)/.test(lower)
      || lower.startsWith('assets/ships/parts/')
      || lower.startsWith('assets/works/')) return 'source';
  if (lower.startsWith('assets/ships/release/')) return 'release';
  return 'needs_triage';
}

function classifyAsset(assetPath, facts) {
  if (facts.runtimeRefs.length || facts.currentUses.length) return 'runtime';
  if (facts.releaseRows.length || assetPath.startsWith('assets/ships/release/')) return 'release';
  return lexicalClass(assetPath);
}

function readGlbJson(assetPath) {
  const absolutePath = resolve(ROOT, assetPath);
  const fd = openSync(absolutePath, 'r');
  try {
    const header = Buffer.alloc(20);
    const headerBytes = readSync(fd, header, 0, header.length, 0);
    if (headerBytes < 20 || header.toString('ascii', 0, 4) !== 'glTF') {
      return { structuralStatus: 'invalid_header', error: 'Missing or truncated GLB header' };
    }
    const version = header.readUInt32LE(4);
    const totalLength = header.readUInt32LE(8);
    const jsonLength = header.readUInt32LE(12);
    const jsonType = header.readUInt32LE(16);
    if (version !== 2 || jsonType !== 0x4e4f534a || jsonLength > totalLength - 20) {
      return { structuralStatus: 'invalid_json_chunk_header', version, totalLength, jsonLength };
    }
    const jsonBuffer = Buffer.alloc(jsonLength);
    const jsonBytes = readSync(fd, jsonBuffer, 0, jsonLength, 20);
    if (jsonBytes !== jsonLength) {
      return { structuralStatus: 'truncated_json_chunk', version, totalLength, jsonLength };
    }
    const jsonText = jsonBuffer.toString('utf8').replace(/[\u0000\u0020]+$/g, '');
    let document;
    try {
      document = JSON.parse(jsonText);
    } catch (error) {
      return { structuralStatus: 'invalid_json', version, totalLength, jsonLength, error: error.message };
    }
    const meshes = document.meshes || [];
    const primitives = meshes.reduce((total, mesh) => total + (mesh.primitives || []).length, 0);
    const names = (document.nodes || []).map((node) => node.name).filter((name) => typeof name === 'string' && name.length);
    const nameCounts = new Map();
    for (const name of names) nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    const duplicateNodeNames = [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name, count]) => ({ name, count }));
    const externalUris = [];
    for (const [kind, rows] of [['buffer', document.buffers || []], ['image', document.images || []]]) {
      for (const row of rows) {
        if (!row?.uri || row.uri.startsWith('data:')) continue;
        const uri = row.uri.split(/[?#]/, 1)[0];
        const local = resolve(dirname(absolutePath), decodeURIComponent(uri));
        const outside = relative(ROOT, local).replace(/\\/g, '/');
        const localPath = outside === '..' || outside.startsWith('../') ? null : rel(local);
        externalUris.push({ kind, uri: row.uri, path: localPath, exists: existsSync(local), remote: /^https?:/i.test(row.uri) });
      }
    }
    return {
      structuralStatus: 'json_chunk_parsed',
      version,
      totalLength,
      jsonLength,
      sceneCount: (document.scenes || []).length,
      nodeCount: (document.nodes || []).length,
      namedNodeCount: names.length,
      duplicateNodeNames,
      semanticNodeCount: names.filter((name) => /^(SOCKET_|HOOK_|MOUNT_|LOD)/i.test(name)).length,
      meshCount: meshes.length,
      primitiveCount: primitives,
      materialCount: (document.materials || []).length,
      textureCount: (document.textures || []).length,
      imageCount: (document.images || []).length,
      animationCount: (document.animations || []).length,
      accessorCount: (document.accessors || []).length,
      extensionsUsed: document.extensionsUsed || [],
      extensionsRequired: document.extensionsRequired || [],
      extrasKeys: document.extras && typeof document.extras === 'object' ? Object.keys(document.extras) : [],
      externalUris,
    };
  } catch (error) {
    return { structuralStatus: 'read_error', error: error.message };
  } finally {
    closeSync(fd);
  }
}

function parseRuntimePilots() {
  const source = readFileSync(resolve(ROOT, 'src/render/renderPackageManifest.js'), 'utf8');
  const match = source.match(/const PILOTS = (\[[\s\S]*?\]);/);
  if (!match) throw new Error('Could not parse generated render-package pilot table');
  return JSON.parse(match[1]);
}

function parseModelTruthRows() {
  const dataPath = resolve(ROOT, 'src/data/modelTruthCensus.json');
  return existsSync(dataPath) ? (readJson('src/data/modelTruthCensus.json').rows || []) : [];
}

function manifestAssetCandidates(value, manifestPath) {
  if (typeof value !== 'string' || !MEDIA_EXTENSIONS.has(extname(value.split(/[?#]/, 1)[0]).toLowerCase())) return [];
  if (/^(data:|https?:|blob:|\/\/)/i.test(value)) return [];
  const normalized = value.replace(/\\/g, '/');
  const candidates = [];
  if (normalized.startsWith('assets/')) candidates.push(normalized);
  else candidates.push(join(dirname(manifestPath), normalized).replace(/\\/g, '/'));
  for (const candidate of candidates) {
    const resolved = fromRepoPath(candidate);
    if (resolved && existsSync(resolve(ROOT, resolved))) return [resolved];
  }
  return normalized.startsWith('assets/') ? [fromRepoPath(normalized)].filter(Boolean) : [];
}

function collectManifestStrings(value, manifestPath, owners, missing, context = {}, depth = 0) {
  if (depth > 24 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectManifestStrings(item, manifestPath, owners, missing, { ...context, index }, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;
  const ownerId = value.assetId || value.id || value.key || value.name || context.ownerId || null;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && /(?:file|path|url|uri|texture|image|source|release|asset)/i.test(key)) {
      const resolved = manifestAssetCandidates(child, manifestPath);
      for (const assetPath of resolved) {
        addToMap(owners, assetPath, { path: manifestPath, authority: 'manifest-declaration', relation: key, ownerId });
      }
      if (!resolved.length && child.replace(/\\/g, '/').startsWith('assets/')
          && MEDIA_EXTENSIONS.has(extname(child).toLowerCase())) {
        missing.push({ manifest: manifestPath, ownerId, field: key, declaredPath: child });
      }
    }
    collectManifestStrings(child, manifestPath, owners, missing, { ...context, ownerId, field: key }, depth + 1);
  }
}

function runCheck(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [resolve(ROOT, scriptPath), ...args], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  return {
    command: 'node ' + scriptPath + (args.length ? ' ' + args.join(' ') : ''),
    exitCode: result.status ?? 1,
    passed: result.status === 0,
    stdout,
    stderr,
    output: [stdout, stderr].filter(Boolean).join('\n'),
  };
}

function sourceFilesForRuntimeReferences() {
  const found = [];
  for (const directory of ['src', 'styles']) {
    for (const entry of walkFiles(resolve(ROOT, directory))) {
      if (!/\.(?:m?js|css)$/i.test(entry.path)) continue;
      if (entry.path === 'src/contracts/assetValidation.js'
          || entry.path === 'src/data/modelTruthCensus.generated.js') continue;
      found.push(entry);
    }
  }
  return found;
}

function oneLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function makeMarkdown(data) {
  const lines = [];
  const summary = data.summary;
  const checks = data.existingChecks;
  const parts = data.canonicalInventories.partsManifest;
  const classificationOrder = ['runtime', 'release', 'source', 'reference', 'evidence', 'legacy', 'needs_triage'];
  lines.push('# SpaceFace Asset Stocktake', '');
  lines.push('This snapshot inventories every file under assets/ and the external runtime-support roots named by the release packager. It connects assets to existing canonical ownership, runtime maps, package readiness, and lightweight GLB structure. It is descriptive; current manifests and checks remain authoritative.', '');
  lines.push('Generated: ' + data.generatedAt + '.', '');
  lines.push('## What is available', '');
  lines.push('| Surface | Current result |', '|---|---|');
  lines.push('| Asset tree | ' + summary.assetFileCount.toLocaleString('en-US') + ' files; ' + data.summary.assetMiB.toFixed(1) + ' MiB |');
  lines.push('| GLB metadata | ' + data.glbInspection.count.toLocaleString('en-US') + ' inspected; ' + data.glbInspection.parsed.toLocaleString('en-US') + ' JSON chunks parsed; ' + data.glbInspection.withMissingExternalResources + ' with missing external resources |');
  lines.push('| Source parts | ' + parts.rowCount + ' tracked rows; ' + parts.runtimeSlotEntryCount + ' runtime-slot entries |');
  lines.push('| Released asset rows | ' + data.canonicalInventories.releaseManifest.rowCount + ' source-to-release rows |');
  lines.push('| Render-package routes | ' + data.canonicalInventories.renderPackages.rowCount + ' pilots; ' + data.canonicalInventories.renderPackages.readyCount + ' metadata and payload pairs present |');
  lines.push('| Direct runtime refs | ' + checks.reachability.referencedAssetCount + ' assets; ' + checks.reachability.retailRoutableReferenceCount + ' retail-routable |');
  lines.push('| External runtime roots | ' + data.externalRoots.map((root) => root.path + ' (' + root.fileCount + ')').join(', ') + ' |');
  lines.push('| Classification coverage | ' + summary.assetFileCount.toLocaleString('en-US') + ' files labeled; 0 unclassified; ' + summary.needsTriageAssetCount.toLocaleString('en-US') + ' need a more specific route or lifecycle label |');
  lines.push('', '### Existing checks on this snapshot', '');
  lines.push('| Check | Result |', '|---|---|');
  lines.push('| check:asset-status | ' + (checks.assetStatus.passed ? 'PASS' : 'FAIL') + ' — ' + oneLine(checks.assetStatus.output) + ' |');
  lines.push('| check:asset-reachability | ' + (checks.reachability.passed ? 'PASS' : 'FAIL') + ' — ' + checks.reachability.referencedAssetCount + '/' + checks.reachability.retailRoutableReferenceCount + ' routable, ' + checks.reachability.issues.length + ' issues |');
  lines.push('| render-package coverage | ' + (checks.renderPackageCoverage.passed ? 'PASS' : 'FAIL') + ' — ' + oneLine(checks.renderPackageCoverage.output) + ' |');
  lines.push('', 'The package and reachability checks answer file and routing questions. They do not establish visual acceptance. GLB inspection read only each GLB JSON chunk and never opened a renderer; every asset row therefore keeps visualAcceptance at not_assessed.', '');
  lines.push('## Use, reuse and upgrade by family', '');
  lines.push('Every file has a path family and a classification. needs_triage means no stronger live-route, release, source, reference, legacy or evidence label was supported by the inspected records; it does not mean unused. A copy-all bundle root also does not prove player-visible use.', '');
  lines.push('| Family | Files and direct routes | First reuse | Upgrade when |', '|---|---|---|---|');
  for (const guide of data.familyGuidance) {
    const roots = guide.roots.map((root) => root === 'root' ? 'assets root-level files' : 'assets/' + root).join(', ');
    const size = (guide.bytes / 1024 / 1024).toFixed(1) + ' MiB';
    const routing = guide.explicitlyMappedFileCount + ' mapped; ' + guide.packageAddressableFileCount + ' package routes; ' + guide.needsTriageFileCount + ' need triage';
    lines.push('| ' + roots + ' (' + guide.fileCount.toLocaleString('en-US') + ', ' + size + ') | ' + routing + ' | ' + guide.firstReuse + ' | ' + guide.upgradeWhen + ' |');
  }
  lines.push('', 'The [Luna workflows for the complete player moment](../asset-experience-program/ASSET_EXPERIENCE_PROGRAM.md#8-luna-workflows-for-the-complete-player-moment) own scene selection, worker briefs, validation and dispatch. Use the inventory to find stock and owners; keep new work inside those existing lanes.', '');
  lines.push('## Live scene dressing maps', '');
  lines.push('The JSON preserves every ID, role, route and selection rule. Use these exact maps when they fit the scene.', '');
  lines.push('### Everyday space kit', '');
  lines.push('The live EVERYDAY_SPACE_KIT_LEGAL_MODELS map contains ' + data.reuseMaps.everydaySpaceKit.modelCount + ' IDs. It supplies cargo, service, law, mining, civic, and salvage dressing around stations, lanes, work sites, and wrecks. Sector and anchor filters choose the subset at runtime. For salvage scenery, place_power_skid_patched already routes to assets/ships/release/parts/places/place_power_skid_patched.glb.', '');
  lines.push('### Wreck and aftermath', '');
  lines.push('The live WRECK_AFTERMATH_MODELS map contains ' + data.reuseMaps.wreckAftermath.modelCount + ' release URLs: ' + data.reuseMaps.wreckAftermath.liveCount + ' live rows and ' + data.reuseMaps.wreckAftermath.sourceTwinCount + ' source-twin rows. It provides family-specific debris, fragments, torn ship components, and damaged hero hulls. Reuse authored-down place_aftermath_frag_grating_sheet_authored_down or place_aftermath_wreck_corvette_forward__stripped_heavy for routine field dressing; each row carries spawn eligibility and family shedding rules.', '');
  lines.push('### Whole-ship candidates', '');
  lines.push('The parts manifest has ' + data.candidatePools.integrationCandidates.length + ' integration_candidate whole ships. Consider them before authoring another fleet role, subject to normal Forge look review and runtime assignment. The blocked wholeship_pelican source has a pelican_production_v1 integration candidate; wholeship_wasp_production_v1 is accepted at assets/ships/release/parts/wholeships/wasp_production_v1.glb.', '');
  lines.push('## Motion banks and baked GLB clips', '');
  lines.push('Render-package metadata declares ' + data.scriptDrivenMotion.packageLinkCount + ' motion-bank links to ' + data.scriptDrivenMotion.uniqueBankCount + ' unique banks; ' + data.scriptDrivenMotion.localFileCount + ' referenced bank files are present and ' + data.scriptDrivenMotion.missingLocalFileCount + ' local references are missing. The JSON lists package, rig, bank path, clips and bindings. Runtime loading and state-driven binding belong to ' + data.scriptDrivenMotion.loaderOwner + ' and ' + data.scriptDrivenMotion.bindingOwner + '.', '');
  lines.push('The GLB JSON chunks contain ' + data.glbInspection.withAnimations + ' files with baked animation and ' + data.glbInspection.animationClipOccurrences + ' clip occurrences across those files. ' + data.glbInspection.note, '');
  lines.push('## Unready and unresolved assets', '');
  lines.push('The parts manifest marks ' + data.candidatePools.blockedParts.length + ' source GLBs blocked: wholeship_pelican at assets/ships/parts/wholeships/pelican.glb and wholeship_wasp at assets/ships/parts/wholeships/wasp.glb. Both are accessory-only exports without a Material_Hull body. Do not route either as a complete ship. Other components may be donor material only after inspecting the actual parts and choosing a separate valid body.', '');
  lines.push('The source lifecycle field has a token on ' + parts.lifecycleTokenCount + ' of ' + parts.rowCount + ' rows: ' + Object.entries(parts.statusCounts).filter(([status]) => status !== 'no_token').map(([status, count]) => status + ' ' + count).join(', ') + '. The other ' + data.candidatePools.untokenedPartCount + ' rows have no lifecycle token. That field describes source-process status and does not override release rows, package routing, or gameplay maps; a missing token is not a failure verdict.', '');
  lines.push('There are ' + data.candidatePools.glbWithoutPositiveMapCount + ' GLBs with no exact current-use or package URL in the inspected maps. They are candidates for reuse or dynamic-loader tracing, not confirmed orphans: ID-built paths and procedural selection are not ruled out by string search. Each JSON row carries known owners and selection status for targeted follow-up.', '');
  lines.push('Classification counts: ' + classificationOrder.map((name) => name + ' ' + (summary.assetClassificationCounts[name] || 0).toLocaleString('en-US')).join(', ') + '.', '');
  lines.push('## Missing assets and interpretation', '');
  lines.push('This snapshot found ' + data.missingAssets.length + ' missing files declared by canonical source, release, package, generic manifest, or GLB URI records. ' + (data.missingAssets.length === 0 ? 'The inspected runtime file contracts currently identify no required missing asset.' : 'Exact declarations appear under missingAssets in the JSON.') + ' That does not imply every possible scene has all desired art; a missing art request needs a gameplay role before it can be called genuinely missing.', '');
  lines.push('The index does not hash files. Byte reconciliation compares present files with manifest-declared sizes. A none_observed runtime route means no exact route was resolved; it never means unused. Technical readiness records presence and structure only. Visual acceptance needs the real game picture at the gameplay camera.', '');
  lines.push('## Inventory file', '');
  lines.push('ASSET_STOCKTAKE.json contains one row per file under assets/, plus every file under the external runtime roots vendor/addons/libs and src/data/scenarios. Each row records bytes, family, classification basis, canonical owners, explicit runtime references, current gameplay uses, distribution route, GLB metadata where applicable, and technical readiness. It also includes complete family and extension counts, package routes, motion-bank links, lifecycle rows, missing declarations, and the full 46-model and 45-model reuse maps.', '');
  return lines.join('\n');
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function groupedSummary(rows, selector) {
  const grouped = new Map();
  for (const row of rows) {
    const key = selector(row);
    if (!grouped.has(key)) grouped.set(key, { family: key, fileCount: 0, bytes: 0, classifications: {} });
    const group = grouped.get(key);
    group.fileCount++;
    group.bytes += row.bytes || 0;
    group.classifications[row.classification] = (group.classifications[row.classification] || 0) + 1;
  }
  return [...grouped.values()].sort((a, b) => a.family.localeCompare(b.family));
}

function main() {
  const assetFiles = walkFiles(resolve(ROOT, 'assets'));
  const packagingSource = readFileSync(resolve(ROOT, 'scripts/lib/releasePackaging.mjs'), 'utf8');
  const packageRoots = [...packagingSource.matchAll(/source:\s*'([^']+)'/g)].map((match) => match[1]);
  const externalRoots = packageRoots.filter((root) => !root.startsWith('assets/') && root !== 'styles');
  const externalFiles = externalRoots.flatMap((root) => walkFiles(resolve(ROOT, root)));
  const inventoryByPath = new Map(assetFiles.map((entry) => [entry.path, entry]));
  const ownerMap = new Map();
  const runtimeRefMap = new Map();
  const currentUseMap = new Map();
  const missingAssets = [];
  const addOwner = (assetPath, owner) => addToMap(ownerMap, fromRepoPath(assetPath), owner);
  const addRuntimeRef = (assetPath, reference) => addToMap(runtimeRefMap, fromRepoPath(assetPath), reference);
  const addCurrentUse = (assetPath, use) => addToMap(currentUseMap, fromRepoPath(assetPath), use);

  const partsManifest = readJson('assets/ships/parts/parts_manifest.json');
  const releaseManifest = readJson('assets/ships/release/release_manifest.json');
  const statusCounts = {};
  const partsByFile = new Map();
  for (const part of partsManifest.parts || []) {
    const sourcePath = fromRepoPath('assets/ships/parts/' + part.file);
    partsByFile.set(sourcePath, part);
    if (!sourcePath || !existsSync(resolve(ROOT, sourcePath))) {
      missingAssets.push({
        path: sourcePath,
        authority: 'assets/ships/parts/parts_manifest.json',
        ownerId: part.id,
        relation: 'source',
        issue: 'missing_file',
      });
    }
    const token = part.status || 'no_token';
    statusCounts[token] = (statusCounts[token] || 0) + 1;
    const runtimeSlots = Object.entries(partsManifest.runtimeSlots || {})
      .filter(([, files]) => files.includes(part.file)).map(([slot]) => slot);
    addOwner(sourcePath, {
      path: 'assets/ships/parts/parts_manifest.json',
      authority: 'parts-manifest',
      relation: 'source',
      ownerId: part.id,
      category: part.category || null,
      lifecycleToken: part.status || null,
      statusNote: part.statusNote || null,
      runtimeSlots,
    });
  }

  const releaseRows = releaseManifest.assets || [];
  const releaseByPath = new Map();
  const releaseByteMismatches = [];
  for (const row of releaseRows) {
    const sourcePath = fromRepoPath(row.source);
    const releasePath = fromRepoPath(row.release);
    const sourcePart = partsByFile.get(sourcePath) || null;
    releaseByPath.set(releasePath, row);
    addOwner(sourcePath, {
      path: 'assets/ships/release/release_manifest.json',
      authority: 'release-manifest',
      relation: 'source',
      ownerId: row.id,
      kind: row.kind || null,
      pairedReleasePath: releasePath,
      sourceBytesDeclared: row.sourceBytes ?? null,
      sourceLifecycleToken: sourcePart?.status || null,
      sourcePartId: sourcePart?.id || null,
      sourceStatusNote: sourcePart?.statusNote || null,
    });
    addOwner(releasePath, {
      path: 'assets/ships/release/release_manifest.json',
      authority: 'release-manifest',
      relation: 'release',
      ownerId: row.id,
      kind: row.kind || null,
      pairedSourcePath: sourcePath,
      releaseBytesDeclared: row.releaseBytes ?? null,
      sourceLifecycleToken: sourcePart?.status || null,
      sourcePartId: sourcePart?.id || null,
      sourceStatusNote: sourcePart?.statusNote || null,
    });
    for (const [pathValue, declaredBytes, relation] of [
      [sourcePath, row.sourceBytes, 'source'],
      [releasePath, row.releaseBytes, 'release'],
    ]) {
      if (!pathValue || !existsSync(resolve(ROOT, pathValue))) {
        missingAssets.push({ path: pathValue, authority: 'assets/ships/release/release_manifest.json', ownerId: row.id, relation, issue: 'missing_file' });
      } else if (Number.isFinite(declaredBytes) && lstatSync(resolve(ROOT, pathValue)).size !== declaredBytes) {
        releaseByteMismatches.push({ path: pathValue, ownerId: row.id, relation, declaredBytes, actualBytes: lstatSync(resolve(ROOT, pathValue)).size });
      }
    }
  }

  const pilots = parseRuntimePilots();
  const pilotBySource = new Map();
  const pilotReadiness = [];
  const motionBankLinks = [];
  for (const pilot of pilots) {
    const sourcePath = fromRepoPath(pilot.sourceUrl);
    pilotBySource.set(sourcePath, pilot);
    const metadataPath = fromRepoPath(pilot.metadataUrl);
    addOwner(sourcePath, {
      path: 'src/render/renderPackageManifest.js',
      authority: 'runtime-render-package-map',
      relation: 'sourceUrl',
      ownerId: pilot.runtimeAssetId,
      pilotKey: pilot.key,
      assetId: pilot.assetId,
      slot: pilot.slot,
      metadataPath,
    });
    addRuntimeRef(sourcePath, { path: 'src/render/renderPackageManifest.js', kind: 'render-package-route', ownerId: pilot.runtimeAssetId, pilotKey: pilot.key });
    addOwner(metadataPath, {
      path: 'src/render/renderPackageManifest.js',
      authority: 'runtime-render-package-map',
      relation: 'metadataUrl',
      ownerId: pilot.runtimeAssetId,
      pilotKey: pilot.key,
      sourcePath,
    });
    let payloadPath = null;
    let metadataPresent = false;
    let payloadPresent = false;
    let metadataError = null;
    let motionBankPath = null;
    let motionBank = null;
    if (metadataPath && existsSync(resolve(ROOT, metadataPath))) {
      metadataPresent = true;
      try {
        const metadata = readJson(metadataPath);
        payloadPath = metadata.render?.uri
          ? fromRepoPath(join(dirname(metadataPath), metadata.render.uri).replace(/\\/g, '/'))
          : null;
        payloadPresent = Boolean(payloadPath && existsSync(resolve(ROOT, payloadPath)));
        const motionRef = metadata.runtime?.motionBank;
        if (motionRef && typeof motionRef.uri === 'string' && motionRef.uri) {
          motionBankPath = fromRepoPath(motionRef.uri);
          const remote = /^https?:\/\//i.test(motionRef.uri);
          const filePresent = Boolean(motionBankPath && existsSync(resolve(ROOT, motionBankPath)));
          if (motionBankPath) {
            addOwner(motionBankPath, {
              path: metadataPath,
              authority: 'runtime-motion-bank-map',
              relation: 'motionBank',
              ownerId: pilot.runtimeAssetId,
              pilotKey: pilot.key,
              rigId: motionRef.rigId || null,
            });
            addRuntimeRef(motionBankPath, {
              path: metadataPath,
              kind: 'render-package-motion-bank',
              ownerId: pilot.runtimeAssetId,
              pilotKey: pilot.key,
            });
          }
          if (!filePresent && !remote) missingAssets.push({
            path: motionBankPath || motionRef.uri,
            authority: metadataPath,
            ownerId: pilot.runtimeAssetId,
            relation: 'motionBank',
            issue: 'missing_file',
          });
          if (filePresent) {
            try {
              const bank = readJson(motionBankPath);
              motionBank = {
                rigId: bank.rigId || null,
                bindingCount: Array.isArray(bank.bindings) ? bank.bindings.length : 0,
                clipCount: Array.isArray(bank.clips) ? bank.clips.length : 0,
              };
            } catch {}
          }
          motionBankLinks.push({
            pilotKey: pilot.key,
            runtimeAssetId: pilot.runtimeAssetId,
            metadataPath,
            uri: motionRef.uri,
            path: motionBankPath,
            remote,
            filePresent,
            declaredRigId: motionRef.rigId || null,
            declaredBytes: Number.isFinite(motionRef.bytes) ? motionRef.bytes : null,
            declaredSha256: motionRef.sha256 || null,
            bank: motionBank,
          });
        }
        if (!payloadPresent) missingAssets.push({
          path: payloadPath, authority: 'src/render/renderPackageManifest.js',
          ownerId: pilot.runtimeAssetId, relation: 'render-payload', issue: 'missing_file',
        });
      } catch (error) {
        metadataError = error.message;
        missingAssets.push({
          path: metadataPath,
          authority: 'src/render/renderPackageManifest.js',
          ownerId: pilot.runtimeAssetId,
          relation: 'metadataUrl',
          issue: 'invalid_metadata_json',
          detail: error.message,
        });
      }
    } else {
      missingAssets.push({
        path: metadataPath, authority: 'src/render/renderPackageManifest.js',
        ownerId: pilot.runtimeAssetId, relation: 'metadataUrl', issue: 'missing_file',
      });
    }
    if (sourcePath && !existsSync(resolve(ROOT, sourcePath))) {
      missingAssets.push({
        path: sourcePath, authority: 'src/render/renderPackageManifest.js',
        ownerId: pilot.runtimeAssetId, relation: 'sourceUrl', issue: 'missing_file',
      });
    }
    pilotReadiness.push({
      key: pilot.key, runtimeAssetId: pilot.runtimeAssetId, assetId: pilot.assetId,
      slot: pilot.slot, sourcePath, metadataPath, payloadPath, metadataPresent, payloadPresent,
      motionBankPath, metadataError,
    });
  }

  const modelTruthRows = parseModelTruthRows();
  for (const row of modelTruthRows) {
    if (typeof row.url !== 'string' || !row.url.startsWith('assets/')) continue;
    const assetPath = fromRepoPath(row.url);
    addOwner(assetPath, {
      path: 'src/data/modelTruthCensus.json',
      authority: 'live-solid-census',
      relation: 'url',
      ownerId: row.id || null,
      family: row.family || null,
    });
    addRuntimeRef(assetPath, { path: 'src/data/modelTruthCensus.json', kind: 'live-solid-census', ownerId: row.id || null });
  }

  for (const model of EVERYDAY_SPACE_KIT_LEGAL_MODELS) {
    addOwner(model.releaseUrl, {
      path: 'src/data/everydaySpaceKitDressing.js',
      authority: 'gameplay-model-registry',
      relation: 'releaseUrl',
      ownerId: model.id,
      family: model.family,
      anchor: model.anchor,
      live: model.live,
    });
    addCurrentUse(model.releaseUrl, {
      map: 'EVERYDAY_SPACE_KIT_LEGAL_MODELS',
      sourcePath: 'src/data/everydaySpaceKitDressing.js',
      id: model.id,
      family: model.family,
      anchor: model.anchor,
      label: model.label,
      currentUse: 'eligible seeded sector dressing; sector and anchor filters choose the instance',
    });
  }

  for (const model of WRECK_AFTERMATH_MODELS) {
    addOwner(model.releaseUrl, {
      path: 'src/data/wreckAftermathDressing.js',
      authority: 'gameplay-model-registry',
      relation: 'releaseUrl',
      ownerId: model.id,
      kind: model.kind,
      family: model.family,
      authoredDown: model.authoredDown,
      live: model.live,
      spawn: model.spawn,
    });
    addCurrentUse(model.releaseUrl, {
      map: 'WRECK_AFTERMATH_MODELS',
      sourcePath: 'src/data/wreckAftermathDressing.js',
      id: model.id,
      kind: model.kind,
      family: model.family,
      grammar: model.grammar,
      live: model.live,
      spawn: model.spawn,
      authoredDown: model.authoredDown,
      currentUse: model.live
        ? (model.spawn ? 'live seeded wreck or aftermath dressing pool' : 'live route retained, excluded from ordinary spawning by pool policy')
        : 'source twin retained for provenance, not in the live spawn pool',
    });
  }

  const runtimeSourceFiles = [];
  for (const directory of ['src', 'styles']) {
    for (const entry of walkFiles(resolve(ROOT, directory))) {
      if (!/\.(?:m?js|css)$/i.test(entry.path)) continue;
      if (entry.path === 'src/contracts/assetValidation.js'
          || entry.path === 'src/data/modelTruthCensus.generated.js') continue;
      runtimeSourceFiles.push(entry);
    }
  }
  for (const entry of runtimeSourceFiles) {
    const source = stripComments(readFileSync(entry.absolutePath, 'utf8'));
    for (const match of source.match(ASSET_REFERENCE_RE) || []) {
      addRuntimeRef(match, { path: entry.path, kind: 'literal-runtime-asset-url' });
    }
  }

  const manifestLikeFiles = assetFiles.filter((entry) => (
    extname(entry.path).toLowerCase() === '.json'
      && /(?:manifest|catalog|inventory|selection|asset[-_]map)/i.test(basename(entry.path))
      && !IGNORED_MANIFESTS.has(entry.path)
      && entry.stat.size <= 4 * 1024 * 1024
  ));
  const genericManifestOwners = new Map();
  const missingManifestFiles = [];
  const manifestParseErrors = [];
  for (const entry of manifestLikeFiles) {
    try {
      collectManifestStrings(readJson(entry.path), entry.path, genericManifestOwners, missingManifestFiles);
    } catch (error) {
      manifestParseErrors.push({ path: entry.path, error: error.message });
    }
  }
  for (const [assetPath, owners] of genericManifestOwners) {
    for (const owner of owners) addOwner(assetPath, owner);
  }
  for (const missing of missingManifestFiles) missingAssets.push({
    ...missing, authority: missing.manifest, issue: 'declared_path_missing',
  });

  const packageRootMembership = (assetPath) => packageRoots
    .filter((root) => assetPath === root || assetPath.startsWith(root + '/'))
    .map((root) => ({ root, projection: root === 'assets/ships/release' ? 'render-package-source-projection' : 'copy-all' }));
  const glbEntries = assetFiles.filter((entry) => extname(entry.path).toLowerCase() === '.glb');
  const glbMetadata = new Map(glbEntries.map((entry) => [entry.path, readGlbJson(entry.path)]));
  for (const entry of glbEntries) {
    for (const resource of glbMetadata.get(entry.path).externalUris || []) {
      if (resource.path && resource.exists) {
        addOwner(resource.path, { path: entry.path, authority: 'glb-external-resource', relation: resource.kind, uri: resource.uri });
      } else if (!resource.remote) {
        missingAssets.push({
          path: resource.path, authority: entry.path, relation: resource.kind,
          declaredPath: resource.uri, issue: 'missing_glb_external_resource',
        });
      }
    }
  }

  const allFileEntries = [...assetFiles, ...externalFiles];
  const items = allFileEntries.map((entry) => {
    const assetPath = entry.path;
    const owners = ownerMap.get(assetPath) || [];
    const runtimeRefs = runtimeRefMap.get(assetPath) || [];
    const currentUses = currentUseMap.get(assetPath) || [];
    const releaseOwners = owners.filter((owner) => owner.authority === 'release-manifest');
    const packageOwner = owners.find((owner) => owner.authority === 'runtime-render-package-map' && owner.relation === 'sourceUrl');
    const partOwners = owners.filter((owner) => owner.authority === 'parts-manifest');
    const glb = glbMetadata.get(assetPath) || null;
    const pathClass = lexicalClass(assetPath);
    const packageRootsForFile = packageRootMembership(assetPath);
    const isAsset = assetPath.startsWith('assets/');
    const classification = isAsset ? classifyAsset(assetPath, { runtimeRefs, currentUses, releaseRows: releaseOwners }) : 'runtime';
    const pilot = packageOwner ? pilots.find((item) => item.key === packageOwner.pilotKey) : null;
    const pilotState = pilot ? pilotReadiness.find((row) => row.key === pilot.key) : null;
    const packageStatus = pilot
      ? (pilotState?.metadataPresent && pilotState?.payloadPresent ? 'metadata_and_payload_present' : 'package_route_incomplete')
      : 'no_render_package_route_observed';
    const sourceLifecycle = partOwners.map((owner) => owner.lifecycleToken).find(Boolean)
      || owners.map((owner) => owner.sourceLifecycleToken).find(Boolean)
      || null;
    let runtimeState = 'none_observed';
    if (currentUses.length) runtimeState = 'current_gameplay_map';
    else if (runtimeRefs.some((reference) => reference.kind === 'live-solid-census')) runtimeState = 'live_solid_census';
    else if (runtimeRefs.some((reference) => reference.kind === 'render-package-route')) runtimeState = 'package_addressable';
    else if (runtimeRefs.length) runtimeState = 'explicit_runtime_reference';
    else if (packageRootsForFile.length) runtimeState = 'bundled_root_dynamic_selection_unknown';
    const candidatePools = [];
    if (sourceLifecycle === 'blocked') candidatePools.push('blocked_source_part');
    if (sourceLifecycle === 'integration_candidate') candidatePools.push('source_integration_candidate');
    if (isAsset && assetPath.startsWith('assets/ships/release/') && !releaseOwners.length) candidatePools.push('release_tree_file_not_in_release_manifest');
    if (isAsset && assetPath.endsWith('.glb') && !owners.length && !runtimeRefs.length) candidatePools.push('unowned_glb_candidate');
    if (pathClass === 'legacy') candidatePools.push('legacy_path_signal');
    if (pathClass === 'reference') candidatePools.push('reference_donor_pool');
    if (pathClass === 'evidence') candidatePools.push('evidence_pool');
    return {
      path: assetPath,
      fileKind: entry.stat.isSymbolicLink() ? 'symlink' : 'file',
      bytes: entry.stat.isFile() ? entry.stat.size : null,
      extension: extname(assetPath).toLowerCase() || '(none)',
      family: isAsset ? assetFamily(assetPath) : 'external/' + assetPath.split('/').slice(0, 2).join('/'),
      classification,
      classificationBasis: !isAsset ? ['release packager copy root']
        : currentUses.length ? ['gameplay model registry']
        : runtimeRefs.length ? ['exact source or runtime map reference']
          : releaseOwners.length ? ['release manifest'] : [pathClass],
      distribution: {
        bundleRoots: packageRootsForFile,
        packageRoute: pilot ? {
          pilotKey: pilot.key, runtimeAssetId: pilot.runtimeAssetId, slot: pilot.slot, status: packageStatus,
        } : null,
      },
      canonicalOwners: owners,
      runtimeUse: {
        status: runtimeState,
        exactReferences: runtimeRefs,
        currentGameplayUses: currentUses,
        interpretation: runtimeState === 'none_observed' || runtimeState === 'bundled_root_dynamic_selection_unknown'
          ? 'No exact current-use route was resolved from inspected maps; dynamic ID/path construction remains unknown. This is not evidence that the file is unused.'
          : null,
      },
      sourceLifecycle: sourceLifecycle ? {
        token: sourceLifecycle,
        partId: partOwners.find((owner) => owner.lifecycleToken)?.ownerId
          || owners.find((owner) => owner.sourcePartId)?.sourcePartId || null,
        statusNote: partOwners.find((owner) => owner.statusNote)?.statusNote
          || owners.find((owner) => owner.sourceStatusNote)?.sourceStatusNote || null,
      } : null,
      technicalReadiness: {
        filePresent: true,
        releaseRows: releaseOwners.map((owner) => owner.ownerId),
        releaseManifestBytes: releaseOwners.map((owner) => ({
          ownerId: owner.ownerId,
          relation: owner.relation,
          declaredBytes: owner.relation === 'source' ? owner.sourceBytesDeclared : owner.releaseBytesDeclared,
          actualBytes: entry.stat.isFile() ? entry.stat.size : null,
        })),
        packageRouteStatus: packageStatus,
        glbStructure: glb?.structuralStatus || null,
        glbExternalResources: glb?.externalUris || [],
        visualAcceptance: 'not_assessed',
      },
      candidatePools,
      glb,
    };
  });

  const assetRows = items.filter((item) => item.path.startsWith('assets/'));
  const externalAssetRows = items.filter((item) => !item.path.startsWith('assets/'));
  const glbRows = assetRows.filter((item) => item.glb);
  const familySummary = groupedSummary(assetRows, (item) => item.family);
  const extensionSummary = groupedSummary(assetRows, (item) => item.extension);
  const knownFamilyRoots = new Set(ASSET_FAMILY_GUIDANCE.flatMap((guide) => guide.roots));
  const allAssetRoots = [...new Set(assetRows.map((item) => assetRoot(item.path)))].sort();
  const familyGuidance = ASSET_FAMILY_GUIDANCE
    .map((guide) => ({ ...guide, assets: assetRows.filter((item) => guide.roots.includes(assetRoot(item.path))) }))
    .filter((guide) => guide.assets.length)
    .map((guide) => {
      const rows = guide.assets;
      return {
        id: guide.id,
        roots: guide.roots,
        fileCount: rows.length,
        bytes: rows.reduce((sum, item) => sum + (item.bytes || 0), 0),
        explicitlyMappedFileCount: rows.filter((item) => item.runtimeUse.exactReferences.length || item.runtimeUse.currentGameplayUses.length).length,
        packageAddressableFileCount: rows.filter((item) => Boolean(item.distribution.packageRoute)).length,
        bundledRootOnlyUnknownCount: rows.filter((item) => item.runtimeUse.status === 'bundled_root_dynamic_selection_unknown').length,
        needsTriageFileCount: rows.filter((item) => item.classification === 'needs_triage').length,
        firstReuse: guide.firstReuse,
        upgradeWhen: guide.upgradeWhen,
      };
    });
  const otherAssetRoots = allAssetRoots.filter((root) => !knownFamilyRoots.has(root));
  if (otherAssetRoots.length) {
    const rows = assetRows.filter((item) => otherAssetRoots.includes(assetRoot(item.path)));
    familyGuidance.push({
      id: 'other-roots',
      roots: otherAssetRoots,
      fileCount: rows.length,
      bytes: rows.reduce((sum, item) => sum + (item.bytes || 0), 0),
      explicitlyMappedFileCount: rows.filter((item) => item.runtimeUse.exactReferences.length || item.runtimeUse.currentGameplayUses.length).length,
      packageAddressableFileCount: rows.filter((item) => Boolean(item.distribution.packageRoute)).length,
      bundledRootOnlyUnknownCount: rows.filter((item) => item.runtimeUse.status === 'bundled_root_dynamic_selection_unknown').length,
      needsTriageFileCount: rows.filter((item) => item.classification === 'needs_triage').length,
      firstReuse: 'Follow the exact row owner and runtime route before assigning a new use.',
      upgradeWhen: 'Give the file a named gameplay or presentation role before promoting or replacing it.',
    });
  }
  const motionBanksByPath = new Map();
  for (const link of motionBankLinks) {
    if (!link.path) continue;
    if (!motionBanksByPath.has(link.path)) {
      motionBanksByPath.set(link.path, {
        path: link.path,
        uri: link.uri,
        rigId: link.declaredRigId,
        filePresent: link.filePresent,
        bank: link.bank,
        referencedBy: [],
      });
    }
    motionBanksByPath.get(link.path).referencedBy.push({
      pilotKey: link.pilotKey,
      runtimeAssetId: link.runtimeAssetId,
      metadataPath: link.metadataPath,
    });
  }
  const uniqueMotionBanks = [...motionBanksByPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  const animationRows = glbRows.filter((row) => (row.glb?.animationCount || 0) > 0);
  const statusTokenCount = Object.entries(statusCounts).filter(([key]) => key !== 'no_token').reduce((sum, [, count]) => sum + count, 0);
  const blockedParts = (partsManifest.parts || []).filter((part) => part.status === 'blocked').map((part) => ({
    id: part.id, path: fromRepoPath('assets/ships/parts/' + part.file), statusNote: part.statusNote || null,
  }));
  const integrationCandidates = (partsManifest.parts || []).filter((part) => part.status === 'integration_candidate').map((part) => {
    const sourcePath = fromRepoPath('assets/ships/parts/' + part.file);
    const release = releaseRows.find((row) => fromRepoPath(row.source) === sourcePath);
    const pilot = pilotBySource.get(fromRepoPath(release?.release || ''));
    return {
      id: part.id,
      path: sourcePath,
      releasePath: fromRepoPath(release?.release || ''),
      packagePilotKey: pilot?.key || null,
      packageAddressable: Boolean(pilot),
      recommendation: 'Use only after current look review and normal runtime assignment; candidate lifecycle is not visual acceptance.',
    };
  });
  const untokenedParts = (partsManifest.parts || []).filter((part) => !part.status).map((part) => ({
    id: part.id, path: fromRepoPath('assets/ships/parts/' + part.file), category: part.category || null,
  }));
  const noPositiveMapGlbs = assetRows.filter((item) => item.extension === '.glb'
    && !item.runtimeUse.exactReferences.length
    && !item.runtimeUse.currentGameplayUses.length
    && !item.distribution.packageRoute);
  const legacyRows = assetRows.filter((item) => item.candidatePools.includes('legacy_path_signal'));
  const packageReadyCount = pilotReadiness.filter((row) => row.metadataPresent && row.payloadPresent).length;
  const currentMaps = {
    everydaySpaceKit: EVERYDAY_SPACE_KIT_LEGAL_MODELS.map((model) => ({
      id: model.id, family: model.family, anchor: model.anchor, label: model.label, live: model.live,
      sourceMap: 'src/data/everydaySpaceKitDressing.js',
      releaseUrl: model.releaseUrl,
      currentUse: 'eligible seeded sector dressing; sector and anchor filters select the instance',
    })),
    wreckAftermath: WRECK_AFTERMATH_MODELS.map((model) => ({
      id: model.id, kind: model.kind, family: model.family, grammar: model.grammar,
      live: model.live, spawn: model.spawn, authoredDown: model.authoredDown,
      sourceMap: 'src/data/wreckAftermathDressing.js',
      releaseUrl: model.releaseUrl,
      currentUse: model.live
        ? (model.spawn ? 'live seeded wreck or aftermath dressing pool' : 'live route retained, excluded from ordinary spawning by pool policy')
        : 'source twin retained for provenance, not in the live spawn pool',
    })),
  };

  const reachabilityCheck = runCheck('scripts/check-asset-reachability.mjs', ['--json']);
  let reachability = {
    passed: reachabilityCheck.passed, referencedAssetCount: null, retailRoutableReferenceCount: null,
    physicallyBundledReferenceCount: null, packageRoutedReferenceCount: null,
    issues: [{ message: reachabilityCheck.output }],
  };
  try {
    const parsed = JSON.parse(reachabilityCheck.stdout || reachabilityCheck.output);
    reachability = {
      passed: reachabilityCheck.passed && parsed.pass,
      referencedAssetCount: parsed.referencedAssetCount,
      retailRoutableReferenceCount: parsed.retailRoutableReferenceCount,
      physicallyBundledReferenceCount: parsed.physicallyBundledReferenceCount,
      packageRoutedReferenceCount: parsed.packageRoutedReferenceCount,
      issues: parsed.issues || [],
    };
  } catch {}
  const packageCoverageCheck = runCheck('scripts/generate-render-package-pilots.mjs', ['--check']);
  const assetStatusCheck = runCheck('scripts/check-asset-status.mjs');
  const assetBytes = assetRows.reduce((sum, item) => sum + (item.bytes || 0), 0);
  const data = {
    schema: 'spaceface.assetStocktake.v1',
    generatedBy: 'scripts/asset-stocktake.mjs',
    generatedAt: new Date().toISOString(),
    authorityNote: 'Descriptive snapshot only. Canonical manifests, runtime maps, existing checks, and live-render review remain authoritative.',
    method: {
      inventory: 'Every regular file and symlink reached recursively under assets/ is listed; external file rows cover non-assets runtime copy roots from scripts/lib/releasePackaging.mjs.',
      hashes: 'No asset hashing is performed.',
      glb: 'Only the GLB header and first JSON chunk are read; binary payload is not decoded and no renderer is loaded.',
      visualAcceptance: 'Not assessed. GLB structure and package presence cannot substitute for visual review at the gameplay camera.',
      runtimeUnknown: 'No exact route found means unknown, not unused. ID-built paths and other dynamic loaders are not exhaustively evaluated by the literal source scan.',
    },
    sourceAuthorities: KNOWN_AUTHORITIES,
    summary: {
      assetFileCount: assetRows.length,
      assetBytes,
      assetMiB: Number((assetBytes / 1024 / 1024).toFixed(2)),
      externalRuntimeFileCount: externalAssetRows.length,
      externalRuntimeBytes: externalAssetRows.reduce((sum, item) => sum + (item.bytes || 0), 0),
      assetClassificationCounts: countBy(assetRows, (item) => item.classification),
      explicitlyMappedAssetCount: assetRows.filter((item) => item.runtimeUse.exactReferences.length || item.runtimeUse.currentGameplayUses.length).length,
      packageAddressableAssetCount: assetRows.filter((item) => Boolean(item.distribution.packageRoute)).length,
      bundledRootOnlyUnknownCount: assetRows.filter((item) => item.runtimeUse.status === 'bundled_root_dynamic_selection_unknown').length,
      noExactRuntimeMapCount: assetRows.filter((item) => item.runtimeUse.status === 'none_observed').length,
      unownedGlbCandidateCount: assetRows.filter((item) => item.candidatePools.includes('unowned_glb_candidate')).length,
      familyCount: familySummary.length,
      extensionCount: extensionSummary.length,
      liveGameplayMappedModelCount: currentMaps.everydaySpaceKit.length + currentMaps.wreckAftermath.filter((model) => model.live).length,
      needsTriageAssetCount: assetRows.filter((item) => item.classification === 'needs_triage').length,
    },
    canonicalInventories: {
      partsManifest: {
        path: 'assets/ships/parts/parts_manifest.json',
        rowCount: (partsManifest.parts || []).length,
        statusCounts,
        lifecycleTokenCount: statusTokenCount,
        runtimeSlotEntryCount: Object.values(partsManifest.runtimeSlots || {}).reduce((sum, rows) => sum + rows.length, 0),
        runtimeSlots: Object.fromEntries(Object.entries(partsManifest.runtimeSlots || {}).map(([slot, rows]) => [slot, rows.length])),
        note: 'Source lifecycle token is independent from release rows, render-package routing, and current gameplay maps.',
      },
      releaseManifest: {
        path: 'assets/ships/release/release_manifest.json',
        rowCount: releaseRows.length,
        rowsWithExistingSourceAndRelease: releaseRows.filter((row) => existsSync(resolve(ROOT, row.source)) && existsSync(resolve(ROOT, row.release))).length,
        releaseByteMismatches,
      },
      renderPackages: {
        path: 'src/render/renderPackageManifest.js',
        rowCount: pilots.length,
        readyCount: packageReadyCount,
        incomplete: pilotReadiness.filter((row) => !row.metadataPresent || !row.payloadPresent || row.metadataError),
        rows: pilotReadiness,
      },
      liveSolidCensus: {
        path: 'src/data/modelTruthCensus.json',
        rowCount: modelTruthRows.length,
        mappedAssetCount: new Set(modelTruthRows.map((row) => row.url).filter((url) => typeof url === 'string' && url.startsWith('assets/'))).size,
      },
      genericManifestScan: {
        discoveredFiles: manifestLikeFiles.map((entry) => entry.path),
        discoveredFileCount: manifestLikeFiles.length,
        parseErrors: manifestParseErrors,
        declaredMissingPaths: missingManifestFiles,
      },
    },
    existingChecks: {
      assetStatus: assetStatusCheck,
      reachability: { ...reachability, command: reachabilityCheck.command, exitCode: reachabilityCheck.exitCode },
      renderPackageCoverage: packageCoverageCheck,
    },
    externalRoots: externalRoots.map((root) => {
      const rows = externalFiles.filter((entry) => entry.path === root || entry.path.startsWith(root + '/'));
      return { path: root, fileCount: rows.length, totalBytes: rows.reduce((sum, entry) => sum + (entry.stat.isFile() ? entry.stat.size : 0), 0) };
    }),
    bundleRoots: packageRoots.map((root) => ({
      path: root,
      kind: root.startsWith('assets/') ? 'asset-root' : root === 'styles' ? 'stylesheet-root' : 'external-runtime-support',
      projection: root === 'assets/ships/release' ? 'render-package-source-projection' : 'copy-all',
    })),
    glbInspection: {
      count: glbRows.length,
      parsed: glbRows.filter((row) => row.glb?.structuralStatus === 'json_chunk_parsed').length,
      byStatus: countBy(glbRows, (row) => row.glb?.structuralStatus || 'unknown'),
      totalMeshes: glbRows.reduce((sum, row) => sum + (row.glb?.meshCount || 0), 0),
      totalMaterials: glbRows.reduce((sum, row) => sum + (row.glb?.materialCount || 0), 0),
      withAnimations: glbRows.filter((row) => (row.glb?.animationCount || 0) > 0).length,
      animationClipOccurrences: animationRows.reduce((sum, row) => sum + row.glb.animationCount, 0),
      animatedFiles: animationRows.map((row) => ({ path: row.path, animationCount: row.glb.animationCount })),
      withMissingExternalResources: glbRows.filter((row) => (row.glb?.externalUris || []).some((resource) => !resource.exists && !resource.remote)).length,
      structuralWarnings: glbRows.filter((row) => row.glb?.structuralStatus !== 'json_chunk_parsed').map((row) => ({ path: row.path, inspection: row.glb })),
      note: 'GLB JSON structure only: mesh/material/animation/node/extras/extensions and external URI presence. The generic src/render/assetLoader.js route rejects baked clips; alternate render-package parsing and code-driven hooks need their own consumer checks. These counts do not measure gameplay motion or visual acceptance.',
    },
    scriptDrivenMotion: {
      packageLinkCount: motionBankLinks.length,
      uniqueBankCount: uniqueMotionBanks.length,
      localFileCount: uniqueMotionBanks.filter((bank) => bank.filePresent).length,
      missingLocalFileCount: motionBankLinks.filter((link) => !link.filePresent && !link.remote).length,
      uniqueBankClipCount: uniqueMotionBanks.reduce((sum, bank) => sum + (bank.bank?.clipCount || 0), 0),
      uniqueBankBindingCount: uniqueMotionBanks.reduce((sum, bank) => sum + (bank.bank?.bindingCount || 0), 0),
      packageMetadataOwner: 'src/render/renderPackageManifest.js and each listed render-package.json',
      loaderOwner: 'src/render/authoredMotion.js',
      bindingOwner: 'src/contracts/motionBank.js',
      links: motionBankLinks,
      uniqueBanks: uniqueMotionBanks,
      note: 'Package runtime.motionBank references are counted separately from baked glTF animation metadata. The loader pins authored motion-bank bytes and rig identity before binding.',
    },
    reuseMaps: {
      everydaySpaceKit: {
        source: 'src/data/everydaySpaceKitDressing.js',
        modelCount: currentMaps.everydaySpaceKit.length,
        currentUse: 'Seeded ordinary-sector dressing for service, cargo, law, mining, civic, and salvage roles; placement filters use sector and anchor.',
        models: currentMaps.everydaySpaceKit,
      },
      wreckAftermath: {
        source: 'src/data/wreckAftermathDressing.js',
        modelCount: currentMaps.wreckAftermath.length,
        liveCount: currentMaps.wreckAftermath.filter((model) => model.live).length,
        spawnCount: currentMaps.wreckAftermath.filter((model) => model.spawn).length,
        sourceTwinCount: currentMaps.wreckAftermath.filter((model) => !model.live).length,
        currentUse: 'Seeded wreck and aftermath dressing with family-specific debris/fragment tables and explicit spawn eligibility.',
        models: currentMaps.wreckAftermath,
      },
    },
    candidatePools: {
      blockedParts,
      integrationCandidates,
      untokenedPartCount: untokenedParts.length,
      untokenedParts,
      glbWithoutPositiveMapCount: noPositiveMapGlbs.length,
      glbWithoutPositiveMapExamples: noPositiveMapGlbs.slice(0, 100).map((row) => ({
        path: row.path, family: row.family, bytes: row.bytes, canonicalOwners: row.canonicalOwners,
        note: 'No exact current-use/package route observed; dynamic selection remains unknown.',
      })),
      legacyPathSignalCount: legacyRows.length,
      legacyPathSignalExamples: legacyRows.slice(0, 100).map((row) => row.path),
      releaseTreeFilesWithoutReleaseRow: assetRows.filter((row) => row.path.startsWith('assets/ships/release/')
        && !row.canonicalOwners.some((owner) => owner.authority === 'release-manifest')).map((row) => row.path),
      recommendations: [
        'Use the everyday-space-kit registry for service, cargo, law, mining, civic, and salvage set dressing before commissioning more ordinary props.',
        'Use WRECK_AFTERMATH_MODELS for family-matched wreck debris and fragments; honor row live/spawn flags and family shed tables.',
        'Treat integration-candidate whole ships as a reuse pool requiring normal Forge look review and runtime assignment.',
        'Do not route the two blocked accessory-only whole-ship source GLBs as ship bodies; use a sound current hull and inspect any intended donor parts.',
        'Do not label a GLB unused from missing literal matches; investigate only the exact dynamic pool relevant to the feature.',
      ],
    },
    missingAssets,
    releaseByteMismatches,
    familyGuidance,
    familySummary,
    extensionSummary,
    assets: assetRows.map(stripAbsoluteFields),
    externalRuntimeFiles: externalAssetRows.map(stripAbsoluteFields),
  };
  const markdown = makeMarkdown(data);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(data, null, 2) + '\n', 'utf8');
  writeFileSync(MD_OUT, markdown + '\n', 'utf8');
  console.log('asset stocktake wrote ' + rel(JSON_OUT) + ' and ' + rel(MD_OUT));
  console.log(assetRows.length + ' asset files; ' + glbRows.length + ' GLBs inspected; '
    + pilots.length + ' package pilots (' + packageReadyCount + ' ready); '
    + blockedParts.length + ' blocked source parts; ' + missingAssets.length + ' declared missing resources.');
}

function stripAbsoluteFields(item) {
  const { absolutePath, stat, ...rest } = item;
  return rest;
}

main();
