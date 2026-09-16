<!-- LIFETIME: DURABLE -->
# Dynamic graphics — how the picture arrives, and how to improve it

Research only. No modeling, no wiring, no Hitch edits, no new queue.
Written 2026-09-09 against live code, not a filename catalog.

Law for the *objects*: [`MODEL_STOCKTAKE.md`](./MODEL_STOCKTAKE.md).
Tables: [`MODEL_STOCKTAKE_MANIFEST.md`](./MODEL_STOCKTAKE_MANIFEST.md).
Order: [`MODEL_STOCKTAKE_PLAN.md`](./MODEL_STOCKTAKE_PLAN.md).
This file is the *process*: admission, residency, culling, LOD, and quality cuts.

Owner bar, in owner words:

- Hitch, default quality, and the ship in the chase frame stay full.
- A stranger must not see a box, a blank lock, or a cheaper species of ship.
- If a stranger can tell detail was dropped, too much was dropped.
- “Shave a little” is a fastener at a few dozen pixels. It is never a worse hull.

---

## 1. Owner report (one page)

The game is a **table**, not a horizon sim. Default chase is **144 WU**. Close is **58**.
Manual zoom-out tops out around **330**. The readable glass is about **170 × 100 WU** at
default. “Far” for a ship is **across the disk** (projected pixels), not walking up to a
mesh. Background planets are sky. They are not a hull-LOD problem.

The live path already knows this. Submit, decode, and eviction are measured in **seconds
of travel**, not thousands of world units. Stations keep one authored body and only hide
flourishes when they are tiny. The player ship is forced to full detail. Adaptive
resolution only shrinks the **internal** picture after a sustained ~48 ms stall, and it
never writes the video settings the player chose.

The horror stories are already in the code, not waiting to be invented:

| What the owner sees | What the code is doing | First owner |
|---|---|---|
| Lock sits on empty air, then a ship pops in | Live play mounts a **zero-draw substrate**, then publishes a GLB. If the file is not on the empty-admission list, or decode/compile finishes after the ship is already on glass, the lock is blank. | `PQ-193.00` |
| Engine and glow in empty air, then “it becomes a ship” | Modular kit is still the published identity for opening **smuggler / pirate** traffic and the **recovery tug**. That is a stand-in species, not a loading spinner. | `PQ-193.00` / `.01` |
| Zoom-out turns the fleet into boxes, then they blip into ships | Whole-GLB swap **exists**, but today it **bails** unless the cheaper file is packaged-live. Hitch LOD1/2 are packaged and unused (player stays full). Wasp/factory LOD1/2 are **not** on the live allowlist. Zoom-out does **not** thrash hulls today. | Do not start. Later garnish only. |
| “Shave a little” becomes a dump | Agents read a perf brief as “cheaper species / fewer triangles / blurrier default.” The live HLOD path already forbids a silhouette proxy. | Process law. Not a new packet. |
| Hitch gets cheaper so the field can stay busy | Player is LOD0. Adaptive quality does not touch `settings.video`. Hitch campaign (`PQ-129`) already bans quality cuts. | Keep that ban. |

**The improvement is not a LOD authoring campaign.** It is: finish the ship **before**
the glass can see a lie; never publish a junk species while waiting; keep the chase-frame
ship full; hide only a fastener when the contact is a speck.

First production unit is still `PQ-193.00`. This file does not change that.

---

## 2. Live pipeline (what actually runs)

One path. Browser and Electron share it.

```text
New Game / Continue
  → finite first-picture cohort (exact roots only)
  → zero-draw ship substrate
  → decode / compose / compile on the runway
  → publish the authored body
  → submit only on the glass
  → per-frame pixel LOD (player forced full)
  → station/place garnish hide at a speck
  → emergency internal resolution only
```

### 2.1 First picture

`src/render/openingAdmission.js` freezes a **finite** set of identities at the loading
handoff. Later traffic cannot grow that blocking set. Timeouts and “wait for whatever is
pending” are not a substitute.

`src/render/openingSubmissionPlan.js` compiles and uploads only leaves that are actually
in that first picture. `latePipelineAdmission.js` compiles everything else **after** that
set, still behind the loading shell when it can.

