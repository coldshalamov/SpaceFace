# Integration seams and ownership

## Read before writing

The report pins one snapshot. It does not authorize replacing newer work with that snapshot. On the implementation branch, inspect git status, changed paths and current nested instructions; rebase the plan onto current owners. Commit only owned pathspecs. Never overwrite a live character, rewrite the global UI, or reset a whole tree to simplify this task. [R03]

Each dossier lists existing integration paths verified through content or registry references. Listing a path is not proof of every function signature inside it. Before implementation, read those files fully and record the real event names, payload types, save fields and lifecycle hooks. New proposed concept modules may be placed under an appropriate existing subsystem; `SF20-*` names in this package are planning identifiers, not installed registry ids.

## Existing owner map

| Concern | Read / extend | Prohibited shortcut |
|---|---|---|
| Simulation lifetime / ordering | `src/core/registry.js`, current GameState and selected systems | A second game loop or updating the dormant compatibility AI |
| Combat decision | `src/systems/tacticalAI.js`, `src/ai/`, `aiPorts.js` | Render-owned attacks, omniscient targeting, direct position teleport |
| Physics / tether | Current physics authority; `src/combat/attachments.js` | Removing a joint from a visual callback or lowering global break strength |
| Credits | `src/systems/economy.js` | A character directly increments player credits |
| Cargo / transfers | `src/systems/cargo.js` and current transaction events | Cloning an item into enemy loot and paying both copies |
| Reputation / law | Current factions and heat/law owners | Inventing a parallel faction score for a small crew |
| Derived ship stats | `src/systems/ships.js` | Preview code mutates live ship fit |
| Crucible resources | `runSession`, `survivalDraft`, `swarmSupply` | Campaign payout from a run enemy or crew animation |
| Places | Existing anchors / `authoredPlaces.js` with `appendAuthoredZones` | A second atlas registry or replacing a sector's full zone array |
| UI / voice | `src/ui/orrery/`, `voiceArbiter` and current screen owner | A duplicate menu shell, hover-only affordance, overlapping transient speakers |
| Memory | Mission/story/provenance/chronicler owners | New global “story AI” guessing incidents or attributing unseen actions |

Sources: R03,R07,R09,R11,R15.

## Proposed transaction envelope, not an existing API

For a new interaction whose current owner lacks a suitable intent, document an envelope such as:

```
{
  intentId: "stable-session-id:monotonic-counter",
  actorId: "existing-entity-id",
  targetId: "existing-target-id",
  conceptId: "SF20-03",
  action: "deliver",
  expectedRevision: 12,
  requestedAtTick: 90210
}
```

This is a proposed shape, not a callable function found in the repository. The existing single writer validates mode, range, identity, stock, ownership, revision and current availability. It returns one accepted/denied receipt with a stable receipt id and factual consequences. Presentation subscribes to that receipt. Double clicks, multiple contact events and save/load replay must not duplicate consequences.

Do not make up existing helper names in implementation. Use actual discovered events when they can carry the request. Introduce a new event only with a documented payload, owner, lifecycle and test. If a receipt only proves one fact, do not extrapolate unseen blame, intent or extra rewards.

## Coordinate and atlas wiring

All authored positions are sector-local. Convert to galactic coordinates only at the current atlas boundary. Test outside Helios so a zero origin cannot mask a wrong transform. New ordinary zones do not need bespoke art; the current atlas already supports procedural/glyph fallbacks. Add `presence` only when intentionally adding a budgeted spawn. [R08,R15]

This package deliberately provides locations and placement constraints rather than pretending uninspected free coordinates are safe. A production agent must choose final coordinates after checking current anchors, overlap, radius, traffic corridors, worldRadius and camera clearance. Finalizing placement is a concrete task, not permission to strand a concept behind a debug flag.

## Save / lifecycle

Use stable ids and schema versions. Persist outcomes, evidence, actual inventory ownership and the simulation phase needed to resume. Do not serialize Three.js meshes, physics handles, DOM elements, closures or clip instances. Reconstruct presentation after load from authoritative state. Normalize absent/old fields conservatively; reject unknown enum values without manufacturing progress.

Every packet must handle New Game, save/load at each phase, sector exit/entry, death, despawn, run abort and asset failure. Event subscriptions need teardown. A destroyed named character cannot be respawned accidentally because the visual asset reloaded. Preserve existing game functionality when a new optional character is absent.
