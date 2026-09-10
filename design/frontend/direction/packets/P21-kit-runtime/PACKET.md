```yaml
packet: P21
title: The kit runtime — fonts, tokens, asset loader, components from assets, motion, sound, lab page
lane: CODE
tool: local (Codex or Grok in the shared checkout, isolated by write set and mutex (no worktrees); the controller integrates)
dependsOn: [P10, P11, P12, P13, P14, P17]
current: [station-market, settings]
inputs: [design/frontend/direction/approved/kit-notes.md]
returns: commits on a branch + receipt design/frontend/direction/receipts/P21-REPORT.md
mutex: [ui-kit, styles-kit]
```

# P21 — The kit runtime

## Objective

Turn the returned asset kits into the runtime every screen is built from. Nothing in this packet
is styled by hand: **every component is assembled from the produced assets** (nine-slice plates
via `border-image`, sprites, the SVG sprite, the instrument geometry) and the tokens from
`kit-notes.md`.

## Deliverables

1. **Assets admitted.** Returned kits land under `assets/ui/kit/` (`plates/ keys/ controls/
   instruments/ icons/ marks/ tiles/`) — already a bundled root; manifests merged into
   `assets/ui/kit/manifest.json`. A `scripts/check-ui-kit-manifest.mjs` proves every referenced
   id has its file at @1x and @2x.
2. **Fonts.** Archivo variable (or the face `kit-notes.md` names) vendored with
   `styles/fonts/vendor-kit-font.py`, declared in `styles/fonts.css`; tokens `--k-display`,
   `--k-text`, `--k-numeral` retargeted. Bricolage retires when no screen uses it.
3. **Tokens.** `styles/kit.css` `--k-*` replaced with the Field Hardware palette, temperature
   states (`html[data-k-temp]`) retuned to §7 of the art direction; `kit.css` and every new
   stylesheet added to `scripts/check-type-floor.mjs` `LIVE` and `scripts/check-colour-tokens.mjs`
   `LIVE` (both currently omit it).
4. **Asset binding.** `src/ui/kit/assets.js`: reads the manifest, exposes `plate(id)`,
   `sprite(id, state)`, `icon(name, size)`, `mark(name)`, `glyphPath(name)`; injects the icon
   sprite once; publishes CSS custom properties for `border-image` sources and slices.
   `src/ui/station/icons.js` and `src/ui/glyphs.js` delegate to it (same API, new family).
5. **Components** in `styles/fh.css` (new) built only from assets: `.fh-plate[-raised|-sunk|-paper]`,
   `.fh-window[-deep|-viewport]`, `.fh-key[-primary|-hazard|-legend|-small|-socket]` with
   `:hover/:active/:disabled/:focus-visible` swapping sprites, `.fh-toggle`, `.fh-slider`,
   `.fh-stepper`, `.fh-input`, `.fh-light`, `.fh-row` (engraved rows with the selected light),
   `.fh-tile` (imaged tile in a window with a legend), `.fh-gauge`, `.fh-bar`, `.fh-socket`,
   `.fh-badge`, `.fh-tape`, `.fh-legend`, `.fh-stencil` (display type as marking), `.fh-wear`.
   Register layouts: `.fh-poster`, `.fh-bench`, `.fh-edge`.
6. **Motion** — `src/ui/kit/motion.js` replaced by P17's library; **sound** — P17 recipes merged
   into `src/data/audioRecipes.js` and `AUDIO_CUE_TO_RECIPE`; `src/ui/kit/sound.js` maps the new
   cue names.
7. **Lab page** `_uikit.html` rendering every component from real assets with real strings,
   captured at 1280/1920/2560 by `scripts/probe-frontend-snapshot.mjs`.
8. **Dead refit removed:** `src/ui/commandDeckRefit.js`, `styles/command-deck-refit.css`,
   `assets/ui/command-deck-refit/` (after confirming zero references), which also clears the
   `check-src-reachability` orphan.

## Checks

`npm run check:baseline` · `npm run check:type-floor` · `npm run check:colour-tokens` ·
`npm run check:ui-effects` · `npm run check:command-deck-ui` · `node scripts/check-ui-screen-imports.mjs`
· `npm run check:bundle` (asset reachability) · `node scripts/check-src-reachability.mjs` ·
`node scripts/check-ui-kit-manifest.mjs` · the lab captures side by side with the approved crops.

## Acceptance

The lab page's components, cropped at 100 %, match the approved frames' crops; every component is
asset-built (a reviewer greps `styles/fh.css` for `linear-gradient`, `box-shadow`, `border:` used
as material and finds none); floors green; the refit gone.

## The way this gets faked

Components styled with CSS borders, gradients and shadows "to match" instead of the produced
assets; the icon sprite added beside the old line icons instead of replacing them; tokens added as
a fourth layer instead of replacing `--k-*`.
