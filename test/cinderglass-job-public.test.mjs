// Actual prompt-deck controls mounted on a minimal DOM. This is a headless UI
// route check, not rendered flight or an earned campaign completion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createPromptDeck } from '../src/ui/promptDeck.js';
import { mountCinderglassJobPresentation, CINDERGLASS_SERVICE_PROMPT_ID } from '../src/features/cinderglassJob/presentation.js';
import { buildCinderglassJobView } from '../src/features/cinderglassJob/readModel.js';
import { cinderglassJobFirstDeliveryComplete } from '../src/features/cinderglassJob/contact.js';
import { createCinderglassJobState } from '../src/features/cinderglassJob/operation.js';
import { CINDERGLASS_JOB_SECTOR_ID } from '../src/features/cinderglassJob/definition.js';
import { mountCinderglassJobContracts } from '../src/features/cinderglassJob/integration.js';

const prompt = revision => ({ id: 'approaches', token: 'life:1', operationId: 'original:1', revision,
  headline: 'Inspection · both approaches are legal', detail: 'Choose a physical approach.',
  choices: [{ id: 'propose', label: 'Post 150CR deposit' }, { id: 'serviceStart', label: 'Service the latch' },
    { id: 'leave', label: 'Leave' }] });

test('docked Tethys Contracts control shows actual terms and forwards captured acceptance without awarding',()=>{
  const previous=globalThis.document, doc=promptDeckDocument(900,900);globalThis.document=doc;
  const bus=createBus(), sent=[];
  const state={ui:{dockedStationId:'station_tethys'},cinderglassJobView:{token:'life:1',contacts:[{
    title:'Tala Rook · disputed consignment',line:'Title is contested. Bring the original.',token:'life:1',
    actions:[{id:'contact',label:'Read recovery terms'}],actor:'tala'}],navigation:[]}};
  bus.on('cinderglassJob:action',p=>{sent.push(p);p.result={ok:true};});
  try {
    const mounted=mountCinderglassJobContracts({state,bus},doc.body),panel=doc.body.children.at(-1);
    const buttons=n=>[...(n.tagName==='button'?[n]:[]),...n.children.flatMap(buttons)];
    buttons(panel)[0].click();assert.equal(sent[0].action,'contact');assert.equal(sent[0].token,'life:1');
    state.cinderglassJobView.offer={token:'life:1',operationId:'',epoch:2,title:'Tala',headline:'Disputed title',
      detail:'450CR intact; 300CR damaged. 150CR inspection deposit is refunded only on accepted Tala return.',
      choices:[{id:'accept',label:'Take the recovery'},{id:'decline',label:'Leave it'}]};
    mounted.frame();
    assert.ok(panel.children.some(n=>n.textContent.includes('150CR')));
    buttons(panel).find(n=>n.textContent==='Take the recovery').click();
    assert.equal(sent.at(-1).action,'accept');assert.equal(sent.at(-1).offerEpoch,2);
    assert.equal(state.cinderglassJobView.outcome,undefined);
    mounted.destroy();assert.equal(doc.body.children.includes(panel),false);
  } finally {globalThis.document=previous;}
});

test('canonical first delivery gates pure contact rows; bounded view preserves explicit optional tracking', () => {
  const st = createCinderglassJobState();
  const state = { mode: 'station', simTime: 20, entities: new Map(), cinderglassJobToken: 'life:1',
    world: { currentSectorId: CINDERGLASS_JOB_SECTOR_ID, cinderglassJob: st },
    story: { beatIndex: 4, campaign47a: { stepProgress: {} } }, player: { stats: { missionsDone: 200 } } };
  assert.equal(cinderglassJobFirstDeliveryComplete(state), false);
  assert.equal(buildCinderglassJobView(state).contacts.length, 0);
  state.story.campaign47a.stepProgress['1'] = { completed: ['alloy_run'] };
  assert.equal(cinderglassJobFirstDeliveryComplete(state), true);
  Object.assign(st, { phase: 'decide', operationId: 'original:1', promptRevision: 2, approachPrompt: prompt(2), scanDone: false });
  st.rememberedFacts = Array.from({ length: 50 }, (_, i) => ({ id: `${i}`, text: 'fact', atS: i }));
  const before = structuredClone(st), view = buildCinderglassJobView(state);
  assert.equal(view.contacts[0].actions[0].id, 'revisit');
  assert.equal(view.facts.length, 6); assert.equal(view.markers.length, 1, 'inspection knowledge is not exposed before scan');
  assert.deepEqual(view.approachPrompt.choices.map(c => c.id), ['propose', 'serviceStart', 'leave']);
  assert.ok(view.navigation.every(n => n.preserveCourse && n.priority === 'optional' && n.action.action === 'track'));
  assert.deepEqual(st, before, 'public projection does not mutate source');
});

