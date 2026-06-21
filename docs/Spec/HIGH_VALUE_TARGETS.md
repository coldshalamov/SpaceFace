# SpaceFace — High-Value Targets for a Strong Code-Gen AI

**Purpose:** A small set of specific, high-leverage files. Each is a real bottleneck diagnosed in the
actual codebase (not generic advice). Hand these to a strong AI to generate improved versions. The goal
is to get the game over the "obviously shitty" hump to "mediocre-to-good," after which stylistic
tweaking becomes meaningful.

**How to use this doc:** give the AI the relevant section below + the file it's replacing + any
referenced context files. Each target states the problem, the bar, and what "done" looks like. The AI
should read the existing file and the referenced docs/data, then produce a drop-in replacement.

**Critical context the AI must have:** the game's worldbuilding is genuinely rich and literary
(`docs/worldbuilding/`, esp. `orgs/factions-CANONICAL.md`, `characters/NPCs-CANONICAL.md`, and the
story spine in `src/data/narrative.js`). The problem is that **this richness is stranded in docs and
never reaches the gameplay the player actually touches.** Every target below is partly about wiring
the good writing into the game.

---

## TARGET 1 — Fix the "boring" opening (gameplay pacing)

### 1A. `src/data/newGameDefaults.js`
**Problem:** The player starts with `fittedModules = ['mod_mining_laser_s', 'mod_engine_ion_m',
'mod_shield_booster_s']` — **no weapon.** This forces 10–30 minutes of pure mining before combat (and
therefore before the first story beat "First Blood" / B2) is reachable. The game's best content sits
locked behind the dullest verb.
**Bar:** A new player should reach their first combat encounter and the first story beat within ~5
minutes, not 30.
**Done looks like:** Starting kit includes a basic weapon (e.g. `mod_pulse_cannon_s`); starting credits
bumped from 5000 toward ~8000–10000; the starter weapon's prerequisite research (`tech_combat_basics`)
either granted or removed. Mine/trade become *choices*, not a forced tutorial prison.

### 1B. `src/systems/onboarding.js`
**Problem:** The intro card pitches the game as "turn rocks into credits" and the 5 tutorial steps are
all mining/trade — selling a conspiracy-narrative game as a mining simulator.
**Bar:** The first 5 minutes should hook the player on the *actual* game (combat + story), not mining.
**Done looks like:** Intro rewritten to foreshadow the conspiracy / first contract (reference Contract
47-A or the mass discrepancy — see `src/data/narrative.js`); tutorial resequenced so a combat encounter
and the B2 "First Blood" beat land within the first few minutes (possible now that 1A gives a weapon).
Keep the existing 5-step staged chain structure — it's well-built; change the *content and order*, not
the architecture.

---

## TARGET 2 — Fix the "confusing" disconnect (writing & lore wiring)

