// src/core/devMode.js – shared, build-time-foldable dev-mode flag.
//
// Production bundles define __SPACEFACE_PRODUCTION__ = 'true' (scripts/build-bundle.mjs) and run a
// drop-labels / dead-code pass, so this resolves to a literal `false` and anything gated behind it
// is stripped. Dev (browser raw + Electron dev + Node test) leaves it true. This mirrors the exact
// logic main.js has historically used for SF_DEBUG, but exposes it as a single imported constant so
// UI layers (the Sandbox screen, the main-menu button) don't each re-derive it.
//
// DO NOT use this to fork gameplay. The one game path contract (ARCHITECTURE) holds: a dev-only
// surface that helps a human reach mid-game features for testing is not gameplay forking, but it
// must never ship in build/web.

const IS_DEV = typeof __SPACEFACE_PRODUCTION__ !== 'undefined'
  ? !__SPACEFACE_PRODUCTION__
  : (typeof process === 'undefined' || !process.env || process.env.NODE_ENV !== 'production');

export { IS_DEV };
