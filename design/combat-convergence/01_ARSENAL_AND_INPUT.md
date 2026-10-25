# 01 — Arsenal comprehension and input integrity

**Outcome:** the player can identify the kit they actually have, predict a button's effect, and intentionally combine tools without consulting source code. Planning only. Dependencies: evidence audit and existing UI/input owners. Relevant evidence: E01–E04, E10, E13.

## Investigate the complete route

Build a live capability census, not another weapon catalog. For each baseline power, weapon family, fitted support verb, and mode-specific item, trace: stable ID → acquisition/unlock → fitted instance → active action → simulation owner → visible effect → feedback → teaching entry. Record separately: defined, obtainable in this mode, equipped, reachable by this device, witnessed working, and accepted by a player. An item can pass the first five and still fail the last two.

Inspect `src/data/arsenalIdentity.js`, `src/ui/orrery/arsenalGlyphs.js`, `src/ui/powerRail.js`, `src/systems/powerVerbs.js`, `src/systems/input.js`, `src/systems/gamepad.js`, `src/systems/mobile/catalog.js`, the fitting/armory screens, and actual catalog retirement rules. Follow aliases and effective ordnance selection; do not assume a catalog row means a store purchase. Include legacy-owned equipment and mode-specific rewards without pretending they are available in every mode.

The key audit question is not whether icons exist. It is whether the fitted pulse, mass tool, explosive, cloak, and support action have distinct, sufficiently large marks on every surface where the player makes a choice. Test actual assets, fallback glyphs, clipping, contrast, hover/touch exposure, disabled styles, and tiny variants at gameplay resolution.

## One presentation projection, not a new rules engine

Extend the existing identity/rail projection to resolve the effective action from the authoritative weapon, fitting, binding, mode, and state. Do not introduce a second ability registry that restates damage, cooldown, costs, geometry, or eligibility.

A resolved presentation entry needs the stable ID, display name, glyph, role, current verb, binding label, effective target mode, range/shape, cost, cooldown/charges, readiness reason, and concise combination affordances. These are reads. It must be possible to inspect which owner supplied each value. Cache on fitting/mode/binding changes and relevant runtime revisions rather than recomputing the entire arsenal every frame.

Use actual compiled weapon/modifier results for changed behavior. A chain module should describe its allowed targets and hop rule, not an unrelated base-weapon sentence. Unknown/modded items may use a clearly marked generic family glyph, but must not masquerade as a verified authored identity.

## Teach action, result, and limit

Use a three-level disclosure pattern within ORRERY:

- Flight: recognizable glyph, short current action, binding, and a compact readiness indicator.
- Intent/inspection: one sentence for the direct result; affected geometry and bodies in the world; the most relevant limitation or denial reason.
- Armory/help: live numerical properties, mechanical tradeoff, compatible interactions, acquisition state, and a playable demonstration entry.

Proposed wording examples describe the contract, not fixed numbers:

| Surface | Player-facing meaning |
|---|---|
| PULL · WELL | Place an attractor at your aim point. Light bodies gather; marked targets couple more strongly. |
| SHOVE · REPULSE + DETONATE | Push outward from your ship and trigger your armed explosives. Show how many will detonate. |
| PIN · ANCHOR | Place a temporary anchor for the Line. Do not imply a universal enemy root unless the runtime actually supplies it. |
| BOMB · selected payload | Name the exact payload, fuse/trigger, remaining stock, and whether the next use throws or drops it. |
| RIG · CONE / SCOOP | Display the current function before use. A location change must not silently exchange an unlabelled action. |
| GYRE · GATHER / RELEASE | Hold to collect eligible loose matter; release to launch the accumulated mass along the shown trajectory. |
| CLOAK · ready / active | State that concealment depends on signature, observers, and revealing actions—not transparency alone. |

Explain conditions in ordinary mechanical language. Replace internal terms such as root sibling, lineage proc, generation zero, or compatibility emitter with extra shot, follow-up hit, bounce, or eligible weapon, keeping precise advanced detail behind inspection.

## Icons must survive the camera and the hand

Preserve one shape identity across fitted slots, shop cards, tooltips, firing feedback, and tutorials. Different tiers can share a family shape with a secondary tier mark; different jobs must not become the same symbol with another tint. Use authored glyphs before creating replacements. Show the actual fitted weapon in the primary weapon group, not a generic weapon button.

