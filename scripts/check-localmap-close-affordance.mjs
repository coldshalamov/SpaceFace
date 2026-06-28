import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const managerSrc = read('src/ui/screenManager.js');
const localmapSrc = read('src/ui/screens/localmap.js');
const inputSrc = read('src/ui/input.js');
const touchSrc = read('src/systems/touch.js');

assert.match(localmapSrc, /id: 'localmap'/,
  'Local Map screen id must remain localmap');
assert.match(localmapSrc, /<button class="lm-close" type="button">Close \(\$\{localMapKey\}\)<\/button>/,
  'Local Map must keep its visible close button with the live local-map key label');
assert.match(localmapSrc, /press \$\{localMapKey\} or Esc to close/,
  'Local Map header must keep teaching the live key close path');
assert.match(localmapSrc, /key === BINDINGS\.localmap\.key/,
  'Local Map key close handler must keep reading the shared binding registry');

assert.match(managerSrc, /function ensureLocalmapCloseLabel\(el\)/,
  'ScreenManager must keep the Local Map close label hook directly testable');
assert.match(managerSrc, /el\.dataset\.screen !== 'localmap'/,
  'Local Map close label hook must stay scoped to the Local Map screen only');
assert.match(managerSrc, /el\.querySelector\('\.lm-close'\)/,
  'Local Map close label hook must target the existing visible close button');
assert.match(managerSrc, /btn\.setAttribute\('aria-label', 'Close Local Map'\)/,
  'Local Map close button must expose a concrete assistive-tech label');
assert.match(managerSrc, /ensureLocalmapCloseLabel\(el\)/,
  'ScreenManager must install the Local Map close label when building the mounted Local Map');

assert.match(touchSrc, /data-act="localmap"/,
  'Touch overlay must still expose the Map button');
assert.match(inputSrc, /touchActionPressed\('localmap'\)[\s\S]*routeTouchUiAction\('localmap'\)/,
  'Touch Map button must still route through shared UI input');
assert.match(inputSrc, /action === 'localmap'[\s\S]*openScreenFromTouch\('localmap'\)/,
  'Touch Map route must still open the canonical Local Map screen');

console.log('Local Map close affordance OK - touch-opened Local Map has a visible close path with a concrete assistive label.');
