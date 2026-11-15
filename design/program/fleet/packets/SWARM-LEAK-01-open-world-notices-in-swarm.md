# SWARM-LEAK-01 — Open-world notices must not appear in a Swarm round

A first-time playthrough of Swarm (frames `.devshots/fleet/inv02/swarm/09-swing.png`, `15-flight-r2.png`;
log `.devshots/fleet/inv02/swarm/report.md` lines ~79, 144–207) showed Adventure/open-world text inside the
Swarm arena. None of these belong in Swarm:
- `GOAL · HELIOS STATION · 3.6k u` (an objective/waypoint line)
- `SELF-DEFENSE AUTHORIZED`
- `FIELD COIL CRADLE` / `Select CARGO BRACE first`
- `Dock control, Helios Station` / `Coalition HQ` (comms speaker cards)
Also check `report.md` for any other open-world strings it logged during the Swarm rounds and include them.

## Do this
1. For each string, find the code that produces it (`grep -rn` the literal and its localization key; the
   localization catalog maps keys to text). Name the owner file:line and the event/condition that fires it.
2. Gate each at its owner with the existing Swarm predicate `isSwarmGlass(state)` from `src/ui/swarmGlass.js`
   (it is already used this way in `src/ui/comms.js` and `src/ui/toasts.js`), or with the owner's own
   existing mode check if it has one. Gate at the source (do not emit) rather than hiding the DOM.
   Adventure behaviour must not change.
3. Add one test per owner that the notice is not emitted when the state is a Swarm run and still is in
   Adventure (follow the existing tests for that owner; `grep -l <owner basename> test/*.mjs`).
One commit per owner, exact paths, per the protocol (own-commit.sh for files with others' edits). Run each
touched file's tests before/after. No game boot.

## Receipt
A table: string → owner file:line → gate added → test → commit.
