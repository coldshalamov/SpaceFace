# FB-106 — The desktop shell remembers window bounds and mode, and Settings has a window-mode row

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: main.cjs, seam: settings.js
**Write-set:** `electron/main.cjs`, `src/ui/screens/settings.js`, `test/fb-electron-window-state.test.mjs`
**Neighbours (extend, never restate):** SFQ-B229

## The gap
`electron/main.cjs` hardcodes 1480×920 and `fullscreen: !isolatedEvidence`; the only toggle is the
F11/Alt-Enter accelerator and nothing persists bounds. A player who resizes the window gets the default every
launch.

## Why this direction
One game path: this is a shell concern, so it lives in the launcher wrapper, with the Settings row bridged
over the existing `window.spacefaceShell` surface so browser and Electron share the row (hidden in the
browser).

## Mechanism
- Write `window-state.json` under `app.getPath('userData')` on close/resize/enter-full-screen and restore it on
  create, validated against the current display bounds.
- Add a Window mode row (fullscreen/borderless/windowed) that calls the shell bridge; hidden when the bridge is
  absent.
- Pin the state file round-trip in a Node test that stubs the app paths.

## Done when
`test/fb-electron-window-state.test.mjs`: bounds and mode round-trip; an off-screen saved rect is clamped;
`electron-launcher-reliability.test.mjs` stays green.

## Do not
Do not touch gameplay code for the shell. Do not store the state in the save. Do not change the
isolated-evidence launch.

## Focus test starting points
- `test/electron-launcher-reliability.test.mjs`
- `test/electron-isolated-evidence-contract.test.mjs`
