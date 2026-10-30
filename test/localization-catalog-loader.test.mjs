import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createBarkTranslationsRequest,
  createEnglishCatalogRequest,
  ensureBarkTranslationsLoaded,
  ensureEnglishCatalogLoaded,
  isEnglishCatalogReady,
  resolveBarkTranslationsUrl,
  resolveEnglishCatalogUrl,
} from '../src/localization/pipeline.js';
import { barkMessagesFor, barkParityErrors, isBarkTranslationsReady } from '../src/localization/barks.js';
import {
  ensureLocalizationReady,
  localizeText,
  setGameLocale,
} from '../src/localization/gameLocalization.js';

test('Node tools initialize the English catalog from the generated sidecar without HTTP', async () => {
  const generated = JSON.parse(readFileSync(
    new URL('../src/localization/catalogs/en-US.generated.json', import.meta.url), 'utf8'));
  const messages = await ensureEnglishCatalogLoaded();
  assert.equal(isEnglishCatalogReady(), true);
  assert.deepEqual(messages, generated.messages);
  assert.equal(isBarkTranslationsReady(), true, 'the sibling bark sidecar is installed synchronously for Node tools');
  assert.equal(await ensureBarkTranslationsLoaded(), true);
  assert.deepEqual(barkParityErrors(), []);
  assert.equal(Object.keys(barkMessagesFor('pt-BR')).length, 1455);
});

test('boot readiness keeps default English and live locale switching on the loaded catalog', async () => {
  assert.equal(await ensureLocalizationReady(), true);
  assert.equal(localizeText('Continue'), 'Continue');
  setGameLocale('es-ES');
  assert.equal(localizeText('Continue'), 'Continuar');
  setGameLocale('en-US');
  assert.equal(localizeText('Continue'), 'Continue');
});

test('English catalog URL follows dev-root and pinned retail release bases', () => {
  assert.equal(
    resolveEnglishCatalogUrl({
      production: false,
      moduleUrl: 'https://game.example/src/localization/pipeline.js',
    }),
    'https://game.example/src/localization/catalogs/en-US.generated.json',
  );
  assert.equal(
    resolveEnglishCatalogUrl({
      production: true,
      moduleUrl: 'https://game.example/chunks/main.js',
      documentBase: 'https://game.example/app/index.html',
      releaseBase: './releases/candidate-123/',
    }),
    'https://game.example/app/releases/candidate-123/src/localization/catalogs/en-US.generated.json',
  );
  assert.equal(
    resolveEnglishCatalogUrl({
      production: true,
      moduleUrl: 'https://game.example/chunks/localization.js',
      documentBase: undefined,
      workerEntry: 'https://game.example/app/workers/wholeSimBrowserWorker.js',
      releaseBase: './releases/candidate-456/',
    }),
    'https://game.example/app/releases/candidate-456/src/localization/catalogs/en-US.generated.json',
    'worker consumers resolve from their pinned release root rather than a shared chunk path',
  );
});

test('bark translation URL follows dev-root and pinned retail release bases', () => {
  assert.equal(
    resolveBarkTranslationsUrl({
      production: false,
      moduleUrl: 'https://game.example/src/localization/pipeline.js',
    }),
    'https://game.example/src/localization/barks.generated.json',
  );
  assert.equal(
    resolveBarkTranslationsUrl({
      production: true,
      moduleUrl: 'https://game.example/chunks/localization.js',
      documentBase: 'https://game.example/app/index.html',
      releaseBase: './releases/candidate-123/',
    }),
    'https://game.example/app/releases/candidate-123/src/localization/barks.generated.json',
  );
});

test('English catalog request coalesces callers and rejects malformed payloads', async () => {
  let calls = 0;
  const payload = {
    schema: 'spaceface.localizationCatalog.v1',
    locale: 'en-US',
    inventoryDigest: 'a'.repeat(64),
    messages: { 'loc.test.label.abc123': 'Launch' },
  };
  const load = createEnglishCatalogRequest({
    url: 'https://game.example/src/localization/catalogs/en-US.generated.json',
    fetchImpl: async (url) => {
      calls += 1;
      assert.equal(url, 'https://game.example/src/localization/catalogs/en-US.generated.json');
      return { ok: true, json: async () => payload };
    },
  });
  const first = load();
  const second = load();
  assert.equal(first, second);
  assert.deepEqual(await first, payload);
  assert.equal(calls, 1);

  const invalid = createEnglishCatalogRequest({
    url: 'https://game.example/catalog.json',
    fetchImpl: async () => ({ ok: true, json: async () => ({ ...payload, locale: 'fr-FR' }) }),
  });
  await assert.rejects(invalid(), /invalid schema or inventory/);
});

test('bark translation request installs the complete sidecar, coalesces callers, and rejects bad shapes', async () => {
  const payload = JSON.parse(readFileSync(
    new URL('../src/localization/barks.generated.json', import.meta.url), 'utf8'));
  let calls = 0;
  const load = createBarkTranslationsRequest({
    url: 'https://game.example/src/localization/barks.generated.json',
    fetchImpl: async (url) => {
      calls += 1;
      assert.equal(url, 'https://game.example/src/localization/barks.generated.json');
      return { ok: true, json: async () => payload };
    },
  });
  const first = load();
  const second = load();
  assert.equal(first, second);
  assert.equal(await first, true);
  assert.equal(calls, 1);
  assert.deepEqual(barkParityErrors(), []);

  const invalid = createBarkTranslationsRequest({
    url: 'https://game.example/barks.json',
    fetchImpl: async () => ({ ok: true, json: async () => ({ ...payload, schema: 'wrong' }) }),
  });
  await assert.rejects(invalid(), /Bark translation catalog is invalid/);
});
