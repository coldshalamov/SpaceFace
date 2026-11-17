// Lead look tool (G17-02): capture one in-flight picture per sector and build a 2-row contact sheet.
// Run under the lock:
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/sector-shots.mjs [sector-ids...] [--x=<wu> --z=<wu> --heading=<deg> --t=<sec> --out=<dir>]
// Aim options position the player once the sector is in flight: --x/--z are sector-local
// world units (the same frame src/data sector anchors and site files use), --heading is
// degrees, --t is the post-aim settle delay in seconds (default 3), --out redirects PNGs.
// --freeze=0 skips the post-aim time-freeze (a diagnostic for render-lane sync issues).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sectorGlobalOrigin } from '../../../src/data/sectorCoordinates.js';

const PORT = 8168;

const DEFAULT_SECTOR_IDS = [
  'helios_core',
  'sector_ceres_belt',
  'sector_vesta_forge',
  'sector_pallas_drift',
  'tethys',
  'sector_io_reach',
  'sector_sker_haven',
  'sector_veil_nebula',
];

const opts = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));
const cliArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const sectorIds = cliArgs.length > 0 ? cliArgs : DEFAULT_SECTOR_IDS;

const OUT_DIR = opts.out != null ? String(opts.out) : '.devshots/fleet/looks/sectors';
mkdirSync(OUT_DIR, { recursive: true });
const settleSeconds = Number.isFinite(Number(opts.t)) ? Number(opts.t) : 3;
const censusRadius = Number.isFinite(Number(opts.census)) ? Number(opts.census) : 1600;
const freezeAfterAim = opts.freeze !== '0';
const aim = (opts.x != null || opts.z != null || opts.heading != null) ? {
  x: Number.isFinite(Number(opts.x)) ? Number(opts.x) : 0,
  z: Number.isFinite(Number(opts.z)) ? Number(opts.z) : 0,
  heading: Number.isFinite(Number(opts.heading)) ? Number(opts.heading) : null,
} : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn(process.execPath, ['server.js', String(PORT)], {
  cwd: process.cwd(),
  stdio: 'ignore',
});

let browser = null;

