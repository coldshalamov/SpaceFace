# RUBRIC / HM-11 — The Hull Marker

An original SpaceFace character and a complete, optional encounter in **Tethys Junction**. Implemented
content on the default Adventure route, not a proposal: the live systems, factory, save and chart
register it with no feature flag.

> "I do not mark a moving hull. A mark on a moving hull is a guess."

---

## 1. Why this character

SpaceFace already has five named machine-people (Morrow, Vesper, Bracket, Ravel, Solstice). All five
are warm, playful or wondrous, and none of them talk the way the **canonical vibe document**
(`docs/worldbuilding/vibe/vibe-CANONICAL.md`) says this universe talks: flat declaratives of
physical and economic reality, the register of inventory and log entries, no named feelings, no irony,
no performance. None of them reads the world's own ledger. None of them makes you *stop* something.

Rubric is the canon's line **"Graffiti is the only honest narrator"** given a body. It is a retired
stencil drone that paints what its gauges read on the hulls the sector has left lying around,
including hulls **you** made, and finally your own. It does not scold, forgive or explain. It states
the number and paints the line.

It is deliberately *not* a vendor, a reward fountain, a boss or a companion. It pays nothing in
credits, reputation or heat. What it gives is the truth about a wreck, and a reason to use the game's
physical verb (the Massline) for something other than a weapon: **bringing a thing to rest**.

## 2. The character

Tethys Junction runs on **the Tally**: every hull inbound from Helios crosses the scan gate and holds
open for count. A marking drone stencils each hull after Customs signs it off: CLEARED, HOLD or FINED.
**HM-11** was the Gate's marker. A marker's one law is that *a mark is a measurement*.

Hull **F-41** was the forty-first filing of the season. Its gauges read **organic 0.7, deck mass 12.4,
manifest zero**. The desk filed it CLEARED, and the desk's order was to paint CLEARED. HM-11 painted it.
(The numbers are a deliberate echo of the game's opening: contract 47-A's 12.4 t discrepancy and the
two Shaft 7 crew filed as 0.7 t moisture loss. Rubric never says so. An attentive player will.)

A marker cannot leave a false mark standing and cannot remove a mark it has made. So it paints the
correction **beside** the filing. Both stay. Everything it has touched since is a palimpsest: the
filed answer and the measured one, side by side.

It is Customs property that nobody collected. It still works the line.

## 3. Find it, play it

- **Where:** Tethys Junction, sector-local **(-790, -1190)**: inside The Tally zone, south of the held-for-count
  rack, off the inbound queue lane. Charted anomaly **RUBRIC · The Marking Line**, with a discovery plate.
- **Meet it:** fly within 520 units and a comms line announces it. Within 300 units, scan (default **C**)
  to hail. A later scan reads out its inventory: *marks on file, red lead remaining, damage on file, next hull.*
- **The one verb:** the marker will not mark a moving hull. "Still" is a physical fact the sim checks:
  hull speed ≤ **4 u/s** *and* spin ≤ **0.45 rad/s**. Wrecks have no linear damping in space, so a drifting
  hull stays a guess until somebody puts a **Massline** on it and brings it to rest.
  Hold it still for **6 s** and the mark takes. Let it move and the paint **smears** (a ghost strike appears),
  progress drains, and the marker says so.
- **It streams with the pilot.** The world's far-actor table shelves any drone or wreck beyond about 1300 units of
  the player, so the encounter exists only while the pilot is inside that zone (it appears within the table's exit
  radius minus 350, is withdrawn beyond exit minus 200, and the marker only works hulls the table would also leave
  alone). A pilot arriving by the gate, about 1.8 km out, costs nothing: no body, no hull, no mark.
- **Why you cannot cheat it:** hull F-41 swings round its mooring at a constant 11 u/s, always faster than
  "still". Left alone the marker waits beside it (matching its drift) forever. Proven on real Rapier in
  `test/rubric.test.mjs`.

## 4. The arc

| Act | Trigger | What happens |
|---|---|---|
| **I. The Filing** | First scan | It reads out F-41's gauges, asks for a line on the hull, and marks it once it is at rest: a hot strike through the desk's chalk CLEARED tag, a bolted truth plate, one story on the Gate's news channel. F-41's label changes from *filed CLEARED* to *NOT CLEARED*. The first job is always F-41. |
| **II. The Work** | F-41 corrected | It picks other hulls in 1300 u of the line and works them, **your own kills first**, **your own wreck above everything**. The truth is composed from what the sim actually recorded (see §6). Each marked wreck keeps its mark for good, and its scan label says so. |
| **III. The Last Layer** | Six corrections | Its red lead is nearly spent. It asks to be held still **itself**: "A marker that corrects is not CLEARED either." Same verb, turned on the marker. Hold it for 6 s and it marks HM-11, goes dark (whitewash coat, blank face, folded arms) and stays that way. Nobody is forced to. It asks once. |
| **Aftermath** | Always | Its marks outlive it. A finished marker only answers a scan with the plain fact. |

