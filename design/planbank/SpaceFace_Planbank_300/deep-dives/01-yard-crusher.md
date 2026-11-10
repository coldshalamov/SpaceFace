# Resolved specification — a physical yard tow-out

Companion to [SF-136 — Put a real crusher into the yard tow-out](../plans/10-missions/SF-136-put-a-real-crusher-into-the-yard-tow-out.md). This is a proposed implementation design, not a claim of a completed fix.

## Evidence and selected direction

The inspected [encounter script](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/encounters/346-yard-towout.js#L35-L105) creates a private mouth point, moves it toward the hauler and resolves a crush on radius/deadline. Keep the rescue premise but replace the abstract threat with a real existing machinery operation. Do not add a global crusher subsystem. Read [environmentalMachinery data](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/environmentalMachinery.js) and [its live owner](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/environmentalMachinery.js) first.

**Player picture:** a disabled loaded hauler drifts near a working yard throat. The jaw's visible motion and solid geometry define the danger. A skiff signals the hazard. The pilot can tow clear, interrupt the machine through a supported operation, or use a physical obstruction at a cost. A miss produces real damage, wreckage or displaced cargo rather than a disappearance labeled 'crushed'.

## State and ownership

The encounter owns its phase, cast references, offer/result and once-only settlement. Machinery owns its cycle, contact/force/damage law and shutdown state. Physics owns body motion. Current custody/aftermath owners handle the load and surviving wreck. Presentation reads the same machine phase and actual contact result; it does not decide damage.

Prefer referencing an existing compatible yard machine by stable world identity. If no suitable machine exists, create the smallest authored site/machine instance using current definitions and expose that exact missing dependency. Do not pretend a private encounter coordinate is a machine. The machine's operation geometry stays fixed to its site frame; it must not chase the hauler unless an actual authored moving mechanism supports that motion.

## Proposed encounter transitions

| From | Trigger | To and consequence |
|---|---|---|
| Materializing | Required hauler, skiff and machine are ready and valid | Tow opportunity opens; no offer before its physical premise exists |
| Tow opportunity | Hauler clears the actual hazardous region with stable outward separation | Rescued; settle the existing reward once, retain the surviving hauler |
| Tow opportunity | Supported shutdown/obstruction takes effect | Machine interrupted; evaluate rescue using real safety, not a checkbox |
| Tow opportunity | Actual machine contact causes a qualifying loss | Damaged/lost outcome through current damage and aftermath; retain truthful cargo state |
| Any unresolved phase | Site/required actor genuinely removed or route canceled | Existing abort/continuation with cleanup of only owned transient state |
| Any unresolved phase | Offer deadline passes without a physical crush | Withdraw/escalate the work situation as authored; never assert damage that did not occur |

The exact phase identifiers should reuse current conventions. This table is the proposed semantic contract, not an instruction to add another registered FSM.

## Bounded implementation order

First trace how ordinary encounter placement finds a yard and materializes cast. Bind the machine identity at planning/materialization, then validate it at start. Second connect the machine's existing phase to its visible jaw and collision law. Third replace the private-radius success/failure conditions with actual safe-region/contact outcomes. Fourth route real loss through damage/custody/aftermath before settlement. Finally add the concise approach cue and remove only the old fake mouth-clock path for this encounter.

Do not pay twice when shutdown and tow-clear occur in the same tick. Destruction during rescue cannot both award 'towed' and settle 'crushed'. The survivor must remain a world actor or enter its legitimate next owner, not vanish solely to clear a script.

## Acceptance cases

Tow diagonally clear; tow toward the wrong side; release the rope while still in danger; interrupt the machine; place an obstruction; allow real contact; expire the offer with no contact; remove the skiff; leave/re-enter; save at a supported durable boundary. A world-frame rotation/translation must rotate/translate every relevant shape together. A body just outside the true throat cannot be killed by a separate invisible radius.

Inspect the machine at the shipping camera. Jaw, hazard timing, contact, sound and outcome must agree. Direct geometry/state tests can establish implementation, but the physical premise is not accepted until visible and usable in ordinary play. This packet is not complete as a new encounter row or a test that asserts the result string.
