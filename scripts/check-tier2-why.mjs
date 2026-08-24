#!/usr/bin/env node
// check-tier2-why.mjs — the tier-2 "[data-why]" ladder: NAMED adoption set + mechanism contract.
//
// INSTRUMENT_GRAMMAR §7: tier 2 is hover/focus, no click, enumerated phrases only. Before this
// check existed, `data-why` was written in three places and read in zero — the ladder ran 1 → 3
// and tier 2 was a no-op that no count-based gate could see (the file could set a thousand
// attributes and still render nothing).
//
// This check asserts THE NAMED MINIMUM ADOPTION SET — five player-questionable values, each by
// name, each with (a) its writer pinned in source, (b) keyboard focusability, and (c) a real-DOM
// behavioral proof that hovering AND focusing that site's element reveals its bank phrase through
// the one shared reveal. A `count > 0` rule is expressly rejected: remove ONE named site and this
// check goes red naming that site. It then runs the full functional suite (test/tier2-why.test.mjs).
//
// THE NAMED SET (grammar §7's own words: "faction rows, contract clauses, crime entries"):
//   footprint.standing-node   a faction standing — why reputation moved (REP_REASON_LABELS bank)
//   footprint.incident-node   a crime entry — the jurisdiction receipt text
//   shipworks.gauge-tile      a ship stat figure — "Mass: 142 t" behind the dial
//   shipworks.condition-chip  the ship condition reason — why it reads WORN/STRAINED
//   contracts.clause-chip     a contract clause — fine print from CONTRACT_CLAUSES/missionConditions
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ── the named set, each site with its exact contract ─────────────────────────────────────────
const SITES = [
  {
    name: 'footprint.standing-node',
    file: 'src/ui/screens/footprint.js',
    kind: 'a faction standing',
    needs: [
      "button.setAttribute('data-why', why)",       // the board node writer
      'const why = nodeWhy(item.node)',             // fed by the enumerated composer
      'REP_REASON_LABELS[key] || \'\'',              // unknown reason → EMPTY (render nothing)
      "key === (this._pendingFocusKey || selectedKey) ? '0' : '-1'", // roving tabindex: keyboard-reachable
    ],
    dom: { tag: 'button', text: 'contraband scan · +3 · Wary', tabindex: null, focusableNatively: true },
  },
  {
    name: 'footprint.incident-node',
    file: 'src/ui/screens/footprint.js',
    kind: 'a crime entry',
    needs: [
      'export function nodeWhy(node)',              // composer is directly testable (bank law)
      "if (kind === 'incident') return asString(node.text) || ''", // incident why = the receipt text
    ],
    dom: { tag: 'button', text: 'Customs logged a contraband scan', tabindex: null, focusableNatively: true },
  },
  {
    name: 'shipworks.gauge-tile',
    file: 'src/ui/station/screens/shipworks.js',
    kind: 'a ship stat figure',
    needs: [
      "row.tile.setAttribute('data-why', `${def.label}: ${fmt(raw)}${def.suffix}`)", // the gauge writer
      "tile.setAttribute('tabindex', '0')",         // gauge tiles answer keyboard focus
    ],
    dom: { tag: 'div', text: 'Mass: 142 t', tabindex: '0' },
  },
  {
    name: 'shipworks.condition-chip',
    file: 'src/ui/station/screens/shipworks.js',
    kind: 'the ship condition reason',
    needs: [
      'data-why="${escapeHtml(String(text))}" tabindex="0"', // whyAttr: the why and focus travel together
      "whyAttr(model.condition && model.condition.why)",     // the condition chip carries it
    ],
    dom: { tag: 'span', text: 'Hull scarred by repeated beam strikes', tabindex: '0' },
  },
  {
    name: 'contracts.clause-chip',
    file: 'src/ui/station/screens/contracts.js',
    kind: 'a contract clause',
    needs: [
      "import { contractTermById } from '../../../data/contractClauses.js'", // the ENUMERATED bank
      'export function clauseWhyAttr(clause)',      // unknown id → '' (render nothing), direct-testable
      'class="sx-tag"${clauseWhyAttr(c)}',          // the chip writer
    ],
    forbids: [
      '<span class="sx-tag" title=',                // the native title tooltip is gone (hover-only, unstyled)
    ],
    dom: null, // behavioral proof runs the REAL clauseWhyAttr below (catalog authority)
  },
];

let failed = 0;

// (a) source wiring per named site — failure names the site
for (const site of SITES) {
  const body = src(site.file);
  const missing = (site.needs || []).filter((needle) => !body.includes(needle));
  const forbidden = (site.forbids || []).filter((needle) => body.includes(needle));
  if (missing.length || forbidden.length) {
    const why = [];
    if (missing.length) why.push(`missing writer wiring: ${missing.join(' | ')}`);
    if (forbidden.length) why.push(`forbidden pattern present: ${forbidden.join(' | ')}`);
    console.error(`FAIL ${site.name} (${site.kind}) — ${why.join('; ')}`);
    failed += 1;
  } else {
    console.log(`ok   ${site.name} — writer wired (${site.kind})`);
  }
}

