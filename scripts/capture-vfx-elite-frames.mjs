#!/usr/bin/env node
/**
 * Capture VFX Elite evidence frames into .devshots/vfx-elite/ via Chrome CDP.
 * Usage: node scripts/capture-vfx-elite-frames.mjs [--family all|muzzle|...]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, '.devshots', 'vfx-elite');
const SCRATCH = process.env.SCRATCH || join(ROOT, '.devshots');
const familyArg = process.argv.includes('--family') ? process.argv[process.argv.indexOf('--family') + 1] : 'all';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('No Chrome/Edge found for VFX capture.');
  process.exit(2);
}

async function findFreePort(start = 8130) {
  for (let port = start; port < start + 60; port++) {
    const ok = await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
    if (ok) return port;
  }
  throw new Error('no free port');
}

async function startServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore' });
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode != null) throw new Error('server exited');
    try {
      const r = await fetch(url);
      if (r.ok) return { child, url };
    } catch (_) { /* retry */ }
    await sleep(250);
  }
  child.kill();
  throw new Error('server timeout');
}

async function connectCdp(dbgPort) {
  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${dbgPort}/json`);
      const tabs = await r.json();
      const page = tabs.find((t) => t.type === 'page' && (!t.url || /localhost|127\.0\.0\.1/.test(t.url)));
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch (_) {}
    await sleep(300);
  }
  if (!wsUrl) throw new Error('no CDP page target');
  const WS = globalThis.WebSocket;
  if (!WS) throw new Error('no global WebSocket');
  const ws = new WS(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    id++;
    pending.set(id, { resolve });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { ws, send };
}

async function waitForSf(send) {
  await sleep(2000);
  for (let i = 0; i < 240; i++) {
    const has = await send('Runtime.evaluate', { expression: '!!(window.SF && window.SF.bus && window.SF.bus.emit)', returnByValue: true });
    if (has.result.value) return;
    await sleep(500);
  }
  throw new Error('window.SF not available');
}

async function waitForFlight(send) {
  const expr = `new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const sf = window.SF || {};
      const state = sf.state || {};
      if (state.mode === 'flight' && state.playerId && state.entities && state.entities.get(state.playerId)) {
        if (sf.bus && sf.bus.emit) sf.bus.emit('ui:closeAll', {});
        resolve(true);
        return;
      }
      if (performance.now() - start > 120000) { resolve(false); return; }
      setTimeout(check, 100);
    };
    check();
  })`;
  const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (!res.result.value) throw new Error('flight mode timeout');
}

async function renderFrames(send, n) {
  await send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const count = ${n};
      let i = 0;
      const step = () => {
        const r = window.SF && window.SF.state && window.SF.state.render;
        const vfx = window.SF && window.SF.registry && window.SF.registry.get('vfx');
        if (vfx && vfx.update) vfx.update(1 / 60);
        if (r && r.drawPreparedFrame) r.drawPreparedFrame();
        if (++i >= count) resolve(true);
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    })`,
    awaitPromise: true,
  });
}

async function shot(send, name) {
  const path = join(OUT, `${name}.png`);
  const sr = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(sr.data, 'base64'));
  console.log('saved', path);
}

async function capturePhases(send, prefix, triggerExpr, waits = [1, 2, 4, 6, 8]) {
  const phases = ['spawn', 'peak', 'decay', 'close', 'wide'];
  await send('Runtime.evaluate', { expression: triggerExpr });
  for (let i = 0; i < phases.length; i++) {
    await renderFrames(send, waits[i]);
    await shot(send, `${prefix}_${phases[i]}`);
  }
}

