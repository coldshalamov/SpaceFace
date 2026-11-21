#!/usr/bin/env node
// probe-side-modes.mjs — one boot, a look at every place the game leaves ordinary flight:
// a circuit race under the stern camera, Field Build over a belt, and the planet (sling, skim).
// It drives the real game with real keys and writes frames plus a small facts file. It asserts
// nothing: the pictures are for a person to open and judge.
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-side-modes.mjs [--only=race,field,planet] [--out=dir]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ONLY = new Set(String(arg('only', 'race,job,rover,field,planet')).split(',').map((s) => s.trim()).filter(Boolean));
const OUT_DIR = resolve(ROOT, arg('out', '.devshots/side-modes'));
const RACE_CONTRACT = arg('contract', '');
const RACE_SECONDS = Number(arg('raceSeconds', 45));
const VIEWPORT = { width: 1600, height: 900 };
mkdirSync(OUT_DIR, { recursive: true });

const { chromium } = await loadPlaywright();
const facts = {};
const log = (line) => console.log(`[side-modes] ${line}`);
let server = null;
let browser = null;

function findSystemBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean).find((candidate) => existsSync(candidate)) || null;
}

function findFreePort(start) {
  return new Promise((resolvePort, reject) => {
    const tryPort = (port) => {
      const probe = createNetServer();
      probe.once('error', () => (port > start + 200 ? reject(new Error('no free port')) : tryPort(port + 1)));
      probe.once('listening', () => probe.close(() => resolvePort(port)));
      probe.listen(port, '127.0.0.1');
    };
    tryPort(start);
  });
}

async function startServer() {
  const port = await findFreePort(8330);
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((ok, bad) => {
    gameServer.once('error', bad);
    gameServer.once('listening', ok);
    gameServer.listen(port, '127.0.0.1');
  });
  return { baseUrl: `http://127.0.0.1:${port}/`, close: () => new Promise((ok) => gameServer.close(() => ok())) };
}

async function newPage() {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      localStorage.setItem('sf.firstRunIntroSeen', '1');
    } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 60000 });
  return { page, issues };
}

async function waitFlight(page, timeout = 240000) {
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout });
  const base = await page.evaluate(() => ({ tick: window.SF.state.tick || 0 }));
  await page.waitForFunction(({ tick }) => {
    const s = window.SF.state;
    return s.mode === 'flight' && Number(s.timeScale) > 0 && (s.tick || 0) > tick + 5
      && typeof s.render?.releaseOpeningPresentationHold !== 'function';
  }, base, { timeout: 90000 }).catch(() => {});
}

const shooter = (page, prefix) => async (name) => {
  const path = join(OUT_DIR, `${prefix}-${name}.png`);
  await page.screenshot({ path, type: 'png' }).catch((e) => log(`shot ${name} failed: ${e.message}`));
  return path;
};

