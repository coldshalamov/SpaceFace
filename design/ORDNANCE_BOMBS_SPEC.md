<!-- LIFETIME: PROGRAM (preliminary implementation landed 2026-09-14; refinement continues) -->
# Drift-bomb ordnance — the bomb bay combat verb

Preliminary implementation is **live on the default route**: `Digit9` releases the selected bomb,
`Comma` cycles the payload (pad: `dRight` / `dLeft`). Everything below is the spec of the landed
system plus the refinement queue for the next agent. Tuning numbers live in exactly two files —
`src/data/bombs.js` (payloads + the drift law) and `src/data/combatDefs.js` (`status_goo`) — and
nowhere else.

## 1. The verb and its physics law

A drift bomb is **released ordnance, not thrown ordnance**:

- **Release**: the bomb leaves the bay at the ship's CURRENT velocity — full momentum inheritance,
  no throw speed added. It spawns one standoff (`radius + 7 WU`) behind the hull along the flight
  path (or off the nose below 12 WU/s).
- **Drift**: exponential decay `v(t) = v0·e^(−0.14·t)` (`BOMB_DRIFT.dragPerS`). At 0.14/s a bomb
  still carries 66% of release speed after 3 s and 50% after ~5 s: it floats on, falls behind a
  thrusting ship, keeps pace with a coasting one. Veer off — it keeps going. This is the one knob
  for "how fast do bombs slow down".
- **Fuze**: `armS 0.5` (proximity goes live), then proximity (hostile ship/drone inside
  `triggerRadius`, surface-distance) or time (`fuzeS`, always pops). **The fuze scan is
  hostile-only** (owner + same-team excluded) so formation flight and the dropper's own hull never
  trip it; **the blast is friendly-fire-on** (the ordnance law the impulse charges already follow —
  fly through your own concussion and it shoves you).
- **Bay**: per-payload cooldown (1.2–3.5 s), global cap 6 live bombs (oldest evicted). Selection
  is runtime-only at `state.bombs.selectedId` (a save/reload resets to the first payload and
  clears the cooldown — the fields-cooldown policy).

Ownership, exactly as the house requires: damage only through `routeCombatDamage` (statuses ride
packets), blasts through `helpers.combatPhysics.applyImpulse`, continuous pull through
`queuePhysicsImpulse` (a·mass·dt, the fields port), shoves published to the one hitstun law.
Bombs never write `entity.vel`, never touch hull directly, and do NOT prime chains (that state
belongs to impulseCharges alone). No rng anywhere in the sim path; timers are `state.simTime` /
`state.tick` only.

## 2. The eight payloads (`src/data/bombs.js`)

| # | id | name | the verb | key numbers |
|---|---|---|---|---|
| 1 | `bomb_frag` | Frag cassette | the baseline kill | dmg 30 explosive, impulse 420, R 96 |
| 2 | `bomb_concussion` | Concussion drum | pure shove, zero damage | impulse 1800 (≈56 WU/s on the pelican ref), R 130 |
| 3 | `bomb_singularity` | Neutron slug | moving decaying gravity source: pull + crush + collapse | pull 300 wu/s² coupled, 2.8 s, crush 6 plasma/0.5 s inside 60, collapse 500/16 |
| 4 | `bomb_goo` | Tarburst bladder | slow way down + corrosive DoT | `status_goo` ×2 on burst, ×1/0.5 s inside, volume 5 s, R 110 |
| 5 | `bomb_emp` | Static bomb | disable: subsystems dark, caps flat | dmg 26 `emp`, subsystemShare 0.85, shieldBypass 1.0, ionized ×2, R 72 |
| 6 | `bomb_thermite` | Thermite starter | attrition: what it sticks to keeps burning | dmg 20 thermal, burning ×2, R 104 |
| 7 | `bomb_scrambler` | Havoc pod | destabilize: tumble + lockout verbs | tumbling ×1, impulse 520, R 82 |
| 8 | `bomb_anchor` | Ballast slug | pin: weld a hull to its own inertia | `status_pinned` ×1 (massScale 6), R 88 |

The neutron slug is the design doc's own proposal made real: PHYSICAL_PLAY_GRAMMAR's
"Neutron slug | moving, decaying gravity source — the Well is static | proposed". It keeps
DRIFTING while its field is live — that is its identity. The pull reuses the field kernel's
coupling curve (`FIELD_COUPLING`: refMass 12, floor 0.05) so heavy hulls shrug exactly as much as
they shrug a Well; no second coupling curve exists.

`status_goo` (new, `src/data/combatDefs.js`) is a PHYSICAL slow, never a velocity write:
per stack `physicsResponse { massScale 1.8, inertiaScale 1.8 }` (the PINNED pipeline, ×5.8 at 3
stacks — thrust degrades, momentum survives, the hull wallows) + `multipliers.movement 0.72`
(combat actions) + a 3-kinetic/0.5 s corrosive tick. Duration 4 s, stacks 3.

FEEL_CONTRACT bars answered: radial-mine-at-centre bar (45% of light cruise) — the concussion
drum pays ~56 WU/s on the pelican reference and is the biggest shove in the bay, priced by the
longest cooldown. Impulse derivations reuse the impulse-charge reference masses (pelican 32 /
drifter 48); the number-and-why comments are inline in the data file.

## 3. Architecture map (what landed where)

