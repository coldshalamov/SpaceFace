import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createRenderPackageLoader } from '../../src/render/renderPackageLoader.js';
import { prepareRenderPackageBlueprint, assembleRenderPackageRecord } from '../../src/render/assetLoader.js';
import { renderPackagePilotForAssetId } from '../../src/render/renderPackageManifest.js';
import { loadMotionBank } from '../../src/render/authoredMotion.js';
import { splitterSourceGraph } from './splitterV12Graph.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadSplitterPackage(key, residency) {
  const pilot = renderPackagePilotForAssetId(`sf.render.${key}`);
  assert.ok(pilot, 'requires a real compiler-generated package admission row');
  const metadata = JSON.parse(await readFile(pilot.metadataUrl, 'utf8'));
  const root = path.dirname(path.resolve(pilot.metadataUrl));
  let decodes = 0;
  const loader = createRenderPackageLoader({ residency,
    loadGlb: async url => {
      decodes++;
      const file = fileURLToPath(url), bytes = await readFile(file);
      assert.equal(bytes.length, metadata.render.bytes);
      assert.equal(sha(bytes), metadata.render.sha256);
      return splitterSourceGraph(file);
    },
    prepareDecoded: async (decoded, packageMetadata, url, plan) => {
      const blueprint = prepareRenderPackageBlueprint(pilot, decoded, packageMetadata, { plan });
      const ref = packageMetadata.runtime.motionBank;
      const motionBank = ref ? await loadMotionBank(ref, async file => new Response(await readFile(file))) : null;
      return Object.freeze({ ...blueprint, motionBank });
    },
  });
  const loadOptions = { baseUrl: pathToFileURL(root + '/').href,
    expectedContentHash: pilot.expectedContentHash, expectedRuntimeHash: metadata.runtimeHash };
  const loaded = await loader.load(metadata, loadOptions);
  assert.equal(await loader.load(metadata, loadOptions), loaded, 'one decode for the exact package generation');
  assert.equal(loader.release(loaded.contentHash, 'second-load-balanced'), true);
  return { record: assembleRenderPackageRecord(loaded, pilot.sourceUrl), loaded, loader, metadata,
    decodeCount: () => decodes };
}