// ---------------------------------------------------------------------------------------------
async function runRace() {
  const { page, issues } = await newPage();
  const shot = shooter(page, 'race');
  try {
    await page.evaluate(() => {
      const sf = window.SF;
      sf.bus.emit('settings:changed', { section: 'gameplay', key: 'steeringView', value: 'racing' });
      if (sf.state.settings?.gameplay) sf.state.settings.gameplay.steeringView = 'racing';
    });
    await page.getByText('CIRCUITS', { exact: true }).first().click({ timeout: 30000 })
      .catch(async () => { await page.getByText('Circuits', { exact: false }).first().click({ timeout: 5000 }); });
    await page.waitForSelector('.race-board-course', { timeout: 30000 });
    await page.locator('.race-board-course').first().click().catch(() => {});
    await page.waitForSelector('.race-board-launch', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(600);
    await shot('00-board');
    facts.raceBoard = await page.evaluate(() => [...document.querySelectorAll('.race-board-course')].map((card) => ({
      title: (card.querySelector('h2,h3,.race-board-title') || card).textContent.trim().slice(0, 80),
      text: card.textContent.replace(/\s+/g, ' ').trim().slice(0, 260),
    })));
    if (RACE_CONTRACT) {
      await page.evaluate((id) => {
        const card = [...document.querySelectorAll('.race-board-course')]
          .find((c) => c.dataset.contractId === id || c.dataset.levelId === id || c.textContent.includes(id));
        if (card) card.click();
      }, RACE_CONTRACT);
      await page.waitForTimeout(300);
    }
    await page.locator('.race-board-launch').first().click();
    await page.getByRole('button', { name: 'Launch circuit', exact: true }).click({ timeout: 2500 }).catch(() => {});
    await waitFlight(page);
    await page.waitForTimeout(800);
    await shot('01-grid');
    facts.raceStart = await page.evaluate(() => {
      const st = window.SF.state;
      const race = (st.missions?.active || []).find((m) => m.status === 'active' && m.type === 'race');
      return race ? {
        title: race.title, course: race.params?.courseId, mode: race.params?.raceMode,
        gates: (race.params?.gates || []).length, laps: race.params?.laps,
        view: st.settings?.gameplay?.steeringView, sector: st.world?.currentSectorId,
      } : null;
    });
    log(`race: ${JSON.stringify(facts.raceStart)}`);

    // Fly it: hold throttle, steer at the next gate with real A/D presses.
    const keys = { w: false, a: false, d: false };
    const set = async (key, code, want) => {
      if (keys[key] === want) return;
      keys[key] = want;
      if (want) await page.keyboard.down(code); else await page.keyboard.up(code);
    };
    const marks = new Map([[2, '02-launch'], [6, '03-first-leg'], [11, '04-turn'], [17, '05-mid'],
      [24, '06-pack'], [32, '07-late'], [RACE_SECONDS - 1, '08-end']]);
    const started = Date.now();
    let turnSign = 1, errAt = null, errWas = 0;
    const trace = [];
    let lastMark = -1;
    while ((Date.now() - started) / 1000 < RACE_SECONDS) {
      const s = await page.evaluate(async () => {
        const st = window.SF.state;
        const race = (st.missions?.active || []).find((m) => m.status === 'active' && m.type === 'race');
        const p = st.entities.get(st.playerId);
        if (!race || !p) return { done: !race };
        const { sectorLocalToGlobalForSector } = await import('/src/data/sectorCoordinates.js');
        const gates = race.params.gates || [];
        const gate = gates[Math.min(gates.length - 1, race.params.nextGate | 0)];
        const pos = gate && (gate.pos || gate);
        const g = pos ? sectorLocalToGlobalForSector({ x: pos.x, z: pos.z }, st.world.currentSectorId) : null;
        const want = g ? Math.atan2(g.z - p.pos.z, g.x - p.pos.x) : p.rot;
        let diff = want - p.rot;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return {
          diff, rot: p.rot, speed: Math.hypot(p.vel.x, p.vel.z), next: race.params.nextGate | 0, lap: race.params.lap | 0,
          dist: g ? Math.hypot(g.x - p.pos.x, g.z - p.pos.z) : null, hold: Number(race.params.gridUntilSimS) > st.simTime,
        };
      }).catch(() => ({ err: true }));
      if (s.done) break;
      if (!s.err) {
        await set('w', 'KeyW', Math.abs(s.diff) < 0.9 && !(s.speed > 150 && Math.abs(s.diff) > 0.35));
        // Which key closes the angle is learned from the result: if a second and a half of
        // steering has made the error worse, the keys are the other way round.
        if (!s.hold && Math.abs(s.diff) > 0.12) {
          if (errAt == null) { errAt = Date.now(); errWas = Math.abs(s.diff); }
          else if (Date.now() - errAt > 1500) {
            if (Math.abs(s.diff) > errWas + 0.25) turnSign = -(turnSign || 1);
            errAt = Date.now(); errWas = Math.abs(s.diff);
          }
        } else errAt = null;
        const want = s.diff * (turnSign || 1);
        await set('d', 'KeyD', want > 0.06);
        await set('a', 'KeyA', want < -0.06);
        trace.push({ t: +((Date.now() - started) / 1000).toFixed(1), ...s, diff: +s.diff.toFixed(2), speed: Math.round(s.speed) });
      }
      const sec = Math.floor((Date.now() - started) / 1000);
      if (marks.has(sec) && sec !== lastMark) { lastMark = sec; await shot(marks.get(sec)); }
      await page.waitForTimeout(120);
    }
    for (const [key, code] of [['w', 'KeyW'], ['a', 'KeyA'], ['d', 'KeyD']]) await set(key, code, false);
    facts.raceTrace = trace.filter((_, i) => i % 12 === 0).map(({ rot, ...rest }) => rest);
    facts.raceTurnSign = turnSign;
    // What is the big flat thing? Name every large mesh near the ship that is a plane or a quad.
    facts.raceBigQuads = await page.evaluate(() => {
      const st = window.SF.state, scene = st.render && st.render.scene, out = [];
      if (!scene) return null;
      const THREE = window.SF.THREE, box = new THREE.Box3(), size = new THREE.Vector3(), pos = new THREE.Vector3();
      scene.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry) return;
        const count = o.geometry.attributes.position ? o.geometry.attributes.position.count : 0;
        if (count > 8) return;
        box.setFromObject(o); box.getSize(size); o.getWorldPosition(pos);
        const big = Math.max(size.x, size.y, size.z);
        if (big < 60 || big > 4000) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        let chain = '', n = o;
        for (let i = 0; i < 4 && n; i++, n = n.parent) chain += (n.name || n.type) + ' < ';
        out.push({ chain: chain.slice(0, 140), size: [Math.round(size.x), Math.round(size.y), Math.round(size.z)],
          pos: [Math.round(pos.x), Math.round(pos.y), Math.round(pos.z)],
          color: m && m.color ? '#' + m.color.getHexString() : null, opacity: m ? m.opacity : null,
          mat: m ? m.type : null, map: !!(m && m.map), blend: m ? m.blending : null });
      });
      return out.slice(0, 30);
    }).catch((e) => String(e));
    facts.raceEnd = await page.evaluate(() => {
      const st = window.SF.state;
      const race = (st.missions?.active || []).find((m) => m.type === 'race');
      return { hud: (document.querySelector('.racing-hud, [data-racing-hud]') || {}).textContent || null,
        next: race?.params?.nextGate, status: race?.status };
    });
    await shot('09-after');
  } catch (error) {
    facts.raceError = String(error && error.message || error);
    log(`race failed: ${facts.raceError}`);
    await shot('zz-error');
  }
  facts.raceIssues = issues.errors ? issues.errors.slice(0, 8) : null;
  await page.close();
}

