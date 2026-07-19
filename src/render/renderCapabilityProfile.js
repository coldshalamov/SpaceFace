const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|software rasterizer|microsoft basic render|mesa offscreen/i;

export function classifyRenderCapabilityProfile(input = {}) {
  const renderer = String(input.renderer || '');
  const vendor = String(input.vendor || '');
  const token = `${renderer} ${vendor}`.trim();
  const acceleration = SOFTWARE_RENDERER_PATTERN.test(token)
    ? 'software'
    : (token ? 'hardware' : 'unknown');

  return Object.freeze({
    acceleration,
    renderer: renderer || 'unknown',
    vendor: vendor || 'unknown',
    maxTextureSize: Number(input.maxTextureSize) || 0,
    maxSamples: Number(input.maxSamples) || 0,
    // Capability policy changes scheduling only. It never silently removes authored assets,
    // background layers, post processing, or material fidelity.
    visualTier: 'full',
    pipelineWarmup: acceleration === 'hardware' ? 'eager' : 'lazy',
  });
}

export function shouldEagerlyWarmPipelines(profile) {
  return !!profile && profile.pipelineWarmup === 'eager';
}

export function detectRenderCapabilityProfile(renderer) {
  const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
  if (!gl) return classifyRenderCapabilityProfile();
  let rendererName = '';
  let vendorName = '';
  try {
    const debugInfo = gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
    rendererName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    vendorName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  } catch {
    // Privacy-hardened contexts can reject debug parameters; unknown uses the safe scheduler.
  }
  return classifyRenderCapabilityProfile({
    renderer: rendererName,
    vendor: vendorName,
    maxTextureSize: safeParameter(gl, gl.MAX_TEXTURE_SIZE),
    maxSamples: safeParameter(gl, gl.MAX_SAMPLES),
  });
}

function safeParameter(gl, parameter) {
  if (!gl || parameter == null || typeof gl.getParameter !== 'function') return 0;
  try { return Number(gl.getParameter(parameter)) || 0; }
  catch { return 0; }
}
