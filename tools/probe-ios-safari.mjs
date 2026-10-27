// One public menu -> New Game -> flight check on Apple's iOS SafariDriver.
// Runs on macOS with a booted iPhone Simulator; never injects gameplay state.
import { mkdir, writeFile } from 'node:fs/promises';

const target = new URL(process.env.SF_IOS_URL || 'https://spaceface-play-demo.vercel.app/');
if (target.protocol !== 'https:' || !target.hostname.endsWith('.vercel.app')) throw new Error('Public HTTPS Vercel game URL required');
const out = '.devshots/ios-safari-launch';
await mkdir(out, { recursive: true });
const report = { url: target.href, startedAt: new Date().toISOString(), passed: false,
  phase: 'driver-session', observations: [], limitation: 'iOS Simulator does not reproduce physical iPhone memory limits or GPU performance.' };
let session;
async function command(method, path, body, timeout = 45000) {
  const response = await fetch(`http://127.0.0.1:4444${path}`, { method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeout) });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw new Error(`${data.value?.error || response.status}: ${data.value?.message || JSON.stringify(data)}`);
  return data.value;
}
const execute = (script, args = []) => command('POST', `/session/${session}/execute/sync`, { script, args });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const persist = () => writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
async function snapshot() {
  return execute(`
    const visible = selector => [...document.querySelectorAll(selector)].some(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return !el.hidden && r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    });
    const journal = window.__SF_STARTUP__?.snapshot?.() || null;
    return { at: Date.now(), timeOrigin: performance.timeOrigin, readyState: document.readyState,
      userAgent: navigator.userAgent, touchPoints: navigator.maxTouchPoints,
      menu: visible('[data-screen="mainMenu"] button[data-action="newGame"]'),
      cinematicBegin: visible('#cinematic-splash .cine-begin'),
      firstLightPlay: [...document.querySelectorAll('#sf-confirm-root button, .sf-confirm button')]
        .some(el => /^Play$/i.test(el.textContent.trim()) && el.getBoundingClientRect().width > 0),
      motionAsk: visible('[data-screen="motionAsk"]'), pauseScreen: visible('[data-screen="pause"]'),
      launch: visible('.sf-ng-launch'), gun: visible('.mf-gun'), pause: visible('.mf-pause'),
      journal, inputEvents: window.__SF_IOS_PROBE_INPUT__ || [], body: document.body?.innerText?.slice(-1800) || '' };
  `);
}
async function click(selector, text = null) {
  const element = await execute(`
    return [...document.querySelectorAll(arguments[0])].find(el => {
      const r=el.getBoundingClientRect(), s=getComputedStyle(el);
      return !el.disabled && !el.hidden && r.width>0 && r.height>0 && s.display!=='none'
        && s.visibility!=='hidden' && (!arguments[1] || new RegExp(arguments[1],'i').test(el.textContent.trim()));
    }) || null;
  `, [selector, text]);
  if (!element) return false;
  const id = element['element-6066-11e4-a52e-4f735466cecf'] || element.ELEMENT;
  if (!id) throw new Error('SafariDriver did not return a clickable element');
  await command('POST', `/session/${session}/actions`, { actions: [{
    type: 'pointer', id: 'ios-finger', parameters: { pointerType: 'touch' }, actions: [
      { type: 'pointerMove', duration: 0, origin: element, x: 0, y: 0 },
      { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 },
    ],
  }] });
  report.lastTap = { selector, text, at: Date.now() };
  return true;
}
async function capture(name) {
  const encoded = await command('GET', `/session/${session}/screenshot`, undefined, 10000);
  await writeFile(`${out}/${name}.png`, Buffer.from(encoded, 'base64'));
}
async function waitFor(label, check, timeoutMs, handle = null) {
  const deadline = Date.now() + timeoutMs;
  let lastRecorded = 0;
  while (Date.now() < deadline) {
    const state = await snapshot();
    if (Date.now() - lastRecorded > 5000) {
      report.observations.push({ phase: label, ...state });
      if (report.observations.length > 48) report.observations.shift();
      lastRecorded = Date.now(); await persist();
    }
    if (check(state)) return state;
    if (handle) await handle(state);
    await pause(1000);
  }
  throw new Error(`${label} did not complete in ${timeoutMs / 1000}s`);
}
try {
  const driverDeadline = Date.now() + 30000;
  for (;;) {
    try { await command('GET', '/status', undefined, 2000); break; }
    catch (error) { if (Date.now() >= driverDeadline) throw error; await pause(500); }
  }
  const created = await command('POST', '/session', { capabilities: { alwaysMatch: {
    browserName: 'Safari', platformName: 'iOS', pageLoadStrategy: 'eager',
    'safari:useSimulator': true, 'safari:deviceUDID': process.env.SF_IOS_SIM_UDID,
  } } }, 120000);
  session = created.sessionId; report.capabilities = created.capabilities;
  if (!session) throw new Error('SafariDriver created no session');
  report.phase = 'navigate'; await persist();
  await command('POST', `/session/${session}/url`, { url: target.href }, 180000);
  await execute(`
    window.__SF_IOS_PROBE_INPUT__ = [];
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) {
      window.addEventListener(type, event => {
        const item = { type, trusted: event.isTrusted, target: event.target?.className,
          text: event.target?.textContent?.trim()?.slice(0, 60), prevented: event.defaultPrevented };
        window.__SF_IOS_PROBE_INPUT__.push(item);
        if (window.__SF_IOS_PROBE_INPUT__.length > 12) window.__SF_IOS_PROBE_INPUT__.shift();
      });
    }
  `);
  report.phase = 'menu';
  await waitFor('menu', state => state.menu && !state.cinematicBegin && !state.firstLightPlay && !state.motionAsk, 180000, async () => {
    await click('#cinematic-splash .cine-begin');
    await click('#sf-confirm-root button, .sf-confirm button', '^Play$');
    await click('[data-screen="motionAsk"] button', '^Full');
  });
  await capture('01-menu');
  report.phase = 'new-game';
  if (!(await click('[data-screen="mainMenu"] button[data-action="newGame"]'))) throw new Error('New Game was not clickable');
  const setup = await waitFor('setup', state => state.launch, 30000);
  await capture('02-setup');
  report.phase = 'launch';
  if (!(await click('.sf-ng-launch'))) throw new Error('Launch was not clickable');
  report.launchAt = Date.now();
  report.flight = await waitFor('flight', state => state.gun && state.pause
    && state.journal?.current?.status === 'playing', 240000, state => {
      if (state.timeOrigin !== setup.timeOrigin) throw new Error('Safari restarted the document during New Game');
      if (['failed', 'returned-to-menu'].includes(state.journal?.current?.status)) throw new Error('New Game returned to the menu; see startup journal');
    });
  report.launchMs = Date.now() - report.launchAt;
  await capture('03-flight');
  report.phase = 'pause';
  if (!(await click('.mf-pause'))) throw new Error('Mobile Pause was not clickable');
  await waitFor('pause', state => state.pauseScreen, 15000);
  await capture('04-pause');
  report.phase = 'resume';
  if (!(await click('[data-screen="pause"] button', '^Resume$'))) throw new Error('Resume was not clickable');
  await waitFor('resume', state => !state.pauseScreen && state.gun && state.pause, 15000);
  report.passed = true; report.phase = 'complete';
} catch (error) {
  report.failureKind = session ? 'game-route-or-browser' : 'simulator-infrastructure';
  report.error = String(error.stack || error); process.exitCode = 1;
  await persist();
  if (session) {
    try { report.final = await snapshot(); } catch (error) { report.snapshotError = String(error); }
    try { await capture('failure'); } catch (error) { report.screenshotError = String(error); }
  }
} finally {
  report.completedAt = new Date().toISOString(); await persist();
  if (session) await command('DELETE', `/session/${session}`, undefined, 10000).catch(() => {});
  console.log(JSON.stringify({ passed: report.passed, phase: report.phase, launchMs: report.launchMs,
    failureKind: report.failureKind, error: report.error, capabilities: report.capabilities }, null, 2));
}
