import { CREDITS } from '../data/credits.js';

/** Version/build identity shared by title, pause and failure reporting. */
export function leftoverVersionToken(payload) {
  if (!payload || typeof payload.version !== 'string') return '';
  return payload.version.trim();
}

export function leftoverBuildToken(payload) {
  if (!payload || typeof payload.build !== 'string') return '';
  return payload.build.trim();
}

/** The diagnostic identity includes the release hash when the host has one. */
export function leftoverVersionLabel(payload) {
  const version = leftoverVersionToken(payload);
  if (!version) return 'SpaceFace';
  const build = leftoverBuildToken(payload);
  return 'SpaceFace v' + version + (build ? ' · ' + build : '');
}

/** Player-facing version line. The build hash remains available in its title attribute. */
export function leftoverVersionDisplay(payload) {
  const version = leftoverVersionToken(payload);
  if (!version) return 'SpaceFace';
  return 'SpaceFace v' + version;
}

export function applyLeftoverVersionText(target, payload) {
  if (!target) return '';
  const version = leftoverVersionToken(payload);
  if (!version) return target.textContent || '';
  const label = leftoverVersionDisplay(payload);
  target.textContent = label;
  target.title = leftoverVersionLabel(payload);
  return label;
}

const RELEASE_RECEIPT_URL = 'spaceface-release-build.json';
let versionPayloadPromise = null;

/** Test seam: the resolved payload is session-cached so screens never refetch per mount. */
export function resetLeftoverVersionCache() {
  versionPayloadPromise = null;
}

export function loadLeftoverVersionPayload() {
  if (!versionPayloadPromise) versionPayloadPromise = resolveLeftoverVersionPayload();
  return versionPayloadPromise;
}

async function resolveLeftoverVersionPayload() {
  const base = { version: leftoverVersionToken(CREDITS), build: '' };
  try {
    const shell = globalThis.window && globalThis.window.spacefaceShell;
    if (shell && typeof shell.buildInfo === 'function') {
      const info = await shell.buildInfo();
      const build = leftoverBuildToken(info);
      if (build) return { version: leftoverVersionToken(info) || base.version, build: build.slice(0, 32) };
    }
  } catch (e) {}
  try {
    if (typeof fetch === 'function') {
      // Keep this document-root-relative: packaged builds serve the receipt beside index.html.
      // import.meta.url would resolve under /src/ui and change the packaged lookup path.
      const res = await fetch(RELEASE_RECEIPT_URL, { cache: 'no-store' });
      if (res && res.ok) {
        const receiptData = await res.json();
        const digest = receiptData && receiptData.output && receiptData.output.digest;
        if (typeof digest === 'string' && /^[0-9a-f]{16,64}$/i.test(digest)) {
          return { ...base, build: digest.slice(0, 12) };
        }
      }
    }
  } catch (e) {}
  return base;
}

export function paintLeftoverVersion(target, stillCurrent) {
  if (!target) return Promise.resolve('');
  return loadLeftoverVersionPayload().then((payload) => {
    if (typeof stillCurrent === 'function' && !stillCurrent(target)) return '';
    return applyLeftoverVersionText(target, payload);
  });
}
