"""Original P14 Brood anatomy, built through Forge's mesh/material/export contract.

Capsule scutes are solid contact anatomy, never a convex fill over the jaw/fork.
Rigid inner membrane vanes and dorsal scales move inside those same planar
solids. No skinning, transparent tissue, engine imitation or imported meshes.
"""
import argparse
import copy
import inspect
import json
import math
from pathlib import Path
import subprocess
import sys

import bpy
import bmesh
from mathutils import Vector, Euler

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
import forge as F
import forge_export as E

# Four shared opaque biological finishes. Use the standard Forge semantic and
# calibrated material pipeline, but no manufactured panel/machinery texture.
COLORS = {'carapace':'#795168','chitin':'#99838f','membrane':'#31283e','glow_brood':'#c4a7dd'}
FINISHES = {
    'carapace':dict(role='hull',rough=.60,metal=0,tex=None),
    'chitin':dict(role='ceramic',rough=.72,metal=0,tex=None),
    'membrane':dict(role='ceramic',rough=.78,metal=0,tex=None),
    'glow_brood':dict(role='signal',rough=.4,metal=0,tex=None,emit=.85),
}
F.FINISHES.update(FINISHES)
E.MATERIAL_NAMES.update({'carapace':'Material_Hull_BroodCarapace','chitin':'Material_Ceramic_BroodChitin',
    'membrane':'Material_Ceramic_BroodMembrane','glow_brood':'Material_Emissive_BroodSignal'})
E.MESH_NAMES.update({'carapace':'Carapace','chitin':'Chitin','membrane':'Membrane','glow_brood':'Signal'})
SEAL_HELPER = 'scripts/lib/broodSourceSeal.mjs'


def load_contract(id):
    script = "import {BROOD_BODY_CONTRACTS as c} from './src/data/broodBodies.js';console.log(JSON.stringify(c[process.argv[1]]||null))"
    contract=json.loads(subprocess.check_output(['node','--input-type=module','-e',script,id],cwd=ROOT,text=True))
    if contract is None:raise ValueError('No canonical Brood body '+id)
    return contract


def source_seal(contract, source_file, builder, animation_builder):
    # Record the real local Python modules imported by this particular build,
    # rather than every sibling species merely present in the source tree.
    files={Path(__file__).resolve(),Path(source_file).resolve(),
           Path(inspect.getsourcefile(builder)).resolve(),Path(inspect.getsourcefile(animation_builder)).resolve()}
    for module in tuple(sys.modules.values()):
        file=getattr(module,'__file__',None)
        if not file:continue
        path=Path(file).resolve()
        if path.is_relative_to(HERE) and path.suffix=='.py':files.add(path)
    paths=sorted({str(path.relative_to(ROOT)).replace('\\','/') for path in files}|{SEAL_HELPER})
    generator={name:str(Path(file).resolve().relative_to(ROOT)).replace('\\','/')
        for name,file in {'entry':source_file,'builder':inspect.getsourcefile(builder),
                          'animation':inspect.getsourcefile(animation_builder)}.items()}
    payload={'body':contract,'files':paths,'generator':generator}
    # Node is the sole canonical number/key serializer in Python and JS. The
    # contract is a typed input, not a hash of unrelated entries in its JS file.
    script="import {createBroodSourceSeal} from './scripts/lib/broodSourceSeal.mjs';let s='';for await(const c of process.stdin)s+=c;const p=JSON.parse(s);console.log(JSON.stringify(createBroodSourceSeal(p.body,p.files,{generator:p.generator})))"
    return json.loads(subprocess.check_output(['node','--input-type=module','-e',script],
        input=json.dumps(payload,allow_nan=False),cwd=ROOT,text=True))


