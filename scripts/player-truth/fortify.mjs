import { SWARM_FORTIFY_DEVICES } from '../../src/data/swarmFortify.js';

const visitsByPage = new WeakMap();

export function summarizeFortifyModel(model) {
  return { runToken: model?.runToken ?? null, wave: Number.isSafeInteger(model?.wave) ? model.wave : null,
    credits: Number.isFinite(model?.credits) ? model.credits : null,
    structures: (model?.structures || []).slice(0, 6).map(row => ({
      id: row.id, entityId: row.entityId, entityIds: (row.entityIds || []).slice(0, 2),
      deviceId: row.deviceId, socketId: row.socketId, operational: row.operational === true,
      hull: row.hull, hullMax: row.hullMax, heat: row.heat, ammo: row.ammo, ammoMax: row.ammoMax,
    })) };
}

// Three successive visits bracket two whole active waves. This describes survival/deployment,
// not force or damage: actual effect evidence comes from combat receipts and the force observer.
export function summarizeTwoWaveFortify(visits) {
  const result = { observed: false, waves: [], survivingDeviceIds: [], allFourSurvived: false };
  if (!Array.isArray(visits) || visits.length < 3) return result;
  const [a, b, c] = visits.slice(-3);
  if (a.end.runToken == null || a.end.runToken !== b.end.runToken || b.end.runToken !== c.before.runToken
      || !Number.isSafeInteger(a.end.wave) || b.end.wave !== a.end.wave + 1 || c.before.wave !== b.end.wave + 1) return result;
  const same = (snapshot, row) => snapshot.structures.some(other => other.id === row.id
    && other.deviceId === row.deviceId && other.operational);
  const surviving = a.end.structures.filter(row => row.operational && same(b.before, row)
    && same(b.end, row) && same(c.before, row));
  result.observed = true;
  result.waves = [a.end.wave + 1, b.end.wave + 1];
  result.survivingDeviceIds = [...new Set(surviving.map(row => row.deviceId))];
  result.allFourSurvived = Object.keys(SWARM_FORTIFY_DEVICES).every(id => result.survivingDeviceIds.includes(id));
  return result;
}

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
    if (!window.__ptFortifyUsage) {
      const usage = { runToken: null, owners: {}, events: [], off: null };
      usage.off = window.SF.ctx.bus.on('combat:fire', event => {
        const deviceId = usage.owners[String(event?.ownerId)];
        const wave = window.SF?.state?.run?.wave;
        if (!deviceId || event?.fortifyDeviceId !== deviceId || !Number.isSafeInteger(wave)) return;
        const row = usage.events.find(item => item.wave === wave && item.deviceId === deviceId);
        if (row) row.count++;
        else if (usage.events.length < 64) usage.events.push({ wave, deviceId, count: 1 });
      });
      window.__ptFortifyUsage = usage;
    }
  });
  const actions = [];
  const read = () => page.evaluate(() => ({ model: window.__ptFortify.model,
    replies: window.__ptFortify.replies, receipt: window.__ptFortify.receipt }));
  const submit = async (button, action) => {
    const prior = await read();
    const before = prior.replies;
    await button.click();
    await page.waitForFunction(n => window.__ptFortify.replies > n, before, { timeout: 15000 });
    const receipt = (await read()).receipt;
    const creditsBefore = prior.model?.credits, creditsAfter = receipt?.readModel?.credits;
    const paid = Number.isFinite(creditsBefore) && Number.isFinite(creditsAfter) ? creditsBefore - creditsAfter : null;
    actions.push({ action, accepted: receipt?.accepted === true, reason: receipt?.reason || null,
      repaired: receipt?.repaired === true, serviced: receipt?.serviced === true, paid });
    if (!receipt?.accepted) throw new Error(`Fortify ${action} refused: ${receipt?.reason || 'no receipt'}`);
    if ((receipt.repaired || receipt.serviced) && !(paid > 0)) throw new Error(`Fortify ${action} service did not record a paid debit`);
  };
  try {
    await open.click();
    await page.waitForFunction(() => window.__ptFortify.model != null, null, { timeout: 15000 });
    const before = summarizeFortifyModel((await read()).model);
    for (const device of Object.values(SWARM_FORTIFY_DEVICES)) {
      const { model } = await read();
      if (model.structures.some(row => row.deviceId === device.id) || model.credits < device.cost) continue;
      const socket = model.sockets.find(row => !row.occupied && !row.devices?.[device.id]?.blocked);
      if (!socket) continue;
      await page.locator(`[data-device-id="${device.id}"]`).click();
      await page.locator(`[data-socket-id="${socket.id}"]`).click();
      await submit(page.locator('.sf-fortify-build'), `build:${device.id}`);
    }
    let preventedInvalidPurchase = null;
    const occupied = (await read()).model.sockets.find(row => row.occupied);
    if (occupied) {
      const prior = await read();
      await page.locator(`[data-socket-id="${occupied.id}"]`).click();
      const disabled = await page.locator('.sf-fortify-build').isDisabled();
      const detail = await page.locator('.sf-fortify-position').innerText();
      const after = await read();
      if (!disabled || after.replies !== prior.replies || after.model.credits !== prior.model.credits) {
        throw new Error('Occupied Fortify position did not prevent an invalid purchase');
      }
      preventedInvalidPurchase = { socketId: occupied.id, disabled, detail, credits: after.model.credits };
    }
    // Six sockets bound both the number of defenses and their repair/reload controls.
    for (let i = 0; i < 12; i++) {
      const service = page.locator('[data-repair-id]:enabled').first();
      if (!await service.isVisible().catch(() => false)) break;
      await submit(service, await service.getAttribute('data-repair-id'));
    }
    const end = summarizeFortifyModel((await read()).model);
    const observedFire = await page.evaluate(model => {
      const usage = window.__ptFortifyUsage;
      if (usage.runToken !== model.runToken) { usage.runToken = model.runToken; usage.owners = {}; usage.events = []; }
      usage.owners = {};
      for (const row of model.structures) {
        for (const id of [row.entityId, ...(row.entityIds || [])]) if (id != null) usage.owners[String(id)] = row.deviceId;
      }
      return usage.events.map(row => ({ ...row }));
    }, end);
    const priorVisits = visitsByPage.get(page) || [];
    if (priorVisits.length && priorVisits.at(-1).end.runToken !== end.runToken) priorVisits.length = 0;
    const visit = { wave: end.wave, before, end, actions, preventedInvalidPurchase, observedFire };
    priorVisits.push(visit);
    if (priorVisits.length > 3) priorVisits.shift();
    visit.twoWaveSurvival = summarizeTwoWaveFortify(priorVisits);
    visitsByPage.set(page, priorVisits);
    await page.getByRole('button', { name: 'Return to armory', exact: true }).click();
    await page.waitForFunction(() => window.SF.ctx.screenManager.top() !== 'crucibleFortify');
    return visit;
  } finally {
    await page.evaluate(() => {
      for (const off of window.__ptFortify?.off || []) if (typeof off === 'function') off();
      delete window.__ptFortify;
    }).catch(() => {});
  }
}