test('real prompt deck exposes both approaches, fresh refusals, Leave/re-entry and captured life tokens', () => {
  const doc = promptDeckDocument(900, 900), bus = createBus(), sent = [], toasts = [];
  const state = { mode: 'flight', simTime: 0, ui: {}, player: { docked: false },
    cinderglassJobView: { approachPrompt: prompt(1) } };
  const deck = createPromptDeck({ document: doc, state, bus });
  const ui = mountCinderglassJobPresentation({ state, bus, deck });
  const off = bus.on('cinderglassJob:action', p => {
    sent.push({ ...p });
    if (p.action === 'propose') {
      p.result = { ok: false, reason: 'insufficient_funds' };
      const next = { ...prompt(2), headline: 'Full deposit unavailable · no charge' };
      state.cinderglassJobView.approachPrompt = next;
      bus.emit('cinderglassJob:refused', { reason: 'insufficient_funds', revision: 2 });
      bus.emit('cinderglassJob:servicePrompt', next);
    }
  });
  bus.on('toast', p => toasts.push(p));
  try {
    assert.equal(deck.choose(CINDERGLASS_SERVICE_PROMPT_ID, 'propose', 'touch'), true);
    assert.equal(sent[0].token, 'life:1'); assert.equal(sent[0].operationId, 'original:1');
    assert.equal(sent[0].revision, 1); assert.equal(sent[0].source, 'touch');
    assert.equal(deck.hasDecision(CINDERGLASS_SERVICE_PROMPT_ID), true, 'synchronous fresh refusal card survives');
    assert.match(toasts[0].text, /No credits were charged/);
    assert.equal(deck.choose(CINDERGLASS_SERVICE_PROMPT_ID, 'leave'), true);
    ui.frame(1, state); assert.equal(deck.hasDecision(CINDERGLASS_SERVICE_PROMPT_ID), false, 'old worker snapshot cannot reopen consumed card');
    state.cinderglassJobView.approachPrompt = prompt(3); ui.frame(1, state);
    assert.equal(deck.choose(CINDERGLASS_SERVICE_PROMPT_ID, 'serviceStart'), true);
    assert.equal(sent.at(-1).action, 'serviceStart');
    state.cinderglassJobView.approachPrompt = { ...prompt(4), token: 'life:2' }; ui.frame(1, state);
    assert.equal(deck.choose(CINDERGLASS_SERVICE_PROMPT_ID, 'leave'), true);
    assert.equal(sent.at(-1).token, 'life:2');
    bus.emit('cinderglassJob:fact', { id: 'read', text: 'The scan is accepted.' });
    assert.equal(toasts.at(-1).source, 'cinderglassJob');
  } finally { off(); ui.destroy(); deck.destroy(); }
});

