# TASK: Wire the built-but-dormant systems (SpaceFace WS-F3)

You are agy in the SpaceFace repo (Three.js space game, vanilla ES modules, no build step for dev).
Read `design/BUILD_PLAN_2_0.md` (your ownership: F3) and `design/ACCESSIBILITY.md` §"wiring checklist" (~line 140).
This is precise wiring work — small diffs, exact targets, no redesign.

## Do exactly these four things
1. **Telemetry**: in `src/main.js`, import and call `createTelemetry(bus, state)` from
   `src/systems/telemetry.js` at the point other systems are constructed (match the existing pattern —
   find where the registry/systems are created). Max 3 lines changed. Confirm `window.__SF_TELEMETRY__`
   exists at runtime afterward.
2. **Accessibility CSS**: add `<link rel="stylesheet" href="styles/accessibility.css">` to `index.html`
   after the existing ui.css link.
3. **Accessibility runtime**: per `design/ACCESSIBILITY.md` checklist — call `applyAccessibility(settings)`
   from `src/ui/accessibility.js` on boot and on the `settings:changed` bus event (the doc says where);
   in `src/ui/radar.js`, use the `SEMANTIC_PALETTE` + shape-redundancy helpers already imported at its
   line ~15 for blip colors/shapes instead of any hardcoded colors.
4. **Settings additions** in `src/ui/screens/settings.js`, matching its existing row/control patterns exactly:
   - Controls section: a "Control Scheme" select with options `helm-assist` (label "Helm Assist (mouse steering)")
     and `classic` (label "Classic Throttle") bound to `settings.gameplay.controlScheme` (default 'helm-assist').
     The flight system reads this key later — you only add the setting UI + persistence.
   - Gameplay section: "Damage Numbers" toggle bound to `settings.gameplay.damageNumbers` (default false).
   - Accessibility/Video section: "Screen Shake" slider 0–100% bound to `settings.video.screenShake`
     (default 100). Persist via the existing settings persistence path; verify with `check:settings-profile`.

## Constraints
- Do NOT touch: `src/systems/**` except nothing, `src/ui/hud.js`, `src/ui/uiRoot.js`, `styles/ui.css`,
  `src/core/**`, `src/render/**` (except nothing), `src/ui/bindings.js`. radar.js + settings.js + main.js +
  index.html ONLY.
- Follow existing code style in each file. No new dependencies. No `backdrop-filter` CSS anywhere.

## Verify before you finish
```
node scripts/check-ui-a11y.mjs && npm run check:settings-profile && node scripts/check-ui-screen-imports.mjs
```
Write the files. Print a summary of max 8 lines: each change + verification results. Do not paste code.
