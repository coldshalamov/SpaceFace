# SpaceFace: Opening Comms Script (Scenario 47-A)

This document is the official comms script for the first 15 minutes of moment-to-moment gameplay in *SpaceFace* (Scenario 47-A: The Mass Discrepancy). 

The script is divided into the cold open and the 8 narrative beats.

---

## Cold Open
*Plays immediately upon player spawning in the wreck field.*

*   **Line 1:** 
    *   **Speaker:** `SYSTEM` (Ship AI)
    *   **Dialogue:** `SYSTEM: Core bootstrap complete. Inertial drives online.` (7 words)
*   **Line 2:** 
    *   **Speaker:** `KESSLER` (Freelance Handler / Independent)
    *   **Dialogue:** `KESSLER: You are in the pocket. Signal is active. Find the spindle.` (12 words)
*   **Line 3:** 
    *   **Speaker:** `SYSTEM` (Ship AI)
    *   **Dialogue:** `SYSTEM: Warning. Local environment contains high-density wreck debris.` (8 words)

---

## Beat 1: drop_wreck_field
*Drop into wreck field; spindle signal pulses.*

*   **Who Speaks:** `KESSLER` (Freelance Handler / Independent)
*   **Dialogue:**
    1.  `KESSLER: Signal is pulsing near the Bourse carrier wreck. Lock it down.` (12 words)
        *   *Trigger:* On beat-enter (0 seconds).
    2.  `KESSLER: Sweep says Concord patrols are out. We are running out of time.` (12 words)
        *   *Trigger:* 10 seconds post-enter.
