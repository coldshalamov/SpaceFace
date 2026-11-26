// CAM-UI-TRUTH-1 — focused behavioural tests for New Game and Help front-door truth.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createGameState } from '../src/core/gameState.js';
import { describeHullRole } from '../src/data/shipRoleLattice.js';
import { NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
import { controlSections, rigStations, helpScreen } from '../src/ui/screens/help.js';
import { newGameScreen } from '../src/ui/screens/newGame.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

function makeEnv(fn) {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevRO = globalThis.ResizeObserver;
  const prevMO = globalThis.MutationObserver;
  const prevGcs = globalThis.getComputedStyle;
  const doc = fakeDom();
  const baseCreate = doc.createElement;
  doc.createElement = (tag) => {
    const node = baseCreate(tag);
    node.ownerDocument = doc;
    node.offsetWidth = 120;
    node.offsetHeight = 28;
    node.offsetTop = 0;
    node.clientWidth = 400;
    node.clientHeight = 400;
    node.scrollHeight = 400;
    node.scrollTop = 0;
    let rawInnerHtml = '';
    Object.defineProperty(node, 'innerHTML', {
      get: () => rawInnerHtml,
      set(val) {
        rawInnerHtml = String(val);
        node.children = [];
        if (rawInnerHtml.includes('orr-hrig__verb')) {
          const span = doc.createElement('span');
          span.className = 'orr-hrig__verb';
          node.appendChild(span);
        }
      },
    });
    node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 120, height: 28, right: 120, bottom: 28 });
    node.getClientRects = () => [{ width: 120, height: 28 }];
    node.scrollTo = () => {};
    node.remove = () => {
      if (node.parentNode && node.parentNode.children) {
        node.parentNode.children = node.parentNode.children.filter((c) => c !== node);
      }
      node.parentNode = null;
    };
    node.removeChild = (child) => {
      if (node.children) node.children = node.children.filter((c) => c !== child);
      if (child) child.parentNode = null;
      return child;
    };
    node.removeEventListener = (name, cb) => {
      if (node.listeners && node.listeners[name]) {
        node.listeners[name] = node.listeners[name].filter((x) => x !== cb);
      }
    };
    const matchesSel = (el, sel) => {
      if (!el || !sel) return false;
      if (sel.startsWith('.')) return !!(el.classList && el.classList.contains(sel.slice(1)));
      if (sel.startsWith('#')) return el.id === sel.slice(1);
      if (sel === '[data-sfs]') return Boolean(el.attributes?.['data-sfs'] !== undefined);
      return String(el.tagName || '').toLowerCase() === sel.toLowerCase();
    };
    node.prepend = (...kids) => {
      for (let i = kids.length - 1; i >= 0; i--) {
        kids[i].parentNode = node;
        node.children.unshift(kids[i]);
      }
    };
    node.querySelectorAll = (sel) => {
      const parts = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
      const out = [];
      const walk = (n) => {
        for (const ch of n.children || []) {
          if (parts.some((p) => matchesSel(ch, p))) out.push(ch);
          walk(ch);
        }
      };
      walk(node);
      return out;
    };
    node.querySelector = (sel) => node.querySelectorAll(sel)[0] || null;
    if (!node.insertAdjacentHTML) {
      node.insertAdjacentHTML = () => {};
    }
    return node;
  };
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  doc.createTextNode = (t) => { const n = doc.createElement('#text'); n.textContent = String(t); return n; };
  globalThis.document = doc;
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  globalThis.getComputedStyle = () => ({ position: 'relative', display: 'block', overflowY: 'auto' });
  globalThis.requestAnimationFrame = undefined;
  globalThis.ResizeObserver = undefined;
  globalThis.MutationObserver = undefined;
  try {
    return fn(doc);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.getComputedStyle = prevGcs;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.ResizeObserver = prevRO;
    globalThis.MutationObserver = prevMO;
  }
}

test('New Game: Standard has its own honest blurb, not Casual copy', () => {
  const src = readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /'Standard',\s*'Softer hits on you/i,
    'Standard must not carry Casual-style softer-hits blurb');
  assert.match(src, /'Standard',\s*'The intended balance\.'/,
    'Standard describes the intended balance');
});

