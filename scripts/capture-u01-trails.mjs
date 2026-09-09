#!/usr/bin/env node
// U01-TRAILS visual evidence.
//
// Preferred: ordinary-route game boot (cruise / boost / dense combat).
// Fallback: headless WebGL sheet of the LIVE ribbon owner (engineTrailSurfaces) when authored
// ship readiness refuses flight — the same environmental gate currently fails thruster-acceptance
// in this worktree. The fallback still exercises production follow()/rebuild() + additive liquid
// shader, not a mock lookalike.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'graphics', 'u01-trails');
const WIDTH = 1440;
const HEIGHT = 900;

function findBrowser() {
  return [
    process.env.SF_BROWSER_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find((c) => existsSync(c)) || null;
}

await mkdir(OUT, { recursive: true });
const executablePath = findBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for U01 trail capture');

const ownedServer = await acquireVisualProbeServer({
  explicitUrl: process.env.SF_PROBE_URL || '',
  root: ROOT,
});
console.log(`probe ${ownedServer.baseUrl}`);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const issues = [];
page.on('pageerror', (error) => issues.push({
  type: 'pageerror',
  text: error?.stack || error?.message || String(error),
}));
page.on('console', (message) => {
  if (message.type() === 'error') issues.push({ type: 'console.error', text: message.text() });
});

const captures = [];
let route = 'ordinary';
let diagnostics = null;

try {
  // --- Attempt ordinary route ---
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, {
    timeout: 45_000,
  });
  const startResult = await page.evaluate(async () => {
    try {
      window.SF.bus.emit('game:new', { name: 'U01 Trails', seed: 47 });
      window.SF.bus.emit('ui:closeAll', {});
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  });
  let flightReady = false;
  try {
    await page.waitForFunction(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state.playerId);
      return state?.mode === 'flight' && player?.alive && player?.pos;
    }, null, { timeout: 20_000 });
    flightReady = true;
  } catch (_) {
    flightReady = false;
  }

  if (flightReady) {
    await page.evaluate(() => {
      const v = window.SF.state.settings.video;
      v.engineTrails = true;
      v.particleQuality = 'high';
      v.motionReduce = false;
      v.bloom = true;
      window.SF.bus.emit('settings:changed', { section: 'video', key: 'engineTrails' });
    });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1600);
    await snap('01-cruise.png', 'ordinary-route cruise');
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(1000);
    await snap('02-boost.png', 'ordinary-route boost');
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    await page.evaluate(() => {
      try { window.SF.bus?.emit?.('debug:spawnCombatants', { count: 8, radius: 220 }); } catch (_) {}
    });
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(900);
    await snap('03-dense-combat.png', 'ordinary-route dense combat');
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    diagnostics = await page.evaluate(() => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const vfx = window.SF.registry?.get?.('vfx');
      return {
        route: 'ordinary',
        mode: state.mode,
        engineTrails: state.settings?.video?.engineTrails,
        playerSpeed: player ? Math.hypot(player.vel?.x || 0, player.vel?.z || 0) : 0,
        ribbonOwners: vfx?._ribbonTrails?.size || 0,
        ribbon: vfx?._ribbonTrails?.get?.(player?.id)?.inspect?.() || null,
      };
    });
  } else {
    // --- Fallback: production ribbon owner WebGL sheet ---
    route = 'ribbon-owner-webgl';
    issues.push({
      type: 'route-fallback',
      text: 'ordinary-route flight readiness failed '
        + `(start=${JSON.stringify(startResult)}); capturing live ribbon owner instead`,
    });
    const sheet = await page.evaluate(async () => {
      const THREE = await import('three');
      const { createRibbonTrail } = await import('/src/render/engineTrailSurfaces.js');

      const width = 1440;
      const height = 900;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x03060c, 1);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 4000);
      // Top-ish chase view matching ordinary flight composition.
      camera.position.set(18, 42, 58);
      camera.lookAt(0, 0.4, 0);
      camera.updateMatrixWorld(true);

      function hullMesh() {
        const g = new THREE.ConeGeometry(2.2, 9, 6);
        g.rotateZ(-Math.PI / 2);
        const m = new THREE.MeshBasicMaterial({ color: 0xc8d0d8 });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(0, 0.4, 0);
        return mesh;
      }

      async function captureScenario(label, {
        speed, frames, hitchEvery = 0, hitchDt = 0.08, trails = 1, opacity, radiance,
      }) {
        // Clear prior trails
        while (scene.children.length) {
          const child = scene.children[0];
          scene.remove(child);
          if (child.geometry) child.geometry.dispose?.();
          if (child.material) child.material.dispose?.();
        }
        const hull = hullMesh();
        scene.add(hull);
        const owners = [];
        for (let t = 0; t < trails; t++) {
          const trail = createRibbonTrail(scene, t === 0 ? '#5ad8ff' : '#7aa0ff', t === 0 ? 72 : 48, t === 0 ? 3.4 : 2.2);
          owners.push({
            trail,
            owner: { id: `owner-${t}` },
            x: -t * 14,
            z: t * 9,
            lateral: (t - (trails - 1) * 0.5) * 0.35,
          });
        }
        let simT = 0;
        for (let i = 0; i < frames; i++) {
          const hitch = hitchEvery > 0 && i > 0 && (i % hitchEvery) === 0;
          const dt = hitch ? hitchDt : 1 / 60;
          simT += dt;
          for (let t = 0; t < owners.length; t++) {
            const o = owners[t];
            const yaw = 0.01 * i + o.lateral * 0.04;
            const step = speed * dt;
            o.x += Math.cos(yaw) * step;
            o.z += Math.sin(yaw) * step;
            // Socket is slightly aft of hull tip.
            const nx = o.x - Math.cos(yaw) * 4.5;
            const nz = o.z - Math.sin(yaw) * 4.5;
            o.trail.follow(nx, nz, yaw, dt, o.owner, 2.4, 640, 1 / 30);
            o.trail.rebuild(opacity, (simT * 0.34) % 1, simT, radiance);
            if (t === 0) {
              hull.position.set(o.x, 0.4, o.z);
              hull.rotation.y = -yaw;
            }
          }
        }
        // Frame the lead ship
        const lead = owners[0];
        camera.position.set(lead.x + 22, 36, lead.z + 48);
        camera.lookAt(lead.x, 0.4, lead.z);
        camera.updateMatrixWorld(true);
        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL('image/png');
        const stats = owners.map((o) => o.trail.inspect());
        for (const o of owners) o.trail.dispose();
        return {
          label,
          dataUrl,
          stats,
          speed,
          frames,
          trails,
        };
      }

      const scenarios = [
        await captureScenario('cruise', {
          speed: 160, frames: 90, trails: 1, opacity: 0.72, radiance: 1.65,
        }),
        await captureScenario('boost', {
          speed: 520, frames: 110, hitchEvery: 19, hitchDt: 0.09,
          trails: 1, opacity: 0.9, radiance: 2.1,
        }),
        await captureScenario('dense-combat', {
          speed: 340, frames: 100, hitchEvery: 17, hitchDt: 0.07,
          trails: 8, opacity: 0.82, radiance: 1.9,
        }),
      ];
      renderer.dispose();
      return scenarios;
    });

    const fileMap = {
      cruise: '01-cruise.png',
      boost: '02-boost.png',
      'dense-combat': '03-dense-combat.png',
    };
    const labelMap = {
      cruise: 'ribbon-owner cruise (production follow/rebuild + liquid shader)',
      boost: 'ribbon-owner boost/hitch (equal-spacing glue under delayed frames)',
      'dense-combat': 'ribbon-owner dense fleet (8 concurrent trails)',
    };
    for (const s of sheet) {
      const file = fileMap[s.label];
      const fullPath = path.join(OUT, file);
      const b64 = s.dataUrl.slice(s.dataUrl.indexOf(',') + 1);
      await writeFile(fullPath, Buffer.from(b64, 'base64'));
      captures.push({
        file,
        label: labelMap[s.label],
        path: fullPath,
        stats: s.stats,
        speed: s.speed,
        trails: s.trails,
      });
      console.log(`captured ${file} — ${labelMap[s.label]}`);
    }
    diagnostics = {
      route,
      scenarios: sheet.map((s) => ({
        label: s.label,
        speed: s.speed,
        trails: s.trails,
        frames: s.frames,
        lead: s.stats[0],
      })),
    };
  }

  const report = {
    schema: 'spaceface.u01Trails.v1',
    out: OUT,
    baseUrl: ownedServer.baseUrl,
    route,
    viewport: { width: WIDTH, height: HEIGHT },
    captures,
    diagnostics,
    issues: issues.slice(0, 40),
    ok: captures.length >= 3,
  };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await ownedServer.close().catch(() => {});
}

async function snap(file, label) {
  const fullPath = path.join(OUT, file);
  await page.screenshot({ path: fullPath, type: 'png' });
  captures.push({ file, label, path: fullPath });
  console.log(`captured ${file} — ${label}`);
}
