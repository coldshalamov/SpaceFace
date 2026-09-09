/**
 * SpaceFace command-deck refit.
 *
 * An additive presentation owner: existing screens retain their elements,
 * event listeners, simulation state, transactions, canvases, and lifecycle.
 * There is deliberately no parallel game state and no invented telemetry.
 *
 * The DOM observer ignores text-only HUD updates. Work is coalesced and bounded;
 * no new animation loop, canvas, backdrop filter, audio owner, or gamepad poller.
 */
import { sourceSurfaceHooks } from './commandDeckRefitHooks.js';

const ICON_URL = new URL('../../assets/ui/command-deck-refit/instruments.svg', import.meta.url).href;
const SVG_NS = 'http://www.w3.org/2000/svg';
const SURFACE_ATTRIBUTE = 'data-sf-surface';
const GENERATED_ATTRIBUTE = 'data-sf-generated';
const MIN_SCAN_INTERVAL = 120;
const MAX_NEW_CONTROLS_PER_SCAN = 220;

export const SURFACE_NAMES = Object.freeze([
  'title', 'new-game', 'pause', 'station', 'market', 'shipworks', 'contracts',
  'contacts', 'industry', 'factions', 'ledger', 'settings', 'saves', 'help',
  'codex', 'missions', 'galaxy-map', 'local-map', 'navigation', 'ship',
  'research', 'automation', 'mining', 'crucible', 'range', 'game-over',
  'confirmation', 'flight',
]);

const SURFACE_RULES = [
  ['game-over', /\b(game over|gameover|death screen|destroyed screen|defeat)\b/],
  ['new-game', /\b(new game|newgame|character creation|start setup|pilot creation)\b/],
  ['galaxy-map', /\b(galaxy map|galaxymap|star map|starmap|sector map)\b/],
  ['local-map', /\b(local map|localmap|system map|systemmap|tactical map)\b/],
  ['shipworks', /\b(shipworks|ship works|shipyard|ship fitting|fitting|outfitting|equipment screen|equipment panel)\b/],
  ['market', /\b(market|commodity exchange|commodities|trade screen|trading panel|commerce)\b/],
  ['contracts', /\b(contracts|contract board|bounty board|job board)\b/],
  ['contacts', /\b(contacts|station bar|bar panel|bar screen|cantina)\b/],
  ['industry', /\b(industry|industrial|manufacturing|fabrication|refinery)\b/],
  ['factions', /\b(factions|faction screen|faction panel|reputation|diplomacy)\b/],
  ['ledger', /\b(ledger|transaction history|finance screen|finance panel)\b/],
  ['settings', /\b(settings|options|preferences|accessibility)\b/],
  ['saves', /\b(save load|saveload|save game|load game|save slots|save screen|load screen|saves)\b/],
  ['missions', /\b(mission log|missionlog|missions|journal|objectives screen)\b/],
  ['research', /\b(research|technology|tech tree|techtree|tech screen|tech panel|progression)\b/],
  ['automation', /\b(automation|fleet screen|fleet panel|fleet management|logistics)\b/],
  ['mining', /\b(mining|mining screen|asteroid operations|extraction)\b/],
  ['crucible', /\b(crucible|arena screen|arena panel)\b/],
  ['range', /\b(firing range|weapon range|range screen|range panel|diagnostics)\b/],
  ['codex', /\b(codex|encyclopedia|encyclopaedia|database screen)\b/],
  ['help', /\b(help|controls screen|controls panel|tutorial|manual)\b/],
  ['navigation', /\b(navigation|nav inspector|route planner|waypoint screen)\b/],
  ['ship', /\b(ship inspection|ship screen|ship panel|ship status|vessel details)\b/],
  ['pause', /\b(pause|paused|pausemenu|pause menu|system menu)\b/],
  ['title', /\b(title|title screen|titlescreen|main menu|mainmenu|front menu|frontmenu)\b/],
  ['station', /\b(station|station hub|station screen|docked|dock screen|facility)\b/],
  ['confirmation', /\b(confirmation|confirm dialog|confirmdialog|confirm modal)\b/],
  ['flight', /\b(flight hud|flighthud|game hud|gamehud|hud root|hudroot|hud)\b/],
];

