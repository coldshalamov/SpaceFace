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

  // Teleport player into the Helios Prime nebula hazard zone and spawn asteroids there
  await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    player.pos.x = 400;
    player.pos.z = 600;
    player.vel.x = 0;
    player.vel.z = 0;

    const helpers = window.SF.helpers;
    // Spawn large asteroids inside the nebula hazard zone
    for (let i = 0; i < 5; i++) {
      helpers.spawnEntity({
        type: 'asteroid',
        pos: { x: 380 + i * 25, z: 580 + i * 15 },
        radius: 28,
        mass: 500,
        hull: 240,
        hullMax: 240,
        data: { typeId: 'ast_common_rock', oreHP: 240, oreHPMax: 240 },
      });
    }
  });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const renderer = window.SF.state.render;
    const scene = renderer.scene;
    const findings = [];
    scene.traverse((o) => {
      if (o.userData && o.userData.kind === 'asteroid') {
        const mesh = o.children.find((c) => c.isMesh && c.material && c.material.isMeshStandardMaterial);
        if (mesh) {
          findings.push({
            name: o.name || 'unnamed',
            localPos: { x: o.position.x, y: o.position.y, z: o.position.z },
            material: {
              transparent: mesh.material.transparent,
              opacity: mesh.material.opacity,
              depthTest: mesh.material.depthTest,
              depthWrite: mesh.material.depthWrite,
              renderOrder: mesh.renderOrder,
            },
          });
        }
      }
      if (o.name && (o.name.includes('Hazard') || o.name.includes('nebula'))) {
        findings.push({
          name: o.name,
          renderOrder: o.renderOrder,
          material: o.material ? {
            transparent: o.material.transparent,
            opacity: o.material.opacity,
            depthTest: o.material.depthTest,
            depthWrite: o.material.depthWrite,
            blending: o.material.blending,
          } : null,
        });
      }
    });
    return findings;
  });

  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: '.devshots/nebula_hazard.png' });
} finally {
  await browser.close();
}