This is the right shape. The defect is not “compile the whole sector.” The defect is
handing the player a **changing canvas whose on-glass ships are still empty substrates**.

### 2.2 Empty substrate, then publish

Live play sets `directAuthoredMount: true` in `src/render/renderer.js`. Every ordinary
ship is an invisible group (`directAuthoredAdmissionSubstrate` in
`src/render/visualOverrides.js`): zero temporary drawables, no procedural hero, no
kitbash stand-in.

The authored GLB is the first visible identity **if and only if**:

1. `wholeShipVisualForEntity` picks a file, and
2. that file is in `PACKAGED_LIVE_WHOLE_SHIP_FILES` in `src/render/partsLibrary.js`.

`WHOLE_SHIP_FILE_BY_DEF_ID` naming a file is **not** publishing. Hitch (player) and any
Wasp are the only **required** whole-ships today. Factory roster hulls are packaged and
mapped and still omitted from the empty-admission list. Express maps to the liner; the
liner is not on that list.

If publish fails, `settleAuthoredShipToProceduralFallback` **refuses** to unhide an empty
substrate. That is correct (no junk hull). It is also why a lock sits on blank space.

Modular kit still substitutes when there is **no** whole-ship map at all — opening
smuggler / pirate traffic, and the official recovery tug (`ship_mule` + a dead
`assetRef`). That is the box-then-ship story on the default New Game.

### 2.3 The table, not a horizon

`src/render/tabletopPolicy.js` (live numbers):

| Gate | Time | Meaning |
|---|---|---|
| Submit approach | 0.75 s | Fast crosser may sit just off-glass so it does not pop |
| Mesh prefetch | 2.0 s | Decode/build runway |
| Mesh evict | 2.5 s | Past prefetch so lip oscillation does not thrash |
| Authored decode | 4.0 s | GLB may take a couple of seconds; start earlier |
| Immediate authored | 1.25 s | Already next to the glass |

Default glass is ~170 × 100 WU. Prefetch is **glass plus those seconds of travel**, not
a 900–2400 WU fake-visible box. Hearing, AI sleep, and VFX follow the same table.

`src/render/authoredAdmissionPolicy.js` asks: is this entity already eligible, or will it
be inside a bounded horizon? Player, current target, forced-render, and the starting hub
are always eligible. Everyone else needs glass, the immediate radius, or a **closing**
approach. A ship sliding sideways along the rim with closing speed ≤ 1 does **not** start
decode. That is a real late-pop hole for crossing traffic that is not aimed at the camera.

### 2.4 Submit vs residency

`src/render/entityMeshVisibility.js`: roots on the **runway** stay resident and stay
**hidden**. They are not drawn until the activity frame promotes them onto the glass.
`pipelinesPending` also holds ordinary roots until the shader actually linked.

This is the good version of “don’t show junk.” The bad version is the same hold after the
player can already lock the contact. A targeting reticle on empty air is a published lie.

Inner vs middle band (`entityViewSyncBand.js`) only changes **how often closures run**.
It does not hide a readable on-glass ship. Player and force-render roots never hide on a
transient publication gap.

### 2.5 Per-frame LOD (cheap, and mostly unused)

`src/render/lod.js` picks from **projected pixel width**, not world distance:

- LOD0 above ~120 px
- LOD2 below ~45 px
- 25 px hysteresis so a ship on the lip does not flicker

Player is forced LOD0 in `renderer.js`. Non-player ships *may* demote only if
`wholeShipLodPolicy.js` sees a real LOD1/2 sibling **and**
`installWholeShipLodFamilyController` can load a **packaged-live** file. If the sibling
is not on `PACKAGED_LIVE`, the controller **bails and keeps the current body**.

Live allowlist today: Hitch LOD0/1/2 (player never demotes), Wasp LOD0 only, Helios and
work boats **with no LOD family**. Factory `*_production_v1` LOD families are catalogued
in `WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID` and are **not** packaged-live. Remapping those files
is the bug that already made traffic invisible.

So: **zoom-out does not swap hulls today.** Per-frame work is pixel size, maybe hide a
tagged flourish, drop a shadow caster, skip closures on a speck.

