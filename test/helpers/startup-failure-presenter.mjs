import { createLoadingPresenter } from '../../src/ui/loadingPresenter.js';
import { fakeDom, findAll } from './fake-dom.mjs';

// Mount the production recovery panel on the same minimal DOM used by screen tests.
export function mountStartupFailurePresenter(t, bus, state) {
  const document = fakeDom();
  const createElement = document.createElement;
  const prepare = (node) => {
    node.removeChild = (child) => {
      node.children = node.children.filter(item => item !== child);
      child.parentNode = null;
      return child;
    };
    node.querySelectorAll = (selector) => findAll(node, candidate => candidate !== node && (
      selector.startsWith('.') ? candidate.classList.contains(selector.slice(1))
        : selector.startsWith('[') ? candidate.getAttribute(selector.slice(1, -1)) !== null
          : candidate.tagName === selector
    ));
    node.querySelector = selector => node.querySelectorAll(selector)[0] || null;
    return node;
  };
  prepare(document.head);
  document.createElement = tag => prepare(createElement(tag));
  document.querySelector = selector => document.head.querySelector(selector);
  document.defaultView = {};
  const overlay = document.createElement('div');
  overlay.id = 'boot-overlay';
  overlay.style.display = 'none';
  overlay.classList.add('hidden');
  document.head.appendChild(overlay);
  const previousDocument = globalThis.document;
  globalThis.document = document;
  const presenter = createLoadingPresenter({ document, bus, state, hideDelayMs: 0 });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    presenter.destroy();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  };
  t.after(close);
  return { overlay, close };
}
