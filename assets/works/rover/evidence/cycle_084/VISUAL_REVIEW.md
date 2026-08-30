# Rover Cycle 84 independent visual review

Candidate identity:

- LOD0: `25923E1A6DAA73094F618D28001127163217BAF30E94D26F8281372AE0B6B28D`
- LOD1 retained: `7555D37E0882976A0456979FEA824C72394E83F6FBF1FA59686A2373FC740CEC`
- LOD2 retained: `3E74E227187BF6CDA1CD9B837516F15CF2ADA910CA02BE60BC4631E772FFE912`

| Review | Scope | Disposition | Finding |
|---|---|---|---|
| Cursor Grok `1f441644-17d9-4c2a-853e-b11c18899ea8` | supported top camera plus dominant retained zones | **KEEP** | At original size the grey boom ends in one attached dark round working face with a single notched/scalloped silhouette and a small dark boss. It is not a spark, icon, clamp, coin, or detached cap; tracks, deck bars, lamp, hopper, and chassis remain coherent. |
| Cursor Grok `40c6cc0b-00fb-44c4-8707-d7776ccbc4cb` | supported edge/flank cameras | **KEEP** | The 13–14 px cutter has housing overlap and a cylindrical side band. The boss measures roughly luma 20–35 instead of Cycle 83's luma 97–148 spark cluster, and the integrated rim replaces detached tooth dots. The prior edge veto does not survive. |
| Retained Cycle 80 site review | supported site camera | **KEEP** | LOD1 is byte-identical to the independently accepted site candidate. Site silhouette, track share, well, glass, and accent hierarchy remain exact. |

## Controller disposition

**KEEP.** Original-resolution top, edge, flank, site, and beside-flight stills cover the changed head and dominant retained zones. The exact candidate passed independent top and edge reviews, the retained site hash is unchanged, and an unchanged rebuild returned `determinism MATCH`. G1/G2/G4 are closed for the whole Rover candidate at the supported Works cameras. Promotion must preserve these exact source hashes.
