"""Cargo quality candidates. Does not mutate the canonical 36-model bank.
Default output is isolated; --out explicitly selects another directory.
Three repaired silhouettes using the current Forge exporter.
"""
import os,sys,math,json,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];sys.path.insert(0,str(ROOT/'tools/blender/forge'))
import bpy,bmesh
from mathutils import Vector
import forge as F
import asset_bank_cargo as C
from asset_bank_export import export_asset,render_glb_preview
OUT=ROOT/'assets/models/asset-bank-candidates/cargo-quality'
REVIEW=ROOT/'.devshots/asset-bank/cargo-quality-review'
box,cyl,bar,ring,solid=C.box,C.cyl,C.bar,C.ring,C.solid


def bag_mesh(s,name,x,y,lod):
    # Tailored woven bulk bag: tucked bottom, broad loaded belly, gathered fill neck.
    # Fixed corner folds are construction seams, not procedural surface noise.
    count=(48,32,20)[lod]
    layers=[(.335,.305,.29),(.38,.335,.31),(.51,.358,.342),(.70,.351,.335),(.87,.335,.315),(.955,.325,.302),(.90,.075,.065),(.935,.024,.055)]
    verts=[]
    for k,(z,w,h) in enumerate(layers):
        for j in range(count):
            a=j*math.tau/count;cs,sn=math.cos(a),math.sin(a)
            xx=w*math.copysign(abs(cs)**(2/5.2),cs);yy=h*math.copysign(abs(sn)**(2/5.2),sn)
            # Positioned sewn creases: broad low-frequency fabric folds, not noise.
            height=max(0,min(1,(z-.335)/.62))
            corner=1-.035*abs(math.sin(2*a))**10
            xx*=corner;yy*=corner
            if abs(yy)>.18 and 0<k<6:
                # Two diagonal folds on the broad front/back faces; sides sag under fill.
                fold1=.052*math.exp(-((xx-(-.17+.11*height))/.035)**2)
                fold2=.039*math.exp(-((xx-(.16-.08*height))/.04)**2)
                yy-=math.copysign((fold1+fold2)*math.sin(math.pi*height)**.6,yy)
            if abs(xx)>.24 and 0<k<6:
                side_fold=.038*math.exp(-((yy-(.10-.17*height))/.045)**2)
                xx-=math.copysign(side_fold*math.sin(math.pi*height),xx)
            # The two lashings compress the outer bags through the shoulder and front faces.
            belt=min(abs(x+xx-.95),abs(x+xx+.95))
            dent=math.exp(-(belt/.05)**2)
            if k>=3 and k<6:
                yy*=1-.10*dent
                z_local=z-.043*dent*(height**2)
            else:z_local=z
            # Pooled fabric at four lower corners sits flat against the pallet deck.
            if k==1:xx*=1+.026*abs(math.sin(2*a));yy*=1+.026*abs(math.sin(2*a))
            verts.append((x+xx,y+yy,z_local))
    faces=[]
    for k in range(len(layers)-1):
        for j in range(count):q=(j+1)%count;faces.append((k*count+j,k*count+q,(k+1)*count+q,(k+1)*count+j))
    faces.extend([tuple(reversed(range(count))),tuple((len(layers)-1)*count+j for j in range(count))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(s.mat('ceramic'))
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);obj['forge_bevel']=.003;obj['forge_uv_scale']=.12;obj['forge_smooth']=65;s.add(obj)
    return obj


def sheet(s,name,rows,widths,thick,material):
    v=[]
    for dz in (0,thick):
        for row,(left,right) in zip(rows,widths):
            x,z=row[:2];twist=row[2]if len(row)>2 else 0
            v.extend([(x,left,z+dz-twist),(x,right,z+dz+twist)])
    n=len(rows)*2;f=[]
    for i in range(len(rows)-1):
        a=i*2;b=a+2;f.extend([(a,b,b+1,a+1),(n+a+1,n+b+1,n+b,n+a),(a,n+a,n+b,b),(a+1,b+1,n+b+1,n+a+1)])
    f.extend([(0,1,n+1,n),(n-2,2*n-2,2*n-1,n-1)])
    me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free();me.materials.append(s.mat(material));o=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(o);o['forge_bevel']=.009;o['forge_uv_scale']=1.;o['forge_smooth']=25;s.add(o);return o


def build(name,lod=0):
    C.LOD=lod
    colors={'paint':'#1c5552','paint2':'#262a2f','stripe':'#9c7a2a','bare':'#8f989c','hazard':'#b88a22','ceramic':'#9a9382'}
    if name=='torn-hull-strip':colors.update(paint='#4a4438',paint2='#23282e',stripe='#6b5416',bare='#81776a',ceramic='#867b66')
    colors['ceramic.webbing']='#8d8058'
    s=F.Ship('cargo-'+name,colors);s.solids=[];s.bank_source='tools/blender/forge/asset_bank_cargo_quality.py'
    if name=='machine-tool-skid':
        C.frame(s,1.5,.75)
        box(s,'chip-sump',(0,.05,.34),(2.8,1.2,.15),'paint2')
        for y in(-.56,.66):bar(s,'sump-lip',(-1.35,y,.43),(1.35,y,.43),.09,'paint')
        # Cast bed has real air underneath and twin machined ways; it is not a solid crate.
        for x in(-.95,.95):box(s,'bed-foot',(x,0,.55),(.4,.67,.34),'paint')
        box(s,'lathe-bed',(-.06,0,.7),(2.55,.72,.2),'paint')
        for y in(-.25,.25):bar(s,'machined-way',(-1.28,y,.82),(1.25,y,.82),.09,'bare')
        F.loft(s,'cast-headstock',[dict(x=-1.28,w=.35,ht=.48,hb=.35,zc=1.14,n=4),dict(x=-1.12,w=.45,ht=.6,hb=.35,zc=1.14,n=4),dict(x=-.63,w=.38,ht=.48,hb=.35,zc=1.14,n=4)],material='paint',count=(24,16,12)[lod],bevel=.035)
        cyl(s,'spindle-nose',(-.68,0,1.19),(-.46,0,1.19),.21,'bare')
        cyl(s,'chuck-body',(-.5,0,1.19),(-.29,0,1.19),.32,'gunmetal')
        ring(s,'chuck-face',(-.285,0,1.19),.27,.035,axis=(1,0,0),m='bare')
        for a in (0,math.tau/3,2*math.tau/3):
            y,z=.18*math.sin(a),1.19+.18*math.cos(a)
            box(s,'radial-chuck-jaw',(-.24,y,z),(.14,.13,.22),'bare',rot=(a,0,0))
            if lod<2:box(s,'jaw-grip-tooth',(-.16,y*.6,1.19+(z-1.19)*.6),(.05,.105,.035),'dark',rot=(a,0,0))
        cyl(s,'clamped-workpiece',(-.2,0,1.19),(.74,0,1.19),.08,'bare')
        # Tailstock and quill create the characteristic long open turning envelope.
        box(s,'tailstock-slide',(1.03,0,.88),(.48,.64,.14),'paint2')
        F.loft(s,'tailstock',[dict(x=.83,w=.2,ht=.34,hb=.17,zc=1.06,n=3.8),dict(x=1.17,w=.26,ht=.34,hb=.17,zc=1.06,n=3.8)],material='paint',count=(20,14,10)[lod])
        cyl(s,'tail-quill',(.73,0,1.19),(.96,0,1.19),.1,'bare')
        cyl(s,'tail-handwheel-shaft',(1.13,0,1.19),(1.36,0,1.19),.055,'bare');ring(s,'tail-handwheel',(1.38,0,1.19),.18,.027,axis=(1,0,0),m='stripe')
        for a in (0,math.pi/2,math.pi,3*math.pi/2):bar(s,'tail-wheel-spoke',(1.38,0,1.19),(1.38,.17*math.sin(a),1.19+.17*math.cos(a)),.026,'stripe')
        box(s,'carriage-saddle',(.15,0,.91),(.59,.82,.18),'paint2');box(s,'cross-slide',(.15,-.23,1.035),(.36,.64,.11),'bare')
        box(s,'toolpost',(.12,-.23,1.17),(.16,.18,.19),'paint2');bar(s,'tool-cutter',(.12,-.3,1.2),(.12,-.045,1.2),.047,'bare')
        box(s,'feed-apron',(.15,-.48,.77),(.62,.17,.34),'paint')
        cyl(s,'feed-screw',(-1.14,-.44,.62),(1.14,-.44,.62),.045,'bare')
        ring(s,'carriage-feed-wheel',(.2,-.6,.77),.15,.025,axis=(0,1,0),m='stripe')
        for a in (0,math.pi/2,math.pi,3*math.pi/2):bar(s,'feed-wheel-spoke',(.2,-.6,.77),(.2+.14*math.cos(a),-.6,.77+.14*math.sin(a)),.02,'stripe')
        F.plate_v(s,'rear-chip-guard',[(-1.3,.47),(1.27,.47),(1.27,.87),(.6,1.12),(-1.3,1.12)],.53,.06,plane='xz',material='paint2',bevel=.015)
        box(s,'control-panel',(-.97,-.432,1.33),(.38,.095,.4),'paint2');box(s,'readout',(-.97,-.485,1.41),(.27,.02,.11),'glow_cyan')
        for x,m in ((-1.07,'glow_green'),(-.89,'hazard')):cyl(s,'control-button',(x,-.476,1.24),(x,-.51,1.24),.043,m)
        cyl(s,'drive-motor',(-.96,.42,.93),(-.96,.86,.93),.24,'paint2')
        for y in(.5,.61,.72,.83):ring(s,'motor-cooling-fin',(-.96,y,.93),.24,.018,axis=(0,1,0),m='bare')
        F.sweep(s,'service-harness',[(-1.1,.6,.8),(-1.15,.58,.5),(.86,.58,.5)],.045,.045,'dark')
        solid(s,(-.97,0,1.13),(.72,.88,1.18));solid(s,(0,0,.69),(2.55,.72,.24));solid(s,(1.02,0,1.07),(.48,.6,.54))
    elif name=='bagged-regolith-pallet':
        C.frame(s)
        for x in(-1,-.5,0,.5,1):box(s,'pallet-deck',(x,0,.305),(.34,1.5,.08),'paint2')
        variation=[(1.02,1.00,1.02,.018,-.012),(.97,1.025,.94,-.022,.018),(1.01,.98,.97,.01,.02),(.98,1.01,1.06,-.016,-.01),(1.025,.97,.96,.022,.01),(.96,1.02,1.015,-.015,-.02)]
        bag_index=0
        for x in(-.75,0,.75):
            for y in(-.38,.38):
                first=len(s.objects)
                bag_mesh(s,'flexible-regolith-bag',x,y,lod)
                F.sweep(s,'gathered-neck-tie',[(x-.10,y-.05,.965),(x,y,.93),(x+.11,y+.06,.958)],.017,.01,'ceramic.webbing')
                for side in(-1,1):
                    yy=y+side*.2
                    F.sweep(s,'woven-lifting-loop',[(x-.19,yy,.86),(x-.19,yy,.98),(x-.17,yy,1.06),(x-.1,yy,1.1),(x-.04,yy,1.06),(x+.015,yy,.97)],.045,.018,'ceramic.webbing')
                if lod<2:
                    for sign in(-1,1):F.sweep(s,'sewn-shoulder-fold',[(x+sign*.28,y,.95),(x+sign*.19,y,.94),(x+sign*.055,y,.925)],.014,.012,'ceramic')
                sx,sy,sz,shear_x,shear_y=variation[bag_index];bag_index+=1
                for obj in s.objects[first:]:
                    for vertex in obj.data.vertices:
                        v=vertex.co;h=(v.z-.335)/.75
                        v.x=x+(v.x-x)*sx+shear_x*h;v.y=y+(v.y-y)*sy+shear_y*h
                        v.z=.335+(v.z-.335)*sz
        for x in(-.95,.95):
            front=variation[0 if x<0 else 4][2];back=variation[1 if x<0 else 5][2]
            hf=.335+.59*front;hb=.335+.59*back
            F.sweep(s,'continuous-restraint' ,[(x,-.76,.25),(x,-.76,.65),(x,-.68,hf-.02),(x,-.38,hf),(x,-.05,hf-.045),(x,.05,hb-.045),(x,.38,hb),(x,.68,hb-.02),(x,.76,.65),(x,.76,.25)],.055,.018,'ceramic.webbing')
            box(s,'ratchet-buckle',(x,-.765,.62),(.13,.09,.18),'bare')
        solid(s,(0,0,.65),(2.2,1.4,.72))
    elif name=='torn-hull-strip':
        rows=[(-1.8,.17,0),(-1.16,.17,0),(-.5,.21,0),(.16,.30,.02),(.65,.8,.08),(.82,1.18,.14),(1.08,1.5,.22)]
        widths=[(-.53,.55),(-.55,.59),(-.57,.57),(-.56,.51),(-.63,.48),(-.43,.62),(-.51,.23)]
        sheet(s,'curled-hull-skin',rows,widths,.062,'paint')
        sheet(s,'exposed-insulation',[(r[0],r[1]-.085,r[2])for r in rows[:-1]],[(a+.045,b-.04)for a,b in widths[:-1]],.038,'ceramic')
        for x,z in((-1.38,.12),(-.65,.15),(.04,.22),(.55,.58)):
            bar(s,'under-skin-frame-rib',(x,-.52,z),(x,.51,z),.09,'bare')
        F.sweep(s,'broken-keel-stringer',[(-1.82,.24,.05),(-1.16,.24,.05),(-.5,.24,.09),(.16,.24,.16),(.62,.24,.61)],.1,.1,'paint2')
        box(s,'old-ochre-band',(-1.25,.015,.245),(.17,1.07,.014),'stripe')
        # A torn tip is lifted out of the main sheet plane, with exposed thin substrate.
        sheet(s,'peeled-tip',[(.7,.98),(1.15,1.7),(1.05,1.96)],[(-.35,-.17),(-.32,-.13),(-.23,-.16)],.035,'bare')
        sheet(s,'fracture-tab',[(.85,1.2),(1.3,1.35),(1.6,1.21)],[(.23,.43),(.29,.39),(.30,.32)],.035,'bare')
        F.sweep(s,'severed-service-conduit',[(-1.65,-.42,.08),(-.65,-.42,.12),(.35,-.46,.23),(.8,-.66,.35),(1.1,-.71,.57)],.055,.055,'paint2')
        for i in range(3):bar(s,'exposed-wire',(1.03,-.7,.5),(1.35+i*.08,-.72+i*.09,.5+i*.07),.024,'stripe'if i==1 else'bare')
        if lod<2:
            for x,z,y in((-1.6,.23,-.45),(-1.6,.23,.45),(-.88,.25,-.47),(-.88,.25,.49),(-.15,.32,-.48),(-.15,.32,.44)):
                cyl(s,'rivet-head',(x,y,z),(x,y,z+.025),.03,'bare')
        solid(s,(-.8,0,.2),(2.1,1.15,.19));solid(s,(.75,0,.95),(.7,1.05,.8))
    else:raise ValueError(name)
    if name=='bagged-regolith-pallet':
        # Fabric is thin sewn cloth, not bevelled hard plating. Preserve its folds directly.
        for obj in s.objects:
            if obj.name.startswith(('flexible-regolith-bag','woven-lifting-loop','sewn-shoulder-fold','gathered-neck-tie','continuous-restraint')):obj['forge_bevel']=0.
    from forge_export import ship_bounds
    bpy.context.view_layer.update();lo,hi=ship_bounds(s)
    s.socket('SOCKET_Mount',(0,0,0),(0,0,-1));s.socket('SOCKET_Grab',((lo.x+hi.x)/2,(lo.y+hi.y)/2,hi.z),(0,0,1));s.socket('SOCKET_Forward',(hi.x,0,(hi.z+lo.z)/2),(1,0,0))
    if lod:
        for o in s.objects:o['forge_bevel']=0.
    else:s.bank_lod_factory=lambda level:build(name,level)
    return s

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('names',nargs='*',choices=['machine-tool-skid','bagged-regolith-pallet','torn-hull-strip'])
    parser.add_argument('--out',default=str(OUT),help='Output directory; defaults to the isolated candidate bank.')
    parser.add_argument('--render',action='store_true',help='Reimport and inspect LOD0/2 in the local review directory.')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[])
    names=args.names or ['machine-tool-skid','bagged-regolith-pallet','torn-hull-strip']
    out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
    for name in names:
        F.reset_scene();ship=build(name);aid='cargo-'+name
        description=dict(C.PAYLOAD+C.HANDLING+C.AFTERMATH)[name]
        export_asset(ship,str(out),aid,'cargo',description,collision_boxes=ship.solids,tags=['cargo-quality-review','candidate','forge'])
        if args.render:
            for lod in (0,2):
                render_glb_preview(str(out/f'{aid}_lod{lod}.glb'),str(REVIEW/f'{name}-candidate-lod{lod}.png'),width=900,height=650,samples=48)
        print('CARGO_QUALITY_EXPORTED '+name,flush=True)
    assets=[]
    for name in ['machine-tool-skid','bagged-regolith-pallet','torn-hull-strip']:
        p=out/f'cargo-{name}.json'
        if p.exists():assets.append(json.load(open(p)))
    manifest={'schemaVersion':1,'status':'review candidates; canonical original36 outputs preserved locally',
              'source':'tools/blender/forge/asset_bank_cargo_quality.py',
              'dependencies':['tools/blender/forge/asset_bank_cargo.py','tools/blender/forge/forge.py','tools/blender/forge/forge_export.py','tools/blender/forge/asset_bank_export.py','tools/blender/forge/asset_bank_bounds.py','tools/blender/forge/asset_bank_cost.py','tools/blender/forge/motion.py','tools/blender/forge/textures/'],
              'modelDirectory':os.path.relpath(out,ROOT),
              'generation':'blender -b -t 2 --python tools/blender/forge/asset_bank_cargo_quality.py --',
              'canonicalReplacementGeneration':'After the original36 batch: blender -b -t 2 --python tools/blender/forge/asset_bank_cargo_quality.py -- --out assets/models/asset-bank/cargo',
              'styleReferences':['tools/blender/forge/ships/place_cargo_pod_standard.py','tools/blender/forge/ships/place_dead_hulk.py'],
              'reviewScope':'Actual GLB reimports at near and 96px small-object scale, including authored LOD2. No claim of live-game material or placement acceptance.',
              'assets':assets}
    with open(ROOT/'design/asset-bank/cargo-quality-review.json','w')as f:json.dump(manifest,f,indent=2);f.write('\n')
