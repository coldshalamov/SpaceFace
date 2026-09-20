/**
 * Drive envelopes for the player plume.
 *
 * WHY THIS EXISTS
 * ---------------
 * The plume used to read its intensity from `Math.max(drive, throttle, ...)` — an unsmoothed maximum
 * of instantaneous inputs — and plume length and width were computed straight from it. Pressing
 * forward was therefore a literal one-frame step from idle to full, which is the "clips from small to
 * big instantly" the owner rejected. Boost was the only channel with any smoothing, which is exactly
 * why boost was the only part that read as animated.
 *
 * The same maximum also meant speed could never contribute: at full throttle the throttle term
 * always won, so "hauling ass" had no visual consequence at all. Speed is a weighted share of the
 * target here, not a competitor for it.
 *
 * Every transition is asymmetric, and every release is slower than its own attack, because a drive
 * cools more slowly than it lights.
 */

/** Faint bell glow when the drive is alive but making no thrust. */
export const IDLE_FLOOR = 0.06;

/**
 * Threshold above which the drive is actually throwing mass. Sits above IDLE_FLOOR so a lit but
 * unfired drive glows in the bell without laying down a contrail or counting as thrust anywhere else.
 * Anything that asks "is this engine firing?" must use this, not a separate hand-picked number — the
 * two drifting apart is what left the drive permanently "emitting" while parked.
 */
export const EMIT_FLOOR = IDLE_FLOOR * 1.35;

/** Share of the drive target owned by airspeed rather than by the throttle. */
export const SPEED_SHARE = 0.25;

/**
 * Time constants, in seconds. A first-order lag reaches ~95% of its target in 3 tau, so the spool
 * rise below lands full thrust at about 0.66 s — inside the half-to-three-quarter-second window the
 * owner specified.
 */
export const RATES = Object.freeze({
  spoolRiseTau: 0.22,
  spoolFallTau: 0.34,
  // Boost is a blast, so its attack is roughly four times faster than the base spool.
  boostRiseTau: 0.055,
  boostFallTau: 0.26,
});

/** One-shot dash flare: a bright supernova for about a second, then a long cooling tail. */
export const DASH_ENVELOPE = Object.freeze({
  attackS: 0.05,
  sustainS: 0.12,
  releaseS: 0.62,
});

const DASH_TOTAL_S = DASH_ENVELOPE.attackS + DASH_ENVELOPE.sustainS + DASH_ENVELOPE.releaseS;

export function createDriveEnvelope() {
  return {
    spool: 0,
    boost: 0,
    dash: 0,
    dashAge: -1,
    lit: false,
  };
}

/**
 * Sample the one-shot dash flare. Fast attack, brief hold, long cooling release.
 * @param {number} age seconds since the dash fired, or negative when idle
 */
export function sampleDashFlare(age) {
  if (!(age >= 0)) return 0;
  const { attackS, sustainS, releaseS } = DASH_ENVELOPE;
  if (age < attackS) return attackS <= 0 ? 1 : age / attackS;
  if (age < attackS + sustainS) return 1;
  const rel = age - attackS - sustainS;
  if (rel >= releaseS) return 0;
  const u = rel / releaseS;
  // Quadratic tail: the flare dumps most of its brightness quickly and then lingers, which reads as
  // cooling rather than as a linear fade-out.
  return (1 - u) * (1 - u);
}

/**
 * Resolve the drive target from pilot input, before smoothing.
 *
 * Speed contributes SPEED_SHARE of the target, but only counts in full once some thrust is actually
 * commanded — otherwise coasting at speed would light a drive that is not firing. Coasting still
 * keeps a fraction of it as residual thermal glow.
 *
 * @param {number} throttle 0..1 commanded forward authority
 * @param {number} speedNorm 0..1 airspeed as a fraction of the ship's top speed
 */
export function resolveDriveTarget(throttle, speedNorm) {
  const cmd = Math.max(0, Math.min(1, throttle || 0));
  const spd = Math.max(0, Math.min(1, speedNorm || 0));
  // smoothstep(0.05, 0.35, cmd)
  const t = Math.max(0, Math.min(1, (cmd - 0.05) / 0.30));
  const gate = 0.35 + 0.65 * (t * t * (3 - 2 * t));
  const blended = (1 - SPEED_SHARE) * cmd + SPEED_SHARE * spd * gate;
  return IDLE_FLOOR + (1 - IDLE_FLOOR) * Math.max(0, Math.min(1, blended));
}

/**
 * Advance the envelope. Mutates `state`; allocates nothing.
 *
 * @param {object} state from createDriveEnvelope
 * @param {{throttle:number, speedNorm:number, boosting:boolean, dashFired:boolean, alive:boolean}} input
 * @param {number} dt seconds
 */
