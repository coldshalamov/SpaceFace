import { runtimeAssetUrl } from '../../core/runtimeAssetUrl.js';

const loads = new WeakMap();
const screenGates = new WeakMap();

/** Load one authored sheet in place, falling back to its source string if the sidecar is unavailable. */
export function loadCssSidecar(doc, { id, path, fallback }) {
  if (!doc?.head || typeof doc.createElement !== 'function') return Promise.resolve();
  let byId = loads.get(doc);
  if (!byId) { byId = new Map(); loads.set(doc, byId); }
  if (byId.has(id)) return byId.get(id);

  const existing = typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  if (existing) {
    const ready = Promise.resolve();
    byId.set(id, ready);
    return ready;
  }

  const link = doc.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = runtimeAssetUrl(path, import.meta.url);
  let settle;
  let fail;
  const ready = new Promise((resolve, reject) => { settle = resolve; fail = reject; });
  byId.set(id, ready);
  link.onload = () => settle();
  link.onerror = async () => {
    try {
      const css = await fallback();
      const style = doc.createElement('style');
      style.id = id;
      style.textContent = css;
      if (typeof link.replaceWith === 'function') link.replaceWith(style);
      else if (link.parentNode?.insertBefore) {
        link.parentNode.insertBefore(style, link);
        link.parentNode.removeChild(link);
      } else doc.head.appendChild(style);
      settle();
    } catch (error) {
      byId.delete(id);
      if (link.parentNode?.removeChild) link.parentNode.removeChild(link);
      fail(error);
    }
  };
  doc.head.appendChild(link);
  return ready;
}

/** Keep a non-screen overlay hidden until its authored stylesheet is usable. Failure stays gated. */
export function deferCssVisibility(root, cssReady) {
  root?.setAttribute?.('data-ui-css-pending', '');
  return Promise.resolve(cssReady).then(() => root?.removeAttribute?.('data-ui-css-pending'));
}

/** Coordinate authored screen-content readiness with the CSS needed to lay it out. */
export function deferScreenCssReady(root, cssReady) {
  const gate = { content: false, css: false };
  screenGates.set(root, gate);
  if (root?.dataset) root.dataset.kReady = '0';
  // ScreenManager owns inline visibility and inert on each stack transition. This attribute is a
  // separate, kit.css critical rule so its sync cleanup cannot reveal a screen before CSS settles.
  root?.setAttribute?.('data-ui-css-pending', '');
  const revealIfReady = () => {
    if (screenGates.get(root) !== gate) return;
    if (gate.content && gate.css) {
      root?.removeAttribute?.('data-ui-css-pending');
      if (root?.dataset) root.dataset.kReady = '1';
    }
  };
  Promise.resolve(cssReady).then(() => {
    if (screenGates.get(root) !== gate) return;
    gate.css = true;
    revealIfReady();
  }).catch((error) => {
    if (screenGates.get(root) === gate) {
      console.error('[ui-css] screen stylesheet failed:', error);
      // The authored CSS and its generated sidecar are both unavailable. Keep readiness truthful,
      // but release the critical visual/input gate so the structural fallback remains usable.
      root?.removeAttribute?.('data-ui-css-pending');
    }
  });
  return () => {
    if (screenGates.get(root) !== gate) return;
    gate.content = true;
    revealIfReady();
  };
}