const FAMILIES = {
  muzzle: async (send) => {
    const weapons = [
      ['ballistic', 'wpn_autocannon_s'],
      ['energy', 'wpn_pulse_laser_s'],
      ['explosive', 'wpn_missile_rack_m'],
      ['beam', 'wpn_beam_laser_m'],
    ];
    for (const [variant, wid] of weapons) {
      await capturePhases(send, `muzzle_${variant}`, `(() => {
        const st = window.SF.state; const pid = st.playerId; const ent = st.entities.get(pid);
        if (!ent) return; const origin = { x: ent.pos.x + 8, z: ent.pos.z };
        window.SF.bus.emit('combat:fire', { ownerId: pid, weaponId: '${wid}', origin, dir: ent.rot || 0 });
      })()`);
    }
  },
  impact: async (send) => {
    const scenarios = [
      ['sparks', false, 'kinetic'],
      ['shield_ripple', true, 'energy'],
      ['hull_scorch', false, 'explosive'],
    ];
    for (const [variant, shield, dt] of scenarios) {
      await capturePhases(send, `impact_${variant}`, `(() => {
        const st = window.SF.state; const pid = st.playerId; const ent = st.entities.get(pid);
        if (!ent) return; ${shield ? 'ent.shield = Math.max(ent.shield || 0, 50);' : ''}
        const pos = { x: ent.pos.x + 12, z: ent.pos.z + 4 };
        window.SF.bus.emit('projectile:hit', { targetId: pid, damageType: '${dt}', pos, dir: { x: 1, z: 0 } });
      })()`);
    }
  },
  explosion: async (send) => {
    const scenarios = [
      ['small', 'entity:killed', '{ id: "cap_small", radius: 8 }'],
      ['medium', 'entity:destroyed', '{ id: "cap_med", type: "asteroid", radius: 18 }'],
      ['capital', 'entity:killed', '{ id: "cap_big", radius: 60, capital: true }'],
    ];
    for (const [variant, ev, pl] of scenarios) {
      await capturePhases(send, `explosion_${variant}`, `(() => {
        const st = window.SF.state; const ent = st.entities.get(st.playerId);
        if (!ent) return; const pos = { x: ent.pos.x + 30, z: ent.pos.z + 20 };
        window.SF.bus.emit('${ev}', { ...${pl}, pos, x: pos.x, z: pos.z });
      })()`);
    }
  },
  thruster: async (send) => {
    const scenarios = [
      ['cruise', `(() => { const st = window.SF.state; st.player = st.player || {}; st.player.cruise = { phase: 'cruising' };
        const ent = st.entities.get(st.playerId); if (ent) { ent.vel = { x: 80, z: 0 }; ent.flags = { ...(ent.flags||{}), boosting: false }; }
        window.SF.bus.emit('cruise:engaged', { shipId: st.playerId }); window.SF.bus.emit('ship:thrust', { id: st.playerId, throttle: 1.2 }); })()`],
      ['boost', `(() => { const st = window.SF.state; const ent = st.entities.get(st.playerId);
        if (ent) ent.flags = { ...(ent.flags||{}), boosting: true }; window.SF.bus.emit('ship:boostStart', { shipId: st.playerId }); })()`],
      ['damage', `(() => { const st = window.SF.state; const ent = st.entities.get(st.playerId);
        if (ent) { ent.hullMax = 100; ent.hull = 12; ent.vel = { x: 40, z: 10 }; } window.SF.bus.emit('ship:thrust', { id: st.playerId, throttle: 0.8 }); })()`],
    ];
    for (const [variant, expr] of scenarios) {
      await capturePhases(send, `thruster_${variant}`, expr, [2, 3, 5, 8, 10]);
    }
  },
  mining: async (send) => {
    const scenarios = [
      ['beam', `(() => { const st = window.SF.state; const ent = st.entities.get(st.playerId); if (!ent) return;
        const targetId = 'cap_asteroid'; st.entities.set(targetId, { id: targetId, type: 'asteroid', alive: true,
        pos: { x: ent.pos.x + 40, z: ent.pos.z }, radius: 12, hull: 100, hullMax: 100,
        data: { typeId: 'ore_iron', seams: [{ localOffset: { x: 2, z: 1 } }] } });
        window.SF.bus.emit('mining:start', { targetId }); })()`],
      ['ore_chunk', `(() => { const st = window.SF.state; const ent = st.entities.get(st.playerId); if (!ent) return;
        window.SF.bus.emit('mining:tick', { oreType: 'ore_iron', pos: { x: ent.pos.x + 35, z: ent.pos.z + 5 } }); })()`],
      ['seam_marker', `(() => { const st = window.SF.state; const ent = st.entities.get(st.playerId); if (!ent) return;
        const targetId = 'cap_seam_ast'; st.entities.set(targetId, { id: targetId, type: 'asteroid', alive: true,
        pos: { x: ent.pos.x + 45, z: ent.pos.z - 8 }, radius: 14, data: { typeId: 'ore_copper',
        seams: [{ localOffset: { x: 0, z: 3 } }, { localOffset: { x: -2, z: -1 } }] } });
        window.SF.bus.emit('mining:start', { targetId }); })()`],
    ];
    for (const [variant, expr] of scenarios) {
      await capturePhases(send, `mining_${variant}`, expr, [2, 4, 6, 8, 10]);
    }
  },
  countermeasure: async (send) => {
    const scenarios = [
      ['burst', `(() => { const st = window.SF.state; const ent = st.entities.get(st.playerId); if (!ent) return;
        window.SF.bus.emit('countermeasure:deployed', { shipId: st.playerId, kind: 'chaff', x: ent.pos.x + 6, z: ent.pos.z, radius: 380, durationS: 3 }); })()`],
      ['tether_snap', `(() => { const st = window.SF.state; const ent = st.entities.get(st.playerId); if (!ent) return;
        const tid = 'cap_tether_tgt'; st.entities.set(tid, { id: tid, type: 'asteroid', alive: true, pos: { x: ent.pos.x + 25, z: ent.pos.z }, radius: 10 });
        window.SF.bus.emit('tether:broken', { targetId: tid }); })()`],
      ['jump_warp', `(() => { window.SF.bus.emit('jump:start', { sectorId: 'test' }); })()`],
    ];
    for (const [variant, expr] of scenarios) {
      await capturePhases(send, `countermeasure_${variant}`, expr);
    }
  },
  station_emissive: async (send) => {
    const scenarios = [
      ['dock', 'vfx.station.dock'],
      ['nav_strobe', 'vfx.station.nav_strobe'],
      ['hazard', 'vfx.station.hazard'],
    ];
    for (const [variant, cueId] of scenarios) {
      await capturePhases(send, `station_emissive_${variant}`, `(() => {
        const st = window.SF.state; const ent = st.entities.get(st.playerId); if (!ent) return;
        const pos = { x: ent.pos.x + 50, z: ent.pos.z - 15 };
        window.SF.bus.emit('presentation:vfxCue', { id: '${cueId}', lane: 'station', pos, magnitude: 2 });
      })()`);
    }
  },
  projectile: async (send) => {
    const scenarios = [
      ['small', 'wpn_pulse_laser_s', null],
      ['medium', 'wpn_siege_lance_l', null],
      ['faction_tint', 'wpn_pulse_laser_m', 1],
    ];
    for (const [variant, wid, team] of scenarios) {
      await capturePhases(send, `projectile_${variant}`, `(() => {
        const st = window.SF.state; const pid = st.playerId; const ent = st.entities.get(pid);
        if (!ent) return; ${team != null ? `ent.team = ${team};` : ''}
        const origin = { x: ent.pos.x + 5, z: ent.pos.z };
        window.SF.bus.emit('combat:fire', { ownerId: pid, weaponId: '${wid}', origin, dir: ent.rot || 0 });
      })()`, [2, 4, 6, 8, 12]);
    }
  },
};

