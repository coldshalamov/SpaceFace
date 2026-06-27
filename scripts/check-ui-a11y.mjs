// Guards browser-facing accessibility contracts that static import checks cannot see:
// modal/menu screens must hide the flight HUD from assistive tech, and the death banner must
// not exist in the readable HUD tree until an actual player death event.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const checks = [
  {
    path: 'src/ui/screenManager.js',
    label: 'modal HUD accessibility state',
    needs: [
      'function syncHudAccessibility',
      'function hasScreen',
      'isOpen, hasScreen',
      "state.mode !== 'flight'",
      "hud.setAttribute('aria-hidden', 'true')",
      "hud.removeAttribute('aria-hidden')",
      'hud.inert = hidden',
    ],
  },
  {
    path: 'src/ui/hud.js',
    label: 'death banner hidden until death event',
    needs: [
      'deathBanner.hidden = true',
      "deathBanner.setAttribute('aria-hidden', 'true')",
      "deathBanner.setAttribute('role', 'alert')",
      '.sf-death[hidden]',
      'deathBanner.hidden = false',
      "deathBanner.removeAttribute('aria-hidden')",
      'deathHideTimer = setTimeout',
    ],
  },
  {
    path: 'src/ui/confirm.js',
    label: 'confirm dialog preserves underlying modal state',
    needs: [
      'hadModalOpen',
      'if (!hadModalOpen) document.body.classList.remove',
      '_sfConfirmToken',
      'root.removeEventListener',
    ],
  },
  {
    path: 'src/ui/listControls.js',
    label: 'sortable headers are keyboard controls',
    needs: [
      "document.createElement('button')",
      "btn.type = 'button'",
      "btn.setAttribute('aria-pressed'",
      "btn.setAttribute('aria-label'",
      'sortHeaderAria',
      '.sf-sort:focus-visible',
    ],
  },
  {
    path: 'src/ui/accessibility.js',
    label: 'accessibility schema reflects shipped settings',
    needs: [
      'Settings fields exposed by Settings > Access and Settings > Video',
      "status: 'EXISTS'",
      'min: 0.75, max: 2',
      "help: 'Scales the HUD and menus for readability.'",
    ],
    forbids: [
      'Task spec',
      'task requirement',
      'lead adds',
      'must be reconciled by the lead',
      'DO NOT add a second toggle',
    ],
  },
];

let fail = 0;
for (const check of checks) {
  const src = await readFile(join(ROOT, check.path), 'utf8');
  const missing = check.needs.filter((needle) => !src.includes(needle));
  const forbidden = (check.forbids || []).filter((needle) => src.includes(needle));
  if (missing.length || forbidden.length) {
    const reasons = [];
    if (missing.length) reasons.push(`missing ${missing.join(', ')}`);
    if (forbidden.length) reasons.push(`forbidden ${forbidden.join(', ')}`);
    console.log(`FAIL ${check.path} - ${check.label}: ${reasons.join('; ')}`);
    fail++;
  } else {
    console.log(`ok   ${check.path} - ${check.label}`);
  }
}

process.exit(fail ? 1 : 0);
