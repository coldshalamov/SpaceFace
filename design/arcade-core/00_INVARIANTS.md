<!-- LIFETIME: DURABLE -->
# 00 — INVARIANTS (read before touching any Arcade Core task)

These are hard rules from the owner, learned by watching agents produce broken work that had to
be reverted. Each exists because a real agent made exactly this mistake. Violating one is an
automatic FAIL at review regardless of how good the rest of the work is.

## I-1. This is a top-down game. There is no "far away."

The camera shows a small, fixed-size table. Everything is either on screen at full scrutiny or
not rendered at all. Therefore:

- **Never build LOD model-swapping for gameplay entities.** No proxy meshes, no box stand-ins,
  no "simplified at distance" variants of ships. There is no distance. Agents have shipped
  shoddy box models that pop in and out on a top-down camera; it is pure CPU thrash and visible
  garbage. All of that work is wasted by construction.
- Everything in frame must look final, always. Spend the budget on making the on-screen set
  good, not on swapping systems.
- Existing perf plans that assume far-field geometry (impostors, HLOD, far LOD demotion) do not
  apply to the moment-to-moment combat table and must not be cited to justify model swapping
  on gameplay entities.

## I-2. Player control and camera stability are sacred.

The player must always be able to fly and understand their motion. Banned:

- Camera behavior that zooms, whips, or shakes so aggressively the player loses track of their
  ship or their aim. Juice is subordinate to readability (see 10_JUICE_DISCIPLINE).
- Any effect that changes how the player's ship responds to input, even briefly, unless it is an
  explicit, telegraphed, designed mechanic (e.g. a named status with a visible cause). "My ship
  suddenly moves differently for no reason" is the single most-reported broken-agent symptom.
- Hit-stop/slow-mo that eats player input or fires more than rarely. All juice caps and
  opt-outs live in 10_JUICE_DISCIPLINE.

## I-3. Physics honesty — design inside the real mechanics.

The Massline is a rope. It pulls the player toward the anchor and the anchor toward the player,
nothing else. Agents keep proposing fantasy verbs. The honest mechanics are:

- **You can pull.** A tethered light ship gets dragged toward you; you get dragged toward a
  heavy anchor. Reeling changes closing speed.
- **You can swing yourself.** Tether to a massive body, burn perpendicular, cut at the tangent:
  the *player* slingshots. Rapier does this for free.
- **You cannot "yeet."** A released tethered object keeps whatever velocity it had at release
  and then drifts; it does not fly off on its own, and there is no throw impulse. To move an
  enemy somewhere dangerous, the honest verbs are: tow-drag it while it's disabled/tumbling,
  release it onto a slow drift intercept, or **hit it with an impulse weapon** (concussion
  cannon, vector mine, repulsor field) — that is what the blast family is for.
- Anything that "throws" a ship must be an impulse application through the physics kernel with
  mass-scaled results (`impulsePerHit / mass`), never a scripted velocity write.
- `src/systems/masslineThrow.js` exists and must be audited against this rule before any new
  tether-combat work: keep what is physically honest, fix or remove what is fantasy.

## I-4. No corny explicit feedback.

No floating words above enemies ("SMASHED", "DASH", "+50"), no arcade-text toasts announcing
what the player did. Feedback for style kills is **visual and physical only**: a distinct
explosion, a distinct color, a distinct trail, a bigger material burst. The player should feel
"that was different and the game meant it" without being told in words. See 02_STYLE_KILLS.

## I-5. Speed is ship identity, not a global dial.

Do not speed everything up. Ship-class contrast (nimble scout vs heavy juggernaut) is a
progression pillar. Global speed raises flatten it. Pacing fixes (05_COMBAT_PACING) come from
encounter density, time-to-contact, and enemy squishiness — not from making every hull faster.
The starter ship must feel balanced but clearly convey the game's physicality.

## I-6. Freelancer geography: wide world, empty space, populated islands.

Do NOT concentrate the game into one dense pocket. The owner explicitly likes Freelancer's
structure: long quiet stretches, populated hubs and working fields, and the specific dread of
being attacked in empty space with nothing around. Density belongs in the *islands* (stations,
belts, factory fields). Emptiness between them is a feature. See 07_LIVING_WORLD.

## I-7. Consequence memory is local and decays. (The GTA rule.)

Any system where the world remembers what the player did must:

- apply within a bounded radius / involved-parties set only;
- decay fully if the player leaves the area for a defined time;
- never chain into runaway escalation (no "attacked randomly forever because of one accident").

Witness → local response → cooldown → forgotten. Persistent reputation changes require
large, deliberate crimes, not traffic accidents. See 07_LIVING_WORLD §memory.

## I-8. The market must be a learnable function, not noise.

Station prices follow smooth, station-specific, predictable-within-a-regime equations that
re-randomize rarely and revert to a band. Charts that look like random steps are a bug, not a
feature. Full spec in 06_MARKET_COHERENCE.

## I-9. Built-wrong counts as not-built.

Much of this program is *already represented in code* but mis-tuned, mis-wired, or invisible in
play. An agent's first job on any Arcade Core task is to find the existing implementation, drive
it in a real route, and write down what it actually does. Only then: fix, tune, or rebuild.
"I didn't find it so I wrote a new one" is banned — parallel duplicate systems are how this
repo got contradictory.

## I-10. Agents cannot feel the game. Prove it with numbers and routes.

No Arcade Core task closes on "code looks right" or a still screenshot. Every plan names
metrics and a bot-drivable route (09_VALIDATION). If the metric can't be measured, build the
measurement first.
