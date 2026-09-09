#!/usr/bin/env node
// PQ-165.03 — same-seed shipping-camera pair: motion on vs reduce-motion.
// Each beat waits until the named HUD fact is actually painted, then shoots.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, 'design/program/roadmap/receipts');
const WIDTH = 1280;
const HEIGHT = 720;
const BEATS = ['telegraph', 'impact', 'shield', 'line', 'blocked'];
const BEAT_EVENT = {
  telegraph: 'telegraphs',
  impact: 'impactDirection',
  shield: 'shieldSide',
  line: 'loadedLine',
  blocked: 'blockedOutput',
};

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for the PQ-165.03 strip pair');

const ownedServer = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: false,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', `--window-size=${WIDTH},${HEIGHT}`, '--force-device-scale-factor=1'],
});
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();

try {
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'PQ-165.03 pair', seed: 4242 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    return sf?.state?.mode === 'flight' && !!sf.state.entities.get(sf.state.playerId);
  }, null, { timeout: 90_000 });
  await page.evaluate(() => {
    for (const selector of ['.tutorial-overlay', '[data-screen="tutorial"]']) {
      const root = document.querySelector(selector);
      const button = root && [...root.querySelectorAll('button')]
        .find((node) => /skip|dismiss|close|got it/i.test(node.textContent || ''));
      if (button) button.click();
    }
  });
  await page.waitForTimeout(500);
  await page.evaluate(installCaptureHelpers);

  const motionOn = await shootMode(page, false, 'motion-on');
  const reduced = await shootMode(page, true, 'reduce-motion');
  const namesOn = motionOn.events.map((row) => row.id);
  const namesOff = reduced.events.map((row) => row.id);
  assert.deepEqual(namesOff, namesOn, 'reduce-motion must keep the same named events');
  for (const mode of [motionOn, reduced]) {
    assert.match(String(mode.reads.telegraph), /CHARGE/i, `${mode.tag} telegraph`);
    assert.ok(Number(mode.reads.impactMarkers) >= 1, `${mode.tag} impact chevron`);
    assert.match(String(mode.reads.shieldGlyph), /S/, `${mode.tag} shield glyph`);
    assert.match(String(mode.reads.tetherText), /LOADED/i, `${mode.tag} loaded line`);
    assert.match(String(mode.reads.blockedText), /OUTPUT BLOCKED/i, `${mode.tag} blocked output`);
  }
  const report = {
    schema: 'spaceface.pq16503StripPair.v1',
    seed: 4242,
    events: namesOn,
    motionOn,
    reduced,
  };
  await writeFile(path.join(OUT, 'PQ-165-03-strip-pair.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    events: namesOn,
    reads: { motionOn: motionOn.reads, reduced: reduced.reads },
    stills: { motionOn: motionOn.stills, reduced: reduced.stills },
  }, null, 2));
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await ownedServer.close().catch(() => {});
}

async function shootMode(page, reduce, tag) {
  await page.evaluate((reduceMotion) => {
    const state = window.SF.state;
    state.settings.video.motionReduce = !!reduceMotion;
    state.settings.accessibility = state.settings.accessibility || {};
    state.settings.accessibility.motionPreference = reduceMotion ? 'reduce' : 'full';
    window.SF.bus.emit('settings:changed', { section: 'video' });
  }, reduce);
  await page.waitForTimeout(80);

  const stills = [];
  const named = [];
  const reads = {};
  for (const beat of BEATS) {
    if (beat === 'line') await latchLoadedLine(page);
    else await releaseLineIfAny(page);
    const staged = await page.evaluate((beatId) => window.__pq165.stageBeat(beatId), beat);
    if (beat === 'telegraph' || beat === 'line') console.log('[pq165] staged', JSON.stringify(staged));
    let visible;
    try {
      visible = await page.waitForFunction(
        (id) => {
          if (id === 'line' && window.__pq165 && window.__pq165.tensionLine) window.__pq165.tensionLine();
          return !!(window.__pq165 && window.__pq165.beatVisible(id));
        },
        beat,
        { timeout: 12_000 },
      );
    } catch (err) {
      const dump = await page.evaluate((beatId) => ({
        dump: window.__pq165.dumpBeat(beatId),
        visibleNow: window.__pq165.beatVisible(beatId),
      }), beat);
      console.error('[pq165] timeout', beat, JSON.stringify(dump, null, 2));
      throw err;
    }
    if (beat === 'line') await page.evaluate(() => window.__pq165.tensionLine());
    const value = await page.evaluate((id) => window.__pq165.beatVisible(id), beat);
    if (beat === 'telegraph') reads.telegraph = value;
    else if (beat === 'impact') reads.impactMarkers = value;
    else if (beat === 'shield') reads.shieldGlyph = value;
    else if (beat === 'line') reads.tetherText = value;
    else reads.blockedText = value;
    const file = path.join(OUT, `PQ-165-03-${tag}-${beat}.png`);
    await page.screenshot({ path: file });
    stills.push(path.relative(ROOT, file).replaceAll('\\', '/'));
    named.push({ id: BEAT_EVENT[beat] });
    await page.waitForTimeout(120);
  }
  return { tag, events: named, motionReduce: reduce, reads, stills };
}

