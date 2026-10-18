import assert from 'node:assert/strict';
import test from 'node:test';

import { gameOverScreen, afterActionModel } from '../src/ui/screens/gameOver.js';
import { GAME_OVER_LAYOUT_CSS } from '../src/ui/orrery/gameOverLayouts.js';
import { GROWTH_LAYOUT_CSS } from '../src/localization/domBridge.js';
import { pseudoLocalize } from '../src/localization/runtime.js';

test('D212 Game Over layout permits wrapping for footer verbs under non-English / expanded locales', () => {
  // Pre-change bug: gameOverLayouts pinned `.sf-go-foot > .k-words` to `flex-wrap: nowrap !important`
  // and `.k-word.sf-go-verb` to `white-space: nowrap !important` with specificity that defeated
  // the localization growth sheet. At 1280x720 under qps-ploc, the four actions spilled across
  // the career dial and clipped at the container bounds.
  const hasWrapRule = (
    /html:not\(\[data-locale="en-US"\]\)[^}]*\.sf-go-foot[^}]*flex-wrap:\s*wrap/i.test(GAME_OVER_LAYOUT_CSS) ||
    /html:not\(\[data-locale="en-US"\]\)[^}]*\.sf-go-foot[^}]*flex-wrap:\s*wrap/i.test(GROWTH_LAYOUT_CSS)
  );
  assert.equal(hasWrapRule, true, 'non-English locale must allow Game Over actions to flex-wrap');

  const hasVerbWrap = (
    /html:not\(\[data-locale="en-US"\]\)[^}]*\.sf-go-foot[^}]*(?:white-space:\s*normal|overflow-wrap:\s*anywhere)/i.test(GAME_OVER_LAYOUT_CSS) ||
    /html:not\(\[data-locale="en-US"\]\)[^}]*\.sf-go-foot[^}]*(?:white-space:\s*normal|overflow-wrap:\s*anywhere)/i.test(GROWTH_LAYOUT_CSS)
  );
  assert.equal(hasVerbWrap, true, 'non-English locale must allow Game Over verb text to wrap');
});

test('D212 Game Over blank career recap hides inactive stations with display:none rather than 1px clip boxes', () => {
  // Pre-change bug: saveLayouts had `.is-blank .sf-go-st:not(.sf-go-st--hub)` styled as
  // `width: 1px !important; height: 1px !important; overflow: hidden !important; clip-path: inset(50%) !important`.
  // Because child counter elements inside the station retained their own rendered width > 1px,
  // the localization reachability probe identified them as 5 clipped numeral rows ('0123456789').
  const hidesBlankStations = (
    /\.is-blank\s+\.sf-go-st:not\(\.sf-go-st--hub\)[^}]*display:\s*none/i.test(GAME_OVER_LAYOUT_CSS) ||
    /\.is-blank\s+\.sf-go-st:not\(\.sf-go-st--hub\)[^}]*display:\s*none/i.test(GROWTH_LAYOUT_CSS)
  );
  assert.equal(hidesBlankStations, true, 'blank career record must hide non-hub stations via display:none');
});

test('D212 Game Over DOM mount hides inactive stations when career record is blank (playtimeS === 0)', () => {
  const root = {
    children: [],
    classList: {
      remove() {},
      add() {},
      toggle() {},
    },
    setAttribute() {},
    removeAttribute() {},
    appendChild(child) { this.children.push(child); },
    replaceChildren() {},
  };

  const bus = { emit() {}, on() { return () => {}; } };
  const ctx = {
    state: {
      meta: { playtimeS: 0 },
      player: { stats: {} },
      settings: { gameplay: { difficulty: 'standard' } },
      combat: { lastPlayerDefeat: null },
    },
    bus,
  };

  // Mount with fake document if not present
  const originalDoc = globalThis.document;
  try {
    if (!globalThis.document) {
      globalThis.document = {
        createElement(tag) {
          const element = {
            tagName: tag.toUpperCase(),
            className: '',
            classList: {
              _classes: new Set(),
              add(...cls) { for (const c of cls) this._classes.add(c); },
              remove(...cls) { for (const c of cls) this._classes.delete(c); },
              contains(c) {
                if (this._classes.has(c)) return true;
                return (element.className || '').split(/\s+/).includes(c);
              },
            },
            style: { setProperty() {} },
            dataset: {},
            children: [],
            childNodes: [],
            parentNode: null,
            _text: '',
            get textContent() { return this._text; },
            set textContent(v) {
              this._text = String(v ?? '');
              if (!this._text) {
                this.children = [];
                this.childNodes = [];
              }
            },
            appendChild(c) {
              c.parentNode = this;
              this.children.push(c);
              this.childNodes.push(c);
              return c;
            },
            setAttribute(k, v) { this[k] = v; },
            removeAttribute(k) { delete this[k]; },
            addEventListener() {},
            replaceChildren() {},
          };
          return element;
        },
        getElementById() { return null; },
      };
    }

    gameOverScreen.mount(root, ctx);

    // Verify recap stations
    const recapRows = gameOverScreen._recapRows;
    assert.ok(recapRows, 'recap rows element must exist');
    const stations = recapRows.children || [];
    assert.ok(stations.length > 0, 'stations must be mounted');

    const nonHubStations = stations.filter((st) => !st.classList.contains('sf-go-st--hub'));
    assert.equal(nonHubStations.length, 6, 'expected 6 peripheral stations');
    for (const station of nonHubStations) {
      assert.equal(station.hidden, true, 'peripheral station must be marked hidden when career record is blank');
    }

    // Quiet / negative branch: when playtime > 0, stations are NOT hidden
    const liveCtx = {
      ...ctx,
      state: {
        ...ctx.state,
        meta: { playtimeS: 1200 },
      },
    };
    gameOverScreen.refresh(liveCtx);
    const liveNonHub = gameOverScreen._recapRows.children.filter((st) => !st.classList.contains('sf-go-st--hub'));
    for (const station of liveNonHub) {
      assert.notEqual(station.hidden, true, 'peripheral station must be visible when career record has playtime');
    }
  } finally {
    globalThis.document = originalDoc;
  }
});

test('D212 Quiet/negative branch: English and standard difficulty contracts are preserved', () => {
  // English layout rules still preserve single-rail styling when space permits
  assert.match(GAME_OVER_LAYOUT_CSS, /\.sf-go-foot\s+\.k-word\.sf-go-verb/);
  assert.match(GAME_OVER_LAYOUT_CSS, /letter-spacing/);

  // Ironman still withdraws Load latest
  const ironmanCtx = {
    state: {
      settings: { gameplay: { difficulty: 'ironman' } },
      save: { slots: { slot1: { savedAt: '2026-10-17T00:00:00.000Z' } } },
    },
  };
  const model = afterActionModel(ironmanCtx);
  assert.equal(model.ironman, true);
  assert.equal(model.canLoadLatest, false);
});
