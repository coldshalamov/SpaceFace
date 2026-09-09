#!/usr/bin/env node
// Writes src/data/credits.js — the credits screen's data (Frontend Task B §1.6; closes the
// third-party-notice obligation from PQ-033.00).
//
// Sources, all read at build time so the screen never guesses:
//   - package.json `author` (else "SpaceFace") and every `dependencies` entry;
//   - node_modules/<pkg>/package.json for the version, licence id, author and homepage;
//   - node_modules/<pkg>/LICENSE* for the full licence text (a short canonical notice when the
//     package ships none, as Rapier's compat build does);
//   - styles/fonts/ for the vendored faces and the OFL text that ships beside them.
//
// `npm run credits` regenerates the file; commit the result.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, 'src', 'data', 'credits.js');

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function authorName(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.replace(/\s*<[^>]*>|\s*\([^)]*\)/g, '').trim();
  return String(value.name || '').trim();
}

function readLicenseText(dir) {
  if (!existsSync(dir)) return '';
  const file = readdirSync(dir).find((name) => /^(LICEN[CS]E|COPYING)(\..*)?$/i.test(name));
  return file ? readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim() : '';
}

const CANONICAL_NOTICES = {
  'Apache-2.0': (name, holder) => [
    `${name}${holder ? ' — ' + holder : ''}`,
    '',
    'Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except',
    'in compliance with the License. You may obtain a copy of the License at',
    '',
    '    http://www.apache.org/licenses/LICENSE-2.0',
    '',
    'Unless required by applicable law or agreed to in writing, software distributed under the License',
    'is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express',
    'or implied. See the License for the specific language governing permissions and limitations under',
    'the License.',
  ].join('\n'),
};

const libraries = Object.keys(pkg.dependencies || {}).sort().map((name) => {
  const dir = path.join(ROOT, 'node_modules', ...name.split('/'));
  const meta = existsSync(path.join(dir, 'package.json'))
    ? JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
    : {};
  const license = typeof meta.license === 'string' ? meta.license : (meta.license && meta.license.type) || 'see package';
  const author = authorName(meta.author) || (Array.isArray(meta.contributors) ? authorName(meta.contributors[0]) : '');
  const homepage = meta.homepage || (meta.repository && String(meta.repository.url || meta.repository)
    .replace(/^git\+/, '').replace(/\.git$/, '')) || '';
  let text = readLicenseText(dir);
  if (!text && CANONICAL_NOTICES[license]) text = CANONICAL_NOTICES[license](name, author);
  return { name, version: meta.version || pkg.dependencies[name], license, author, homepage, text };
});

// The vendored faces. Files live in styles/fonts/; the OFL text ships beside Bricolage and covers
// every OFL face here (the licence is the same text, only the reserved font names differ).
const oflText = readLicenseText(path.join(ROOT, 'styles', 'fonts')).trim()
  || readFileSync(path.join(ROOT, 'styles', 'fonts', 'OFL-BricolageGrotesque.txt'), 'utf8').replace(/\r\n/g, '\n').trim();
const fontFiles = readdirSync(path.join(ROOT, 'styles', 'fonts')).filter((f) => /\.woff2$/i.test(f));
const has = (prefix) => fontFiles.some((f) => f.startsWith(prefix));
const type = [
  has('bricolage-grotesque') && { name: 'Bricolage Grotesque', author: 'Mathieu Triay', license: 'OFL 1.1', role: 'display face' },
  has('instrument-sans') && { name: 'Instrument Sans', author: 'Instrument', license: 'OFL 1.1', role: 'text face' },
  has('spline-sans-mono') && { name: 'Spline Sans Mono', author: 'Eben Sorkin, Mirko Velimirović', license: 'OFL 1.1', role: 'Asteroid Works numerals' },
  has('plex-sans') && { name: 'IBM Plex Sans', author: 'IBM', license: 'OFL 1.1', role: 'legacy instrument face' },
  has('plex-mono') && { name: 'IBM Plex Mono', author: 'IBM', license: 'OFL 1.1', role: 'legacy numerals' },
  has('saira-scond') && { name: 'Saira Semi Condensed', author: 'Omnibus-Type', license: 'OFL 1.1', role: 'legacy display face' },
].filter(Boolean);

const credits = {
  generatedAt: new Date().toISOString().slice(0, 10),
  madeBy: authorName(pkg.author) || 'SpaceFace',
  version: pkg.version || '',
  type,
  libraries: libraries.map(({ text, ...rest }) => rest),
  notices: [
    ...libraries.filter((l) => l.text).map((l) => ({ name: `${l.name} ${l.version}`, license: l.license, text: l.text })),
    { name: 'SIL Open Font License 1.1 (every vendored face above)', license: 'OFL 1.1', text: oflText },
  ],
};

const banner = [
  '// GENERATED by scripts/write-credits.mjs — do not edit by hand; run `npm run credits`.',
  '// The credits screen (src/ui/screens/credits.js) reads this. Third-party notices (PQ-033.00).',
  '',
].join('\n');
writeFileSync(OUT, banner + 'export const CREDITS = ' + JSON.stringify(credits, null, 2) + ';\n', 'utf8');
console.log(`wrote ${path.relative(ROOT, OUT)}: ${credits.libraries.length} libraries, ${credits.type.length} faces, ${credits.notices.length} notices`);
