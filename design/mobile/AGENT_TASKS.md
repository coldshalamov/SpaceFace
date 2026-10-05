# Mobile Flight Deck — continuation and release gates

Baseline: `df1af22e5a1f1b10d36cdab91473799b704dcd6a`.
Branch: `feature/mobile-flight-deck-20261004`.

## Ownership and invariants

`src/systems/touch.js` is a facade; `legacyTouch.js` is the unchanged old module and must remain at the
same directory depth so its relative imports retain their meaning. `mobile/model.js` owns gesture
geometry and fixed-step hold timers. `mobile/view.js` owns DOM/pointer capture; `mobile/bridge.js` maps
intent onto the existing input instance's axes, fire/boost channels and action resolver. `catalog.js`
uses action IDs, not synthetic keyboard events, so rebinding desktop keys does not change mobile powers.

Do not create another physics controller. `input.js` still owns input arbitration; Massline grammar still
owns latch/cut/hold; propulsion still owns turn limits, acceleration and boosting; consumer systems still
own cost, equipment and cooldown refusal. Pointer event timestamps classify a human flick only. Dwell
and pulse duration advance on fixed simulation steps. No wall-clock values are added to serialized state.
A cancelled tether contact must never become a cut on release. Other fingers must survive one cancelled
pointer. All contacts/queued powers reset on pause, dock, death, blur, hide, rotation and session replacement.

The adapter decorates `_held` and `_heldExcept` on the live input instance and restores both when disabled.
It does not set `_keys`, synthesize keydown/keyup, replace `input.update`, or directly call gameplay systems.
If input's action API changes, update this small bridge and the contract tests rather than broad rewriting.
Do not add an aim-assist shortcut that silently turns on G/autofire: the dedicated GUN button must retain
fire authority. Current default weapon aim follows the flight direction/heading; gun drag provides
independent manual aim. Long stationary touch brakes; ordinary release coasts.

The adapter decorates the old touch layer rather than deleting its trackpad helpers. Keep integration
changes small and validate them against the full game before marking a release ready.

## MOBILE-01 · Integrate and verify the real Vercel route (P0)

**Owners:** `src/systems/touch.js`, `src/systems/mobile/*`, normal build/preload scripts, existing Vercel project.

Run the new Node tests, the existing input/gamepad/touch/Massline lifecycle tests, and the normal build.
Run `node scripts/sync-modulepreload.mjs` and inspect any generated preload changes. Run source-reachability
and deterministic simulation checks under the repository's supported environment. A package install and
harness screenshot are not a full-game release receipt. Verify init/destroy/reinit of the input system
actually destroys the mobile DOM listeners and restores decorated methods. Preserve old exported trackpad
helpers, Deck tests and disabled-touch behavior. Tests that source-read old touch.js may need their source
path updated to legacyTouch.js without weakening assertions.

**Acceptance:** Vercel preview URL is recorded; fresh phone browser reaches the existing title and one live
flight/Crucible run without a keyboard, without module 404s, and without stale cached touch code. Record
commit SHA, browser/device and actual build/test outcomes. Never mark a test passed solely because the
new files exist. Do not merge while this gate is unverified.

## MOBILE-02 · Real-phone gesture and combat acceptance (P0)

**Owners:** `mobile/model.js`, `mobile/view.js`, `mobile/bridge.js`, actual input/flight/tether consumers.

Test iOS Safari and Android Chrome on real hardware, both orientations. Run 10 minutes per device:
fly/fire together; fly/swipe a power; triple contact without stealing; near-bezel stick starts; fast tap;
flick; slow drag; looping swipe; max thrust without boost; boost ring crossing and retraction; stationary
brake; outside-edge cancellation; notification shade; browser back; lost pointer capture; tab switching;
rotation during fire; modal opened during a tether hold; death/retry; leaving/returning to station.

**Acceptance:** no stuck fire/thrust/boost, no release power after cancel, no ghost mouse fire, no recoil
of the joystick origin. Verify flick requests the existing short boost behavior in the correct world
heading without bypassing ship turning limits. Verify Massline acquires real bodies at near and far aim
ranges. Current aim uses the existing touch merge's 300-unit ray; if live tests expose poor acquisition,
add a deterministic shared aim-picking seam using existing eligibility, not an unbounded entity scan.
Verify neither tablet gamepad use nor mouse/keyboard is starved by an idle touch overlay.

