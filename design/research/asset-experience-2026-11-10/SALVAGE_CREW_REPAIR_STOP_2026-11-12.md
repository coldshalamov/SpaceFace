# A working cable is not an invulnerable crew

Exact parent: `2feed4fd1dfe66d75dba42625ba5d503b0e7d642`, draft #982.

## Scene and player purpose

Keel and Kit already approach, attach to, and recover actual salvage with ordinary native tow machinery. Their mistakes, agreements, cargo and subsequent working habits exist. This increment connects actual hull damage to that working life rather than adding another generated wreck or a compulsory rescue mission.

A working crew at or below35% hull stops towing. It releases its existing cable through the existing physical owner, brakes without teleporting, and explains the situation. The original load stays in the world with its previous claim. The player can leave it alone, finish their share, recover permissible salvage, or spend their own credits/unsealed scrap using the existing repair beam. Reaching60% hull restarts work. The gap between stopping and restarting avoids repeatedly cutting and reconnecting at a single threshold.

This is not a scripted injury, fee, friendship reward, supply source or moral absolution. If the player damaged the crew, its recorded distrust remains. Repairing Kit does not erase an already-stalled overload. A selected scan of the same stopped ship explains the repair margin without offering an unrelated new contract. After all cargo is worked, the hold clears for an unladen departure, with an explicit line that the hull still needs repair. This is a towing-work margin, not an engine shutdown.

## Existing systems and assets

- `src/features/salvageOutfits/index.js`: consumes actual hull/hullMax, releases via `physical.stop`, and resumes the same existing target selection and tow workflow. Live scan labels and radio describe the working state.
- `src/features/salvageOutfits/readModel.js`: projects a working repair stop as `Hull repair stop`, not towing/loaded. No renderer or interface owner is replaced.
- `src/features/salvageOutfits/persistence.js`: preserves one boolean work hold through the existing meeting normalization. Old saves without it default to false; actual low hull can still trigger a stop when work resumes. No schema reset or cargo reconstruction.
- `src/features/salvageOutfits/physical.js`: unchanged authoritative tow/stop/navigation path. Native joint cancellation leaves the original body and its momentum intact, then existing braking controls the ship.
- `src/systems/mining.js` and `src/systems/beamRepairResources.js`: unchanged paid-repair owner. Credits or eligible unsealed scrap fund actual repair; this feature does not write health or money.
- Existing Keel Hawser, Kit cutter, working originals and receiving marker are reused. No model, renderer, audio owner, station UI or input binding changes.

The complete original scene remains reachable through existing Adventure salvage discovery and scan hooks. No debug-only start is introduced. Tests stage that existing scene to isolate the new consequence; they do not establish an earned campaign arrival.

## Lifecycle and consequences

The hold is recorded before releasing the line or emitting radio. Reentrant callbacks cannot issue a new tow, receive cargo or settle an agreement after leaving flight, pausing, restoring or replacing the meeting. Restoring a stopped scene keeps the same cargo, crew and agreement; repair then allows the same native delivery to finish. Destroyed crews remain destroyed and cannot be revived by this feature.

The existing completion outcome is preserved: no cargo grows back, and departure does not heal the ship. The new code does not award salvage or a repair bonus, alter trade prices, forgive violence, or change rescue terms. That keeps the player's repair decision practical rather than an exploitable payout loop.

## Evidence boundary

Focused tests include actual native tow release and later delivery, paid repair through the canonical repair writer, an actual cold save-envelope restore followed by physical delivery, overloaded Kit, completion during a stop, radio interruption, and ordinary combat damage followed by distrust-preserving repair and fatal loss. Some tests set an initial damaged hull to target a lifecycle boundary; the combat case separately routes damage through the existing combat kernel. Repair tests call the funded beam application boundary directly, not an aimed rendered beam.

No screenshot, rendered playthrough, full earned campaign, controller interaction, frame-time acceptance or browser Continue claim is made. This is implemented source with native/owner-level evidence, not completion of the broader living-world commission.

Validation: focused6/6, existing salvage21/21, neighboring relief/three-way/learning/receiving13/13. After the final projection change, focused6/6 and its existing recycled-ID read-model regression1/1 were rerun. Independent review additionally exercised the interruption case. The final terminal-status correction additionally reran focused7/7: fatal combat damage during a held state stays destroyed in the read model, rather than being mislabeled as repairable. All41 unique cases passed across these runs; this is not a full project suite.
