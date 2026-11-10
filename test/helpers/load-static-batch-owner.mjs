// Load the actual partsLibrary implementation with test-only exports of its private owners.
// The query isolates this module instance while all of its production dependencies stay shared.
import { registerHooks } from 'node:module';

export async function loadStaticBatchOwners() {
  const target = new URL('../../src/render/partsLibrary.js', import.meta.url);
  target.searchParams.set('staticLeaseTest', '1');
  const hook = registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (url !== target.href) return result;
      return {
        ...result,
        source: `${result.source}\nexport { addStaticBatchMesh, createBindings, createFlightRootTemplateEntry, instantiateFlightRootTemplate, storeFlightRootTemplate, removeFlightRootTemplate };\n`,
      };
    },
  });
  try {
    return await import(target.href);
  } finally {
    hook.deregister();
  }
}