test('browser remount reads worker mirror, forwards exact receiving quote, and disposes subscriptions/cards', () => {
  const doc = promptDeckDocument(390, 844), bus = createBus(), sent = [];
  const state = { mode: 'flight', ui: {}, player: { docked: false }, cinderglassJobView: {
    approachPrompt: { ...prompt(5), choices: [{ id: 'receiveBroker', label: 'Accept 300CR · unlawful custody',
      recipient: 'broker', quoteId: 'original:1:quote:7' }, { id: 'leave', label: 'Leave' }] } } };
  const deck = createPromptDeck({ document: doc, state, bus });
  const first = mountCinderglassJobPresentation({ state, bus, deck });
  const ui = mountCinderglassJobPresentation({ state, bus, deck });
  bus.on('cinderglassJob:action', p => sent.push(p));
  try {
    assert.equal(first.owner._destroyed, true);
    assert.equal(deck.choose(CINDERGLASS_SERVICE_PROMPT_ID, 'receiveBroker'), true);
    assert.equal(sent.length, 1); assert.equal(sent[0].quoteId, 'original:1:quote:7');
    assert.equal(sent[0].recipient, 'broker');
    ui.destroy(); bus.emit('cinderglassJob:servicePrompt', prompt(6));
    assert.equal(deck.hasDecision(CINDERGLASS_SERVICE_PROMPT_ID), false);
  } finally { ui.destroy(); deck.destroy(); }
});
test('presentation admission requires exact original, mounted source and real geometry before one acknowledgement', () => {
  // Synthetic mesh initialization tests the admission protocol; it is not a
  // rendered asset or gameplay-camera visual acceptance.
  const bus = createBus(), received = [], scene = {};
  const row = { key: 'podId', id: 9, generation: 2, worldRecordId: 'pro:cinderglassJob:pod',
    assetId: 'pod_cargo_container', assetFile: 'assets/ships/release/parts/pods/pod_cargo_container.glb' };
  const mesh = { parent: scene, userData: { authoredAssetState: 'authored' },
    traverse(fn) { fn(this); } };
  const e = { id: 9, alive: true, occupantGeneration: 2, mesh,
    data: { worldRecordId: row.worldRecordId, cinderglassOperationId: 'op', cinderglassAssetId: row.assetId,
      cinderglassAssetFile: row.assetFile } };
  const state = { mode: 'flight', player: { docked: false }, ui: {}, entities: new Map([[9, e]]),
    render: { scene }, cinderglassJobView: { admission: { token: 'life:1', operationId: 'op', bodies: [row] } } };
  bus.on('cinderglassJob:presentationReady', p => received.push(p));
  const ui = mountCinderglassJobPresentation({ state, bus });
  try {
    assert.equal(received.length, 0, 'authored state string alone is insufficient');
    mesh.userData.spacefacePartUrl = row.assetFile;
    ui.frame(1, state); assert.equal(received.length, 0, 'source metadata without mounted geometry is insufficient');
    mesh.geometry = { attributes: { position: { count: 3 } } }; mesh.material = {};
    ui.frame(1, state); assert.equal(received.length, 1);
    assert.equal(received[0].token, 'life:1'); assert.deepEqual(received[0].bodies, [{ id: 9, generation: 2 }]);
    ui.frame(1, state); assert.equal(received.length, 1, 'same exact cohort acknowledged once');
    state.cinderglassJobView.admission.token = 'life:2'; e.occupantGeneration = 3;
    ui.frame(1, state); assert.equal(received.length, 1, 'recycled occupant is refused');
  } finally { ui.destroy(); }
});

function promptDeckDocument(width, height) {
  const listeners = new Map();
  const make = (tagName) => {
    const node = {
      tagName, id: '', className: '', textContent: '', hidden: false, disabled: false,
      children: [], attrs: {}, dataset: {}, listeners: {}, parentNode: null,
      style: { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } },
      get firstElementChild() { return this.children[0] || null; },
      get lastElementChild() { return this.children.at(-1) || null; },
      get nextElementSibling() {
        const siblings = this.parentNode?.children || [];
        return siblings[siblings.indexOf(this) + 1] || null;
      },
      get childElementCount() { return this.children.length; },
      appendChild(child) { detach(child); child.parentNode = this; this.children.push(child); return child; },
      append(...children) { for (const child of children) this.appendChild(child); },
      insertBefore(child, ref) {
        if (child === ref) return child;
        detach(child); child.parentNode = this;
        const index = ref ? this.children.indexOf(ref) : -1;
        if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
        return child;
      },
      replaceChildren(...children) { for (const child of [...this.children]) detach(child); this.append(...children); },
      remove() { detach(this); },
      contains(target) { return target === this || this.children.some((child) => child.contains(target)); },
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name] ?? null; },
      removeAttribute(name) { delete this.attrs[name]; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn); },
      click() { for (const fn of this.listeners.click || []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); },
    };
    function detach(child) {
      const siblings = child.parentNode?.children;
      const index = siblings?.indexOf(child) ?? -1;
      if (index >= 0) siblings.splice(index, 1);
      child.parentNode = null;
    }
    node.classList = {
      add(...names) { node.className = [...new Set([...node.className.split(/\s+/), ...names])].filter(Boolean).join(' '); },
      remove(...names) { node.className = node.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
      contains(name) { return node.className.split(/\s+/).includes(name); },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !node.classList.contains(name) : !!force;
        if (shouldAdd) node.classList.add(name); else node.classList.remove(name);
        return shouldAdd;
      },
    };
    return node;
  };
  const head = make('head');
  const body = make('body');
  body.id = 'ui-root';
  const documentElement = make('html');
  documentElement.classList.add('sf-reduce-motion');
  const viewListeners = new Map();
  const defaultView = {
    innerWidth: width,
    innerHeight: height,
    addEventListener(type, fn) { (viewListeners.get(type) || viewListeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { viewListeners.get(type)?.delete(fn); },
  };
  const doc = {
    head, body, documentElement, defaultView,
    createElement: make,
    getElementById(id) {
      if (id === 'ui-root') return body;
      const find = (node) => node.id === id ? node : node.children.map(find).find(Boolean) || null;
      return find(head) || find(body);
    },
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, event) { for (const fn of listeners.get(type) || []) fn({ ...event, preventDefault() {}, stopImmediatePropagation() {} }); },
  };
  return doc;
}
