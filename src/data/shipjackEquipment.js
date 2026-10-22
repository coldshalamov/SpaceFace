// Small acquisition family in the canonical fitting economy. Mass and draw are real sacrifices.
export const BLACK_FLAG_MODULES = [
  {id:'mod_claw_anchor_s',name:'Claw Anchor S',slotType:'utility',size:'S',tier:1,mass:5,price:1800,energyDraw:3,mods:{},
    description:'Counter-torques a Masslined hull during a close custody approach. Adds five tonnes; does not cancel drift or make the line unbreakable.'},
  {id:'mod_signature_reader_s',name:'Signature Reader S',slotType:'utility',size:'S',tier:1,mass:2,price:2400,energyDraw:2,mods:{radarRangePct:.12},
    description:'An identified target reveals forensic broadcast/engine disagreement before docking. Uses the utility bay and reactor margin.'},
  {id:'mod_quiet_intrusion_s',name:'Quiet Intrusion Rig S',slotType:'utility',size:'S',tier:2,mass:4,price:4200,energyDraw:6,requiresTech:'tech_long_range_survey',mods:{},
    description:'Replays a scanned maintenance handshake without the first alarm escalation. Gives one quiet attempt; keys still rotate and physical access remains necessary.'},
  {id:'mod_proof_recorder_s',name:'Proof Recorder S',slotType:'utility',size:'S',tier:1,mass:2,price:1500,energyDraw:1,mods:{},
    description:'Records crew release and intact arrival against the exact frame. Recoveries with testimony gain a stronger salvage claim; it cannot invent title.'},
  {id:'unique_blackbird_governor',baseId:'mod_engine_sprint_m',name:'Blackbird Overbored Governor',slotType:'engine',size:'M',tier:2,mass:10,price:28000,energyDraw:13,purchasable:false,unique:true,salvageOnly:true,
    mods:{topSpeed:100,accelMult:1.7,turnMult:1,travelCeilingMult:1.12},visuals:{glow:'#ddad68'},
    description:'A real overbored Sprint bus: stronger thrust, two extra tonnes and four extra power draw. Its distinctive exhaust identifies the corporate prototype.'},
];

export function fittedBlackFlagTool(state,id){
  const owned=state.player?.ownedShips?.[state.player?.activeShipIndex];
  return !!owned?.fittings?.includes(id);
}
