<!-- LIFETIME: STABLE -->
# INFERENCE — Intentional Fun OS

Operator prompt: [`INFERENCE_INTENTIONAL_FUN_GOAL.txt`](./INFERENCE_INTENTIONAL_FUN_GOAL.txt).
Execution contract: [`INFERENCE_LANES.md`](./INFERENCE_LANES.md). Feel guts still:
[`FUN_CONVERGENCE_LOOP.md`](./FUN_CONVERGENCE_LOOP.md). Ranking overlay:
[`CENTRAL_BRAIN.md`](./CENTRAL_BRAIN.md). Product: [`../VISION.md`](../VISION.md).

This is **not a packet, not a queue, not a second game path.** It is an
**overlay** on [`INFERENCE_LANES.md`](./INFERENCE_LANES.md) when the deficit
is a busy sim with no designed moment. General INFERENCE — think, complete,
rotate — still owns the run. Fun Loop still owns guts. Use the twelve tiles
when composing a place. Do not require them for every INFERENCE unit.

## 0. The failure this exists to end

INFERENCE currently detects **counts** (more enemies, more weapons, more zones). The Fun Loop
exists for **guts** (clamps, shove, camera). Neither one owns **the moment**:

> A pirate is chasing a freighter past a rock. You can shoot, shove him into the rock, or rope
> the rock and fling him. A patrol can see it.

Encounters already declare `situation × place × twist × actor`, but `place` is a zone-type
string. World dressing then scatters kit around stations. Missions spawn archetypes. The
player gets a busy sim that does not feel designed. Agents shop ninety place GLBs and thirteen
hulls, or they drop code cylinders, or they add another enemy row.

An intentional game is combination, not inventory. Agents need a **small language**, a way to
**inspect the set they just placed** (bind table, spawn, numbers), and a **fun number on that
set** — then one production change. They do not need a capture campaign.

## 1. What an INFERENCE unit is, here

One unit is **one intentional moment on a live route**, not a catalog, not a
gallery, not a receipt. CONSIDER still happens first (`INFERENCE_LANES.md`
§3.1): two or three real alternatives, then the winner whole. If the moment
is a mission, placement tiles are not enough — script, density, and
consequence still have to exist.

A moment is done when all of these are true:

1. **Sentence.** One line a stranger would recognize while playing. If it could describe any
   belt, it is not a moment.
2. **Tiles.** The pocket is authored from the twelve role tiles below, not from filenames.
3. **Bind.** Every tile resolves to a packaged Hitch-world body that `partsLibrary` will
   actually publish. No modular junk. No code cylinder as the object.
4. **Look.** Read the set: tiles, binds, `publishes`, distances, actors in radius. Trace the
   spawn owner. A chase still is optional when a GPU is free and the remaining doubt is
   “does this look like one game.” It is never the close gate.
5. **Play.** On a fixed seed: at least two physical solutions, a consequence from a committed
   action, and a fun-metric movement (verbs/min, consequences/action, or nothing-happened
   seconds). Feel guts still go through the Fun Loop; this OS does not retune flight by adding
   rocks.
6. **Reachable.** Default route or Crucible — no flag, URL, or debug key.

`implemented` is enough. Do not hold the unit hostage for a headed soak.

## 2. The twelve tiles (the authoring primitives)

Author in **roles**. Render in **whole bodies**. Collision may use circles/capsules/boxes;
those stay invisible (`collisionProxyManifests.js`).

### Place tiles — terrain toys

| Tile | Player verb | Bind from (live maps, not a grep) |
|---|---|---|
| `rock` | slam, sling, hide | named rock GLB / generated rock family already on the route |
| `wreck_spine` | cover, throw mass | wreck-aftermath hero hull, not a fragment confetti pile |
| `cargo_can` | tow, spill, steal | `place_cargo_pod_standard` / generic tow can |
| `dock_apron` | jam, berth, transfer | freight platform / improvised dock |
| `gate_ring` | corridor, checkpoint | live `place_gate_jump_ring.glb`, never the hoop fallback |
| `machine_mast` | environmental verb | crusher / radiator / extraction / drill already in the everyday kit |

A yard is `dock_apron` + `cargo_can` + a service light. That composition is legal because
those are separate world objects. A ship is never hull + engine + wing.

### Actor tiles — physical problems

| Tile | Physical problem | Bind from |
|---|---|---|
| `light` | ammunition / positioning | Wasp / swarmer-class complete body |
| `heavy` | moving terrain | Bastion / bruiser-class complete body |
| `hauler` | cargo with a destination | Mule / trader complete body |
| `patrol` | witness who must choose | Concord / lawful traffic complete body |
| `specialist` | one readable gimmick | an existing specialist silhouette, not a new hull |

The agent never types a hull filename into a set. The bind table does.