const DEFAULT_HOOKS = SURFACE_NAMES.flatMap((kind) => {
  const camel = kind.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const pascal = camel[0].toUpperCase() + camel.slice(1);
  return [
    `[data-screen="${kind}"]`, `[data-view="${kind}"]`, `[data-panel="${kind}"]`,
    `#${kind}-screen`, `#${kind}-panel`, `#${camel}Screen`, `#${camel}Panel`,
    `#${camel}Overlay`, `.${kind}-screen`, `.${kind}-panel`, `.${kind}-overlay`,
    `#screen${pascal}`, `#panel${pascal}`,
  ].map((selector) => ({ kind, selector }));
});
DEFAULT_HOOKS.push(
  { kind: 'flight', selector: '#hud' },
  { kind: 'flight', selector: '#gameHUD' },
  { kind: 'title', selector: '#mainMenu' },
  { kind: 'title', selector: '#titleScreen' },
  { kind: 'pause', selector: '#pauseMenu' },
  { kind: 'galaxy-map', selector: '#galaxyMap' },
  { kind: 'local-map', selector: '#localMap' },
);

const ICONS = Object.freeze({
  title: 'ship', 'new-game': 'launch', pause: 'pause', station: 'station',
  market: 'exchange', shipworks: 'fitting', contracts: 'contract', contacts: 'contact',
  industry: 'industry', factions: 'faction', ledger: 'ledger', settings: 'settings',
  saves: 'save', help: 'help', codex: 'codex', missions: 'objective',
  'galaxy-map': 'galaxy', 'local-map': 'navigation', navigation: 'navigation',
  ship: 'ship', research: 'research', automation: 'fleet', mining: 'mining',
  crucible: 'crucible', range: 'target', 'game-over': 'warning',
  confirmation: 'warning', flight: 'target',
});

const ACTION_ICONS = [
  [/^(resume|continue|launch|depart|undock|new game|start game)\b/i, 'launch'],
  [/^(buy|purchase)\b/i, 'buy'], [/^(sell|trade)\b/i, 'sell'],
  [/^(fit|equip|install)\b/i, 'fitting'], [/^(strip|unequip|uninstall|remove module)\b/i, 'strip'],
  [/^(accept|track|set waypoint|plot route|navigate)\b/i, 'objective'],
  [/^(save)\b/i, 'save'], [/^(load)\b/i, 'load'],
  [/^(back|return)\b/i, 'back'], [/^(cancel|close)\b/i, 'close'],
  [/^(delete|erase|abandon|reset all|self destruct)\b/i, 'warning'],
];

const CONTROL_SELECTOR = 'button,input[type="button"],input[type="submit"],input[type="reset"],[role="button"],[role="tab"]';
const FOCUS_SELECTOR = [
  'button:not([disabled])', 'a[href]', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])', 'summary',
].join(',');
const ROOT_CANDIDATES = [
  'dialog', '[role="dialog"]', '[aria-modal="true"]',
  '[data-screen]', '[data-view]', '[data-panel]',
  '.screen', '.overlay', '.modal', '.panel-root', '.menu-overlay',
].join(',');
const HEADING_SELECTOR = 'h1,h2,[role="heading"],.panel-title,.screen-title,.modal-title,.menu-title';
const NAV_SELECTOR = 'nav,[role="tablist"],.tabs,.facility-nav,.station-nav,.menu-nav,.sidebar-nav';
const CONTENT_SELECTOR = 'main,[role="tabpanel"],.panel-content,.screen-content,.modal-body,.facility-content,.station-content';
const INSPECTOR_SELECTOR = 'aside,.inspector,.detail-panel,.details-panel,.item-details,.module-details,.target-details';

/** Split identifiers without mistaking arbitrary body prose for a screen name. */
export function normalizeDescriptor(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-:/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}

export function classifySurfaceTokens(value) {
  const descriptor = normalizeDescriptor(value);
  if (!descriptor || /\b(tooltip|toast|notification|preview thumbnail|debug console)\b/.test(descriptor)) return null;
  for (const [kind, expression] of SURFACE_RULES) {
    if (expression.test(descriptor)) return kind;
  }
  return null;
}

export function getControlIntent(value) {
  const text = normalizeDescriptor(value);
  if (/^(delete|erase|abandon|self destruct|reset all|wipe|discard save)\b/.test(text)) return 'danger';
  if (/^(buy|purchase|sell|accept|confirm|fit|equip|install|launch|depart|undock|resume|continue|new game|start game|save game|plot route|set waypoint)\b/.test(text)) return 'primary';
  if (/^(back|return|cancel|close|dismiss)\b/.test(text)) return 'quiet';
  return 'normal';
}

