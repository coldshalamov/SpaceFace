# BRACKET / BX-9 — Keeper of the Small Goal

An original SpaceFace character and a complete, optional physical encounter.

> “One small goal. An unreasonable amount of universe. Still worth defending.”

## Why this character

SpaceFace already has violence, salvage, economic systems and a rescue machine, Morrow. BRACKET
adds a reason to use its physical verbs playfully with someone who wants to be there. He is an
obsolete sorting robot who has promoted himself to goalkeeper. The yard is his stadium. The player
is his entire league. His competitive bluster gradually gives way to the admission that the game
is how he makes his existence meaningful. He does not become a vendor, reward dispenser or enemy
wave. Preserve that specificity.

## Find and play

BRACKET spawns automatically in **Helios Prime**, at world X **-520**, Z **440**, on the near edge of
the outer salvage yard. This is the normal Adventure/campaign registry, not an opt-in feature flag.
Approaching within 340 world units produces a comms invitation. His scanner label identifies the
court. Within 260 units, use the normal scanner action (default **C**) to start a match. The same
action cancels an active match; it never steals a new key binding.

There are five balls, one at a time. Nudge the ball with the ship or use the normal Massline tools
to sling it through the amber goal. Each attempt allows 32 simulation seconds. Three goals wins;
five earns his deliberately ridiculous no-hands demonstration. The keeper becomes quicker after
wins, up to two difficulty increases, but always declares his move for 0.58 seconds before dashing.
He does not continuously correct a committed dash. His model leans toward the chosen side.

Two **powered rebound bumpers** permit bank shots. They activate only on an actual physics contact
with a player-authored ball; the plunger rises and its coil brightens. The outgoing kick is along
the contact's geometric outward normal, never toward the goal. It tops up a weak engine rebound to
80% of the measured incoming normal speed, capped at 95 units/s and at 90 units/s added delta-v.
Existing tangential velocity remains intact. Neither bumper can push the player through this code.

The whole ball must cross the goal plane from the front, inside the aperture. Swept intersection
prevents tunneling, while impossible one-tick displacements are rejected rather than awarded.
Contacts or the live tether establish player authorship. A drifting NPC cannot score for you.

The physical scoreboard and BRACKET's crown show five results: an amber light is a goal, a red cross
is a miss. The beam beneath the board is the shot clock. Three expanding **volumetric** hoops mark a
goal. No soft glow sprites represent objects. The four sounds use the existing spatial mixer.

## Personality and secrets

He remembers matches, wins, goals, best score, bank goals and the perfect game. There is no free
currency faucet and no unintegrated economy mutation. The winner's name is an honorary line in the
match-finished receipt, **not** an unlock in the global title inventory.

On the third match he counts repeated visits as friendship. A backwards-moving scorer receives a
special complaint. A perfect game makes him hold his hands behind his back. Sit quietly nearby for
18 and then 42 seconds after meeting him for two one-time, persistent conversations. Fire on him
and he folds his hands, suspends the match and closes play for 16 seconds. Killing him is permanent
within that save; New Game restores him. There is no surprise retaliation.

## Runtime ownership

| File | Responsibility |
|---|---|
| `src/data/bracket.js` | Balance, dialogue, whitelisted save schema, four oscillator recipes. |
| `src/characters/bracketRules.js` | Pure swept scoring, shot eligibility, anticipation and bounded controls. |
| `src/systems/bracket.js` | Encounter owner, lifecycle, genuine contact attribution, commands and pose data. |
| `src/render/characters/bracketModel.js` | Original hard-surface geometry, materials, articulation, scoreboard and volumetric effects. |
| `tools/bracket/` | Isolated interactive review bench; production character and Rapier, explicitly a proxy test tug. |

Both browser and Node factories register it; the authoritative manifest steps it **before physics**.
The live visual factory dispatches its parts before generic drone/payload art. Both save-capture
paths serialize memory and the restore path deserializes it. Audio recipes join the existing bank.
The explicit authored parametric robot does not request a GLB or fall back to a stock ship model.
There are no new dependencies, textures, external media or random simulation calls.

The system owns only `state.bracket`, its six possible entities and its transient encounter state.
Keeper movement is a `writePhysicsControl` command. Rebound energy is a `queuePhysicsImpulse` on the
owned ball after contact. No direct position/velocity writes, player force, health, credits, cargo,
input binding, hostile-AI authority or global time-scale mutation is introduced.

