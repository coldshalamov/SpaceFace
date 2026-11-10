// §22 E4 — boot fixture per launch language: the title screen's status line resolves through
// the localization phrase layer and the first objective the new-game route shows resolves from
// that language's catalog — key present, value non-empty, and for non-English not equal to the
// English text.

import assert from 'node:assert/strict';
import test from 'node:test';

import { messages as englishExtracted } from '../src/localization/catalogs/en-US.generated.js';
import { catalogFor, SHIPPED_LOCALES } from '../src/localization/fiveLocales.js';
import { gameLocalization, localizeText, setGameLocale } from '../src/localization/gameLocalization.js';
import { STORY_BEATS } from '../src/data/missions.js';
import { storyActionForBeat } from '../src/ui/screens/missionLog.js';
import { createTitleFrame, TITLE_STATUS_LINE } from '../src/ui/views/menuFrames.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.textContent = '';
    this._classes = new Set();
  }
  get classList() {
    return { add: (...names) => names.forEach((name) => this._classes.add(name)) };
  }
  set className(value) {
    for (const name of String(value).split(/\s+/)) if (name) this._classes.add(name);
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
}

function catalogKeyFor(english) {
  return Object.keys(englishExtracted).find((key) => englishExtracted[key] === english) || null;
}

test('title status line and first objective resolve from every launch catalog', () => {
  const original = gameLocalization.locale;
  const previousDocument = globalThis.document;
  // A document with createElement but no documentElement: the frame builder needs the
  // factory while the localization runtime's document hook stays dormant.
  globalThis.document = { createElement: (tag) => new FakeElement(tag) };
  try {
    const firstObjective = STORY_BEATS[0].objective;
    const objectiveKey = catalogKeyFor(firstObjective);
    assert.ok(objectiveKey, 'first objective is missing from the English inventory');

    for (const locale of SHIPPED_LOCALES) {
      setGameLocale(locale);
      const catalog = catalogFor(locale);

      // The title screen's status line, mounted through the real frame. It is not in the
      // extracted inventory yet, so resolution proves the phrase layer carries it.
      const frame = createTitleFrame(new FakeElement('div'));
      const shown = frame.status.textContent;
      assert.ok(typeof shown === 'string' && shown.length > 0, `${locale} title line is empty`);
      assert.equal(shown, localizeText(TITLE_STATUS_LINE), `${locale} title line did not resolve`);

      // The first objective the new-game route shows: story card body for beat 0.
      const card = storyActionForBeat(STORY_BEATS[0], { story: { beatIndex: 0 } });
      assert.ok(card && card.body, `${locale} no first objective card`);
      const objective = localizeText(firstObjective);
      assert.ok(objective.length > 0, `${locale} objective resolved empty`);
      assert.equal(typeof catalog[objectiveKey], 'string', `${locale} missing objective key`);
      assert.ok(catalog[objectiveKey].length > 0, `${locale} empty objective value`);

      if (locale !== 'en-US') {
        assert.notEqual(shown, TITLE_STATUS_LINE, `${locale} title stayed English`);
        assert.notEqual(objective, firstObjective, `${locale} objective stayed English`);
        assert.notEqual(localizeText(card.body), card.body, `${locale} action card stayed English`);
      }
    }
  } finally {
    setGameLocale(original);
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