### 2.6 Station / place HLOD (the only safe “shave”)

`src/render/hlod.js` keeps **one authored identity**. Far LOD may hide meshes tagged
greeble / decal / nav light / fan / antenna. It explicitly forbids a generic silhouette
proxy. `proxyDisabledReason: 'stable-authored-identity'`.

That is the ceiling for “shave a little.”

### 2.7 Shadows

`src/render/shadowCasterPolicy.js`: player always casts. LOD1/2 contacts do not pay the
key-light depth pass (contact shadow is enough). LOD0 casts only inside the local
±280 WU ortho. This drops **casters**, not hulls. Keep it.

### 2.8 Adaptive resolution

`src/render/adaptiveQuality.js`: internal `dynResScale` only. Never writes
`settings.video`. Floor ~0.6. Steps of 0.05. Only after ~1.5 s of sustained ~48 ms
frames, then a 4 s cooldown because reallocating bloom targets **is** a hitch. Healthy
GPU stays at 1.0.

This is an emergency GPU valve. It is not a model LOD. Do not make it more aggressive
as a substitute for admitting complete bodies.

### 2.9 Hitch campaign (already measured)

`PQ-129` named the bricks. Leftover Continue / sector admission (`PQ-129.09`, the old
`PQ-054` leftover) was **rejected**: real Continue plus a public sector boundary produced
**zero admission-owned hitches**. Compose-slice and next-contact-warm were also rejected
on the same grounds.

So: “admission hitch” is not the open problem. **Blank lock and kitbash identity** are.
Do not reopen `.09` to “fix pop-in” with a cheaper stand-in.

Wave C leaves that would tighten the glass, batch unique hulls, or add cheap fighter LOD
(`PQ-129.11`–`.14`) are **deferred / no-op** after the 2026-08-24 crowded census. The
packet’s current next leaf is table cadence (`PQ-129.15`) if sim is still fat — sleep
**off-table** AI, not a worse on-glass ship.

`PQ-052` / `PQ-053` / `PQ-054` exist as **program rows in `build_map.md`**. They are not
live queue ids. Do not mint them again.

---

## 3. Failure classes (judge the process, not the slogan)

Agents fail this system in five repeatable ways. The owner’s stories are these classes.

### A. Late pop-in (already on screen, then it appears)

**Cause.** Empty substrate is already the lock target. Decode, compose, or
`pipelinesPending` finishes after glass entry. Or a ship is on the rim with closing
speed ≤ 1, so authored prefetch never starts.

**Wrong fix.** Show a box / engine / glow “so something is there.” That is class B.

**Right fix.** Admit and require the complete body (`PQ-193.00`). Prefetch on the
runway so publish wins the race. If it cannot win, keep the contact **off the glass
and off the lock** until the body is the first picture — never a junk species.

### B. Box-then-ship (a cheaper species, then the real one)

**Cause.** Modular kit, procedural fallback, or an unpackaged remaster remap. The
player watches an engine in empty air, or a rounded kit hull, then a different ship
replaces it.

**Wrong fix.** “At least they see a silhouette.” The owner can tell. That is the defect.

**Right fix.** Empty substrate until the **same** complete body publishes. Opening
smuggler / pirate and the recovery tug get a real hull (`PQ-193.01`), not a better
kitbash.

### C. Over-cut (“shave a little” → dump)

**Cause.** A brief says LOD, HLOD, impostors, or “distant fleets become cheap.” The
agent swaps bodies, strips panels, or lowers default quality.

**Wrong fix.** Hitch LOD2, Wasp LOD2 on the live allowlist, factory `*_lod1` remaps,
silhouette proxies, bloom/shadow/population cuts.

**Right fix.** Hide a tagged fastener when the contact is already a speck (~45 px and
below, with hysteresis). If a stranger can name what vanished, revert the hide.

### D. Hitch dump

**Cause.** Perf gate failed; cheapest lever is the player ship or default video.

**Wrong fix.** Demote the player. Cut bloom, shadows, scale, or on-glass population.
Record a golden that expects a worse picture.

