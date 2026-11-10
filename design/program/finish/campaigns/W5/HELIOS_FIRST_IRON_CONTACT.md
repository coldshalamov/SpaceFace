# First iron: the cutter's working face

This isolated candidate continues PR #939 at a57965d85b6253b0c1c2469c9ee7871177332fe4. It adapts the already-reviewed unpublished first-iron and homebound contacts to that exact parent, without importing their unrelated handover, relief-guide, galley or status-panel dependencies. No publication, merge or deployment is performed by this work.

## Player route

The existing first Hitch ticket explains Kessler's berth-repair need and the optional route: select the seam cutter, Hail, then MARK FIRST IRON. The original board, acceptance, any-Helios-iron requirement, ticket payment and progression remain authoritative.

The existing compact Hail and radial offer the same route choice. When the real published cutter is working a valid iron face, the reply marks a clear stand-off outside its beam corridor. The pilot still flies, brakes, aims and mines. Accepting directions does not stop the cutter. Actual extraction makes the published worker yield its finite cutting time; releasing the beam lets it resume the remaining face. If that shared face is unavailable, nearby ordinary iron is a fallback. Fleeing cutters do not offer this new work advice. The ordinary living world and its threats remain active.

After the first ticket is genuinely completed, while free iron remains aboard and before the next ticket, a fresh optional MARK IRON BUYER reply points at the live Helios station. The player chooses whether to fly back, dock and sell. Ticket pay and the ordinary market sale remain separate. Sealed units are excluded by the existing canonical cargo readers.

Advice binds the current worker, player, mission, sector entry, buyer/face lifetime and canonical free-iron quantity. Partial removal, a new reservation or another pickup rejects a queued offer/reply even when some free iron remains. Rejection leaves real stock, reservations and the current course unchanged; a fresh Hail describes the current quantity. New navigation, Close, load, target replacement, changed cargo or receipt, moved/depleted/replaced faces and newly occupied stand-offs reject delayed routes. Directions never enable autopilot.

## Ownership

Six product files: contactHail.js, heliosFirstIronContact.js, contactHailPrompt.js, starterWorkday.js, cargoReadModel.js and cargo.js. Cargo readers are moved byte-for-byte from the parent into a dependency-free leaf and re-exported; no cargo writer or reservation meaning changes. Three tests and this note complete the candidate. No denied upload path, model, renderer, job controller or mission owner is modified. The shared checkout and all unpublished work are preserved.

## Direct evidence and limits

The two contact suites cover pointer, keyboard and radial gamepad, lifecycle and stale replies, physical navigation/cut/scoop, one 420-credit ticket award, and a separate ordinary sale. The staged native return traveled 879.349 WU, sold two held units for 63 credits, and recorded zero pilot contacts. Production admission uses actual world-owned cutters and station entities.

The populated production test starts the ordinary sector and waits for its real cutter's first work. Two admission/working-position placements are explicit fixtures. Actual right-button extraction pauses that same worker, release resumes it, then actual Save serialize/loadEnvelope preserves its active ticket, cargo stock, credits and finite resource identity. A new scanner request/choice after load produces a new matched response for the same working face. This is Save-owner continuation, not disk persistence or the Continue screen. Initial fixture capacity 40 becomes 250 on load even on the unchanged parent; no claim is made that derived capacity was preserved. Save's added default transient escort fields are allowed while every original mission field is compared.

A longer populated cut encountered real danger: the cutter fled and its face was destroyed before the full ticket settled. That result is retained, not suppressed or represented as a completed populated route. The short production continuity proof and earned isolated native ticket/return proof are separate evidence.

Sanctioned Claim remains its existing finite 180-second opportunity. An additional owner-level integration test checks early, open and expired states around the new contact. Hail does not arm or refresh the timer. Real mining releases exactly eight tagged physical bonus units only for the open original; early and expired cuts release no tagged bonus. Field-owner save/restore preserves worked/missed state, and repeated mining/collection does not duplicate stock. Test collection positions are staged; ordinary flight is covered separately. Existing claim-opening regressions also run unchanged.

Independent review found and corrected stale face delivery and partial-quantity buyer advice, and retained the parent radial's IDENTIFY action. No concrete product defect remained in the reviewed six-file scope. All exact-parent tests use a source overlay and audited import/direct-read hooks, not the heavily modified shared checkout. The 47-A seed47/720tick/reload600 comparator checks deterministic continuation without changing goldens.

Not verified: unassisted main-menu discovery, uninterrupted populated opening-to-sale route, browser rendering, actual Continue UI/disk persistence, or performance. Static UI/import checks and mounted fake-DOM control tests do not establish rendered acceptance. Three broader starter-workday extraction/import failures reproduce on the unchanged parent; the entire suite is not claimed green. The parent owns any authorized publication and must recheck the remote head and exact source before publishing.
