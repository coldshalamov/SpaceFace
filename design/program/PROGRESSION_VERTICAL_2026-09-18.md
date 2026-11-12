# Progression Vertical — 2026-09-18

The build-defining frontier of SpaceFace progression: what a fit **does**, not what it adds.
Companion artifacts: `design/program/PROGRESSION_VERTICAL_AUDIT.md` (generated scalar/verb
audit), `.devshots/build-identities/report.md` (the fit-archetype pilot receipt), and
`npm run check:build-identities` (re-runs the acceptance).

## 1. The audit

`npm run check:progression:verbs` (`scripts/check-progression-verb-audit.mjs`) classifies every
shipped module, weapon, and tech node mechanically and fails on vocabulary drift. Current state:
**88 modules — 45 verb / 12 intel / 31 scalar; 26 weapons — 26 verb; 32 tech nodes — 29
strict-verb / 9 broad-stat / 3 strict-stat** (strict-stat nodes carry written justifications in
the verb ladder). The report is generated; rerun after adding any module.

## 2. The Massline head catalog

The designed head catalog (tractor, elastic whip, frame coupler, monofilament sweep, transverse
snare, twin bridle) is **shipped, purchasable, and gated** (`tech_tractor_systems`,
`tech_fire_control`), with per-head physics (`src/combat/attachments.js`), per-head tests
(`check:massline:heads`, 57/57), mutual exclusion in fitting, and hostile counterplay (the
`tether_control_raider` sweeps, aces cut bridles, heavies shrug).

What was missing — and is now in: **a readable counter for every head** in bestiary data
(`src/data/masslineCounters.js`), surfaced in the combat-range Bestiary pane (tell + counter per
head, matched to the implemented mechanics: snare anchors are shootable at 28 hull, a sweep only
severs a taut rope, a bridle is beaten by cutting a leg or outmassing it).

## 3. Six new build-defining items (this packet)

Every item adds a verb — a thing the fit can now do — and every verb is implemented, gated,
and deterministic:

| Item | Tech | Verb |
|---|---|---|
| Swing Drive M (`mod_swing_drive_m`) | drive tuning | The dash, on a taut line, becomes a pendulum: the impulse redirects onto the line's tangent, uprated 1.35x, published as `ship:swingDash`. |
| Loot Magnet Ring S (`mod_loot_magnet_s`) | tractor systems | Free salvage bodies inside `derived.lootMagnetRange` drift to the hull through physics authority (`loot:magnetCaptured`); custody still needs the claim verbs. |
| Mass Flail Rig M (`mod_mass_flail_rig_m`) | tractor systems | While towing a >100 t load, the player's direct contacts strike with the load's mass (×1.0–2.4, `tow_flail` provenance). |
| Point-Defense Servo S (`mod_pds_servo_s`) | fire control | Autonomous intercept: kills the nearest hostile projectile in its ring on a cooldown (`pds:intercept`); always on while fitted. |
| Signal Decoy Buoy S (`mod_decoy_buoy_s`) | deflector theory | A bait verb: for the buoy's whole life, ANY seeker crossing its water re-attacks the buoy — chaff only diverts missiles already aimed at you. |
| Gravity Wellhead M (`wpn_gravity_well_m`) | graviton drives | A deployed sustained pull (DEPLOY fire path, mine lifecycle): drags every hull inside its radius toward it for its whole life — gravity does not check team tags. |

## 4. Four build identities, proven

`node scripts/check-build-identities.mjs` (`check:build-identities`) runs four scripted pilots —
same hull (Drifter), same seed (20260918), same content (three production-spawned corsair
raiders, a towable mass, a terrain ring) on the real authoritative runtime
(`bootRealPath`: rapier-dynamic + SG-02 + live systems). Each pilot is a deterministic policy
writing only the ordinary input contract. Acceptance: every identity completes the content alive,
its signature verbs fired, and the identity-distinctive verb profiles are pairwise distant.

| Identity | Fit spine | Signature verbs |
|---|---|---|
| Momentum Predator | elastic whip + swing drive + concussion cannon | whip snaps, swing dashes |
| Control Specialist | transverse snare + decoy buoy + beam | snare lays, decoy baits |
| Precision Pilot | monofilament sweep + point-defense servo + railgun | gun work, line cuts, intercepts |
| Salvage Industrialist | frame coupler + mass flail rig + autocannon | tow latch, flail strikes |

The receipt in `.devshots/build-identities/report.md` carries the full verb table.

## 5. Repairs the work surfaced

- **Tow-shadowing bug (fixed)**: `playerRamPlateImpact` read the freshest impulse provenance —
  while towing, the rope's own provenance shadowed the contact's `direct_contact` attribution and
  silently disarmed the ram plate and the flail. `_resolveTarget` now reads the contact's own
  causal attribution for the ram/flail check.
- The impulse-authority gate now recognizes gravity wellheads: their declared impulse identity is
  the sustained pull (`mineWellPull`) plus the provenance law, never a fake blast momentum.
- `tech_long_range_survey`'s `mod_sensor_post` unlock is an outpost (claimable-body) module, not a
  ship fitting; the audit resolves unlock refs against both catalogs.

## 6. Save schema

Additive only: new module ids are fittings strings; new capability keys (`swingDrive`,
`towFlail`, `lootMagnetRange`) and the point-defense/decoy configs are recomputed from fittings
at load — nothing persisted, no migration. `SAVE_SCHEMA.md` is untouched.