test('New Game: starter role labels match Shipyard shipRoleLattice, Drill Amp carries its S size, and no orphan stat blurb shows at rest', () => {
  makeEnv((doc) => {
    const root = doc.createElement('section');
    const state = createGameState(42);
    const bus = { on: () => () => {}, emit() {} };
    const screen = Object.create(newGameScreen);
    screen.mount(root, { state, bus, registry: { get: () => null } });
    try {
      const diffDesc = findAll(root, (n) => n.id === 'sf-ng-difficulty-desc')[0];
      assert.equal(diffDesc.textContent, 'Standard — The intended balance.');

      // Starter picker sub-labels match Shipyard roleLattice verbatim.
      const starterSubs = findAll(root, (n) => n.classList && n.classList.contains('k-word-sub'))
        .map((n) => n.textContent);
      for (const starter of NEW_GAME_STARTERS) {
        const expectedRole = describeHullRole(starter.shipId)?.roleLabel;
        assert.ok(expectedRole, `lattice role exists for ${starter.shipId}`);
        assert.ok(starterSubs.includes(expectedRole),
          `starter picker must print Shipyard role "${expectedRole}" (got: ${starterSubs.join(', ')})`);
      }

      // Sheet role word matches Hitch's Shipyard role ("Starter Scout"), not "Starter · Skirmisher".
      const sheetHost = findAll(root, (n) => n.classList && n.classList.contains('sf-ng-sheet'))[0];
      assert.ok(sheetHost, 'compact ship sheet mounts on New Game');
      assert.match(readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8'),
        /sheetWordEl\.textContent = starterRoleLabel\(starter\)/,
        'New Game overwrites compact sheet word with Shipyard role label');

      // Loadout: Drill Amp includes its size letter (S) and plain note.
      const loadoutList = findAll(root, (n) => n.getAttribute && n.getAttribute('aria-label') === 'Loadout')[0];
      assert.ok(loadoutList, 'Loadout list mounts');
      const items = findAll(loadoutList, (n) => String(n.tagName).toUpperCase() === 'LI');
      assert.ok(items.length >= 5, 'Hitch carries 5 starter items');
      for (const li of items) {
        const sizeNode = findAll(li, (n) => n.classList && n.classList.contains('orr-ng-size'))[0];
        assert.ok(sizeNode && /^[SMLX]{1,2}$/.test(sizeNode.textContent),
          `every starter loadout row must carry an aligned size code`);
      }
      const drillRow = items.find((li) => findAll(li, (n) => /Drill Amp/i.test(n.textContent)).length > 0);
      assert.ok(drillRow, 'Hitch loadout includes Drill Amp');
      const drillNote = findAll(drillRow, (n) => n.classList && n.classList.contains('orr-ng-mod-note'))[0];
      assert.ok(drillNote && drillNote.textContent.length > 0, 'Drill Amp explains what it does');

      // Universe seed input + New seed button exist and work.
      const seedInput = findAll(root, (n) => n.id === 'sf-ng-seed')[0];
      const newSeedBtn = findAll(root, (n) => n.dataset && n.dataset.action === 'newSeed')[0];
      assert.ok(seedInput && newSeedBtn, 'Universe seed input and New seed button are mounted');
      assert.equal(seedInput.value || '', '', 'starts blank (Random)');
      newSeedBtn.click();
      assert.match(String(seedInput.value), /^\d{1,10}$/, 'clicking New seed writes a valid numeric seed');
    } finally {
      screen.dispose();
    }
  });
});

