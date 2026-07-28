#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { auditEmbeddedTextureChannels } from '../tools/art/lib/textureChannelAudit.mjs';
import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';

const DEFAULT_TARGETS = [
  'assets/ships/parts/wholeships/ashline_dart.glb',
  'assets/ships/parts/wholeships/ashline_lode.glb',
  'assets/ships/parts/wholeships/ashline_rig.glb',
  'assets/ships/parts/wholeships/helios_lark.glb',
  'assets/ships/parts/wholeships/helios_cradle.glb',
  'assets/ships/parts/wholeships/helios_span.glb',
  'assets/ships/parts/wholeships/wasp_production_v1.glb',
  'assets/ships/parts/wholeships/pelican.glb',
  'assets/ships/parts/weapons/weapon_gatling.glb',
];

function parseArguments(argv) {
  const options = { inputs: [], out: null, strict: false, json: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--out') {
      options.out = argv[++index];
      if (!options.out) throw new Error('--out requires a file path');
    } else if (argument === '--strict') {
      options.strict = true;
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument.startsWith('-')) {
      throw new Error(`unknown option ${argument}`);
    } else {
      options.inputs.push(argument);
    }
  }
  return options;
}

function usage() {
  return [
    'Usage: node scripts/audit-texture-channels.mjs [options] [source.glb ...]',
    '',
    'Options:',
    '  --out <report.json>  Write the complete machine-readable report.',
    '  --json               Print the complete report instead of the concise summary.',
    '  --strict             Exit nonzero when a correctness error is found.',
    '',
    'With no input paths, audits the live Ashline, Helios, Wasp, Pelican, and Gatling source GLBs.',
  ].join('\n');
}

function displayPath(path) {
  const local = relative(process.cwd(), path);
  return local && !local.startsWith('..') ? local : path;
}

const options = parseArguments(process.argv.slice(2));
if (options.help) {
  console.log(usage());
  process.exit(0);
}

const inputPaths = (options.inputs.length ? options.inputs : DEFAULT_TARGETS).map((path) => resolve(path));
const assets = [];
for (const inputPath of inputPaths) {
  const label = displayPath(inputPath);
  try {
    const parsed = parseStrictEmbeddedGlb(readFileSync(inputPath), label);
    assets.push(await auditEmbeddedTextureChannels(parsed, label));
  } catch (error) {
    assets.push({
      label,
      summary: { materials: 0, images: 0, boundImages: 0, errors: 1, warnings: 0, info: 0 },
      findings: [{
        severity: 'error',
        code: 'asset-audit-failure',
        message: error.message,
      }],
      images: [],
    });
  }
}

const totals = assets.reduce((summary, asset) => {
  for (const key of Object.keys(summary)) summary[key] += asset.summary[key] || 0;
  return summary;
}, { assets: 0, materials: 0, images: 0, boundImages: 0, errors: 0, warnings: 0, info: 0 });
totals.assets = assets.length;

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  inputs: inputPaths.map(displayPath),
  totals,
  assets,
};

if (options.out) {
  const outputPath = resolve(options.out);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const asset of assets) {
    const { summary } = asset;
    console.log(
      `${asset.label}: ${summary.images} images, ${summary.boundImages} bound, `
        + `${summary.errors} errors, ${summary.warnings} warnings, ${summary.info} info`,
    );
    for (const finding of asset.findings.filter((entry) => entry.severity !== 'info')) {
      console.log(`  ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
    }
  }
  console.log(
    `Texture audit: ${totals.assets} assets, ${totals.images} images, `
      + `${totals.errors} errors, ${totals.warnings} warnings, ${totals.info} info`,
  );
  if (options.out) console.log(`Report: ${displayPath(resolve(options.out))}`);
}

if (options.strict && totals.errors > 0) process.exitCode = 1;
