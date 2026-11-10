import { createHash } from 'node:crypto';
import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { PHYSICS_MATERIALS } from '../../src/data/physicsMaterials.js';
import { modelTruthRow, modelTruthRows, modelTruthSkinPolygon } from '../../src/data/modelTruth.js';
import { proxyScaleFor, resolveCollisionProxyManifest } from '../../src/data/collisionProxyManifests.js';
import { SHIPS } from '../../src/data/ships.js';
import { getDerivedStats } from '../../src/systems/ships.js';
import {
  REQUIRED_WHOLE_SHIP_DEF_IDS,
  shipArchetypesForPrecompile,
  wholeShipVisualForEntity,
} from '../../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../../src/render/renderPackageManifest.js';
import { RENDER_PACKAGE_PILOTS } from '../../src/render/renderPackageManifest.js';
import { collectLodTriangleCounts } from './partsManifestMetrics.mjs';

const PARTS_MANIFEST_PATH = 'assets/ships/parts/parts_manifest.json';
const RELEASE_MANIFEST_PATH = 'assets/ships/release/release_manifest.json';
const RENDER_PARTS_PREFIX = 'assets/ships/release/parts/';
const SOURCE_PARTS_PREFIX = 'assets/ships/parts/';
const RELEASE_CATALOG_INPUTS = Object.freeze({
  modelTruthCensus: 'src/data/modelTruthCensus.json',
  packagePilots: 'assets/ships/render-packages/pilots.json',
  packageRuntimeCode: 'src/render/renderPackageManifest.js',
  flightStatic: 'assets/ships/render-packages/flight-static-v3.json',
  gfxAudit: '.devshots/asset-audit/gltf-audit.json',
  codeInputs: Object.freeze({
    ships: 'src/data/ships.js',
    shipSystem: 'src/systems/ships.js',
    partsLibrary: 'src/render/partsLibrary.js',
    modelTruthReader: 'src/data/modelTruth.js',
    collisionProxyReader: 'src/data/collisionProxyManifests.js',
    physicsMaterials: 'src/data/physicsMaterials.js',
    lodTriangleReader: 'scripts/lib/partsManifestMetrics.mjs',
  }),
});

export async function loadAssetPhysicsSources(root) {
  const [partsText, releaseText] = await Promise.all([
    readFile(path.resolve(root, PARTS_MANIFEST_PATH), 'utf8'),
    readFile(path.resolve(root, RELEASE_MANIFEST_PATH), 'utf8'),
  ]);
  return {
    partsManifest: JSON.parse(partsText),
    releaseManifest: JSON.parse(releaseText),
  };
}

/** Load role/package indices plus bounded GLB JSON metadata. Vertex/binary buffers are never read. */
export async function loadReleaseAssetSources(root, { metadataConcurrency = 8 } = {}) {
  const [partsText, releaseText, modelTruthText, pilotsText, flightStaticText, runtimePackageCode] = await Promise.all([
    readFile(path.resolve(root, PARTS_MANIFEST_PATH), 'utf8'),
    readFile(path.resolve(root, RELEASE_MANIFEST_PATH), 'utf8'),
    readFile(path.resolve(root, RELEASE_CATALOG_INPUTS.modelTruthCensus), 'utf8'),
    readFile(path.resolve(root, RELEASE_CATALOG_INPUTS.packagePilots), 'utf8'),
    readFile(path.resolve(root, RELEASE_CATALOG_INPUTS.flightStatic), 'utf8'),
    readFile(path.resolve(root, RELEASE_CATALOG_INPUTS.packageRuntimeCode)),
  ]);
  const codeInputHashes = Object.fromEntries(await Promise.all(
    Object.entries(RELEASE_CATALOG_INPUTS.codeInputs).map(async ([key, relativePath]) => [
      key,
      sha256(await readFile(path.resolve(root, relativePath))),
    ]),
  ));
  const partsManifest = JSON.parse(partsText);
  const releaseManifest = JSON.parse(releaseText);
  const packagePilotManifest = JSON.parse(pilotsText);
  const flightStaticManifest = JSON.parse(flightStaticText);
  const releases = Array.isArray(releaseManifest.assets) ? releaseManifest.assets : [];
  const sourceMetadataByPath = await mapLimit(releases, metadataConcurrency, async (release) => {
    const pathKey = normalizePath(release.source);
    let metadata = await readGlbJsonMetadata(root, release.source);
    let metadataPath = release.source;
    if (!metadata.glbJsonPresent) {
      const releaseMetadata = await readGlbJsonMetadata(root, release.release);
      if (releaseMetadata.glbJsonPresent) {
        metadata = releaseMetadata;
        metadataPath = release.release;
      }
    }
    const [sourceStat, releaseStat] = await Promise.all([
      statOptional(path.resolve(root, release.source)),
      statOptional(path.resolve(root, release.release)),
    ]);
    return [pathKey, { ...metadata, metadataPath, sourceStatBytes: sourceStat?.size ?? null, releaseStatBytes: releaseStat?.size ?? null }];
  });
  const runtimePilots = RENDER_PACKAGE_PILOTS.map((row) => row);
  const runtimePilotBySource = new Map(runtimePilots.map((row) => [normalizePath(row.sourceUrl), row]));
  const buildPilotBySource = new Map((packagePilotManifest.pilots || []).map((row) => [normalizePath(row.sourceUrl), row]));
  const packageMetadataBySource = new Map(await mapLimit(releases, metadataConcurrency, async (release) => {
    const source = normalizePath(release.source);
    const pilot = runtimePilotBySource.get(normalizePath(release.release))
      || runtimePilotBySource.get(source);
    if (!pilot?.metadataUrl) return [source, null];
    const filePath = path.resolve(root, pilot.metadataUrl);
    try {
      const bytes = await readFile(filePath);
      const metadata = JSON.parse(bytes.toString('utf8'));
      return [source, {
        metadataPath: pilot.metadataUrl,
        metadataSha256: sha256(bytes),
        metadataContentHash: metadata.contentHash || null,
        metadataRuntimeHash: metadata.runtimeHash || null,
        metadataSchema: metadata.schema || null,
        metadataRuntimeUrl: metadata.runtime?.url || null,
        metadataRuntimeSlot: metadata.runtime?.slot || null,
        metadataPresent: true,
      }];
    } catch (error) {
      return [source, {
        metadataPath: pilot.metadataUrl,
        metadataPresent: false,
        metadataReadError: error?.code || error?.name || 'read-error',
      }];
    }
  }));
  let gfxAudit = null;
  try {
    const bytes = await readFile(path.resolve(root, RELEASE_CATALOG_INPUTS.gfxAudit));
    const parsed = JSON.parse(bytes.toString('utf8'));
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.assets) ? parsed.assets : [];
    gfxAudit = {
      path: RELEASE_CATALOG_INPUTS.gfxAudit,
      sha256: sha256(bytes),
      rowsByFile: Object.fromEntries(rows.filter(row => row.file).map(row => [normalizePath(row.file), row])),
      scope: 'Optional prior audit. Joined by exact path and reported release byte count only; no input-GLB hash is available, so this is not treated as current geometry evidence.',
    };
  } catch {
    // The Blender gfx audit is optional; its absence is not a missing release identity.
  }
  return {
    partsManifest,
    releaseManifest,
    modelTruthRows: modelTruthRows(),
    packagePilotManifest,
    runtimePilots,
    flightStaticManifest,
    sourceMetadataByPath: new Map(sourceMetadataByPath),
    packageMetadataBySource: new Map(packageMetadataBySource),
    gfxAudit,
    inputHashes: {
      partsManifest: sha256(Buffer.from(partsText)),
      releaseManifest: sha256(Buffer.from(releaseText)),
      modelTruthCensus: sha256(Buffer.from(modelTruthText)),
      packagePilots: sha256(Buffer.from(pilotsText)),
      flightStatic: sha256(Buffer.from(flightStaticText)),
      runtimePackageCode: sha256(runtimePackageCode),
      codeInputs: codeInputHashes,
      gfxAudit: gfxAudit?.sha256 || null,
    },
  };
}