/** Keep range values tied to the real input, including fractional steps. */
export function formatRangeValue(value, step = '1', suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '');
  const stepString = String(step);
  let precision = stepString === 'any' ? 3 : (stepString.split('.')[1]?.length ?? 0);
  const exponent = /e-(\d+)$/i.exec(stepString);
  if (exponent) precision = Number(exponent[1]);
  precision = Math.min(6, Math.max(0, precision));
  const rendered = stepString === 'any' ? String(Number(number.toFixed(precision))) : number.toFixed(precision);
  return `${rendered}${suffix}`;
}

/** Exposed for a focused test: no guessed success on a busy -> idle transition. */
export function readControlState(element) {
  if (element.getAttribute('aria-busy') === 'true') return 'pending';
  if (element.disabled || element.getAttribute('aria-disabled') === 'true') return 'disabled';
  if (element.getAttribute('aria-pressed') === 'true' || element.getAttribute('aria-selected') === 'true') return 'selected';
  return 'idle';
}

function ownedQuery(root, selector) {
  return [...root.querySelectorAll(selector)].filter((element) => element.closest(`[${SURFACE_ATTRIBUTE}]`) === root);
}

function isVisible(element) {
  if (!element?.isConnected || element.hidden || element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  if (!element.getClientRects().length) return false;
  return element.ownerDocument.defaultView.getComputedStyle(element).visibility !== 'hidden';
}

function controlLabel(element) {
  return (element.getAttribute('aria-label') || element.value || element.textContent || '').replace(/\s+/g, ' ').trim();
}

function ownDescriptor(element) {
  return [element.id, typeof element.className === 'string' ? element.className : '',
    element.getAttribute('data-screen'), element.getAttribute('data-view'), element.getAttribute('data-panel')]
    .filter(Boolean).join(' ');
}

function icon(document, name, className = 'sf-refit-icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  svg.setAttribute(GENERATED_ATTRIBUTE, 'icon');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `${ICON_URL}#${name}`);
  svg.append(use);
  return svg;
}

function createRuntime(document, customHooks) {
  const window = document.defaultView;
  const abort = new window.AbortController();
  const surfaces = new Map();
  const decoratedControls = new WeakSet();
  const decoratedRanges = new Map();
  const trackedStyles = new Map();
  const scrollRegions = new Map();
  const trackedAttributes = new Map();
  const generated = new Set();
  const hooks = [...sourceSurfaceHooks, ...customHooks, ...DEFAULT_HOOKS]
    .filter((hook) => SURFACE_NAMES.includes(hook.kind) && typeof hook.selector === 'string');
  const hookGroups = new Map();
  for (const hook of hooks) {
    try { document.documentElement.matches(hook.selector); } catch { continue; }
    if (!hookGroups.has(hook.kind)) hookGroups.set(hook.kind, new Set());
    hookGroups.get(hook.kind).add(hook.selector);
  }
  for (const [kind, selectors] of hookGroups) hookGroups.set(kind, [...selectors].join(','));
  let observer;
  let resizeObserver;
  let timer = null;
  let lastScan = -Infinity;
  let disposed = false;
  let nextInputId = 0;
  let pendingRoots = new Set();
  const pendingDiscovery = new Set();
  let latestOpener = null;
  let controlsDeferred = false;

  function setAttribute(element, name, value) {
    if (element.getAttribute(name) === value) return;
    if (!trackedAttributes.has(element)) trackedAttributes.set(element, new Map());
    const map = trackedAttributes.get(element);
    if (!map.has(name)) map.set(name, element.getAttribute(name));
    element.setAttribute(name, value);
  }

  function setStyle(element, property, value) {
    if (!trackedStyles.has(element)) trackedStyles.set(element, new Map());
    const previous = trackedStyles.get(element);
    if (!previous.has(property)) previous.set(property, element.style.getPropertyValue(property));
    if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
  }

  function ownGenerated(node) {
    generated.add(node);
    return node;
  }

  function recordOpener(event) {
    const target = event.target instanceof window.Element ? event.target.closest(CONTROL_SELECTOR) : null;
    if (target && isVisible(target)) latestOpener = target;
  }

  function rootKind(root) {
    const descriptor = ownDescriptor(root);
    const fromIdentity = classifySurfaceTokens(descriptor);
    if (fromIdentity && fromIdentity !== 'station') return fromIdentity;
    const heading = root.querySelector(HEADING_SELECTOR);
    const fromHeading = heading && heading.textContent.length < 130
      ? classifySurfaceTokens(heading.textContent) : null;
    return fromHeading ?? fromIdentity;
  }

  function markSurface(root, kind) {
    if (!(root instanceof window.HTMLElement) || root === document.body || root === document.documentElement) return;
    if (root.closest(`[${GENERATED_ATTRIBUTE}]`)) return;
    const parentSurface = root.parentElement?.closest(`[${SURFACE_ATTRIBUTE}]`);
    // Do not turn every item named "market" inside a market into another screen.
    if (parentSurface?.getAttribute(SURFACE_ATTRIBUTE) === kind && !root.matches('dialog,[role="dialog"],[role="tabpanel"]')) return;
    const old = surfaces.get(root);
    if (old?.kind === kind) return;
    const active = document.activeElement;
    const record = old ?? {
      opener: active && active !== document.body ? active : latestOpener,
      wasVisible: false,
    };
    record.kind = kind;
    surfaces.set(root, record);
    setAttribute(root, SURFACE_ATTRIBUTE, kind);
    if (window.getComputedStyle(root).position === 'static') setAttribute(root, 'data-sf-position', 'static');
    if (root.matches('dialog,[role="dialog"],[aria-modal="true"]')) setAttribute(root, 'data-sf-modal', 'true');
    if (kind !== 'flight' && kind !== 'galaxy-map' && kind !== 'local-map'
        && !root.classList.contains('screen') && !root.classList.contains('k-screen')
        && root.id !== 'hud') {
      setAttribute(root, 'data-sf-material', 'panel');
    }
    pendingRoots.add(root);
  }

  function discover(scope) {
    if (!(scope instanceof window.Element) && scope !== document) return;
    for (const [kind, selector] of hookGroups) {
      try {
        if (scope instanceof window.Element && scope.matches(selector)) markSurface(scope, kind);
        for (const element of scope.querySelectorAll(selector)) markSurface(element, kind);
      } catch {
        // A stale integration hook cannot take down the game.
      }
    }
    const candidates = [...scope.querySelectorAll(ROOT_CANDIDATES)];
    if (scope instanceof window.Element && scope.matches(ROOT_CANDIDATES)) candidates.unshift(scope);
    for (const candidate of candidates) {
      const kind = rootKind(candidate);
      if (kind) markSurface(candidate, kind);
    }
  }

  function identifyParts(root, kind) {
    const headings = ownedQuery(root, HEADING_SELECTOR);
    const heading = headings.find((node) => node.getAttribute(GENERATED_ATTRIBUTE) === null);
    if (heading) setAttribute(heading, 'data-sf-part', 'heading');
    const nav = ownedQuery(root, NAV_SELECTOR)[0];
    if (nav) setAttribute(nav, 'data-sf-part', 'navigation');
    const content = ownedQuery(root, CONTENT_SELECTOR)[0];
    if (content) setAttribute(content, 'data-sf-part', 'content');
    const inspector = ownedQuery(root, INSPECTOR_SELECTOR)[0];
    if (inspector) setAttribute(inspector, 'data-sf-part', 'inspector');
    // Only opt into a new grid when the existing DOM really has these siblings.
    if (nav && content && nav.parentElement === root && content.parentElement === root && kind !== 'flight') {
      setAttribute(root, 'data-sf-composition', 'navigation-content');
      if (heading?.parentElement === root) setAttribute(heading, 'data-sf-grid', 'header');
    }
    for (const table of ownedQuery(root, 'table')) setAttribute(table, 'data-sf-part', 'table');
    for (const group of ownedQuery(root, 'fieldset')) setAttribute(group, 'data-sf-part', 'settings-group');
    for (const empty of ownedQuery(root, '.empty-state,[data-empty-state],.empty-message')) setAttribute(empty, 'data-sf-part', 'empty');
    for (const state of ownedQuery(root, '[data-sf-part="error"],[data-sf-part="success"]')) {
      if (!state.matches('[role="alert"],.error-message,[data-error="true"],.success-message,[data-success="true"],[data-state="complete"]')) state.removeAttribute('data-sf-part');
    }
    for (const error of ownedQuery(root, '[role="alert"],.error-message,[data-error="true"]')) setAttribute(error, 'data-sf-part', 'error');
    for (const success of ownedQuery(root, '.success-message,[data-success="true"],[data-state="complete"]')) setAttribute(success, 'data-sf-part', 'success');
    for (const progress of ownedQuery(root, 'progress,[role="progressbar"]')) {
      const descriptor = normalizeDescriptor(`${ownDescriptor(progress)} ${ownDescriptor(progress.parentElement ?? progress)} ${progress.getAttribute('aria-label') ?? ''}`);
      const instrument = ['hull', 'shield', 'energy', 'heat', 'boost', 'cargo', 'lock', 'mining'].find((name) => descriptor.includes(name));
      if (instrument) setAttribute(progress, 'data-sf-instrument', instrument);
    }
    for (const radar of ownedQuery(root, '#radar,.radar,.radar-container,[data-radar]')) setAttribute(radar, 'data-sf-part', 'radar');
    for (const target of ownedQuery(root, '.target-panel,.target-info,#targetInfo,[data-target-panel]')) setAttribute(target, 'data-sf-part', 'target');
    // Warning/critical presentation follows the game's current classes directly;
    // never leave behind a presentation-owned sticky danger state after repair.
    if (kind === 'shipworks' || kind === 'ship') {
      for (const preview of ownedQuery(root, '.ship-preview,.ship-view,.hull-preview,.ship-viewport,[data-ship-preview]')) setAttribute(preview, 'data-sf-part', 'ship-preview');
      for (const module of ownedQuery(root, '.module-item,.equipment-item,.slot,[data-module-id],[data-slot]')) setAttribute(module, 'data-sf-part', 'module');
    }
    if (kind === 'market') {
      for (const item of ownedQuery(root, '.commodity,.commodity-row,.market-item,[data-commodity]')) setAttribute(item, 'data-sf-part', 'commodity');
      for (const quantity of ownedQuery(root, 'input[type="number"]')) setAttribute(quantity, 'data-sf-part', 'quantity');
      for (const transactions of ownedQuery(root, '.transaction-controls,.trade-controls,.market-actions,.trade-panel')) setAttribute(transactions, 'data-sf-part', 'transaction');
    }
    if (kind === 'contracts' || kind === 'missions') {
      for (const contract of ownedQuery(root, '.contract,.contract-card,.mission,.mission-item,[data-contract-id]')) setAttribute(contract, 'data-sf-part', 'contract');
    }
    if (kind === 'saves') {
      for (const slot of ownedQuery(root, '.save-slot,.slot,[data-save-slot]')) setAttribute(slot, 'data-sf-part', 'save-slot');
    }
  }

  function addArtwork(root, kind) {
    const existing = [...root.children].find((child) => child.getAttribute(GENERATED_ATTRIBUTE) === 'surface-art');
    // Kit screens keep a live .k-world canvas; a full-bleed plate would hide the hull.
    if (root.querySelector('.k-world')) {
      if (existing) { existing.remove(); generated.delete(existing); }
      return;
    }
    if (!['title', 'pause', 'station', 'shipworks', 'industry', 'research', 'game-over', 'crucible'].includes(kind)) {
      if (existing) { existing.remove(); generated.delete(existing); }
      return;
    }
    if (existing) {
      const expected = `sf-refit-art sf-refit-art--${kind}`;
      if (existing.className !== expected) existing.className = expected;
      return;
    }
    const art = document.createElement('div');
    art.className = `sf-refit-art sf-refit-art--${kind}`;
    art.setAttribute('aria-hidden', 'true');
    art.setAttribute(GENERATED_ATTRIBUTE, 'surface-art');
    root.prepend(ownGenerated(art));
  }

  function decorateControls(root, budget) {
    const controls = ownedQuery(root, CONTROL_SELECTOR);
    let used = 0;
    for (const control of controls) {
      if (decoratedControls.has(control)) continue;
      if (used >= budget) { controlsDeferred = true; break; }
      used += 1;
      decoratedControls.add(control);
      const label = controlLabel(control);
      setAttribute(control, 'data-sf-control', 'true');
      setAttribute(control, 'data-sf-intent', getControlIntent(label));
      if (control.matches('button') && label.length > 2 && label.length < 72 && !control.querySelector('svg,img,canvas,.icon,[data-icon]')) {
        const actionIcon = ACTION_ICONS.find(([pattern]) => pattern.test(label))?.[1];
        const surfaceIcon = control.closest('[data-sf-part="navigation"]') && ICONS[classifySurfaceTokens(label)];
        const name = actionIcon ?? surfaceIcon;
        if (name) control.prepend(ownGenerated(icon(document, name)));
      }
    }
    return used;
  }

  function decorateRanges(root) {
    if (!['settings', 'shipworks', 'market', 'range'].includes(root.getAttribute(SURFACE_ATTRIBUTE))) return;
    for (const input of ownedQuery(root, 'input[type="range"]')) {
      if (decoratedRanges.has(input)) continue;
      decoratedRanges.set(input, null);
      const parent = input.parentElement;
      if (!parent || parent.querySelector('output,[data-range-value],.range-value,.slider-value')) continue;
      // Existing explicitly labelled or numeric value displays remain owned by the game.
      if (parent.querySelector('input[type="number"],.value,[data-value]')) continue;
      const output = document.createElement('output');
      output.className = 'sf-refit-range-value';
      output.setAttribute(GENERATED_ATTRIBUTE, 'range-value');
      output.setAttribute('aria-live', 'off');
      if (!input.id) setAttribute(input, 'id', `sf-refit-range-${++nextInputId}`);
      output.htmlFor = input.id;
      const update = () => {
        output.value = formatRangeValue(input.value, input.step || '1', input.getAttribute('data-unit') ?? '');
        const min = Number(input.min || '0');
        const max = Number(input.max || '100');
        const fraction = max > min ? Math.max(0, Math.min(1, (Number(input.value) - min) / (max - min))) : 0;
        setStyle(input, '--sf-range-position', `${fraction * 100}%`);
      };
      decoratedRanges.set(input, update);
      input.addEventListener('focus', update, { signal: abort.signal });
      input.addEventListener('input', update, { signal: abort.signal });
      input.addEventListener('change', update, { signal: abort.signal });
      input.after(ownGenerated(output));
      update();
    }
  }

  function updateScrollState(element) {
    if (!element.isConnected) return;
    const scrollable = element.scrollHeight > element.clientHeight + 2;
    setAttribute(element, 'data-sf-scroll', scrollable ? 'true' : 'false');
    setAttribute(element, 'data-sf-scroll-start', element.scrollTop <= 2 ? 'true' : 'false');
    setAttribute(element, 'data-sf-scroll-end', element.scrollTop + element.clientHeight >= element.scrollHeight - 2 ? 'true' : 'false');
  }

  function enhanceScroll(root) {
    if (root.getAttribute(SURFACE_ATTRIBUTE) === 'flight') return;
    for (const region of ownedQuery(root, '[data-sf-part="content"],[data-sf-part="inspector"],.scroll-region,.scrollable,.item-list,.contract-list,.mission-list')) {
      if (scrollRegions.has(region)) { updateScrollState(region); continue; }
      const style = window.getComputedStyle(region);
      if (!/(auto|scroll)/.test(style.overflowY)) continue;
      const listener = () => updateScrollState(region);
      scrollRegions.set(region, listener);
      region.addEventListener('scroll', listener, { passive: true, signal: abort.signal });
      resizeObserver?.observe(region);
      updateScrollState(region);
    }
  }

  function visibleModal() {
    return [...surfaces.keys()].filter((root) => root.getAttribute('data-sf-modal') === 'true' && isVisible(root)).at(-1) ?? null;
  }

  function focusables(root) {
    return [...root.querySelectorAll(FOCUS_SELECTOR)].filter((element) =>
      isVisible(element) && element.getAttribute('aria-disabled') !== 'true' && !element.matches(':disabled,[tabindex="-1"]'));
  }

  function focusNewModal(root, record) {
    const visible = isVisible(root);
    if (visible && !record.wasVisible && root.getAttribute('data-sf-modal') === 'true') {
      const current = document.activeElement;
      if (current && current !== document.body && !root.contains(current) && isVisible(current)) record.opener = current;
      if (!root.contains(current) && (!current || current === document.body || current === record.opener || !isVisible(current))) {
        const available = focusables(root);
        const hasDanger = available.some((element) => element.getAttribute('data-sf-intent') === 'danger');
        const preferred = root.querySelector('[autofocus]')
          ?? (hasDanger ? available.find((element) => /^(cancel|back|close|keep)\b/i.test(controlLabel(element))) : null)
          ?? available.find((element) => element.getAttribute('data-sf-intent') === 'primary')
          ?? available[0];
        if (preferred && isVisible(preferred)) preferred.focus({ preventScroll: true });
      }
    }
    if (!visible && record.wasVisible && record.opener?.isConnected && isVisible(record.opener)
      && (document.activeElement === document.body || root.contains(document.activeElement))) {
      record.opener.focus({ preventScroll: true });
    }
    record.wasVisible = visible;
  }

  function keydown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab') {
      const modal = visibleModal();
      if (!modal) return;
      const available = focusables(modal);
      if (!available.length) return;
      const first = available[0];
      const last = available.at(-1);
      const current = document.activeElement;
      if ((!event.shiftKey && (current === last || !modal.contains(current)))
          || (event.shiftKey && (current === first || !modal.contains(current)))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
      return;
    }
    const target = event.target instanceof window.Element ? event.target.closest('[role="tab"]') : null;
    const tablist = target?.closest('[role="tablist"]');
    if (!tablist?.closest(`[${SURFACE_ATTRIBUTE}]`)) return;
    const vertical = tablist.getAttribute('aria-orientation') === 'vertical';
    const previous = vertical ? 'ArrowUp' : 'ArrowLeft';
    const next = vertical ? 'ArrowDown' : 'ArrowRight';
    if (![previous, next, 'Home', 'End'].includes(event.key)) return;
    const tabs = [...tablist.querySelectorAll('[role="tab"]')].filter((tab) =>
      !tab.disabled && tab.getAttribute('aria-disabled') !== 'true' && isVisible(tab));
    const current = tabs.indexOf(target);
    if (current < 0 || !tabs.length) return;
    let index = current;
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else index = (current + (event.key === next ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[index].focus({ preventScroll: true });
    // Existing click handlers remain the only source of facility/setting state.
    tabs[index].click();
    tabs[index].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }

  function cleanupDetached() {
    for (const [root, record] of surfaces) {
      if (root.isConnected) continue;
      if (record.wasVisible && record.opener?.isConnected && isVisible(record.opener) && document.activeElement === document.body) {
        record.opener.focus({ preventScroll: true });
      }
      surfaces.delete(root);
      pendingRoots.delete(root);
    }
    for (const [region, listener] of scrollRegions) {
      if (region.isConnected) continue;
      region.removeEventListener('scroll', listener);
      resizeObserver?.unobserve(region);
      scrollRegions.delete(region);
    }
    if (latestOpener && !latestOpener.isConnected) latestOpener = null;
    for (const element of decoratedRanges.keys()) if (!element.isConnected) decoratedRanges.delete(element);
    for (const element of trackedStyles.keys()) if (!element.isConnected) trackedStyles.delete(element);
    // Do not retain a menu's removed DOM for the duration of a long flight.
    for (const element of trackedAttributes.keys()) if (!element.isConnected) trackedAttributes.delete(element);
    for (const node of generated) if (!node.isConnected) generated.delete(node);
  }

  function scan() {
    timer = null;
    if (disposed) return;
    lastScan = window.performance.now();
    cleanupDetached();
    // Collapse nested additions before running semantic queries. A rebuilt
    // commodity list must not cause one complete discovery pass per row.
    const discovery = [...pendingDiscovery].filter((node) => node.isConnected);
    pendingDiscovery.clear();
    for (const scope of discovery) {
      if (!discovery.some((other) => other !== scope && other.contains(scope))) discover(scope);
    }
    const roots = [...pendingRoots];
    pendingRoots.clear();
    controlsDeferred = false;
    let budget = MAX_NEW_CONTROLS_PER_SCAN;
    for (const root of roots) {
      if (!root.isConnected) continue;
      if (!surfaces.has(root)) discover(root);
      const owner = surfaces.has(root) ? root : root.closest(`[${SURFACE_ATTRIBUTE}]`);
      if (!owner || !surfaces.has(owner)) continue;
      let kind = surfaces.get(owner).kind;
      const identityKind = classifySurfaceTokens(ownDescriptor(owner));
      if (!identityKind || identityKind === 'station') {
        const currentKind = rootKind(owner);
        if (currentKind && currentKind !== kind) {
          kind = currentKind;
          markSurface(owner, kind);
        }
      }
      identifyParts(owner, kind);
      addArtwork(owner, kind);
      budget -= decorateControls(owner, Math.max(0, budget));
      decorateRanges(owner);
      enhanceScroll(owner);
    }
    for (const [root, record] of surfaces) focusNewModal(root, record);
    if (controlsDeferred) {
      for (const root of surfaces.keys()) pendingRoots.add(root);
      schedule();
    }
  }

  function schedule() {
    if (disposed || timer !== null) return;
    const delay = Math.max(0, MIN_SCAN_INTERVAL - (window.performance.now() - lastScan));
    timer = window.setTimeout(scan, delay);
  }

  function mutations(records) {
    let relevant = false;
    for (const record of records) {
      if (record.type === 'attributes') {
        if (surfaces.has(record.target)) { pendingRoots.add(record.target); relevant = true; }
        else if (record.attributeName === 'class' && record.target.matches('[data-sf-part="error"],[data-sf-part="success"],.error-message,.success-message,[role="alert"]')) {
          const owner = record.target.closest(`[${SURFACE_ATTRIBUTE}]`);
          if (owner) { pendingRoots.add(owner); relevant = true; }
        }
        else if (['hidden', 'open', 'aria-hidden'].includes(record.attributeName)) {
          for (const root of surfaces.keys()) {
            if (record.target.contains(root)) { pendingRoots.add(root); relevant = true; }
          }
        }
        continue;
      }
      const added = [...record.addedNodes].filter((node) => node instanceof window.Element && !node.hasAttribute(GENERATED_ATTRIBUTE));
      const removed = [...record.removedNodes].some((node) => node instanceof window.Element && !node.hasAttribute(GENERATED_ATTRIBUTE));
      if (!added.length && !removed) continue; // Text-only instrument updates stop here.
      relevant = true;
      for (const node of added) {
        const owner = node.closest(`[${SURFACE_ATTRIBUTE}]`);
        if (owner) pendingRoots.add(owner);
        if (!owner || node.matches(ROOT_CANDIDATES) || node.querySelector(ROOT_CANDIDATES)) pendingDiscovery.add(node);
      }
      const owner = record.target instanceof window.Element ? record.target.closest(`[${SURFACE_ATTRIBUTE}]`) : null;
      if (owner) pendingRoots.add(owner);
    }
    if (relevant) schedule();
  }

  function start() {
    if ('ResizeObserver' in window) {
      resizeObserver = new window.ResizeObserver((entries) => {
        for (const { target } of entries) updateScrollState(target);
      });
    }
    observer = new window.MutationObserver(mutations);
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['hidden', 'open', 'aria-hidden', 'class', 'style'],
    });
    document.addEventListener('pointerdown', recordOpener, { capture: true, passive: true, signal: abort.signal });
    document.addEventListener('keydown', keydown, { signal: abort.signal });
    const refreshRangeValues = () => window.queueMicrotask(() => {
      if (disposed) return;
      for (const [input, update] of decoratedRanges) if (update && isVisible(input)) update();
    });
    // Reset buttons often set input.value directly without emitting input.
    // Read the real controls after their original handlers, not a shadow state.
    document.addEventListener('click', refreshRangeValues, { signal: abort.signal });
    document.addEventListener('reset', refreshRangeValues, { signal: abort.signal });
    discover(document);
    for (const root of surfaces.keys()) pendingRoots.add(root);
    scan();
  }

  return {
    start,
    refresh(root = document) {
      discover(root);
      for (const surface of surfaces.keys()) if (root === document || root.contains(surface) || surface.contains(root)) pendingRoots.add(surface);
      schedule();
    },
    /** Explicit integration seam for screens without a semantic ID or heading. */
    registerSurface(root, kind) {
      if (!SURFACE_NAMES.includes(kind)) throw new TypeError(`Unknown command-deck surface: ${kind}`);
      markSurface(root, kind);
      schedule();
    },
    inspect() {
      return [...surfaces].map(([root, record]) => ({
        kind: record.kind, id: root.id || null, visible: isVisible(root),
        controls: ownedQuery(root, '[data-sf-control]').length,
      }));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      observer?.disconnect();
      resizeObserver?.disconnect();
      abort.abort();
      for (const node of generated) node.remove();
      for (const [element, attributes] of trackedAttributes) {
        for (const [name, previous] of attributes) {
          if (previous === null) element.removeAttribute(name);
          else element.setAttribute(name, previous);
        }
      }
      for (const [element, properties] of trackedStyles) {
        for (const [property, previous] of properties) {
          if (previous) element.style.setProperty(property, previous);
          else element.style.removeProperty(property);
        }
      }
      surfaces.clear(); scrollRegions.clear(); generated.clear(); trackedAttributes.clear(); pendingRoots.clear();
      decoratedRanges.clear(); trackedStyles.clear(); pendingDiscovery.clear();
    },
  };
}

const INSTANCES = new WeakMap();

/** Idempotent and safe to import from Node-based source/contract tests. */
export function mountCommandDeckRefit({ document = globalThis.document, hooks = [] } = {}) {
  if (!document?.body || !document.defaultView) return null;
  if (INSTANCES.has(document)) return INSTANCES.get(document);
  const runtime = createRuntime(document, hooks);
  const originalDispose = runtime.dispose;
  runtime.dispose = () => { originalDispose(); INSTANCES.delete(document); };
  INSTANCES.set(document, runtime);
  runtime.start();
  return runtime;
}

if (typeof document !== 'undefined') {
  const boot = () => mountCommandDeckRefit();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
