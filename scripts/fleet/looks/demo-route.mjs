// DEMO ROUTES: a first-time player's first hour, scripted from the TITLE with real mouse/keyboard input
// only (no ?swarmRound= / ?sector= shortcuts), recording what that person experiences.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=swarm --headed --out=.devshots/fleet/demo/swarm-1
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=adventure --headed --out=.devshots/fleet/demo/adventure-1
//
//   --route=swarm|adventure   which door (required)
//   --out=dir                 default .devshots/fleet/demo/<route>
//   --viewport=1280x720       default 1280x720
//   --headed                  show the browser (default headless)
//   --intro=play|skip         adventure plays the intro through (timed, 120 s cap), swarm skips it with Space
//   --profile-boot            record startup CPU and film transport/decoder facts through actionable title
//   --raid-checkpoint         Continue an earned Raid save, then check the marked-rock throw alone
//   --raid-withdrawal          release the Raider and fly clear before following the mining course
//   --keep-saves              use the real saved-games store (default: an empty one, like a first-time player)
//   --max-min=N               wall cap in minutes (swarm 15, adventure 12)
//
// Writes <out>/demo-route.json, <out>/report.md and <out>/NN-<screen>.png. Observers read window.SF (as a
// person watching the screen could); every game action goes through Playwright's trusted input.
// Latch / swing / release code and event logging come from throw.mjs.
import { chromium as rawChromium } from 'playwright';
import { quietChromium } from '../../lib/quietLaunch.mjs';
const chromium = quietChromium(rawChromium);
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FIRST_TRADE_CONTRACT } from '../../../src/data/economyContractTemplates.js';
import { BEAMS } from '../../../src/data/mining.js';
import { decodeSaveEnvelopeText } from '../../../src/save/saveWorker.js';
import { pressNewGame } from '../../lib/titleRoute.mjs';
import { TRAVEL_PUBLIC_HELPERS } from '../../lib/professionalTravelPublicRoute.mjs';
import { readStartupFailure } from '../../player-truth/routes.mjs';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const ROUTE = argv.route;
if (ROUTE !== 'swarm' && ROUTE !== 'adventure') { console.error('usage: demo-route.mjs --route=swarm|adventure [--seed=N | --resume-from=captured-store] [--freight] [--out=dir] [--viewport=WxH] [--headed] [--profile-boot]'); process.exit(2); }
const ADVENTURE_SEED = argv.seed === undefined ? null : Number(argv.seed);
if (ADVENTURE_SEED != null && (ROUTE !== 'adventure' || typeof argv.seed !== 'string'
  || !Number.isSafeInteger(ADVENTURE_SEED) || ADVENTURE_SEED <= 0 || ADVENTURE_SEED > 0xffffffff)) {
  throw new Error('--seed must be a positive 32-bit Adventure universe seed');
}
const OUT = String(argv.out || `.devshots/fleet/demo/${ROUTE}`);
const RESUME_STORE = typeof argv['resume-from'] === 'string' ? resolve(argv['resume-from']) : null;
if (argv['resume-from'] !== undefined && (!RESUME_STORE || ROUTE !== 'adventure' || ADVENTURE_SEED != null || argv['keep-saves'])) {
  throw new Error('Use --resume-from=<captured Adventure store> without --seed or --keep-saves');
}
if (argv['raid-checkpoint'] !== undefined && (argv['raid-checkpoint'] !== true || !RESUME_STORE || argv['raid-withdrawal'])) {
  throw new Error('Use --raid-checkpoint with --resume-from=<captured Raid store>');
}
const [VW, VH] = String(argv.viewport || '1280x720').split('x').map(Number);
const HEADED = argv.headed === true || argv.headed === 'true';
const INTRO = String(argv.intro || (ROUTE === 'adventure' ? 'play' : 'skip'));
if (argv['profile-boot'] !== undefined && argv['profile-boot'] !== true) throw new Error('Use --profile-boot without a value');
const PROFILE_BOOT = argv['profile-boot'] === true;
const CAP_MS = (Number(argv['max-min']) || (ROUTE === 'adventure' ? 12 : 15)) * 60_000;
const PORT = ROUTE === 'swarm' ? 8171 : 8172;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = { route: ROUTE, viewport: `${VW}x${VH}`, headed: HEADED, intro: INTRO, resumeStore: RESUME_STORE,
  startedAt: new Date().toISOString(),
  steps: [], screens: [], notes: [], errors: [], consoleErrors: [], clicks: 0, milestones: {}, outcome: null };
const wall0 = Date.now();
const wallS = () => +((Date.now() - wall0) / 1000).toFixed(1);
const note = (s) => { R.notes.push(`[${wallS()}s] ${s}`); console.log(`[${wallS()}s] ${s}`); };
const step = (name, detail) => { R.steps.push({ at: wallS(), name, detail }); console.log(`[${wallS()}s] STEP ${name}${detail ? ' - ' + detail : ''}`); };

// ---------------------------------------------------------------- in-page instrumentation
const INIT = () => {
  const D = (window.__dr = { t0: null, clicks: 0, ms: {}, text: [], ev: [], learnerRockEvents: [], frames: [], longs: [], noise: [], hooked: false, introSeen: null, introGone: null, emitted: 0 });
  const now = () => performance.now();
  const rel = (t) => (D.t0 == null ? null : +((t - D.t0) / 1000).toFixed(2));
  D.rel = rel;
  let raiderPressWatch = null;
  let raiderPress = null;
  D.watchRaiderPress = () => {
    raiderPressWatch?.abort();
    raiderPress = null;
    raiderPressWatch = new AbortController();
    const describe = (node) => node?.nodeType === 1 ? {
      tag: node.localName,
      id: node.id || null,
      classes: node.getAttribute('class')?.slice(0, 120) || null,
    } : null;
    window.addEventListener('mousedown', (event) => {
      if (event.button !== 2) return;
      raiderPressWatch.abort();
      const s = window.SF?.state;
      const line = s?.player?.tether;
      const throwState = s?.massline2?.throw;
      const solution = throwState?.solution;
      const rock = s?.entities?.get(s.onboarding?.raid?.ids?.throwRock);
      const payload = s?.entities?.get(line?.targetId);
      raiderPress = {
        t: rel(now()), eventIndex: D.ev.length,
        point: [event.clientX, event.clientY], trusted: event.isTrusted,
        canvas: event.target === document.getElementById('gl-canvas'),
        target: describe(event.target),
        path: event.composedPath().slice(0, 5).map(describe).filter(Boolean),
        mode: s?.mode, tick: s?.tick, sim: s?.simTime,
        screen: s?.ui?.screenStack?.at(-1) ?? null,
        inputBlocked: s?.input?.blocked === true,
        modal: document.body?.classList.contains('ui-modal-open') === true,
        liveScreen: document.body?.classList.contains('ui-live-screen') === true,
        releaseAssist: s?.settings?.gameplay?.masslineReleaseAssist ?? null,
        line: line && { attachmentId: line.attachmentId, active: line.active, targetId: line.targetId,
          generation: payload?.occupantGeneration,
          bodySpeed: payload?.vel ? Math.hypot(payload.vel.x, payload.vel.z) : null },
        aimTargetId: throwState?.aimTargetId, armed: throwState?.armed,
        rockId: rock?.id, rockVelocity: rock?.vel && [rock.vel.x, rock.vel.z],
        solution: solution && { decisionTick: solution.decisionTick, valid: solution.valid, onSolution: solution.onSolution,
          windowOpen: solution.windowOpen, decisionStale: solution.decisionStale,
          payloadSpeed: solution.payloadSpeed, relativeSpeed: solution.relativeSpeed },
      };
    }, { capture: true, passive: true, signal: raiderPressWatch.signal });
    return D.ev.length;
  };
  D.takeRaiderPress = () => {
    raiderPressWatch?.abort();
    raiderPressWatch = null;
    const captured = raiderPress;
    raiderPress = null;
    return captured;
  };
  // Record media delivery independently of the driver's screenshot and prompt waits.
  const bootVisuals = { media: [], longFrames: [], longFramesSupported: false, cinematicMs: null, firstLightMs: null };
  let traceBoot = true, nextBootSample = 0, longFrameObserver;
  const mediaEvents = ['playing', 'waiting', 'stalled', 'pause', 'error'];
  const canSeeBootNode = (node) => !!node && !document.hidden && !node.hidden
    && !node.classList.contains('hidden') && node.style.display !== 'none';
  const mediaSample = (film, video, event, visible, at) => {
    if (!video) return;
    if (bootVisuals.media.length >= 256) { bootVisuals.mediaTruncated = true; return; }
    const quality = video.getVideoPlaybackQuality?.();
    bootVisuals.media.push({ film, event, visible, navigationMs: Math.round(at),
      mediaTime: video.currentTime, readyState: video.readyState, paused: video.paused,
      totalFrames: quality?.totalVideoFrames ?? null, droppedFrames: quality?.droppedVideoFrames ?? null,
      source: (video.currentSrc || '').split('/').pop() || null, error: video.error?.code ?? null });
  };
  const onMedia = ({ type, target: video }) => {
    const film = video?.id === 'boot-intro-video' ? 'boot' : video?.classList?.contains('cine-video') ? 'title' : null;
    if (!film) return;
    const root = video.closest('#boot-overlay, #cinematic-splash');
    mediaSample(film, video, type, canSeeBootNode(root), now());
  };
  for (const type of mediaEvents) document.addEventListener(type, onMedia, true);
  const onLongFrames = (entries) => {
    for (const entry of entries) {
      if (bootVisuals.longFrames.length >= 120) break;
      bootVisuals.longFrames.push({ navigationMs: Math.round(entry.startTime), durationMs: Math.round(entry.duration),
        blockingMs: Math.round(entry.blockingDuration), scripts: (entry.scripts || []).slice(0, 6).map((script) => ({
          source: String(script.sourceURL || '').replace(/^.*\/(src|vendor)\//, '$1/'),
          owner: script.sourceFunctionName || script.invoker, durationMs: Math.round(script.duration),
        })) });
    }
  };
  try {
    if (PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
      longFrameObserver = new PerformanceObserver((list) => onLongFrames(list.getEntries()));
      longFrameObserver.observe({ type: 'long-animation-frame', buffered: true });
      bootVisuals.longFramesSupported = true;
    }
  } catch { longFrameObserver = null; }
  const sampleBoot = (t) => {
    const overlay = document.getElementById('boot-overlay');
    const splash = document.getElementById('cinematic-splash');
    if (canSeeBootNode(overlay)) mediaSample('boot', document.getElementById('boot-intro-video'), 'sample', true, t);
    if (canSeeBootNode(splash) && !canSeeBootNode(overlay)) {
      bootVisuals.cinematicMs ??= Math.round(t);
      mediaSample('title', splash.querySelector('.cine-video'), 'sample', true, t);
    }
    const prompt = document.getElementById('sf-confirm-root');
    if (bootVisuals.firstLightMs == null && prompt?.classList.contains('sf-confirm--in')
        && /^first light$/i.test(prompt.querySelector('#sf-confirm-title')?.textContent?.trim())) {
      bootVisuals.firstLightMs = Math.round(t);
    }
  };
  D.finishBootTrace = () => {
    if (traceBoot) {
      traceBoot = false;
      sampleBoot(now());
      onLongFrames(longFrameObserver?.takeRecords() || []);
      longFrameObserver?.disconnect();
      for (const type of mediaEvents) document.removeEventListener(type, onMedia, true);
    }
    return bootVisuals;
  };
  // frame deltas for the whole session; mode tag lets us cut the playable span afterwards
  let last = 0;
  const loop = (t) => {
    if (traceBoot && t >= nextBootSample) {
      sampleBoot(t);
      nextBootSample = t + 250;
    }
    if (last) {
      const s = window.SF && window.SF.state;
      const flight = !!(s && s.mode === 'flight');
      D.frames.push(+t.toFixed(1), +(t - last).toFixed(2), flight ? 1 : 0);
      if (flight && D.ms.firstFlight == null && D.t0 != null) D.ms.firstFlight = { t: rel(t), clicks: D.clicks };
    }
    last = t; requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) D.longs.push({ t: +e.startTime.toFixed(0), d: +e.duration.toFixed(0) }); }).observe({ entryTypes: ['longtask'] });
  } catch (e) { D.longTaskError = String(e); }
  // text seen by a player: toasts, alerts, the Stage lanes (+ anything with role=status/alert)
  const seen = new Map();
  const zone = (n) => {
    const el = n.nodeType === 1 ? n : n.parentElement; if (!el || !el.closest) return null;
    if (el.closest('#toast-live, [aria-live][class*="sr-only"]')) return null;
    if (el.closest('#toasts')) return 'toasts';
    if (el.closest('#alerts')) return 'alerts';
    if (el.closest('[id^="sf-stage"]')) { const id = el.closest('[id^="sf-stage"]').id.replace('sf-stage-', ''); return id === 'dialog' ? null : 'stage:' + id; } // dialog slot hosts whole hidden screens
    if (el.closest('#hud') && !el.closest('#screens')) return 'hud';
    return null;
  };
  const addText = (src, text, extra) => {
    text = String(text || '').replace(/\s+/g, ' ').trim(); if (!text) return;
    const key = src + '|' + text; const t = now();
    if (seen.has(key) && t - seen.get(key) < 1200) return;
    seen.set(key, t);
    D.text.push({ t: rel(t), tAbs: +t.toFixed(0), src, text: text.slice(0, 240), ...extra });
  };
  D.addText = addText;
  const startObs = () => {
    if (!document.body) return setTimeout(startObs, 50);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') for (const n of m.addedNodes) {
          const z = zone(n); if (!z) continue; const tx = String(n.textContent || '').replace(/\s+/g, ' ').trim();
          if (z === 'hud' && (tx.length > 120 || (tx.match(/[A-Za-z]/g) || []).length < 4)) continue; // hud: only new word-like elements, not counters
          addText('dom:' + z, tx);
        } else if (m.type === 'characterData') { const z = zone(m.target); if (z && z !== 'hud') addText('dom:' + z, m.target.textContent || ''); }
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  startObs();
};

