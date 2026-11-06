// scripts/lib/retailBundleAliases.mjs — retail specifiers that must resolve to the same files the
// zero-build path loads.
//
// The dev importmap maps `three/addons/` → vendor/addons/, while build-bundle.mjs resolves bare
// specifiers from node_modules. The renderer has a SpaceFace sampler fix in vendor/three.module.js,
// so retail must resolve the exact bare `three` specifier to that module. Keep the GLTFLoader alias
// explicit; other addon imports continue to resolve from node_modules as before.
import { join } from 'node:path';

/** esbuild `alias` map for the retail bundle, rooted at the project directory. */
export function retailBundleAliases(root) {
  return {
    // three r184 GLTFLoader + SpaceFace in-place GLB body reads (vendor copy is upstream r184 plus
    // only `SpaceFace:` hunks; three itself still resolves from node_modules, so one THREE instance).
    'three/addons/loaders/GLTFLoader.js': join(root, 'vendor', 'addons', 'loaders', 'GLTFLoader.js'),
  };
}

/** Resolve only the bare core specifier; subpath addon imports are intentionally unaffected. */
export function retailThreeCorePlugin(root) {
  const threeModule = join(root, 'vendor', 'three.module.js');
  return {
    name: 'spaceface-vendored-three-core',
    setup(build) {
      build.onResolve({ filter: /^three$/ }, () => ({ path: threeModule }));
    },
  };
}
