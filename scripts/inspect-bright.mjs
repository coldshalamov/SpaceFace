import { loadPlaywright } from './lib/load-playwright.mjs';

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

try {
  await page.goto('http://localhost:8123', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 15000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Debug Probe' }));
  await page.waitForFunction(
    () => window.SF.state.mode === 'flight' && window.SF.state.playerId && window.SF.state.entities.get(window.SF.state.playerId).mesh,
    null,
    { timeout: 70000 },
  );
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    player.pos.x = 0;
    player.pos.z = 0;
    player.vel.x = 0;
    player.vel.z = 0;

    const helpers = window.SF.helpers;
    // Spawn very large bright asteroids right in front of camera, over a nebula cloud
    for (let i = 0; i < 3; i++) {
      helpers.spawnEntity({
        type: 'asteroid',
        pos: { x: -80 + i * 80, z: 140 },
        radius: 45,
        mass: 500,
        hull: 240,
        hullMax: 240,
        data: { typeId: 'ast_common_rock', oreHP: 240, oreHPMax: 240 },
      });
    }
  });
  await page.waitForTimeout(800);

  // Make asteroids bright green so they're easy to see against the nebula
  await page.evaluate(() => {
    const scene = window.SF.state.render.scene;
    scene.traverse((o) => {
      if (o.userData && o.userData.kind === 'asteroid') {
        const mesh = o.children.find((c) => c.isMesh && c.material && c.material.isMeshStandardMaterial);
        if (mesh) {
          mesh.material = mesh.material.clone();
          mesh.material.color.setHex(0x00ff00);
          mesh.material.emissive.setHex(0x004400);
          mesh.material.emissiveIntensity = 0.8;
        }
      }
    });
  });
  await page.waitForTimeout(500);

  await page.screenshot({ path: '.devshots/asteroid_bright.png' });
} finally {
  await browser.close();
}
