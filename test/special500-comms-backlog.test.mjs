import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';
import { acquireVisualProbeServer } from '../scripts/lib/visualProbeServer.mjs';
import { discoveryCommsPayload } from '../src/ui/comms.js';
import { commsToastSpec } from '../src/ui/floatingText.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const browserPaths = process.platform === 'win32'
  ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

test('special500 uses backlog only and preserves full speaker and text', () => {
  const text = 'The storm chapel reads the season’s liturgy. '.repeat(8);
  const item = { kind: 'special500', speaker: 'Storm chapel', text };
  assert.deepEqual(discoveryCommsPayload(item), { sender: 'Storm chapel', text, category: 'ambient', logOnly: true });
  assert.equal(commsToastSpec(item), null);
  assert.equal(discoveryCommsPayload({ kind: 'special500', text: ' ' }), null);
  assert.deepEqual(discoveryCommsPayload({ kind: 'machine', speaker: 'Dock', text: 'Cycle complete.' }),
    { sender: 'Dock', text: 'Cycle complete.', category: 'machine' });
  assert.equal(discoveryCommsPayload({ kind: 'cargo', speaker: 'Dock', text: 'Fuel delivered.' }), null);
  assert.match(commsToastSpec({ kind: 'cargo', speaker: 'Dock', text: 'Fuel delivered.' }).text, /DOCK: Fuel delivered/);
});

test('real Comms keeps atmospheric lines readable and unread while ordinary receipts remain live', { timeout: 45000 }, async t => {
  const executablePath = browserPaths.find(existsSync);
  if (!executablePath) { t.skip('No system Chrome or Chromium installed'); return; }
  const server = await acquireVisualProbeServer({ root: ROOT });
  let browser;
  try {
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true, executablePath,
      args: ['--disable-gpu', '--no-first-run', '--disable-extensions'] });
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.goto(`${server.baseUrl}/test/recovery-encounter-prompt-fixture.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.sfRecoveryFixture);
    const result = await page.evaluate(async () => {
      const fixture = window.sfRecoveryFixture;
      fixture.mountComms();
      const { bindCommsLogToasts } = await import('/src/ui/floatingText.js');
      const off = bindCommsLogToasts(fixture.bus);
      fixture.state.onboarding = { active: true, finished: false };
      const longText = 'The storm chapel reads the season’s liturgy. '.repeat(8);
      fixture.bus.emit('comms:log', { kind: 'special500', from: 'Storm chapel', text: longText });
      fixture.bus.emit('comms:log', { kind: 'special500', speaker: 'Storm desk', text: 'May your storms be old ones.' });
      fixture.bus.emit('comms:log', { kind: 'cargo', speaker: 'Cargo desk', text: 'Fuel delivered.' });
      const button = document.getElementById('sf-comm-backlog-btn');
      const unreadBeforeOpen = button.classList.contains('sf-comm-backlog-btn--pulse');
      const liveBeforeOpen = document.querySelectorAll('#sf-comms .sf-comm').length;
      const receipts = fixture.emitted.filter(row => row.name === 'toast').map(row => row.payload.text);
      fixture.bus.emit('ui:toggleComms');
      const backlog = document.querySelector('.sf-comm-backlog__list');
      const rows = [...backlog.querySelectorAll('.sf-comm-backlog__row')].map(row => ({
        sender: row.querySelector('.sf-comm-backlog__sender').textContent,
        text: row.querySelector('.sf-comm-backlog__text').textContent,
      }));
      const open = document.getElementById('sf-comm-backlog').classList.contains('open');
      const unreadAfterOpen = button.classList.contains('sf-comm-backlog-btn--pulse');
      fixture.bus.emit('comms:log', { kind: 'special500', from: 'Storm shift', text: 'The next line.' });
      const liveWhileOpen = backlog.querySelectorAll('.sf-comm-backlog__row').length;
      const latest = backlog.querySelector('.sf-comm-backlog__sender')?.textContent;
      if (typeof off === 'function') off();
      fixture.destroyComms();
      return { longText, unreadBeforeOpen, liveBeforeOpen, receipts, rows, open, unreadAfterOpen, liveWhileOpen, latest,
        removed: !document.getElementById('sf-comm-backlog-btn') };
    });
    assert.equal(result.unreadBeforeOpen, true);
    assert.equal(result.liveBeforeOpen, 0);
    assert.deepEqual(result.receipts, ['CARGO DESK: Fuel delivered.']);
    assert.equal(result.open, true);
    assert.equal(result.unreadAfterOpen, false);
    assert.deepEqual(result.rows, [
      { sender: 'Storm desk', text: 'May your storms be old ones.' },
      { sender: 'Storm chapel', text: result.longText },
    ]);
    assert.equal(result.liveWhileOpen, 3);
    assert.equal(result.latest, 'Storm shift');
    assert.equal(result.removed, true);
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
});
