import { getPromptDeck } from './promptDeck.js';

export const towlineTablePrompt={name:'towlineTablePrompt',init(ctx){this.bus=ctx.bus;this._id='towline-table:decision';this._subs=[];
  this._subs.push(ctx.bus.on('towlineTable:offer',r=>this.offer(r)));
  for(const event of ['save:restoring','dock:docked','sector:exit'])this._subs.push(ctx.bus.on(event,()=>getPromptDeck()?.resolveDecision(this._id)));
},offer(row){if(!row)return false;const choices=[];
  if(row.canTake)choices.push({id:'take',label:'TAKE THIS CLEANUP LINE',title:'The crew releases its actual line. Return this original slowly at Ceres; the named worker must witness the handover.'});
  if(row.canDeliver)choices.push({id:'deliver',label:'HAND OVER THIS ORIGINAL',title:'An actual native MassLine, the current slow receiver and the living witness must agree.'});
  if(row.canAssist)choices.push({id:'assist',label:row.resume?'RESUME THE SAME TOW':'ASK FOR ONE CARGO TOW',title:'One earned service, one original load, fixed Ceres destination. A declined hire consumes nothing; accepted work retains its first deadline.'});
  if(row.canRelease)choices.push({id:'release',label:'RETURN THE CLEANUP TO THE CREW'});
  if(row.canCourse)choices.push({id:'course',label:'SET CERES RECEIVER COURSE'});
  choices.push({id:'leave',label:'LEAVE OPEN',cancel:true});
  return getPromptDeck()?.offerDecision({id:this._id,kind:'info',sender:`${row.name.toUpperCase()} · THE TOWLINE TABLE`,
    statusFlag:row.status,headline:row.headline,detail:row.text,choices,onChoose:id=>{
      getPromptDeck()?.resolveDecision(this._id);if(id!=='leave')this.bus.emit(`towlineTable:${id}`,{memberId:row.memberId,revision:row.revision,targetId:row.targetId});}})||false;
},newGame(){getPromptDeck()?.resolveDecision(this._id);},destroy(){this.newGame();for(const off of this._subs||[])off();}};
