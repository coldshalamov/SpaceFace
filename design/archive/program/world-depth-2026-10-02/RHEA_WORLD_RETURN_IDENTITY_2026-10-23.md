<!-- LIFETIME: DURABLE -->
# Rhea rescue return: separate the person from the destroyed body

## Correction to the earlier proof
The original null-timestamp repair remains necessary and unchanged. Its first 31-case qualification omitted the world owner. That suite did not prove a rescued worker could return in the actual persistent world. Adding world reproduces the second defect: the original casualty's terminal world record makes the return owner skip spawning forever. Against the original PR526 null fix, the new ten-case world-owner suite passes three and fails seven.

## Implemented contract
The durable rescued person remains in the existing uniqueWrecks bag, with the same personKey, persona and captured workplace. The original destroyed body's world record is not erased or revived. A pending, never-returned rescue may move once to a deterministic personKey:return body identity, retaining optional sourceWorldRecordId provenance. This is a replacement ship for the same person, not the original destroyed hull and not another character.

The physical returning body belongs to worldRecords and has durable rather than residency-pinned persistent flags. Its existing ai record carries the person marker through actual capture and rematerialization. The live marker must match the person's current body worldRecordId before a death is joined to that person. Numeric IDs alone do not identify a live returned person.

An existing legitimate legacy body keeps its identity. Foreign bodies or durable records at the deterministic destination block migration or spawning without mutation. An absent living body record belongs to residency and is not replaced by a duplicate. Job admission still uses the existing job owner; refusal retains one body for retry. A terminal replacement is final, including stale pending records with no remembered entity ID. No recursive return:return identities or second rescue after rematerialized-body death are allowed.

No shared world, Save, traffic, job, survivorPod, economy or reward owner is edited. No new persistent registry, clock or cast is introduced.

## Review and tests
Frozen source: 1a8feebd69ebf40a749c5631f8388a1a9bbad962.
- Existing Continue tests now include world: 22 pass.
- New world-record integration tests: 10 pass.
- Existing return, retry and hail regressions: 5 + 1 + 3 pass.
- Total: 41 distinct cases. Independent reviewer32 and root10 reruns overlap those cases, not extra coverage.

Independent review found and closed a real post-migration collision: after failed job admission and runtime clearing, a foreign holder at the replacement identity could be mistaken for an empty slot and produce two hulls. Its formerly failing probe is now a shipping regression. Review also verified world ownership, original tombstone preservation through Save, actual capture/despawn/rematerialization, kill-before-sync handling, and terminal replacement without remembered entity ID.

The suite uses actual authored Rhea traffic materialization, NPC job authority, world records and Save.save/load. Casualty/ejection/rescue receipts remain explicit fixture inputs. This is not a player-flown rescue, native combat/tow journey, complete production boot, game-camera visual acceptance or performance qualification.

## Qualification and delivery
The reviewed effective loaded graphs qualify through public bf2e72ff0e4da89236ae33e2491f3dc0a46fc0d7: 1,042 inputs per primary suite, 1,043 combined. The six intervening changed public paths were absent from those graphs. The subsequent 3d1bd1d756fcb6e1daef772c41cc1b675281bd17 batch changes relevant dependencies. A separate isolated current-source overlay fetched and hash-verified all 47 changed modules actually loaded, including newly imported dependencies; all 41 named cases passed again with the frozen candidate. The effective union contains 1,048 ESM URLs, manifest SHA256 b540eac34b0eec28e53a3a1f14bb8a093f04b7ff892cbc179783ce24f5fab432. This qualifies the exercised ESM graph, not arbitrary filesystem inputs or a full production boot.

The earlier report is historical evidence only where superseded here. The previous missing onboarding import was repaired upstream; it is not a current blocker diagnosis. Radio is a separate consumer and retains its PR480 worker-clock dependency. Published, tested, integrated and accepted states remain separate; all larger game and sector goals remain open.
