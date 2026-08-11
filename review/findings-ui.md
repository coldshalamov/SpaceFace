# Thermonuclear Review — `src/ui/` (138 files, ~75k lines)
Source: read-only Explore subagent (full review). Verified against ARCH §5.1–§5.6, AGENTS §6, src/ui/AGENTS.md.

Severity: 🔴bug/contract-violation · 🟠material · 🟡taste · 🟢clean.

**Headline:** UI unusually well-architected and faithful to §5 (cadenced HUD, intent-only economy, strong a11y). Serious findings narrow: **one §6 physics-mutation violation** (`ui:drillFadeStart`), **stale §5/§6 docs** vs REVAMP 2.1 station/map redesign, cluster of **legacy/orphan screen files**.

## 🔴 Bug — §6 violation
- 🔴 **`ui:drillFadeStart` handler mutates physics directly from UI** (uiRoot.js:892-963). Zeroes `player.vel.x/z` (899-900), animates `player.pos.x/z` over 400ms via rAF (942-943), sets `player.rot` (944), sets `state.input.blocked=true` (898), mutates tether runtime fields `att.restLength`, `att.masslineRuntime.{restLength,targetLength,reelVelocity}` (924-933). UI owns gameplay/physics outcomes — exactly what §6/§5 prohibits (only `state.player.targetId` and `ui.*` are documented write exceptions). Should emit an intent a sim system performs.

## 🟠 Doc/code mismatches (ARCH §5/§6)
- 🟠 **§5.1 `.ui-modal-open` target**: doc says "adds .ui-modal-open to #ui-root"; code toggles it on `document.body` (screenManager.js:209, uiRoot.js:2178-2180), CSS targets `body.ui-modal-open #hud` (ui.css:82). Code+CSS intended; ARCH §5.1 stale.
- 🟠 **§5.3 7-tab rail stale**: doc enumerates Market/Shipyard/Outfitting/Missions/Services/Factions/Bar. Live DESTINATIONS (stationApp.js:65-74) = **Market / Shipworks / Industry / Missions / Factions / Bar / Ledger**. Shipyard+Outfitting merged into Shipworks; Services→dock actions; Industry+Ledger added. REVAMP 2.1 redesign intended; doc stale.
- 🟠 **§5.2 HUD rule missing 4th term**: code adds `fulfillmentBlackoutActive` (uiRoot.js:1063, screenManager.js:207-208) for boarding transit. Code-intended; doc stale.
- 🟠 **§6 manifest phantom files**: lists `objectiveTracker.js` and `damageNumbers.js` — **neither exists** (objective tracking in hud.js mission-tracker + navigationWaypoint.js; damage numbers in `damageIndicators.js`). Omits live modules: galaxyMap.js, bandHud.js, comms.js, toasts.js, marketNews.js, entire station/ tree, asteroid/ tree, effects/, map/, prompts/. Lists screens/stationHub.js as dock hub (now helper-only; live hub is station/stationApp.js).

## 🟠 Semi-orphaned screens (registered but unreachable on default route)
- 🟠 `screens/starmap.js` (1293 ln) + `screens/localmap.js` (886 ln): registered in SCREEN_MODULES (uiRoot.js:60-61) but **never pushed** — M/N/View/gamepad-map all route through openGalaxyMap (input.js:212-221,817-819). input.js:211 comment "for tools/checks only."
- 🟠 `screens/drill.js` (3154 ln) superseded by `asteroid/asteroidScreen.js` (uiRoot.js:67). Retained for input-controller/particle helpers.
- 🟡 `commandBar.js` (435 ln) dead on route: COMMAND_BAR_IN_FLIGHT=false (uiRoot.js:392); createCommandBar never called. Retained as SPEC3-36 skeleton.
- 🟠 `screens/stationHub.js` (4027 ln) now helper-only (exports selectors/gates); former screen body is dead surface.

