# FB-112 — Sliders announce values, conflicts are described, and text scales independently of UI scale

**Kind:** build · **Lane:** THE INSTRUMENT · **Routing:** ORRERY lane
**Seam tags:** seam: settingsControls.js, seam: settings.js, seam: kit.css
**Write-set:** `src/ui/views/settingsControls.js`, `src/ui/screens/settings.js`, `src/ui/accessibilityChecklist.js`, `test/fb-settings-a11y.test.mjs`
**Neighbours (extend, never restate):** SFQ-B226, SFQ-I091, NXB-056, NXI-221

## The gap
Settings has one root `aria-label`, tab roles and label wiring, but sliders carry no `aria-valuetext` and bind
rows announce only their text; the conflict message is not described to the row. `uiScale` is the only scale
and the checklist calls it `textScale`, which overclaims. Pure UI, hence the ORRERY lane.

## Why this direction
Accessibility is not optional; these are the three cheapest gaps in an otherwise mature stack.

## Mechanism
- Extend `paneBuilder` to emit slider roles with `aria-valuenow`/`aria-valuetext` and `aria-describedby` for the
  conflict message.
- Add `accessibility.textScale` driving a type-token variable in the kit, independent of `uiScale`; correct the
  checklist item.
- Run `node scripts/check-ui-a11y.mjs` and the settings walk before calling it done.

## Done when
`test/fb-settings-a11y.test.mjs`: every slider has valuetext, the conflict row is described, text scale
changes type without moving layout; `check-ui-a11y` passes.

## Do not
Do not fold text scale into UI scale. Do not remove the motion-ask screen.

## Focus test starting points
- `test/accessibility-settings-parity.test.mjs`
- Run `node scripts/check-ui-a11y.mjs`.
