#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeRenderPackageContentHash,
  stableJsonStringify,
  validateRenderPackage,
} from '../src/contracts/renderPackage.js';
import {
  compileRenderPackage,
  normalizeSemanticManifest,
} from './lib/renderPackageCompiler.mjs';

const METADATA_FILE = 'render-package.json';
const RENDER_FILE = 'render.glb';

export async function compareRenderPackageDirectories(leftDir, rightDir) {
  const leftRoot = resolve(leftDir);
  const rightRoot = resolve(rightDir);
  const [leftMetadataBytes, rightMetadataBytes, leftRenderBytes, rightRenderBytes] = await Promise.all([
    readFile(resolve(leftRoot, METADATA_FILE)),
    readFile(resolve(rightRoot, METADATA_FILE)),
    readFile(resolve(leftRoot, RENDER_FILE)),
    readFile(resolve(rightRoot, RENDER_FILE)),
  ]);
  const issues = [];
  const leftMetadata = parseMetadata(leftMetadataBytes, leftRoot, issues, 'left');
  const rightMetadata = parseMetadata(rightMetadataBytes, rightRoot, issues, 'right');
  checkRenderIntegrity('left', leftMetadata, leftRenderBytes, issues);
  checkRenderIntegrity('right', rightMetadata, rightRenderBytes, issues);
  await Promise.all([
    checkContentIdentity('left', leftMetadata, issues),
    checkContentIdentity('right', rightMetadata, issues),
  ]);

  const metadataIdentical = leftMetadataBytes.equals(rightMetadataBytes);
  const renderIdentical = leftRenderBytes.equals(rightRenderBytes);
  if (!metadataIdentical) issues.push({ code: 'metadata-bytes', message: 'render-package.json files are not byte-identical' });
  if (!renderIdentical) issues.push({ code: 'render-bytes', message: 'render.glb files are not byte-identical' });
  if (leftMetadata && rightMetadata && leftMetadata.contentHash !== rightMetadata.contentHash) {
    issues.push({
      code: 'content-hash',
      message: `content hashes differ: ${leftMetadata.contentHash} != ${rightMetadata.contentHash}`,
    });
  }
  if (leftMetadata && rightMetadata && leftMetadata.render.sha256 !== rightMetadata.render.sha256) {
    issues.push({
      code: 'render-hash',
      message: `declared render hashes differ: ${leftMetadata.render.sha256} != ${rightMetadata.render.sha256}`,
    });
  }

  return {
    schema: 'spaceface.renderPackageEquivalence.v1',
    ok: issues.length === 0,
    byteIdentical: metadataIdentical && renderIdentical,
    left: summarize(leftRoot, leftMetadataBytes, leftRenderBytes, leftMetadata),
    right: summarize(rightRoot, rightMetadataBytes, rightRenderBytes, rightMetadata),
    issues,
  };
}

