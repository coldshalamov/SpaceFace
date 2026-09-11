// Opt-in DOM localization bridge for the public pseudo-locale route and the Settings language picker.
//
// Most SpaceFace screens are cached and rebuilt incrementally. The bridge translates text at the
// DOM boundary so every newly mounted/refreshed screen exercises expansion and glyph coverage
// without forcing localization concerns into station, HUD, simulation, or screen ownership lanes.
// It is installed for any non-default locale; normal en-US play pays no observer/style cost. Once
// installed it stays installed so a live switch back to English can restore the authored source.

const LOCALIZED_ATTRIBUTES = Object.freeze(['aria-label', 'placeholder', 'title', 'alt']);
const SKIP_SELECTOR = '[data-localization-skip]';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'CANVAS']);
const PSEUDO_STYLE_ID = 'sf-localization-overflow-style';

let installed = false;
let observer = null;
let restoreCanvasText = null;
let activeTranslate = null;
// Every node keeps the app-authored source it was rendered from, so a locale switch re-renders from
// that source instead of translating an already-translated string. The `rendered*` maps record what
// this bridge last wrote, which is how our own writes are told apart from an app-authored update.
const sourceText = new WeakMap();
const renderedText = new WeakMap();
const sourceAttributes = new WeakMap();
const renderedAttributes = new WeakMap();
const canvasSamples = [];
const stats = { textNodes: 0, attributes: 0, canvasTextDraws: 0, mutationBatches: 0 };

export function localizeDocumentTree(root, translate) {
  if (!root || typeof translate !== 'function') return { textNodes: 0, attributes: 0 };
  const beforeText = stats.textNodes;
  const beforeAttributes = stats.attributes;
  visit(root, translate);
  return {
    textNodes: stats.textNodes - beforeText,
    attributes: stats.attributes - beforeAttributes,
  };
}

export function installLocalizedDocumentBridge({ document: doc, translate, locale }) {
  if (!doc || !doc.documentElement || typeof translate !== 'function') return false;
  activeTranslate = translate;
  injectOverflowStyle(doc, locale);
  if (!installed) {
    installed = true;
    installCanvasTextBridge(doc.defaultView);
    installObserver(doc);
  }
  // Install is also the live switch: re-run the whole tree so every cached screen re-renders from
  // its stored source under the new translator. Default play pays nothing until a locale is chosen.
  localizeDocumentTree(doc.documentElement, translate);
  return true;
}

export function localizationBridgeStats() {
  return Object.freeze({ ...stats, canvasSamples: canvasSamples.slice(), installed });
}

export function stopLocalizedDocumentBridge() {
  if (observer) observer.disconnect();
  if (restoreCanvasText) restoreCanvasText();
  observer = null;
  restoreCanvasText = null;
  activeTranslate = null;
  installed = false;
}

function installObserver(doc) {
  if (typeof MutationObserver !== 'function') return;
  observer = new MutationObserver((records) => {
    stats.mutationBatches += 1;
    const translate = activeTranslate;
    if (typeof translate !== 'function') return;
    for (const record of records) {
      if (record.type === 'characterData') localizeTextNode(record.target, translate);
      else if (record.type === 'attributes') localizeAttribute(record.target, record.attributeName, translate);
      else for (const node of record.addedNodes || []) visit(node, translate);
    }
  });
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: LOCALIZED_ATTRIBUTES,
  });
}

function visit(node, translate) {
  if (!node) return;
  if (node.nodeType === 3) {
    localizeTextNode(node, translate);
    return;
  }
  if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
  if (node.nodeType === 1) {
    if (shouldSkipElement(node)) return;
    for (const attribute of LOCALIZED_ATTRIBUTES) localizeAttribute(node, attribute, translate);
  }
  for (const child of node.childNodes || []) visit(child, translate);
}

function localizeTextNode(node, translate) {
  const value = String(node && node.nodeValue || '');
  if (!value) return;
  const parent = node.parentElement;
  if (!parent || shouldSkipElement(parent)) return;
  const lastRendered = renderedText.get(node);
  // Our own last write is not a new source; anything else (or the first visit) is authored source.
  const source = (lastRendered !== undefined && lastRendered === value)
    ? sourceText.get(node)
    : value;
  if (source == null) return;
  const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const body = match ? match[2] : source;
  sourceText.set(node, source);
  if (!isTranslatable(body)) {
    renderedText.set(node, value);
    return;
  }
  const renderedBody = translate(body);
  const rendered = `${match ? match[1] : ''}${renderedBody}${match ? match[3] : ''}`;
  renderedText.set(node, rendered);
  if (rendered !== value) {
    stats.textNodes += 1;
    node.nodeValue = rendered;
  }
}

