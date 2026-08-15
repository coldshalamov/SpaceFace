// entityLinks.js — J5 "Everything is a link", the delivery half (CANONICAL_BUILD_MAP §11.12).
//
// ONE delegated handler turns every `[data-entity="<type>:<id>"]` in any screen into a door, opening
// that entity's dossier in a tier-3 DRAWER. entityResolver.js owns what a dossier SAYS; this owns
// where it appears, how it is dismissed, and where focus goes.
//
// THREE PLACEMENT FACTS THAT ARE NOT NEGOTIABLE HERE, each a real trap in this codebase:
//
//  1. The listener goes on `#screens`, NEVER on `document`. screenManager binds
//     `shieldModalPointerEvent` to #screens in the BUBBLE phase and calls stopPropagation() whenever
//     a modal is open, so a document-level delegate would never fire. Same node is fine — it is
//     stopPropagation, not stopImmediatePropagation, and same-node listeners still run.
//
//  2. The drawer mounts INSIDE the active screen's root. screenManager's Tab trap cycles focus only
//     within `rec.el` and tests `!rec.el.contains(active)`; a drawer parented to <body> gets yanked
//     back into the screen behind it on every Tab, and `screensRoot.inert` would not cover it either.
//     Mounted inside, it inherits the trap, `inert`, `aria-hidden` and display:none for free.
//
//  3. It is positioned ABSOLUTE, not fixed. `.screen` carries `transform: translateY(0)` for its
//     enter/exit transition, and ANY transform value other than `none` makes that element the
//     containing block for `position: fixed` descendants. #screens flex-centres its children, so a
//     screen root can be content-sized — a "fixed" drawer would then anchor to a small box rather
//     than the viewport. The layer therefore stretches its host (`.sf-drawerhost`) while open, and
//     that class is removed on close so no screen is left relaid-out.
//
// A DRAWER IS NOT A MODAL (grammar §7: "one click → DRAWER … never opens a second modal"). Clicking
// a link inside the drawer REPLACES its content and pushes a back step; it never stacks a second
// surface. An unknown ref does NOTHING — the causeLedger discipline, so a stale tag is inert rather
// than a door into an empty room.

import { resolveEntity } from './entityResolver.js';

const MAX_BACK = 12;   // capped: the trail is a convenience, not a history feature (J6 owns history)

// A dossier `route` names a SCREEN, not a module. Routes resolve against what is actually
// registered, and a verb whose screen is not registered is not rendered at all — an inert button is
// the exact "correct-but-does-nothing" failure J3 exists to remove.
const ROUTE_SCREENS = { chart: 'galaxyMap', ship: 'ship' };
const ROUTE_VERBS = { chart: 'Open on the Chart', ship: 'Open in the Ship' };

function el(tag, className, opts = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.attrs) for (const k in opts.attrs) node.setAttribute(k, opts.attrs[k]);
  if (opts.children) for (const c of opts.children) if (c) node.appendChild(c);
  return node;
}

const CLOSE_GLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" '
  + 'stroke-width="1.8" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';

