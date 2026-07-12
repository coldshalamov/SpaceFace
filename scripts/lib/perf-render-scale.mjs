const MIN_RENDER_SCALE = 0.5;
const MAX_RENDER_SCALE = 2;

export function parseRenderScaleRequest(value) {
  if (value == null) return null;
  if (typeof value === 'boolean' || value === '') {
    throw new Error('--render-scale requires a numeric value from 0.5 through 2');
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_RENDER_SCALE || parsed > MAX_RENDER_SCALE) {
    throw new Error(`--render-scale must be finite and within ${MIN_RENDER_SCALE}..${MAX_RENDER_SCALE}`);
  }
  return parsed;
}

export function buildRenderScaleApplyExpression(value) {
  const requested = parseRenderScaleRequest(value);
  if (requested == null) throw new Error('--render-scale application requires an explicit value');
  return `(() => {
    const sf = window.SF || null;
    const state = sf && sf.state;
    const video = state && state.settings && state.settings.video;
    if (!video) return { requested: ${requested}, applied: null, changed: false };
    const previous = Number(video.renderScale);
    let profileSettingsRaw = null;
    try {
      profileSettingsRaw = localStorage.getItem('sf.settings.profile.v1');
    } catch (_) {}
    const changed = Number(video.renderScale) !== ${requested};
    video.renderScale = ${requested};
    if (typeof window.dispatchEvent === 'function' && typeof window.Event === 'function') {
      window.dispatchEvent(new window.Event('resize'));
    }
    return { requested: ${requested}, applied: Number(video.renderScale), previous, changed, profileSettingsRaw };
  })()`;
}

export function buildRenderScaleRestoreExpression(application) {
  const previous = Number(application && application.previous);
  if (!Number.isFinite(previous) || previous < MIN_RENDER_SCALE || previous > MAX_RENDER_SCALE) {
    throw new Error('render-scale restoration requires the previous runtime value');
  }
  const profileSettingsRaw = application && typeof application.profileSettingsRaw === 'string'
    ? application.profileSettingsRaw
    : null;
  return `(() => {
    const sf = window.SF || null;
    const state = sf && sf.state;
    const video = state && state.settings && state.settings.video;
    if (video) video.renderScale = ${previous};
    if (typeof window.dispatchEvent === 'function' && typeof window.Event === 'function') {
      window.dispatchEvent(new window.Event('resize'));
    }
    const profileSettingsRaw = ${JSON.stringify(profileSettingsRaw)};
    let profileRestored = false;
    try {
      if (profileSettingsRaw == null) localStorage.removeItem('sf.settings.profile.v1');
      else localStorage.setItem('sf.settings.profile.v1', profileSettingsRaw);
      profileRestored = localStorage.getItem('sf.settings.profile.v1') === profileSettingsRaw;
    } catch (_) {}
    return { restored: video ? Number(video.renderScale) : null, profileRestored };
  })()`;
}