**Illegal tiles:** a visible box, a modular ship part, a unique hero GLB as the authoring
id, a second Hitch, a cheaper stand-in while a body loads.

## 3. The agent loop (every INFERENCE unit)

```text
SELECT  →  SPEAK  →  COMPOSE  →  LOOK  →  PLAY  →  SHIP
```

### SELECT

CONSIDER first. Then pick the weakest **exposed** moment, not the easiest
registry gap. Do not ship the first pocket shape that compiles.

Order:

1. Fun Loop / Crucible guts if Package 0 is still unaccepted and the unit is feel
   (`FUN_CONVERGENCE_LOOP.md`). Do not hide a handling bug inside a new wreck field.
2. Else a default-route pocket the player actually flies (Helios opening, Ceres first hop,
   a live set piece) that is scatter, empty, or generic.
3. Else `node scripts/inference-detect.mjs --scope INTENTIONAL` once. Take the
   `intentional` cell if present; never pass `N` to the detector.

A count of “too few enemy types” does not outrank a camera that sees no verb.

### SPEAK

Write the sentence and the grammar in the set record:

```text
sentence:  <stranger-readable line>
situation / place / twist / actor:  existing encounter-shape vocab
tiles:     [{ tile, dx, dz, rot }]
actors:    [{ tile, count, hostile }]
seed:      integer
sectorId:  live sector
```

Copy the cluster shape from `src/data/worldOneOffs.js`. Do not invent a layout engine.

### COMPOSE

Spawn through the live owner: `world.js` `_spawnPlaceProp` for place tiles, the encounter /
traffic owner for actors. Atlas registration only if the moment is map-visible
(`src/data/PLACE_REGISTRATION.md`).

### LOOK

Inspect **this set** without a capture campaign (owner 2026-09-16):

1. Print the record: each tile, its bind, whether `partsLibrary` publishes it, radius, offset.
2. Trace the spawn: `world.js` `_spawnPlaceProp` / the encounter owner actually creates those
   ids on the sector’s dressing substrate.
3. Print distances: toys the verb needs (rock, can, mast) sit inside a usable radius of the
   actors.
4. Optional: if a GPU is free and the remaining doubt is purely visual, look once at chase
   camera and delete the still. Timed-out Chromium never blocks the unit.

Ask, from that evidence:

- Would a stranger know what this place is for from the sentence plus the tile list?
- Are the toys (rock, can, mast, wreck) close enough to use?
- Does every bind publish a complete Hitch-world body, not a hoop, diamond, or modular junk?
- Could this tile list describe any belt? If yes, rewrite the sentence and move tiles.

If yes to the last, the set is not intentional. Move tiles. Do not add more species. Do not
shoot a museum of every GLB.

### PLAY

Same seed, before and after. Prefer the existing measurer
(`scripts/measure-fun-loop.mjs`) pointed at the set. Minimum printed numbers:

- consequences per committed action
- time to first consequence (seconds)
- nothing-happened seconds
- two-solution proof (physics path and gun path, or two verbs)

Keep only if at least one fun number moved toward “something happens” and the look questions
did not get worse. Ties revert.

### SHIP

Commit the production slice. Record:

```bash
node scripts/inference-record.mjs unit \
  --id <slug> --wf <WF-03|WF-08|WF-02|WF-15|WF-01> --mode opportunity \
  --verdict implemented --verification focused_green \
  --commit <sha> \
  --reason "<sentence>" \
  --fp "verb=<verb>,set=<id>,tiles=<tile+tile>,sector=<id>,domain=intentional"
```

Then the next moment. Stop at `N`, or when every remaining pocket collides with a live
`NOW.md` hunk.

## 4. How this sits on the existing machine

| Already live | Job in this OS |
|---|---|
| `INFERENCE_LANES.md` | Still the execution contract. `N` is production units. |
| Fun Convergence Loop | Guts of flight/combat. Crucible first. This OS does not replace it. |
| Central Brain / `manager_cycle.py` | May rank; may not admit a PQ. Prefer `INFERENCE 1 INTENTIONAL`. |
| Encounter `shape` | The sentence grammar. Extend with a set id, do not fork a second shape. |
| `worldOneOffs.js` | Layout format to copy. |
| Everyday kit + wreck pack | Bind tables for place tiles. Collapse 90 files to six tiles. |
| `enemies.js` roles | Bind tables for actor tiles. Physical problem, not HP. |
| Collision proxies | Geometric primitives. Never rendered. |
| `inference-detect.mjs` | Add an `intentional` cell; do not let structural counts starve it. |
| `asset-gallery` scenario | Unimplemented. Replace with set/tile gallery, not a museum. |

Workflows this OS usually fires: **WF-03** (pocket), **WF-08** (activity), **WF-02** (actors
in the pocket), **WF-01** (witness/work), **WF-15** only when the moment is a feel defect.
WF-11 (new art) is last, and only when a tile has **no** Hitch-world bind.

