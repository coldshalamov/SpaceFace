/**
 * validate_sound — actually PLAY every cue, in a real AudioContext.
 *
 * Loading the recipe table and computing durations proves nothing about synthesis: the
 * oscillators, filter sweeps, envelopes, wave-shapers and late-starting layers are only
 * constructed inside `play()`. Headless Chromium builds the whole graph silently, so this
 * exercises the path that a demo page's load never touches.
 *
 *   node assets/ui/kit/tools/validate_sound.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const KIT = path.resolve(HERE, '..');
const PAGE = path.join(KIT, 'kit', 'demo-sound.html');

const CUES = ['ui_key_press', 'ui_plate_slide', 'ui_legend_on', 'ui_legend_off', 'ui_confirm',
  'ui_deny', 'ui_open', 'ui_back', 'ui_tab', 'ui_dock', 'ui_undock', 'ui_wanted',
  'ui_crucible_enter', 'ui_tick'];

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });

await page.goto(url.pathToFileURL(PAGE).href, { waitUntil: 'load' });

const result = await page.evaluate(async (cues) => {
  const out = [];
  FH.sound.setMuted(false);
  for (const id of cues) {
    const before = FH.sound.context() ? FH.sound.context().currentTime : 0;
    let nodes = 0;
    try {
      const h = FH.sound.play(id, { force: true });
      const ctx = FH.sound.context();
      nodes = ctx ? 1 : 0;
      // let the graph exist for a beat, then stop it explicitly
      await new Promise((r) => setTimeout(r, 60));
      h.stop();
      out.push({ id, ok: true, state: ctx ? ctx.state : 'none',
                 dur: +FH.sound.duration(id).toFixed(3), advanced: ctx
                   ? +(ctx.currentTime - before).toFixed(3) : 0 });
    } catch (e) {
      out.push({ id, ok: false, error: String(e && e.message || e) });
    }
  }
  return out;
}, CUES);

let bad = 0;
for (const r of result) {
  if (!r.ok) { bad++; console.log(`! ${r.id}  ${r.error}`); continue; }
  console.log(`  ${r.id.padEnd(20)} built  ctx=${r.state}  clock +${r.advanced}s  ` +
              `declared ${r.dur}s`);
}
await browser.close();

if (problems.length) {
  bad++;
  [...new Set(problems)].forEach((p) => console.log(`! ${p}`));
}
console.log(`\n${CUES.length} cue(s) played, ${bad} failed`);
process.exit(bad ? 1 : 0);
