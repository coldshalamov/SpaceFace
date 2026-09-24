// DIAG (worktree-only): which save section grows across public F5/F9 cycles.
// The release soak recorded saveBytes climbing ~250KB -> ~860KB over 208 cycles
// (~3KB/cycle). A growing save means a growing world -> more materialized content
// -> renderer resource + heap drift. This names the accumulating section.
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { flightReadyInPage } from './lib/alphaLiveBaselineRoute.mjs';

const CYCLES = Math.max(1, Number(process.env.DIAG_CYCLES || 4));

const server = await acquireVisualProbeServer({ root: process.cwd() });
if (!server.ownsServer) throw new Error('expected an owned in-process server');
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 60_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 10_000 });
  }
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 60_000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: 300_000 });
  console.log('flight ready');

  const readSave = () => page.evaluate(async () => {
    const keys = Object.keys(localStorage).filter((k) => /save/i.test(k));
    const out = {};
    for (const k of keys) {
      const raw = localStorage.getItem(k) || '';
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch { /* binary/chunked */ }
      out[k] = { bytes: raw.length, parsed };
    }
    return out;
  });

  const sectionSizes = (parsed) => {
    if (!parsed || typeof parsed !== 'object') return null;
    const root = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    const sizes = {};
    for (const [key, value] of Object.entries(root)) {
      try { sizes[key] = JSON.stringify(value).length; } catch { sizes[key] = -1; }
    }
    // One level deeper for the largest sections so the growing leaf is named.
    const deep = {};
    for (const [key, value] of Object.entries(root)) {
      if (!value || typeof value !== 'object') continue;
      const sub = {};
      for (const [k2, v2] of Object.entries(value)) {
        try { sub[k2] = JSON.stringify(v2).length; } catch { sub[k2] = -1; }
      }
      deep[key] = sub;
    }
    return { sizes, deep };
  };

  let prev = null;
  for (let i = 0; i <= CYCLES; i += 1) {
    if (i > 0) {
      await page.keyboard.press('F5');
      await page.waitForTimeout(1500);
      await page.keyboard.press('F9');
      await page.waitForFunction(() => window.SF?.state?.mode === 'flight', null, { timeout: 180_000 });
      await page.waitForTimeout(2500);
    }
    const saves = await readSave();
    for (const [k, entry] of Object.entries(saves)) {
      const rep = sectionSizes(entry.parsed);
      console.log(`cycle ${i} ${k}: ${entry.bytes}B`);
      if (!rep) { console.log('  (unparsed/chunked)'); continue; }
      // Classify world.records.byId: which kinds/retention classes accumulate.
      const wr = entry.parsed && entry.parsed.data && entry.parsed.data.world
        && entry.parsed.data.world.records && entry.parsed.data.world.records.byId;
      if (wr && typeof wr === 'object') {
        const recs = Object.values(wr).filter((r) => r && typeof r === 'object');
        const byKind = {};
        const byClass = {};
        let withJobId = 0;
        let permanent = 0;
        const PERM_KINDS = new Set(['mission_target', 'wreck', 'aftermath']);
        for (const r of recs) {
          byKind[r.kind || '?'] = (byKind[r.kind || '?'] || 0) + 1;
          const perm = PERM_KINDS.has(r.kind) || r.outcome === 'defeated' || r.outcome === 'destroyed'
            || r.playerOwned === true || r.playerCreated === true || r.named === true
            || !!(r.missionId || r.missionTag || r.jobId)
            || (r.deactivation && r.deactivation.reason === 'player');
          const cls = perm ? 'permanent' : (r.retentionClass || 'recent');
          byClass[cls] = (byClass[cls] || 0) + 1;
          if (r.jobId) { withJobId += 1; permanent += 1; }
        }
        console.log(`  records total=${recs.length} byKind=${JSON.stringify(byKind)} byClass=${JSON.stringify(byClass)} withJobId=${withJobId}`);
        const permReasons = {};
        for (const r of recs) {
          const reasons = [];
          if (PERM_KINDS.has(r.kind)) reasons.push(`kind:${r.kind}`);
          if (r.outcome === 'defeated' || r.outcome === 'destroyed') reasons.push(`outcome:${r.outcome}`);
          if (r.playerOwned === true) reasons.push('playerOwned');
          if (r.playerCreated === true) reasons.push('playerCreated');
          if (r.named === true) reasons.push('named');
          if (r.missionId) reasons.push('missionId');
          if (r.missionTag) reasons.push('missionTag');
          if (r.jobId) reasons.push('jobId');
          if (r.deactivation && r.deactivation.reason === 'player') reasons.push('deactivation:player');
          if (reasons.length === 0) continue;
          const key = reasons.join('+');
          permReasons[key] = (permReasons[key] || 0) + 1;
        }
        console.log(`  permanent-reasons: ${JSON.stringify(permReasons)}`);
        const convoys = recs.filter((r) => r.kind === 'convoy');
        for (const r of convoys.slice(0, 8)) {
          console.log(`    convoy ${r.recordId} alive=${r.alive} outcome=${r.outcome||'-'} jobId=${r.jobId||'-'} named=${r.named} missionId=${r.missionId||'-'} sector=${r.homeSectorId||r.sectorId} retentionClass=${r.retentionClass||'-'} intent=${r.intent&&r.intent.kind}`);
        }
      }
      const top = Object.entries(rep.sizes).sort((a, b) => b[1] - a[1]).slice(0, 10);
      for (const [name, size] of top) {
        const prevSize = prev && prev[k] && prev[k].sizes ? prev[k].sizes[name] : null;
        const delta = prevSize == null ? '' : ` (${size - prevSize >= 0 ? '+' : ''}${size - prevSize})`;
        console.log(`  ${name}: ${size}${delta}`);
        // Report the two largest sub-leaves of the biggest sections.
        const sub = rep.deep[name] || {};
        const big = Object.entries(sub).sort((a, b) => b[1] - a[1]).slice(0, 4);
        for (const [s2, sz2] of big) {
          const p2 = prev && prev[k] && prev[k].deep && prev[k].deep[name] ? prev[k].deep[name][s2] : null;
          const d2 = p2 == null ? '' : ` (${sz2 - p2 >= 0 ? '+' : ''}${sz2 - p2})`;
          console.log(`    .${s2}: ${sz2}${d2}`);
        }
      }
      if (!prev) prev = {};
      prev[k] = rep;
    }
  }
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
