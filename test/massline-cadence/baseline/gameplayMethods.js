// Frozen packet methods from de9f3f1fc. Method bodies below are verbatim, not a weaker invented opponent.
// Minimal service adapters exercise their ordinary standard-line scalar policy only.
const finite = (x, fb=0) => Number.isFinite(x) ? x : fb;
const positive = (x, fb) => Number.isFinite(x) && x>0 ? x : fb;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = x => clamp(x, 0, 1);
const combatKernel = host => host.kernel;
const attachmentDef = (kernel, id) => kernel.catalog.attachments.get(id);
const automaticMasslineBreakAllowed = () => false; // Explicitly ordinary standard-line fixture.
export const baselineMethods = {
  _reelActive(attachments, reelDelta, dt, state, player, target, options = null) {
    if (!this._active || !Number.isFinite(reelDelta) || reelDelta === 0) return { changed: false, reason: null, attachment: null };
    const attachment = attachments.get(this._active.attachmentId);
    if (!attachment || attachment.state !== 'active') return { changed: false, reason: 'attachment_missing', attachment };
    const kernel = combatKernel(this);
    const def = attachmentDef(kernel, attachment.defId);
    if (!def) return { changed: false, reason: 'unknown_attachment_def', attachment };

    const policy = typeof attachments.reelPolicy === 'function' ? attachments.reelPolicy(attachment.id) : null;
    const reelRate = policy && Number.isFinite(policy.reelRate) ? policy.reelRate : def.reelRate;
    const maxStep = positive(reelRate, 0) * Math.max(0, Number(dt) || 0);
    if (!(maxStep > 0)) return { changed: false, reason: 'reel_unavailable', attachment };
    const requested = options && options.normalizedAxis === true
      ? clamp(reelDelta, -1, 1) * maxStep
      : clamp(reelDelta, -maxStep, maxStep);
    const minLength = positive(def.minLength, 0);
    const maxLength = positive(policy && policy.maxLength, positive(def.maxLength, Infinity));
    const before = attachment.restLength || 0;

    // An explicitly breakable extreme-load operation protects its line by denying further reel-in
    // near the physical ceiling; paying out remains available. An ordinary standard Massline does
    // not auto-break, so its nominal rating must never create a fictitious reel-in failure.
    const breakPolicy = policy && policy.break;
    const maxTension = positive(breakPolicy && breakPolicy.maxTension, Infinity);
    const automaticBreakAllowed = automaticMasslineBreakAllowed(def, player, target);
    if (automaticBreakAllowed
        && requested < 0
        && Number.isFinite(maxTension)
        && finite(attachment.lastTension, 0) >= maxTension * 0.9) {
      return { changed: false, reason: 'load_limit', attachment, before, after: before };
    }

    const next = clamp(before + requested, minLength, maxLength);
    const delta = next - before;
    if (Math.abs(delta) <= 1e-6) {
      return {
        changed: false,
        reason: requested < 0 ? 'minimum_length' : 'maximum_length',
        attachment,
        before,
        after: before,
      };
    }
    const result = attachments.reel(attachment.id, delta, minLength);
    if (!result || !result.ok) {
      return { changed: false, reason: result && result.reason || 'reel_rejected', attachment, before, after: before };
    }
    const after = result.attachment && result.attachment.restLength;
    return {
      changed: Number.isFinite(after) && Math.abs(after - before) > 1e-6,
      reason: null,
      attachment: result.attachment || attachment,
      before,
      after: Number.isFinite(after) ? after : before,
    };
  },

};

export function rateRelease(state, targetId) {
  const telemetry = state && state.player && state.player.masslineTelemetry;
  const sourceId = state && state.playerId != null ? state.playerId : null;
  if (!telemetry) {
    return {
      targetId,
      sourceId,
      classification: 'messy',
      releaseScore: 0,
      radialSpeed: 0,
      tangentialSpeed: 0,
      angularSpeed: 0,
      strain: 0,
      distance: 0,
      restLength: 0,
      playerSpeed: 0,
      maxStrainSinceLatch: 0,
      maxTangentialSpeedSinceLatch: 0,
      maxAngularSpeedSinceLatch: 0,
    };
  }

  const strain = finite(telemetry.strain, 0);
  const absTangential = Math.abs(finite(telemetry.tangentialSpeed, 0));
  const absRadial = Math.abs(finite(telemetry.radialSpeed, 0));
  const tangentQuality = absTangential / Math.max(absTangential + absRadial, 1e-6);
  const usefulLoad = clamp01(strain / 0.65);
  const overloadPenalty = clamp01((strain - 0.85) / 0.35);
  const releaseScore = clamp01(tangentQuality * usefulLoad * (1 - overloadPenalty));

  let classification;
  if (releaseScore >= 0.85) classification = 'razor';
  else if (releaseScore >= 0.65) classification = 'clean';
  else if (releaseScore >= 0.35) classification = 'good';
  else classification = 'messy';

  return {
    targetId,
    sourceId,
    classification,
    releaseScore,
    radialSpeed: finite(telemetry.radialSpeed, 0),
    tangentialSpeed: finite(telemetry.tangentialSpeed, 0),
    angularSpeed: finite(telemetry.angularSpeed, 0),
    strain,
    distance: finite(telemetry.distance, 0),
    restLength: finite(telemetry.restLength, 0),
    playerSpeed: finite(telemetry.playerSpeed, 0),
    maxStrainSinceLatch: finite(telemetry.maxStrainSinceLatch, 0),
    maxTangentialSpeedSinceLatch: finite(telemetry.maxTangentialSpeedSinceLatch, 0),
    maxAngularSpeedSinceLatch: finite(telemetry.maxAngularSpeedSinceLatch, 0),
  };
}

export function baselineReelDelta({axis=0, dt=1/60, restLength=100, minLength=10, maxLength=240, reelRate=60}) {
  const def={id:'standard',minLength,maxLength,reelRate};
  const attachment={id:'line',defId:def.id,state:'active',restLength};
  const attachments={get:()=>attachment,reelPolicy:()=>def,reel:(_id,delta)=>{
    attachment.restLength+=delta;return {ok:true,attachment};}};
  const host={...baselineMethods,_active:{attachmentId:'line'},kernel:{catalog:{attachments:new Map([[def.id,def]])}}};
  host._reelActive(attachments,axis,dt,{},null,null,{normalizedAxis:true});
  return attachment.restLength-restLength;
}
