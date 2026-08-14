// Present-path policy for the default WebGL2 route.
//
// The ordinary bloom/HDR composite never draws the authored scene into the canvas backbuffer.
// Scene geometry lands in a single-sampled HDR render target; a fullscreen quad then presents
// that composite. Canvas MSAA therefore cannot anti-alias ship/station edges on the default
// route — it only multiplies the unused swapchain samples. Native straight-to-canvas fallback
// is the sole path that can use canvas MSAA, and that path is already a degraded capability.

export const PRESENT_ROUTE = Object.freeze({
  BLOOM: 'bloom',
  GRAPH: 'renderGraph',
  STRAIGHT: 'straight',
});

/**
 * Decide whether the WebGL canvas should request MSAA.
 * Default bloom/graph present routes return false (same visible image, less GPU work).
 */
export function shouldEnableCanvasAntialias(options = {}) {
  const route = options.presentRoute || options.route || PRESENT_ROUTE.BLOOM;
  if (options.nativeFallback === true || route === PRESENT_ROUTE.STRAIGHT) {
    return options.forceDisable !== true;
  }
  return false;
}

/** Default player present route is bloom composite, not a straight canvas scene pass. */
export function defaultPresentRoute(video = {}) {
  if (video.renderGraph === true) return PRESENT_ROUTE.GRAPH;
  if (video.bloom === false && video.forceStraightPresent === true) return PRESENT_ROUTE.STRAIGHT;
  return PRESENT_ROUTE.BLOOM;
}

/**
 * Construction flags for THREE.WebGLRenderer that preserve the default image.
 * preserveDrawingBuffer stays off unless the explicit ship-shot capture query is set.
 */
export function resolveWebGlRendererFlags(options = {}) {
  const presentRoute = options.presentRoute || defaultPresentRoute(options.video || {});
  return Object.freeze({
    antialias: shouldEnableCanvasAntialias({
      presentRoute,
      nativeFallback: options.nativeFallback === true,
    }),
    alpha: false,
    powerPreference: options.powerPreference || 'high-performance',
    preserveDrawingBuffer: options.preserveDrawingBuffer === true,
    presentRoute,
  });
}