**Right fix.** Structural work already on `PQ-129`: cadence, batching, residency,
admission of **the real body** before present. `docs/AGENT_LESSONS.md` already rejects
quality cuts and triangle trims as the performance plan.

### E. Fake horizon

**Cause.** Someone treats 330 WU zoom-out like a flight-sim far clip and builds
impostor cards or a 900 WU submit box.

**Wrong fix.** Grow the table. Swap every traffic ship to a billboard. Shrink hail
5200 or region fade 1500 and call it a 3D cull (`PQ-129` already forbids this).

**Right fix.** Keep glass + seconds-of-travel. Background planets stay sky plates
(the two missing PNGs are a later bundle hole, not Wave A).

---

## 4. What “shave a little” may mean

Allowed, later, and only after Wave A is true:

1. **Garnish hide** already in `hlod.js`: greeble, decal, nav light, fan, antenna —
   and only when projected size is a speck (LOD2, ~45 px). The hull, canopy, and
   silhouette stay.
2. **Shadow caster drop** already in `shadowCasterPolicy.js`: tiny or off-ortho
   contacts stop paying the key-light depth pass. The mesh stays.
3. **Closure skip** on the middle band: off-glass roots do not run expensive
   per-frame garnish. They do not change species.
4. **Internal resolution** already in `adaptiveQuality.js`: emergency only, recovers
   on a fast GPU, never persists.

Not allowed, even later, without a new owner decision:

- A second, cheaper **species** of the same ship on the live allowlist.
- Impostors, silhouette proxies, or camera-facing cards for hulls.
- Player / Hitch demotion.
- Default-quality cuts (bloom, shadows, particles, population, scale).
- Remapping unpackaged `*_production_v1` LOD files.
- Showing modular kit “until the real GLB lands.”

The test is not a triangle count. The test is a stranger at the shipping chase camera.

---

## 5. How the process should work (refine this, do not replace it)

Order of operations for any contact that will hit the glass:

1. **Know the identity** — a packaged complete body on the empty-admission list.
   Modular kit is parts, not a published ship.
2. **Start decode on the runway** — glass + 4 s of closing travel, or immediate
   radius. Do not wait for the lock.
3. **Compose and compile off-glass** — two-build/frame drain is already the mesh
   budget. First-draw program link stays off the present beat when possible.
4. **Publish the same body** — first visible identity is the authored hull.
5. **Promote to the glass** — submit only when the body is the thing the lock will
   sit on.
6. **Keep the chase-frame ship full** — player LOD0. Nearby readable contacts stay
   the same species.
7. **Hide fasteners only at a speck** — existing HLOD tags. No body swap.
8. **Evict past the lip** — 2.5 s, so oscillation does not thrash.

If step 1 is missing, stop. Do not invent a box for steps 2–4. That is how agents
turn “shave a little” into a second game.

If step 2 loses the race (closing-speed hole, or a ship that teleports onto glass),
the contact stays invisible and **un-lockable** until step 4 — or the prefetch
window is widened for that crossing. Widening the window is a table number, not a
worse mesh.

---

## 6. Ordered improvements (existing leaves only)

No `PQ-194`. No new `PQ-193` leaf. Distant LOD selectors stay later, as the
stocktake already said.

### Now — Wave A (identity). Do this first.

| Do this | Why it fixes the process | Leaf |
|---|---|---|
| Admit and **require** every lockable roster hull and the liner | Empty substrate can publish. Blank lock dies. | `PQ-193.00` |
| Opening smuggler / pirate and the recovery tug become complete ships | Removes the live box-then-ship on New Game. | `PQ-193.01` |
| Reverse is a jet | Unrelated to LOD; still on-camera. | `PQ-193.02` (parallel) |

`PQ-193.00` is also the admission-process fix. Do not reopen `PQ-129.09` or invent
a leftover `PQ-054` leaf for the same blank lock.

When `.00` is implemented, keep these process rules in the same change:

- Accessory-only modular junk never substitutes **while waiting**.
- Do not remap unpackaged factory remasters to “have a LOD.”
- Targeting a required whole-ship must not sit on the empty substrate.

### Next — table race (only if blank lock remains after `.00`)

