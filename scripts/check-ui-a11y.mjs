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
];

let fail = 0;
for (const check of checks) {
  const src = await readFile(join(ROOT, check.path), 'utf8');
  const missing = check.needs.filter((needle) => !src.includes(needle));
  if (missing.length) {
    console.log(`FAIL ${check.path} - ${check.label}: missing ${missing.join(', ')}`);
    fail++;
  } else {
    console.log(`ok   ${check.path} - ${check.label}`);
  }
}

process.exit(fail ? 1 : 0);
