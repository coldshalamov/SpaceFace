# Combat feel bench

A fixed-seed, gameplay-camera bench for the enemy's **reaction** to a hit, not an asteroid-only
VFX demo. It mounts the released Kestrel and Wasp hulls, the shipping weapon presenter, the
production hull micro-motion and tumble body language, the production shield response, and the
production bloom. It can capture a chronological sequence as frames and an MP4, and it writes a
manifest that a Node validator checks.

## Run

```powershell
# One scenario, frames + MP4, default seed 17
python scripts/capture-combat-feel.py --scenario=concussion-tumble --video

# Every authored scenario
python scripts/capture-combat-feel.py --all --video --output=.devshots/combat-feel/all

# Frames only (fast)
python scripts/capture-combat-feel.py --scenario=shield-break --output=.devshots/combat-feel/shield

# Serve it yourself, then drive the page
node server.js 8123
python scripts/capture-combat-feel.py --scenario=pulse-hull --url=http://127.0.0.1:8123/scripts/combat-feel/index.html
```

Open `scripts/combat-feel/index.html` through the game server (not `file://`) for the interactive
view: the bottom bar selects scenarios, plays them at wall-clock speed, changes the fixed seed, and
switches the gameplay-camera distance. The capture driver always uses the deterministic fixed-step
`sample(t)` API, never the play button.

The driver starts `node server.js <free port>` itself when `--url` is not supplied. It sets
`SPACEFACE_PLAYER_STORE_DIR=''` and `SPACEFACE_USER_CONTENT_DIR=''` so it cannot mount the real save
drawer or mods. `server.log` in the output folder records startup failures; the driver exits 1 with
the page/console error, missing evidence, or invalid manifest rather than leaving a blank folder.

Output shape:

```
.devshots/combat-feel/<timestamp>/
  manifest.json          # schemaVersion 1, scenario beats, evidence, checks, source/config fingerprints
  report.json            # run summary + errors
  timeline.html          # review page: beat frames, sequence frames, MP4 links
  contact-sheet.html     # all beat frames in one page
  frames/<scenario>/beat-00-muzzle.png ...
  frames/<scenario>/sequence/frame-000000.png ...   # --video + --retain-sequence-frames
  video/<scenario>.mp4                              # only with --video
```

`--video` keeps the beat PNGs, samples every frame at the requested fps, encodes the MP4, and then
deletes the per-frame sequence PNGs by default (pass `--retain-sequence-frames` to keep them).

## Scenarios

| id | weapon | what it shows |
|---|---|---|
| `pulse-hull` | Pulse Laser S | muzzle, bolt travel, hull spall, scorch, flinch, contact light, cooling |
| `concussion-tumble` | Concussion Cannon M | heavy flinch, production hitstun entry spin, multi-axis tumble, breach venting |
| `railgun-stagger` | Railgun M | fast slug, deep plate yield, heavy stagger, slow settle |
| `shield-contact` | Pulse Laser S | shield shell contact, flash, shard burst, reduced hull shiver |
| `shield-break` | Pulse Laser S ×2 | shield collapse with shard burst, then a real hull contact and cooling |
| `beam-cut` | Beam Laser M | sustained two-layer beam, coalesced contacts, release cooling |

The Node test requires `pulse-hull`, `concussion-tumble`, `shield-break`, and `beam-cut`; the
catalog also exposes `railgun-stagger` and `shield-contact`.

## Production boundary (read before integrating)

**Mounted production owners**

- `src/render/weapons/presenter.js` — `WeaponVfxPresenter` owns muzzle discharges, energy bolts,
  hull/shield contact surfaces, heavy impacts, scorches, particles and the two-slot real
  `PointLight` pool.
- `src/render/combat/persistentBeams.js` — `PersistentCombatBeamPool` owns the two-layer combat
  beam for `beam-cut`.
- `src/render/shipMicroMotion.js` — `createShipMicroMotionTracker` owns recoil, flinch, directional
  yaw swing, contact yield, cooling heat and the hull transform channels.
- `src/render/shipPitchPresentation.js` — `updateShipPitchPresentation` reads the combat tumble
  status and writes the multi-axis bank/pitch body language through `resolveTumbleBodyLanguage`.
- `src/combat/impulseKernel.js` — `resolveHitstunLaw` produces the authored helm-loss duration and
  entry spin from the weapon's real `impulsePerHit`; `signedHitSide` picks tumble chirality.
- `src/render/weapons/shieldBubblePresentation.js` + `src/render/ships/shipKit.js` — the Wasp
  shield is the real shell material and the real flash/contact/collapse presenter.
- `src/render/bloom.js` — the shipping bloom/distortion composite.
- `src/render/assetLoader.js` — `loadAuthoredPart` loads
  `assets/ships/release/parts/wholeships/kestrel.glb` and
  `assets/ships/release/parts/wholeships/wasp_production_v1.glb`, including the authored
  `SOCKET_Weapon_Front` marker. If a shared tree's release package is mid-regeneration, the same
  authored hulls are loaded from `assets/ships/parts/wholeships/` and the manifest records the
  source route.

**Not mounted**

