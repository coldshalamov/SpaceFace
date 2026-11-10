import { existsSync } from 'node:fs';
import path from 'node:path';

const PLAYER_PORT = 41788;
const FAILURE_RECEIPTS = new Set([
  'asset-preload-failed',
  'package-invalid',
  'navigation-failed',
  'port-conflict',
  'startup-failed',
]);

export function resolvePackagedStartupReportPath({ root, requested = null } = {}) {
  const repoRoot = path.resolve(String(root || '.'));
  const reportPath = requested
    ? path.resolve(repoRoot, String(requested))
    : path.join(repoRoot, '.devshots', 'electron-packaged-startup', 'report.json');
  const relative = path.relative(repoRoot, reportPath);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('packaged-startup report path must stay inside the repository');
  }
  if (path.extname(reportPath).toLowerCase() !== '.json') {
    throw new Error('packaged-startup report path must end in .json');
  }
  return reportPath;
}

export function resolvePackagedElectronLayout({
  root,
  platform = process.platform,
  exists = existsSync,
} = {}) {
  const repoRoot = path.resolve(String(root || '.'));
  const failures = [];
  let unpackRoot;
  let executablePath;
  let resourcesPath;

  if (platform === 'win32') {
    unpackRoot = path.join(repoRoot, 'dist', 'win-unpacked');
    executablePath = path.join(unpackRoot, 'SpaceFace.exe');
    resourcesPath = path.join(unpackRoot, 'resources');
  } else if (platform === 'darwin') {
    unpackRoot = path.join(repoRoot, 'dist', 'mac', 'SpaceFace.app');
    executablePath = path.join(unpackRoot, 'Contents', 'MacOS', 'SpaceFace');
    resourcesPath = path.join(unpackRoot, 'Contents', 'Resources');
  } else if (platform === 'linux') {
    unpackRoot = path.join(repoRoot, 'dist', 'linux-unpacked');
    executablePath = path.join(unpackRoot, 'spaceface');
    resourcesPath = path.join(unpackRoot, 'resources');
  } else {
    failures.push(`unsupported packaged Electron platform ${platform}`);
    unpackRoot = path.join(repoRoot, 'dist');
    executablePath = '';
    resourcesPath = '';
  }

  const appArchivePath = resourcesPath ? path.join(resourcesPath, 'app.asar') : '';
  if (executablePath && !exists(executablePath)) failures.push(`packaged executable is missing: ${executablePath}`);
  if (appArchivePath && !exists(appArchivePath)) failures.push(`packaged app archive is missing: ${appArchivePath}`);

  return {
    platform,
    repoRoot,
    unpackRoot,
    executablePath,
    resourcesPath,
    appArchivePath,
    failures,
  };
}

