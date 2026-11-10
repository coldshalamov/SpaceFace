import { finalizeVisualProbeResources } from '../../scripts/lib/visualProbeCleanup.mjs';

await finalizeVisualProbeResources({
  browser: { close: async () => { throw new Error('fixture-browser-close'); } },
  server: { close: async () => { throw new Error('fixture-server-close'); } },
});
