// Prints the WebGL renderer a quiet (non-focus-stealing) test browser gets. Must name the real GPU
// (ANGLE / D3D11), never SwiftShader. Usage: node scripts/check-quiet-gpu.mjs
import { loadPlaywright } from './lib/load-playwright.mjs';

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: false }); // scripts ask for a window; the loader quiets it
const page = await browser.newPage();
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'no webgl2';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'no renderer info';
});
const ua = await page.evaluate(() => navigator.userAgent);
console.log(`renderer: ${renderer}`);
console.log(`agent: ${ua}`);
await browser.close();
if (/swiftshader|software|llvmpipe/i.test(renderer) || /no /.test(renderer)) process.exitCode = 1;
