#!/usr/bin/env node
// check-confirm-dialog-safety.mjs - runtime guard for shared destructive confirmation behavior.
//
// The shared confirm modal gates save replacement, loading, selling, quitting, and route purchases.
// Keyboard/controller-style activation must make the safe choice the easiest path for danger
// dialogs, while ordinary confirmations can still default to the affirmative action.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('ui-root'), null, { timeout: 15000 });

  const dangerOpen = await openConfirm(page, {
    title: 'Delete save?',
    body: 'This permanently replaces the current run context.',
    confirmLabel: 'Delete',
    danger: true,
  });
  assert.equal(dangerOpen.open, true, 'danger confirm should be open');
  assert.equal(dangerOpen.role, 'dialog', 'confirm must expose role=dialog');
  assert.equal(dangerOpen.modal, 'true', 'confirm must expose aria-modal=true');
  assert.equal(dangerOpen.labelledBy, 'sf-confirm-title', 'confirm must point at its title');
  assert.equal(dangerOpen.describedBy, 'sf-confirm-body', 'confirm must point at its body');
  assert.equal(dangerOpen.bodyModalOpen, true, 'confirm should set the shared modal-open body class');
  assert.equal(dangerOpen.activeRole, 'cancel', 'danger confirm should focus Cancel by default');

  await page.keyboard.press('Enter');
  const dangerEnter = await waitForConfirmResult(page);
  assert.equal(dangerEnter.result, false, 'Enter on default-focused danger confirm must cancel, not commit');
  assert.equal(dangerEnter.focusRestored, true, 'confirm should restore focus to the opener after cancel');

  const normalOpen = await openConfirm(page, {
    title: 'Buy route load?',
    body: 'Load cargo and set navigation.',
    confirmLabel: 'Buy',
    danger: false,
  });
  assert.equal(normalOpen.open, true, 'normal confirm should be open');
  assert.equal(normalOpen.activeRole, 'ok', 'non-danger confirm can focus the affirmative action');

  await page.keyboard.press('Enter');
  const normalEnter = await waitForConfirmResult(page);
  assert.equal(normalEnter.result, true, 'Enter on default-focused non-danger confirm should commit');

  const tabOpen = await openConfirm(page, {
    title: 'Abandon mission?',
    body: 'The contract will return to the board.',
    confirmLabel: 'Abandon',
    danger: true,
  });
  assert.equal(tabOpen.activeRole, 'cancel', 'danger confirm should start on Cancel before tab cycling');

  await page.keyboard.press('Tab');
  const afterTab = await focusedConfirmRole(page);
  assert.equal(afterTab, 'ok', 'Tab should move focus from Cancel to Confirm');
  await page.keyboard.press('Enter');
  const tabEnter = await waitForConfirmResult(page);
  assert.equal(tabEnter.result, true, 'Enter should commit only after focus moves to Confirm');

  assert.deepEqual(issues.errorIssues(), [], 'confirm safety probe should not record page errors');
  console.log('Confirm dialog safety OK - danger dialogs default to Cancel and Enter follows focused button intent.');
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function openConfirm(page, opts) {
  return page.evaluate(async (confirmOpts) => {
    const opener = document.getElementById('sf-confirm-probe-opener') || document.createElement('button');
    opener.id = 'sf-confirm-probe-opener';
    opener.textContent = 'Probe opener';
    if (!opener.isConnected) document.body.appendChild(opener);
    opener.focus();

    const mod = await import('/src/ui/confirm.js');
    window.__sfConfirmResult = 'pending';
    mod.confirm(confirmOpts).then((value) => { window.__sfConfirmResult = value; });

    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 180));

    const dialog = document.querySelector('#sf-confirm-root .sf-confirm');
    const active = document.activeElement;
    return {
      open: !!(dialog && mod.isConfirmOpen()),
      role: dialog && dialog.getAttribute('role'),
      modal: dialog && dialog.getAttribute('aria-modal'),
      labelledBy: dialog && dialog.getAttribute('aria-labelledby'),
      describedBy: dialog && dialog.getAttribute('aria-describedby'),
      bodyModalOpen: document.body.classList.contains('ui-modal-open'),
      activeRole: active && active.classList && active.classList.contains('sf-confirm__cancel') ? 'cancel'
        : active && active.classList && active.classList.contains('sf-confirm__ok') ? 'ok'
          : active && active.id || null,
      activeTag: active && active.tagName || null,
      activeText: active && (active.textContent || '').trim() || '',
      activeClass: active && active.className || '',
    };
  }, opts);
}

async function waitForConfirmResult(page) {
  await page.waitForFunction(() => window.__sfConfirmResult !== 'pending', null, { timeout: 5000 });
  await page.waitForTimeout(220);
  return page.evaluate(() => ({
    result: window.__sfConfirmResult,
    focusRestored: document.activeElement && document.activeElement.id === 'sf-confirm-probe-opener',
    dialogOpen: !!document.querySelector('#sf-confirm-root .sf-confirm'),
  }));
}

async function focusedConfirmRole(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('sf-confirm__cancel')) return 'cancel';
    if (active && active.classList && active.classList.contains('sf-confirm__ok')) return 'ok';
    return active && active.id || null;
  });
}

async function startFreshServer() {
  const port = await findFreePort(8170);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for confirm dialog safety check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}
