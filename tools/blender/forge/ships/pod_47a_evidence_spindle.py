"""place_47a_evidence_spindle — the 47-A evidence can (GFX-9 rebuild of the PQ-193.04 pod body).

The ordinary tow can's ISO body under custody: a graphite crate with corrugation ribs and ISO
corner blocks — but every tell says "evidence, do not open": a bolted cover where the access hatch
should be, red custody-seal straps wrapping roof and flanks, amber evidence bands instead of a
freight stripe, a ledger case on the roof with a recessed status lamp and a whip antenna, and a
padlocked seal bar across the door leaves.

Contract: same body the SCENARIO_47A_PACKAGED_PROPS packaged-prop path draws — the loader
instantiates the LOD0 primitives and fits the group to the entity envelope, so the file only needs
a centred body and its own name; no sockets or mounts are looked up.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'pod_47a_evidence_spindle'
COLORS = {
    'paint': '#454a4f',          # custody graphite can (the PQ-193.04 hull read)
    'hazard': '#c9912a',         # evidence amber — muted enough to survive the key lift
    'stripe.seal': '#a02228',    # custody-seal tape red
    'gunmetal': '#4a5058',
    'dark': '#16191d',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- ISO can shell, centred on the origin ---------------------------------------------------
    F.box(s, 'Shell', (0.0, 0.0, 0.0), (5.05, 2.88, 2.12), material='paint', bevel=0.045)
    F.box(s, 'RoofLid', (0.0, 0.0, 1.10), (4.92, 2.72, 0.10), material='paint', bevel=0.02)
    # Corrugation ribs down both flanks.
    for i in range(8):
        x = -2.32 + i * (4.55 / 7)
        F.box(s, f'Rib{i}', (x, 1.46, -0.04), (0.16, 0.08, 1.85), material='paint', bevel=0.008)
        F.box(s, f'RibM{i}', (x, -1.46, -0.04), (0.16, 0.08, 1.85), material='paint', bevel=0.008)
    # ISO corner blocks.
    for x in (-2.48, 2.48):
        for y in (-1.38, 1.38):
            for z in (-0.96, 0.96):
                F.box(s, f'Iso{x}_{y}_{z}', (x, y, z), (0.24, 0.24, 0.24), material='gunmetal',
                      bevel=0.012)

    # --- Door face on the -X end, padlocked -----------------------------------------------------
    F.box(s, 'DoorFace', (-2.52, 0.0, -0.01), (0.08, 2.55, 1.95), material='paint', bevel=0.02)
    F.box(s, 'DoorLatchP', (-2.58, 0.62, -0.01), (0.08, 0.10, 1.45), material='gunmetal', bevel=0.008)
    F.box(s, 'DoorLatchS', (-2.58, -0.62, -0.01), (0.08, 0.10, 1.45), material='gunmetal', bevel=0.008)
    for i in range(5):
        F.box(s, f'DoorHinge{i}', (-2.56, 1.18, -0.71 + i * 0.40), (0.07, 0.18, 0.12),
              material='gunmetal', bevel=0.006)
    # Tell 5 — seal bar across both leaves, lock body and dangling custody tag.
    F.box(s, 'DoorSealBar', (-2.64, 0.0, 0.46), (0.12, 2.46, 0.18), material='stripe.seal', bevel=0.01)
    F.box(s, 'PadlockBody', (-2.72, 0.0, 0.20), (0.18, 0.30, 0.34), material='gunmetal', bevel=0.02)
    F.box(s, 'CustodyTag', (-2.76, 0.0, -0.08), (0.03, 0.34, 0.26), material='stripe.seal', bevel=0.004)

    # --- Tell 1 — the access hatch is sealed: a bolted cover plate on the roof ------------------
    F.box(s, 'SealedCover', (-0.65, 0.0, 1.19), (1.66, 1.02, 0.08), material='gunmetal', bevel=0.014)
    for i, (x, y) in enumerate(((-1.32, 0.40), (-0.65, 0.40), (0.02, 0.40),
                                (-1.32, -0.40), (-0.65, -0.40), (0.02, -0.40))):
        F.cylinder(s, f'CoverBolt{i}', (x, y, 1.23), (x, y, 1.29), 0.045, material='gunmetal',
                   segments=8, bevel=0.0)

    # --- Tell 2 — custody seal straps wrap roof and both flanks at two stations -----------------
    for i, x in enumerate((-1.48, 1.20)):
        F.box(s, f'StrapRoof{i}', (x, 0.0, 1.175), (0.30, 2.86, 0.05), material='stripe.seal',
              bevel=0.006)
        F.box(s, f'StrapP{i}', (x, 1.53, 0.02), (0.30, 0.05, 2.16), material='stripe.seal', bevel=0.006)
        F.box(s, f'StrapS{i}', (x, -1.53, 0.02), (0.30, 0.05, 2.16), material='stripe.seal', bevel=0.006)
        F.box(s, f'StrapBuckle{i}', (x, 1.575, 0.56), (0.40, 0.10, 0.26), material='gunmetal',
              bevel=0.008)

    # --- Tell 3 — evidence bands replace the freight stripe on both flanks + roof edges ---------
    F.box(s, 'EvidenceBandP', (0.0, 1.50, 0.02), (4.70, 0.06, 0.46), material='hazard', bevel=0.01)
    F.box(s, 'EvidenceBandS', (0.0, -1.50, 0.02), (4.70, 0.06, 0.46), material='hazard', bevel=0.01)
    F.box(s, 'EvidenceRailP', (0.0, 1.20, 1.17), (4.40, 0.24, 0.04), material='hazard', bevel=0.006)
    F.box(s, 'EvidenceRailS', (0.0, -1.20, 1.17), (4.40, 0.24, 0.04), material='hazard', bevel=0.006)

    # --- Tell 4 — custody ledger case on the roof: recessed status lamp + whip antenna ----------
    F.box(s, 'LedgerCase', (1.85, -0.45, 1.30), (0.92, 0.70, 0.30), material='gunmetal', bevel=0.03)
    F.box(s, 'LedgerCaseLid', (1.85, -0.45, 1.475), (0.74, 0.54, 0.05), material='paint', bevel=0.01)
    F.cylinder(s, 'LampRim', (1.62, -0.45, 1.49), (1.62, -0.45, 1.59), 0.16, material='gunmetal',
               segments=16, bevel=0.01)
    F.cylinder(s, 'LampLens', (1.62, -0.45, 1.59), (1.62, -0.45, 1.65), 0.11, material='glow_amber',
               segments=16, bevel=0.0)
    F.cylinder(s, 'AntennaBase', (2.16, -0.66, 1.44), (2.16, -0.66, 1.54), 0.07, material='gunmetal',
               segments=10, bevel=0.0)
    F.cylinder(s, 'Antenna', (2.16, -0.66, 1.54), (2.16, -0.66, 2.60), 0.022, material='gunmetal',
               segments=6, bevel=0.0)
    s.socket_names = ['SOCKET_Structure_Core']
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
