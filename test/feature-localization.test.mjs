import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inventoryText, makeLocalizationKey } from '../scripts/lib/localizationInventory.mjs';
import { createBreakwaterRow, nextActionFor } from '../src/features/breakwaterSpur/project.js';
import { BREAKWATER_CHARTER, BREAKWATER_PHASE } from '../src/features/breakwaterSpur/definition.js';
import { buildBreakwaterSpurOffer } from '../src/features/breakwaterSpur/readModel.js';
import { createBreakwaterSpurFreight } from '../src/features/breakwaterSpur/freight.js';
import { COUNTERWEIGHT_EVENTS } from '../src/features/counterweightCircuit/definition.js';
import { registrarOfferSpec, resultOfferSpec } from '../src/features/counterweightCircuit/readModel.js';
import { CINDERGLASS_JOB_PHASES, CINDERGLASS_JOB_TEXT, CINDERGLASS_JOB_TERMS_COPY } from '../src/features/cinderglassJob/definition.js';
import { cinderglassJobRevisit } from '../src/features/cinderglassJob/contact.js';
import { buildCinderglassJobView, cinderglassJobPublicPrompt } from '../src/features/cinderglassJob/readModel.js';
import { READINESS } from '../src/localization/catalogs/readiness.generated.js';
import { createBus } from '../src/core/eventBus.js';
import { createPromptDeck } from '../src/ui/promptDeck.js';
import { createCounterweightCircuitPromptSystem, CIRCUIT_PROMPT_ID } from '../src/features/counterweightCircuit/prompts.js';
import { mountCinderglassJobContracts } from '../src/features/cinderglassJob/integration.js';
import { mountCinderglassJobPresentation, CINDERGLASS_PROMPT_ID } from '../src/features/cinderglassJob/presentation.js';
import { stopLocalizedDocumentBridge } from '../src/localization/domBridge.js';

