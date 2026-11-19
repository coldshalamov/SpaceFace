import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, join } from 'node:path';
import { RENDER_PACKAGE_PILOTS } from '../../src/render/renderPackageManifest.js';
import { RUCKUS_MESH_ASSETS } from '../../src/render/characters/ruckusMeshData.js';

// A small, append-only review log. The generated index can be refreshed without erasing iterations.
// It groups LODs by manifest runtime ID plus file stem; it never assumes an unpaired file is unused.
const root = '.devshots/fleet/graphics-overhaul-asset-catalog';
const indexPath = `${root}/per-asset-index.json`;
const sourceInventoryPath = `${root}/source-model-inventory.json`;
const durable = 'design/program/fleet/graphics-asset-review';
const eventsDir = `${durable}/iterations`;
const factsDir = `${durable}/facts`;
const coverageStatusPath = `${durable}/coverage-status.json`;
const catalogPath = `${root}/catalog-v2.json`;
const proceduralSeedPath = `${durable}/procedural-seed.json`;
const releasePath = 'assets/ships/release/release_manifest.json';
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const assetFileStem = (id) => `${id.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 64)}-${createHash('sha256').update(id).digest('hex').slice(0, 12)}`;
const eventsPath = (id) => `${eventsDir}/${assetFileStem(id)}.jsonl`;
const factsPath = (id) => `${factsDir}/${assetFileStem(id)}.json`;
const readRows = (path) => !existsSync(path) ? [] : readFileSync(path, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const rows = (id = null) => id ? readRows(eventsPath(id)) : !existsSync(eventsDir) ? []
  : readdirSync(eventsDir).filter((name) => name.endsWith('.jsonl')).sort().flatMap((name) => readRows(`${eventsDir}/${name}`));
const coverageStates = ['pending', 'in progress', 'passed', 'needs follow-up', 'unused/unresolved'];
const stem = (path) => basename(path, extname(path)).replace(/(?:_|-)lod\d+$/i, '');
const lod = (path) => /(?:_|-)lod(\d+)\.glb$/i.exec(path)?.[1] ?? 'primary-or-contained-lods';

function declaredLods(path) {
  let fd;
  try {
    fd = openSync(path, 'r');
    const header = Buffer.alloc(20);
    if (readSync(fd, header, 0, 20, 0) !== 20 || header.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
    const length = header.readUInt32LE(12);
    if (length < 2 || length > 32 * 1024 * 1024) throw new Error('invalid JSON chunk length');
    const json = Buffer.alloc(length);
    if (readSync(fd, json, 0, length, 20) !== length) throw new Error('short JSON chunk');
    const doc = JSON.parse(json.toString('utf8').trim());
    const levels = [...new Set((doc.nodes || []).map((node) => {
      const name = String(node.name || '').toUpperCase().replace(/[\s-]+/g, '_');
      const named = /^LOD([012])(?:_|$)/.exec(name)?.[1];
      const explicit = node.extras?.spaceface?.lod || node.extras?.spacefaceLod;
      return explicit ? String(explicit).toLowerCase().match(/[012]/)?.[0] : named;
    }).filter((level) => level !== undefined))].sort();
    return { levels: levels.map((level) => `lod${level}`), method: 'declared node names/extras; runtime selection unverified' };
  } catch (error) {
    return { levels: [], method: 'unreadable', error: String(error.message || error) };
  } finally { if (fd !== undefined) closeSync(fd); }
}

function buildSourceInventory(models, catalogByFile) {
  const known = new Map(), byStem = new Map();
  for (const model of models) for (const variant of model.variants) {
    for (const role of ['authoring', 'release', 'package', 'runtimeFile']) {
      const representation = variant[role];
      if (!representation?.path) continue;
      const list = known.get(representation.path) || [];
      list.push({ modelId: model.id, role, sha256: representation.sha256 ?? null });
      known.set(representation.path, list);
      const name = stem(representation.path).toLowerCase();
      const ids = byStem.get(name) || new Set(); ids.add(model.id); byStem.set(name, ids);
    }
  }
  const roots = ['assets', 'tools/art', 'tools/blender'];
  const excludedDirectories = [], files = [];
  const modelExtension = /\.(?:glb|gltf|blend\d*|fbx|obj|dae|ply|stl|usd|usda|usdc|usdz|3ds|x3d|3mf)$/i;
  function walk(directory) {
    if (!existsSync(directory)) return;
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, item.name).replace(/\\/g, '/');
      if (item.isSymbolicLink()) { excludedDirectories.push({ path: file, reason: 'symlink not traversed' }); continue; }
      if (item.isDirectory()) {
        if (['node_modules', '.git', '__pycache__', '.cache'].includes(item.name)) {
          excludedDirectories.push({ path: file, reason: 'dependency or generated cache' });
        } else walk(file);
        continue;
      }
      if (!item.isFile() || !modelExtension.test(file)) continue;
      const exact = known.get(file) || [];
      const preview = /(?:^|\/)preview(?:\/|$)/i.test(file);
      const backup = /\.blend\d+$/i.test(file) || /(?:^|\/)(?:backups?|archive)(?:\/|$)/i.test(file);
      const thirdParty = /^assets\/third_party\//i.test(file);
      const assetBank = /^assets\/models\/asset-bank\//i.test(file);
      const reference = /(?:^|\/)(?:reference|references)(?:\/|$)/i.test(file);
      const classification = exact.length ? 'manifest-or-runtime-representation'
        : preview ? 'scratch-preview' : backup ? 'backup-or-archive'
          : thirdParty ? 'third-party-authoring-input' : assetBank ? 'generated-authoring-library'
            : reference ? 'reference-copy'
          : /^assets\/ships\/release\//.test(file) ? 'unmapped-release-tree-model' : 'unmapped-source-model';
      const candidates = exact.length ? [] : [...(byStem.get(stem(file).toLowerCase()) || [])];
      files.push({ path: file, format: extname(file).slice(1).toLowerCase(), classification,
        exactLinks: exact.map(({ modelId, role }) => ({ modelId, role })),
        candidateNameLinks: candidates, candidateNote: candidates.length ? 'Filename match only; linkage and use unverified.' : null,
        sha256: exact.find((entry) => entry.sha256)?.sha256 ?? catalogByFile.get(file)?.sha256 ?? null,
        reachability: exact.length ? 'see-linked-model' : 'unknown' });
    }
  }
  for (const root of roots) walk(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const byClass = {};
  for (const row of files) byClass[row.classification] = (byClass[row.classification] || 0) + 1;
  const unresolved = files.filter((row) => row.exactLinks.length === 0
    && ['unmapped-source-model', 'unmapped-release-tree-model', 'generated-authoring-library', 'third-party-authoring-input'].includes(row.classification)).length;
  const inventoried = new Set(files.map((row) => row.path));
  const unseenKnownPaths = [...known.keys()].filter((path) => !inventoried.has(path));
  return { generatedAt: new Date().toISOString(), roots,
    excludedRootClasses: ['.devshots and other scratch/capture trees', 'node_modules and vendored dependencies', 'build/dist outputs and alternate checkouts'],
    note: 'Files are inventoried, not declared runtime-reachable. Known source/release/package forms are linked by manifest; other links are filename candidates only. Hashes are reused from existing metadata, not recomputed for unknown files.',
    summary: { files: files.length, byClass, unresolved }, unseenKnownPaths, excludedDirectories, files };
}

function coverageVersion(model, facts) {
  const versions = new Map();
  const add = (role, representation) => {
    if (!representation?.path) return;
    const sha256Source = role === 'builder' && facts?.sourceSha256 ? 'handoff-captured'
      : ['authoring', 'release'].includes(role) && representation.sha256 ? 'release-manifest'
        : representation.sha256 ? 'catalog-only' : null;
    const value = { role, path: representation.path, sha256: representation.sha256 ?? null, sha256Source };
    versions.set(`${role}\0${representation.path}`, value);
  };
  for (const variant of model.variants) {
    for (const role of ['authoring', 'release', 'package', 'runtimeFile', 'sourceFile']) add(role, variant[role]);
  }
  if (model.deployment?.source) add('builder', { path: model.deployment.source, sha256: facts?.sourceSha256 ?? null });
  if (model.id.startsWith('procedural:fauna:bolus_')) add('builder', { path: 'src/render/bolusSilhouettes.js' });
  return [...versions.values()].sort((a, b) => a.role.localeCompare(b.role) || a.path.localeCompare(b.path));
}

function hashFile(path) {
  const fd = openSync(path, 'r'), hash = createHash('sha256'), chunk = Buffer.alloc(1024 * 1024);
  try {
    let count;
    while ((count = readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, count));
    return hash.digest('hex');
  } finally { closeSync(fd); }
}

function currentFileVersion(version) {
  return version.map((entry) => existsSync(entry.path)
    ? { ...entry, sha256: hashFile(entry.path), sha256Source: 'current-file-bytes' }
    : { ...entry, sha256: null, sha256Source: 'missing-file' });
}

function coverageDisposition(model) {
  return model.deployment?.status === 'runtime-use-unresolved'
    || model.identityStatus === 'group-needs-individual-identities'
    || model.id.startsWith('source-candidate:')
    || model.id.startsWith('unmapped-release:');
}

function refreshCoverageStatuses(models) {
  const previous = existsSync(coverageStatusPath) ? readJson(coverageStatusPath) : { models: {} };
  const statuses = { ...(previous.models || {}) };
  const history = new Map();
  for (const event of rows()) {
    const list = history.get(event.modelId) || [];
    list.push(event);
    history.set(event.modelId, list);
  }

  for (const model of models) {
    const existing = statuses[model.id];
    const facts = existsSync(factsPath(model.id)) ? readJson(factsPath(model.id)) : null;
    const events = history.get(model.id) || [];
    const unresolved = coverageDisposition(model);
    const version = coverageVersion(model, facts);
    if (!existing) {
      const status = unresolved ? 'unused/unresolved' : (facts || events.length ? 'needs follow-up' : 'pending');
      const latest = events.at(-1);
      statuses[model.id] = {
        status,
        current: true,
        version,
        views: [],
        changes: facts?.status || latest?.decision || 'No review change recorded.',
        issues: unresolved
          ? 'Runtime use or individual model identity is unresolved. This status does not establish that the file is unused and does not authorize deletion.'
          : facts?.status || latest?.next || 'Visual and practical efficiency review is pending.',
        evidence: [...new Set([...(facts?.diagnostics || []), ...(latest?.evidence || [])])],
        updatedAt: new Date().toISOString(),
      };
      continue;
    }

    const versionChanged = JSON.stringify(existing.version || []) !== JSON.stringify(version);
    const nextStatus = { ...existing, current: true, version,
      ...(versionChanged ? { updatedAt: new Date().toISOString() } : {}) };
    // Preserve and refresh versions pinned by a partial review as well as completed passes;
    // otherwise an index refresh replaces their actual byte hashes with older catalog metadata.
    if (existing.status === 'passed' || (existing.version || []).some((entry) => entry.sha256Source === 'current-file-bytes')) {
      const currentVersion = currentFileVersion(version);
      const pathsMatch = JSON.stringify((existing.version || []).map(({ role, path }) => [role, path]))
        === JSON.stringify(currentVersion.map(({ role, path }) => [role, path]));
      const hashesPinned = (existing.version || []).length > 0
        && existing.version.every((entry) => entry.sha256Source === 'current-file-bytes' && entry.sha256);
      const bytesMatch = hashesPinned && pathsMatch && JSON.stringify(existing.version.map((entry) => entry.sha256))
        === JSON.stringify(currentVersion.map((entry) => entry.sha256));
      nextStatus.version = currentVersion;
      if (!bytesMatch && existing.status === 'passed') {
        nextStatus.status = 'needs follow-up';
        nextStatus.priorVersion = existing.version;
        nextStatus.issues = 'Current source, release, or package bytes changed or were not pinned at pass time; review this version before restoring passed status.';
        nextStatus.updatedAt = new Date().toISOString();
      }
    }
    statuses[model.id] = nextStatus;
  }

  const currentIds = new Set(models.map((model) => model.id));
  for (const [id, entry] of Object.entries(statuses)) {
    if (currentIds.has(id)) continue;
    statuses[id] = { ...entry, status: 'unused/unresolved', current: false,
      issues: 'This model ID is absent from the refreshed index. Its runtime/source relationship is unresolved; absence does not authorize deletion.',
      updatedAt: new Date().toISOString() };
  }

  const counts = Object.fromEntries(coverageStates.map((status) => [status, 0]));
  for (const entry of Object.values(statuses)) counts[entry.status] = (counts[entry.status] || 0) + 1;
  const document = { schema: 'spaceface.assetCoverageStatus.v1', generatedAt: new Date().toISOString(),
    note: 'One durable status per model ID. `unused/unresolved` is a disposition for unresolved linkage or identity, not proof of non-use or permission to delete. Review details and evidence remain in the per-model facts and append-only journals. Index refreshes and status updates rewrite this whole file; serialize those commands and do not run concurrent status writers.',
    statusCounts: counts, models: Object.fromEntries(Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b))) };
  writeFileSync(coverageStatusPath, `${JSON.stringify(document, null, 2)}\n`);
  return document;
}

