The deliverable is complete and durable at `C:\Users\93rob\Documents\GitHub\SpaceFace\ARCHITECTURE.md`. I've written the canonical architecture contract covering all six required sections, resolving every cross-spec conflict the advisor and I identified. Returning the summary.

---

**Canonical technical architecture written to `C:\Users\93rob\Documents\GitHub\SpaceFace\ARCHITECTURE.md`** (918 lines).

The document is structured contract-first, leading with a **§0 Global Conventions** block that resolves the ~20 genuine cross-spec conflicts before any prose, because the ten subsystem specs were authored independently and contradict each other. Key **[RESOLVED]** calls (loser named in each case):

- **One entity store.** `state.entities: Map<id,Entity>` is authoritative; Combat's `combatants[]` becomes a derived per-tick filter, Combat's pooled `projectiles[512]` array and its separate cell-120 spatial grid are killed — projectiles are core entities using the core cell-64 hash.
- **4-layer health** (`hull/armor/shield/cap`) wins over core's `hp/maxHp`; `hp` becomes a getter/setter alias over `hull`.
- **Security = 0..1 float** (world owns sectors); Combat's `0..5 securityLevel` is dead, with a `dangerTier()` conversion provided.
- **Reputation = −1000..+1000 / 9 tiers**; the UI spec's −100..100/5-tier and Save's −100..100 are explicitly overruled as wrong.
- **Starter = `ship_kestrel`, cargo 40u, mining beam 18 ore-HP/s** (picked to keep Mining's number-dependent economy coherent); `Shuttle`/`Scout`/`shuttle_mk1` and the 25u/50u/6/22 alternatives overruled.
- **One commodity registry** with a full Mining-ID ↔ Economy-ID unification table (§3.6.1).
- **Single-writer rules** for credits/rep/cargo/derived-stats/sector-owner.
- **One event delimiter `:`** with a complete master event table (§4.4, ~90 rows) folding every aliased name from every spec into one canonical name + payload + emitter + handlers. The kill-event tangle (`entity.destroyed`/`combat:kill`/`ship_destroyed`/`ship:destroyed`/`combat:shipDestroyed`) resolves to `entity:killed` (combat semantics) + `entity:destroyed` (cleanup).

The six required sections: **§1** render/DOM composition + boot; **§2** the unified 60 Hz sim update order (core's 10-step spine with combat substeps, the accumulator-gated 5 s economy tick, and automation slotted in); **§3** the single flat GameState schema with per-field ownership and serialized/transient markers; **§4** the system module interface, registry/wiring, the event table, and the save-key→system map (the Save spec's `SYSTEM_ORDER` names didn't match the actual systems, so an explicit mapping is given); **§5** screen management (stack, HUD-hides-when-modal/docked, input-routing boundary between UI-owned and flight-owned keys); **§6** the complete ~90-file manifest across `vendor/ src/core src/systems src/render src/ui src/data src/audio src/save`, each single-responsibility for parallel implementation. Closes with **§7**, the 15 cross-system invariants restated as the one-page contract.

Coordinate plane is stated once authoritatively: **XZ plane, +Y up, yaw around +Y** (§0.1).

One note for the design team: §0.10 froze three balance numbers (starter cargo 40u, mining beam 18 ore-HP/s, and economy basePrice winning over mining baseValue for iron) — these are design calls made to keep the most number-dependent spec internally consistent, not recalled "correct" values. If any should differ, the schema carries exactly one value per field, so changing them is a one-line edit plus a design ticket.