// bus hooks, installed once window.SF.bus exists
const HOOK = () => {
  const D = window.__dr; const bus = window.SF && window.SF.bus;
  if (!bus || D.hooked) return !!D.hooked;
  D.hooked = true;
  const orig = bus.emit.bind(bus);
  const TEXTY = /^(toast|alert|voice:surface|stage:|floating|notice|banner|callout|announce|swarm:announce|hud:float|fx:text)/i;
  const MILE = new Set(['tether:latched', 'massline:throw', 'massline:selfSling', 'tether:cut', 'entity:killed', 'combat:collisionConsequence', 'swarm:drop:spawned',
    'dock:range', 'dock:docked', 'player:docked', 'station:docked', 'dock:undocked', 'player:undocked', 'mission:accepted', 'mission:completed', 'mission:updated', 'nav:waypoint', 'game:started', 'game:newGame', 'run:started', 'run:ended', 'run:over', 'player:died', 'player:destroyed', 'swarm:roundStart', 'swarm:roundEnd', 'sector:entered',
    'credits:changed', 'cargo:delivered', 'jump:chargeStart', 'jump:chargeAbort', 'jump:arrive', 'save:completed', 'save:loaded', 'save:error']);
  const pickText = (p) => {
    if (p == null) return '';
    if (typeof p === 'string') return p;
    for (const k of ['text', 'line', 'message', 'msg', 'label', 'title', 'body', 'caption']) if (typeof p[k] === 'string' && p[k]) return p[k];
    try { return JSON.stringify(p).slice(0, 160); } catch (e) { return ''; }
  };
  bus.emit = function (ev, p, ...rest) {
    try {
      D.emitted++;
      const t = performance.now();
      if (typeof ev === 'string') {
        if (p && (ev === 'tether:latched' || /^(physics:impact|environment:fractured|asteroid:destroyed|entity:destroyed|entity:killed|tether:broke)$/.test(ev))) {
          const state = window.SF.state;
          const lessonRockId = state.onboarding?.rescue?.ids?.rock;
          if (ev === 'tether:latched' && p.targetId === lessonRockId) D.learnerRockId ??= lessonRockId;
          const id = D.learnerRockId ?? lessonRockId;
          if (id != null && (p.id === id || p.targetId === id || p.aId === id || p.bId === id)
            && D.learnerRockEvents.length < 96) {
            const rock = p.entity?.id === id ? p.entity : state.entities.get(id);
            D.learnerRockEvents.push({ ev, sim: state.simTime, id, reason: p.reason, gen: p.occupantGeneration,
              pair: [p.aId, p.bId], speed: p.preSolveClosingSpeed, hull: rock?.hull, alive: rock?.alive,
              type: rock?.data?.typeId, bodyGeneration: rock?.occupantGeneration });
          }
        }
        if (TEXTY.test(ev) || /:(toast|alert|announce)$/.test(ev)) {
          D.addText('bus:' + ev, pickText(p), { kind: p && (p.kind || p.sev || p.severity || p.channel) });
        }
        const s = window.SF.state;
        let raidImpact = null;
        if (ev === 'physics:impact' && p) {
          const raid = s.onboarding?.raid;
          const cast = raid?.active ? raid.ids : null;
          const involvedRaider = cast?.raider != null && (p.aId === cast.raider || p.bId === cast.raider)
            && (p.aId === cast.throwRock || p.bId === cast.throwRock || p.preSolveClosingSpeed >= 25);
          if (p.playerInvolved === true || involvedRaider) {
            const impact = { sim: s.simTime, tick: p.tick, backend: p.backend,
              pair: [p.aId, p.bId], generations: [p.aGeneration, p.bGeneration],
              closingSpeed: p.preSolveClosingSpeed };
            if (p.playerInvolved === true) D.lastPlayerImpact = impact;
            if (involvedRaider) raidImpact = impact;
          }
        }
        const playerMining = ev === 'mining:yield' && p?.minerId === s.playerId;
        const lockChange = ev === 'mining:tick' && p?.sourceEntityId === s.playerId
          && p.targetId !== D.lastMiningTarget;
        if (raidImpact || lockChange || playerMining || MILE.has(ev) || /^(tether|massline):/.test(ev)) {
          const imp = p && p.impactorId != null && s && s.entities && s.entities.get(p.impactorId);
          const rec = { ev, t: D.rel(t), sim: s ? +(+s.simTime).toFixed(2) : null, clicks: D.clicks, id: p && (p.id ?? p.payloadId ?? p.victimId), cause: p && (p.cause || p.source), killer: p && p.killerId,
            type: p && p.type, victim: p && p.victimId, pos: p && p.pos ? [Math.round(p.pos.x), Math.round(p.pos.z)] : undefined,
            impactorId: p && p.impactorId != null ? p.impactorId : undefined,
            impactor: imp ? `${imp.type}:${(imp.data && (imp.data.freight ? 'freight' : imp.data.shipClass || imp.data.kind)) || imp.defId || ''}` : undefined };
          if (ev === 'nav:waypoint' || ev === 'mission:updated' || ev === 'mission:accepted' || ev === 'mission:completed') rec.label = pickText(p && (p.label ? p : p.mission || p)).slice(0, 100);
          if (p && p.reason) rec.reason = p.reason;
          if (p && p.breakReason && !rec.reason) rec.reason = p.breakReason;
          if (p && p.mode) rec.mode = p.mode;
          if (raidImpact) Object.assign(rec, raidImpact);
          if (ev === 'tether:whipImpact' && p) {
            rec.targetId = p.targetId; rec.rating = p.rating; rec.relativeSpeed = p.relSpeed;
          }
          if (ev === 'massline:throw' && p) {
            rec.releaseId = p.releaseId; rec.aimTargetId = p.aimTargetId; rec.prediction = p.prediction;
            rec.attachmentId = p.cut?.attachmentId; rec.tick = p.tick;
          }
          if (ev === 'massline:releaseCancelled' || ev === 'tether:broken') {
            rec.attachmentId = p?.attachmentId; rec.tick = p?.tick;
          }
          if (ev === 'massline:releaseValidated' && p) {
            rec.id = p.entityId; rec.releaseId = p.releaseId; rec.actual = p.actual;
            rec.trajectory = p.trajectory; rec.withinTolerance = p.withinTolerance;
          }
          if (ev === 'dock:range' || ev === 'dock:docked') rec.stationId = p?.stationId;
          if (ev === 'dock:range') rec.inRange = p?.inRange === true;
          if (ev === 'credits:changed') { rec.delta = p?.delta; rec.total = p?.total; }
          if (ev === 'cargo:delivered') {
            rec.missionId = p?.missionId; rec.stationId = p?.stationId;
            rec.commodityId = p?.commodityId; rec.qty = p?.qty;
          }
          if (ev === 'jump:chargeStart' || ev === 'jump:arrive') {
            rec.targetSectorId = p?.targetSectorId ?? p?.sectorId; rec.via = p?.via;
          }
          if (ev === 'jump:chargeAbort') {
            rec.creditsNeeded = p?.creditsNeeded; rec.creditsHeld = p?.creditsHeld; rec.cooldownS = p?.cooldownS;
          }
          if (ev === 'save:completed' || ev === 'save:loaded' || ev === 'save:error') rec.slot = p?.slot;
          if (ev === 'save:completed') rec.ok = p?.ok === true;
          if (ev === 'save:loaded') rec.restoredEconomy = p?.restoredEconomy;
          if (playerMining) {
            rec.id = s.player?.miningTargetId;
            rec.qty = p.qty;
            rec.commodityId = p.commodityId;
          }
          if (lockChange) {
            D.lastMiningTarget = p.targetId;
            rec.id = p.targetId;
            const rock = s.entities.get(p.targetId);
            rec.pos = rock?.pos ? [Math.round(rock.pos.x), Math.round(rock.pos.z)] : null;
            rec.slot = rock?.data?.activityObjectSlotId ?? rock?.data?.asteroidSlotId;
            rec.field = rock?.data?.fieldId;
          }
          if (lockChange || playerMining) {
            const marker = s.nav?.waypoint?.pos;
            const cursor = s.input?.aimWorld;
            rec.markedPos = marker ? [Math.round(marker.x), Math.round(marker.z)] : null;
            rec.aimPos = cursor ? [Math.round(cursor.x), Math.round(cursor.z)] : null;
          }
          if (p && typeof p.open === 'boolean') rec.open = p.open;
          if (rec.id == null && p && p.targetId != null && /^(tether|massline):/.test(ev)) rec.id = p.targetId;
          D.ev.push(rec);
          if (D.t0 != null) {
            const set = (k) => { if (D.ms[k] == null) D.ms[k] = { t: D.rel(t), clicks: D.clicks }; };
            if (ev === 'tether:latched') set('firstLatch');
            if (ev === 'massline:throw') set('firstThrow');
            if (ev === 'entity:killed' && !(s && p && p.victimId === s.playerId) && !(s && p && p.id === s.playerId)) set('firstKill');
          }
        }
      }
    } catch (e) { /* observer must never break the game */ }
    return orig(ev, p, ...rest);
  };
  return true;
};

// ---------------------------------------------------------------- server + browser
// A clean profile: the server keeps player saves on disk, and a save turns the ADVENTURE door into CONTINUE, so
// point this server at an empty store (a first-time player has none). --keep-saves uses the real store.
const STORE = join(OUT, '_clean-player-store');
if (argv['keep-saves'] !== true) mkdirSync(STORE, { recursive: true });
if (RESUME_STORE) {
  if (existsSync(join(STORE, 'sf.save.index.json'))) throw new Error('Resume requires a fresh --out');
  for (const name of ['sf.save.auto.json', 'sf.save.index.json']) {
    copyFileSync(join(RESUME_STORE, name), join(STORE, name));
  }
  const quickSave = join(RESUME_STORE, 'sf.save.quick.json');
  if (existsSync(quickSave)) copyFileSync(quickSave, join(STORE, 'sf.save.quick.json'));
}
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore',
  env: argv['keep-saves'] === true ? process.env : { ...process.env, SPACEFACE_PLAYER_STORE_DIR: STORE } });
let browser; let page; let shotN = 0; let nav = { t0Set: false };
const slug = (s) => String(s || 'screen').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'screen';

async function shot(label, extra) {
  const file = `${String(++shotN).padStart(2, '0')}-${slug(label)}.png`;
  const a = await page.evaluate(() => performance.now()).catch(() => 0);
  await page.screenshot({ path: join(OUT, file) }).catch((e) => note(`screenshot failed ${file}: ${e.message.slice(0, 80)}`));
  const b = await page.evaluate(() => performance.now()).catch(() => 0);
  await page.evaluate(([x, y]) => { window.__dr.noise.push([x, y + 400]); }, [a, b]).catch(() => {});
  R.screens.push({ file, label, at: wallS(), ...extra });
  return file;
}
const click = async (x, y, button = 'left') => {
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.down({ button }); await sleep(90); await page.mouse.up({ button });
  R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
};
const readBtns = () => page.evaluate(() => {
  const out = []; const seen = new Set();
  const sel = 'button, [role="button"], [role="menuitem"], [role="tab"], a[href], .k-word, [data-action], [data-tab], li[tabindex]';
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity < 0.1) continue;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
    const hit = document.elementFromPoint(cx, cy); if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) continue;
    const text = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) continue; const key = text + '|' + Math.round(cx) + '|' + Math.round(cy); if (seen.has(key)) continue; seen.add(key);
    out.push({ text: text.slice(0, 80), x: Math.round(cx), y: Math.round(cy), tag: el.tagName.toLowerCase() });
  }
  return out;
}).catch(() => []);
async function clickText(re, { optional = false } = {}) {
  const btns = await readBtns();
  const hit = btns.find((b) => re.test(b.text));
  if (!hit) { if (!optional) note(`no visible control matching ${re}; saw: ${btns.map((b) => b.text).slice(0, 14).join(' | ')}`); return null; }
  await click(hit.x, hit.y); note(`click "${hit.text}" (${hit.x},${hit.y})`); return hit;
}
const readConfirm = () => page.evaluate(() => {
  const root = document.getElementById('sf-confirm-root'); const d = root && root.querySelector('[role="dialog"]');
  if (!d || !root.classList.contains('sf-confirm--in')) return null;
  const r = d.getBoundingClientRect(); if (r.width < 4) return null;
  return { title: (d.querySelector('#sf-confirm-title') || {}).textContent || '', body: ((d.querySelector('#sf-confirm-body') || {}).textContent || '').slice(0, 300),
    buttons: [...d.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); return { text: b.textContent.trim(), x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2), ok: b.classList.contains('sf-confirm__ok') }; }) };
}).catch(() => null);
let lastConfirmKey = '';
async function answerConfirm(prefer = /^(play|ok|yes|confirm|continue|end run|leave|main menu)/i) {
  const c = await readConfirm(); if (!c) return null;
  const key = c.title + '|' + c.body.slice(0, 40);
  if (key !== lastConfirmKey) {
    lastConfirmKey = key; step('prompt', `"${c.title}" ${c.body.replace(/\s+/g, ' ').slice(0, 140)} [${c.buttons.map((b) => b.text).join(' / ')}]`);
    await sleep(500); await shot(`prompt-${c.title}`, { prompt: c.title });
  }
  const b = c.buttons.find((x) => prefer.test(x.text)) || c.buttons.find((x) => x.ok) || c.buttons[0];
  if (b) { await click(b.x, b.y); note(`answered prompt "${c.title}" with "${b.text}"`); }
  await sleep(400); return c;
}
const snap = () => page.evaluate(() => {
  const S = window.SF; const s = S && S.state; if (!s) return null;
  const sm = S.ctx && S.ctx.screenManager; const me = s.entities && s.entities.get(s.playerId);
  const run = s.run;
  return { mode: s.mode, top: sm && sm.top ? sm.top() : null, sim: +(+s.simTime).toFixed(1), hp: me ? (me.hull ?? me.hp ?? null) : null, alive: me ? me.alive !== false : null,
    pos: me ? [Math.round(me.pos.x), Math.round(me.pos.z)] : null, run: run ? { kind: run.kind, wave: run.wave, phase: run.phase, credits: run.credits } : null,
    docked: !!(s.dock && s.dock.docked) || s.mode === 'docked' || s.mode === 'station', sector: s.world && s.world.currentSectorId };
}).catch(() => null);

// screen tracker: a PNG the first time each distinct screen is on top
const seenScreens = new Set(); let lastScreenKey = null;
async function trackScreen(force) {
  const s = await snap(); if (!s) return s;
  const key = s.top ? `screen:${s.top}` : `${s.mode || 'none'}${s.run && s.run.wave ? '-r' + s.run.wave : ''}`;
  if (key !== lastScreenKey || force) {
    lastScreenKey = key;
    if (!seenScreens.has(key) || force) {
      seenScreens.add(key);
      await sleep(900);
      const btns = (await readBtns()).map((b) => b.text).slice(0, 24);
      step('screen', `${key} controls: ${btns.join(' | ')}`);
      await shot(key.replace('screen:', ''), { key, mode: s.mode, controls: btns });
    }
  }
  return s;
}
let nextGameplayShot = 15_000; let tZero = null;
async function gameplayShots() {
  if (tZero == null) return;
  if (Date.now() - tZero >= nextGameplayShot) { nextGameplayShot = (Date.now() - tZero) + 15_000; await shot(`gameplay-t${Math.round((Date.now() - tZero) / 1000)}`, { gameplay: true }); }
}
const hostilesQ = () => page.evaluate(() => {
  const s = window.SF.state; const h = window.SF.helpers; const me = s.entities.get(s.playerId); if (!me) return null;
  const hs = [];
  for (const e of s.entityList || []) {
    if (!e || e.alive === false || e.type !== 'ship' || e.isPlayer || e.team === 0) continue;
    const scr = h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
    hs.push({ id: e.id, mass: e.mass, dist: Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z), scr: scr && { x: scr.x, y: scr.y, on: !!scr.onScreen } });
  }
  hs.sort((a, b) => a.dist - b.dist);
  const onPlay = (scr) => scr && scr.on && scr.x > 300 && scr.x < 980 && scr.y > 140 && scr.y < 600;
  // A rock/wreck chunk is the better payload when one is up: ships get killed by the fight while
  // they are held, but a chunk outlives the hold and the release window always arrives.
  let rock = null;
  for (const e of s.entityList || []) {
    if (!e || e.alive === false || !e.pos || e.isPlayer) continue;
    const throwable = e.type === 'payload' || (e.type === 'asteroid' && e.data && (e.data.isChunk || e.data.throwable === true));
    if (!throwable) continue;
    const scr = h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
    if (!onPlay(scr)) continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (!rock || d < rock.dist) rock = { id: e.id, kind: 'rock', mass: e.mass, dist: d, scr: { x: scr.x, y: scr.y } };
  }
  const meScr = h.worldToScreen({ x: me.pos.x, y: 0, z: me.pos.z }, {});
  const light = hs.filter((e) => !(Number.isFinite(e.mass) && e.mass > 32) && e.scr && onPlay(e.scr))[0] || null;
  if (light) light.kind = 'ship';
  return { n: hs.length, near: hs[0] || null, light, rock, me: meScr && { x: meScr.x, y: meScr.y } };
}).catch(() => null);

const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// The throw cue as the player sees it: the aim tag's own lit state plus the sim's window flag
// behind it. In Swarm the tag is the hover chip (.sf-woi shows RMB · THROW while a throwable is
// held); tetherActive lets a dead line end the wait instead of sending a blind tap.
const readThrowCue = () => page.evaluate(() => {
  const s = window.SF.state; const t = s.massline2 && s.massline2.throw; const tt = s.player && s.player.tether;
  // isThrowArmPayload replicated: payload/throwable rock, or a hostile/combat ship. A line that
  // fails this turns an RMB tap into an ordinary cut — the press can never become a throw.
  const pl = tt && tt.active && tt.targetId != null ? s.entities.get(tt.targetId) : null;
  let throwable = false;
  if (pl && pl.alive !== false) {
    if (pl.type === 'payload' || (pl.type === 'asteroid' && pl.data && (pl.data.isChunk || pl.data.throwable === true))) throwable = true;
    else if (pl.type === 'ship' || pl.type === 'drone') {
      const me = s.entities.get(s.playerId); const d = pl.data || {}; const ai = d.ai || {};
      const arch = String(ai.archetype || ai.doctrine || ai.role || d.role || d.scenarioRole || '').toLowerCase();
      throwable = !!((me && pl.team !== me.team && pl.team !== 0 && pl.team !== 2 && !ai.passive)
        || ['pirate', 'raider', 'marauder', 'corsair', 'outlaw', 'brawler', 'sniper', 'swarmer', 'hunter', 'mercenary', 'miniboss_capital'].includes(arch));
    }
  }
  return { on: !!(t && t.solution && t.solution.valid && t.solution.onSolution), armed: !!(t && t.armed), aimTarget: t ? t.aimTargetId : null,
    enterS: t && t.solution && t.solution.window && Number.isFinite(t.solution.window.enterS) ? +t.solution.window.enterS.toFixed(2) : null,
    winReliable: !!(t && t.solution && t.solution.window && t.solution.window.reliable),
    tetherActive: !!(tt && tt.active), tetherTarget: tt && tt.targetId != null ? tt.targetId : null, ttType: pl ? pl.type : null, throwable, phase: tt ? (tt.phase || tt.state || null) : null,
    restLength: tt?.restLength ?? null,
    payloadSpeed: pl?.vel ? Math.hypot(pl.vel.x, pl.vel.z) : null,
    strain: tt && Number.isFinite(tt.strain) ? +tt.strain.toFixed(2) : null,
    cue: (document.querySelector('.ml2-preview[data-throw-cue="1"]') || document.querySelector('.sf-woi:not([hidden]) .sf-woi__hint') || {}).textContent || null,
    cueLit: !!document.querySelector('.ml2-preview[data-throw-cue="1"][data-window="1"], .sf-woi[data-sling="1"][data-window="1"]:not([hidden])') };
}).catch(() => ({ on: false, tetherActive: true }));
// The tether's own acquisition preview (same receipt the HUD reads): which body a press would
// latch right now. Pressing while it names a pickup/plain rock wastes the press — those bodies
// latch fine but can never arm the throw.
const latchPreviewQ = () => page.evaluate(() => {
  const s = window.SF.state; const acq = s.masslineAcquisition || s.n; const sel = acq && acq.selected;
  if (!sel || sel.targetId == null) return { selId: null, reason: acq ? acq.reason : null };
  const e = s.entities.get(sel.targetId);
  let throwable = false;
  if (e && e.alive !== false) {
    if (e.type === 'payload' || (e.type === 'asteroid' && e.data && (e.data.isChunk || e.data.throwable === true))) throwable = true;
    else if (e.type === 'ship' || e.type === 'drone') {
      const me = s.entities.get(s.playerId); const d = e.data || {}; const ai = d.ai || {};
      const arch = String(ai.archetype || ai.doctrine || ai.role || d.role || d.scenarioRole || '').toLowerCase();
      throwable = !!((me && e.team !== me.team && e.team !== 0 && e.team !== 2 && !ai.passive)
        || ['pirate', 'raider', 'marauder', 'corsair', 'outlaw', 'brawler', 'sniper', 'swarmer', 'hunter', 'mercenary', 'miniboss_capital'].includes(arch)
        || sel.hostileContext === true);
    }
  }
  return { selId: sel.targetId, selType: sel.targetType || (e && e.type) || null, status: sel.status || null, reason: sel.reason || null, throwable };
}).catch(() => null);
const scrOfQ = (id) => page.evaluate((tid) => {
  const s = window.SF.state; const e = s.entities.get(tid);
  const scr = e && e.pos && window.SF.helpers.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
  return scr ? { x: scr.x, y: scr.y, on: !!scr.onScreen } : null;
}, id).catch(() => null);
// The throw's aim: the hostile nearest the HELD body (whip it into its packmates), preferring one
// on screen so the hover tag can light on it — a real entity the release solve can target.
const throwAimQ = () => page.evaluate(() => {
  const s = window.SF.state; const h = window.SF.helpers; const me = s.entities.get(s.playerId); if (!me) return null;
  const t = s.player && s.player.tether; const held = t && t.active && t.targetId != null ? s.entities.get(t.targetId) : null;
  const anchor = (held && held.pos) || me.pos;
  let best = null;
  for (const e of s.entityList || []) {
    if (!e || e.alive === false || e.type !== 'ship' || e.isPlayer || e.team === 0 || (held && e.id === held.id)) continue;
    const scr = h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
    const on = !!(scr && scr.onScreen && scr.x > 300 && scr.x < 980 && scr.y > 140 && scr.y < 600);
    const d = Math.hypot(e.pos.x - anchor.x, e.pos.z - anchor.z);
    const score = d - (on ? 4000 : 0);
    if (!best || score < best.score) best = { score, id: e.id, dist: Math.round(d), on, scr: scr && { x: scr.x, y: scr.y } };
  }
  return best && best.scr ? { id: best.id, dist: best.dist, on: best.on, x: best.scr.x, y: best.scr.y } : null;
}).catch(() => null);

