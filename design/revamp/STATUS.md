# SpaceFace Revamp — Wave 1.5 Status

Captured: 2026-07-05 (post Wave-2 combat closure + story/HUD minimum).

## Shipped (Wave 1.5)

### Combat ceiling (BP-02) — closed for play
- Shared lead solver exported from `src/systems/weapons.js` (`solveLeadAngle`); HUD façade in `src/ai/gunnery.js`
- Lead pip overlay in `src/ui/hud.js` + `.sf-leadpip` styles in `src/ui/uiRoot.js`
- Damage triangle (E/K/X) on `src/ui/targetPanel.js` against current shield/armor/hull layer
- Scan → weak-point reveal → bonus damage + callout (`src/data/weakPoints.js`, `scanner.js`, `combat.js`, `floatingText.js`)
- Missile LOS + fuel + coast (`combat.missileV2` flag); momentum inherit stub stays OFF
- Tier-B flags in `src/data/featureFlags.js` (OFF in node golden, ON in browser)
- Acceptance: `npm run check:combat-ceiling`

### Story wire minimum (BP-05)
- Helix Directorate paper faction in `src/data/factions.js` (`faction_helix`, zero ships)
- B8 beat registered in `src/data/narrative.js` (`BEAT_CONTENT[8]`, `story_b8_helix_audit`)
- B8 fires once on `salvage:communicatorFound` via `src/systems/story.js` `_onB8SalvageTrigger`
- Story comms route surfaced notifications through `ctx.helpers.voice.say` (one-voice arbiter)
- Acceptance: `npm run check:story-beats`

### Contact HUD identity (BP-10 subset)
- Target panel identity row: faction · role · state · threat tier · level (`sf-target__identity`)
- Extended `scripts/check-ui-identity.mjs` coverage

### Regression floor (unchanged baseline)
- `check:bundle`, `check:mining:2`, `check:ai` green
- `check:sim:compare` fails **only** on documented 47-A projectile-collision precondition (`design/revamp/_BASELINE.md`)

### Evidence (scratch)
- `wave15-regression.log`, `wave15-combat-ceiling.log`, `wave15-story-beats.log`, `wave15-ui-identity.log`, `wave15-boot.log`

---

## Remaining (hard half of Wave 2)

### BP-07 Flight & traversal — **not started** (highest golden risk)
- Brake-to-stop (Space), mass-wired handling, leash-steering to GDD targets
- Ring-lane mechanic (traversal code; gate visuals remain Grok lane)
- Tether traversal extensions (yank, wreck tow, slingshot)
- Requires Fable advisor sign-off + fresh baseline diff before touching `flightV3.js`

### BP-05 Story — full corpus deferred
- Complete B8+ beat registry (only B8 minimum shipped)
- Wren artifact quest chain (cargo item, anomaly/salvage depth, quest markers)
- Manifest phases 2–3 *content* expansion (phase machinery exists; more beats needed)
- NPC-ecology graffiti web (Kessler↔Drift↔Voss↔… full wiring)
- Callum encounter, VALE registry sightings, faction bark corpus on all SG-06 transitions
- Endgame A–E re-wire (already built; no change needed)

### BP-10 Render code — gaps
- Standalone `src/render/ribbonTrails.js` extraction (ribbons exist inline in `vfx.js`)
- Dedicated contact badges on radar (overview strip has threat tier; radar row not extended)
- `check:perf` re-measure with all post toggles on (bloom/ACES/fog/lights pre-exist)

### BP-02 Combat — optional/deferred
- `beamWeapons.js` module (pipeline already in `weapons.js`→`combat.js`; document only)
- `momentumInherit` playtest enablement
- `check:combat-ceiling` browser screenshot proof (module smoke + structural checks pass)

### Wave 2 §6 handoff — partial
- This STATUS doc replaces ad-hoc `CURRENT_BUILD_STATUS` drift for revamp scope
- `design/revamp/WAVE3_PROMPT.md` pre-authored (detail layer); Wave 4 holds wingman orders, one-map cutover, overload/vent, tooltips/a11y

### Asset-gated (Grok lane — out of scope for Wave 1.5 code goal)
- Blender/GLB authoring, `parts_manifest.json`, ring-gate/landmark visuals, PBR hero maps
- **Note:** `assets/**` / `parts_manifest.json` / `blender/*.blend` changes visible in the working tree are **pre-existing graphics-revamp lane work** (see `scratch/verify_reaudit.txt`: 27/63 assets passing) — **not introduced by the Wave 1.5 code session**. This goal touched only `src/**`, `scripts/check-*.mjs`, `package.json`, and this STATUS doc.