// ---------------------------------------------------------------------------------------------
async function startAdventure(page) {
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Side Modes', difficulty: 'standard', seed: 47 }));
  await waitFlight(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const st = window.SF.state;
    if (st.onboarding) { st.onboarding.dismissed = true; }
    window.SF.bus.emit('onboarding:skip', {});
  }).catch(() => {});
}

async function relocate(page, pose) {
  await page.evaluate(async (p) => {
    const { laneCommandSink, laneRpc } = await import('/src/core/simLaneCommands.js');
    if (laneCommandSink()) await laneRpc('worldCall', { method: 'relocatePlayerInSector', pose: p, opts: { reason: 'side-modes-probe' } });
    else window.SF.registry.get('world').relocatePlayerInSector(p, { reason: 'side-modes-probe' });
  }, pose);
}

async function enterSector(page, sectorId) {
  await page.evaluate(async (id) => {
    const { laneCommandSink, laneRpc } = await import('/src/core/simLaneCommands.js');
    if (laneCommandSink()) await laneRpc('worldCall', { method: 'enterSector', sectorId: id });
    else window.SF.registry.get('world').enterSector(id);
  }, sectorId);
}

const pickRock = (page) => page.evaluate(() => {
  const st = window.SF.state;
  const rocks = st.entityList.filter((e) => e && e.alive !== false && e.type === 'asteroid' && (e.data?.yieldU || 0) > 6);
  let best = null;
  for (const r of rocks) {
    let n = 0;
    for (const o of rocks) if (Math.hypot(o.pos.x - r.pos.x, o.pos.z - r.pos.z) < 320) n++;
    if (!best || n > best.n) best = { n, r };
  }
  return best ? { id: best.r.id, x: best.r.pos.x, z: best.r.pos.z, radius: best.r.radius || 10,
    typeId: best.r.data?.typeId, rocks: rocks.length, cluster: best.n } : null;
});