test('feature copy and assembled templates reach the existing source-text lookup', async () => {
  const config = JSON.parse(readFileSync('scripts/localization-surfaces.json', 'utf8'));
  const commit = '793587dfa662';
  const paths = [
    'src/features/breakwaterSpur/readModel.js', 'src/features/breakwaterSpur/project.js',
    'src/features/breakwaterSpur/freight.js', 'src/features/counterweightCircuit/definition.js',
    'src/features/counterweightCircuit/readModel.js', 'src/features/cinderglassJob/definition.js',
    'src/features/cinderglassJob/contact.js', 'src/features/cinderglassJob/readModel.js',
    'src/features/rigWorkshop/presentation.js',
  ];
  const current = new Set(['src/features/counterweightCircuit/definition.js',
    'src/features/counterweightCircuit/readModel.js', 'src/features/cinderglassJob/definition.js']);
  const entries = paths.flatMap(path => inventoryText({ path, config,
    source: current.has(path) ? readFileSync(path, 'utf8')
      : execFileSync('git', ['show', `${commit}:${path}`], { encoding: 'utf8' }) }));
  const byMessage = new Map(entries.map(entry => [entry.message, entry]));

  const row = createBreakwaterRow(); row.phase = BREAKWATER_PHASE.SIGNALED;
  const breakwaterContact = buildBreakwaterSpurOffer({ world: { breakwaterSpur: row } }).detail;
  const breakwaterObjective = nextActionFor(row);
  row.charter = BREAKWATER_CHARTER.COOP;
  const freight = createBreakwaterSpurFreight({ state: { simTime: 1 }, bus: {} },
    { spawnLooseLoad: () => ({ ok: true }) }, {});
  assert.equal(freight.stageSupplyLoad(row).ok, true);
  const breakwaterReceipt = row.receipts.at(-1).text;
  const circuitState = { world: {}, entities: new Map() };
  const circuitContact = registrarOfferSpec(circuitState).headline;
  const circuitObjective = COUNTERWEIGHT_EVENTS[0].legs[0].hint;
  const result = resultOfferSpec({ outcome: 'complete', reason: 'done', rewardCr: 60 });
  const circuitReceipt = result.detail;
  const cinderContact = cinderglassJobRevisit(null).line;
  const cgState = { world: { cinderglassJob: { version: 1, phase: CINDERGLASS_JOB_PHASES.RECON } }, entities: new Map() };
  const cinderObjective = buildCinderglassJobView(cgState).objective;
  const cinderReceipt = CINDERGLASS_JOB_TEXT.paidTala;
  const exact = [breakwaterContact, breakwaterObjective, breakwaterReceipt, circuitContact,
    circuitObjective, cinderContact, cinderObjective, cinderReceipt];
  for (const message of exact) {
    const entry = byMessage.get(message);
    assert.ok(entry, `actual copy must be extracted: ${message}`);
    assert.equal(entry.key, makeLocalizationKey(entry.path, entry.sink, message));
  }
  assert.equal(byMessage.has(circuitReceipt), false, 'a composed receipt is not falsely claimed as an exact lookup');
  assert.equal(byMessage.has(CINDERGLASS_JOB_TEXT.offerDetail), false, 'interpolated terms do not match their template');
  assert.ok(byMessage.has(result.detailTemplate), 'result template is extracted');
  assert.ok(byMessage.has(CINDERGLASS_JOB_TERMS_COPY.template), 'terms template is extracted');
  const prompt = cinderglassJobPublicPrompt({ token: 'test', detail: CINDERGLASS_JOB_TEXT.offerDetail });
  assert.deepEqual(prompt.detailCopy, CINDERGLASS_JOB_TERMS_COPY);
  assert.equal(cinderglassJobPublicPrompt({ token: 'test', detail: 'Different terms' }).detailCopy, undefined);
  assert.equal(COUNTERWEIGHT_EVENTS[0].tagline, 'Tow the practice load into the receiving cradle — arrive gentle.');
  assert.equal(COUNTERWEIGHT_EVENTS[0].legs[1].hint, 'Seat the load in the cradle at ≤ 4 WU/s');
  assert.ok(!entries.some(e => e.message === 'breakwaterSpurPrompt' || e.message === 'destroyed'
    || (e.path.includes('rigWorkshop') && e.message === 'warning') || e.message.endsWith('.glb')));

  // Load the proposed inventory into the real browser-side catalog loader; no generated file is written.
  const catalog = { schema: 'spaceface.localizationCatalog.v1', locale: 'en-US',
    // The fixture uses the current picker token to satisfy the loader's identity guard.
    inventoryDigest: READINESS.inventoryDigest, messages: Object.fromEntries(entries.map(e => [e.key, e.message])) };
  const barks = JSON.parse(readFileSync('src/localization/barks.generated.json', 'utf8'));
  const names = ['process', 'fetch', 'window', 'document', 'self', '__SPACEFACE_PRODUCTION__'];
  const saved = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, { process: undefined, __SPACEFACE_PRODUCTION__: false,
    window: { location: { search: '' } }, document: { baseURI: 'https://game.example/' },
    self: { location: { href: 'https://game.example/' } },
    fetch: async url => ({ ok: true, json: async () => String(url).endsWith('barks.generated.json') ? barks : catalog }) });
  try {
    const source = await import('../src/localization/sourceText.js');
    const { machineTranslate } = await import('../src/localization/pipeline.js');
    for (const locale of ['es-ES', 'fr-FR', 'de-DE', 'pt-BR']) {
      for (const proper of ['Nessa Vale', 'Tala Rook', 'Oren Dask', 'Vesi Khand', 'CG-7', 'Mule']) {
        assert.equal(machineTranslate(locale, proper), proper, `${locale}: ${proper}`);
      }
    }
    await source.ensureLocaleReady('es-ES');
    source.setGameLocale('es-ES');
    for (const message of exact) {
      const entry = byMessage.get(message);
      assert.equal(source.localizeText(message), source.gameLocalization.t(entry.key), message);
    }
    // es-MX resolves the generated es-ES catalog through the actual base-locale alias.
    // An unknown runtime string has no es-MX machine dictionary, so the changed output
    // demonstrates lookup of the extracted key rather than the unknown-text fallback.
    source.setGameLocale('es-MX');
    for (const [template, values, english] of [
      [result.detailTemplate, result.detailValues, circuitReceipt],
      [CINDERGLASS_JOB_TERMS_COPY.template, CINDERGLASS_JOB_TERMS_COPY.values, CINDERGLASS_JOB_TEXT.offerDetail],
    ]) {
      assert.equal(source.localizeText(template, values), source.gameLocalization.t(byMessage.get(template).key, values));
      assert.notEqual(source.localizeText(template, values), english);
    }
    source.setGameLocale('en-US');
    assert.equal(source.localizeText(result.detailTemplate, result.detailValues), circuitReceipt);
    assert.equal(source.localizeText(CINDERGLASS_JOB_TERMS_COPY.template, CINDERGLASS_JOB_TERMS_COPY.values), CINDERGLASS_JOB_TEXT.offerDetail);
    for (const message of [...exact, circuitReceipt, CINDERGLASS_JOB_TEXT.offerDetail]) {
      assert.equal(source.localizeText(message), message);
    }
    await checkMountedReaders(source, result);
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  }
});

