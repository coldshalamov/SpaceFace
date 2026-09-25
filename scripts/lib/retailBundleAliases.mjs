// scripts/lib/retailBundleAliases.mjs — bare specifiers the retail bundle must resolve to the SAME file
// the zero-build path loads.
//
// The dev importmap maps `three/addons/` → vendor/addons/, while build-bundle.mjs resolves bare
// specifiers from node_modules. For modules the project has patched in vendor/ that split means dev
// and retail run different code. Each entry here pins one such module to its vendor copy; everything
// else (three itself, every other addon) keeps resolving from node_modules.
import { join } from 'node:path';

/** esbuild `alias` map for the retail bundle, rooted at the project directory. */
export function retailBundleAliases(root) {
  return {
    // three r184 GLTFLoader + SpaceFace in-place GLB body reads (vendor copy is upstream r184 plus
    // only `SpaceFace:` hunks; three itself still resolves from node_modules, so one THREE instance).
    'three/addons/loaders/GLTFLoader.js': join(root, 'vendor', 'addons', 'loaders', 'GLTFLoader.js'),
  };
}
