#!/usr/bin/env node
// PQ-033.03 — Steam depot build: an unpacked Windows directory build stamped as the Steam
// distribution, plus the SteamPipe build scripts rendered for it. `npm run dist` is untouched.
//
//   npm run dist:steam                     bundle, pack dist/steam/win-unpacked, render the VDFs
//   npm run dist:steam -- --skip-bundle    reuse build/web as it is
//   npm run dist:steam -- --dry-run        validate the config and render the VDFs only
//
// Steps:
//   1. read build/steam/steam.config.json (appId and the Windows depot id may stay blank for a local
//      build; the rendered VDFs then keep their placeholders and the upload line says so);
//   2. `node scripts/build-bundle.mjs` unless --skip-bundle or --dry-run;
//   3. electron-builder --win dir into dist/steam with extraMetadata.spacefaceDistribution = 'steam'
//      (the shell then skips the GitHub self-updater and arms Steam), publish never, and asarUnpack
//      for the optional steamworks.js binding when it is installed;
//   4. verify SpaceFace.exe, resources/app.asar, and the Steam stamp inside the packaged package.json;
//   5. render build/steam/output/app_build_<appId>.vdf and depot_build_<depotId>.vdf.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

export const STEAM_CONFIG_REL = 'build/steam/steam.config.json';
export const STEAM_TEMPLATE_DIR_REL = 'build/steam/scripts';
export const STEAM_OUTPUT_DIR_REL = 'build/steam/output';
export const STEAM_DIST_DIR_REL = 'dist/steam';
export const STEAM_UNPACKED_DIR_REL = 'dist/steam/win-unpacked';
const STEAM_ID_RE = /^[1-9][0-9]{0,9}$/;

export function readSteamConfig(root = ROOT) {
  const file = path.join(root, STEAM_CONFIG_REL);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const appId = String(raw.appId || '').trim();
  const depotWindows = String((raw.depots && raw.depots.windows) || '').trim();
  const issues = [];
  if (appId && !STEAM_ID_RE.test(appId)) issues.push(`appId "${appId}" is not a Steam app id`);
  if (depotWindows && !STEAM_ID_RE.test(depotWindows)) issues.push(`depots.windows "${depotWindows}" is not a Steam depot id`);
  const setLiveBranch = String(raw.setLiveBranch || '').trim();
  if (setLiveBranch && !/^[A-Za-z0-9_-]{1,64}$/.test(setLiveBranch)) issues.push(`setLiveBranch "${setLiveBranch}" is not a branch name`);
  if (/^default$/i.test(setLiveBranch)) issues.push('setLiveBranch cannot be "default": Steam never lets a build script set the default branch');
  return {
    appId,
    depotWindows,
    setLiveBranch,
    preview: raw.preview === true,
    buildDescription: String(raw.buildDescription || 'SpaceFace {version}'),
    ready: !!appId && !!depotWindows && issues.length === 0,
    issues,
  };
}

function vdfEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function renderSteamBuildScripts({ root = ROOT, config, contentRoot, buildOutput, version, build }) {
  const appId = config.appId || 'APPID';
  const depot = config.depotWindows || 'DEPOTID';
  const description = config.buildDescription.replace('{version}', version || '').replace('{build}', build || '');
  const values = {
    '{{APP_ID}}': appId,
    '{{DEPOT_ID_WINDOWS}}': depot,
    '{{DESCRIPTION}}': vdfEscape(description),
    '{{PREVIEW}}': config.preview ? '1' : '0',
    '{{SET_LIVE}}': vdfEscape(config.setLiveBranch || ''),
    '{{CONTENT_ROOT}}': vdfEscape(contentRoot),
    '{{BUILD_OUTPUT}}': vdfEscape(buildOutput),
  };
  const fill = (text) => Object.entries(values).reduce((out, [token, value]) => out.split(token).join(value), text);
  const appTemplate = readFileSync(path.join(root, STEAM_TEMPLATE_DIR_REL, 'app_build_APPID.vdf'), 'utf8');
  const depotTemplate = readFileSync(path.join(root, STEAM_TEMPLATE_DIR_REL, 'depot_build_DEPOTID.vdf'), 'utf8');
  return {
    appFile: `app_build_${appId}.vdf`,
    depotFile: `depot_build_${depot}.vdf`,
    app: fill(appTemplate),
    depot: fill(depotTemplate),
  };
}

function gitShortHead(root) {
  const run = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const out = String(run.stdout || '').trim();
  return /^[0-9a-f]{7,40}$/i.test(out) ? out : 'dev';
}