**Consequences, in the canon's spirit (never a reward, never a lecture):**
shoot it and it **withdraws**, remembers ("Damage on file: you"), strikes its own eyes for a while and wears a
**scarred** skin from then on. Kill it and it is gone for good, with one line (*"WAS HONEST"*, the canon's
"WAS FRIENDLY" flicker), and every mark it already made stays. It never writes credits, cargo, reputation or heat.

## 5. Voice law and dialogue

Every line obeys the canon's register: flat, declarative, inventory-and-log. **Never** an emotion named,
never irony, never performance, never "I feel". `violatesRegister()` (`src/characters/rubricRules.js`)
lints **every** string the marker can say and 400 generated truth lines in `test/rubric.test.mjs`; the lint
has negative controls so it cannot rot into a rubber stamp.

| Key | When | Line |
|---|---|---|
| `discover` | Within 520 u, unmet | RUBRIC — HM-11, a retired Customs Gate hull marker, still marking. Hull F-41 hangs on its line. Scan to read its work. |
| `hello` | First scan | HM-11. Hull marker, Tethys Customs Gate. Hull F-41 is on the line. Filed CLEARED. My gauges read organic 0.7. Deck mass 12.4. Manifest zero. |
| `brief` | 7 s later / a moving hull | I do not mark a moving hull. A mark on a moving hull is a guess. Put a line on F-41 and bring it to rest. |
| `lineOn` | Player holds the hull | Line on. Bring it to rest. Speed first. Then the turn. |
| `still` / `smear` / `turning` / `nudge` | Painting, shaken, spinning, moving | Still. Marking. / It moved. The mark smeared. Hold it. / Slow now. Still turning. The face must stop. / Moving. Not marked. |
| `f41` | F-41 corrected | F-41. Filed CLEARED by the desk. Corrected NOT CLEARED by the gauge. Both marks stay. The correction goes beside the filing. |
| truth line | Any hull marked | Composed per hull, e.g. *Reaver Pirate. Killed by you. Hold: scrap metal x3. Down 3 min. Strip: nobody will ask.* |
| `yours` / `playerHull` | Your hand / your own wreck | Cause on file: you. Two lines. Two lines mean the hand is known. / Your hull. Marked while you were gone. Cause on file. It stands. |
| `lowPaint` / `reloaded` | Tank low / refilled | Red lead low. Back to the line. / Tank full. |
| `flee` / `safe` / `hit` / `wronged` | Hostile in range / gone / shot / damage logged | Contact. Marker is not armed. Withdrawing. / Clear. Resuming. / Marker. Not a weapon. The marks stand. / Damage logged. Cause: you. Double line. |
| `witness3` | Third correction | Three corrections. The filings stay beside them. Nobody has painted over either. |
| `lastOffer` / `lastStill` / `last` | Act III | Red lead nearly out. One mark left. Not a wreck. A marker that corrects is not CLEARED either. Put a line on me. Hold me still. / Still. Marking HM-11. / HM-11. Filed CLEARED by the desk. Corrected by the gauge. The mark stands. Nothing further to mark. |
| `memorial` / `dead` | Finished / killed | HM-11 is dark. Its marks stand on every hull it was given. / marker lost. The last mark on its tank is a double line. WAS HONEST. |
| ambient (7) | Pilot quiet within earshot for 55 s | e.g. *The desk files what was wanted. The gauge reads what is there. I paint the gauge.* |

Ambient testimony only fires after the pilot has sat quietly nearby for a full minute, never on top of
another line, and never at the start of an encounter.

**Delivery is a receipt, not a queue entry.** The game's one-voice arbiter queues a line against the sim clock and
drops it unspoken if a longer alert holds the floor past the line's ttl; in Tethys the Customs "OFFICIAL DENIAL" alert
(priority 80) does exactly that, which silently ate the first hello in the real-game run. The marker therefore keeps a
small delivery record for its story lines, clears a line when the arbiter announces it took the floor (`voice:surface`),
and otherwise re-offers it, never forcing the floor, at most twice more and only while the pilot is within earshot.