async function checkMountedReaders(source, result) {
  const doc = documentFixture(), originalDocument = globalThis.document;
  const originalObserver = globalThis.MutationObserver;
  let observer;
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() {}
    update(target) { this.callback([{ type: 'attributes', target, attributeName: 'data-localization-copy' }]); }
  };
  globalThis.document = doc;
  const bus = createBus(), state = { mode: 'flight', simTime: 0, ui: {}, player: { docked: false } };
  const deck = createPromptDeck({ document: doc, state, bus });
  const counter = createCounterweightCircuitPromptSystem(); counter.init({ state, bus });
  const stationState = { ui: { dockedStationId: 'station_tethys' }, cinderglassJobView: {
    token: 'life:1', contacts: [{ title: 'Tala Rook', line: 'Read the offer.', actions: [] }], navigation: [],
    offer: { token: 'life:1', epoch: 1, title: 'Tala Rook', headline: 'Recovery',
      detail: CINDERGLASS_JOB_TEXT.offerDetail, choices: [] },
  } };
  const station = mountCinderglassJobContracts({ state: stationState, bus }, doc.body);
  const stationPanel = doc.body.children.find(node => Object.hasOwn(node.dataset, 'cinderglassContracts'));
  const flight = mountCinderglassJobPresentation({ state, bus, deck });
  try {
    bus.emit('counterweightCircuit:offer', result);
    bus.emit('cinderglassJob:offer', { token: 'life:1', operationId: 'op:1', revision: 1,
      title: 'Tala Rook', headline: 'Recovery', detail: CINDERGLASS_JOB_TEXT.offerDetail,
      choices: [{ id: 'leave', label: 'Leave' }] });
    const find = (node, predicate) => predicate(node) ? node : node.children.map(n => find(n, predicate)).find(Boolean);
    const resultNode = find(doc.body, node => node.className?.split(/\s+/).includes('sf-prompt__detail'));
    const termsNode = find(stationPanel, node => node.getAttribute?.('data-localization-copy')?.includes('intactCr'));
    assert.ok(resultNode, 'result mounts in the real decision deck');
    assert.ok(termsNode, 'terms mount in the Contracts reader');
    assert.equal(resultNode.textContent, result.detail);
    assert.equal(termsNode.textContent, CINDERGLASS_JOB_TEXT.offerDetail);
    source.setGameLocale('es-MX');
    assert.equal(resultNode.textContent, source.localizeText(result.detailTemplate, result.detailValues));
    assert.equal(termsNode.textContent, source.localizeText(CINDERGLASS_JOB_TERMS_COPY.template, CINDERGLASS_JOB_TERMS_COPY.values));
    assert.match(termsNode.textContent, /450CR.*300CR.*150CR/);
    assert.notEqual(resultNode.textContent, result.detail);
    source.setGameLocale('en-US');
    assert.equal(resultNode.textContent, result.detail, 'locale switch restores original result including line breaks');
    assert.equal(termsNode.textContent, CINDERGLASS_JOB_TEXT.offerDetail, 'locale switch restores original terms');
    source.setGameLocale('es-MX');
    const updated = resultOfferSpec({ outcome: 'failed', reason: 'arrival_speed', reasonDetail: 3.2, rewardStatus: 'wallet_full' });
    bus.emit('counterweightCircuit:offer', updated);
    observer.update(resultNode);
    assert.equal(resultNode.textContent, source.localizeText(updated.detailTemplate, updated.detailValues));
    assert.match(resultNode.textContent, /3\.2 WU\/s/);
    assert.equal(deck.hasDecision(CIRCUIT_PROMPT_ID), true, 'template updates preserve the decision identity');
    assert.equal(deck.hasDecision(CINDERGLASS_PROMPT_ID), true);
    source.setGameLocale('en-US');
    assert.equal(resultNode.textContent, updated.detail);
    source.setGameLocale('es-MX');
    deck.raise(CINDERGLASS_PROMPT_ID);
    const flightTerms = doc.getElementById('sf-prompt-detail-cinderglassJob_decision');
    assert.ok(flightTerms, 'terms mount in the raised flight decision');
    // Raising a chip mounts an already-existing frame after the locale was chosen.
    observer.callback([{ type: 'childList', addedNodes: [flightTerms] }]);
    assert.equal(flightTerms.textContent, source.localizeText(CINDERGLASS_JOB_TERMS_COPY.template, CINDERGLASS_JOB_TERMS_COPY.values));
    source.setGameLocale('en-US');
    assert.equal(flightTerms.textContent, CINDERGLASS_JOB_TEXT.offerDetail);
  } finally {
    station.destroy(); flight.destroy(); counter.destroy(); deck.destroy(); stopLocalizedDocumentBridge();
    globalThis.document = originalDocument;
    if (originalObserver === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = originalObserver;
  }
}

