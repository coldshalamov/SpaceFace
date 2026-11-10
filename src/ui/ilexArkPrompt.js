import { getPromptDeck } from './promptDeck.js';

// Admission is synchronous but may reenter via HUD claims; resolution may publish a newer offer.
// Keep same-ID updates in place, and dispatch only after an accepted card survives resolution.

export const ilexArkPrompt={name:'ilexArkPrompt',init(ctx){this.bus=ctx.bus;this._id='ilex:seed-ark:decision';this._subs=[];this._active=null;this._epoch=0;this._destroyed=false;
  this._subs.push(ctx.bus.on('ilexArk:offer',r=>this.offer(r)));
  for(const event of ['game:load','game:new','game:newGame','save:restoring','save:loaded','dock:docked','sector:exit'])this._subs.push(ctx.bus.on(event,()=>this.clear()));
},offer(row){if(this._destroyed)return false;if(!row){this.clear();return false;}const choices=[];
  if(row.canAccept)choices.push({id:'accept',label:'ESCORT THE SIX VAULTS',title:'Optional physical convoy to Ceres. Lost vaults stay lost; partial recovery still counts.'});
  if(row.canDeliver)choices.push({id:'deliver',label:'HAND OVER TOWED VAULT',title:'The current native Massline and slow receiver must accept the actual original body.'});
  if(row.canFinish)choices.push({id:'finish',label:`FILE ${row.delivered}/6 ARRIVED`,title:'Close this voyage. Unrecovered vaults are recorded lost; this outcome cannot be revised for another payment.'});
  if(row.canCourse)choices.push({id:'course',label:'SET CERES RECEIVER COURSE'});
  choices.push({id:'leave',label:'LEAVE OPEN',cancel:true});
  const token={accepted:false},epoch=++this._epoch,allowed=new Set(choices.map(c=>c.id));this._active=token;
  const accepted=getPromptDeck()?.offerDecision({id:this._id,kind:'info',sender:'CAPTAIN ILEX · SEED ARK',
    statusFlag:row.status,headline:'Six vaults, six futures',detail:row.text,choices,onChoose:id=>{
      if(this._active!==token||!token.accepted||!allowed.has(id))return false;
      const clearedEpoch=this.clear();if(this._epoch!==clearedEpoch||this._destroyed)return false;if(id!=='leave')this.bus.emit(`ilexArk:${id}`,{revision:row.revision});return true;}})||false;
  if(!accepted&&this._active===token)this._active=null;token.accepted=!!accepted&&this._active===token&&this._epoch===epoch;return token.accepted;
},clear(){const epoch=++this._epoch;this._active=null;getPromptDeck()?.resolveDecision(this._id);return epoch;},newGame(){this.clear();},destroy(){this._destroyed=true;this.newGame();for(const off of this._subs||[])off();}};