try {
  await sleep(2500);

  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });

  for (const sectorId of sectorIds) {
    console.log(`[sector-shots] capturing sector: ${sectorId}`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200)));

    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    });

    const seedQuery = Number.isFinite(Number(opts.seed)) && Number(opts.seed) > 0 ? `&seed=${Number(opts.seed)}` : '';
    const url = `http://127.0.0.1:${PORT}/?sector=${encodeURIComponent(sectorId)}&shot=1${seedQuery}`;
    await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });

    const splash = page.locator('#cinematic-splash');
    if (await splash.count().catch(() => 0)) {
      await splash.click({ timeout: 4000 }).catch(() => {});
      await page.waitForSelector('#cinematic-splash', { state: 'detached', timeout: 6000 }).catch(() => {});
    }

    // The first-run "First light" prompt appears some seconds after load, dims the scene and holds
    // the game. Answer it with PLAY (shipped settings) whenever it shows, until the sector is ready;
    // removing its DOM instead (the first version) left the dimmed, held frame in every picture.
    const deadline = Date.now() + 180_000;
    let ready = false;
    while (!ready && Date.now() < deadline) {
      const ok = page.locator('.sf-confirm__ok');
      if (await ok.first().isVisible().catch(() => false)) {
        await ok.first().click().catch(() => {});
        await page.waitForSelector('.sf-confirm', { state: 'detached', timeout: 4000 }).catch(() => {});
      }
      ready = await page.evaluate(() => window.__sfShotReady === true).catch(() => false);
      if (!ready) await page.waitForTimeout(1000);
    }
    if (!ready) throw new Error(`sector ${sectorId} never became ready`);

    // Aim: move the player through the world's same-sector relocation seam. CLI --x/--z
    // are sector-local; the seam wants galactic-global XZ + radians. Heading orients the
    // hull — the chase camera never yaws, so framing comes from where the ship sits.
    const placePlayer = ({ globalPos, headingDeg, freeze }) => page.evaluate(async ({ globalPos: g, headingDeg: h, freeze: f }) => {
      const sf = window.SF || {};
      const world = sf.registry && sf.registry.get('world');
      const state = sf.state;
      if (!world || typeof world.relocatePlayerInSector !== 'function' || !state) {
        return { ok: false, error: 'window.SF world/state unavailable' };
      }
      const entry = { x: g.x, z: g.z };
      if (Number.isFinite(h)) entry.heading = (h * Math.PI) / 180;
      const result = world.relocatePlayerInSector(entry, { reason: 'sector-shots-aim' });
      if (result && typeof result.then === 'function') await result;
      if (f && sf.timeEffects && typeof sf.timeEffects.set === 'function') {
        sf.timeEffects.set('sector-shots:aim', { scale: 0 });
      }
      const player = state.entities && state.entities.get(state.playerId);
      if (!player || !player.pos) return { ok: false, error: 'player entity missing' };
      const dx = player.pos.x - g.x;
      const dz = player.pos.z - g.z;
      return {
        ok: Math.hypot(dx, dz) < 64,
        x: player.pos.x,
        z: player.pos.z,
        drift: Math.hypot(dx, dz),
        rot: player.rot,
      };
    }, { globalPos, headingDeg, freeze });

    if (aim) {
      const origin = sectorGlobalOrigin(sectorId);
      const global = { x: aim.x + origin.x, z: aim.z + origin.z };
      const placed = await placePlayer({ globalPos: global, headingDeg: aim.heading, freeze: false });
      if (!placed.ok) throw new Error(`sector ${sectorId} aim failed: ${JSON.stringify(placed)}`);
      console.log(`[sector-shots] aimed ${sectorId}: local(${aim.x},${aim.z}) -> global(${placed.x.toFixed(1)},${placed.z.toFixed(1)}) rot=${Number.isFinite(placed.rot) ? (placed.rot * 180 / Math.PI).toFixed(1) : '?'}deg`);

      // Field-rock materialization, sector swap and mesh stream-in are sim-progressive and
      // follow the presented player, so the ship must sit at the aim point while they run —
      // gameplay forces (patrol pushes, Bolus peristalsis) otherwise walk it out of frame and
      // the region that streams in is the drifted one. Pin the aim for the --t window by
      // re-placing it live (relocating also re-zeroes velocity), then re-place and freeze.
      // Freezing the lane early can leave the presented replica on the previous sector's
      // backdrop (the Bolus hides spaceBg only once `inside` is presented), so first wait
      // until the renderer's own state reports the aimed sector's background.
      const expectInside = sectorId === 'sector_the_bolus';
      await page.waitForFunction((inside) => {
        const render = window.SF && window.SF.state && window.SF.state.render;
        const bg = render && render.spaceBg;
        if (!bg || !bg.group) return true; // no backdrop handle — don't block on it
        return bg.group.visible === !inside;
      }, expectInside, { timeout: 30_000, polling: 300 }).catch(() => {});
      const pinUntil = Date.now() + Math.max(0, settleSeconds * 1000);
      while (Date.now() < pinUntil) {
        await page.waitForTimeout(700);
        if (Date.now() >= pinUntil) break;
        await placePlayer({ globalPos: global, headingDeg: aim.heading, freeze: false }).catch(() => {});
      }
      const repl = await placePlayer({ globalPos: global, headingDeg: aim.heading, freeze: freezeAfterAim });
      if (!repl.ok) throw new Error(`sector ${sectorId} re-aim failed: ${JSON.stringify(repl)}`);
      if (Number.isFinite(Number(opts.zoom)) || Number.isFinite(Number(opts.exposure))) {
        // --photo-compatible free camera: the renderer's follow() reads state.render.photoMode
        // every frame, so a record stamped here aims/focuses/zooms/exposes the same camera the
        // pause route's photo mode drives. hideHud needs the k-photo body class to matter.
        const photoRec = {
          zoom: Number.isFinite(Number(opts.zoom)) ? Number(opts.zoom) : null,
          exposure: Number.isFinite(Number(opts.exposure)) ? Number(opts.exposure) : null,
        };
        await page.evaluate(({ g, rec }) => {
          const sf = window.SF || {};
          const state = sf.state;
          if (!state || !state.render) return;
          const cam = state.camera || {};
          state.render.photoMode = {
            active: true,
            hideHud: true,
            freeCamera: true,
            filters: false,
            filterLook: 'chrome',
            exposure: rec.exposure != null ? rec.exposure : 1,
            focusX: g.x,
            focusZ: g.z,
            zoom: rec.zoom != null ? rec.zoom : (Number.isFinite(cam.zoom) ? cam.zoom : 144),
            inputX: 0,
            inputZ: 0,
            zoomInput: 0,
            panSpeed: 90,
          };
          try { document.body && document.body.classList.add('k-photo'); } catch (_) {}
        }, { g: global, rec: photoRec });
      }
      await page.waitForTimeout(600);
    } else {
      // Let the opening settle (fades, arrival motion) before the picture.
      await page.waitForTimeout(Math.max(0, settleSeconds * 1000));
    }

    const atShot = await page.evaluate(({ sectorOrigin, censusRadius: radius }) => {
      const sf = window.SF || {};
      const state = sf.state;
      const player = state && state.entities && state.entities.get(state.playerId);
      if (!player || !player.pos) return null;
      const near = [];
      if (state.entities && typeof state.entities.forEach === 'function') {
        state.entities.forEach((e, id) => {
          if (id === state.playerId || !e || !e.pos) return;
          const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
          if (d < radius) {
            const s = sf.helpers && typeof sf.helpers.worldToScreen === 'function'
              ? sf.helpers.worldToScreen({ x: e.pos.x, z: e.pos.z })
              : null;
            near.push({
              id: e.id || id,
              type: (e.data && (e.data.kind || e.data.type)) || e.kind || e.type || '?',
              placeId: (e.data && e.data.placeId) || null,
              label: (e.data && (e.data.name || e.data.scanLabel)) || e.name || null,
              d: Math.round(d),
              lx: Math.round(e.pos.x - (sectorOrigin && sectorOrigin.x || 0)),
              lz: Math.round(e.pos.z - (sectorOrigin && sectorOrigin.z || 0)),
              sx: s && Number.isFinite(s.x) ? Math.round(s.x) : null,
              sy: s && Number.isFinite(s.y) ? Math.round(s.y) : null,
              vis: !!(s && s.onScreen),
            });
          }
        });
      }
      near.sort((a, b) => a.d - b.d);
      const byType = {};
      for (const n of near) byType[n.type] = (byType[n.type] || 0) + 1;
      const places = near.filter((n) => n.placeId).slice(0, 120);
      const asteroids = near.filter((n) => n.type === 'asteroid');
      const camRec = state.camera || {};
      return { simTime: state && state.simTime, x: player.pos.x, z: player.pos.z, near: near.slice(0, 10), places, count: near.length, byType, asteroids: asteroids.slice(0, 80), asteroidCount: asteroids.length, currentSectorId: state.world && state.world.currentSectorId, photoMode: state.render && state.render.photoMode, camera: { zoom: camRec.zoom, composedZoom: camRec.composedZoom, focus: camRec.focus } };
    }, { sectorOrigin: sectorGlobalOrigin(sectorId), censusRadius }).catch(() => null);
    if (atShot) {
      console.log(`[sector-shots] capture ${sectorId}: simTime=${Number(atShot.simTime).toFixed(1)}s pos=(${Number(atShot.x).toFixed(0)},${Number(atShot.z).toFixed(0)}) sector=${atShot.currentSectorId} near<${censusRadius}=${atShot.count} types=${JSON.stringify(atShot.byType)} cam=${JSON.stringify(atShot.camera)} photoActive=${atShot.photoMode && atShot.photoMode.active}`);
      for (const n of atShot.near) console.log(`[sector-shots]   near ${n.type} ${n.id}${n.placeId ? ` ${n.placeId}` : ''}${n.label ? ` "${n.label}"` : ''} @${n.d} local(${n.lx},${n.lz})`);
      for (const p of atShot.places || []) console.log(`[sector-shots]   place ${p.placeId}${p.label ? ` "${p.label}"` : ''} @${p.d} local(${p.lx},${p.lz})${p.vis ? ' onScreen' : ''}`);
      if (atShot.asteroids && atShot.asteroidCount > 10) {
        for (const a of atShot.asteroids) console.log(`[sector-shots]   ast ${a.id} @${a.d} local(${a.lx},${a.lz})`);
      }
    }

    const shotPath = join(OUT_DIR, `${sectorId}.png`);
    await page.screenshot({ path: shotPath });
    console.log(`[sector-shots] saved ${shotPath}`);

    await page.close();
  }

  // Build the 2-row contact sheet
  console.log('[sector-shots] creating contact sheet...');
  const sheetPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const items = sectorIds.map((id) => ({
    id,
    dataUrl: `data:image/png;base64,${readFileSync(join(OUT_DIR, `${id}.png`)).toString('base64')}`,
  }));

  const sheetDataUrl = await sheetPage.evaluate(async ({ items: shots, rows, cellW, cellH, captionH, gap, pad }) => {
    const images = await Promise.all(shots.map((shot) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`could not decode image for ${shot.id}`));
      img.src = shot.dataUrl;
    })));

    const cols = Math.ceil(images.length / rows);
    const canvas = document.createElement('canvas');
    canvas.width = pad * 2 + cols * cellW + (cols - 1) * gap;
    canvas.height = pad * 2 + rows * (cellH + captionH) + (rows - 1) * gap;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    images.forEach((image, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = pad + col * (cellW + gap);
      const y = pad + row * (cellH + captionH + gap);

      ctx.drawImage(image, x, y, cellW, cellH);

      ctx.fillStyle = '#f1f5f9';
      ctx.font = '600 20px monospace, sans-serif';
      ctx.fillText(shots[index].id, x + 4, y + cellH + 24);
    });

    return canvas.toDataURL('image/png');
  }, { items, rows: 2, cellW: 640, cellH: 360, captionH: 34, gap: 16, pad: 20 });

  const sheetPath = join(OUT_DIR, 'sheet.png');
  writeFileSync(sheetPath, Buffer.from(sheetDataUrl.split(',')[1], 'base64'));
  console.log(`[sector-shots] saved contact sheet: ${sheetPath}`);

  await sheetPage.close();
} finally {
  if (browser) {
    await browser.close().catch(() => {});
  }
  server.kill();
}
