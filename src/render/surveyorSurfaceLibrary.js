import * as THREE from 'three';

export const SURVEYOR_SURFACE_URL = '/assets/ships/release/surfaces/surveyor-prism/surface_basecolor.webp';
// Derived from the same approved image. Bottom row first matches TextureLoader UV orientation.
const FALLBACK_RGBA_BASE64 = 'ko6L/5OSjv+Uk4//kY+L/5KOi/+Tko7/lZGL/5SQjP+Uk4//l5WR/5KQjP+Wko//l4+I/5SPjv+TkZD/mJSR/5eVkf+Tko7/lZOS/5WTkv+VkY7/l5OO/5uXk/+XlZH/l5OS/5ORkP+YlpL/lZGO/5eVkf+UkpH/k5KO/5KPif+VlJD/lpKP/5eTkP+KhoP/iIWE/5ORkP+VkY7/koyH/5WRjv+XlZH/i4mF/4uJhf+UkIz/l5OQ/5uXk/+cmJT/mZWS/5eVkf+Zl5X/k42G/5GNiv+YlJH/lJCK/5WRi/+XlZP/lZOS/4qIhP9jYl7/aGRh/5iUkf+XlZH/l5OQ/5eTkv+Ujon/lJKR/2BeXP9eXFr/g4F//5eVk/+Zl5X/k5KO/5KQjv+XlZH/l5OS/5WUkP+XlZH/lJCM/5WPiP+Xj4j/lpGJ/5iUkf+Wko3/mZeT/5KQjv+Sjov/k42I/5SSkf+YlpL/jo2J/3h3c/99eXb/mJaS/5uXk/+Uk4//lpKP/5KMhf+bmpb/i4eE/4mHg/+VkY7/j4uG/5GNiv+Uk4//l5WT/5eVk/+Rj43/i4eE/42MiP+Xk5D/ko+J/5yWj/+Zk4z/nZmW/5STj/+Mi4f/kpCO/5WQkP+Wko//k5KO/5OSjv+ZkYn/mJWP/5mVkv+Wko//koyF/5STj/+Vk5L/mJaU/5mVlP+YlJH/lJOP/5mVkv+LiIL/joqF/5mVkv+ZlZL/l5WT/5KQjv9zcW3/cW1p/5WUkP+Mi4f/l5OQ/5aSj/+YlpL/lZOS/4yLh/+UkpH/k5KO/5SQjP+UkIz/l5OQ/5uXk/+Zl5P/l5WR/5aRkf+VlJD/lJCM/5iWkv+cmJT/lpKP/5iUk/+bl5P/mJSR/5uXk/+ZlZL/l5WR/5SSkf+Tko7/lpKP/3d2cv9vbWn/mJSR/3Rwbf+XlZH/l5OQ/5WUkP+XlZP/mJaS/5iWkv+UkIz/g398/25saP9ybW3/goB8/52Zlv+ZlZT/mJST/5SSkf+XlZH/kpCO/5WUkP+UkpH/hIJ+/4aFgf+Zl5P/l5OQ/5mVkv+Vj4j/k5KO/5WUkP+ZlZL/mZWS/5iWkv+VlJD/lJCM/5eVkf+ZlZL/l4+G/5KPif+XlZH/l5WR/5yWkf96dnP/Y2Je/2JgX/96dnP/m5qW/5ORkP+YkIf/lpKN/5ORkP+VkJD/kY2K/5OSjv+Vk5L/lJKR/5iWlP+TjYb/mZaQ/5STj/+YlJH/mJaS/5uXk/+XlZH/l5OQ/5WRi/+YlJH/mJaS/52Zlv+amJT/lZSQ/5STj/+Vk5L/l5WR/5WUkP+Sjov/kY+L/5OSjv+YlpL/lpKP/5yYlP+ZlZL/lZSQ/5SQjP+ZjX//mZWS/5uZmP+amJT/mJSR/5mVkv+VlJD/jo2J/4aCfv+VlJD/mJSR/5iWkv+bl5P/kY6I/5eVkf+YlJH/f3t3/5GOiP+YlJH/l5OO/52Zlv+VkY7/k5KO/5KQjP+XlZH/mJSR/5WRjv+Jh4X/k5KO/5WRi/+VkY7/mJaS/5uXk/+Zl5X/gX16/5uZmP+Zl5P/l5WT/5aSj/+Tko7/kpCM/5iWkv+bmpb/nJiU/5uXk/+VlJD/lZGO/5STj/9lY1//hIB9/5aSj/+XlZH/l5WR/5STj/+Jh4P/hIJ+/5eTkP+Uk4//lpKP/5GPjf+SkI7/lpKP/5GLhP+VkY7/mZOO/5iVj/+SkI7/l5WR/5KOi/9/e3f/ioaD/5OSjv+Rioj/j4uG/5mXk/+Uk4//mpiU/5uXk/+cmJT/nJiU/4eDgP+UkIz/lJOP/5SQiP+Wko3/mZeT/5WRjv+QjIn/lJOP/5SQjP+Tko7/lZOS/5eVk/+Uk4//kY2K/5uXk/+ZlZL/mZaQ/5eVkf+Wko//gX97/2BeXP95dXL/l5WT/5eVkf+YlpL/mZWS/5aOh/+Xk5D/lZGL/5mVkv+dmZb/lZSQ/5iWkv+Wko//lpCL/5eRjf+bl5P/mJSR/5KPh/+YlJH/lZSQ/5uZmP+Zl5X/i4mF/5SQjP+Uk4//mJSR/5mVkv+bl5P/lZSQ/5OSjv+IhIH/Z2Vh/3x4df+XlZP/l5WR/5iUkf+Wko//mZaQ/5uXk/+YlJH/mJSR/5mWkP+XlZH/k5KO/5COiv+Uk4//lZSQ/5SSkf+WkYn/nZmU/56cmP+YlpT/mJaU/4WDgv9jYWD/kY+L/5GPi/+YlJP/mZaQ/5uXk/+QjIn/lZGO/5iUkf+VlJD/mJSR/5mXk/+XlZP/mJSR/5iUkf+Sjov/joqH/5qYlP+cmJT/lZGL/5iWkv+Tko7/iISB/5mXk/+XlZH/l5OQ/5SQiv+ZlZL/mJWP/5eVkf+bl5P/iISB/2ppZf+UkpH/k5KO/5eTkP+YlJH/kYuC/5mTjv+YlpL/l5OQ/5eTkP+Wko3/mZOM/5aSjf+Zl5P/l5WR/4qGg/99enT/lZSQ/5uXk/+YlY//mpiU/5STj/+OjYn/lZSQ/5WUkP+YlJH/mZWS/5uXkf+Sj4n/nJiU/5iWkv+XlZH/m5eT/5iWkv+VlJD/mZeT/5uXk/+imI7/m5WO/5eTkP+bl5P/mZaQ/5iUkf+VlJD/mZWS/5+bmP+bl5P/l5OQ/5mVkv+Xk47/mZWS/5eTkP+ZlZL/lpKP/5aSj/+Sjov/kYqG/5WRi/+Wko//lZGO/5WLg/+Xk47/l5WT/5iUkf+YlpL/mJaS/5iUkf+YlJH/lZSQ/5iUkf+YlY//l5WR/5iUkf+SkIz/mZWS/5SQjP+XlZH/mJSR/5qTiv+XlIz/lpKP/5iWkv+YlJH/l5OQ/5STj/+XlZH/l5OQ/4+Lhv+TjIH/mZWS/5WUkP+SkIz/m5OP/5mWkP+YlJP/k5KO/5GIhf+Rjoj/mJSR/5KQjP99dW3/hIF7/5uXk/+SkIz/lJCM/5SQjP+VkY7/lJOP/5iUkf+dmJD/oJiS/5aQi/+Rjoj/lZGO/5mVkv+YlpT/l5WR/5aRkf+Uk4//mZWS/4WEgP91c2//dnJv/5COiv+Xk5D/lZSQ/5mVkv+Zl5P/m5qW/5uXk/+Zl5X/lJOP/5eVkf+YlpL/l5WT/5OSjv+JhYL/dXNv/3Vxbv98enb/mZWS/5WRi/+ZlZL/mZeT/5mVkv+YlpL/mZeT/5iWkv+CgHz/mJaU/5WUkP+Uk4//e3l1/2ZkYv9iYV3/i4mF/5WRjv+Xk5D/k5KO/42MiP+OjYn/n52Z/5iWkv+bl5P/m5eT/5iWlP+YlpT/l5WT/39+ev9nZWP/Y2Je/3Jua/+YlJH/lI6H/5qYlP+bl5P/lpKP/5iVj/+Wko//mJCH/5SQiv+ak5H/nJiU/5WUkP+IhoL/fnd1/3h3c/+QjIn/kpCM/5KOi/+VlJD/jo2J/5COiv+cmJT/mZOO/56al/+VkYn/nJiU/5yXl/+Zl5P/kIyJ/4SCfv+Hg4D/iYWC/5mXk/+Zl5X/m5eT/3Vzb/9iYV3/lZGO/5iVj/+YlpL/mJSR/5aQi/+YlJH/mZWS/5WUkP+VlJD/kY2K/5WUkP+Wko//l5OQ/5mVkv+XlZP/lZSQ/5uXkf+dl5T/nJiU/5mVlP+cmJT/m5mY/6Ccmf+YlpL/nJiU/5mVkv+YlJH/mZeV/5yXl/+dmZb/eXVy/2VjX/+ZlZL/nZmW/5mXk/+Zl5P/m5eT/5uVkP+bl5H/mJSR/5eVkf+Oiof/mJaS/5iUkf+Xk5D/mpiU/5eVk/+blY7/m5WS/5yYkv+ZlZL/l5OO/5+bmP+Kh4H/n5uY/52Zlv+empf/mZGJ/5eVkf+ZlZT/m5eT/5uXkf+Ggn7/dnRw/5uXk/+YlJH/l5OQ/5WUkP+YkIf/nZKG/5eSi/+VlJD/l5WR/5KQjv+Jh4X/jYyI/5WTkv+XlZH/lZOS/5mVkv+Zk4r/lpKN/5WTkv+Sjov/mJSR/5mVkv+YlJH/m5eT/5yYlP+elo3/nZmW/56al/+cmJL/l5GN/5iWkv+dmZb/m5eT/5aRh/+bkYn/lpKP/5iWkv+ZlZL/l5OS/5eVkf+XlZP/lZOS/5SSkf+TkZD/lJOP/3h3c/96eHT/mJaS/5mVlP+UkpH/lpKP/4mFgv+Rj4v/mJSR/5KPif+Xk5D/nZmW/5yYlP+XlZH/mJSR/5aSj/+VlJD/mZeV/5mVkv+UkIz/mZWS/5yYlP+bl5P/lZSQ/5eTkP+ZlZL/l5WT/5COjP91c2//dHJu/4uHhv+VlJD/m5qW/5uVjv+elo3/nJiS/5aRkf+YlY//l5OQ/5iUk/+cmJT/ko+J/5iUkf+blpX/mJaS/5eTkP+VkY7/lJKR/5eVk/+amJT/l5WT/5KQjv98enb/f3t3/317d/+RjYr/k5KO/5aSj/+YlJH/ioaD/2plZP9lY2H/h4OA/5iUk/+VlJD/mZWS/5mVkv+YlY//m5eT/5eTkP+YlpT/mZeT/5eTkP+ZlZL/mZKQ/5eVkf+bl5P/lY+I/5uXk/+cmJT/mZeV/52YmP+amJf/ko6L/21pZv9qaWX/bGpo/4qGg/+VlJD/lpKP/5WQhv+Oiof/bmpn/2ppZf+JhYT/mJaU/5iWlP+Xk5L/lJOP/52Zlv+dmZb/l5OQ/46Nif+VkY7/YmBf/2FfXf9hX13/YV9b/5CMif+XlZH/mZWU/5uZmP+Zl5X/mpiX/5eTkP+ZkYv/ko+J/5iWkv+ZlZT/mJaS/5mXk/+Xk5L/lY+I/5mWkP+WkZH/lpKP/5SQjP+Fg4L/mZWS/5mVlP+blpX/mZeV/5aSj/+YlJH/mZWS/5WRjv9nZWP/Z2Vj/2poZ/9pZ2b/kpCM/5uXk/+TkZD/hIB9/4qIhP+Zl5P/nJiU/5yWkf+ZlpD/mJaS/5WUkP+Pi4j/jYyI/5STj/+alI//m5eR/5eTkP+UkIz/kY2K/315dv+dmZb/m5qW/52Zlv+bmZj/mJST/5eTkv+YlJH/mZWS/4eDgP+FhID/mZWS/5yYlP+VkYv/lI6J/5aSj/99e3f/h4OA/5uXk/+ZlZL/l5WR/5iUkf+YlpL/m5eT/4qGg/+KhoP/lZSQ/5uXk/+empf/m5eT/5OSjv+UjIj/l5OO/52Zlv+cl5f/mZWS/5mXk/+Vk5L/l5OQ/52RiP+ckoj/l5GN/5yYlP+cmJT/mZWS/5WRi/+Uj4X/mJSR/5iUkf+bl5P/lI2E/5aSj/+Zl5P/lpKP/5iUkf+cmJT/mJSR/5eTkP+Zl5P/lpKN/5mRif+VkY7/mJSR/5mVkv+YlJH/m5eT/5iWkv+WjIT/n5uY/5mVlP+WkI7/lZGO/5iVj/+Xk5D/l5OQ/5GNiv+TkZD/ko6L/5SOh/+UkIr/l5OQ/5aSj/+WjIT/k5GQ/5eVk/+RjYr/joqH/5SQjP+Uk4//mJSR/5aSj/+RjYr/nJiU/5eTjv+SkIz/kpCO/5eTkP+cmJT/l5OQ/5WRjv+Xk47/lZGO/w==';

