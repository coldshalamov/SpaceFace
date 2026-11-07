<!-- LIFETIME: CAMPAIGN -->
# X5 — Controls and input contexts: diagnosis

**Campaign:** X5 (Lane 6, LOOK & SOUND). Written before any edit, 2026-11-06.
**Depends on:** SWARM lane S5 (`src/data/swarmControls.js`) — landed `d6bd62d61f72`.

## 1. What the player sees

Outside a live Swarm round, every letter on the keyboard does something, and what it does depends on
where they are:

- In flight, 17 letter codes drive sim verbs and another 13 letters drive interface actions. The
  union is most of the alphabet: `A B C D E F G H I J K L M N O P Q R S T U V W X Y Z`.
- A player who opens the station still has the flight keyboard live behind the screen; a player in
  combat can still open the tech tree, cargo, codex, photo mode and the drill screen with one
  letter. There is no visible, small set for the context they are in.
- Help lists one long wall. S5 proved a compact card works, but only inside a Swarm run.

## 2. The measured cause chain

| Surface | Code | Measured |
|---|---|---|
| Flight verbs | `src/systems/input.js` `VERB_BINDINGS` + scheme tables | 20 verb rows, 17 distinct `Key*` letter codes in this file |
| Interface actions | `src/ui/bindings.js` | 13 letter-bearing actions (`E M N T J B U I L K O Z P` + chords) |
| The one context predicate | `swarmControls.js` `isSwarmControls` | True only for a live Swarm run; `systems/input.js` calls it at three seams (`binding()` line 443, `_padEdge` 1641, `_padHeld` 1648) |
| Swarm set (S5) | `swarmControls.js` | 19 allowed flight actions, 6 rail slots, 10 Help rows, stock keys after saved rebinds |
| Station / map / combat | — | no predicate at all; the Adventure set stays live |

The defect is structural: **S5 built a context system for one mode and called it a Swarm policy.**
The ban on "a context system" was never the problem; the problem is that it is keyed to a ruleset
instead of to where the player is. That is why the rest of the game still has 30-odd live keys.

## 3. Is the design the bottleneck?

**The scope, not the design.** The S5 mechanism is right: a pure predicate, an action allowlist, a
stock-binding overlay consulted after saved rebinds, a short Help card, and the same gate on the pad.
Generalising costs one module plus three call-site changes; replacing the input system would cost
weeks and lose rebinds. The only design work is choosing the five contexts and their sets.

## 4. The chosen road

1. **`src/data/inputContexts.js`** — one pure module:
   - `inputContextFor(state)` → `swarm` (live run), `station` (docked/screen), `map` (map open),
     `combat` (a hostile is targeted, or the hull is below 25%), `flight` (otherwise).
   - `contextActionAllowed(state, action)` — the one allowlist. Swarm keeps S5's 19-action set
     exactly; combat keeps movement, fire, the Line, the five powers, countermeasure, scan, bullet
     time, cloak, gyre, ordnance cycle/jettison and the pylon; station and map have no flight verbs;
     flight allows everything.
   - `contextStockBindings(state)` — the Swarm overlay for Swarm, no overlay elsewhere.
   - `contextHelpRows(state)` — a short card per context (≤10 rows), with Swarm's existing card.
   - The same predicate gates the gamepad (`contextActionAllowed` = the pad gate).
2. **`swarmControls.js` stays the Swarm data source.** `inputContexts.js` imports it; no circular
   edge, no duplicated Swarm table. `hudAdapter`, `help.js` and the tests keep their imports.
3. **`systems/input.js`** switches its three seams from `swarmFlightActionAllowed` to
   `contextActionAllowed`. Saved rebinds still win inside the context set (S5's contract).
4. **`ui/input.js`** keeps its Swarm live-run route; for station/map the screen already owns the
   keyboard, so the flight router is not consulted while a screen is open (the router checks first).
5. **Help** picks `contextHelpRows` instead of the Swarm-only card. The full bind sheet stays in
   Settings → Controls (one voice).

**Verify:** `contextActionAllowed` tests for all five contexts; the Swarm set is byte-identical in
behaviour; a station screen has no live flight verb; combat hides the travel drive, map, codex,
cargo, photo and drill; the gamepad follows the same gate; `check:ui:control-labels` and
`check:controls-discoverability` pass; a live route shows the short Help card in each context.