## 6. How it reads a wreck (the truth composer)

`truthFacts()` reads what the sim recorded about a wreck: the aftermath marker clone (`data.aftermath`:
killer, victim label, freight identity, time of death), the ledger provenance shape, the salvage pool,
the wreck class and the restricted-salvage flag. `truthLine()` joins flat fragments in a **seeded** order
(`hash32(run seed, marker id)`): the same wreck always gets the same words on every load.

**Cause is a shape, never colour alone** (the repo's accessibility rule): one line = ledger loss or another
hull; **two lines = the hand is known** (you, or your own hull); a **broken line** = cause unlogged. Colour
(red lead / amber / chalk / steel-blue) only reinforces it.

## 7. The AI

A deterministic utility agent on the shared physics membrane. It never writes a position.

- **Modes:** `idle` → `seek` → `work` (clamp, stencil, spray) → `reload`; `flee`; `offer` (Act III); `dark` (finished).
- **Targeting** (re-scored every 2 s, with a 40-point hysteresis so it does not dither): F-41 first; then
  *score = 100 − distance·0.04*, **+150 your own wreck**, **+100 your own kill**, **+220 a hull you already hold**,
  − up to 90 for a hull moving faster than 4 u/s, + freshness. Tagged hulls are `-Infinity`.
- **Movement:** a bounded PD servo (≤ 30 u/s², ≤ 42 u/s) that **matches the target's drift** so it can wait
  beside a moving hull; it yields to the player's line (never fights the tether).
- **Perception:** hostile hulls within 420 u via the game's own `isHostileToPlayer`. A raider sends it home;
  *you* shooting it records the wrong. It stays neutral: `team 2`, no faction, `ai.passive`.
- **Resource:** red lead. Each mark costs 17%; below 22% it returns to the line and refills for 20 s; the
  refill ceiling falls as it works (`1 − 0.125·marks`, floor 25%), which is what makes Act III "nearly out".
- **Streaming and the far-actor table:** found by running it in the real game, not the bench. A drone or wreck
  beyond the far-actor exit radius is shelved and later promoted as an anonymous shell; an owner that re-mints
  every second would fight it forever. So the census is distance-gated with hysteresis, and any shell that carries
  the `persistenceOwner: 'rubric'` stamp without a `rubricPart` is removed on sight.
- **Determinism:** no `Math.random`, no `Date.now`, no shared `state.rng` stream (asserted by test). It cannot
  perturb the 47-A goldens and a save replays identically.

## 8. Appearance

**Body** (≈ 58 draw calls after static merging, ≈ 7 k triangles): a squat red-lead paint tank on hover jets,
a glass dome whose liquid level *is* its paint gauge (slosh from acceleration), antenna lamp, a graphite
deck with riveted rim and the unit number in chalk bars, a hose to the spray arm. **Face:** a low cream visor
on a turntable that keeps its eyes on the player (or on the job). Behind the window a **stencil drum** indexes
like a split-flap to one of five cartridges: `— —` calm, `• •` working, `▶ ▶` alarm, `✕ ✕` struck eyes (it
strikes through its own eyes after you hurt it), blank. **Three arms**, each a red upper link on steel axles,
a graphite forearm and a tool: **SPRAY** nozzle with a live cone and droplets (real 3D solids, never
camera-facing points), **CLAMP** with rubber jaws that close on the hull, **STENCIL** card laid before the
nozzle works. Working arms use two-bone IK with a **telescoping forearm** (≤ 2.3×) so the nozzle's end meets
the strike front; resting arms stow along the tank, rise in alarm, droop when offering.

**Skins** (painted by `tools/art/rubric_skins.mjs`, seeded, reproducible): *primer* (stencilled HM-11,
WT-TETH-19, hazard band) → *witness* (overspray of every mark, from 3 corrections) → *scarred* (you hurt
it: scorched, struck through twice) → *memorial* (whitewash, HM-11 struck once, primer showing through
the drips). History outranks tidiness: scar over witness, whitewash over scar.

**Marks:** a hull wearing the desk's filing gets a chalk tag with three green pass chevrons, a **hot strike
drawn through it as the paint goes on**, and a bolted truth plate with four text lines that write in. Any
other hull gets the plate and a cause line under it. Sized to read at the gameplay camera, capped so the
arms can reach the whole line.

**Accessibility:** reduced motion stills bob, roll, cone and drum overshoot; reduced flash holds every lamp
steady and caps emission. The voice and scan label carry the *words* (hull text is shape, not prose).

## 9. Wiring (all on the default route, no flag)

`src/systems/rubric.js` (system, save owner `state.rubric`) · `src/data/rubric.js` (constants, every line,
memory, audio) · `src/characters/rubricRules.js` (pure rules: stillness, truth composer, lint, servo) ·
`src/render/characters/rubricModel.js` + `src/render/rubricSkinLibrary.js` (model, marks, async skins with
flat fallback) · `assets/ships/release/surfaces/rubric/` (atlas, drum, manifest) · `registry.js`,
`nodeSystemFactoryTable.js`, `authoritativeSystemManifest.js` (init, update before `physics`, clock),
`saveSystem.js` (boundary list, serialize, deserialize), `audioRecipes.js` (6 recipes), `sectors.js`
(chart POI with discovery plate), `visualFactory.js` (`rubricPart` body/mark; the hull stays a real wreck),
`index.html` (modulepreload), `SAVE_SCHEMA.md` (regenerated).

**Single writers honoured:** it writes only `state.rubric`, its own entities and *one* foreign field, a
wreck's `data.scanLabel` (the `lossLedger` precedent; never a mission-bearing, communicator or player-wreck
label). It reads `state.aftermathWrecks` markers' wreck clones and never writes them. Motion goes through
`queuePhysicsImpulse`. A foreign system relabelling F-41 is undone by the next 1 Hz census.

