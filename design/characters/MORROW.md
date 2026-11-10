# Morrow / R-07 — the machine that gives motion back

Owner-requested original character, authored against SpaceFace `74c31b50a94f6c14889f0182b0c7894b63743159` (2026-10-02).
This is implemented content, not a replacement frontend, new engine, or second gameplay route.

## Why this character

The current game already has extensive combat actors, fauna, precursor machines, nemesis arcs,
and capital encounters. Its physical verbs are its identity. Morrow adds a different reason to
recognize an object: a particular, recurring nonhostile person in the machinery, with whom the
pilot can do something physical. Not a pet that follows everywhere, a vendor, a free repair
fountain, or another enemy with larger health.

R-07 was built to bring damaged ships home. Its institution has disappeared; its manners have
not. It calls ships “little engines,” remembers departures, and is careful with anyone already
holding a tow line. It does not explain its whole history. Do not label it an OpenAI mascot or
use external logos. Morrow belongs to SpaceFace.

## Finding and playing

In an adventure run it resides at **Helios Prime, X 510 / Z -72**, beside the route toward the
starter seam. It announces itself within 180 world units. The active scanner's default binding
in this baseline is **C**, with the scanner's existing cooldown; Morrow does not bypass that
cooldown or seize a new key.

The first valid nearby pulse wakes it. The next pulse opens its capture rings and arms an
optional launch. Fly approximately 117 degrees around it, continuously in either direction,
between 38 and 100 world units from the hub and at least 14 world units per second. Reversing
back and forth cannot charge it. The rings are the boundaries, not a tunnel or a solid wall.

After the flown arc, it charges for 1.2 seconds. Keep moving inside the rings. It then returns
up to 48 world units per second along the ship's momentum, delivered through 0.42 seconds of
physics impulses. The proposed boost is reduced near 190 WU/s. This is not a global speed cap
and does not overwrite acceleration from the pilot or other systems. Morrow takes opposite
recoil and physically steadies itself afterward.

Scan again while armed/charging, leave the capture region during windup, stop moving, dock,
or put a tether out to cancel. A tether already active prevents arming. A one-time projected
clearance check refuses a launch into a nearby solid—including Morrow itself. This is not
predictive autopilot: moving bodies can subsequently enter the path. There is a 28-second
cooldown. The character does not heal, spend, pay, upgrade, teleport, or rotate the player's ship.

## Personality and hidden gestures

Wake: **“You are not debris. Good.”**

Departure: **“Go on. There is more sky.”**

Return: **“Same little engine. Different scratches. Welcome back.”**

Spend 22 quiet seconds beside it to hear a three-note chord and “We do not have to go anywhere.”
Turn roughly two continuous circles nearby and it copies the gesture with its asymmetric arms.
The tenth launch receives a different goodbye. Those discoveries survive Continue. Hurting
Morrow makes it fold its iris and refuse assistance for 18 simulation seconds. Destroying it
leaves its rescue light permanently dark in that run; entering the sector or reloading does not
respawn it. New Game resets the relationship.

The baseline greeting is intentionally understated. Do not replace these with a tutorial monologue,
wall of lore, joke every five seconds, or a reward for repeating the same ritual.

## Asset and animation ownership

`src/render/characters/morrowModel.js` is the original production asset source: an armored,
incomplete ivory halo, teal inlays, repaired copper segment, recessed bell body, gimballed
convex eye, six real pivoting iris leaves, asymmetrical rescue manipulators, three suspended
mnemonic chimes, exposed service lines, and a slowly precessing internal race. It needs no
texture downloads and never substitutes a sprite for the object.

Rigid assemblies are merged by finish; moving pivots remain articulated. The complete source
build contains 40 meshes / 25,436 triangles including the field and release surface. The static
review GLB omits those procedural VFX and contains 23,644 triangles. It is a portable **posed
sculpture**, not the live animated asset. Runtime choreography remains in the model module.

The force rings and directional release are continuous shader-driven surfaces. The release
expands and fades rather than a one-frame flash. The simulation publishes its own time stamp:
Morrow does not borrow the shared authored clock that continues during docked/pause views.
Reduced-motion and reduced-flash settings retain informative poses and suppress idle movement
and intensity variation. The 130-WU visual presence is separate from the 15-WU physical hub,
so a ring is not culled just because the body sits beyond the camera edge. No `neverCull` flag.

Five new synthesized recipes live in `src/data/morrow.js` and join the existing audio recipe
registry. Three warm pitches identify Morrow; windup and release use distinct envelopes. Cues
use the existing positional mixer, mute controls, voice ownership, and cleanup. No new live
AudioContext, interval, external audio service, or gameplay random stream.

