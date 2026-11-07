<!-- LIFETIME: CAMPAIGN -->
# X5 — Controls and input contexts: status

**State: the context system is landed and tested; the live per-context route check remains.**

## Done

- `src/data/inputContexts.js` — five contexts (`swarm`, `station`, `map`, `combat`, `flight`), one
  allowlist (`contextActionAllowed`), the same gate for the pad (`contextPadAllowed`), Swarm stock
  bindings after saved rebinds, and a ≤10-row Help card per context.
- `src/systems/input.js` — the three seams (`binding()`, `_padEdge`, `_padHeld`) now read the context
  gate. Swarm keeps S5's exact 19-action set (`test/swarm-controls.test.mjs` 8/8).
- `src/ui/screens/help.js` — the Controls tab opens with a “Flight now / Combat now / Station now /
  Map now” card before the full reference. The long sheet stays, so discoverability is not lost.
- Focused checks: `test/input-contexts.test.mjs` 8/8; `test/swarm-controls.test.mjs` 8/8.

## Not done

- A live route check of each context (station, map, combat, flight) with the Help card open.
- The station/map UI router already refuses flight keys when `state.mode !== 'flight'`
  (`src/ui/input.js:646`); the new gate is the sim-side backstop. A live capture would prove there
  is no leak through a modal.
- Gamepad physical check (the code path is the same gate; no controller was attached).

## Next

1. Walk the four contexts on the ordinary route and capture the Help card in each.
2. Attach a pad and confirm the combat set gates travel drive/map/codex while fire/Line/powers work.
