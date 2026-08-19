#!/usr/bin/env node
// check-responsive.mjs — responsive/ultrawide static contract.
//
// This gate enforces the Phase-0 responsive token contract:
//   1) one canonical ultrawide safe inset token with the exact 16:9 formula,
//   2) every persistent HUD anchor selector carries that token on its edge offset
//      in every cascade assignment (including trailing overrides),
//   3) no min-width media rule re-insets #hud itself (projection-clip hazard),
//   4) one shared stage clamp token, referenced by the instrument skeleton.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const notes = [];

function fail(rule, detail) {
  failures.push(`${rule}: ${detail}`);
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(re, text) {
  return [...text.matchAll(re)].length;
}

function selectorBlocks(cssText, selector) {
  const blocks = [];
  const re = new RegExp(`${escapeRe(selector)}\\s*\\{([\\s\\S]*?)\\}`, 'g');
  let m;
  while ((m = re.exec(cssText))) blocks.push(m[1]);
  return blocks;
}

function propertyValues(blockText, propName) {
  const values = [];
  const re = new RegExp(`${escapeRe(propName)}\\s*:\\s*([^;]+);`, 'g');
  let m;
  while ((m = re.exec(blockText))) values.push(m[1].trim());
  return values;
}

function extractHudCssFromUiRoot(source) {
  const marker = 's.textContent = `';
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const bodyStart = start + marker.length;
  const end = source.indexOf('`;', bodyStart);
  if (end < 0) return '';
  return source.slice(bodyStart, end);
}

function mediaBodies(source) {
  const out = [];
  const mediaRe = /@media[^{]*\{/g;
  let m;
  while ((m = mediaRe.exec(source))) {
    const headerStart = m.index;
    const braceStart = source.indexOf('{', headerStart);
    if (braceStart < 0) continue;
    let depth = 0;
    let i = braceStart;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (i >= source.length) break;
    out.push({
      header: source.slice(headerStart, braceStart).trim(),
      body: source.slice(braceStart + 1, i),
    });
    mediaRe.lastIndex = i + 1;
  }
  return out;
}

const uiCss = read('styles/ui.css');
const uiRootSource = read('src/ui/uiRoot.js');
const hudCss = extractHudCssFromUiRoot(uiRootSource);
if (!hudCss) {
  fail('extract/hud-css', 'failed to extract injectHudCss() template from src/ui/uiRoot.js');
}

// 1) --sf-safe-inset-x once, exact formula.
{
  const safeDeclRe = /--sf-safe-inset-x\s*:\s*max\(\s*0px\s*,\s*calc\(\s*\(\s*100vw\s*-\s*100vh\s*\*\s*16\s*\/\s*9\s*\)\s*\/\s*2\s*\)\s*\)\s*;/g;
  const count = countMatches(safeDeclRe, uiCss);
  if (count !== 1) {
    fail('safe-token/formula', `expected one exact --sf-safe-inset-x declaration, found ${count}`);
  } else {
    notes.push('safe inset token declared once with the 16:9 clamp formula');
  }
}

// 2) Named anchored selectors must carry --sf-safe-inset-x on their edge assignment(s).
{
  const layers = [
    { name: 'styles/ui.css', css: uiCss },
    { name: 'injectHudCss', css: hudCss },
  ];
  const anchors = [
    { selector: '.sf-leftstack', prop: 'left', label: 'ship stack / destination / comms anchor' },
    { selector: '.sf-rightdock', prop: 'right', label: 'contact dock anchor' },
    { selector: '#toasts', prop: 'left', label: 'receipt lane anchor' },
    { selector: '#alerts', prop: 'left', label: 'one-voice floor anchor' },
    { selector: '.sf-command-deck', prop: 'left', label: 'drive + massline lane anchor' },
    { selector: '.sf-prail', prop: 'left', label: 'power rail anchor' },
  ];

  for (const anchor of anchors) {
    let assignmentCount = 0;
    let lastValue = '';
    for (const layer of layers) {
      const blocks = selectorBlocks(layer.css, anchor.selector);
      for (const block of blocks) {
        const values = propertyValues(block, anchor.prop);
        for (const value of values) {
          assignmentCount++;
          lastValue = value;
          if (!value.includes('var(--sf-safe-inset-x')) {
            fail(
              'anchor/safe-inset',
              `${anchor.label} (${anchor.selector} ${anchor.prop}) in ${layer.name} is "${value}" (missing var(--sf-safe-inset-x))`,
            );
          }
        }
      }
    }
    if (assignmentCount === 0) {
      fail('anchor/missing', `${anchor.label} (${anchor.selector}) has no ${anchor.prop}: assignment to verify`);
      continue;
    }
    if (!lastValue.includes('var(--sf-safe-inset-x')) {
      fail('anchor/last-wins', `${anchor.label} final cascade value "${lastValue}" does not carry var(--sf-safe-inset-x)`);
    } else {
      notes.push(`${anchor.selector} ${anchor.prop}: ${assignmentCount} safe-inset assignment${assignmentCount === 1 ? '' : 's'} verified`);
    }
  }
}

// 3) no @media (min-width...) block may inset #hud itself.
{
  const combined = `${uiCss}\n${hudCss}`;
  let minWidthMediaCount = 0;
  for (const media of mediaBodies(combined)) {
    if (!/\(\s*min-width\s*:/.test(media.header)) continue;
    minWidthMediaCount++;
    const hudInsetRe = /#hud\s*\{[^}]*\b(left|right|inset|padding-inline|margin-inline)\s*:/m;
    if (hudInsetRe.test(media.body)) {
      fail('hud/clip-hazard', `min-width media rule "${media.header}" re-insets #hud`);
    }
  }
  notes.push(`${minWidthMediaCount} min-width media block${minWidthMediaCount === 1 ? '' : 's'} scanned for #hud inset hazards`);
}

// 4) --sf-stage-max once, and referenced by skeleton.
{
  const stageDeclCount = countMatches(/--sf-stage-max\s*:/g, uiCss);
  if (stageDeclCount !== 1) {
    fail('stage-token/declare', `expected one --sf-stage-max declaration, found ${stageDeclCount}`);
  }
  const s11Start = uiCss.indexOf('/* 11 ─ instrument skeleton');
  const s12Start = uiCss.indexOf('/* 12 ─ THE SHIP screen host');
  if (s11Start < 0 || s12Start < 0 || s12Start <= s11Start) {
    fail('stage-token/skeleton', 'could not isolate sections 11-12 in styles/ui.css');
  } else {
    const skeleton = uiCss.slice(s11Start, s12Start);
    if (!/var\(--sf-stage-max\)/.test(skeleton)) {
      fail('stage-token/skeleton', 'section 11 skeleton does not reference var(--sf-stage-max)');
    } else {
      notes.push('stage clamp token is referenced inside section 11 skeleton');
    }
  }
}

for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error('\ncheck:responsive FAILED');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log('check:responsive OK — safe-box anchors and stage clamp contract verified');
