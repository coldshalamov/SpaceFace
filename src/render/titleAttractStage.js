// Attract tape v2 shares the Theater renderer: the exact recorded rope, field and
// weapon language, on the existing UI WebGL renderer. No simulation runs at boot.
import { decodeTape, TITLE_ATTRACT_TAPE_SCHEMA } from '../sim/titleAttractTape.js';
import { buildKillcamStage } from './killcamStage.js';
import { KILLCAM_TAPE_SCHEMA } from '../sim/killcamTape.js';
import { runtimeAssetUrl } from '../core/runtimeAssetUrl.js';

const TITLE_ATTRACT_TAPE_ASSET = 'src/sim/titleAttractTapeData.json';
const TITLE_ATTRACT_TAPE_TIMEOUT_MS = 15000;
let titleAttractTapeRequest = null;

export function resolveTitleAttractTapeUrl(options = {}) {
  return runtimeAssetUrl(TITLE_ATTRACT_TAPE_ASSET, options.moduleUrl || import.meta.url, options);
}

export function createTitleAttractTapeRequest({ fetchImpl, url, timeoutMs = TITLE_ATTRACT_TAPE_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Title attract tape fetch implementation is required');
  if (typeof url !== 'string' || !url) throw new TypeError('Title attract tape URL is required');
  let pending = null;
  return () => {
    if (!pending) {
      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs) : undefined;
      const options = { credentials: 'same-origin', ...(signal ? { signal } : {}) };
      pending = Promise.resolve().then(() => fetchImpl(url, options)).then(async (response) => {
        if (!response || response.ok !== true) {
          throw new Error(`Title attract tape request failed${response ? ` (${response.status})` : ''}`);
        }
        const tape = await response.json();
        if (!tape || tape.schema !== TITLE_ATTRACT_TAPE_SCHEMA || !Number.isSafeInteger(tape.seed)
          || !Number.isSafeInteger(tape.ticks) || typeof tape.bin !== 'string') {
          throw new Error('Title attract tape asset has an invalid schema');
        }
        return tape;
      }).catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
}

export function loadTitleAttractTape() {
  if (!titleAttractTapeRequest) {
    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      return Promise.reject(new Error('Title attract tape is not available without fetch'));
    }
    titleAttractTapeRequest = createTitleAttractTapeRequest({
      fetchImpl,
      url: resolveTitleAttractTapeUrl(),
    });
  }
  return titleAttractTapeRequest();
}

/** Authored impact size, or the flash-reduction cap while that cut is on. */
export function attractFlashSize(fullSize, flashReduced) {
  const full = Number.isFinite(fullSize) && fullSize > 0 ? fullSize : 7;
  return flashReduced ? Math.min(full, 1.6) : full;
}

export function attractPlaybackTape(encoded) {
  const tape = decodeTape(encoded), rate = tape.tickRate / tape.shipRate;
  const ships = tape.ships.map((ship) => ({
    type: 'ship', player: ship.team === 0, team: ship.team, visual: ship.visual,
    silhouette: ship.silhouette, radius: ship.radius,
    b: ship.born / tape.shipRate, end: (ship.died - 1) / tape.shipRate, d: -1, n: ship.n,
    x: Float32Array.from(ship.x, (v) => v / tape.quant.pos),
    z: Float32Array.from(ship.z, (v) => v / tape.quant.pos),
    r: Float32Array.from(ship.r, (v) => v / tape.quant.ang),
    vx: ship.vx, vz: ship.vz, wz: ship.wz,
  }));
  const rounds = [];
  for (let i = 0; i < tape.shots.count; i++) {
    const b = tape.shots.b[i], d = tape.shots.d[i], n = Math.max(1, Math.ceil((d - b) / tape.shipRate));
    const vx = tape.shots.vx[i] / tape.quant.vel, vz = tape.shots.vz[i] / tape.quant.vel;
    rounds.push({ b: b / tape.shipRate, n, team: tape.shots.t[i], weaponId: tape.shots.weapons[i],
      x: Float32Array.from({ length: n }, (_, j) => tape.shots.x[i] / tape.quant.pos + vx * j / rate),
      z: Float32Array.from({ length: n }, (_, j) => tape.shots.z[i] / tape.quant.pos + vz * j / rate) });
  }
  for (const g of tape.guided) {
    const n = Math.max(1, Math.ceil(g.n / tape.shipRate));
    rounds.push({ b: g.born / tape.shipRate, n, team: g.team, weaponId: g.weaponId,
      x: Float32Array.from({ length: n }, (_, j) => g.x[Math.min(g.n - 1, j * tape.shipRate)] / tape.quant.pos),
      z: Float32Array.from({ length: n }, (_, j) => g.z[Math.min(g.n - 1, j * tape.shipRate)] / tape.quant.pos) });
  }
  return { schema: KILLCAM_TAPE_SCHEMA, seed: tape.seed, sampleRate: rate,
    samples: tape.ticks / tape.shipRate, baseTick: 0, ships, rounds, forces: tape.forces,
    flashes: tape.events.filter((event) => event.kind === 'impact').map((event) => ({
      s: event.tick / tape.shipRate, x: event.x, z: event.z, size: 7,
    })) };
}

export async function buildTitleAttractStage(built, io, encodedTape = null) {
  const tape = attractPlaybackTape(encodedTape || await loadTitleAttractTape());
  const seconds = tape.samples / tape.sampleRate;
  // Keep the physical encounter on the free right side of the title's menu.
  const framing = { recorded: true, focus: { x: -145, z: 0 }, zoom: 380 };
  const control = { elapsed: 0, photo: { enabled: false }, cameraLease: { frameAt: () => framing } };
  const live = await buildKillcamStage(built, io, { tape, control });
  if (live.roots[0]) live.roots[0].name = 'UiStageAttract';
  let visibleStart = null;
  for (const flash of tape.flashes) flash.fullSize = flash.size;
  return { ...live, update(stage, dt, state) {
    // uiStage's clock already ran while assets compiled under the opaque plate.
    // The first visible catch must start here, rather than being skipped by loading.
    if (visibleStart == null) visibleStart = stage.clock;
    control.elapsed = (((stage.clock - visibleStart) % seconds) + seconds) % seconds;
    const settings = state && state.settings;
    const flashReduced = !!(settings && (
      (settings.accessibility && settings.accessibility.flashReduce)
      || (settings.video && settings.video.flashReduce)
    ));
    // Impact blooms on the title fight honour the same flash cut the flight view uses.
    // The authored size is kept so turning the cut off restores the bolt.
    for (const flash of tape.flashes) {
      const full = flash.fullSize || flash.size;
      flash.size = attractFlashSize(full, flashReduced);
    }
    live.update(stage, dt, state);
  } };
}
