/**
 * Pure honesty helpers for campaign claim surfaces.
 * Fail-closed: dual-platform primaryAcceptance is DONE only when product
 * evidence proves unassisted dual-platform readiness — never from Electron
 * new-game authoring floor alone + Tier-A continuous marks.
 */

/**
 * Merge route residuals + productResiduals.
 * IMPORTANT: empty residuals:[] is truthy in JS, so `a || b` drops productResiduals.
 * Always concatenate arrays (missing → []).
 *
 * @param {{ residuals?: unknown, productResiduals?: unknown } | null | undefined} gt1c
 * @returns {unknown[]}
 */
export function mergeGt1Residuals(gt1c) {
  const route = Array.isArray(gt1c?.residuals) ? gt1c.residuals : [];
  const product = Array.isArray(gt1c?.productResiduals) ? gt1c.productResiduals : [];
  return [...route, ...product];
}

/**
 * True when product residual explicitly freezes dual-platform primary.
 * @param {unknown[]} mergedResiduals
 */
export function hasElectronDualPlatformRealResidual(mergedResiduals) {
  return mergedResiduals.some((r) => {
    if (!r || typeof r !== 'object') return false;
    const mark = String(/** @type {{ mark?: unknown }} */ (r).mark || '');
    const failureClass = String(/** @type {{ failureClass?: unknown }} */ (r).failureClass || '');
    return (
      /electron-dual-platform|dual-platform|dualPlatform/i.test(mark)
      && failureClass.toUpperCase() === 'REAL'
    );
  });
}

/**
 * Dual-platform primaryAcceptance may be DONE only when:
 * - Electron new-game probe exit 0 (authoring floor)
 * - GT1 continuous fullSpinePass true and supporting false
 * - productReadyUnassisted true
 * - primary true (aggregate dual-platform claim flag)
 * - no REAL electron-dual-platform product residual
 *
 * Electron new-game green alone is NEVER enough.
 *
 * @param {{
 *   electronExit: number,
 *   gt1c: {
 *     fullSpinePass?: boolean,
 *     supporting?: boolean,
 *     productReadyUnassisted?: boolean,
 *     primary?: boolean,
 *     residuals?: unknown,
 *     productResiduals?: unknown,
 *   } | null | undefined,
 * }} args
 * @returns {{ claim: 'DONE' | 'RESIDUAL', reasons: string[], mergedResiduals: unknown[] }}
 */
export function evaluateDualPlatformPrimaryAcceptance({ electronExit, gt1c }) {
  const mergedResiduals = mergeGt1Residuals(gt1c);
  const reasons = [];

  if (electronExit !== 0) {
    reasons.push(`electron-new-game exit=${electronExit} (authoring floor red)`);
  }
  if (gt1c?.fullSpinePass !== true) {
    reasons.push('gt1 fullSpinePass!=true');
  }
  if (gt1c?.supporting === true) {
    reasons.push('gt1 supporting:true');
  }
  if (gt1c?.productReadyUnassisted !== true) {
    reasons.push(`productReadyUnassisted=${gt1c?.productReadyUnassisted}`);
  }
  if (gt1c?.primary !== true) {
    reasons.push(`primary=${gt1c?.primary}`);
  }
  if (hasElectronDualPlatformRealResidual(mergedResiduals)) {
    reasons.push('product residual electron-dual-platform:REAL');
  }

  return {
    claim: reasons.length === 0 ? 'DONE' : 'RESIDUAL',
    reasons,
    mergedResiduals,
  };
}

/**
 * Build honest browser-electron-routes.log body.
 * Must NOT silently equal electron-new-game when dual-platform is residual.
 *
 * @param {{
 *   tip: string,
 *   dualPlatformClaim: 'DONE' | 'RESIDUAL',
 *   dualReasons: string[],
 *   electronExit: number,
 *   electronLogExcerpt?: string,
 *   gt1c: Record<string, unknown> | null | undefined,
 *   gallery?: { shotCount?: number, supporting?: boolean, platform?: string } | null,
 * }} args
 */
export function buildBrowserElectronRoutesLog({
  tip,
  dualPlatformClaim,
  dualReasons,
  electronExit,
  electronLogExcerpt = '',
  gt1c,
  gallery,
}) {
  const lines = [
    '# browser-electron-routes.log — dual-platform golden-thread residual surface',
    `# tip: ${tip}`,
    '# NOTE: This is NOT a dual-platform golden-thread multi-seed sample unless claim=DONE.',
    '# Electron new-game authoring floor is a residual probe, not GT wrecks/encounters dual-platform.',
    '',
    `dualPlatformPrimaryAcceptance=${dualPlatformClaim}`,
    `electron_new_game_exit=${electronExit}`,
    `gt1_primary=${gt1c?.primary}`,
    `gt1_productReadyUnassisted=${gt1c?.productReadyUnassisted}`,
    `gt1_fullSpinePass=${gt1c?.fullSpinePass}`,
    `gt1_supporting=${gt1c?.supporting}`,
    `gallery_shotCount=${gallery?.shotCount ?? 'missing'}`,
    `gallery_supporting=${gallery?.supporting}`,
    `gallery_platform=${gallery?.platform}`,
    '',
    '## Why dual-platform is residual (if RESIDUAL)',
    ...(dualReasons.length ? dualReasons.map((r) => `- ${r}`) : ['- (none — DONE)']),
    '',
    '## Required for DONE (product bar)',
    '- Browser golden-thread multi-seed sample with >=3 unique wrecks + >=2 encounters (unassisted)',
    '- Electron golden-thread multi-seed sample with same content class (not New Game only)',
    '- productReadyUnassisted=true AND primary=true on continuous aggregate',
    '- No REAL electron-dual-platform product residual',
    '',
    '## Electron new-game probe excerpt (authoring floor only)',
    electronLogExcerpt.trim() || '(no electron log)',
    '',
  ];
  return lines.join('\n');
}
