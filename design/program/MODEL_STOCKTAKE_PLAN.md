<!-- LIFETIME: DURABLE -->
# 3D stocktake plan — one manufactured world, cheapest path

Owner words. Tables live in [`MODEL_STOCKTAKE_MANIFEST.md`](./MODEL_STOCKTAKE_MANIFEST.md).
This file is the order. Hitch stays. Do not dump Hitch. Do not cut default quality.
Chase camera only. No seats. No INFERENCE. No second queue.

Law: [`MODEL_STOCKTAKE.md`](./MODEL_STOCKTAKE.md). Live board: [`PQ-193.md`](./roadmap/active/PQ-193.md)
and `build_map.md` §13D. How the picture arrives (admission, runway, LOD, quality cuts):
[`DYNAMIC_GRAPHICS_INVESTIGATION.md`](./DYNAMIC_GRAPHICS_INVESTIGATION.md).
Flyable remaster stays `PQ-050`. Unused-pack fielding stays `PQ-136`.
Liner G7 stays `PQ-049.05`. This session created **no** `PQ-194` and **no** new leaf.

---

## Owner report (one page)

**Already good.** Hitch. Wasp. The Helios civilians and the working boats that already
have a packaged whole body (Lark, Cradle, Span, barge, tender, salvor, survey pin,
rescue, prospector, sweeper, shuttle, yard tug). The Ashline Dart / Lode / Rig files
publish when the live maps ask for them. The 47-A scavenger wing, when it finally
arrives, is the Rig — not a pile of parts. Everyday kit and the wreck pack are routed
(wrecks stay off Helios on purpose).

**Looks broken on the first picture.** Reverse is two needles. The 47-A can, rescue
capsule, Kessler hoop, and Bourse wreck are still cylinders next to Hitch. Lane
beacon / buoy / pod still read as tube-plus-ring until someone looks at them at
chase size. A smuggler or pirate in Helios traffic is modular junk: engine and glow
in empty air. That is the “nearby NPC from another game.” The official recovery tug
is the same defect when its beat starts — Mule parts, dead asset name, Concord code
ship never used.

**We already own and are wasting.** Corsair Blade and Reaver Hook. Three Span faction
kits. Three Wasp kits. Three trade-hub overlays. Arclight. Tanker and inspection
cutter (packaged, held because they were missing-hull kits). Factory remasters of
Ashline / Helios / work boats (do not remap — that already made traffic invisible).
A gate GLB the census still called “no file.” A mining-drone GLB while the flying
drone is still a diamond. shipKit “hero” ships that live play never draws.

**Do not start.** A new hull while a shelf body can fill the slot. Corsair / Arclight /
tanker variety before the opening flyby is true. Hornet garnish, seats, studio
crops. Copying incubator donors. Wiring blocked Pelican/Wasp shells. Swapping an
unpackaged `*_production_v1` onto live traffic. A glow blob or a second needle
trail. A cheaper Hitch. Distant LOD selectors, impostors, or a cheaper species of
ship (later garnish hide only — see the dynamic-graphics investigation).
Painted-planet bundle hole is real; it is not Wave A.

**First unit another agent should take:** `node scripts/program-dispatch.mjs --id PQ-193`
and do **`PQ-193.00`**. Put every lockable roster hull and the liner on the
empty-admission allowlist and *require* those complete bodies. Modular junk never
substitutes. Then `.01` (opening NPCs, including the recovery tug and smuggler/pirate)
and `.02` (reverse is a jet) can run; `.02` does not wait on `.00`.

---

## What §13D missed (not new packets)

Write these into the existing leaves. Do not open a parallel board.

1. **The first broken NPC is not the Rig.** Default New Game parks 47-A ships far away.
   Modular **smuggler / pirate** traffic is the opening kitbash. The **official recovery
   tug** is modular Mule when it arrives (`assetRef` is dead; Concord builder is skipped).
   Own both under `PQ-193.00` / `.01`.
2. **Factory player hulls are packaged and mapped, not published.** Only Hitch and Wasp
   are required whole-ships. “They now load” is wrong for a bought Hornet / Pelican.
   `PQ-193.00` must admit **and** require.
3. **Yard tug is already live.** Tanker and cutter are still held. Hull-triage “three
   held hulls” is stale.
4. **Jump gates already have `place_gate_jump_ring.glb`.** Census A was wrong. `PQ-193.05`
   upgrades that file; the code hoop is leftover fallback.
