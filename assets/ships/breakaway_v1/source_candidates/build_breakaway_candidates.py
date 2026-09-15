#!/usr/bin/env python3
"""Rebuild original BREAKAWAY geometry. Requires numpy and trimesh (authoring only).
No borrowed meshes/textures/fonts. Game source GLBs must still follow its asset promotion pipeline.
Right-handed +Y up; spindle long axis +X. Capture fork origin = mouth, inward +X.
"""
from pathlib import Path
import json, hashlib, math
import numpy as np
import trimesh as tm
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/models'; OUT.mkdir(parents=True,exist_ok=True)
PALETTE={
 'paint_bone':([218,213,192,255],.30,.47),
 'graphite':([37,43,48,255],.65,.45),
 'machined':([111,117,114,255],.88,.24),
 'copper':([157,104,53,255],.80,.33),
 'signal_amber':([248,165,43,255],.35,.34),
 'ceramic_dark':([60,68,73,255],.15,.62),
}
def box(ext, pos):
 m=tm.creation.box(extents=ext);m.apply_translation(pos);return m
AXIS=tm.transformations.rotation_matrix(math.pi/2,[0,1,0])
def cyl(radius,length,pos,sections=20):
 m=tm.creation.cylinder(radius=radius,height=length,sections=sections);m.apply_transform(AXIS);m.apply_translation(pos);return m
def ring(inner,outer,length,pos,sections=24):
 m=tm.creation.annulus(r_min=inner,r_max=outer,height=length,sections=sections);m.apply_transform(AXIS);m.apply_translation(pos);return m

