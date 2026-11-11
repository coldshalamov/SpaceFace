# MOB — recon draft for MOB-01..04 (pinch zoom · phone HUD · touch labels · phone quality tier)

One draft for the four `NEEDS-PACKET` mobile rows in `design/program/fleet/QUEUE.md` (MOB-01..04).
Recon only — the lead splits these into four builder packets.

## 1. What the player must see

Owner's report (iPhone, the Vercel deployment, 2026-11-10, quoted in the packet):
"I can't pinch to zoom out at all and the HUD takes up most of the screen; it's slow and hitchy on
my iPhone; I don't know if tapping the screen shoots or something; it looks like there's just a
tether button; maybe the HUD is too dark; I can't tell what's going on half the time; zoomed in too
far."

Finish lines, `design/program/fleet/PLAYBOOK.md` §3C (exact lines):

> "Done when, on a 390×844 phone viewport (`ui-bench --phone`) and the owner's iPhone: pinch zooms
> out to the desktop framing; the flight HUD covers ≤ 25 % of the screen; every touch control has
> a visible label on first use; the first throw is reachable in 30 s; 30 fps steady in the opening
> (mobile gets the low quality tier by default)."

Queue rows (QUEUE.md):

- MOB-01: "pinch zooms the flight camera out to desktop framing; default phone zoom wider"
- MOB-02: "flight HUD covers ≤ 25 % of a 390×844 screen (`ui-bench --phone`)"
- MOB-03: "every touch control labelled on first use; what a tap does is shown"
- MOB-04: "phones default to the low tier; 30 fps steady in the opening"

## 2. Code facts

### MOB-01 — pinch zoom + default phone zoom

**The zoom/framing owners.** `src/render/camera.js` `createChaseCamera` (camera.js:661) owns the
chase rig. `state.camera.zoom` is the player-requested distance in world units;
`cam.setZoom` (camera.js:890–894) clamps it to `CAMERA_ZOOM_MIN=45` / `CAMERA_ZOOM_MAX=330`
(`src/render/tabletopPolicy.js:590–591`). `DEFAULT_ZOOM=144` (tabletopPolicy.js:646) mirrors the
fresh-run default at `src/core/gameState.js:192` (`camera: { tilt: 60, zoom: 144 }`), applied via
`resolveInitialChaseZoom` (tabletopPolicy.js:749) at camera.js:675. `_dynamicZoom`
(camera.js:707–712) is the composed eased distance — speed-zoom, threat/tether/gyre composition,
safe-rect, ceilings all live in `src/render/tabletopPolicy.js` (`resolveChaseComposition`).
`CHASE_ZOOM_CLOSE=58` (tabletopPolicy.js:648) is the optional tight profile behind
`settings.video.chaseClose`.

**Why the phone feels zoomed-in today.** The rig keeps a fixed 50° vertical FOV
(`settings.video.fov`, camera.js:664–667); aspect is the live viewport ratio (camera.js:1685,
renderer.js:34551). A 390×844 portrait phone has aspect ≈0.46 — `glassHalfExtents(zoom, fov,
aspect, tilt)` (tabletopPolicy.js:144–148) shrinks the *horizontal* field proportionally, so the
same zoom 144 crops to less than half the desktop's width. "Desktop framing" ≈ what a desktop
shows at zoom 144.