export function integrateDriveEnvelope(state, input, dt) {
  const d = Math.max(0, dt || 0);
  const alive = input.alive !== false;

  const target = alive ? resolveDriveTarget(input.throttle, input.speedNorm) : 0;
  const spoolTau = target > state.spool ? RATES.spoolRiseTau : RATES.spoolFallTau;
  state.spool += (target - state.spool) * (1 - Math.exp(-d / Math.max(spoolTau, 1e-4)));

  const boostTarget = alive && input.boosting ? 1 : 0;
  const boostTau = boostTarget > state.boost ? RATES.boostRiseTau : RATES.boostFallTau;
  state.boost += (boostTarget - state.boost) * (1 - Math.exp(-d / Math.max(boostTau, 1e-4)));

  // The dash happened somewhere inside this frame, so its envelope starts one step in. Starting at
  // exactly zero would sample the very bottom of the attack and show nothing on the frame it fired.
  if (input.dashFired) state.dashAge = d;
  else if (state.dashAge >= 0) state.dashAge += d;
  state.dash = sampleDashFlare(state.dashAge);
  // Retire on the clock, not on the sampled value. The envelope legitimately reads zero on its very
  // first frame because the attack starts at zero, so retiring on "dash <= 0" cancelled every flare
  // the instant it fired.
  if (state.dashAge > DASH_TOTAL_S) state.dashAge = -1;

  state.lit = state.spool > IDLE_FLOOR * 0.5;
  return state;
}

/**
 * Plume geometry driven by the envelope. Boost buys length and collimation, never width: a uniform
 * width multiply is what made boost read as a triangle inflating in place.
 *
 * LENGTH is the load-bearing number, because length is what the eye reads as the drive coming up. A
 * light touch on the throttle has to produce a genuinely short jet standing off the bell that then
 * lengthens; the failure this replaces was a full-length jet drawn at a lower opacity, which reads as
 * a decal fading in rather than as an engine lighting.
 *
 * Opacity is deliberately NOT scaled by the drive. Transparency is material, and how hard the engine
 * is running does not change how see-through its exhaust is — it changes how far the exhaust reaches
 * and how hot it is.
 *
 * @param {object} state envelope
 * @param {object} base recipe numbers
 * @param {object} out preallocated target
 */
export function resolvePlumeShape(state, base, out) {
  const spool = state.spool;
  const boost = state.boost;
  const dash = state.dash;

  const drive = Math.max(0, Math.min(1, (spool - IDLE_FLOOR) / (1 - IDLE_FLOOR)));

  // Never quite zero while the drive is alive: a lit engine standing at idle still has a stub of hot
  // gas in the bell. It just does not reach.
  out.jetLength = base.jetLength
    * (0.10 + drive * 0.90)
    * (1 + boost * 0.55 + dash * 1.15);
  out.throatRadius = base.throatRadius * (0.72 + drive * 0.28);
  out.spread = base.spread * (0.55 + drive * 0.45) * (1 - boost * 0.12);
  out.radiance = base.radiance * (0.45 + drive * 0.55) * (1 + boost * 0.45 + dash * 1.6);
  out.opacity = base.opacity;
  out.drive = drive;
  out.spool = spool;
  out.boost = boost;
  out.dash = dash;

  // One canonical firing decision, carried explicitly into the history recorder. The compatibility
  // threshold is expressed in the same normalized coordinate as `out.drive`; comparing that value
  // directly to raw-spool EMIT_FLOOR was a second, contradictory firing rule.
  out.emitting = spool >= EMIT_FLOOR;
  out.emitFloor = (EMIT_FLOOR - IDLE_FLOOR) / (1 - IDLE_FLOOR);
  return out;
}

/* ============================================================================================
 * E5 — THE APPEARANCE BOUNDARY BETWEEN THE JET AND THE RECORDED HISTORY
 * ============================================================================================
 *
 * The jet owns everything from the nozzle throat to the end of the instantaneous plume. The
 * history owns the recorded world-space path. The standard (VFX_TECHNIQUE_STANDARD §3, E5) asks
 * both to consume ONE shared appearance boundary so the pair reads as a single continuous thing
 * rather than two bright heads meeting at a join.
 *
 * This is the jet side of that boundary, published as data. It answers exactly one question:
 * "what does the jet look like where it hands over?" — width, radiance, colour, flow phase and
 * how many folds cross the seam. It is authoritative: the history consumer adapts to these
 * numbers. It never reaches into the history, never moves a recorded sample, and imports nothing
 * from the history's modules.
 *
 * WHERE THE BOUNDARY IS. Not at the far mesh vertex. Every sheet's material runs out before its
 * geometry does (`runout` in plasmaRibbons.js starts at life 0.64 and reaches zero at 1.0), so
 * the terminal vertex carries no material and describing it would hand the consumer a phantom.
 * The boundary is the station where the jet has spent about half its remaining material — the
 * last place it is still unambiguously the jet. That is HANDOFF_STATION below.
 */

