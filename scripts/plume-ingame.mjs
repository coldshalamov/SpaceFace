// In-game plume discriminator: boots to flight, holds throttle, logs whether the RENDER-side
// vfx.update is ticking (vfx._t advancing) and whether the plume enters the scene, and captures a
// screenshot WHILE the ship is at speed. Settles "real bug vs headless render loop doesn't run".
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = process.cwd();
const W = 1280, H = 800;
const OUT = '.devshots/plume';
const BOOST = process.argv.includes('--boost');
const name = BOOST ? 'ingame_boost' : 'ingame_cruise';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function findFreePort(start) { const { createServer } = await import('node:net'); for (let p = start; p < start + 200; p++) { const ok = await new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => s.close(() => res(true))); }); if (ok) return p; } throw new Error('no port'); }
async function waitReachable(url) { for (let i = 0; i < 120; i++) { try { const r = await fetch(url); if (r.ok) return; } catch (_) {} await sleep(150); } throw new Error('unreachable'); }

let serverChild, browser;
try {
  const port = await findFreePort(8291);
  serverChild = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  serverChild.stdout.on('data', () => {}); serverChild.stderr.on('data', () => {});
  await waitReachable(`http://127.0.0.1:${port}/`);
  const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find((c) => { try { return existsSync(c); } catch { return false; } });
  if (!chrome) throw new Error('chrome not found');
  const debugPort = await findFreePort(9590);
  browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion', `--window-size=${W},${H}`, `--remote-debugging-port=${debugPort}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  browser.stdout.on('data', () => {}); browser.stderr.on('data', () => {});
  let wsUrl = null;
  for (let i = 0; i < 60; i++) { try { const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); const page = tabs.find((t) => t.type === 'page'); if (page) { wsUrl = page.webSocketDebuggerUrl; break; } } catch (_) {} await sleep(200); }
  const ws = new WebSocket(wsUrl);
  await new Promise((r, e) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', e, { once: true }); });
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', (ev) => { const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.text || 'ex'); if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') errors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' ')); if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result || {}); pending.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((resolve) => { id++; pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => JSON.parse((await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value || 'null');
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try{sessionStorage.setItem('sf.cinematicSeen','1');}catch(_){}` });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/?debug=flight` });
  for (let i = 0; i < 100; i++) { if (await ev(`JSON.stringify(!!(window.SF&&window.SF.state&&window.SF.bus))`)) break; await sleep(200); }
  await ev(`JSON.stringify((()=>{try{window.SF.bus.emit('game:new',{name:'Cap'});return 1;}catch(e){return String(e);}})())`);
  let flying = false;
  for (let i = 0; i < 160; i++) { const s = await ev(`JSON.stringify((()=>{const s=window.SF.state;const p=s&&s.entities&&s.entities.get(s.playerId);return{mode:s&&s.mode,hasPlayer:!!p};})())`); if (s && s.mode === 'flight' && s.hasPlayer) { flying = true; break; } await sleep(250); }
  if (!flying) throw new Error('no flight');
  await ev(`JSON.stringify((()=>{const v=window.SF.state.settings.video;v.bloom=true;if(v.bloomStrength==null)v.bloomStrength=0.35;v.energyMaterials=true;return 1;})())`);

  let captured = false;
  for (let i = 0; i < 20; i++) {
    const s = await ev(`JSON.stringify((()=>{const s=window.SF.state;const p=s.entities.get(s.playerId);
      if(p){const rot=p.rot||0,sp=${BOOST ? 380 : 240};p.vel.x=Math.cos(rot)*sp;p.vel.z=Math.sin(rot)*sp;p.vel.y=0;if(p.flags){p.flags.docked=false;if(${BOOST})p.flags.boosting=true;}}
      if(s.input){s.input.moveZ=1;s.input.boost=${BOOST};s.input.brake=false;}
      const vfx=window.SF.registry.get('vfx');const e=vfx&&vfx._energy;
      return{spd:p?Math.round(Math.hypot(p.vel.x,p.vel.z)):0,vfxT:vfx?+(''+vfx._t).slice(0,7):null,plumeInScene:!!(e&&e.plume&&e.plume.parent),plumeVisible:!!(e&&e.plume&&e.plume.visible),plumeDrive:e?+(''+(e.plumeDrive||0)).slice(0,5):null};})())`);
    if (i === 5) {
      const diag = await ev(`JSON.stringify((()=>{const vfx=window.SF.registry.get('vfx');const s=window.SF.state;const p=s.entities.get(s.playerId);
        let mat=null; try{ vfx._updateEnergy(0.016); }catch(e){ mat='updateErr:'+e.message; }
        const e2=vfx._energy;
        return { sameState: vfx.state===s, hasScene:!!vfx._scene, enabled:vfx._energyMaterialsEnabled(), relevant:vfx._energyPlumeRelevant(), drive:+vfx._engineDriveFor(p).drive.toFixed(2), energyNull:!e2, plumeParent: e2&&e2.plume?!!e2.plume.parent:null, updateErr:mat }; })())`);
      console.log('DIAG', JSON.stringify(diag));
    }
    if (i % 3 === 0) console.log('t', i, JSON.stringify(s));
    // capture at a forced steady high-drive state: pin velocity + throttle, then ramp the plume via
    // repeated real _updateEnergy calls so the shader reaches full size for the photo.
    if (i === 12) {
      const st = await ev(`JSON.stringify((()=>{const s=window.SF.state;const p=s.entities.get(s.playerId);const vfx=window.SF.registry.get('vfx');
        for(let k=0;k<40;k++){ const rot=p.rot||0,sp=${BOOST ? 380 : 260}; p.vel.x=Math.cos(rot)*sp;p.vel.z=Math.sin(rot)*sp;p.vel.y=0; if(p.flags){p.flags.docked=false;if(${BOOST})p.flags.boosting=true;} if(s.input){s.input.moveZ=1;s.input.boost=${BOOST};} try{vfx._updateEnergy(0.05);}catch(e){return 'err '+e.message;} }
        const e=vfx._energy; return { plumeVisible:!!(e&&e.plume&&e.plume.visible), plumeDrive:e?+(''+e.plumeDrive).slice(0,4):null }; })())`);
      console.log('pre-capture', JSON.stringify(st));
      const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(shot.data, 'base64')); captured = true;
    }
    await sleep(200);
  }
  console.log(errors.length ? 'ERRORS ' + JSON.stringify([...new Set(errors)].slice(0, 5)) : 'no page errors', 'captured=' + captured);
} finally { try { browser && browser.kill(); } catch (_) {} try { serverChild && serverChild.kill(); } catch (_) {} }
