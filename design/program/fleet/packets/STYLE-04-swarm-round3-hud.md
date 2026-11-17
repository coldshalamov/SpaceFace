# STYLE-04 — Round-3 Swarm HUD: stop SVG-path restyles, forced layout reads and timer churn

Evidence: `.devshots/fleet/runs/INV-15-swarm-frame-after-style.grok.*/RECEIPT.md` (CDP trace). After STYLE-03, Swarm round 1 is
~46 ms/frame (traced) but round 3 is ~93 ms: JS 63 ms, style 11.6 ms, worker messages 7.4 ms. Named sources:
- ~31,000 `path` invalidations per window ("Invalidation set matched tagName" / "Related style rule"): `pushDoctrineTell`
  `src/ui/hud.js:3399/3401/3421/3438` (`.sf-tell` class writes), `src/ui/swarmJuiceHud.js:364` `update` and `:466`
  `entry.refresh`. Some CSS rule matches every SVG `path` in the HUD (a tag-name selector like `.x path` or `path { }`
  under a class that toggles), so each class flip restyles all paths. Find those rules and scope them to the element
  that changes (class on the svg/path itself), or switch the toggled state to a property that doesn't invalidate paths.
- Forced layout per frame: `readRectRows` `src/ui/hudAvoidRects.js:72` and an anonymous read at `src/ui/hud.js:7226`
  (`offsetWidth` 2.25 ms + `getBoundingClientRect` 2.04 ms per frame in round 3). Read rects only when the set of
  obstacles changed (resize, a panel appeared/disappeared), not every frame; never read layout after a write in the
  same frame.
- Timer churn: `setTimeout` 3.76 ms, `clearTimeout` 1.65 ms, `requestAnimationFrame` 3.19 ms per frame. Find who
  schedules/clears timeouts every frame (likely per-popup/per-tell timers re-armed each update) and replace with one
  frame-driven expiry check.
- Still per frame: `setAttr` `hud.js:1777` on `.sf-arc-*`, `setStyle` `masslineHud.js:2714`, `syncOverviewRow`
  `hud.js:5613` (still hitting a `body.sf-flight-pointer` `:has()` rule — remove that last `:has()` like STYLE-03 did).
Measure with the INV-15 probe (`.devshots/fleet/inv15/`, `?swarmRound=3`) before/after through the lock (never kill a
holder you did not start); report frame ms, style ms, JS ms. Same look. Tests before/after; exact-path commits.