export function createEntityLinks(ctx) {
  const state = ctx && ctx.state;
  const bus = ctx && ctx.bus;
  const screenManager = ctx && ctx.screenManager;
  const screensRoot = typeof document !== 'undefined' ? document.getElementById('screens') : null;
  if (!screensRoot) return { open() {}, close() {}, isOpen: () => false, destroy() {} };

  let layer = null;        // .sf-drawerlayer, parented to the ACTIVE screen root
  let host = null;         // the screen root currently carrying .sf-drawerhost
  let opener = null;       // element that opened the drawer, for focus restore
  const back = [];         // ref trail within one drawer session
  let destroyed = false;

  /** The screen that owns the stack right now. screenManager marks it aria-modal; reading the DOM
   *  keeps this decoupled from the manager's internals. */
  function activeScreenRoot() {
    return screensRoot.querySelector('.screen[aria-modal="true"]')
      || screensRoot.querySelector('.screen.sf-screen--visible');
  }

  function ensureLayer() {
    const root = activeScreenRoot();
    if (!root) return null;
    if (layer && host === root) return layer;
    teardownLayer();
    host = root;
    host.classList.add('sf-drawerhost');
    layer = el('div', 'sf-drawerlayer');
    host.appendChild(layer);
    return layer;
  }

  function teardownLayer() {
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    if (host) host.classList.remove('sf-drawerhost');
    layer = null;
    host = null;
  }

  function renderDossier(d) {
    const kids = [];

    // CREST-equivalent: what this is, then its name.
    const headId = 'sf-entity-head';
    const crest = el('div', 'sf-drawer__crest', {
      children: [
        el('span', 'sf-drawer__kicker', { text: d.kicker }),
        el('h2', 'sf-drawer__title', { text: d.label, attrs: { id: headId, 'data-sf-text': '' } }),
      ],
    });
    if (d.accent) crest.style.setProperty('--sf-entity-accent', d.accent);
    kids.push(crest);

    // Tier 1 — the facts you need to decide.
    if (d.facts.length) {
      const deck = el('div', 'sf-drawer__facts');
      for (const f of d.facts) {
        deck.appendChild(el('div', 'sf-tile sf-tile--' + (f.tone || 'calm'), {
          children: [
            el('span', 'sf-tile__k', { text: f.k }),
            el('span', 'sf-tile__v', { text: String(f.v), attrs: { 'data-sf-text': '' } }),
          ],
        }));
      }
      kids.push(deck);
    }

    // Tier 3 — the record.
    for (const line of d.lines) {
      kids.push(el('div', 'sf-deck', {
        children: [
          el('div', 'sf-deck__label', { text: line.label }),
          el('p', 'sf-drawer__prose' + (line.tone === 'foe' ? ' sf-drawer__prose--foe' : ''), {
            text: line.text, attrs: { 'data-sf-text': '' },
          }),
        ],
      }));
    }

    // The graph. Every dossier links onward — this is the mechanism that makes twelve menus one
    // system, and it is why the drawer replaces rather than stacks.
    if (d.links.length) {
      const seen = new Set();
      const wrap = el('div', 'sf-drawer__links');
      for (const l of d.links) {
        if (seen.has(l.ref) || l.ref === d.ref) continue;
        seen.add(l.ref);
        wrap.appendChild(el('button', 'sf-entity-link', {
          text: l.label, attrs: { type: 'button', 'data-entity': l.ref },
        }));
      }
      if (wrap.childNodes.length) {
        kids.push(el('div', 'sf-deck', {
          children: [el('div', 'sf-deck__label', { text: 'Leads to' }), wrap],
        }));
      }
    }

    // The APRON always holds at least one verb (grammar §6). Back is a verb; the route is the real
    // one, and it renders only when its screen is actually registered.
    const verbs = [];
    const routeScreen = d.route && ROUTE_SCREENS[d.route.screen];
    if (routeScreen && screenManager && screenManager.hasScreen && screenManager.hasScreen(routeScreen)) {
      const btn = el('button', 'sf-drawer__verb', {
        text: ROUTE_VERBS[d.route.screen] || 'Open', attrs: { type: 'button' },
      });
      btn.addEventListener('click', () => {
        if (bus && bus.emit) bus.emit('ui:entityRoute', { ref: d.ref, route: d.route });
        close();
        try { screenManager.pushScreen(routeScreen); } catch (_) { /* screen refused the push */ }
      });
      verbs.push(btn);
    }
    if (back.length > 1) {
      const btn = el('button', 'sf-drawer__verb sf-drawer__verb--quiet', { text: 'Back', attrs: { type: 'button' } });
      btn.addEventListener('click', () => { back.pop(); show(back[back.length - 1], { push: false }); });
      verbs.push(btn);
    }
    const closeBtn = el('button', 'sf-drawer__verb sf-drawer__verb--quiet', { text: 'Close', attrs: { type: 'button' } });
    closeBtn.addEventListener('click', () => close());
    verbs.push(closeBtn);
    kids.push(el('div', 'sf-drawer__apron', { children: verbs }));

    return { kids, headId };
  }

  function show(ref, { push = true } = {}) {
    const d = resolveEntity(state, ref);
    if (!d) return false;                     // unknown ref renders NOTHING
    const host2 = ensureLayer();
    if (!host2) return false;
    if (push) {
      back.push(ref);
      if (back.length > MAX_BACK) back.shift();
    }

    const { kids, headId } = renderDossier(d);
    layer.textContent = '';
    const closeX = el('button', 'sf-drawer__x', { attrs: { type: 'button', 'aria-label': 'Close ' + d.label } });
    closeX.innerHTML = CLOSE_GLYPH;
    closeX.addEventListener('click', () => close());
    const deck = el('div', 'sf-drawer__deck', { children: kids });
    const drawer = el('aside', 'sf-drawer sf-drawer--entity', {
      children: [closeX, deck],
      attrs: { role: 'region', 'aria-labelledby': headId, tabindex: '-1' },
    });
    layer.appendChild(drawer);
    // One frame before `is-open` so the slide transition actually runs (adding both at once gives
    // the element no start value to transition from).
    requestAnimationFrame(() => { if (drawer.isConnected) drawer.classList.add('is-open'); });
    try { drawer.focus({ preventScroll: true }); } catch (_) { try { drawer.focus(); } catch (__) {} }
    return true;
  }

  function open(ref, fromEl) {
    if (destroyed) return false;
    if (!back.length) opener = fromEl || (typeof document !== 'undefined' ? document.activeElement : null);
    return show(ref, { push: true });
  }

  function close() {
    if (!layer) return;
    teardownLayer();
    back.length = 0;
    const target = opener;
    opener = null;
    if (target && target.isConnected && typeof target.focus === 'function') {
      try { target.focus({ preventScroll: true }); } catch (_) { try { target.focus(); } catch (__) {} }
    }
  }

  // ── delegation ───────────────────────────────────────────────────────────────────────────────
  const onClick = (ev) => {
    const t = ev && ev.target;
    if (!t || typeof t.closest !== 'function') return;
    const link = t.closest('[data-entity]');
    if (!link) return;
    const ref = link.getAttribute('data-entity');
    if (!ref) return;
    // Only swallow the click when a dossier actually opens. A stale tag stays inert and whatever the
    // element normally does still happens.
    if (open(ref, link)) { ev.preventDefault(); ev.stopPropagation(); }
  };

  // Escape must close the DRAWER without also popping the screen behind it. Capture phase beats the
  // screen-level handlers, and stopPropagation there is what keeps one Esc from doing two things.
  const onKeydown = (ev) => {
    if (ev.key !== 'Escape' || !layer) return;
    ev.preventDefault();
    ev.stopPropagation();
    close();
  };
  // A non-button element carrying data-entity still has to work from the keyboard.
  const onActivateKey = (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const t = ev.target;
    if (!t || typeof t.closest !== 'function') return;
    const link = t.closest('[data-entity]');
    if (!link || link.tagName === 'BUTTON' || link.tagName === 'A') return;
    const ref = link.getAttribute('data-entity');
    if (ref && open(ref, link)) { ev.preventDefault(); ev.stopPropagation(); }
  };

  screensRoot.addEventListener('click', onClick);
  screensRoot.addEventListener('keydown', onKeydown, true);
  screensRoot.addEventListener('keydown', onActivateKey);

  // The drawer belongs to the screen it was opened from; a stack change must not strand it.
  const unsubs = [];
  if (bus && bus.on) {
    for (const evt of ['screen:changed', 'sim:pause', 'sim:resume']) {
      try { unsubs.push(bus.on(evt, () => { if (layer && activeScreenRoot() !== host) close(); })); } catch (_) {}
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    screensRoot.removeEventListener('click', onClick);
    screensRoot.removeEventListener('keydown', onKeydown, true);
    screensRoot.removeEventListener('keydown', onActivateKey);
    for (const u of unsubs.splice(0)) { try { u(); } catch (_) {} }
    teardownLayer();
    back.length = 0;
    opener = null;
  }

  return { open, close, isOpen: () => !!layer, destroy };
}

export default createEntityLinks;
