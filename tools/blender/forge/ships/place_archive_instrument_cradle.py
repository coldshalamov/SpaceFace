"""Archive instrument cradle: split-keel laboratory, exposed listening spine.
One unregistered research structure; the existing mast is NOT part of this model.
Seat Y=0 in glTF preserves the mast foot. +X service back; -X low/open approach.
"""
import os, sys
from pathlib import Path
FORGE = Path(os.environ.get('SPACEFACE_FORGE', str(Path(__file__).resolve().parent.parent)))
sys.path.insert(0, str(FORGE))
import forge as F
from asset_bank_export import export_asset
ID = 'place_archive_instrument_cradle'
COLORS = {'paint':'#a69d8a','paint2':'#1f3355','stripe':'#1f3355','hazard':'#b88a22'}

def build(level=0):
    s=F.Ship(ID,COLORS)
    s.bank_source='tools/blender/forge/ships/'+ID+'.py'
    s.bank_boxes=[]
    def solid(name,p,size,mat='paint',bevel=.08):
        F.box(s,name,p,size,material=mat,bevel=bevel if level==0 else 0)
        s.bank_boxes.append({'center':list(p),'size':list(size)})
    # Two manufactured keels and rear spine are one joined working structure,
    # not a ring, spacecraft hull, landing pad or invented inhabited station.
    for y,x,length in [(6,0,20),(-6,1.5,17)]:
        tag='North' if y>0 else 'South'
        solid(tag+'Keel',(x,y,-2.5),(length,3.6,1.4),'dark')
        F.loft(s,tag+'InstrumentHousing',[dict(zip(('x','w','ht','hb','zc','n','y'),a)) for a in [(x-length/2+1,.95,.85,.85,-.85,3,y),(x-length/2+2,1.55,.95,.95,-.85,4,y),(x+length/2-1.5,1.55,.95,.95,-.85,4,y),(x+length/2-1.3,1.3,.8,.8,-.85,3,y)]],'paint',count=12 if level==0 else 8)
        s.bank_boxes.append({'center':[x+.2,y,-.85],'size':[length-2,3.1,1.9]})
        solid(tag+'NavyShoulder',(x+2,y,.2),(length-6,2.7,.4),'paint2')
        solid(tag+'ServiceCap',(x+length/2-.55,y,-.65),(1.0,3.5,2.3),'paint2')
        F.box(s,tag+'CapBand',(x+length/2-.55,y,.53),(1.0,2.9,.12),material='hazard',bevel=0)
        if level<2:
            for q in range(3 if level==0 else 2):
                xx=x-length/2+6+q*(2.3 if level==0 else 4.6)
                F.box(s,tag+'Panel'+str(q),(xx,y,.46),(1.9,2.2,.12),material='paint',bevel=.025 if level==0 else 0)
            F.box(s,tag+'StatusLens',(x+length/2-.65,y,.64),(.55,.28,.08),material='glow_cyan',bevel=0)
    solid('RearServiceSpine',(7.6,0,-1.7),(3.6,9.3,2.2),'paint2')
    solid('RearCover',(7.6,0,-.48),(3.2,8.5,.25),'paint')
    # A low bridge supports the mast with its upper face exactly at world Y=0.
    # Horizontal recentering in a future renderer must honor SOCKET_MastSeat.
    solid('MastSeat',(0,0,-.4),(5.6,4.8,.8),'dark',0)
    solid('SeatFoundation',(0,0,-1.55),(3.2,4.8,1.5),'paint2')
    solid('LowerCrossTie',(0,0,-2.6),(2.6,12.2,1.0),'dark')
    solid('AxialServiceRail',(3.8,0,-1.15),(7.6,1.6,.7),'gunmetal')
    # Exposed upper rail has a visible carriage, not a glowing abstract symbol.
    solid('CalibrationBed',(4.7,0,-.55),(3.9,2.7,.5),'paint')
    for y in [-.8,.8]:
        F.box(s,'Rail'+str(y),(4.6,y,-.12),(3.7,.16,.36),material='bare',bevel=0)
    solid('CalibrationCarriage',(4.3,0,.17),(1.15,1.8,.3),'paint2',0)
    if level<2:
        for y in [-6,6]:
            F.box(s,'EndLamp'+str(y),(-8.8 if y>0 else -5.8,y,-.1),(.2,.38,.16),material='glow_amber',bevel=0)
        for y in [-3.7,3.7]:
            F.box(s,'TieLivery'+str(y),(0,y,-2.02),(2.6,.55,.08),material='hazard',bevel=0)
    # Maintenance details are attached, low contrast and omitted at far LOD.
    if level<2:
        for tag,y in [('North',6),('South',-6)]:
            F.panel(s,tag+'NavyShoulder',(5.6,y),(1.8,1.65),'dark',inset=.08,depth=-.12)
            if level==0:
                F.boxes(s,tag+'VentSlats',[((5.05+i*.55,y,.31),(.16,1.35,.07)) for i in range(3)],'gunmetal')
                F.boxes(s,tag+'CaptiveJointBolts',[((x,y+(1.55 if y>0 else -1.55),-1.65),(.28,.28,.3)) for x in [-2,1,4,7]],'bare')
        F.sweep(s,'CalibrationConduit',[(8,4.5,-.27),(8,2,-.27),(6,2,-.27),(6,0,-.27)],.18,.18,material='dark',bevel=0)
    s.socket('SOCKET_MastSeat',(0,0,0),(0,0,1))
    s.socket('SOCKET_ServiceBack',(9.4,0,-1.7),(1,0,0))
    s.bank_lod_factory=lambda n:build(n)
    return s

if __name__=='__main__':
    F.reset_scene()
    out=Path(os.environ.get('SPACEFACE_ASSET_OUT',str(FORGE.parents[2]/'assets/models/asset-bank/research')))
    ship=build()
    result=export_asset(ship,str(out),ID,'research','Split-keel field instrument cradle; mast seat at Y=0; no resident or result implied.',collision_boxes=ship.bank_boxes,tags=['Archive','research','structural','unregistered'])
    print('CRADLE_COST',[(x['level'],x['bytes'],x.get('triangles')) for x in result['lods']])