def chitin_images():
    """One deterministic 256px normal/ORM pair shared by both biological skins.

    Sparse pores interrupt long, gently curved growth lamellae. Height affects
    only real normals; ORM affects roughness only. No albedo grain, painted
    lighting, industrial paneling, body-specific bake or transparent layer.
    Four WU per Forge UV tile; relief stays below six thousandths of a WU.
    """
    names=['BroodChitin_Normal_v1','BroodChitin_ORM_v1']
    if all(bpy.data.images.get(n) for n in names):return [bpy.data.images[n] for n in names]
    n=256;heights=[];rough=[]
    pores=[(.12,.18),(.34,.74),(.59,.41),(.81,.88),(.92,.24),(.46,.08)]
    for y in range(n):
        v=y/n
        for x in range(n):
            u=x/n
            h=.0014*math.cos(2*math.pi*(12*u+.55*math.sin(2*math.pi*v)))
            h+=.0003*math.cos(2*math.pi*(41*u-.8*math.cos(2*math.pi*v)))
            pore=0
            for a,b in pores:
                dx=min(abs(u-a),1-abs(u-a));dy=min(abs(v-b),1-abs(v-b))
                pore+=math.exp(-(dx*dx+dy*dy)/.00008)
            heights.append(h-.0035*pore)
            rough.append(min(1,max(.83,.93+.04*math.sin(2*math.pi*(2*u+v))+.025*pore)))
    normal=[];orm=[];step=4/n
    for y in range(n):
        for x in range(n):
            dx=(heights[y*n+(x+1)%n]-heights[y*n+(x-1)%n])/(2*step)
            dy=(heights[((y+1)%n)*n+x]-heights[((y-1)%n)*n+x])/(2*step)
            v=Vector((-dx,-dy,1)).normalized()
            normal.extend((v.x*.5+.5,v.y*.5+.5,v.z*.5+.5,1))
            orm.extend((1,rough[y*n+x],0,1))
    result=[]
    for name,pixels in zip(names,[normal,orm]):
        image=bpy.data.images.new(name,width=n,height=n,alpha=False)
        image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(pixels);image.update();image.pack()
        result.append(image)
    return result


