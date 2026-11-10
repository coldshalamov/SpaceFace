"""Last Shift: torn tow-deck, side-loaded fairlead, no blast damage.

Reuses the yard tug's 0.9 x 1.2 x 0.8 casing and 0.2-radius / 1m roller
construction language, on a 7.8m broken deck section. The runtime fits the
whole wreck assembly to radius 26, never the small roller in isolation.
Source-only export: registration, release promotion and acceptance are separate.
Run: blender -b --python tools/blender/forge/places/last_shift_fairlead.py
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F
import forge_export as E

SPEC = {'file': 'place_last_shift_fairlead', 'asset_id': 'place_last_shift_fairlead',
        'part_id': 'place_last_shift_fairlead', 'layout': 'place', 'new_place': True}
COLORS = {'paint': '#626c70', 'paint2': '#283038', 'hazard': '#ac7929',
          'stripe': '#ac7929'}


def build():
    F.reset_scene()
    s = F.Ship(SPEC['file'], COLORS)
    s.socket_names = ['SOCKET_Inspection']
    s.socket('SOCKET_Inspection', (0, 0, .82))
    # A broad, asymmetric torn plate makes the static 26WU wreck envelope honest.
    outline = [(-3.9,0),(-3.3,-1.5),(-2.9,-2.1),(2.5,-2.1),(3.25,-1.82),(3.02,-1.3),(3.5,-.72),(3.8,0),
               (2.95,-.5),(3.15,.12),(2.72,.39),(3.55,1.21),(2.6,2.0),(-2.9,2.0),(-3.3,1.45)]
    deck = F.plate(s, 'TornTowDeck', outline, -.38, .24, material='paint', chamfer=.035,
            side_material='bare')
    for y in (-1.65, 1.55):
        F.box(s, 'DeckUndersideRib'+str(y), (-.6,y,-.55), (5.4,.19,.4), material='paint2', bevel=.035)
    F.box(s, 'DeckCrossMember', (-2.8,0,-.57), (.28,4.0,.44), material='paint2', bevel=.035)
    F.plate_v(s, 'BuckledTearLip', [(2.8,-.35),(3.7,.18),(3.3,.42),(2.65,-.16)],
              .72, .28, plane='xz', material='paint', chamfer=.02)
    # Raised plinth and a visibly ripped mounting plate, distinct from the deck tear.
    F.plate(s, 'RippedMountPlate', [(-1.0,-.95),(.6,-.95),(.9,-.5),(.57,-.23),
             (1.05,.05),(.63,.25),(.88,.7),(-1,.95)], -.14, .14,
             material='paint2', chamfer=.025, side_material='bare')
    # Split casing leaves the roller exposed, rather than burying it in a generic box.
    F.box(s, 'FairleadBase', (-.2,0,.12), (.9,1.2,.24), material='paint2', bevel=.05)
    for y in (-.55,.55):
        F.box(s, 'FairleadCheek'+str(y), (-.2,y,.37), (.9,.16,.5), material='paint2', bevel=.04)
    # Lateral load shoved the roller toward the torn edge; the far axle is pulled out.
    roller = F.cylinder(s, 'SideLoadedRoller', (-.04,-.42,.62), (.26,.58,.62), .2,
               material='bare', segments=24, bevel=.02)
    s.hook_part('LAST_SHIFT_ROLLER', roller)
    s.hook_part('LAST_SHIFT_TORN_DECK', deck)
    F.cylinder(s, 'ExposedBentAxle', (.26,.58,.62), (.35,.85,.56), .085,
               material='gunmetal', segments=12)
    # Scoring is directed cut/burnish geometry, not noise or blast pits.
    for x in (-.085,.005,.095):
        F.box(s, 'RollerLoadScore'+str(x), (x,.02,.815), (.025,.32,.014), material='dark', bevel=.003)
    F.plate(s, 'PeeledMountTongue', [(.65,.35),(1.55,.62),(1.25,.98),(.72,.72)],
            .0, .1, material='bare', chamfer=.012)
    # Directional dragged-metal scars lead from roller to ruptured plate edge.
    F.plate(s, 'DraggedMountBareSwath', [(.56,.12),(1.2,.18),(2.7,.51),(2.91,.68),
             (2.15,.62),(1.57,.58),(.7,.48)], -.134, .009, material='bare')
    for i in range(3):
        F.plate(s, 'LateralDeckScar'+str(i), [(.75,.22+i*.17),(2.05+i*.26,.43+i*.10),
                 (2.22+i*.2,.46+i*.10),(.8,.25+i*.13)], -.122, .004, material='dark')
    for y in (-1.85,1.75):
        F.box(s, 'TowDeckSafetyBand'+str(y), (-.95 if y < 0 else -.85,y,-.12), (3.3 if y < 0 else 3.8,.13,.025), material='hazard', bevel=.006)
    s.detail = 1
    for x in (-.8,.47):
        for y in (-.72,.72):
            F.cylinder(s, 'MountBolt'+str((x,y)), (x,y,.0),(x,y,.06),.075,
                       material='bare',segments=6,bevel=.005)
    # Declare the shared, mesh-aligned Forge surface maps to the place census too.
    # Older place measurement reads textureRoleMode rather than Forge finish metadata.
    for material in s._mats.values():
        material['textureRoleMode'] = 'shared-forge-panel'
    return s

if __name__ == '__main__':
    E.export_place(build().finish(), SPEC, preview=False)
