<!-- LIFETIME: RECEIPT -->
# PQ-189.00 — The control contract, generated from the bindings

```text
DONE  PQ-189.00 — every hint now names the key that actually does it: HUD, Help, Settings, onboarding, the rover, and the range overlay all print from the live binding table, a remap re-labels them, and a scan fails any leftover typed Space/F or arrow fallback.

WHAT I FOUND     Screens kept private formatters and typed defaults (Space / F, ↑ REEL, Up after a remap). The README still said Star map was M while the game opens it with N.

WHAT I CHANGED   input.js grew label exports only — bindings did not move. HUD, Help, Settings, drill, range, prompts, and Asteroid Works call that resolver. A new check walks src/ui and fails typed Massline/arrow/WASD fallbacks.

WHAT YOU WILL FEEL   Remap a flight key in Settings → Controls and the HUD, Help, rover drawer, and first-flight prompt follow it. The README star-map line now matches the N key.

THE NUMBERS      bar | before | after | target
                 taught PILOT actions whose labelled key fires the action, including after remap, focus loss, and flight→rover→flight | unproven | 16/16 | 16/16
                 check:ui:control-labels | absent | green | green
                 bindings table edits | — | 0 | 0

THE FRAMES       design/program/roadmap/receipts/PQ-189-00-flight-hud.png — flight HUD, HUD text on; FIELDWORK/RIG slots 4–7 match Digit4–7. design/program/roadmap/receipts/PQ-189-00-rover.png — Asteroid Works with HUD text on (Leave Esc matches the leave key; movement keys live in the help drawer, proven by the walk test, not dumped on the glass).

NEXT             PQ-164 pad/Deck/trackpad truth, and PQ-187/188 for how those labels look
```

## Review

[Review](a284f72b-45dc-4b0b-96af-229b12090d29) APPROVE after a first-pass REQUEST CHANGES on leftover typed keys. Those are gone: Help Flight rows have no third-column key names, the Massline hint starts empty, tutorialFlight does not invent Up, range.js uses the shared resolver, and Asteroid Works no longer falls back to WASD/F.

## Checks

| Check | Result |
|---|---|
| `node --test test/ui-control-labels.test.mjs test/pq007-control-prompts.test.mjs` | 7 pass |
| `node scripts/check-ui-control-labels.mjs` | OK |
| `node scripts/check-onboarding.mjs` | OK |
| `node scripts/check-ui-screen-imports.mjs` | 53 ok |
| `node scripts/check-controls-discoverability.mjs` | OK |
| `node --test test/asteroid-site-drawers.test.mjs` | 19 pass |
| `node --test test/instrument-hierarchy-starmap-range.test.mjs` | 10 pass |
| `git diff src/systems/input.js` | +62 lines, exports only; `tether` remains `['Space', 'KeyF']` |