Test recognition in grayscale and reduced contrast. Color is reinforcement, not the only difference. Respect the current type floor and theme tokens. Do not cover the playfield with a permanent key list. On touch, supply tap/press inspection and persistent current-payload identity; hover is not a mobile interaction. On trackpad, avoid simultaneous delicate cursor motions, scroll-wheel dependence, or sustained right-click requirements.

## Preserve controls while making modes explicit

Inventory current bindings and claims before adding any action. Physical keys in a design document are examples until the actual binding table confirms they are free. All displayed labels come from the remappable binding owner. Preserve old saved aliases and deliberately unbound actions.

Treat press-to-fire and hold-preview/release as explicit supported policies. A preview can be cancelled without consuming energy or releasing a bomb. Modal opening, lost focus, docking, gamepad disconnect, pointer cancellation, pause, and sector transition must not accidentally commit a held power. Releasing one held key must not fire a different key's most-recent preview. Multi-device changes should preserve the action, not stale physical-key state.

The existing G combat-stick behavior, selected-target assist, manual gun aim, and Massline capture are separate concepts. Do not label all of them AUTO. Do not change defaults silently to create a convincing tutorial. When a fitted action transforms, show its current name and reason before it executes. Selecting a bomb type must not fire it; reading a tooltip must not steal mouse fire.

## Combination teaching

Teach a physical proposition rather than a memorized rotation. Place an eligible debris pile, let Pull gather it, let Gyre visibly acquire and launch it, then show an enemy displaced into a real obstacle. Give the player permission to solve the scene another way. Reward the observed physical event, not pressing the prescribed sequence.

The armory can show two truthful examples for a fitted tool and a short in-engine demonstration. The demonstration must use the production simulation and the same capability definitions. It must not contain a bespoke animation that depicts an impossible combination. A lab example does not replace ordinary-game acquisition or teaching.

Teach protected cargo and anchored scenery as part of the same language: distinguish can pull, can absorb, can launch, can damage, and cannot manipulate. A failed attempt gets a short specific explanation, not a generic unavailable chime.

## Deliverables and acceptance

Deliver the capability census with observed route evidence; the smallest unified presentation projection; corrected existing glyph coverage; effective-action labels; binding-safe inspection; and production-backed examples. Reuse existing validators and add contract tests only where a gap is demonstrated.

Acceptance exercises: a fresh player can locate and use Pull, Gyre, the selected explosive, and fitted cloak; distinguish their symbols at the normal camera; predict what Shove will trigger; see why a heavy/protected body will not be absorbed; and recover from a remap or device change. Record mistakes and time-to-success instead of asserting that a screenshot looks clear.

Regression cases: legacy bindings, explicitly unbound actions, no-ammo fallbacks, context transitions with an active rig, modal digit claims, held-input cancellation, retirement/mode gating, contradictory stat text, and missing glyph fallback. A catalog-count test does not close this packet.

## Implementation status

Shipped on `plans/combat-convergence-2026-10-25` (25 Oct 2026). Everything below is wired on the default route; nothing is behind a flag.

