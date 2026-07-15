# Revamp Documentation Map

The revamp suite is a library of outcome-oriented build packets for making the simulation visible,
legible, inhabited, and tactile. It contains valuable design detail and historical implementation
receipts, but it is **not** the current whole-game backlog.

## Read order

1. [`../program/README.md`](../program/README.md) — sole global status and pickup surface.
2. [`../program/02_REMAINING_WORK.md`](../program/02_REMAINING_WORK.md) — admitted Alpha + Depth work.
3. [`REVAMP_MASTER.md`](REVAMP_MASTER.md) — revamp north star and packet map; recheck its dated
   architecture, ownership, and status claims against the live repo.
4. The activated `BP-*` packet or detail file.
5. Current owning code, checks, public route, and evidence.

Unscheduled revamp outcomes are retained in
[`../program/06_RETAINED_FUTURE_BACKLOG.md`](../program/06_RETAINED_FUTURE_BACKLOG.md). Admit one
coherent slice there; do not reactivate an entire wave or old prompt.

## Document roles

| Family | Role |
|---|---|
| [`BP-01_WORLD_ALIVE.md`](BP-01_WORLD_ALIVE.md) through [`BP-13_PIRATE_ECOLOGY.md`](BP-13_PIRATE_ECOLOGY.md) | Current outcome/detail packets spanning world activity, combat, maps, economy, story, bases, flight, assets, fitting, UX, sectors, contracts, and pirate ecology. They define intent only when activated by the program. |
| [`detail/`](detail/) | Deeper sector/station, traffic/pirate, combat, flight/mining, salvage/economy, comms/audio/onboarding, and story evidence ideas. Treat as a curated quarry, not 91 automatically committed tasks. |
| [`DETAIL_PACKETS.md`](DETAIL_PACKETS.md), [`DETAIL_BRAINSTORM_R2.md`](DETAIL_BRAINSTORM_R2.md), [`DETAIL_DOCTRINE.md`](DETAIL_DOCTRINE.md) | Packet index, source quarry, and anti-flatness reasoning. Promote one deduplicated outcome at a time. |
| [`FRONTEND_REBOOT_AUDIT.md`](FRONTEND_REBOOT_AUDIT.md), [`HUD_THREE_ANCHOR.md`](HUD_THREE_ANCHOR.md), [`ONE_VOICE_CLOSEOUT.md`](ONE_VOICE_CLOSEOUT.md) | Current surface inventory and focused reconciliation references. They do not authorize deleting useful HUD/contact surfaces or replacing the protected station UI. |
| [`MASSLINE_PHYSICS_IDENTITY.md`](MASSLINE_PHYSICS_IDENTITY.md), [`PROOF_RITUAL.md`](PROOF_RITUAL.md) | Behavioral intent and acceptance ritual references; translate legacy seams to the current V3/tactical architecture. |
| [`COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md`](COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md) | Interaction/effect reference. It is not a standing station-screen redesign instruction. |
| [`BP-08_VISUAL_ASSET_SPEC.md`](BP-08_VISUAL_ASSET_SPEC.md) | Visual coverage and identity input. Historical asset budgets and finish notes are neither ceilings nor acceptance proof. |
| [`PROGRESS.md`](PROGRESS.md) | Historical/subordinate check-level ledger. It does not own current product status. |
| [`_history/`](_history/) | Superseded execution lanes, prompts, baselines, handoffs, and status records. Never implement by default. |

## Safe use

- Preserve product outcomes; re-derive implementation against current live systems and the authority
  chain in the root `AGENTS.md`.
- Deduplicate a candidate against Alpha, Depth, SPEC2, SPEC3, world identity, and live code before
  admitting it.
- A narrow check, backend carrier, or old `DONE` row is not player acceptance. Require normal-route
  behavior and current visual/audio evidence where applicable.
- Do not inherit palette, panel, glow, geometry, asset-count, iteration-count, triangle, byte, or
  entity-cap numbers as arbitrary law. Validate constraints through current taste, framing,
  determinism, save compatibility, and profiling.
- Performance fixes preserve visual quality and target batching, culling, cache reuse, allocation,
  cadence, LOD/HLOD, and frame pacing first.
- Coordinate protected ownership: station UI, input, render, assets, and active graphics lanes must
  not be overwritten by a broad revamp interpretation.

If a revamp idea still improves the game after that audit, give it a stable retained-backlog ID,
admit a bounded slice to the active program, and keep its source link as provenance.
