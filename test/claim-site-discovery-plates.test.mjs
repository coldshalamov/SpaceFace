// The 15 claimable bodies are authored places, not name-only spawn points (INFERENCE): each site
// carries a discoveryPlate (title + body, same shape as every sectors.js plate) that reaches the
// player through the standard overlay into sector.pois — arrival plate popup and codex journal —
// and a one-line `why` the Base screen keeps once the body is claimed. Pins: 15 sites, unique
// titles, non-empty why, plates merged on every claim sector, the id/overlay seams the claims
// owner (poiId) and Base screen (CLAIMABLE_BODY_SITES lookup) depend on, and the Base screen's
// `.base-sub` why-line rendering on a headless DOM stub.
import assert from 'node:assert/strict';

import {
  CLAIMABLE_BODY_SITES,
  applyClaimableBodySites,
} from '../src/data/claimableBodies.js';
import { SECTORS } from '../src/data/sectors.js';
import { baseScreen } from '../src/ui/screens/base.js';

// Site inventory: exactly 15, unique ids (claims bodies store poiId) and unique plate titles
// (15 authored identities, not a template with the name swapped).
assert.equal(CLAIMABLE_BODY_SITES.length, 15, 'claim site list stays at 15 entries');
assert.equal(new Set(CLAIMABLE_BODY_SITES.map((s) => s.id)).size, 15, 'site ids are unique');

for (const site of CLAIMABLE_BODY_SITES) {
  assert.ok(site.discoveryPlate, `${site.id} authors a discoveryPlate`);
  assert.ok(typeof site.discoveryPlate.title === 'string' && site.discoveryPlate.title.trim().length > 0,
    `${site.id} discoveryPlate.title is non-empty`);
  assert.ok(typeof site.discoveryPlate.body === 'string' && site.discoveryPlate.body.trim().length > 40,
    `${site.id} discoveryPlate.body carries a real micro-history`);
  assert.ok(typeof site.why === 'string' && site.why.trim().length > 0,
    `${site.id} carries a non-empty why line`);
  assert.notEqual(site.discoveryPlate.title.trim(), site.name,
    `${site.id} plate title tells something, not just the name`);
}

const titles = CLAIMABLE_BODY_SITES.map((s) => s.discoveryPlate.title);
assert.equal(new Set(titles).size, 15, 'plate titles are unique across all 15 sites');

// Overlay proof, on the unit's named example: re-applying the overlay on the merged sector keeps
// poi_claim_cinder_crown with its authored plate (and does not duplicate the POI).
const ashfall = SECTORS.find((s) => s.id === 'sector_ashfall_reach');
assert.ok(ashfall, 'sector_ashfall_reach exists');
const reApplied = applyClaimableBodySites(ashfall);
const cinderRows = reApplied.pois.filter((p) => p.id === 'poi_claim_cinder_crown');
assert.equal(cinderRows.length, 1, 'poi_claim_cinder_crown appears exactly once after re-overlay');
assert.ok(cinderRows[0].discoveryPlate && cinderRows[0].discoveryPlate.title.trim().length > 0,
  'poi_claim_cinder_crown carries a non-empty discoveryPlate.title');

// Every one of the 15 sites merges its plate into its sector's pois through the standard overlay —
// the zero-other-file-edit path the arrival plate and codex journal already consume.
for (const site of CLAIMABLE_BODY_SITES) {
  const sector = SECTORS.find((s) => s.id === site.sectorId);
  assert.ok(sector, `${site.sectorId} exists`);
  const merged = sector.pois.find((p) => p.id === site.id);
  assert.ok(merged, `${site.id} merges into ${site.sectorId}`);
  assert.ok(merged.discoveryPlate && merged.discoveryPlate.title.trim().length > 0,
    `${site.id} keeps its authored plate after sector merge`);
  assert.ok(merged.why && merged.why.trim().length > 0,
    `${site.id} keeps its why line after sector merge`);
  assert.equal(merged.claimable, true, `${site.id} stays claimable`);
}

// ---- Base screen seam: the claimed body keeps its why-line in the existing .base-sub slot ----
// Minimal DOM stub, same pattern as authored-critical-admission-order.test.mjs; base.js's module
// scope is DOM-free (proven above by bare import), only _render touches the document.
function fakeEl(tag) {
  const el = {
    tagName: tag,
    className: '',
    id: '',
    children: [],
    style: {},
    dataset: {},
    disabled: false,
    title: '',
    _html: '',
    set innerHTML(v) { el._html = String(v); el.children = []; },
    get innerHTML() { return el._html; },
    _text: '',
    set textContent(v) { el._text = String(v); el.children = []; },
    get textContent() { return el._text; },
    appendChild(child) { el.children.push(child); return child; },
    append(...kids) { el.children.push(...kids); },
    setAttribute() {},
    addEventListener() {},
    classList: { add() {}, remove() {} },
    focus() {},
  };
  return el;
}

const previousDocument = globalThis.document;
globalThis.document = {
  createElement: (tag) => fakeEl(tag),
  getElementById: () => null, // injectStyle becomes a no-op append on a stub head
  head: { appendChild() {} },
};

try {
  const cinder = CLAIMABLE_BODY_SITES.find((s) => s.id === 'poi_claim_cinder_crown');
  const rootEl = fakeEl('div');
  baseScreen._rootEl = rootEl;
  baseScreen._bodyId = 'claim_1';
  baseScreen._ctx = {
    state: { player: {}, ui: {} },
    registry: {
      get: () => ({
        list: () => [{
          id: 'claim_1', poiId: 'poi_claim_cinder_crown', name: 'Cinder Crown',
          size: 'L', slots: 4, modules: [], sectorId: 'sector_ashfall_reach', spec: null,
        }],
        ledger: () => null,
      }),
    },
  };
  baseScreen._render();

  const wrap = rootEl.children.find((child) => child.id === 'sf-base');
  assert.ok(wrap, 'base render builds the #sf-base column');
  const subs = wrap.children.filter((child) => child.className === 'base-sub');
  assert.equal(subs.length, 2, 'claimed body renders the slot line plus one why-line');
  assert.match(subs[0]._text, /L-class body/, 'first .base-sub stays the slot/sector line');
  assert.equal(subs[1]._text, cinder.why, 'second .base-sub is the site\u2019s authored why');

  // Adversarial: a body whose poiId matches no authored site renders without a why-line.
  baseScreen._bodyId = 'claim_stale';
  baseScreen._ctx = {
    state: { player: {}, ui: {} },
    registry: {
      get: () => ({
        list: () => [{
          id: 'claim_stale', poiId: 'poi_from_an_old_save', name: 'Old Claim',
          size: 'S', slots: 2, modules: [], sectorId: 'sector_ceres_belt', spec: null,
        }],
        ledger: () => null,
      }),
    },
  };
  baseScreen._render();
  const staleWrap = rootEl.children.find((child) => child.id === 'sf-base');
  const staleSubs = staleWrap.children.filter((child) => child.className === 'base-sub');
  assert.equal(staleSubs.length, 1, 'unmatched poiId renders no why-line (old saves safe)');
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}
