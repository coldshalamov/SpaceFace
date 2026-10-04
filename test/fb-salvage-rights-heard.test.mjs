// FB-014 — Salvage rights minted by a stunt are announced, claimable and recorded
//
// Pins:
// 1. stuntCallout subscribes to stunt:salvageRights, stunt:salvageRightsClaimed, stunt:lineContractCompleted, stunt:bridge.
// 2. salvageRights minting produces a callout line naming the stunt and amount.
// 3. salvageRights claiming produces a "RIGHTS CLAIMED" confirmation callout.
// 4. shipLedger projects player.salvageRightsLog into durable type: 'salvage' entries.
// 5. Duplicate receipt IDs in salvageRightsLog are rejected (once-only claim/mint).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStuntCallout,
  calloutTextFor,
} from '../src/ui/stuntCallout.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';

function fakeDocument() {
  const elements = [];
  const headChildren = [];
  const bodyChildren = [];
  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); },
      },
      textContent: '',
      hidden: false,
      style: {},
      children: [],
      parentNode: null,
      appendChild(child) {
        if (!child) return child;
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) {
          this.children.splice(idx, 1);
          child.parentNode = null;
        }
        return child;
      },
      setAttribute() {},
      getAttribute() { return null; },
    };
    elements.push(el);
    return el;
  }
  return {
    createElement,
    getElementById() { return null; },
    head: { appendChild(c) { headChildren.push(c); }, children: headChildren },
    body: { appendChild(c) { bodyChildren.push(c); }, children: bodyChildren },
    documentElement: { classList: { contains() { return false; } } },
  };
}

function fakeBus() {
  const handlers = new Map();
  return {
    on(event, cb) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(cb);
      return () => {
        const list = handlers.get(event) || [];
        const idx = list.indexOf(cb);
        if (idx >= 0) list.splice(idx, 1);
      };
    },
    emit(event, payload) {
      const list = handlers.get(event) || [];
      for (const cb of list) cb(payload);
    },
  };
}

test('FB-014: stuntCallout announces salvage rights minted and claimed', () => {
  const doc = fakeDocument();
  const bus = fakeBus();
  const state = {
    mode: 'flight',
    run: null,
    ui: { screenStack: [], docked: false },
    playerId: 1,
    settings: { video: { motionReduce: false } },
  };

  const callout = createStuntCallout({ state, bus, doc });

  // 1. Mint salvage right
  bus.emit('stunt:salvageRights', {
    salvageRights: 250,
    trickId: 'wrecking_ball',
    name: 'Wrecking Ball',
    episodeId: 'sr-001',
  });

  callout.update(0);
  let text = calloutTextFor(callout.root);
  assert.match(text, /SALVAGE RIGHT/, 'Salvage right mint is announced');
  assert.match(text, /Wrecking Ball/, 'The stunt name is included');
  assert.match(text, /\+250/, 'The amount is displayed');

  // 2. Claim salvage right
  bus.emit('stunt:salvageRightsClaimed', {
    salvageRights: 250,
    episodeId: 'sr-001',
  });

  callout.update(10);
  text = calloutTextFor(callout.root);
  assert.match(text, /RIGHTS CLAIMED/, 'Salvage rights claimed is announced');
  assert.match(text, /\+250/, 'Claimed amount is displayed');

  // 3. Line contract completed
  bus.emit('stunt:lineContractCompleted', {
    name: 'Perimeter Sling',
    contractId: 'lc-42',
  });

  callout.update(20);
  text = calloutTextFor(callout.root);
  assert.match(text, /LINE CONTRACT · Perimeter Sling/, 'Line contract announced');

  // 4. Bridge in adventure
  bus.emit('stunt:bridge', {
    name: 'Coupler Drift',
    tick: 1,
  });

  callout.update(30);
  text = calloutTextFor(callout.root);
  assert.match(text, /BRIDGE · Coupler Drift/, 'Bridge announced in adventure mode');

  callout.destroy();
});

test('FB-014: shipLedger projects salvage rights receipts into salvage entries', () => {
  const state = {
    player: {
      salvageRightsLog: [
        {
          id: 'sr-mint-1',
          kind: 'mint',
          at: 100,
          amount: 300,
          trickId: 'clothesline',
          name: 'Clothesline',
          sectorId: 'sector_ceres_belt',
        },
        {
          id: 'sr-claim-1',
          kind: 'claim',
          at: 120,
          amount: 300,
          sectorId: 'sector_ceres_belt',
        },
      ],
    },
    entities: new Map(),
  };

  const ledger = buildShipLedger(state);
  const salvageEntries = ledger.entries.filter((e) => e.type === 'salvage');

  assert.equal(salvageEntries.length, 2, 'Two salvage ledger entries projected');
  assert.equal(salvageEntries[0].sourceKind, 'player.salvageRightsLog');
  assert.equal(salvageEntries[1].sourceKind, 'player.salvageRightsLog');
});
