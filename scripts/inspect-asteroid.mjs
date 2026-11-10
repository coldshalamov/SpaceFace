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

  // Teleport player to origin and place asteroids in a line in front of camera
  await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    player.pos.x = 0;
    player.pos.z = 0;
    player.vel.x = 0;
    player.vel.z = 0;

    // Spawn several common asteroids right in front of the camera view
    const helpers = window.SF.helpers;
    for (let i = 0; i < 3; i++) {
      helpers.spawnEntity({
        type: 'asteroid',
        pos: { x: -60 + i * 60, z: 120 },
        radius: 35,
        mass: 500,
        hull: 240,
        hullMax: 240,
        data: { typeId: 'ast_common_rock', oreHP: 240, oreHPMax: 240 },
      });
    }
    // also a crystalline one
    helpers.spawnEntity({
      type: 'asteroid',
      pos: { x: 40, z: 220 },
      radius: 16,
      mass: 500,
      hull: 240,
      hullMax: 240,
      data: { typeId: 'ast_crystalline', oreHP: 240, oreHPMax: 240 },
    });
  });
  await page.waitForTimeout(1000);

  const info = await page.evaluate(() => {
    const renderer = window.SF.state.render;
    const scene = renderer.scene;
    const cam = renderer.camera;
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
              color: mesh.material.color.getHexString(),
              type: mesh.material.type,
            },
          });
        }
      }
      if (o.name && o.name.includes('L1_nebula')) {
        findings.push({
          name: o.name,
          renderOrder: o.renderOrder,
          material: {
            transparent: o.material.transparent,
            opacity: o.material.opacity,
            depthTest: o.material.depthTest,
            depthWrite: o.material.depthWrite,
          },
        });
      }
    });
    findings.push({ camPos: { x: cam.position.x, y: cam.position.y, z: cam.position.z } });
    return findings;
  });

  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: '.devshots/asteroid_front.png' });
} finally {
  await browser.close();
}