**Desktop zoom input today.** `src/ui/input.js:1155` `onWheel` — wheel notch = step
`max(16, zoom*0.08)`; a Ctrl/Cmd-modified wheel (Chrome/Electron's trackpad-pinch report) =
proportional `deltaY*0.8`; both emit `bus.emit('camera:zoom', { delta })` (input.js:1175; also
±8 deltas from keys at input.js:930–934). Consumer: `src/render/renderer.js:19564`
`onBus('camera:zoom') → cam.setZoom(...)`. `camera:zoom` is presentation-only —
`KNOWN_UNFORWARDED_BUS_EVENTS` (`src/core/mainToSimEventSurface.js:247–254`), never crosses the
sim lane — so a main-realm DOM emitter is legal and cheap. Photo mode has its own zoomInput
(camera.js:402–407).

**Touch events' path.** `src/systems/touch.js` (facade) → `createTouch` →
`enhanceMobileTouch` (`src/systems/mobile/bridge.js:15`) wraps the legacy overlay with the live
"phone deck": `mountMobileView` (`src/systems/mobile/view.js:22`) + `MobileGestures`
(`src/systems/mobile/model.js:21`). view.js listens `pointerdown/move/up/cancel` on `window`
capture phase (view.js:314–318) and assigns each contact a role — `'stick'` (open space = fly
stick), `'fire'` (gun key), `'tether'` (tether key), `'wheel'` (edge handle) — at
view.js:240–273. `model.begin` (model.js:27–33) *rejects a second contact for an owned role*, so
two fingers become two separate roles (stick+fire etc.). **There is no pinch role, no two-contact
gesture, and no zoom path anywhere in the touch stack.**

**Who blocks the browser's own pinch.** `index.html:5` viewport is
`width=device-width, initial-scale=1, viewport-fit=cover` — deliberately no `user-scalable` cap
(view.js:26 comment "Preserve browser zoom; … Do not add maximum-scale/user-scalable=no"). But in
flight `:root[data-sf-mobile-flight="1"], body { touch-action:none }`
(`src/systems/mobile/mobileCssSource.js:4`) and `#gl-canvas { touch-action:none }`
(mobileCssSource.js:381) suppress Safari's page pinch, and view.js `eat()`s every captured touch
event. Net: on a phone, **no zoom input of any kind reaches the camera**.

**Seam.** (a) A two-contact gesture in `MobileGestures`/view.js emitting `camera:zoom` deltas —
same event the wheel uses, so `cam.setZoom` and its clamps/rate cap (ZOOM_OUT_RATE_MAX_WU_PER_S=330,
camera.js:415–417) carry it for free. (b) A wider default phone zoom — `resolveInitialChaseZoom` /
the `state.camera.zoom` default is the single number; the owner's ask is "pinch zooms out to the
desktop framing; default phone zoom wider", i.e. phone default somewhere between 144 and 330.

### MOB-02 — flight HUD ≤ 25 % of 390×844

**The shot.** `node scripts/ui-bench.mjs --shot=mobile-flight --phone` produces
`.devshots/ui-bench/mobile-flight.png` (390×844 CSS, dsf 2). `--phone` sets viewport 390×844 +
`isMobile/hasTouch` (scripts/lib/uiBenchBatch.mjs:24,105); `mobileFlight` mounts the *real* deck
view+model (tools/ui-bench.js:1103–1326). Shot ids: `mobile-flight`, `mobile-stick`,
`mobile-boost`, `mobile-brake`, `mobile-wheel`, `mobile-wheel-pinned`
(scripts/lib/uiBenchCatalog.mjs:66–71).

**Measured on that shot (bounding-box estimate): the HUD covers ≈ 50 % of the screen** — the
target is ≤ 25 %, so this is roughly double the budget even before transient alerts. Elements,
owners, sizes (CSS px at 390×844):

| Element | Owner | Size / seat |
|---|---|---|
| `.mf-status` speed + Hull/Shield/Energy/Boost rows | `src/systems/mobile/view.js:33–36`, css mobileCssSource.js:23 | ~150×135 top-left (150px @ mobileFlightLayouts.js `max-width:959px`; 124px @ mobileCssSource.js:450) |
| `#alerts` (TAKING FIRE pill) | `src/ui/alerts.js` | top band ~146–170 (layout comment mobileFlightLayouts.js) |
| `.mf-pause` 52px icon-only key | view.js:37; mobileCssSource.js:37 | top-right |
| `.mf-edge` "POWERS" handle | view.js:39–42 | portrait restyle 68×44 in the top lane (mobileFlightLayouts.js portrait block); desktop side-handle 48×110 (mobileCssSource.js:42) |
| `#hud .sf-leftcontext > .sf-mission-tracker` + DETAILS | `src/ui/hud.js:2158–2167`; compact style mobileFlightLayouts.js | top:112 left:8, `min(320px, 100vw−144px)` wide — in the shot ~300×57 |
| `#hud .sf-rightdock` + `.sf-radar-wrap` + caption | `src/ui/hud.js` radar | top:112 right:8, wrap 120 wide, radar 88px (`--sf-radar-size:88px`, mobileFlightLayouts.js) — in the shot ~120×195 incl. "BEACON·457" |
| `#hud .sf-vtape` travel/drive tape | `src/ui/hud.js:1801+` | phone-anchored under leftcontext (mobileCssSource.js:410–415) — in the shot ~170×280 |
| `.ml2-cadence-slot` Massline cadence card | mobileCssSource.js:397,453 | conditional; left:14 top:132, 140px wide |
| `.mf-buttons` Gun+Tether cluster | view.js:45–55; mobileCssSource.js:54 | `196×156 · --mf-scale` bottom-right |
| `.mf-edge` handle (see above); `.mf-dock` conditional | view.js:56; mobileCssSource.js:96 | min-height 50 above the cluster when a berth is in range |
| `.mf-ghost` "Touch anywhere and drag to fly" | view.js:57; mobileCssSource.js:150–156 | ~170px ring + label, left 23 %, first-run only (`taught`) |
| `.mf-toast` | view.js:58 | transient bottom-centre |
| `.sf-tells` FLYBY banner | `src/ui/hud.js` tells | transient mid-screen |
| `.sf-field-root` pill | `src/ui/fieldHud.js:303–325` | transient |

Already hidden on phone-flight (mobileCssSource.js:382,391): `.sf-prail`, `.sf-leftstack`,
`.orr-hud-cluster`, `.sf-overview`, `.sf-target`, `#sf-band-hud`.

**Placement owners to edit.** `src/ui/orrery/mobileFlightLayouts.js` — the single
`MOBILE_FLIGHT_LAYOUT_CSS` contract for `#hud` seats on phone ("one owner" header comment;
imported via `src/ui/views/hudStyles.js:5`). `src/systems/mobile/mobileCssSource.js` — the deck's
own furniture CSS (`FLIGHT_CSS` + `SCREEN_CSS` → `MOBILE_CSS`; served as a sidecar `MOBILE_CSS_PATH`
with this module as fallback, view.js:23–24). `src/ui/hud.js:6494–6920` measures live plates for
the alert lane (mobile-aware at :6558,:6780,:6854). `styles/hud-flight.generated.css` is the
generated sheet — change its sources, not the artifact.

### MOB-03 — touch controls you can read

**On-screen controls today** (all in `mountMobileView`, view.js:31–59):

- **Gun key** (`data-role="fire"`): hold = fire along heading; drag = independent aim + beam
  (view.js:50–54, model.js:92–94). Word label "Gun" printed; aria "Gun: hold to fire, drag to aim".
- **Tether key** (`data-role="tether"`): tap = latch/cut; hold+slide = reel (aria documents both).
  A `latched` state reflects `state.player.tether.active` (view.js:413). The reel ladder is the
  `.mf-reel` indicator (view.js:43,387–389).
- **Flight stick** (any open-space touch = `'stick'` role, view.js:247–270): drag = fly toward
  drag direction (steerToward, model.js:133–139); flick = boost pulse (model.js:47–52); a
  stationary thumb ≥260 ms at centre = brake (model.js:87); push past the dashed ring = boost.
- **Powers edge handle + wheel**: tap pins open / swipe inward selects one of **23 labelled
  powers** across 4 pages (`src/systems/mobile/catalog.js:5–40`: Powers 7, Gear 4, Flight 6,
  Navigation 6 — each with word + icon + description). `wheel.js` + `wheelSlot` (model.js:148).
- **Dock key** (`.mf-dock`, hidden until `dock:range` inRange, view.js:56,101,415).
- **Pause key** (`.mf-pause`): **icon only — no visible word**, only `aria-label`.
- **Guide** (`.sf-mobile-guide` dialog, view.js:70–85): teaches Fly/Flick/Gun/Tether/Powers +
  layout/scale/haptics prefs. Opened via `touch:guide` bus event or the `.mf-guide-open` pill —
  which only renders while the top screen is `mainMenu` (view.js:341–345,399).

**A tap on open canvas fires/aims/latches nothing.** Open-space contacts become the fly-stick
role; a brief tap yields a momentary zero-magnitude stick (and ~260 ms of stillness reads as
brake, model.js:87). Fire only comes from the gun key; latch only from the tether key. Deck
contacts are captured + `preventDefault`'d on `window` in capture phase (view.js:314–317), so a
phone tap can never fall through to the desktop `domMouseDownEvent` fire path
(`src/systems/input.js:1195`).

**First-use labelling today.** The `.mf-ghost` hint ("Touch anywhere and drag to fly") shows
until the first stick contact (`taught`, view.js:87,410) — per mount, not persisted. Key words
("Gun"/"Tether"/"Powers"/"Dock") are always printed. Gaps vs "every touch control labelled on
first use": Pause is unlabeled (icon only); the stick itself has no persistent label after
`taught`; nothing names what a *tap* does (tap ≠ drag distinction is undocumented in place) —
the guide exists but lives behind the title screen or Pause→Help.

### MOB-04 — phones default to the low quality tier + 30 fps

**How the tier is chosen today** (two different "tiers" — do not conflate):

- **GPU tier** (hardware detection): `detectGpu` (`src/render/adaptiveQuality.js:42–72`) classifies
  `software | unknown | integrated | discrete` from unmasked GL renderer/vendor. An iPhone's
  "Apple GPU"/"Apple M*" matches `INTEGRATED_RE` (:22) → **`integrated`**. Applied in
  `src/render/renderer.js` (~:11357–11430): `state.render.gpu` → dynRes floor 0.5
  (`GPU_TIER_DYNRES_FLOOR` :435–439), `applyRendererSize` (renderer.js:9723), and
  `autoPresentationCapFor` → **30 fps presentation cap under the Auto policy**
  (adaptiveQuality.js:422–425; consumed `src/core/presentationRunner.js:1508–1509`).
- **Quality preset** (player picture): `ADAPTIVE_QUALITY_TIERS` (adaptiveQuality.js:85–222):
  `low` ("High performance": native raster, medium particles, no sun shadows, 30 fps cap),
  `medium` ("Balanced" — `DEFAULT_QUALITY_PRESET` :289), `high`, `igpu60`, `integrated` (the
  hardware bundle — *"never auto-applied"* by contract, :194–198; only *suggested* via
  `shouldSuggestIntegratedPreset`, renderer.js:11427). Presets write `PRESET_VIDEO_KEYS` into
  `settings.video` through `applyQualityPreset` / `applyAutoQualityPreset` (:331–363);
  `qualityModeForVideo` (:369–378) resolves Auto vs Manual; `graphicsProfileBootstrap.js`
  (mergeProfileSettings:122, bootstrap:146) merges any saved profile — a mobile default must
  set the *initial* default, not stomp an explicit saved choice.

**What a phone gets today:** GPU tier `integrated` → 30 fps presentation cap + dynRes floor, but
the **Balanced (medium) picture** — not the `low`/"High performance" tier the playbook names.
`isMobileRenderContext` (`src/render/renderCapabilityProfile.js:4–15`: UA + coarse-pointer +
maxTouchPoints) is the existing mobile detector, used today only for scheduling/picture-path
choices (newGame.js:947 embark-spec skip; renderer.js:9684/9711 warmup, :13290/13809/19224
mobileFirstPicture) — **it never feeds the quality preset.** That is the seam for "phones default
to the low tier".

**What `tools/probe-ios-safari.mjs` measures:** a WebDriver (SafariDriver, macOS iOS Simulator)
run against the public Vercel URL — menu → New Game → Launch → flight → pause → resume. It records
`launchMs`, watches `window.__SF_STARTUP__` journal status/contextLost/firstPlayableFrameAt, taps
through real touch actions, and saves 4 PNGs + report.json. **It does not measure fps.**

**Vercel "main menu loops back to the beginning" — the documented cause and fix:**
commits `883c55831f` + `e1fa6990944c` (2026-10-24, ledger D188/D242). Phone launches failed closed:
fail-closed startup walls tuned on fast desktops (20 s picture/physics/presentation budgets, the
90 s render-package fetch wall, the 120 s admission deadline) aborted the ~146 MB opening payload
mid-download on handset-class networks → `AUTHORED_LIBRARY_UNAVAILABLE` → `failGameStart`
(`src/main.js:1258–1278`) → `mode:changed` to menu → `startupJournal` records
`returned-to-menu` (`src/core/startupJournal.js:136–137`). Fixes shipped: device-scaled budgets in
`src/render/startupPacing.js` (coarse+touch 6×, touch-leaning 4×, desktop 2× — lines 27–43) and
byte-progress stall bounds (streaming `renderPackageLoader` read + `asyncAdmission` `touch()`).
Isolation headers are *not* the gap: `vercel.json` already sends `COOP: same-origin` +
`COEP: credentialless` on `/(.*)` → `crossOriginIsolated` → the SAB journal lane auto-arms
(`src/core/simLaneMain.js:317–322`) and degrades to the transfer channel without it
(`src/core/wholeSimBrowserWorker.js:10–14`). `src/ui/bootStartupFailure.js` bounds boot retries to
one reload (`spaceface.startup-retry-at`), so an import-failure loop cannot look like a menu loop.
The acceptance harness exists: `scripts/probe-deployed-mobile.mjs` (WebKit/Chromium, iPhone 14
profile, `MOBILE_PROBE_THROTTLE=handset|cpu:n,net:slow4g|fast3g`, context-loss exercise, worker
contract) and `scripts/probe-mobile-flight.mjs` (real-route 390×844 touch run). If the loop
recurs, the journal's `returned-to-menu` vs a `timeOrigin` change (Safari document kill — the
iOS probe checks it) splits render-side bounce from page reload.

