import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createPipSpannerCrew, CREW_CONTEXT_RETRY_MS } from '../src/ui/orrery/pipSpannerCrew.js';
import { crucibleDraftScreen } from '../src/ui/screens/crucibleDraft.js';

class Node {
  constructor(doc) { this.ownerDocument = doc; this.children = []; this.dataset = {}; this.attrs = {}; }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
  remove() { this.removed = true; }
}
function crew() {
  const doc = { createElement:() => new Node(doc), createElementNS:() => new Node(doc) };
  return createPipSpannerCrew({ host:new Node(doc), doc });
}
const offer = { id:'gun', name:'Rail gun', slotIndex:2 };
const accepted = { generation:4, sequence:1, outcome:'accepted', offerId:'gun', name:'Rail gun', text:'Rail gun fitted.', charged:true, price:76 };

test('crew inspect and pending never claim a fit; only the owner receipt closes the jaws', () => {
  const view = crew(); view.inspect(offer);
  assert.match(view.status.textContent, /Mount 3/); assert.equal(view.root.dataset.state, 'inspect');
  view.pending(offer); assert.equal(view.root.dataset.state, 'pending');
  view.receipt(accepted); assert.equal(view.root.dataset.state, 'accepted');
  assert.match(view.status.textContent, /76 run credits spent/);
  view.receipt({ ...accepted, sequence:2, outcome:'denied', text:'Not enough run credits.' });
  assert.equal(view.root.dataset.state, 'denied'); assert.match(view.status.textContent, /Not enough run credits/);
});

test('hide during pending rereads the receipt without motion, and reopen cannot replay it', () => {
  const view = crew(); view.inspect(offer); view.pending(offer); view.setActive(false);
  view.receipt(accepted);
  assert.equal(view.root.dataset.animate, 'false'); assert.equal(view.root.hidden, true);
  view.setActive(true); view.receipt(accepted);
  assert.equal(view.root.dataset.animate, 'false'); assert.equal(view.root.hidden, false);
  assert.equal(view.root.dataset.state, 'accepted');
  view.dispose(); assert.equal(view.root.removed, true);
});

test('a completed receipt cannot seat the new automatically selected item, or leak into another armory', () => {
  const view = crew(); view.scope(4); view.inspect({ id:'next', name:'Shield', slotIndex:3 });
  view.receipt(accepted);
  assert.equal(view.root.dataset.state, 'inspect'); assert.equal(view.root.dataset.animate, 'false');
  assert.match(view.status.textContent, /Rail gun/);
  view.scope(5); view.inspect(offer); view.receipt(null);
  assert.equal(view.root.dataset.state, 'inspect'); assert.doesNotMatch(view.status.textContent, /credits spent/);
});

test('double confirmation cannot buy the refreshed next selection until explicit inspection re-arms it', () => {
  let emits = 0;
  const screen = Object.create(crucibleDraftScreen), next = { id:'next', available:true };
  screen._reading = { offerId:'gun' };
  const owner = { currentOffers:() => [ { ...offer, available:true }, next ] };
  const ctx = { state:{run:{phase:'draft'}}, registry:{get:() => owner}, bus:{emit:() => {
    emits++;
    screen._purchaseSelected(ctx); // A synchronous event observer cannot recurse either.
    screen._reading.offerId = next.id;
  }} };
  screen._offersById = new Map([[next.id, next]]); screen._paintReading = () => {};
  const nextFocus = { target:{ closest:() => ({ dataset:{offerId:next.id} }) } };
  screen.refresh = () => screen._readFrom(nextFocus); screen._ctx = ctx;
  screen._purchaseSelected(ctx); screen._purchaseSelected(ctx);
  assert.equal(emits, 1); assert.equal(screen._flash, undefined);
  screen._restoringInspection = true; screen._readFrom(nextFocus);
  screen._purchaseSelected(ctx); assert.equal(emits, 1, 'focus restoration is not an explicit inspection');
  screen._restoringInspection = false; screen._readFrom(nextFocus);
  screen._purchaseSelected(ctx); assert.equal(emits, 2);
});

test('receipt-driven cosmetic motion uses no simulation time and does not schedule delayed gameplay', () => {
  const view = crew();
  view.inspect(offer); view.receipt(accepted);
  assert.equal(view.root.dataset.animate, 'true');
  assert.equal(view.status.attrs['aria-live'], 'polite');
  assert.equal(view.root.children[0].attrs['aria-hidden'], 'true');
  assert.equal(view.root.children[0].attrs.focusable, 'false');
});

// A crew whose document has a window with a manual timer queue and counts the canvases it is asked
// for. The canvas has no getContext, so a context the policy allows is requested but never built.
function gatedCrew(contextPolicy) {
  const timers = [], canvases = [];
  const defaultView = { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: (id) => { timers[id - 1] = null; } };
  const doc = { defaultView, createElement: (tag) => { const node = new Node(doc); if (tag === 'canvas') canvases.push(node); return node; }, createElementNS: () => new Node(doc) };
  return { view: createPipSpannerCrew({ host: new Node(doc), doc, contextPolicy }), timers, canvases };
}

test('the crew keeps the schematic and opens no WebGL context while the GPU queue is busy, then opens one when it clears (D195)', () => {
  let when = 'defer';
  const { view, timers, canvases } = gatedCrew(() => when);
  view.inspect(offer);
  assert.equal(canvases.length, 0, 'no second context while the opening or a warm batch holds the GPU');
  assert.equal(timers.length, 1); assert.equal(timers[0].ms, CREW_CONTEXT_RETRY_MS);
  timers[0].fn();
  assert.equal(canvases.length, 0); assert.equal(timers.length, 2, 'still deferred: asks again later');
  when = 'allow'; timers[1].fn();
  assert.equal(canvases.length, 1, 'the queue cleared: the crew asks for its context once');
  assert.equal(timers.length, 2, 'and stops polling');
});

test('the crew never opens a context where the GPU policy forbids one, and a hidden crew stops asking', () => {
  const never = gatedCrew(() => 'never');
  never.view.inspect(offer);
  assert.equal(never.canvases.length, 0); assert.equal(never.timers.length, 0);
  assert.equal(never.view.root.dataset.visual, 'schematic');
  const broken = gatedCrew(() => { throw new Error('state unreadable'); });
  broken.view.inspect(offer);
  assert.equal(broken.canvases.length, 0, 'an unreadable policy is the safe answer, not a context');
  const hidden = gatedCrew(() => 'defer');
  hidden.view.inspect(offer); assert.ok(hidden.timers[0]);
  hidden.view.setActive(false);
  assert.equal(hidden.timers[0], null, 'closing the armory cancels the pending retry');
  hidden.view.dispose();
});

test('with no policy the crew keeps its old behaviour, and the draft screen supplies the live-state policy', () => {
  const plain = gatedCrew(undefined);
  plain.view.inspect(offer);
  assert.equal(plain.canvases.length, 1);
  const source = readFileSync(new URL('../src/ui/screens/crucibleDraft.js', import.meta.url), 'utf8');
  assert.match(source, /contextPolicy:\s*\(\)\s*=>\s*secondaryPreviewWebGlWhen\(this\._ctx && this\._ctx\.state\)/);
});
