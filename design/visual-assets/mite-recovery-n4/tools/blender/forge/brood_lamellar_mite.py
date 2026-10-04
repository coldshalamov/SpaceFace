"""Lamellar Brood Mite production-candidate builder through the existing Forge seam.
NEW recovery candidate N4 from verified R28. Later changes are newly authored, not recovered Surface3 bytes.
Every LOD is rebuilt from authored sections.
No gameplay timing, mass, radius, contact endpoints or dorsal anchor changes.
"""
import bpy,bmesh,math,json,hashlib,sys,copy
from pathlib import Path
from mathutils import Vector
import forge as F
import brood_kit as K
from brood_anatomy_trim import apply_anatomy_trim

def build(lod,contract):
    if lod not in (0,1,2):raise ValueError('Explicit authored LOD 0, 1 or 2 required')
    bpy.ops.wm.read_factory_settings(use_empty=True)

    def linear(c): return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
    def material(name,hexcol,rough,coat=0):
        m=bpy.data.materials.new(name); m.use_nodes=True
        p=m.node_tree.nodes.get('Principled BSDF')
        rgb=tuple(linear(int(hexcol[i:i+2],16)/255) for i in (0,2,4))
        p.inputs['Base Color'].default_value=(*rgb,1)
        p.inputs['Metallic'].default_value=0
        p.inputs['Roughness'].default_value=rough
        p.inputs['Coat Weight'].default_value=coat
        p.inputs['Coat Roughness'].default_value=.23
        m.diffuse_color=(*rgb,1)
        m['physical_role']=name; m['prototype_not_runtime_finish']=True
        return m
    M={
     'shell':material('Prototype_GrownWineCarapace','5b152c',.59,.02),
     'lip':material('Prototype_LamellarEdge','854254',.58,.02),
     'soft':material('Prototype_GraphiteFlexure','251e29',.64),
     'bone':material('Prototype_DenseCuttingChitin','c8b59c',.4),
    }
    def mesh(name,verts,faces,mat='shell',smooth=False):
        me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
        ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
        me.materials.append(M[mat]); ob['anatomy_role']=name
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
        for p in me.polygons:p.use_smooth=smooth
        return ob

    def section_uv(ob,row_count,columns,layers=1):
        uv=ob.data.uv_layers.new(name='AnatomyUV')
        count=row_count*columns
        for face in ob.data.polygons:
            for li in face.loop_indices:
                idx=ob.data.loops[li].vertex_index%count
                row=idx//columns;column=idx%columns
                uv.data[li].uv=(row/max(1,row_count-1),column/max(1,columns-1))
        return ob

    def interp(rows,steps=3):
        # Local section interpolation, deliberately no global subdivision smoothing.
        out=[]
        for i in range(len(rows)-1):
            for j in range(steps):
                t=j/steps;out.append(tuple(a*(1-t)+b*t for a,b in zip(rows[i],rows[i+1])))
        out.append(rows[-1]);return out

    def smooth_rows(rows,steps=4):
        out=[]
        for i in range(len(rows)-1):
            a=rows[max(i-1,0)];b=rows[i];c=rows[i+1];d=rows[min(len(rows)-1,i+2)]
            for j in range(steps):
                t=j/steps
                out.append(tuple(.5*(2*bb+(-aa+cc)*t+(2*aa-5*bb+4*cc-dd)*t*t+(-aa+3*bb-3*cc+dd)*t*t*t) for aa,bb,cc,dd in zip(a,b,c,d)))
        out.append(rows[-1]);return out

    def swept(name,rows,mat='shell',sides=10,steps=2,shape='keel'):
        # Changing blade section on a designed centreline: width, top, lower thickness.
        sides=min(sides,[12,9,6][lod]);rows=smooth_rows(rows,max(1,min(steps,[2,2,1][lod])));vs=[];fs=[]
        for i,(x,y,z,w,h,b) in enumerate(rows):
            w=max(.005,w);h=max(.005,h);b=max(.003,b)
            p=Vector(rows[max(0,i-1)][:3]);q=Vector(rows[min(len(rows)-1,i+1)][:3])
            t=q-p;side=Vector((-t.y,t.x,0)).normalized()
            for j in range(sides):
                a=2*math.pi*j/sides;c=math.cos(a);sn=math.sin(a)
                # Tapered lenticular section with a stronger dorsal ridge, not a cylinder.
                zz=h*(max(0,sn)**.75) if sn>=0 else -b*(-sn)**.8
                if 'buried_flexure' in name:
                    t=i/(len(rows)-1)
                    envelope=math.sin(math.pi*t)**1.6
                    # Asymmetric compressed lamellae, grown into the tissue instead of separate rings.
                    fold=.032*envelope*(.65*math.sin(t*math.pi*7)+.35*math.sin(t*math.pi*11+.7))
                    zz+=fold*.55
                v=Vector((x,y,z))+side*(w+(fold if 'buried_flexure' in name else 0))*c;v.z+=zz;vs.append(tuple(v))
        for i in range(len(rows)-1):
            for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;fs.append((a,b,b+sides,a+sides))
        fs+=[tuple(reversed(range(sides))),tuple((len(rows)-1)*sides+j for j in range(sides))]
        return section_uv(mesh(name,vs,fs,mat,shape=='soft'),len(rows),sides)

    def roof(name,sections,mat='shell',thickness=.14):
        # Full closed lamella with flanged shoulders, crowned roof and concave undercut.
        # Rows are x, halfwidth, rim height, crown height, sweep of side edge.
        ys=[-1,-.975,-.89,-.79,-.65,-.055,0,.055,.65,.79,.89,.975,1]
        profile=[0,.010,.12,.265,.47,.969,1.0,.969,.47,.265,.12,.010,0]
        if lod==1:chosen=[0,2,3,5,6,7,9,10,12]
        elif lod==2:chosen=[0,2,4,6,8,10,12]
        else:chosen=list(range(13))
        ys=[ys[i] for i in chosen];profile=[profile[i] for i in chosen]
        vs=[];fs=[]
        sampled=smooth_rows(sections,[2,1,1][lod])
        for ri,(x,w,z,h,sweep) in enumerate(sampled):
            t=ri/(len(sampled)-1)
            for u,f in zip(ys,profile):
                # The shell's rim is a grown, scalloped flange, not a straight belt course.
                flank=max(0,(abs(u)-.60)/.40)
                # A broad dependent lip near the front corner, lifted behind it into an undercut.
                fall=.11*math.exp(-((t-.76)/.14)**2)*flank
                edge_sweep=.09*math.sin(math.pi*abs(u))**2*(t**5)
                asym=.025*u*math.sin(math.pi*t)
                xx=x+sweep*abs(u)**1.6+edge_sweep
                zz=z+h*f-fall+asym
                vs.append((xx,u*w,zz))
        sections=sampled
        n=len(ys);count=len(vs)
        for i,v in enumerate(vs[:]):
            t=(i//n)/max(1,len(sections)-1)
            lip_thickness=thickness*(.67+.33*math.sin(math.pi*t))
            u=ys[i%n];edge=max(0,(abs(u)-.70)/.30)
            vs.append((v[0]-.045*t**4,v[1]*(.96-.018*edge),v[2]-lip_thickness*(1-.60*edge)))
        for i in range(len(sections)-1):
            for j in range(n-1):
                a=i*n+j;fs.append((a,a+n,a+n+1,a+1));fs.append((a+count+1,a+count+n+1,a+count+n,a+count))
        perimeter=list(range(n))+[i*n+n-1 for i in range(1,len(sections))]+list(reversed(range((len(sections)-1)*n,(len(sections)-1)*n+n-1)))+[i*n for i in range(len(sections)-2,0,-1)]
        for a,b in zip(perimeter,perimeter[1:]+perimeter[:1]):fs.append((a,b,b+count,a+count))
        ob=section_uv(mesh(name,vs,fs,mat,True),len(sections),n,2)
        if name.startswith('Tergite_') and lod==0:
            crease=ob.data.attributes.new(name='crease_edge',type='FLOAT',domain='EDGE')
            for e in ob.data.edges:
                a,b=e.vertices;ja=chosen[a%n];jb=chosen[b%n]
                # Longitudinal keel and roof-to-shoulder breaks survive one controlled subdivision.
                if ja==jb and ja in (0,3,6,9,12):crease.data[e.index].value=1.0 if ja in (0,12) else .35 if ja==6 else .62
                if a//n==b//n and (a//n in (0,len(sections)-1,len(sections),2*len(sections)-1)):crease.data[e.index].value=.86
            sub=ob.modifiers.new('Curved plate with structural creases','SUBSURF');sub.levels=1;sub.render_levels=1
            bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=sub.name)
            ob['surface_construction']='Crowned roof, shoulder break, steep flank and inward lip; deliberate creases with continuous plate curvature'
        return ob

    def sleeve(name,rows,mat='shell',thickness=.12):
        rows=smooth_rows(rows,4);vs=[];fs=[];arc=15
        for inner in [False,True]:
            for i,(x,y,z,w,h,b) in enumerate(rows):
                p=Vector(rows[max(0,i-1)][:3]);q=Vector(rows[min(len(rows)-1,i+1)][:3]);t=q-p;side=Vector((-t.y,t.x,0)).normalized()
                for j in range(arc):
                    a=-.20+(math.pi+.40)*j/(arc-1)
                    c=math.cos(a);sn=math.sin(a)
                    # Tapered U-section, thick around crest, thinner lips: true carapace over soft tissue.
                    ww=max(.006,w-(thickness*.55 if inner else 0))
                    hh=max(.008,h*.60-(thickness*.65 if inner else 0))
                    v=Vector((x,y,z))+side*ww*c
                    v.z+=hh*(sn**.78 if sn>0 else sn)+(0 if not inner else -.015)
                    # At the distal open rim, scalloped lip exposes flexure instead of a perfect ring.
                    if i==len(rows)-1:v.x+=.045*math.cos(a*3)
                    vs.append(tuple(v))
        n=len(rows)*arc
        for base in [0,n]:
            for i in range(len(rows)-1):
                for j in range(arc-1):
                    a=base+i*arc+j;face=(a,a+1,a+arc+1,a+arc);fs.append(tuple(reversed(face)) if base else face)
        # Rolled open side edges and rim walls give every visible lip actual thickness.
        for i in range(len(rows)-1):
            for j in [0,arc-1]:
                a=i*arc+j;b=(i+1)*arc+j;fs.append((a,b,b+n,a+n))
        for i in [0,len(rows)-1]:
            for j in range(arc-1):
                a=i*arc+j;fs.append((a,a+n,a+n+1,a+1))
        ob=mesh(name,vs,fs,mat,True);ob['construction']='Open-ventral finite-thickness grown shell sleeve'
        return ob

    def tube(name,points,radius,mat='shell',sides=7):
        # Only used as finite anatomical spars and lamellar lip growth, never full bodies.
        rows=[]
        for i,p in enumerate(points):
            q=max(.12,math.sin(math.pi*(i+.6)/(len(points)+.2)))
            rows.append((*p,radius*q,radius*q,radius*.6*q))
        return swept(name,rows,mat,sides,2,'soft')

    # Continuous ventral tissue, buried below the lamellae rather than a visible ball.
    swept('Ventral_muscular_core',[
     (-5.12,0,-.1,.025,.03,.025),(-4.7,0,-.05,.70,.36,.28),
     (-3.6,0,.03,1.26,.65,.5),(-2.1,0,.02,1.54,.60,.55),
     (-.8,0,-.08,1.03,.45,.38),(.7,0,-.15,.71,.20,.28),
     (1.55,0,-.2,.40,.14,.2),(1.8,0,-.23,.1,.07,.07)],'soft',16,3,'soft')

    # Three stepped dorsal sections with broad visible dark interfaces.
    roof('Tergite_03_posterior_spear',[
     (-5.28,.04,.0,.04,0),(-4.68,.82,.06,.67,.06),
     (-3.86,1.58,.08,1.11,-.05),(-3.32,1.68,.09,1.17,-.16),
     (-3.20,1.59,.075,1.08,-.13),(-2.91,1.33,.025,.90,-.09)],thickness=.18)
    roof('Tergite_02_overlap_saddle',[
     (-3.12,1.60,.25,1.22,-.20),(-2.69,2.07,.11,1.43,-.56),
     (-2.01,2.18,.06,1.40,-.48),(-1.68,2.25,-.12,1.41,-.20),
     (-1.45,2.46,-.22,1.44,.08),(-1.23,1.60,-.04,1.02,-.05),(-.99,1.21,.005,.67,-.13)],thickness=.19)
    roof('Tergite_01_cranial_keel',[
     (-1.24,1.17,.20,1.30,-.25),(-.72,1.68,.06,1.65,-.25),
     (-.13,2.04,.15,1.60,-.22),(.40,2.15,.43,1.10,-.37),
     (.64,2.29,.48,.91,-.40),(.86,1.61,.40,.86,-.14),
     (1.34,.88,.08,.54,.04),(1.74,.035,-.13,.19,0)],thickness=.16)
    def shear_jaw(side,label):
        # Anatomically integrated hooked wedge. Its load ridge is its cross-section,
        # not a separate decoration. (x, lateral center, z, inside width, outside width, top, bottom)
        rows=smooth_rows([
          (1.28,2.12,.00,.20,.37,.31,.21),
          (1.58,2.28,-.015,.40,.67,.48,.27),
          (2.15,2.45,-.025,.61,.83,.62,.31),
          (2.82,2.47,-.01,.71,.80,.58,.30),
          (3.46,2.32,.01,.62,.69,.48,.25),
          (4.12,2.10,.01,.43,.49,.34,.19),
          (4.77,1.87,.005,.23,.27,.22,.12),
          (5.39,1.68,0,.095,.12,.11,.055),
          (6.0,1.60,0,.002,.002,.005,.003)
        ],[3,1,1][lod])
        profile=[(-1,.015),(-.77,.18),(-.52,.61),(-.20,.95),(.30,1),(.65,.96),(.90,.65),(1,.29),(.99,-.18),(.88,-.58),(.63,-.87),(.26,-1),(-.19,-.82),(-.61,-.45),(-.86,-.12)]
        profile_indices=[0,1,3,5,7,10,13,14] if lod==2 else list(range(len(profile)))
        profile=[profile[i] for i in profile_indices]
        vs=[];fs=[];n=len(profile)
        for x,y,z,wi,wo,h,bot in rows:
            for u,t in profile:
                yy=y+(wi*u if u<0 else wo*u)
                vs.append((x,side*yy,z+(h*t if t>=0 else bot*t)))
        for i in range(len(rows)-1):
            for j in range(n):a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
        fs.extend([tuple(reversed(range(n))),tuple((len(rows)-1)*n+j for j in range(n))])
        ob=mesh('Jaw_'+label+'_integrated_shear',vs,fs,'shell',False)
        ob.data.materials.append(M['bone'])
        # Continuous dense cutting margin, all the way along the inner sharpened edge.
        for i,face in enumerate(ob.data.polygons):
            if i<(len(rows)-1)*n:
                row=i//n;section=profile_indices[i%n];x=(rows[row][0]+rows[row+1][0])*.5
                if section in (0,13,14) or x>(4.48 if section<8 else 4.12):face.material_index=1
        section_uv(ob,len(rows),n)
        ob['construction']='One asymmetrical grown hooked wedge with an integral outer load spine and continuous cutting margin'
        return ob

    def membrane_fan(side,label):
        # A taut angular fan: broad rooted membrane, concave unsupported trailing edge.
        count=[10,7,4][lod];across=[5,4,3][lod];vs=[];fs=[]
        root=Vector((-1.84,1.83,.07));lead=Vector((-5.20,4.21,.15));trail=Vector((-4.47,2.59,.04))
        for under in [False,True]:
            for i in range(count+1):
                t=i/count
                for j in range(across+1):
                    u=j/across
                    end=lead.lerp(trail,u)
                    # Pull the unsupported edge inward, producing tension scallop instead of a leaf tip.
                    end=end.lerp(root,.105*math.sin(math.pi*u))
                    v=root.lerp(end,t)
                    v.z-=.08*math.sin(math.pi*u)*math.sin(math.pi*t)
                    if under:v.z-=.035
                    vs.append(tuple((v.x,side*v.y,v.z)))
        n=(count+1)*(across+1);w=across+1
        for base in [0,n]:
            for i in range(count):
                for j in range(across):
                    a=base+i*w+j;f=(a,a+1,a+w+1,a+w);fs.append(tuple(reversed(f)) if base else f)
        border=list(range(w))+[i*w+w-1 for i in range(1,count+1)]+list(reversed(range(count*w,count*w+w-1)))+[i*w for i in range(count-1,0,-1)]
        for a,b in zip(border,border[1:]+border[:1]):fs.append((a,b,b+n,a+n))
        mesh('Vane_'+label+'_tensioned_fan',vs,fs,'soft',True)
        # One thick leading finger carries the fan; two smaller fingers diverge from its buried root.
        for name,path in [
          ('leading',[(-1.43,1.40,.06,.32,.27,.13),(-2.06,2.14,.12,.31,.24,.11),(-2.96,2.91,.15,.20,.16,.08),(-4.13,3.67,.17,.11,.09,.035),(-5.20,4.21,.16,.012,.02,.012)]),
          ('middle',[(-1.65,1.59,.025,.14,.13,.06),(-2.46,2.25,.08,.14,.12,.05),(-3.49,2.88,.075,.08,.085,.03),(-4.62,3.38,.10,.007,.02,.012)]),
          ('trailing',[(-1.7,1.64,.015,.17,.12,.055),(-2.35,2.00,.04,.14,.095,.045),(-3.37,2.35,.04,.08,.06,.024),(-4.47,2.59,.055,.009,.018,.01)])
        ]:
            if lod==2 and name=='middle':continue
            swept('Vane_'+label+'_'+name+'_finger',[(x,side*y,z,ww,h,bb) for x,y,z,ww,h,bb in path],'shell',9,3)
        swept('Vane_'+label+'_dense_tip',[(-4.83,side*4.02,.16,.045,.037,.025),(-5.20,side*4.21,.16,.018,.022,.015),(-5.31,side*4.27,.16,.002,.007,.004)],'bone',7,2)

    def compressed_joint(side,label):
        # Short asymmetric curved muscle; folded only on the compressed dorsal/medial side.
        rows=smooth_rows([
          (-.50,1.00,-.035,.32,.30,.24),(-.08,1.30,-.02,.53,.40,.29),
          (.38,1.62,-.015,.67,.44,.33),(.82,1.84,-.025,.64,.43,.32),
          (1.18,2.03,-.025,.59,.40,.31),(1.58,2.18,-.02,.49,.36,.28),
          (1.92,2.30,-.01,.29,.25,.23)],[4,2,1][lod])
        n=[20,14,9][lod];vs=[];fs=[]
        for i,(x,y,z,w,h,bot) in enumerate(rows):
            t=i/(len(rows)-1)
            prev=Vector(rows[max(0,i-1)][:3]);nxt=Vector(rows[min(len(rows)-1,i+1)][:3]);tan=nxt-prev
            lat=Vector((-tan.y,tan.x,0)).normalized()
            for j in range(n):
                a=2*math.pi*j/n;c=math.cos(a);sn=math.sin(a)
                # The fold courses run obliquely, compressed together inside the bend.
                p=t+.07*c+.025*math.sin(2*a)
                ridge=sum(amp*math.exp(-((p-pos)/wid)**2) for pos,wid,amp in [(.49,.043,.115),(.66,.041,.14),(.81,.033,.095)])
                valley=sum(amp*math.exp(-((p-pos)/wid)**2) for pos,wid,amp in [(.55,.029,.069),(.72,.027,.073),(.858,.025,.043)])
                mask=(.20+.80*max(0,sn))*(.87-.13*c)
                fold=(ridge-valley)*mask
                lateral=w*c*(1+.08*sn)+fold*c
                zz=(h*(max(0,sn)**.72) if sn>=0 else -bot*(-sn)**.9)+fold*sn
                v=Vector((x,y,z))+lat*lateral;v.z+=zz
                vs.append((v.x,side*v.y,v.z))
        for i in range(len(rows)-1):
            for j in range(n):a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
        fs += [tuple(reversed(range(n))),tuple((len(rows)-1)*n+j for j in range(n))]
        ob=section_uv(mesh('Jaw_'+label+'_compressed_muscular_joint',vs,fs,'soft',True),len(rows),n)
        ob['construction']='Short curved compressed muscle, three unequal oblique dorsal folds, taut lateral tendon, nonuniform section; neither a wrist cylinder nor rings'
        return ob

    def load_shield(name,side,controls,primary=False):
        if lod==2 and 'secondary_load_shield' in name:return None
        rows=smooth_rows(controls,[3,1,1][lod])
        # A broad load plane turns sharply through a shoulder into a finite skirt.
        profile=[(-1,0),(-.86,.26),(-.58,.70),(-.18,.95),(.40,1.0),(.66,.95),(.79,.53),(1,0)]
        if lod==2:profile=[profile[i] for i in [0,2,4,6,7]]
        nn=len(profile);vv=[];ff=[]
        for under in [False,True]:
            for ri,(x,y,w,z,h) in enumerate(rows):
                t=ri/(len(rows)-1)
                for u,hh in profile:
                    # The wide proximal shield ends in an oblique scalloped step, not a leaf point.
                    boundary=(.26*u-.18*(1-u*u))*t**5 if primary else .13*u*t**5
                    xx=x+boundary-.07*u*(1-t)
                    # Newly seat the proximal scute into the existing jaw; preserve distal lip.
                    tuck=.064*(1-t)**2 if primary else 0
                    roof_scale=.85+.15*t if primary else 1
                    zz=z+h*hh*roof_scale-tuck-.045*abs(u)**2-(.135 if primary else .10)*(1-.22*t)*under
                    vv.append((xx,side*(y+u*w),zz))
        count=len(rows)*nn
        for base in [0,count]:
            for i in range(len(rows)-1):
                for j in range(nn-1):
                    a=base+i*nn+j;f=(a,a+1,a+nn+1,a+nn);ff.append(tuple(reversed(f)) if base else f)
        for i in range(len(rows)-1):
            for j in [0,nn-1]:a=i*nn+j;b=(i+1)*nn+j;ff.append((a,b,b+count,a+count))
        for i in [0,len(rows)-1]:
            for j in range(nn-1):a=i*nn+j;ff.append((a,a+count,a+count+1,a+1))
        ob=section_uv(mesh(name,vv,ff,'shell',True),len(rows),nn,2)
        ob['construction']='Finite angular load shield with hard shoulder, broad plane, physically overlapped scalloped distal boundary' if primary else 'Lower secondary scute seated beneath proximal shield and overlapping the dense terminal cutting chitin'
        return ob

    for side,label in [(1,'port'),(-1,'starboard')]:
        tissue=compressed_joint(side,label)
        cranial=bpy.data.objects['Tergite_01_cranial_keel']
        for v in tissue.data.vertices:
            v.co.z-=.06
            # Seat the soft surface against the actual finite shell's concave underside.
            hit,point,normal,face=cranial.ray_cast(Vector((v.co.x,v.co.y,-3)),Vector((0,0,1)))
            if hit and v.co.z>point.z-.105:v.co.z=point.z-.105
        tissue.data.update()
        jaw=shear_jaw(side,label)
        # Two nested shields carry the jaw load; they have real thickness and overlap.
        # The proximal hood embeds into the root instead of sitting as a long teardrop.
        load_shield('Jaw_'+label+'_secondary_load_shield',side,[
          (2.48,2.40,.40,.24,.28),(2.95,2.46,.53,.25,.30),
          (3.46,2.31,.44,.23,.25),(3.98,2.16,.31,.20,.20),
          (4.41,2.02,.16,.15,.115),(4.73,1.97,.025,.10,.025)],False)
        load_shield('Jaw_'+label+'_proximal_load_shield',side,[
          (1.02,2.02,.34,.23,.29),(1.35,2.17,.54,.28,.38),
          (1.86,2.39,.67,.33,.42),(2.40,2.53,.65,.33,.39),
          (2.91,2.49,.51,.32,.31),(3.12,2.48,.39,.31,.24)],True)
        # A rooted ventrolateral cheek guard shelters the lower joint and creates
        # the C-shaped exposed muscle window between cranial roof and jaw palm.
        swept('Cheek_'+label+'_ventral_guard',[
           (-1.03,side*1.44,.04,.22,.20,.13),(-.59,side*1.92,-.09,.31,.24,.14),
           (-.10,side*2.16,-.17,.29,.23,.13),(.38,side*2.43,-.20,.20,.20,.11),
           (.87,side*2.53,-.09,.06,.17,.055),(1.08,side*2.40,.06,.008,.05,.014)
        ],'shell',12,4)
        membrane_fan(side,label)

    # A sheltered mouth cavity is cut into the continuous ventral core, not stacked lip parts.
    core=bpy.data.objects['Ventral_muscular_core']
    bpy.ops.mesh.primitive_uv_sphere_add(segments=[24,12,8][lod],ring_count=[12,6,4][lod],location=(1.53,0,-.25))
    cut=bpy.context.object;cut.scale=(.43,.28,.125);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.context.view_layer.objects.active=core;mod=core.modifiers.new('Continuous preoral cavity','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cut
    bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)

    # Existing dorsal gameplay anchor stays fixed; cosmetic SIGNAL height is explicit
    # in the candidate contract. Fit the same smooth host at every authored tier.
    cranial=bpy.data.objects['Tergite_01_cranial_keel']
    for marker in ['SOCKET_BROOD_TETHER_DORSAL','SOCKET_BROOD_SIGNAL']:
        sx,sz,sy=contract['sockets'][marker]['position']
        sy=-sy
        for iteration in range(12):
            hit,point,normal,face=cranial.ray_cast(Vector((sx,sy,10)),Vector((0,0,-1)))
            if not hit:raise RuntimeError('No fixed exterior host for '+marker)
            delta=sz-point.z
            if abs(delta)<.000001:break
            for v in cranial.data.vertices:
                envelope=math.exp(-((v.co.x-sx)/.40)**2-((v.co.y-sy)/.26)**2)
                v.co.z+=delta*envelope
            cranial.data.update();bpy.context.view_layer.update()

    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    # Finishing: tiny physically appropriate edge rounding, no global soap smoothing.
    for ob in meshes:
        if lod==0 and 'load_shield' not in ob.name and not ob.name.startswith('Tergite_') and ob.data.materials[0] in (M['shell'],M['bone'],M['lip']):
            mod=ob.modifiers.new('Small grown edge roll','BEVEL');mod.width=[.022,.016,0][lod];mod.segments=1;mod.limit_method='ANGLE';mod.angle_limit=.38
            bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
            # Flat regions retained; normals do not smooth across the silhouette crown.
        # Angle-aware normals preserve the carapace's keel and flange breaks.
        for face in ob.data.polygons: face.use_smooth=True
        ob.data.set_sharp_from_angle(angle=math.radians(100 if ob.data.materials[0]==M['soft'] else 82 if ob.name.startswith('Tergite_') else 68 if 'integrated_shear' in ob.name else 32 if 'load_shield' in ob.name else 42))
        # N2: the central ridge is actual continuous curved geometry, not a forced normal split.
        if not ob.name.startswith(('Tergite_','Jaw_','Cheek_')) and ob.data.materials[0]!=M['soft']:
            wn=ob.modifiers.new('Area-weighted hard-edge normals','WEIGHTED_NORMAL');wn.keep_sharp=True;wn.weight=35
            bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=wn.name)
        ob['productionCandidate']=True

    # Remove coincident fan-root construction vertices and tiny zero-area bevel/cap
    # remnants before the final trim study. Retain editable quads on the large surfaces.
    cleanup=[]
    for ob in meshes:
        bm=bmesh.new();bm.from_mesh(ob.data)
        before=len(bm.faces)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001)
        ngons=[f for f in bm.faces if len(f.verts)>4]
        if ngons:bmesh.ops.triangulate(bm,faces=ngons,quad_method='BEAUTY',ngon_method='BEAUTY')
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
        cleanup.append({'mesh':ob.name,'facesBefore':before,'facesAfter':len(ob.data.polygons)})


    surface=apply_anatomy_trim(M,meshes)
    ship=F.Ship('brood_mite',K.COLORS);ship.contract=copy.deepcopy(contract);ship.lod=lod
    ship._mats={'carapace':M['shell'],'chitin':M['bone'],'membrane':M['soft']}
    for finish,mat in ship._mats.items():
        mat['forgeKey']=finish;mat['forgeFinish']=finish;mat['forgeShip']='brood_mite';mat['spacefaceFinish']='forge-v1';mat['spacefaceMaterialRole']=K.FINISHES[finish]['role']
    for ob in meshes:
        ob['forge_preserve_authored_surface']=True
        ship.add(ob)
    for side,rig in [('port','mite_membrane_port'),('starboard','mite_membrane_starboard')]:
        definition=next(r for r in contract['motion']['rigs'] if r['id']==rig)
        parts=[ob for ob in meshes if ob.name.startswith('Vane_'+side+'_')]
        ship.motion_group(rig,K.pos(definition['pivot']),objects=parts)
    for name,socket in contract['sockets'].items():ship.socket(name,K.pos(socket['position']),K.pos(socket['forward']))
    ship.socket_names=list(ship.sockets)
    ship.brood_surface_treatment=surface
    ship.brood_hooks=[]
    ship.brood_recovery_candidate='N4 new authored reconstruction; no original Surface3 byte claim'
    ship.brood_source_marker_preview=True
    return ship