function installCaptureHelpers() {
  function pickActor(state, player) {
    let best = null;
    let bestD = Infinity;
    const skip = new Set(['fx', 'vfx', 'projectile', 'beam', 'bullet']);
    for (const entity of state.entities.values()) {
      if (!entity || entity.id === state.playerId || entity.alive === false || !entity.pos) continue;
      if (skip.has(String(entity.type || ''))) continue;
      const dx = entity.pos.x - player.pos.x;
      const dz = entity.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        best = entity;
        bestD = d;
      }
    }
    return best;
  }

  window.__pq165 = {
    pickActor,
    stageBeat(beatId) {
      const sf = window.SF;
      const state = sf.state;
      const bus = sf.bus;
      const player = state.entities.get(state.playerId);
      const pos = player.pos;
      state.player = state.player || {};
      const actor = pickActor(state, player);
      const actorId = actor ? actor.id : null;

      if (beatId === 'blocked') bus.emit('site:machineStatus', { machineId: 'mill-1', state: 'starved' });
      else bus.emit('site:machineStatus', { machineId: 'mill-1', state: 'running' });

      if (beatId === 'telegraph' && actorId != null) {
        bus.emit('ai:telegraph', {
          entityId: actorId,
          actorId,
          targetId: state.playerId,
          kind: 'weapon_charge',
          durationTicks: 240,
          tick: state.tick,
        });
      }

      if (beatId === 'impact') {
        bus.emit('combat:damage', {
          targetId: state.playerId,
          attackerId: 'rock-1',
          applied: 6,
          dominantLayer: 'hull',
          isPlayer: true,
          attackerPos: { x: pos.x - 40, z: pos.z },
          pos: { x: pos.x - 40, z: pos.z },
          after: { shield: 40, shieldMax: 55, armor: 20, armorMax: 30, hull: 110, hullMax: 140 },
        });
        bus.emit('collision', {
          aId: state.playerId,
          bId: 'rock-1',
          pos: { x: pos.x - 40, z: pos.z },
        });
      }

      if (beatId === 'shield') {
        bus.emit('combat:damage', {
          targetId: state.playerId,
          attackerId: actorId || 'hostile-1',
          applied: 8,
          dominantLayer: 'shield',
          isPlayer: true,
          attackerPos: { x: pos.x + 40, z: pos.z },
          pos: { x: pos.x + 40, z: pos.z },
          after: { shield: 20, shieldMax: 55, armor: 30, armorMax: 30, hull: 140, hullMax: 140 },
        });
      }

      return {
        beatId,
        actorId,
        actorType: actor && actor.type,
        tick: state.tick,
        tellAfter: document.querySelector('.sf-tell.is-on .sf-tell__kind')?.textContent || '',
        tether: state.player && state.player.tether && {
          active: state.player.tether.active,
          phase: state.player.tether.phase,
          load: state.player.tether.load,
        },
      };
    },
    approachLatchTarget() {
      const sf = window.SF;
      const s = sf.state;
      const player = s.entities.get(s.playerId);
      if (!player || !player.pos) return { ok: false, reason: 'no player' };
      let best = null;
      let bestD = Infinity;
      for (const entity of (s.entityList || [])) {
        if (!entity || entity.alive === false || !entity.pos) continue;
        if (entity.type !== 'asteroid') continue;
        const d = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
        if (d < bestD) {
          best = entity;
          bestD = d;
        }
      }
      if (!best) return { ok: false, reason: 'no latch target' };
      const standoff = (best.radius || 0) + (player.radius || 0) + 90;
      const standAt = { x: best.pos.x + standoff, z: best.pos.z };
      standAt.heading = Math.atan2(best.pos.z - standAt.z, best.pos.x - standAt.x);
      const world = sf.registry && sf.registry.get && sf.registry.get('world');
      if (world && typeof world.relocatePlayerInSector === 'function') {
        world.relocatePlayerInSector(standAt, { reason: 'pq165:loaded-line' });
      } else {
        player.pos.x = standAt.x;
        player.pos.z = standAt.z;
        player.rot = standAt.heading;
        if (player.vel) { player.vel.x = 0; player.vel.z = 0; }
      }
      const physicsOwner = sf.registry && sf.registry.get && sf.registry.get('physics')
        && sf.registry.get('physics')._sg02;
      const rec = physicsOwner && physicsOwner.records && physicsOwner.records.get(player.id);
      if (rec && rec.body && typeof rec.body.setTranslation === 'function') {
        const local = physicsOwner._globalPointToFrameLocal
          ? physicsOwner._globalPointToFrameLocal({ x: standAt.x, y: 0, z: standAt.z }, rec.body.translation())
          : { x: standAt.x, z: standAt.z };
        rec.body.setTranslation({ x: local.x, y: 0, z: local.z }, true);
        if (typeof rec.body.setLinvel === 'function') rec.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      if (s.player) s.player.targetId = best.id;
      return { ok: true, targetId: best.id, type: best.type, dist: Math.round(bestD) };
    },
    tensionLine() {
      const s = window.SF.state;
      const player = s.entities.get(s.playerId);
      const tether = s.player && s.player.tether;
      const target = tether && s.entities.get(tether.targetId);
      if (!player || !target || !player.pos || !target.pos) return false;
      const dx = player.pos.x - target.pos.x;
      const dz = player.pos.z - target.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const vx = (dx / len) * 55;
      const vz = (dz / len) * 55;
      if (player.vel) { player.vel.x = vx; player.vel.z = vz; }
      const physicsOwner = window.SF.registry.get('physics') && window.SF.registry.get('physics')._sg02;
      const rec = physicsOwner && physicsOwner.records && physicsOwner.records.get(player.id);
      if (rec && rec.body && typeof rec.body.setLinvel === 'function') {
        rec.body.setLinvel({ x: vx, y: 0, z: vz }, true);
      }
      return true;
    },
    beatVisible(beatId) {
      const chip = document.querySelector('.sf-tell.is-on') || document.querySelector('.sf-tell--CHARGE');
      const tellText = chip ? String(chip.textContent || '') : '';
      const markers = [...document.querySelectorAll('.sf-dmgind-marker')].filter((el) => {
        const shown = el.style.display === 'flex' || getComputedStyle(el).display === 'flex';
        return shown && Number(el.style.opacity || '1') > 0.15;
      });
      const glyphs = markers.map((el) => String(el.textContent || '').trim());
      const tetherEl = document.querySelector('#sf-tetherstat [data-k="tether"]');
      const tetherWrap = document.querySelector('#sf-tetherstat');
      const tetherShown = tetherWrap && getComputedStyle(tetherWrap).display !== 'none';
      const tetherText = tetherShown && tetherEl ? String(tetherEl.textContent || '') : '';
      const alerts = [...document.querySelectorAll('.sf-alert')].map((el) => String(el.textContent || ''));
      const blocked = alerts.find((text) => /OUTPUT BLOCKED/i.test(text)) || '';

      if (beatId === 'telegraph') return /CHARGE/i.test(tellText) ? tellText : false;
      if (beatId === 'impact') {
        const hull = glyphs.filter((text) => /H/.test(text)).length;
        return hull > 0 ? hull : false;
      }
      if (beatId === 'shield') {
        const shield = glyphs.find((text) => text.includes('S'));
        return shield || false;
      }
      if (beatId === 'line') return /LOADED/i.test(tetherText) ? tetherText : false;
      if (beatId === 'blocked') return blocked || false;
      return false;
    },
    dumpBeat(beatId) {
      const tells = [...document.querySelectorAll('.sf-tell')].map((el) => ({
        className: el.className,
        hidden: el.hidden,
        display: el.style.display,
        computed: getComputedStyle(el).display,
        text: el.textContent,
      }));
      const markers = [...document.querySelectorAll('.sf-dmgind-marker')].map((el) => ({
        display: el.style.display,
        text: el.textContent,
      }));
      const tetherWrap = document.querySelector('#sf-tetherstat');
      const tetherEl = document.querySelector('#sf-tetherstat [data-k="tether"]');
      const alerts = [...document.querySelectorAll('.sf-alert')].map((el) => el.textContent);
      const state = window.SF && window.SF.state;
      const player = state && state.entities.get(state.playerId);
      const actor = pickActor(state, player);
      return {
        beatId,
        tick: state && state.tick,
        mode: state && state.mode,
        playerPos: player && player.pos,
        actor: actor && { id: actor.id, type: actor.type, pos: actor.pos },
        tells,
        markers,
        tetherDisplay: tetherWrap && tetherWrap.style.display,
        tetherText: tetherEl && tetherEl.textContent,
        tether: state && state.player && state.player.tether && {
          active: state.player.tether.active,
          phase: state.player.tether.phase,
          load: state.player.tether.load,
          strain: state.player.tether.strain,
        },
        alerts,
      };
    },
  };
}

