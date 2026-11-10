# 17 — The Bolus cut

Pitch: a tow cable inside a throat. The light freezes the bugs. The tooth lies. The stitch is white. The cough is a lip, not a loading screen.

This is the expansion on top of doc 16. Doc 16 stays the sector contract (one fungus, no Vethari mesh, no second line, no new commodity, planar flight, no camera punch, fog `0x14060a` at `0.0022`, iris window `[2, 8)` of 20s, acid 2 hull/sec, population 89, colliders stay balls, `signatureToy` stays `explicitly none`). This doc is the readable throat: canal, silhouettes, and a retune of triggers that already exist.

Rejected, and not a gap if missing: a second grapple, a boss, a skill tree, a quest, a new UI app, a second movement mode, a second clock stacked on peristalsis, chimes, a decal engine, a scar chart, an orbiting bone, Ives dialogue, directional-pull teeth as a new rule, a louse flock system, suture-count gates, wall gravity, an oxygen clock, a rival pilot, a 26th sector, padding vertex dumps.

## Why the first pass is not a clip

Every body is a ball. There is no bank, no lip, no cough. Every shove is a drip under the limp speed of 22, so an 8 second mute clip reads as fog and dots. Releasing a drum writes its wander velocity on the same tick as the throw.

## What the clip has to show

One continuous throat. A near-bank crest you can park a ship under. A far bank lower than that crest. A mouth annulus at the Charon lip (`z = -2624`) and two cough sheets at the Ashfall lip (`2347, 1173`). Twelve iris blades. A false tooth that is a knob plus a barb. A white suture. Small bugs that splay when the cone stops them. A cable that goes straight and pale only while the uvula is held. Shoves you can count: tooth, iris, crest, baleen toll, pleat, glove.

## Tasks

- C1–C2 `src/render/bolusCanal.js`. Pure. `buildBolusCanal(seed)` returns named parts `{id, positions, normals, indices, color, kind}`. `mulberry32(hash32(seed, sector, 'bolus-canal'))` jitters ribs and bank vertices by about a unit. Mouth z, cough anchor, and gate centers do not move. `nearBankCrest`, `farBankCrest`, `mouthLip`, `coughLips`.
- C3–C4 `src/render/bolusSilhouettes.js`. `bolusSilhouette(speciesId, pose)`. Collider radius is not the mesh. Knob, tendon, tooth, and suture are one family and not deep-equal. Tendril is a fork. Aliases differ by one part: blister over lantern, cyst over floater, concretion over bezoar.
- C5 `src/render/bolusView.js`. `syncBolusView` beside `syncMarrowCone`. Group only while inside. No camera write. No second line. Starfield stays the cone's job.
- C6 `src/data/bolusForces.js` and `tickBolus`. One combined impulse per tick. Discontinuities are edges. Cilia is a terminal `+36` on Z inside `x ∈ [-1100, -820]`, never a cap on a faster ship, and it does not run during a kick hold.
- C7 `src/data/bolusAudio.js`. Four oscillator recipes: `bolus_latch`, `bolus_freeze`, `bolus_iris`, `bolus_crest`. No new wav, no new bus.
- C8 `test/bolus-cut.test.mjs`. No Three import.

## Canal contracts

- Near-bank crest: open ribbon, crest X in `[-1500, -400]`, crest Y the unique max at that Z and at least 48 above the lumen, `Δz / max(Δx, Δy) ≥ 8`. Color `0x3a0c10`. Shelf under it is `0x4a1014`.
- Far-bank crest: every X `> 700`, mean Y at least 24 under the near mean, not deep-equal. 
- Mouth: annulus at `z = -2624`, exactly two boundary loops, no vertex inside the inner radius, `|z+2624| ≤ 80`, outer radius `≥ 400`, shelf arc (`X < 0`) higher Y than the acid arc. Cartilage `0xc4b59a`.
- Cough: two flaps at the Ashfall gate, gap at least 80, each flat (`λmin/λmax < 0.2`), trailing separation greater than hinge separation, each flap spans at least 600 on X. Crease `0x8d2a32`, lip `0xd8c8b0`.
- A sphere fails the bank, the lip, and the cough.
- Iris: twelve blades. Open fraction is 0 / 1 / 0 at t = 0 / 3 / 8. Shut, the hole is at most 40 across.
- Lumen grid stays inside `x ∈ [200, 700]`. Acid normals tilt 12° along Z. Color `0x6a8a20`.
- Cilia lean `±18°` at 1.5 Hz while coasting, else rest. Baleen pitches `−25°` only on the boost edge. Ribs displace 48 radial on the crest and 0 while the tendon stall holds.
- Station collar around `{-980, -900}`. Buoy cage at `{-1100, -1700}`, visual only. Five lantern shafts, no damage.

## Silhouette contracts