5. **Mining-drone entity ≠ `place_mining_drone`.glb`.** Point the flyer at the place
   file after the file beats a tube (`PQ-193.05`).
6. **Express is mapped to the liner and omitted from `PACKAGED_LIVE`.** Invisible risk.
   Admit under `PQ-193.00`. Do not duplicate `PQ-049.05`.
7. **Two painted planet plates are referenced and not retail-routable.** Sky, not a hull.
   Bundle later. No `PQ-194`.
8. **shipKit faction heroes are dead.** Do not “fix” them. Retire the idea they are live.

---

## The order (law)

Nothing invisible or falling apart → reverse is a jet → upgrade the object already on
camera → field unused bodies that beat live → one flyable remaster at a time → places
in the live game → commission last → retire junk so nobody wires it.

Reuse before authoring. Do not start variety until the opening flyby is true.

---

## Ordered work

### Wave A — opening flyby never broken

| Do this | In owner words | Leaf |
|---|---|---|
| Admit complete bodies | Every ship you can lock publishes a packaged whole hull. All 13 roster files + the liner go on the empty-admission list and become required. Modular kit is not a ship. | `PQ-193.00` |
| Opening NPCs | Hitch and the nearest traffic are the same game. Enclose or replace modular smuggler / pirate. When the recovery tug arrives, it is a complete tug (yard tug if it beats stills — package already live), not Mule scraps. Helios Lark/Span/Cradle stay; do not remap factory remasters. | `PQ-193.01` |
| Reverse is a jet | One honest nozzle. Stop the leftover needles. Do not stack a second trail. | `PQ-193.02` |

### Wave B — the object already on camera

| Do this | In owner words | Leaf |
|---|---|---|
| Buoy, beacon, cargo pod | Same slot. Manufactured at 144 WU, not tube-plus-ring. | `PQ-193.03` |
| 47-A family + TOW can | Same cans and wreck the mission already uses. Model first if hitch still owns the wiring file. Do not invent a second prop. | `PQ-193.04` |
| Drone, gate, mine, wreck, mass seed | Gate: upgrade `place_gate_jump_ring.glb`, kill the hoop fallback. Drone entity: use the place drone after it looks like hardware. Mines / mass seed / snare: commission only if the shelf has nothing. Generic wreck: aftermath pieces if they beat the tube. | `PQ-193.05` |

### Wave C — one flyable remaster at a time (already queued)

Do not start while Wave A is a lie. Do not duplicate Hornet or liner G7.

| Do this | In owner words | Leaf |
|---|---|---|
| Hornet | Chase-camera form. Not seats. Not garnish. Residual. | `PQ-050.01` |
| Then Drifter → Ranger → … | One ship. Hitch-plus or keep the last live file. | `PQ-050.02`–`.12` |
| Then live Ashline / Helios / work boats | Remaster the **live** body. Factory `*_production_v1` only after that exact file is packaged and better. | `PQ-050.13`–`.22` |
| Liner acceptance | Natural route, G7. Not a second express hull. | `PQ-049.05` |

### Wave D — shelf that already beats live

| Do this | In owner words | Leaf |
|---|---|---|
| Corsair | Stop sharing the pirate Rig. Foundry Blade if chase stills win. | `PQ-193.06` |
| Arclight | Rare Helios heavy. Does not steal Span or Atlas. | `PQ-193.07` |
| Tanker + inspection cutter | Enclose first. Spawn only after they read as ships. Tug is already in the world. | `PQ-193.08` |
| Faction kits | Span + Wasp kits, three trade-hub overlays. No new faction system. | `PQ-193.09` |

`PQ-136` already routed wrecks, everyday kit, occupational craft, and wrote the 2026-08-24
triage. Do not re-field those packs. Use that shelf here.

### Wave E — places in the game

| Do this | In owner words | Leaf |
|---|---|---|
| Dock, hulk, debris | Pass in the running game, not only in Blender. | `PQ-193.10` |
| Helios lane marks | Tally, claim, ash pin, whistle — no cube foot. Cold locker rides this look. | `PQ-193.11` |
| Station fallback | Fat cylinder never on the default route. Every reachable station loads its GLB. | `PQ-193.12` |

### Last — commission, then throw away

| Do this | In owner words | Leaf |
|---|---|---|
| Commission | Only a named default-route hole the shelf cannot fill (47-A cans if no cousin wins; disc mine; mass seed). After Waves A–B. | existing `PQ-193.04` / `.05` — **no new leaf** |
| Construction rig / barge B / tanker B | After the live barge and tanker are true. Enclose, then a job. | later row under `PQ-193` if still needed |
| Painted planet plates | Put the two PNGs on a retail root. Sky. | later; not §13D Wave A |
| Retire | Blocked Pelican/Wasp shells. Factory clones of dedicated packages. Hitch extras as live options. Incubator donors (do not copy). shipKit heroes. Code gate hoop after the GLB holds. Modular kit as a published ship. | ledger / triage — do not delete in a research session |

---

## Keep / improve / throw away / never start

**Keep.** Hitch. Wasp. Live Helios civilians and work boats that already publish. Yard
tug. Routed kit and wreck packs. Kit parts as *parts*.

**Improve.** Reverse jets. Opening modular NPCs and the recovery tug. Lane furniture.
47-A cylinders. Gate GLB. Factory player hulls after they actually publish. Live
Ashline / Helios / occupational remasters, one at a time, chase camera.

**Throw away (stop wiring).** Accessory Pelican/Wasp. Factory clones. Dead shipKit
heroes as the “real” NPC. Needle-on-needle retro. Procedural fallback hulls. Glow
cards. Unpackaged factory remaster remaps.

**Never start.** A new ship while Corsair, Arclight, tanker, cutter, or a foundry kit
can fill the hole. Variety before the Helios flyby is true. A second Hornet or liner
packet. Hitch remaster. Seats. Distant LOD as “looks broken.” Making Hitch cheaper.

---

## Performance (equal picture)

Spend on residency, meshopt/KTX2 packages, join-by-material, and not permanently
residenting a new fleet. Do not turn down shadows, bloom, population, or Hitch
detail. Distant LOD1/2 selectors stay later. Garnish hide at a speck is the
ceiling — never a cheaper species of ship. Process:
[`DYNAMIC_GRAPHICS_INVESTIGATION.md`](./DYNAMIC_GRAPHICS_INVESTIGATION.md).

---

## First dispatch

```text
node scripts/program-dispatch.mjs --id PQ-193
```

Take `PQ-193.00`. Stay off the Hitch freeze set and any live `NOW.md` exact path.