## 3. Files a builder may edit

Smallest lists per row. `git diff --stat` output shown per file (empty = clean tree, taken
2026-11-11).

**MOB-01 (pinch + default zoom):**
- `src/systems/mobile/model.js` — gesture model; add a two-contact role/pinch state. Clean.
- `src/systems/mobile/view.js` — contact routing; emit `camera:zoom` from the pinch delta. Clean.
- `src/render/tabletopPolicy.js` — `resolveInitialChaseZoom`/DEFAULT_ZOOM or an aspect-aware phone
  default. Clean.
- `src/core/gameState.js` — only if the phone default lives in the schema default (`camera.zoom:144`). Clean.
- (Probably not needed: `src/ui/input.js` — wheel path already exists; `index.html` — viewport is already correct.)

**MOB-02 (HUD ≤ 25 %):**
- `src/ui/orrery/mobileFlightLayouts.js` — the phone HUD seat contract. Clean.
- `src/systems/mobile/mobileCssSource.js` — deck furniture CSS. Clean.
- `src/ui/views/hudStyles.js` — phone type/scale fits (its mobile block delegates geometry to
  mobileFlightLayouts). Clean.
- Possibly `src/ui/hud.js` — only if an instrument must be restructured for phones (its alert-lane
  placement already reads the mobile deck's real geometry). Clean.

**MOB-03 (labels):**
- `src/systems/mobile/view.js` — key labels, pause word, first-use coach marks, guide access. Clean.
- `src/systems/mobile/catalog.js` — power labels/descriptions if copy changes. Clean.
- `src/systems/mobile/instrument.js` / `wheel.js` — only if stick/wheel labels are drawn there. Clean.

**MOB-04 (phone low tier):**
- `src/render/adaptiveQuality.js` — the preset/tier map + any mobile-aware default. Clean.
- `src/render/renderCapabilityProfile.js` — `isMobileRenderContext` is the detector to reuse. Clean.
- `src/core/graphicsProfileBootstrap.js` — where a device-aware default would merge with saved
  profiles. Clean.
- `src/render/renderer.js` — only if the GPU-tier application site needs it. **DIRTY:** carries a
  foreign PERF-02a hunk (~26 insertions around :28447, `createPoseContinuity`) — a builder must
  diff first or route around it.
- `test/…` — new focused test file per row (below).

## 4. Existing tests

- Touch deck/model/view: `test/mobile-flight.test.mjs`, `test/mobile-deck-instrument.test.mjs`,
  `test/mobile-control-lifecycle.test.mjs`, `test/mobile-lane-controls.test.mjs`,
  `test/mobile-radar-flight.test.mjs`, `test/pro-08-touch-overlay-config.test.mjs`,
  `test/d102-touch-null-geometry.test.mjs`, `test/flight-start-settle-touch.test.mjs`,
  `test/flight-start-touch-visible.test.mjs`, `test/hud-receipt-geometry.test.mjs`,
  `test/r2-d202b-phone-hud.test.mjs` (phone HUD CSS contract), `test/ui-css-sidecars.test.mjs`.
  `node scripts/check-input-modalities.mjs` pins the `legacy: true` dual-stick overlay.
  `npm run check:ui:control-labels` (scripts/check-ui-control-labels.mjs) covers control labels.
- Zoom/camera: `test/camera-*.test.mjs` family (director, glide, composition),
  `test/mobile-camera-witness.test.mjs` (probe camera witness on the mobile route),
  `test/crucible-focus.test.mjs` (a `camera:zoom` emitter).
- Quality tiers: `test/gpu-tier-detection.test.mjs`, `test/integrated-quality-preset.test.mjs`,
  `test/igpu60-preset.test.mjs`, `test/adaptive-quality-controller.test.mjs`,
  `test/bloom-quality-tier-resize.test.mjs`, `test/new-game-mobile-speculation.test.mjs`,
  `test/mobile-probe-startup.test.mjs`, `test/mobile-worker-contract*.test.mjs`;
  `npm run check:phone-startup-recovery` (startup-wall regression cell, incl.
  `test/render-package-loader.test.mjs`).

**One focused test to write per row:**
- MOB-01: a model/view-level test that two touch contacts produce `camera:zoom` deltas in the
  right direction (pinch-out → zoom increase) and can't start a second stick role; plus a
  `resolveInitialChaseZoom` phone-default assertion.
- MOB-02: a DOM/bench check measuring the flight HUD's covered area at 390×844 ≤ 25 % (the
  geometry probe in `scripts/check-mobile-screen-layout.mjs` or a ui-bench-side measurement over
  `mobile-flight`); keep `r2-d202b-phone-hud` green.
