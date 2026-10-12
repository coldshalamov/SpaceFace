// Stage-8 diagnostic probe: worker-lane authored-visual readiness dump.
import { chromium } from 'playwright';

const lane = process.argv.includes('--sim-lane')
  ? process.argv[process.argv.indexOf('--sim-lane') + 1]
  : 'worker';
const waitMs = Number(process.argv[process.argv.indexOf('--wait-ms') + 1] || 45000);

const { spawn } = await import('node:child_process');
const { get } = await import('node:http');
const PORT = 8460;
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((resolve, reject) => {
  const deadline = Date.now() + 10000;
  const poll = () => get(`http://127.0.0.1:${PORT}/`, (res) => { res.resume(); resolve(); })
    .on('error', () => (Date.now() > deadline ? reject(new Error('server never came up')) : setTimeout(poll, 300)));
  poll();
});
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text().slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${PORT}/?simLane=${lane}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'menu', { timeout: 60000 });
  console.log('menu reached');
  await page.waitForFunction(() => {
    const all = [...document.querySelectorAll('button')].filter((x) =>
      x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden' && !x.disabled);
    return all.some((x) => /new game/i.test(x.textContent || ''));
  }, { timeout: 20000 });
  await page.evaluate(() => {
    const st = window.SF.state, bus = window.SF.bus;
    window.__laneTap = { spawned: 0, mirrored: 0, stub: 0, killed: 0, emits: {} };
    if (bus && typeof bus.on === 'function') {
      const tap = (name) => bus.on(name, (p) => {
        window.__laneTap.emits[name] = (window.__laneTap.emits[name] || 0) + 1;
        const e = p && p.entity;
        if (name === 'entity:spawned') {
          window.__laneTap.spawned++;
          if (e && st.entities.get(e.id) === e) window.__laneTap.mirrored++;
          else window.__laneTap.stub++;
        }
        if (name === 'entity:killed') window.__laneTap.killed++;
      });
      for (const n of ['entity:spawned', 'entity:killed', 'game:started', 'sector:enter']) tap(n);
    }
  });
  const clicked = await page.evaluate(() => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('button')].filter((x) =>
      x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden'
      && !x.disabled && x.getAttribute('aria-disabled') !== 'true');
    const b = all.find((x) => norm(x.textContent) === 'New Game')
      || all.find((x) => norm(x.textContent).includes('New Game'));
    if (!b) return null;
    b.click();
    return norm(b.textContent);
  });
  console.log('clicked:', clicked);
  // The New Game screen needs a second press on Launch to start the run.
  await page.waitForFunction(() => {
    const all = [...document.querySelectorAll('button')].filter((x) =>
      x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden' && !x.disabled);
    return all.some((x) => /launch/i.test(x.textContent || ''));
  }, { timeout: 15000 }).catch(() => {});
  const launched = await page.evaluate(() => {
    const all = [...document.querySelectorAll('button')].filter((x) =>
      x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden' && !x.disabled);
    const b = all.find((x) => /launch/i.test(x.textContent || ''));
    if (!b) return false;
    b.click();
    return true;
  });
  console.log('launched:', launched);
  const t0 = Date.now();
  let entered = false;
  const timeline = [];
  while (Date.now() - t0 < waitMs) {
    const s = await page.evaluate(() => {
      const st = window.SF.state;
      let meshes = 0;
      for (const e of st.entities.values()) if (e.mesh) meshes++;
      return {
        mode: st.mode,
        tick: st.tick,
        stack: st.ui && Array.isArray(st.ui.screenStack) ? st.ui.screenStack.slice() : null,
        meshes,
        entities: st.entities.size,
        applied: st.render && st.render.presentationPublisher && st.render.presentationPublisher.appliedRecords,
      };
    }).catch(() => null);
    if (s) timeline.push({ t: ((Date.now() - t0) / 1000).toFixed(1), ...s });
    if (s && s.mode === 'flight') { entered = true; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('timeline:', JSON.stringify(timeline));
  console.log(`mode after ${(Date.now() - t0) / 1000}s:`, await page.evaluate(() => window.SF.state.mode));
  const readiness = await page.evaluate(async () => {
    const { authoredCriticalVisualReadiness } = await import('/src/render/partsLibrary.js');
    const r = authoredCriticalVisualReadiness(window.SF.state);
    const st = window.SF.state;
    return {
      ready: r.ready, pipelineReady: r.pipelineReady, playerStatus: r.playerStatus,
      startingHubId: r.startingHubId, startingHubStatus: r.startingHubStatus,
      startingHubRequired: r.startingHubRequired, blockers: r.blockers,
      openingAssets: r.openingAssets, pending: r.openingPending,
      world: { sector: st.world && st.world.currentSectorId },
      playerId: st.playerId,
      playerRow: (() => {
        const row = st.entities && typeof st.entities.get === 'function' ? st.entities.get(st.playerId) : null;
        if (!row) return null;
        return {
          keys: Object.keys(row).sort(),
          hasVel: !!row.vel,
          vel: row.vel || null,
          vx: row.vx, vz: row.vz,
          type: row.type, isPlayer: row.isPlayer, kind: row.kind,
          pos: row.pos || null, mesh: !!row.mesh,
        };
      })(),
      ui: {
        docked: st.ui && st.ui.docked,
        screenStack: st.ui && Array.isArray(st.ui.screenStack) ? st.ui.screenStack.length : null,
        fulfillmentBlackoutActive: st.ui && st.ui.fulfillmentBlackoutActive,
      },
      sectorShellAdmission: !!(st.render && st.render.sectorShellAdmission),
      entityCount: st.entityList.length,
      mode: st.mode,
      render: st.render && {
        tick: st.tick,
        presentationPublisher: st.render.presentationPublisher,
        presentationWorld: st.render.presentationWorld && {
          allocations: st.render.presentationWorld.allocations,
          entities: st.render.presentationWorld.entities,
          active: st.render.presentationWorld.active,
        },
        activityFrame: st.render.activityFrame && {
          glassIds: st.render.activityFrame.renderGlassIds && st.render.activityFrame.renderGlassIds.size,
        },
      },
      laneTap: window.__laneTap || null,
      meshCount: (() => { let n = 0; for (const e of st.entities.values()) if (e.mesh) n++; return n; })(),
      laneDiag: (window.SF.simLaneDiag && window.SF.simLaneDiag()) || null,
      loopDiag: (window.SF.loop && window.SF.loop.getDiagnostics && window.SF.loop.getDiagnostics()) || null,
      presentationFrame: (() => {
        const f = window.SF.loop && window.SF.loop.getPresentationFrame && window.SF.loop.getPresentationFrame();
        return f ? {
          journalStart: f.journalStart, journalEnd: f.journalEnd,
          journalRecordCount: f.journalRecordCount,
          journalFullRebuild: f.journalFullRebuild,
          journalRebuildGeneration: f.journalRebuildGeneration,
          journalValid: f.journalValid,
          completedTickCount: f.completedTickCount,
          completedTick: f.completedTick && {
            sequence: f.completedTick.sequence, tick: f.completedTick.tick,
            journalStart: f.completedTick.journalStart, journalEnd: f.completedTick.journalEnd,
            fullRebuild: f.completedTick.fullRebuild,
            rebuildGeneration: f.completedTick.rebuildGeneration,
          },
        } : null;
      })(),
      journal: (() => {
        const j = window.SF.ctx && window.SF.ctx.presentationJournal;
        if (!j) return null;
        const out = {
          writeSequence: j.getWriteSequence(),
          oldest: j.getOldestSequence(),
          needsRebuild: j.needsRebuild(),
          rebuildGen: j.getRebuildGeneration(),
          lastRebuildStart: j.getLastRebuildStart(),
          lastRebuildEnd: j.getLastRebuildEnd(),
          diag: j.getDiagnostics && j.getDiagnostics(),
        };
        try {
          const s = {}; let n = 0; const kinds = {};
          n = j.visitRange(out.oldest, out.writeSequence, s, (rec) => {
            kinds[rec.kind] = (kinds[rec.kind] || 0) + 1; n++;
          });
          out.visitApplied = n; out.kinds = kinds;
          out.hasFull = j.hasRange(out.oldest, out.writeSequence);
        } catch (e) { out.visitError = String(e); }
        return out;
      })(),
      pf: null,
    };
  }).catch((e) => ({ error: String(e) }));
  console.log(JSON.stringify(readiness, null, 2).slice(0, 12000));
  await browser.close();
} finally {
  server.kill();
}
