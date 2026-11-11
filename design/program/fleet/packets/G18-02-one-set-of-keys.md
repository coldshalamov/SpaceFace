# G18-02 — One set of keys in both doors

**Commission:** EC-G18 (decisions D1/D10). **Size:** large. **Tier:** D (lead reviews).
Slice 1 (one feel: Pull/Shove/contacts) landed in commit 21a3a741. This is slice 2.

## The target layout — identical in Adventure and Swarm
| Action | Keyboard + mouse | Controller |
|---|---|---|
| Move | W A S D | left stick |
| Aim | mouse | right stick |
| Fire | left button | right trigger |
| The Line | **right button** | left trigger |
| Boost | **Space** | A |
| Powers | 1–5 | bumpers and face buttons |
| Interact | E | X |
| Map | M | View/Back |

Swarm already uses this (`src/data/swarmControls.js`). Adventure puts the Line on Space and boost on
Shift and binds about thirty other keys. Make Adventure's **defaults** match the table.

**Everything else** (bullet time, cloak, gyre, bomb cycling, cargo dump, travel drive, full stop,
winch) goes on **one context wheel**, held on **Q** (controller: hold Y): hold to open, aim at a
slice, release to choose. Show only slices usable right now. If a radial menu exists
(`src/ui/commsRadial.js`), reuse its component and styling.

## Hard rules
- A player's **saved custom bindings are kept**. Only defaults change; a one-time migration moves a
  player who never rebound anything onto the new defaults.
- Rebinding in settings keeps working for every action, including wheel actions.
- No action becomes unreachable: every old action is on a key or on the wheel.

## Read first
`src/core/gameState.js` (search `DEFAULT_BINDINGS` / `defaultBindings`), `src/data/inputContexts.js`,
`src/data/swarmControls.js`, `src/systems/gamepad.js`, `src/ui/bindings.js`, `src/ui/commsRadial.js`,
and `git show origin/experience-commissions/EC-G18-one-feel-one-set-of-keys:design/program/experience-commissions/commissions/shared/EC-G18-one-feel-one-set-of-keys.md`.

## Files you may edit
The files above, new `src/ui/contextWheel.js` if commsRadial cannot be reused, the save-migration file
that owns settings (name it), new tests `test/one-set-of-keys*.test.mjs`. `git diff` first.

## Checks
- New test: default Adventure bindings equal the table; Swarm and Adventure resolve the same action for
  RMB, Space, 1–5; a save with custom bindings keeps them; a save with defaults migrates.
- `node --test test/*binding*.test.mjs test/*input*.test.mjs test/gamepad*.test.mjs` — report failures.
- `node scripts/ui-bench.mjs --list`, then shoot any controls/settings shot with `--shot=<id> --walk`
  and describe the PNG in your receipt.

Commit: `fleet(G18-02): one set of keys in both doors, the rest on a context wheel`.