// ---------------------------------------------------------------- shared: boot, intro, first-run prompt
let bootProfile = null;
let stopBootMediaRequests = null;

function watchBootMediaRequests(page) {
  const report = R.bootMedia = { requests: [], pipeline: { status: 'pending', events: [] } };
  const tracked = new Map();
  const request = (entry) => {
    if (!/\/assets\/cinematics\/(?:boot-visualizer(?:-quiet)?|intro-visualizer)\.mp4(?:\?|$)/.test(entry.url())) return;
    if (report.requests.length >= 64) { report.requestsTruncated = true; return; }
    const record = { url: entry.url(), type: entry.resourceType(), range: entry.headers().range ?? null,
      requestedAtUnixMs: Date.now() };
    tracked.set(entry, record);
    report.requests.push(record);
  };
  const response = (entry) => {
    const record = tracked.get(entry.request());
    if (!record) return;
    const headers = entry.headers();
    record.response = { status: entry.status(), contentRange: headers['content-range'] ?? null,
      contentLength: headers['content-length'] ?? null, acceptRanges: headers['accept-ranges'] ?? null,
      contentType: headers['content-type'] ?? null, atUnixMs: Date.now() };
  };
  const complete = (entry) => {
    const record = tracked.get(entry);
    if (!record) return;
    record.result = entry.failure()?.errorText ?? 'finished';
    record.timing = entry.timing();
    record.doneAtUnixMs = Date.now();
    tracked.delete(entry);
  };
  const listeners = [['request', request], ['response', response], ['requestfinished', complete], ['requestfailed', complete]];
  for (const [name, handler] of listeners) page.on(name, handler);
  return () => {
    for (const [name, handler] of listeners) page.off(name, handler);
    report.requestCaptureEndedAtUnixMs = Date.now();
  };
}

function watchBootMediaPipeline(session) {
  const pipeline = R.bootMedia.pipeline;
  for (const event of ['playerCreated', 'playerPropertiesChanged', 'playerEventsAdded', 'playerMessagesLogged', 'playerErrorsRaised']) {
    session.on(`Media.${event}`, (payload) => {
      if (pipeline.events.length >= 256) { pipeline.truncated = true; return; }
      pipeline.events.push({ event, atUnixMs: Date.now(), ...payload });
    });
  }
  void session.send('Media.enable').then(() => { pipeline.status = 'enabled'; }, (error) => {
    pipeline.status = 'unavailable';
    pipeline.error = String(error.message || error);
  });
}

async function startBootCpuProfile() {
  let session;
  try {
    session = await page.context().newCDPSession(page);
    await session.send('Profiler.enable');
    await session.send('Profiler.setSamplingInterval', { interval: 1000 });
    await session.send('Profiler.start');
    bootProfile = { session, stopping: null };
    watchBootMediaPipeline(session);
  } catch (error) {
    R.bootProfile = { status: 'unavailable', phase: 'start', error: String(error.message || error) };
    R.bootMedia.pipeline.status = 'unavailable';
    R.bootMedia.pipeline.error = R.bootProfile.error;
    await session?.detach().catch((error) => { R.bootProfile.detachError = String(error.message || error); });
  }
}

function stopBootCpuProfile(reason) {
  stopBootMediaRequests?.();
  stopBootMediaRequests = null;
  if (bootProfile) return bootProfile.stopping ??= finishBootCpuProfile(bootProfile.session, reason);
}

async function finishBootCpuProfile(session, reason) {
  try {
    const { profile } = await session.send('Profiler.stop');
    const file = 'boot.cpuprofile';
    writeFileSync(join(OUT, file), JSON.stringify(profile));
    const receipt = R.bootProfile = {
      status: reason === 'title-actionable' ? 'captured' : 'partial', reason, file,
      samples: profile.samples?.length ?? 0,
      navigationStartUs: null,
    };
    // CDP's timeTicks NavigationStart and CPU profile timestamps share the monotonic clock.
    // Read the origin after stopping so this cannot add an operation to the measured window.
    try {
      await session.send('Performance.enable', { timeDomain: 'timeTicks' });
      const { metrics } = await session.send('Performance.getMetrics');
      const start = metrics.find(({ name }) => name === 'NavigationStart')?.value;
      if (Number.isFinite(start) && start > 0) receipt.navigationStartUs = start * 1e6;
      else receipt.clockError = 'CDP did not report NavigationStart';
    } catch (error) { receipt.clockError = String(error.message || error); }
  } catch (error) {
    R.bootProfile = { status: 'unavailable', phase: 'stop', reason, error: String(error.message || error) };
  } finally {
    await session.detach().catch((error) => { R.bootProfile.detachError = String(error.message || error); });
  }
}