- MOB-03: assert every `.mf-*` control has a visible label on first mount (including Pause), and
  the first-use hint names what a tap does — a view-level DOM test like the existing
  `mobile-flight.test.mjs`/`control-lifecycle` style.
- MOB-04: assert a mobile-detected context (`isMobileRenderContext` or the integrated-GPU stub)
  resolves the `low` ("High performance") preset on a fresh profile while an explicit saved
  profile is untouched — an `adaptiveQuality`/bootstrap-level test alongside
  `integrated-quality-preset.test.mjs`.

## 5. How to see it

- `node scripts/ui-bench.mjs --list` → `mobile-flight`, `mobile-stick`, `mobile-boost`,
  `mobile-brake`, `mobile-wheel`, `mobile-wheel-pinned`; add `--phone` for the 390×844 viewport
  (without it the bench shoots 1920×1080).
- `node scripts/ui-bench.mjs --shot=mobile-flight --phone` → `.devshots/ui-bench/mobile-flight.png`.
- `node scripts/probe-mobile-flight.mjs` — real-route touch run at 390×844 (Chromium CDP touch,
  real GPU): boots, launches, exercises stick/boost/flick/gun/tether/wheel/pause/DOCK and a
  "can a thumb start the stick here" tap grid; PNGs + report in `.devshots/mobile-live/390x844/`.
