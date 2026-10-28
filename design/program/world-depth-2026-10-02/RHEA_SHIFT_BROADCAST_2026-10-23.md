<!-- LIFETIME: DURABLE -->
# Rhea shift desk remembers the rescued seam miner

## Place, activity and consequence
Rhea's Cinder Claim already has an authored miner working the yard-to-slag route, an ore hauler, yard tender and escort. The rescue owner already gives a returned worker a one-time toast and personal hail. This increment adds a local recurring shift-desk recap on ordinary visits, rather than inventing a new worker, event economy or backstory.

One of the existing four 20-second ambient buckets may announce that the rescued seam miner is back on the yard-to-slag run, or that the returned miner has since been lost. Other buckets preserve the existing station and named-hull chatter. The newest valid person consequence wins deterministically, with no extra saved latch.

## Truth and bounded work
The pure projection reads the existing rescuedWorkers person record. A return requires explicit finite chronological rescue/return timestamps, the exact authored captured route, a currently alive identity-matched hull and its actual non-corrupt miner job. A contradictory terminal or wrong-sector world record suppresses the line. Lookup uses the existing world-record index and two direct references, not a per-person scan of all hulls.

Loss requires a real returned-then-lost lifecycle with chronological timestamps. Pending rescue, ransom, abandonment, null timestamps, stale/recycled entity IDs, absent residents, wrong jobs and forged route data do not earn a positive shift report. After Save/load, silence remains correct until the existing rescue owner sync restores the live identity and job. The radio never repairs authority itself.

Queued voice revalidates the projected fact before delivery and retracts stale active speech through the existing VoiceQueue contract. Current sector, range, mode, combat, onboarding and restoring guards remain in the existing broadcast owner. No new clock, listener, reward, rescue controller, Save field or registry is added.

## Dependency boundaries
This draft is stacked on the Rhea person/body return correction in PR526. The original destroyed hull tombstone remains terminal; one distinct durable body returns for the same person. The radio must not be treated as a standalone repair for the old return bug.

PR480 separately owns the already implemented worker economy-clock, Ilex and restore lifecycle changes. This increment does not duplicate or replace them. The shipping broadcast patch changes only an import, the later generic-line selection, and optional voice identity/validation payload. It retains current named-hull flavor. An earlier exact-hunk diagnostic composition with PR480 passed 43 radio checks plus one clock/Ilex/restore probe, but that composition is not shipped and is not full production-worker acceptance. Ordinary worker-clock integration and visual/flight acceptance remain open.

## Evidence
Current-source composition: public 3d1bd1d756fcb6e1daef772c41cc1b675281bd17 plus reviewed PR526 source 1a8feebd69ebf40a749c5631f8388a1a9bbad962 and this radio candidate.

45 distinct focused tests pass, independently rerun by review. The connected positive route uses actual world/traffic/jobs/Save and radio/VoiceQueue: casualty tombstone, rescue, one replacement body, admitted work, returned-shift broadcast, Save/Continue, final loss, another Save and loss broadcast. Another case captures, despawns and rematerializes the body through world before owner readmission. Explicit casualty/pod receipts and direct ordinary owner ticks remain fixture inputs; this is not native combat/rescue flight or full worker boot.

Effective loaded graph: 1,047 ESM URLs; manifest SHA256 c67e648372449ec1de528405d9e877fc5750e437deae9f0fdc47e678e5150195. Final raw log SHA256 da78cd29026ecc1c78a83f44e1a2696f8eaa9c1c0f56ee3ba86b2c880c7cadd6. This is not an unrestricted filesystem/native dependency audit.

The initial 43-case radio fixture omitted world and exposed the return prerequisite when expanded; it is not claimed as full-world proof. A subsequent current-world run passed44/45 because an old assertion expected speech immediately after load. The final fixture verifies truthful silence until real owner sync, without manually stamping the hull. Rejected attempts are preserved.

## States
Source implemented and independently reviewed; publication, integration, ordinary worker route, game-camera visual quality, performance and acceptance are separate. All larger game, living-world and sector-coherence goals remain open.
