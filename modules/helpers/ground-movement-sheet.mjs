import {paymentFor} from './ground-movement-payment.mjs';
import {dualDistance} from './metric-distances.mjs';
import {modes,bands,calibration} from './ground-movement-model.mjs';
import {movementMode,enabledMovementModes,groundTokensForActor,groundTokenForActor,selectGroundSheetToken,stateFor,rangeFor,isGroundToken,requestMovementCommand} from './ground-movement-state.mjs';
import {cancelGroundTarget} from './ground-target-picker.mjs';
import {setGroundRangeOverlay,hasGroundRangeOverlay,clearGroundRangeOverlay,refreshGroundRangeOverlay,rangeLabels,rangeColors} from './ground-range-overlay.mjs';
const views=new Map(),types=new Set(['character','minion','rival','nemesis']);let frame,styles;
const el=(tag,css,text,doc=document)=>{const node=doc.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=text;return node;};
export function loadGroundMovementStyles(){return styles??=new Promise(resolve=>{const link=el('link');link.rel='stylesheet';link.href=new URL('../../styles/ground-movement.css',import.meta.url).href;link.onload=resolve;link.onerror=resolve;document.head.append(link);});}
function button(text,action,css=''){
 const node=el('button',css,text);node.type='button';
 node.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void Promise.resolve().then(action).catch(error=>ui.notifications.warn(error.message));});return node;
}
class GroundSheetView{
 constructor(sheet){this.sheet=sheet;this.open={full:false,combat:false};}
 get token(){return groundTokenForActor(this.sheet.actor);}
 async command(kind,extra={},count=0){
  if(this.busy)return;const token=this.token;if(!token)return;this.busy=true;
  this.root?.setAttribute('aria-busy','true');
  for(const control of this.root?.querySelectorAll('button,input,select')??[])control.disabled=true;
  try{
   const state=stateFor(token),payment=count?await paymentFor(token,count):null;
   if(count&&state.used+count===2&&!payment)return;
   await requestMovementCommand({kind,tokenUuid:token.uuid,context:state.context,revision:state.revision,payment,...extra});
  }finally{this.busy=false;refreshGroundSheets();}
 }
 rememberState(){
  const root=this.root,mode=root?.dataset.groundSheetMode;if(!root||!mode)return;
  this.open[mode]=root.open;
 }
 prepare(source){
  this.rememberState();
  const mode=this.sheet._ffgCombatMode?'combat':'full';this.root=el('details','ffg-sheet-movement');const root=this.root;root.dataset.groundSheetMode=mode;root.open=this.open[mode];
  // UI-only selectors and checkboxes must not submit the Actor's native form.
  root.addEventListener('change',event=>event.stopPropagation());root.addEventListener('input',event=>event.stopPropagation());
  root.addEventListener('toggle',()=>{if(this.root===root)this.open[mode]=root.open;});
  const defense=source.querySelector('[data-combat-stat=defence]')??source.querySelector('input[name$="stats.defence.melee"]')?.closest('.resource');
  if(defense){defense.parentElement.classList.add('ffg-maneuver-stats');this.root.classList.add('ffg-maneuver-card');defense.after(this.root);}else source.prepend(this.root);
  this.refresh();return this.root;
 }
 refresh(){
  const root=this.root;if(!root)return;
  this.rememberState();
  const doc=root.ownerDocument,active=doc.activeElement,controls=[...root.querySelectorAll('summary,button,input,select')],focusIndex=controls.indexOf(active);
  const scrolls=[];
  if(root.isConnected)for(let parent=root.parentElement;parent;parent=parent.parentElement)if(parent.scrollHeight>parent.clientHeight||parent.scrollWidth>parent.clientWidth)scrolls.push([parent,parent.scrollTop,parent.scrollLeft]);
  // Construct the next state off-screen. Never empty the connected details first:
  // removing a focused control can clamp its scroll container and collapse notes.
  const fresh=el('details','ffg-sheet-movement');this.renderContents(fresh);
  root.hidden=fresh.hidden;root.setAttribute('aria-busy',String(!!this.busy));
  root.replaceChildren(...fresh.childNodes);
  if(focusIndex>=0){
   const replacement=root.querySelectorAll('summary,button,input,select')[focusIndex];
   if(replacement?.tagName===active.tagName&&!replacement.disabled)replacement.focus({preventScroll:true});
  }
  for(const [parent,top,left]of scrolls){if(parent.scrollTop!==top)parent.scrollTop=top;if(parent.scrollLeft!==left)parent.scrollLeft=left;}
 }
 renderContents(root){
  const token=this.token,mode=movementMode(),enabled=enabledMovementModes();
  root.hidden=enabled.length===0&&mode==='none';if(root.hidden){clearGroundRangeOverlay(this);return;}
  const summary=el('summary');summary.title=game.i18n.localize("SWFFG.UI.Ground.MovementOptions");const title=el('span','ffg-sheet-movement-title',game.i18n.localize("SWFFG.UI.Ground.Maneuvers"));
  summary.append(title,el('span','ffg-sheet-movement-mode',game.i18n.localize(modes[mode])));
  if(token&&mode!=='none')summary.append(el('span','ffg-sheet-movement-budget',stateFor(token).used+' / 2'));root.append(summary);
  const body=el('div','ffg-sheet-movement-body');root.append(body);
  const unavailable=(key,hint,choose=false)=>{
   const status=el('span','ffg-sheet-movement-status',game.i18n.localize(key));status.title=game.i18n.localize(hint);status.setAttribute('role','status');summary.append(status);
   const tools=el('div','ffg-movement-buttons'),action=button(game.i18n.localize(choose?'SWFFG.UI.Ground.Choose':'SWFFG.UI.Ground.Use'),()=>{
    this.root.open=true;this.root.querySelector('select')?.focus({preventScroll:true});
   });action.disabled=!choose;action.title=game.i18n.localize(hint);tools.append(action);summary.append(tools);
  };
  if(mode==='none'){unavailable('SWFFG.UI.Ground.Disabled','SWFFG.UI.Ground.SceneDisabledHint');body.append(el('p','ffg-movement-note',game.i18n.localize("SWFFG.UI.Ground.SceneDisabledHint")));return;}
  const tokens=groundTokensForActor(this.sheet.actor);
  if(tokens.length>1){
   const label=el('label','ffg-sheet-movement-field',game.i18n.localize("SWFFG.UI.Ground.SheetToken")),select=el('select');select.append(new Option(game.i18n.localize("SWFFG.UI.Ground.ChooseActorToken"),''));
   for(const choice of tokens)select.append(new Option(choice.name,choice.uuid));select.value=token?.uuid??'';
   select.addEventListener('change',()=>{const chosen=tokens.find(candidate=>candidate.uuid===select.value);selectGroundSheetToken(this.sheet.actor,chosen);if(hasGroundRangeOverlay(this)){if(chosen)setGroundRangeOverlay(this,chosen,true);else clearGroundRangeOverlay(this);}this.refresh();});label.append(select);body.append(label);
  }
  if(!token){
   const hint=tokens.length?'SWFFG.UI.Ground.ChooseTokenHint':'SWFFG.UI.Ground.PlaceTokenHint';
   unavailable(tokens.length?'SWFFG.UI.Ground.TokenRequired':'SWFFG.UI.Ground.NoSceneToken',hint,tokens.length>0);
   body.append(el('p','ffg-movement-note',game.i18n.localize(hint)));clearGroundRangeOverlay(this);return;
  }
  const state=stateFor(token),owned=token.actor.isOwner,tools=el('div','ffg-movement-buttons');
  const other=button(game.i18n.localize("SWFFG.UI.Ground.Use"),()=>this.command('other',{},1));
  other.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Ground.UseManeuver"));other.title=game.i18n.localize("SWFFG.UI.Ground.UseManeuverHint");
  other.disabled=this.busy||!owned||state.used>=2;tools.append(other);
  if(game.user.isGM||state.context.startsWith('manual:')){const reset=button(game.i18n.localize("SWFFG.UI.Ground.ResetShort"),()=>this.command('reset'));reset.title=game.i18n.localize("SWFFG.UI.Ground.ResetManeuvers");reset.setAttribute('aria-label',reset.title);reset.disabled=this.busy||!owned;tools.append(reset);}summary.append(tools);
  if(state.actionUsed)body.append(el('p','ffg-movement-note',game.i18n.localize("SWFFG.UI.Ground.ActionExchanged")));
  const candidates=(canvas.tokens?.placeables??[]).filter(candidate=>isGroundToken(candidate.document)&&candidate.document.uuid!==token.uuid&&(game.user.isGM||candidate.isVisible&&!candidate.document.hidden));
  const targeted=game.user.targets.size===1?[...game.user.targets][0]:null,target=candidates.find(candidate=>candidate.id===targeted?.id)?.document;
  const range=target?rangeFor(token,target):null;
  if(target){
   if(game.user.isGM&&mode==='narrative'){
    const field=el('label','ffg-sheet-movement-field',game.i18n.localize("SWFFG.UI.Ground.SetRange")),choice=el('select');choice.append(new Option(game.i18n.localize("SWFFG.UI.Ground.Choose"),''));bands.forEach((name,index)=>choice.append(new Option(game.i18n.localize(name),String(index))));choice.value=range?String(range.band):'';choice.disabled=this.busy;
    choice.addEventListener('change',()=>{if(choice.value!=='')void this.command('range',{targetUuid:target.uuid,band:Number(choice.value)}).catch(error=>ui.notifications.warn(error.message));});field.append(choice);body.append(field);
   }
   const actions=el('div','ffg-movement-buttons');
   if(mode==='narrative'){
    for(const [direction,name]of [[-1,game.i18n.localize("SWFFG.UI.Ground.MoveCloser")],[1,game.i18n.localize("SWFFG.UI.Ground.MoveAway")]]){const action=button(name,()=>this.command('step',{targetUuid:target.uuid,direction,difficult:!!this.difficult},this.difficult?2:1));action.disabled=this.busy||!owned||!range||state.used>=2;actions.append(action);}
    const check=el('input');check.type='checkbox';check.checked=!!this.difficult;check.addEventListener('change',()=>{this.difficult=check.checked;});const field=el('label','ffg-movement-check');field.append(check,document.createTextNode(game.i18n.localize("SWFFG.UI.Ground.DifficultTerrain")));body.append(field);
   }else{const action=button(range?.band===0?game.i18n.localize("SWFFG.UI.Ground.Disengage"):game.i18n.localize("SWFFG.UI.Ground.Engage"),()=>this.command(range?.band===0?'disengage':'contact',{targetUuid:target.uuid},1));action.disabled=this.busy||!owned||!range||range.band>1||state.used>=2;actions.append(action);}body.append(actions);
  }
  if(mode==='battlemap'){
   const config=calibration(canvas.scene);
   body.append(el('small','ffg-movement-note',game.i18n.format('SWFFG.UI.Ground.DistanceSummary',{distance:dualDistance(state.distance,canvas.scene),movement:dualDistance(config.movement,canvas.scene)})));
   if(hasGroundRangeOverlay(this)){
    const legend=el('div','ffg-sheet-range-legend');['short','medium','long','extreme'].forEach((key,index)=>{const item=el('span','',game.i18n.localize(rangeLabels[index])+' : '+dualDistance(config[key],canvas.scene));item.style.setProperty('--ffg-ring-color','#'+rangeColors[index].toString(16).padStart(6,'0'));legend.append(item);});body.append(legend,el('small','ffg-movement-note',game.i18n.localize("SWFFG.UI.Ground.RangeRingsHint")));
   }
  }

 }
}
export function prepareGroundMovement(sheet,source){
 if(!types.has(sheet.actor?.type)||sheet.actor.pack||sheet.actor.limited)return;
 let view=views.get(sheet);if(!view){view=new GroundSheetView(sheet);views.set(sheet,view);}view.prepare(source);
}
export function refreshGroundSheets(){
 if(frame)return;frame=requestAnimationFrame(()=>{
  frame=null;for(const [sheet,view]of views){if(sheet.rendered)view.refresh();}
  refreshGroundRangeOverlay();
 });
}
for(const hook of ['ffgGroundRangeOverlayChanged','controlToken','targetToken','updateToken','updateCombat','deleteCombat','createToken','deleteToken','canvasReady','updateActor','renderActorSheetFFGV2'])Hooks.on(hook,refreshGroundSheets);
Hooks.on('updateScene',(scene,changes)=>{if(scene.id===canvas.scene?.id&&(changes.flags?.starwarsffg?.groundMovement||changes.grid))refreshGroundSheets();});
Hooks.on('closeActorSheetFFGV2',sheet=>{const view=views.get(sheet);if(view)clearGroundRangeOverlay(view);views.delete(sheet);cancelGroundTarget(sheet);});

Hooks.on('ffgGroundRangesChanged',refreshGroundSheets);
