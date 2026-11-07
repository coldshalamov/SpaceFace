<!-- LIFETIME: CAMPAIGN -->
# X5 — Controls and input contexts: status

**State: the context system is landed, the label/tick split is fixed, and every device path is
gated; the live per-context Help capture and the physical gamepad check remain.** Revised after the
second independent X5 review pass on 2026-11-07.

## Done

- `src/data/inputContexts.js` — five contexts (`swarm`, `station`, `map`, `combat`, `flight`), two
  pure gates, one Help card per context:
  - `contextActionAllowed` — the ship's verbs (sim/input tick, pad).
  - `contextUiAllowed` — the UI letter layer (screens). The full set out of combat; combat keeps
    pause/help/mission log/cargo/comms/find/recall/dismiss/zoom/save/load and refuses map, local map,
    star map, tech tree, codex, fleet, claim-base, drill and the Ship/Footprint/Range screens.
- `src/systems/input.js` — **the label/dispatch split (P0)**. `binding()` no longer gates Adventure
  verbs by context: it is the label/prompt source, and gating it blanked the whole flight sheet while
  docked and Travel burn/autoFire/siteBeam while fighting. Only Swarm keeps S5's exact set. The tick
  gates in `_held`, `_heldExcept`, `_padEdge`, `_padHeld`.
- `src/ui/input.js` — every instrument key now asks `contextUiAllowed` before it acts, so a fight
  cannot open the chart, tech tree or codex. Station and map screens keep every interface verb.
- **Every device path asks the same gate (second review):** the gamepad View/Guide map+codex
  presses and the touch Local/Star map buttons now route through `contextUiAllowed` too. A fight
  can no longer open the chart or codex on a controller or the touch overlay. `Tab`/`Backspace`
  are documented as the deliberate exemption: they are selection-only (cycle/clear the UI-owned
  target), never open or leave a surface, so a docked pilot and map reader keep them.
- **Pad travel burn uses the key's rule (second review):** the pad branch in
  `src/systems/input.js` now asks `contextActionAllowed(state, 'travelBurn')` as well as the
  lifecycle quarantine. A healthy targeted fight cannot arm the long burn from L3; a pilot under
  25% hull can flee on the pad exactly as on the keyboard.
- `test/x5-device-gates.test.mjs` (new) drives the real `createUiInput` router with a fake pad and
  touch overlay, and the real `input.update` with a fake pad: pad View/Guide and touch
  Local/Star are refused in a fight, pause still opens, and L3 is refused healthy / admitted at
  10% hull. 3/3 pass.
- **Map context is reachable in live play**: `mapAuthority.setMapOpen` is the writer,
  `openGalaxyMap` sets it on push, `galaxyMapScreen.onShow`/`onHide` set and clear it, and
  `inputContextFor` also reads the top of `state.ui.screenStack` (`galaxyMap`/`localmap`/`starmap`).
  `test/input-contexts.test.mjs` opens the map through the real `openGalaxyMap` and closes it through
  the screen's own `onHide`.
- **Map before station**: the chart opens on top of the station hub, so a docked pilot reading the
  chart resolves `map`, not `station`.
- Help cards are **derived**, not hand-copied: rows name either rebindable actions (keys resolved
  live through `resolveActionLabel`) or fixed interface keys (text). A saved rebind moves the card;
  a refused verb is dropped. Flight and combat cards now teach `Tab / Backspace — Target · clear`.
- **Low-hull flee**: `travelBurn` is admitted in the combat context when `hull / hullMax < 0.25`
  (`LOW_HULL_FRACTION`), and only then does the combat card print the Flee row.
- **Station undock**: `E Undock` is a UI intent (`contextUiAllowed(station, 'undock')`), explicitly
  not a flight verb (`contextActionAllowed(station, 'undock') === false`). The card and the gate now
  agree.
- `contextPadAllowed` was an unused duplicate of the action gate (the pad calls
  `contextActionAllowed`); it is removed rather than left as a second policy surface.
- Focused checks: `test/input-contexts.test.mjs` 14/14; `test/swarm-controls.test.mjs` 8/8;
  `test/input-lifecycle.test.mjs` 12/12; `test/x5-device-gates.test.mjs` 3/3 (37/37 together).
  The modal-preservation contract still holds: a screen does not flip the context out from under a
  physically held key.

## Not done

- A live route check of each context (station, map, combat, flight) with the Help card open, and a
  capture of the combat card refusing the chart. The unit tests drive the real gates and the real
  map opener; they are not a player-route capture.
- Gamepad physical check (the code path is the same gate; no controller was attached).
- `test/help-gamepad-rebind.test.mjs` has one stale expectation (`Brake / reverse` vs the shipped
  `Brake / full stop` label) that fails independently of this pass — it is a pre-existing fixture
  drift, not an X5 regression.

## Next

1. Walk the four contexts on the ordinary route and capture the Help card in each; try `M` in a
   fight and confirm nothing opens.
2. Attach a pad and confirm the combat set gates travel drive/map/codex while fire/Line/powers work.
3. Reconcile the stale pad-help expectation with the shipped `Brake / full stop` row.
