// Smoke: boot, fit wpn_pulse_laser_s on Hornet, spawn 3 hostile wasps, autoFire 8s, record.
import path from 'node:path';
import { bootShowcase, saveClip, ROOT } from './lib/harness.mjs';

const OUT = path.join(ROOT, '.devshots', 'showcase');
const { page, browser, server } = await bootShowcase();
const sh = (expr) => page.evaluate(expr);

console.log('hull:', await sh(() => window.__showcase.hull('ship_hornet')));
console.log('fitted before:', JSON.stringify(await sh(() => window.__showcase.fitted())));
console.log('fit:', await sh(() => window.__showcase.fit('wpn_pulse_laser_s')));
console.log('fitted after:', JSON.stringify(await sh(() => window.__showcase.fitted())));
console.log('player:', JSON.stringify(await sh(() => window.__showcase.player())));
await sh(() => window.__showcase.teleport(400, -300, 0));
await sh(() => window.__showcase.camera(90));
console.log('spawn:', await sh(() => window.__showcase.spawnPack({ count: 3, distance: 55, jitter: 10, hostile: true, enemyType: 'wasp_swarmer' })));
await sh(() => window.__showcase.evidenceReset());
await sh(() => window.__showcase.setAutoFire(true));
const bytes = await saveClip(page, path.join(OUT, 'smoke_pulse_laser.webm'), 8);
console.log('clip bytes:', bytes);
await sh(() => window.__showcase.setAutoFire(false));
console.log('input:', JSON.stringify(await sh(() => window.__showcase.input())));
console.log('evidence:', JSON.stringify(await sh(() => window.__showcase.evidence())).slice(0, 2000));
await page.screenshot({ path: path.join(OUT, 'smoke_end.png') });
await browser.close();
await server.close();
