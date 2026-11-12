// Real createHud(), real production stylesheet, synthetic state. No simulation or world renderer.
import { createHud } from '../../src/ui/hud.js';
import { createBus } from '../../src/core/eventBus.js';
import { injectHudCss } from '../../src/ui/views/hudStyles.js';
const player={id:'player',type:'ship',alive:true,team:1,pos:{x:0,y:0,z:0},vel:{x:52,y:0,z:0},radius:12,
  hull:86,hullMax:100,shield:78,shieldMax:100,armorHp:20,armorMax:30,cap:80,capMax:100,
  energy:80,energyMax:100,boost:{energy:70,max:100,dashCost:28,dashImpulse:0,dashCdT:0},maxSpeed:180,data:{defId:'ship_kestrel',callsign:'Player',weapons:[{id:'fixture-weapon',_heat:37,heatMax:100}]}};
const state={mode:'flight',playerId:player.id,entities:new Map([[player.id,player]]),entityList:[player],
  player:{targetId:null,credits:0,cargo:{items:{},usedVolume:0,capVolume:40},weaponRange:900,heat:0},
  settings:{ui:{overviewOpen:false},accessibility:{colorblindMode:'none',flashReduce:false},video:{motionReduce:false},gameplay:{},controls:{},audio:{},graphics:{}},
  ui:{radarRange:4000,trackedMissionId:null},input:{actions:{},autoFire:false},missions:{active:[]},story:{beatIndex:-1},
  nav:{},world:{currentSectorId:'helios',scanPings:{}},simTime:0,tick:0};
const bus=createBus();injectHudCss();
const mounted=createHud({state,bus,helpers:{worldToScreen:()=>({x:innerWidth/2,y:innerHeight/2,onScreen:true})}},null);
function step(frames=1,dt=1/60){for(let i=0;i<frames;i++){state.simTime+=dt;state.tick++;mounted.frame(dt);}}
step(24);
window.LAMINA_LIVE={state,player,bus,mounted,step};