### 2A. `src/systems/missions.js` (the `_titleFor` / `_generate` / mission-offer object)
**Problem:** Missions are bare template strings — `"Haul 12u Industrial Components to Meridian Hub"`,
`"Mine 10u Silicate"` — and the mission object has **no description/flavor field at all.** The mission
board is the surface players stare at most, and it's the most generic text in the game. None of the
worldbuilding (Contract 47-A, the mass discrepancy, the factions' real roles) touches it.
**Bar:** Every mission should read like it belongs in this specific world, not a template.
**Done looks like:** Add a `brief` / `flavorText` field to the mission offer object; write evocative
in-world contract copy per mission type that ties contracts to the canonical factions
(`docs/worldbuilding/orgs/factions-CANONICAL.md`) and the 47-A/mass-economy lore
(`src/data/narrative.js`). E.g. a Meridian haul mission references bulk-shipping manifests; a Reach
bounty references the mass discrepancy; a Quiet smuggling mission references hidden compartments.
Keep the mission *mechanics* identical — only upgrade the writing layer.

### 2B. `src/ui/screens/bar.js`
**Problem:** The bar procedurally invents throwaway NPCs ("Orion Vance, Barkeep") from generic name
pools with one-line clichés — while **eight fully-drawn canonical characters** (Quinn, Kessler, Mira,
Slate, Hale, Elroy, Rook, Voss) sit unused in `src/data/narrative.js` /
`docs/worldbuilding/characters/NPCs-CANONICAL.md`, each with a documented role, tell, and caper.
**Bar:** The dock should be where the worldbuilding actually lives.
**Done looks like:** The bar surfaces the canonical NPCs (with their real names, roles, and dialogue
from the canonical docs), each offering conversation that hints at the conspiracy and the faction
economy. Procedural filler NPCs can still exist as background, but the named characters are the
anchors. This is the single biggest "the world has depth" lever.

### 2C. `src/ui/screens/help.js` (the Codex) — optional third
**Problem:** The codex is stat-tables only (Controls/Ships/Commodities/Ores/Factions) — no
worldbuilding glossary. A player who reads "47-A" in a comms popup has nowhere to look it up, so
cryptic lore reads as jargon noise.
**Done looks like:** Add a "World" / "Lore" tab defining the Pit, Contract 47-A, REF 44-C, the Vethari,
and the Kurtz figure, plus richer faction entries pulling from
`docs/worldbuilding/orgs/factions-CANONICAL.md`. Turns cryptic comms into threads the player can pull.

---

## TARGET 3 — Fix the "janky" flight & combat feel

### 3A. `src/core/flightDynamics.js` (+ mirror changes in `src/systems/ships.js`)
**Problem:** The flight model is semi-Newtonian (good foundation) but tuned toward mushy/sticky:
- A hard `turnRateCap = 3.8` rad/s (line ~12, and `maxYawRate` clamped at line ~78–81) means a light
  fighter barely out-turns a heavy hauler — dogfights feel sticky and compressed.
- Assisted mode stacks `linearDrag + lateralDrag + assistStrength` on the lateral component (line ~237),
  killing strafe/drift almost instantly — the ship feels "on rails."
- **The cap constants are duplicated and disagree** across `flightDynamics.js` and `ships.js`
  (e.g. fighter strafe is 1.12 in one, 0.68 in the other). A retune must touch both and consolidate.
**Bar:** A dogfight should feel darting and agile, not turn-limited and sticky.
**Done looks like:** Raise/remove the yaw cap so light ships meaningfully out-turn heavy ones; decouple
lateral damping in assisted mode so strafe keeps some life; consolidate the duplicated/contradictory
tuning constants into one source of truth. Verify the Kestrel (starter) and a fighter both feel
responsive. Keep the banking (it's good — `bankMax 0.68`, `bankResponse 9.5`).

### 3B. `src/render/camera.js`
**Problem:** The chase cam makes decent flight feel bad: dynamic zoom pulls *out* 15% in combat, 12% on
boost, 20% at dash-speed — **your ship shrinks exactly when the action starts** (the opposite of what
you want). Plus a per-frame full-entity scan for nearby enemies (lines ~65–70) adds lag.
**Bar:** The camera should pull *in* / tighten in combat, not push out.
**Done looks like:** Tighten `c.lerp` (snappier follow), reduce/reverse the combat zoom (a slight
*push-in* in combat reads as intensity), and replace the per-frame entity scan with a cached count or
spatial query. Reference: `createChaseCamera`.

### 3C. `src/render/feel.js` — optional third
**Problem:** The juice system (hit-stop, FOV punch, vignette, speed-lines) is genuinely excellent but
**gated to ≥25 damage / kills / death** (line ~207) — so ordinary hits and collisions never trigger
punch. Combat "doesn't land" even though the juice exists.
**Done looks like:** Lower the trigger threshold so chip damage and the `collision` event produce punch;
add a small collision-specific trigger. (Bonus, separate: add fire-recoil — a 3-line backward impulse
on the ship when a weapon fires — currently missing entirely.)

---

## TARGET 4 — Fix the "ugly" (already spec'd separately)

See `docs/Spec/SHIP_PARTS_LIBRARY_SPEC.md` + `docs/Spec/SHIP_PARTS_LIBRARY_PROMPT.md` (the parts
library). This is the art path and needs a modeler, not a code AI — but it's listed for completeness.

**Also: a no-regret render upgrade I can do in-code now (no AI needed):** wire the vendored
`SSAOPass.js` (currently unused), drop the ambient light from 0.85 → ~0.3, add a real HDRI. Lifts every
ship immediately. Ask me and I'll do it on master.

---

## Suggested order of operations

1. **Target 1A + 1B first** (starting kit + onboarding). Cheapest, biggest unlock — gets you (and any
   playtester) past the mining prison into the actual game in one session. You'll immediately feel the
   game differently.
2. **Target 3A + 3B** (flight + camera). Once you're actually fighting, the janky feel becomes the
   thing standing between you and fun.
3. **Target 2A + 2B** (mission writing + bar). Once the loop feels good, the writing makes the world
   feel alive instead of generic.
4. **Target 4** (art) last — it's the most work and matters most once the game is actually *worth*
   looking at.

The first three targets are pure code/data the AI can generate as drop-in file replacements. None
require new assets. Together they address "boring, confusing, janky" directly. Art (Target 4) is a
separate, slower track that pays off most once the game underneath is good.