function steamworksInstalled(root) {
  try {
    require.resolve('steamworks.js', { paths: [root] });
    return true;
  } catch {
    return false;
  }
}

function readPackagedPackageJson(asarPath) {
  const asar = require(require.resolve('@electron/asar', { paths: [require.resolve('app-builder-lib', { paths: [ROOT] })] }));
  return JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'));
}

async function packSteamDirectory(root, { unpackSteamworks }) {
  const builder = require(require.resolve('electron-builder', { paths: [root] }));
  await builder.build({
    projectDir: root,
    targets: builder.Platform.WINDOWS.createTarget('dir', builder.Arch.x64),
    publish: 'never',
    config: {
      directories: { output: STEAM_DIST_DIR_REL },
      extraMetadata: { spacefaceDistribution: 'steam' },
      ...(unpackSteamworks ? { asarUnpack: ['node_modules/steamworks.js/**'] } : {}),
    },
  });
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const skipBundle = argv.includes('--skip-bundle') || dryRun;
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const config = readSteamConfig(ROOT);
  if (config.issues.length) {
    console.error('[dist:steam] steam.config.json problems:');
    for (const issue of config.issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }
  const unpackedDir = path.join(ROOT, STEAM_UNPACKED_DIR_REL);
  const outputDir = path.join(ROOT, STEAM_OUTPUT_DIR_REL);
  const hasSteamworks = steamworksInstalled(ROOT);
  console.log(`[dist:steam] SpaceFace ${pkg.version}; app ${config.appId || '(blank)'}; windows depot ${config.depotWindows || '(blank)'}; steamworks.js ${hasSteamworks ? 'installed (will be unpacked)' : 'not installed (Steam calls will report sdk-absent)'}`);

  if (!dryRun) {
    if (!skipBundle) {
      console.log('[dist:steam] building the release bundle (scripts/build-bundle.mjs)');
      const bundle = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-bundle.mjs')], { cwd: ROOT, stdio: 'inherit' });
      if (bundle.status !== 0) {
        console.error('[dist:steam] bundle build failed');
        process.exitCode = bundle.status || 1;
        return;
      }
    } else if (!existsSync(path.join(ROOT, 'build', 'web', 'index.html'))) {
      console.error('[dist:steam] --skip-bundle needs an existing build/web bundle');
      process.exitCode = 1;
      return;
    }
    console.log(`[dist:steam] packing the unpacked Windows directory build into ${STEAM_DIST_DIR_REL}`);
    await packSteamDirectory(ROOT, { unpackSteamworks: hasSteamworks });

    const exe = path.join(unpackedDir, `${(pkg.build && pkg.build.productName) || 'SpaceFace'}.exe`);
    const asarPath = path.join(unpackedDir, 'resources', 'app.asar');
    const missing = [exe, asarPath].filter((file) => !existsSync(file));
    if (missing.length) {
      console.error(`[dist:steam] the depot folder is incomplete: ${missing.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    const packaged = readPackagedPackageJson(asarPath);
    if (packaged.spacefaceDistribution !== 'steam') {
      console.error('[dist:steam] the packaged package.json is not stamped spacefaceDistribution=steam');
      process.exitCode = 1;
      return;
    }
    console.log(`[dist:steam] depot folder ok: ${path.relative(ROOT, exe)}, resources/app.asar, spacefaceDistribution=steam`);
  }

  const scripts = renderSteamBuildScripts({
    root: ROOT,
    config,
    contentRoot: unpackedDir,
    buildOutput: path.join(outputDir, 'logs'),
    version: pkg.version,
    build: gitShortHead(ROOT),
  });
  mkdirSync(path.join(outputDir, 'logs'), { recursive: true });
  writeFileSync(path.join(outputDir, scripts.appFile), scripts.app, 'utf8');
  writeFileSync(path.join(outputDir, scripts.depotFile), scripts.depot, 'utf8');
  console.log(`[dist:steam] wrote ${STEAM_OUTPUT_DIR_REL}/${scripts.appFile} and ${scripts.depotFile}`);
  if (config.ready) {
    console.log(`[dist:steam] upload: steamcmd +login <builder_account> +run_app_build "${path.join(outputDir, scripts.appFile)}" +quit`);
  } else {
    console.log('[dist:steam] upload needs the Steamworks App ID and Windows depot ID in build/steam/steam.config.json (see build/steam/README.md)');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error('[dist:steam] failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