const serverPort = await findFreePort();
const server = await startServer(serverPort);
const dbgPort = serverPort + 100;
mkdirSync(OUT, { recursive: true });

const chromeArgs = [
  '--headless=new', '--no-sandbox', '--no-first-run', '--disable-extensions',
  '--window-size=1280,720', '--hide-scrollbars', '--ignore-gpu-blocklist', '--enable-webgl',
  `--remote-debugging-port=${dbgPort}`,
  `${server.url}?debug=flight`,
];
const browser = spawn(chrome, chromeArgs, { stdio: 'ignore', windowsHide: true });
const log = [];

try {
  const { ws, send } = await connectCdp(dbgPort);
  await waitForSf(send);
  await send('Runtime.evaluate', { expression: 'window.SF.bus.emit("game:new", { name: "VFX Elite Capture" });' });
  await waitForFlight(send);
  await sleep(1500);

  const runAll = familyArg === 'all';
  for (const [name, fn] of Object.entries(FAMILIES)) {
    if (runAll || familyArg === name) {
      console.log(`capturing ${name}...`);
      await fn(send);
      log.push(`ok ${name}`);
    }
  }
  ws.close();
  log.push('capture ok');
} catch (err) {
  log.push(String(err && err.stack || err));
  throw err;
} finally {
  try { browser.kill(); } catch (_) {}
  try { server.child.kill(); } catch (_) {}
}

writeFileSync(join(SCRATCH, 'vfx-capture.log'), log.join('\n') + '\n');
console.log('VFX capture done');