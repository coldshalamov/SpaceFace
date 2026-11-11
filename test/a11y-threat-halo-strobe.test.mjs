// a11y-threat-halo-strobe — every threat-halo edge telegraph honours BOTH reduced-motion
// switches ("stretch, never silence"). Authored, the inbound-missile slot, the closing-boost
// arc slot and the leftover telegraph slot run a 0.5 s steps(2) hard-step strobe; before this
// unit only "Reduce flashing" stopped the missile/arc pair, so a player on Reduce motion alone
// still got a permanently hard-stepping edge lamp while its telegraph sibling sat steady.
// Static source pins over the one production stylesheet (test/popup-motion-contract style).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/ui/views/hudStyles.js', import.meta.url), 'utf8')
  .replace(/\s+/g, ' ');

const MISSILE = '.sf-threat-halo__slot--missile';
const ARC = '.sf-threat-halo__slot--arc[data-closing="boost"]';
const TELEGRAPH = '.sf-threat-halo__slot--telegraph';
const AUTHORED = 'animation: sf-threat-halo-telegraph 0.5s steps(2, end) infinite';

test('the authored 0.5 s hard-step telegraph still exists under full settings', () => {
  assert.equal(css.split(AUTHORED).length - 1, 3,
    'missile, arc-boost and telegraph keep their authored strobe');
});

test('Reduce motion holds all three edge telegraphs steady at a legible .9, never silenced', () => {
  // One rule naming all three slots, under both reduced-motion switches the house honours.
  const classRule = `html.sf-reduce-motion ${TELEGRAPH}, html.sf-reduce-motion ${MISSILE},`
    + ` html.sf-reduce-motion ${ARC} { animation:none; opacity:.9; }`;
  const mediaRule = `@media (prefers-reduced-motion: reduce) { ${TELEGRAPH}, ${MISSILE},`
    + ` ${ARC} { animation: none; opacity:.9; } }`;
  assert.ok(css.includes(classRule), 'the html.sf-reduce-motion switch names all three slots');
  assert.ok(css.includes(mediaRule), 'the OS reduced-motion media query names all three slots');
  // The hold is a steady tell: lit at .9, never display:none / opacity:0 on these slots.
  for (const slot of [MISSILE, ARC, TELEGRAPH]) {
    for (const silenced of ['opacity:0', 'display:none']) {
      const killed = css.match(new RegExp(`sf-threat-halo__slot[^{}]*${slot.replace(/[[\]"]/g, '\\$&')}[^{}]*\\{[^}]*${silenced}`));
      assert.ok(!killed || !killed[0].includes('sf-reduce'), `${slot} is never deleted by a reduce switch`);
    }
  }
});

test('Reduce flashing still stops the strobe on all three slots', () => {
  const rule = `html.sf-reduce-flash ${MISSILE}, html.sf-reduce-flash ${ARC},`
    + ` html.sf-reduce-flash ${TELEGRAPH} { animation:none; }`;
  assert.ok(css.includes(rule), 'the existing reduce-flash guard survives untouched');
});
