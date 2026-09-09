<!-- LIFETIME: DURABLE -->
# Visual world cleanup — one game, real jets, no floating parts

Owner playtest, 2026-09-08, Kessler / Helios opening, live Hitch starter.

The player ship reads as a ship. A nearby NPC reads as leftover blocks: an engine hanging
in empty space, pink glow blobs, a different construction language. Reverse thrust reads
as two laser needles off the bow. Those are not “a style we have not polished yet.” They
are a broken picture.

This campaign is for a **taste model** (Claude Opus 5 max, or equal). The controller does
not pre-solve the look. The worker picks among real options, then beats its first idea.

Admitted as [`PQ-193.01`](./roadmap/active/PQ-193.md) (hulls) and `PQ-193.02` (jets).
Dispatch `--id PQ-193` then leaf `.01`. The ordered board is [`../../build_map.md`](../../build_map.md) §13D.

Copy-paste operator: [`VISUAL_WORLD_CLEANUP_GOAL.txt`](./VISUAL_WORLD_CLEANUP_GOAL.txt).

---

## 1. The bar (plain words)

1. **One game.** A stranger, given a still of the player and a still of the nearest NPC
   traffic or combat hull, should not ask which title each is from. Role can differ
   (scavenger vs starter). Construction language cannot.
2. **Complete hulls.** No floating engine, wing, socket, or glow blob that is supposed to
   be attached. `FLEET_VISUAL_INTEGRITY.md` already forbids this; this campaign makes it
   true on the opening flyby, not only in a census.
3. **Reverse jets are jets.** Brake / reverse exhaust must read as force leaving a nozzle —
   the same *family* as the main drive (VFX technique standard, `engine-jet`). A stranger
   should not need a tooltip to know it is thrust. Two needles fail.
4. **Hitch is the floor, not the photocopy.** The live starter (HUD: Hitch) is good enough
   to stay. Do not dump it to match junk. Do not paste Hitch panels onto every NPC. Do not
   chase a more photoreal Hitch; the owner would rather a tighter industrial house style
   than a showroom render next to toys.

The standing VFX rule still applies: whatever you would ship, ask what 3× more attention
would produce, and ship that instead. `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`.

---

## 2. What is already true (do not rediscover)

- Hitch / Kestrel stay frozen as the player starter (`PQ-050` law). This campaign does
  **not** remaster Hitch.
- A volumetric retro path already exists (`PLAYER_RETRO_VOLUME_RECIPE`,
  `_updateRetroVolume` in `src/render/vfx.js`). On camera it still reads as needles. The
  recipe comments even praise a “needle silhouette.” That is the miss, not a missing
  system. There is also a leftover `_emitReverseNozzleTrail` path. Pick one honest jet.
  Do not stack a second needle on a failed volume.
- `PQ-190` owns the style *slice* (six things, then derived rules). This campaign is the
  **live-route cleanup** that slice assumed: broken NPC bodies and failed retro jets
  already in front of the player.
- `PQ-050` remasters other *flyable* player hulls, one ship at a time. Do not open a
  fleet remaster to hide one scavenger.
- `PQ-022` / orphan harvest may already hold a better unused body. Look before you model.
- Soft camera-facing squares/discs are never a designed object. Distant sky stars only.

---

## 3. Options (pick; do not follow a first guess)

The worker must name **which option it took and which it rejected**, in one short
paragraph, before the first visual commit. Inventing a better option is allowed.

### Hulls that look like another game, or fall apart

- Wire an unused remaster that already beats the live body at the chase camera.
- Rebuild that **role family** (scavenger / traffic / whatever is on camera) to Hitch-plus
  construction: manufactured shell, sockets that meet, materials that match the world —
  not a Hitch skin.
- Unwire the broken body and temporarily show the nearest **accepted whole-ship** of the
  same role so the player never sees a kitbash corpse. Then replace it for real.
- Harvest first (`ORPHAN_HARVEST_*`) if a finished hull is sitting off the route.

A factory loft of boxes cannot close. Hiding the gap with a glow blob cannot close.
Matching Hitch triangle-for-triangle cannot close.

### Reverse / brake jets

- Same volumetric family as the main drive, stubby and hard (the *intent* of the current
  retro recipe — the look failed).
- Short shock-structure sheets from the authored bow retro sockets.
- A geometry + volume hybrid that still dies when the player lets go of reverse.
- Something better that still reads as a braking jet at the 60° chase camera, default
  quality, no HUD overlays required.

Lengthening the needles, blooming them, or renaming them “plasma” cannot close.
A soft square / disc cannot close. Passing the gate by dimming the main drive cannot close.

---

## 4. Evidence (the only close)

Shipping camera, default quality, Hitch chase, HUD text hidden for the stills:

- Quiet reverse (hold S / brake) — jets readable as exhaust.
- The Kessler / Helios opening NPC that currently sheds parts — complete hull, same game.
- One other live traffic or combat hull on that route, so the first fix is not a one-off
  paint.

A critic that did not make the change names: which way the player is thrusting, and what
job the NPC hull has. Runtime witness: no new top frame-time bucket. Do not pass
performance by stripping authored Hitch visuals.

Headed capture only if it helps you choose. Delete process clips. Numbers-or-a-looked-at
still; never a stored video as the deliverable.

---

## 5. How agents get this wrong

- Writing a shader recipe in the plan and then executing it. This file is a bar, not a
  brief for a specific mesh or material.
- Remastering Hitch “a little” because it is nearby.
- Opening `PQ-174` or frontend screens.
- Calling the volumetric retro path “done” because the code comment says it is not an
  impulse anymore.
- Treating `check:vfx-techniques` green as the player having seen a jet.
- Marking `program-queue.json` done (PQ-022 owns it).

---

## 6. Relation to other doors

| Door | Use it when |
|---|---|
| This file | Live route shows mixed-game hulls, floating parts, or needle retros |
| `PQ-190` | Approving the six-thing style slice and deriving family rules |
| `PQ-050` | The next *flyable player* hull after Hitch |
| `GRAPHICS_3D_CAMPAIGN.md` | Code-built cans, hoops, toy props next to real ships |
| `FLEET_VISUAL_INTEGRITY.md` | Invisible ships, missing bodies, discontinuous space |
| `ORPHAN_HARVEST_*` | A better hull already exists off the route |