def export(name, parts, sockets, extras):
 scene=tm.Scene()
 counts={}
 for material,meshes in parts.items():
  if not meshes:continue
  mesh=tm.util.concatenate(meshes)
  color,metal,rough=PALETTE[material]
  mesh.visual=tm.visual.TextureVisuals(material=tm.visual.material.PBRMaterial(name=material,baseColorFactor=color,metallicFactor=metal,roughnessFactor=rough,doubleSided=False))
  scene.add_geometry(mesh,node_name=material,geom_name=material)
  counts[material]=len(mesh.faces)
 for key,pos in sockets.items():
  mat=np.eye(4);mat[:3,3]=pos;scene.graph.update(frame_from=scene.graph.base_frame,frame_to=key,matrix=mat)
 scene.metadata={'breakaway':extras,'role':'authored_candidate_not_shipping_accepted'}
 data=scene.export(file_type='glb');(OUT/(name+'.glb')).write_bytes(data)
 vertices=np.concatenate([g.vertices for g in scene.geometry.values()])
 return {'file':name+'.glb','sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'triangles':sum(counts.values()),'primitives':len(counts),'trianglesByMaterial':counts,'bounds':scene.bounds.tolist(),'xzCircumradius':float(np.max(np.hypot(vertices[:,0],vertices[:,2]))),'sockets':sockets,'contract':extras}

def spindle():
 p={k:[] for k in PALETTE}
 # Caged rotor: a dense centre, open annular collars, and load-bearing exterior rails.
 p['ceramic_dark'].append(cyl(6.2,22,[0,0,0],32))
 for x in [-10.8,10.8]:
  p['paint_bone'].append(ring(7.2,9.3,2.0,[x,0,0],12))
  p['graphite'].append(ring(6.3,8.5,1.05,[x*1.07,0,0],24))
  p['copper'].append(ring(5.4,6.9,.8,[x*1.14,0,0],24))
  p['graphite'].append(cyl(4.6,.7,[x*1.21,0,0],24))
  p['machined'].append(ring(3.4,4.2,.8,[x*1.25,0,0],24))
  # Mechanical fastener rhythm, readable at a medium angle; batched by material.
  for i in range(12):
   a=i*math.tau/12;p['machined'].append(cyl(.34,.48,[x*1.09,8.3*math.cos(a),8.3*math.sin(a)],6))
 for x in [-7.7,-3.5,3.5,7.7]:p['machined'].append(ring(6.18,6.6,.5,[x,0,0],32))
 for i in range(6):
  a=i*math.tau/6;y=7.6*math.cos(a);z=7.6*math.sin(a)
  p['machined'].append(cyl(.48,21.6,[0,y,z],10))
  # Wide painted saddle/cage rail rather than many arbitrary greebles.
  rail=box([17.4,.9,2.0],[0,0,0]);rail.apply_transform(tm.transformations.rotation_matrix(a,[1,0,0]));rail.apply_translation([0,y,z]);p['paint_bone'].append(rail)
 # Asymmetric service spine and a high lifting lug create instant identity.
 p['graphite'].append(box([13,1.4,3.1],[0,9.05,0]))
 p['paint_bone'].append(box([10.5,.8,2.7],[-1,10.0,0]))
 p['signal_amber'].append(box([3.2,.22,2.8],[-3.7,10.5,0]))
 lug=tm.creation.annulus(r_min=1.1,r_max=2.05,height=.8,sections=12);lug.apply_translation([3,11,0]);p['copper'].append(lug)
 for x in [-6,6]:p['copper'].append(box([.9,1.8,3.2],[x,9.3,0]))
 # Four strongly bounded status lamps; not an all-over emissive toy.
 for x in [-9.1,9.1]:
  for z in [-6.7,6.7]:p['signal_amber'].append(box([1.3,.4,.6],[x,6.7,z]))
 return export('sp07-spindle',p,{'socket_tow_front':[14,0,0],'socket_tow_aft':[-14,0,0],'socket_service':[3,11,0]}, {'units':'WU','up':'+Y','forward':'+X','physics':'single conservative dynamic proxy','mass':180,'purpose':'moving industrial load and improvised kinetic tool'})

def fork():
 p={k:[] for k in PALETTE}
 for z in [-31,31]:
  p['graphite'].append(box([75,7,8],[36,-3,z]))
  p['machined'].append(box([67,2,2.1],[34,1.4,z-(1 if z>0 else -1)*3]))
  p['paint_bone'].append(box([60,1.2,5.9],[36,1.4,z]))
  p['paint_bone'].append(box([9,3.1,9],[1,0,z]))
  for x in [12,26,40,54,68]:
   p['copper'].append(box([2.1,7.6,9.1],[x,-3,z]))
   p['signal_amber'].append(box([1.5,.5,4.5],[x,2.3,z]))
  for x in [10,30,50]:p['ceramic_dark'].append(box([8,8,3],[x,-3,z+(1 if z>0 else -1)*5]))
 p['graphite'].append(box([11,13,75],[77,-3,0]))
 p['paint_bone'].append(box([6,1.8,65],[77,4.5,0]))
 p['copper'].append(box([8,8,18],[76,0,0]))
 p['signal_amber'].append(box([9,.3,7],[76,5.5,0]))
 # Two visible energy sinks behind the stopped load.
 for z in [-17,17]:
  p['graphite'].append(box([7,11,8],[86,-3,z]))
  for x in [84,86,88]:p['machined'].append(box([.5,12,9],[x,-3,z]))
 return export('capture-fork',p,{'socket_mouth':[0,0,0],'socket_seat':[44,0,0],'socket_service':[77,5.5,0]}, {'units':'WU','up':'+Y','inward':'+X','origin':'mouth plane','innerHalfWidth':27,'usableDepth':72,'physics':'three static colliders; mouth is a sensor, never a solid door'})

a=spindle();b=fork();manifest={'schema':'breakaway.authored-assets.v1','source':'tools/build-assets.py','status':'new authored candidates; live-game camera and asset-pipeline acceptance still required','assets':[a,b]}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({row['file']:{k:row[k] for k in ['bytes','triangles','primitives','xzCircumradius']} for row in [a,b]},indent=2))