**One projection.** `src/data/arsenalPresentation.js` (live) over `src/data/arsenalWords.js` (the sentences: pure data, no state). Per verb (Drive, Pull, Shove, Pin, Bomb, Rig, Line, Gyre, Cloak) and per fitted weapon it resolves: stable id, name, current verb, glyph (authored or `none`), role, sentence, limit, combination, binding (from the remappable owner, so an unbound action reads unbound), target, range/shape, cost, cooldown, charges, readiness and `sources` (which owner supplied each value). Every number is a read of its owner (`FIELD_DEFS`, `MASS_SEED_DEF`, `GYRE_SNARE`, `BOMB_DEFS`, the cloak module's `mods`); the tests compare with `===`. The static part is cached on the fitting / mode / binding / effective-verb signature; readiness is live.

**Where the player meets it** (the live rail is the ORRERY flight Cluster fed by `readRailModel` -> `hudAdapter.readOrdnanceModel`; `createPowerRail` is not mounted anywhere):
- Cluster sockets read `Pull · Well`, `Shove · Repulse + N detonate` (armed charges + armed drift bombs + planted charges, by the owners' own predicates), `Pin · Anchor` (sentence states it roots nothing), `Bomb · Frag ×4 · drop` / `Charge ×3 · throw` / `Smart Bomb ×2 · call in`, `Rig · Cone` / `Rig · Scoop` (label, mark and tip change with the planet band BEFORE the press), `Gyre · Gather` / `Release`, `Cloak · Ready|Active|Revealed|Depleted`. Hover or focus a socket for the one-sentence result, the main limit, the live keys and why it is or is not ready.
- Collapsed nodes now draw the same authored mark as an unfolded key (22 px, heavier stroke), carry live state, and the Gyre and a fitted cloak get sockets after the Line (a ship with no cloak module gets no cloak socket; one with the module in a mode whose cloak flag is off shows a locked `Cloak · off here`).
- Help -> Controls -> Flight rows for the five powers and the Gyre are the arsenal's sentences; each fitted weapon gets a row with what its modifiers COMPILE to (extra shots, bounces, a chain's hop rule); a `Combination` row teaches Pull -> Gyre -> release from the pilot's live keys (`unbound` when removed) and says the room may be solved another way. There is no armory entry because the armory sells weapons and modules, not the baseline powers.
- Failed attempts: `src/ui/arsenalDenials.js` carries the matter tools' own `matter:refused` words (protected cargo, anchored, too big, full) to the existing toast channel once per class and quotes the latest in the Gyre/Pull tip. The cooldown, dry-charge, empty-rack and cloak-charge refusals already toast from their owners.

**Truth gaps fixed.** Bomb precedence (charge, swarm call-in, bay bomb) now matches `input.js`; Rig named the cone inside a planet band; a dry fitted bomb socket kept no identity; the Gyre line on the phone deck taught the old verb; the Pull/Shove/Pin/Bomb/Rig/Gyre text existed in four retyped banks (rail, Help, phone deck, projection) and is now one; engine terms (root sibling, three-root, root volley, causal KINDs) left the Crucible's trait blurbs.

**Glyphs.** The plasma fan and the Rig plow were both `cone` and the later literal silently won - split. New marks: travel drive, smart bomb, orbital lance. Weapon-modifier modules carry a corner mark so a payload is never its weapon. Generic family marks are dashed and carry `data-glyph-source="family"` (`equipmentSvg`, and `equipmentIcon` for the shipworks rows, which printed nothing for ~80 modules). Checked at gameplay size and in grayscale with `ui-bench --shot=orrery-flight` at 1920x1080 and 1280x720.

**Input.** Real bug fixed in `input.js` (one hunk): a pad that vanished with Shove/Bomb held fired the power. Added tests that a modal, pause, blur, pointer cancel, dock, blocked sim and sector change each cancel a held power for all five powers without spending a charge or a bomb; one key's release never fires another's preview; an explicit unbind and a legacy saved alias are kept; the ordnance cycle never fires a bomb. Cluster sockets pass a press (pointerdown for the right-button gesture, mousedown for fire) to the flight canvas and do not take keyboard focus, so reading a tip never costs a shot or the keys (the sockets were `pointer-events:auto` with a tabindex: a click was swallowed, and the focused socket made flight drop every key).

**Tests.** `test/arsenal-presentation-{glyphs,projection,cluster,surfaces,input-integrity}.test.mjs`; the projection test drives the real input owner to prove the label matches the press. Re-run with `node --test test/arsenal-presentation-*.test.mjs`.

**Honestly still open.**
- The phone power wheel is built once from `catalog.js`: its sentences are the arsenal's, but BOMB / GYRE do not show the live payload or phase, and touch has no new press-to-inspect.
- `CLOAK_MIN_ENGAGE` (0.12) is private to `cloak.js`; the projection mirrors it and a behavioural test pins the two together. Exporting it would remove the copy.
- Two keys bound to one power pressed in the SAME input sample fire at once (the existing NXB-003 catch-up rule), not as a chord grip. Unchanged.
- `src/localization/catalogs/en-US.generated.js` is stale (already so for many other files); regenerate it at integration with `node scripts/extract-localization.mjs --write`.
- No headed browser or player session was run here; acceptance is the ui-bench stills, the focused tests and the real input owner. The "fresh player finds Pull, Gyre, the explosive and the cloak" exercise has not been timed.