async function bootToTitle() {
  if (PROFILE_BOOT) stopBootMediaRequests = watchBootMediaRequests(page);
  await page.goto(`http://127.0.0.1:${PORT}/${argv.lane === 'main' ? '?simLane=main' : ''}`, { waitUntil: 'commit' });
  if (PROFILE_BOOT) await startBootCpuProfile();
  const bootTimeoutMs = 240_000;
  const t0 = Date.now(); let introStart = null; let introEnd = null; let spaced = 0;
  const actions = ROUTE === 'swarm' ? ['swarm'] : ['newGame', 'continue'];
  // Observe the public door while the driver is taking screenshots or pacing the intro.
  const titleObservation = page.waitForFunction((actions) => {
    const menu = document.querySelector('[data-screen="mainMenu"]');
    if (!menu) return false;
    const action = actions.find((action) => {
      const door = menu.querySelector(`button[data-action="${action}"]:not(:disabled)`);
      if (!door || door.getAttribute('aria-disabled') === 'true') return false;
      const style = getComputedStyle(door);
      if (style.visibility !== 'visible' || +style.opacity < 0.1) return false;
      const { left, top, width, height } = door.getBoundingClientRect();
      return width > 0 && height > 0 && door.contains(document.elementFromPoint(left + width / 2, top + height / 2));
    });
    if (!action) return false;
    const navigationMs = Math.round(performance.now());
    const startup = window.__SF_STARTUP__?.snapshot()?.current;
    const bootEvents = (startup?.events || []).filter(({ event, id }) =>
      event === 'document-start' || event === 'ui:loadingHidden' || (event === 'game:loadingProgress' && id?.startsWith('boot-'))
    ).map(({ event, id, at }) => ({ event, id, navigationMs: at == null ? null : Math.round(at - performance.timeOrigin) }));
    return { action, navigationMs, timeOriginUnixMs: performance.timeOrigin, bootEvents, initializers: window.__SF_BOOT_INIT__ || null,
      visuals: window.__dr?.finishBootTrace?.() || null };
  }, actions, { polling: 100, timeout: bootTimeoutMs }).then(async (handle) => {
    const stoppingProfile = PROFILE_BOOT ? stopBootCpuProfile('title-actionable') : null;
    R.titleReady = await handle.jsonValue();
    step('title', `${R.titleReady.action} actionable at ${(R.titleReady.navigationMs / 1000).toFixed(1)} s since navigation`);
    if (stoppingProfile) await stoppingProfile;
    return true;
  }).catch(() => false);
  let ready = false;
  while (Date.now() - t0 < bootTimeoutMs) {
    const st = await page.evaluate(() => {
      const vis = (n) => { if (!n || n.hidden) return false; const c = getComputedStyle(n); const r = n.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
      return { sf: !!(window.SF && window.SF.state && window.SF.bus), splash: vis(document.getElementById('cinematic-splash')) };
    }).catch(() => ({}));
    if (st.sf) await page.evaluate(HOOK).catch(() => {});
    if (st.splash && introStart == null) { introStart = Date.now(); step('intro', 'cinematic splash visible'); await sleep(1500); await shot('intro-cinematic'); }
    if (!st.splash && introStart != null && introEnd == null) { introEnd = Date.now(); step('intro', `ended after ${((introEnd - introStart) / 1000).toFixed(1)} s (${spaced} Space presses)`); }
    const c = await readConfirm();
    if (c) { await answerConfirm(/^play$/i); continue; }
    if (st.splash) {
      const age = Date.now() - introStart;
      const limit = INTRO === 'skip' ? 3500 : 120_000;
      if (age > limit && (Date.now() - (nav.lastSpace || 0)) > 2500) { await page.keyboard.press('Space'); spaced++; nav.lastSpace = Date.now(); note('pressed Space on the intro'); }
    } else if (R.titleReady && st.sf) { ready = true; break; }
    await sleep(400);
  }
  if (!(await titleObservation) || !ready) {
    if (PROFILE_BOOT) await stopBootCpuProfile('title-not-ready');
    R.incompleteBoot = await page.evaluate(() => ({ initializers: window.__SF_BOOT_INIT__ || null,
      visuals: window.__dr?.finishBootTrace?.() || null })).catch(() => null);
    throw new Error('title never became ready');
  }
  await sleep(800);
  R.intro_seconds = introStart ? +(((introEnd || Date.now()) - introStart) / 1000).toFixed(1) : 0;
  R.intro_spacePresses = spaced;
  await page.evaluate(HOOK).catch(() => {});
  await trackScreen(true);
}
async function setZero() {
  tZero = Date.now();
  await page.evaluate(() => { window.__dr.t0 = performance.now(); window.__dr.clicks = 0; }).catch(() => {});
  R.clicks = 0;
}
const rendererInfo = () => page.evaluate(() => {
  try {
    const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return 'no webgl';
    const x = gl.getExtension('WEBGL_debug_renderer_info');
    return x ? `${gl.getParameter(x.UNMASKED_RENDERER_WEBGL)} (vendor ${gl.getParameter(x.UNMASKED_VENDOR_WEBGL)})` : gl.getParameter(gl.RENDERER);
  } catch (e) { return 'error ' + e.message; }
});
const qualityInfo = () => page.evaluate(() => {
  const s = window.SF && window.SF.state; const v = s && s.settings && s.settings.video || {};
  return { qualityPreset: v.qualityPreset, qualityMode: v.qualityMode, renderScale: v.renderScale, dynamicResolution: v.dynamicResolution, shadows: v.shadows, bloom: v.bloom, particleQuality: v.particleQuality, graphicsPreset: s && s.settings && s.settings.graphicsPreset, pixelRatioCap: v.pixelRatioCap, dpr: devicePixelRatio };
}).catch(() => null);

// ---------------------------------------------------------------- shared: fly + fight primitives
const held = new Set();
const keyDown = async (k) => { if (!held.has(k)) { held.add(k); await page.keyboard.down(k); } };
const keyUp = async (k) => { if (held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
// The game drops held keys when the window loses focus (other windows on a shared desktop steal it), while
// Playwright still thinks they are down: re-assert them, as a player re-pressing a key would.
let lastReassert = 0;
async function reassertKeys() {
  if (Date.now() - lastReassert < 700) return; lastReassert = Date.now();
  for (const k of held) { await page.keyboard.up(k).catch(() => {}); await page.keyboard.down(k).catch(() => {}); }
}
const releaseAll = async () => { for (const k of [...held]) await keyUp(k); if (nav.lmb) { await page.mouse.up({ button: 'left' }).catch(() => {}); nav.lmb = false; } };
async function setFire(on) {
  if (on && !nav.lmb) { await page.mouse.down({ button: 'left' }); nav.lmb = true; }
  if (!on && nav.lmb) { await page.mouse.up({ button: 'left' }); nav.lmb = false; }
}
/** The pilot scheme: A/D yaw the ship (D raises rot), W/S thrust, the mouse only aims. Tap a yaw key toward bearing `rel`. */
async function yawToward(rel) {
  if (!Number.isFinite(rel) || Math.abs(rel) <= 0.1) return;
  await page.keyboard.press(rel > 0 ? 'KeyD' : 'KeyA', { delay: Math.max(15, Math.min(90, Math.abs(rel) / 4.5 * 1000)) });
}
/** Mouse toward a world point; returns {dist, onScreen}. Off-screen points are aimed along their bearing from the ship. */
const aimAt = (wx, wz) => page.evaluate(([x, z]) => {
  const s = window.SF.state; const h = window.SF.helpers; const me = s.entities.get(s.playerId); if (!me) return null;
  const dist = Math.hypot(x - me.pos.x, z - me.pos.z);
  const speed = Math.hypot(me.vel.x, me.vel.z);
  let rel = Math.atan2(z - me.pos.z, x - me.pos.x) - me.rot; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI; // nose = (cos rot, sin rot) on XZ; D raises rot
  const t = h.worldToScreen({ x, y: 0, z }, {}); const m = h.worldToScreen({ x: me.pos.x, y: 0, z: me.pos.z }, {});
  if (t && t.onScreen && t.x > 30 && t.x < innerWidth - 30 && t.y > 30 && t.y < innerHeight - 30) {
    return { dist, rel, x: t.x, y: t.y, on: true, ship: m, speed };
  }
  const dx = (x - me.pos.x) / (dist || 1), dz = (z - me.pos.z) / (dist || 1);
  const p = h.worldToScreen({ x: me.pos.x + dx * 300, y: 0, z: me.pos.z + dz * 300 }, {});
  let vx = p.x - m.x, vy = p.y - m.y; const n = Math.hypot(vx, vy) || 1; vx /= n; vy /= n;
  return { dist, rel, x: Math.max(40, Math.min(innerWidth - 40, m.x + vx * 260)), y: Math.max(40, Math.min(innerHeight - 40, m.y + vy * 260)), on: false, speed };
}, [wx, wz]).catch(() => null);

// ---------------------------------------------------------------- SWARM
async function swarmRoute() {
  await bootToTitle();
  await setZero();
  step('click', 'title: SWARM');
  await clickText(/^\s*swarm\b/i);
  // Whatever screens follow: launch round 1.
  const tPre = Date.now(); let inFlight = false; let door = [];
  while (Date.now() - tPre < 240_000) {
    await answerConfirm(/^(play|ok|yes|confirm|continue)/i);
    const s = await trackScreen();
    if (s && s.mode === 'flight' && !s.top) { const h = await hostilesQ(); if (h && h.n >= 2) { inFlight = true; break; } }
    const btns = await readBtns();
    if (s && s.top) door.push(s.top);
    const pri = [/^play$/i, /^launch round/i, /quick play/i, /hold the line/i, /^launch\b/i, /^(start|begin|deploy|ready)/i, /^continue$/i];
    let hit = null;
    for (const re of pri) { hit = btns.find((b) => re.test(b.text)); if (hit) break; }
    if (hit) { await click(hit.x, hit.y); note(`click "${hit.text}" on screen ${s && s.top}`); await sleep(1200); } else await sleep(700);
  }
  R.swarm_screens_before_fight = [...new Set(door)];
  step('fight', inFlight ? 'round 1 live' : 'NEVER REACHED A LIVE FIGHT');
  if (!inFlight) { R.outcome = 'never reached the fight'; return; }
  await page.mouse.move(VW / 2, VH / 2); await page.mouse.click(VW / 2, VH / 2).catch(() => {}); // focus (a click on the world, counted)
  R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
  await sleep(400);
  const q0 = await qualityInfo(); R.quality_atFlight = q0;
  await shot('flight-start', { gameplay: true });

  // The throw, run the way the Adventure door does it since OPENING-1b — but at a person's pace
  // (BOT-02): latch with a real RMB press, swing toward the nearest pack for 0.4–0.8 s, then tap
  // RMB. The tap goes earlier the moment the throw cue lights (the aim tag reads RMB · THROW
  // while the rope's release window is open) or the forecast window enters the 350 ms snap
  // buffer — in Swarm the open window is ~1 tick, so a bot that waits for the lit cue holds the
  // body until it dies on the rope and throws 0 times. Each cycle still logs the cue state at
  // the tap and the line-end event that followed; a line that dies mid-swing skips the tap,
  // because a press on no line is just another latch/miss and hides the real end reason.
  // Retried with a fresh light target while any cycle is untried.
  const evCount = (name) => page.evaluate((n) => (window.__dr.ev || []).filter((e) => e.ev === n).length, name);
  const evLen = () => page.evaluate(() => (window.__dr.ev || []).length);
  const evSince = (k) => page.evaluate((m) => (window.__dr.ev || []).slice(m), k);
  const LINE_END = new Set(['massline:throw', 'massline:selfSling', 'tether:released', 'tether:broke', 'tether:broken', 'tether:cut']);
  let threw = false; let latchedEver = false;
  R.throwCycles = [];
  for (let cycle = 0; cycle < 5 && !threw; cycle++) {
    const rec = { cycle: cycle + 1 };
    let pick = null; const tp = Date.now();
    while (!pick && Date.now() - tp < 40_000) { await steerFight(); const h = await hostilesQ(); pick = h && (h.rock || h.light); if (!pick) await sleep(400); }
    await releaseAll();
    if (!pick) { note('no latchable target on screen'); rec.end = { ev: 'none', reason: 'no latchable target on screen' }; R.throwCycles.push(rec); continue; }
    rec.target = pick.id; rec.targetKind = pick.kind || 'ship';
    const l0 = await evCount('tether:latched'); const b0 = await evCount('tether:broken'); const t0n = await evCount('massline:throw');
    note(`throw cycle ${cycle + 1}: latch on ${JSON.stringify({ id: pick.id, kind: pick.kind || 'ship', mass: pick.mass, dist: Math.round(pick.dist) })}`);
    // Keep the pointer on the pick until the line's own preview names a throw-capable body. The
    // aim point sits in debris; a press on a pickup or plain rock latches a payload that can
    // never throw. No press at all beats a wasted latch when the preview never improves.
    let pv = null;
    for (let k = 0; k < 14; k++) {
      const sc = await scrOfQ(pick.id);
      if (sc && sc.on) await page.mouse.move(cl(sc.x, 8, VW - 8), cl(sc.y, 8, VH - 8), { steps: 2 });
      await sleep(160);
      pv = await latchPreviewQ();
      if (pv && pv.throwable) break;
    }
    rec.preview = pv;
    note(`throw cycle ${cycle + 1} preview: ${JSON.stringify(pv)}`);
    if (!pv || !pv.throwable) { rec.end = { ev: 'none', reason: 'preview never named a throw payload' }; R.throwCycles.push(rec); continue; }
    await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
    R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
    let latched = false;
    for (let i = 0; i < 10 && !latched; i++) { await sleep(150); latched = (await evCount('tether:latched')) > l0; }
    if (!latched) { note('no latch this cycle'); rec.end = { ev: 'none', reason: 'latch press never latched' }; R.throwCycles.push(rec); continue; }
    latchedEver = true; await sleep(500);
    if ((await evCount('tether:broken')) > b0) { note('latch broke at once (target lost); retrying'); rec.end = { ev: 'tether:broken', reason: 'broke at once after latch' }; R.throwCycles.push(rec); continue; }
    // A line can land on a body the throw grammar will not arm (civilian/escort hull, ordinary
    // rock). A tap there is just a cut, so release it deliberately and spend the retry elsewhere.
    const lc = await readThrowCue();
    rec.latchCue = lc;
    if (lc.tetherActive && !lc.throwable) {
      await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
      R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
      note(`throw cycle ${cycle + 1}: latched ${lc.tetherTarget} (${lc.ttType || '?'}) is not a throw payload; released`);
      rec.end = { ev: 'none', reason: 'payload not throw-arm', ttType: lc.ttType }; R.throwCycles.push(rec); continue;
    }
    if (!lc.tetherActive) { rec.end = { ev: 'none', reason: 'line dead before swing' }; R.throwCycles.push(rec); continue; }
    if (cycle === 0 || !R.screens.some((x) => x.label === 'latched')) await shot('latched', { gameplay: true });
    // BOT-02: swing toward the nearest pack for 0.4–0.8 s, then tap. W+D feeds the arc while the
    // aim rides a pack body so the release solve has a real target; the tap goes early on a lit
    // cue or a forecast window inside the 350 ms snap buffer (that press queues and fires on the
    // open tick), and unconditionally once the swing has run — any press on a live line
    // registers a throw, only a press on a dead one is silent.
    const mark = await evLen();
    const rw0 = await evCount('massline:releaseWindow');
    const swingMs = 400 + ((cycle * 173) % 401); // a person's vary: 0.4–0.8 s by cycle
    const swingStart = Date.now();
    const swingUntil = swingStart + swingMs;
    let cue = null; let lineGone = false; let lastCue = null; let why = null;
    rec.swingMs = swingMs;
    rec.trail = [];
    await keyDown('KeyW'); await keyDown('KeyD');
    for (let i = 0; ; i++) {
      const aim = await throwAimQ();
      await page.mouse.move(cl(aim && Number.isFinite(aim.x) ? aim.x : VW / 2, 300, 980), cl(aim && Number.isFinite(aim.y) ? aim.y : 200, 140, 600), { steps: 2 });
      if (i === 2 && !R.screens.some((x) => x.label === 'swing')) await shot('swing', { gameplay: true });
      const rt = await readThrowCue(); lastCue = rt;
      rec.trail.push({ i, on: rt.on, lit: rt.cueLit, enterS: rt.enterS, aimT: rt.aimTarget, thr: rt.throwable, ph: rt.phase, act: rt.tetherActive });
      if (!rt.tetherActive || !rt.throwable) { lineGone = true; break; }
      if ((await evSince(mark)).some((e) => LINE_END.has(e.ev))) { lineGone = true; break; }
      if (rt.on || rt.cueLit) why = 'cue lit';
      else if (rt.enterS != null && rt.enterS > 0 && rt.enterS <= 0.35) why = `window opens in ${rt.enterS}s`;
      else if (Date.now() >= swingUntil) why = `swung ${Date.now() - swingStart} ms`;
      if (why) { cue = { i, ...rt, aim, windowEvents: (await evCount('massline:releaseWindow')) - rw0 }; break; }
      await sleep(80);
    }
    await keyUp('KeyD');
    rec.cue = cue || { neverLit: true, last: lastCue, windowEvents: (await evCount('massline:releaseWindow')) - rw0 };
    note(`throw cycle ${cycle + 1} cue: ${JSON.stringify(rec.cue)}`);
    rec.tap = null;
    if (!lineGone) {
      // Up to 3 real 120 ms taps, aim held between them so a queued snap keeps its target.
      for (let p = 0; p < 3 && !threw; p++) {
        const aim = await throwAimQ();
        await page.mouse.move(cl(aim && Number.isFinite(aim.x) ? aim.x : VW / 2, 300, 980), cl(aim && Number.isFinite(aim.y) ? aim.y : 200, 140, 600), { steps: 2 });
        const rt2 = await readThrowCue();
        if (!rt2.tetherActive || !rt2.throwable) { note(`throw cycle ${cycle + 1} line ended before tap ${p + 1}`); break; }
        await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
        R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
        rec.tap = { at: rt2, why, presses: p + 1 };
        note(`throw cycle ${cycle + 1} tap ${p + 1} (${why})`);
        for (let w = 0; w < 4 && !threw; w++) { await sleep(150); threw = (await evCount('massline:throw')) > t0n; }
      }
    } else note(`throw cycle ${cycle + 1} tap skipped — the line ended while waiting`);
    await keyUp('KeyW');
    if (!R.screens.some((x) => x.label === 'release')) await shot('release', { gameplay: true });
    for (let i = 0; i < 12 && !threw; i++) { await sleep(250); threw = (await evCount('massline:throw')) > t0n; }
    const since = await evSince(mark);
    const all = await evSince(0);
    const end = since.find((e) => LINE_END.has(e.ev)) || [...all].reverse().find((e) => LINE_END.has(e.ev)) || null;
    rec.end = end; rec.threw = threw;
    note(`throw cycle ${cycle + 1} line end: ${JSON.stringify(end)} · ${threw ? 'THROW registered' : 'release did not register a throw; retrying'}`);
    if (threw) await shot('after-throw', { gameplay: true });
    R.throwCycles.push(rec);
  }
  step('throw', threw ? 'throw registered' : latchedEver ? 'latched but never threw' : 'never latched');

  // Keep fighting with basic input until round 3 or death (or the wall cap).
  let reachedR3At = null; let shopSeen = false; let lastFlightKey = '';
  const tEnd = wall0 + CAP_MS;
  while (Date.now() < tEnd) {
    const s = await trackScreen();
    if (!s) { await sleep(300); continue; }
    await gameplayShots();
    await answerConfirmQuiet();
    const top = s.top || '';
    if (/gameOver|results|ending|death/i.test(top)) { step('results', top); await releaseAll(); await sleep(1500); await shot('results-' + top, { final: true }); R.outcome = 'results screen: ' + top; return await swarmFinish(top); }
    if (top && !/pause/i.test(top)) {
      // a between-round shop / armory / draft screen
      await releaseAll();
      const btns = await readBtns();
      const launch = btns.find((b) => /^launch round/i.test(b.text)) || btns.find((b) => /(keep current loadout|^continue$|hold the line)/i.test(b.text));
      if (!shopSeen && /draft|shop|armory|fit/i.test(top + ' ' + btns.map((b) => b.text).join(' '))) {
        shopSeen = true; step('shop', `first between-round screen "${top}" after wall ${wallS()}s`);
        await sleep(1500); await shot('shop-open', { shop: true, controls: btns.map((b) => b.text).slice(0, 30) });
        // "open it": hover/click the first offer card if there is one, to see its detail; then continue
        const card = btns.find((b) => !/launch|browse|re-?roll|keep|skip|back|menu|esc/i.test(b.text) && b.y > 120);
        if (card) { await click(card.x, card.y); note(`inspected shop card "${card.text}"`); await sleep(900); await shot('shop-card', { shop: true }); }
      }
      if (launch) { await click(launch.x, launch.y); note(`click "${launch.text}"`); await sleep(1500); } else await sleep(800);
      continue;
    }
    if (s.run && s.run.wave >= 3 && reachedR3At == null && s.mode === 'flight' && !s.top) { reachedR3At = Date.now(); step('round3', `round ${s.run.wave} reached at wall ${wallS()}s`); }
    if (reachedR3At && Date.now() - reachedR3At > 25_000) { R.outcome = 'reached round 3 and fought 25 s'; break; }
    if (s.alive === false) { await sleep(1200); continue; }
    if (s.mode === 'flight' && !top) {
      const key = s.run ? `${s.run.wave}/${s.run.phase}` : ''; if (key !== lastFlightKey) { lastFlightKey = key; note(`run ${key} hp ${s.hp}`); }
      await steerFight();
    } else await sleep(300);
  }
  await releaseAll();
  if (!R.outcome) R.outcome = 'wall cap reached';
  // not dead: quit through pause -> main menu / end run
  await swarmFinish('quit');
}
async function answerConfirmQuiet() { const c = await readConfirm(); if (c) await answerConfirm(/^(ok|yes|confirm|continue|play)/i); }
async function steerFight() {
  await reassertKeys();
  const h = await hostilesQ(); if (!h || !h.near) { await keyUp('KeyW'); await setFire(false); await sleep(150); return; }
  const aim = await aimAt(...(await page.evaluate((id) => { const e = window.SF.state.entities.get(id); return e ? [e.pos.x, e.pos.z] : [0, 0]; }, h.near.id)));
  if (aim) { await page.mouse.move(aim.x, aim.y, { steps: 2 }); await yawToward(aim.rel); }
  if (h.near.dist > 260) await keyUp('KeyS'), await keyDown('KeyW'); else if (h.near.dist < 120) { await keyUp('KeyW'); await keyDown('KeyS'); } else { await keyUp('KeyW'); await keyUp('KeyS'); }
  await setFire(h.near.dist < 760);
  await sleep(110);
}
async function swarmFinish(how) {
  if (how === 'quit') {
    step('quit', 'Esc -> pause -> end run / main menu');
    await page.keyboard.press('Escape'); await sleep(1200); await trackScreen(true);
    const hit = await clickText(/^(end run|main menu)/i);
    if (hit) { await sleep(700); await answerConfirm(/^(end run|ok|yes|confirm|leave|main menu|continue)/i); }
    for (let i = 0; i < 30; i++) { await sleep(700); await answerConfirmQuiet(); const s = await trackScreen(); if (s && s.top && /gameOver|results|mainMenu/i.test(s.top)) break; }
    await sleep(1500); const s = await snap(); await shot('results-after-quit-' + (s && s.top || 'none'), { final: true });
    R.outcome = (R.outcome || '') + ` -> quit via pause, landed on ${s && s.top}`;
  }
  if (how !== 'quit') {
    // results: show every control then press the main-menu-ish path once so the screen after is recorded too
    const btns = await readBtns(); note('results controls: ' + btns.map((b) => b.text).join(' | '));
  }
}

// ---------------------------------------------------------------- ADVENTURE
async function chooseOpeningTool(action) {
  await page.waitForFunction(() => window.SF.state.input?.actions?.contextWheel !== true,
    null, { timeout: 5000 });
  await page.locator('#sf-context-wheel').waitFor({ state: 'hidden', timeout: 5000 });
  await page.keyboard.down('KeyQ');
  try {
    const face = page.locator(`#sf-context-wheel [data-action="${action}"] .sf-cwheel__face`);
    const box = await face.boundingBox({ timeout: 5000 });
    if (!box) throw new Error(`Context wheel did not show ${action}`);
    await click(box.x + box.width / 2, box.y + box.height / 2);
  } finally {
    await page.keyboard.up('KeyQ');
  }
}

async function armChartCourse(action, name) {
  const button = page.getByRole('button', { name: action, exact: true });
  const label = (await button.textContent({ timeout: 10000 })).trim();
  await TRAVEL_PUBLIC_HELPERS.clickPersistentButton(page, button);
  await page.waitForFunction((targetName) => {
    const autopilot = window.SF.state.nav?.autopilot;
    return autopilot?.active === true && autopilot.label === targetName;
  }, name, { timeout: 10000 });
  step('course', `${label} for ${name}`);
}

async function plotApproach(name) {
  await releaseAll();
  await page.keyboard.press('KeyN');
  await page.locator('[data-screen="galaxyMap"]').waitFor({ state: 'visible', timeout: 10000 });
  await TRAVEL_PUBLIC_HELPERS.searchAndSelect(page, name);
  // A tracked delivery can appear in search as its mission waypoint at the station.
  await armChartCourse(/^(Set|Track) Waypoint$/i, name);
}

async function readPaidFreightCheckpoint() {
  if (!RESUME_STORE || !argv.freight) return null;
  const path = join(RESUME_STORE, 'sf.save.quick.json');
  if (!existsSync(path)) return null;
  const decoded = await decodeSaveEnvelopeText(readFileSync(path, 'utf8'));
  if (!decoded.ok) throw new Error(`Could not open the captured Quick Save (${decoded.reason})`);
  const { data } = JSON.parse(decoded.text);
  const job = FIRST_TRADE_CONTRACT;
  const receipt = data?.missions?.receipts?.find((entry) => entry.source === job.source
    && entry.destStationId === job.destStationId && entry.outcome === 'completed');
  if (!receipt || data.world?.currentSectorId !== job.destSectorId) return null;
  if (receipt.rewardCr !== job.terms.paysCr) throw new Error('Captured freight receipt has an unexpected payout');
  return { receipt, credits: data.player.credits, cargo: data.cargo?.items?.[job.cargo.cmdtyId] || 0 };
}

async function continuePaidFreight({ receipt, credits, cargo }, timeout) {
  const job = FIRST_TRADE_CONTRACT;
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor({ state: 'visible', timeout: timeout(120000) });
  R.milestones.firstFreightContinueTitle = await continueButton.getAttribute('title');
  step('freight Continue offered', R.milestones.firstFreightContinueTitle || 'Continue');
  await page.evaluate(HOOK);
  const beforeLoad = await page.evaluate(() => performance.now());
  await continueButton.click({ timeout: timeout(30000) });
  await page.locator('[data-screen="mainMenu"]').waitFor({ state: 'hidden', timeout: timeout(90000) });
  // Continue can acknowledge the loaded slot while the game is still building the scene.
  // Judge its restored mission and hold after the first visible, playable snapshot.
  const picture = await page.waitForFunction((after) => {
    const state = window.SF?.state;
    const render = state?.render;
    const visible = (id) => {
      const element = document.getElementById(id);
      if (!element || element.hidden || !element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && Number(style.opacity) > 0.01;
    };
    if (state?.mode !== 'flight' || !Number.isFinite(render?.firstPlayableFrameAt)
      || render.firstPlayableFrameAt <= after || !(render.worldSubmittedFrames > 0)
      || visible('boot-overlay') || !visible('hud') || !visible('gl-canvas')) return false;
    return { firstPlayableFrameAt: render.firstPlayableFrameAt, worldDraws: render.worldSubmittedFrames,
      hasEnvironmentMap: !!render.envMap, sector: state.world.currentSectorId };
  }, beforeLoad, { timeout: timeout(240000) }).then((handle) => handle.jsonValue());
  R.milestones.firstFreightContinuePicture = picture;
  step('freight Continue picture', 'The loading screen cleared and Tethys flight was visible');
  const restored = await page.waitForFunction(({ id, sector, commodity }) => {
    const state = window.SF.state;
    const loaded = window.__dr.ev.find((event) => event.ev === 'save:loaded' && event.slot === 'quick');
    if (!loaded || state.world.currentSectorId !== sector) return false;
    const receipts = state.missions.receipts.filter((entry) => entry.missionId === id);
    return {
      loaded, receipts, active: state.missions.active.some((entry) => entry.id === id),
      credits: state.player.credits,
      cargo: state.player.cargo?.items?.[commodity] || 0,
    };
  }, { id: receipt.missionId, sector: job.destSectorId, commodity: job.cargo.cmdtyId },
  { timeout: timeout(20000) }).then((handle) => handle.jsonValue());
  if (restored.active || restored.receipts.length !== 1
    || restored.receipts[0].id !== receipt.id || restored.receipts[0].rewardCr !== receipt.rewardCr
    || restored.credits !== credits || restored.cargo !== cargo) {
    R.milestones.firstFreightContinueMismatch = { expected: { id: receipt.id, credits, cargo }, observed: restored };
    throw new Error('Continue did not retain the paid freight receipt, balance and hold');
  }
  R.milestones.firstFreightContinued = restored;
  step('freight continued', 'Title Continue restored the Tethys payment and hold');
  await shot('freight-continued', {});
}

function freightTimeout(deadline) {
  return (limit) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Adventure route exhausted its time budget during first freight');
    return Math.min(limit, remaining);
  };
}

async function deliverFirstFreight(deadline) {
  const job = FIRST_TRADE_CONTRACT;
  const timeout = freightTimeout(deadline);
  const eventCursor = () => page.evaluate(() => window.__dr.ev.length);
  const berthUiRequestedAt = performance.now();
  await page.locator('[data-nav="contracts"]').click({ timeout: timeout(20000) });
  R.milestones.heliosMissionsDelayMs = Math.round(performance.now() - berthUiRequestedAt);
  const row = page.locator('.sx-ct-row[data-mid]', { hasText: job.title });
  const offerId = await row.getAttribute('data-mid', { timeout: timeout(10000) });
  await row.click({ timeout: timeout(10000) });
  const accept = page.locator(`.sx-ct-commit[data-accept=${JSON.stringify(offerId)}]:not(:disabled)`);
  await page.evaluate((id) => {
    const stop = new AbortController();
    const pointer = [];
    window.__dr.freightHold = { stop, pointer };
    for (const type of ['pointerdown', 'pointerup', 'pointerleave', 'pointercancel']) {
      document.addEventListener(type, (event) => {
        const button = event.target?.closest?.('[data-accept]');
        if (button?.getAttribute('data-accept') !== id || pointer.length >= 16) return;
        pointer.push({ type, time: performance.now(), trusted: event.isTrusted,
          withinButton: event.relatedTarget instanceof Node && button.contains(event.relatedTarget) });
      }, { capture: true, signal: stop.signal });
    }
  }, offerId);
  let missionId;
  try {
    await accept.click({ delay: 1100, timeout: timeout(8000) });
    const accepted = await page.waitForFunction(({ source, commodity, qty }) => {
      const state = window.SF.state;
      const mission = state.missions.active.find((entry) => entry.source === source);
      const held = state.player?.cargo?.items?.[commodity] || 0;
      return mission?.params.sealedRemaining === qty && held >= qty ? mission.id : false;
    }, { source: job.source, commodity: job.cargo.cmdtyId, qty: job.cargo.qty }, { timeout: timeout(10000) });
    missionId = await accepted.jsonValue();
  } catch (error) {
    const attempt = await page.evaluate(() => ({ pointer: window.__dr.freightHold?.pointer,
      offers: [...document.querySelectorAll('.sx-ct-commit[data-accept]')].map(button => ({
        id: button.getAttribute('data-accept'), disabled: button.disabled,
      })), missionEvents: window.__dr.ev.filter(event => /^(mission:accepted|mission:acceptFailed|toast)$/.test(event.ev)).slice(-8),
    })).catch(() => null);
    note('Freight acceptance attempt: ' + JSON.stringify(attempt));
    throw error;
  } finally {
    await page.evaluate(() => window.__dr.freightHold?.stop.abort()).catch(() => {});
  }
  step('freight accepted', `${missionId} carries ${job.cargo.qty} sealed ${job.cargo.label}`);
  await shot('freight-accepted', {});

  const departFrom = await eventCursor();
  await page.locator('.sxb-launch').click({ timeout: timeout(8000) });
  const departure = page.locator('[data-pop-launch]');
  if (await departure.isVisible()) await departure.click({ timeout: timeout(8000) });
  const departureCourse = await page.waitForFunction((from) => {
    const state = window.SF.state;
    if (state.ui?.docked || state.mode !== 'flight'
      || !window.__dr.ev.slice(from).some((event) => event.ev === 'dock:undocked')) return false;
    return { tracked: state.ui?.trackedMissionId, waypoint: state.nav?.waypoint?.missionId };
  }, departFrom, { timeout: timeout(12000) }).then(handle => handle.jsonValue());
  if (departureCourse.tracked !== missionId || departureCourse.waypoint !== missionId) {
    throw new Error('Departure replaced the course for the freight selected at Helios');
  }
  step('freight tracked', 'The selected freight still owns the course after departure');
  await crossFirstFreight(missionId, timeout);
}

async function crossFirstFreight(missionId, timeout) {
  const job = FIRST_TRADE_CONTRACT;
  const eventCursor = () => page.evaluate(() => window.__dr.ev.length);
  const gateName = 'Gate → Tethys Junction';
  await plotApproach(gateName);
  const { searchAndSelect, clickPersistentButton } = TRAVEL_PUBLIC_HELPERS;
  let lastGateTrace = -Infinity;
  let stalled = null;
  let detoured = false;
  while (true) {
    const position = await page.evaluate((destination) => {
      const state = window.SF.state;
      const ship = state.entities.get(state.playerId);
      const gate = (state.entityIndex?.stations || state.entityList).find((entity) =>
        entity?.type === 'station' && entity.alive !== false && entity.data?.isGate && entity.data.gateTo === destination);
      const ap = state.nav?.autopilot;
      const dx = gate && ship ? gate.pos.x - ship.pos.x : null;
      const dz = gate && ship ? gate.pos.z - ship.pos.z : null;
      const distance = dx == null ? null : Math.hypot(dx, dz);
      const range = gate ? ((gate.data.dockRadius || gate.radius || 80) + (ship?.radius || 0)) * 1.5 + 28 : null;
      const rel = dx == null ? 0 : Math.atan2(dz, dx) - ship.rot;
      return {
        sim: state.simTime, mode: state.mode, screens: state.ui?.screenStack || [],
        alive: ship?.alive !== false && ship?.hull > 0,
        speed: ship ? Math.hypot(ship.vel.x, ship.vel.z) : null,
        pos: ship?.pos, distance, range, side: Math.sin(rel) >= 0 ? 'KeyA' : 'KeyD',
        gateId: gate?.id ?? null, credits: state.player?.credits,
        ap: ap ? { active: ap.active, status: ap.status, label: ap.label,
          entityId: ap.targetEntityId, target: ap.target } : null,
      };
    }, job.destSectorId);
    if (!position.alive) throw new Error('Pilot died during the Tethys gate approach');
    if (position.distance != null && position.distance <= position.range) break;
    if (Date.now() - lastGateTrace >= 5000) {
      lastGateTrace = Date.now();
      note(`Freight gate approach ${JSON.stringify(position)}`);
    }
    const canDetour = !detoured && position.mode === 'flight' && position.screens.length === 0
      && position.distance > Math.max(400, position.range * 2) && position.speed < 6;
    if (!canDetour) stalled = null;
    else if (!stalled || Math.hypot(position.pos.x - stalled.pos.x, position.pos.z - stalled.pos.z) > 32) {
      stalled = position;
    } else if (position.sim - stalled.sim >= 10) {
      detoured = true;
      R.milestones.freightGateStall = await readApproachStall();
      step('freight gate detour', `Reversing and turning ${position.side === 'KeyA' ? 'left' : 'right'} with the gate ${Math.round(position.distance)} WU away`);
      await page.keyboard.press('KeyS', { delay: timeout(1400) });
      await page.keyboard.press(position.side, { delay: timeout(450) });
      await page.keyboard.press('KeyW', { delay: timeout(1600) });
      await plotApproach(gateName);
    }
    await sleep(timeout(250));
  }
  await page.keyboard.press('KeyM');
  await page.locator('[data-screen="galaxyMap"]').waitFor({ state: 'visible', timeout: timeout(10000) });
  await searchAndSelect(page, 'Tethys Junction', /sector/i);
  const jumpFrom = await eventCursor();
  await clickPersistentButton(page, page.getByRole('button', { name: /Set Course & Jump|^Jump$/i }).first());
  const crossing = await page.waitForFunction(({ from, target }) => {
    const events = window.__dr.ev.slice(from);
    const refusal = events.find((event) => event.ev === 'jump:chargeAbort');
    if (refusal) return { refusal };
    const state = window.SF.state;
    if (state.world.currentSectorId !== target || state.mode !== 'flight'
      || ['CHARGING', 'JUMPING'].includes(state.jump?.state)) return false;
    const charge = events.find((event) => event.ev === 'jump:chargeStart' && event.targetSectorId === target);
    const toll = events.find((event) => event.ev === 'credits:changed' && event.reason === 'gate_toll' && event.delta < 0);
    const arrival = events.find((event) => event.ev === 'jump:arrive' && event.targetSectorId === target);
    return charge?.via === 'gate' && toll && arrival ? { charge, toll, arrival } : false;
  }, { from: jumpFrom, target: job.destSectorId }, { timeout: timeout(60000) }).then((handle) => handle.jsonValue());
  if (crossing.refusal) {
    const { refusal } = crossing;
    const explanation = await page.evaluate(() => window.__dr.text
      .findLast((line) => /jump|toll/i.test(line.text))?.text ?? null);
    R.milestones.firstFreightJumpRefused = { ...refusal, explanation };
    step('freight jump refused', explanation || refusal.reason);
    throw new Error(refusal.reason === 'credits'
      ? `Tethys gate requires ${refusal.creditsNeeded} credits. The pilot has ${refusal.creditsHeld}.`
      : `Tethys gate refused the jump (${refusal.reason}): ${explanation || 'see the jump receipt'}`);
  }
  R.milestones.firstFreightCrossing = crossing;
  step('freight arrived', 'Tethys Junction');
  await deliverAtTethys(missionId, timeout);
}

async function deliverAtTethys(missionId, timeout) {
  const job = FIRST_TRADE_CONTRACT;
  const eventCursor = () => page.evaluate(() => window.__dr.ev.length);
  await plotApproach('Tethys Trade Hub');
  await page.waitForFunction((stationId) => {
    const offer = window.__dr.ev.findLast((event) => event.ev === 'dock:range');
    return offer?.stationId === stationId && offer.inRange;
  }, job.destStationId, { timeout: timeout(120000) });
  const dockFrom = await eventCursor();
  await page.keyboard.press('KeyE');
  const paid = await page.waitForFunction(({ from, id, stationId }) => {
    const state = window.SF.state;
    if (state.ui?.dockedStationId !== stationId || state.missions.active.some((entry) => entry.id === id)) return false;
    const receipt = state.missions.receipts.find((row) => row.missionId === id && row.outcome === 'completed');
    const events = window.__dr.ev.slice(from);
    const delivery = events.find((event) => event.ev === 'cargo:delivered' && event.missionId === id);
    const posting = events.find((event) => event.ev === 'credits:changed' && event.reason === `mission:${id}`);
    return receipt && delivery && posting ? { receipt, delivery, posting } : false;
  }, { from: dockFrom, id: missionId, stationId: job.destStationId }, { timeout: timeout(12000) });
  const { receipt, delivery, posting } = await paid.jsonValue();
  if (receipt.rewardCr !== job.terms.paysCr || posting.delta !== job.terms.paysCr
    || delivery.stationId !== job.destStationId || delivery.commodityId !== job.cargo.cmdtyId
    || delivery.qty !== job.cargo.qty) throw new Error('Freight delivery or ledger posting did not match the signed job');
  R.milestones.firstFreight = receipt;
  R.milestones.firstFreightPosting = { delivery, posting };
  step('freight paid', `${receipt.rewardCr} credits at Tethys Trade Hub`);
  await shot('freight-paid', {});

  const beforeSave = await page.evaluate((commodity) => ({
    credits: window.SF.state.player.credits,
    cargo: window.SF.state.player.cargo?.items?.[commodity] || 0,
  }), job.cargo.cmdtyId);
  const saveFrom = await eventCursor();
  await page.keyboard.press('F5');
  const saved = await page.waitForFunction((from) => window.__dr.ev.slice(from).find((event) =>
    event.slot === 'quick' && ['save:completed', 'save:error'].includes(event.ev)),
  saveFrom, { timeout: timeout(15000) }).then((handle) => handle.jsonValue());
  if (saved.ev !== 'save:completed') throw new Error(`Paid freight quick save failed: ${saved.reason}`);
  await collect();
  R.milestones.firstFreightSaved = saved;
  step('freight saved', 'Quick Save recorded the paid delivery');
  R.outcome = 'first freight paid and quick-saved';

  await page.reload({ waitUntil: 'commit' });
  await continuePaidFreight({ receipt, ...beforeSave }, timeout);
}

const advState = () => page.evaluate(async () => {
  const s = window.SF.state; const me = s.entities.get(s.playerId); const wp = s.nav && s.nav.waypoint;
  const sm = window.SF.ctx && window.SF.ctx.screenManager;
  let waypointPos = wp?.pos;
  if (wp?.markerId === 'onboarding:seam' || wp?.label === '47-A Recovery Site') {
    const { resolveWaypointPresentationPosition } = await import('/src/ui/navigationWaypoint.js');
    waypointPos = resolveWaypointPresentationPosition(s, wp);
  }
  let tgt = null;
  if (wp && wp.targetEntityId != null) { const e = s.entities.get(wp.targetEntityId); if (e) tgt = { id: e.id, type: e.type, pos: [e.pos.x, e.pos.z], name: e.name || e.defId || (e.data && e.data.name) }; }
  if (!tgt && wp && wp.pos && wp.kind === 'mission') { // a marker with no bound entity: the body sitting on it (the sample rock), not passing traffic
    let best = null;
    for (const e of s.entityList || []) {
      if (!e || e.alive === false || e.isPlayer || e.type === 'ship' || e.type === 'station' || e.type === 'projectile') continue;
      const d = Math.hypot(e.pos.x - wp.pos.x, e.pos.z - wp.pos.z); if (d > 220) continue;
      const score = d - (/aster|rock|ore|sample|wreck|derelict/i.test(`${e.type} ${e.defId || ''} ${e.name || ''}`) ? 60 : 0) - (e.mass > 40 ? 20 : 0);
      if (!best || score < best.score) best = { score, id: e.id, type: e.type, pos: [e.pos.x, e.pos.z], name: e.name || e.defId || (e.data && e.data.name), d: Math.round(d) };
    }
    if (best) tgt = best;
  }
  const tracked = s.ui && s.ui.trackedMissionId; const m = tracked && (s.missions && s.missions.active || []).find((x) => x.id === tracked);
  const learner = (s.entityList || []).find((e) => e?.alive !== false && e?.data?.rescueRole === 'rock');
  const openingRock = learner?.pos ? { id: learner.id, pos: [learner.pos.x, learner.pos.z] } : null;
  const tetherTargetId = s.player?.tether?.active ? s.player.tether.targetId : null;
  const sampleRecovered = (s.missions?.active || []).some((job) =>
    job.params?.contractId === '47-A' && job.params.sampleRecovered === true);
  const offer = window.__dr.ev.findLast((event) => event.ev === 'dock:range');
  let raid = null;
  if (wp?.markerId === 'onboarding:raid') {
    const cast = s.onboarding?.raid?.ids;
    const raider = s.entities.get(cast?.raider);
    const rock = s.entities.get(cast?.throwRock);
    if (raider?.pos && raider.alive !== false && raider.data?.onboardingRaid === true
      && rock?.pos && rock.alive !== false && rock.data?.raidRole === 'throwRock') {
      raid = { targetId: raider.id, targetPos: [raider.pos.x, raider.pos.z], rockId: rock.id,
        rockPos: [rock.pos.x, rock.pos.z] };
    }
  }
  const stations = [];
  for (const e of s.entityList || []) if (e && e.alive !== false && e.type === 'station') stations.push({ id: e.id, name: e.name || e.data?.name || e.data?.stationName || e.defId, d: Math.round(me ? Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z) : 0) });
  stations.sort((a, b) => a.d - b.d);
  return { mode: s.mode, top: sm && sm.top ? sm.top() : null, sim: +(+s.simTime).toFixed(1), pos: me ? [me.pos.x, me.pos.z] : null, speed: me && me.vel ? Math.round(Math.hypot(me.vel.x, me.vel.z)) : null, vel: me && me.vel ? [me.vel.x, me.vel.z] : null,
    wp: wp ? { kind: wp.kind, label: wp.label, markerId: wp.markerId, pos: waypointPos && [waypointPos.x, waypointPos.z], tid: wp.targetEntityId, sectorId: wp.sectorId, onboarding: !!wp.onboarding } : null, tgt, raid,
    tetherTargetId, openingRock, sampleRecovered, mineOn: s.input?.actions?.aimedMine === true,
    raidWithdrew: s.onboarding?.raid?.pilotWithdrew === true,
    autopilot: s.nav?.autopilot?.active === true,
    beamRange: (me?.data?.miningBeam || s.player?.miningBeam)?.range,
    steeringView: s.settings?.gameplay?.steeringView,
    mission: m ? { id: m.id, title: m.title || m.name, status: m.status, obj: (m.objectives || []).map((o) => o && (o.text || o.label || o.type)).slice(0, 3) } : null,
    nearStation: stations[0] || null, sector: s.world && s.world.currentSectorId,
    docked: s.mode === 'docked' || s.mode === 'station' || s.ui?.docked === true,
    dockStationId: s.ui?.dockedStationId ?? null, dockOfferId: offer?.inRange ? offer.stationId : null,
    objText: (() => { const hud = document.getElementById('hud'); if (!hud) return ''; const w = document.createTreeWalker(hud, NodeFilter.SHOW_ELEMENT); let n; while ((n = w.nextNode())) { const t = n.children.length === 0 ? (n.textContent || '').trim() : ''; if (/^ACT\s+[IVX]+/i.test(t)) { const card = n.parentElement && n.parentElement.parentElement; return (card ? card.innerText : t).replace(/\s+/g, ' ').slice(0, 260); } } return ''; })() };
}).catch(() => null);

async function readApproachStall() {
  return page.evaluate(async () => {
    const { forEachDressingRow } = await import('/src/world/dressingTable.js');
    const { state, helpers } = window.SF;
    const pilot = state.entities.get(state.playerId);
    if (!pilot?.pos) return null;
    const nearby = [];
    const observe = (body, kind) => {
      if (!body?.pos || body.id === pilot.id || body.alive === false) return;
      const distance = Math.hypot(body.pos.x - pilot.pos.x, body.pos.z - pilot.pos.z);
      if (distance > 350) return;
      nearby.push({ id: body.id, generation: body.occupantGeneration, name: body.name || body.data?.name,
        kind, pos: body.pos, rotation: body.rot, radius: body.radius, distance });
    };
    for (const body of state.entityList) observe(body, body?.type);
    forEachDressingRow(state, (row) => { if (row.collides) observe(row, 'dressing'); });
    const ap = state.nav?.autopilot;
    const impact = window.__dr.lastPlayerImpact;
    const contacts = helpers?.combatPhysics?.sampleSolidContacts?.(pilot.id);
    return { sim: state.simTime, pos: pilot.pos, rotation: pilot.rot, velocity: pilot.vel,
      brake: state.input?.actions?.brake === true,
      autopilot: ap && { active: ap.active, status: ap.status, target: ap.target, label: ap.label,
        avoidanceSide: ap._avoidanceSide ?? null },
      lastImpact: impact && state.simTime - impact.sim <= 12 ? impact : null,
      contacts: contacts?.slice(0, 8).map((contact) => ({ id: contact.targetId,
        generation: contact.targetLife, primitive: contact.targetPrimitiveId, normal: contact.normal })) ?? null,
      nearby: nearby.sort((a, b) => a.distance - b.distance).slice(0, 10) };
  });
}

async function throwRaider(raid, attempt, deadline) {
  const mark = await page.evaluate(() => window.__dr.ev.length);
  const [rockX, rockZ] = raid.rockPos;
  const dx = rockX - raid.targetPos[0], dz = rockZ - raid.targetPos[1];
  const distance = Math.hypot(dx, dz);
  if (distance < 1) return;
  const side = attempt % 2 === 1 ? -1 : 1;
  // Pass outside the marked rock while the held hull trails inside the turn.
  const exitX = rockX + (dx * 100 - dz * 92 * side) / distance;
  const exitZ = rockZ + (dz * 100 + dx * 92 * side) / distance;
  const swingUntil = Math.min(deadline, Date.now() + 11000);
  let cue = null;
  let aimed = false;
  let pressed = false;
  let pressReceipt = null;
  let pressMark = null;
  await releaseAll();
  try {
    while (Date.now() < swingUntil) {
      const aim = await scrOfQ(raid.rockId);
      aimed = !!(aim?.on && aim.x > 40 && aim.x < VW - 40 && aim.y > 40 && aim.y < VH - 40);
      if (aimed) await page.mouse.move(aim.x, aim.y);
      cue = await readThrowCue();
      if (cue.tetherTarget !== raid.targetId || !cue.tetherActive || !cue.throwable) break;
      if (aimed && cue.aimTarget === raid.rockId && cue.cueLit) {
        pressMark = await page.evaluate(() => window.__dr.watchRaiderPress()).catch(() => null);
        try {
          await page.mouse.down({ button: 'right' });
          try { await sleep(120); } finally { await page.mouse.up({ button: 'right' }); }
        } finally {
          pressReceipt = await page.evaluate(() => window.__dr.takeRaiderPress()).catch(() => null);
        }
        pressed = true;
        R.clicks++;
        await page.evaluate(() => { window.__dr.clicks++; });
        if (argv['raid-checkpoint']) {
          const cueText = 'Raider released. Watch the marked rock.';
          const watch = await page.evaluate(async (line) => {
            const rows = [];
            const stop = performance.now() + 1800;
            do {
              const state = window.SF.state;
              const objective = [...document.querySelectorAll('.sf-mission-tracker .sf-mt-obj, .sf-mission-tracker .sf-mt-compact-action')]
                .find(node => node.getClientRects().length > 0)?.innerText || '';
              const reason = state.nav.waypoint?.reason;
              if (rows.at(-1)?.objective !== objective || rows.at(-1)?.reason !== reason) {
                rows.push({ tick: state.tick, objective, reason });
              }
              if (objective.includes(line)) return { visible: true, rows };
              await new Promise(requestAnimationFrame);
            } while (performance.now() < stop);
            return { visible: false, rows };
          }, cueText);
          R.milestones.raidWatchedRock = watch.visible ? cueText : null;
          R.milestones.raidObjectiveWatch = watch.rows;
        }
        break;
      }
      const pass = await aimAt(exitX, exitZ);
      if (!pass) break;
      const hold = async (key, enabled) => (enabled ? keyDown(key) : keyUp(key));
      await hold('KeyA', pass.rel < -0.19);
      await hold('KeyD', pass.rel > 0.19);
      await hold('KeyW', Math.abs(pass.rel) < 0.62 && pass.speed < 105);
      await sleep(30);
    }
  } finally {
    await releaseAll();
  }
  await sleep(700);
  const { events, pressEvents, throwObserved } = await page.evaluate(({ start, pressStart, targetId, attachmentId }) => {
    const events = window.__dr.ev;
    const pressEvents = pressStart == null ? [] : events.slice(pressStart).filter((e) =>
      /^(massline:throw|massline:releaseCancelled|tether:broken)$/.test(e.ev) && e.id === targetId
      && (attachmentId == null || e.attachmentId == null || e.attachmentId === attachmentId));
    return {
      events: events.slice(start).filter((e) =>
        /^(massline:throw|massline:releaseValidated|physics:impact|tether:whipImpact|tether:broke|tether:broken|entity:killed)$/.test(e.ev)),
      pressEvents: pressEvents.slice(0, 4),
      throwObserved: pressEvents.some((e) => e.ev === 'massline:throw'),
    };
  }, { start: mark, pressStart: pressReceipt?.eventIndex ?? pressMark,
    targetId: raid.targetId, attachmentId: pressReceipt?.line?.attachmentId });
  const rmb = pressed ? { dom: pressReceipt, ownerEvents: pressEvents,
    outcome: throwObserved ? 'throw-observed'
      : pressEvents.length ? 'owner-event-without-throw'
        : !pressReceipt ? 'no-dom-witness' : pressReceipt.canvas ? 'canvas-press-without-owner-event' : 'off-canvas-press' } : undefined;
  note(`Raider ${pressed ? `throw attempt ${attempt}` : 'reposition'}: ${JSON.stringify({ cue, aimed, events: events.slice(-8), rmb })}`);
  if (!R.milestones.raiderThrow) {
    const release = events.find((event) => event.ev === 'massline:throw' && event.id === raid.targetId);
    if (release) {
      R.milestones.raiderThrow = release;
      await shot('after-raider-throw', { gameplay: true });
    }
  }
}

async function raidCheckpoint() {
  const a = await advState();
  if (!a?.raid || a.tetherTargetId !== a.raid.targetId) throw new Error('Continue must restore a held Raider and marked rock');
  const before = await readThrowCue();
  if (before.restLength < 84) {
    await keyDown('KeyF');
    await keyDown('KeyS');
    try {
      await page.waitForFunction(() => window.SF.state.player.tether.restLength >= 84, null, { timeout: 4000 });
    } finally {
      await keyUp('KeyS');
      await keyUp('KeyF');
    }
  }
  step('maneuver', `Paid out the Raider line to ${Math.round((await readThrowCue()).restLength)} WU`);
  const start = await page.evaluate(() => window.__dr.ev.length);
  await throwRaider(a.raid, 1, wall0 + CAP_MS);
  const receipt = await page.waitForFunction(({ start, id, rock }) => {
    const s = window.SF.state;
    const impact = window.__dr.ev.slice(start).find(row => row.ev === 'tether:whipImpact'
      && row.targetId === id && row.victim === rock && /^(solid|crushing)$/.test(row.rating));
    return s.onboarding.beatDoneAt?.raid != null && impact ? impact : null;
  }, { start, id: a.raid.targetId, rock: a.raid.rockId }, { timeout: 7500 });
  R.milestones.raiderImpact = await receipt.jsonValue();
  await receipt.dispose();
  if (!R.milestones.raiderThrow) throw new Error('The solid impact did not have a matching RMB throw receipt');
  const saveFrom = await page.evaluate(() => window.__dr.ev.length);
  await page.keyboard.press('F5');
  await page.waitForFunction(from => window.__dr.ev.slice(from).some(event => event.ev === 'save:completed'
    && event.slot === 'quick' && event.ok), saveFrom, { timeout: 8000 });
  await shot('raid-contact-and-save', { gameplay: true });
  step('checkpoint', 'The Raid recorded a solid rock impact and Quick Save');
  if (!R.milestones.raidWatchedRock) throw new Error('The Raid did not show the marked-rock instruction while the Raider was in flight');
  R.milestones.raidCheckpointPassed = true;
  R.outcome = 'Continued the held Raider, threw it into the marked rock, and saved';
}

async function adventureRoute() {
  await bootToTitle();
  await setZero();
  const paidCheckpoint = await readPaidFreightCheckpoint();
  if (paidCheckpoint) {
    await continuePaidFreight(paidCheckpoint, (limit) => Math.max(1, Math.min(limit, wall0 + CAP_MS - Date.now())));
    R.outcome = 'continued from the paid first-freight Quick Save';
    return;
  }
  if (RESUME_STORE) {
    step('click', 'title: Continue');
    await page.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 30000 });
  } else {
    step('click', 'title: New Game');
    await pressNewGame(page);
    if (ADVENTURE_SEED != null) await page.locator('#sf-ng-seed').fill(String(ADVENTURE_SEED), { timeout: 30000 });
  }
  // New Game screen(s) -> defaults -> LAUNCH
  const tPre = Date.now(); let flying = false;
  let retriedStartup = false;
  const startupFailurePane = page.locator('#boot-overlay [data-startup-failure="true"]');
  while (Date.now() < Math.min(tPre + 300_000, wall0 + CAP_MS)) {
    await answerConfirm(/^(play|ok|yes|confirm|continue)/i);
    const s = await trackScreen();
    if (s && s.mode === 'flight' && !s.top) { flying = true; break; }
    if (await startupFailurePane.isVisible()) {
      const failure = await readStartupFailure(page) || 'Startup could not finish';
      step('startup failure', failure);
      const leaf = await page.evaluate(() => window.SF?.state?.render?.openingPlanCaptureFailure?.uncoveredProgramLeaf ?? null);
      if (leaf) note('Uncovered opening draw leaf: ' + JSON.stringify(leaf));
      if (retriedStartup) throw new Error(failure);
      retriedStartup = true;
      const failedPane = await startupFailurePane.elementHandle();
      await startupFailurePane.getByRole('button', { name: 'Retry', exact: true }).click({ timeout: 10000 });
      step('startup retry', 'Pressed Retry on the loading screen');
      await failedPane?.waitForElementState('hidden', { timeout: 15000 });
      await failedPane?.dispose();
      continue;
    }
    const btns = await readBtns();
    const hit = btns.find((b) => /^(launch|start|begin|take off|set out|continue)\b/i.test(b.text)) || btns.find((b) => /launch/i.test(b.text));
    if (hit) { await click(hit.x, hit.y); note(`click "${hit.text}" on ${s && s.top}`); await sleep(1500); } else await sleep(800);
  }
  step('flight', flying ? 'in flight' : 'NEVER REACHED FLIGHT');
  if (!flying) { R.outcome = 'never reached flight'; return; }
  R.adventureSeed = await page.evaluate(() => window.SF.state.meta?.seed ?? null);
  if (ADVENTURE_SEED != null && R.adventureSeed !== ADVENTURE_SEED) {
    throw new Error(`Adventure launched seed ${R.adventureSeed} instead of ${ADVENTURE_SEED}`);
  }
  if (argv['raid-checkpoint']) {
    await page.locator('#gl-canvas').focus();
    await page.waitForFunction(() => window.SF.state.nav?.waypoint?.label === 'Throw target', null, { timeout: 8000 });
    await raidCheckpoint();
    return;
  }
  await sleep(1500);
  R.quality_atFlight = await qualityInfo();
  await shot('flight-start', { gameplay: true });
  await page.locator('#gl-canvas').focus();

  if (RESUME_STORE && argv.freight) {
    const restored = await page.evaluate(({ source, cargo }) => {
      const state = window.SF.state;
      const mission = state.missions.active.find((entry) => entry.source === source);
      const held = state.player.cargo?.items?.[cargo.cmdtyId] || 0;
      if (mission?.params.sealedRemaining !== cargo.qty || held < cargo.qty) return null;
      return { missionId: mission.id, sectorId: state.world.currentSectorId, sealed: cargo.qty,
        credits: state.player.credits, tracked: state.ui?.trackedMissionId, waypoint: state.nav?.waypoint?.missionId };
    }, FIRST_TRADE_CONTRACT);
    const timeout = freightTimeout(wall0 + CAP_MS);
    if (restored?.sectorId === FIRST_TRADE_CONTRACT.destSectorId) {
      R.milestones.firstFreightArrivalRestored = restored;
      step('freight arrival restored', restored.missionId + ' still carries ' + restored.sealed + ' sealed Fuel Cells in Tethys');
      await deliverAtTethys(restored.missionId, timeout);
      R.outcome = 'continued the earned Tethys arrival and delivered first freight';
      return;
    }
    if (restored?.sectorId === 'sector_helios_prime') {
      R.milestones.firstFreightDepartureRestored = restored;
      if (restored.tracked !== restored.missionId || restored.waypoint !== restored.missionId) {
        throw new Error('Continue lost the tracked first-freight course in Helios');
      }
      step('freight departure restored', restored.missionId + ' still carries ' + restored.sealed + ' sealed Fuel Cells in Helios');
      await crossFirstFreight(restored.missionId, timeout);
      R.outcome = 'continued the signed Helios freight and delivered it to Tethys';
      return;
    }
  }

  const tEnd = wall0 + CAP_MS; const advThrow = { done: false, tries: 0 }; let phase = 'seek'; let lastLog = 0; let latchTries = 0; let lastLatchTry = 0; let docked = false; let dockedAt = null; let lastE = 0;
  const trail = []; let lastWpKey = ''; let undocked = false; let sawMarketTab = false; let sawMissionsTab = false;
  let raiderLatchTries = 0; let lastRaiderAction = 0; let raiderSwings = 0;
  let lastBeamAttempt = 0; let lastScanSim = -Infinity; let scanAttempts = 0;
  let firstBerthCourse = false; let preparedSampleApproach = false;
  let berthStationary = null;
  let seamBrake = false; let changedSeamView = false;
  let lostSeamSince = null;
  let missingWorkCueSince = null;
  while (Date.now() < tEnd) {
    if (page.isClosed()) throw new Error('The test browser closed during Adventure');
    const s = await trackScreen(); await gameplayShots();
    await answerConfirmQuiet();
    const a = await advState(); if (!a) { await sleep(300); continue; }
    if (Date.now() - lastLog > 5000) { lastLog = Date.now(); const line = `${phase} sim ${a.sim} wp=${a.wp ? a.wp.label + '@' + a.wp.pos : 'none'} tgt=${a.tgt ? a.tgt.type : '-'} speed ${a.speed} top=${a.top || '-'} tetherTarget=${a.tetherTargetId ?? '-'} st=${a.nearStation ? a.nearStation.name + ':' + a.nearStation.d : '-'}`; note(line); trail.push({ t: wallS(), line }); }
    if (a.objText && a.objText !== nav.lastObjText) { nav.lastObjText = a.objText; step('objective-card', a.objText); }
    const wpKey = a.wp ? `${a.wp.label}|${a.wp.kind}` : ''; if (wpKey !== lastWpKey) { lastWpKey = wpKey; step('objective', a.wp ? `${a.wp.label} (${a.wp.kind}) ${a.tgt ? a.tgt.type : ''}` : 'none'); }

    if (a.sampleRecovered && !R.milestones.sampleRecovered) {
      R.milestones.sampleRecovered = { time: wallS(), sim: a.sim };
      step('sample', '47-A manifest shows the assay recovered');
      if (a.mode === 'flight') {
        if (R.milestones.scannedRock) {
          const saveFrom = await page.evaluate(() => window.__dr.ev.length);
          await page.keyboard.press('F5');
          await page.waitForFunction((from) => window.__dr.ev.slice(from).some((event) =>
            event.ev === 'save:completed' && event.slot === 'quick'), saveFrom, { timeout: 4000 })
            .then(() => step('checkpoint', 'Quick save retained the recovered 47-A sample'))
            .catch(() => note('Quick-save receipt not visible within four seconds'));
        }
        if (a.mineOn) await chooseOpeningTool('aimedMine');
        if (seamBrake) {
          await chooseOpeningTool('brake');
          seamBrake = false;
        }
      }
    }
    if (a.top === 'gameOver' || a.top === 'mainMenu') {
      R.outcome = `Adventure stopped at ${a.top} during ${phase}`;
      break;
    }
    if (a.docked || (a.top && /station|dock|market|hub/i.test(a.top) && !/pause/.test(a.top))) {
      await releaseAll();
      if (!docked) { docked = true; dockedAt = wallS(); step('docked', `${a.top} at ${a.dockStationId || a.nearStation?.name}`); await sleep(1500); }
      if (argv.freight && a.dockStationId === FIRST_TRADE_CONTRACT.stationId) {
        await deliverFirstFreight(tEnd);
        R.outcome = `${R.milestones.sampleRecovered ? '47-A recovered, ' : ''}docked at Helios and delivered first freight to Tethys`;
        break;
      }
      const btns = await readBtns();
      if (!sawMarketTab) { const m = btns.find((b) => /^market\b/i.test(b.text)); if (m) { await click(m.x, m.y); sawMarketTab = true; await sleep(1500); await shot('station-market', { controls: (await readBtns()).map((b) => b.text).slice(0, 30) }); continue; } }
      if (!sawMissionsTab) { const m = btns.find((b) => /^missions?\b/i.test(b.text)); if (m) { await click(m.x, m.y); sawMissionsTab = true; await sleep(1500); await shot('station-missions', { controls: (await readBtns()).map((b) => b.text).slice(0, 30) }); continue; } }
      if ((sawMarketTab || !btns.some((b) => /^market\b/i.test(b.text))) && (sawMissionsTab || !btns.some((b) => /^missions?\b/i.test(b.text)))) {
        const u = btns.find((b) => /^(undock|launch|depart|leave)/i.test(b.text));
        if (u) { await click(u.x, u.y); step('undock', `"${u.text}"`); await sleep(2500); undocked = true; R.outcome = 'docked at Helios, opened Market and Missions, undocked'; break; }
        note('no undock control seen: ' + btns.map((b) => b.text).join(' | ')); await page.keyboard.press('Escape'); await sleep(800);
      }
      await sleep(500); continue;
    }
    if (a.top && !/pause/i.test(a.top)) { // some other screen (tutorial card, log, results) in our way
      const btns = await readBtns(); const c = btns.find((b) => /^(continue|ok|got it|close|skip|resume|dismiss|accept|next)/i.test(b.text));
      if (c) { await click(c.x, c.y); note(`dismissed screen ${a.top} via "${c.text}"`); } else { await page.keyboard.press('Escape'); }
      await sleep(900); continue;
    }
    if (a.mode !== 'flight') { await sleep(400); continue; }

    if (a.sampleRecovered && a.dockOfferId === 'station_helios' && Date.now() - lastE > 2000) {
      lastE = Date.now();
      await releaseAll();
      await page.keyboard.press('KeyE');
      await sleep(600);
      continue;
    }
    if (a.sampleRecovered && !firstBerthCourse) {
      phase = 'dock';
      await plotApproach('Helios Station');
      firstBerthCourse = true;
      continue;
    }
    if (firstBerthCourse) {
      if (a.pos && a.speed < 6 && a.nearStation?.d > 240 && !R.milestones.berthStall) {
        if (!berthStationary || Math.hypot(a.pos[0] - berthStationary.pos[0], a.pos[1] - berthStationary.pos[1]) > 8) {
          berthStationary = a;
        } else if (a.sim - berthStationary.sim >= 10) {
          R.milestones.berthStall = await readApproachStall();
          note('Berth approach held position: ' + JSON.stringify(R.milestones.berthStall));
        }
      } else berthStationary = null;
      await sleep(250);
      continue;
    }

    // choose a destination: the tracked objective's marker; else nearest station
    let tx = null, tz = null, kind = 'none';
    const isRaid = a.wp?.markerId === 'onboarding:raid';
    const isClaimed = a.wp?.markerId === 'onboarding:claimed';
    const isSeam = a.wp?.markerId === 'onboarding:seam' || /^(47-A Recovery Site|Bright Seam)$/.test(a.wp?.label || '');
    const towingRaider = !!(isRaid && a.raid && a.tetherTargetId === a.raid.targetId);
    const leavingRaid = argv['raid-withdrawal'] === true && isRaid && a.raid && a.pos;
    const towingOpeningRock = a.wp?.markerId === 'rescue:swing' && a.openingRock && a.tetherTargetId === a.openingRock.id;
    if (leavingRaid && towingRaider) {
      await releaseAll();
      await page.keyboard.press('KeyF', { delay: 80 });
      await sleep(350);
      continue;
    }
    if (isSeam && a.raidWithdrew && !R.milestones.raidWithdrew) {
      R.milestones.raidWithdrew = { sim: a.sim, tetherTargetId: a.tetherTargetId, objective: a.objText };
      step('raid', 'Flew clear and returned to the mining job');
      await shot('after-raid-withdrawal', { gameplay: true });
    }
    if (a.tetherTargetId != null && (isSeam || /Release the current line\./.test(a.objText || ''))) {
      await releaseAll();
      await page.keyboard.press('KeyF', { delay: 80 });
      await sleep(350);
      continue;
    }
    if (isSeam && !preparedSampleApproach) {
      phase = 'scan-and-mine';
      preparedSampleApproach = true;
      const distance = a.pos && a.wp.pos ? Math.hypot(a.wp.pos[0] - a.pos[0], a.wp.pos[1] - a.pos[1]) : Infinity;
      if (distance >= 210) {
        await releaseAll();
        if (a.nearStation?.d < 150 && a.speed < 12 && a.pos) {
          await page.keyboard.press('KeyS', { delay: 1200 });
          const after = await advState();
          if (after?.pos) {
            const moved = Math.hypot(after.pos[0] - a.pos[0], after.pos[1] - a.pos[1]);
            step('maneuver', `Reverse moved the hull ${Math.round(moved)} WU`);
          }
        }
        await page.keyboard.press('KeyM');
        const chart = page.locator('[data-screen="galaxyMap"]');
        await chart.getByRole('button', { name: /^Inspect 47-A Recovery Site\b/i }).click({ timeout: 10000 });
        await armChartCourse('Track Waypoint', '47-A Recovery Site');
      }
      continue;
    }
    if (isClaimed && a.pos && a.wp.pos) {
      const [x, z] = a.pos;
      const [cargoX, cargoZ] = a.wp.pos;
      tx = x + (x - cargoX) * 4;
      tz = z + (z - cargoZ) * 4;
      kind = 'waypoint';
      if (!R.milestones.claimedDeparture) {
        if (argv.freight) {
          await releaseAll();
          const saveFrom = await page.evaluate(() => window.__dr.ev.length);
          await page.keyboard.press('F5');
          await page.waitForFunction((from) => window.__dr.ev.slice(from).some((event) =>
            event.ev === 'save:completed' && event.slot === 'quick'), saveFrom, { timeout: 6000 })
            .then(() => step('checkpoint', 'Quick Save recorded the opening salvage choice'))
            .catch(() => note('No Quick Save receipt at the salvage choice'));
        }
        R.milestones.claimedDeparture = { sim: a.sim };
        step('salvage choice', 'Turned away from the claimed cargo');
      }
    } else if (leavingRaid) {
      const [x, z] = a.pos;
      const [rockX, rockZ] = a.raid.rockPos;
      tx = x + (x - rockX) * 5;
      tz = z + (z - rockZ) * 5;
      kind = 'waypoint';
    } else if (towingRaider && a.wp.pos) { [tx, tz] = a.wp.pos; kind = 'waypoint'; }
    else if (isRaid && a.raid) { [tx, tz] = a.raid.targetPos; kind = 'ship'; }
    else if (a.tgt) { tx = a.tgt.pos[0]; tz = a.tgt.pos[1]; kind = a.tgt.type; }
    else if (a.wp && a.wp.pos) { tx = a.wp.pos[0]; tz = a.wp.pos[1]; kind = a.wp.kind || 'waypoint'; }
    let labelText = a.wp ? String(a.wp.label || '') : '';
    // OPENING-1b: the first lesson is the light loose rock beside the derelict. Until a throw lands,
    // fly at THAT rock (not the heavy 47-A boulder), latch it, swing it through the derelict, release.
    if (!isRaid && !isSeam && !advThrow.done && advThrow.tries < 4 && a.openingRock && a.tetherTargetId == null) {
      [tx, tz] = a.openingRock.pos; kind = 'asteroid'; labelText = 'Loose rock';
    }
    if (tx == null) { // no marker: drift forward and look around, as a lost player would
      await keyDown('KeyW'); await sleep(300); continue;
    }
    if (isSeam && a.steeringView === 'racing' && !changedSeamView) {
      changedSeamView = true;
      await page.keyboard.press('Backslash');
      await sleep(350);
      step('camera', 'Switched from Chase to Overhead for the marked rock');
      continue;
    }
    await reassertKeys();
    const aim = await aimAt(tx, tz); if (!aim) { await sleep(200); continue; }
    const beamRange = a.beamRange > 0 ? a.beamRange : BEAMS[0].range;
    const brakeDistance = beamRange * 0.85;
    if (preparedSampleApproach && a.autopilot && aim.dist >= brakeDistance) { await sleep(250); continue; }
    await page.mouse.move(aim.x, aim.y, { steps: 2 });
    const isRock = !isRaid && /asteroid|rock|sample|ore|rubble|recover|47-a/i.test(`${kind} ${labelText} ${a.tgt && a.tgt.name || ''}`) && !/helios|dock|station/i.test(labelText);
    const isDock = /dock|helios|station|market/i.test(`${kind} ${labelText}`) || kind === 'station';
    phase = isRaid ? 'raid' : isClaimed ? 'leave-salvage' : isSeam ? 'scan-and-mine'
      : isDock ? 'dock' : isRock ? 'rock' : 'seek';
    if (isSeam && aim.dist < brakeDistance && !seamBrake) {
      await releaseAll();
      await chooseOpeningTool('brake');
      seamBrake = true;
      step('maneuver', 'Selected Full Stop beside the 47-A recovery site');
      continue;
    }
    if (isSeam && seamBrake && aim.dist >= beamRange) {
      await chooseOpeningTool('brake');
      seamBrake = false;
      changedSeamView = false;
      continue;
    }
    if (isSeam && seamBrake && (!aim.on || !aim.ship?.onScreen)) {
      lostSeamSince ??= a.sim;
      if (a.sim - lostSeamSince > 8) {
        throw new Error('The camera did not bring both the ship and marked 47-A rock into view');
      }
      await sleep(180);
      continue;
    }
    lostSeamSince = null;
    if (isSeam && seamBrake && !R.milestones.seamFramed) {
      R.milestones.seamFramed = { sim: a.sim, rock: [aim.x, aim.y], ship: [aim.ship.x, aim.ship.y] };
      step('camera', 'Ship and marked 47-A rock are both visible at Full Stop');
      await shot('47a-work-view', { gameplay: true });
    }
    // The route deadline bounds retries. A restaged target can become reachable again later.
    if (towingRaider && /let out the line/i.test(a.objText || '')) {
      await releaseAll();
      const before = await readThrowCue();
      await keyDown('KeyF');
      await keyDown('KeyS');
      try { await sleep(1150); }
      finally {
        await keyUp('KeyS');
        await keyUp('KeyF');
      }
      const after = await readThrowCue();
      if (after.restLength > before.restLength && !R.milestones.raiderPayOut) {
        R.milestones.raiderPayOut = { start: before.restLength, end: after.restLength, sim: a.sim };
        step('maneuver', `Paid out the Raider line from ${Math.round(before.restLength)} to ${Math.round(after.restLength)} WU`);
      }
      continue;
    }
    if (towingRaider && a.wp.label === 'Throw target' && aim.on && aim.dist < 350
        && aim.x > 40 && aim.x < VW - 40 && aim.y > 40 && aim.y < VH - 40
        && Date.now() - lastRaiderAction > 1100) {
      if (!R.screens.some((screen) => screen.label === 'latched-raider')) await shot('latched-raider', { gameplay: true });
      await throwRaider(a.raid, ++raiderSwings, tEnd);
      lastRaiderAction = Date.now();
      continue;
    }
    // slow into the target
    const stop = isRock || towingRaider || towingOpeningRock ? 120 : isDock ? 110 : 50;
    const want = Math.max(0, Math.min(190, (aim.dist - stop) * 0.55)); // speed profile: slow into the target
    if (!seamBrake) {
      await yawToward(aim.rel);
      const aligned = Math.abs(aim.rel) < 0.5;
      if (a.speed > want + 18) { await keyUp('KeyW'); await keyDown('KeyS'); } else if (a.speed < want - 8 && aligned) { await keyUp('KeyS'); await keyDown('KeyW'); } else { await keyUp('KeyW'); await keyUp('KeyS'); }
    }
    if (isSeam && seamBrake && a.speed < 30 && aim.dist < beamRange) {
      if (!/Pulse the scanner|Beam the bright seams/.test(a.objText) && !a.sampleRecovered) {
        missingWorkCueSince ??= a.sim;
        if (a.sim - missingWorkCueSince > 8) {
          const work = await page.evaluate(() => {
            const state = window.SF.state;
            const workpoint = state.onboarding?.plottedSeam;
            const entity = workpoint && state.entities.get(workpoint.presentationEntityId);
            return { waypoint: state.nav?.waypoint, active: state.onboarding?.active,
              beat: state.onboarding?.currentBeat, workpoint,
              entity: entity && { id: entity.id, life: entity.occupantGeneration, pos: entity.pos } };
          });
          R.milestones.missingWorkCue = work;
          throw new Error('The 47-A tracker gave no local scan or mining instruction at Full Stop');
        }
      } else missingWorkCueSince = null;
      if (/Pulse the scanner/.test(a.objText) && a.sim - lastScanSim >= 9) {
        if (scanAttempts >= 3) throw new Error('Three spaced scan attempts did not reveal the 47-A source');
        scanAttempts++;
        lastScanSim = a.sim;
        await chooseOpeningTool('scanPulse');
        note(`Chose Scan at ${Math.round(aim.dist)} WU`);
      } else if (aim.on && !a.mineOn && /Beam the bright seams/.test(a.objText) && Date.now() - lastBeamAttempt > 3000) {
        lastBeamAttempt = Date.now();
        R.milestones.scannedRock ??= { time: wallS(), sim: a.sim };
        await chooseOpeningTool('aimedMine');
        await page.mouse.move(aim.x, aim.y);
        note(`Chose Mine Beam at ${Math.round(aim.dist)} WU`);
      }
    }
    if (a.nearStation && a.nearStation.d > 9000) { R.outcome = `left the arena: ${a.nearStation.d} u from the nearest station while chasing ${labelText}`; note(R.outcome); break; }
    if (isRaid && !leavingRaid && a.raid && aim.on && a.tetherTargetId == null && aim.dist < 380
        && Date.now() - lastRaiderAction > 1000) {
      lastRaiderAction = Date.now(); raiderLatchTries++;
      await page.keyboard.press('KeyF', { delay: 120 });
      note(`Raider F latch try ${raiderLatchTries} at ${Math.round(aim.dist)} WU`);
      await sleep(350);
    }
    // latch the rock once it is close (and not already towing)
    if (isRock && !isSeam && a.tetherTargetId == null && aim.dist < 380 && Date.now() - lastLatchTry > 4000 && latchTries < 12) {
      lastLatchTry = Date.now(); latchTries++;
      await page.mouse.move(aim.x, aim.y, { steps: 2 });
      await page.keyboard.press('KeyF', { delay: 120 });
      note(`F latch try ${latchTries} dist ${Math.round(aim.dist)}`); await sleep(500);
      if (latchTries === 1 || latchTries === 3) await shot(`latch-try-${latchTries}`, { gameplay: true });
    }
    if (!advThrow.done && advThrow.tries < 4 && towingOpeningRock) {
      const evN = (name) => page.evaluate((n) => (window.__dr.ev || []).filter((e) => e.ev === n).length, name);
      const mark = await page.evaluate(() => window.__dr.ev.length);
      await shot('latched-rock', { gameplay: true });
      const turnKey = advThrow.tries % 2 === 0 ? 'KeyD' : 'KeyA';
      await keyDown('KeyW'); await keyDown(turnKey);
      const rw0 = await evN('massline:releaseWindow');
      const readThrow = readThrowCue; // shared with the Swarm cycle: the aim tag + the sim's window flag
      let clickInfo = null;
      for (let i = 0; i < 60 && Date.now() < tEnd; i++) {
        // Fly an arc toward the derelict with the cursor ON it: the throw solution needs an aimed target.
        const dsc = await page.evaluate(() => {
          const { state, helpers } = window.SF;
          const wreck = state.entities.get(state.onboarding?.rescue?.ids?.derelict);
          if (!wreck?.pos || wreck.alive === false) return null;
          const point = helpers.worldToScreen({ x: wreck.pos.x, y: 0, z: wreck.pos.z }, {});
          return point ? { ...point, wreckId: wreck.id } : null;
        }).catch(() => null);
        const aimable = dsc?.onScreen && !dsc.behind && dsc.x > 40 && dsc.x < VW - 40
          && dsc.y > 40 && dsc.y < VH - 40;
        if (aimable) await page.mouse.move(dsc.x, dsc.y);
        const rt = await readThrow();
        if (i === 0) { const li = await page.evaluate(() => { const s = window.SF.state; const id = s.player && s.player.tether && s.player.tether.targetId; const e = id != null && s.entities.get(id); return e ? { id, type: e.type, rescueRole: (e.data && e.data.rescueRole) || null, kind: (e.data && (e.data.kind || e.data.typeId)) || null, mass: e.mass || null, guarded: !!(e.data && e.data.rescueRole === 'rock') } : { id: id ?? null }; }).catch(() => null); note('first latch identity: ' + JSON.stringify(li)); }
        if (!rt.tetherActive || rt.tetherTarget !== a.openingRock.id) break;
        const aimedWindow = rt.aimTarget === dsc?.wreckId && (rt.on || rt.cueLit);
        if (aimable && (aimedWindow || i >= 3)) {
          // Follow the tutorial's tap prompt even when the swing solution has not lit.
          await page.mouse.click(dsc.x, dsc.y, { button: 'right', delay: 60 });
          clickInfo = { i, ...rt, aimedWindow, wreckId: dsc.wreckId, windowEvents: (await evN('massline:releaseWindow')) - rw0 };
          break;
        }
        await sleep(70);
      }
      note('click-time: ' + JSON.stringify(clickInfo || { noAimedRelease: true, last: await readThrow() }));
      await keyUp(turnKey);
      await keyUp('KeyW');
      advThrow.tries++;
      if (!clickInfo) continue;
      R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
      await shot('release-rock', { gameplay: true });
      const seq = await page.evaluate(() => { const t = window.__dr.rel(performance.now()) - 8; return (window.__dr.ev || []).filter((e) => e.t >= t).map((e) => e.ev + '@' + e.t); }).catch(() => []);
      note('events in the last 8 s before the release: ' + JSON.stringify(seq.slice(-40)));
      let release = null;
      for (let i = 0; i < 12 && !release; i++) {
        await sleep(250);
        release = await page.evaluate(({ start, id }) => window.__dr.ev.slice(start)
          .find((event) => event.ev === 'massline:throw' && event.id === id) || null, { start: mark, id: a.openingRock.id });
      }
      advThrow.done = !!release;
      R.milestones.rockRelease = release;
      note('rock throw receipt: ' + JSON.stringify(release));
      note(advThrow.done ? 'THROW registered on the loose rock' : 'release did not register a throw; retrying');
      if (advThrow.done) { await sleep(1500); await shot('after-throw-derelict', { gameplay: true }); }
    }
    if (isDock && aim.dist < 240 && Date.now() - lastE > 2000) { lastE = Date.now(); await page.keyboard.press('KeyE'); note(`pressed E at dist ${Math.round(aim.dist)}`); await sleep(600); }
    await sleep(120);
  }
  await releaseAll();
  R.adventure_trail = trail.slice(-60);
  if (!R.outcome) R.outcome = `stopped at wall ${wallS()}s: phase ${phase}, ${docked ? 'docked' : 'not docked'}; last objective ${lastWpKey}`;
}