## Production integration

| Owner | Integration |
|---|---|
| `src/systems/morrow.js` | Instance-safe lifecycle, public scanner receipt, optional arc/launch, memory |
| `src/core/registry.js` | Browser production lookup |
| `src/runtime/nodeSystemFactoryTable.js` | Headless production lookup |
| `src/runtime/authoritativeSystemManifest.js` | Init + 60-Hz update; impulse producer before physics |
| `src/render/visualFactory.js` | Narrow `data.morrow === true` drone dispatch; generic drones unchanged |
| `src/save/saveSystem.js` | Chunked and synchronous capture; dependency-ordered restore |
| `src/data/audioRecipes.js` | Existing recipe registry, no separate mixer |

Memory is a bounded version-1 whitelist under `state.morrow`: acquaintance, visits, launches,
ritual flags, health, destruction, and cooldown/shyness stamps. A half-charged or half-spent
launch is never restored. Entity identity is reacquired, duplicate actors are retired, and
Survival/lab/other sectors do not receive the character. State and renderer remain separate.

Public extension receipts are `morrow:met`, `morrow:launch`, and `morrow:voice`. These are
observations, not privileged commands. `morrow:launch` carries the player, proposed delta-v,
duration and direction. Subscribe with normal owner lifecycle cleanup. Never manufacture
`scan:pulse` from UI or use the voice receipt to grant currency. Damage and death use existing
combat receipts. There are no direct economy/cargo writes or a new generic reward path.

## Proof and limits

Run `node --test test/morrow.test.mjs test/morrow-model.test.mjs
 test/physics-authority-cache.test.mjs test/sg02-init-lifecycle.test.mjs` as one line.
The delivery's evidence directory contains the actual **27 passing tests**. This includes real
Rapier WASM consuming the queued launch and mirroring bounded motion back into game entities,
not just a mocked velocity calculation. Model tests raycast the opening iris, check geometry,
verify deterministic choreography, field culling, pause-time isolation and one-time disposal.
All changed executable sources also passed `node --check`.

The source packet intentionally excludes large shipped media and installed npm dependencies.
The broader existing `authoritative-manifest` test could not import `@elemaudio/core` in this VM;
its three deliberate cardinality assertions are updated, but that suite is not reported as passed.
The VM's Chromium could execute the local modules but could not create a WebGL context. Its
network policy also blocks navigation. **No full-game GPU playthrough, frame-rate certification,
shader-compile acceptance, or live-world screenshot is claimed.** The included portrait is a
clearly labelled software rendering of exported production geometry. The offline HTML uses the
production model on a machine with WebGL2 and offers all poses, orbit controls and accessibility
toggles; the same review page is `scripts/characters/morrow-bench.html` when serving the repo.

Normal-route acceptance on a fully provisioned checkout: approach on a fresh adventure; wait
for the scanner's cooldown between the two pulses; fly a real arc; leave during charge; repeat
with a tether; test a real launch with the camera at normal zoom; toggle pause/motion settings;
save/Continue; depart/re-enter; then test lethal damage on a disposable save. Do not replace
these checks with the portrait or the review bench.

## Retained expansion briefs — not part of the current implementation

**MORROW-01 / The engine that cannot answer.** After `morrow:met`, author a single rescue-pod
encounter using the existing encounter and survivor-pod owners. A silent civilian needs a tow;
Morrow can supply momentum only once the line is safely released. Rescue is completed by the
actual survivor owner, never a proximity toast. Acceptance: preserve the manifest, no duplicate
payout on reload, abandoning the rescue is allowed, no automatic pilot steering.

**MORROW-02 / Ten departures.** Observe the existing tenth-launch count and add one Chronicler
record—not a new HUD—linking a later found flight recorder to an earlier departure. Selection
must be seeded and persisted. One record, no grind reward, no repeated log spam across Continue.
Do not claim all ten pilots survived.

**MORROW-03 / A borrowed arm.** Build one optional repair encounter around an authored recoverable
component and the existing cargo/mission completion owners. The reward is a changed gesture or
new chord, not unlimited free repairs. Keep the visibly copper arm: accepting help should change
how Morrow moves, not erase its history. The state migration must preserve version-1 saves.

Preserve the silhouette, pauses, scanner handshake, physical momentum contract and nonhostile
role. These are three finite ideas for later agents, not authorization to replace the character
or inflate this feature into a new subsystem.