/** Axial fraction of the designed jet length at which the jet hands over. See the note above. */
export const HANDOFF_STATION = 0.82;

/**
 * Constants of the ribbon fragment stage, evaluated once at HANDOFF_STATION so the handoff is a
 * derivation of the shipped shader rather than a second opinion about it. Each one names the
 * fragment expression it comes from (plasmaRibbons.js, RIBBON_FRAG).
 */
export const HANDOFF_TERMS = Object.freeze({
  /** `burn = exp(-vAxial * 1.35)` at the boundary. */
  burn: Math.exp(-HANDOFF_STATION * 1.35),
  /** `sear = exp(-vAxial * 9.0)` at the boundary — effectively cold. */
  sear: Math.exp(-HANDOFF_STATION * 9.0),
  /** `alight = 0.35 + vTongue * 1.15` at the mean tongue value of 0.5. */
  alight: 0.35 + 0.5 * 1.15,
  /** `emit` weights the burn term by 1.3 (the sear term contributes nothing this far out). */
  burnWeight: 1.3,
  /** Mean of `graze = min(5, 1/max(|N·V|, 0.22))` over a shell of sheet normals. */
  grazeMean: 1.75,
  /** `rad` adds `graze * 0.22`. */
  grazeWeight: 0.22,
  /** `rad` adds `uBoost * 0.40` and `uDash * 3.0`. */
  boostWeight: 0.40,
  dashWeight: 3.0,
  /** Mean of the `fold` desaturation gate `smoothstep(0.32, 0.78, |N·V|)`. */
  foldMean: 0.339,
  /** `col *= mix(vec3(0.29,0.24,0.70), vec3(1.0), fold*0.65 + sear*0.35)`. */
  foldTintFloor: Object.freeze([0.29, 0.24, 0.70]),
  /** Radius of the jet column at the throat, as a fraction of the throat radius. */
  coreRadiusFraction: 0.62,
  /** Mean per-sheet fan-out once the shear layer has broken down. */
  fanMean: 1.15,
  /** `radius += uSpread * pow(s, 0.7) * fan * 1.3`. */
  spreadWeight: 1.3,
  /** Sheets are not points: the far half-width adds to the column's outer edge. */
  sheetFarHalfWidth: 3.3 * 0.5,
  /** Travelling-wave defaults: `flow = s * axialFreq - t * flowRate`. */
  axialFreq: 3.2,
  flowRate: 2.6,
  /** Streamer sheets crossing the boundary when the recipe does not say. */
  foldCount: 12,
});