// One works contract, start to finish, the way a player does it: dock at Helios, take "First Cut"
// off the board, undock, set the rover down on a rock, cut four iron by hand, and get paid.
async function runJob(page) {
  const shot = shooter(page, 'job');
  const clickText = async (pattern, opts = {}) => {
    const hit = await page.evaluate(({ source, flags, tags }) => {
      const re = new RegExp(source, flags);
      const nodes = [...document.querySelectorAll(tags)].filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 4 && r.height > 4 && getComputedStyle(n).visibility !== 'hidden' && re.test((n.textContent || '').trim());
      });
      nodes.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
      const n = nodes[0];
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (n.textContent || '').trim().slice(0, 80) };
    }, { source: pattern.source, flags: pattern.flags, tags: opts.tags || 'button, [role="button"], [role="tab"], a, li, article, .sx-row, [data-offer-id]' });
    if (hit) await page.mouse.click(hit.x, hit.y);
    return hit;
  };
  try {
    const station = await page.evaluate(() => {
      const st = window.SF.state;
      const e = st.entityList.find((x) => x && x.alive !== false && x.type === 'station'
        && (x.data?.stationId === 'station_helios' || /helios station/i.test(x.name || '')));
      return e ? { id: e.id, x: e.pos.x, z: e.pos.z, radius: e.radius || 40 } : null;
    });
    facts.jobStation = station;
    if (!station) throw new Error('Helios Station is not in the opening sector');
    await relocate(page, { x: station.x - station.radius - 160, z: station.z, heading: 0 });
    await page.waitForTimeout(2000);
    // First the ordinary way: E hands the approach to the autopilot, E again in range docks.
    const dockLog = [];
    const look = () => page.evaluate((id) => {
      const s = window.SF.state, me = s.entities.get(s.playerId), e = s.entities.get(id);
      return { docked: !!s.ui?.docked, inRange: !!s.ui?.dockInRange,
        auto: !!(s.nav && s.nav.autopilot && s.nav.autopilot.active),
        dist: me && e ? Math.round(Math.hypot(me.pos.x - e.pos.x, me.pos.z - e.pos.z)) : null,
        speed: me ? Math.round(Math.hypot(me.vel.x, me.vel.z)) : null };
    }, station.id);
    for (let i = 0; i < 14; i++) {
      const st = await look();
      if (i % 3 === 0) dockLog.push(st);
      if (st.docked) break;
      if (!st.auto) await page.keyboard.press('KeyE');
      await page.waitForTimeout(1500);
    }
    facts.jobAutopilotDocked = (await look()).docked;
    // If the autopilot never took the ship in, park at the berth and press E there, so the rest
    // of the job can still be checked. (The autopilot not engaging is recorded above.)
    if (!facts.jobAutopilotDocked) {
      for (let k = 0; k < 16 && !(await look()).docked; k++) {
        const angle = (k % 8) * Math.PI / 4, reach = station.radius + (k < 8 ? 22 : 55);
        await relocate(page, { x: station.x + Math.cos(angle) * reach, z: station.z + Math.sin(angle) * reach, heading: angle + Math.PI });
        await page.waitForTimeout(1300);
        const st = await look();
        dockLog.push({ k, ...st });
        if (st.inRange) { await page.keyboard.press('KeyE'); await page.waitForTimeout(2200); }
      }
    }
    facts.jobDockLog = dockLog;
    facts.jobDocked = await page.evaluate(() => ({ docked: !!window.SF.state.ui?.docked, station: window.SF.state.ui?.dockedStationId }));
    if (!facts.jobDocked.docked) throw new Error('could not dock at Helios by pressing E');
    await page.waitForTimeout(3500);
    await shot('00-docked');
    // The arrival page numbers its doors; Jobs is 2.
    facts.jobDoor = await clickText(/^jobs$/i, { tags: '[data-screen="station"] *' });
    await page.waitForTimeout(1800);
    await shot('01-board');
    facts.jobBoardText = await page.evaluate(() => {
      const root = document.querySelector('[data-screen="station"]') || document.body;
      const text = root.textContent.split(/[ \n\t]+/).join(' ');
      const at = text.indexOf('First Cut');
      return { hasFirstCut: at >= 0, around: at >= 0 ? text.slice(Math.max(0, at - 80), at + 260) : text.slice(0, 500) };
    });
    // The board lists more work than fits: pick the row itself, wherever it has scrolled to.
    facts.jobRow = await page.evaluate(() => {
      const row = document.querySelector('button.sx-ct-row[data-mid*="works_helios_first_cut"]');
      if (!row) return null;
      row.scrollIntoView({ block: 'center' });
      row.click();
      return { mid: row.dataset.mid, label: row.getAttribute('aria-label') };
    });
    await page.waitForTimeout(1200);
    await shot('02-offer');
    // Accept is press-and-hold.
    const acceptAt = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-screen="station"] button')].find((n) => /^accept/i.test((n.textContent || '').trim()));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: b.textContent.trim().slice(0, 40) };
    });
    facts.jobAccept = acceptAt;
    if (acceptAt) {
      await page.mouse.move(acceptAt.x, acceptAt.y);
      await page.mouse.down();
      await page.waitForTimeout(1800);
      await page.mouse.up();
    }
    await page.waitForTimeout(1500);
    await shot('03-accepted');
    const active = () => page.evaluate(() => {
      const st = window.SF.state;
      const m = (st.missions?.active || []).find((x) => x && x.params && x.params.works);
      return { job: m ? { title: m.title, status: m.status, progress: m.objectiveProgress, target: m.objectiveTarget } : null,
        credits: st.player?.credits, flags: st.story?.flags?.worksContracts || null };
    });
    facts.jobAfterAccept = await active();
    if (!facts.jobAfterAccept.job) throw new Error('First Cut was not accepted through the board');
    await clickText(/^undock/i) || await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.SF.state.ui?.docked, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await shot('04-undocked-objective');
    facts.jobHudText = await page.evaluate(() => {
      const hud = document.getElementById('hud');
      const text = hud ? hud.textContent.split(/[ \n\t]+/).join(' ') : '';
      const at = text.indexOf('Cut ');
      return at >= 0 ? text.slice(Math.max(0, at - 60), at + 120) : null;
    });
    // To the rock the job's marker names, and down.
    const rock = await page.evaluate(() => {
      const st = window.SF.state;
      const wp = st.nav && st.nav.waypoint;
      const byMarker = wp && wp.targetEntityId != null ? st.entities.get(wp.targetEntityId) : null;
      const pick = byMarker || st.entityList.find((e) => e && e.alive !== false && e.type === 'asteroid' && (e.data?.yieldU || 0) > 6);
      return pick ? { id: pick.id, x: pick.pos.x, z: pick.pos.z, radius: pick.radius || 10, fromMarker: !!byMarker,
        reason: wp && wp.reason } : null;
    });
    facts.jobRock = rock;
    if (!rock) throw new Error('no rock for the job');
    await relocate(page, { x: rock.x - rock.radius - 26, z: rock.z, heading: 0 });
    await page.waitForTimeout(2500);
    await page.keyboard.press('KeyB');
    await page.waitForFunction(() => !!window.SF.state.drill, null, { timeout: 30000 });
    await page.waitForTimeout(900);
    await shot('05-landing-card');
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-screen="drill"]');
      return !!root && !/Docking the mining rig|Loading mining equipment/.test(root.textContent);
    }, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.locator('.ast-canvas').click({ position: { x: 400, y: 200 } }).catch(() => {});
    const hold = async (code, ms) => { await page.keyboard.down(code); await page.waitForTimeout(ms); await page.keyboard.up(code); };
    const where = () => page.evaluate(() => {
      const d = window.SF.state.drill;
      if (!d) return null;
      const iron = [];
      for (let c = 0; c < d.field.length; c++) for (let r = 1; r < 8; r++) {
        const t = d.field[c][r];
        if (t && t.type === 'vein' && t.ore === 'cmdty_ore_iron') iron.push({ c, r });
      }
      return { col: d.avatar.col, row: d.avatar.row, iron, got: (d.yieldLog && d.yieldLog.cmdty_ore_iron) || 0 };
    });
    for (let step = 0; step < 40; step++) {
      const w = await where();
      if (!w) break;
      const m = await active();
      if (!m.job || w.got >= 4) break;
      if (!w.iron.length) { await hold('ArrowDown', 700); continue; }
      w.iron.sort((a, b) => (Math.abs(a.c - w.col) + Math.abs(a.r - w.row)) - (Math.abs(b.c - w.col) + Math.abs(b.r - w.row)));
      const t = w.iron[0];
      // Work along the row above the seam, then down into it.
      if (w.row < t.r - 1) await hold('ArrowDown', 450);
      else if (w.row > t.r - 1 && w.col !== t.c) await hold('ArrowUp', 450);
      else if (w.col < t.c) await hold('ArrowRight', 420);
      else if (w.col > t.c) await hold('ArrowLeft', 420);
      else await hold('ArrowDown', 900);
    }
    await shot('06-cut');
    facts.jobDig = await where();
    facts.jobEnd = await active();
    facts.jobToasts = await page.evaluate(() => (window.__roverLog || []).filter((row) => row[0] === 'toast').slice(-8));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2500);
    await shot('07-paid');
  } catch (error) {
    facts.jobError = String(error && error.message || error);
    facts.jobLog = await page.evaluate(() => (window.__roverLog || []).filter((r) => r[0] !== 'toast' || /rover|rock|Line|line/i.test(r[2] || r[1])).slice(-24)).catch(() => null);
    log(`job failed: ${facts.jobError}`);
    await shot('zz-error');
    if (await page.evaluate(() => !!window.SF.state.ui?.docked).catch(() => false)) {
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((n) => /^undock/i.test((n.textContent || '').trim())); if (b) b.click(); });
      await page.waitForFunction(() => !window.SF.state.ui?.docked, null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
    if (await page.evaluate(() => !!window.SF.state.drill).catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
}

// The rover by the ordinary route: target a rock, put the Line on it, press the drill key.
async function runRover(page) {
  const shot = shooter(page, 'rover');
  try {
    const rock = await pickRock(page);
    facts.roverRock = rock;
    if (!rock) throw new Error('no rock in the opening sector');
    const stand = rock.radius + 26;
    await relocate(page, { x: rock.x - stand, z: rock.z, heading: 0 });
    await page.waitForTimeout(2500);
    await page.evaluate(async (id) => {
      const { laneInputWrite } = await import('/src/core/simLaneCommands.js');
      laneInputWrite(window.SF.state, 'player.targetId', id);
    }, rock.id);
    await page.waitForTimeout(500);
    await shot('00-approach');
    const labels = await page.evaluate(async () => {
      const { BINDINGS } = await import('/src/ui/bindings.js');
      const { resolveActionCodes } = await import('/src/systems/input.js');
      const codes = resolveActionCodes(window.SF.state, 'tether') || [];
      return { tether: codes.find((c) => /^(Key|Digit)/.test(c)) || null, drill: BINDINGS.drill && BINDINGS.drill.code };
    });
    facts.roverKeys = labels;
    // One press: B beside a rock puts the Line on it and sets the rover down.
    await page.evaluate(() => {
      window.__roverLog = [];
      for (const name of ['tether:latchDenied', 'tether:latched', 'drill:approachRequested', 'drill:approachStarted',
        'drill:approachCompleted', 'drill:approachCancelled', 'drill:start', 'toast']) {
        window.SF.bus.on(name, (p) => window.__roverLog.push([name, JSON.stringify(p || {}).slice(0, 160)]));
      }
    });
    const pressedAt = Date.now();
    await page.keyboard.press(labels.drill || 'KeyB');
    await page.waitForFunction(() => !!window.SF.state.drill, null, { timeout: 30000 });
    const sessionAt = Date.now();
    await page.waitForTimeout(1200);
    await shot('01-entering');
    // Ready when the board says so: the loading line is gone from the bar.
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-screen="drill"]');
      const text = root ? root.textContent : '';
      return !!root && !/Docking the mining rig|Loading mining equipment/.test(text);
    }, null, { timeout: 60000 }).catch(() => {});
    facts.roverTiming = { pressToSessionMs: sessionAt - pressedAt, pressToBoardMs: Date.now() - pressedAt };
    await page.waitForTimeout(600);
    await shot('02-board-first-look');
    facts.roverBoard = await page.evaluate(() => {
      const d = window.SF.state.drill;
      const root = document.querySelector('[data-screen="drill"]') || document.body;
      const text = root.textContent.split(/[ \n\t]+/).join(' ').trim().slice(0, 900);
      return { asteroidId: d.asteroidId, avatar: { col: d.avatar.col, row: d.avatar.row }, text };
    });
    await page.locator('.ast-canvas').click({ position: { x: 400, y: 200 } }).catch(() => {});
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(2500);
    await shot('03-boring');
    await page.waitForTimeout(9500);
    await page.keyboard.up('ArrowDown');
    facts.roverDown = await page.evaluate(() => ({ row: window.SF.state.drill.avatar.row, cleared: window.SF.state.drill.tilesCleared }));
    await shot('03b-deep');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowRight');
    await shot('04-tunnel');
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(1100);
    await shot('05-survey');
    facts.roverAfter = await page.evaluate(() => {
      const d = window.SF.state.drill;
      return { row: d.avatar.row, col: d.avatar.col, cleared: d.tilesCleared, yieldLog: d.yieldLog, heat: d.heat, energy: d.energy };
    });
    await page.keyboard.press('KeyB');
    await page.waitForTimeout(900);
    await shot('06-build-mode');
    await page.keyboard.press('KeyB');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2500);
    await shot('07-back-in-flight');
    facts.roverLeft = await page.evaluate(() => ({ drill: !!window.SF.state.drill, mode: window.SF.state.mode }));
  } catch (error) {
    facts.roverError = String(error && error.message || error);
    log(`rover failed: ${facts.roverError}`);
    facts.roverBlock = await page.evaluate(() => {
      const st = window.SF.state, me = st.entities.get(st.playerId);
      const denied = (window.__roverLog || []).filter((r) => r[0] === 'tether:latchDenied').map((r) => JSON.parse(r[1])).pop();
      const blocker = denied && denied.blocker && denied.blocker.id != null ? st.entities.get(denied.blocker.id) : null;
      const target = denied ? st.entities.get(denied.targetId) : null;
      const d = (a, b) => (a && b ? Math.round(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)) : null);
      return { denied, blocker: blocker ? { id: blocker.id, type: blocker.type, radius: blocker.radius,
        body: blocker.physicsBody && blocker.physicsBody.radius, toShip: d(blocker, me), toTarget: d(blocker, target) } : null,
        target: target ? { radius: target.radius, body: target.physicsBody && target.physicsBody.radius, toShip: d(target, me) } : null };
    }).catch((e) => String(e));
    facts.roverLog = await page.evaluate(() => ({ log: window.__roverLog || null,
      ctx: (window.SF.state.input && window.SF.state.input.blocked) || false,
      lane: window.SF.simLaneDiag ? window.SF.simLaneDiag() : null })).catch(() => null);
    await shot('zz-error');
  }
}