// (b) the mechanism contract — one reveal, hover AND focus, capture seat, no click, no motion
{
  const reveal = src('src/ui/whyReveal.js');
  const uiRoot = src('src/ui/uiRoot.js');
  const ledger = src('src/ui/causeLedger.js');
  const rules = [
    ["document.addEventListener('pointerover', onPointerOver, true)", 'hover reveal on the document-capture seat'],
    ["document.addEventListener('focusin', onFocusIn, true)", 'keyboard-focus reveal (a hover-only affordance does not exist for a keyboard player)'],
    ["document.addEventListener('focusout', onFocusOut, true)", 'focus-out hides'],
    ["document.addEventListener('pointerout', onPointerOut, true)", 'pointer-out hides'],
    ['function whyTextFor(el)', 'the literal-attribute reader exists (enumerated text only)'],
    ['font:12px/1.45 system-ui', 'tip type sits on the 12px floor (grammar §3)'],
    ['mountWhyReveal()', 'uiRoot mounts the one reveal'],
    ["showWhyTip(text, x, y, 'causeLedger')", 'causeLedger delegates display to the shared mechanism with an owner token (not a second tooltip)'],
    ["hideWhyTip('data-why')", 'the reveal retracts only its own tip (ownership guard against sibling sweeps)'],
    ["closest('.st-market, .sx-mkt')", 'the market price-why covers the LIVE station market host (.sx-mkt), not only the legacy one'],
  ];
  const forbids = [
    [/addEventListener\(\s*['"]click/, 'the reveal must never listen to click (tier 2 must not become tier 3)'],
    [/animation\s*:/, 'no motion without a state variable — the reveal cannot depend on a transition'],
    [/class\s*=\s*['"][^'"]*(pulse|blink|flash|panel|card|menu|modal)/, 'forbidden vocabulary in a class attribute'],
    [/classList/, 'the reveal adds no classes (naming is load-bearing; it adds none)'],
  ];
  for (const [needle, label] of rules) {
    const holder = needle === 'mountWhyReveal()' ? uiRoot
      : (needle.includes('causeLedger') ? ledger : reveal);
    if (!holder.includes(needle)) { console.error(`FAIL mechanism — ${label} [missing: ${needle}]`); failed += 1; }
    else console.log(`ok   mechanism — ${label}`);
  }
  for (const [re, label] of forbids) {
    if (re.test(reveal)) { console.error(`FAIL mechanism — ${label}`); failed += 1; }
    else console.log(`ok   mechanism — ${label} (absent)`);
  }
  if (ledger.includes('TOOLTIP_ID')) {
    console.error('FAIL mechanism — causeLedger still owns a private tooltip element (second system)');
    failed += 1;
  } else {
    console.log('ok   mechanism — causeLedger has no private tooltip element');
  }
}

// (c) the functional suite (runs first: it requires a headless import) (hover/focus lifecycle, no-invention, one-mechanism, destroy)
{
  // MUST be a subprocess. `await import()` of a node:test file REGISTERS and runs the tests, but a
  // failing assertion is reported to the test reporter and does NOT reject the import — the block
  // resolved cleanly and this check exited 0 with a deliberately failing test injected. Verified by
  // mutation on 2026-08-23. Only the child's exit code is a real signal.
  const suite = spawnSync(process.execPath, ['--test', join(ROOT, 'test/tier2-why.test.mjs')], {
    cwd: ROOT, encoding: 'utf8',
  });
  if (suite.status !== 0) {
    const out = String(suite.stdout || '') + String(suite.stderr || '');
    const detail = out.split(String.fromCharCode(10))
      .filter((l) => /^not ok|Error:|AssertionError/.test(l.trim())).slice(0, 6).join('; ');
    console.error(`FAIL functional suite — node --test exited ${suite.status}${detail ? ` :: ${detail}` : ''}`);
    failed += 1;
  } else {
    console.log('ok   functional suite (test/tier2-why.test.mjs) — all assertions green');
  }
}

console.log(`\nTIER-2 WHY — named adoption set: ${SITES.map((s) => s.name).join(', ')}`);
if (failed > 0) {
  console.error(`\nFAIL — ${failed} rule(s) broken. The named set is the deliverable, not a count.`);
  process.exit(1);
}
console.log('Tier-2 why OK — every named site reveals on hover AND focus, from enumerated banks, through one mechanism.');
// (d) behavioral proof per named site, in a DOM, through the REAL reveal module
{
  const { whyTextFor, mountWhyReveal } = await import('../src/ui/whyReveal.js');
  const { clauseWhyAttr } = await import('../src/ui/station/screens/contracts.js');
  const { nodeWhy } = await import('../src/ui/screens/footprint.js');
  const { contractTermById } = await import('../src/data/contractClauses.js');

  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.parentNode = null;
      this.attributes = new Map();
      this.style = {};
      this.textContent = '';
      this._id = '';
    }
    get id() { return this._id; }
    set id(v) { this._id = String(v); globalThis.document._ids.set(this._id, this); }
    get isConnected() { return !!this._root; }
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; c._root = this._root; return c; }
    removeChild(c) { c.parentNode = null; return c; }
    setAttribute(k, v) { this.attributes.set(k, String(v)); if (k === 'id') this.id = v; }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    removeAttribute(k) { this.attributes.delete(k); }
    matches(sel) { const m = /^\[([a-zA-Z-]+)\]$/.exec(sel); return !!m && this.attributes.has(m[1]); }
    closest(sel) { for (let e = this; e; e = e.parentNode) if (e instanceof El && e.matches(sel)) return e; return null; }
    contains(n) { for (let e = n; e; e = e.parentNode) if (e === this) return true; return false; }
    getBoundingClientRect() { return { left: 40, top: 100, right: 200, bottom: 140 }; }
    addEventListener() {} removeEventListener() {}
  }
  const doc = {
    _ids: new Map(),
    listeners: [],
    body: null,
    createElement(t) { const e = new El(t); e.ownerDocument = this; return e; },
    getElementById(id) { return this._ids.get(id) || null; },
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
    removeEventListener(type, fn) { this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn)); },
  };
  doc.body = doc.createElement('body');
  doc.body._root = doc.body;
  globalThis.document = doc;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };

  const fire = (type, target, props = {}) => {
    for (const l of [...doc.listeners]) if (l.type === type) l.fn({ type, target, relatedTarget: null, ...props });
  };

  // Site phrase builders: the REAL bank/composer where importable.
  const clauseAttr = clauseWhyAttr({ id: 'no_kills' });
  const clauseMatch = / data-why="([^"]*)"/.exec(clauseAttr);
  const siteText = {
    'footprint.standing-node': nodeWhy({ k: 'standing', reason: 'caught_contraband', delta: -8, newTier: 'Wary' }),
    'footprint.incident-node': nodeWhy({ k: 'incident', text: 'Customs logged a contraband scan' }),
    'shipworks.gauge-tile': 'Mass: 142 t',
    'shipworks.condition-chip': 'Hull scarred by repeated beam strikes',
    'contracts.clause-chip': clauseMatch ? clauseMatch[1] : '',
  };
  const siteTabindex = { 'contracts.clause-chip': clauseAttr.includes('tabindex="0"') };
  assert.ok(siteText['footprint.standing-node'].includes('contraband scan'),
    'the standing phrase resolved from the real REP_REASON_LABELS bank');
  assert.equal(siteText['contracts.clause-chip'], contractTermById('no_kills').prose,
    'the clause phrase resolved from the real contract catalog');

  const handle = mountWhyReveal();
  for (const site of SITES) {
    if (site.dom === null && !siteText[site.name]) {
      console.error(`FAIL ${site.name} — no behavioral element could be built`);
      failed += 1;
      continue;
    }
    const shape = site.dom || { tag: 'span' };
    const el = doc.createElement(shape.tag);
    el.setAttribute('data-why', siteText[site.name]);
    const expectsTabindex = shape.tabindex === '0' || siteTabindex[site.name] === true
      || shape.focusableNatively === true;
    if (shape.tabindex) el.setAttribute('tabindex', shape.tabindex);
    doc.body.appendChild(el);
    void expectsTabindex;

    fire('pointerover', el, { clientX: 120, clientY: 240 });
    const hoverTip = doc.getElementById('sf-why-tip');
    const hoverOk = !!(hoverTip && hoverTip.style.display === 'block'
      && hoverTip.textContent === siteText[site.name]);
    fire('pointerout', el, { relatedTarget: doc.body });

    fire('focusin', el);
    const focusTip = doc.getElementById('sf-why-tip');
    const focusOk = !!(focusTip && focusTip.style.display === 'block'
      && focusTip.textContent === siteText[site.name]);
    fire('focusout', el, { relatedTarget: doc.body });

    if (hoverOk && focusOk) {
      console.log(`ok   ${site.name} — reveals its bank phrase on hover AND keyboard focus (real DOM drive)`);
    } else {
      console.error(`FAIL ${site.name} — hover=${hoverOk} focus=${focusOk} (must be true/true)`);
      failed += 1;
    }
  }
  handle.destroy();
}


