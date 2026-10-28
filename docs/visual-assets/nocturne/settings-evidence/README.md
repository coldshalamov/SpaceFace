# Settings control evidence

`settings-controls.png` shows the actual Settings screen at 1280 × 800, mounted in the repository's existing `tools/ui-bench.html` fixture. The screenshot was opened and inspected after the controls were exercised: the new lighting rows remain readable in the existing scroll panel, and the quality legend explains which changes apply immediately and which apply on the next launch.

`report.json` records seven successful interactions against the actual fixture state:

- Cinematic lighting changed off and on.
- Local light shadows changed off and on.
- Volumetric atmosphere changed off and on.
- Lighting quality selected Performance, Balanced, High quality, and Automatic.

The capture completed with zero browser exceptions and zero failed resource requests. Twelve missing sparse-checkout assets were served only after their Git blob hashes matched immutable base revision `6a9eec796e3b25e2b08526cd4412503d32cccb12`. Production UI modules and CSS were loaded without substitution.

The companion `test/nocturne-settings.test.mjs` exercises the real settings-profile save/restore path, old and malformed profiles, and global quality-preset matching. It also checks that `igpu60` selects the integrated lighting tier while an explicit lighting-quality choice takes precedence.

This fixture verifies control behavior and appearance, not the live gameplay render, GPU cost, or persistence through a browser relaunch. The save-profile round trip is covered separately by the focused Node test. Open the production Settings → Video route to check the complete in-game interaction after upstream startup blockers are resolved.
