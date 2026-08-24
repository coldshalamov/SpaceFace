#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const DONOR = 'refs/remotes/origin/intro-cold-open-redesign';
const REQUIRED_HOOKS = ['data-loading-label', 'data-loading-detail', 'data-loading-progress'];
const FORBIDDEN_HOOKS = [
  'data-loading-diag-stream',
  'data-loading-hex',
  'data-loading-subsystems',
  'data-loading-segments',
  'data-loading-stage-name',
  'boot-waveform-canvas',
];

function gitShow(path) {
  return execFileSync('git', ['show', `${DONOR}:${path}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

function extractElementById(html, id) {
  const idIndex = html.search(new RegExp(`\\bid=["']${id}["']`));
  if (idIndex < 0) throw new Error(`element #${id} not found`);
  const openingStart = html.lastIndexOf('<', idIndex);
  const openingEnd = html.indexOf('>', idIndex);
  if (openingStart < 0 || openingEnd < 0) throw new Error(`opening tag for #${id} is malformed`);
  const tagMatch = /^<\s*([a-zA-Z][\w:-]*)\b/.exec(html.slice(openingStart, openingEnd + 1));
  if (!tagMatch) throw new Error(`opening tag for #${id} is unrecognised`);
  const tag = tagMatch[1];
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  token.lastIndex = openingStart;
  let depth = 0;
  let match;
  while ((match = token.exec(html))) {
    const closing = /^<\s*\//.test(match[0]);
    const selfClosing = /\/\s*>$/.test(match[0]);
    if (closing) depth -= 1;
    else if (!selfClosing) depth += 1;
    if (depth === 0) return { start: openingStart, end: token.lastIndex, html: html.slice(openingStart, token.lastIndex) };
  }
  throw new Error(`closing tag for #${id} not found`);
}

function assertContract(fragment) {
  for (const hook of REQUIRED_HOOKS) {
    if (!fragment.includes(hook)) throw new Error(`donor boot fragment lost required hook ${hook}`);
  }
  for (const hook of FORBIDDEN_HOOKS) {
    if (fragment.includes(hook)) throw new Error(`donor boot fragment still contains forbidden hook ${hook}`);
  }
  if (!/boot-terminal-canvas/.test(fragment)) throw new Error('signal-field canvas was lost');
}

if (!existsSync('index.html')) throw new Error('index.html missing');
const currentIndex = readFileSync('index.html', 'utf8');
const donorIndex = gitShow('index.html');
const currentBoot = extractElementById(currentIndex, 'boot-overlay');
const donorBoot = extractElementById(donorIndex, 'boot-overlay');
assertContract(donorBoot.html);

let fragment = donorBoot.html;
fragment = fragment.replace(
  /(<[^>]+id=["']boot-overlay["'][^>]*)(>)/i,
  (full, open, close) => {
    let next = open;
    if (!/\baria-label=/.test(next)) next += ' aria-label="Loading SpaceFace"';
    if (!/\baria-busy=/.test(next)) next += ' aria-busy="true"';
    return `${next}${close}`;
  },
);

const adaptedIndex = `${currentIndex.slice(0, currentBoot.start)}${fragment}${currentIndex.slice(currentBoot.end)}`;
for (const hook of REQUIRED_HOOKS) {
  if (!adaptedIndex.includes(hook)) throw new Error(`adapted index lost ${hook}`);
}
for (const hook of FORBIDDEN_HOOKS) {
  if (adaptedIndex.includes(hook)) throw new Error(`adapted index retained ${hook}`);
}
writeFileSync('index.html', adaptedIndex);

const donorCss = gitShow('styles/intro.css');
if (!/boot-terminal-canvas|boot-signal|boot-overlay/i.test(donorCss)) throw new Error('donor intro stylesheet does not target the boot field');
if (/SYS_DIAGNOSTICS|HEAP_DUMP|CARRIER_SIGNAL_WAVE/i.test(donorCss)) throw new Error('donor stylesheet still encodes fake terminal chrome');
writeFileSync('styles/intro.css', donorCss);

console.log(JSON.stringify({
  adaptedElement: 'boot-overlay',
  preservedCurrentPrefixBytes: currentBoot.start,
  preservedCurrentSuffixBytes: currentIndex.length - currentBoot.end,
  requiredHooks: REQUIRED_HOOKS,
  forbiddenHooks: FORBIDDEN_HOOKS,
}, null, 2));