## 10. Verification

- `test/rubric.test.mjs` (30): wiring, voice lint, memory fuzz, entity legality, scope, scan consent,
  truth composer, priorities, smear, spin, danger, death, save round-trip, last layer, ambient timing,
  **streaming with hysteresis**, the far-actor reach limit, twin cleanup, line re-offer behind a busy floor, determinism, budget, and
  **two real-Rapier proofs**: left alone it waits and marks nothing; with a line on F-41 braked to rest,
  the mark takes.
- `test/rubric-model.test.mjs` (16): authored stamp (no "still staging"), readiness gate, pause, IK reach to the strike
  front, postures, drum, skins and failure fallback, accessibility, mark grammar, assets, draw-call budget, disposal.
- `node tools/rubric/review.mjs` drives the production bench in headless Chromium (real physics, real wreck
  renderer): real first encounter, every pose, every skin. Playable bench: `tools/rubric/bench.html`.
- `node scripts/characters/check-rubric-live.mjs` boots the **real game**: New Game, a real gate jump into Tethys,
  nothing minted for a far pilot, one marker/hull/mark on approach and stable over time, the marker drawn by the
  authored model and (once the camera has glided in) projected inside the live camera frame, a **real C key press**
  answered by the marker with its hello taking the one-voice floor (`voice:surface`), no law, heat or damage event
  involving any Rubric part, and the save round-trip, with zero page and shader errors. Caveat: the renderer holds non-essential meshes back while its
  sector-entry window is open, and on a GPU-less host that window can last minutes, so the check asserts the paint
  mark *builds* through the real factory always and *is drawn* whenever the window has closed (it did in the
  recorded run). The live headless pictures are chunky for every object in the scene, so the bench is the visual
  reference.

## 11. Not done, and why

- **Graffiti wall set:** the canon wants Rubric's corrections on station bulkheads. The graffiti picker lives in
  `src/systems/world.js`, which was under active edit by another lane; a flavor pack with no consumer would be
  dead text. The clean hook is a `rubric_marks` set fed from the `rubric:marked` event.
- **The other forty filings:** "Forty filings uncorrected. I can only mark what stops." Hulls in other sectors
  are future content: the marker only exists in Tethys, by design.
- **Other characters and the far-actor table:** the thrash described in §7 is a property of the world, not of
  Rubric. Solstice, Ravel, Vesper and Bracket mint their parts from the same once-a-second census and were shelved
  and re-minted the same way for any pilot arriving from a gate. They are fixed by one stamp, `data.authoredCharacter`,
  that `shouldVirtualizeFarActor` honours (`test/character-far-actor-residency.test.mjs`, real-game check
  `scripts/characters/check-residency-live.mjs`). Rubric keeps its own distance streaming because it is cheaper to
  not exist at all than to keep a paint-mark entity resident across a sector. A new character whose system
  spawns bodies from a census should stamp `data.authoredCharacter` on every body.
- **Ship paint reward:** the Shipworks rack is an ungated swatch list; a "Red Lead" paint would not be a reward
  without UI gating owned by the ORRERY lane.
