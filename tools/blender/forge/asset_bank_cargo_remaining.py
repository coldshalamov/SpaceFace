"""Regenerate the remaining33 cargo assets without changing historical original36 files.

The bumper and broken drive bell have dedicated quality recipes. Thirty retain their canonical deterministic geometry; one containment indicator
gains a support bracket. All33 are re-exported with current bounds and scene-cost proofs.
After the original36 builder, run this and asset_bank_cargo_quality.py with an explicit --out
assets/models/asset-bank/cargo to reproduce the full reviewed cargo family.
"""
import argparse,json,math,os,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];sys.path.insert(0,str(HERE))
import forge as F
import asset_bank_cargo as C
from asset_bank_export import export_asset,render_glb_preview
OUT=ROOT/'assets/models/asset-bank-candidates/cargo-remaining'
REVIEW=ROOT/'.devshots/asset-bank/cargo-remaining-review'
EXCLUDED={'machine-tool-skid','bagged-regolith-pallet','torn-hull-strip'}
SPECIAL={'docking-bumper','fractured-drive-bell'}
box,cyl,bar,ring,solid=C.box,C.cyl,C.bar,C.ring,C.solid


def broken_bell_shell(s,lod):
    # A formed bell profile, not a straight cone. Its tear widens toward the exhaust rim.
    rows=[(.15,.31,.08,6.17),(.38,.34,.12,6.05),(.70,.48,.27,5.95),(1.08,.73,.18,5.43),(1.46,1.04,.35,4.97)]
    steps=(32,20,12)[lod];stride=steps+1;n=len(rows)*stride;vertices=[]
    for inner in (True,False):
        for row,(z,r,a0,a1)in enumerate(rows):
            for j in range(stride):
                f=j/steps;a=a0+(a1-a0)*f;radius=r-(.065 if inner else 0)
                # Deliberately crushed rim patches adjacent to the severed opening.
                dz=0
                if row==len(rows)-1:
                    if f<.17:dz=.16*(1-f/.17)-.04*math.sin(f/.17*math.pi)
                    if f>.81:dz=-.17*(f-.81)/.19
                vertices.append((radius*math.cos(a),radius*math.sin(a),z+dz))
    faces=[]
    for k in range(len(rows)-1):
        for j in range(steps):
            a=k*stride+j;b=a+stride;faces.extend([(a,a+1,b+1,b),(n+a,n+b,n+b+1,n+a+1)])
        a=k*stride;b=a+stride;faces.append((a,b,n+b,n+a))
        a=k*stride+steps;b=a+stride;faces.append((a,n+a,n+b,b))
    for j in range(steps):
        faces.append((j,n+j,n+j+1,j+1));a=(len(rows)-1)*stride+j;faces.append((a,a+1,n+a+1,n+a))
    mesh=bpy.data.meshes.new('fractured-bell-shell');mesh.from_pydata(vertices,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
    mesh.materials.append(s.mat('paint2'));mesh.materials.append(s.mat('bare'))
    # The cut's material is bare substrate; the original hot-side liner is dark.
    edge_start=2*(len(rows)-1)*steps
    for poly in mesh.polygons:
        if poly.index>=edge_start:poly.material_index=1
    obj=bpy.data.objects.new('fractured-bell-shell',mesh);bpy.context.scene.collection.objects.link(obj)
    obj['forge_bevel']=.009;obj['forge_uv_scale']=1.;obj['forge_smooth']=45;s.add(obj)
    return rows


def build(name,lod=0):
    if name not in SPECIAL:
        s=C.build(name,lod)
        if name=='biological-containment-cage':
            # The original status strip lay between the tank and cage; seat it on a bracket.
            bracket=bar(s,'status-lamp-support',(.8,-.8,1.5),(.6,-.6,1.5),.065,'gunmetal')
            if lod:bracket['forge_bevel']=0.
            else:s.bank_lod_factory=lambda level:build(name,level)
            s.bank_source='tools/blender/forge/asset_bank_cargo_remaining.py'
        return s
    C.LOD=lod
    colors={'paint':'#1c5552','paint2':'#262a2f','stripe':'#9c7a2a','bare':'#8f989c','hazard':'#b88a22','ceramic':'#9a9382','ceramic.rubber':'#22282b'}
    if name=='fractured-drive-bell':colors.update(paint='#4a4438',paint2='#23282e',stripe='#6b5416',bare='#81776a',ceramic='#867b66')
    s=F.Ship('cargo-'+name,colors);s.solids=[];s.bank_source='tools/blender/forge/asset_bank_cargo_remaining.py'
    if name=='docking-bumper':
        box(s,'rigid-mounting-plate',(0,0,.12),(2.25,1.08,.19),'paint2')
        solid(s,(0,0,.12),(2.25,1.08,.19))
        for x in(-.74,0,.74):
            # Arched elastomer fenders flex into visible open throats under the contact shoes.
            obj=C.arc(s,'elastomer-compression-arch',.30,.115,-.39,.39,0,math.pi,'ceramic.rubber',(24,18,12)[lod])
            obj.rotation_euler[0]=math.pi/2;obj.location=(x,0,.29)
            for side in(-1,1):
                xx=x+side*.27
                box(s,'keeper-foot',(xx,0,.245),(.19,.85,.1),'bare')
                solid(s,(xx,0,.32),(.15,.78,.23))
                if lod<2:
                    for y in(-.31,.31):cyl(s,'keeper-bolt',(xx,y,.295),(xx,y,.35),.04,'gunmetal')
            # Rounded contact cap is firmly seated on the arch crown.
            box(s,'sacrificial-contact-pad',(x,0,.65),(.66,.88,.20),'ceramic.rubber',taper=.93)
            for y in(-.40,.40):box(s,'pad-retainer',(x,y,.57),(.62,.07,.10),'paint')
            for yy in(-.27,0,.27):box(s,'contact-relief-groove',(x,yy,.755),(.5,.025,.012),'dark')
            solid(s,(x,0,.66),(.66,.88,.2))
        # Both ends carry cast mounting ears and short, deliberate safety colour bands.
        for x in(-1.09,1.09):
            box(s,'mount-ear',(x,0,.23),(.15,.88,.13),'paint')
            for y in(-.40,.40):box(s,'edge-warning',(x,y,.31),(.17,.12,.035),'stripe')
        s.socket('SOCKET_Impact',(0,0,.76),(0,0,1))
    else:
        rows=broken_bell_shell(s,lod)
        F.annulus(s,'throat-mount',(0,0),.20,.42,.075,.13,material='gunmetal',segments=(32,20,12)[lod])
        F.annulus(s,'injector-annulus',(0,0),.10,.275,.19,.06,material='dark',segments=(32,20,12)[lod])
        ring(s,'throat-coolant-manifold',(0,0,.37),.39,.045,m='bare')
        for i in range(8):
            a=.5+i*.56
            path=[((r+.025)*math.cos(a),(r+.025)*math.sin(a),z)for z,r,_,_ in rows]
            F.sweep(s,'outer-cooling-channel',path,.034,.045,'bare',bevel=.005)
        # A broken coolant feed and peeling jacket explain the fractured opening.
        F.sweep(s,'severed-coolant-feed',[(.33,-.08,.36),(.50,-.2,.72),(.79,-.37,1.02),(1.12,-.48,1.18)],.06,.06,'bare')
        F.sweep(s,'fracture-insulation-edge',[(.32,.04,.38),(.44,.12,.69),(.71,.13,1.09),(.97,.35,1.61)],.045,.035,'ceramic')
        for i in range(6):
            a=i*math.tau/6;x,y=.185*math.cos(a),.185*math.sin(a)
            cyl(s,'injector-tube',(x,y,.24),(x,y,.31),.034,'bare',cap=False)
        for a in(.65,2.25,3.85):
            x,y=.35*math.cos(a),.35*math.sin(a)
            box(s,'flange-ear',(x,y,.17),(.23,.14,.12),'paint',rot_z=a)
            if lod<2:cyl(s,'flange-fastener',(x,y,.23),(x,y,.28),.039,'bare')
        # Remaining rim sections have a real rolled lip, interrupted at the torn ends.
        for a0,a1 in((.47,1.85),(2.03,3.62),(3.80,4.52)):
            count=(10,7,4)[lod];path=[]
            for i in range(count+1):
                a=a0+(a1-a0)*i/count;f=(a-.35)/(4.97-.35);dz=0
                if f<.17:dz=.16*(1-f/.17)-.04*math.sin(f/.17*math.pi)
                if f>.81:dz=-.17*(f-.81)/.19
                path.append((1.045*math.cos(a),1.045*math.sin(a),1.465+dz))
            F.sweep(s,'retained-rolled-rim',path,.055,.055,'bare',bevel=.005)
        solid(s,(0,0,.18),(.72,.72,.28))
        for a in(.8,2.3,3.8):solid(s,(.50*math.cos(a),.50*math.sin(a),.82),(.2,.2,.55))
        s.socket('SOCKET_Throat',(0,0,.075),(0,0,-1))
    from forge_export import ship_bounds
    bpy.context.view_layer.update();lo,hi=ship_bounds(s)
    s.socket('SOCKET_Mount',(0,0,0),(0,0,-1));s.socket('SOCKET_Grab',((lo.x+hi.x)/2,(lo.y+hi.y)/2,hi.z),(0,0,1));s.socket('SOCKET_Forward',(hi.x,0,(hi.z+lo.z)/2),(1,0,0))
    if lod:
        for obj in s.objects:obj['forge_bevel']=0.
    else:s.bank_lod_factory=lambda level:build(name,level)
    return s


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--only');parser.add_argument('--out',default=str(OUT));parser.add_argument('--render',action='store_true');parser.add_argument('--render-far',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[])
    out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
    records=[r for r in C.RECORDS if r[0]not in EXCLUDED];records.sort(key=lambda r:(r[0]not in SPECIAL,C.RECORDS.index(r)))
    for name,description,kind in records:
        if args.only and args.only!=name:continue
        F.reset_scene();ship=build(name);aid='cargo-'+name
        export_asset(ship,str(out),aid,'cargo',description,collision_boxes=ship.solids,tags=[kind,'cargo-remaining-review','forge'])
        if args.render:render_glb_preview(str(out/f'{aid}_lod0.glb'),str(REVIEW/f'{name}-lod0.png'),width=800,height=600,samples=40)
        if args.render_far or name in SPECIAL and args.render:render_glb_preview(str(out/f'{aid}_lod2.glb'),str(REVIEW/f'{name}-lod2.png'),width=800,height=600,samples=40)
        print('CARGO_REMAINING_EXPORTED '+name,flush=True)
    assets=[]
    for name,_,_ in records:
        p=out/f'cargo-{name}.json'
        if p.exists():assets.append(json.load(open(p)))
    manifest={'schemaVersion':1,'status':'separate remaining33 library-review candidates; historical original36 and quality3 left immutable','source':'tools/blender/forge/asset_bank_cargo_remaining.py','modelDirectory':os.path.relpath(out,ROOT),'assetCount':len(assets),'qualityReplacements':sorted(SPECIAL),'structuralRepairs':['biological-containment-cage: status indicator support bracket'],'excludedFrozenQualityThree':sorted(EXCLUDED),'generation':'blender -b -t 2 --python tools/blender/forge/asset_bank_cargo_remaining.py --','assets':assets}
    with open(ROOT/'design/asset-bank/cargo-remaining-review.json','w')as f:json.dump(manifest,f,indent=2);f.write('\n')
if __name__=='__main__':main()