// ---------------------------------------------------------------- finish: stats + report
function pct(a, p) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))].toFixed(2); }
async function collect() {
  if (R.milestones.firstFreightSaved && R.events) return; // preserve the flight evidence across the deliberate reload
  const d = await page.evaluate(() => {
    const D = window.__dr; return { t0: D.t0, ms: D.ms, text: D.text, ev: D.ev, learnerRockEvents: D.learnerRockEvents, frames: D.frames, longs: D.longs, noise: D.noise, emitted: D.emitted, hooked: D.hooked, clicks: D.clicks, longTaskError: D.longTaskError };
  }).catch((e) => { note('collect failed ' + e.message); return null; });
  if (!d) return;
  const first = d.ms.firstFlight ? d.ms.firstFlight.t : null;
  const dts = []; const dtsClean = []; const noise = d.noise || [];
  for (let i = 0; i < d.frames.length; i += 3) {
    const t = d.frames[i], dt = d.frames[i + 1], fl = d.frames[i + 2];
    if (!fl || d.t0 == null || (t - d.t0) / 1000 < (first ?? 1e9)) continue;
    dts.push(dt);
    if (!noise.some(([a, b]) => t >= a && t <= b)) dtsClean.push(dt);
  }
  const stat = (a) => ({ frames: a.length, p50: pct(a, .5), p95: pct(a, .95), p99: pct(a, .99), max: a.length ? +Math.max(...a).toFixed(1) : null, over100ms: a.filter((x) => x > 100).length, over250ms: a.filter((x) => x > 250).length, fpsMean: a.length ? +(1000 / (a.reduce((x, y) => x + y, 0) / a.length)).toFixed(1) : null });
  R.frame_playable = stat(dts);
  R.frame_playable_excluding_screenshots = stat(dtsClean);
  const playStart = d.t0 != null && first != null ? d.t0 + first * 1000 : Infinity;
  const longs = d.longs.filter((l) => l.t >= playStart);
  R.longTasks = { total_over_50ms: longs.length, over_250ms: longs.filter((l) => l.d >= 250).length, over_250ms_excl_screenshot: longs.filter((l) => l.d >= 250 && !noise.some(([a, b]) => l.t >= a - 600 && l.t <= b)).length, worst: longs.sort((a, b) => b.d - a.d).slice(0, 8), observerError: d.longTaskError || null };
  R.milestones = { ...d.ms, ...R.milestones };
  R.events = d.ev.filter((e) => !/^(combat:collisionConsequence|massline:(tumbleEnd|recovering|recovered))$/.test(e.ev)).slice(0, 800);
  if (ROUTE === 'adventure') {
    R.recentThrowEvents = d.ev.filter((event) => /^(tether:whipImpact|massline:throw|massline:releaseValidated|physics:impact)$/.test(event.ev)).slice(-40);
  }
  R.learnerRockEvents = d.learnerRockEvents;
  R.eventCounts = d.ev.reduce((m, e) => { m[e.ev] = (m[e.ev] || 0) + 1; return m; }, {});
  // BOT-02: kills credited to a thrown body — the throw payload shows up as the kill's
  // impactor (collision partner). Whip kills while the body is still on the rope stay out.
  const thrownIds = new Set(d.ev.filter((e) => e.ev === 'massline:throw' && e.id != null).map((e) => e.id));
  R.thrownIds = [...thrownIds];
  R.thrownKills = d.ev.filter((e) => e.ev === 'entity:killed' && thrownIds.has(e.impactorId))
    .map((e) => ({ id: e.id, type: e.type, impactorId: e.impactorId, cause: e.cause, sim: e.sim }));
  R.text = d.text.map(({ tAbs, src, text, kind }) => ({ t: d.t0 == null ? null : +((tAbs - d.t0) / 1000).toFixed(2), src, text, kind }));
  R.bus = { hooked: d.hooked, emitsSeen: d.emitted };
  R.quality_atEnd = await qualityInfo();
}
function toMd() {
  const L = []; const m = R.milestones || {};
  const ms = (k) => (m[k] ? `${m[k].t} s, ${m[k].clicks} clicks` : 'never');
  L.push(`# Demo route: ${R.route}`, '', `Run ${R.startedAt}; viewport ${R.viewport}; ${R.headed ? 'headed' : 'headless'}; intro mode ${R.intro}.`, '');
  L.push(`- Renderer: ${R.renderer}`, `- Quality preset at flight: ${JSON.stringify(R.quality_atFlight)}`, `- Quality at end: ${JSON.stringify(R.quality_atEnd)}`, `- Outcome: ${R.outcome}`);
  L.push(`- Total wall time ${R.wallSeconds} s; clicks from title click: ${R.clicks}; intro on screen ${R.intro_seconds ?? '?'} s`);
  L.push('', '## Timings from the title click (wall s, mouse presses so far)', `- entered flight mode: ${ms('firstFlight')}`, `- first Line latch: ${ms('firstLatch')}`, `- first throw: ${ms('firstThrow')}`, `- first kill: ${ms('firstKill')}`,
    `- throws: ${(R.eventCounts && R.eventCounts['massline:throw']) || 0}`,
    `- kills by a thrown body: ${(R.thrownKills || []).length}${R.thrownKills && R.thrownKills.length ? ' — ' + R.thrownKills.map((k) => `${k.id} (${k.cause || 'collision'})`).join(', ') : ''}`);
  if (m.firstFlight && m.firstThrow) L.push(`- first flight to first throw: ${(m.firstThrow.t - m.firstFlight.t).toFixed(2)} s`);
  if (R.throwCycles && R.throwCycles.length) {
    L.push('', '## Throw cycles');
    for (const c of R.throwCycles) {
      const tr = c.trail || []; const minEnter = tr.reduce((m, r) => (r.enterS != null && (m == null || r.enterS < m) ? r.enterS : m), null);
      const aimSeen = tr.some((r) => r.aimT != null);
      L.push(`- cycle ${c.cycle}: target ${c.target ?? '-'} (${c.targetKind || 'ship'}) · swing ${c.swingMs != null ? c.swingMs + ' ms' : '-'} · cue ${JSON.stringify(c.cue || null)} · tap ${c.tap ? `${c.tap.presses || 1}x ${c.tap.why || ''}` : 'skipped (line ended)'} · minEnterS ${minEnter} · aim ${aimSeen} · end ${JSON.stringify(c.end || null)} · threw ${!!c.threw}`);
    }
  }
  const f = R.frame_playable || {}; const g = R.frame_playable_excluding_screenshots || {};
  L.push('', '## Browser callback timing in flight mode (ms)', `- all: n=${f.frames} p50 ${f.p50} p95 ${f.p95} p99 ${f.p99} max ${f.max}; >100ms ${f.over100ms}; >250ms ${f.over250ms}; mean ${f.fpsMean} callbacks/s`, `- excluding screenshot windows: n=${g.frames} p50 ${g.p50} p95 ${g.p95} p99 ${g.p99} max ${g.max}; >100ms ${g.over100ms}; >250ms ${g.over250ms}`);
  const lt = R.longTasks || {}; L.push(`- long tasks: ${lt.total_over_50ms} over 50 ms, ${lt.over_250ms} at or over 250 ms (${lt.over_250ms_excl_screenshot} not near a screenshot); worst ${JSON.stringify(lt.worst)}`);
  L.push('', '## Steps'); for (const s of R.steps) L.push(`- ${s.at} s  ${s.name}: ${s.detail || ''}`);
  L.push('', '## Screens (PNG per screen)'); for (const s of R.screens) L.push(`- ${s.file}  (${s.at} s)${s.controls ? '  controls: ' + s.controls.join(' | ') : ''}`);
  L.push('', '## Every toast / alert / notice / stage string, with its time (s since title click)');
  const seen = new Map(); for (const t of (R.text || []).filter((x) => x.src !== 'dom:hud')) { const k = t.text; if (!seen.has(k)) seen.set(k, { n: 0, first: t }); seen.get(k).n++; }
  for (const [k, v] of seen) L.push(`- ${v.first.t == null ? 'pre-click' : v.first.t + ' s'}  [${v.first.src}] "${k}"${v.n > 1 ? `  x${v.n}` : ''}`);
  if (!(R.text || []).length) L.push('- (none captured)');
  const hud = new Map(); for (const t of (R.text || []).filter((x) => x.src === 'dom:hud' && x.t != null && x.t >= 0 && x.text.length <= 70)) if (!hud.has(t.text)) hud.set(t.text, t);
  L.push('', '## HUD word elements that appeared after the title click (floating text, chips, tags; noisy, first sighting each, max 150)');
  for (const [k, v] of [...hud].slice(0, 150)) L.push(`- ${v.t} s  "${k}"`);
  L.push('', '## Game events', ...Object.entries(R.eventCounts || {}).map(([k, v]) => `- ${k}: ${v}`));
  L.push('', '## Errors', ...(R.errors.length ? R.errors.slice(0, 30).map((e) => `- page error: ${e}`) : ['- no page errors']), ...(R.consoleErrors.length ? R.consoleErrors.slice(0, 30).map((e) => `- console: ${e}`) : ['- no console errors']));
  L.push('', '## Notes', ...R.notes.slice(-80).map((n) => `- ${n}`));
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------- main
try {
  await sleep(2500);
  browser = await chromium.launch({ headless: !HEADED, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${VW + 20},${VH + 140}`] });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  page = await ctx.newPage();
  await page.addInitScript(INIT);
  page.on('pageerror', (e) => { R.errors.push(`[${wallS()}s] ${String(e.message).slice(0, 300)}`); console.log('pageerror', String(e.message).slice(0, 160)); });
  page.on('console', (m) => { if (m.type() === 'error') R.consoleErrors.push(`[${wallS()}s] ${m.text().slice(0, 300)}`); });
  page.on('requestfailed', (r) => R.consoleErrors.push(`[${wallS()}s] requestfailed ${r.url().slice(0, 120)}`));
  await page.goto('about:blank');
  R.renderer = await rendererInfo();
  note('renderer: ' + R.renderer);
  try {
    if (ROUTE === 'swarm') await swarmRoute(); else await adventureRoute();
  } catch (e) {
    if (PROFILE_BOOT) await stopBootCpuProfile('route-error');
    R.errors.push(`ROUTE THREW: ${e.stack || e.message}`); console.log('ROUTE THREW', e.stack || e.message); R.outcome = (R.outcome || '') + ` | route threw: ${e.message}`;
    await shot('route-threw', {}).catch(() => {});
  }
  await releaseAll().catch(() => {});
  R.wallSeconds = wallS();
  if (!page.isClosed()) {
    await collect();
    R.quality_atEnd = R.quality_atEnd || await qualityInfo();
  }
} finally {
  if (PROFILE_BOOT) await stopBootCpuProfile('closed-before-title');
  R.wallSeconds = R.wallSeconds || wallS();
  writeFileSync(join(OUT, 'demo-route.json'), JSON.stringify(R, null, 2));
  writeFileSync(join(OUT, 'report.md'), toMd());
  console.log(`wrote ${join(OUT, 'demo-route.json')} and report.md`);
  try { if (browser) await browser.close(); } catch (e) { /* closed */ }
  server.kill();
  if (ROUTE === 'adventure' && argv.freight
    && (!R.milestones.firstFreightContinued || !R.milestones.firstFreightContinuePicture)) process.exitCode = 1;
  if (argv['raid-checkpoint'] && !R.milestones.raidCheckpointPassed) process.exitCode = 1;
}
