# Dependency Graph

The numeric sequence is the default controller order. Edges below show hard prerequisites, not every earlier prompt whose result may still be relevant.

```mermaid
flowchart TD
  subgraph P0_Truth_and_control_foundation[P0 Truth and control foundation]
    SF_00["SF-00: Live Repository Truth Reconciliation and Sequence Bootstrap"]
    SF_01["SF-01: Integrated Browser/Electron, Graphics, and Performance Baseline Closure"]
    SF_02["SF-02: Deterministic Physics-Control Laboratory and Telemetry"]
    SF_03["SF-03: Intent-Aware Tether Acquisition and Pre-Latch Preview"]
    SF_04["SF-04: Massline Input Grammar, Buffered Intent, Reel, Pay-Out, and Cut"]
    SF_05["SF-05: Anchor-Relative Orbit Assist Through Bounded Physics Commands"]
    SF_06["SF-06: Shared Release Predictor, Validated Sling Course, and Speed-Language Presentation"]
    SF_07["SF-07: REJECTED - do not dispatch"]
  end
  subgraph P1_Physical_combat_and_gravity[P1 Physical combat and gravity]
    SF_08["SF-08: Compound Planar Collision Proxies and Truthful Exterior Docking"]
    SF_09["SF-09: Universal Weapon Impulse and Collision-Consequence Kernel"]
    SF_10["SF-10: Physics-Weapon Vertical Slice: Concussion Cannon, RCS Disruptor, and Vector Mine"]
    SF_11["SF-11: Deployable Anchor Mass Seed"]
    SF_12["SF-12: Continuous Field Kernel, Attractive Well, Repulsor, and Clearing Cone"]
    SF_13["SF-13: Mass-Coupling Tactics: Inertial Shunt, Gravity Mark, and Momentum Sink"]
    SF_14["SF-14: Planetary Sling, Atmospheric Skim, and Enemy Reentry Vertical Slice"]
  end
  subgraph P2_Living_world_and_world_site_kernel[P2 Living world and world-site kernel]
    SF_15["SF-15: Generic NPC Job Controller with Miner, Hauler, and Patrol Loops"]
    SF_16["SF-16: Surface-Launch Cargo, Catcher, Heist, Patrol, and Heat Loop"]
    SF_17["SF-17: Shared Interaction Descriptors and Component-Level Targeting"]
    SF_18["SF-18: Contextual Industrial Beam, Detachable Payloads, and Receivers"]
    SF_19["SF-19: Persistent Multi-Component World Site and Operation-Recipe Kernel"]
    SF_20["SF-20: Wreck Cathedral Monumental Site Vertical Slice"]
    SF_21["SF-21: Recompose One Sector into Activity Pockets and Route Topology"]
    SF_22["SF-22: Environmental Machinery, Debris Current, and Timed Access Hazard"]
  end
  subgraph P3_Asteroid_Ops_industry_and_infrastructure[P3 Asteroid Ops, industry, and infrastructure]
    SF_23["SF-23: Asteroid Formation Exteriorization and Progressive Survey"]
    SF_24["SF-24: Asteroid Ops Heat, Signature, and Operator-Diagnostic Consequences"]
    SF_25["SF-25: Transforming Industrial Claim and Visible Outpost Assembly"]
    SF_26["SF-26: Manufactured Physics and Travel Infrastructure"]
  end
  subgraph P4_Specialized_Masslines_and_narrative_visual_consolidation[P4 Specialized Masslines and narrative/visual consolidation]
    SF_27["SF-27: Practical Specialized Masslines: Tractor, Frame Coupler, and Elastic Whip"]
    SF_28["SF-28: Advanced Massline Combat: Monofilament Sweep and Transverse Snare"]
    SF_29["SF-29: Twin Bridle World-to-World Tether"]
    SF_30["SF-30: Ship’s Ledger, Nonblocking Story Fragments, and Illustrated Evidence Pipeline"]
    SF_31["SF-31: Visual-Family Production Pipeline and Representative Ship/World Families"]
    SF_32["SF-32: Physics HUD, VFX Language, Camera, and Accessibility Consolidation"]
  end
  subgraph P5_Integration_endings_and_release[P5 Integration, endings, and release]
    SF_33["SF-33: Gold-Corridor Thirty/Ninety-Minute Gameplay Integration"]
    SF_34["SF-34: Embodied Story, Ownership, Endings, and Post-Ending Sandbox"]
    SF_35["SF-35: Final Save, Performance, Platform, Accessibility, and Release Closeout"]
  end
  SF_00 --> SF_01
  SF_01 --> SF_02
  SF_02 --> SF_03
  SF_03 --> SF_04
  SF_04 --> SF_05
  SF_05 --> SF_06
  SF_01 --> SF_08
  SF_02 --> SF_08
  SF_05 --> SF_09
  SF_08 --> SF_09
  SF_09 --> SF_10
  SF_06 --> SF_11
  SF_10 --> SF_11
  SF_09 --> SF_12
  SF_11 --> SF_12
  SF_12 --> SF_13
  SF_06 --> SF_14
  SF_08 --> SF_14
  SF_12 --> SF_14
  SF_13 --> SF_14
  SF_01 --> SF_15
  SF_09 --> SF_15
  SF_14 --> SF_16
  SF_15 --> SF_16
  SF_03 --> SF_17
  SF_08 --> SF_17
  SF_09 --> SF_18
  SF_17 --> SF_18
  SF_08 --> SF_19
  SF_17 --> SF_19
  SF_18 --> SF_19
  SF_19 --> SF_20
  SF_15 --> SF_21
  SF_16 --> SF_21
  SF_20 --> SF_21
  SF_12 --> SF_22
  SF_19 --> SF_22
  SF_21 --> SF_22
  SF_19 --> SF_23
  SF_21 --> SF_23
  SF_23 --> SF_24
  SF_19 --> SF_25
  SF_24 --> SF_25
  SF_06 --> SF_26
  SF_25 --> SF_26
  SF_04 --> SF_27
  SF_05 --> SF_27
  SF_09 --> SF_27
  SF_16 --> SF_27
  SF_09 --> SF_28
  SF_17 --> SF_28
  SF_27 --> SF_28
  SF_17 --> SF_29
  SF_27 --> SF_29
  SF_28 --> SF_29
  SF_17 --> SF_30
  SF_20 --> SF_30
  SF_21 --> SF_30
  SF_01 --> SF_31
  SF_15 --> SF_31
  SF_21 --> SF_31
  SF_30 --> SF_31
  SF_06 --> SF_32
  SF_10 --> SF_32
  SF_12 --> SF_32
  SF_14 --> SF_32
  SF_27 --> SF_32
  SF_31 --> SF_32
  SF_10 --> SF_33
  SF_15 --> SF_33
  SF_21 --> SF_33
  SF_23 --> SF_33
  SF_25 --> SF_33
  SF_30 --> SF_33
  SF_32 --> SF_33
  SF_25 --> SF_34
  SF_26 --> SF_34
  SF_30 --> SF_34
  SF_33 --> SF_34
  SF_33 --> SF_35
  SF_34 --> SF_35
```

## Interpretation

- The graph expresses minimum technical gates. The controller still runs numeric order unless SF-00 records a different evidence-backed schedule.
- A prompt may prove itself already satisfied and move directly to review; downstream tasks still revalidate the relevant owner.
- A missing visual-acceptance gate can permit a backend dependency for pure systems work, but a later player-facing prompt may remain blocked until vision review.
- Shared files and semantic owners create mutexes not shown here. The live worktree/lease audit remains mandatory.
