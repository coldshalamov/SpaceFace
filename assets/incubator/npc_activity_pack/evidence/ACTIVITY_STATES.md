<!-- LIFETIME: DURABLE -->
# Activity-state choreography — how each craft performs its job on the existing kernel

This is the wiring spec the brief requires: per craft, what the hull VISIBLY does in each
state, expressed entirely in terms that already exist — the six `npcJobs.js` phase graphs,
the 13 `npcJobSignatureVfx.js` signal profiles, `deployFraction()` (2.6 s deploy over
work/load/unload), the six reactions, and this pack's named sockets. No new AI is
proposed; a wiring lane binds sockets to the signal layer's existing lamp/streak calls.

Legend: signal ids are existing profiles; `SOCKET_*` names are exported in each GLB;
"deploy" = drive visuals off `deployFraction`, exactly as the VFX layer already does.

## prospector_skiff (kind: miner, light)
| state | hull shows |
|---|---|
| transit | `clean_burn` ventral walk; wand folded line silhouette |
| approach | `stacking`; flood at `SOCKET_Mining_Front` warms up with deploy |
| work | `blind_cone`: amber cut-beam FROM `SOCKET_Mining_Front` onto the resolved rock; arms read deployed via deploy scalar; drum dust at `SOCKET_Cargo_Ventral` |
| transfer | `spilling_the_count` at `SOCKET_Cargo_Ventral` |
| distress | `breaking_the_pattern` PLUS the trade's own flare: a stake fired from `SOCKET_Stake_Starboard`, strobing — a prospector calls for help in the only language they own |
| depart | `spine_wake` keel walk |

## ore_barge / ore_barge_b (miner-economy heavy logistics)
transit loaded `heavy_burn` (paired amber at the basket line) · approach `stacking` flown
wide and early · work/load: boom over baskets, mast floods on, `tally` ring stepping at
`SOCKET_Cargo_Dorsal`, dust puffs off the fill line · unload `spilling_the_count` at the
refinery · return empty `clean_burn` · distress `breaking_the_pattern` (whole-hull, big) ·
depart `spine_wake`. Boom tip = `SOCKET_Work_Boom`.

## volatiles_tanker / _b (hauler, hazard cargo)
transit `heavy_burn`/`clean_burn` by load · approach `stacking` — but its `mouth_open`
plays at the BOW (`SOCKET_Coupling_Front`), never amidships: couplings before cranes ·
work/load-unload: probe cage lit white, umbilical streak coupling→client, tank-status
lamps walking `SOCKET_Cargo_Dorsal` spine path · distress: `breaking_the_pattern` with
the volatile-red bands as the read — every faction gives a burning tanker room · depart
`spine_wake`. NEVER shows a cutting cone.

## scrap_sweeper (collector; salvor-adjacent)
transit `clean_burn` · approach `stacking` toward the field, throat glow rising with
deploy · work: mouth-directed `blind_cone` variant at `SOCKET_Sweep_Front` (cone points
where it eats), magnet pick-ups at `SOCKET_Work_Boom`, cage fill flicker at
`SOCKET_Cargo_Aft` · return `home_under_rock` (cage proud) · unload `spilling_the_count`
· distress `breaking_the_pattern`.

## repair_tender (kind: tender — the only DEPART-cycle, zero-cargo trade)
commission/depart `spine_wake` · transit `clean_burn` (never loaded, by graph) ·
approach `stacking` + corner lamps warming · work `hull_open` exactly as drawn today:
red corners steady, weld stitch at `SOCKET_Work_Boom`, white bar deployed across the
cold drive, NO ejecta; umbilical at `SOCKET_Umbilical_Dorsal` when parts transfer ·
reaction FLINCH (existing): corners brighten, weld star suppressed — crew outside ·
re-depart `spine_wake`.

## yard_tug (future dock choreography)
approach-to-client: `stacking` flown FOR THE OTHER HULL — the tug's whole grammar;
cradle floods on at `SOCKET_Push_Front`, nudge thrusters ticking in count · push: contact
at `SOCKET_Push_Front`, combined-mass `heavy_burn` flown honestly · tow: line from
`SOCKET_Tow_Aft`, same honest strobe · idle: apron beacon only · distress: a tug in
trouble drops the client first — line release then `breaking_the_pattern`.

## salvage_cutter / _damaged (kind: salvor)
transit `clean_burn` · approach `stacking`, umbrellas unfolding with deploy · work+load
`picking_the_bones` as drawn: hooded floods down (`salvage-umbrella` rhythm), cutter arc
at `SOCKET_Work_Boom`, scrap flung toward `SOCKET_Cargo_Aft`; wrangle tethers from
`SOCKET_Tether_Port/Starboard` during LOAD (the act that separates a salvor from a
barge) · return `home_under_rock` · unload `spilling_the_count` · reaction WATCH
(existing): umbrella tilts toward the stranger, work continues.

## survey_pin (kind: surveyor — work state IS transit state)
all phases but dock: `reading_the_dark` — pulse ring from `SOCKET_Scan_Pin`, sweep lamp
at `SOCKET_Sensor_Dorsal`; boom crab angle driven by the existing deploy scalar ·
approach `stacking` · reaction PAINT (existing), then the authored slide keeping the pin
between you and the belly · distress `breaking_the_pattern` with the pin dark — a
surveyor that stops reading is the emergency.

## liner_shuttle (express / civilian)
transit `clean_burn` fast and level, cabin rows lit — the schedule is the performance ·
approach: long flat buttered `stacking` · dock: nothing external; baggage at
`SOCKET_Cargo_Ventral` · distress `breaking_the_pattern` + cabin rows dark, the coldest
sight in the code · NEVER shows tools.

## customs_cutter (patrol law variant)
transit/hold `on_the_pin` in the regulated blue-white metronome · inspection: the sweep
STOPS — lock beam from `SOCKET_Inspection_Front` onto the subject, frame emitters
steady arc-blue; boarding at `SOCKET_Dock_Ventral` · a cutter that stops sweeping has
chosen you · NEVER shows cargo.

## rescue_lifter (responder to breaking_the_pattern)
transit-to-scene: red-white flank bars STEADY (the victim's alternates; the responder's
do not), floods rising on approach — "we see you" · work: bay mouth lit at
`SOCKET_Bay_Front`, grapple line from `SOCKET_Hoist_Dorsal`, mast floods lighting the
field like a work yard · recover: soft-dock swallow at the bay · depart `heavy_burn`
flown honestly for the casualty's mass.

## construction_rig (hull_open at fleet scale)
hold-over-site `on_the_pin` · work: cranes traversed outboard, segment on the line from
`SOCKET_Hoist_Main`/`SOCKET_Hoist_Aux`, weld stars at the interface, red end lamps —
`hull_open` semantics writ large · idle: cranes parked inboard, the silhouette folds
from "site" to "ship" · rack transfer at `SOCKET_Cargo_Dorsal`.

---

## The two omissions, choreographed
- **Smuggler:** flies a legitimate family with the WRONG signals for its mass — `clean_burn`
  while heavy is the canonical §5 forgery. Wiring is a falsified `loaded` bit, not a hull.
- **Raider:** costume until the weigh; the seam list per family lives in the manifest
  (`forgerySeams`), drawn from THE_WORKING_LIGHT §5's eight tells.
