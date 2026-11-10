// PQ-033.01 auto-update: electron-updater wired on the packaged desktop route only.
// Dev and isolated-evidence launches never touch an update feed; a missing or broken
// electron-updater module fails closed into a receipt, never into startup failure.
// The feed itself is declared by the build.publish block in package.json (app-update.yml
// is generated into the package by electron-builder).
'use strict';

function loadUpdaterModule() {
  try {
    return require('electron-updater');
  } catch (_) {
    return null;
  }
}

function reporter(receipt) {
  return typeof receipt === 'function' ? receipt : () => {};
}

function configureAutoUpdate({
  appApi,
  receipt,
  dialogApi,
  browserWindowApi,
  updaterModule,
  loadUpdater = loadUpdaterModule,
  checkForUpdates = true,
} = {}) {
  const log = reporter(receipt);
  const packaged = !!(appApi && appApi.isPackaged === true);
  if (!packaged) {
    return Object.freeze({ enabled: false, reason: 'unpackaged' });
  }

  const loaded = updaterModule !== undefined ? updaterModule : loadUpdater();
  const autoUpdater = loaded && loaded.autoUpdater;
  if (!autoUpdater || typeof autoUpdater.checkForUpdates !== 'function') {
    log('update-unavailable', { reason: 'electron-updater module missing' });
    return Object.freeze({ enabled: false, reason: 'module-missing' });
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => log('update-checking', {}));
  autoUpdater.on('update-available', (info) => log('update-available', {
    version: info && info.version ? String(info.version) : '',
  }));
  autoUpdater.on('update-not-available', (info) => log('update-not-available', {
    version: info && info.version ? String(info.version) : '',
  }));
  autoUpdater.on('download-progress', (progress) => log('update-download-progress', {
    percent: progress && Number.isFinite(progress.percent) ? Math.round(progress.percent) : null,
    bytesPerSecond: progress && Number.isFinite(progress.bytesPerSecond)
      ? Math.round(progress.bytesPerSecond) : null,
  }));
  autoUpdater.on('error', (error) => log('update-error', {
    message: error && error.message ? String(error.message).slice(0, 500) : String(error || ''),
  }));
  autoUpdater.on('update-downloaded', (info) => {
    const version = info && info.version ? String(info.version) : '';
    log('update-downloaded', { version });
    promptRestartToInstall({ dialogApi, browserWindowApi, autoUpdater, version, log });
  });

  if (checkForUpdates) {
    Promise.resolve()
      .then(() => autoUpdater.checkForUpdates())
      .catch((error) => log('update-check-failed', {
        message: error && error.message ? String(error.message).slice(0, 500) : String(error || ''),
      }));
  }
  return Object.freeze({ enabled: true, autoDownload: true, autoInstallOnAppQuit: true });
}

// A downloaded update applies two ways: the player picks Restart, or — if they pick Later or the
// dialog itself cannot run — autoInstallOnAppQuit applies it at the next normal exit.
async function promptRestartToInstall({ dialogApi, browserWindowApi, autoUpdater, version, log }) {
  const tell = typeof log === 'function' ? log : () => {};
  if (!dialogApi || typeof dialogApi.showMessageBox !== 'function'
    || !autoUpdater || typeof autoUpdater.quitAndInstall !== 'function') {
    tell('update-prompt-skipped', { version, reason: 'no-dialog-or-install' });
    return;
  }
  try {
    // The game window is fullscreen — an unparented prompt can render behind it and never be seen.
    const parent = browserWindowApi && typeof browserWindowApi.getAllWindows === 'function'
      ? browserWindowApi.getAllWindows()[0]
      : null;
    const picked = await dialogApi.showMessageBox(parent || undefined, {
      type: 'info',
      title: 'Update ready',
      message: 'SpaceFace ' + (version || 'update') + ' is ready to install.',
      detail: 'Restart now to apply it, or it will install the next time the game closes.',
      buttons: ['Restart', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (picked && picked.response === 0) {
      tell('update-install-requested', { version });
      autoUpdater.quitAndInstall();
    } else {
      tell('update-install-deferred', { version });
    }
  } catch (error) {
    tell('update-prompt-failed', {
      message: error && error.message ? String(error.message).slice(0, 500) : String(error || ''),
    });
  }
}

module.exports = { configureAutoUpdate, loadUpdaterModule, promptRestartToInstall };
