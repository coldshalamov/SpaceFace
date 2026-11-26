/** Public, renderer-neutral source surface. Production wiring imports production.js synchronously. */
export * from './catalog.js';
export * from './route.js';
export * from './train.js';
export * from './controller.js';
export * from './runtime.js';
export * from './encounter.js';
export * from './interactions.js';
export * from './presentation.js';
export * from './view.js';

/** Optional callers may load the real catalog builders after their normal production warmup. */
export async function loadConvoyRaidProduction() {
  return (await import('./production.js')).convoyRaid;
}
