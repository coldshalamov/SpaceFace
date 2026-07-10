import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const probeSource = await readFile(new URL('../scripts/probe-authored-assets-live.mjs', import.meta.url), 'utf8');

assert.match(probeSource, /process\.env\.SF_ASSETS_LIVE_SHOT/,
  'browser fixture can place its screenshot inside its evidence task directory');
assert.match(probeSource, /process\.env\.SF_ASSETS_LIVE_REPORT/,
  'browser fixture can write a machine-readable task-contained report');
assert.match(probeSource, /process\.env\.SF_ASSETS_LIVE_LOG/,
  'browser fixture can write a task-contained probe log without shell redirection');
assert.match(probeSource, /WEBGL_debug_renderer_info/,
  'browser report queries the WebGL debug renderer identity when available');
assert.match(probeSource, /UNMASKED_VENDOR_WEBGL/,
  'browser report records the actual WebGL vendor');
assert.match(probeSource, /UNMASKED_RENDERER_WEBGL/,
  'browser report records the actual WebGL renderer');
assert.match(probeSource, /route:\s*probeRoute/,
  'browser report names the explicit seeded debug route');
assert.match(probeSource, /injectedState:\s*true/,
  'browser report acknowledges internal game:new/ui:closeAll event injection');
assert.match(probeSource, /inputSource:\s*['"]fixture['"]/,
  'browser report labels the seeded internal-event path as a fixture');

console.log('PASS authored-assets browser evidence contract: task paths, actual WebGL identity, and honest fixture metadata');