async function runField(page) {
  const shot = shooter(page, 'field');
  try {
    const near = await pickRock(page);
    facts.fieldNear = near;
    if (near) await relocate(page, { x: near.x - 90, z: near.z - 60, heading: 0 });
    await page.waitForTimeout(2500);
    await shot('00-flight-before');
    await page.keyboard.press('Shift+KeyB');
    await page.waitForTimeout(3000);
    await shot('01-open');
    facts.fieldText = await page.evaluate(() => {
      const root = document.querySelector('.field-build, [data-field-build], .fa-root, .field-architect');
      const any = root || [...document.querySelectorAll('body *')].find((n) => /field/i.test(n.className || '') && n.children.length > 2);
      return any ? { cls: any.className, text: any.textContent.replace(/\s+/g, ' ').trim().slice(0, 1600) } : null;
    });
    // Click the nearest rock where it actually is on screen, then walk the tools.
    const rockAt = await page.evaluate(async () => {
      const st = window.SF.state;
      const { readFrameOrigin } = await import('/src/render/frameCoordinates.js');
      const cam = st.render && st.render.camera;
      const me = st.entities.get(st.playerId);
      if (!cam || !me) return null;
      const origin = readFrameOrigin(st, { x: 0, z: 0 });
      let best = null;
      for (const e of st.entityList) {
        if (!e || e.alive === false || e.type !== 'asteroid') continue;
        const v = new window.SF.THREE.Vector3(e.pos.x - origin.x, 0, e.pos.z - origin.z).project(cam);
        const x = (v.x * 0.5 + 0.5) * window.innerWidth, y = (-v.y * 0.5 + 0.5) * window.innerHeight;
        if (x < 260 || x > 1100 || y < 150 || y > 700) continue;
        const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
        if (!best || d < best.d) best = { x, y, d, id: e.id };
      }
      return best;
    });
    facts.fieldRockAt = rockAt;
    const clickX = rockAt ? rockAt.x : VIEWPORT.width / 2 + 40, clickY = rockAt ? rockAt.y : VIEWPORT.height / 2 + 20;
    await page.mouse.click(clickX, clickY);
    await page.waitForTimeout(700);
    await shot('02-rock-selected');
    for (const digit of ['1', '2', '4', '5', '7']) {
      await page.keyboard.press(`Digit${digit}`);
      await page.waitForTimeout(500);
      await page.mouse.click(clickX, clickY);
      await page.waitForTimeout(700);
      await shot(`03-tool-${digit}`);
    }
    facts.fieldAfter = await page.evaluate(() => {
      const st = window.SF.state;
      return { active: !!st.ui?.fieldBuildActive, sites: Object.keys(st.sites?.byAsteroid || st.sites?.sites || {}).length,
        credits: st.player?.credits };
    });
    await page.evaluate(() => window.SF.bus.emit('ui:closeFieldBuild', {}));
    await page.waitForTimeout(600);
  } catch (error) {
    facts.fieldError = String(error && error.message || error);
    log(`field failed: ${facts.fieldError}`);
    await shot('zz-error');
  }
}