async function releaseLineIfAny(page) {
  const active = await page.evaluate(() => !!(window.SF && window.SF.state && window.SF.state.player
    && window.SF.state.player.tether && window.SF.state.player.tether.active));
  if (!active) return;
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !(window.SF && window.SF.state && window.SF.state.player
    && window.SF.state.player.tether && window.SF.state.player.tether.active), null, { timeout: 4_000 })
    .catch(() => {});
}

async function latchLoadedLine(page) {
  await releaseLineIfAny(page);
  const staged = await page.evaluate(() => window.__pq165.approachLatchTarget());
  console.log('[pq165] approach', JSON.stringify(staged));
  if (!staged || !staged.ok) throw new Error(`PQ-165.03 could not stand off a latch target (${staged && staged.reason})`);
  await page.waitForFunction(() => !document.body.classList.contains('ui-live-screen'), null, { timeout: 10_000 }).catch(() => {});
  const startTick = await page.evaluate(() => window.SF.state.tick);
  await page.waitForFunction((start) => window.SF.state.tick >= start + 45, startTick, { timeout: 15_000 }).catch(() => page.waitForTimeout(800));
  await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    const tether = sf.registry && sf.registry.get && sf.registry.get('tetherGameplay');
    if (tether && typeof tether._refreshAcquisitionPreview === 'function' && player) {
      tether._refreshAcquisitionPreview(player, { maxLength: 390 }, state, state.simTime || 0, true, true);
    }
  });
  const ready = await page.waitForFunction(() => {
    const selected = window.SF && window.SF.state && window.SF.state.masslineAcquisition
      && window.SF.state.masslineAcquisition.selected;
    return !!(selected && selected.status === 'ready' && selected.targetId != null);
  }, null, { timeout: 8_000 }).then(() => true).catch(async () => {
    const why = await page.evaluate(() => {
      const selected = window.SF && window.SF.state && window.SF.state.masslineAcquisition
        && window.SF.state.masslineAcquisition.selected;
      return selected || null;
    });
    console.log('[pq165] acquisition not ready', JSON.stringify(why));
    return false;
  });
  if (!ready) await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.state.player
    && window.SF.state.player.tether && window.SF.state.player.tether.active), null, { timeout: 8_000 });
  await page.evaluate(() => window.__pq165.tensionLine());
  await page.waitForTimeout(400);
}

function findSystemBrowser() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

