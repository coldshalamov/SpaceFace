# SOLSTICE / SL-9 — The Star Lantern

An original SpaceFace character, astronomical automaton, and interactive celestial encounter.

> “Traveler. The belt is dark and full of cold iron. Come into my focal plane; let the light find your hull.”

---

## 1. Why this character

SpaceFace features gritty mining belts, corporate stations, raiders, and industrial shipyards. What the asteroid belt (specifically **Ceres Belt**, the first jump outside tutorial space) lacked was a sense of wonder, ancient cosmic scale, and luminous companionship.

**SL-9 · SOLSTICE** is an ancient astronomical lantern and deep-space observatory automaton. Stationed in the dark northwest pocket of Ceres Belt, Solstice gathers stray stellar radiation into a captive solar heart, casting coherent light beams across the asteroid fields.

Solstice is not a shop vendor or a combat boss. She is a celestial presence that rewards observation, navigation, and playful physical mechanics with your ship and your Massline tethers:
1. **Beam Riding & Solar Recharge**: Flying through her coherent light beam rapidly regenerates your shields and energy capacitor, and staying in the beam grants a radiant **Lumen Charge** speed buff.
2. **The Harmonic Triquetra (Prism Alignment)**: Three physical Focus Prisms (Amber, Emerald, Sapphire) float in magnetic orbit around Solstice. By towing, nudging, and slinging these prisms with your Massline into their 120° harmonic focal nodes, you trigger a **Supernova Bloom** — an expanding shockwave of light that washes over the asteroid field and drops rare resonant mineral crystals.
3. **The Lumen Wisp Companion**: After achieving the Supernova Bloom, hailing Solstice deploys a friendly, tiny companion drone — the **Lumen Wisp** — with fluttering copper wings and a warm forward headlight that accompanies the player on their journeys through Ceres Belt.
4. **Rich Personality & Easter Eggs**: A calm, poetic, witty lighthouse-keeper persona who notices when you orbit like a hyperactive comet, when you drift in motionless silence, or when you deliberately cast an eclipse shadow.

---

## 2. Location and Discovery

- **Sector**: `sector_ceres_belt` (Ceres Belt).
- **Coordinates**: Sector-local `{ x: -840, z: -760 }`.
- **Chart POI**: `poi_solstice_lantern` ("The Star Lantern", type `anomaly`).
- **Scanner Discovery**: Approaching within 420 WU reveals the anomaly signal on scanner and HUD. Pulsing within 320 WU hails Solstice.
- **Visuals**: Easily spotted from distance by her sweeping volumetric golden light cone and pulsing prismatic stellar heart turning in the dark asteroid shadows.

---

## 3. Physical & Gameplay Mechanics

### A. The Core & Beam Riding
- **Core Entity**: Kinematic heavy automaton (`radius: 26`, `mass: 45000`, `hull: 2000`, `flags.invuln = true`).
- **Directional Stellar Beam**: Projects a coherent conical light shaft (`length: 170 WU`, `halfAngle: 0.38 rad`). Solstice slowly sweeps the beam across the belt or gently tracks the player's ship when hailed.
- **Riding the Beam**:
  - Shield recharge: +22 points/sec.
  - Energy recharge: +44 points/sec.
  - Continuous beam dwell (2.5 seconds): Solstice charges your drive coils, granting the **Lumen Charge** buff (`+25% boost speed` for 20 seconds, accompanied by warm audio chimes).

### B. Focus Prisms & Harmonic Resonance
- **3 Focus Prisms**:
  - `Prism Alpha`: Amber crystal (`0xffaa22`).
  - `Prism Beta`: Emerald crystal (`0x33ee88`).
  - `Prism Gamma`: Sapphire crystal (`0x33aaff`).
- **Physics**: Real dynamic bodies (`mass: 24`, `radius: 5.5`, `hull: 800`, `ccd: true`, `restitution: 0.75`).
- **Magnetic Equilibrium**: Soft spring restoring forces keep them in orbital equilibrium around Solstice.
- **Massline Interaction**: The player can attach a Massline tether to any prism. While tethered, the restoring spring yields, allowing the player to tow, sling, and maneuver the prism freely.
- **Resonance Nodes**: When a prism is positioned within 26 WU of its focal target node (at angles 0, 2π/3, 4π/3 around the core at radius 82 WU), it locks into harmonic resonance: its aura brightens and emits a high-overtone glass chime.

