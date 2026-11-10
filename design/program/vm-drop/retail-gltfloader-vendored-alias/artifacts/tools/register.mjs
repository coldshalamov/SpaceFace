// node --import /workspace/spaceface-scratch/r170-tools/register.mjs scripts/build-bundle.mjs
// Captures the REAL build-bundle.mjs esbuild call: same options, plus metafile; copies the JS output
// to $R170_CAPTURE before the (pre-existing, unrelated) render-package gate can abort and wipe it.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
