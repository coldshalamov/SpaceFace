import { getPromptDeck } from './promptDeck.js';

// Admission is synchronous but may reenter via HUD claims; resolution may publish a newer offer.
// Keep same-ID updates in place, and dispatch only after an accepted card survives resolution.

export const towlineTablePrompt={name:'towlineTablePrompt',init(ctx){this.bus=ctx.bus;this._id='towline-table:decision';this._subs=[];this._active=null;this._epoch=0;this._destroyed=false;
  this._subs.push(ctx.bus.on('towlineTable:offer',r=>this.offer(r)));
  for(const event of ['game:load','game:new','game:newGame','save:restoring','save:loaded','dock:docked','sector:exit'])this._subs.push(ctx.bus.on(event,()=>this.clear()));
},offer(row){if(this._destroyed)return false;if(!row){this.clear();return false;}const choices=[];
  if(row.canTake)choices.push({id:'take',label:'TAKE THIS CLEANUP LINE',title:'The crew releases its actual line. Return this original slowly at Ceres; the named worker must witness the handover.'});
  if(row.canDeliver)choices.push({id:'deliver',label:'HAND OVER THIS ORIGINAL',title:'Keep a Massline on this original, bring it slowly to Ceres, and keep the named worker nearby to witness the return.'});
  if(row.canAssist)choices.push({id:'assist',label:row.resume?'RESUME THE SAME TOW':'ASK FOR ONE CARGO TOW',title:'One earned service, one original load, fixed Ceres destination. A declined hire consumes nothing; accepted work retains its first deadline.'});
  if(row.canRelease)choices.push({id:'release',label:'RETURN THE CLEANUP TO THE CREW'});
  if(row.canCourse)choices.push({id:'course',label:'SET CERES RECEIVER COURSE'});
  choices.push({id:'leave',label:'LEAVE OPEN',cancel:true});
  const token={accepted:false},epoch=++this._epoch,allowed=new Set(choices.map(c=>c.id));this._active=token;
  const accepted=getPromptDeck()?.offerDecision({id:this._id,kind:'info',sender:`${row.name.toUpperCase()} · THE TOWLINE TABLE`,
    statusFlag:row.status,headline:row.headline,detail:row.text,choices,onChoose:id=>{
      if(this._active!==token||!token.accepted||!allowed.has(id))return false;
      const clearedEpoch=this.clear();if(this._epoch!==clearedEpoch||this._destroyed)return false;if(id!=='leave')this.bus.emit(`towlineTable:${id}`,{memberId:row.memberId,revision:row.revision,...(id==='assist'?{targetId:row.targetId}:{})});return true;}})||false;
  if(!accepted&&this._active===token)this._active=null;token.accepted=!!accepted&&this._active===token&&this._epoch===epoch;return token.accepted;
},clear(){const epoch=++this._epoch;this._active=null;getPromptDeck()?.resolveDecision(this._id);return epoch;},newGame(){this.clear();},destroy(){this._destroyed=true;this.newGame();for(const off of this._subs||[])off();}};
