// P1/P2 — no ship surface prints a second vocabulary or a raw engineering reading at rest.
//
// The Ship Sheet is the one statement of what a hull is. These checks lock the supporting
// surfaces to it: the buy column names the sheet's class + build word, the dossiers keep raw
// numbers behind Details, the sheet's own engineering block is folded, and Sable's trial does not
// resurrect the scanner's build word beside the sheet's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { partFacts } from '../src/ui/ship/partFacts.js';
import { shipStatSheet } from '../src/ui/ship/shipStats.js';
import { shipSheetHtml } from '../src/ui/ship/shipSheet.js';
import { resolveEntity } from '../src/ui/entityResolver.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the Ship Sheet keeps every raw engineering reading behind Details', () => {
  const sheet = shipStatSheet({ shipId: 'ship_kestrel', fittings: [] });
  const html = shipSheetHtml(sheet);
  const atRest = html.split('<button type="button" class="sfs__details"')[0];
  for (const term of ['Mass', 'Ram weight', 'Hull', 'Shield', 'Armour', 'Capacitor', 'Draw',
    'Cargo', 'Fight speed', 'Burn gain', 'Turn rate', 'Thrust', 'Tow class', 'Burst window']) {
    assert.ok(!atRest.includes(`<dt>${term}</dt>`), `${term} is not on the sheet at rest`);
  }
  assert.match(html, /<button type="button" class="sfs__details"/, 'the sheet has a Details door');
  assert.match(html, /<dt>Draw<\/dt>/, 'continuousDrain reads as Draw, not Heat');
  assert.doesNotMatch(html, /<dt>Heat<\/dt>/);
});

test('the buy column names the sheet class + build word and folds the raw readings', () => {
  const source = read('src/ui/station/screens/shipworks.js');
  const start = source.indexOf("if (mode === 'buy') {");
  const end = source.indexOf('// Fleet:', start);
  assert.ok(start >= 0 && end > start, 'the buy branch is present');
  const buy = source.slice(start, end);
  assert.match(buy, /shipStatSheet\(\{/, 'the buy column reads the one stat sheet');
  assert.match(buy, /sideSheet\.roleLabel/, 'the buy column prints the sheet role label');
  assert.match(buy, /sideSheet\.identity\.label/, 'the buy column prints the sheet build word');
  assert.doesNotMatch(buy, /def\.role \|\| 'ship'/, 'the buy column does not print the authored role');
  assert.doesNotMatch(buy, /T\$\{def\.tier\}/, 'the buy column does not print a bare tier digit');
  const open = buy.indexOf('<details');
  const close = buy.indexOf('</details>');
  const readings = buy.indexOf('<ul class="sx-sw-read"');
  assert.ok(open >= 0 && close > open, 'the buy column has a Details disclosure');
  assert.ok(open < readings && readings < close, 'Hull/Shield/Cargo/Mass/Speed live inside Details');
  assert.ok(buy.indexOf("reading('Hull'") > open, 'no raw reading is printed before the fold');
});

test('the hull record drops the duplicate Role and folds Hull/Cargo', () => {
  const dossier = resolveEntity({ meta: { seed: 4242 } }, 'hull:ship_kestrel');
  assert.ok(dossier);
  const keys = dossier.facts.map((fact) => fact.k);
  assert.ok(!keys.includes('Role'), 'Build already names the authored class');
  assert.ok(!keys.includes('Hull') && !keys.includes('Cargo'), 'raw hull/cargo are not decision facts');
  const detailKeys = dossier.details.map((fact) => fact.k);
  assert.ok(detailKeys.includes('Hull') && detailKeys.includes('Cargo'), 'Hull/Cargo are behind Details');
  const build = dossier.lines.find((line) => line.label === 'Build');
  assert.ok(build && build.text.includes('\u00b7'), 'Build still names the sheet class + build word');
});

test('the module record reads partFacts and folds Mass / Power draw', () => {
  const facts = partFacts('mod_filter_stack_s');
  const dossier = resolveEntity({ meta: { seed: 4242 } }, 'module:mod_filter_stack_s');
  assert.ok(dossier);
  assert.ok(dossier.kicker.includes(facts.role), `kicker names the part role (${dossier.kicker})`);
  assert.ok(dossier.kicker.includes(facts.tier), `kicker names the Mk ladder (${dossier.kicker})`);
  const does = dossier.lines.find((line) => line.label === 'Does');
  assert.equal(does && does.text, facts.sentence, 'the sentence is partFacts, not a second copy');
  const keys = dossier.facts.map((fact) => fact.k);
  assert.ok(!keys.includes('Mass') && !keys.includes('Power draw'), 'raw numbers are not decision facts');
  const detailKeys = dossier.details.map((fact) => fact.k);
  assert.ok(detailKeys.includes('Mass') && detailKeys.includes('Power draw'), 'Mass/draw live behind Details');
});

test('Sable does not print the scanner build word beside the sheet build word', () => {
  const core = read('src/core/sableDemo.js');
  const ui = read('src/ui/orrery/sableDemo.js');
  assert.doesNotMatch(core, /classifyBuildIdentity/, 'the isolated trial does not classify a build');
  assert.doesNotMatch(core, /identity\s*:/, 'the trial result carries no second build word');
  assert.doesNotMatch(ui, /run\.identity/, 'the trial caption does not print a build word');
});
