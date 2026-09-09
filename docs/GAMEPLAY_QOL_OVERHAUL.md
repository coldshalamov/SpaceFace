# SpaceFace Gameplay & Quality of Life Overhaul Directive

**Actionable Specification for Systems & Combat Tuning**  
*Prioritizes satisfying action, progression, and player flow over tedious micromanagement.*

---

## 1. Super-Wide Vacuum Cargo Attractor

### The Problem
Currently, in `src/systems/mining.js`, the vacuum magnet only queries and pulls `type === 'pickup'` (ore nuggets and credit chips). Destroyed enemy ships and civilian wrecks spawn cargo crates and jettisoned pods as `type === 'payload'` (`src/systems/lootShards.js`), which the magnet completely ignores! Players have to manually steer their ship directly into microscopic floating collision boxes in zero-G, which is frustrating and clunky.

### The Solution
1. **Universal Attraction:** Extend the magnetic attractor in `src/systems/mining.js` to attract **both** `type === 'pickup'` and `type === 'payload'` (floating cargo pods, salvaged crates, jettisoned goods).
2. **Super-Wide Radius:** Double the pull radius from 420 to **800+ WU** (`MAGNET_RANGE = 800`).
3. **Snappy Vacuum Physics:** Increase `MAGNET_ACCEL` and approach velocity so that flying anywhere in the vicinity of a cracked rock or destroyed ship effortlessly draws all loot directly into the cargo hold, accompanied by a crisp physical collection cue.

---

## 2. Cargo Capacity Expansion (Progression Without Frustration)

### The Problem
In `src/data/ships.js`, ship cargo holds are tiny:
- Starter ship (Hitch): **40 units**
- Wasp fighter: **15 units**
- Pelican miner: **60 units**
- Mule hauler: **140 units**

Mining a single rich asteroid or killing two raiders immediately triggers `HOLD FULL`. Instead of enjoying combat or mining, the player is trapped in constant inventory micro-management.

### The Solution
Rebalance baseline cargo volumes across all ship tiers:
- **Starter (Hitch):** 40 $\to$ **250 units** (ample room for early missions, bounty loot, and mining).
- **Fighters / Scouts:** 15 $\to$ **100–150 units** (can collect dogfight salvage without getting choked).
- **Miners (Pelican, etc.):** 60 $\to$ **600 units** (allows substantial mining runs before needing to offload).
- **Freighters (Mule, etc.):** 140 $\to$ **1500+ units** (meaningful high-volume cargo trading).
- **Progression Lever:** Cargo hold expansions and modules remain valuable for players who want to build dedicated bulk-freight empires, but baseline gameplay is freed from annoying micro-inventory stops.

---

## 3. Removal of Fuel & Ammo Constraints

### The Problem
The game tracks separate fuel reserves and ammo counts on the flight HUD (`energy`, `drive`, `fuel`). Managing fuel and ammo adds unnecessary friction and cognitive load without enhancing combat fun.

### The Solution
1. **Remove / Hide Fuel Constraints:**
   - Remove the fuel meter from the flight HUD.
   - Travel between sectors is physically gated by navigational jump gates and rings—requiring players to reach the gate is already a natural, fun spatial mechanic without needing a gas station pitstop.
2. **Cooldown & Energy Gating for Weapons:**
   - Advanced weapons are balanced by **energy draw**, **heat accumulation**, and **cooldown timers**, not consumable ammo counts.
   - The rhythm of firing a heavy railgun or missile volley, managing weapon heat, and venting radiators is fun and tactical; running out of ammo boxes in deep space is not.

---

## 4. Resilient Self-Recharging Shields (Directional Shimmer & Blowout)

### The Problem
Previous shield visuals were either an ugly, pervasive opaque "egg shell" surrounding the ship, or shields felt so flimsy that the player was constantly taking permanent hull damage, forcing frequent repair stops.

### The Solution
1. **Invisible by Default:** Shields must be 100% invisible during normal flight. No persistent bubble or sphere mesh.
2. **Directional Impact Shimmer:** When a projectile or beam strikes the shield:
   - Render a brief, localized ripple or hex-lattice flash on the hull surface oriented in the exact angle of the incoming hit.
   - Disappears immediately after the impact.
3. **Beefy & Self-Recharging:**
   - Significantly increase shield capacity and base shield regen across all player hulls.
   - The shield acts as a generous regenerative buffer. As long as the shield is up, hull HP is 100% protected.
   - Once out of combat fire for 3–4 seconds, shields rapidly recharge to full.
4. **Clear Blowout Cue:**
   - When shields drop to 0, play a distinct electrical blowout pop, an audible alarm, and a momentary HUD glitch/flicker.
   - Communicates instantly that the player is now vulnerable to real hull damage and needs to pull back.

---

## 5. Noise & Atmosphere Discipline
- **No Constant Drone Loops:** Do not add annoying, abrasive continuous engine hum loops that drone in the player's ears during routine flight.
- **No Cringe Radio Toasts:** Reject spammy AI toast chatter. Ambient immersion comes from world fidelity, lighting, sound effects, and clean mechanics, not dialog spam.
