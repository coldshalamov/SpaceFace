// Compatibility alias: the growth clip sweep lives in layout.js.
export {
  sweepGrowthClips as clipSweep,
  GROWTH_VIEWPORT,
  layoutBoxForKey,
  measureStringWidth,
  collectDomClips,
  captureSweepReport,
  isElementClipped,
  CLIP_SWEEP_SEED,
  CLIP_SWEEP_SELECTORS,
} from './layout.js';
export { PSEUDO_GROWTH_RATIO as PSEUDO_GROWTH_TARGET, meanPseudoGrowth } from './runtime.js';
export { CLIP_SWEEP_SEED as LAYOUT_SWEEP_SEED } from './layout.js';
