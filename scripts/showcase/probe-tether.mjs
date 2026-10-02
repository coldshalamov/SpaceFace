import { bootShowcase } from './lib/harness.mjs';

const { page, browser, server } = await bootShowcase();
const sh = (expr, arg) => page.evaluate(expr, arg);
await sh(() => window.__showcase.unlockTech());

const defId = process.env.ITEM || 'mod_tractor_beam_m';
const hull = process.env.HULL || 'ship_drifter';
await sh((h) => window.__showcase.hull(h), hull);
await sh((s) => window.__showcase.stage({ zoom: 90 }), {});
await sh(() => window.__showcase.strip());
console.log('fit:', await sh((d) => window.__showcase.fit(d), defId));
console.log('derived:', await sh(() => window.__showcase.derived()));

// scene: drones + an asteroid + a wreck-ish body
await sh(() => window.__showcase.spawnPack({ count: 2, distance: 45, hostile: false, arcDeg: 25, jitter: 5 }));
await sh(() => window.__showcase.spawnAsteroid({ distance: 60, typeId: 'ast_metallic' }));
await page.waitForTimeout(400);
console.log('spawned:', await sh(() => window.__showcase.spawnedIdsList()));

await sh(() => window.__showcase.watchStart());
await page.waitForTimeout(1500);
await sh(() => window.__showcase.evidenceReset());
// press Ctrl+Space (nearest latch)
await page.keyboard.down('Control');
await page.waitForTimeout(120);
await page.keyboard.down('Space');
await page.waitForTimeout(160);
const mid = await sh(() => {
  const inp = window.SF.state.input;
  return { keys: !!inp, acts: inp && inp.actions && { latch: inp.actions.tetherFire, massline: inp.actions.massline && { phase: inp.actions.massline.phase, latch: inp.actions.massline.latch } }, mode: inp.tetherMode };
});
await page.keyboard.up('Space');
await page.keyboard.up('Control');
await page.waitForTimeout(1200);
console.log('mid-press:', JSON.stringify(mid));
console.log('evidence:', JSON.stringify((await sh(() => window.__showcase.evidence())).counts));
const watch = await sh(() => window.__showcase.watchStop());
// collapse watch to transitions
let prev = null;
for (const w of watch) {
  const sig = `${w.tetherActive}|${w.remoteActive}|${w.targetId}|${w.phase}|${w.latch}|${w.cut}|${w.mode}`;
  if (sig !== prev) { console.log(`  w[${w.i}] ${sig}`); prev = sig; }
}

const probe = await sh(() => {
  const sf = window.SF;
  const t = sf.registry.get('tetherGameplay') || sf.registry.get('tether');
  const pl = sf.state.entities.get(sf.state.playerId);
  return {
    denial: t && t._lastLatchDenial,
    tether: pl.tether,
    mode: sf.state.input && sf.state.input.tetherMode,
    acq: sf.state.masslineAcquisition,
  };
});
console.log('probe:', JSON.stringify(probe, null, 1).slice(0, 3000));

await browser.close();
await server.close();
