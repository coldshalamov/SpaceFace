# LOAD-STYLE-02 — Two scripts still restyle the page every frame while the loading veil is up

A CDP trace of the Swarm load (`.devshots/fleet/runs/INV-08-swarm-load-tax.grok.*/RECEIPT.md`, "Native time") named the
JS style invalidators while the loading shell covers the screen. The menu agent already stopped the CSS animations
behind the veil (style recalc 9.2 s → 3.5 s, commit messages mention "loading shell"). The rest is JS:
- `governStep` — `src/ui/orrery/typeGovernor.js:143` (`el.style.setProperty`, 913 invalidations)
- `draw` — `src/features/salvageOutfits/integration.js:171` (`CANVAS.sf-salvage-outfits-overlay` attribute writes, 772)
- (smaller) `syncPadLabels` — `src/ui/floatingText.js:283` (340)

## Do this
1. Find how the code knows the loading shell is up (the menu agent's change: grep `loading shell` / the class or
   attribute it sets on `document.documentElement` / `body`, or `state.mode === 'loading'`).
2. Make each of the three skip its per-frame work while the shell is up (early return; resume on the next frame
   after it lifts), and make `governStep` and the salvage overlay skip writes whose value did not change.
3. Tests: one per file proving no writes happen while the shell is up and normal writes resume after.
Exact-path commits, per the protocol. No game boot. Run each touched file's tests before/after.