function localizeAttribute(element, attribute, translate) {
  if (!element || !attribute || !element.hasAttribute || !element.hasAttribute(attribute)) return;
  const value = element.getAttribute(attribute);
  let sourceCache = sourceAttributes.get(element);
  if (!sourceCache) {
    sourceCache = new Map();
    sourceAttributes.set(element, sourceCache);
  }
  let renderedCache = renderedAttributes.get(element);
  if (!renderedCache) {
    renderedCache = new Map();
    renderedAttributes.set(element, renderedCache);
  }
  const lastRendered = renderedCache.get(attribute);
  const source = (lastRendered !== undefined && lastRendered === value)
    ? sourceCache.get(attribute)
    : value;
  sourceCache.set(attribute, source);
  if (!isTranslatable(source)) {
    renderedCache.set(attribute, value);
    return;
  }
  const rendered = translate(source);
  renderedCache.set(attribute, rendered);
  if (rendered !== value) {
    stats.attributes += 1;
    element.setAttribute(attribute, rendered);
  }
}

function isTranslatable(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || !/[A-Za-z]/.test(text)) return false;
  // Explicitly localized screen copy reaches the observer too. Never pseudo-localize it twice.
  if (text.startsWith('⟦') && text.endsWith('⟧')) return false;
  return true;
}

function shouldSkipElement(element) {
  if (!element || SKIP_TAGS.has(element.tagName)) return true;
  if (element.matches && element.matches(SKIP_SELECTOR)) return true;
  return !!(element.closest && element.closest(SKIP_SELECTOR));
}

function installCanvasTextBridge(view) {
  const proto = view && view.CanvasRenderingContext2D && view.CanvasRenderingContext2D.prototype;
  if (!proto || restoreCanvasText) return;
  const original = {
    fillText: proto.fillText,
    strokeText: proto.strokeText,
    measureText: proto.measureText,
  };
  if (!original.fillText || !original.strokeText || !original.measureText) return;

  const render = (value) => {
    const source = String(value == null ? '' : value);
    if (!isTranslatable(source) || typeof activeTranslate !== 'function') return source;
    const localized = activeTranslate(source);
    if (localized !== source && canvasSamples.length < 12) canvasSamples.push({ source, localized });
    return localized;
  };
  proto.measureText = function localizedMeasureText(text) {
    return original.measureText.call(this, render(text));
  };
  proto.fillText = function localizedFillText(text, ...args) {
    stats.canvasTextDraws += 1;
    return original.fillText.call(this, render(text), ...args);
  };
  proto.strokeText = function localizedStrokeText(text, ...args) {
    stats.canvasTextDraws += 1;
    return original.strokeText.call(this, render(text), ...args);
  };
  restoreCanvasText = () => {
    proto.fillText = original.fillText;
    proto.strokeText = original.strokeText;
    proto.measureText = original.measureText;
  };
}

function injectOverflowStyle(doc, locale) {
  if (locale !== 'qps-ploc' || doc.getElementById(PSEUDO_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = PSEUDO_STYLE_ID;
  style.setAttribute('data-localization-skip', '');
  style.textContent = `
    html[data-locale="qps-ploc"] #screens .screen { min-width:0; max-width:100vw; }
    html[data-locale="qps-ploc"] #screens :is(button,label,h1,h2,h3,h4,p,li,td,th,.sf-slot-name,.sf-slot-sub) {
      min-width:0; max-width:100%; overflow-wrap:anywhere; word-break:normal;
    }
    html[data-locale="qps-ploc"] #screens :is(button,.sf-tab) {
      white-space:normal; block-size:auto; min-block-size:2.5rem;
    }
    html[data-locale="qps-ploc"] #screens :is(.sf-tabbar,.sf-foot) { flex-wrap:wrap; }
    html[data-locale="qps-ploc"] #screens .sf-menu { min-width:min(360px,92vw); }
  `;
  (doc.head || doc.documentElement).appendChild(style);
}
