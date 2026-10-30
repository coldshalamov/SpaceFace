/** No simulation writes. An authored place renderer consumes body.assetId at body.pos;
 * markers here communicate physical volumes without substituting for those assets. */
export function presentationData(view, {reducedMotion=false}={}) {
  const origin=view.origin;
  const point=p=>({x:p.x+origin.x,z:p.z+origin.z});
  return {title:view.title,text:`${view.text} Pressure ${view.pressure}%. ${view.instructions}`,
    stage:view.stage,seconds:view.seconds,
    bodies:view.bodies.map(b=>({...b,pos:{...b.pos}})),
    markers:[{kind:'cradle',...point(view.layout.receiver),radius:view.layout.receiver.radius,label:'CORE CRADLE / ≤4 m/s / HOLD 2 s'},
      ...view.layout.pockets.map(p=>({kind:'pocket',...point(p),radius:p.radius,label:'SHELTER'})),
      ...view.layout.jets.map(j=>({kind:'jet',...point(j),halfX:j.halfX,halfZ:j.halfZ,dx:j.dx,dz:j.dz,
        label:`${view.stage.toUpperCase()} / ${view.seconds} s`,intensity:view.pressure/100,
        animated:!reducedMotion&&view.stage==='jet'}))],
    signs:view.layout.signs.map(s=>({...point(s),text:s.text})),
    lamps:view.layout.lamps.map(l=>({...point(l),brightness:reducedMotion?1:.65+.35*l.phase})),
  };
}
/** Accessible companion for the existing prompt-deck integration. It owns no keys or
 * command handlers. Host places supplied controls in the canonical input surface. */
export function createNacreReadout(document, parent) {
  const node=document.createElement('section'),title=document.createElement('h2'),text=document.createElement('p');
  node.setAttribute('aria-label','Nacre Sluice site readout');
  title.textContent='Nacre Sluice';node.append(title,text);parent.append(node);
  let previous='';
  return {update(view) {
    node.hidden=!view.active;
    // Do not turn the per-second pressure counter into a screen-reader fire hose.
    const line=`${view.text} Pressure ${view.pressure}%. ${view.instructions}`;
    if(line!==previous){text.textContent=line;previous=line;}
  },dispose(){node.remove();}};
}
/** Optional deterministic marker geometry. Host passes its already-loaded THREE;
 * no imports, RNG, clock, assets, private input bindings or outcome writes. */
export function createNacreMarkers(THREE, scene) {
  const root=new THREE.Group();root.name='NacreSluiceMarkers';scene.add(root);
  const resources=[];let meshes=[],key='';
  function clear(){for(const m of meshes)root.remove(m);for(const r of resources)r.dispose();meshes=[];resources.length=0;}
  return {update(view,settings={}) {
    const data=presentationData(view,settings),next=`${view.epoch}:${view.active}`;
    root.visible=view.active;if(!view.active)return;
    if(next!==key){clear();key=next;
      for(const marker of data.markers){
        const jet=marker.kind==='jet';
        const g=jet?new THREE.PlaneGeometry(marker.halfX*2,marker.halfZ*2):new THREE.RingGeometry(marker.radius-.6,marker.radius,48);
        const material=new THREE.MeshBasicMaterial({color:jet?0xff9d38:marker.kind==='cradle'?0xa5ffd0:0x9cceff,
          transparent:true,opacity:jet?.14:.7,side:THREE.DoubleSide,depthWrite:false});
        const mesh=new THREE.Mesh(g,material);mesh.rotation.x=-Math.PI/2;mesh.position.set(marker.x,.3,marker.z);
        mesh.userData.nacreKind=marker.kind;root.add(mesh);meshes.push(mesh);resources.push(g,material);
      }
    }
    // Steady opacity ramp is legible in reduced motion too. No flashing, camera shake or
    // animation clock; phase and pressure are read-only projections of sim state.
    for(const mesh of meshes) if(mesh.userData.nacreKind==='jet')mesh.material.opacity=.06+.2*view.pressure/100;
  },dispose(){clear();scene.remove(root);}};
}