*   **Tutorial Hint Line:**
    *   `SYSTEM: SIGNAL: Track the pulsing bracket. Thrust to close the distance.` (11 words)
        *   *Trigger:* On beat-enter (fires 2 seconds after Kessler's first line).

---

## Beat 2: stabilize_spindle
*Attach and stabilize spindle; mass overloads spool.*

*   **Who Speaks:** `KESSLER` (Freelance Handler / Independent)
*   **Dialogue:**
    1.  `KESSLER: Spindle target matched. Shoot the tether to latch.` (9 words)
        *   *Trigger:* On spindle approach (distance <= 400 wu).
    2.  `KESSLER: Keep the line taut. Hold your drift to stabilize it.` (10 words)
        *   *Trigger:* On player's first successful tether latch.
    3.  `KESSLER: Spindle mass is overloading the spool. Compensate or reel.` (10 words)
        *   *Trigger:* On spindle artificial mass spike event (mass overloads spool).
*   **Tutorial Hint Lines:**
    1.  `SYSTEM: TETHER: Aim at the attachment point and press tether-fire. Hold stable.` (12 words)
        *   *Trigger:* On spindle approach (fires concurrently with Kessler's first line).
    2.  `SYSTEM: REEL: Use reel keys to control tension. Keep the bar green.` (12 words)
        *   *Trigger:* On first tether latch.

---

## Beat 3: scavenger_arrival
*Two scavengers arrive, one harasses and one steals.*

*   **Who Speaks:** `REACH` (Outer Reach / Hostile), `KESSLER` (Freelance Handler / Independent)
*   **Dialogue:**
    1.  `REACH: Look at the little hauler. Make him bleed, cut the tether.` (12 words)
        *   *Trigger:* On scavenger arrival event (spawn).
    2.  `KESSLER: Scavengers on intercept. One is burning straight for the spindle.` (11 words)
        *   *Trigger:* On scavenger thief initiating high-thrust intercept vector.
    3.  `REACH: This rock-grab is ours now. Peel the hull.` (9 words)
        *   *Trigger:* On scavenger harasser firing first laser shot.
*   **Tutorial Hint Lines:**
    1.  `SYSTEM: COMBAT: Hostile lock detected. Use lasers to peel enemy shields.` (11 words)
        *   *Trigger:* On hostile shield lock or weapon fire start.
    2.  `SYSTEM: WARNING: Thief is contesting the payload. Protect the spindle.` (10 words)
        *   *Trigger:* On thief entering proximity of the spindle.

---

## Beat 4: debris_sling
*Debris can be swung, shielded, and released.*

*   **Who Speaks:** `KESSLER` (Freelance Handler / Independent)
*   **Dialogue:**
    1.  `KESSLER: Too many of them. Use the carrier scrap. Sling it.` (11 words)
        *   *Trigger:* On beat-enter (scavenger reinforcements spawn or threat levels rise).
    2.  `KESSLER: Catch a piece of debris. Swing it, then cut line to throw.` (13 words)
        *   *Trigger:* On player latching a nearby physics debris chunk.
*   **Tutorial Hint Line:**
    *   `SYSTEM: SLING: Tether debris, swing ship to build momentum, then cut tether.` (12 words)
        *   *Trigger:* On beat-enter (2 seconds post-Kessler line).

---

## Beat 5: recovery_tug
*Recovery tug and escorts demand surrender.*

*   **Who Speaks:** `CONCORD` (Solar Concord Navy / Lawful), `MERIDIAN` (Meridian Transit Syndicate / Corporate)
*   **Dialogue:**
    1.  `CONCORD: Standard interdiction. Cut your drive and surrender the cargo. Ref 44-C.` (12 words)
        *   *Trigger:* On Concord recovery tug jump-in (beat entry).
    2.  `MERIDIAN: We have active claims on that spindle. Transfer title immediately.` (11 words)
        *   *Trigger:* On Meridian escort hailing (5 seconds post-enter).
    3.  `CONCORD: Non-compliance is recorded. Prepare to be boarded.` (8 words)
        *   *Trigger:* On player refusing command or moving away from interdiction zone.
*   **Tutorial Hint Line:**
    *   `SYSTEM: SCAN: Concord cruiser is locking down your thruster subsystems.` (10 words)
        *   *Trigger:* On interdiction scan starting.

---

## Beat 6: carrier_destabilizes
*Evidence destabilizes fractured carrier section.*

*   **Who Speaks:** `SYSTEM` (Ship AI), `KESSLER` (Freelance Handler / Independent)
*   **Dialogue:**
    1.  `SYSTEM: Warning! Carrier wreck carcass is fracturing. Debris warning.` (9 words)
        *   *Trigger:* On wreck fracture animation sequence beginning (emergency trigger allows exclamation marks).
    2.  `KESSLER: The whole frame is coming apart. Watch the drift.` (10 words)
        *   *Trigger:* 5 seconds after fracture sequence start.
*   **Tutorial Hint Line:**
    *   `SYSTEM: HAZARD: Avoid incoming structural debris. Keep velocity vector clear.` (11 words)
        *   *Trigger:* On collision warnings starting.

---

## Beat 7: civilian_pod_choice
*Civilian pod competes with evidence priority.*

*   **Who Speaks:** `CIVILIAN` (Civilian Pod / Distress), `KESSLER` (Freelance Handler / Independent)
*   **Dialogue:**
    1.  `CIVILIAN: Distress! Pod seals are failing. I am not cargo.` (10 words)
        *   *Trigger:* On distress signal initialization (distress emergency allows exclamation marks).
    2.  `KESSLER: If you aid the pod, we lose the evidence ledger. Choose.` (12 words)
        *   *Trigger:* 5 seconds post-distress signal.
    3.  `CIVILIAN: The cold is coming through. Please, get me out.` (10 words)
        *   *Trigger:* On player closing distance (<= 250 wu) to the escape pod.
*   **Tutorial Hint Line:**
    *   `SYSTEM: NARRATIVE: Target the pod to rescue, or maintain hold on spindle.` (12 words)
        *   *Trigger:* Concurrently with Kessler's second line.

---

## Beat 8: resolution_branch
*Escape, surrender, destroy, or deliver.*

*   **Who Speaks:** `KESSLER` (Freelance Handler / Independent), `CONCORD` (Solar Concord Navy / Lawful)
*   **Dialogue:**
    1.  `KESSLER: Choices are locked in. Make your final run.` (9 words)
        *   *Trigger:* On beat-enter.
    2.  `CONCORD: Hold your position. The ledger is being updated.` (9 words)
        *   *Trigger:* On player approaching intercept vector.
*   **Tutorial Hint Line:**
    *   `SYSTEM: BRANCH: Navigate to the escape beacon or surrender your payload.` (11 words)
        *   *Trigger:* On beat-enter.

---

## Resolution Sign-offs
*Fires at the end of the scenario, corresponding to the final resolved branch.*

*   **Branch: Escape with Evidence (`escape_with_evidence`)**
    *   `KESSLER: We got the ledger. Slip out before the patrol logs update.` (11 words)
*   **Branch: Surrender Evidence (`surrender_evidence`)**
    *   `CONCORD: Possession transferred. Standard citation filed. Clear the sector.` (9 words)
*   **Branch: Destroy Evidence (`destroy_evidence`)**
    *   `KESSLER: Evidence vaporized. Nobody gets the ledger. Go dark, pilot.` (10 words)
*   **Branch: Deliver to Contact (`deliver_to_contact`)**
    *   `KESSLER: Pod safe, spindle delivered. A clean run. Account settled.` (10 words)