def apply_chitin_surface(ship):
    normal,orm=chitin_images()
    for finish in ('carapace','chitin'):
        mat=ship.mat(finish);nt=mat.node_tree;bsdf=nt.nodes.get('Principled BSDF')
        uv=nt.nodes.new('ShaderNodeUVMap')
        texn=nt.nodes.new('ShaderNodeTexImage');texn.image=normal
        texo=nt.nodes.new('ShaderNodeTexImage');texo.image=orm
        for tex in (texn,texo):nt.links.new(uv.outputs['UV'],tex.inputs['Vector'])
        nmap=nt.nodes.new('ShaderNodeNormalMap');nmap.inputs['Strength'].default_value=.8
        nt.links.new(texn.outputs['Color'],nmap.inputs['Color']);nt.links.new(nmap.outputs['Normal'],bsdf.inputs['Normal'])
        sep=nt.nodes.new('ShaderNodeSeparateColor');nt.links.new(texo.outputs['Color'],sep.inputs['Color'])
        mul=nt.nodes.new('ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=FINISHES[finish]['rough']
        nt.links.new(sep.outputs['Green'],mul.inputs[0]);nt.links.new(mul.outputs[0],bsdf.inputs['Roughness'])
        # Metallic stays explicitly zero; the packed B channel is also zero.
        group=nt.nodes.new('ShaderNodeGroup');group.node_tree=F._gltf_output_group()
        nt.links.new(sep.outputs['Red'],group.inputs['Occlusion'])
        mat['broodSurfaceFamily']='chitin-lamella-v1'


def pos(p):
    return (p[0],-p[2],p[1])


def convex_hull(points):
    pts=sorted(set(points))
    def cross(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lo=[];hi=[]
    for p in pts:
        while len(lo)>=2 and cross(lo[-2],lo[-1],p)<=0:lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi)>=2 and cross(hi[-2],hi[-1],p)<=0:hi.pop()
        hi.append(p)
    return lo[:-1]+hi[:-1]


def outline(primitive,count):
    if primitive['kind']=='convex':
        return normalize_convex_vertices(primitive.get('vertices'))
    if primitive['kind']=='obb':
        p=primitive;c=math.cos(p['rot']);s=math.sin(p['rot'])
        points=[]
        for i in range(count):
            a=i*2*math.pi/count;u=math.cos(a);v=math.sin(a)
            scale=1/max(abs(u),abs(v));x=u*scale*p['hx'];z=v*scale*p['hz']
            points.append((p['x']+c*x-s*z,p['z']+s*x+c*z))
        points.extend([(p['x']+c*x-s*z,p['z']+s*x+c*z) for x,z in [(-p['hx'],-p['hz']),(p['hx'],-p['hz']),(p['hx'],p['hz']),(-p['hx'],p['hz'])]])
        return convex_hull(points)
    p=primitive
    return convex_hull([(x+math.cos(i*2*math.pi/count)*p['r'],z+math.sin(i*2*math.pi/count)*p['r'])
                       for x,z in [(p['ax'],p['az']),(p['bx'],p['bz'])] for i in range(count)])


def normalize_convex_vertices(vertices):
    """Offline equivalent of convexProxyGeometry.normalizeConvexProxyVertices.

    Preserve each authored subpart, never hull-fit or repair a concave input.
    Canonical winding/start and tolerance match the shared JS schema exactly.
    """
    if not isinstance(vertices,list) or not 3<=len(vertices)<=12:
        raise ValueError('convex requires 3..12 vertices')
    if any(not isinstance(v,(list,tuple)) or len(v)!=2 or any(
            isinstance(n,bool) or not isinstance(n,(int,float)) or not math.isfinite(n) or abs(n)>1e6
            for n in v) for v in vertices):
        raise ValueError('convex coordinates must be finite bounded [x,z] pairs')
    extent=max(max(v[i] for v in vertices)-min(v[i] for v in vertices) for i in (0,1))
    epsilon=64*sys.float_info.epsilon*extent*extent
    def cross(a,b,p):return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
    turn=cross(*vertices[:3])
    if not abs(turn)>epsilon:raise ValueError('degenerate convex piece')
    winding=1 if turn>0 else -1
    for i,a in enumerate(vertices):
        b=vertices[(i+1)%len(vertices)]
        for j,p in enumerate(vertices):
            if j in (i,(i+1)%len(vertices)):continue
            if not winding*cross(a,b,p)>epsilon:raise ValueError('nonconvex or degenerate convex piece')
    result=[tuple(0 if n==0 else n for n in v) for v in vertices]
    if winding<0:result.reverse()
    first=min(range(len(result)),key=result.__getitem__)
    return result[first:]+result[:first]


def shell(ship,name,poly,rings,finish='carapace',ring_finishes=None,rounded=False):
    """Closed convex plan shell; authored concentric sections produce domed scutes."""
    cx=sum(p[0] for p in poly)/len(poly);cz=sum(p[1] for p in poly)/len(poly)
    bm=bmesh.new();rows=[]
    finishes=list(dict.fromkeys([finish]+list((ring_finishes or {}).values())))
    for scale,y in rings:
        row=[]
        for x,z in poly:
            dx=x-cx;dz=z-cz
            if rounded and scale<.98:
                hx=max(abs(p[0]-cx) for p in poly);hz=max(abs(p[1]-cz) for p in poly)
                k=max(abs(dx/hx),abs(dz/hz))/math.hypot(dx/hx,dz/hz)
                dx*=k;dz*=k
            row.append(bm.verts.new(pos((cx+dx*scale,y,cz+dz*scale))))
        rows.append(row)
    bm.faces.new(list(reversed(rows[0])))
    for i in range(len(rows)-1):
        for j in range(len(poly)):
            f=bm.faces.new([rows[i][j],rows[i][(j+1)%len(poly)],rows[i+1][(j+1)%len(poly)],rows[i+1][j]])
            f.material_index=finishes.index((ring_finishes or {}).get(i,finish))
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    obj=F._new_object(name,bm,ship.slots(finishes),bevel=0,smooth_angle=55)
    return ship.add(obj)


def capsule(ax,az,bx,bz,r):
    return dict(kind='capsule',ax=ax,az=az,bx=bx,bz=bz,r=r)


def patch(ship,name,p,y,height,finish='chitin',count=16):
    return shell(ship,name,outline(p,count),[(.90,y),(1,y+.08),(.78,y+height*.64),(.10,y+height)],finish)


def conformal_plate(ship,host,name,poly,finish='chitin',lift=.09):
    """A tessellated overlapping scute projected onto the actual host skin."""
    coarse=ship.lod==2 and ship.id=='brood_mite' and not name.startswith('SensorySeam')
    if coarse:lift=max(lift,.35)
    bm=bmesh.new();verts=[bm.verts.new((x,-z,0)) for x,z in poly]
    if coarse:
        center=bm.verts.new((sum(v.co.x for v in verts)/len(verts),sum(v.co.y for v in verts)/len(verts),0))
        for i in range(len(verts)):bm.faces.new((verts[i],verts[(i+1)%len(verts)],center))
    else:
        bm.faces.new(verts);bmesh.ops.triangulate(bm,faces=list(bm.faces))
        if not name.startswith('SensorySeam'):
            bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
    xs=[v.co.x for v in bm.verts];x0=min(xs);span=max(xs)-x0
    for v in bm.verts:
        hit,p,_,_=host.ray_cast(Vector((v.co.x,v.co.y,100)),Vector((0,0,-1)))
        if not hit:raise ValueError(name+' leaves its host shell')
        # Rear roots merge into the skin; only the forward cutting lip stands proud.
        t=(v.co.x-x0)/max(span,1e-6)
        u=min(1,t/.20)
        relief=lift if coarse or name.startswith('SensorySeam') else lift*(.85+.15*u*u*(3-2*u))
        v.co.z=p.z+relief
    faces=list(bm.faces);res=bmesh.ops.extrude_face_region(bm,geom=faces)
    for v in res['geom']:
        if isinstance(v,bmesh.types.BMVert):v.co.z-=lift+.035
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    return ship.add(F._new_object(name,bm,ship.slots([finish]),bevel=0,smooth_angle=45))


def scute_outline(p,count):
    raw=outline(p,count);dx=p['bx']-p['ax'];dz=p['bz']-p['az'];length=dx*dx+dz*dz
    taper=.5 if p['r']<1 else .30
    shaped=[]
    for x,z in raw:
        t=max(0,min(1,((x-p['ax'])*dx+(z-p['az'])*dz)/length))
        cx=p['ax']+dx*t;cz=p['az']+dz*t;factor=1-taper*t
        shaped.append((cx+(x-cx)*factor,cz+(z-cz)*factor))
    return convex_hull(shaped)


def scale_outline(x,z,width,span,steps=7):
    front=[];rear=[]
    for i in range(steps):
        u=-1+2*i/(steps-1)
        front.append((x+width*(.75-.5*u*u),z+span*u))
        rear.append((x-width*(.7-.22*u*u),z+span*u))
    return front+list(reversed(rear))


def surface_rib(ship,host,name,path,width=.05,finish='chitin'):
    points=[]
    for x,z in path:
        hit,p,_,_=host.ray_cast(Vector((x,-z,100)),Vector((0,0,-1)))
        if hit:points.append((x,-z,p.z+.025))
    if len(points)>1:return F.sweep(ship,name,points,width,width*.8,material=finish,bevel=0)


def new_ship(id,lod=0,contract=None):
    F.reset_scene()
    s=F.Ship(id,COLORS);s.contract=copy.deepcopy(contract if contract is not None else load_contract(id));s.lod=lod
    apply_chitin_surface(s)
    for name,socket in s.contract['sockets'].items():
        s.socket(name,pos(socket['position']),pos(socket['forward']))
    s.socket_names=list(s.sockets)
    return s


def bite_outline(poly):
    """Small true inward cutting teeth, always inside the native capsule."""
    cx=sum(x for x,z in poly)/len(poly);cz=sum(z for x,z in poly)/len(poly)
    result=[]
    for i,a in enumerate(poly):
        b=poly[(i+1)%len(poly)];result.append(a)
        length=math.hypot(b[0]-a[0],b[1]-a[1])
        if length>1 and abs((a[1]+b[1])/2)<abs(cz):
            for t in (.19,.25,.31,.49,.55,.61,.79,.85,.91):
                x=a[0]+(b[0]-a[0])*t;z=a[1]+(b[1]-a[1])*t
                if t in (.25,.55,.85):
                    dx=cx-x;dz=cz-z;r=math.hypot(dx,dz);x+=dx/r*.075;z+=dz/r*.075
                result.append((x,z))
    return result


def anatomy(ship):
    """Fixed scutes retain exact canonical capsule/OBB footprints at every tier."""
    c=ship.contract;n=[20,14,10][ship.lod];mite=c['id']=='brood_mite'
    for p in c['collision']['primitives']:
        name=p['id']; poly=outline(p,n)
        if 'scute' in name:
            poly=scute_outline(p,n)
            rings=[(.94,-.25),(1,0),(.90,.2),(.30,.32)]
            shell(ship,name,poly,rings,'carapace',{0:'membrane'})
        elif 'fang' in name:
            poly=bite_outline(poly) if ship.lod==0 else poly
            rings=[(.96,-.22),(1,0),(.76,.13),(.10,.42)]
            shell(ship,name,poly,rings,'chitin',{0:'membrane'})
        elif 'jaw' in name:
            rings=[(.94,-.5),(1,0),(.87,.7),(.40,1.12)]
            shell(ship,name,poly,rings,'carapace')
        elif 'prong' in name:
            rings=[(.96,-.8),(1,0),(.88,1.2),(.48,2.15)]
            shell(ship,name,poly,rings,'carapace')
        elif name=='neck_shield':
            # The broad transverse bridge is behind the fork, a continuous bony
            # occipital plate. Its four corners are visible solid anatomy.
            rings=[(.98,-.9),(1,0),(.9,1.15),(.22,2)]
            shell(ship,name,poly,rings,'carapace',{0:'membrane'},rounded=True)
        else:
            rings=[(.96,-.6 if mite else -1),(1,0),(.85,1.15 if mite else .9),(.35,1.82 if mite else 1.55)]
            shell(ship,name,poly,rings,'carapace',{0:'membrane'})


def membrane_pair(ship):
    n=[20,14,10][ship.lod];mite=ship.contract['id']=='brood_mite'
    for rig in ship.contract['motion']['rigs'][:2]:
        p=next(p for p in ship.contract['collision']['primitives'] if p['id']==rig['support'])
        raw=scute_outline(p,n);cx=(p['ax']+p['bx'])/2;cz=(p['az']+p['bz'])/2
        poly=[(cx+(x-cx)*.78,cz+(z-cz)*.78) for x,z in raw]
        start=len(ship.objects)
        vane=shell(ship,rig['id']+'_Vane',poly,[(1,.26),(.98,.38),(.45,.5 if mite else .62)],'membrane')
        # Radiating ribs follow the actual raised tissue, not floating bars.
        for i,t in enumerate(([.18,.30,.44,.59,.74] if ship.lod==0 else [.55] if ship.lod==1 else [])):
            endx=p['ax']+(p['bx']-p['ax'])*t
            endz=p['az']+(p['bz']-p['az'])*t
            side=1 if p['az']>0 else -1
            startx=p['ax']+(p['bx']-p['ax'])*.20
            startz=p['az']+(p['bz']-p['az'])*.20
            path=[]
            for j in range(6):
                u=j/5;path.append((startx+(endx-startx)*u, startz+(endz-startz)*u+side*.24*u))
            surface_rib(ship,vane,rig['id']+'_Vein'+str(i),path,.055 if mite else .085,'membrane')
        ship.motion_group(rig['id'],pos(rig['pivot']),objects=ship.objects[start:])


def signals(ship):
    mite=ship.contract['id']=='brood_mite'
    host=next(o for o in ship.objects if o.name==('dorsal_lobe' if mite else 'neck_shield'))
    x=.55 if mite else 2.7
    for side in (-1,1):
        z=side*(.60 if mite else 1.1)
        seam=conformal_plate(ship,host,'SensorySeam'+str(side),
            scale_outline(x,z,.12,.25,5 if ship.lod==0 else 3),'glow_brood',.035)
        ship.hook_part('HOOK_BROOD_SIGNAL',seam)


def brood_mite(lod=0,contract=None):
    s=new_ship('brood_mite',lod,contract);anatomy(s);membrane_pair(s)
    n=[16,12,8][lod]
    # Overlapping curved scutes are seated to the real shell surface. The seams
    # cross the three lobes as growth lines, rather than arbitrary raised studs.
    host=next(o for o in s.objects if o.name=='dorsal_lobe')
    for i,x in enumerate(([-3.7,-2.1,-.7] if lod==0 else [-1.8])):
        poly=scale_outline(x,0,.85,1.6,7 if lod==0 else 5 if lod==1 else 3)
        conformal_plate(s,host,'DorsalScute'+str(i),poly,'chitin',.10)
    for side,tag in [(-1,'port'),(1,'starboard')]:
        host=next(o for o in s.objects if o.name==tag+'_jaw')
        for i,t in enumerate(([.12,.4,.69] if lod==0 else [.5])):
            x=-.2+2.7*t;z=side*(1.7+.7*t)
            poly=scale_outline(x,z,.6,.8,7 if lod==0 else 5 if lod==1 else 3)
            conformal_plate(s,host,'JawScute'+tag+str(i),poly,'chitin',.095)
    signals(s)
    return s


def brood_charger(lod=0,contract=None):
    s=new_ship('brood_charger',lod,contract);anatomy(s);membrane_pair(s);n=[20,14,10][lod]
    rig=s.contract['motion']['rigs'][2];start=len(s.objects)
    # Three overlapping dorsal tergites telescope forward over the unbroken
    # lower keel during the windup. Neither fork nor abdomen collider moves.
    for i,(a,b,r) in enumerate([(-7.2,-6.4,1.4),(-5.7,-4.8,1.7),(-4.0,-2.5,1.9)]):
        patch(s,'AbdomenTergite'+str(i),capsule(a,0,b,0,r),1.15,.85+i*.25,'carapace',n)
    s.motion_group(rig['id'],pos(rig['pivot']),objects=s.objects[start:])
    for side,tag in [(-1,'port'),(1,'starboard')]:
        host=next(o for o in s.objects if o.name==tag+'_prong')
        for i,t in enumerate(([.1,.4,.72] if lod==0 else [.25,.65] if lod==1 else [.45])):
            x=2.4+4*t;z=side*(5.9+.1*t)
            poly=scale_outline(x,z,.75,1.52,7 if lod==0 else 5)
            conformal_plate(s,host,'HeadScute'+tag+str(i),poly,'chitin',.14)
    # Dorsal tether focus sits on the bone bridge, a solid load-bearing saddle.
    conformal_plate(s,next(o for o in s.objects if o.name=='neck_shield'),'DorsalSaddle',scale_outline(1.3,0,.8,1.05,7 if lod==0 else 5),'chitin',.14)
    signals(s)
    return s


def brood_export_metadata(ship,doc):
    """Truthful optional metadata for organic builders; legacy defaults unchanged.

    brood_hooks=[] explicitly means no hook geometry; None is not a hook list.
    brood_surface_treatment=None omits a claim, while a dict describes the actual
    shared treatment. Geometry and source seals remain owned by the usual path.
    """
    hooks=copy.deepcopy(getattr(ship,'brood_hooks',[
        'LOD'+str(lod)+'_HOOK_BROOD_SIGNAL_Signal' for lod in (0,1,2)]))
    if not isinstance(hooks,list) or any(not isinstance(h,str) or not h for h in hooks) or len(set(hooks))!=len(hooks):
        raise ValueError('brood_hooks must be a unique list of exact render mesh names')
    nodes=doc.get('nodes',[]);meshes=doc.get('meshes',[])
    actual={n.get('name') for n in nodes if 'HOOK_BROOD_SIGNAL' in n.get('name','')}
    if actual!=set(hooks):raise ValueError('brood_hooks must match the real exported Brood signal hook geometry')
    for hook in hooks:
        found=[n for n in nodes if n.get('name')==hook]
        if len(found)!=1:raise ValueError('Brood hook must name exactly one node: '+hook)
        node=found[0];index=node.get('mesh');extras=node.get('extras',{})
        if not isinstance(index,int) or not 0<=index<len(meshes) or extras.get('nonRender') or extras.get('collision'):
            raise ValueError('Brood hook must name a real render mesh: '+hook)
        if not meshes[index].get('primitives'):raise ValueError('Brood hook has no geometry: '+hook)
    treatment=copy.deepcopy(getattr(ship,'brood_surface_treatment',{
        'schema':'brood-chitin-lamella-v1','sharedImages':['BroodChitin_Normal_v1','BroodChitin_ORM_v1'],
        'tileWU':4,'maxHeightWU':.0052,'normalStrength':.8,'albedoTexture':False}))
    result={'hooks':hooks}
    if treatment is not None:
        if not isinstance(treatment,dict) or not isinstance(treatment.get('schema'),str) or not treatment['schema']:
            raise ValueError('brood_surface_treatment needs a named schema, or None')
        json.dumps(treatment,allow_nan=False)
        if 'sharedImages' in treatment:
            names=treatment['sharedImages']
            if not isinstance(names,list) or any(not isinstance(n,str) or not n for n in names) or len(set(names))!=len(names):
                raise ValueError('sharedImages must be a unique image-name list')
            if set(names)!={image.get('name') for image in doc.get('images',[])}:
                raise ValueError('sharedImages must match the exported image names')
        result['surfaceTreatment']=treatment
    return result


def _export_tiers(id,out,evidence_dir=None,motions_dir=None,*,builder,contract,animation_builder,source_file):
    """Author each real tier, then batch by finish/rig using Forge without decimation."""
    if not callable(builder) or not callable(animation_builder):raise TypeError('Explicit body and animation builders are required')
    canonical=copy.deepcopy(contract)
    def build(lod):
        ship=builder(lod,copy.deepcopy(canonical))
        if ship.id!=id or ship.contract!=canonical:raise ValueError('Builder changed the individual body contract')
        return ship
    first=build(0).finish();contract=first.contract
    # Each tier rebuilds in a separate temporary .blend because factory reset
    # prevents accidental geometry bleed. Append only exported tier objects.
    evidence_dir=evidence_dir or out;motions_dir=motions_dir or out
    evidence_dir.mkdir(parents=True,exist_ok=True);motions_dir.mkdir(parents=True,exist_ok=True)
    scratch=evidence_dir/(id+'-tiers');scratch.mkdir(parents=True,exist_ok=True)
    for lod in (0,1,2):
        s=first if lod==0 else build(lod).finish()
        E._rename_materials(s)
        root=E._root_empty('SF_'+id.upper()+'_V01_ROOT',{})
        parts=E._lod_meshes(s,0,'LOD'+str(lod))
        for o in parts:
            if o.parent is None:o.parent=root
        E._mount_motion_pivots(s,root)
        E._add_sockets(s,root)
        E._export([root]+list(root.children_recursive),str(scratch/('lod'+str(lod)+'.glb')))
    # Rebuild editable authoring source, then import the three genuinely authored
    # tiers into the export scene. Common pivot names are consolidated explicitly.
    s=build(0).finish(); source=list(s.objects);pivots=list(s.motion_pivots.values())
    for o in source:o.hide_set(True);o.hide_render=True
    root=E._root_empty('SF_'+id.upper()+'_V01_ROOT',{})
    tier_meshes=[]
    for lod in (0,1,2):
        before=set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(scratch/('lod'+str(lod)+'.glb')))
        imported=list(set(bpy.context.scene.objects)-before)
        for o in imported:
            if o.type!='MESH':continue
            # Names receive Blender uniqueness suffixes when the source still
            # exists. Contract names derive from imported mesh names exactly.
            name=o.name.split('.')[0]
            old_parent=o.parent;world=o.matrix_world.copy()
            rig=next((r for r in contract['motion']['rigs'] if '_'+r['node']+'_' in name),None)
            o.parent=s.motion_pivots[rig['id']] if rig else root
            o.matrix_world=world;o.name=name
            for i,mat in enumerate(o.data.materials):
                key=mat.get('forgeKey')
                if key in s._mats:o.data.materials[i]=s.mat(key)
            tier_meshes.append(o)
        for o in imported:
            if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
    E._rename_materials(s);E._mount_motion_pivots(s,root);E._add_sockets(s,root)
    proxy=F.Ship('brood_collision',COLORS);proxy._mats=s._mats
    for p in contract['collision']['primitives']:
        o=shell(proxy,'COLLISION_'+p['id'],outline(p,24),[(1,contract['collision']['yMin']),(1,contract['collision']['yMax'])],'membrane')
        F.finish_object(o);o.parent=root;o.hide_render=True
        o['collision']=True;o['nonRender']=True;o['spaceface']={'collision':True,'shape':p['kind'],'compoundMember':p['id']}
    filename=out/(id+'_v01.glb')
    E._export([root]+list(root.children_recursive),str(filename))
    E._stamp(str(filename),{k:contract[k] for k in ('assetId','partId')},'lod0')
    # Animation builders may key Blender poses. Build only after geometry export,
    # then discover all imported dependencies before stamping the final source.
    bank=animation_builder(s,contract['assetId'])
    contract.update(source_seal(canonical,source_file,builder,animation_builder))
    def stamp(doc):
        contract.pop('surfaceTreatment',None)
        contract.update(brood_export_metadata(s,doc))
        doc['asset'].setdefault('extras',{})['broodBody']=contract
        scene=doc['scenes'][doc.get('scene',0)];scene.setdefault('extras',{})['broodBody']=contract
        factor_only=[m['name'] for m in doc.get('materials',[]) if not m.get('normalTexture') and not m.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')]
        for target in [doc['asset']['extras']['spacefaceAsset'],scene['extras']['spacefaceAsset']]:
            target['factorOnlyMaterials']=factor_only
        for node in doc['nodes']:
            name=node.get('name','')
            if name==root.name:
                node.setdefault('extras',{})['broodBody']=contract
                node['extras']['spacefaceAsset']['factorOnlyMaterials']=factor_only
            if name in contract['sockets']:
                node['extras']['spaceface']={**node['extras']['spaceface'],**{k:contract['sockets'][name][k] for k in ('forward','role')}}
    doc=E.patch_glb_json(str(filename),stamp)
    report={'id':id,'file':str(filename),'sourceSha256':contract['sourceSha256'],'trianglesByLod':[],
            'drawsByLod':[],'materials':len(doc.get('materials',[])),'colliders':len(contract['collision']['primitives'])}
    for lod in range(3):
        ps=[p for node in doc['nodes'] if node.get('name','').startswith('LOD'+str(lod)+'_') and 'mesh' in node
            for p in doc['meshes'][node['mesh']]['primitives']]
        report['drawsByLod'].append(len(ps));report['trianglesByLod'].append(sum(doc['accessors'][p['indices']]['count']//3 for p in ps))
    (evidence_dir/(id+'-source-report.json')).write_text(json.dumps(report,indent=2)+'\n')
    print('[brood] '+json.dumps(report),flush=True)
    # Bank is keyed on the real source pivots and sealed against final GLB bytes.
    # bank was prepared before sealing; bake only after the final source bytes exist.
    motion=bank.bake([str(filename)],out_path=str(motions_dir/(id.replace('_','-')+'.motion.json')))
    for binding in motion['bindings']:binding['requiredAtLod']=[0,1,2]
    (motions_dir/(id.replace('_','-')+'.motion.json')).write_text(json.dumps(motion,indent=1)+'\n')
    # Factory reset returns a clean, editable LOD0 rig for source/art evidence.
    return build(0).finish(),filename


def save_source(s,out):
    if getattr(s,'brood_source_marker_preview',False):
        source_root=E._root_empty('SF_'+s.id.upper()+'_AUTHORING_ROOT',{'candidateSource':True})
        E._mount_motion_pivots(s,source_root);E._add_sockets(s,source_root)
        for ob in s.objects:
            if not ob.get('forge_motion'):
                world=ob.matrix_world.copy();ob.parent=source_root;ob.matrix_world=world
    for o in s.objects:
        if o.get('forge_motion'):
            world=o.matrix_world.copy();o.parent=s.motion_pivots[o['forge_motion']];o.matrix_world=world
    for m in s._mats.values():m.diffuse_color=m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value
    bpy.context.scene['broodBody']=json.dumps(s.contract)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(s.id+'.blend')),compress=True)


def pose_source(s,phase):
    progress=s.contract['motion']['poses'][phase]
    for r in s.contract['motion']['rigs']:
        pivot=s.motion_pivots[r['id']];pivot.location=pos(r['pivot']);pivot.rotation_euler=(0,0,0)
        if 'foldRadians' in r:pivot.rotation_euler.x=r['foldRadians']*progress
        if 'translation' in r:pivot.location+=Vector(pos([v*progress for v in r['translation']]))
    bpy.context.view_layer.update()


def render_review(s,out,phase='approach'):
    scene=bpy.context.scene
    for o in list(scene.objects):
        if o.type in ('CAMERA','LIGHT'):bpy.data.objects.remove(o,do_unlink=True)
    pose_source(s,phase);scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
    scene.cycles.use_denoising=False;scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    world=bpy.data.worlds.new('BroodReview');scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.028,.055,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.55
    for name,rot,energy,color in [('Key',(.35,-.4,-.4),2.5,(.91,.83,1)),('Fill',(-.6,.9,2.2),1.2,(.6,.75,1))]:
        data=bpy.data.lights.new(name,'SUN');data.energy=energy;data.angle=.15;data.color=color
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.rotation_euler=rot
    camera=bpy.data.objects.new('ReviewCamera',bpy.data.cameras.new('ReviewCamera'));scene.collection.objects.link(camera)
    scene.camera=camera;camera.data.type='ORTHO';span=s.contract['radius']
    for view,offset in [('top',(.001,0,2.4)),('chase',(1,-1.5,2.2))]:
        target=Vector((0,0,.4));camera.location=target+Vector(offset)*span
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=span*2.2
        scene.render.filepath=str(out/(s.id+'-'+phase+'-'+view+'.png'));bpy.ops.render.render(write_still=True)


def main(id,*,builder,animation_builder,source_file,contract=None):
    parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path,default=ROOT/'.devshots'/id)
    parser.add_argument('--render',action='store_true');parser.add_argument('--live',action='store_true')
    parser.add_argument('--contract',type=Path)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.contract:
        if contract is not None:raise ValueError('Supply one explicit body contract')
        contract=json.loads(args.contract.read_text())
    contract=copy.deepcopy(contract if contract is not None else load_contract(id))
    if contract.get('id')!=id:raise ValueError('Contract identity does not match selected body')
    if args.live and contract!=load_contract(id):raise ValueError('Live export requires the exact canonical registered body')
    out=ROOT/'assets/ships/parts/wholeships' if args.live else args.out;out.mkdir(parents=True,exist_ok=True)
    motions=ROOT/'assets/ships/motions' if args.live else args.out
    s,_=_export_tiers(id,out,args.out,motions,builder=builder,contract=contract,
        animation_builder=animation_builder,source_file=source_file)
    save_source(s,args.out)
    if args.render:
        render_review(s,args.out,'approach');render_review(s,args.out,'windup')