export function inspectPackagedStartup({
  layout,
  rootUrl,
  userDataDir,
  receipts = [],
  mainIdentity,
  page,
} = {}) {
  const failures = [...(layout?.failures || [])];
  const launchReceipts = Array.isArray(receipts) ? receipts : [];
  const startingReceipts = launchReceipts.filter((entry) => entry?.status === 'starting');
  const serverReceipts = launchReceipts.filter((entry) => entry?.status === 'server-ready');
  const readyReceipts = launchReceipts.filter((entry) => entry?.status === 'window-ready');
  const fatalReceipts = launchReceipts.filter((entry) => FAILURE_RECEIPTS.has(entry?.status));

  if (startingReceipts.length !== 1) failures.push(`expected one starting receipt, got ${startingReceipts.length}`);
  if (serverReceipts.length !== 1) failures.push(`expected one server-ready receipt, got ${serverReceipts.length}`);
  if (readyReceipts.length !== 1) failures.push(`expected one window-ready receipt, got ${readyReceipts.length}`);
  if (fatalReceipts.length) failures.push(`packaged startup emitted failure receipt(s): ${fatalReceipts.map((entry) => entry.status).join(', ')}`);

  const parsedRoot = inspectRootUrl(rootUrl, failures);
  const starting = startingReceipts[0];
  const server = serverReceipts[0];
  if (starting?.isolatedEvidence !== true) failures.push('starting receipt must prove isolated evidence mode');
  if (server?.isolatedEvidence !== true) failures.push('server-ready receipt must prove isolated evidence mode');
  if (Number(server?.requestedPort) !== 0) failures.push('packaged startup must request an ephemeral non-player port');
  if (parsedRoot && Number(server?.port) !== parsedRoot.port) failures.push('server-ready port does not match the live root URL');

  inspectIdentity('starting receipt', starting?.runtime, layout, userDataDir, failures);
  inspectIdentity('main process', mainIdentity, layout, userDataDir, failures);
  if (!samePath(mainIdentity?.appPath, layout?.appArchivePath)) {
    failures.push('main process app path does not match the exact packaged app.asar');
  }

  if (page?.rootUrl !== rootUrl) failures.push('page root URL does not match the tracked packaged root');
  if (page?.title !== 'SpaceFace') failures.push(`packaged title must be SpaceFace, got ${page?.title || 'missing'}`);
  if (page?.newGameVisibleBeforeLaunch !== true) failures.push('packaged Main Menu did not expose New Game');
  if (page?.defaultRouteReady !== true) failures.push('packaged default route did not reach playable flight');
  if (page?.assetFailureVisible !== false) failures.push('packaged route exposed the authored asset failure surface');
  if (page?.storageRoundTrip !== true) failures.push('packaged isolated local storage was not writable');
  if (Number(page?.hardErrorCount) !== 0) failures.push(`packaged route reported ${page?.hardErrorCount ?? 'unknown'} hard page errors`);
  if (!/\bElectron\/\d+/i.test(String(page?.userAgent || ''))) failures.push('packaged page user agent does not identify Electron');

  const scriptPaths = Array.isArray(page?.scriptPaths) ? page.scriptPaths : [];
  const scriptPathnames = scriptPaths.map(urlPathname).filter(Boolean);
  if (!scriptPathnames.includes('/main.js')) failures.push('packaged route did not load the production /main.js entrypoint');
  if (scriptPathnames.some((pathname) => pathname.startsWith('/src/'))) {
    failures.push('packaged route loaded a source entrypoint');
  }

  return {
    schema: 'spaceface.electronPackagedStartupAssessment.v1',
    pass: failures.length === 0,
    failures,
    receiptCount: launchReceipts.length,
    rootUrl: parsedRoot?.href || null,
    listenerPort: parsedRoot?.port || null,
  };
}

function inspectIdentity(label, identity, layout, userDataDir, failures) {
  if (!identity || typeof identity !== 'object') {
    failures.push(`${label} identity is missing`);
    return;
  }
  if (identity.packaged !== true) failures.push(`${label} must report app.isPackaged=true`);
  if (!samePath(identity.executablePath, layout?.executablePath)) {
    failures.push(`${label} executable path does not match the exact generated package`);
  }
  if (!samePath(identity.resourcesPath, layout?.resourcesPath)) {
    failures.push(`${label} resources path does not match the exact generated package`);
  }
  if (!samePath(identity.userDataPath, userDataDir)) {
    failures.push(`${label} user-data path does not match the owned isolated profile`);
  }
}

function inspectRootUrl(rootUrl, failures) {
  try {
    const url = new URL(String(rootUrl || ''));
    const port = Number(url.port);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/'
      || url.search || url.hash || !Number.isInteger(port) || port <= 0 || port === PLAYER_PORT) {
      failures.push(`packaged root must be the clean isolated loopback route, got ${url.href}`);
    }
    return { href: url.href, port };
  } catch {
    failures.push(`packaged root URL is invalid: ${rootUrl || 'missing'}`);
    return null;
  }
}

function samePath(left, right) {
  if (!left || !right) return false;
  const normalize = (value) => {
    const resolved = path.resolve(String(value));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function urlPathname(value) {
  try { return new URL(String(value || '')).pathname; }
  catch { return null; }
}