- `src/systems/weapons.js` (ammo/spread/collision/damage authority)
- `src/systems/tumbleStates.js` (the real status writer and physics torque route)
- `src/combat/*` damage runtime and `src/core/physicsAuthority.js`
- `src/render/renderer.js` (entity sync, machine-awake scheduling, chase camera)
- `src/render/vfx.js` (the six-slot event-light pool and the structural contact lane; the weapon
  presenter's own two-slot pool is mounted)

The bench's `scripts/combat-feel/sequence.js` is a deterministic **input shim**: it owns when a
shot is born, where the authored socket sits, and when the contact lands. It calls the production
presenter with the same `handleFire` / `handleHit` shapes the weapons system uses, and it draws
nothing itself.

The bench owns these visual inputs beyond the production owners, so a reviewer can separate them
from the live route:

- **Root yaw during a forced tumble.** Production `tumbleStates` queues a real physics torque
  impulse; the bench integrates the production `entrySpin` with the same token 0.05/s angular drag
  the production tumble comment names, and writes the target root heading. The bank/pitch thrash is
  the real `resolveTumbleBodyLanguage` output, not a bench-only oscillator. The manifest records
  `tumbleLaw` and `tumbleYaw`.
- **Contact point.** Hull contacts sit on the authored half-extent instead of the conservative
  collision sphere; shield contacts keep the true bubble radius. Verify the live `projectile:hit`
  point against the same proxy.
- **Scene lighting.** A hand-authored key/rim/fill rig frames the two hulls; it is not a sector's
  lighting and does not prove the live picture at every sky.
- **Accessibility force.** `motionReduce` and `flashReduce` are forced off so the full beat is
  visible. The reduced paths are unit-tested, not pictured here; the pooled event-light peak scale
  is 0.1, not zero.
- **Target cruise.** The target is stationary and receives a 105 WU/s victim-cruise value; no
  physics body moves it.
- **Venting schedule.** The production `spawnDamageVenting` cue is scheduled at the authored breach
  through the settle; the live low-hull owner (`vfx.js` `_updateDamageVenting`) owns that cadence.

The bench reduces the displayed shield/hull values so the authored aftermath has something to show.
That is a fixture write, not a second damage owner.

**Which light is shown.** These frames show the `WeaponVfxPresenter`'s two-slot weapon light pool.
The six-slot event-light pool and its two-slot transient contact reserve are a separate production
owner (`src/render/vfx.js`); the focused admission suite proves that pool and its saturation law,
not these stills.

**Evidence provenance.** Every capture records `run.sourceFiles`; `validate-manifest.mjs`
recomputes the hashes and rejects a folder made from another bench revision. `beatFrames[].seen` is
frame-local: the `light` beat requires a contact light after a real contact (not the muzzle flash),
and `cooling`/`aftermath` require visible damage on their own frame rather than an earlier debris
puff. If the release render package is mid-regeneration in a shared tree, the bench falls back to
the same authored source GLBs and records `assets.*.route: "source"` in the manifest.

## Parent integration seams

1. **Enemy machine-awake:** `renderer.js` only runs `updateCraftMicroMotion` for ship/drone bodies
   when `userData.livingMachineAwake !== false`. A distant hostile that is asleep will not show the
   flinch this bench demonstrates. The live route must keep the engaged target awake (or the
   presentation must be admitted by the target-framing band).
2. **Shield bubble on authored hulls:** the live renderer expects the bubble at
   `mesh.userData.shieldBubble` and drives it through `updateEntityShieldBubblePresentation`. The
   bench attaches it directly; verify the authored Wasp path attaches the same bubble in
   `renderer.js`/`visualFactory.js` rather than relying on the swarm-only instanced lane.
3. **Tumble status + physics:** the live `tumbleStates` writer already stamps
   `status_tumbling` with `startedAt`, `until`, `spin`, `cause` and queues the torque. If the live
   target never reaches `tumbleStates` (e.g. weapon impulse is applied without the hitstun receipt),
   the body language has no status to read.
4. **Camera composition:** the bench uses the shipping 60° tilt, 50° FOV and a 76 WU chase
   distance so both hulls are readable. The live chase camera follows only the player; a target at
   this arena distance is normally inside the threat-framing composition, but a parent change that
   widens the fight can put the enemy reaction off the glass.
5. **Render-phase pose order:** `updateCraftMicroMotion` adds to the hull's `rotation.x/z`
   channels. `renderer.js` re-applies the flight bank/pitch pose before the owner runs; the bench
   does the same (`resetHullPoseForMicroMotion`). If a parent calls the micro-motion owner without
   that reset, a single hit slowly integrates the hull upside down. Keep the renderer's reset →
   micro-motion order.
6. **Venting:** the bench calls the production `quarks.spawnDamageVenting` at the breach on an
   authored schedule. In the live route this cue belongs to the existing low-hull venting owner
   (`vfx.js` `_updateDamageVenting`); do not add a second scheduler.

## Test

```powershell
node --test test/combat-feel-bench.test.mjs
```

The test needs no GPU and no browser. It validates the catalog, required scenarios, production
weapon rows, deterministic shot/beat timing, the tumble law, the capture-manifest schema
(including rejection of missing evidence, unknown scenarios, bad beat order and absolute paths),
and source-freshness recomputation. After a real capture the Python driver also runs
`node scripts/combat-feel/validate-manifest.mjs <output>/manifest.json`, which recomputes every
recorded source hash and rejects a stale folder.
