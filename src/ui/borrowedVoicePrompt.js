import { getPromptDeck } from './promptDeck.js';

export const borrowedVoicePrompt={name:'borrowedVoicePrompt',init(ctx){this.bus=ctx.bus;this._id='borrowed-voice:record';this._subs=[];
  this._subs.push(ctx.bus.on('borrowedVoice:offer',row=>this.offer(row)));
  for(const event of ['save:restoring','sector:exit','dock:docked'])this._subs.push(ctx.bus.on(event,()=>getPromptDeck()?.resolveDecision(this._id)));
},offer(row){if(!row)return false;
  const choices=row.canChoose?[
    {id:'archive',label:'ARCHIVE THE RECOVERED RECORD',title:'One recovery contract. Only the recovered words enter the journal; missing material remains unknown.'},
    {id:'quarantine',label:'ISOLATE THIS SIGNAL',title:'Seal this artifact circuit. Its physical housings stay towable; no lost words are recovered by containment.'},
    {id:'leave',label:'LEAVE THE RECORD ATTACHED',title:'Keep the evidence and leave the circuit open. You can return to this physical site.'},
  ]:[];
  choices.push({id:'close',label:'KEEP INVESTIGATING',cancel:true});
  return getPromptDeck()?.offerDecision({id:this._id,kind:'info',sender:'BORROWED VOICE · RETAINED RECORD',
    statusFlag:row.disposition,headline:`${row.recovered}/3 SOURCES RECOVERED${row.quality==null?'':` · SIGNAL ${row.quality}%`}`,
    detail:row.text,choices,onChoose:id=>{getPromptDeck()?.resolveDecision(this._id);
      if(id!=='close')this.bus.emit('borrowedVoice:disposition',{disposition:id,revision:row.revision});}})||false;
},newGame(){getPromptDeck()?.resolveDecision(this._id);},destroy(){this.newGame();for(const off of this._subs||[])off();}};