function buildIndex({ useCatalog = true } = {}) {
  const catalog = useCatalog && existsSync(catalogPath) ? readJson(catalogPath) : { generatedAt: null, rows: [] };
  const old = readJson(proceduralSeedPath), release = readJson(releasePath);
  mkdirSync(root, { recursive: true });
  const catalogByFile = new Map(catalog.rows.map((row) => [row.file, row]));
  const releaseByFile = new Map(release.assets.map((row) => [row.release, row]));
  const mappedRelease = new Set(), mappedPackages = new Set(), models = new Map();
  const add = (id, row) => {
    const current = models.get(id) || { id, ...row, variants: [] };
    models.set(id, current);
    return current;
  };
  for (const pilot of RENDER_PACKAGE_PILOTS) {
    const src = releaseByFile.get(pilot.sourceUrl);
    const packagePath = pilot.metadataUrl.replace(/render-package\.json$/, 'render.glb');
    const part = catalogByFile.get(pilot.sourceUrl), pkg = catalogByFile.get(packagePath);
    const id = `runtime:${pilot.runtimeAssetId}:${stem(pilot.sourceUrl)}`;
    const model = add(id, { category: pilot.slot, runtimeAssetId: pilot.runtimeAssetId,
      deployment: { status: 'mapping-needs-review',
        common: ['src/render/assetLoader.js', 'src/render/renderPackageLoader.js', 'src/render/renderPackageManifest.js'],
        literalReferenceCandidates: [] } });
    const refs = part?.sourceReferenceFiles || [];
    model.deployment.literalReferenceCandidates = [...new Set([...model.deployment.literalReferenceCandidates, ...refs])];
    model.variants.push({ lod: lod(pilot.sourceUrl), releaseId: src?.id ?? part?.id ?? null,
      authoring: src ? { path: src.source, sha256: src.sourceSha256, status: 'manifest-only' } : null,
      release: { path: pilot.sourceUrl, sha256: src?.releaseSha256 ?? part?.sha256 ?? null,
        status: part ? 'catalog-metadata-only' : catalog.generatedAt ? 'not-in-catalog' : 'catalog-unavailable' },
      package: { path: packagePath, metadata: pilot.metadataUrl, sha256: pkg?.sha256 ?? null,
        assetId: pilot.assetId, status: pkg ? 'catalog-metadata-only' : catalog.generatedAt ? 'not-in-catalog' : 'catalog-unavailable' } });
    mappedRelease.add(pilot.sourceUrl); mappedPackages.add(packagePath);
  }
  // Preserve non-pilot release entries as explicit review targets, not presumed-unused files.
  for (const asset of release.assets) {
    if (mappedRelease.has(asset.release)) continue;
    const row = catalogByFile.get(asset.release);
    const id = `unmapped-release:${asset.id}`;
    add(id, { category: asset.kind, runtimeAssetId: null, iterationTarget: 20,
      deployment: { status: 'runtime-use-unresolved', literalReferenceCandidates: row?.sourceReferenceFiles || [] } })
      .variants.push({ lod: lod(asset.release), releaseId: asset.id,
        authoring: { path: asset.source, sha256: asset.sourceSha256, status: 'manifest-only' },
        release: { path: asset.release, sha256: asset.releaseSha256 ?? row?.sha256 ?? null,
          status: row ? 'catalog-metadata-only' : catalog.generatedAt ? 'not-in-catalog' : 'catalog-unavailable' },
        package: null });
  }
  for (const [part, file] of Object.entries(RUCKUS_MESH_ASSETS)) {
    const row = catalogByFile.get(file);
    const isBody = /^body\d+$/.test(part);
    const id = isBody ? 'runtime-character:ruckus' : `runtime-character:${stem(file)}`;
    add(id, { category: 'character', runtimeAssetId: null, iterationTarget: 20,
      deployment: { status: 'runtime-mesh-registry', source: 'src/render/characters/ruckusMeshData.js' } })
      .variants.push({ lod: lod(file), runtimeFile: { path: file, sha256: row?.sha256 ?? null,
        status: row ? 'catalog-metadata-only' : catalog.generatedAt ? 'not-in-catalog' : 'catalog-unavailable' } });
  }
  for (const row of old.proceduralAssets) {
    const modelName = row.type || row.kind;
    const id = `${row.family}:${modelName}:variant${row.variant}`;
    add(id, { category: row.family, runtimeAssetId: modelName, iterationTarget: 20,
      deployment: { status: 'builder-identified', source: row.source } })
      .variants.push({ id: row.id, seedVariant: row.variant, lod: row.lod,
        status: row.inspectionStatus, note: row.note });
  }
  // The older ledger includes both concrete model IDs and broad presentation/factory groups.
  // Keep every row, but label identity unresolved rather than claiming 171 distinct models.
  for (const row of old.proceduralFamilies) {
    if (row.id === 'character:ruckus') {
      const character = models.get('runtime-character:ruckus');
      if (character) character.relatedProceduralController = row;
      continue;
    }
    const uncertain = /^(?:factory|presentation|alien-growth):/.test(row.id);
    add(`procedural:${row.id}`, { category: 'procedural', runtimeAssetId: row.id,
      identityStatus: uncertain ? 'group-needs-individual-identities' : 'registry-or-builder-id',
      deployment: { status: 'builder-identified', source: row.source },
      structuralInspection: row.structuralInspection || null });
  }
  const unmatchedPackages = catalog.generatedAt
    ? catalog.rows.filter((row) => row.kind.startsWith('package:') && !mappedPackages.has(row.file)).map((row) => row.file)
    : null;
  const missingRelease = RENDER_PACKAGE_PILOTS.filter((pilot) => !releaseByFile.has(pilot.sourceUrl)).map((pilot) => pilot.sourceUrl);
  const sourceInventory = buildSourceInventory([...models.values()], catalogByFile);
  // Unmapped source and authoring-library files remain reviewable without calling them shipped.
  // Group only same-stem files in the same directory; name matches to runtime entries stay tentative.
  const sourceCandidateIds = new Set(), thirdPartyCandidateIds = new Set();
  for (const source of sourceInventory.files) {
    if (!['unmapped-source-model', 'unmapped-release-tree-model', 'generated-authoring-library', 'third-party-authoring-input'].includes(source.classification)) continue;
    const id = `source-candidate:${dirname(source.path).replace(/\\/g, '/')}/${stem(source.path)}`;
    const model = add(id, { category: source.classification, runtimeAssetId: null, iterationTarget: 20,
      identityStatus: 'source-group-runtime-and-duplicates-unresolved',
      deployment: { status: 'runtime-use-unresolved', candidateRuntimeLinks: [] } });
    model.deployment.candidateRuntimeLinks = [...new Set([...model.deployment.candidateRuntimeLinks, ...source.candidateNameLinks])];
    model.variants.push({ lod: lod(source.path), sourceFile: { path: source.path, format: source.format,
      sha256: source.sha256, status: 'file-inventory-only' } });
    source.reviewModelId = id;
    if (source.classification === 'third-party-authoring-input') thirdPartyCandidateIds.add(id);
    else sourceCandidateIds.add(id);
  }
  // Explicit, source-traced playable variants get their own review histories; mere filename
  // similarity does not mint one. Each inherited LOD remains separately visible in coverage.
  for (const base of [...models.values()]) {
    if (!existsSync(factsPath(base.id))) continue;
    const facts = readJson(factsPath(base.id));
    for (const variant of facts.playableVariants || []) {
      if (!variant.id || !variant.description || !Array.isArray(variant.evidence) || !variant.evidence.length) {
        throw new Error(`Incomplete playable variant definition on ${base.id}`);
      }
      const id = `playable-variant:${base.id}:${variant.id}`;
      const model = add(id, { category: 'playable-variant', baseModelId: base.id,
        runtimeAssetId: null, identityStatus: 'source-traced-variant',
        description: variant.description, evidence: variant.evidence,
        missingVariantEvidence: variant.evidence.filter((path) => !existsSync(path)),
        deployment: { status: 'see-base-and-variant-evidence' } });
      model.variants = structuredClone(base.variants);
    }
  }
  // Count a whole model's iterations separately from coverage of each authored LOD. A tagged
  // LOD here is declared data, not proof it was rendered or is visible in ordinary play.
  for (const model of models.values()) {
    const facts = existsSync(factsPath(model.id)) ? readJson(factsPath(model.id)) : null;
    model.variationDiscovery = facts?.variationDiscovery === 'complete' ? 'complete' : 'unresolved';
    for (const variant of model.variants) {
    if (variant.release) {
      variant.declaredLods = declaredLods(variant.release.path);
      const levels = variant.declaredLods.levels.length ? variant.declaredLods.levels
        : variant.lod !== 'primary-or-contained-lods' ? [`lod${variant.lod}`] : ['unclassified'];
      variant.reviewTargets = levels.map((level) => `${variant.releaseId}#${level}`);
    } else if (variant.runtimeFile) {
      variant.reviewTargets = [`${variant.runtimeFile.path}#${variant.lod}`];
    } else if (variant.sourceFile) {
      variant.reviewTargets = [`${variant.sourceFile.path}#source`];
    } else if (variant.id) variant.reviewTargets = [variant.id];
    }
  }
  writeFileSync(sourceInventoryPath, `${JSON.stringify(sourceInventory, null, 2)}\n`);
  const output = { schema: 'spaceface.perAssetReview.v1', generatedAt: new Date().toISOString(),
    sourceCatalogGeneratedAt: catalog.generatedAt,
    note: 'An index and metadata inventory are not visual reviews. Runtime use is unresolved until traced; shared appearance/systems have separate owners.',
    basis: { releaseManifest: releasePath, runtimeManifest: 'src/render/renderPackageManifest.js',
      catalog: catalog.generatedAt ? catalogPath : null, proceduralSeed: proceduralSeedPath, sourceInventory: sourceInventoryPath },
    summary: { reviewRecords: models.size, releaseManifestEntries: release.assets.length,
      runtimePackageEntries: RENDER_PACKAGE_PILOTS.length, mappedReleaseEntries: mappedRelease.size,
      mappedPackageEntries: mappedPackages.size, additionalCharacterGlbs: Object.keys(RUCKUS_MESH_ASSETS).length,
      manifestModelGroups: [...models.keys()].filter((id) => id.startsWith('runtime:')).length,
      unresolvedPresentationGroups: [...models.values()].filter((m) => m.identityStatus === 'group-needs-individual-identities').length,
      sourceModelFiles: sourceInventory.files.length, sourceFilesWithUnresolvedIdentity: sourceInventory.summary.unresolved,
      unresolvedSourceCandidateGroups: sourceCandidateIds.size,
      thirdPartyCandidateGroups: thirdPartyCandidateIds.size },
    warnings: { missingRelease, unmatchedPackages, unseenKnownPaths: sourceInventory.unseenKnownPaths },
    models: [...models.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  const coverageStatus = refreshCoverageStatuses(output.models);
  output.summary.coverageStatusCounts = coverageStatus.statusCounts;
  output.summary.coverageStatusModels = output.models.length;
  writeFileSync(indexPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ indexPath, summary: output.summary, warnings: output.warnings }, null, 2));
}

