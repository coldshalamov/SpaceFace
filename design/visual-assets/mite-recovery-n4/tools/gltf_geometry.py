"""Read uncompressed GLB source triangles in the canonical world frame."""
import json,struct
import numpy as np
DT={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def read_geometry(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);off=20+n;bn=struct.unpack_from('<I',raw,off)[0];data=raw[off+8:off+8+bn]
 def access(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt=np.dtype(DT[a['componentType']]);c=NC[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',dt.itemsize*c)
  return np.ndarray((a['count'],c),dtype=dt,buffer=data,offset=start,strides=(stride,dt.itemsize)).copy()
 def matrix(node):
  if 'matrix' in node:return np.array(node['matrix']).reshape(4,4).T
  x,y,z,w=node.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
 rows=[];sockets={}
 def visit(i,parent,rig=None):
  node=doc['nodes'][i];world=parent@matrix(node);name=node.get('name',str(i));rig=node.get('extras',{}).get('spaceface',{}).get('motionGroup',rig)
  if name.startswith('SOCKET_'):sockets[name]=world[:3,3].tolist()
  if 'mesh' in node and not name.startswith('COLLISION_'):
   for p in doc['meshes'][node['mesh']]['primitives']:
    v=access(p['attributes']['POSITION']);v=np.c_[v,np.ones(len(v))]@world.T;t=access(p['indices']).reshape(-1,3)
    side=1 if rig=='mite_membrane_port' or name.startswith('Vane_port_') else -1 if rig=='mite_membrane_starboard' or name.startswith('Vane_starboard_') else 0
    rows.append({'name':name,'v':v[:,:3],'t':t,'side':side})
  for j in node.get('children',[]):visit(j,world,rig)
 for i in doc['scenes'][doc.get('scene',0)]['nodes']:visit(i,np.eye(4))
 return rows,sockets,doc
