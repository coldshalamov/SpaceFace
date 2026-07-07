import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = 'C:/Users/93rob/Documents/GitHub/SpaceFace';

// 1. Restore missing module files from master (full BP-11/BP-12 closure)
const missingFiles = [
  'src/data/economyContractTemplates.js', 'src/data/gateControl.js', 'src/data/hazardLanguage.js',
  'src/data/stationBubbles.js', 'src/data/stationGlyphs.js', 'src/data/stationSideEvents.js',
  'src/systems/economyContracts.js', 'src/systems/gateControlDirector.js', 'src/systems/stationBroadcast.js',
  'src/systems/stationSideEventDirector.js', 'src/ui/dangerGradient.js', 'src/ui/dockDenyBanner.js',
  'src/ui/sectorPostcard.js',
];
for (const f of missingFiles) {
  try { execSync(`git checkout master -- ${f}`, { cwd: ROOT, stdio: 'pipe' }); } catch (e) { console.log('skip:', f); }
}
console.log('[1] files restored from master');

// 2. Patch main.js
const mainPath = ROOT + '/src/main.js';
let main = readFileSync(mainPath, 'utf8');

if (main.includes('globalPipelinePrecompileReady')) {
  console.log('[2a] main.js already patched');
} else {
  // Replace the blocking `await precompilePipelines(...)` line with a background fire-and-forget.
  const idx = main.indexOf('await precompilePipelines(state.render.renderer');
  if (idx === -1) throw new Error('main.js: cannot locate precompilePipelines await');
  const lineStart = main.lastIndexOf('\n', idx) + 1;
  const lineEnd = main.indexOf('\n', idx);
  const NEW_LINES = [
    '    // GLOBAL pipeline precompile (bloom composite + weapons + beams + vfx + every ship',
    '    // archetype) runs in the BACKGROUND while the player browses the menu. Front-loads shader',
    '    // compilation so sector entry is instant, but must NOT block the menu: overlay hides as soon',
    '    // as the render loop is live; the flight-entry gate (waitForRenderPipelineWarmup) awaits this',
    '    // before flight. Menu interactive in ~3s instead of ~20s frozen splash; shaders always warm;',
    '    // no quality lost (PERF_BUDGET sec 3: remove invisible work, not quality).',
    '    state.render.globalPipelinePrecompileReady = precompilePipelines(',
    '      state.render.renderer, state.render.scene, state.render.camera,',
    '      { warmPostProcess: state.render.warmPostProcess, video: state.settings && state.settings.video }',
    "    ).catch((error) => { console.warn('[SpaceFace] pipeline precompile failed', error); return null; });",
  ].join('\n');
  main = main.slice(0, lineStart) + NEW_LINES + main.slice(lineEnd);
  console.log('[2a] main.js boot await replaced with background precompile');
}
writeFileSync(mainPath, main);

// 2b. Patch waitForRenderPipelineWarmup
main = readFileSync(mainPath, 'utf8');
const fnIdx = main.indexOf('async function waitForRenderPipelineWarmup(');
if (fnIdx !== -1 && main.slice(fnIdx, fnIdx + 700).includes('globalPipelinePrecompileReady')) {
  console.log('[2b] waitForRenderPipelineWarmup already includes global');
} else if (fnIdx !== -1) {
  const fnEnd = main.indexOf('\n}', fnIdx) + 2;
  const newFn = [
    'async function waitForRenderPipelineWarmup(state, timeoutMs = 20000) {',
    '  // Await BOTH the boot-time global precompile (started in boot(), runs during the menu) and the',
    '  // per-sector precompile (fired by sector:enter) so the player never enters flight with',
    '  // uncompiled shaders. Each is raced independently vs the timeout.',
    '  const warmups = [];',
    '  const global = state && state.render && state.render.globalPipelinePrecompileReady;',
    "  if (global && typeof global.then === 'function') warmups.push(global);",
    '  const sector = state && state.render && state.render.pipelinePrecompileReady;',
    "  if (sector && typeof sector.then === 'function') warmups.push(sector);",
    '  if (!warmups.length) return true;',
    '  const settled = await Promise.all(warmups.map((p) => Promise.race([',
    '    p.then(() => true, () => false),',
    '    delay(timeoutMs).then(() => false),',
    '  ])));',
    "  if (!settled.every(Boolean)) console.warn('[SpaceFace] render pipeline warm-up did not finish before flight start');",
    '  return settled.every(Boolean);',
    '}',
  ].join('\n');
  main = main.slice(0, fnIdx) + newFn + main.slice(fnEnd);
  writeFileSync(mainPath, main);
  console.log('[2b] waitForRenderPipelineWarmup patched to await global+sector');
} else {
  console.log('[2b] WARN: waitForRenderPipelineWarmup not found');
}

// 3. Patch renderer.js
const rendererPath = ROOT + '/src/render/renderer.js';
let renderer = readFileSync(rendererPath, 'utf8');
if (renderer.includes('globalPipelinePrecompileReady')) {
  console.log('[3] renderer.js already patched');
} else {
  const anchor = '      const warmup = precompilePipelines(renderer, scene, cam.obj, {';
  const ai = renderer.indexOf(anchor);
  const assignAnchor = '      state.render.pipelinePrecompileReady = warmup;';
  const aai = ai !== -1 ? renderer.indexOf(assignAnchor, ai) : -1;
  if (ai !== -1 && aai !== -1) {
    const blockEnd = aai + assignAnchor.length;
    const newBlock = [
      '      // Chain the per-sector pass BEHIND the boot-time global precompile so a fast New Game',
      "      // click doesn't fire a concurrent sector precompile fighting the global one for the GPU",
      '      // compile queue. After global finishes, precompile.js dedup makes this a near-no-op.',
      '      const globalReady = state.render.globalPipelinePrecompileReady || Promise.resolve();',
      '      const warmup = globalReady.then(() => precompilePipelines(renderer, scene, cam.obj, {',
      '        sector,',
      '        warmPostProcess: state.render.warmPostProcess,',
      '        video: state.settings && state.settings.video,',
      '      })).catch((error) => {',
      "        console.warn('[render] sector pipeline precompile failed', error);",
      '        return null;',
      '      });',
      '      state.render.pipelinePrecompileReady = warmup;',
    ].join('\n');
    renderer = renderer.slice(0, ai) + newBlock + renderer.slice(blockEnd);
    writeFileSync(rendererPath, renderer);
    console.log('[3] renderer.js sector precompile chained behind global');
  } else {
    console.log('[3] WARN: renderer.js anchors not found');
  }
}

// 4. Syntax check
try {
  execSync('node --check src/main.js', { cwd: ROOT, stdio: 'pipe' });
  execSync('node --check src/render/renderer.js', { cwd: ROOT, stdio: 'pipe' });
  console.log('[4] syntax check OK');
} catch (e) {
  console.error('[4] SYNTAX ERROR:', (e.stderr && e.stderr.toString()) || e.message);
  process.exit(1);
}
console.log('[done] all fixes applied');