function lookup(index, value) {
  const matches = index.models.filter((m) => m.id === value || m.runtimeAssetId === value
    || m.variants.some((v) => v.releaseId === value || v.release?.path === value || v.authoring?.path === value
      || v.package?.path === value || v.package?.assetId === value || v.runtimeFile?.path === value || v.sourceFile?.path === value));
  if (matches.length !== 1) throw new Error(`Expected one matching model, got ${matches.length}: ${value}`);
  return matches[0];
}

const [command, argument] = process.argv.slice(2);
if (command === 'index') buildIndex({ useCatalog: argument !== '--no-catalog' });
else if (command === 'show') {
  const model = lookup(readJson(indexPath), argument);
  const iterations = rows(model.id);
  const facts = existsSync(factsPath(model.id)) ? readJson(factsPath(model.id)) : null;
  const coverage = existsSync(coverageStatusPath) ? readJson(coverageStatusPath).models?.[model.id] ?? null : null;
  const missingEvidence = [...new Set(iterations.flatMap((r) => r.evidence).filter((path) => !existsSync(path)))];
  const targets = model.variants.flatMap((variant) => variant.reviewTargets || []);
  const variantCoverage = targets.map((target) => ({ target,
    observations: iterations.flatMap((iteration) => (iteration.variantCoverage || [])
      .filter((coverage) => coverage.target === target).map((coverage) => ({ iteration: iteration.iteration, ...coverage }))) }));
  console.log(JSON.stringify({ model, coverageStatusPath, coverage, factsPath: factsPath(model.id), journalPath: eventsPath(model.id),
    tracedFacts: facts, recordedIterations: iterations.length, variantCoverage, iterations, missingEvidence }, null, 2));
} else if (command === 'record') {
  const event = readJson(argument), model = lookup(readJson(indexPath), event.modelId);
  for (const field of ['performedBy', 'action', 'observation', 'decision', 'next', 'evidenceScope', 'performance']) {
    if (typeof event[field] !== 'string' || !event[field].trim()) throw new Error(`Missing ${field}`);
  }
  if (!Array.isArray(event.evidence) || !event.evidence.length) throw new Error('At least one evidence path is required');
  for (const path of event.evidence) if (typeof path !== 'string' || !existsSync(path)) throw new Error(`Missing evidence: ${path}`);
  if (!Array.isArray(event.variantCoverage)) throw new Error('variantCoverage must be an array; use [] when no LOD/variant was inspected');
  const targets = new Set(model.variants.flatMap((variant) => variant.reviewTargets || []));
  for (const coverage of event.variantCoverage) {
    if (!targets.has(coverage.target)) throw new Error(`Unknown model/LOD target: ${coverage.target}`);
    if (!['static-data', 'historical-render', 'current-isolated', 'ordinary-play'].includes(coverage.scope)) {
      throw new Error(`Invalid coverage scope: ${coverage.scope}`);
    }
    if (!event.evidence.includes(coverage.evidence)) throw new Error('Coverage evidence must be listed in evidence');
  }
  const iterations = rows(model.id);
  if (iterations.some((r) => r.action === event.action && r.observation === event.observation)) {
    throw new Error('This action and observation are already recorded for this model');
  }
  const record = { ...event, modelId: model.id, iteration: iterations.length + 1, recordedAt: new Date().toISOString() };
  mkdirSync(eventsDir, { recursive: true });
  appendFileSync(eventsPath(model.id), `${JSON.stringify(record)}\n`);
  console.log(JSON.stringify(record, null, 2));
} else if (command === 'summary') {
  const index = readJson(indexPath), all = rows(), counts = new Map();
  for (const row of all) counts.set(row.modelId, (counts.get(row.modelId) || 0) + 1);
  const unknown = [...counts.keys()].filter((id) => !index.models.some((m) => m.id === id));
  const missingEvidence = [...new Set(all.flatMap((r) => r.evidence).filter((path) => !existsSync(path)))];
  const modelLods = index.models.flatMap((m) => m.variants.flatMap((v) => (v.reviewTargets || []).map((target) => `${m.id}\0${target}`)));
  const currentVisual = new Set(all.flatMap((r) => (r.variantCoverage || [])
    .filter((coverage) => ['current-isolated', 'ordinary-play'].includes(coverage.scope))
    .map((coverage) => `${r.modelId}\0${coverage.target}`)));
  const coverage = existsSync(coverageStatusPath) ? readJson(coverageStatusPath) : null;
  console.log(JSON.stringify({ ...index.summary, coverageStatusCounts: coverage?.statusCounts ?? null,
    coverageStatusModels: Object.keys(coverage?.models || {}).length, modelsWithRecordedIterations: counts.size,
    totalRecordedIterations: all.length,
    recordedModelLodTargets: modelLods.length, modelLodTargetsWithCurrentVisualEvidence: modelLods.filter((key) => currentVisual.has(key)).length,
    orphanedEventIds: unknown, missingEvidence }, null, 2));
} else if (command === 'source') {
  const inventory = readJson(sourceInventoryPath);
  const found = inventory.files.find((file) => file.path === argument);
  if (!found) throw new Error(`Source file not in inventory: ${argument}`);
  console.log(JSON.stringify(found, null, 2));
} else if (command === 'status') {
  const model = lookup(readJson(indexPath), argument), update = readJson(process.argv[4]);
  const document = readJson(coverageStatusPath), current = document.models[model.id];
  if (!coverageStates.includes(update.status)) throw new Error(`status must be one of: ${coverageStates.join(', ')}`);
  for (const field of ['changes', 'issues']) if (typeof update[field] !== 'string' || !update[field].trim()) throw new Error(`Missing ${field}`);
  if (!Array.isArray(update.views) || !Array.isArray(update.evidence)) throw new Error('views and evidence must be arrays');
  for (const path of update.evidence) if (typeof path !== 'string' || !existsSync(path)) throw new Error(`Missing evidence: ${path}`);
  if (update.status === 'passed' && (!update.views.length || !update.evidence.length)) throw new Error('A passed status requires at least one actual view and existing evidence path');
  const version = update.status === 'passed' ? currentFileVersion(current.version) : (update.version ?? current.version);
  if (update.status === 'passed' && version.some((entry) => entry.sha256Source !== 'current-file-bytes' || !entry.sha256)) {
    throw new Error('A passed status requires current byte hashes for every model representation');
  }
  document.models[model.id] = { ...current, ...update, version,
    current: true, updatedAt: new Date().toISOString() };
  document.statusCounts = Object.fromEntries(coverageStates.map((status) => [status,
    Object.values(document.models).filter((entry) => entry.status === status).length]));
  writeFileSync(coverageStatusPath, `${JSON.stringify(document, null, 2)}\n`);
  console.log(JSON.stringify(document.models[model.id], null, 2));
} else {
  console.error('Usage: node scripts/fleet/asset-review.mjs index [--no-catalog] | show <id> | source <path> | record <json-file> | status <id> <json-file> | summary');
  process.exitCode = 2;
}
