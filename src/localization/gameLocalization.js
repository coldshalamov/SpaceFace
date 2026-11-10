// Full keyed compatibility entry. Source-text callers use sourceText.js and need no inventory
// for English; callers importing this entry retain every synchronous generated-key lookup.
import { currentGameLocale, ensureLocalizationReady, setGameLocale, warmLocalizationCatalogs } from './sourceText.js';

export * from './sourceText.js';

// A worker must install its message handler before awaiting optional data. Browser documents
// retain the existing import barrier and ordinary readiness retry/error behavior.
if (typeof self !== 'undefined' && typeof document !== 'undefined') {
  let ready = false;
  await ensureLocalizationReady().then(() => { ready = true; }).catch(() => {});
  if (ready) setGameLocale(currentGameLocale());
} else if (typeof process !== 'undefined' && process.versions?.node
  && import.meta.url.startsWith('file:')) {
  await ensureLocalizationReady();
}
warmLocalizationCatalogs();
