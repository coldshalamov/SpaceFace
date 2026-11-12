# MOB-03 — Touch controls you can read

**Lane 3 [FE].** Ruling (`design/game/README.md` 3): *every touch control is labelled on first use.* Code facts:
`design/program/fleet/drafts/MOB.md` §MOB-03 (read it in full). The phone HUD was just rebuilt (MOB-02, b0268fe6) to
fit in 25 % of the screen — **do not add anything that stays on screen**; first-use captions are transient.

## Build (phone flight only; desktop unchanged)
1. **Pause key gets a word.** The round pause key (`.mf-pause`, `src/systems/mobile/view.js`) is icon-only. Add a small
   visible word under it — `MENU` — 12 px, the deck's label face (`--mf-face`), bone at .78, inside the key's own box
   so the HUD area does not grow (shrink the glyph if needed).
2. **First-use captions.** The first time the player touches each control, a one-line caption appears beside that
   control for 2.5 s saying what the gesture did and what the other gesture does:
   - GUN: `Hold: fire · drag: aim`
   - TETHER: `Tap: grab / cut · hold + slide: reel`
   - POWERS handle: `Swipe in: pick a power`
   - the fly stick (first drag after the ghost ring): `Push to the ring: boost · hold still: brake`
   - DOCK: `Tap: dock`
   Use the deck's existing toast seat/style (`.mf-toast` in `src/systems/mobile/mobileCssSource.js`) or one new class
   in the same file — never print over the vitals strip, objective line, radar or keys (check the shots).
   **Once per player, not per mount:** remember which captions were shown through the deck's existing config/save
   path (`config()` / `saveConfig()` passed to `mountMobileView`) — read how `layout`/`scale` persist and add a
   `taught` set beside them. Reduced motion: no slide, just appear/disappear.
3. **Guide reachable in flight:** the touch guide already opens from Pause → Help on a phone (`src/ui/screens/pause.js`,
   `touch:guide`). Leave it; just confirm it in the look.

CSS lives in `src/systems/mobile/mobileCssSource.js` / `src/ui/orrery/mobileFlightLayouts.js`; regenerate sidecars with
`node -e "import('./scripts/lib/buildUiCssSidecars.mjs').then(m=>m.buildUiCssSidecars({root:process.cwd()}))"` and commit
the generated `styles/*.generated.css` your change produces.

## Checks
- Tests: `node --test test/mobile-*.test.mjs test/r2-d202b-phone-hud.test.mjs` plus a new
  `test/mob-03-first-use-captions.test.mjs` (each caption shows once; a remount with the saved config shows none).
- Looks through the lock, and **open every PNG and describe it**:
  `node scripts/fleet/game-lock.mjs run -- node scripts/ui-bench.mjs --phone --viewports=390x844,844x390 --shot=mobile-flight,mobile-stick,mobile-wheel --walk --out=.devshots/fleet/looks/mob03`
  and `node scripts/fleet/game-lock.mjs run -- node scripts/check-mobile-hud-area.mjs` — must still print
  `within the 25% budget` at both sizes.

Commits: `fleet(MOB-03): <what the player gets>`, one per item.
