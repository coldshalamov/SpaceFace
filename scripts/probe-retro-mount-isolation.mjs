#!/usr/bin/env node
/**
 * Isolation probe for the bow retro HARDWARE (retroMounts.js), not the jets.
 * Boots the game, parks the ship, then diffs two stills: assembly visible vs hidden.
 * The pixel delta is exactly the manufactured mount. Also dumps the assembly's
 * hull-local bounding box vs the hull's own bounds. Writes to .devshots/retro-mounts/.
 *
 *   node scripts/probe-retro-mount-isolation.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, '.devshots', 'retro-mounts');

function findBrowser() {
  return [
    process.env.SF_BROWSER_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find((c) => existsSync(c)) || null;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function freePort(start) {
  for (let p = start; p < start + 60; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error('no free port');
}

const port = await freePort(8290);
const baseUrl = `http://127.0.0.1:${port}/`;
const child = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
});
let serverOut = '';
child.stdout.on('data', (c) => { serverOut = (serverOut + c).slice(-4000); });
child.stderr.on('data', (c) => { serverOut = (serverOut + c).slice(-4000); });

const { chromium } = await loadPlaywright();
const executablePath = findBrowser();
const browser = await chromium.launch({
  headless: true,
  executablePath: executablePath || undefined,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling'],
});

async function shot(page, name) {
  const box = await page.locator('#gl-canvas').boundingBox();
  const clip = box
    ? { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) }
    : undefined;
  const buf = await page.screenshot({ type: 'png', clip });
  await writeFile(join(OUT, name), buf);
  console.log(`wrote ${name}`);
}

try {
  for (let i = 0; i < 60; i++) {
    if (await fetch(baseUrl).then((r) => r.ok).catch(() => false)) break;
    if (child.exitCode != null) throw new Error(`server died: ${serverOut}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  const url = new URL(baseUrl);
  url.searchParams.set('debug', 'flight');
  await page.goto(String(url), { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 120000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Mount Probe' }));
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    if (!state || state.mode !== 'flight' || !state.playerId) return false;
    const player = state.entities && state.entities.get(state.playerId);
    return !!(player && (player.mesh || (player.view && player.view.root)));
  }, null, { timeout: 150000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (/begin|launch|launch ship|depart/i.test(b.textContent || '')) { b.click(); break; }
    }
  }).catch(() => {});
  await page.waitForTimeout(300);
  await mkdir(OUT, { recursive: true });

  // Freeze the sim so the two stills are identical except the mount visibility.
  const info = await page.evaluate(() => {
    const sf = window.SF;
    sf.state.paused = true;
    const player = sf.state.entities.get(sf.state.playerId);
    const root = player.view && player.view.root;
    let assembly = null;
    root && root.traverse((o) => {
      if (o.userData && o.userData.spacefaceRetroHardware) assembly = o;
    });
    if (!assembly) return { found: false };
    // Measure the hull in hull-local units: overall box, and the real flank half-width at the
    // retro station so we can see how far the mounts float past the skin.
    const hull = assembly.parent;
    const inv = hull.matrixWorld.clone().invert();
    const retroMeshes = new Set();
    assembly.traverse((o) => retroMeshes.add(o));
    const sockets = {};
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const bowVerts = []; // verts near the bow station band
    hull.traverse((o) => {
      if (o.name && o.name.startsWith('SOCKET_Retro')) {
        sockets[o.name] = { pos: o.position.toArray().map((v) => +v.toFixed(3)) };
        return;
      }
      if (!o.isMesh || retroMeshes.has(o) || !o.geometry || !o.geometry.attributes) return;
      const pos = o.geometry.attributes.position;
      const v = pos.array;
      const m = o.matrixWorld.clone().premultiply(inv); // world → hull-local
      const e = m.elements;
      for (let i = 0; i < pos.count; i += 1) {
        const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
        const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
        const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (lx < min[0]) min[0] = lx; if (lx > max[0]) max[0] = lx;
        if (ly < min[1]) min[1] = ly; if (ly > max[1]) max[1] = ly;
        if (lz < min[2]) min[2] = lz; if (lz > max[2]) max[2] = lz;
        if (lx > 0.34 && lx < 0.52 && ly > -0.05 && ly < 0.16) bowVerts.push(lx, ly, lz);
      }
    });
    // Flank half-width at a few stations along the bow band.
    const flankAt = {};
    for (const c of [0.36, 0.40, 0.44, 0.48]) {
      let w = 0;
      for (let i = 0; i + 2 < bowVerts.length; i += 3) {
        if (Math.abs(bowVerts[i] - c) < 0.02 && Math.abs(bowVerts[i + 2]) > w) w = Math.abs(bowVerts[i + 2]);
      }
      flankAt[c.toFixed(2)] = +w.toFixed(3);
    }
    // Retro assembly's own hull-local box.
    const amin = [Infinity, Infinity, Infinity];
    const amax = [-Infinity, -Infinity, -Infinity];
    for (const mesh of retroMeshes) {
      if (!mesh.isMesh || !mesh.geometry) continue;
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox;
      for (const cx of [b.min.x, b.max.x]) for (const cy of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) {
        const p = { x: cx, y: cy, z: cz };
        const v = new b.min.constructor(p.x, p.y, p.z).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
        amin[0] = Math.min(amin[0], v.x); amax[0] = Math.max(amax[0], v.x);
        amin[1] = Math.min(amin[1], v.y); amax[1] = Math.max(amax[1], v.y);
        amin[2] = Math.min(amin[2], v.z); amax[2] = Math.max(amax[2], v.z);
      }
    }
    const f3 = (a) => a.map((v) => +v.toFixed(3));
    return {
      found: true, name: assembly.name, children: assembly.children.length,
      hullBox: { min: f3(min), max: f3(max) },
      flankHalfWidthAt: flankAt,
      assemblyBox: { min: f3(amin), max: f3(amax) },
      sockets,
    };
  });
  console.log('assembly:', JSON.stringify(info, null, 1));

  await page.waitForTimeout(250);
  await shot(page, 'mounts-visible.png');
  // Identify which child mesh owns the visible silhouette: hide each in turn and screenshot.
  const childNames = await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    const out = [];
    player.view.root.traverse((o) => {
      if (o.userData && o.userData.spacefaceRetroHardware) {
        for (const c of o.children) out.push({ name: c.name, color: c.material && c.material.color && c.material.color.getHexString(), emissive: c.material && c.material.emissive && c.material.emissive.getHexString(), eInt: c.material && c.material.emissiveIntensity, metal: c.material && c.material.metalness, rough: c.material && c.material.roughness });
      }
    });
    return out;
  });
  console.log('children:', JSON.stringify(childNames));
  for (const child of childNames) {
    await page.evaluate((name) => {
      const sf = window.SF;
      const player = sf.state.entities.get(sf.state.playerId);
      player.view.root.traverse((o) => {
        if (o.userData && o.userData.spacefaceRetroHardware) {
          for (const c of o.children) c.visible = c.name !== name;
        }
      });
    }, child.name);
    await page.waitForTimeout(180);
    await shot(page, `hide-${child.name}.png`);
  }
  await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    player.view.root.traverse((o) => {
      if (o.userData && o.userData.spacefaceRetroHardware) o.visible = false;
    });
  });
  await page.waitForTimeout(250);
  await shot(page, 'mounts-hidden.png');
  await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    player.view.root.traverse((o) => {
      if (o.userData && o.userData.spacefaceRetroHardware) o.visible = true;
    });
  });
} finally {
  await browser.close();
  child.kill();
}
