import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const MINIMUM_ELECTRON_HOST_NODE = '22.12.0';

export function inspectElectronRuntime({
  root = process.cwd(),
  env = process.env,
  platform = process.platform,
  resolvePackageJson,
  exists = existsSync,
  read = (file) => readFileSync(file, 'utf8'),
} = {}) {
  const packageJsonPath = resolveElectronPackageJson(root, resolvePackageJson);
  if (!packageJsonPath) {
    return {
      ready: false,
      code: 'electron-package-missing',
      packageJsonPath: null,
      packageRoot: null,
      packageVersion: null,
      installScript: null,
      runtimePath: null,
      runtimeRelativePath: null,
      runtimeVersion: null,
      failures: ['the electron npm package is not installed'],
    };
  }

  const packageRoot = path.dirname(packageJsonPath);
  const installScript = path.join(packageRoot, 'install.js');
  const pathFile = path.join(packageRoot, 'path.txt');
  const overrideDistPath = String(env.ELECTRON_OVERRIDE_DIST_PATH || '').trim();
  const distRoot = overrideDistPath ? path.resolve(overrideDistPath) : path.join(packageRoot, 'dist');
  const versionFile = path.join(distRoot, 'version');
  const projectPackageJsonPath = path.join(path.resolve(root), 'package.json');
  const failures = [];
  let packageJson = null;
  let declaredVersion = null;
  let runtimeRelativePath = null;
  let runtimeVersion = null;

  try {
    const projectPackageJson = JSON.parse(read(projectPackageJsonPath));
    declaredVersion = String(
      projectPackageJson?.devDependencies?.electron || projectPackageJson?.dependencies?.electron || '',
    );
  } catch (error) {
    failures.push(`could not read the project Electron declaration: ${error.message || error}`);
  }
  if (!declaredVersion) failures.push('project package.json does not declare Electron');

  try {
    packageJson = JSON.parse(read(packageJsonPath));
  } catch (error) {
    failures.push(`could not read Electron package metadata: ${error.message || error}`);
  }

  try {
    runtimeRelativePath = read(pathFile).trim();
  } catch {
    failures.push('Electron path.txt is missing');
  }
  if (!runtimeRelativePath && overrideDistPath) {
    runtimeRelativePath = defaultElectronExecutableName(platform);
  }
  if (!runtimeRelativePath) failures.push('Electron executable path is empty');

  try {
    runtimeVersion = read(versionFile).trim().replace(/^v/, '');
  } catch {
    failures.push(`Electron runtime version is missing from ${versionFile}`);
  }

  const packageVersion = String(packageJson?.version || '');
  if (!packageVersion) failures.push('Electron package version is missing');
  const packageVersionMismatch = !!(
    packageVersion && declaredVersion && packageVersion !== declaredVersion
  );
  if (packageVersionMismatch) {
    failures.push(`installed Electron package ${packageVersion} does not match package.json ${declaredVersion}`);
  }
  if (packageVersion && runtimeVersion && packageVersion !== runtimeVersion) {
    failures.push(`Electron runtime ${runtimeVersion} does not match package ${packageVersion}`);
  }

  const runtimePath = runtimeRelativePath ? path.resolve(distRoot, runtimeRelativePath) : null;
  if (runtimePath && !exists(runtimePath)) failures.push(`Electron executable is missing at ${runtimePath}`);
  if (!exists(installScript)) failures.push(`Electron installer is missing at ${installScript}`);

  return {
    ready: failures.length === 0,
    code: failures.length === 0
      ? 'ready'
      : packageVersionMismatch ? 'electron-package-version-mismatch' : 'electron-runtime-missing',
    packageJsonPath,
    packageRoot,
    packageVersion: packageVersion || null,
    declaredVersion: declaredVersion || null,
    installScript,
    overrideDistPath: overrideDistPath || null,
    runtimePath,
    runtimeRelativePath,
    runtimeVersion,
    failures,
  };
}

export function provisionElectronRuntime({
  root = process.cwd(),
  env = process.env,
  nodeVersion = process.versions.node,
  spawnSyncImpl = spawnSync,
  inspect = inspectElectronRuntime,
} = {}) {
  if (!isNodeVersionAtLeast(nodeVersion, MINIMUM_ELECTRON_HOST_NODE)) {
    throw provisioningError(
      'electron-host-node-unsupported',
      `Electron 43 tooling requires Node ${MINIMUM_ELECTRON_HOST_NODE} or newer; current Node is ${nodeVersion || 'unknown'}`,
    );
  }

  let inspection = inspect({ root, env });
  if (!inspection.packageJsonPath) {
    throw provisioningError(
      inspection.code,
      'Electron is not installed. Run npm install, then launch SpaceFace again.',
    );
  }
  if (inspection.code === 'electron-package-version-mismatch') {
    throw provisioningError(
      inspection.code,
      `Installed Electron ${inspection.packageVersion || 'unknown'} does not match package.json ${inspection.declaredVersion || 'unknown'}. Run npm install, then launch SpaceFace again.`,
    );
  }
  if (inspection.ready) return { ...inspection, provisioned: false };
  if (inspection.overrideDistPath) {
    throw provisioningError(
      'electron-override-runtime-invalid',
      `ELECTRON_OVERRIDE_DIST_PATH does not contain a complete Electron ${inspection.packageVersion || ''} runtime: ${inspection.failures.join('; ')}`,
    );
  }
  if (!inspection.installScript || !existsSync(inspection.installScript)) {
    throw provisioningError(
      'electron-installer-missing',
      `Electron's explicit installer is unavailable: ${inspection.installScript || 'unknown path'}`,
    );
  }

  console.log(`[electron-launcher] provisioning Electron ${inspection.packageVersion || ''} runtime...`);
  const result = spawnSyncImpl(process.execPath, [inspection.installScript], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (result?.error) {
    throw provisioningError(
      'electron-provision-spawn-failed',
      `Electron runtime provisioning could not start: ${result.error.message || result.error}`,
      { cause: result.error },
    );
  }
  if (!result || result.status !== 0) {
    const exitCode = Number.isInteger(result?.status) ? result.status : 1;
    throw provisioningError(
      'electron-provision-failed',
      `Electron runtime provisioning failed${result?.signal ? ` with signal ${result.signal}` : ` with exit code ${exitCode}`}.`,
      { exitCode },
    );
  }

  inspection = inspect({ root, env });
  if (!inspection.ready) {
    throw provisioningError(
      'electron-provision-incomplete',
      `Electron installer exited successfully but the runtime is incomplete: ${inspection.failures.join('; ')}`,
    );
  }
  return { ...inspection, provisioned: true };
}

export function isNodeVersionAtLeast(actual, minimum) {
  const actualParts = parseVersion(actual);
  const minimumParts = parseVersion(minimum);
  if (!actualParts || !minimumParts) return false;
  for (let index = 0; index < 3; index++) {
    if (actualParts[index] > minimumParts[index]) return true;
    if (actualParts[index] < minimumParts[index]) return false;
  }
  return true;
}

function resolveElectronPackageJson(root, resolver) {
  try {
    if (typeof resolver === 'function') return resolver(root);
    const requireFromRoot = createRequire(path.join(path.resolve(root), 'package.json'));
    return requireFromRoot.resolve('electron/package.json');
  } catch {
    return null;
  }
}

function defaultElectronExecutableName(platform) {
  if (platform === 'win32') return 'electron.exe';
  if (platform === 'darwin') return 'Electron.app/Contents/MacOS/Electron';
  return 'electron';
}

function parseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function provisioningError(code, message, extras = {}) {
  return Object.assign(new Error(message), { code, ...extras });
}
