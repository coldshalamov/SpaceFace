**CHAPTER 01 — THE FIRST RUN (CANONICAL)**

HUD: CONTRACT 47-A ACCEPTED. ALLOY RUN. MASS 12.4T.  
MANIFEST: SLOT01 TITANIUM ALLOY 12400KG.  
HUD: DEPARTURE CLEARED.  
HUD: WAYPOINT 01.  
KILLFEED: ESCORT-02 ELIMINATED.  
KILLFEED: ESCORT-01 ELIMINATED.  
KILLFEED: CARGO DRONE 03 LOST.  
KILLFEED: UNKNOWN VESSEL DEPARTED.  
HUD: RETURN VECTOR SET.  
HUD: DOCKING SEQUENCE. THE PIT.  
MANIFEST: SLOT01 TITANIUM ALLOY 00000KG.  
HUD: AIRLOCK CYCLE COMPLETE.  
GRAFFITI: THEY KNEW THE MASS.
HUD: CONTRACT 47-A CLOSED.  
HUD: PAYMENT WITHHELD.  
HUD: NEW CONTRACTS AVAILABLE.

The HUD never updates the "STABLE LOAD" line. Three cycles later it reads "STABLE LIE."

The graffiti appears on the inside of the airlock door, written in the same stencil font the station uses for intake numbers. It is not signed. It is not explained. It is simply there when the player steps through. One line. No follow-up on the first visit.

The contract board at The Pit still lists 47-A as "open." The player is not credited for completion. The next contract on the board is already visible: ROUTINE ALLOY RUN — TYCHO.

The player can accept it or leave. The graffiti remains on the airlock for three docking cycles before station maintenance paints over it. A new line appears two cycles later, in the same hand: THE COUNT NEVER ENDS.
On the fourth visit, lower and in a different hand: FORTY-SEVEN LEDGERS. ONE SHIP.
On the sixth, scratched deep enough that paint doesn't catch it: THE HOLE HAD NO LOCKS ON THE INSIDE.

The line about Helios — *HELIOS DIDN'T NEED IT. THEY TOOK IT ANYWAY.* — does not appear in Chapter 01. If it appears at all, it appears much later, in a hand that worked the Core maintenance depot, in a bay that smells faintly of machine oil.

No other text appears. No other record exists.

---

### Sheet wiring (entities this chapter touches)

| type | id | role in chapter |
|------|----|-----------------|
| character | `pc_wren` | protagonist; the run |
| character | `npc_vale` | authorization line (Vale, D. / REF 44-C) |
| world | `world_pit` | arrival; the graffiti |
| commodity | `com_refined_slurry` | the 12.4t (the recycler grid pre-loaded with Silt — player doesn't know) |
| chapter-beat | B0 | cold-start; crime-before-the-criminal |

> **Note:** this is the original first-run script. The expanded B0 chapter is `chapter-00-cold-start.md` (adds the pre-flight / pre-loaded-cargo / STABLE-LOAD-line-that-won't-clear material that dramatizes the `crime_before_the_criminal` theme). This file remains the canonical HUD-script version; the two files are complementary — chapter-00 is the prose-frame around the chapter-01 script.

**Graffiti introduced:** `THEY KNEW THE MASS.` (first appearance); `THE COUNT NEVER ENDS.` (second visit); `FORTY-SEVEN LEDGERS. ONE SHIP.` (fourth visit); `HELIOS DIDN'T NEED IT. THEY TOOK IT ANYWAY.` is reserved for later — it is the punchline to a reveal the player cannot have earned on the first run, and the game does not point to it.
**Manifests introduced:** `SLOT01 TITANIUM ALLOY 12400KG` → `00000KG`
**Comms introduced:** none (the run is silent)
**Dosto beat:** `crime_before_the_criminal` → `guilt_as_physiology`. The first contract was filed before the player stepped into the cockpit. The STABLE LOAD line that won't clear persists the way the cargo persists — administratively.

---

> **Canon refs:** `STORY-SPINE-NARRATIVE-OVERLAY.md#B0`, `sheets/chapters/B0.md`, `DOSTOYEVSKY-LAYER.md#guilt_as_physiology`.
