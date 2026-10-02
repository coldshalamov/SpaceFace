import { bootShowcase } from './lib/harness.mjs';
const { page, browser, server } = await bootShowcase();
const out = await page.evaluate(async () => {
  const sf = window.SF;
  const world = sf.registry.get('world');
  world.enterSector('sector_helios_prime', {});
  const pl = sf.state.entities.get(sf.state.playerId);
  pl.pos.x = -1900; pl.pos.z = -2200;
  sf.state.render?.cameraCtrl?.setZoom(90);
  sf.state.render?.cameraCtrl?.snapToPlayer?.();
  return { sector: sf.state.world.currentSectorId, pos: pl.pos };
});
console.log(JSON.stringify(out));
await page.waitForTimeout(2500);
await page.screenshot({ path: '.devshots/showcase/arena.png' });
const out2 = await page.evaluate(() => {
  const sf = window.SF;
  const pl = sf.state.entities.get(sf.state.playerId);
  const list = [];
  for (const e of sf.state.entities.values()) {
    if (!e.pos) continue;
    const d = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z);
    if (d < 500) list.push({ id: e.id, type: e.type, d: Math.round(d) });
  }
  return list;
});
console.log('nearby:', JSON.stringify(out2));
await browser.close(); await server.close();
