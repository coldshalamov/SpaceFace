# Io: a rival who remembers the lane

At Reach Station, Coldburn already knows which campaign lane the pilot chose. His greeting could acknowledge that choice, but selecting “Name the lane” discarded it and rotated unrelated claims about a stamp. His “Settle the contract” option did not settle or offer anything.

This increment lets that ordinary conversation continue honestly. “Name the lane” reads the existing campaign memory each time. Free, grain and patrol choices keep their established lines. Without evidence of a shared lane, he says so rather than awarding the pilot a fictional stamp. His competitive boast remains character dialogue, not a freight receipt.

“Any work left for me?” replaces the misleading settlement label while retaining its existing `settle` choice ID. Coldburn points to an actual current Reach board offer through the same pilot work reply used elsewhere. The offer keeps its exact identity, reward, readiness conditions and existing Accept + track controls. An empty board stays empty; another station's work is not substituted. Asking is not accepting or completing the contract.

## Scope and preservation

- `src/ui/station/barContacts.js`: one existing campaign-reader import, a Coldburn-only choice label, and a Reach/Coldburn reply branch.
- `test/io-coldburn-return.test.mjs`: focused return-conversation and existing offer-renderer coverage.
- This report.

Contact ID, station binding, minimum beat, `lane`/`settle`/`intercept` IDs, grudge counter, campaign memory and saved state meanings are unchanged. No new mission, event, counter, cargo, reward, actor or layout is introduced. The ordinary UI still emits its existing talk-contact event and can advance existing conversation memory; this change adds no progression emission or payment. Maro, the Love Letter Buoy's heard/reseeded outcomes, the listening machines and Shepherd's Ring are untouched.

The 57 open pull requests inspected before implementation contained three separate changes to the same UI file: Kessler's weight-slip conversation, Tethys's papers-service wording, and Ilex's greenhouse conversation. Their hunks are disjoint from this change and must remain intact during integration. Character-binding changes remain with their existing owner.

## Verification and limits

The focused test command is `node --test test/io-coldburn-return.test.mjs`. Eleven cases cover three existing branch outcomes, missing campaign evidence, a stale rendered contact, unchanged choice IDs and actual board-object identity, repeated pure replies without reward, an empty local board, campaign serialize/migrate and contact normalization, unchanged other speakers/intercept, readiness rejection, removed-offer disappearance, and the enabled ordinary acceptance control.

The offer-consumer check executes the unchanged production offer-renderer function with presentation-only helper doubles and real readiness functions. It does not drive a browser click or prove the downstream mission acceptance transaction. The persistence case uses existing campaign serialization/migration and contact normalization, not full-world Save/Continue.

The initial 11/11 result used a mixed dependency environment. The authored source and five key campaign/readiness/contact modules were checked against public blobs, but a complete import trace exposed unrelated world-module drift. That initial pass is not a public-tree acceptance result. A separate bounded qualification subsequently passed all 11 cases against public head `eff6c16e528719d27b57b51a5b8a7258acfcc4ec`. It extracts the unchanged function bodies for authored contact construction, choices, reply dispatch, ghost-convoy readback, board/reward/track presentation, and depth replies from the candidate. Sixty relevant imported modules were checked by Git blob hash against that public tree before execution, including the actual campaign, contact and readiness helpers. The unchanged offer renderer was separately checked against blob `4522268dd1eee17687abb573c28c359e6ee7e2cf`.

This qualification intentionally does not import the broad world graph. The unrelated `forecastTransitFor` and `sectorSignalFor` exports are explicit throw-on-use stubs, and neither was reached. Doss and Vonn contact IDs are nonmatching symbols in the isolated dispatcher; omitted unrelated branch helpers remain unavailable and fail if called. No gameplay result is supplied by a substitute helper. The shipping test retains ordinary full-module imports and contains no loader or stubs.

The initial mixed-graph result and mismatch evidence remain distinct from this bounded pass. Neither proves full-module runtime acceptance. No browser, native flight, visual polish, whole-Io completion, merge or deployment is claimed.