### C. Supernova Bloom
- When all three prisms are held in resonance simultaneously for 1.8 seconds:
  - Solstice unfolds her solar reflector mirrors into a full blossoming aperture.
  - A magnificent expanding shockwave of golden/azure light expands outward to 360 WU radius (`solstice:bloom` event).
  - A cluster of rare mineral crystals (`cmdty_ore_rare`) is released into space for the player to collect.
  - Save memory updates: `state.solstice.bloomed = true`.

### D. Lumen Wisp Follower
- Once bloomed, scanning Solstice toggles the **Lumen Wisp** companion.
- The Lumen Wisp (`radius: 3.5`) features two fluttering copper wing vanes and a soft forward headlight.
- Follows the player with critically-damped zero-g pursuit physics, lighting up dark asteroids and crevasse shadows. Scanning Solstice again recalls the wisp.

---

## 4. Personality, Dialogue & Easter Eggs

### Voice Lines
- **Discover**: *"SL-9 · SOLSTICE — an ancient stellar lantern turning in the dark belt. Scan to hail."*
- **Hello**: *"SOLSTICE: Traveler. The belt is dark and full of cold iron. Come into my focal plane; let the light find your hull."*
- **Welcome**: *"SOLSTICE: A familiar silhouette on my lenses. Welcome back into the light."*
- **Beam Enter**: *"SOLSTICE: Good. Hold that line. Let the photons wash the frost off your plating."*
- **Full Charge**: *"SOLSTICE: Shield capacitors saturated, drive coils humming. You glow nicely in the dark."*
- **Tether Prisms**: *"SOLSTICE: Mind the mirrors. Those were ground before your station laid its first girder."*
- **Harmonic Bloom**: *"SOLSTICE: Resonance achieved! Three colors, one focus. Behold the bloom!"*
- **Deploy Wisp**: *"SOLSTICE: Take a spark of my hearth with you. It doesn’t like being alone either."*
- **Recall Wisp**: *"SOLSTICE: Welcome home, little spark. Come back whenever the dark gets too cold."*

### Easter Eggs
1. **Speed Orbit**: Orbiting Solstice at high speed (tangential speed > 110 WU/s within 140 WU):
   - *"SOLSTICE: Look at you, orbiting like a hyperactive comet! Don’t get dizzy."*
2. **Drifting in Silence**: Cutting engines and drifting motionless (speed < 1.0 WU/s) within 70 WU of Solstice for 5 seconds:
   - *"SOLSTICE: Stillness in a universe that won’t stop expanding. I like your company, pilot."*
3. **Eclipse**: Flying between Solstice's core and a focus prism while inside the light beam:
   - *"SOLSTICE: A deliberate eclipse. You make an excellent shadow puppet."*
4. **Defensive Folding**: Firing weapons at Solstice:
   - Solstice folds her reflector mirrors tightly shut for 12 seconds: *"SOLSTICE: Photons I understand. Ballistic ammunition is dreadfully uncivilized. I am closing my mirrors."*

---

## 5. Architectural & System Contract

| File | Role |
|---|---|
| `src/data/solstice.js` | Constants, dialogue, save schema normalization, and 5 Web Audio oscillator recipes. |
| `src/characters/solsticeRules.js` | Pure geometric calculations: beam cones, focal nodes, tether checking, and wisp follower servos. |
| `src/systems/solstice.js` | Authoritative system owner: entities lifecycle, beam riding, alignment detection, bloom rewards, save capture/restore. |
| `src/render/characters/solsticeModel.js` | Three.js hard-surface art: icosahedral heart, counter-rotating gimbal rings, articulated petals, volumetric beam, prism cages, and wisp wings. |
| `test/solstice.test.mjs` | Simulation tests: registration, beam mechanics, resonance bloom, wisp following, easter eggs, save/load. |
| `test/solstice-model.test.mjs` | Art tests: finite geometry, triangle budgets, matrix preservation under static freezing, disposal, accessibility. |

- **Save Integration**: Captures memory (`met`, `bloomed`, `wispActive`, `visits`, `chargesCount`, `bloomsCount`, `hull`) on both direct and chunked save paths. Whitelisted and versioned.
- **Render Integration**: `visualFactory.js` dispatches `solsticePart` before generic drone art. Meshes implement `updateAuthoredMotion(entity, simTime, a11y)`. Supports `reducedMotion` and `reducedFlash`.
- **Audio Integration**: 5 unique synthesized procedural Web Audio recipes in `RECIPES` (`sfx_solstice_wake`, `sfx_solstice_chime`, `sfx_solstice_charge`, `sfx_solstice_bloom`, `sfx_solstice_wisp`).
- **No External Media**: 100% authored code, math, and Three.js geometry. No external images, no ambient RNG, no frame-rate dependency.