## 🟡 Taste / half-finished
- 🟡 **Half-finished feature surfaced to player**: boost gauge marks travel-drive burn but "does not yet SPEND from it" (hud.js:3961-3968). HUD advertises an energy drain that doesn't exist.
- 🟡 **shipyard.js sell path bypasses intent bus** (shipyard.js:811 calls `ships.sellShip(idx)` directly) while buy emits `ui:buyShip` (839). Inconsistent; live shipworks.js is intent-consistent (ui:buyShip/ui:setActiveShip/ui:buyModule/ui:unfitModule).
- 🟡 **flashReduce half-wired**: accessibility.js:20-21 says surfaced via getFlashReduced() for vfx; CSS honors it (accessibility.css:188), hud.js:1748 honors it, but JS vfx paths should be verified to call it.
- 🟡 **damage numbers are DOM not canvas** (floatingText.js:4) — borderline vs §5.5 "Canvas … never DOM" (stated for radar/sparklines/star-map/tech-tree/avatars; pooled + transform-animated so within spirit).
- 🟡 Global window pollution: window._sfShowHints (uiRoot.js:454, consumed by onboarding — should be bus event); window.playSpaceFaceCinematic (712).
- 🟡 Leftover "cool-factor" cinematic video player in init path (uiRoot.js:691-711) with hardcoded `assets/cinematics/C-INTRO-01_6s.mp4`.
- 🟡 Dead CSS: `#pilot-portrait` selectors (uiRoot.js:1310,1688) target element that no JS creates (PILOT_AVATAR_SVG removed, comment 38-39).
- 🟡 ~870 lines CSS injected by JS (uiRoot.js:1300-2172 injectHudCss) overriding styles/ui.css — two sources of truth for HUD styling.
- 🟡 backdrop-filter:blur(2px) on always-present HUD panels (uiRoot.js:2158-2160) — compositor-expensive on persistent elements.
- 🟡 screenManager.js:257 + pause.js:408/413/425 write `state.mode` directly (within letter of §5.4 which only forbids timeScale, but co-owns mode across two UI modules).
- 🟡 Fragile E-key disambiguation (input.js:244-254): dock KeyE vs strafeRight, relies on stopPropagation + document-listener ordering. Load-bearing, brittle.
- 🟡 Vestigial `state.ui.activeStationTab` (input.js:83) — §5.3 references it but live stationApp uses internal activeId; dead write.
- 🟡 radar.js:409,414,422 hardcoded heat-zone colors (not semanticColor) — won't follow colorblind palette.
- 🟡 stationApp.js absolute stylesheet paths `/styles/*.css` (49-52) — breaks sub-path hosting.
- 🟡 bar.js:956 hardcoded sector preference `sector_charon_expanse` (silent sector bias).
- 🟡 galaxyMap.js fixed-cadence redraw ~64ms while idle (justified by animated scan rings).

## 🟢 Verified CLEAN (so nobody re-litigates)
- 🟢 §5.2 HUD visibility rule correct at uiRoot.js:1070 (`hudVisible = mode==='flight' && !modalChromeOpen && !docked`).
- 🟢 §5.5 hud.js cheap path exemplary: separate cadence clocks (numeric 10Hz, target, overlay, radar, overview), setText/setScaleX dirty-checking (747-832), event-driven dirty flags (4152-4155). No per-frame DOM creation. innerHTML only in one-time build/mount.
- 🟢 §5.6 input routing faithful (input.js:112-320): UI-owned keys only when mode==='flight' && no modal; modal→def.onKey with ESC=back. Intent-only docking (doDock/undock emit dock:attempt/docked/undocked).
- 🟢 §6 intent-only economy: market emits ui:buy/ui:sell (643,798), shipworks emits ui:buyShip/ui:setActiveShip/ui:buyModule/ui:unfitModule, stationApp emits dock:undocked{committed}/ui:service. Credits read-only in UI.
- 🟢 screenManager focus management best-in-class: Tab trap, opener snapshot/restore, _isRestorableOpener, per-screen autoFocus:false opt-out (39-128). Aggregate pause via timeEffects single sim:pause/resume pair (246-261). Backdrop data.locked honored, station→station:exitRequest (353-367).
- 🟢 accessibility.js comprehensive: dual motion flags, Okabe-Ito/Bang-Wong colorblind palettes paired with redundant shapes, forced-colors detection, captions, dyslexia font, high-contrast. Global reduced-motion honored via accessibility.css:145.
- 🟢 41 ui files carry aria-live/role=status; confirm.js accessible dialog (role=dialog, aria-modal, focus save/restore).
- 🟢 galaxyMap.js rAF canvas-only + visibility-gated; innerHTML only in event-driven dirty-checked rebuilds.
- 🟢 radar.js canvas ~20Hz, no innerHTML in hot path.
- 🟢 market.js table rebuilt on data events per §5.5.
- 🟢 pause.js destructive actions (Load/Main Menu) confirm()-gated; Sandbox IS_DEV-gated.
- 🟢 No console.log debug spam — all 42 console.* are warn/error defensive paths.

## Notable screens missing a polite aria-live region
- 🟡 `saveLoad.js` (result feedback) and `gameOver.js` (terminal state) would benefit from polite live region for SR users. (gameOver, settings, techTree, shipyard, codex, factions, automationPanel, services, manufacture — most fine as static.)

## Top 3 to fix
1. 🔴 Move `ui:drillFadeStart` ship teleport/velocity-zero/tether-mutation out of uiRoot into a sim system behind an intent.
2. 🟠 Refresh ARCH §5.3 (7 tabs), §5.1 (body not #ui-root), §5.2 (fulfillmentBlackoutActive), §6 manifest (galaxyMap/stationApp/asteroidScreen live; remove objectiveTracker/damageNumbers).
3. 🟠 Integrate-or-delete `screens/starmap.js`, `screens/localmap.js`, `screens/drill.js`, `screens/stationHub.js`, `commandBar.js` — retained but unreachable/helper-only.
