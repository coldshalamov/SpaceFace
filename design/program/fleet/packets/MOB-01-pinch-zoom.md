# MOB-01 — Pinch to zoom on a phone, and a wider default view

**Lane 2.** Owner (iPhone, 2026-11-10): "I can't pinch to zoom out at all … zoomed in too far."
**Spec and code facts:** `design/program/fleet/drafts/MOB.md` §MOB-01 (who blocks the browser's pinch,
the camera zoom owner, the touch gesture model, `resolveInitialChaseZoom`) — read all of it.
**Design ruling** (`design/game/README.md` ruling 3): the phone's default view shows the **same horizontal
world width as the desktop default** (aspect-aware default zoom — about twice today's horizontal glass on a
390×844 portrait or 844×390 landscape screen); **pinch zooms from 0.6× (in) to 1.5× (out)** of that default.

## Build
1. **A pinch role in the touch gesture model:** two touches whose distance changes by more than 12 px
   (and are not both on HUD controls) become a pinch; the camera zoom follows the ratio, clamped to the
   range above, eased (no jumps). While pinching, the stick and fire roles do not fire. Releasing one
   finger ends the pinch without firing.
2. **Aspect-aware default** on phones (the recon names the seam). Desktop is unchanged.
3. **Keep the page from zooming** (the canvas keeps `touch-action:none`), so the pinch zooms the game
   camera, not the page.
4. The chosen zoom persists for the session (not across saves).

## Checks
- Pure tests (`test/mob-pinch-zoom.test.mjs`): distance-ratio → zoom with clamps; one-finger release ends
  the pinch; stick/fire suppressed during a pinch; default zoom for 390×844 and 844×390 gives the desktop
  default's horizontal world width (±5 %).
- Through the lock: `node scripts/fleet/game-lock.mjs run -- node scripts/ui-bench.mjs --phone --shot=<flight shot id>`
  (find the id with `--list`) before and after; describe both. If Playwright can emulate a two-touch pinch
  on the phone viewport, add it to a look script under `scripts/fleet/looks/` and report what it showed.

Commit: `fleet(MOB-01): pinch zooms the phone camera; the default phone view matches desktop width`.