function configure(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.userData.spacefaceSharedAsset = true;
  texture.needsUpdate = true;
  return texture;
}

/** Independent optional map: CPU decode is shared; upload receipts belong to each context. */
export function createSurveyorSurfaceLibrary({
  loadTexture = null,
  now = () => performance.now(),
  defer = callback => setTimeout(callback, 0),
  retryMs = 1000,
  maxAttempts = 3,
} = {}) {
  let fallback = null, decoded = null, loading = null, loadAttempts = 0, nextLoad = 0;
  const renderers = new WeakMap();

  function getFallback() {
    if (!fallback) {
      const data = Uint8Array.from(atob(FALLBACK_RGBA_BASE64), c => c.charCodeAt(0));
      fallback = configure(new THREE.DataTexture(data, 32, 32, THREE.RGBAFormat));
      fallback.name = 'Surveyor_EmbeddedFallback32';
    }
    return fallback;
  }

  function record(renderer) {
    let state = renderers.get(renderer);
    if (state) return state;
    state = { generation: 0, lost: false, destroyed: false, warm: false, pending: null, attempts: 0, next: 0 };
    renderers.set(renderer, state);
    state.onLost = () => lifecycle(renderer, 'context-lost');
    state.onRestored = () => {
      if (state.destroyed) return;
      state.lost = false;
      const generation = state.generation;
      // Run after Three's own context-restoration handlers have reset its texture cache.
      defer(() => { if (active(renderer, state, generation)) void preload(renderer, { retry: true }); });
    };
    renderer.domElement?.addEventListener?.('webglcontextlost', state.onLost);
    renderer.domElement?.addEventListener?.('webglcontextrestored', state.onRestored);
    return state;
  }

  function active(renderer, state, generation) {
    return !state.destroyed && !state.lost && state.generation === generation
      && !renderer.getContext?.()?.isContextLost?.();
  }

  function decode(retry) {
    if (decoded) return Promise.resolve(decoded);
    if (loading) return loading;
    if (!loadTexture && typeof document === 'undefined') return Promise.resolve(null);
    if (retry) { loadAttempts = 0; nextLoad = 0; }
    if (loadAttempts >= maxAttempts || now() < nextLoad) return Promise.resolve(null);
    loadAttempts++;
    loading = Promise.resolve().then(() => (loadTexture || (url => new THREE.TextureLoader().loadAsync(url)))(SURVEYOR_SURFACE_URL))
      .then(texture => {
        if (!texture) throw new Error('Surveyor surface did not decode');
        decoded = configure(texture);
        decoded.name = 'Surveyor_GeneratedSurface256';
        return decoded;
      }).catch(() => { nextLoad = now() + retryMs * 2 ** (loadAttempts - 1); return null; })
      .finally(() => { loading = null; });
    return loading;
  }

  function preload(renderer, { retry = false } = {}) {
    if (!renderer) return decode(retry);
    const state = record(renderer), generation = state.generation;
    if (!active(renderer, state, generation)) return Promise.resolve(null);
    if (state.warm) return Promise.resolve(decoded);
    if (state.pending) return state.pending;
    if (retry) { state.attempts = 0; state.next = 0; }
    if (state.attempts >= maxAttempts || now() < state.next) return Promise.resolve(null);
    const pending = decode(retry).then(texture => {
      if (!texture || !active(renderer, state, generation)) return null;
      state.attempts++;
      try {
        if (typeof renderer.initTexture !== 'function') return null;
        renderer.initTexture(texture);
        if (!active(renderer, state, generation)) return null;
        state.warm = true;
        state.attempts = 0;
        return texture;
      } catch (_) {
        state.next = now() + retryMs * 2 ** (state.attempts - 1);
        return null;
      }
    }).finally(() => { if (state.pending === pending) state.pending = null; });
    state.pending = pending;
    return pending;
  }

  function lifecycle(renderer, reason) {
    if (!renderer || (reason !== 'context-lost' && reason !== 'renderer-destroyed')) return;
    const state = renderers.get(renderer);
    if (!state || state.destroyed) return;
    if (!state.lost) state.generation++;
    state.lost = true;
    state.warm = false;
    state.pending = null;
    state.attempts = 0;
    state.next = 0;
    if (reason === 'renderer-destroyed') {
      state.destroyed = true;
      renderer.domElement?.removeEventListener?.('webglcontextlost', state.onLost);
      renderer.domElement?.removeEventListener?.('webglcontextrestored', state.onRestored);
    }
  }

  function apply(renderer, material) {
    const state = record(renderer);
    if (state.warm && active(renderer, state, state.generation)) { material.map = decoded; return; }
    material.map = getFallback();
    // No per-frame promise allocation after bounded failures or while a request is pending.
    if (active(renderer, state, state.generation) && !state.pending
      && state.attempts < maxAttempts && now() >= state.next
      && (decoded || (loadAttempts < maxAttempts && now() >= nextLoad))) void preload(renderer);
  }

  function attach(mesh) {
    mesh.material.map = getFallback();
    const previous = mesh.onBeforeRender;
    mesh.onBeforeRender = function(renderer, scene, camera, geometry, material, group) {
      previous.call(this, renderer, scene, camera, geometry, material, group);
      apply(renderer, material);
    };
    // No async callback captures instance materials. Disposal cannot publish into a dead instance.
  }

  // No global renderer set or per-instance texture ownership. Shared maps survive one renderer's
  // teardown and are naturally released with the module/page; another renderer may still use them.
  return { getFallback, preload, lifecycle, attach, apply };
}

const library = createSurveyorSurfaceLibrary();
export const getSurveyorFallbackSurface = () => library.getFallback();
export const preloadSurveyorSurface = (renderer, options) => library.preload(renderer, options);
export const surveyorSurfaceRendererLifecycle = (renderer, reason) => library.lifecycle(renderer, reason);
export const attachSurveyorSurface = mesh => library.attach(mesh);
