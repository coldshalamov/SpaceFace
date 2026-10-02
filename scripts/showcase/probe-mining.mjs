import { bootShowcase } from './lib/harness.mjs';

const { page, browser, server } = await bootShowcase();
const sh = (expr, arg) => page.evaluate(expr, arg);
await sh(() => window.__showcase.unlockTech());

await sh((h) => window.__showcase.hull(h), process.env.HULL || 'ship_kestrel');
await sh((s) => window.__showcase.stage({ zoom: 40 }), {});
await sh(() => window.__showcase.strip());
console.log('fit:', await sh((d) => window.__showcase.fit(d), process.env.ITEM || 'mod_mining_laser_s'));
await sh(() => window.__showcase.spawnAsteroid({ distance: 30, radius: 22 }));
await page.waitForTimeout(400);
console.log('spawned:', await sh(() => window.__showcase.spawnedIdsList()));

await sh(() => window.__showcase.evidenceReset());
const sp = await sh(() => window.__showcase.screenPos(window.__showcase.spawnedIdsList()[0]));
console.log('asteroid screen pos:', JSON.stringify(sp));
await page.mouse.move(Math.max(4, Math.min(956, sp.x)), Math.max(4, Math.min(536, sp.y)));
await page.waitForTimeout(300);
await page.mouse.down({ button: 'right' });

for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(700);
  const t = await sh(() => {
    const sf = window.SF;
    const inp = sf.state.input;
    const m = sf.registry.get('mining');
    const inp2 = sf.registry.get('input');
    return {
      fireGroup: inp && inp.fireGroup,
      m2: inp2 && inp2._m2, lane: inp2 && inp2._m2ToolLane,
      m2HeldS: inp2 && inp2._m2HeldS,
      beaming: m && m._beaming, lock: m && m._lockTargetId,
      aimAngle: inp && inp.aimAngle, aimActive: inp && inp.aimIntentActive,
      wot: inp && Object.prototype.hasOwnProperty.call(inp, 'worldObjectTargetId'),
      wotId: inp && inp.worldObjectTargetId,
      wotType: (() => { const e = inp && sf.state.entities.get(inp.worldObjectTargetId); return e && e.type; })(),
    };
  });
  console.log('t' + (i * 0.7).toFixed(1), JSON.stringify(t));
}
console.log('evidence:', JSON.stringify((await sh(() => window.__showcase.evidence())).counts));
await page.mouse.up({ button: 'right' });
await browser.close();
await server.close();
