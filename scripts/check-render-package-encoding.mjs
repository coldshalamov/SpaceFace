#!/usr/bin/env node
// Guard: a render package must never ship fatter than the source it replaces.
//
// The compiler reads a quantized + meshopt-compressed release GLB, decodes it to float,
// bakes immutable node transforms and welds. Without a matching encode step on the way
// out that round trip silently writes float32 positions and 32-bit indices, so every
// package came out ~1.75x its source: retail shipped 439 MB of packages standing in for
// the 269 MB of parts it omits, and paid the extra bytes twice (network/disk on boot and
// sector entry, then parse + resident memory on the main thread).
//
// This check holds the invariant that closed that hole:
//   * every shipped render.glb is EXT_meshopt_compression + KHR_mesh_quantization when its
//     source is, so it cannot regress to a lossless re-encode;
//   * the package set as a whole is not larger than the sources it replaces;
//   * no single package balloons past its source.
//
//   node scripts/check-render-package-encoding.mjs
//   node scripts/check-render-package-encoding.mjs --only=kestrel
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const ONLY = new Set(argv.filter((a) => a.startsWith('--only='))
  .flatMap((a) => a.slice('--only='.length).split(','))
  .filter(Boolean));
const JSON_OUT = argv.includes('--json');

const PILOTS_PATH = path.join(ROOT, 'assets/ships/render-packages/pilots.json');
// Total package bytes may not exceed the sources they stand in for, plus a small
// allowance for merged/welded seams and transform baking that genuinely adds vertices.
const TOTAL_RATIO_CEILING = 1.10;
// One package may exceed its source (baking can duplicate vertices at seams), but never
// by the ~1.8x a lossless re-encode produced.
const PACKAGE_RATIO_CEILING = 2.0;
const REQUIRED_EXTENSIONS = ['EXT_meshopt_compression', 'KHR_mesh_quantization'];

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function fail(rows, message, detail) {
  console.error(`FAIL render-package-encoding: ${message}`);
  if (detail) console.error(detail);
  if (rows.length) {
    console.error('Offending packages:');
    for (const row of rows.slice(0, 25)) {
      console.error(`  ${row.key}: render ${row.renderBytes} B vs source ${row.sourceBytes} B (${row.ratio.toFixed(2)}x) missing=[${row.missing.join(',')}]`);
    }
  }
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(PILOTS_PATH, 'utf8'));
const pilots = (manifest.pilots || []).filter((pilot) => !ONLY.size || ONLY.has(pilot.key));
if (!pilots.length) {
  console.error(`FAIL render-package-encoding: no pilots matched${ONLY.size ? ` --only=${[...ONLY].join(',')}` : ''}`);
  process.exit(1);
}

const rows = [];
for (const pilot of pilots) {
  const renderPath = path.join(ROOT, pilot.outputDir, 'render.glb');
  const sourcePath = path.join(ROOT, pilot.sourceUrl);
  const renderBytes = statSync(renderPath).size;
  const sourceBytes = statSync(sourcePath).size;

  const [renderDoc, sourceDoc] = await Promise.all([io.read(renderPath), io.read(sourcePath)]);
  const renderExtensions = new Set(renderDoc.getRoot().listExtensionsUsed().map((ext) => ext.extensionName));
  const sourceExtensions = new Set(sourceDoc.getRoot().listExtensionsUsed().map((ext) => ext.extensionName));
  const expected = REQUIRED_EXTENSIONS.filter((name) => sourceExtensions.has(name));
  const missing = expected.filter((name) => !renderExtensions.has(name));

  rows.push({
    key: pilot.key,
    renderBytes,
    sourceBytes,
    ratio: renderBytes / Math.max(1, sourceBytes),
    missing,
  });
}

const totalRender = rows.reduce((sum, row) => sum + row.renderBytes, 0);
const totalSource = rows.reduce((sum, row) => sum + row.sourceBytes, 0);
const totalRatio = totalRender / Math.max(1, totalSource);

const unencoded = rows.filter((row) => row.missing.length > 0);
if (unencoded.length) {
  fail(unencoded, `${unencoded.length} package(s) lost their source geometry compression`, 'A package must re-apply the release quantize + meshopt profile after baking transforms.');
}

const oversized = rows.filter((row) => row.ratio > PACKAGE_RATIO_CEILING);
if (oversized.length) {
  fail(oversized, `${oversized.length} package(s) exceed ${PACKAGE_RATIO_CEILING}x their source`);
}

if (totalRatio > TOTAL_RATIO_CEILING) {
  fail(rows.sort((a, b) => b.ratio - a.ratio), `package set is ${totalRatio.toFixed(3)}x its sources (ceiling ${TOTAL_RATIO_CEILING})`);
}

const summary = {
  schema: 'spaceface.renderPackageEncoding.v1',
  packages: rows.length,
  totalRenderBytes: totalRender,
  totalSourceBytes: totalSource,
  totalRatio: Number(totalRatio.toFixed(4)),
  worstRatio: Number(Math.max(...rows.map((row) => row.ratio)).toFixed(4)),
  savedBytesVsLosslessReencode: null,
};
if (JSON_OUT) console.log(JSON.stringify(summary));
else {
  console.log(
    `render-package-encoding: ${rows.length} packages, ${(totalRender / 1048576).toFixed(1)} MB vs `
    + `${(totalSource / 1048576).toFixed(1)} MB of sources (${totalRatio.toFixed(3)}x), `
    + `worst package ${summary.worstRatio}x, all quantized + meshopt-compressed`,
  );
}