## 5. Support cap (so the OS cannot eat the game)

Support work is allowed only to make the current moment honest:

| Allowed once | Forbidden as a campaign |
|---|---|
| One bind table (`src/data/setTiles.js`) | A parallel partsLibrary / filename catalog |
| One authored-set module (`src/data/authoredSets.js`) | A greybox renderer of visible boxes |
| One gallery command that spawns a set or a tile family at chase camera | Graphics-lab as the production viewer |
| Pointing `measure-fun-loop` at a named set | Rebuilding the Fun Loop measurer |
| One detect cell named `intentional` | A new PQ, a second queue, a review institution |

A gallery with no new pocket on the default route is support-only and **does not count** as
a production unit. If two support-only commits land without a player-facing pocket, stop that
line and ship a set.

## 6. Build order (the plan to stand the OS up)

Do not pre-build all tools. The first production unit *is* the first intentional pocket.
The bind table is data that pocket needs.

### Wave A — language + one pocket (production)

**Done when:** a stranger flying the default Helios→Ceres hop can name the pocket’s verb
from the sentence and the tile list, every bind publishes, and spawn is deterministic on a
fixed seed.

Files:

- Create `src/data/setTiles.js` — the twelve tiles, bind functions, `publishes: true` only
  when the live map will load the body.
- Create `src/data/authoredSets.js` — first set on Ceres or Helios, cluster format copied
  from `worldOneOffs.js`.
- Modify `src/systems/world.js` — spawn authored sets through `_spawnPlaceProp` (same
  dressing substrate, dedicated salt so combat RNG does not shift).
- Test: `test/authored-sets.test.mjs` — every tile bind publishes; the first set’s placeIds
  exist in the packaged release; spawn is deterministic on a fixed seed.

Do not author new GLBs. If a tile has no honest bind, drop that tile from the first set.

### Wave B — inspect (support, one command)

**Done when:** a command can print the set’s tiles, binds, publish flags, and distances
without opening a browser. `node scripts/kit-gallery.mjs --set <id>` is that dump (JSON).
A chase still is optional and must not be the done-when. Do not build a museum of every GLB.

### Wave C — play numbers on a set (support, narrow)

**Done when:** `node scripts/measure-fun-loop.mjs --set <id> --seed 4242` prints the four
fun numbers in §3 PLAY. Do not repair every historical “not measured” gap in old receipts.
Only make the set path print.

### Wave D — detect + prompt (control plane)

**Done when:**

- `inference-detect.mjs --scope INTENTIONAL` offers an `intentional` cell that names a
  live pocket (empty camera / generic scatter / low consequence), not a registry count.
- `SCOPE_MAP` in `scripts/lib/inferenceCore.mjs` includes `INTENTIONAL` → WF-03, WF-08,
  WF-02, WF-01, WF-15.
- This file and the goal prompt are the operator surface.

### Wave E — run it

```text
INFERENCE 5 INTENTIONAL
```

Copy `INFERENCE_INTENTIONAL_FUN_GOAL.txt`. Five sequential moments. Crucible guts if a feel
bar is the actual blocker; otherwise five pockets/activities. No new art unless a tile is
unbound.

## 7. How agents get this wrong

- **Thin volume.** Three tile lists with no script, no density, no
  consequence. Same failure as three board rows.
- **Skipping CONSIDER.** First pocket that compiles.
- **Capture stall.** Headed stills, frame strips, or Chromium as the review method. Inspect
  the bind and print a number. GPU failure never blocks the unit.
- **Greybox picture.** Visible boxes/cylinders as the set. Hitch-world law forbids it.
- **Ship kitbash.** Modular parts as actors. Already failed.
- **Filename authoring.** Sets that name `place_aftermath_wreck_corvette_forward__stripped_heavy`
  instead of `wreck_spine`.
- **Content to hide thinness.** More pirates in a shapeless belt.
- **Feel via scenery.** Adding rocks to fake handling. Fun Loop owns guts.
- **Count repair.** Another enemy type because detect said the roster was thin.
- **Harness campaign.** Three weeks of gallery/measurer, zero pockets.
- **Second queue.** A new PQ for this OS. Rank through Central Brain; build through INFERENCE.

## 8. Report (owner words)

```text
DONE / NOT DONE  INFERENCE n/N INTENTIONAL — <the sentence>
WHAT I FOUND     one line: scatter, empty, or a guts clamp
WHAT I CHANGED   one line: tiles moved, listener connected, or clamp removed
WHAT YOU WILL FEEL   two sentences: the pocket; what still is not
THE NUMBERS      consequences/action | nothing-happened s | before | after
THE LOOK         bind publishes? toys in range? not any-belt?
NEXT             the next pocket, or Fun Loop if guts are the blocker
```
