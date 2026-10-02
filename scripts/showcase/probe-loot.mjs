// One-off probe: why does loot:magnetCaptured not fire for spawned payloads?
import { bootShowcase } from './lib/harness.mjs';

const { browser, page } = await bootShowcase();
const sh = (expr, arg) => page.evaluate(expr, arg);
await sh(() => window.__showcase.unlockTech());
await sh(() => window.__showcase.strip());
const hullR = await sh(() => window.__showcase.hull('ship_kestrel'));
const fitR = await sh(() => window.__showcase.fit('mod_loot_magnet_s'));
console.log('hull:', JSON.stringify(hullR), 'fit:', JSON.stringify(fitR));
await page.waitForTimeout(800);

const out = await sh(() => {
  const sf = window.SF;
  const st = sf.state;
  const pl = st.entities.get(st.playerId);
  const before = (st.entityIndex.payloads || []).length;
  const spawned = [];
  for (let i = 0; i < 5; i++) {
    const e = sf.helpers.spawnEntity({
      type: 'payload',
      pos: { x: pl.pos.x + 40 + i * 10, z: pl.pos.z },
      vel: { x: 0, z: 0 }, radius: 3, mass: 1, collides: false, team: 0,
      data: { kind: 'payload', payloadType: 'jettisoned_cargo', commodityId: 'cmdty_scrap_metal', amount: 2 },
    });
    if (e) spawned.push(e.id);
  }
  window.__lootIds = spawned;
  return {
    mode: st.mode, before, after: (st.entityIndex.payloads || []).length,
    derived: pl.data?.derived?.lootMagnetRange,
    physics: !!sf.helpers?.combatPhysics?.applyImpulse,
    spawned,
  };
});
console.log('spawn:', JSON.stringify(out));

await page.waitForTimeout(3000);
const after = await sh(() => {
  const sf = window.SF; const st = sf.state;
  const pl = st.entities.get(st.playerId);
  const pods = (st.entityIndex.payloads || []).map((p) => ({
    id: p.id, type: p.type, alive: p.alive, ptype: p.data?.payloadType,
    d: Math.round(Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z)),
  }));
  return { counts: window.__showcase.evidence().counts, pods, derivedNow: pl.data?.derived?.lootMagnetRange };
});
console.log('after 2s:', JSON.stringify(after).slice(0, 1200));
await browser.close();
