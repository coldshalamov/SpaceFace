// Every Deckplate module ships its CSS as a template literal, and this repo writes prose comments
// with markdown quoting. One backtick inside that template ends the string and takes the module
// with it. It has happened three times in this tree — twice in a shader comment, twice in this
// layer — and the third time got past a parity check, because a quoted phrase has TWO backticks,
// balances, and still ends the template and reopens it around live JS.
//
// So the rule is positional, not a count: inside a CSS template there are no backticks at all,
// except the `${...}` interpolations the module deliberately uses. Ordinary JS elsewhere in the
// file (icons.js builds markup with template literals) is none of this test's business.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'deckplate');
const FENCE = '`';
const OPENS = new RegExp(`^export const [A-Z0-9_]+ = ${FENCE}$`);

test('no Deckplate CSS template holds a stray backtick', () => {
  const files = readdirSync(DIR).filter((name) => name.endsWith('.js'));
  assert.ok(files.length >= 6, 'the deckplate layer should have its modules');
  const strays = [];
  for (const name of files) {
    const lines = readFileSync(join(DIR, name), 'utf8').split('\n');
    let inside = false;
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!inside) { if (OPENS.test(trimmed)) inside = true; return; }
      if (trimmed === `${FENCE};`) { inside = false; return; }
      // `${...}` is the one legal use inside a CSS template: the module splicing in a constant.
      const bare = line.replaceAll(`${FENCE}$` + '{', '').replaceAll(FENCE + ';', '');
      if (bare.includes(FENCE)) strays.push(`${name}:${i + 1}  ${trimmed.slice(0, 70)}`);
    });
    assert.equal(inside, false, `${name} never closes a CSS template it opened`);
  }
  assert.deepEqual(strays, [], 'a backtick inside a CSS template ends the template');
});

test('the whole system still parses and carries its primitives', async () => {
  const { DECKPLATE_CSS } = await import('../src/ui/deckplate/index.js');
  for (const cls of ['dp-frame', 'dp-title__name', 'dp-menu__item', 'dp-field__slot',
    'dp-table__row', 'dp-work', 'dp-plate', 'dp-etch', 'dp-lamp', 'dp-logotype', 'dp-monogram']) {
    assert.ok(DECKPLATE_CSS.includes(`.${cls}`), `${cls} is missing from the combined sheet`);
  }
  // A truncated template loses its tail, and a tail of CSS is a pile of unclosed braces. This is
  // the check that would have caught the shape the parity count missed.
  const opens = (DECKPLATE_CSS.match(/\{/g) || []).length;
  const closes = (DECKPLATE_CSS.match(/\}/g) || []).length;
  assert.equal(opens, closes, 'the combined sheet has unbalanced braces — a template was cut short');
  // One system, one root: no module may declare a competing prefix.
  for (const stray of ['--k-s:', '--sf-you:', '--fh-ground:']) {
    assert.ok(!DECKPLATE_CSS.includes(stray), `Deckplate must not declare ${stray}`);
  }
});
