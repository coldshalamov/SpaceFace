// Switchboard for the Lane 2 (SIM CORE) hot-path package.
//
// Why a switchboard instead of just shipping the change: the owner's laptop is shared with other
// agents, so two probe runs minutes apart are not a matched comparison. Every optimisation this
// campaign lands can be turned off at boot through `globalThis.__SF_SIM_CORE_FLAGS__`, which lets
// ONE probe process boot the legacy shape, measure it, dispose, boot the optimised shape and
// measure again — same machine state, same scene, seconds apart.
//
// Defaults are the shipped behaviour, and each flag below states its own default: not every flag
// is ON (`telemetryDemand` is deliberately OFF until every shipped reader opts in). A flag is only
// read at a branch the step already takes (a boolean per body at most), never in a way that changes
// results. The flags exist for measurement and for a fail-open retreat if a platform misbehaves;
// they are not a feature system and nothing in the game sets them.

const DEFAULTS = Object.freeze({
  /**
   * Per-body physics telemetry only for bodies a gameplay owner inspects.
   * DEFAULT OFF: several shipped readers (the rig workshop's new-keel admission, the buoy
   * service, the SG-02/SG-06 checks) still read the receipt without opting in, so demand
   * publication silently removed a player feature. The flag stays implemented for a later
   * pull-based migration; every reader must call requestPhysicsTelemetry first before it can
   * default on. Three owners opt in today (Crucible shutters, Kilnback completion, rig seed).
   */
  telemetryDemand: false,
  /**
   * A due economy pass advances by a fixed quantum per fixed tick instead of one 130 ms step.
   * DEFAULT ON: the per-fixed-tick drain (`drainTick`), serialized pass cursor and 2100-tick/60 s
   * cadence tests are green, and mid-pass save/reload reproduces uninterrupted runs byte-equal.
   * Override with `SF_SIM_CORE='{"economySlicing":false}'` for matched A/B comparisons.
   */
  economySlicing: true,
  /** The quantized per-body SG-02 snapshot is built lazily at a checkpoint, not every tick. */
  lazySg02Snapshot: true,
  /**
   * Let resting rocks, wrecks, payloads, debris and pickups near the player sleep in Rapier.
   * DEFAULT OFF: with it on, fracture shards were not in flight after a detonation, the Lantern
   * Ward service stand fouled its loaded route and the prospector did not finish its work
   * (physics-sandbox-routes, lantern-ward-center-lane, prospector-field-report). A sleeping body
   * needs a wake on every path that expects it to move before this can ship.
   */
  s0BodySleep: false,
});

let overrides = null;

function readOverrides() {
  if (overrides) return overrides;
  const raw = typeof globalThis !== 'undefined' ? globalThis.__SF_SIM_CORE_FLAGS__ : null;
  if (raw && typeof raw === 'object') {
    overrides = raw;
    return overrides;
  }
  // Headless harnesses (probes, sim CLI, lab) switch a flag through the environment so one build
  // can run the legacy shape for a matched comparison: SF_SIM_CORE='{"economySlicing":false}'.
  const proc = typeof process !== 'undefined' ? process : null;
  const envRaw = proc && proc.env ? proc.env.SF_SIM_CORE : null;
  if (typeof envRaw === 'string' && envRaw.trim().startsWith('{')) {
    try {
      overrides = JSON.parse(envRaw);
      return overrides;
    } catch (_) { /* fall through to defaults */ }
  }
  overrides = Object.create(null);
  return overrides;
}

/** Reset the memoised override read (a probe swaps the global between boots). */
export function resetSimCoreFlags() {
  overrides = null;
}

export function simCoreFlag(name) {
  const o = readOverrides();
  const v = o[name];
  if (typeof v === 'boolean') return v;
  return DEFAULTS[name] !== false;
}

export function simCoreFlagDefaults() {
  return { ...DEFAULTS };
}

/** Apply a flag set for the current boot context (probe/test use only). */
export function setSimCoreFlags(flags) {
  if (typeof globalThis === 'undefined') return;
  globalThis.__SF_SIM_CORE_FLAGS__ = flags && typeof flags === 'object' ? { ...flags } : {};
  overrides = null;
}