/** Build a role-aware inventory of all assets in the release manifest.
 * Package-index membership is reported separately from player reachability.
 */
export function buildReleaseAssetInventory({
  partsManifest,
  releaseManifest,
  modelTruthRows: truthRows = [],
  packagePilotManifest = { pilots: [] },
  runtimePilots = [],
  flightStaticManifest = { packages: [] },
  sourceMetadataByPath = new Map(),
  packageMetadataBySource = new Map(),
  gfxAudit = null,
  assetIds = null,
  shard = null,
}) {
  const parts = Array.isArray(partsManifest?.parts) ? partsManifest.parts : [];
  const releases = Array.isArray(releaseManifest?.assets) ? releaseManifest.assets : [];
  const partsById = new Map(parts.map((part) => [part.id, part]));
  const partsByFile = new Map();
  for (const part of parts) {
    if (part.file) partsByFile.set(normalizePath(part.file), part);
    for (const file of Object.values(part.lodFamily || {})) partsByFile.set(normalizePath(file), part);
  }
  const truthByUrl = new Map(truthRows.map((row) => [normalizePath(row.url), row]));
  const truthById = new Map(truthRows.map((row) => [row.id, row]));
  const runtimeBySource = new Map(runtimePilots.map((row) => [normalizePath(row.sourceUrl), row]));
  const packageBySource = new Map((packagePilotManifest?.pilots || []).map((row) => [normalizePath(row.sourceUrl), row]));
  const flightStaticKeys = new Set(Array.isArray(flightStaticManifest?.packages) ? flightStaticManifest.packages : []);
  const selectedIds = selectReleaseAssetIds(releases, assetIds, shard);
  const selected = new Set(selectedIds);
  const familyMap = new Map();
  const allRows = [];

  for (const release of releases) {
    if (!selected.has(release.id)) continue;
    const source = normalizePath(release.source);
    const releasePath = normalizePath(release.release);
    const sourceMeta = sourceMetadataByPath.get(source) || null;
    const part = partsById.get(release.id)
      || partsById.get(release.id.replace(/_lod[12]$/, ''))
      || partsByFile.get(source.replace(/^assets\/ships\/parts\//, ''))
      || partsByFile.get(releasePath.replace(/^assets\/ships\/release\/parts\//, ''))
      || null;
    const canonicalShipId = canonicalShipIdForAsset(release, part);
    const truth = truthByUrl.get(source) || truthByUrl.get(releasePath)
      || (canonicalShipId ? truthById.get(canonicalShipId) : null) || null;
    const runtimePilot = runtimeBySource.get(releasePath) || runtimeBySource.get(source) || null;
    const buildPilot = packageBySource.get(releasePath) || packageBySource.get(source) || null;
    const packageMetadata = packageMetadataBySource.get(source) || null;
    const declaredCategory = part?.category || categoryFromKind(release.kind) || null;
    const gltfAsset = sourceMeta?.gltfAsset || null;
    const assetExtras = gltfAsset?.extras?.spacefaceAsset || gltfAsset?.extras?.spaceface || {};
    const role = roleForAsset({ release, part, truth, runtimePilot, assetExtras, canonicalShipId });
    const familyId = normalizeFamilyId(
      part?.id?.replace(/_lod[12]$/, '') || part?.lodFamily?.familyId || part?.lodFamily?.id
        || assetExtras.familyId || assetExtras.assetId || release.id,
      release.id,
    );
    const variant = variantForAsset({ release, part, assetExtras, sourceMeta });
    const row = {
      id: release.id,
      familyId,
      role,
      canonicalShipId,
      declaredKind: release.kind || null,
      declaredCategory,
      usage: usageForRole(role, part, runtimePilot),
      source: {
        path: release.source,
        sha256: release.sourceSha256 || null,
        hashAuthority: 'release_manifest_declared_not_recomputed',
        bytes: release.sourceBytes ?? null,
        statBytes: sourceMeta?.sourceStatBytes ?? null,
      },
      release: {
        path: release.release,
        sha256: release.releaseSha256 || null,
        hashAuthority: 'release_manifest_declared_not_recomputed',
        bytes: release.releaseBytes ?? null,
        statBytes: sourceMeta?.releaseStatBytes ?? null,
        textureCount: release.textures ?? null,
        ktx2TextureCount: release.ktx2Textures ?? null,
        meshoptBufferViewCount: release.meshoptBufferViews ?? null,
        contractNodeCount: release.contractNodeCount ?? null,
        byteCountMatchesManifest: sourceMeta?.releaseStatBytes == null || release.releaseBytes == null
          ? null : sourceMeta.releaseStatBytes === release.releaseBytes,
      },
      sourceMetadata: sourceMeta ? {
        glbJsonPresent: sourceMeta.glbJsonPresent === true,
        error: sourceMeta.error || null,
        readFrom: sourceMeta.metadataPath || null,
        gltfVersion: sourceMeta.gltfVersion || null,
        assetExtras: compactExtras(assetExtras),
        nodeCount: sourceMeta.nodeCount ?? null,
        meshCount: sourceMeta.meshCount ?? null,
        primitiveCount: sourceMeta.primitiveCount ?? null,
        animationCount: sourceMeta.animationCount ?? null,
        materialChannels: sourceMeta.materialChannels || [],
        materialCount: sourceMeta.materialCount ?? null,
        lodTriangles: sourceMeta.lodTriangles || null,
      } : { glbJsonPresent: false, error: 'metadata_not_loaded' },
      authoredPart: part ? {
        id: part.id,
        category: part.category || null,
        priority: part.priority || null,
        file: part.file || null,
        bounds: part.bounds || null,
        mount: part.mount || null,
        sockets: Array.isArray(part.sockets) ? part.sockets : [],
        hooks: Array.isArray(part.hooks) ? part.hooks : [],
        lodFamily: part.lodFamily || null,
        tintableMaterials: Object.values(part.tintable || {}),
      } : null,
      modelTruth: truth ? {
        id: truth.id,
        status: truth.status || null,
        sourceUrl: truth.url || null,
        meshHash: truth.meshHash || null,
        bounds: truth.bounds || null,
        worldSize: truth.worldSize || null,
        pivot: truth.pivot || null,
        sockets: truth.sockets || null,
        collider: truth.collider ? {
          id: truth.collider.id || null,
          coverageMetric: truth.collider.coverageMetric || null,
          coverageWu: truth.collider.coverageWu ?? null,
          gapWu: truth.collider.gapWu ?? null,
          partCount: truth.collider.convexPartsWU?.length ?? truth.collider.primitives?.length ?? null,
        } : null,
        materialNames: truth.materials || null,
      } : null,
      runtimePackage: runtimePilot ? {
        key: runtimePilot.key || null,
        assetId: runtimePilot.assetId || null,
        runtimeAssetId: runtimePilot.runtimeAssetId || null,
        slot: runtimePilot.slot || null,
        sourceUrl: runtimePilot.sourceUrl || null,
        sourceSha256: runtimePilot.sourceSha256 || null,
        expectedContentHash: runtimePilot.expectedContentHash || null,
        expectedRuntimeHash: runtimePilot.expectedRuntimeHash || null,
        metadataUrl: runtimePilot.metadataUrl || null,
        metadata: packageMetadata,
        identityMatches: packageIdentityMatches(runtimePilot, packageMetadata),
      } : null,
      buildPackageCandidate: buildPilot ? {
        key: buildPilot.key || null,
        kind: buildPilot.kind || null,
        slot: buildPilot.slot || null,
        runtimeAssetId: buildPilot.runtimeAssetId || null,
        sourceUrl: buildPilot.sourceUrl || null,
        releaseSha256: buildPilot.releaseSha256 || null,
        metadataUrl: buildPilot.metadataUrl || null,
      } : null,
      flightStaticCandidate: runtimePilot?.key && flightStaticKeys.has(runtimePilot.key),
      gfxAudit: auditSummary(gfxAudit, release),
      physics: canonicalShipId ? shipPhysicsSummary(canonicalShipId) : {
        mass: null,
        centerOfMass: null,
        materialDensity: null,
        note: 'Not a canonical player-ship physics definition; mass, COM, and density are not inferred for this asset role.',
      },
      runtimePackageEligibility: runtimePilot
        ? eligibilityForPilot(runtimePilot, packageMetadata, release)
        : {
          status: 'not-indexed',
          candidate: release.kind !== 'ship-reference',
          evidence: 'Absent from runtime render-package pilot index; index absence alone does not establish ineligibility or broken runtime use.',
        },
      identityCoverage: {
        partsManifest: part ? 'indexed' : 'not-indexed',
        modelTruth: truth ? 'indexed' : role === 'player-ship' ? 'not-indexed-for-this-variant' : 'not-indexed-no-role-requirement-inferred',
        releaseManifest: 'indexed',
      },
      playerReachability: 'not-established-by-asset-indices',
      diagnosticFindings: [],
    };
    fillDiagnosticFindings(row);
    allRows.push(row);
    let family = familyMap.get(familyId);
    if (!family) {
      family = { familyId, role, declaredCategory, variants: [] };
      familyMap.set(familyId, family);
    }
    family.variants.push({ variant, assetId: row.id });
  }

  const families = [...familyMap.values()].sort((a, b) => a.familyId.localeCompare(b.familyId));
  const rowsById = new Map(allRows.map((row) => [row.id, row]));
  for (const family of families) {
    family.variants.sort((a, b) => a.variant.localeCompare(b.variant));
    if (family.role === 'player-ship') {
      family.identityCoverage = {
        modelTruth: family.variants.some(({ assetId }) => rowsById.get(assetId)?.modelTruth) ? 'indexed' : 'required-but-not-indexed',
      };
    }
  }
  const rows = allRows.sort((a, b) => a.id.localeCompare(b.id));
  const roleSummary = {};
  for (const row of rows) {
    const group = roleSummary[row.role] ||= { assets: 0, families: new Set(), packageIndexed: 0, identityMismatch: 0 };
    group.assets += 1;
    group.families.add(row.familyId);
    if (row.runtimePackage) group.packageIndexed += 1;
    if (row.runtimePackage && row.runtimePackage.identityMatches === false) group.identityMismatch += 1;
  }
  for (const value of Object.values(roleSummary)) value.families = value.families.size;
  const summary = {
    releaseAssets: rows.length,
    releaseManifestAssets: releases.length,
    families: families.length,
    byRole: roleSummary,
    runtimePackageIndexed: rows.filter((row) => row.runtimePackage).length,
    runtimePackageIdentityMismatches: rows.filter((row) => row.runtimePackage?.identityMatches === false).map((row) => row.id),
    notIndexedInPartsManifest: rows.filter((row) => !row.authoredPart).map((row) => row.id),
    requiredModelTruthFamiliesNotIndexed: families.filter((family) => family.role === 'player-ship'
      && family.identityCoverage?.modelTruth === 'required-but-not-indexed').map((family) => family.familyId),
    runtimePackageCandidatesNotIndexed: rows.filter((row) => row.runtimePackageEligibility.status === 'not-indexed'
      && row.runtimePackageEligibility.candidate !== false).map((row) => row.id),
    runtimePackageNotIndexedNonCandidates: rows.filter((row) => row.runtimePackageEligibility.status === 'not-indexed'
      && row.runtimePackageEligibility.candidate === false).map((row) => row.id),
    unresolvedMetadata: rows.filter((row) => row.sourceMetadata.glbJsonPresent !== true).map((row) => row.id),
  };
  const releasePaths = new Set(releases.flatMap((row) => [normalizePath(row.source), normalizePath(row.release)]));
  const canonicalShipCoverage = SHIPS.map((ship) => {
    const visual = wholeShipVisualForEntity({ type: 'ship', data: { defId: ship.id } }, { requiredWholeShip: true });
    const releasePath = visual?.file ? `${RENDER_PARTS_PREFIX}${normalizePath(visual.file)}` : null;
    return { shipId: ship.id, assetId: visual?.assetId || null, releasePath, presentInReleaseManifest: !!releasePath && releasePaths.has(releasePath) };
  });
  summary.canonicalShipDefinitionCount = SHIPS.length;
  summary.canonicalShipVisualsMissingFromReleaseManifest = canonicalShipCoverage
    .filter((row) => !row.presentInReleaseManifest).map((row) => row.shipId);
  return {
    schema: 'spaceface.releaseAssetInventory.v1',
    scope: {
      catalog: 'all release-manifest assets selected by ID/shard',
      rowCount: rows.length,
      familyCount: families.length,
      physicsPolicy: 'Only canonical player-ship definitions receive mass/COM/material data; other roles remain unknown.',
      packagePolicy: 'Runtime package index membership is not proof of player reachability.',
      binaryHashPolicy: 'GLB source/release hashes are copied from the release manifest, not recomputed; only JSON chunks and filesystem byte counts are read.',
      flightStaticPackageCount: Array.isArray(flightStaticManifest?.packages) ? flightStaticManifest.packages.length : 0,
      selectedAssetIds: selectedIds,
    },
    summary,
    families,
    canonicalShipCoverage,
    rows,
  };
}

export function selectReleaseAssetIds(releases, ids = null, shard = null) {
  const all = [...new Set((releases || []).map((row) => String(row.id || '')).filter(Boolean))].sort();
  let selected = ids ? [...new Set(ids.map(String))].sort() : all;
  const unknown = selected.filter((id) => !all.includes(id));
  if (unknown.length) throw new Error(`Unknown release asset id(s): ${unknown.join(', ')}`);
  if (shard) {
    const { index, count } = shard;
    if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 0 || index >= count) {
      throw new RangeError('release shard must use index in [0, count) and positive count');
    }
    selected = selected.filter((_, position) => position % count === index);
  }
  return selected;
}

const CANONICAL_SHIP_ID_BY_PART_FILE = (() => {
  const byFile = new Map();
  for (const ship of SHIPS) {
    const visual = wholeShipVisualForEntity({ type: 'ship', data: { defId: ship.id } }, { requiredWholeShip: true });
    if (visual?.file) byFile.set(normalizePath(visual.file), ship.id);
    for (const file of Object.values(visual?.lodFamily || {})) byFile.set(normalizePath(file), ship.id);
  }
  return byFile;
})();

function canonicalShipIdForPart(part) {
  if (!part || part.category !== 'wholeships') return null;
  const found = CANONICAL_SHIP_ID_BY_PART_FILE.get(normalizePath(part.file));
  if (found) return found;
  for (const file of Object.values(part.lodFamily || {})) {
    const shipId = CANONICAL_SHIP_ID_BY_PART_FILE.get(normalizePath(file));
    if (shipId) return shipId;
  }
  return null;
}

function canonicalShipIdForAsset(release, part) {
  const fromPart = canonicalShipIdForPart(part);
  if (fromPart) return fromPart;
  const normalizedRelease = normalizePath(release?.release);
  for (const [file, shipId] of CANONICAL_SHIP_ID_BY_PART_FILE) {
    if (normalizedRelease === `${RENDER_PARTS_PREFIX}${file}`) return shipId;
  }
  return null;
}

function shipPhysicsSummary(shipId) {
  const ship = SHIPS.find((entry) => entry.id === shipId);
  if (!ship) return { mass: null, centerOfMass: null, materialDensity: null, note: 'Canonical ship definition is unavailable.' };
  const stats = getDerivedStats(ship.id, [], null);
  const materialId = ship.physicsBody?.material || 'ship';
  const material = PHYSICS_MATERIALS[materialId] || null;
  return {
    canonicalShipId: ship.id,
    mass: {
      authoredDryHullMass: Number.isFinite(ship.mass) ? ship.mass : null,
      defaultDerivedMass: Number.isFinite(stats.mass) ? stats.mass : null,
      defaultOperationalMass: Number.isFinite(stats.operationalMass) ? stats.operationalMass : null,
    },
    centerOfMass: ship.physicsBody?.centerOfMass || null,
    material: { id: materialId, parameters: material ? serializableMaterial(material) : null },
  };
}

function roleForAsset({ release, part, truth, runtimePilot, assetExtras, canonicalShipId }) {
  if (canonicalShipId) return 'player-ship';
  const category = part?.category || categoryFromKind(release.kind);
  if (category === 'wholeships') return 'ship-visual';
  if (category === 'hulls') return 'hull-component';
  if (category === 'places') return 'place-or-world-structure';
  if (category === 'weapons') return 'weapon-component';
  if (category === 'pods') return 'pod-component';
  if (category === 'cockpits') return 'cockpit-component';
  if (category === 'engines') return 'engine-component';
  if (category === 'fins') return 'fin-component';
  if (category === 'gear') return 'gear-component';
  if (category === 'greebles') return 'decorative-component';
  if (release.kind === 'ship-reference') return 'ship-reference';
  if (truth?.kind === 'projectile' || /projectile|bolt|missile/i.test(String(assetExtras.role || ''))) return 'projectile-or-effect';
  return runtimePilot?.kind ? `${runtimePilot.kind}-asset` : 'unclassified-release-asset';
}

function categoryFromKind(kind) {
  const match = /^part:(.+)$/.exec(String(kind || ''));
  return match?.[1] || null;
}

function usageForRole(role, part, runtimePilot) {
  return {
    role,
    authoredCategory: part?.category || null,
    runtimeSlot: runtimePilot?.slot || null,
    playerReachability: 'not-established-by-asset-indices',
  };
}

function normalizeFamilyId(value, fallback) {
  const clean = String(value || fallback || '').replace(/_lod[12]$/i, '');
  return clean || String(fallback || 'unknown');
}

function variantForAsset({ release, part, assetExtras, sourceMeta }) {
  const explicit = part?.lod || part?.variant || assetExtras?.lod || assetExtras?.variant;
  if (explicit) return String(explicit).toLowerCase();
  const match = /(?:_|-)lod([012])(?:\.|_|$)/i.exec(`${release.id} ${release.source}`);
  if (match) return `lod${match[1]}`;
  if (sourceMeta?.lodTriangles?.lod0 > 0) return 'lod0';
  return 'default';
}

function packageIdentityMatches(pilot, metadata) {
  if (!pilot || !metadata?.metadataPresent) return null;
  const checks = [];
  if (pilot.expectedContentHash && metadata.metadataContentHash) checks.push(pilot.expectedContentHash === metadata.metadataContentHash);
  if (pilot.expectedRuntimeHash && metadata.metadataRuntimeHash) checks.push(pilot.expectedRuntimeHash === metadata.metadataRuntimeHash);
  return checks.length ? checks.every(Boolean) : null;
}

function eligibilityForPilot(pilot, metadata, release) {
  if (pilot.sourceSha256 && release.releaseSha256 && pilot.sourceSha256 !== release.releaseSha256) {
    return { status: 'indexed-source-hash-mismatch', runtimeAssetId: pilot.runtimeAssetId || null };
  }
  if (!metadata?.metadataPresent) return { status: 'indexed-metadata-missing', metadataUrl: pilot.metadataUrl || null };
  const identityMatches = packageIdentityMatches(pilot, metadata);
  return {
    status: identityMatches === false ? 'indexed-package-hash-mismatch' : identityMatches === true ? 'indexed-package-hash-match' : 'indexed-package-metadata-unverified',
    metadataUrl: pilot.metadataUrl || null,
    runtimeUrl: metadata.metadataRuntimeUrl || null,
    runtimeSlot: metadata.metadataRuntimeSlot || null,
  };
}

function fillDiagnosticFindings(row) {
  if (!row.release.sha256 || !row.source.sha256) row.diagnosticFindings.push('release_or_source_hash_missing');
  if (row.release.byteCountMatchesManifest === false) row.diagnosticFindings.push('release_byte_count_mismatch');
  if (row.sourceMetadata.glbJsonPresent !== true) row.diagnosticFindings.push('glb_json_metadata_unavailable');
  if (row.runtimePackageEligibility.status === 'indexed-source-hash-mismatch'
    || row.runtimePackageEligibility.status === 'indexed-package-hash-mismatch') {
    row.diagnosticFindings.push('runtime_package_identity_mismatch');
  }
}

function compactExtras(extras) {
  if (!extras || typeof extras !== 'object' || Array.isArray(extras)) return null;
  return Object.fromEntries(Object.entries(extras)
    .filter(([, value]) => value == null || ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 24));
}

function auditSummary(gfxAudit, release) {
  if (!gfxAudit) return null;
  const row = gfxAudit.rowsByFile[normalizePath(release.source)]
    || gfxAudit.rowsByFile[normalizePath(release.release)];
  if (!row) return null;
  return {
    path: gfxAudit.path,
    inputHash: gfxAudit.sha256,
    reportedFile: row.file || null,
    reportedBytes: row.bytes ?? null,
    currentReleaseBytes: release.releaseBytes ?? null,
    byteCountMatches: Number.isFinite(row.bytes) && Number.isFinite(release.releaseBytes)
      ? row.bytes === release.releaseBytes : null,
    limitation: 'Prior audit joined by path/byte count; no source GLB hash is recorded, so not current geometry evidence.',
  };
}

async function readGlbJsonMetadata(root, relativePath) {
  const absolute = path.resolve(root, relativePath);
  let handle;
  try {
    handle = await open(absolute, 'r');
    const header = Buffer.alloc(20);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 20 || header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2) {
      return { glbJsonPresent: false, error: 'not-glb-v2' };
    }
    const jsonLength = header.readUInt32LE(12);
    const jsonType = header.readUInt32LE(16);
    if (jsonType !== 0x4e4f534a || jsonLength < 2 || jsonLength > 8 * 1024 * 1024) {
      return { glbJsonPresent: false, error: 'invalid-or-oversized-json-chunk' };
    }
    const chunk = Buffer.alloc(jsonLength);
    const result = await handle.read(chunk, 0, jsonLength, 20);
    if (result.bytesRead !== jsonLength) return { glbJsonPresent: false, error: 'truncated-json-chunk' };
    const gltf = JSON.parse(chunk.toString('utf8').replace(/\0+$/g, '').trim());
    const materials = Array.isArray(gltf.materials) ? gltf.materials : [];
    const materialChannels = materials.map((material, index) => ({
      index,
      name: material.name || null,
      channels: [
        material.pbrMetallicRoughness?.baseColorTexture && 'baseColor',
        material.pbrMetallicRoughness?.metallicRoughnessTexture && 'metallicRoughness',
        material.normalTexture && 'normal',
        material.occlusionTexture && 'occlusion',
        material.emissiveTexture && 'emissive',
      ].filter(Boolean),
    }));
    return {
      glbJsonPresent: true,
      gltfVersion: gltf.asset?.version || null,
      gltfAsset: gltf.asset || null,
      nodeCount: gltf.nodes?.length ?? 0,
      meshCount: gltf.meshes?.length ?? 0,
      primitiveCount: (gltf.meshes || []).reduce((sum, mesh) => sum + (mesh.primitives?.length || 0), 0),
      animationCount: gltf.animations?.length ?? 0,
      materialCount: materials.length,
      materialChannels,
      lodTriangles: collectLodTriangleCounts(gltf),
    };
  } catch (error) {
    return { glbJsonPresent: false, error: error?.code || error?.name || 'metadata-read-error' };
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function statOptional(filePath) {
  try { return await stat(filePath); } catch { return null; }
}

async function mapLimit(items, limit, mapper) {
  const result = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(items.length || 1, Number(limit) || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      result[index] = await mapper(items[index], index);
    }
  }));
  return result;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function polygonPhysicsMetrics(vertices, scale = 1) {
  if (!Array.isArray(vertices) || vertices.length < 3 || !(Number.isFinite(scale) && scale > 0)) return null;
  let twiceArea = 0;
  let polarMomentTimes12 = 0;
  let centroidXTimes6 = 0;
  let centroidZTimes6 = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (![a?.x, a?.z, b?.x, b?.z].every(Number.isFinite)) return null;
    const cross = a.x * b.z - b.x * a.z;
    twiceArea += cross;
    centroidXTimes6 += (a.x + b.x) * cross;
    centroidZTimes6 += (a.z + b.z) * cross;
    polarMomentTimes12 += cross * (
      a.x * a.x + a.x * b.x + b.x * b.x
      + a.z * a.z + a.z * b.z + b.z * b.z
    );
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minZ = Math.min(minZ, a.z);
    maxZ = Math.max(maxZ, a.z);
  }
  if (Math.abs(twiceArea) < 1e-10) return null;
  const signedArea = twiceArea / 2;
  const area = Math.abs(signedArea) * scale * scale;
  const centroidScale = scale / (3 * twiceArea);
  const polarMoment = Math.abs(polarMomentTimes12 / 12) * scale ** 4;
  return {
    vertexCount: vertices.length,
    areaWu2: area,
    centroidWu: { x: centroidXTimes6 * centroidScale, z: centroidZTimes6 * centroidScale },
    polarMomentWu4: polarMoment,
    yawInertiaPerMassWu2: polarMoment / area,
    boundsWu: {
      minX: minX * scale,
      maxX: maxX * scale,
      minZ: minZ * scale,
      maxZ: maxZ * scale,
      widthX: (maxX - minX) * scale,
      widthZ: (maxZ - minZ) * scale,
    },
    method: 'uniform-area polygon moment about authored origin',
  };
}

export function selectAssetPhysicsShipIds(ids, { shardIndex = null, shardCount = null } = {}) {
  let selected = [...new Set(ids || SHIPS.map((ship) => ship.id))].sort();
  if (shardIndex == null && shardCount == null) return selected;
  if (!Number.isInteger(shardIndex) || !Number.isInteger(shardCount)
    || shardCount < 1 || shardIndex < 0 || shardIndex >= shardCount) {
    throw new RangeError('shard must be specified as an index in [0, shardCount) with shardCount >= 1');
  }
  return selected.filter((_, index) => index % shardCount === shardIndex);
}

export function buildAssetPhysicsInventory({ partsManifest, releaseManifest, shipIds = null }) {
  const selectedIds = selectAssetPhysicsShipIds(shipIds || SHIPS.map((ship) => ship.id));
  const parts = Array.isArray(partsManifest?.parts) ? partsManifest.parts : [];
  const releases = Array.isArray(releaseManifest?.assets) ? releaseManifest.assets : [];
  const partByFile = new Map(parts.map((row) => [normalizePath(row.file), row]));
  const releaseBySource = new Map(releases.map((row) => [normalizePath(row.source), row]));
  const releaseByFile = new Map(releases.map((row) => [normalizePath(row.release), row]));
  const archetypes = new Map(shipArchetypesForPrecompile().map((row) => [row.defId, row]));
  const requiredWholeShips = new Set(REQUIRED_WHOLE_SHIP_DEF_IDS);
  const shipsById = new Map(SHIPS.map((ship) => [ship.id, ship]));
  const rows = [];

  for (const shipId of selectedIds) {
    const ship = shipsById.get(shipId);
    if (!ship) {
      rows.push({ shipId, diagnosticFindings: ['unknown_ship_id'] });
      continue;
    }
    const stats = getDerivedStats(ship.id, [], null);
    const archetype = archetypes.get(ship.id) || null;
    const selectedWholeShip = wholeShipVisualForEntity({
      type: 'ship',
      data: { defId: ship.id },
    }, { requiredWholeShip: true });
    const wholeShipFile = normalizePath(selectedWholeShip?.file || archetype?.wholeShipFile || '');
    const wholeShipAsset = wholeShipFile ? assetIdentityForFile(wholeShipFile, partByFile, releaseBySource) : null;
    const wholeShipReleaseUrl = wholeShipFile ? `${RENDER_PARTS_PREFIX}${wholeShipFile}` : null;
    const pilot = wholeShipReleaseUrl ? renderPackagePilotForSourceUrl(wholeShipReleaseUrl) : null;
    const modularHullFile = normalizePath(archetype?.hullFile || '');
    const modularHullAsset = modularHullFile ? assetIdentityForFile(modularHullFile, partByFile, releaseBySource) : null;

    const truth = modelTruthRow(ship.id);
    const proxyEntity = { type: 'ship', radius: Number(ship.collisionRadius) || 1, data: { defId: ship.id } };
    const proxy = resolveCollisionProxyManifest(proxyEntity);
    const outline = proxy?.compactHull || proxy?.planarPolygon
      || (proxy?.sourceRow ? modelTruthSkinPolygon(proxy.sourceRow) : null);
    const proxyScale = proxy ? proxyScaleFor(proxyEntity, proxy) : Number(ship.collisionRadius) || 1;
    const collisionGeometry = polygonPhysicsMetrics(outline, proxyScale);
    const renderBounds = truth?.worldSize && truth.worldSize.length >= 3
      ? { widthX: truth.worldSize[0], heightY: truth.worldSize[1], widthZ: truth.worldSize[2], source: 'model-truth worldSize (runtime-scaled render bounds)' }
      : null;
    const boundsDelta = collisionGeometry && renderBounds
      ? comparePlanarBounds(collisionGeometry.boundsWu, renderBounds)
      : null;
    const materialId = ship.physicsBody?.material || 'ship';
    const material = PHYSICS_MATERIALS[materialId] || null;
    const diagnostics = [];
    if (!proxy) diagnostics.push('legacy_or_unmeasured_collision_proxy');
    if (!collisionGeometry) diagnostics.push('collision_footprint_moment_unavailable');
    if (!truth) diagnostics.push('model_truth_row_missing');
    if (!wholeShipAsset?.releasePath || !wholeShipAsset?.releaseSha256 || !pilot) {
      diagnostics.push('whole_ship_release_or_package_identity_missing');
    }

    const expectedGeometryInertia = collisionGeometry
      ? stats.operationalMass * collisionGeometry.yawInertiaPerMassWu2
      : null;
    rows.push({
      shipId: ship.id,
      label: ship.name,
      usage: { role: ship.role || null, tier: ship.tier ?? null, flightClass: stats.flightClass || null },
      scope: 'canonical player hull; physics mass/material are not inferred for decorative or test-only assets',
      renderSelection: {
        wholeShip: selectedWholeShip ? {
          file: wholeShipFile,
          assetId: selectedWholeShip.assetId,
          roleId: selectedWholeShip.roleId,
          required: selectedWholeShip.required === true,
          requiredRosterMember: requiredWholeShips.has(ship.id),
          runtimePackage: pilot ? {
            runtimeAssetId: pilot.runtimeAssetId,
            packageAssetId: pilot.assetId,
            packageKey: pilot.key,
            sourceUrl: pilot.sourceUrl,
            sourceSha256: pilot.sourceSha256,
            expectedContentHash: pilot.expectedContentHash,
          } : null,
          lodFamily: lodFamilyIdentity(selectedWholeShip.lodFamily || wholeShipAsset?.part?.lodFamily, partByFile, releaseBySource),
          assetIdentity: wholeShipAsset,
        } : null,
        modularFallbackHull: modularHullAsset,
      },
      physics: {
        mass: {
          authoredDryHullMass: Number.isFinite(ship.mass) ? ship.mass : null,
          defaultDerivedMass: Number.isFinite(stats.mass) ? stats.mass : null,
          defaultOperationalMass: Number.isFinite(stats.operationalMass) ? stats.operationalMass : null,
          basis: 'getDerivedStats(shipId, [], null); default empty fitting and cargo state',
        },
        collisionProxy: proxy ? {
          id: proxy.id || null,
          measured: !!proxy.sourceRow,
          geometryKind: proxy.compactHull ? 'compactHull' : (proxy.planarPolygon ? 'planarPolygon' : (proxy.sourceRow ? 'measured-source-no-planar-outline' : 'legacy')),
          primitiveCount: Array.isArray(proxy.primitives) ? proxy.primitives.length : null,
          sourceModelTruthId: truth?.id || null,
          sourceAssetUrl: truth?.url || null,
          proxyScaleWu: proxyScale,
          uniformAreaFootprint: collisionGeometry,
        } : { id: null, measured: false, geometryKind: 'legacy-or-default' },
        centerOfMass: {
          authored: ship.physicsBody?.centerOfMass || null,
          runtimeDefaultWu: ship.physicsBody?.centerOfMass || { x: 0, y: 0, z: 0 },
          renderPivot: truth?.pivot || null,
          note: ship.physicsBody?.centerOfMass
            ? 'physicsBody authored center of mass'
            : 'no per-hull COM authored; SG-02 normalized body defaults to entity origin',
        },
        yawInertia: {
          derivedFlightModel: Number.isFinite(stats.flightModel?.inertia) ? stats.flightModel.inertia : null,
          geometricUniformAreaEstimate: expectedGeometryInertia,
          classScale: collisionGeometry && stats.operationalMass > 0
            ? stats.flightModel.inertia / expectedGeometryInertia
            : null,
          note: collisionGeometry
            ? 'uniform-area estimate about authored origin; game inertia includes flight-class scale'
            : 'census-free legacy fallback currently owns inertia; physical dimension moment unknown',
        },
        material: {
          materialId,
          parameters: material ? serializableMaterial(material) : null,
          densityOrigin: material ? 'canonical PHYSICS_MATERIALS entry; no density inferred from textures' : 'unknown',
        },
      },
      boundsAgreement: boundsDelta,
      sourceIdentity: {
        modelTruth: truth ? {
          id: truth.id,
          url: truth.url,
          meshHash: truth.meshHash || null,
          sourceBounds: truth.bounds || null,
          drawScale: truth.drawScale ?? null,
          drawOffset: truth.drawOffset || null,
          pivot: truth.pivot || null,
          worldSize: truth.worldSize || null,
        } : null,
        partsManifest: PARTS_MANIFEST_PATH,
        releaseManifest: RELEASE_MANIFEST_PATH,
      },
      diagnosticFindings: diagnostics,
    });
  }

  const rankedBounds = rows
    .filter((row) => Number.isFinite(row.boundsAgreement?.maxRelativeDelta))
    .sort((a, b) => b.boundsAgreement.maxRelativeDelta - a.boundsAgreement.maxRelativeDelta)
    .slice(0, 5)
    .map((row) => ({ shipId: row.shipId, maxRelativeDelta: row.boundsAgreement.maxRelativeDelta,
      xRelativeDelta: row.boundsAgreement.xRelativeDelta, zRelativeDelta: row.boundsAgreement.zRelativeDelta }));
  return {
    schema: 'spaceface.assetPhysicsInventory.v1',
    scope: {
      shipIds: selectedIds,
      rowCount: rows.length,
      catalogCount: SHIPS.length,
      ignoredAssets: 'Non-ship decorative, test-only, and asset-bank entries are not assigned mass/material by this inventory.',
      boundsThreshold: 'None; planar extent differences are ranked for inspection without a pass/fail cutoff.',
    },
    summary: {
      canonicalShipRows: rows.length,
      catalogShipCount: SHIPS.length,
      measuredCollisionSkin: rows.filter((row) => row.physics?.collisionProxy?.measured).length,
      missingWholeShipIdentity: rows.filter((row) => row.diagnosticFindings?.includes('whole_ship_release_or_package_identity_missing')).map((row) => row.shipId),
      largestPlanarRenderCollisionDeltas: rankedBounds,
    },
    rows,
  };
}

function assetIdentityForFile(file, partByFile, releaseBySource) {
  const part = partByFile.get(normalizePath(file)) || null;
  const source = `${SOURCE_PARTS_PREFIX}${normalizePath(file)}`;
  const release = releaseBySource.get(source) || null;
  return {
    file: normalizePath(file),
    partId: part?.id || null,
    category: part?.category || null,
    partBounds: part?.bounds || null,
    partLodFamily: part?.lodFamily || null,
    sourcePath: release?.source || (part ? source : null),
    releasePath: release?.release || null,
    sourceSha256: release?.sourceSha256 || null,
    releaseSha256: release?.releaseSha256 || null,
    sourceBytes: release?.sourceBytes ?? part?.bytes ?? null,
    releaseBytes: release?.releaseBytes ?? null,
    identityResolved: !!(part && release),
  };
}

function lodFamilyIdentity(family, partByFile, releaseBySource) {
  if (!family || typeof family !== 'object') return null;
  return Object.fromEntries(Object.entries(family).map(([level, file]) => [
    level,
    assetIdentityForFile(normalizePath(file), partByFile, releaseBySource),
  ]));
}

function comparePlanarBounds(collision, render) {
  const xRelativeDelta = Math.abs(collision.widthX - render.widthX) / Math.max(1e-9, render.widthX);
  const zRelativeDelta = Math.abs(collision.widthZ - render.widthZ) / Math.max(1e-9, render.widthZ);
  return {
    coordinateBasis: 'world units from collision proxy vs model-truth runtime-scaled render bounds',
    collision: { widthX: collision.widthX, widthZ: collision.widthZ },
    render: { widthX: render.widthX, widthZ: render.widthZ, heightY: render.heightY },
    xDeltaWu: collision.widthX - render.widthX,
    zDeltaWu: collision.widthZ - render.widthZ,
    xRelativeDelta,
    zRelativeDelta,
    maxRelativeDelta: Math.max(xRelativeDelta, zRelativeDelta),
  };
}

function serializableMaterial(material) {
  const out = {};
  for (const [key, value] of Object.entries(material)) {
    if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value;
  }
  return out;
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}
