// Live Kestrel capture driver: launches headless Chrome with WebGL (SwiftShader software GL) pointed
// at the ?dev=shipshot entry, with a HARD wall-clock kill so a hung GPU/loop can never wedge the
// parent shell. The page renders the Kestrel once and POSTs kestrel_hero_live.jpg to /__shot, which
// server.js writes to .devshots/.
//
// Run: node scripts/capture-kestrel-shot.mjs [port]
// Prereq: the dev server must be running (node server.js [port]).
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.argv[2] || process.env.PORT || 8123);
// All shots the ?dev=shipshot page produces. The diagnostics one is a JSON body, not an image.
const SHOTS = ['kestrel_hero_live.jpg', 'kestrel_hero_critical.jpg', 'kestrel_bloom_on.jpg', 'kestrel_bloom_off.jpg', 'kestrel_topdown.jpg', 'concord_patrol_live.jpg', 'reaver_pirate_live.jpg', 'meridian_trader_live.jpg', 'drift_barge_live.jpg', 'quiet_raider_live.jpg', 'vael_sniper_live.jpg'];
const shotPath = (f) => `.devshots/${f}`;

// Locate Chrome. Prefer the system Chrome; fall back to Edge.
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('No Chrome/Edge found for headless capture.'); process.exit(2); }

const url = `http://localhost:${PORT}/?dev=shipshot`;
console.log(`[capture] launching ${chrome.split('/').pop()} headless -> ${url}`);

const args = [
  '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-translate', '--disable-background-networking',
  // Software WebGL via SwiftShader/ANGLE so a real frame composites without a physical GPU.
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader',
  '--window-size=1280,720', '--hide-scrollbars',
  // Dump console so we can confirm the capture log line; the page exits on its own after POST.
  '--enable-logging=stderr', '--v=0',
  url,
];

const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const HARD_KILL_MS = 35000; // hard ceiling — five frames + diagnostics need ~6s; this is pure safety.

const watchdog = setTimeout(() => {
  console.error(`[capture] hard-killing chrome after ${HARD_KILL_MS}ms (watchdog)`);
  try { child.kill('SIGKILL'); } catch (_) { /* already gone */ }
}, HARD_KILL_MS);

let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => {
  const s = d.toString();
  log += s;
  if (s.includes('captured kestrel_hero_live') || s.includes('[shipShot]')) process.stdout.write(s);
});

child.on('exit', (code) => {
  clearTimeout(watchdog);
  // The only real success signal is both files existing with meaningful size.
  const results = SHOTS.map((f) => {
    const p = shotPath(f);
    return { f, ok: existsSync(p) && statSync(p).size > 2000, kb: existsSync(p) ? (statSync(p).size / 1024).toFixed(1) : '0' };
  });
  const allOk = results.every((r) => r.ok);
  for (const r of results) console.log(`[capture] ${r.f}: ${r.ok ? 'OK' : 'MISSING'} (${r.kb} KB)`);
  process.exit(allOk ? 0 : 1);
});

// Also poll for the files and exit early once all land (don't wait for chrome's slow shutdown).
(async () => {
  const deadline = Date.now() + HARD_KILL_MS;
  while (Date.now() < deadline) {
    await sleep(400);
    if (SHOTS.every((f) => { const p = shotPath(f); return existsSync(p) && statSync(p).size > 2000; })) {
      try { child.kill(); } catch (_) {}
      return;
    }
  }
})();
