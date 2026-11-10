import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parse } from '@babel/parser';
import { createGameState } from '../src/core/gameState.js';
import { bootstrapProfileSettingsBeforeRegistry } from '../src/core/graphicsProfileBootstrap.js';

function extract(file, match) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  let found;
  function visit(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (match(node)) { found = source.slice(node.start, node.end); return; }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parse(source, { sourceType: 'module' }));
  assert.ok(found, `production owner exists in ${file}`);
  return found;
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('boot locale preparation honors actual state defaults and profile-over-URL precedence', () => {
  const invocation = extract('../src/main.js', node => node.type === 'CallExpression'
    && node.callee.name === 'ensureLocaleReady' && node.arguments[0]?.type === 'LogicalExpression'
    && node.arguments[0].left?.object?.object?.name === 'state');
  for (const [profile, expected] of [[null, 'es-ES'], ['en-US', 'en-US'], ['fr-FR', 'fr-FR']]) {
    const state = createGameState(42);
    assert.equal(Object.hasOwn(state.settings, 'locale'), false, 'the real default does not mask a URL locale with English');
    bootstrapProfileSettingsBeforeRegistry(state, { getItem: () => profile
      ? JSON.stringify({ settings: { locale: profile } }) : null });
    let prepared;
    runInNewContext(invocation, { state, startupLocale: 'es-ES', ensureLocaleReady: locale => { prepared = locale; } });
    assert.equal(prepared, expected);
  }
});

const languageRow = extract('../src/ui/screens/settings.js', node => node.type === 'CallExpression'
  && node.callee.name === 'rowSelect' && node.arguments[0]?.value === 'Language');
const onHide = extract('../src/ui/screens/settings.js', node => node.type === 'ObjectMethod' && node.key.name === 'onHide');
const dispose = extract('../src/ui/screens/settings.js', node => node.type === 'ObjectMethod' && node.key.name === 'dispose');

test('real Settings language action commits only the latest prepared live-screen choice and retries failures', async () => {
  for (const cancelledBy of ['new-choice', 'hide', 'dispose', 'failure']) {
    const preparations = [], commits = [], writes = [], notices = [];
    const owner = { _set: (_ctx, _section, _key, locale) => writes.push(locale), _render() {} };
    const context = {
      refs: { preview: null, spot: null }, ctx: { bus: { emit: (...args) => notices.push(args) } },
      s: { locale: 'en-US' }, LANGUAGE_OPTIONS: [], chosenLocale: () => 'en-US', cue() {},
      ensureLocaleReady(locale) { const next = deferred(); preparations.push({ locale, ...next }); return next.promise; },
      setGameLocale: locale => commits.push(locale),
      rowSelect: (_label, _get, _choices, action) => action,
    };
    const handler = runInNewContext(`(function(){return ${languageRow};})`, context).call(owner);
    const pending = handler('es-ES');
    assert.deepEqual(commits, [], 'preparation cannot change the visible locale');
    assert.deepEqual(writes, [], 'an unprepared selection is not persisted');
    if (cancelledBy === 'new-choice') {
      const newer = handler('fr-FR');
      preparations[0].resolve(); await pending;
      assert.deepEqual(commits, []);
      preparations[1].resolve(); await newer;
      assert.deepEqual(commits, ['fr-FR']);
      assert.deepEqual(writes, ['fr-FR']);
    } else if (cancelledBy === 'hide' || cancelledBy === 'dispose') {
      const method = cancelledBy === 'hide' ? onHide : dispose;
      runInNewContext(`({${method}})`, context)[cancelledBy === 'hide' ? 'onHide' : 'dispose'].call(owner);
      preparations[0].resolve(); await pending;
      assert.deepEqual(commits, []);
      assert.deepEqual(writes, []);
    } else {
      preparations[0].reject(new Error('catalog503')); await pending;
      assert.deepEqual(commits, []);
      assert.equal(notices.length, 1, 'failure is visible and leaves the old setting intact');
      const retry = handler('es-ES'); preparations[1].resolve(); await retry;
      assert.deepEqual(commits, ['es-ES']);
      assert.deepEqual(writes, ['es-ES']);
    }
  }
});

const restoreAsync = extract('../src/save/saveSystem.js', node => node.type === 'ObjectMethod' && node.key.name === '_restoreAsync');
test('async restore prepares the profile-selected locale and rechecks the existing restore sequence', async () => {
  const pending = deferred(), locales = [];
  let sessions = 0;
  const owner = {
    _restoreSequence: 4, state: { settings: { locale: 'en-US' } },
    _readProfileSettings: () => ({ locale: 'fr-FR' }),
    helpers: { prepareLocale(locale) { locales.push(locale); return pending.promise; } },
    _openRestoreSession() { sessions++; throw new Error('must not open stale restore'); },
  };
  const method = runInNewContext(`({${restoreAsync}})`, {})._restoreAsync;
  const restore = method.call(owner, { settings: { locale: 'es-ES' } }, 'quick', { acceptSeq: 4 });
  assert.deepEqual(locales, ['fr-FR'], 'profile precedence matches the real settings restore');
  assert.equal(sessions, 0, 'preparation happens before any destructive restore');
  owner._restoreSequence = 5;
  pending.resolve();
  const result = await restore;
  assert.equal(result.superseded, true);
  assert.equal(result.stale, true);
  assert.equal(sessions, 0);
});

const finalizer = extract('../src/main.js', node => node.type === 'FunctionDeclaration' && node.id.name === 'finalizeLoadedGame');
test('main presentation Continue gate never applies an obsolete prepared language', async () => {
  for (const invalidation of ['transition', 'settings']) {
    const pending = deferred(), applied = [];
    let current = true;
    const state = { settings: { locale: 'es-ES' } };
    const context = {
      resetCombatInputMode() {}, enterLoadingMode() {}, startupLocale: 'en-US',
      ensureLocaleReady: () => pending.promise, applyAccessibility: settings => applied.push(settings),
    };
    const gate = runInNewContext(`(${finalizer})`, context);
    const result = gate(state, {}, { get: () => null }, { begin: () => 1, isCurrent: () => current });
    if (invalidation === 'transition') current = false;
    else state.settings = { locale: 'fr-FR' };
    pending.resolve();
    assert.equal((await result).stale, true);
    assert.deepEqual(applied, []);
  }
});