Static posts and bumpers have finite matching solid colliders. Only keeper and served ball are
dynamic. Serving removes the previous ball and creates a fresh entity; it never teleports a live
tethered body. Losing the player, docking, leaving the court/sector, restoring a save and starting
another game cancel appropriately. A pause preserves simulation time. A destroyed keeper cannot
be respawned by the maintenance check. Entity cleanup tolerates a helper that splices the array.

Memory records only completed match totals; canceled attempts cannot smuggle bank credit into the
next match. Neither an armed keeper move nor a half-spent ball crosses a load boundary. Unknown
save versions normalize to a fresh, finite record.

## Art and performance

Silhouette: squat cast chassis, mismatched oxblood repairs, a single horizontal tracking eye,
large open catcher hands, head bearing, riveted patchwork, pressure lines, a bent antenna,
a mechanical whistle and five scoring lamps mounted like an absurd little crown. He is not a
ship with a face texture: every visible part is authored geometry.

Static details are merged by material within articulation groups. Animated joints, scoring-light
transforms, clock and plunger remain live through the renderer's static-child freezing pass.
Every animation uses the simulation pose timestamp when present, so a paused render clock cannot
silently expire gestures. Reduced motion removes bobbing, wobble and goal expansion; reduced flash
reduces emissive changes. Lighting, scores, stance and shape still communicate the result.

The isolated 1440×1000 browser bench measured **81 color-pass draw calls and 20,226 triangles** for
the active court including its test floor/tug. This is not a full-game frame-time or hardware FPS
claim. The geometry-budget test caps the six authored parts at 110 meshes and 25,000 triangles.
Resources dispose once; the ordinary runtime also sees all referenced GPU allocations in the graph.

## Validation and honest limits

Run:

```sh
node --test test/bracket.test.mjs test/bracket-model.test.mjs test/morrow.test.mjs test/morrow-model.test.mjs
```

The focused suite covers provenance, score direction/aperture/sweeps, impossible teleports, physical
player contact, bounded powered rebound, committed anticipation, rounds, progression, cancellation,
zero/real damage, destruction, New Game, restoration, pause, cleanup, save hooks, clocks, materials,
static-freeze behavior, deterministic transcripts and GPU disposal. Real Rapier is exercised; it is
not replaced with a mocked integrator. Morrow's existing tests run unchanged as a regression check.

Serve the repo normally, then open `/tools/bracket/` for the isolated bench. Its **WASD / arrows**,
**Shift brake**, **Space spring tether/release**, **C hail/cancel**, **P pause** and view controls are
bench-only. Actual SpaceFace keeps the user's existing control bindings and real Massline system.

Chromium rendered the actual authored modules and exercised scan/start, resizing and reduced
motion. Browser evidence uses an offline module loader because this runner's browser disallows URL
navigation. The full authored game could not be booted here: the official source packet omits the
large media set and some installed audio dependencies. Do not call this full-game playtesting or
invent performance measurements. In particular, verify full-world placement, live camera framing,
radar salience and interaction with nearby streamed traffic on a normal asset-complete checkout.

## Expansion cards for future agents

These are optional new tasks, not unfinished pieces of this delivery.

**BXR-01 — Crowd of one.** Let a lawful civilian stop outside the court to watch a completed match.
Use the existing civilian job and spawn-budget owners. Never spawn combatants or block either goal.
Acceptance: a physically present spectator reacts once to the winning shot, then resumes its route.

**BXR-02 — Boarded away fixture.** An existing station contact can offer directions to BRACKET after
a mining or salvage visit. Use the current contact/router system, not a second dialogue framework.
Acceptance: normal play yields a navigation target to this exact court, with no duplicate robot.

**BXR-03 — A different ball, not a stat treadmill.** Add an explicitly chosen heavy scrapball mode
whose inertia changes the same game. Keep separate records, exact physics mass and readable visual
weight. Never buff the player ship or change normal-round behavior to manufacture difficulty.

**BXR-04 — The keeper's lost team.** A recovered old yard photograph leads to a small memorial scene.
Reuse the archive and world-memory owners. Keep the reveal short and earn it through a real object.
Do not turn him into a quest board or explain every line of his personality.

**BXR-05 — Match replay.** Record a tiny bounded, non-authoritative pose tape of the winning bank
shot and offer playback through the existing replay owner. Replays must never rescore a match,
reapply a force or increment memories. Test save/load and cancellation before visual embellishment.

Preserve Morrow and other encounters. Preserve the authored model, independent sim/render boundary,
readable keeper commitment, causal physics, quiet optional character, and no-currency-farming rule.