If a packaged required body still pops after glass entry, the bug is the **race**,
not the mesh:

- Closing-speed ≤ 1 skips prefetch (`authoredAdmissionPolicy.js`). Crossing traffic
  that is already inside the 4 s decode radius should still start.
- `pipelinesPending` must not outlive glass entry for a required body that was on
  the runway.
- First-picture cohort must include the on-glass ships the player can lock at
  handoff — not “Hitch only, everyone else after the shell.”

Own that repair on the **already-dirty admission/renderer files** when a smoothness
lane is not live on them. Do not start a parallel admission packet. `PQ-129` may
name the hitch if a headed witness shows a >32 ms brick; the **visual** failure
stays `PQ-193.00`.

First-use-keys work in flight (spatial collect around prefetch) is a different
writer. Do not fight that hunk. The race fix is the same runway numbers.

### Later — tiny garnish only (not a remaster wave)

After the opening flyby is true:

- Keep `hlod.js` as the only body-preserving shave.
- Tighten tags if a fastener is still drawing at a few dozen pixels. Do not hide
  a panel a stranger can name.
- Do **not** put Wasp/factory LOD1/2 on `PACKAGED_LIVE` until chase stills prove
  they are the same ship, not a box.
- `build_map.md` `PQ-053` (“far impostors”) is a **paper row**, not a dispatch
  unit. If it is ever activated, rewrite it to **garnish-only, no proxy, no Hitch
  dump**. Until then, ignore it.
- `PQ-129.14` (“cheap LOD for tiny on-glass fighters”) is deferred/no-op. Do not
  revive it as a hull-swap campaign.

### Not this process

Waves B–E of the stocktake (tubes, remasters, shelf, places) are **object** work.
They do not need a dynamic-graphics rewrite. Painted-planet bundle hole is sky.
Construction-rig job is later.

---

## 7. Packet fold (where this lives)

| Already owns it | What this investigation adds |
|---|---|
| `PQ-193.00` | Blank lock and “no junk stand-in” are the same leaf. Process: publish the complete body before the lock is honest. |
| `PQ-193.01` | Box-then-ship on the opening flyby is identity, not LOD. |
| `PQ-129` | Leftover admission hitch is closed. Do not cut quality. Do not revive `.11`–`.14` as a species change. Cadence may sleep **off-table** sim. |
| `PQ-053` paper row | Not a queue id. Impostors are banned by live `hlod.js`. |
| `PQ-054` paper row | Opening cohort already finite. Visual leftover is `PQ-193.00`, not a new admission packet. |
| Stocktake plan | Distant LOD selectors stay later. This file is the process behind that sentence. |

---

## 8. Evidence this session used

Live reads (not edited): `authoredAdmissionPolicy.js`, `tabletopPolicy.js`,
`adaptiveQuality.js`, `hlod.js`, `lod.js`, `wholeShipLodPolicy.js`,
`openingAdmission.js`, `entityMeshVisibility.js`, `entityViewSyncBand.js`,
`shadowCasterPolicy.js`, `visualOverrides.js` substrate, `partsLibrary.js`
allowlist / LOD family / compose gate, `camera.js` zoom envelope, `PQ-129.md`,
`PQ-193.md`, `build_map.md` §13D and the `PQ-052`–`PQ-054` paper rows,
`program-queue.json` for `PQ-193.00` and `PQ-129.*`.

Stayed off live `NOW.md` writers: `renderer.js`, `partsLibrary.js` (smoothness
leftovers), first-use-keys collect/walkers.

Chase stills of pop-in: **unproven this session**. Tube / allowlist / empty-admission
behavior is proven in code and in the 2026-09-09 stocktake. Taste rows stay unproven.

---

## 9. What not to do with this file

- Do not start variety, Corsair, Arclight, or a LOD authoring campaign.
- Do not dump Hitch or cut default quality.
- Do not recommend glow blobs, second needle trails, or procedural fallback hulls.
- Do not treat `needed-assets.md` as live.
- Do not open `PQ-194`.
- Do not implement from this document in the same breath as reading it unless the
  dispatch unit is `PQ-193.00` and the paths are unclaimed.
