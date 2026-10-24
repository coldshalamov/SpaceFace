import { getPromptDeck } from './promptDeck.js';

export const towlineTablePrompt={name:'towlineTablePrompt',init(ctx){this.bus=ctx.bus;this._id='towline-table:decision';this._subs=[];this._active=null;
  this._subs.push(ctx.bus.on('towlineTable:offer',r=>this.offer(r)));
  for(const event of ['game:load','game:new','game:newGame','save:restoring','save:loaded','dock:docked','sector:exit'])this._subs.push(ctx.bus.on(event,()=>this.clear()));
},offer(row){if(!row)return false;const choices=[];
  if(row.canTake)choices.push({id:'take',label:'TAKE THIS CLEANUP LINE',title:'The crew releases its actual line. Return this original slowly at Ceres; the named worker must witness the handover.'});
  if(row.canDeliver)choices.push({id:'deliver',label:'HAND OVER THIS ORIGINAL',title:'Keep a Massline on this original, bring it slowly to Ceres, and keep the named worker nearby to witness the return.'});
  if(row.canAssist)choices.push({id:'assist',label:row.resume?'RESUME THE SAME TOW':'ASK FOR ONE CARGO TOW',title:'One earned service, one original load, fixed Ceres destination. A declined hire consumes nothing; accepted work retains its first deadline.'});
  if(row.canRelease)choices.push({id:'release',label:'RETURN THE CLEANUP TO THE CREW'});
  if(row.canCourse)choices.push({id:'course',label:'SET CERES RECEIVER COURSE'});
  choices.push({id:'leave',label:'LEAVE OPEN',cancel:true});
  const token={},allowed=new Set(choices.map(c=>c.id));this._active=token;
  const accepted=getPromptDeck()?.offerDecision({id:this._id,kind:'info',sender:`${row.name.toUpperCase()} · THE TOWLINE TABLE`,
    statusFlag:row.status,headline:row.headline,detail:row.text,choices,onChoose:id=>{
      if(this._active!==token||!allowed.has(id))return false;
      this.clear();if(id!=='leave')this.bus.emit(`towlineTable:${id}`,{memberId:row.memberId,revision:row.revision,...(id==='assist'?{targetId:row.targetId}:{})});return true;}})||false;
  if(!accepted&&this._active===token)this._active=null;return accepted;
},clear(){this._active=null;getPromptDeck()?.resolveDecision(this._id);},newGame(){this.clear();},destroy(){this.newGame();for(const off of this._subs||[])off();}};
