import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

// A render package must stay as cheap to fetch and parse as the source it replaces.
//
// The compiler reads a quantized + meshopt-compressed release GLB, decodes it to float, bakes
// immutable node transforms and welds. For a while it then wrote the result back with no encode
// profile, so every package was ~1.75x its source while the retail projection removed the source
// from the bundle - the payload grew by 170 MB and nothing noticed. `scripts/check-
// render-package-encoding.mjs` sweeps all 414 packages; this samples a few representative ones so
// the invariant also runs in the ordinary test suite, where a compiler regression lands.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SAMPLE = Object.freeze(['kestrel', 'helios-trade-hub', 'lane-beacon', 'debris-chunk']);
const PACKAGE_RATIO_CEILING = 2.0;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function triangleCount(document) {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      triangles += indices
        ? Math.round(indices.getCount() / 3)
        : Math.round((position ? position.getCount() : 0) / 3);
    }
  }
  return triangles;
}

const pilots = JSON.parse(readFileSync(path.join(ROOT, 'assets/ships/render-packages/pilots.json'), 'utf8')).pilots;
const byKey = new Map(pilots.map((pilot) => [pilot.key, pilot]));

for (const key of SAMPLE) {
  test(`render package ${key} keeps its source geometry compression and does not outgrow it`, async () => {
    const pilot = byKey.get(key);
    assert.ok(pilot, `${key} must be a shipping render-package pilot`);

    const renderPath = path.join(ROOT, pilot.outputDir, 'render.glb');
    const sourcePath = path.join(ROOT, pilot.sourceUrl);
    const [renderDoc, sourceDoc] = await Promise.all([io.read(renderPath), io.read(sourcePath)]);

    const renderExtensions = new Set(renderDoc.getRoot().listExtensionsUsed().map((e) => e.extensionName));
    const sourceExtensions = new Set(sourceDoc.getRoot().listExtensionsUsed().map((e) => e.extensionName));
    for (const required of ['EXT_meshopt_compression', 'KHR_mesh_quantization']) {
      if (!sourceExtensions.has(required)) continue;
      assert.ok(
        renderExtensions.has(required),
        `${key}: render.glb lost ${required} that its source carries - the compile round trip re-encoded lossless`,
      );
    }

    const renderBytes = statSync(renderPath).size;
    const sourceBytes = statSync(sourcePath).size;
    assert.ok(
      renderBytes <= sourceBytes * PACKAGE_RATIO_CEILING,
      `${key}: render.glb is ${(renderBytes / sourceBytes).toFixed(2)}x its source (ceiling ${PACKAGE_RATIO_CEILING}x)`,
    );

    assert.equal(
      triangleCount(renderDoc),
      triangleCount(sourceDoc),
      `${key}: compiling must not change the authored triangle count`,
    );
  });
}