// Tiny DOM with real text-node semantics: enough to exercise the actual mounted owners and bridge.
function documentFixture() {
  const listeners = new Map();
  const make = tagName => {
    const node = { nodeType: 1, tagName: tagName.toUpperCase(), id: '', className: '', hidden: false,
      disabled: false, attrs: {}, dataset: {}, listeners: {}, parentNode: null, childNodes: [],
      style: { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } },
      get children() { return this.childNodes.filter(n => n.nodeType === 1); },
      get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; },
      get firstElementChild() { return this.children[0] || null; },
      get lastElementChild() { return this.children.at(-1) || null; },
      get childElementCount() { return this.children.length; },
      get nextElementSibling() { const a = this.parentNode?.children || []; return a[a.indexOf(this) + 1] || null; },
      get textContent() { return this.childNodes.map(n => n.nodeType === 3 ? n.nodeValue : n.textContent).join(''); },
      set textContent(value) { this.childNodes = []; if (String(value)) this.childNodes.push({ nodeType: 3, nodeValue: String(value), parentNode: this, parentElement: this }); },
      appendChild(child) { detach(child); child.parentNode = this; this.childNodes.push(child); return child; },
      append(...nodes) { nodes.forEach(n => this.appendChild(n)); },
      insertBefore(child, ref) { detach(child); child.parentNode = this; const index = this.childNodes.indexOf(ref);
        this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child); return child; },
      replaceChildren(...nodes) { this.childNodes.forEach(n => { n.parentNode = null; }); this.childNodes = []; this.append(...nodes); },
      remove() { detach(this); },
      contains(target) { return target === this || this.children.some(n => n.contains(target)); },
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name] ?? null; },
      hasAttribute(name) { return Object.hasOwn(this.attrs, name); },
      removeAttribute(name) { delete this.attrs[name]; },
      matches(selector) { return selector === '[data-localization-skip]' && this.hasAttribute('data-localization-skip'); },
      closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); },
      querySelector() { return null; },
    };
    node.classList = { contains(name) { return node.className.split(/\s+/).includes(name); },
      add(...names) { node.className = [...new Set([...node.className.split(/\s+/), ...names])].filter(Boolean).join(' '); },
      remove(...names) { node.className = node.className.split(/\s+/).filter(x => !names.includes(x)).join(' '); },
      toggle(name, force) { const add = force === undefined ? !this.contains(name) : force; if (add) this.add(name); else this.remove(name); return add; } };
    return node;
  };
  function detach(node) { const list = node.parentNode?.childNodes, i = list?.indexOf(node) ?? -1;
    if (i >= 0) list.splice(i, 1); node.parentNode = null; }
  const head = make('head'), body = make('body'), documentElement = make('html');
  body.id = 'ui-root'; documentElement.classList.add('sf-reduce-motion'); documentElement.append(head, body);
  const find = (node, id) => node.id === id ? node : node.children.map(n => find(n, id)).find(Boolean);
  return { head, body, documentElement, createElement: make,
    defaultView: { innerWidth: 900, innerHeight: 900, addEventListener() {}, removeEventListener() {} },
    getElementById(id) { return find(documentElement, id) || null; },
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); } };
}