export async function compareRenderPackageToSource(packageDir, options = {}) {
  const packageRoot = resolve(packageDir);
  const sourceGlbPath = resolveRequiredPath(options.sourceGlbPath, 'sourceGlbPath');
  const sourceManifestPath = options.sourceManifestPath ? resolve(options.sourceManifestPath) : null;
  const [metadataBytes, renderBytes, sourceBytes, sourceManifestBytes] = await Promise.all([
    readFile(resolve(packageRoot, METADATA_FILE)),
    readFile(resolve(packageRoot, RENDER_FILE)),
    readFile(sourceGlbPath),
    sourceManifestPath ? readFile(sourceManifestPath) : Promise.resolve(null),
  ]);
  const issues = [];
  const metadata = parseMetadata(metadataBytes, packageRoot, issues, 'package');
  checkRenderIntegrity('package', metadata, renderBytes, issues);
  await checkContentIdentity('package', metadata, issues);

  let semanticManifest = null;
  try {
    semanticManifest = normalizeSemanticManifest(await resolveSemanticManifest(options.semanticManifest));
  } catch (error) {
    issues.push({ code: 'semantic-manifest', message: error?.message || String(error) });
  }

  if (metadata) {
    compareDeclaredFile('source-glb-provenance', metadata.provenance?.sourceGlb, sourceBytes, issues);
    if (metadata.provenance?.sourceManifest) {
      if (!sourceManifestBytes) {
        issues.push({
          code: 'source-manifest-missing',
          message: 'package declares a source manifest but no sourceManifestPath was provided',
        });
      } else {
        compareDeclaredFile(
          'source-manifest-provenance',
          metadata.provenance.sourceManifest,
          sourceManifestBytes,
          issues,
        );
      }
    } else if (sourceManifestBytes) {
      issues.push({
        code: 'source-manifest-unexpected',
        message: 'a source manifest was provided but the package declares no source manifest provenance',
      });
    }
    if (semanticManifest) {
      const semanticHash = sha256(Buffer.from(stableJsonStringify(semanticManifest)));
      if (semanticHash !== metadata.provenance?.semantics?.sha256) {
        issues.push({
          code: 'semantic-provenance',
          message: `semantic manifest SHA-256 differs: ${semanticHash} != ${metadata.provenance?.semantics?.sha256 || '(missing)'}`,
        });
      }
      if (semanticManifest.assetId !== metadata.assetId || semanticManifest.kind !== metadata.kind) {
        issues.push({
          code: 'semantic-identity',
          message: `semantic identity ${semanticManifest.assetId}/${semanticManifest.kind} differs from package ${metadata.assetId}/${metadata.kind}`,
        });
      }
    }
  }

  let rebuild = null;
  if (metadata && semanticManifest) {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'spaceface-render-package-equivalence-'));
    const rebuildDir = join(temporaryRoot, 'rebuild');
    try {
      await compileRenderPackage({
        assetId: metadata.assetId,
        sourceGlbPath,
        sourceUri: metadata.provenance.sourceGlb.uri,
        sourceManifestPath,
        sourceManifestUri: metadata.provenance.sourceManifest?.uri,
        semanticManifest,
        outputDir: rebuildDir,
      });
      rebuild = await compareRenderPackageDirectories(packageRoot, rebuildDir);
      if (!rebuild.ok) {
        issues.push({
          code: 'source-rebuild',
          message: 'package is not byte-identical to a deterministic rebuild from the declared source inputs',
          details: rebuild.issues,
        });
      }
    } catch (error) {
      issues.push({ code: 'source-rebuild-error', message: error?.message || String(error) });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  return {
    schema: 'spaceface.renderPackageSourceEquivalence.v1',
    ok: issues.length === 0,
    package: summarize(packageRoot, metadataBytes, renderBytes, metadata),
    source: {
      glb: summarizeBytes(sourceGlbPath, sourceBytes),
      manifest: sourceManifestBytes ? summarizeBytes(sourceManifestPath, sourceManifestBytes) : null,
      semanticsSha256: semanticManifest
        ? sha256(Buffer.from(stableJsonStringify(semanticManifest)))
        : null,
    },
    rebuild,
    issues,
  };
}

function parseMetadata(bytes, root, issues, side) {
  let metadata;
  try {
    metadata = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    issues.push({ code: `${side}-metadata-json`, message: `${root}/${METADATA_FILE}: ${error.message}` });
    return null;
  }
  const validation = validateRenderPackage(metadata, { file: `${root}/${METADATA_FILE}` });
  if (!validation.ok) {
    issues.push({
      code: `${side}-metadata-schema`,
      message: `${side} metadata failed schema validation`,
      details: validation.issues,
    });
  }
  return metadata;
}

function checkRenderIntegrity(side, metadata, renderBytes, issues) {
  if (!metadata?.render) return;
  const actualHash = sha256(renderBytes);
  if (renderBytes.length !== metadata.render.bytes || actualHash !== metadata.render.sha256) {
    issues.push({
      code: `${side}-render-integrity`,
      message: `${side} render.glb does not match its declared byte length and SHA-256`,
      expected: { bytes: metadata.render.bytes, sha256: metadata.render.sha256 },
      actual: { bytes: renderBytes.length, sha256: actualHash },
    });
  }
}

