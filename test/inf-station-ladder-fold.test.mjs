// RC-49 regression pin: a station ladder that scrolls under the destination rail never dissolves
// its last row. The winning cascade rule for each ladder either pairs its fold with a matching
// scroll pad (the fade lands on empty column at scroll end) or removes the fold outright because
// the screen snaps its window to a whole rung. The behavioral proof is the live layout check
// (`node scripts/check-ui-layout.mjs --viewport=1280x720`) and the bench shots; this pins the CSS
// contract between bench passes. The landed shape (742cc8ebf97) scrolls the market register's
// browser rail, not the outer column.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8');

/** Every [data-overflow="1"] rule for a ladder, in sheet order (the last is the cascade winner). */
function overflowRules(source, selectorNeedle) {
  return source.split('\n').filter((line) => line.includes(selectorNeedle)
    && line.includes('data-overflow="1"') && /mask-image|padding-bottom/.test(line));
}

test('market register pairs its fold with a matching scroll pad (RC-49)', () => {
  const rules = overflowRules(read('src/ui/orrery/marketLayouts.js'), '.sx-mkt-browser__rail');
  assert.ok(rules.length >= 1, 'market rail fold/pad rule missing');
  const last = rules[rules.length - 1];
  const fold = Number((last.match(/calc\(100% - (\d+)px\)/) || [])[1]);
  const pad = Number((last.match(/padding-bottom:(\d+)px/) || [])[1]);
  assert.equal(fold, pad, `market fold (${fold}) must equal its scroll pad (${pad})`);
  assert.ok(fold >= 24, `market fold should be about a row deep, got ${fold}`);
});

test('industry ladder ends on a whole rung: fold+pad when scrolling, mask off when snapped', () => {
  const source = read('src/ui/orrery/stationTabsLayouts.js');
  const rules = overflowRules(source, '.sx-ind__list');
  assert.ok(rules.length >= 1, 'industry ladder rules missing');
  const last = rules[rules.length - 1];
  const fold = Number((last.match(/calc\(100% - (\d+)px\)/) || [])[1]);
  const pad = Number((last.match(/padding-bottom:(\d+)px/) || [])[1]);
  assert.equal(fold, pad, `industry fold (${fold}) must equal its scroll pad (${pad})`);
  assert.ok(fold >= 24, `industry fold should be a rung deep, got ${fold}`);
  // the screen's rung snap retires the fold entirely rather than dissolving a half rung
  assert.match(source, /\.sx-ind__list\[data-snapped="1"\] \{ -webkit-mask-image:none !important; mask-image:none !important; \}/);
});

test('missions board dissolves nothing: its winning rule removes the fold', () => {
  const rules = overflowRules(read('src/ui/orrery/stationTabsLayouts.js'), '.sx-ct__board');
  assert.ok(rules.length >= 1, 'missions board fold rules missing');
  const last = rules[rules.length - 1];
  assert.match(last, /mask-image:none !important/, 'board must not fade its rows at the rail');
  assert.doesNotMatch(last, /padding-bottom:\d+px/);
});

test('the market screen syncs its ladder extent on the scrolling rail', () => {
  const screen = read('src/ui/station/screens/market.js');
  assert.match(screen, /import \{ syncScrollExtent \} from '\.\.\/\.\.\/orrery\/scrollExtent\.js'/);
  assert.match(screen, /syncScrollExtent\(listEl\.querySelector\('\.sx-mkt-browser__rail'\)\)/);
});