- `MOBILE_PROBE_URL=https://spaceface-play-demo.vercel.app MOBILE_PROBE_ENGINE=webkit
  MOBILE_PROBE_THROTTLE=handset node scripts/probe-deployed-mobile.mjs` — the deployed acceptance
  (launch path, worker contract, optional `MOBILE_PROBE_CONTEXT_LOSS=1`).
- `node tools/probe-ios-safari.mjs` — the iOS-Simulator Safari route check (needs macOS +
  safaridriver; measures launchMs, not fps).
- `node scripts/probe-main-thread-profile.mjs --ms=15000` — the main-thread idle + simWallRatio
  numbers used by the PERF program (desktop; phone needs the deployed/mobile probes above).

## 6. Split

Already four queue rows = four packets; each is ≤ ~4 source files + one test. Suggested order:
MOB-04 (one default flip + detection reuse; fastest player-visible win for "slow and hitchy") →
MOB-01 (pinch is a new gesture role inside the existing model) → MOB-02 (CSS-only seats; the
largest surface) → MOB-03 (labels + coach marks; smallest code, mostly view.js). MOB-02 and
MOB-03 both touch `view.js`/`mobileCssSource.js` — run them in that order on separate hunks, or
give MOB-03 the view.js DOM and MOB-02 the CSS modules.

## 7. Questions for the lead

1. "The first throw is reachable in 30 s" (PLAYBOOK §3C): the phone deck has no throw verb —
   tether tap = latch/cut, and `throwArm` (desktop RMB, input.js:2051–2087) has no mobile mapping
   in the gesture model or the powers catalog. Is the intended path a new mobile verb (e.g.
   flick-while-latched) or a powers-wheel entry? Which row owns it — none of MOB-01..04 names it.
2. "The HUD is too dark": the same report that spawned MOB is LOOK-01/LANE-1's global grade —
   is HUD contrast in MOB-02's scope or deferred to the look program?
3. MOB-01's "desktop framing": is the finish line zoom ≈144-equivalent horizontal field on a
   0.46-aspect phone (≈2× horizontal glass), or literally the desktop's composed frame? The
   number belongs in the packet; the seam is `resolveInitialChaseZoom`/aspect-aware default.
4. MOB-04: "low quality tier" = the `low`/"High performance" preset (native raster, 30 fps cap)
   or the `integrated` hardware bundle (0.85 render scale, postFx off — currently opt-in-only by
   contract)? The playbook's own wording says "low quality tier" — flagging so the packet names
   the preset id exactly.
