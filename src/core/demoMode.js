// Demo-mode flag (ZERO_TO_HERO Phase 5.1). True when the bundle was built with `--demo`
// (esbuild define `__SPACEFACE_DEMO__`), and on a non-production/dev page when the URL carries
// `?demo=1`. Everything demo-only reads this one constant; non-demo builds see it fold false.
const DEMO_DEFINE = typeof __SPACEFACE_DEMO__ !== 'undefined' && __SPACEFACE_DEMO__ === true;

const IS_PRODUCTION = typeof __SPACEFACE_PRODUCTION__ !== 'undefined'
  ? !!__SPACEFACE_PRODUCTION__
  : (typeof process !== 'undefined' && !!process.env && process.env.NODE_ENV === 'production');

const IS_DEMO = DEMO_DEFINE || (
  !IS_PRODUCTION
  && typeof location !== 'undefined'
  && typeof location.search === 'string'
  && /(?:^|[?&])demo=1(?:&|$)/.test(location.search)
);

export { IS_DEMO };