async function checkContentIdentity(side, metadata, issues) {
  if (!metadata) return;
  try {
    const actualHash = await computeRenderPackageContentHash(metadata, {
      digest: (bytes) => sha256(Buffer.from(bytes)),
    });
    if (actualHash !== metadata.contentHash) {
      issues.push({
        code: `${side}-content-integrity`,
        message: `${side} metadata does not match its declared content hash`,
        expected: metadata.contentHash,
        actual: actualHash,
      });
    }
  } catch (error) {
    issues.push({
      code: `${side}-content-integrity-error`,
      message: error?.message || String(error),
    });
  }
}

function compareDeclaredFile(code, declaration, bytes, issues) {
  if (!declaration) {
    issues.push({ code, message: `${code} declaration is missing` });
    return;
  }
  const actual = { bytes: bytes.length, sha256: sha256(bytes) };
  if (actual.bytes !== declaration.bytes || actual.sha256 !== declaration.sha256) {
    issues.push({
      code,
      message: `${code} bytes do not match package provenance`,
      expected: { bytes: declaration.bytes, sha256: declaration.sha256 },
      actual,
    });
  }
}

async function resolveSemanticManifest(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string' && value) return JSON.parse(await readFile(resolve(value), 'utf8'));
  throw new Error('source equivalence requires semanticManifest data or a semantic manifest path');
}

function summarize(root, metadataBytes, renderBytes, metadata) {
  return {
    directory: root.replace(/\\/g, '/'),
    contentHash: metadata?.contentHash || null,
    metadataBytes: metadataBytes.length,
    metadataSha256: sha256(metadataBytes),
    renderBytes: renderBytes.length,
    renderSha256: sha256(renderBytes),
  };
}

function summarizeBytes(path, bytes) {
  return {
    path: resolve(path).replace(/\\/g, '/'),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function resolveRequiredPath(value, name) {
  if (typeof value !== 'string' || !value) throw new Error(`source equivalence requires ${name}.`);
  return resolve(value);
}

function parseArgs(argv) {
  const options = {
    left: null,
    right: null,
    packageDir: null,
    source: null,
    semantic: null,
    sourceManifest: null,
    json: false,
  };
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === '--left') options.left = argv[++index];
    else if (token === '--right') options.right = argv[++index];
    else if (token === '--package') options.packageDir = argv[++index];
    else if (token === '--source') options.source = argv[++index];
    else if (token === '--semantic') options.semantic = argv[++index];
    else if (token === '--source-manifest') options.sourceManifest = argv[++index];
    else if (token === '--json') options.json = true;
    else if (token === '--help' || token === '-h') options.help = true;
    else positional.push(token);
  }
  options.left ||= positional[0] || null;
  options.right ||= positional[1] || null;
  return options;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }
  try {
    let report;
    if (options.packageDir || options.source || options.semantic) {
      if (!options.packageDir || !options.source || !options.semantic) {
        printUsage();
        return 2;
      }
      report = await compareRenderPackageToSource(options.packageDir, {
        sourceGlbPath: options.source,
        sourceManifestPath: options.sourceManifest,
        semanticManifest: options.semantic,
      });
    } else {
      if (!options.left || !options.right) {
        printUsage();
        return 2;
      }
      report = await compareRenderPackageDirectories(options.left, options.right);
    }
    if (options.json || !report.ok) console.log(JSON.stringify(report, null, 2));
    else if (report.schema === 'spaceface.renderPackageSourceEquivalence.v1') {
      console.log(`Render package matches source and deterministic rebuild: ${report.package.contentHash}`);
    } else {
      console.log(`Render packages are byte-identical: ${report.left.contentHash}`);
    }
    return report.ok ? 0 : 1;
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    return 2;
  }
}

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/check-render-package-equivalence.mjs --left <build-dir> --right <build-dir> [--json]');
  console.log('  node scripts/check-render-package-equivalence.mjs --package <build-dir> --source <source.glb> --semantic <source.json> [--source-manifest <manifest>] [--json]');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await main(process.argv.slice(2));
