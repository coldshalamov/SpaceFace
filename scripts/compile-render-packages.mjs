#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { compileRenderPackage } from './lib/renderPackageCompiler.mjs';

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }
  const missing = ['assetId', 'source', 'semantic', 'output'].filter((key) => !options[key]);
  if (missing.length) {
    printUsage();
    console.error(`Missing required arguments: ${missing.join(', ')}`);
    return 2;
  }

  try {
    const semanticManifest = JSON.parse(await readFile(resolve(options.semantic), 'utf8'));
    const result = await compileRenderPackage({
      assetId: options.assetId,
      sourceGlbPath: resolve(options.source),
      sourceUri: options.sourceUri || undefined,
      sourceManifestPath: options.sourceManifest ? resolve(options.sourceManifest) : undefined,
      sourceManifestUri: options.sourceManifestUri || undefined,
      semanticManifest,
      outputDir: resolve(options.output),
    });
    const receipt = {
      schema: 'spaceface.renderPackageCompileReceipt.v1',
      assetId: result.package.assetId,
      contentHash: result.package.contentHash,
      renderSha256: result.package.render.sha256,
      renderBytes: result.package.render.bytes,
      metadataBytes: result.metadataBytes,
      outputDir: resolve(options.output).replace(/\\/g, '/'),
    };
    if (options.json) console.log(JSON.stringify(receipt));
    else {
      console.log(`Compiled ${receipt.assetId}`);
      console.log(`  content: ${receipt.contentHash}`);
      console.log(`  render:  ${receipt.renderSha256} (${receipt.renderBytes} bytes)`);
      console.log(`  output:  ${receipt.outputDir}`);
    }
    return 0;
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    return 1;
  }
}

function parseArgs(argv) {
  const options = {
    assetId: null,
    source: null,
    sourceUri: null,
    sourceManifest: null,
    sourceManifestUri: null,
    semantic: null,
    output: null,
    json: false,
    help: false,
  };
  const valueFlags = new Map([
    ['--asset-id', 'assetId'],
    ['--source', 'source'],
    ['--source-uri', 'sourceUri'],
    ['--source-manifest', 'sourceManifest'],
    ['--source-manifest-uri', 'sourceManifestUri'],
    ['--semantic', 'semantic'],
    ['--output', 'output'],
  ]);
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (valueFlags.has(token)) options[valueFlags.get(token)] = argv[++index] || null;
    else if (token === '--json') options.json = true;
    else if (token === '--help' || token === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return options;
}

function printUsage() {
  console.log('Usage: node scripts/compile-render-packages.mjs --asset-id <id> --source <source.glb> --semantic <source.json> --output <directory> [--source-uri <uri>] [--source-manifest <manifest>] [--source-manifest-uri <uri>] [--json]');
}

process.exitCode = await main(process.argv.slice(2));
