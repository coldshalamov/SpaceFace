import { getPromptDeck } from './promptDeck.js';

export const ilexArkPrompt={name:'ilexArkPrompt',init(ctx){this.bus=ctx.bus;this._id='ilex:seed-ark:decision';this._subs=[];this._active=null;
  this._subs.push(ctx.bus.on('ilexArk:offer',r=>this.offer(r)));
  for(const event of ['game:load','game:new','game:newGame','save:restoring','save:loaded','dock:docked','sector:exit'])this._subs.push(ctx.bus.on(event,()=>this.clear()));
},offer(row){if(!row)return false;const choices=[];
  if(row.canAccept)choices.push({id:'accept',label:'ESCORT THE SIX VAULTS',title:'Optional physical convoy to Ceres. Lost vaults stay lost; partial recovery still counts.'});
  if(row.canDeliver)choices.push({id:'deliver',label:'HAND OVER TOWED VAULT',title:'The current native Massline and slow receiver must accept the actual original body.'});
  if(row.canFinish)choices.push({id:'finish',label:`FILE ${row.delivered}/6 ARRIVED`,title:'Close this voyage. Unrecovered vaults are recorded lost; this outcome cannot be revised for another payment.'});
  if(row.canCourse)choices.push({id:'course',label:'SET CERES RECEIVER COURSE'});
  choices.push({id:'leave',label:'LEAVE OPEN',cancel:true});
  const token={},allowed=new Set(choices.map(c=>c.id));this._active=token;
  const accepted=getPromptDeck()?.offerDecision({id:this._id,kind:'info',sender:'CAPTAIN ILEX · SEED ARK',
    statusFlag:row.status,headline:'Six vaults, six futures',detail:row.text,choices,onChoose:id=>{
      if(this._active!==token||!allowed.has(id))return false;
      this.clear();if(id!=='leave')this.bus.emit(`ilexArk:${id}`,{revision:row.revision});return true;}})||false;
  if(!accepted&&this._active===token)this._active=null;return accepted;
},clear(){this._active=null;getPromptDeck()?.resolveDecision(this._id);},newGame(){this.clear();},destroy(){this.newGame();for(const off of this._subs||[])off();}};