async function runPlanet(page) {
  const shot = shooter(page, 'planet');
  try {
    const nav = await page.evaluate(async () => {
      const { PLANET_SITE, PLANET_FLAGS } = await import('/src/data/planets.js');
      const { ZONE_TETHYS_ANVIL } = await import('/src/data/authoredPlaces.js');
      const { sectorLocalToGlobalForSector } = await import('/src/data/sectorCoordinates.js');
      const centre = sectorLocalToGlobalForSector(ZONE_TETHYS_ANVIL.center, PLANET_SITE.sectorId);
      return { centre, enabled: !!PLANET_FLAGS.enabled };
    });
    facts.planetFlag = nav.enabled;
    const keysDown = new Set();
    const hold = async (code, on) => {
      if (on === keysDown.has(code)) return;
      if (on) { keysDown.add(code); await page.keyboard.down(code); } else { keysDown.delete(code); await page.keyboard.up(code); }
    };
    // Screen-up is the approach line; a tangential placement heads along the band and holds thrust.
    const place = async (r, opts = {}) => {
      const pose = await page.evaluate(({ centre, r, tangential }) => {
        const st = window.SF.state;
        const THREE = window.SF.THREE;
        const dir = new THREE.Vector3();
        st.render.camera.getWorldDirection(dir);
        const l = Math.hypot(dir.x, dir.z) || 1;
        const up = { x: dir.x / l, z: dir.z / l };
        const t = { x: -up.z, z: up.x };
        return { x: centre.x - up.x * r, z: centre.z - up.z * r,
          heading: tangential ? Math.atan2(t.z, t.x) : Math.atan2(up.z, up.x) };
      }, { centre: nav.centre, r, tangential: !!opts.tangential });
      await relocate(page, pose);
      await hold('KeyW', !!opts.tangential);
    };
    await enterSector(page, 'sector_tethys_junction');
    await page.waitForTimeout(6000);
    await place(2800);
    await page.waitForTimeout(5000);
    facts.planetReg = await page.evaluate(() => {
      const s = window.SF.state;
      return { sector: s.world.currentSectorId, active: !!(s.planet && s.planet.active) };
    });
    log(`planet: ${JSON.stringify(facts.planetReg)}`);
    await shot('00-far');
    await place(1500);
    await page.waitForTimeout(2500);
    await shot('01-mid');
    await place(1250, { tangential: true, speed: 110 });
    await page.waitForTimeout(3500);
    await shot('02-sling');
    await place(960, { tangential: true, speed: 90 });
    await page.waitForTimeout(1200);
    facts.planetKeys = await page.evaluate(async () => {
      const { resolveActionCodes } = await import('/src/systems/input.js');
      const codes = resolveActionCodes(window.SF.state, 'scoop') || [];
      return { code: codes.find((c) => /^(Key|Digit)/.test(c)) || null, all: codes };
    });
    if (facts.planetKeys && facts.planetKeys.code) await page.keyboard.press(facts.planetKeys.code);
    await page.waitForTimeout(4500);
    await shot('03-skim');
    await place(840, { tangential: true, speed: 80 });
    await page.waitForTimeout(3000);
    await shot('04-storm');
    facts.planetState = await page.evaluate(() => {
      const s = window.SF.state;
      const pp = s.planet && s.planet.player;
      return pp ? { region: pp.region, heat: pp.heat, stage: pp.stage, collectorOn: pp.collectorOn,
        h2: s.player.cargo.items.cmdty_gas_hydrogen || 0, he3: s.player.cargo.items.cmdty_gas_helium3 || 0 } : null;
    });
    await hold('KeyW', false);
    facts.planetHud = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[class*="planet"], [class*="skim"], [class*="reentry"]')];
      return nodes.map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8);
    });
  } catch (error) {
    facts.planetError = String(error && error.message || error);
    log(`planet failed: ${facts.planetError}`);
    await shot('zz-error');
  }
}

