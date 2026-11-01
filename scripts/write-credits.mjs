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

// CC0 files promoted out of the reference library into runtime. The rows are authored here —
// the promoted file, its runtime role and its origin live nowhere else — while licence text is
// read at build time from the notices beside the source files (Poly Haven ships no licence file
// in the reference tree, so its notice is the authored CC0 deed text). The scanner test
// (inf-oct17-pro-23) checks every recorded promotion against these rows; add a row whenever a
// reference file is promoted into a shipped path.
const CC0_ROOT = path.join(ROOT, 'assets', 'reference', 'cc0');
const KENNEY_INTERFACE_LICENSE = readLicenseText(path.join(CC0_ROOT, 'kenney', 'interface'));
const POLYHAVEN_FOUNDRY_NOTICE = [
  'Poly Haven — Industrial Workshop Foundry (2K HDR)',
  'Source: https://polyhaven.com/a/industrial_workshop_foundry',
  'License: CC0 1.0 (Creative Commons Zero, CC0)',
  'https://polyhaven.com/license',
  '',
  'CC0 1.0 Universal Public Domain Dedication:',
  'The person who associated a work with this deed has dedicated the work to the public domain by waiving all of his or her rights to the work worldwide under copyright law, including all related and neighboring rights, to the extent allowed by law.',
  'You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission.',
].join('\n');
const assets = [
  {
    name: 'Kenney — Interface Sounds (Denied Latch)',
    author: 'Kenney', license: 'CC0',
    role: 'sound: the Massline\'s refused-latch tick',
    homepage: 'https://kenney.nl/assets/interface-sounds',
    origin: 'kenney/interface/Audio/tick_001.ogg',
    promotedFile: 'assets/audio/massline/massline_deny.wav',
    licenseText: KENNEY_INTERFACE_LICENSE,
  },
  {
    name: 'Kenney — Interface Sounds (UI Hover)',
    author: 'Kenney', license: 'CC0',
    role: 'sound: the menu hover tick',
    homepage: 'https://kenney.nl/assets/interface-sounds',
    origin: 'kenney/interface/Audio/tick_002.ogg',
    promotedFile: 'assets/audio/ui/ui_hover.wav',
    licenseText: KENNEY_INTERFACE_LICENSE,
  },
  {
    name: 'Kenney — Interface Sounds (UI Tab)',
    author: 'Kenney', license: 'CC0',
    role: 'sound: the tab selection tick',
    homepage: 'https://kenney.nl/assets/interface-sounds',
    origin: 'kenney/interface/Audio/select_002.ogg',
    promotedFile: 'assets/audio/ui/ui_tab.wav',
    licenseText: KENNEY_INTERFACE_LICENSE,
  },
  {
    name: 'Poly Haven — Industrial Workshop Foundry',
    author: 'Poly Haven', license: 'CC0',
    role: 'lighting: the industrial workshop environment',
    homepage: 'https://polyhaven.com/a/industrial_workshop_foundry',
    origin: 'polyhaven/industrial_workshop_foundry/industrial_workshop_foundry_2k.hdr',
    promotedFile: 'assets/background/env/industrial_workshop_foundry_2k.hdr',
    licenseText: POLYHAVEN_FOUNDRY_NOTICE,
  },
];

// The vendored faces. Files live in styles/fonts/; the OFL text ships beside Bricolage and covers
// every OFL face here (the licence is the same text, only the reserved font names differ).
const oflText = readLicenseText(path.join(ROOT, 'styles', 'fonts')).trim()
  || readFileSync(path.join(ROOT, 'styles', 'fonts', 'OFL-BricolageGrotesque.txt'), 'utf8').replace(/\r\n/g, '\n').trim();
const fontFiles = readdirSync(path.join(ROOT, 'styles', 'fonts')).filter((f) => /\.woff2$/i.test(f));
const has = (prefix) => fontFiles.some((f) => f.startsWith(prefix));
const type = [
  has('archivo') && { name: 'Archivo', author: 'Omnibus-Type', license: 'OFL 1.1', role: 'display face, labels and numerals' },
  has('bricolage-grotesque') && { name: 'Bricolage Grotesque', author: 'Mathieu Triay', license: 'OFL 1.1', role: 'secondary display face' },
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
  assets,
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