## MOBILE-03 · Authoritative power availability and feedback (P1)

**Owners:** `mobile/catalog.js`, `mobile/view.js`, `ui/powerRail.js`, its existing `readRailModel`.

The wheel currently sends existing requests; it does not pretend every ship has every power. It says
"requested", not "activated". Reuse the rail's actual locked/cooling/unaffordable/armed readings and slot
claim protocol for shared actions. Keep the model dependency acyclic and avoid importing the entire
HUD into the input loop. Add a small read-only bridge or event adapter and stale-data handling.

**Acceptance:** unavailable entries are visibly explained; cooldown and bomb type/count match the game;
one gesture means one request; an empty/locked power is not shown as a successful cast. Local time-dilation
toggle reads actual meter/state. Native cargo-jettison confirmation cannot leave stale contacts. Destructive
inventory actions must stay deliberate. Test locked gear and no-resource cases, not only fully equipped ships.

## MOBILE-04 · Entry, Crucible loadout and screen maturity (P1)

**Owners:** existing screen controllers, `ui/views/menuFrames.js`, `mobile/styles.js`, original ORRERY layouts.

This pass supplies a CSS/interaction baseline on the actual Deckplate hooks, not a verified redesign of
all screens. Inspect the real title arc rail, motion prompt, new game, pause, save/load, settings, death/retry,
Crucible mode selection/loadout and upgrade/repair milestones at 320x568, 390x844 and 844x390. Preserve
screen hidden states, focus management and actual saved-slot handlers. Test long labels and large text.

**Acceptance:** primary play/continue/retry/launch controls remain onscreen or deliberately scrollable;
no transform-based miniature desktop UI; minimum 44 CSS-pixel tap targets; no horizontal overflow; scroll
containers do not accidentally start flight; no hover-only essential description. Extend layouts in their
actual owners once validated rather than adding ever-broader global overrides. Mining minigames remain
out of scope until flight and the core entry/Crucible path pass the preceding gates.

## MOBILE-05 · Tactical HUD and touch navigation (P1)

**Owners:** `ui/hud.js`, `ui/orrery/hudAdapter.js`, `ui/radar.js`, mobile view/style.

The mobile strip reads p.hull, p.shield, p.cap, p.boost.energy/max and |p.vel|. Large desktop clusters and
verbose overview/target cards are collapsed at phone sizes; radar is a small read-only preview. Alerts,
world brackets and objectives are not intentionally removed. Inspect actual live layering and container
clipping. This is not a completed tactile radar or galaxy-map gesture redesign.

**Acceptance:** preserve health/shield/energy/boost/heat danger cues, current target identity, mission
objective and tether strain without occupying the ship's center. Add tap-to-expand details and a shared
read-only heat reading rather than guessing weapon heat fields. Map drag/pinch must be distinct from flight
stick ownership; close/back must require no keyboard. Verify objective/radar overlap in notched landscape.

## MOBILE-06 · Device performance and polish (P1)

**Owners:** rendering/settings/loading owners, not the touch intent model.

Capture full-game boot time, memory, frame-time distribution and thermal behavior on the same phones.
Control-lab smoothness proves nothing about the game's 3D asset workload. Investigate mobile-appropriate
DPR/quality presets, texture/mesh budgets, shader compilation scheduling and visible-asset priority before
changing control cadence. Do not change deterministic simulation frequency to hide rendering stalls.

**Acceptance:** report actual measurements and device names; title/loading visualizer responds to touch;
input does not allocate an unbounded gesture history; no second continuous touch animation loop; rendering
work sleeps under inactive screens. Respect reduced motion, text size, left-handed layout and optional
haptics. Fullscreen and vibration are enhancements, never prerequisites. Do not blanket-disable page zoom.

## Build-map integration

Add MOBILE-01..06 to the active build map under **Mobile flight and demo maturity**. Mark implementation
as present but MOBILE-01 and MOBILE-02 release verification as pending until evidence exists. Link this
file from the build map; do not create a second autonomous task queue or declare all mobile work done.
