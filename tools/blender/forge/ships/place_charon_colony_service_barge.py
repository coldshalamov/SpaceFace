"""Evacuated habitat on working barge.

Colony-only composition. Reuses the conveyor intact and the everyday-space habitat
capsule / utility-module silhouettes, rebuilt in shared Forge finishes. No new stock,
occupants, damage or active habitat lighting. All geometry stays within the original
barge's XYZ envelope; source-derived collision is exported without scaling.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F
import place_conveyor_barge as B

SHIP_ID = 'place_charon_colony_service_barge'


def build():
    s = B.build()
    s.id = SHIP_ID
    # The old cab is intact but evacuated, not a second inhabited room.
    for o in s.objects:
        if o.name.startswith('CabWin'):
            o.data.materials.clear()
            o.data.materials.append(s.mat('glass'))

    # Pressure capsule nested above the service-end deck opposite the cab. Rounded
    # endcaps, dark band joints and broad panels preserve the donor's civilian read.
    cy, cz = -4.3, 7.9
    sections = [(-.35,.55,.55),(.1,1.35,1.35),(.8,1.65,1.65),
                (1.0,1.65,1.65),(1.14,1.65,1.65),(3.75,1.65,1.65),
                (3.89,1.65,1.65),(4.15,1.65,1.65),(4.85,1.3,1.3),(5.3,.55,.55)]
    F.loft(s, 'ColonyHabitatShell', [dict(x=x,w=w,ht=h,hb=h,zc=cz,y=cy,n=2.0)
           for x,w,h in sections], material='paint', bands={3:'dark',5:'dark'},
           belly='paint2', count=24, bevel=0)
    # Two saddles physically bridge shell to deck. Their inset tops meet the curved
    # belly; broad feet distribute load instead of leaving a floating capsule.
    for i,x in enumerate((1.0,3.9)):
        F.box(s,f'HabitatSaddleFoot{i}',(x,cy,4.12),(.65,4.25,.6),material='paint2',bevel=.08)
        for side in (-1,1):
            F.box(s,f'HabitatSaddle{i}{side}',(x,cy+side*1.18,5.5),(.45,.55,2.7),material='gunmetal',bevel=.06)
    # A closed airlock at the tail, visibly nested within its collar and gasket.
    F.cylinder(s,'HabitatAirlockCollar',(-.65,cy,cz),(-.12,cy,cz),.82,material='gunmetal',segments=20,bevel=0)
    F.cylinder(s,'HabitatAirlockGasket',(-.73,cy,cz),(-.64,cy,cz),.69,material='dark',segments=20,bevel=0)
    F.cylinder(s,'HabitatAirlockSealed',(-.79,cy,cz),(-.72,cy,cz),.58,material='paint2',segments=20,bevel=0)
    # Unlit inset windows, with a raised frame, all seated at the capsule's side.
    s.detail=1
    for i,x in enumerate((1.55,2.55,3.55)):
        F.box(s,f'HabitatWindowFrame{i}',(x,cy-1.57,8.18),(.72,.15,.62),material='gunmetal',bevel=.055)
        F.box(s,f'HabitatWindowDark{i}',(x,cy-1.66,8.18),(.53,.055,.42),material='glass',bevel=0)
    F.box(s,'AirlockLatch',(-.84,cy,cz),(.08,.28,.09),material='bare',bevel=.015)
    s.detail=0
    # Compact utility silhouette: box, recessed service panel, external pipes and
    # cooling fins. Attached on the inboard side, clear of the gallery and hoppers.
    F.box(s,'HabitatServiceBracket',(1.15,-1.85,5.65),(2.5,1.9,.45),material='gunmetal',bevel=.06)
    F.box(s,'HabitatServiceAnnex',(1.15,-1.75,6.55),(2.1,1.65,1.65),material='paint2',bevel=.16)
    F.box(s,'HabitatServiceInset',(1.15,-1.75,7.40),(1.65,1.21,.08),material='dark',bevel=.06)
    F.box(s,'HabitatServicePanel',(1.15,-1.75,7.47),(1.38,.95,.10),material='paint',bevel=.045)
    F.box(s,'HabitatServiceBand',(1.15,-1.75,7.53),(.18,.95,.03),material='hazard',bevel=.01)
    for i in range(5):
        F.box(s,f'HabitatCoolerFin{i}',(2.23,-2.30+i*.25,6.6),(.22,.10,1.1),material='gunmetal',bevel=0)
    for i,x in enumerate((.65,1.65)):
        F.sweep(s,f'HabitatServiceConnection{i}',[(x,-2.5,6.8),(x,-2.75,6.8),(x,-2.85,7.25)],.14,.14,material='bare')
    # Explicitly classify only finishes backed by the shared Forge image nodes.
    # Factor-only glass/lamps remain factor-only; no donor materials are modified.
    for mat in s._mats.values():
        if mat.use_nodes and any(n.type == 'TEX_IMAGE' and n.image for n in mat.node_tree.nodes):
            mat['textureRoleMode'] = 'forge-shared'
    return s


if __name__ == '__main__':
    import forge_export as E
    E.export_ship(build().finish(), E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
