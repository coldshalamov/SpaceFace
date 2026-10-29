import { SWARM_FORTIFY_DEVICES } from '../../src/data/swarmFortify.js';

/** Choose the normal Foundry construction route using public controls and projected replies. */
export async function fortifyBetweenRounds(page) {
  const open = page.getByRole('button', { name: 'Fortify the field', exact: true });
  if (!await open.isVisible().catch(() => false)) return null;
  await page.evaluate(() => {
    const store = { model: null, receipt: null, replies: 0, off: [] };
    window.__ptFortify = store;
    store.off.push(window.SF.ctx.bus.on('swarm:fortifyState', model => { store.model = model; }));
    store.off.push(window.SF.ctx.bus.on('swarm:fortifyBuildResolved', receipt => {
      store.receipt = receipt; store.replies++;
      if (receipt.readModel) store.model = receipt.readModel;
    }));
  });
  const actions = [];
  const read = () => page.evaluate(() => ({ model: window.__ptFortify.model,
    replies: window.__ptFortify.replies, receipt: window.__ptFortify.receipt }));
  const submit = async (button, action) => {
    const before = (await read()).replies;
    await button.click();
    await page.waitForFunction(n => window.__ptFortify.replies > n, before, { timeout: 15000 });
    const receipt = (await read()).receipt;
    actions.push({ action, accepted: receipt?.accepted === true, reason: receipt?.reason || null });
    if (!receipt?.accepted) throw new Error(`Fortify ${action} refused: ${receipt?.reason || 'no receipt'}`);
  };
  try {
    await open.click();
    await page.waitForFunction(() => window.__ptFortify.model != null, null, { timeout: 15000 });
    for (const device of Object.values(SWARM_FORTIFY_DEVICES)) {
      const { model } = await read();
      if (model.structures.some(row => row.deviceId === device.id) || model.credits < device.cost) continue;
      const socket = model.sockets.find(row => !row.occupied && !row.devices?.[device.id]?.blocked);
      if (!socket) continue;
      await page.locator(`[data-device-id="${device.id}"]`).click();
      await page.locator(`[data-socket-id="${socket.id}"]`).click();
      await submit(page.locator('.sf-fortify-build'), `build:${device.id}`);
    }
    // Six sockets bound both the number of defenses and their repair/reload controls.
    for (let i = 0; i < 12; i++) {
      const service = page.locator('[data-repair-id]:enabled').first();
      if (!await service.isVisible().catch(() => false)) break;
      await submit(service, await service.getAttribute('data-repair-id'));
    }
    await page.getByRole('button', { name: 'Return to armory', exact: true }).click();
    await page.waitForFunction(() => window.SF.ctx.screenManager.top() !== 'crucibleFortify');
    return { wave: (await read()).model.wave, actions };
  } finally {
    await page.evaluate(() => {
      for (const off of window.__ptFortify?.off || []) if (typeof off === 'function') off();
      delete window.__ptFortify;
    }).catch(() => {});
  }
}
