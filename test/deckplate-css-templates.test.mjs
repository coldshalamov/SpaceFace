// Every Deckplate module ships its CSS as a template literal, so ONE stray backtick — a markdown
// quote in a prose comment, which is how the rest of this repo writes comments — silently ends the
// string and takes the whole module with it. It has happened three times in this tree: twice in a
// shader comment, twice in this layer during the 2026-09-22 frame pass. `node --check` catches it,
// but only if someone runs it; this is the version that runs itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'deckplate');

test('no Deckplate CSS template holds a stray backtick', async () => {
  const files = readdirSync(DIR).filter((name) => name.endsWith('.js'));
  assert.ok(files.length >= 6, 'the deckplate layer should have its modules');
  for (const name of files) {
    const src = readFileSync(join(DIR, name), 'utf8');
    // A CSS module opens exactly one template per export and closes it with `;` on its own line.
    // Count the fences: an odd tail means a comment ate one.
    const fences = (src.match(/`/g) || []).length;
    assert.equal(fences % 2, 0, `${name} has an unbalanced backtick — a comment ended a CSS template`);
  }
});

test('the whole system still parses and carries its primitives', async () => {
  const { DECKPLATE_CSS } = await import('../src/ui/deckplate/index.js');
  for (const cls of ['dp-frame', 'dp-title__name', 'dp-menu__item', 'dp-field__slot',
    'dp-table__row', 'dp-work', 'dp-plate', 'dp-etch', 'dp-lamp']) {
    assert.ok(DECKPLATE_CSS.includes('.' + cls), `${cls} is missing from the combined sheet`);
  }
  // One system, one root: no module may declare a competing prefix.
  for (const stray of ['--k-s:', '--sf-you:', '--fh-ground:']) {
    assert.ok(!DECKPLATE_CSS.includes(stray), `Deckplate must not declare ${stray}`);
  }
});
