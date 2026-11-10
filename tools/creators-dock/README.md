# Creator's Dock

Author an XZ scene, export a certifying lab scenario, and export a user-content pack the shipped loader accepts.

The editor is a layout instrument. Numbers come from `runLabScenario`. There is no second simulator and no second mod loader.

## Run

```
node tools/creators-dock/cli.mjs serve --port 8765
```

Open `http://127.0.0.1:8765/`. Validate, Run lab, and Export call the server. Save writes a JSON download and a file under `tools/creators-dock/workspace/projects/`.

```
node tools/creators-dock/cli.mjs list-examples
node tools/creators-dock/cli.mjs validate --example dock.intercept-cargo
node tools/creators-dock/cli.mjs run --example dock.brake-hulk
node tools/creators-dock/cli.mjs export --example dock.bank-shot --out exports/bank-shot
node tools/creators-dock/cli.mjs apply --request examples/agent-requests/01-create.json
node --test tools/creators-dock/test/scene.test.mjs
node --test tools/creators-dock/test/export.test.mjs
node --test tools/creators-dock/test/lab.test.mjs
node --test tools/creators-dock/test/editor-http.test.mjs
```

Exports stay under `tools/creators-dock/workspace`. `..` and absolute paths are rejected.

## Agent API

Request schema `spaceface.creatorsDockRequest.v1`. Response schema `spaceface.creatorsDockResponse.v1`. Ops: `create`, `loadExample`, `addObject`, `clone`, `delete`, `nudge`, `setVelocity`, `group`, `ungroup`, `setFrames`, `setMeta`, `setWorld`, `setNotes`, `setEncounter`, `setWeapon`, `setPlace`, `setModule`, `undo`, `redo`.

The three scripts in `examples/agent-requests/` are deterministic. They go through the same `exportProject` validator as the editor.

## Examples

| Id | Grammar | User content |
|---|---|---|
| `dock.intercept-cargo` | Cargo crosses; player thrust | encounter `convoy` |
| `dock.brake-hulk` | Latch to a heavy drifting mass, throttle closed | encounter `salvageSignal` |
| `dock.bank-shot` | Turn and fire past a stone; shipped Bank Shot in the fit | encounter, weapon, place |
| `dock.legal-release` | Fly a gate without firing; credits stay put | encounter `traderRun`, module |
| `dock.collision-chain` | Coast into three grouped masses | encounter `ambush` |
| `dock.dangerous-crossing` | Wait, then cross a sweeper's line | encounter `toll` |
| `dock.convoy-rescue` | Close on a mule and a PD escort | encounter `convoy` with escort |
| `dock.hawser-quiet-drift` | Live Hawser hull and Quiet Ghost | encounter `salvageSignal` |

Field discs with `fieldKind: "place"` export as places. The lab has no force-field object; a force field fails export. See `DIALECT.md`.

## Keyboard

Arrow keys nudge. Shift multiplies the step. Delete removes. Ctrl+Z / Ctrl+Y undo and redo. Ctrl+D clones. Ctrl+G groups. G toggles snap. Wheel zooms. Space+drag pans.