function smoothstep01(edge0, edge1, x) {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * The single reused result record.
 *
 * `resolveJetHandoff` is on the per-frame render path for every firing nozzle, so it allocates
 * nothing: it fills and returns this one object, `colorRGB` included. A caller that needs the
 * values past its own frame must copy them out — never retain the record itself.
 */
const HANDOFF_SCRATCH = {
  widthWU: 0,
  radiance: 0,
  colorRGB: [0, 0, 0],
  flowPhase: 0,
  foldCount: HANDOFF_TERMS.foldCount,
};

/**
 * Resolve the jet's appearance at its terminal station. Pure and allocation-free.
 *
 * @param {object|null} recipe a thruster recipe. Read, when present, in this order:
 *   `recipe.ribbon.{throatRadius,spread,radiance,jetLength}` (player plasma stream),
 *   then the flat `recipe.{exitRadiusWU,spread,radiance,lengthWU,ribbons}` (retro jets),
 *   then `recipe.jet.{exitRadiusWU,lengthWU}`, then `recipe.geometry.{baseWidth,baseLength}`
 *   (fleet family recipes). Colour comes from `recipe.volume` / the flat recipe
 *   `{coreColor,midColor,edgeColor}` triple. Anything missing falls back to the shipped
 *   player numbers, so a null recipe still returns a usable boundary.
 * @param {object|null} jetState the live jet, normally the object `resolvePlumeShape` filled.
 *   Reads `drive`, `boost`, `dash`, `jetLength`, `throatRadius`, `spread`, `radiance` and
 *   `time` (seconds; the plume's own flow clock — pass `0` if the consumer only wants the
 *   static part of the boundary). Every field is optional.
 * @returns {{widthWU:number, radiance:number, colorRGB:number[], flowPhase:number,
 *   foldCount:number}} the shared scratch record described above.
 */
export function resolveJetHandoff(recipe, jetState) {
  const r = recipe || null;
  const rib = (r && r.ribbon) || null;
  const jet = (r && r.jet) || null;
  const geo = (r && r.geometry) || null;
  const vol = (r && r.volume) || r || null;
  const s = jetState || null;

  const T = HANDOFF_TERMS;

  // ---- geometry of the boundary ------------------------------------------------------------
  const recipeThroat = finite(
    rib && rib.throatRadius,
    finite(r && r.exitRadiusWU, finite(jet && jet.exitRadiusWU, finite(geo && geo.baseWidth, 1.32))),
  );
  const recipeSpread = finite(rib && rib.spread, finite(r && r.spread, 1.7));
  const throat = Math.max(0, finite(s && s.throatRadius, recipeThroat));
  const spread = Math.max(0, finite(s && s.spread, recipeSpread));
  const drive = Math.max(0, Math.min(1.4, finite(s && s.drive, 1)));
  const boost = Math.max(0, finite(s && s.boost, 0));
  const dash = Math.max(0, finite(s && s.dash, 0));

  // The column at the boundary: the collimated core, plus the billow the shear layer has opened
  // by this station, plus the far half-width of the sheets riding on it. Boost collimates rather
  // than inflates, exactly as the vertex stage does.
  const column = throat * T.coreRadiusFraction
    + spread * Math.pow(HANDOFF_STATION, 0.7) * T.fanMean * T.spreadWeight;
  const sheetEdge = T.sheetFarHalfWidth * Math.pow(HANDOFF_STATION, 0.8);
  HANDOFF_SCRATCH.widthWU = (column + sheetEdge) * (1 - boost * 0.14 + dash * 0.35);

  // ---- how hot it still is -----------------------------------------------------------------
  const emit = T.burn * T.burnWeight * T.alight;
  const baseRadiance = Math.max(0, finite(
    s && s.radiance,
    finite(rib && rib.radiance, finite(r && r.radiance, 1.55)),
  ));
  HANDOFF_SCRATCH.radiance = baseRadiance
    * (emit + T.grazeMean * T.grazeWeight + boost * T.boostWeight + dash * T.dashWeight);

  // ---- what colour it is -------------------------------------------------------------------
  // The fragment's temperature ramp, evaluated at the boundary: edge tone lifted toward the mid
  // tone by the surviving burn, then the mean fold desaturation the shell's grazing term applies.
  const mid = (vol && vol.midColor) || [0.09, 0.55, 1.0];
  const edge = (vol && vol.edgeColor) || [0.12, 0.07, 0.70];
  const core = (vol && vol.coreColor) || [1.0, 0.99, 0.97];
  const toMid = smoothstep01(0.05, 0.55, T.burn * T.alight);
  const toCore = Math.max(0, Math.min(1, dash * 0.8));
  const tintMix = Math.max(0, Math.min(1, T.foldMean * 0.65 + T.sear * 0.35));
  for (let i = 0; i < 3; i++) {
    const e = finite(edge[i], 0);
    const m = finite(mid[i], 0);
    const c = finite(core[i], 1);
    const ramp = e + (m - e) * toMid;
    const withDash = ramp + (c - ramp) * toCore;
    const floorC = T.foldTintFloor[i];
    HANDOFF_SCRATCH.colorRGB[i] = withDash * (floorC + (1 - floorC) * tintMix);
  }

  // ---- where the travelling wave is --------------------------------------------------------
  // `flow = s * axialFreq - time * flowRate`, wrapped to [0,1). A consumer that wants its own
  // structure to line up with the jet's advances from this, rather than inventing a second clock.
  const time = Math.max(0, finite(s && s.time, 0));
  const raw = HANDOFF_STATION * T.axialFreq - time * T.flowRate;
  HANDOFF_SCRATCH.flowPhase = raw - Math.floor(raw);

  // ---- how many folds cross the seam -------------------------------------------------------
  const folds = finite(rib && rib.ribbons, finite(r && r.ribbons, T.foldCount));
  HANDOFF_SCRATCH.foldCount = Math.max(1, Math.round(folds));

  // A drive that is not firing hands over nothing to blend with. Width and fold count stay
  // truthful so a consumer can still size its own root, but the light genuinely goes out.
  if (drive <= 0) HANDOFF_SCRATCH.radiance = 0;

  return HANDOFF_SCRATCH;
}