| Concern | File(s) |
|---|---|
| Payload + drift data | `src/data/bombs.js` (pure data, no imports) |
| System (verb, fuze, fields, ports) | `src/systems/bombs.js`, id `bombs` |
| Goo status def | `src/data/combatDefs.js` (`status_goo` + cue id) |
| Entity index bucket | `src/core/coreSystem.js` (`bombs` bucket, 5 sites) |
| Input verbs | `src/systems/input.js` — `dropBomb: ['Digit9']`, `cycleBomb: ['Comma']`, edge actions, modal-clear, pad merge |
| Gamepad | `src/systems/gamepad.js` — `dRight` / `dLeft`, flight context |
| Registration | `src/core/registry.js` lookup + `src/runtime/authoritativeSystemManifest.js` (init + update, after `mines`, before `massSeed`/`fields`/`physics`) |
| Bodies (8 silhouettes) | `src/render/visualFactory.js` `buildBomb` + `case 'bomb'` |
| Detonation VFX | `src/render/vfx.js` `_onBombDetonated` / `_onBombFieldEnded` |
| Tests | `test/bombs.test.mjs` (9 seams, node:test, seeded) |

Bus events: `bombs:dropped`, `bombs:armed`, `bombs:cycle`, `bombs:detonated` (causal receipt:
`pos/payloadId/radius/trigger/hits/shoves`), `bombs:fieldEnded`, `bombs:released`. Audio cues
reuse `massline.bombDrop` / `sfx_explosion_small`; three NEW cue ids degrade silently until the
audio catalog adopts them: `bombs.goo.burst`, `bombs.emp.pulse`, (singularity reuses the small
explosion today).

Golden safety: the impulseCharges precedent, not the fields flag precedent — the system is a
strict no-op until the player presses the verb, nothing auto-spawns bombs, and `bombs` is absent
from the 47a curated sim list. Manifest counts moved 147→148 init / 109→110 update
(`test/authoritative-manifest.test.mjs` updated with the why).

Save policy: transient. Bomb entities never serialize (only player + `flags.persistent` do);
`state.bombs` is runtime-only. Selection reset on load is a refinement decision, not a bug.

## 4. VFX direction (landed preliminary)

Every detonation follows the heavy-impact law — consequence-forward, directional, never a
glowing ball or a stock ring (B1–B19 rejects). Landed reads: frag = compact core + real-direction
shock sheets + fragment fan; concussion = cool twin sheets, no hot core, no fragments (the read
is "the room emptied"); singularity open = spokes CONVERGING inward + a core that darkens,
collapse = small outward snap; goo = dull splatter along shove lines + lingering puddle (no
flash); emp = violet spokes radiating out, cold light; thermite = modest splash + embers that
keep glowing (the DoT read); scrambler = spiral streaks (tumble made visible); anchor = heavy
slug flash + streaks ONTO victims. All are reduced-flash aware. Bomb bodies are eight distinct
procedural silhouettes with a shared chassis grammar (shell + payload accent + arming pip that
lights when armed); the singularity's gyros and goo's bladder animate per frame.

## 5. Refinement queue (for the continuing agent, roughest value first)

1. **Feel pass against live reference speeds** — the impulse/drag numbers are derived on paper
   (pelican/drifter refs); they need a live chase (seeded stills or `npm run probe:runtime-witness`)
   and tuning against the FEEL_CONTRACT bars. `dragPerS` especially: 0.14 is the first guess at
   "floats, falls behind slowly".
2. **Economy + acquisition** — today the bay is a free cooldown verb. House options: cargo
   commodity per drop (impulse-charge precedent), fitted rack module (capacity/cooldown mods,
   `src/data/modules.js`), market items + tech gates, Crucible/swarm resupply
   (`src/systems/swarmSupply.js`).
3. **HUD** — a bay readout (selected payload + cooldown + armed count). The power rail is an
   8-slot Digit1-8 layout; decide 9th slot vs a separate chip (`src/ui/powerRail.js` reads real
   writers only). Add `dropBomb`/`cycleBomb` to `TAUGHT_FLIGHT_ACTIONS` + help text + the
   settings rebind labels when the HUD lands.
4. **Audio catalog adoption** — the three new cue ids; give the neutron slug its own voice (a
   rising inhale over the field, a snap at collapse) rather than the small explosion.
5. **NPC droppers** — mine-layer doctrine (`mine_layer_jackal`, hunterTricks `wake-mines`,
   encounter 325) are the natural adopters: hostile drift bombs on a pursuit lane are the
   counterplay mirror of the player verb. Wire through `bombs:dropped` events or a helper like
   `helpers.placeMine`.
6. **Shootable bombs** — counterplay today is "leave". A ghost projectile-sweep body (the W03
   mine pattern, `collisionMask: Masks.PROJECTILE`) needs a moving-kinematic answer first; keep
   the fuze honest if the body is destroyed.
7. **Loose-mass coupling** — singularity pulling pickups/wrecks and concussion shoving asteroids
   is the comedy the fields kernel already proves; upgrade the scans to the spatial hash
   (`queryNearbyEntities`) when wanted.
8. **Chain interplay** — bombs deliberately do not prime. If a bomb blast should prime (it knocks
   hulls past the stun law), the prime call belongs to impulseCharges; decide, don't duplicate.
9. **Selection persistence** — `state.bombs.selectedId` in the player save subtree if players
   complain about the reset (save-schema regenerated after).
10. **Authored bodies** — the eight procedural silhouettes are designed but procedural; GLB
    replacements go through the visual-asset standard (preflight, Tier records). Also consider
    payload trail VFX while drifting (a faint tumble ribbon), and captions for the goo status.

## 6. Checks

- `node --test test/bombs.test.mjs` — 9 seams: release law + drag, arm/fuze/proximity routing,
  friendly-fuze vs friendly-blast, pure-shove port discipline, neutron slug open/pull/crush/
  collapse through the physics authority, goo burst + volume re-apply, cycle, cooldown + cap
  eviction, sector-exit release.
- `npm run check:baseline` — manifest counts, input contract, save schema, goldens all green
  after the landing.