test('Help: live mining (G), scan (C), and Line (RMB / F) match current defaults and follow rebinds', () => {
  const helmState = createGameState(42);
  helmState.mode = 'flight';
  helmState.settings.gameplay.controlScheme = 'helm-assist';

  const sections = controlSections(helmState);
  const byTitle = new Map(sections);
  const flightNow = new Map((byTitle.get('Flight now') || []).map((r) => [r[0], r[2]]));
  const flight = new Map((byTitle.get('Flight') || []).map((r) => [r[1] || r[0], r]));
  const iface = new Map((byTitle.get('Interface (fixed keys)') || []).map((r) => [r[0], r[2]]));

  assert.equal(flightNow.get('Mine beam'), 'G', 'Flight now teaches live Mine key G');
  assert.equal(flightNow.get('Scan'), 'C', 'Flight now teaches live Scan key C');
  assert.equal(flightNow.get('Line: hook, swing, throw'), 'RMB / F', 'Flight now teaches RMB / F Line');
  assert.equal(flightNow.get('Steer & aim'), 'Mouse', 'Helm Assist Flight now names Mouse steer & aim');

  assert.ok(flight.has('mine'), 'Flight list includes rebindable mine row');
  assert.ok(flight.has('scanPulse'), 'Flight list includes rebindable scanPulse row');
  assert.equal(iface.has('Mine / salvage / weld'), false,
    'stale hardcoded "hold Q → MINE/SITE BEAM" row is gone from Interface');

  // Rebinding mine and scanPulse immediately updates both Flight now and rigStations.
  const rebound = createGameState(42);
  rebound.mode = 'flight';
  rebound.settings.gameplay.controlScheme = 'helm-assist';
  rebound.settings.controls.bindings = { mine: ['KeyY'], scanPulse: ['KeyU'], tether: ['KeyR'] };
  const reboundNow = new Map((controlSections(rebound)[0][1] || []).map((r) => [r[0], r[2]]));
  assert.equal(reboundNow.get('Mine beam'), 'Y', 'rebound mine key updates Flight now');
  assert.equal(reboundNow.get('Scan'), 'U', 'rebound scan key updates Flight now');
  assert.equal(reboundNow.get('Line: hook, swing, throw'), 'RMB / R', 'rebound Line key updates Flight now');

  const reboundStations = new Map(rigStations(rebound).map((s) => [s.id, s]));
  assert.equal(reboundStations.get('mine').kb.main, 'Y');
  assert.equal(reboundStations.get('scanPulse').kb.main, 'U');
  assert.deepEqual(reboundStations.get('tether').kb, { main: 'RMB', alt: 'R' });
});

test('Help: merges duplicate Mouse steer stations in Helm Assist and keeps Steer left/right in Pilot', () => {
  const helm = createGameState(42);
  helm.settings.gameplay.controlScheme = 'helm-assist';
  const helmStations = rigStations(helm);
  const helmMouseStations = helmStations.filter((s) => s.kb && s.kb.main === 'Mouse');
  assert.equal(helmMouseStations.length, 1, 'Helm Assist shows exactly one Mouse steering station, not duplicates');
  assert.equal(helmMouseStations[0].verb, 'Steer & aim');
  assert.equal(helmStations.find((s) => s.id === 'mine')?.kb.main, 'G', 'Mine beam diagram station reads G');
  assert.equal(helmStations.find((s) => s.id === 'scanPulse')?.kb.main, 'C', 'Scan diagram station reads C');
  assert.deepEqual(helmStations.find((s) => s.id === 'tether')?.kb, { main: 'RMB', alt: 'F' });

  const pilot = createGameState(42);
  pilot.settings.gameplay.controlScheme = 'pilot';
  const pilotStations = rigStations(pilot);
  assert.equal(pilotStations.find((s) => s.id === 'yawLeft')?.kb.main, 'A');
  assert.equal(pilotStations.find((s) => s.id === 'yawRight')?.kb.main, 'D');
  assert.equal(pilotStations.find((s) => s.id === 'steer'), undefined);
});

test('Help: removes banned "the rig lights what it drives" prompt and fixes section-jump mapping', () => {
  const src = readFileSync(new URL('../src/ui/screens/help.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Controls rig:/i, 'aria-label no longer calls the diagram a "rig"');
  assert.doesNotMatch(src, /hold Q → MINE\/SITE BEAM/, 'hardcoded old Q mining string is gone');
  assert.match(src, /Press any key or click to highlight/, 'plain-words highlight prompt is wired');

  makeEnv((doc) => {
    const root = doc.createElement('section');
    const state = createGameState(42);
    state.mode = 'flight';
    const screen = Object.create(helpScreen);
    screen.mount(root, { state, bus: { on: () => () => {}, emit() {} } });
    try {
      assert.doesNotMatch(root.textContent, /the rig lights what it drives/i,
        'rendered Help screen never displays "the rig lights what it drives"');
      // Section headings exist for Flight now, Flight, Interface, Gamepad, Touch.
      const secHeads = findAll(root, (n) => n.classList && n.classList.contains('orr-hreg__sec'))
        .map((n) => n.textContent);
      assert.ok(secHeads[0] === 'Flight now');
      assert.ok(secHeads.includes('Flight'));
      assert.ok(secHeads.includes('Interface (fixed keys)'));
      assert.ok(secHeads.includes('Gamepad (Xbox / PlayStation)'));
      assert.ok(secHeads.includes('Touch (phone / tablet)'));
    } finally {
      screen.onHide();
    }
  });
});
