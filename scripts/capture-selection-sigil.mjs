// Look at the ORRERY selection sigil and judge the picture, not the code.
// Sweeps class / animation phase / camera tilt / accessibility through the real module on the real
// static server, writes PNGs, and fails loudly on any page error or shader link failure.
//   node scripts/capture-selection-sigil.mjs [--out=.devshots/sigil] [--width=1280] [--height=800]
import { mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const OUT = ROOT + (args.out || '.devshots/selection-sigil') + '/';
const WIDTH = Number(args.width || 960);
const HEIGHT = Number(args.height || 600);
const ONLY = args.only ? String(args.only).split(',') : null;
mkdirSync(OUT, { recursive: true });

// The layer-isolation sweep this instrument was built with is gone: `uMask` was a debug scaffold
// for attributing a flat field to a single figure, and the flat field is fixed and the causes are
// pinned as tests. Keeping a dead knob in the shipping shader is a thing to be maintained with no
// way to reach it from the game, so it came out with the scaffold.
const SWEEP = [
  { name: 'hostile-chase', klass: 'hostile', t: 6.0, tilt: 52 },
  { name: 'hostile-acquire', klass: 'hostile', t: 0.16, tilt: 52 },
  { name: 'hostile-top', klass: 'hostile', t: 6.0, tilt: 6 },
  { name: 'hostile-isolated', klass: 'hostile', t: 6.0, tilt: 6, noHull: true },
  { name: 'friendly-chase', klass: 'friendly', t: 6.0, tilt: 52 },
  { name: 'friendly-top', klass: 'friendly', t: 6.0, tilt: 6 },
  { name: 'cargo-chase', klass: 'cargo', t: 6.0, tilt: 52 },
  { name: 'cargo-top', klass: 'cargo', t: 6.0, tilt: 6 },
  { name: 'hostile-vernier-detent', klass: 'hostile', t: 6.44, tilt: 30 },
  { name: 'hostile-reduced-motion', klass: 'hostile', t: 6.0, tilt: 52, reduced: true },
  { name: 'hostile-reduced-flash', klass: 'hostile', t: 6.0, tilt: 52, flash: true },
  { name: 'hostile-release', klass: 'hostile', t: 6.0, tilt: 52, release: 0.12 },
  { name: 'hostile-distant', klass: 'hostile', t: 6.0, tilt: 52, hull: 3 },
  { name: 'hostile-capital', klass: 'hostile', t: 6.0, tilt: 52, hull: 44 },
];
const FRAMES = ONLY ? SWEEP.filter((f) => ONLY.includes(f.name)) : SWEEP;

const server = createGameServer({ root: ROOT });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SF_CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling'],
});

const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 500)); });

  for (const frame of FRAMES) {
    const params = new URLSearchParams({ klass: frame.klass, t: String(frame.t), tilt: String(frame.tilt) });
    if (frame.reduced) params.set('reduced', '1');
    if (frame.flash) params.set('flash', '1');
    if (frame.noHull) params.set('noHull', '1');
    if (frame.hull != null) params.set('hull', String(frame.hull));
    errors.length = 0;
    await page.goto(`http://127.0.0.1:${server.address().port}/scripts/selection-sigil-lab.html?${params}`, {
      waitUntil: 'load',
    });
    try {
      // SwiftShader compiles a shader this size slowly; the first link is the slow one.
      await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
    } catch (err) {
      failures.push(`${frame.name}: page never became ready — ${errors.join(' | ') || err.message}`);
      console.log(`   x ${frame.name}: ${errors.join(' | ') || err.message}`);
      continue;
    }
    if (frame.release != null) {
      // Drive the release fold by hand: the lab only warms the held state.
      await page.evaluate((seconds) => {
        const { sigil } = window.__sigil;
        const steps = Math.round(seconds / (1 / 60));
        for (let i = 0; i < steps; i++) sigil.clear(1 / 60, { video: {}, accessibility: {} });
        window.__sigil.renderer.render(window.__sigil.scene, window.__sigil.camera);
      }, frame.release);
    }
    const report = await page.evaluate(() => {
      const { sigil, renderer } = window.__sigil;
      const gl = renderer.getContext();
      const programs = renderer.info.programs.map((p) => ({
        name: p.name,
        diagnostics: p.diagnostics ? {
          runnable: p.diagnostics.runnable,
          vertex: (p.diagnostics.vertexShader && p.diagnostics.vertexShader.log) || '',
          fragment: (p.diagnostics.fragmentShader && p.diagnostics.fragmentShader.log) || '',
          program: p.diagnostics.programLog,
        } : null,
      }));
      return { glError: gl.getError(), programs, inspect: sigil.inspect(), u: {
        primary: sigil.mesh.material.uniforms.uPrimary.value.getHexString(),
        secondary: sigil.mesh.material.uniforms.uSecondary.value.getHexString(),
        klass: sigil.mesh.material.uniforms.uKlass.value,
        hull: Number(sigil.mesh.material.uniforms.uHull.value.toFixed(4)),
        instant: sigil.mesh.material.uniforms.uInstant.value,
        age: Number(sigil.mesh.material.uniforms.uAge.value.toFixed(2)),
        visible: sigil.mesh.visible,
      } };
    });
    await page.screenshot({ path: `${OUT}${frame.name}.png` });
    const bad = report.programs.filter((p) => p.diagnostics);
    console.log(
      `${frame.name.padEnd(26)} glError=${report.glError} klass=${report.inspect.klass} ` +
      `uKlass=${report.u.klass} primary=#${report.u.primary} hull=${report.u.hull} ` +
      `radius=${report.inspect.radius.toFixed(1)} visible=${report.u.visible} linkDiagnostics=${bad.length}`,
    );
    if (report.glError !== 0) failures.push(`${frame.name}: gl error ${report.glError}`);
    for (const p of bad) {
      const d = p.diagnostics;
      const detail = [d.program, d.vertex, d.fragment].filter(Boolean).join(' | ').slice(0, 900);
      failures.push(`${frame.name}: shader link diagnostics on "${p.name}": ${detail}`);
      console.log(`   ! ${p.name}: ${detail}`);
    }
    if (errors.length) failures.push(`${frame.name}: ${errors.join(' | ')}`);
  }
  console.log(`\nwrote ${FRAMES.length} frames to ${OUT}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log('selection sigil capture OK');
