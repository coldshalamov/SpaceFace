# Flying Saucer: a different law of motion

Implementation base: `6f3a6402c65049ec3410ad8acc9939a6eaa28836`.

## Player contract

The player Saucer translates in the top-down game's world/screen axes: Left/A moves
left, Right/D right, Up/W up, Down/S down. Simultaneous held directions combine;
opposites cancel; diagonals never grant extra speed. Releasing movement stops it.
The left gamepad/touch stick also translates, preserving analogue strength. Weapon
aim is independent: no heading rotation is necessary to change travel direction.
The ordinary ships' last-input-wins key grammar and yaw/forward-thrust controls remain.

Cruise is 340 world units/second; holding the existing boost control gives 900.
A 90-degree change or reversal is applied on the next fixed physics tick, including
during boost. This is not a higher yaw rate. Manual yaw torque and visual banking
are suppressed. Autopilot/path commands are converted to translation; their own
heading assistance remains available. Normal collision resolution still runs.

Field-force coupling is zero for the player Saucer, so gravity wells cannot bend its
commanded flight. It is NOT invulnerable or non-colliding. Asteroids remain solid;
weapons still have damage, capacitor and thermal accounting. The ship's existing
large hull, shield and reactor ratings are retained. No ship model assets are removed.

## Alien equipment included in the ship

Two **Death Rays** occupy otherwise empty weapon mounts. Each is a 360-degree
tracking beam rated at 360 damage/second, with a 1,000-unit range and 28 capacitor
units/second. They use the existing beam, targeting, heat and damage owners.

The third empty mount supplies an **Annihilator**: a 360-degree automatic plasma
battery, 160 direct damage per round, three rounds/second, 80 splash damage within
38 units, range 1,000, and 18 capacitor units per shot. These are base ratings before
normal damage modifiers and defenses, not a guaranteed damage-per-second promise.

**Event Horizon** activates with boost: a visible 220-unit, full-circle field centered
on the disc. It deals 600 energy damage and a bounded radial impulse to hostile ships.
Neutral traffic is excluded. Each target is latched once per boost gesture, not once
per simulation tick. Activation costs 45 boost energy and has a 1.25-second reactivation
gate; the field ends when boost ends. Turning boost-burst upgrades off in settings
also turns this field off. Paused, docked, defeated or switched ships cannot retain it.

**Salvage siphon** is the existing loot-magnet mechanic with an intrinsic minimum
300-unit range. Stronger fitted magnets still extend it. This is debris collection,
not an unimplemented abduction mechanic.

The alien weapons are intrinsic runtime equipment, not free inventory objects.
They appear on new purchase, reactivation, refit and reconstruction of old empty
Saucer saves. Installing a conventional weapon replaces the emitter in that mount;
stripping it restores the emitter. Intrinsic emitters cannot be bought, sold or
multiplied by switching ships. Other fitted equipment stays with its original ship.
Conventional engines, steering thrusters, Swing Drive, Veil Step and competing boost
upgrades are refused on the Saucer before payment; the reason is shown in the armory.
The preset dry-run uses the same rule. Old saved fittings are not deleted by this patch.

## Crucible language

The whole-ship shelf says **Ships**, **Buy ship / Buy & fly**, or **Switch ship**.
A ship is the complete craft being flown. Hull still means the physical structure
or hull health in repair contexts; internal `kind: 'hull'` identifiers stay stable.
Buying a ship activates it for this run. The previous ship and its own fittings stay
owned, and switching back is free. Buying a ship does not transfer every fitting
from the ship being left behind. Purchase blurbs and receipts now say this directly.
The Saucer offer lists the included capabilities instead of inviting the player to
build an empty frame. Refit and purchase previews say **built in**, and warn when a
new gun replaces an alien emitter rather than adding another gun. The in-flight
Crucible supplement shows movement, firing and field activation/readiness.

## Engineering boundaries

Input projects directions but never writes positions or velocities. A one-tick
WeakMap command passes through `physicsAuthority.js`. The native Rapier owner
consumes it after gameplay impulses and before its collision solve. Commands reject
stale ticks, recycled lives, failed native bodies, death, docking and ship swaps.
The public five-key physics command schema is unchanged. Other ships do not use
this path. No direct velocity writes were added outside the physics owner.

The arsenal is rebuilt by `buildWeaponList`, not a second purchase/grant system.
Crucible's wallet, ship-switch authority, damage authority, physics impulses and
field-presentation renderer remain the existing owners. Event Horizon uses the
existing radial repulsor renderer, not a visually misleading forward cone.

## Verification

Run `node scripts/check-saucer.mjs` with the repository dependencies installed.
At delivery: 191 tests pass, including 34 Saucer-focused cases; data catalog import
and cross-reference checks pass; the 720-tick deterministic uninterrupted/save-reload
comparison (reload at tick 600) has equal hashes and no divergent tick.

Coverage includes all 16 arrow-key combinations, actual DOM key events in all three
control schemes, finite/analogue inputs, boost direction changes, pause fencing,
Native Rapier collision against an asteroid for 120 boost ticks, stale command
rejection, normal-ship impulse behavior, real weapon fire and beam damage, repeated
Crucible buy/switch cycles, old-save reconstruction, no inventory or credit duplication,
refit/preset refusal before charge, radial targeting and neutral exclusion, capacitor
payment, field cooldown and presentation shape/radius.

No full asset-complete browser/Electron or physical iPhone playtest was performed in
this environment. The native physics and production input/weapon/damage paths were
executed headlessly. The full repository-wide CI matrix was not represented as passed.

Recommended hands-on acceptance route: Crucible -> Ships -> Flying Saucer -> Buy & fly;
launch, hold Left then Up, hold both, reverse while boosting, release to hover, fire
at a target beside the disc, boost through a hostile group, then switch away and back.
Inspect a replacement gun's preview and strip it to restore the built-in emitter.
