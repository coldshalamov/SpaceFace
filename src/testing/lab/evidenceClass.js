// H2: evidence class is DERIVED from what actually ran, not scenario author intent.

/** Authored classes that require a full production-manifest execution to keep. */
const PRODUCTION_CLAIM_CLASSES = new Set([
  'production-fixture',
  'public-route',
  'presentation',
  'performance',
]);

/**
 * Derive the evidence class from execution reality.
 *
 * @param {object} args
 * @param {string} [args.authored] scenario-authored evidenceClass
 * @param {string} [args.manifestEvidenceClass] from resolveRuntimeManifest / runtime
 * @param {string[]} [args.systemNames] systems that actually ran
 * @param {boolean} [args.focusedSystems] true when an explicit focused list was used
 * @param {boolean} [args.renderingDetached]
 * @param {string} [args.host] 'node' | 'chromium' | 'browser'
 * @param {string[]} [args.exclusions]
 * @returns {{ evidenceClass: string, authored: string|null, demoted: boolean, note: string|null }}
 */
export function deriveEvidenceClass({
  authored = null,
  manifestEvidenceClass = null,
  systemNames = [],
  focusedSystems = false,
  renderingDetached = true,
  host = 'node',
  exclusions = [],
} = {}) {
  const names = Array.isArray(systemNames) ? systemNames : [];
  const excl = Array.isArray(exclusions) ? exclusions : [];

  // Full production manifest materialization (Node nodeSafeOnly or browser registry).
  const isProductionManifest = manifestEvidenceClass === 'production-manifest'
    && !focusedSystems
    && !excl.includes('production-manifest-claim')
    && !excl.includes('profile-full-system-set');

  let derived;
  let note = null;

  if (focusedSystems || manifestEvidenceClass === 'focused-explicit') {
    derived = 'focused-fixture';
    note = 'focused system bundle — cannot claim production-fixture';
  } else if (isProductionManifest) {
    derived = host === 'chromium' || host === 'browser'
      ? (renderingDetached ? 'browser-parity' : 'public-route')
      : 'production-fixture';
  } else if (manifestEvidenceClass === 'profile-manifest') {
    derived = 'focused-fixture';
    note = 'profile-manifest (non-production system set)';
  } else {
    derived = 'focused-fixture';
    note = 'execution did not materialize a production manifest';
  }

  // Never let author intent upgrade a focused run to production-class evidence.
  const demoted = !!(authored
    && PRODUCTION_CLAIM_CLASSES.has(authored)
    && derived !== authored
    && (focusedSystems || derived === 'focused-fixture'));

  if (demoted) {
    note = `authored ${authored} demoted to ${derived} (execution used focused/non-production path)`;
  }

  // If authored is a weaker/honest class, keep derived (execution truth).
  // Human-review / kernel can stay when they match or when authored is more specific and valid.
  if (authored === 'kernel' && names.length <= 2) {
    derived = 'kernel';
    note = null;
  }
  if (authored === 'public-input' && focusedSystems) {
    // public-input is about input path fidelity over focused systems (grammar path).
    derived = 'public-input';
    note = 'public-input over focused systems (grammar path)';
  }
  if (authored === 'browser-parity' && (host === 'chromium' || host === 'browser')) {
    if (!focusedSystems || derived === 'browser-parity') {
      derived = 'browser-parity';
    }
  }

  return {
    evidenceClass: derived,
    authored: authored || null,
    demoted,
    note,
    host,
    systemCount: names.length,
  };
}
