# FB-094 — Autosave reuses one long-lived worker instead of spawning one per request

**Kind:** polish · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: saveSystem.js
**Write-set:** `src/save/saveSystem.js`, `test/fb-save-worker-reuse.test.mjs`

## The gap
`_createSaveWorker` builds a Blob, an object URL and a fresh Worker for every autosave and terminates it after
the request. Every 10 s debounce window pays spawn cost on the main thread during play. `_trackSaveWorker`
already owns the live set and `__spacefaceSaveSupersede` already implements the supersede semantics a
persistent worker needs.

## Why this direction
Fewer autosaves was rejected (robustness). A pool is overkill: one worker with supersede-on-newer-request
matches the existing protocol exactly.

## Mechanism
- Keep one worker alive across autosaves; recreate it only after a terminal error or context teardown.
- Route new requests through the existing supersede path so a newer save cancels an in-flight older one.
- Terminate on `game:new`/exit and on the renderer generation change, mirroring the disposal discipline the
  renderer uses.

## Done when
Seed 4242 with 20 forced autosaves: exactly one worker spawn observed (counter exposed for the test), all 20
writes verify, and `test/bounded-autosave.test.mjs` plus `test/save-restore-atomicity.test.mjs` stay green.

## Do not
Do not serialize on the main thread as a fallback path during play. Do not change the debounce or defer
constants.

## Focus test starting points
- `test/bounded-autosave.test.mjs`
- `test/save-arbitration-insertion-order.test.mjs`