- Tooth is the knob recipe plus one barb whose centroid is `+X`.
- Tendon is a strap with no bulb. Its color channels stay `≤ 0.45`.
- Suture is that strap in `0xf4f1ea` (channels `≥ 0.9`) plus a stitch, and it still wears tissue so the skin test passes.
- A stopped louse, fingerling, or mite gains exactly two splayed cards. Other species do not.
- Hauler plates leave a missing bay. Ring is a torus. Rib is a hook. Louse is a coin. Fingerling is a sliver. Mite is smaller than the louse.

## Forces

| Edge | Rule |
|---|---|
| Cilia | If `vz < 36` and `x` is in `[-1100, -820]`, set `vz` toward 36. Skip while a kick hold is up. Do not touch `vx`. |
| Crest | `+46` Z once when `floor(simTime/12)` changes. First tick stores the mark and does not fire. Suppressed while `bolus:peristalsisUntil`. Hold `bolus:crestHoldUntil` for 1.8s. |
| Iris | Shut, first contact in `|z-400| < 90` and `|x| < 900`: `±48` away from `z = 400`. Exactly `z = 400` signs `−Z`. Then 1.2s quiet (`bolus:irisBumpUntil`) and 0.5s kick. Open window and hush add nothing. `|x| > 900` skirts. |
| Tooth | Rising edge `+160` X, or `+80` if `bolus:papilla`, then 4s quiet. Not `+240`. From the tooth at `x = -180`, `+160` reaches `x ≥ 200` inside 2.4s and `+80` does not inside 3s. |
| Baleen | Boosting, once per 2s, `−52` Z. A fast ship ends under 22. Limp adds 0. Not `+12`. Kick 0.45s. |
| Glove | One-shot. Speed `< 22`: nudge 36 toward knob `{-700, -2000}`. Speed `≥ 55`: yank 64 toward the glove. Frenum blocks the yank only. Dead zone does nothing. The arm flag lives on the entity tag. Re-arm on leaving radius 240. |
| Uvula | Held `≥ 0.4s`: seek 180 u/s toward `x = -700` while held. `|x+700| ≤ 8` writes `vx = 0`. Release zeros the seek the same tick. |
| Pleat | `+64` Z once per latch window. The next tick adds 0. Hold 1.0s. |
| Drums | Chase 62 only after boost-or-fast has lasted 2s. Otherwise wander 28. A 1.8s crest does not wake them. |
| Loose | Falling edge of taut on drum, rib, bezoar, cyst sets `bolus:loose:<key> = sim+1.5` before steer. Steer does not drive during that window. |
| Lice | Scurry 48. Cone or crook writes speed 0 last and leaves them dynamic. The cone also stops mites and fingerlings (the light freezes the bugs). |
| Acid / exposure / cargo | Unchanged. Acid 2. Exposure `+0.015` per second. |

Unlatched route, the one the clip can finish with no tether: start in the lane `x ∈ [-1100, -820]` (the proof uses `x = -960` so the iris skirt holds), not boosting, mouth Z, every iris phase, acid time 0, cough Z reached on cilia alone.

## Cable

`bolusCableStyle(state)` describes the existing line. It does not spawn one.

- Uvula held `≥ 0.4`: sag 0, width 2.4, tint `0xf7f4ee`.
- Uvula held `< 0.4`: sag 18, width 1.2, tint `0xc8c2b8`.
- Released: sag 42, width 0.8, tint `0x8a847c`.

## Audio

Edges emit `audio:cue` with `bolus_latch`, `bolus_freeze`, `bolus_iris`, `bolus_crest`. A missing bus is a no-op. The arrival sting is unchanged.

## Review expansion

Three plan reviews added these. They are in scope. Still no second cord, no bones, no second room.

- Canal parts carry the colors above. Near-bank crest is the high edge over the shelf. Far-bank crest is every `X > 700`, lower than the near crest by at least 24. Mouth lip is an annulus at `z = -2624` with a hole. Cough is two sheets at the Ashfall gate, gap at least 80.
- Iris is twelve blades. Shut, the hole is at most 40 across. Open fraction stays 0 / 1 / 0 at t = 0 / 3 / 8.
- Tooth is the knob recipe plus one barb whose centroid is +X. Tendon is the strap with no bulb. Suture is that strap in `0xf4f1ea` and still wears tissue so the skin test passes.
- A stopped louse, fingerling, or mite gains two splayed cards. Five lantern shafts pulse and do not deal damage.
- Cilia cards lean while coasting. Baleen plates pitch on the boost edge. Ribs swell on the crest and sit still while stalled.
- `bolusCableStyle(state)` describes the existing line: taut reel is straight and pale, a slack line sags. It does not create a second line.
- Headless tests lock the shapes above. A sphere fails the bank, lip, and cough asserts.
