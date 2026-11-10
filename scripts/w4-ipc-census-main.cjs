// W4 lane probe: instrumented Electron main-process entry for the IPC census.
// Wraps ipcMain.on/handle and every WebContents' outgoing send surface BEFORE the real
// shell loads, so every message crossing the process boundary is counted + timed.
// The real shell then installs itself onto the patched surfaces unchanged.
// Counters live on globalThis.__w4IpcCensus for the Playwright driver to read via
// electronApp.evaluate. No shipped module is modified.
const electron = require('electron');
const { app, ipcMain } = electron;

const census = {
  startedAt: new Date().toISOString(),
  // renderer -> main: ipcRenderer.send channel -> {count, totalMs, maxMs}
  sendRx: Object.create(null),
  // renderer -> main: ipcRenderer.invoke channel -> {count, totalMs, maxMs} (handler wall time)
  invokeRx: Object.create(null),
  // main -> renderer: webContents.send channel -> {count}
  sendTx: Object.create(null),
  // any other webContents send-family method observed -> {count}
  sendTxOther: Object.create(null),
};

function bump(table, key) {
  const cell = table[key] || (table[key] = { count: 0, totalMs: 0, maxMs: 0 });
  cell.count += 1;
  return cell;
}

const origOn = ipcMain.on.bind(ipcMain);
ipcMain.on = function patchedOn(channel, listener) {
  return origOn(channel, function wrappedListener(...args) {
    const cell = bump(census.sendRx, String(channel));
    const t0 = performance.now();
    try {
      return listener.apply(this, args);
    } finally {
      const ms = performance.now() - t0;
      cell.totalMs += ms;
      if (ms > cell.maxMs) cell.maxMs = ms;
    }
  });
};

const origHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function patchedHandle(channel, handler) {
  return origHandle(channel, async function wrappedHandler(...args) {
    const cell = bump(census.invokeRx, String(channel));
    const t0 = performance.now();
    try {
      return await handler.apply(this, args);
    } finally {
      const ms = performance.now() - t0;
      cell.totalMs += ms;
      if (ms > cell.maxMs) cell.maxMs = ms;
    }
  });
};

app.on('web-contents-created', (_event, contents) => {
  for (const method of ['send', 'sendToFrame', 'postMessage']) {
    const orig = typeof contents[method] === 'function' ? contents[method].bind(contents) : null;
    if (!orig) continue;
    contents[method] = function patchedSend(channel, ...args) {
      const table = method === 'send' ? census.sendTx : census.sendTxOther;
      bump(table, `${method}:${String(channel)}`);
      return orig(channel, ...args);
    };
  }
});

globalThis.__w4IpcCensus = census;

// Delegate to the real shell — identical launch path, handlers land on the patches above.
require('../electron/main.cjs');
