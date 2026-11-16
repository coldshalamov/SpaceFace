# STYLE-03 — Cut the ~32 ms per-frame document style recalc in flight

Evidence: `.devshots/fleet/runs/INV-14-flight-frame-gap.grok.*/RECEIPT.md` (CDP trace, 10 s steady flight, this laptop). Flight
is CPU-bound; per player frame `UpdateLayoutTree` (style recalc) is **~32 ms in both Swarm and Adventure** — a third of
the frame. Layout (<0.4 ms) and paint (<1 ms) are cheap; it is the recalc. Invalidation sources it names:
- **`:has()` subtree invalidation on `body.sf-flight-pointer` / `html` ("Affected by :has()")** — any body change can
  restyle the whole document. Find every CSS rule with `:has(` in `styles/**/*.css` and generated CSS sources
  (`src/ui/**/*CssSource.js`, `styles/*.generated.css`) that matches on `html`/`body` or a high ancestor.
- `src/ui/fieldBuild/fieldBuildMode.js:789–790` — `frame` writes the Field Build pill badge (`textContent` / `.hidden`)
  every frame **before** `if (!active) return`, so it runs in ordinary flight (Swarm 306, Adventure 332 invalidations).
- Infinite CSS animations on HUD chrome (no JS stack, reason `Animation`): `.orr-cluster__icon`, `.orr-cluster__pulse`
  (`src/ui/orrery/flightCluster.js:206`, stroke-dashoffset), `.orr-drift` (`src/ui/orrery/tokens.js:110`),
  `.sf-comm-backlog-btn`, `.sf-lockring__brackets` (`styles/hud.css:132`).
- Per-frame writes: `setStyle` `src/ui/hud.js:1611` and `setCssVar` `:1754` on `.sf-objarrow`; `setAttr` `:1769` on
  `.sf-arc-shield`; `setLagTranslate` `:1672`; `syncPadLabels` `src/ui/floatingText.js:338`; `update` `:643`.

## Do this
1. Replace document-wide `:has()` rules with a class/attribute toggled by the JS that already knows the state (set on
   the element itself or a close container), so a HUD change no longer invalidates the document. Same visual result.
2. `fieldBuildMode.js`: move the badge writes after the `active` check and write only when the value changed.
3. Make the infinite HUD animations compositor-only: animate `transform` / `opacity` (with `will-change`) instead of
   `stroke-dashoffset`/colour/layout properties, or pause them (`animation-play-state`) when their element is not
   meaningful (e.g. no backlog). Keep the look.
4. The per-frame HUD writes: keep them on the smallest element possible (`transform` on the moving node, not a CSS
   variable on a container), and skip unchanged values.
5. Measure: reuse `.devshots/fleet/inv14/` (the trace probe) through the lock (never kill a holder you did not start):
   style recalc ms per frame and mean fps, Swarm and Adventure, before and after. Report the table.
Tests before/after for touched files; visual parity: shoot `node scripts/ui-bench.mjs --shot=<flight hud id>` before/after
if a bench shot exists for the flight HUD. Exact-path commits (own-commit.sh where files have others' edits).
