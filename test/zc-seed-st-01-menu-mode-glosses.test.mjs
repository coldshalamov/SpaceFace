// SEED-ST-01 — the front door's mode verbs carry a visible gloss, not only an aria-label.
//
// No jsdom in this repo, so the two kinds of evidence stay honestly separate (the pq024
// technique): the gloss table is a real export asserted for content, and the wiring is proven
// by a scoped source slice — the two verb groups the title renders must both read the table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MENU_MODE_GLOSSES } from '../src/ui/screens/mainMenu.js';

const SRC = readFileSync(new URL('../src/ui/screens/mainMenu.js', import.meta.url), 'utf8');

test('all five non-primary mode verbs carry a one-line gloss', () => {
  for (const action of ['crucible', 'archive', 'circuits', 'sandbox', 'physics']) {
    const gloss = MENU_MODE_GLOSSES[action];
    assert.equal(typeof gloss, 'string', `missing gloss for ${action}`);
    assert.ok(gloss.length > 8 && gloss.length < 60, `${action} gloss should be a one-liner, got "${gloss}"`);
    assert.equal(gloss, gloss.trim(), `${action} gloss has stray whitespace`);
  }
  assert.equal(Object.keys(MENU_MODE_GLOSSES).length, 5, 'no stray verbs in the gloss table');
});

test('the glosses say what the mode is, not the verb again', () => {
  // The failure ST-01 fixes is a bare label; a gloss that merely repeats the label is a stub.
  assert.ok(!/^(Help|Archive|Circuits|Sandbox|Physics challenges|Crucible)$/i.test(MENU_MODE_GLOSSES.physics));
  assert.match(MENU_MODE_GLOSSES.crucible, /survival/i);
  assert.match(MENU_MODE_GLOSSES.circuits, /logic|circuit/i);
  assert.match(MENU_MODE_GLOSSES.sandbox, /flight/i);
  assert.match(MENU_MODE_GLOSSES.physics, /orbital/i);
  assert.match(MENU_MODE_GLOSSES.archive, /codex/i);
});

test('both rendered verb groups read the gloss table (wiring slice)', () => {
  // The core verb column and the quiet aside row are the only two words() groups on the title;
  // each must source subs from MENU_MODE_GLOSSES so a future verb cannot silently skip the gloss.
  const core = SRC.slice(SRC.indexOf('const items = titleVerbOrder'), SRC.indexOf('const asideItems'));
  assert.ok(core.includes('MODE_GLOSSES[action]'), 'core verb column must map sub from MENU_MODE_GLOSSES');
  const aside = SRC.slice(SRC.indexOf('const asideItems'), SRC.indexOf('const aside = words(asideItems'));
  for (const action of ['archive', 'circuits', 'sandbox', 'physics']) {
    assert.match(aside, new RegExp(`action: '${action}'.*sub: MODE_GLOSSES\\.${action}`), `aside ${action} must carry its gloss`);
  }
  // The kit renders item.sub as the visible note element for the lit system the title uses.
  const kit = readFileSync(new URL('../src/ui/kit/dom.js', import.meta.url), 'utf8');
  assert.match(kit, /if \(item\.sub\) li\.append\(el\('div', lit \? 'dp-lit__note'/);
});
