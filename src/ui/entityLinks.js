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
const ROUTE_FOCUS_VERBS = { chart: 'Focus on the Chart', ship: 'Focus in the Ship' };

// Group headings for the link stage. Naming the KIND of thing is what turns a run of underlined
// words into navigation — the player knows what door they are opening before they open it.
const GROUP_LABELS = {
  faction: 'Powers', sector: 'Places', station: 'Docks', commodity: 'Goods',
  hull: 'Hulls', module: 'Modules', captain: 'People', contract: 'Contracts',
};

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
    // NOTE: a dossier's `accent` is deliberately NOT painted onto the crest rail. The 14 faction
    // hexes are lore colours, not roles, and several collide with the grammar's meaning-only
    // palette — faction_free #4ECBE0 is the banned cyan, faction_vael #2FCFA0 reads as `--sf-you`
    // ("a gain") for a hostile power, faction_reach #D8334A reads as `--sf-foe` even when you are
    // allied, faction_archive #3A2A5A vanishes on `--sf-surface`, and faction_fulfillment #F0F0E8
    // out-luminates the title. The structural rail must mean ONE thing on every dossier or it
    // cannot be learned (grammar §1, §4).
    kids.push(crest);

    // Tier 1 — the facts you need to decide.
    if (d.facts.length) {
      const deck = el('div', 'sf-drawer__facts');
      for (const f of d.facts) {
        // `num` renders a figure in the DATA face with tabular numerals. The Chart directly behind
        // this drawer already sets its numbers in mono; matching it is most of what stops the
        // drawer reading as a web panel bolted onto a game. Per-fact rather than on .sf-tile__v
        // wholesale, because that selector also carries prose values (Patrolled, lawful, Concord).
        deck.appendChild(el('div', 'sf-tile sf-tile--' + (f.tone || 'calm') + (f.num ? ' sf-tile--data' : ''), {
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

    // The graph — and the drawer's STAGE. A CREST and an APRON with nothing between them is why
    // this failed the silhouette test and read as a void; the graph is the centerpiece, so it is
    // built as one: GROUPED BY TYPE, one full-width row each, hairline separated. Ungrouped it was
    // a wrapped paragraph of underlined words mixing factions, stations and sectors, where the
    // player could not tell what kind of thing they were about to open.
    if (d.links.length) {
      const seen = new Set();
      const byType = new Map();
      for (const l of d.links) {
        if (seen.has(l.ref) || l.ref === d.ref) continue;
        seen.add(l.ref);
        const type = String(l.ref).slice(0, String(l.ref).indexOf(':')) || 'other';
        if (!byType.has(type)) byType.set(type, []);
        byType.get(type).push(l);
      }
      if (byType.size) {
        const stage = el('div', 'sf-drawer__stage');
        for (const [type, list] of byType) {
          const rows = el('div', 'sf-drawer__links');
          for (const l of list) {
            rows.appendChild(el('button', 'sf-entity-link sf-entity-link--row', {
              text: l.label,
              attrs: { type: 'button', role: 'link', 'data-entity': l.ref, 'data-sf-text': '' },
            }));
          }
          stage.appendChild(el('div', 'sf-deck', {
            children: [el('div', 'sf-deck__label', { text: GROUP_LABELS[type] || type }), rows],
          }));
        }
        kids.push(stage);
      }
    }

    // The APRON always holds at least one verb (grammar §6). Back is a verb; the route is the real
    // one, and it renders only when its screen is actually registered.
    const verbs = [];
    const routeScreen = d.route && ROUTE_SCREENS[d.route.screen];
    if (routeScreen && screenManager && screenManager.hasScreen && screenManager.hasScreen(routeScreen)) {
      // Label honestly: "Open on the Chart" while already on the Chart is a lie about what will
      // happen. Standing on the target screen, the verb FOCUSES rather than opens.
      const onTarget = screenManager.top && screenManager.top() === routeScreen;
      const label = onTarget
        ? (ROUTE_FOCUS_VERBS[d.route.screen] || 'Focus')
        : (ROUTE_VERBS[d.route.screen] || 'Open');
      const btn = el('button', 'sf-drawer__verb', { text: label, attrs: { type: 'button' } });
      btn.addEventListener('click', () => {
        if (bus && bus.emit) bus.emit('ui:entityRoute', { ref: d.ref, route: d.route });
        close();
        // Do NOT push a screen that already owns the stack. screenManager.pushScreen has no
        // duplicate guard — it runs onHide, then pushes unconditionally — so opening the Chart
        // FROM the Chart would tear it down, replay its enter transition, and leave it on the
        // stack twice, costing the player two Escapes to get back to flight. When we are already
        // there, the emitted route event is the whole action.
        const already = screenManager.top && screenManager.top() === routeScreen;
        if (already) return;
        try { screenManager.pushScreen(routeScreen); } catch (_) { /* screen refused the push */ }
      });
      verbs.push(btn);
    }
    if (back.length > 1) {
      const btn = el('button', 'sf-drawer__verb sf-drawer__verb--quiet', { text: 'Back', attrs: { type: 'button' } });
      btn.addEventListener('click', () => {
        // Pop only if the previous dossier still resolves. Contracts are LIVE records, so a step in
        // the trail can stop existing while the drawer is open; popping first would lose the step
        // AND leave stale content on screen.
        const prevRef = back[back.length - 2];
        if (show(prevRef, { push: false })) back.pop();
      });
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