try {
  server = await startServer();
  const executablePath = findSystemBrowser();
  browser = await chromium.launch(executablePath ? {
    headless: false,
    executablePath,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--force-device-scale-factor=1'],
  } : { headless: true });
  if (ONLY.has('race')) await runRace();
  if (ONLY.has('job') || ONLY.has('rover') || ONLY.has('field') || ONLY.has('planet')) {
    const { page, issues } = await newPage();
    await startAdventure(page);
    await page.evaluate(() => {
      window.__roverLog = window.__roverLog || [];
      for (const name of ['toast', 'tether:latchDenied', 'tether:latched', 'tether:detached', 'tether:broken',
        'drill:approachRequested', 'drill:approachStarted', 'drill:approachCompleted', 'drill:approachCancelled',
        'drill:start', 'mission:completed', 'encounter:decision', 'popup:decision']) {
        window.SF.bus.on(name, (p) => window.__roverLog.push([name, Math.round(window.SF.state.simTime || 0), JSON.stringify(p || {}).slice(0, 180)]));
      }
    });
    if (ONLY.has('job')) await runJob(page);
    if (ONLY.has('rover')) await runRover(page);
    if (ONLY.has('field')) await runField(page);
    if (ONLY.has('planet')) await runPlanet(page);
    facts.adventureIssues = issues.errors ? issues.errors.slice(0, 8) : null;
    await page.close();
  }
} catch (error) {
  facts.fatal = String(error && error.stack || error);
  log(`fatal: ${facts.fatal}`);
} finally {
  writeFileSync(join(OUT_DIR, 'facts.json'), JSON.stringify(facts, null, 2));
  log(`facts: ${join(OUT_DIR, 'facts.json')}`);
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}
